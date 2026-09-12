import { Enemy, EnemyDefinition, EnemyType, StandardEnemy, TankerEnemy } from '../entities/Enemy';
import type { EnemySpawnPolicy, RegionDefinition } from './ProgressionManager';
import type { TerrainCell, TerrainGrid } from './TerrainGrid';

export interface WaveSpawnContext {
  terrain: TerrainGrid;
  spawnCells: readonly TerrainCell[];
}

export interface SpawnScaling {
  threatLevel: number;
  batchSize: number;
  spawnInterval: number;
}

function finiteOrLimit(value: number): number {
  if (Number.isFinite(value)) return value;
  if (value === Number.POSITIVE_INFINITY) return Number.MAX_VALUE;
  if (value === Number.NEGATIVE_INFINITY) return -Number.MAX_VALUE;
  return 0;
}

function safeAdd(left: number, right: number): number {
  return finiteOrLimit(left + right);
}

function safeMultiply(left: number, right: number): number {
  return finiteOrLimit(left * right);
}

export function calculateSpawnScaling(
  currentWave: number,
  region: Pick<RegionDefinition, 'spawnInterval' | 'spawnIntervalStep' | 'minimumSpawnInterval'>,
  spawn: Readonly<EnemySpawnPolicy>,
): SpawnScaling {
  const threatLevel = Number.isFinite(currentWave) ? Math.max(0, currentWave - 1) : 0;
  const regionInterval = Math.max(
    region.minimumSpawnInterval,
    safeAdd(region.spawnInterval, safeMultiply(threatLevel, region.spawnIntervalStep)),
  );
  const spawnInterval = Math.max(
    spawn.minimumInterval,
    safeMultiply(
      safeAdd(regionInterval, safeMultiply(threatLevel, spawn.intervalStep)),
      spawn.intervalMultiplier,
    ),
  );
  const batchSize = Math.min(
    spawn.maxBatchSize,
    Math.max(1, Math.floor(safeAdd(spawn.baseBatchSize, safeMultiply(threatLevel, spawn.batchSizePerThreat)))),
  );
  return { threatLevel, batchSize, spawnInterval };
}

export class WaveManager {
  public readonly totalWaves: number;
  public currentWave = 1;
  public totalWaveEnemies = 0;
  public spawnedEnemiesCount = 0;
  public waveCleared = false;

  private readonly region: RegionDefinition;
  private readonly enemyDefinitions: Readonly<Record<EnemyType, EnemyDefinition>>;
  private readonly enemySpawnPolicy: Readonly<EnemySpawnPolicy>;
  private spawnTimer = 0;
  private spawnInterval = 1.2;
  private batchSize = 1;
  private spawnQueue: EnemyType[] = [];
  private readonly spawnContext: WaveSpawnContext;

  constructor(
    region: RegionDefinition,
    enemyDefinitions: Readonly<Record<EnemyType, EnemyDefinition>>,
    enemySpawnPolicy: Readonly<EnemySpawnPolicy>,
    spawnContext: WaveSpawnContext,
  ) {
    this.region = region;
    this.enemyDefinitions = enemyDefinitions;
    this.enemySpawnPolicy = enemySpawnPolicy;
    this.spawnContext = spawnContext;
    this.totalWaves = region.waves.length;
    this.prepareWave();
  }

  public update(
    dt: number,
    enemies: Enemy[],
    _canvasWidth: number,
    _canvasHeight: number,
    _vehiclePos: { x: number; y: number }
  ): void {
    if (this.spawnedEnemiesCount >= this.totalWaveEnemies) {
      if (enemies.length === 0) this.waveCleared = true;
      return;
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer -= this.spawnInterval;
      this.spawnBatch(enemies);
    }
  }

  public nextWave(): void {
    if (this.currentWave >= this.totalWaves) return;
    this.currentWave++;
    this.prepareWave();
  }

  private prepareWave(): void {
    const wave = this.region.waves[this.currentWave - 1];
    this.totalWaveEnemies = wave.standard + wave.tanker;
    this.spawnedEnemiesCount = 0;
    this.spawnTimer = 0;
    const scaling = calculateSpawnScaling(this.currentWave, this.region, this.enemySpawnPolicy);
    this.spawnInterval = scaling.spawnInterval;
    this.batchSize = scaling.batchSize;
    this.spawnQueue = [
      ...Array<EnemyType>(wave.standard).fill('standard'),
      ...Array<EnemyType>(wave.tanker).fill('tanker'),
    ];
    this.waveCleared = false;
  }

  private spawnBatch(enemies: Enemy[]): void {
    const remainingEnemies = this.totalWaveEnemies - this.spawnedEnemiesCount;
    const spawnCount = Math.min(this.batchSize, remainingEnemies);
    for (let count = 0; count < spawnCount; count++) {
      this.spawnEnemy(enemies);
      this.spawnedEnemiesCount++;
    }
  }

  private spawnEnemy(enemies: Enemy[]): void {
    const type = this.spawnQueue[this.spawnedEnemiesCount] ?? 'standard';
    const spawnCell = this.spawnContext.spawnCells[this.spawnedEnemiesCount % this.spawnContext.spawnCells.length];
    const spawnPoint = this.spawnContext.terrain.cellToWorldCenter(spawnCell);
    const repathOffset = (this.spawnedEnemiesCount % 4) * 0.06;
    if (type === 'tanker') enemies.push(new TankerEnemy(spawnPoint.x, spawnPoint.y, this.enemyDefinitions.tanker, repathOffset));
    else enemies.push(new StandardEnemy(spawnPoint.x, spawnPoint.y, this.enemyDefinitions.standard, repathOffset));
  }

}
