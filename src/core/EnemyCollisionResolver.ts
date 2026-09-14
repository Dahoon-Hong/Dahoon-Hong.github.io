import { Enemy } from '../entities/Enemy';
import { EnemySpatialIndex } from './EnemySpatialIndex';
import type { TerrainAabb, TerrainGrid, TerrainPoint } from './TerrainGrid';

const COLLISION_EPSILON = 0.01;
const MAX_SEPARATION_PASSES = 8;
const MAX_SEPARATION_RINGS = 8;

export class EnemyCollisionResolver {
  private terrain: TerrainGrid;
  private readonly spatialIndex: EnemySpatialIndex;

  public constructor(terrain: TerrainGrid, spatialCellSize: number) {
    this.terrain = terrain;
    this.spatialIndex = new EnemySpatialIndex(spatialCellSize);
  }

  public setTerrain(terrain: TerrainGrid): void {
    this.terrain = terrain;
    this.spatialIndex.reset();
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

  public separate(enemies: readonly Enemy[], vehicleBounds?: TerrainAabb): number {
    let corrections = 0;

    // ponytail: bounded passes keep a large spawn burst cheap; the spatial index limits checks to local buckets.
    for (let pass = 0; pass < MAX_SEPARATION_PASSES; pass++) {
      this.spatialIndex.build(enemies);
      let changed = false;
      for (const enemy of enemies) {
        if (enemy.isDead()) continue;
        for (const other of this.spatialIndex.query(enemy, enemies.length)) {
          if (other.navigationId <= enemy.navigationId || other.isDead()) continue;

          const minimumDistance = enemy.radius + other.radius + COLLISION_EPSILON;
          const delta = { x: enemy.x - other.x, y: enemy.y - other.y };
          const currentDistance = Math.hypot(delta.x, delta.y);
          if (currentDistance >= minimumDistance) continue;

          const direction = currentDistance > 1e-9
            ? { x: delta.x / currentDistance, y: delta.y / currentDistance }
            : this.getDeterministicDirection(enemy, other);
          const penetration = minimumDistance - currentDistance;
          const mover = other.navigationId > enemy.navigationId ? other : enemy;
          const stationary = mover === enemy ? other : enemy;
          const moverDirection = mover === enemy
            ? direction
            : { x: -direction.x, y: -direction.y };
          const moved = this.displaceFrom(
            mover,
            stationary,
            moverDirection,
            penetration,
            enemies,
            vehicleBounds,
          ) || this.displaceFrom(
            stationary,
            mover,
            { x: -moverDirection.x, y: -moverDirection.y },
            penetration,
            enemies,
            vehicleBounds,
          );
          if (!moved) continue;
          changed = true;
          corrections++;
        }
      }
      if (!changed) break;
    }

    return corrections;
  }

  private displaceFrom(
    mover: Enemy,
    stationary: Enemy,
    direction: TerrainPoint,
    distance: number,
    enemies: readonly Enemy[],
    vehicleBounds?: TerrainAabb,
  ): boolean {
    const desiredAngle = Math.atan2(direction.y, direction.x);
    const offsets = [
      0,
      -Math.PI / 4,
      Math.PI / 4,
      -Math.PI / 2,
      Math.PI / 2,
      -Math.PI * 3 / 4,
      Math.PI * 3 / 4,
      Math.PI,
    ];
    const currentDistance = Math.hypot(mover.x - stationary.x, mover.y - stationary.y);
    let bestPoint: TerrainPoint | null = null;
    let bestDistance = currentDistance;
    let fallbackPoint: TerrainPoint | null = null;
    let fallbackDistance = currentDistance;

    const separationStep = mover.radius + stationary.radius + COLLISION_EPSILON;
    for (let ring = 0; ring < MAX_SEPARATION_RINGS; ring++) {
      const probeDistance = distance + COLLISION_EPSILON + ring * separationStep;
      for (const offset of offsets) {
        const angle = desiredAngle + offset;
        const target = {
          x: mover.x + Math.cos(angle) * probeDistance,
          y: mover.y + Math.sin(angle) * probeDistance,
        };
        if (vehicleBounds && this.overlapsVehicle(target, mover.radius, vehicleBounds)) continue;

        const safePoint = this.getSafePoint(mover, target);
        if (vehicleBounds && this.overlapsVehicle(safePoint, mover.radius, vehicleBounds)) continue;
        const resultingDistance = Math.hypot(safePoint.x - stationary.x, safePoint.y - stationary.y);
        if (resultingDistance > fallbackDistance + 1e-6) {
          fallbackDistance = resultingDistance;
          fallbackPoint = safePoint;
        }
        if (resultingDistance <= bestDistance + 1e-6 || this.overlapsAnyEnemy(safePoint, mover, enemies)) continue;
        bestDistance = resultingDistance;
        bestPoint = safePoint;
      }
      if (bestPoint) break;
    }

    if (!bestPoint) bestPoint = fallbackPoint;
    if (!bestPoint) return false;
    mover.x = bestPoint.x;
    mover.y = bestPoint.y;
    return true;
  }

  private overlapsAnyEnemy(point: TerrainPoint, mover: Enemy, enemies: readonly Enemy[]): boolean {
    for (const other of this.spatialIndex.queryAt(point, enemies.length, mover)) {
      const minimumDistance = mover.radius + other.radius + COLLISION_EPSILON;
      if (Math.hypot(point.x - other.x, point.y - other.y) < minimumDistance) return true;
    }
    return false;
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

  private overlapsVehicle(point: TerrainPoint, radius: number, bounds: TerrainAabb): boolean {
    const closestX = Math.max(bounds.left, Math.min(bounds.right, point.x));
    const closestY = Math.max(bounds.top, Math.min(bounds.bottom, point.y));
    const deltaX = point.x - closestX;
    const deltaY = point.y - closestY;
    return deltaX * deltaX + deltaY * deltaY <= radius * radius;
  }

  private getDeterministicDirection(first: Enemy, second: Enemy): TerrainPoint {
    const angle = ((first.navigationId + second.navigationId) % 8) * Math.PI / 4;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }
}
