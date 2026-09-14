import type { Enemy } from '../entities/Enemy';

interface EnemyCandidate {
  enemy: Enemy;
  distanceSquared: number;
}

export class EnemySpatialIndex {
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
}
