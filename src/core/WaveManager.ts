import { Enemy, StandardEnemy, TankerEnemy } from '../entities/Enemy';

export class WaveManager {
  public currentWave: number = 1;
  public totalWaveEnemies: number = 12;
  public spawnedEnemiesCount: number = 0;
  private spawnTimer: number = 0;
  private spawnInterval: number = 1.2;
  public waveCleared: boolean = false;

  public update(
    dt: number,
    enemies: Enemy[],
    canvasWidth: number,
    canvasHeight: number,
    _vehiclePos: { x: number; y: number }
  ): void {
    if (this.spawnedEnemiesCount >= this.totalWaveEnemies) {
      if (enemies.length === 0) {
        this.waveCleared = true;
      }
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
    this.currentWave++;
    this.spawnedEnemiesCount = 0;
    this.totalWaveEnemies = Math.floor(12 * Math.pow(1.3, this.currentWave - 1));
    this.spawnInterval = Math.max(0.3, 1.2 - (this.currentWave - 1) * 0.1);
    this.waveCleared = false;
  }

  private spawnEnemy(enemies: Enemy[], width: number, height: number): void {
    // Random position along screen perimeter
    let x = 0;
    let y = 0;
    const side = Math.floor(Math.random() * 4);
    const margin = 40;

    switch (side) {
      case 0: // Top
        x = Math.random() * width;
        y = -margin;
        break;
      case 1: // Right
        x = width + margin;
        y = Math.random() * height;
        break;
      case 2: // Bottom
        x = Math.random() * width;
        y = height + margin;
        break;
      case 3: // Left
        x = -margin;
        y = Math.random() * height;
        break;
    }

    // 25% chance of Tanker enemy after wave 2
    if (this.currentWave >= 2 && Math.random() < 0.3) {
      enemies.push(new TankerEnemy(x, y));
    } else {
      enemies.push(new StandardEnemy(x, y));
    }
  }
}
