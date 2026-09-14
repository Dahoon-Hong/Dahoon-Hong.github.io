import type { Enemy } from '../entities/Enemy';
import type { TerrainAabb, TerrainGrid, TerrainPoint } from './TerrainGrid';
import { EnemySpatialIndex } from './EnemySpatialIndex';

const COLLISION_EPSILON = 0.01;
const MAX_SPAWN_CANDIDATES = 32;
const SPAWN_PROBE_ANGLES = 8;
const COLLISION_SAMPLE_LIMIT = 120;

export interface EnemyCollisionStats {
  collisionMainMs: number;
  collisionMainMsMax: number;
  collisionMainMsP95: number;
  collisionCandidatesTotal: number;
  collisionCandidatesMax: number;
  collisionPairsThisFrame: number;
  collisionPushesThisFrame: number;
  collisionBlockedPushesThisFrame: number;
}

export type EnemyNeighborProvider = (enemy: Enemy) => readonly Enemy[];

export class EnemyCollisionResolver {
  private terrain: TerrainGrid;
  private readonly spatialIndex: EnemySpatialIndex;
  private readonly pushSpeed: number;
  private readonly lookaheadDistance: number;
  private readonly spawnProbeDistance: number;
  private readonly collisionDurationSamples: number[] = [];
  private stats: EnemyCollisionStats = this.createEmptyStats();

  public constructor(
    terrain: TerrainGrid,
    spatialCellSize: number,
    pushSpeed = 180,
    lookaheadDistance = 8,
    spawnProbeDistance = 32,
  ) {
    this.terrain = terrain;
    this.spatialIndex = new EnemySpatialIndex(spatialCellSize);
    if (!Number.isFinite(pushSpeed) || pushSpeed <= 0) {
      throw new Error('[EnemyCollisionResolver] pushSpeed must be a finite number > 0');
    }
    if (!Number.isFinite(lookaheadDistance) || lookaheadDistance < 0) {
      throw new Error('[EnemyCollisionResolver] lookaheadDistance must be a finite number >= 0');
    }
    if (!Number.isFinite(spawnProbeDistance) || spawnProbeDistance <= 0) {
      throw new Error('[EnemyCollisionResolver] spawnProbeDistance must be a finite number > 0');
    }
    this.pushSpeed = pushSpeed;
    this.lookaheadDistance = lookaheadDistance;
    this.spawnProbeDistance = spawnProbeDistance;
  }

  public setTerrain(terrain: TerrainGrid): void {
    this.terrain = terrain;
    this.spatialIndex.reset();
    this.collisionDurationSamples.length = 0;
    this.stats = this.createEmptyStats();
  }

  public collectPushIntents(
    enemies: readonly Enemy[],
    getNearbyEnemies: EnemyNeighborProvider,
    dt: number,
  ): ReadonlyMap<Enemy, TerrainPoint> {
    const startedAt = this.now();
    const activeEnemies = new Set<Enemy>();
    for (const enemy of enemies) {
      if (!enemy.isDead()) activeEnemies.add(enemy);
    }

    const intents = new Map<Enemy, TerrainPoint>();
    const contactCounts = new Map<Enemy, number>();
    const processedPairs = new Set<string>();
    let candidatesTotal = 0;
    let candidatesMax = 0;
    let collisionPairsThisFrame = 0;

    for (const enemy of enemies) {
      if (!activeEnemies.has(enemy)) continue;
      const nearbyEnemies = getNearbyEnemies(enemy);
      candidatesTotal += nearbyEnemies.length;
      candidatesMax = Math.max(candidatesMax, nearbyEnemies.length);

      for (const other of nearbyEnemies) {
        if (other === enemy || !activeEnemies.has(other)) continue;
        const pairKey = this.getPairKey(enemy, other);
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const first = enemy.navigationId < other.navigationId ? enemy : other;
        const second = first === enemy ? other : enemy;
        const minimumDistance = first.radius + second.radius + COLLISION_EPSILON;
        const delta = { x: first.x - second.x, y: first.y - second.y };
        const distance = Math.hypot(delta.x, delta.y);
        const pressure = minimumDistance
          + this.getLookaheadDistance(first, second, dt)
          - distance;
        if (pressure <= 0) continue;

        collisionPairsThisFrame++;
        contactCounts.set(first, (contactCounts.get(first) ?? 0) + 1);
        contactCounts.set(second, (contactCounts.get(second) ?? 0) + 1);
        const direction = distance > 1e-9
          ? { x: delta.x / distance, y: delta.y / distance }
          : this.getDeterministicDirection(first, second);
        const strength = Math.min(
          this.pushSpeed,
          this.pushSpeed * Math.min(1, pressure / Math.max(1, minimumDistance * 0.5)),
        );
        this.addIntent(intents, first, direction, strength);
        this.addIntent(intents, second, { x: -direction.x, y: -direction.y }, strength);
      }
    }

    for (const [enemy, intent] of intents) {
      const magnitude = Math.hypot(intent.x, intent.y);
      if (magnitude <= 1e-9) {
        const contacts = contactCounts.get(enemy) ?? 0;
        if (contacts > 0) {
          const angle = (enemy.navigationId % SPAWN_PROBE_ANGLES) * Math.PI * 2 / SPAWN_PROBE_ANGLES;
          intents.set(enemy, {
            x: Math.cos(angle) * this.pushSpeed * 0.25,
            y: Math.sin(angle) * this.pushSpeed * 0.25,
          });
        }
        continue;
      }
      if (magnitude <= this.pushSpeed) continue;
      const scale = this.pushSpeed / magnitude;
      intents.set(enemy, { x: intent.x * scale, y: intent.y * scale });
    }

    const collisionMainMs = this.now() - startedAt;
    this.collisionDurationSamples.push(collisionMainMs);
    if (this.collisionDurationSamples.length > COLLISION_SAMPLE_LIMIT) {
      this.collisionDurationSamples.shift();
    }
    this.stats = {
      collisionMainMs,
      collisionMainMsMax: Math.max(this.stats.collisionMainMsMax, collisionMainMs),
      collisionMainMsP95: this.getCollisionMainMsP95(),
      collisionCandidatesTotal: candidatesTotal,
      collisionCandidatesMax: candidatesMax,
      collisionPairsThisFrame,
      collisionPushesThisFrame: intents.size,
      collisionBlockedPushesThisFrame: 0,
    };
    return intents;
  }

  public recordPushSafeProgress(safeProgress: number): void {
    if (!Number.isFinite(safeProgress) || safeProgress >= 1 - COLLISION_EPSILON) return;
    this.stats = {
      ...this.stats,
      collisionBlockedPushesThisFrame: this.stats.collisionBlockedPushesThisFrame + 1,
    };
  }

  public canSpawnAt(point: TerrainPoint, radius: number, enemies: readonly Enemy[]): boolean {
    return this.getSpawnAdmission(point, radius, enemies).allowed;
  }

  public getSpawnAdmission(
    point: TerrainPoint,
    radius: number,
    enemies: readonly Enemy[],
  ): { allowed: boolean; reason?: 'terrain' | 'saturated' } {
    if (!this.terrain.isOpenForRadius(point, radius, 'enemy')) {
      return { allowed: false, reason: 'terrain' };
    }

    this.spatialIndex.build(enemies);
    const candidates = this.spatialIndex.queryAt(point, MAX_SPAWN_CANDIDATES);
    if (!this.overlapsAnyEnemy(point, radius, candidates)) return { allowed: true };

    const probeDistance = Math.max(this.spawnProbeDistance, radius * 2 + COLLISION_EPSILON);
    for (let index = 0; index < SPAWN_PROBE_ANGLES; index++) {
      const angle = index * Math.PI * 2 / SPAWN_PROBE_ANGLES;
      const probe = {
        x: point.x + Math.cos(angle) * probeDistance,
        y: point.y + Math.sin(angle) * probeDistance,
      };
      if (!this.terrain.isOpenForRadiusSegment(point, probe, radius, 'enemy')) continue;
      const probeCandidates = this.spatialIndex.queryAt(probe, MAX_SPAWN_CANDIDATES);
      if (!this.overlapsAnyEnemy(probe, radius, probeCandidates)) return { allowed: true };
    }
    return { allowed: false, reason: 'saturated' };
  }

  public resolveAgainstVehicle(
    enemy: Enemy,
    bounds: TerrainAabb,
    previousPosition: TerrainPoint,
  ): boolean {
    const closestX = Math.max(bounds.left, Math.min(bounds.right, enemy.x));
    const closestY = Math.max(bounds.top, Math.min(bounds.bottom, enemy.y));
    const deltaX = enemy.x - closestX;
    const deltaY = enemy.y - closestY;
    if (deltaX * deltaX + deltaY * deltaY > enemy.radius * enemy.radius) return false;

    const distance = Math.hypot(deltaX, deltaY);
    const target = distance > 0
      ? {
        x: closestX + (deltaX / distance) * (enemy.radius + COLLISION_EPSILON),
        y: closestY + (deltaY / distance) * (enemy.radius + COLLISION_EPSILON),
      }
      : this.getEscapePoint(enemy, bounds, previousPosition);
    const safePoint = this.getSafePoint(enemy, target);
    enemy.x = safePoint.x;
    enemy.y = safePoint.y;
    return true;
  }

  public getStats(): EnemyCollisionStats {
    return { ...this.stats };
  }

  private addIntent(
    intents: Map<Enemy, TerrainPoint>,
    enemy: Enemy,
    direction: TerrainPoint,
    strength: number,
  ): void {
    const previous = intents.get(enemy) ?? { x: 0, y: 0 };
    intents.set(enemy, {
      x: previous.x + direction.x * strength,
      y: previous.y + direction.y * strength,
    });
  }

  private getLookaheadDistance(first: Enemy, second: Enemy, dt: number): number {
    const relativeTravel = Math.max(0, dt) * (first.speed + second.speed);
    return this.lookaheadDistance + Math.min(this.lookaheadDistance, relativeTravel);
  }

  private getPairKey(first: Enemy, second: Enemy): string {
    return first.navigationId < second.navigationId
      ? `${first.navigationId}:${second.navigationId}`
      : `${second.navigationId}:${first.navigationId}`;
  }

  private overlapsAnyEnemy(point: TerrainPoint, radius: number, enemies: readonly Enemy[]): boolean {
    return enemies.some((other) => Math.hypot(point.x - other.x, point.y - other.y)
      < radius + other.radius + COLLISION_EPSILON);
  }

  private getSafePoint(enemy: Enemy, target: TerrainPoint): TerrainPoint {
    const start = { x: enemy.x, y: enemy.y };
    const progress = this.terrain.getSafeRadiusProgress(start, target, enemy.radius, 'enemy');
    return {
      x: start.x + (target.x - start.x) * progress,
      y: start.y + (target.y - start.y) * progress,
    };
  }

  private getEscapePoint(
    enemy: Enemy,
    bounds: TerrainAabb,
    previousPosition: TerrainPoint,
  ): TerrainPoint {
    if (previousPosition.x < bounds.left) {
      return { x: bounds.left - enemy.radius - COLLISION_EPSILON, y: enemy.y };
    }
    if (previousPosition.x > bounds.right) {
      return { x: bounds.right + enemy.radius + COLLISION_EPSILON, y: enemy.y };
    }
    if (previousPosition.y < bounds.top) {
      return { x: enemy.x, y: bounds.top - enemy.radius - COLLISION_EPSILON };
    }
    if (previousPosition.y > bounds.bottom) {
      return { x: enemy.x, y: bounds.bottom + enemy.radius + COLLISION_EPSILON };
    }

    const distances = [
      { distance: enemy.x - bounds.left, point: { x: bounds.left - enemy.radius - COLLISION_EPSILON, y: enemy.y } },
      { distance: bounds.right - enemy.x, point: { x: bounds.right + enemy.radius + COLLISION_EPSILON, y: enemy.y } },
      { distance: enemy.y - bounds.top, point: { x: enemy.x, y: bounds.top - enemy.radius - COLLISION_EPSILON } },
      { distance: bounds.bottom - enemy.y, point: { x: enemy.x, y: bounds.bottom + enemy.radius + COLLISION_EPSILON } },
    ];
    distances.sort((first, second) => first.distance - second.distance);
    return distances[0].point;
  }

  private getDeterministicDirection(first: Enemy, second: Enemy): TerrainPoint {
    const angle = ((first.navigationId + second.navigationId) % SPAWN_PROBE_ANGLES)
      * Math.PI * 2 / SPAWN_PROBE_ANGLES;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private getCollisionMainMsP95(): number {
    if (this.collisionDurationSamples.length === 0) return 0;
    const sorted = [...this.collisionDurationSamples].sort((first, second) => first - second);
    const index = Math.floor((sorted.length - 1) * 0.95);
    return sorted[index];
  }

  private createEmptyStats(): EnemyCollisionStats {
    return {
      collisionMainMs: 0,
      collisionMainMsMax: 0,
      collisionMainMsP95: 0,
      collisionCandidatesTotal: 0,
      collisionCandidatesMax: 0,
      collisionPairsThisFrame: 0,
      collisionPushesThisFrame: 0,
      collisionBlockedPushesThisFrame: 0,
    };
  }
}
