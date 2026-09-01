import { Enemy, EnemyDefinition, EnemyType, StandardEnemy, TankerEnemy } from '../entities/Enemy';
import { RegionDefinition } from './ProgressionManager';

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

  constructor(
    region: RegionDefinition,
    enemyDefinitions: Readonly<Record<EnemyType, EnemyDefinition>>
  ) {
    this.region = region;
    this.enemyDefinitions = enemyDefinitions;
    this.totalWaves = region.waves.length;
    this.prepareWave();
  }

  public update(
    dt: number,
    enemies: Enemy[],
    canvasWidth: number,
    canvasHeight: number,
    _vehiclePos: { x: number; y: number }
  ): void {
    if (this.spawnedEnemiesCount >= this.totalWaveEnemies) {
      if (enemies.length === 0) this.waveCleared = true;
      return;
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer -= this.spawnInterval;
      this.spawnEnemy(enemies, canvasWidth, canvasHeight);
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

  private spawnEnemy(enemies: Enemy[], width: number, height: number): void {
    let x = 0;
    let y = 0;
    const side = Math.floor(Math.random() * 4);
    const margin = 40;

    switch (side) {
      case 0:
        x = Math.random() * width;
        y = -margin;
        break;
      case 1:
        x = width + margin;
        y = Math.random() * height;
        break;
      case 2:
        x = Math.random() * width;
        y = height + margin;
        break;
      case 3:
        x = -margin;
        y = Math.random() * height;
        break;
    }

    const type = this.spawnQueue[this.spawnedEnemiesCount] ?? 'standard';
    if (type === 'tanker') enemies.push(new TankerEnemy(x, y, this.enemyDefinitions.tanker));
    else enemies.push(new StandardEnemy(x, y, this.enemyDefinitions.standard));
  }
}
