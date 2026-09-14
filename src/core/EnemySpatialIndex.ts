import type { Enemy } from '../entities/Enemy';

interface EnemyCandidate {
  enemy: Enemy;
  distance: number;
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
    if (maxResults <= 0) return [];

    const centerX = Math.floor(point.x / this.bucketSize);
    const centerY = Math.floor(point.y / this.bucketSize);
    const candidates: EnemyCandidate[] = [];
    for (let y = centerY - 1; y <= centerY + 1; y++) {
      for (let x = centerX - 1; x <= centerX + 1; x++) {
        for (const other of this.buckets.get(`${x},${y}`) ?? []) {
          if (other === excluded || other.isDead()) continue;
          candidates.push({
            enemy: other,
            distance: Math.hypot(point.x - other.x, point.y - other.y),
          });
        }
      }
    }

    candidates.sort((first, second) => first.distance - second.distance);
    return candidates.slice(0, maxResults).map((candidate) => candidate.enemy);
  }

  private keyFor(x: number, y: number): string {
    return `${Math.floor(x / this.bucketSize)},${Math.floor(y / this.bucketSize)}`;
  }
}
