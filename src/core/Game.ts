import { HUDManager } from '../ui/HUDManager';
import { Enemy } from '../entities/Enemy';
import { Projectile, VisualEffect } from '../entities/Projectile';
import { ResourcePickup } from '../entities/ResourcePickup';
import { Vehicle } from '../entities/Vehicle';
import { InputManager } from './InputManager';
import { ProgressionManager } from './ProgressionManager';
import { ResourceStorage } from './ResourceStorage';
import { TankDefinitionLoader, TankDefinition } from './TankDefinitionLoader';
import { UpgradeManager } from './UpgradeManager';
import { WaveManager } from './WaveManager';
import mapData from '../data/maps.json';
import { AssetManager } from './AssetManager';
import { RenderContext } from '../rendering/RenderContext';
import { SpriteRenderer } from '../rendering/SpriteRenderer';
import { VisualTheme } from '../rendering/VisualTheme';

export enum GameState {
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  REGION_CLEARED = 'REGION_CLEARED',
  PLANET_CLEARED = 'PLANET_CLEARED',
  VICTORY = 'VICTORY',
}

const INITIAL_PICKUP_COUNT = 10;
const INITIAL_PICKUP_AMOUNT = 10;
const INITIAL_PICKUP_RADIUS = 70;
const MAP_TILE_POSITIONS = [[128, 112], [760, 132], [154, 526], [716, 570]] as const;
const MAP_PROP_POSITIONS = [[78, 174], [846, 176], [96, 626], [824, 614]] as const;
type MapDefinition = (typeof mapData.maps)[number];

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets: AssetManager;
  private readonly renderer: SpriteRenderer;
  private readonly renderContext: RenderContext;
  private readonly input: InputManager;
  private readonly hud: HUDManager;
  private readonly tankDefinition: TankDefinition;
  private readonly progression = new ProgressionManager();

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
    this.ctx.imageSmoothingEnabled = false;
    this.assets = new AssetManager();
    this.renderer = new SpriteRenderer(this.assets);
    this.renderContext = {
      ctx: this.ctx,
      renderer: this.renderer,
      time: 0,
      reducedMotion: typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    void this.assets.preload().then((report) => {
      if (report.failed.length || report.missing.length || this.assets.getValidationErrors().length) {
        console.warn('[Game] art preload completed with fallback assets', report, this.assets.getValidationErrors());
      }
    });
    this.input = new InputManager();
    this.hud = new HUDManager();
    this.tankDefinition = new TankDefinitionLoader().getDefault();
    this.upgradeManager = new UpgradeManager(this.tankDefinition.modules);
    this.vehicle = this.createVehicle();
    this.waveManager = this.createWaveManager();
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

  private createWaveManager(): WaveManager {
    return new WaveManager(this.progression.currentRegion, this.progression.enemyDefinitions);
  }

  private restartGame(): void {
    this.upgradeManager = new UpgradeManager(this.tankDefinition.modules);
    this.vehicle = this.createVehicle();
    this.waveManager = this.createWaveManager();
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.pickups = this.createInitialPickups();
    this.resources.reset();
    this.state = GameState.PLAYING;
    this.hud.resetSelection();
  }

  private advanceProgression(): void {
    const transition = this.progression.advance();
    if (transition === 'complete') {
      this.state = GameState.VICTORY;
      return;
    }

    if (transition === 'planet') {
      this.upgradeManager = new UpgradeManager(this.tankDefinition.modules);
      this.vehicle = this.createVehicle();
      this.resources.reset();
    } else {
      this.vehicle.resetRuntime();
    }

    this.waveManager = this.createWaveManager();
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.pickups = this.createInitialPickups();
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

    if (this.isTerminalState()) return;
    const isPaused = this.state === GameState.PAUSED;

    if (!isPaused) {
      this.renderContext.time += dt;
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
        if (this.progression.hasNextRegion()) this.state = GameState.REGION_CLEARED;
        else if (this.progression.hasNextPlanet()) this.state = GameState.PLANET_CLEARED;
        else this.state = GameState.VICTORY;
        return;
      }
      this.waveManager.nextWave();
    }

    const corePos = { x: this.vehicle.x, y: this.vehicle.y };
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const previousPos = { x: enemy.x, y: enemy.y };
      if (enemy.isDead()) {
        this.pickups.push(new ResourcePickup(enemy.x, enemy.y, enemy.reward));
        this.enemies.splice(i, 1);
        continue;
      }

      enemy.update(dt, corePos);
      if (this.resolveEnemyAgainstGrid(enemy, this.vehicle.getGridBounds(), previousPos) && enemy.tryContactDamage()) {
        this.vehicle.takeDamage(enemy.contactDamage, 0, { x: enemy.x - corePos.x, y: enemy.y - corePos.y });
        this.effects.push(new VisualEffect(enemy.x, enemy.y, 25, '#ff1744', 'effect.contact-damage'));
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
    const gameplayWidth = this.canvas.width - HUDManager.PANEL_WIDTH;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, 0, gameplayWidth, this.canvas.height);
    this.ctx.clip();
    this.renderMap();
    this.vehicle.render(this.renderContext);
    for (const enemy of this.enemies) enemy.render(this.renderContext);
    for (const pickup of this.pickups) pickup.render(this.renderContext);
    for (const projectile of this.projectiles) projectile.render(this.renderContext);
    for (const effect of this.effects) effect.render(this.renderContext);
    this.ctx.restore();

    const liveEnemyCount = this.enemies.reduce((count, enemy) => count + (enemy.isDead() ? 0 : 1), 0);
    const enemiesRemaining = Math.max(
      0,
      this.waveManager.totalWaveEnemies - this.waveManager.spawnedEnemiesCount + liveEnemyCount
    );
    this.hud.render(
      this.renderContext,
      this.canvas.width,
      this.canvas.height,
      this.vehicle,
      this.resources,
      this.waveManager.currentWave,
      enemiesRemaining,
      this.state === GameState.PAUSED
    );

    if (this.isTerminalState()) this.renderResultOverlay();
  }

  private renderMap(): void {
    const map = this.getCurrentMap();
    this.renderer.drawSprite(this.renderContext, map?.backgroundAsset ?? 'map.common.field-base', 0, 0);
    if (!map) return;

    const tileAsset = map.tileAssets[0];
    if (tileAsset) {
      for (const [x, y] of MAP_TILE_POSITIONS) {
        this.renderer.drawSprite(this.renderContext, tileAsset, x, y, { alpha: 0.42 });
      }
    }

    const propAsset = map.propAssets[0];
    if (propAsset) {
      for (const [x, y] of MAP_PROP_POSITIONS) {
        this.renderer.drawSprite(this.renderContext, propAsset, x, y, { alpha: 0.72 });
      }
    }

    this.renderer.drawSprite(this.renderContext, map.spawnEdgeAsset, 0, 0, { alpha: 0.65 });
  }

  private getCurrentMap(): MapDefinition | null {
    const planetId = this.progression.currentPlanet.id;
    const regionId = this.progression.currentRegion.id;
    return mapData.maps.find((map) => map.planetId === planetId && map.regionId === regionId) ?? null;
  }

  private renderResultOverlay(): void {
    const isGameOver = this.state === GameState.GAME_OVER;
    const isRegionCleared = this.state === GameState.REGION_CLEARED;
    const isPlanetCleared = this.state === GameState.PLANET_CLEARED;
    const gameplayWidth = this.canvas.width - HUDManager.PANEL_WIDTH;
    const location = this.progression.location;
    const title = isGameOver
      ? 'CORE DESTROYED - GAME OVER'
      : isRegionCleared
        ? 'REGION CLEARED'
        : isPlanetCleared
          ? 'PLANET CLEARED'
          : 'CAMPAIGN COMPLETE';
    const buttonLabel = isRegionCleared
      ? 'NEXT REGION'
      : isPlanetCleared && this.progression.hasNextPlanet()
        ? 'NEXT PLANET'
        : 'RESTART REGION';
    this.ctx.save();
    this.ctx.fillStyle = VisualTheme.color.overlay;
    this.ctx.fillRect(0, 0, gameplayWidth, this.canvas.height);
    const statusColor = isGameOver ? VisualTheme.color.danger : VisualTheme.color.success;
    const panelWidth = 460;
    const panelHeight = 220;
    const panelX = gameplayWidth / 2 - panelWidth / 2;
    const panelY = this.canvas.height / 2 - 110;
    this.ctx.fillStyle = VisualTheme.color.surfacePanel;
    this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    this.ctx.strokeStyle = statusColor;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    this.renderResultMarker(gameplayWidth / 2, this.canvas.height / 2 - 62, statusColor, isGameOver);
    this.ctx.fillStyle = statusColor;
    this.ctx.font = 'bold 34px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      title,
      gameplayWidth / 2,
      this.canvas.height / 2 - 20
    );
    this.ctx.fillStyle = VisualTheme.color.textPrimary;
    this.ctx.font = '16px sans-serif';
    this.ctx.fillText(`${location.planetName} · ${location.regionName}`, gameplayWidth / 2, this.canvas.height / 2 + 10);

    const buttonX = gameplayWidth / 2 - 100;
    const buttonY = this.canvas.height / 2 + 30;
    this.ctx.fillStyle = statusColor;
    this.ctx.fillRect(buttonX, buttonY, 200, 50);
    this.ctx.fillStyle = VisualTheme.color.black;
    this.ctx.font = 'bold 20px sans-serif';
    this.ctx.fillText(buttonLabel, gameplayWidth / 2, buttonY + 32);
    this.ctx.restore();
  }

  private renderResultMarker(x: number, y: number, color: string, danger: boolean): void {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    if (danger) {
      this.ctx.beginPath();
      this.ctx.moveTo(x - 10, y - 10);
      this.ctx.lineTo(x + 10, y + 10);
      this.ctx.moveTo(x + 10, y - 10);
      this.ctx.lineTo(x - 10, y + 10);
      this.ctx.stroke();
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(x, y - 12);
      this.ctx.lineTo(x + 12, y);
      this.ctx.lineTo(x, y + 12);
      this.ctx.lineTo(x - 12, y);
      this.ctx.closePath();
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private resolveEnemyAgainstGrid(
    enemy: Enemy,
    bounds: { left: number; top: number; right: number; bottom: number },
    previousPos: { x: number; y: number }
  ): boolean {
    const closestX = Math.max(bounds.left, Math.min(bounds.right, enemy.x));
    const closestY = Math.max(bounds.top, Math.min(bounds.bottom, enemy.y));
    const deltaX = enemy.x - closestX;
    const deltaY = enemy.y - closestY;
    if (deltaX * deltaX + deltaY * deltaY > enemy.radius * enemy.radius) return false;

    const distance = Math.hypot(deltaX, deltaY);
    if (distance > 0) {
      enemy.x = closestX + (deltaX / distance) * (enemy.radius + 0.01);
      enemy.y = closestY + (deltaY / distance) * (enemy.radius + 0.01);
      return true;
    }

    if (previousPos.x < bounds.left) enemy.x = bounds.left - enemy.radius - 0.01;
    else if (previousPos.x > bounds.right) enemy.x = bounds.right + enemy.radius + 0.01;
    else if (previousPos.y < bounds.top) enemy.y = bounds.top - enemy.radius - 0.01;
    else if (previousPos.y > bounds.bottom) enemy.y = bounds.bottom + enemy.radius + 0.01;
    else {
      const distances = [
        { distance: enemy.x - bounds.left, set: () => { enemy.x = bounds.left - enemy.radius - 0.01; } },
        { distance: bounds.right - enemy.x, set: () => { enemy.x = bounds.right + enemy.radius + 0.01; } },
        { distance: enemy.y - bounds.top, set: () => { enemy.y = bounds.top - enemy.radius - 0.01; } },
        { distance: bounds.bottom - enemy.y, set: () => { enemy.y = bounds.bottom + enemy.radius + 0.01; } },
      ];
      distances.sort((a, b) => a.distance - b.distance)[0].set();
    }
    return true;
  }

  private handleRestartClick(event: MouseEvent): void {
    if (!this.isTerminalState()) return;
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
      if (this.state === GameState.REGION_CLEARED || (this.state === GameState.PLANET_CLEARED && this.progression.hasNextPlanet())) {
        this.advanceProgression();
      } else {
        this.restartGame();
      }
    }
  }

  private isTerminalState(): boolean {
    return this.state === GameState.GAME_OVER ||
      this.state === GameState.REGION_CLEARED ||
      this.state === GameState.PLANET_CLEARED ||
      this.state === GameState.VICTORY;
  }
}
