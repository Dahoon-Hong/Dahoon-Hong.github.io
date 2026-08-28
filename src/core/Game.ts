import { InputManager } from './InputManager';
import { Vehicle } from '../entities/Vehicle';
import { WaveManager } from './WaveManager';
import { Enemy } from '../entities/Enemy';
import { Projectile, VisualEffect } from '../entities/Projectile';
import { ResourcePickup } from '../entities/ResourcePickup';
import {
  GathererModule,
  ProductionModule,
  RailModule,
  compareProductionPriority,
} from '../entities/Module';
import { ResourceStorage, ResourceType } from './ResourceStorage';
import { HUDManager } from '../ui/HUDManager';

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
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private state: GameState = GameState.PLAYING;
  private input: InputManager;
  private vehicle: Vehicle;
  private waveManager: WaveManager;
  private hud: HUDManager;

  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private effects: VisualEffect[] = [];
  private pickups: ResourcePickup[] = [];

  private resources = new ResourceStorage({ resource: 50 });
  private lastTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    this.input = new InputManager();
    this.vehicle = new Vehicle(canvas.width / 2, canvas.height / 2);
    this.waveManager = new WaveManager(3);
    this.hud = new HUDManager();
    this.pickups = this.createInitialPickups();

    this.hud.setupMouseListeners(
      this.canvas,
      () => this.vehicle,
      () => this.resources.get('resource'),
      (amount) => this.spendResources(amount)
    );

    // Click to restart on Game Over
    this.canvas.addEventListener('click', (e) => {
      if (this.state === GameState.GAME_OVER || this.state === GameState.VICTORY) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        
        // Restart button box
        if (
          mouseX >= this.canvas.width / 2 - 100 &&
          mouseX <= this.canvas.width / 2 + 100 &&
          mouseY >= this.canvas.height / 2 + 30 &&
          mouseY <= this.canvas.height / 2 + 80
        ) {
          this.restartGame();
        }
      }
    });
  }

  public start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  private restartGame(): void {
    this.vehicle = new Vehicle(this.canvas.width / 2, this.canvas.height / 2);
    this.waveManager = new WaveManager(3);
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.pickups = this.createInitialPickups();
    this.resources.reset();
    this.state = GameState.PLAYING;
    this.hud.resetSelection();
  }

  private spendResources(amount: number): boolean {
    return this.resources.spend('resource', amount);
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

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private update(dt: number): void {
    // Check Pause Request
    if (this.input.consumePauseRequest()) {
      if (this.state === GameState.PLAYING) this.state = GameState.PAUSED;
      else if (this.state === GameState.PAUSED) this.state = GameState.PLAYING;
    }

    if (this.state === GameState.GAME_OVER || this.state === GameState.VICTORY) {
      return;
    }

    const isPaused = this.state === GameState.PAUSED;

    // 1. Update Vehicle Movement (Only when Playing)
    if (!isPaused) {
      const moveInput = this.input.getMovementVector();
      this.vehicle.update(dt, moveInput, { width: this.canvas.width, height: this.canvas.height });
    }

    // 2. Update Installed Modules
    for (let gy = 0; gy < this.vehicle.gridRows; gy++) {
      for (let gx = 0; gx < this.vehicle.gridCols; gx++) {
        const mod = this.vehicle.modules[gy][gx];
        if (mod) {
          const modPos = this.vehicle.getModuleWorldPos(gx, gy);
          mod.update(
            isPaused ? 0 : dt,
            modPos,
            this.enemies,
            (proj) => this.projectiles.push(proj),
            (type: ResourceType, amount: number) => this.resources.add(type, amount),
            (type: ResourceType, amount: number) => this.resources.spend(type, amount)
          );

          if (!isPaused && mod instanceof GathererModule) {
            mod.collect(modPos, this.pickups, (amount) => this.resources.tryAdd('resource', amount));
          }
        }
      }
    }

    if (!isPaused) {
      this.collectAdjacentProductionOutputs();

      for (let gy = 0; gy < this.vehicle.gridRows; gy++) {
        for (let gx = 0; gx < this.vehicle.gridCols; gx++) {
          const mod = this.vehicle.modules[gy][gx];
          if (mod instanceof RailModule) {
            mod.transfer(dt, this.vehicle.modules, (type, amount) => this.resources.add(type, amount));
          }
        }
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (this.pickups[i].isEmpty()) this.pickups.splice(i, 1);
    }

    if (!isPaused) {
      // 3. Update Wave & Enemy Spawning
      this.waveManager.update(
        dt,
        this.enemies,
        this.canvas.width,
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

      // 4. Update Enemies & AI Movement
      const corePos = { x: this.vehicle.x, y: this.vehicle.y };
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        enemy.update(dt, corePos);

        // Check Enemy ↔ Core Collision
        const distToCore = Math.hypot(enemy.x - corePos.x, enemy.y - corePos.y);
        if (distToCore < enemy.radius + 20) {
          // Route impact damage through the vehicle's armor before the core.
          this.vehicle.takeDamage(10, 0, {
            x: enemy.x - corePos.x,
            y: enemy.y - corePos.y,
          });
          this.effects.push(new VisualEffect(enemy.x, enemy.y, 25, '#ff1744'));
          enemy.takeDamage(999); // Destroy enemy on hit

          if (!this.vehicle.coreModule.isActive()) {
            this.state = GameState.GAME_OVER;
          }
        }

        if (enemy.isDead()) {
          this.pickups.push(new ResourcePickup(enemy.x, enemy.y, enemy.reward));
          this.enemies.splice(i, 1);
        }
      }

      // 5. Update Projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const proj = this.projectiles[i];
        proj.update(dt, this.enemies, (e) => this.effects.push(e));
        if (proj.isDead()) {
          this.projectiles.splice(i, 1);
        }
      }

      // 6. Update Visual Effects
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const effect = this.effects[i];
        effect.update(dt);
        if (effect.dead) {
          this.effects.splice(i, 1);
        }
      }
    }
  }

  private collectAdjacentProductionOutputs(): void {
    const core = this.vehicle.getCoreGridPosition();
    const sources: ProductionModule[] = [];

    for (let gy = 0; gy < this.vehicle.gridRows; gy++) {
      for (let gx = 0; gx < this.vehicle.gridCols; gx++) {
        const module = this.vehicle.modules[gy][gx];
        if (
          module instanceof ProductionModule &&
          Math.max(Math.abs(gx - core.gx), Math.abs(gy - core.gy)) <= 1
        ) {
          sources.push(module);
        }
      }
    }

    sources.sort(compareProductionPriority);
    for (const source of sources) {
      const amount = source.getOutputAmount();
      if (amount <= 0) continue;

      const moved = this.resources.add(source.outputType, amount);
      if (moved > 0) source.takeOutput(moved);
    }
  }

  private render(): void {
    // Clear Screen
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Background Grid
    this.ctx.strokeStyle = '#1d1d28';
    this.ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < this.canvas.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }

    // Render Enemies
    for (const enemy of this.enemies) {
      enemy.render(this.ctx);
    }

    // Render Resource Pickups
    for (const pickup of this.pickups) {
      pickup.render(this.ctx);
    }

    // Render Vehicle & Modules
    this.vehicle.render(this.ctx);

    // Render Projectiles
    for (const proj of this.projectiles) {
      proj.render(this.ctx);
    }

    // Render Visual Effects
    for (const effect of this.effects) {
      effect.render(this.ctx);
    }

    // Render HUD UI
    const liveEnemyCount = this.enemies.reduce(
      (count, enemy) => count + (enemy.isDead() ? 0 : 1),
      0
    );
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

    // Result Overlay
    if (this.state === GameState.GAME_OVER || this.state === GameState.VICTORY) {
      const isVictory = this.state === GameState.VICTORY;
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.fillStyle = isVictory ? '#00e676' : '#ff1744';
      this.ctx.font = 'bold 42px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        isVictory ? 'REGION CLEARED - VICTORY' : 'CORE DESTROYED - GAME OVER',
        this.canvas.width / 2,
        this.canvas.height / 2 - 20
      );

      // Restart Button
      const btnX = this.canvas.width / 2 - 100;
      const btnY = this.canvas.height / 2 + 30;
      this.ctx.fillStyle = '#00e676';
      this.ctx.fillRect(btnX, btnY, 200, 50);
      this.ctx.fillStyle = '#000000';
      this.ctx.font = 'bold 20px sans-serif';
      this.ctx.fillText('RESTART', this.canvas.width / 2, btnY + 32);
      this.ctx.restore();
    }
  }
}
