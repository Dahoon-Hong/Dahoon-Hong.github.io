import navigationData from '../data/enemy-navigation.json';
import type {
  Enemy,
  EnemyNavigationDirective,
  EnemyNavigationMode,
} from '../entities/Enemy';
import type {
  TerrainAabb,
  TerrainCell,
  TerrainGrid,
  TerrainPoint,
} from './TerrainGrid';
import type { TerrainPathfinder } from './TerrainPathfinder';
import { EnemySpatialIndex } from './EnemySpatialIndex';
import type {
  EnemyNavigationWorkerPathJob,
  EnemyNavigationWorkerResponse,
} from './EnemyNavigationWorkerProtocol';

export interface EnemyNavigationPolicy {
  repathInterval: number;
  pathValidationInterval: number;
  maxPathSearchesPerFrame: number;
  maxPathValidationsPerFrame: number;
  pathCacheSize: number;
  localSteeringEnterDistance: number;
  localSteeringExitDistance: number;
  localSteeringProbeDistance: number;
  localSteeringStuckDuration: number;
  localSteeringGracePeriod: number;
  separationWeight: number;
  maxNearbyEnemies: number;
  collisionPushSpeed: number;
  collisionLookaheadDistance: number;
  spawnAdmissionProbeDistance: number;
  spatialCellSize: number;
  workerEnabled: boolean;
  workerDispatchInterval: number;
  maxWorkerJobsPerBatch: number;
  maxWorkerInFlightJobs: number;
  maxWorkerQueueDepth: number;
  maxNavigationMainThreadMs: number;
}

export interface EnemyNavigationTarget {
  point: TerrainPoint;
  cell: TerrainCell | null;
  engagementBounds: TerrainAabb;
  visibilityBounds: TerrainAabb;
}

export interface EnemyNavigationStats {
  pathSearchesThisFrame: number;
  cacheHitsThisFrame: number;
  cacheMissesThisFrame: number;
  deduplicatedRequestsThisFrame: number;
  pathValidationsThisFrame: number;
  pendingRequests: number;
  maxSearchesThisFrame: number;
  localSteeringAgents: number;
  engagedAgents: number;
  stuckAgents: number;
  pendingNavigationAgents: number;
  oldestPendingRequestAge: number;
  localSteeringTransitionsThisFrame: number;
  visibleAgents: number;
  visibleImmediateFollowTransitions: number;
  visibleBlockedAgents: number;
  navigationMainMs: number;
  navigationMainMsMax: number;
  workerEnabled: boolean;
  workerDispatchesThisFrame: number;
  workerJobsInFlight: number;
  workerQueueDepth: number;
  workerResultsThisFrame: number;
  workerStaleResultsThisFrame: number;
  workerFallbackCount: number;
  oldestWorkerRequestAge: number;
  neighborCandidatesTotal: number;
  neighborCandidatesMax: number;
  stoppedAgentsByReason: Readonly<Record<string, number>>;
}

export interface EnemyNavigationAgentSnapshot {
  id: number;
  type: Enemy['enemyType'];
  speed: number;
  position: TerrainPoint;
  mode: EnemyNavigationMode;
  targetCell: TerrainCell | null;
  targetPoint: TerrainPoint | null;
  goalCell: TerrainCell | null;
  slotPoint: TerrainPoint | null;
  distanceToTarget: number | null;
  distanceToSlot: number | null;
  slotIndex: number;
  pathLength: number;
  waypointIndex: number;
  pending: boolean;
  pathSearchesThisFrame: number;
  blockedTime: number;
  stuck: boolean;
  stuckReported: boolean;
  stuckEvent: boolean;
  recoveredAfterStuck: boolean;
  forceRepath: boolean;
  directApproachClear: boolean | null;
  terrainSafe: boolean;
  movementDistance: number;
  safeProgress: number;
  blockedProbeCount: number;
  steeringDirection: TerrainPoint | null;
  stopped: boolean;
  stoppedReason: 'arrival' | 'blocked' | 'pending-path' | null;
  visible: boolean;
  visibleSince: number | null;
  immediateFollowTransition: boolean;
  visibleFollowLatency: number | null;
}

interface NavigationAgentState {
  targetCell: TerrainCell | null;
  targetPoint: TerrainPoint | null;
  goalCell: TerrainCell | null;
  slotPoint: TerrainPoint | null;
  slotIndex: number;
  nextRepathAt: number;
  nextValidationAt: number;
  targetChangedAt: number;
  blockedTime: number;
  lastPosition: TerrainPoint | null;
  stuckReported: boolean;
  stuckEventUntil: number;
  stuckRecoveryPending: boolean;
  stuckRecoveryObserved: boolean;
  forceRepath: boolean;
  dirty: boolean;
  mode: EnemyNavigationMode;
  directApproachClear: boolean | null;
  targetRevision: number;
  visible: boolean;
  visibleSince: number | null;
  visibleEnteredThisUpdate: boolean;
  immediateFollowTransition: boolean;
  visibleFollowLatency: number | null;
  nearbyEnemies: Enemy[];
}

interface PendingPathRequest {
  key: string;
  start: TerrainCell;
  goal: TerrainCell;
  targetCell: TerrainCell;
  radius: number;
  priority: boolean;
  enqueuedAt: number;
  requesters: Set<Enemy>;
  targetRevision: number;
}

interface InFlightPathRequest extends PendingPathRequest {
  requestId: string;
  dispatchedAt: number;
}

export interface EnemyNavigationCoordinatorOptions {
  workerEnabled?: boolean;
  workerFactory?: () => Worker;
}

interface NormalizedNavigationTarget {
  point: TerrainPoint | null;
  cell: TerrainCell | null;
  engagementBounds: TerrainAabb | null;
  visibilityBounds: TerrainAabb | null;
  localEnabled: boolean;
}

interface EngagementSlot {
  point: TerrainPoint;
  cell: TerrainCell;
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

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    invalidPolicy(field + ' must be a finite number >= 0');
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    invalidPolicy(field + ' must be a finite integer >= 1');
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalidPolicy(field + ' must be a boolean');
  return value;
}

export function validateEnemyNavigationPolicy(value: unknown): asserts value is EnemyNavigationPolicy {
  if (!isRecord(value)) invalidPolicy('expected an object');
  positiveNumber(value.repathInterval, 'repathInterval');
  positiveNumber(value.pathValidationInterval, 'pathValidationInterval');
  positiveInteger(value.maxPathSearchesPerFrame, 'maxPathSearchesPerFrame');
  positiveInteger(value.maxPathValidationsPerFrame, 'maxPathValidationsPerFrame');
  positiveInteger(value.pathCacheSize, 'pathCacheSize');
  const localSteeringEnterDistance = positiveNumber(value.localSteeringEnterDistance, 'localSteeringEnterDistance');
  const localSteeringExitDistance = positiveNumber(value.localSteeringExitDistance, 'localSteeringExitDistance');
  positiveNumber(value.localSteeringProbeDistance, 'localSteeringProbeDistance');
  positiveNumber(value.localSteeringStuckDuration, 'localSteeringStuckDuration');
  positiveNumber(value.localSteeringGracePeriod, 'localSteeringGracePeriod');
  nonNegativeNumber(value.separationWeight, 'separationWeight');
  positiveInteger(value.maxNearbyEnemies, 'maxNearbyEnemies');
  positiveNumber(value.collisionPushSpeed, 'collisionPushSpeed');
  nonNegativeNumber(value.collisionLookaheadDistance, 'collisionLookaheadDistance');
  positiveNumber(value.spawnAdmissionProbeDistance, 'spawnAdmissionProbeDistance');
  positiveNumber(value.spatialCellSize, 'spatialCellSize');
  boolean(value.workerEnabled, 'workerEnabled');
  nonNegativeNumber(value.workerDispatchInterval, 'workerDispatchInterval');
  positiveInteger(value.maxWorkerJobsPerBatch, 'maxWorkerJobsPerBatch');
  positiveInteger(value.maxWorkerInFlightJobs, 'maxWorkerInFlightJobs');
  positiveInteger(value.maxWorkerQueueDepth, 'maxWorkerQueueDepth');
  positiveNumber(value.maxNavigationMainThreadMs, 'maxNavigationMainThreadMs');
  if (localSteeringExitDistance < localSteeringEnterDistance) {
    invalidPolicy('localSteeringExitDistance must be >= localSteeringEnterDistance');
  }
}

const loadedNavigationData: unknown = navigationData;
validateEnemyNavigationPolicy(loadedNavigationData);
export const ENEMY_NAVIGATION_POLICY: Readonly<EnemyNavigationPolicy> = loadedNavigationData;

export class EnemyNavigationCoordinator {
  private terrain: TerrainGrid;
  private pathfinder: TerrainPathfinder;
  private readonly policy: Readonly<EnemyNavigationPolicy>;
  private readonly workerFactory: (() => Worker) | null;
  private readonly customWorkerFactory: boolean;
  private readonly workerRequested: boolean;
  private readonly spatialIndex: EnemySpatialIndex;
  private readonly cache = new Map<string, TerrainCell[] | null>();
  private readonly negativeCacheExpiry = new Map<string, number>();
  private readonly pendingJobs = new Map<string, PendingPathRequest>();
  private readonly pendingOrder: string[] = [];
  private readonly requestKeyByEnemy = new Map<Enemy, string>();
  private readonly requestIdByEnemy = new Map<Enemy, string>();
  private readonly inFlightJobs = new Map<string, InFlightPathRequest>();
  private readonly inFlightKeyByKey = new Map<string, InFlightPathRequest>();
  private readonly agentStates = new Map<Enemy, NavigationAgentState>();
  private readonly pathSearchAgentsThisFrame = new Set<Enemy>();
  private revision = 0;
  private targetRevision = 0;
  private targetCell: TerrainCell | null = null;
  private time = 0;
  private nextSlotIndex = 0;
  private nextWorkerRequestId = 1;
  private nextWorkerDispatchAt = 0;
  private worker: Worker | null = null;
  private workerReady = false;
  private workerActive = false;
  private workerFallbackCount = 0;
  private stats: EnemyNavigationStats = this.createEmptyStats();
  private maxSearchesObserved = 0;
  private maxNavigationMainMsObserved = 0;

  public constructor(
    terrain: TerrainGrid,
    pathfinder: TerrainPathfinder,
    policy: Readonly<EnemyNavigationPolicy> = ENEMY_NAVIGATION_POLICY,
    options: EnemyNavigationCoordinatorOptions = {},
  ) {
    validateEnemyNavigationPolicy(policy);
    this.terrain = terrain;
    this.pathfinder = pathfinder;
    this.policy = policy;
    this.workerFactory = options.workerFactory ?? (() => new Worker(
      new URL('../workers/EnemyNavigationWorker.ts', import.meta.url),
      { type: 'module' },
    ));
    this.customWorkerFactory = options.workerFactory !== undefined;
    this.workerRequested = options.workerEnabled ?? policy.workerEnabled;
    this.spatialIndex = new EnemySpatialIndex(policy.spatialCellSize);
    this.reset();
  }

  public setContext(terrain: TerrainGrid, pathfinder: TerrainPathfinder): void {
    this.terrain = terrain;
    this.pathfinder = pathfinder;
    this.reset();
  }

  public reset(): void {
    this.disposeWorker();
    this.revision++;
    this.targetRevision = 0;
    this.targetCell = null;
    this.time = 0;
    this.nextSlotIndex = 0;
    this.nextWorkerRequestId = 1;
    this.nextWorkerDispatchAt = 0;
    this.cache.clear();
    this.negativeCacheExpiry.clear();
    this.pendingJobs.clear();
    this.pendingOrder.length = 0;
    this.requestKeyByEnemy.clear();
    this.requestIdByEnemy.clear();
    this.inFlightJobs.clear();
    this.inFlightKeyByKey.clear();
    this.agentStates.clear();
    this.pathSearchAgentsThisFrame.clear();
    this.spatialIndex.reset();
    this.workerFallbackCount = 0;
    this.stats = this.createEmptyStats();
    this.maxSearchesObserved = 0;
    this.maxNavigationMainMsObserved = 0;
    this.startWorker();
  }

  public update(
    dt: number,
    enemies: readonly Enemy[],
    target: EnemyNavigationTarget | TerrainCell | null,
  ): void {
    const startedAt = this.now();
    this.time += Math.max(0, dt);
    this.pathSearchAgentsThisFrame.clear();
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

    const desiredTarget = this.normalizeTarget(target);
    if (!this.sameCell(this.targetCell, desiredTarget.cell)) {
      this.targetRevision++;
      this.targetCell = this.cloneCell(desiredTarget.cell);
    }
    this.spatialIndex.build(enemies);
    let validationsThisFrame = 0;

    for (const enemy of enemies) {
      if (enemy.isDead()) continue;

      const state = this.getAgentState(enemy);
      this.observeProgress(enemy, state, dt);
      state.immediateFollowTransition = false;
      state.visibleEnteredThisUpdate = false;
      const visible = desiredTarget.visibilityBounds
        ? this.isVisible(enemy, desiredTarget.visibilityBounds)
        : false;
      if (visible && !state.visible) {
        state.visibleSince = this.time;
        state.visibleEnteredThisUpdate = true;
        state.visibleFollowLatency = null;
      } else if (!visible) {
        state.visibleSince = null;
        state.visibleFollowLatency = null;
      }
      state.visible = visible;
      state.nearbyEnemies = this.spatialIndex.query(enemy, this.policy.maxNearbyEnemies);
      this.stats.neighborCandidatesTotal += state.nearbyEnemies.length;
      this.stats.neighborCandidatesMax = Math.max(
        this.stats.neighborCandidatesMax,
        state.nearbyEnemies.length,
      );

      const targetChanged = !this.sameCell(state.targetCell, desiredTarget.cell);
      if (targetChanged) {
        state.targetCell = this.cloneCell(desiredTarget.cell);
        state.targetPoint = this.clonePoint(desiredTarget.point);
        state.targetRevision = this.targetRevision;
        state.targetChangedAt = this.time;
        state.dirty = desiredTarget.cell !== null;
        state.nextRepathAt = Math.min(state.nextRepathAt, this.time);
        state.forceRepath = false;
        this.cancelPending(enemy);
      } else {
        state.targetPoint = this.clonePoint(desiredTarget.point);
      }

      if (!desiredTarget.cell || !desiredTarget.point) {
        state.goalCell = null;
        state.slotPoint = null;
        state.directApproachClear = null;
        state.dirty = false;
        this.setMode(state, 'repath');
        enemy.clearNavigationPath();
        continue;
      }

      const slot = desiredTarget.localEnabled && desiredTarget.engagementBounds
        ? this.resolveSlot(enemy, state, desiredTarget.engagementBounds)
        : null;
      const goalCell = slot?.cell ?? desiredTarget.cell;
      const goalChanged = !this.sameCell(state.goalCell, goalCell);
      if (goalChanged) {
        state.goalCell = this.cloneCell(goalCell);
        state.slotPoint = slot ? this.clonePoint(slot.point) : null;
        state.dirty = true;
        state.targetChangedAt = this.time;
        state.nextRepathAt = Math.min(state.nextRepathAt, this.time);
        this.cancelPending(enemy);
      } else {
        state.slotPoint = slot ? this.clonePoint(slot.point) : null;
      }

      state.directApproachClear = state.slotPoint
        ? this.terrain.isOpenForRadiusSegment(
          { x: enemy.x, y: enemy.y },
          state.slotPoint,
          enemy.radius,
          'enemy',
        )
        : null;

      const localMode = this.getLocalMode(enemy, state);
      if (localMode) {
        this.setMode(state, localMode);
        if (state.visibleEnteredThisUpdate) {
          state.immediateFollowTransition = true;
          state.visibleFollowLatency = Math.max(0, this.time - (state.visibleSince ?? this.time));
        }
        state.dirty = false;
        state.forceRepath = false;
        this.cancelPending(enemy);
        continue;
      }

      if (state.mode === 'local' || state.mode === 'engaged') this.setMode(state, 'repath');

      const enemyCell = this.terrain.worldToCell({ x: enemy.x, y: enemy.y });
      if (!enemyCell || !state.goalCell) {
        this.setMode(state, 'repath');
        continue;
      }

      const remainingPath = enemy.getPath();
      let pathValid = true;
      if (state.mode === 'path' && remainingPath.length > 0 && this.time >= state.nextValidationAt &&
        validationsThisFrame < this.policy.maxPathValidationsPerFrame) {
        pathValid = this.pathfinder.isPathValid(enemyCell, remainingPath, enemy.radius);
        validationsThisFrame++;
        state.nextValidationAt = this.time + this.policy.pathValidationInterval;
        this.stats.pathValidationsThisFrame++;
        if (!pathValid) state.dirty = true;
      }

      if (this.sameCell(enemyCell, state.goalCell)) {
        this.cancelPending(enemy);
        if (remainingPath.length > 0) enemy.applyNavigationPath([], state.goalCell);
        state.dirty = false;
        state.forceRepath = false;
        state.nextRepathAt = this.time + this.policy.repathInterval;
        state.nextValidationAt = this.time + this.policy.pathValidationInterval;
        this.setMode(state, 'path');
        continue;
      }

      const needsPath = state.dirty || remainingPath.length === 0 || !pathValid;
      if (!needsPath) {
        this.setMode(state, 'path');
        continue;
      }

      const priority = !pathValid || state.forceRepath
        || (state.visible && state.directApproachClear === false);
      const due = this.time >= state.nextRepathAt || priority;
      if (!due) {
        const graceExpired = state.dirty && remainingPath.length > 0
          && this.time - state.targetChangedAt >= this.policy.localSteeringGracePeriod;
        this.setMode(state, graceExpired ? 'repath' : 'path');
        continue;
      }

      const key = this.makeKey(enemyCell, state.goalCell, enemy.radius);
      const cached = this.readCache(key);
      if (cached.hit) {
        this.stats.cacheHitsThisFrame++;
        this.applyPath(enemy, state, cached.path, state.goalCell);
      } else {
        this.stats.cacheMissesThisFrame++;
        if (!pathValid) enemy.clearNavigationPath();
        this.enqueue(enemy, key, enemyCell, state.goalCell, desiredTarget.cell, enemy.radius, priority);
        if (!pathValid || remainingPath.length === 0) this.setMode(state, 'repath');
      }
    }

    this.processPending();
    this.refreshDynamicStats(enemies);
    this.stats.navigationMainMs = this.now() - startedAt;
    this.maxNavigationMainMsObserved = Math.max(
      this.maxNavigationMainMsObserved,
      this.stats.navigationMainMs,
    );
    this.stats.navigationMainMsMax = this.maxNavigationMainMsObserved;
    this.maxSearchesObserved = Math.max(this.maxSearchesObserved, this.stats.pathSearchesThisFrame);
  }

  public getDirective(enemy: Enemy): EnemyNavigationDirective | null {
    const state = this.agentStates.get(enemy);
    if (!state) return null;
    return {
      mode: state.mode,
      targetCell: this.cloneCell(state.goalCell),
      targetPoint: this.clonePoint(state.slotPoint),
      arrivalRadius: Math.max(this.terrain.cellSize, enemy.radius * 2),
      stopDistance: this.getStopDistance(enemy),
      probeDistance: this.policy.localSteeringProbeDistance,
      separationWeight: this.policy.separationWeight,
      maxNearbyEnemies: this.policy.maxNearbyEnemies,
    };
  }

  public getNearbyEnemies(enemy: Enemy): readonly Enemy[] {
    return this.agentStates.get(enemy)?.nearbyEnemies ?? [];
  }

  public getStats(): EnemyNavigationStats {
    return {
      ...this.stats,
      pendingRequests: this.pendingJobs.size,
      workerJobsInFlight: this.inFlightJobs.size,
      workerQueueDepth: this.pendingJobs.size,
      workerFallbackCount: this.workerFallbackCount,
      maxSearchesThisFrame: this.maxSearchesObserved,
      navigationMainMsMax: this.maxNavigationMainMsObserved,
    };
  }

  public getAgentSnapshots(enemies: readonly Enemy[]): readonly EnemyNavigationAgentSnapshot[] {
    const snapshots: EnemyNavigationAgentSnapshot[] = [];
    for (const enemy of enemies) {
      if (enemy.isDead()) continue;
      const state = this.agentStates.get(enemy);
      if (!state) continue;

      const position = { x: enemy.x, y: enemy.y };
      const telemetry = enemy.getNavigationTelemetry();
      snapshots.push({
        id: enemy.navigationId,
        type: enemy.enemyType,
        speed: enemy.speed,
        position,
        mode: state.mode,
        targetCell: this.cloneCell(state.targetCell),
        targetPoint: this.clonePoint(state.targetPoint),
        goalCell: this.cloneCell(state.goalCell),
        slotPoint: this.clonePoint(state.slotPoint),
        distanceToTarget: state.targetPoint ? this.distance(position, state.targetPoint) : null,
        distanceToSlot: state.slotPoint ? this.distance(position, state.slotPoint) : null,
        slotIndex: state.slotIndex,
        pathLength: enemy.getPath().length,
        waypointIndex: enemy.getWaypointIndex(),
        pending: this.requestKeyByEnemy.has(enemy),
        pathSearchesThisFrame: this.pathSearchAgentsThisFrame.has(enemy) ? 1 : 0,
        blockedTime: state.blockedTime,
        stuck: state.blockedTime >= this.policy.localSteeringStuckDuration || state.stuckEventUntil > this.time,
        stuckReported: state.stuckReported || state.stuckEventUntil > this.time,
        stuckEvent: state.stuckEventUntil > this.time,
        recoveredAfterStuck: state.stuckRecoveryObserved,
        forceRepath: state.forceRepath,
        directApproachClear: state.directApproachClear,
        terrainSafe: this.terrain.isOpenForRadius(position, enemy.radius, 'enemy'),
        movementDistance: telemetry.movementDistance,
        safeProgress: telemetry.safeProgress,
        blockedProbeCount: telemetry.blockedProbeCount,
        steeringDirection: telemetry.steeringDirection,
        stopped: telemetry.stopped,
        stoppedReason: telemetry.stoppedReason,
        visible: state.visible,
        visibleSince: state.visibleSince,
        immediateFollowTransition: state.immediateFollowTransition,
        visibleFollowLatency: state.visibleFollowLatency,
      });
    }

    const sampleLimit = 24;
    if (snapshots.length <= sampleLimit) return snapshots;

    const selected: EnemyNavigationAgentSnapshot[] = [];
    const selectedIds = new Set<number>();
    const append = (snapshot: EnemyNavigationAgentSnapshot): void => {
      if (selected.length >= sampleLimit || selectedIds.has(snapshot.id)) return;
      selected.push(snapshot);
      selectedIds.add(snapshot.id);
    };
    for (const snapshot of snapshots) {
      if (snapshot.mode === 'local' || snapshot.mode === 'engaged' || snapshot.stuck || snapshot.stuckReported) {
        append(snapshot);
      }
    }

    const byDistanceToTarget = snapshots
      .filter((snapshot) => !selectedIds.has(snapshot.id))
      .sort((a, b) => (a.distanceToTarget ?? Number.POSITIVE_INFINITY)
        - (b.distanceToTarget ?? Number.POSITIVE_INFINITY));
    for (const snapshot of byDistanceToTarget) append(snapshot);

    const byFarthestTarget = byDistanceToTarget.slice().reverse();
    for (const snapshot of byFarthestTarget) append(snapshot);
    return selected;
  }

  private getAgentState(enemy: Enemy): NavigationAgentState {
    const existing = this.agentStates.get(enemy);
    if (existing) return existing;

    const state: NavigationAgentState = {
      targetCell: null,
      targetPoint: null,
      goalCell: null,
      slotPoint: null,
      slotIndex: this.nextSlotIndex++,
      nextRepathAt: 0,
      nextValidationAt: 0,
      targetChangedAt: 0,
      blockedTime: 0,
      lastPosition: null,
      stuckReported: false,
      stuckEventUntil: 0,
      stuckRecoveryPending: false,
      stuckRecoveryObserved: false,
      forceRepath: false,
      dirty: true,
      mode: 'path',
      directApproachClear: null,
      targetRevision: 0,
      visible: false,
      visibleSince: null,
      visibleEnteredThisUpdate: false,
      immediateFollowTransition: false,
      visibleFollowLatency: null,
      nearbyEnemies: [],
    };
    this.agentStates.set(enemy, state);
    return state;
  }

  private observeProgress(enemy: Enemy, state: NavigationAgentState, dt: number): void {
    const current = { x: enemy.x, y: enemy.y };
    const atSlot = state.slotPoint !== null
      && this.distance(current, state.slotPoint) <= this.getStopDistance(enemy);
    const expectsMovement = !atSlot && (
      state.mode === 'local' || (state.mode === 'path' && enemy.getPath().length > 0)
    );

    if (!state.lastPosition) {
      state.lastPosition = current;
      return;
    }

    const movement = this.distance(current, state.lastPosition);
    state.lastPosition = current;
    const minimumMovement = Math.max(0.25, enemy.speed * Math.max(0, dt) * 0.05);
    if (expectsMovement && movement < minimumMovement) {
      state.blockedTime += Math.max(0, dt);
    } else {
      if (expectsMovement && movement >= minimumMovement && state.stuckRecoveryPending) {
        state.stuckRecoveryPending = false;
        state.stuckRecoveryObserved = true;
      }
      state.blockedTime = 0;
      state.stuckReported = false;
    }

    if (!expectsMovement || state.blockedTime < this.policy.localSteeringStuckDuration || state.stuckReported) return;
    state.stuckReported = true;
    state.stuckEventUntil = this.time + Math.max(1.5, this.policy.localSteeringStuckDuration * 4);
    state.stuckRecoveryPending = true;
    state.stuckRecoveryObserved = false;
    state.forceRepath = true;
    state.dirty = true;
    state.nextRepathAt = this.time;
    state.targetChangedAt = this.time;
    state.slotIndex++;
    this.cancelPending(enemy);
  }

  private getLocalMode(enemy: Enemy, state: NavigationAgentState): EnemyNavigationMode | null {
    if (!state.slotPoint || !state.targetPoint) return null;
    const distance = this.distance({ x: enemy.x, y: enemy.y }, state.slotPoint);
    const currentlyLocal = state.mode === 'local' || state.mode === 'engaged';
    const direct = state.directApproachClear === true;
    if (state.visible && direct) {
      return distance <= this.getStopDistance(enemy) ? 'engaged' : 'local';
    }
    if (currentlyLocal && distance <= this.policy.localSteeringExitDistance) {
      return distance <= this.getStopDistance(enemy) ? 'engaged' : 'local';
    }
    if (distance <= this.policy.localSteeringEnterDistance && direct) {
      return distance <= this.getStopDistance(enemy) ? 'engaged' : 'local';
    }
    return null;
  }

  private resolveSlot(enemy: Enemy, state: NavigationAgentState, bounds: TerrainAabb): EngagementSlot | null {
    const candidates = this.getSlotCandidates(bounds, enemy.radius);
    if (candidates.length === 0) return null;

    const preferredIndex = ((state.slotIndex % candidates.length) + candidates.length) % candidates.length;
    for (let offset = 0; offset < candidates.length; offset++) {
      const point = candidates[(preferredIndex + offset) % candidates.length];
      const cell = this.terrain.worldToCell(point);
      if (!cell || !this.pathfinder.isCellWalkable(cell, enemy.radius)) continue;
      if (!this.terrain.isOpenForRadius(point, enemy.radius, 'enemy')) continue;
      return { point, cell };
    }
    return null;
  }

  private getSlotCandidates(bounds: TerrainAabb, radius: number): TerrainPoint[] {
    const gap = radius + 0.01;
    const width = Math.max(0, bounds.right - bounds.left);
    const height = Math.max(0, bounds.bottom - bounds.top);
    const leftQuarter = bounds.left + width * 0.25;
    const rightQuarter = bounds.left + width * 0.75;
    const topQuarter = bounds.top + height * 0.25;
    const bottomQuarter = bounds.top + height * 0.75;
    const centerX = bounds.left + width * 0.5;
    const centerY = bounds.top + height * 0.5;
    return [
      { x: leftQuarter, y: bounds.top - gap },
      { x: rightQuarter, y: bounds.top - gap },
      { x: bounds.right + gap, y: topQuarter },
      { x: bounds.right + gap, y: bottomQuarter },
      { x: rightQuarter, y: bounds.bottom + gap },
      { x: leftQuarter, y: bounds.bottom + gap },
      { x: bounds.left - gap, y: bottomQuarter },
      { x: bounds.left - gap, y: topQuarter },
      { x: centerX, y: bounds.top - gap },
      { x: bounds.right + gap, y: centerY },
      { x: centerX, y: bounds.bottom + gap },
      { x: bounds.left - gap, y: centerY },
    ];
  }

  private enqueue(
    enemy: Enemy,
    key: string,
    start: TerrainCell,
    goal: TerrainCell,
    targetCell: TerrainCell,
    radius: number,
    priority: boolean,
  ): void {
    const previousKey = this.requestKeyByEnemy.get(enemy);
    if (previousKey === key && this.requestIdByEnemy.has(enemy)) return;
    if (previousKey === key && this.pendingJobs.has(key)) return;
    if (previousKey) this.removeRequester(enemy);

    const inFlight = this.inFlightKeyByKey.get(key);
    if (inFlight && inFlight.targetRevision === this.targetRevision) {
      inFlight.requesters.add(enemy);
      this.requestKeyByEnemy.set(enemy, key);
      this.requestIdByEnemy.set(enemy, inFlight.requestId);
      this.stats.deduplicatedRequestsThisFrame++;
      return;
    }

    let job = this.pendingJobs.get(key);
    if (!job) {
      job = {
        key,
        start: { ...start },
        goal: { ...goal },
        targetCell: { ...targetCell },
        radius,
        priority,
        enqueuedAt: this.time,
        requesters: new Set(),
        targetRevision: this.targetRevision,
      };
      this.pendingJobs.set(key, job);
      this.pendingOrder.push(key);
    } else {
      if (!job.requesters.has(enemy)) this.stats.deduplicatedRequestsThisFrame++;
      job.priority ||= priority;
    }

    job.requesters.add(enemy);
    this.requestKeyByEnemy.set(enemy, key);
    this.trimPendingJobs();
  }

  private processPending(): void {
    if (this.workerActive) {
      this.dispatchWorkerJobs();
      return;
    }

    this.processPendingSynchronously();
  }

  private processPendingSynchronously(): void {
    let searches = 0;
    while (searches < this.policy.maxPathSearchesPerFrame) {
      const job = this.takeNextJob();
      if (!job) break;

      this.releasePendingRequesters(job);

      // ponytail: synchronous A* remains behind the existing fixed search budget; use incremental search only if profiling requires it.
      for (const enemy of job.requesters) this.pathSearchAgentsThisFrame.add(enemy);
      const path = this.pathfinder.findPath(job.start, job.goal, { radius: job.radius });
      this.writeCache(job.key, path);
      searches++;
      this.stats.pathSearchesThisFrame++;

      for (const enemy of job.requesters) {
        const state = this.agentStates.get(enemy);
        if (!state || enemy.isDead() || !state.targetCell || !this.sameCell(state.targetCell, job.targetCell)) continue;
        if (!state.goalCell || !this.sameCell(state.goalCell, job.goal)) continue;
        this.applyPath(enemy, state, path, job.goal, true);
      }
    }
  }

  private dispatchWorkerJobs(): void {
    if (!this.worker || !this.workerReady || this.time < this.nextWorkerDispatchAt) return;

    const available = this.policy.maxWorkerInFlightJobs - this.inFlightJobs.size;
    if (available <= 0) return;

    const jobs: InFlightPathRequest[] = [];
    while (jobs.length < this.policy.maxWorkerJobsPerBatch && jobs.length < available) {
      const pending = this.takeNextJob();
      if (!pending) break;
      if (pending.requesters.size === 0) continue;

      const job: InFlightPathRequest = {
        ...pending,
        requestId: `${this.revision}:${this.nextWorkerRequestId++}`,
        dispatchedAt: this.time,
        requesters: new Set(pending.requesters),
      };
      this.inFlightJobs.set(job.requestId, job);
      this.inFlightKeyByKey.set(job.key, job);
      for (const enemy of job.requesters) {
        if (this.requestKeyByEnemy.get(enemy) !== job.key) continue;
        this.requestIdByEnemy.set(enemy, job.requestId);
      }
      jobs.push(job);
    }
    if (jobs.length === 0) return;

    const messageJobs: EnemyNavigationWorkerPathJob[] = jobs.map((job) => ({
      requestId: job.requestId,
      key: job.key,
      start: { ...job.start },
      goal: { ...job.goal },
      radius: job.radius,
      targetRevision: job.targetRevision,
      terrainRevision: this.revision,
    }));
    try {
      this.worker.postMessage({ type: 'search', jobs: messageJobs });
      this.stats.workerDispatchesThisFrame++;
      this.nextWorkerDispatchAt = this.time + this.policy.workerDispatchInterval;
    } catch (error) {
      this.failWorker(error, jobs);
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

  private releasePendingRequesters(job: PendingPathRequest): void {
    for (const enemy of job.requesters) {
      if (this.requestKeyByEnemy.get(enemy) !== job.key) continue;
      this.requestKeyByEnemy.delete(enemy);
      this.requestIdByEnemy.delete(enemy);
    }
  }

  private removeRequester(enemy: Enemy): void {
    const key = this.requestKeyByEnemy.get(enemy);
    if (key) {
      const pending = this.pendingJobs.get(key);
      pending?.requesters.delete(enemy);
      if (pending && pending.requesters.size === 0) this.pendingJobs.delete(key);
    }

    const requestId = this.requestIdByEnemy.get(enemy);
    if (requestId) this.inFlightJobs.get(requestId)?.requesters.delete(enemy);
    this.requestKeyByEnemy.delete(enemy);
    this.requestIdByEnemy.delete(enemy);
  }

  private trimPendingJobs(): void {
    while (this.pendingJobs.size > this.policy.maxWorkerQueueDepth) {
      const candidateKey = this.pendingOrder.find((key) => this.pendingJobs.get(key)?.priority !== true)
        ?? this.pendingOrder.find((key) => this.pendingJobs.has(key));
      if (!candidateKey) return;
      const job = this.pendingJobs.get(candidateKey);
      this.pendingJobs.delete(candidateKey);
      const index = this.pendingOrder.indexOf(candidateKey);
      if (index >= 0) this.pendingOrder.splice(index, 1);
      if (!job) continue;
      this.releasePendingRequesters(job);
    }
  }

  private startWorker(): void {
    if (!this.workerRequested || (!this.customWorkerFactory && typeof Worker === 'undefined') || !this.workerFactory) return;

    try {
      const worker = this.workerFactory();
      worker.onmessage = (event: MessageEvent<EnemyNavigationWorkerResponse>) => {
        this.handleWorkerResponse(event.data);
      };
      worker.onerror = (event) => {
        this.failWorker(event.error ?? new Error(event.message || 'worker error'));
      };
      this.worker = worker;
      this.workerActive = true;
      worker.postMessage({
        type: 'init',
        terrain: this.terrain.toData(),
        terrainRevision: this.revision,
      });
    } catch (error) {
      this.failWorker(error);
    }
  }

  private disposeWorker(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'dispose' });
      } catch {
        // The worker may already be closing.
      }
      this.worker.terminate();
    }
    this.worker = null;
    this.workerReady = false;
    this.workerActive = false;
  }

  private failWorker(error: unknown, failedJobs: readonly InFlightPathRequest[] = []): void {
    if (!this.workerActive && failedJobs.length === 0) return;
    this.workerFallbackCount++;
    const jobs = [...this.inFlightJobs.values(), ...failedJobs]
      .filter((job, index, all) => all.findIndex((candidate) => candidate.requestId === job.requestId) === index);
    this.inFlightJobs.clear();
    this.inFlightKeyByKey.clear();
    this.workerActive = false;
    this.workerReady = false;
    if (this.worker) this.worker.terminate();
    this.worker = null;

    for (const job of jobs) {
      for (const enemy of job.requesters) {
        if (this.requestIdByEnemy.get(enemy) !== job.requestId) continue;
        this.requestIdByEnemy.delete(enemy);
        this.requestKeyByEnemy.delete(enemy);
        const state = this.agentStates.get(enemy);
        if (enemy.isDead() || !state || !state.targetCell || !state.goalCell
          || job.targetRevision !== this.targetRevision
          || !this.sameCell(state.targetCell, job.targetCell)
          || !this.sameCell(state.goalCell, job.goal)) continue;
        this.enqueue(enemy, job.key, job.start, job.goal, job.targetCell, job.radius, job.priority);
      }
    }
    if (error) this.stats.workerFallbackCount = this.workerFallbackCount;
  }

  private handleWorkerResponse(response: EnemyNavigationWorkerResponse): void {
    if (response.type === 'ready') {
      if (response.terrainRevision === this.revision) this.workerReady = true;
      return;
    }

    for (const result of response.results) {
      const job = this.inFlightJobs.get(result.requestId);
      if (!job) {
        this.stats.workerStaleResultsThisFrame++;
        continue;
      }
      this.inFlightJobs.delete(result.requestId);
      if (this.inFlightKeyByKey.get(job.key) === job) this.inFlightKeyByKey.delete(job.key);
      this.stats.workerResultsThisFrame++;
      const stale = result.terrainRevision !== this.revision
        || result.targetRevision !== this.targetRevision
        || result.key !== job.key
        || job.targetRevision !== this.targetRevision;
      for (const enemy of job.requesters) {
        if (this.requestIdByEnemy.get(enemy) !== job.requestId) continue;
        this.requestIdByEnemy.delete(enemy);
        this.requestKeyByEnemy.delete(enemy);
      }
      if (stale) {
        this.stats.workerStaleResultsThisFrame++;
        continue;
      }

      this.writeCache(job.key, result.path);
      for (const enemy of job.requesters) {
        const state = this.agentStates.get(enemy);
        if (!state || enemy.isDead() || !state.targetCell || !this.sameCell(state.targetCell, job.targetCell)) continue;
        if (!state.goalCell || !this.sameCell(state.goalCell, job.goal)) continue;
        this.applyPath(enemy, state, result.path, job.goal, true);
      }
    }
  }

  private applyPath(
    enemy: Enemy,
    state: NavigationAgentState,
    path: TerrainCell[] | null,
    goalCell: TerrainCell,
    retryOnFailure = false,
  ): void {
    const shouldTryNextSlot = retryOnFailure && path === null && state.slotPoint !== null;
    if (shouldTryNextSlot) state.slotIndex++;
    this.cancelPending(enemy);
    state.dirty = shouldTryNextSlot;
    state.forceRepath = false;
    state.blockedTime = 0;
    state.stuckReported = false;
    state.nextRepathAt = shouldTryNextSlot ? this.time : this.time + this.policy.repathInterval;
    state.nextValidationAt = this.time + this.policy.pathValidationInterval;
    this.setMode(state, path ? 'path' : 'repath');
    enemy.applyNavigationPath(path ?? [], goalCell);
  }

  private cancelPending(enemy: Enemy): void {
    this.removeRequester(enemy);
  }

  private readCache(key: string): { hit: boolean; path: TerrainCell[] | null } {
    if (!this.cache.has(key)) return { hit: false, path: null };

    const path = this.cache.get(key) ?? null;
    if (path === null && this.time >= (this.negativeCacheExpiry.get(key) ?? 0)) {
      this.cache.delete(key);
      this.negativeCacheExpiry.delete(key);
      return { hit: false, path: null };
    }
    this.cache.delete(key);
    this.cache.set(key, path);
    return {
      hit: true,
      path: path?.map((cell) => ({ ...cell })) ?? null,
    };
  }

  private writeCache(key: string, path: TerrainCell[] | null): void {
    this.cache.delete(key);
    if (path === null) this.negativeCacheExpiry.set(key, this.time + this.policy.repathInterval);
    else this.negativeCacheExpiry.delete(key);
    this.cache.set(key, path?.map((cell) => ({ ...cell })) ?? null);
    while (this.cache.size > this.policy.pathCacheSize) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
      this.negativeCacheExpiry.delete(oldest);
    }
  }

  private makeKey(start: TerrainCell, goal: TerrainCell, radius: number): string {
    return this.revision + ':' + start.x + ',' + start.y + ':' + goal.x + ',' + goal.y + ':' + radius;
  }

  private normalizeTarget(target: EnemyNavigationTarget | TerrainCell | null): NormalizedNavigationTarget {
    if (!target) {
      return {
        point: null,
        cell: null,
        engagementBounds: null,
        visibilityBounds: null,
        localEnabled: false,
      };
    }
    if ('point' in target) {
      return {
        point: { ...target.point },
        cell: this.cloneCell(target.cell),
        engagementBounds: { ...target.engagementBounds },
        visibilityBounds: { ...target.visibilityBounds },
        localEnabled: true,
      };
    }
    return {
      point: this.terrain.cellToWorldCenter(target),
      cell: { ...target },
      engagementBounds: null,
      visibilityBounds: null,
      localEnabled: false,
    };
  }

  private isVisible(enemy: Enemy, bounds: TerrainAabb): boolean {
    return enemy.x >= bounds.left
      && enemy.x <= bounds.right
      && enemy.y >= bounds.top
      && enemy.y <= bounds.bottom;
  }

  private refreshDynamicStats(enemies: readonly Enemy[]): void {
    let localSteeringAgents = 0;
    let engagedAgents = 0;
    let stuckAgents = 0;
    let visibleAgents = 0;
    let visibleImmediateFollowTransitions = 0;
    let visibleBlockedAgents = 0;
    const stoppedAgentsByReason: Record<string, number> = {
      arrival: 0,
      blocked: 0,
      'pending-path': 0,
    };
    for (const enemy of enemies) {
      if (enemy.isDead()) continue;
      const state = this.agentStates.get(enemy);
      if (!state) continue;
      if (state.mode === 'local') localSteeringAgents++;
      if (state.mode === 'engaged') engagedAgents++;
      if (state.blockedTime >= this.policy.localSteeringStuckDuration || state.stuckEventUntil > this.time) stuckAgents++;
      if (state.visible) visibleAgents++;
      if (state.immediateFollowTransition) visibleImmediateFollowTransitions++;
      if (state.visible && state.directApproachClear === false) visibleBlockedAgents++;

      const stoppedReason = enemy.getNavigationTelemetry().stoppedReason;
      if (stoppedReason) stoppedAgentsByReason[stoppedReason]++;
      else if (state.mode === 'repath') {
        stoppedAgentsByReason[this.requestKeyByEnemy.has(enemy) ? 'pending-path' : 'blocked']++;
      }
    }

    let oldestPendingRequestAge = 0;
    for (const job of this.pendingJobs.values()) {
      oldestPendingRequestAge = Math.max(oldestPendingRequestAge, this.time - job.enqueuedAt);
    }
    let oldestWorkerRequestAge = oldestPendingRequestAge;
    for (const job of this.inFlightJobs.values()) {
      oldestWorkerRequestAge = Math.max(oldestWorkerRequestAge, this.time - job.enqueuedAt);
    }
    this.stats = {
      ...this.stats,
      pendingRequests: this.pendingJobs.size,
      localSteeringAgents,
      engagedAgents,
      stuckAgents,
      pendingNavigationAgents: this.requestKeyByEnemy.size,
      oldestPendingRequestAge,
      visibleAgents,
      visibleImmediateFollowTransitions,
      visibleBlockedAgents,
      workerEnabled: this.workerActive,
      workerJobsInFlight: this.inFlightJobs.size,
      workerQueueDepth: this.pendingJobs.size,
      workerFallbackCount: this.workerFallbackCount,
      oldestWorkerRequestAge,
      stoppedAgentsByReason,
    };
  }

  private setMode(state: NavigationAgentState, mode: EnemyNavigationMode): void {
    if (state.mode === mode) return;
    if (state.mode === 'local' || state.mode === 'engaged' || mode === 'local' || mode === 'engaged') {
      this.stats.localSteeringTransitionsThisFrame++;
    }
    state.mode = mode;
  }

  private getStopDistance(enemy: Enemy): number {
    return Math.max(2, Math.min(enemy.radius * 0.35, this.terrain.cellSize * 0.25));
  }

  private distance(a: TerrainPoint, b: TerrainPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private cloneCell(cell: TerrainCell | null): TerrainCell | null {
    return cell ? { ...cell } : null;
  }

  private clonePoint(point: TerrainPoint | null): TerrainPoint | null {
    return point ? { ...point } : null;
  }

  private sameCell(a: TerrainCell | null, b: TerrainCell | null): boolean {
    return a?.x === b?.x && a?.y === b?.y;
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
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
      localSteeringAgents: 0,
      engagedAgents: 0,
      stuckAgents: 0,
      pendingNavigationAgents: 0,
      oldestPendingRequestAge: 0,
      localSteeringTransitionsThisFrame: 0,
      visibleAgents: 0,
      visibleImmediateFollowTransitions: 0,
      visibleBlockedAgents: 0,
      navigationMainMs: 0,
      navigationMainMsMax: this.maxNavigationMainMsObserved,
      workerEnabled: this.workerActive,
      workerDispatchesThisFrame: 0,
      workerJobsInFlight: this.inFlightJobs.size,
      workerQueueDepth: this.pendingJobs.size,
      workerResultsThisFrame: 0,
      workerStaleResultsThisFrame: 0,
      workerFallbackCount: this.workerFallbackCount,
      oldestWorkerRequestAge: 0,
      neighborCandidatesTotal: 0,
      neighborCandidatesMax: 0,
      stoppedAgentsByReason: {
        arrival: 0,
        blocked: 0,
        'pending-path': 0,
      },
    };
  }
}
