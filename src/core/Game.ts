import { HUDManager } from '../ui/HUDManager';
import { Enemy } from '../entities/Enemy';
import { Projectile, VisualEffect } from '../entities/Projectile';
import { ResourcePickup } from '../entities/ResourcePickup';
import { Vehicle } from '../entities/Vehicle';
import { InputManager } from './InputManager';
import { ResourceStorage } from './ResourceStorage';
import { TankDefinitionLoader, TankDefinition } from './TankDefinitionLoader';
import { UpgradeManager } from './UpgradeManager';
import { WaveManager } from './WaveManager';

export enum GameState {
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
}

const INITIAL_PICKUP_COUNT = 10;
const INITIAL_PICKUP_AMOUNT = 10;
const INITIAL_PICKUP_RADIUS = 70;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: InputManager;
  private readonly hud: HUDManager;
  private readonly tankDefinition: TankDefinition;

  private state: GameState = GameState.PLAYING;
  private vehicle: Vehicle;
  private upgradeManager: UpgradeManager;
  private waveManager: WaveManager;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private effects: VisualEffect[] = [];
  private pickups: ResourcePickup[] = [];
  private readonly resources = new ResourceStorage({ resource: 50 });
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.input = new InputManager();
    this.hud = new HUDManager();
    this.tankDefinition = new TankDefinitionLoader().getDefault();
    this.upgradeManager = new UpgradeManager(this.tankDefinition.modules);
    this.vehicle = this.createVehicle();
    this.waveManager = new WaveManager(3);
    this.pickups = this.createInitialPickups();

    this.hud.setupMouseListeners(this.canvas, {
      getVehicle: () => this.vehicle,
      getStorage: () => this.resources,
      getUpgradeManager: () => this.upgradeManager,
      spendCost: (cost) => this.resources.spendCost(cost),
    });

    this.canvas.addEventListener('click', (event) => this.handleRestartClick(event));
  }

  public start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  private createVehicle(): Vehicle {
    return new Vehicle(this.canvas.width / 2, this.canvas.height / 2, this.tankDefinition, this.upgradeManager);
  }

  private restartGame(): void {
    this.upgradeManager = new UpgradeManager(this.tankDefinition.modules);
    this.vehicle = this.createVehicle();
    this.waveManager = new WaveManager(3);
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.pickups = this.createInitialPickups();
    this.resources.reset();
    this.state = GameState.PLAYING;
    this.hud.resetSelection();
  }

  private createInitialPickups(): ResourcePickup[] {
    return Array.from({ length: INITIAL_PICKUP_COUNT }, (_, index) => {
      const angle = (index / INITIAL_PICKUP_COUNT) * Math.PI * 2;
      return new ResourcePickup(
        this.vehicle.x + Math.cos(angle) * INITIAL_PICKUP_RADIUS,
        this.vehicle.y + Math.sin(angle) * INITIAL_PICKUP_RADIUS,
        INITIAL_PICKUP_AMOUNT
      );
    });
  }

  private gameLoop(time: number): void {
    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.update(dt);
    this.render();
    requestAnimationFrame((nextTime) => this.gameLoop(nextTime));
  }

  private update(dt: number): void {
    if (this.input.consumePauseRequest()) {
      if (this.state === GameState.PLAYING) this.state = GameState.PAUSED;
      else if (this.state === GameState.PAUSED) this.state = GameState.PLAYING;
    }

    if (this.state === GameState.GAME_OVER || this.state === GameState.VICTORY) return;
    const isPaused = this.state === GameState.PAUSED;

    if (!isPaused) {
      this.vehicle.update(dt, this.input.getMovementVector(), {
        width: this.canvas.width - HUDManager.PANEL_WIDTH,
        height: this.canvas.height,
      });
      this.vehicle.systems.update(dt, { x: this.vehicle.x, y: this.vehicle.y }, this.pickups, this.resources);

      for (const module of this.vehicle.getCombatModules()) {
        module.update(
          dt,
          this.vehicle.getModuleWorldCenter(module),
          this.enemies,
          (projectile) => this.projectiles.push(projectile),
          (type, amount) => this.resources.spend(type, amount)
        );
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (this.pickups[i].isEmpty()) this.pickups.splice(i, 1);
    }

    if (isPaused) return;

    this.waveManager.update(
      dt,
      this.enemies,
      this.canvas.width - HUDManager.PANEL_WIDTH,
      this.canvas.height,
      { x: this.vehicle.x, y: this.vehicle.y }
    );

    if (this.waveManager.waveCleared) {
      if (this.waveManager.currentWave >= this.waveManager.totalWaves) {
        this.state = GameState.VICTORY;
        return;
      }
      this.waveManager.nextWave();
    }

    const corePos = { x: this.vehicle.x, y: this.vehicle.y };
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.isDead()) {
        this.pickups.push(new ResourcePickup(enemy.x, enemy.y, enemy.reward));
        this.enemies.splice(i, 1);
        continue;
      }

      enemy.update(dt, corePos);
      const distToCore = Math.hypot(enemy.x - corePos.x, enemy.y - corePos.y);
      if (distToCore < enemy.radius + 20) {
        this.vehicle.takeDamage(10, 0, { x: enemy.x - corePos.x, y: enemy.y - corePos.y });
        this.effects.push(new VisualEffect(enemy.x, enemy.y, 25, '#ff1744'));
        enemy.takeDamage(999);
        if (!this.vehicle.isCoreActive()) this.state = GameState.GAME_OVER;
      }

      if (enemy.isDead()) {
        this.pickups.push(new ResourcePickup(enemy.x, enemy.y, enemy.reward));
        this.enemies.splice(i, 1);
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.update(dt, this.enemies, (effect) => this.effects.push(effect));
      if (projectile.isDead()) this.projectiles.splice(i, 1);
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.update(dt);
      if (effect.dead) this.effects.splice(i, 1);
    }
  }

  private render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.strokeStyle = '#1d1d28';
    this.ctx.lineWidth = 1;
    for (let x = 0; x < this.canvas.width; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }

    for (const enemy of this.enemies) enemy.render(this.ctx);
    for (const pickup of this.pickups) pickup.render(this.ctx);
    this.vehicle.render(this.ctx);
    for (const projectile of this.projectiles) projectile.render(this.ctx);
    for (const effect of this.effects) effect.render(this.ctx);

    const liveEnemyCount = this.enemies.reduce((count, enemy) => count + (enemy.isDead() ? 0 : 1), 0);
    const enemiesRemaining = Math.max(
      0,
      this.waveManager.totalWaveEnemies - this.waveManager.spawnedEnemiesCount + liveEnemyCount
    );
    this.hud.render(
      this.ctx,
      this.canvas.width,
      this.canvas.height,
      this.vehicle,
      this.resources,
      this.waveManager.currentWave,
      enemiesRemaining,
      this.state === GameState.PAUSED
    );

    if (this.state === GameState.GAME_OVER || this.state === GameState.VICTORY) this.renderResultOverlay();
  }

  private renderResultOverlay(): void {
    const isVictory = this.state === GameState.VICTORY;
    const gameplayWidth = this.canvas.width - HUDManager.PANEL_WIDTH;
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.fillRect(0, 0, gameplayWidth, this.canvas.height);
    this.ctx.fillStyle = isVictory ? '#00e676' : '#ff1744';
    this.ctx.font = 'bold 42px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      isVictory ? 'REGION CLEARED - VICTORY' : 'CORE DESTROYED - GAME OVER',
      gameplayWidth / 2,
      this.canvas.height / 2 - 20
    );

    const buttonX = gameplayWidth / 2 - 100;
    const buttonY = this.canvas.height / 2 + 30;
    this.ctx.fillStyle = '#00e676';
    this.ctx.fillRect(buttonX, buttonY, 200, 50);
    this.ctx.fillStyle = '#000000';
    this.ctx.font = 'bold 20px sans-serif';
    this.ctx.fillText('RESTART', gameplayWidth / 2, buttonY + 32);
    this.ctx.restore();
  }

  private handleRestartClick(event: MouseEvent): void {
    if (this.state !== GameState.GAME_OVER && this.state !== GameState.VICTORY) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
    const mouseY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
    const gameplayWidth = this.canvas.width - HUDManager.PANEL_WIDTH;
    if (
      mouseX >= gameplayWidth / 2 - 100 &&
      mouseX <= gameplayWidth / 2 + 100 &&
      mouseY >= this.canvas.height / 2 + 30 &&
      mouseY <= this.canvas.height / 2 + 80
    ) {
      this.restartGame();
    }
  }
}
