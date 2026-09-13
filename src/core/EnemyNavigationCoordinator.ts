import navigationData from '../data/enemy-navigation.json';
import type { Enemy } from '../entities/Enemy';
import type { TerrainCell, TerrainGrid } from './TerrainGrid';
import type { TerrainPathfinder } from './TerrainPathfinder';

export interface EnemyNavigationPolicy {
  repathInterval: number;
  pathValidationInterval: number;
  maxPathSearchesPerFrame: number;
  maxPathValidationsPerFrame: number;
  pathCacheSize: number;
}

export interface EnemyNavigationStats {
  pathSearchesThisFrame: number;
  cacheHitsThisFrame: number;
  cacheMissesThisFrame: number;
  deduplicatedRequestsThisFrame: number;
  pathValidationsThisFrame: number;
  pendingRequests: number;
  maxSearchesThisFrame: number;
}

interface NavigationAgentState {
  targetCell: TerrainCell | null;
  nextRepathAt: number;
  nextValidationAt: number;
  dirty: boolean;
}

interface PendingPathRequest {
  key: string;
  start: TerrainCell;
  goal: TerrainCell;
  radius: number;
  priority: boolean;
  requesters: Set<Enemy>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPolicy(message: string): never {
  throw new Error('[EnemyNavigation] ' + message);
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    invalidPolicy(field + ' must be a finite number > 0');
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    invalidPolicy(field + ' must be a finite integer >= 1');
  }
  return value;
}

export function validateEnemyNavigationPolicy(value: unknown): asserts value is EnemyNavigationPolicy {
  if (!isRecord(value)) invalidPolicy('expected an object');
  positiveNumber(value.repathInterval, 'repathInterval');
  positiveNumber(value.pathValidationInterval, 'pathValidationInterval');
  positiveInteger(value.maxPathSearchesPerFrame, 'maxPathSearchesPerFrame');
  positiveInteger(value.maxPathValidationsPerFrame, 'maxPathValidationsPerFrame');
  positiveInteger(value.pathCacheSize, 'pathCacheSize');
}

const loadedNavigationData: unknown = navigationData;
validateEnemyNavigationPolicy(loadedNavigationData);
export const ENEMY_NAVIGATION_POLICY: Readonly<EnemyNavigationPolicy> = loadedNavigationData;

export class EnemyNavigationCoordinator {
  private terrain: TerrainGrid;
  private pathfinder: TerrainPathfinder;
  private readonly policy: Readonly<EnemyNavigationPolicy>;
  private readonly cache = new Map<string, TerrainCell[] | null>();
  private readonly pendingJobs = new Map<string, PendingPathRequest>();
  private readonly pendingOrder: string[] = [];
  private readonly pendingKeyByEnemy = new Map<Enemy, string>();
  private readonly agentStates = new Map<Enemy, NavigationAgentState>();
  private revision = 0;
  private time = 0;
  private stats: EnemyNavigationStats = this.createEmptyStats();
  private maxSearchesObserved = 0;

  public constructor(
    terrain: TerrainGrid,
    pathfinder: TerrainPathfinder,
    policy: Readonly<EnemyNavigationPolicy> = ENEMY_NAVIGATION_POLICY,
  ) {
    validateEnemyNavigationPolicy(policy);
    this.terrain = terrain;
    this.pathfinder = pathfinder;
    this.policy = policy;
    this.reset();
  }

  public setContext(terrain: TerrainGrid, pathfinder: TerrainPathfinder): void {
    this.terrain = terrain;
    this.pathfinder = pathfinder;
    this.reset();
  }

  public reset(): void {
    this.revision++;
    this.time = 0;
    this.cache.clear();
    this.pendingJobs.clear();
    this.pendingOrder.length = 0;
    this.pendingKeyByEnemy.clear();
    this.agentStates.clear();
    this.stats = this.createEmptyStats();
    this.maxSearchesObserved = 0;
  }

  public update(dt: number, enemies: readonly Enemy[], targetCell: TerrainCell | null): void {
    this.time += Math.max(0, dt);
    this.stats = {
      ...this.createEmptyStats(),
      pendingRequests: this.pendingJobs.size,
    };

    const activeEnemies = new Set<Enemy>();
    for (const enemy of enemies) {
      if (!enemy.isDead()) activeEnemies.add(enemy);
    }
    for (const [enemy] of this.agentStates) {
      if (activeEnemies.has(enemy)) continue;
      this.cancelPending(enemy);
      this.agentStates.delete(enemy);
    }

    const desiredTarget = targetCell ? { ...targetCell } : null;
    let validationsThisFrame = 0;

    for (const enemy of enemies) {
      if (enemy.isDead()) continue;

      const state = this.getAgentState(enemy);
      const enemyCell = this.terrain.worldToCell({ x: enemy.x, y: enemy.y });
      const targetChanged = !this.sameCell(state.targetCell, desiredTarget);
      if (targetChanged) {
        state.targetCell = desiredTarget ? { ...desiredTarget } : null;
        state.dirty = desiredTarget !== null;
        this.cancelPending(enemy);
        if (!desiredTarget) enemy.clearNavigationPath();
      }

      if (!enemyCell || !desiredTarget) continue;

      const remainingPath = enemy.getPath();
      let pathValid = true;
      if (remainingPath.length > 0 && this.time >= state.nextValidationAt &&
        validationsThisFrame < this.policy.maxPathValidationsPerFrame) {
        pathValid = this.pathfinder.isPathValid(enemyCell, remainingPath, enemy.radius);
        validationsThisFrame++;
        state.nextValidationAt = this.time + this.policy.pathValidationInterval;
        this.stats.pathValidationsThisFrame++;
        if (!pathValid) state.dirty = true;
      }

      if (this.sameCell(enemyCell, desiredTarget)) {
        this.cancelPending(enemy);
        if (remainingPath.length > 0) enemy.applyNavigationPath([], desiredTarget);
        state.dirty = false;
        state.nextRepathAt = this.time + this.policy.repathInterval;
        state.nextValidationAt = this.time + this.policy.pathValidationInterval;
        continue;
      }

      const needsPath = state.dirty || remainingPath.length === 0 || !pathValid;
      if (!needsPath) continue;

      const priority = !pathValid;
      const due = this.time >= state.nextRepathAt || priority;
      if (!due) continue;

      const key = this.makeKey(enemyCell, desiredTarget, enemy.radius);
      const cached = this.readCache(key);
      if (cached.hit) {
        this.stats.cacheHitsThisFrame++;
        this.applyPath(enemy, state, cached.path, desiredTarget);
      } else {
        this.stats.cacheMissesThisFrame++;
        this.enqueue(enemy, key, enemyCell, desiredTarget, enemy.radius, priority);
      }
    }

    this.processPending();
    this.stats.pendingRequests = this.pendingJobs.size;
    this.maxSearchesObserved = Math.max(this.maxSearchesObserved, this.stats.pathSearchesThisFrame);
  }

  public getStats(): EnemyNavigationStats {
    return {
      ...this.stats,
      pendingRequests: this.pendingJobs.size,
      maxSearchesThisFrame: this.maxSearchesObserved,
    };
  }

  private getAgentState(enemy: Enemy): NavigationAgentState {
    const existing = this.agentStates.get(enemy);
    if (existing) return existing;

    const state: NavigationAgentState = {
      targetCell: null,
      nextRepathAt: 0,
      nextValidationAt: 0,
      dirty: true,
    };
    this.agentStates.set(enemy, state);
    return state;
  }

  private enqueue(
    enemy: Enemy,
    key: string,
    start: TerrainCell,
    goal: TerrainCell,
    radius: number,
    priority: boolean,
  ): void {
    const previousKey = this.pendingKeyByEnemy.get(enemy);
    if (previousKey === key) return;

    if (previousKey) {
      const previousJob = this.pendingJobs.get(previousKey);
      previousJob?.requesters.delete(enemy);
      if (previousJob && previousJob.requesters.size === 0) this.pendingJobs.delete(previousKey);
    }

    let job = this.pendingJobs.get(key);
    if (!job) {
      job = { key, start: { ...start }, goal: { ...goal }, radius, priority, requesters: new Set() };
      this.pendingJobs.set(key, job);
      this.pendingOrder.push(key);
    } else {
      if (!job.requesters.has(enemy)) this.stats.deduplicatedRequestsThisFrame++;
      job.priority ||= priority;
    }

    job.requesters.add(enemy);
    this.pendingKeyByEnemy.set(enemy, key);
  }

  private processPending(): void {
    let searches = 0;
    while (searches < this.policy.maxPathSearchesPerFrame) {
      const job = this.takeNextJob();
      if (!job) break;

      for (const enemy of job.requesters) {
        if (this.pendingKeyByEnemy.get(enemy) !== job.key) continue;
        this.pendingKeyByEnemy.delete(enemy);
      }

      // ponytail: synchronous A* stays behind a fixed per-frame budget; use an incremental search only if profiling proves one search still exceeds the frame budget.
      const path = this.pathfinder.findPath(job.start, job.goal, { radius: job.radius });
      this.writeCache(job.key, path);
      searches++;
      this.stats.pathSearchesThisFrame++;

      for (const enemy of job.requesters) {
        const state = this.agentStates.get(enemy);
        if (!state || enemy.isDead() || !state.targetCell || !this.sameCell(state.targetCell, job.goal)) continue;
        state.dirty = false;
        state.nextRepathAt = this.time + this.policy.repathInterval;
        state.nextValidationAt = this.time + this.policy.pathValidationInterval;
        enemy.applyNavigationPath(path ?? [], job.goal);
      }
    }
  }

  private takeNextJob(): PendingPathRequest | null {
    while (this.pendingOrder.length > 0) {
      const priorityIndex = this.pendingOrder.findIndex((key) => this.pendingJobs.get(key)?.priority === true);
      const index = priorityIndex >= 0 ? priorityIndex : 0;
      const key = this.pendingOrder.splice(index, 1)[0];
      const job = this.pendingJobs.get(key);
      if (!job) continue;
      this.pendingJobs.delete(key);
      return job;
    }
    return null;
  }

  private applyPath(
    enemy: Enemy,
    state: NavigationAgentState,
    path: TerrainCell[] | null,
    targetCell: TerrainCell,
  ): void {
    this.cancelPending(enemy);
    state.dirty = false;
    state.nextRepathAt = this.time + this.policy.repathInterval;
    state.nextValidationAt = this.time + this.policy.pathValidationInterval;
    enemy.applyNavigationPath(path ?? [], targetCell);
  }

  private cancelPending(enemy: Enemy): void {
    const key = this.pendingKeyByEnemy.get(enemy);
    if (!key) return;

    const job = this.pendingJobs.get(key);
    job?.requesters.delete(enemy);
    if (job && job.requesters.size === 0) this.pendingJobs.delete(key);
    this.pendingKeyByEnemy.delete(enemy);
  }

  private readCache(key: string): { hit: boolean; path: TerrainCell[] | null } {
    if (!this.cache.has(key)) return { hit: false, path: null };

    const path = this.cache.get(key) ?? null;
    this.cache.delete(key);
    this.cache.set(key, path);
    return {
      hit: true,
      path: path?.map((cell) => ({ ...cell })) ?? null,
    };
  }

  private writeCache(key: string, path: TerrainCell[] | null): void {
    this.cache.delete(key);
    this.cache.set(key, path?.map((cell) => ({ ...cell })) ?? null);
    while (this.cache.size > this.policy.pathCacheSize) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private makeKey(start: TerrainCell, goal: TerrainCell, radius: number): string {
    return this.revision + ':' + start.x + ',' + start.y + ':' + goal.x + ',' + goal.y + ':' + radius;
  }

  private sameCell(a: TerrainCell | null, b: TerrainCell | null): boolean {
    return a?.x === b?.x && a?.y === b?.y;
  }

  private createEmptyStats(): EnemyNavigationStats {
    return {
      pathSearchesThisFrame: 0,
      cacheHitsThisFrame: 0,
      cacheMissesThisFrame: 0,
      deduplicatedRequestsThisFrame: 0,
      pathValidationsThisFrame: 0,
      pendingRequests: 0,
      maxSearchesThisFrame: 0,
    };
  }
}
