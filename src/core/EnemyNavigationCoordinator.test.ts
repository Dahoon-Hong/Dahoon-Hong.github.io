import { describe, expect, it, vi } from 'vitest';
import {
  EnemyNavigationCoordinator,
  ENEMY_NAVIGATION_POLICY,
  validateEnemyNavigationPolicy,
} from './EnemyNavigationCoordinator';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';
import { TerrainPathfinder } from './TerrainPathfinder';
import { EnemyDefinition, StandardEnemy, TankerEnemy } from '../entities/Enemy';

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

describe('EnemyNavigationCoordinator', () => {
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

  it('caches an unreachable route without retrying A* at the next interval', () => {
    const terrain = makeGrid(['..H..', '..H..', '..H..', '..H..', '..H..']);
    const pathfinder = new TerrainPathfinder(terrain);
    const spy = vi.spyOn(pathfinder, 'findPath');
    const coordinator = new EnemyNavigationCoordinator(terrain, pathfinder);
    const enemy = new TankerEnemy(18, 90, { ...definition, radius: 18 });

    coordinator.update(0.1, [enemy], { x: 4, y: 2 });
    coordinator.update(0.25, [enemy], { x: 4, y: 2 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(coordinator.getStats().cacheHitsThisFrame).toBe(1);
    expect(enemy.getPath()).toEqual([]);
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

  it('rejects invalid navigation policy values', () => {
    expect(() => validateEnemyNavigationPolicy({
      ...ENEMY_NAVIGATION_POLICY,
      maxPathSearchesPerFrame: 0,
    })).toThrow('maxPathSearchesPerFrame');
    expect(() => validateEnemyNavigationPolicy({
      ...ENEMY_NAVIGATION_POLICY,
      pathValidationInterval: -1,
    })).toThrow('pathValidationInterval');
  });
});
