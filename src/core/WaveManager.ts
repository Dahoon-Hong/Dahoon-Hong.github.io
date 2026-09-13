import { Enemy, EnemyDefinition, EnemyType, StandardEnemy, TankerEnemy } from '../entities/Enemy';
import type { RegionDefinition } from './ProgressionManager';
import type { TerrainCell, TerrainGrid } from './TerrainGrid';

export interface WaveSpawnContext {
  terrain: TerrainGrid;
  spawnCells: readonly TerrainCell[];
}

export function calculateEnemySpawnCount(
  baseSpawn: number,
  definition: Pick<EnemyDefinition, 'spawnWeight' | 'spawnBatchSize'>,
): number {
  if (!Number.isFinite(baseSpawn) || baseSpawn <= 0 || !Number.isFinite(definition.spawnWeight)) return 0;
  if (definition.spawnWeight <= 0 || !Number.isFinite(definition.spawnBatchSize) || definition.spawnBatchSize < 1) {
    return 0;
  }

  const weightedSpawn = baseSpawn * definition.spawnWeight;
  if (!Number.isFinite(weightedSpawn) || weightedSpawn <= 0) return 0;

  return Math.min(definition.spawnBatchSize, Math.max(1, Math.round(weightedSpawn)));
}

export class WaveManager {
  public readonly totalWaves: number;
  public currentWave = 1;
  public targetKills = 0;
  public killedEnemiesCount = 0;
  public spawnedEnemiesCount = 0;
  public waveCleared = false;
  public lastSpawnBatchSize = 0;
  public lastSpawnTypes: EnemyType[] = [];
  public lastSpawnAt: number | null = null;

  private readonly region: RegionDefinition;
  private readonly enemyDefinitions: Readonly<Record<EnemyType, EnemyDefinition>>;
  private readonly baseEnemySpawn: number;
  private readonly spawnContext: WaveSpawnContext;
  private readonly spawnTimers: Record<EnemyType, number> = { standard: 0, tanker: 0 };
  private readonly activeWaveEnemies = new Set<Enemy>();
  private elapsedTime = 0;

  constructor(
    region: RegionDefinition,
    enemyDefinitions: Readonly<Record<EnemyType, EnemyDefinition>>,
    baseEnemySpawn: number,
    spawnContext: WaveSpawnContext,
  ) {
    this.region = region;
    this.enemyDefinitions = enemyDefinitions;
    this.baseEnemySpawn = baseEnemySpawn;
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
    const elapsed = Math.max(0, dt);
    this.elapsedTime += elapsed;
    this.collectKilledEnemies();

    if (this.killedEnemiesCount >= this.targetKills) {
      this.waveCleared = true;
      return;
    }

    const spawnedTypes: EnemyType[] = [];
    for (const type of ['standard', 'tanker'] as const) {
      const definition = this.enemyDefinitions[type];
      this.spawnTimers[type] += elapsed;
      if (this.spawnTimers[type] < definition.spawnInterval) continue;

      this.spawnTimers[type] -= definition.spawnInterval;
      spawnedTypes.push(...this.spawnBatch(type, enemies));
    }

    if (spawnedTypes.length > 0) {
      this.lastSpawnBatchSize = spawnedTypes.length;
      this.lastSpawnTypes = spawnedTypes;
      this.lastSpawnAt = this.elapsedTime;
    }
  }

  public nextWave(): void {
    if (this.currentWave >= this.totalWaves) return;
    this.currentWave++;
    this.prepareWave();
  }

  private prepareWave(): void {
    const wave = this.region.waves[this.currentWave - 1];
    this.targetKills = wave.targetKills;
    this.killedEnemiesCount = 0;
    this.spawnedEnemiesCount = 0;
    this.spawnTimers.standard = 0;
    this.spawnTimers.tanker = 0;
    this.activeWaveEnemies.clear();
    this.elapsedTime = 0;
    this.lastSpawnBatchSize = 0;
    this.lastSpawnTypes = [];
    this.lastSpawnAt = null;
    this.waveCleared = false;
  }

  private collectKilledEnemies(): void {
    for (const enemy of this.activeWaveEnemies) {
      if (!enemy.isDead()) continue;
      this.activeWaveEnemies.delete(enemy);
      this.killedEnemiesCount++;
    }
  }

  private spawnBatch(type: EnemyType, enemies: Enemy[]): EnemyType[] {
    const spawnCount = calculateEnemySpawnCount(this.baseEnemySpawn, this.enemyDefinitions[type]);
    const spawnedTypes: EnemyType[] = [];
    for (let count = 0; count < spawnCount; count++) {
      this.spawnEnemy(type, enemies);
      this.spawnedEnemiesCount++;
      spawnedTypes.push(type);
    }
    return spawnedTypes;
  }

  private spawnEnemy(type: EnemyType, enemies: Enemy[]): void {
    const spawnCell = this.spawnContext.spawnCells[this.spawnedEnemiesCount % this.spawnContext.spawnCells.length];
    const spawnPoint = this.spawnContext.terrain.cellToWorldCenter(spawnCell);
    const repathOffset = (this.spawnedEnemiesCount % 4) * 0.06;
    const enemy = type === 'tanker'
      ? new TankerEnemy(spawnPoint.x, spawnPoint.y, this.enemyDefinitions.tanker, repathOffset)
      : new StandardEnemy(spawnPoint.x, spawnPoint.y, this.enemyDefinitions.standard, repathOffset);
    enemies.push(enemy);
    this.activeWaveEnemies.add(enemy);
  }
}
