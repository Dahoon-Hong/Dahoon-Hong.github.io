import { Enemy, EnemyDefinition, EnemyType, StandardEnemy, TankerEnemy } from '../entities/Enemy';
import { RegionDefinition } from './ProgressionManager';
import type { TerrainCell, TerrainGrid } from './TerrainGrid';

export interface WaveSpawnContext {
  terrain: TerrainGrid;
  spawnCells: readonly TerrainCell[];
}

export class WaveManager {
  public readonly totalWaves: number;
  public currentWave = 1;
  public totalWaveEnemies = 0;
  public spawnedEnemiesCount = 0;
  public waveCleared = false;

  private readonly region: RegionDefinition;
  private readonly enemyDefinitions: Readonly<Record<EnemyType, EnemyDefinition>>;
  private spawnTimer = 0;
  private spawnInterval = 1.2;
  private spawnQueue: EnemyType[] = [];
  private readonly spawnContext: WaveSpawnContext;

  constructor(
    region: RegionDefinition,
    enemyDefinitions: Readonly<Record<EnemyType, EnemyDefinition>>,
    spawnContext: WaveSpawnContext,
  ) {
    this.region = region;
    this.enemyDefinitions = enemyDefinitions;
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
      this.spawnEnemy(enemies);
      this.spawnedEnemiesCount++;
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
    this.spawnInterval = Math.max(
      this.region.minimumSpawnInterval,
      this.region.spawnInterval + (this.currentWave - 1) * this.region.spawnIntervalStep
    );
    this.spawnQueue = [
      ...Array<EnemyType>(wave.standard).fill('standard'),
      ...Array<EnemyType>(wave.tanker).fill('tanker'),
    ];
    this.waveCleared = false;
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
