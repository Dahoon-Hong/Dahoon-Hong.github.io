import type { Enemy } from '../entities/Enemy';

interface EnemyCandidate {
  enemy: Enemy;
  distanceSquared: number;
}

export interface EnemySpatialQuery {
  queryCircle(point: { x: number; y: number }, radius: number, excluded?: Enemy): Enemy[];
  querySegment(
    start: { x: number; y: number },
    end: { x: number; y: number },
    margin: number,
    excluded?: Enemy,
  ): Enemy[];
}

export class EnemySpatialIndex implements EnemySpatialQuery {
  private readonly buckets = new Map<string, Enemy[]>();

  public constructor(private readonly bucketSize: number) {
    if (!Number.isFinite(bucketSize) || bucketSize <= 0) {
      throw new Error('[EnemySpatialIndex] bucketSize must be a finite number > 0');
    }
  }

  public reset(): void {
    this.buckets.clear();
  }

  public build(enemies: readonly Enemy[]): void {
    this.reset();
    for (const enemy of enemies) {
      if (enemy.isDead()) continue;
      const key = this.keyFor(enemy.x, enemy.y);
      const bucket = this.buckets.get(key) ?? [];
      bucket.push(enemy);
      this.buckets.set(key, bucket);
    }
  }

  public query(enemy: Enemy, maxResults: number): Enemy[] {
    return this.queryAt({ x: enemy.x, y: enemy.y }, maxResults, enemy);
  }

  public queryAt(point: { x: number; y: number }, maxResults: number, excluded?: Enemy): Enemy[] {
    const limit = Math.floor(maxResults);
    if (limit <= 0) return [];

    const centerX = Math.floor(point.x / this.bucketSize);
    const centerY = Math.floor(point.y / this.bucketSize);
    const candidates: EnemyCandidate[] = [];
    for (let y = centerY - 1; y <= centerY + 1; y++) {
      for (let x = centerX - 1; x <= centerX + 1; x++) {
        for (const other of this.buckets.get(`${x},${y}`) ?? []) {
          if (other === excluded || other.isDead()) continue;
          const dx = point.x - other.x;
          const dy = point.y - other.y;
          this.insertNearest(candidates, {
            enemy: other,
            distanceSquared: dx * dx + dy * dy,
          }, limit);
        }
      }
    }

    return candidates.map((candidate) => candidate.enemy);
  }

  public queryCircle(point: { x: number; y: number }, radius: number, excluded?: Enemy): Enemy[] {
    const safeRadius = Math.max(0, Number.isFinite(radius) ? radius : 0);
    const radiusSquared = safeRadius * safeRadius;
    const candidates: Enemy[] = [];
    this.forEachInBounds(
      point.x - safeRadius,
      point.y - safeRadius,
      point.x + safeRadius,
      point.y + safeRadius,
      (enemy) => {
        if (enemy === excluded || enemy.isDead()) return;
        const dx = enemy.x - point.x;
        const dy = enemy.y - point.y;
        if (dx * dx + dy * dy <= radiusSquared) candidates.push(enemy);
      },
    );
    return candidates;
  }

  /** Returns broad-phase candidates in an expanded segment AABB. */
  public querySegment(
    start: { x: number; y: number },
    end: { x: number; y: number },
    margin: number,
    excluded?: Enemy,
  ): Enemy[] {
    const safeMargin = Math.max(0, Number.isFinite(margin) ? margin : 0);
    const candidates: Enemy[] = [];
    this.forEachInBounds(
      Math.min(start.x, end.x) - safeMargin,
      Math.min(start.y, end.y) - safeMargin,
      Math.max(start.x, end.x) + safeMargin,
      Math.max(start.y, end.y) + safeMargin,
      (enemy) => {
        if (enemy !== excluded && !enemy.isDead()) candidates.push(enemy);
      },
    );
    return candidates;
  }

  private insertNearest(
    candidates: EnemyCandidate[],
    candidate: EnemyCandidate,
    limit: number,
  ): void {
    let index = 0;
    while (index < candidates.length && candidates[index].distanceSquared <= candidate.distanceSquared) index++;
    if (index >= limit) return;
    candidates.splice(index, 0, candidate);
    if (candidates.length > limit) candidates.pop();
  }

  private keyFor(x: number, y: number): string {
    return `${Math.floor(x / this.bucketSize)},${Math.floor(y / this.bucketSize)}`;
  }

  private forEachInBounds(
    left: number,
    top: number,
    right: number,
    bottom: number,
    visit: (enemy: Enemy) => void,
  ): void {
    const minX = Math.floor(left / this.bucketSize);
    const minY = Math.floor(top / this.bucketSize);
    const maxX = Math.floor(right / this.bucketSize);
    const maxY = Math.floor(bottom / this.bucketSize);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        for (const enemy of this.buckets.get(`${x},${y}`) ?? []) visit(enemy);
      }
    }
  }
}
