import { describe, expect, it, vi } from 'vitest';
import {
  EnemyNavigationCoordinator,
  ENEMY_NAVIGATION_POLICY,
  validateEnemyNavigationPolicy,
} from './EnemyNavigationCoordinator';
import type { EnemyNavigationTarget } from './EnemyNavigationCoordinator';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';
import { TerrainPathfinder } from './TerrainPathfinder';
import { EnemyDefinition, StandardEnemy, TankerEnemy } from '../entities/Enemy';
import type {
  EnemyNavigationWorkerMessage,
  EnemyNavigationWorkerResponse,
} from './EnemyNavigationWorkerProtocol';

const definition: EnemyDefinition = {
  spawnWeight: 1,
  spawnInterval: 0.6,
  spawnBatchSize: 5,
  hp: 45,
  speed: 95,
  radius: 12,
  reward: 10,
  typeName: 'Standard',
  contactDamage: 10,
  contactDamageInterval: 0.2,
};

const makeGrid = (rows: string[]): TerrainGrid => {
  const map: TerrainMapData = {
    world: { cellSize: 36, columns: rows[0].length, rows: rows.length },
    terrain: { legend: { '.': 'open', H: 'hill' }, rows },
    terrainTypes: {
      open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
      hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
    },
  };
  return new TerrainGrid(map);
};

const policy = (overrides: Partial<typeof ENEMY_NAVIGATION_POLICY> = {}) => ({
  ...ENEMY_NAVIGATION_POLICY,
  ...overrides,
});

class TestWorker {
  public onmessage: ((event: MessageEvent<EnemyNavigationWorkerResponse>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public readonly messages: EnemyNavigationWorkerMessage[] = [];

  public postMessage(message: EnemyNavigationWorkerMessage): void {
    this.messages.push(message);
    if (message.type !== 'init') return;
    queueMicrotask(() => this.onmessage?.({
      data: { type: 'ready', terrainRevision: message.terrainRevision },
    } as MessageEvent<EnemyNavigationWorkerResponse>));
  }

  public terminate(): void {}

  public async waitForReady(): Promise<void> {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }

  public emit(response: EnemyNavigationWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<EnemyNavigationWorkerResponse>);
  }

  public emitError(error: Error): void {
    this.onerror?.({ error, message: error.message } as ErrorEvent);
  }
}

const makeNavigationTarget = (
  point = { x: 126, y: 126 },
  bounds = { left: 90, top: 90, right: 162, bottom: 162 },
): EnemyNavigationTarget => ({
  point,
  cell: { x: 3, y: 3 },
  engagementBounds: bounds,
  visibilityBounds: { left: 0, top: 0, right: 252, bottom: 252 },
});

describe('EnemyNavigationCoordinator', () => {
  it('starts local follow on the first update for a visible direct enemy regardless of distance', () => {
    const terrain = makeGrid(Array.from({ length: 8 }, () => '.'.repeat(8)));
    const pathfinder = new TerrainPathfinder(terrain);
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new StandardEnemy(126, 220, definition);

    coordinator.update(0.1, [enemy], makeNavigationTarget());

    expect(coordinator.getDirective(enemy)?.mode).toBe('local');
    expect(coordinator.getStats().visibleAgents).toBe(1);
    expect(coordinator.getStats().visibleImmediateFollowTransitions).toBe(1);
    expect(coordinator.getAgentSnapshots([enemy])[0]).toMatchObject({
      visible: true,
      immediateFollowTransition: true,
      visibleFollowLatency: 0,
      directApproachClear: true,
    });
  });

  it('prioritizes a visible blocked approach and reports pending path instead of a silent stop', async () => {
    const terrain = makeGrid(Array.from({ length: 8 }, () => '.'.repeat(8)));
    const pathfinder = new TerrainPathfinder(terrain);
    const worker = new TestWorker();
    const directSpy = vi.spyOn(terrain, 'isOpenForRadiusSegment').mockReturnValue(false);
    const coordinator = new EnemyNavigationCoordinator(
      terrain,
      pathfinder,
      policy({ maxWorkerJobsPerBatch: 1 }),
      { workerFactory: () => worker as unknown as Worker },
    );
    await worker.waitForReady();
    const enemy = new StandardEnemy(126, 220, definition);

    coordinator.update(0.1, [enemy], makeNavigationTarget());
    const directive = coordinator.getDirective(enemy);

    expect(directive?.mode).toBe('repath');
    expect(coordinator.getStats()).toMatchObject({
      visibleAgents: 1,
      visibleBlockedAgents: 1,
      pendingNavigationAgents: 1,
    });
    expect(coordinator.getAgentSnapshots([enemy])[0]).toMatchObject({
      visible: true,
      pending: true,
      directApproachClear: false,
    });

    enemy.update(0.1, { x: 126, y: 126 }, {
      terrain,
      directive: directive ?? undefined,
      nearbyEnemies: coordinator.getNearbyEnemies(enemy),
    });
    expect(enemy.getNavigationTelemetry().stoppedReason).toBe('blocked');
    directSpy.mockRestore();
  });

  it('uses an approach slot and local steering near the vehicle without searching', () => {
    const terrain = makeGrid(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new StandardEnemy(126, 50, definition);

    coordinator.update(0.1, [enemy], makeNavigationTarget());
    const directive = coordinator.getDirective(enemy);
    const previousY = enemy.y;
    enemy.update(0.1, { x: 126, y: 126 }, {
      terrain,
      directive: directive ?? undefined,
      nearbyEnemies: [enemy],
    });

    expect(spy).not.toHaveBeenCalled();
    expect(directive?.mode).toBe('local');
    expect(directive?.targetCell).not.toEqual({ x: 3, y: 3 });
    expect(directive?.targetPoint?.y).toBeLessThan(126);
    expect(enemy.y).toBeGreaterThan(previousY);
    expect(coordinator.getStats().localSteeringAgents).toBe(1);
    expect(coordinator.getStats().pathSearchesThisFrame).toBe(0);
    const snapshot = coordinator.getAgentSnapshots([enemy])[0];
    expect(snapshot).toMatchObject({
      mode: 'local',
      directApproachClear: true,
      terrainSafe: true,
      pathSearchesThisFrame: 0,
    });
    expect(snapshot.movementDistance).toBeGreaterThan(0);
    expect(snapshot.steeringDirection).not.toBeNull();
  });

  it('tracks a moving target point inside the same cell without restarting A*', () => {
    const terrain = makeGrid(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new StandardEnemy(126, 50, definition);

    coordinator.update(0.1, [enemy], makeNavigationTarget());
    const firstPoint = coordinator.getDirective(enemy)?.targetPoint;
    coordinator.update(0.1, [enemy], makeNavigationTarget(
      { x: 132, y: 126 },
      { left: 96, top: 90, right: 168, bottom: 162 },
    ));
    const secondDirective = coordinator.getDirective(enemy);

    expect(spy).not.toHaveBeenCalled();
    expect(secondDirective?.mode).toBe('local');
    expect(secondDirective?.targetPoint).not.toEqual(firstPoint);
    expect(secondDirective?.targetCell).not.toEqual({ x: 3, y: 3 });
  });

  it('keeps a local stall event visible while rotating the approach slot', () => {
    const terrain = makeGrid(['.......', '.......', '.......', '.......', '.......', '.......', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new StandardEnemy(108, 30, { ...definition, speed: 0 });
    let snapshot = coordinator.getAgentSnapshots([])[0];

    for (let index = 0; index < 4; index++) {
      coordinator.update(0.1, [enemy], makeNavigationTarget());
      snapshot = coordinator.getAgentSnapshots([enemy])[0];
      enemy.update(0.1, { x: 126, y: 126 }, {
        terrain,
        directive: coordinator.getDirective(enemy) ?? undefined,
        nearbyEnemies: [enemy],
      });
    }

    expect(snapshot.stuckEvent).toBe(true);
    expect(snapshot.stuckReported).toBe(true);
    expect(snapshot.slotIndex).toBeGreaterThan(0);
    expect(coordinator.getStats().stuckAgents).toBe(1);
  });

  it('recovers a stalled local agent after its movement resumes', () => {
    const terrain = makeGrid(Array.from({ length: 20 }, () => '.'.repeat(20)));
    const pathfinder = new TerrainPathfinder(terrain);
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new StandardEnemy(387.6, 296.4, { ...definition, speed: 0 });
    const target = makeNavigationTarget({ x: 342, y: 342 }, { left: 306, top: 306, right: 378, bottom: 378 });
    let sawStuck = false;
    let sawRecovery = false;

    for (let index = 0; index < 10; index++) {
      if (index === 5) enemy.speed = definition.speed;
      coordinator.update(0.1, [enemy], target);
      const snapshot = coordinator.getAgentSnapshots([enemy])[0];
      sawStuck ||= snapshot.stuckEvent;
      sawRecovery ||= snapshot.movementDistance > 0;
      enemy.update(0.1, target.point, {
        terrain,
        directive: coordinator.getDirective(enemy) ?? undefined,
        nearbyEnemies: [enemy],
      });
    }

    expect(sawStuck).toBe(true);
    expect(sawRecovery).toBe(true);
    expect(coordinator.getAgentSnapshots([enemy])[0].recoveredAfterStuck).toBe(true);
  });

  it('deduplicates equal requests and applies one route to every requester', () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder, policy({ maxPathSearchesPerFrame: 1 }));
    const enemies = [
      new StandardEnemy(18, 54, definition),
      new StandardEnemy(18, 54, definition),
    ];

    coordinator.update(0.1, enemies, { x: 6, y: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(enemies[0].getPath().length).toBeGreaterThan(0);
    expect(enemies[1].getPath()).toEqual(enemies[0].getPath());
    expect(coordinator.getStats().deduplicatedRequestsThisFrame).toBe(1);
  });

  it('reuses a cached route without searching again', () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const first = new StandardEnemy(18, 54, definition);
    const second = new StandardEnemy(18, 54, definition);

    coordinator.update(0.1, [first], { x: 6, y: 1 });
    coordinator.update(0.1, [first, second], { x: 6, y: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(coordinator.getStats().cacheHitsThisFrame).toBe(1);
    expect(second.getPath()).toEqual(first.getPath());
  });

  it('does not search again on every update while the target and route stay valid', () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new StandardEnemy(18, 54, definition);

    for (let index = 0; index < 5; index++) {
      coordinator.update(0.1, [enemy], { x: 6, y: 1 });
    }

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries an unreachable route after the negative-cache TTL', () => {
    const terrain = makeGrid(['..H..', '..H..', '..H..', '..H..', '..H..']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new TankerEnemy(18, 90, { ...definition, radius: 18 });

    coordinator.update(0.1, [enemy], { x: 4, y: 2 });
    coordinator.update(0.2, [enemy], { x: 4, y: 2 });
    expect(spy).toHaveBeenCalledTimes(1);

    coordinator.update(0.1, [enemy], { x: 4, y: 2 });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(enemy.getPath()).toEqual([]);
  });

  it('rotates to the next engagement slot after an unreachable route result', () => {
    const terrain = makeGrid(Array.from({ length: 8 }, () => '.'.repeat(8)));
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath')
      .mockReturnValueOnce(null)
      .mockReturnValue([{ x: 4, y: 2 }]);
    const directSpy = vi.spyOn(terrain, 'isOpenForRadiusSegment').mockReturnValue(false);
    const coordinator = new EnemyNavigationCoordinator(
      terrain,
      pathfinder,
      policy({ workerEnabled: false }),
    );
    const enemy = new StandardEnemy(126, 220, definition);

    coordinator.update(0.1, [enemy], makeNavigationTarget());
    expect(coordinator.getAgentSnapshots([enemy])[0]).toMatchObject({
      slotIndex: 1,
      mode: 'repath',
    });

    coordinator.update(0.1, [enemy], makeNavigationTarget());

    expect(spy).toHaveBeenCalledTimes(2);
    expect(enemy.getPath()).toEqual([{ x: 4, y: 2 }]);
    expect(coordinator.getAgentSnapshots([enemy])[0]?.slotIndex).toBe(1);
    directSpy.mockRestore();
  });

  it('keeps searches within the per-frame budget while draining distinct jobs', () => {
    const terrain = makeGrid(['.......', '.......', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder, policy({ maxPathSearchesPerFrame: 1 }));
    const enemies = [
      new StandardEnemy(18, 18, definition),
      new StandardEnemy(18, 54, definition),
      new StandardEnemy(18, 90, definition),
    ];

    coordinator.update(0.1, enemies, { x: 234, y: 54 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(coordinator.getStats().pendingRequests).toBe(2);
    expect(coordinator.getStats().pathSearchesThisFrame).toBe(1);

    coordinator.update(0.1, enemies, { x: 234, y: 54 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(coordinator.getStats().pathSearchesThisFrame).toBe(1);

    coordinator.update(0.1, enemies, { x: 234, y: 54 });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(coordinator.getStats().pendingRequests).toBe(0);
  });

  it('drops stale pending targets and searches only for the latest target', () => {
    const terrain = makeGrid(['.......', '.......', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder, policy({ maxPathSearchesPerFrame: 1 }));
    const enemies = [
      new StandardEnemy(18, 18, definition),
      new StandardEnemy(18, 54, definition),
    ];
    const firstTarget = { x: 6, y: 1 };
    const latestTarget = { x: 6, y: 0 };

    coordinator.update(0.1, enemies, firstTarget);
    coordinator.update(0.1, enemies, latestTarget);
    coordinator.update(0.1, enemies, latestTarget);
    coordinator.update(0.1, enemies, latestTarget);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls.map((call) => call[1])).toEqual([firstTarget, latestTarget, latestTarget]);
  });

  it('prioritizes a route after scheduled validation finds a blocked waypoint', () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new StandardEnemy(18, 54, definition);
    enemy.applyNavigationPath([{ x: 2, y: 1 }], { x: 6, y: 1 });

    coordinator.update(0.1, [enemy], { x: 6, y: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(enemy.getPath()).not.toEqual([{ x: 2, y: 1 }]);
  });

  it('does not share routes between different radius profiles', () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder, policy({ maxPathSearchesPerFrame: 2 }));
    const standard = new StandardEnemy(18, 54, definition);
    const tanker = new TankerEnemy(18, 54, { ...definition, radius: 18, typeName: 'Tanker' });

    coordinator.update(0.1, [standard, tanker], { x: 6, y: 1 });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('clears cached routes when the terrain context is reset', () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const first = new StandardEnemy(18, 54, definition);
    const second = new StandardEnemy(18, 54, definition);

    coordinator.update(0.1, [first], { x: 6, y: 1 });
    coordinator.setContext(terrain, pathfinder);
    coordinator.update(0.1, [second], { x: 6, y: 1 });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used route when the cache reaches its limit', () => {
    const terrain = makeGrid(['.......', '.......', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder, policy({
      maxPathSearchesPerFrame: 1,
      pathCacheSize: 1,
    }));
    const first = new StandardEnemy(18, 54, definition);
    const second = new StandardEnemy(18, 54, definition);
    const third = new StandardEnemy(18, 54, definition);

    coordinator.update(0.1, [first], { x: 6, y: 0 });
    coordinator.update(0.1, [second], { x: 6, y: 2 });
    coordinator.update(0.1, [third], { x: 6, y: 0 });

    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('dispatches one worker job for equal requests and applies its batch result', async () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const worker = new TestWorker();
    const coordinator = new EnemyNavigationCoordinator(
      terrain,
      pathfinder,
      policy({ maxWorkerJobsPerBatch: 4, maxWorkerInFlightJobs: 4 }),
      { workerFactory: () => worker as unknown as Worker },
    );
    await worker.waitForReady();
    const enemies = [
      new StandardEnemy(18, 54, definition),
      new StandardEnemy(18, 54, definition),
    ];

    coordinator.update(0.1, enemies, { x: 6, y: 1 });

    const search = worker.messages.find((message) => message.type === 'search');
    expect(search?.type).toBe('search');
    if (!search || search.type !== 'search') throw new Error('worker search was not dispatched');
    expect(search.jobs).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(search)).not.toContain('navigationId');

    worker.emit({
      type: 'result',
      results: search.jobs.map((job) => ({
        requestId: job.requestId,
        key: job.key,
        targetRevision: job.targetRevision,
        terrainRevision: job.terrainRevision,
        path: [{ x: 1, y: 1 }],
      })),
    });

    expect(enemies[0].getPath()).toEqual([{ x: 1, y: 1 }]);
    expect(enemies[1].getPath()).toEqual(enemies[0].getPath());
    expect(coordinator.getStats()).toMatchObject({
      workerEnabled: true,
      workerResultsThisFrame: 1,
      workerJobsInFlight: 0,
    });
  });

  it('discards a worker result after the target revision changes', async () => {
    const terrain = makeGrid(['.......', '.......', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const worker = new TestWorker();
    const coordinator = new EnemyNavigationCoordinator(
      terrain,
      pathfinder,
      policy({ maxWorkerJobsPerBatch: 1 }),
      { workerFactory: () => worker as unknown as Worker },
    );
    await worker.waitForReady();
    const enemy = new StandardEnemy(18, 54, definition);

    coordinator.update(0.1, [enemy], { x: 6, y: 1 });
    const search = worker.messages.find((message) => message.type === 'search');
    if (!search || search.type !== 'search') throw new Error('worker search was not dispatched');
    coordinator.update(0.1, [enemy], { x: 6, y: 0 });
    worker.emit({
      type: 'result',
      results: search.jobs.map((job) => ({
        requestId: job.requestId,
        key: job.key,
        targetRevision: job.targetRevision,
        terrainRevision: job.terrainRevision,
        path: [{ x: 1, y: 1 }],
      })),
    });

    expect(enemy.getPath()).toEqual([]);
    expect(coordinator.getStats().workerStaleResultsThisFrame).toBeGreaterThan(0);
  });

  it('falls back to the synchronous budget after a worker error', async () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const worker = new TestWorker();
    const coordinator = new EnemyNavigationCoordinator(
      terrain,
      pathfinder,
      policy({ maxWorkerJobsPerBatch: 1 }),
      { workerFactory: () => worker as unknown as Worker },
    );
    await worker.waitForReady();
    const enemy = new StandardEnemy(18, 54, definition);

    coordinator.update(0.1, [enemy], { x: 6, y: 1 });
    worker.emitError(new Error('test worker failure'));
    coordinator.update(0.1, [enemy], { x: 6, y: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(coordinator.getStats()).toMatchObject({
      workerEnabled: false,
      workerFallbackCount: 1,
    });
  });

  it('rejects invalid navigation policy values', () => {
    expect(() => validateEnemyNavigationPolicy({
      ...ENEMY_NAVIGATION_POLICY,
      maxPathSearchesPerFrame: 0,
    })).toThrow('maxPathSearchesPerFrame');
    expect(() => validateEnemyNavigationPolicy({
      ...ENEMY_NAVIGATION_POLICY,
      pathValidationInterval: -1,
    })).toThrow('pathValidationInterval');
    expect(() => validateEnemyNavigationPolicy({
      ...ENEMY_NAVIGATION_POLICY,
      localSteeringExitDistance: ENEMY_NAVIGATION_POLICY.localSteeringEnterDistance - 1,
    })).toThrow('localSteeringExitDistance');
  });
});
