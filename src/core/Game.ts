import { HUDManager } from '../ui/HUDManager';
import { Enemy } from '../entities/Enemy';
import { Projectile, VisualEffect } from '../entities/Projectile';
import type { ProjectileSoundEvent } from '../entities/Projectile';
import type { CombatSoundEvent } from '../entities/Module';
import { ResourcePickup } from '../entities/ResourcePickup';
import { Vehicle } from '../entities/Vehicle';
import { InputManager } from './InputManager';
import { ProgressionManager } from './ProgressionManager';
import { ResourceStorage } from './ResourceStorage';
import { TankDefinitionLoader, TankDefinition } from './TankDefinitionLoader';
import { UpgradeManager } from './UpgradeManager';
import { WaveManager } from './WaveManager';
import { AssetManager } from './AssetManager';
import { RenderContext } from '../rendering/RenderContext';
import { SpriteRenderer } from '../rendering/SpriteRenderer';
import { VisualTheme } from '../rendering/VisualTheme';
import { AudioManager } from './AudioManager';
import { Camera } from './Camera';
import { ArmoryManager } from './ArmoryManager';
import type { ModuleOrientation } from './TankDefinitionLoader';
import { MapDefinition, mapDefinitionLoader } from './MapDefinitionLoader';
import { TerrainGrid } from './TerrainGrid';
import type { TerrainCell } from './TerrainGrid';
import { TerrainPathfinder } from './TerrainPathfinder';
import { SettingsScreen, StartMenu } from '../ui/StartMenu';
import { CampaignProgress, EMPTY_CAMPAIGN_PROGRESS } from './CampaignProgressStore';
import { LocalStorageCampaignProgressStore } from './LocalStorageCampaignProgressStore';
import { WorldMapDataLoader } from './WorldMapDataLoader';
import { WorldMap } from '../ui/WorldMap';

export enum AppScreen {
  START_MENU = 'START_MENU',
  SETTINGS = 'SETTINGS',
  WORLD_MAP = 'WORLD_MAP',
  GAMEPLAY = 'GAMEPLAY',
}

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
const LOGICAL_CANVAS_WIDTH = 1280;
const LOGICAL_CANVAS_HEIGHT = 720;
const MAX_EFFECTS = 128;
const MAP_TILE_POSITIONS = [[128, 112], [760, 132], [154, 526], [716, 570]] as const;
const MAP_PROP_POSITIONS = [[78, 174], [846, 176], [96, 626], [824, 614]] as const;
const PAUSE_MENU_OPTIONS = ['RESUME', 'ABANDON RUN'] as const;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets: AssetManager;
  private readonly renderer: SpriteRenderer;
  private readonly renderContext: RenderContext;
  private readonly input: InputManager;
  private readonly hud: HUDManager;
  private readonly tankDefinition: TankDefinition;
  private readonly audio = new AudioManager();
  private readonly progression = new ProgressionManager();
  private readonly worldMapData: WorldMapDataLoader;
  private readonly campaignProgressStore: LocalStorageCampaignProgressStore;
  private readonly worldMap: WorldMap;
  private readonly logicalWidth = LOGICAL_CANVAS_WIDTH;
  private readonly logicalHeight = LOGICAL_CANVAS_HEIGHT;
  private readonly gameplayWidth = LOGICAL_CANVAS_WIDTH - HUDManager.PANEL_WIDTH;
  private readonly camera: Camera;
  private readonly startMenu = new StartMenu();
  private readonly settingsScreen = new SettingsScreen();
  private terrainGrid: TerrainGrid;
  private pathfinder: TerrainPathfinder;

  private screen: AppScreen = AppScreen.START_MENU;
  private state: GameState = GameState.PLAYING;
  private vehicle: Vehicle;
  private armory: ArmoryManager;
  private upgradeManager: UpgradeManager;
  private waveManager: WaveManager;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private effects: VisualEffect[] = [];
  private pickups: ResourcePickup[] = [];
  private readonly resources = new ResourceStorage({ resource: 50 });
  private lastTime = 0;
  private terrainDebugVisible = false;
  private recentTerrainHitCell: TerrainCell | null = null;
  private recentTerrainHitTimer = 0;
  private reducedMotionOverride: boolean | null = null;
  private campaignProgress: CampaignProgress = { ...EMPTY_CAMPAIGN_PROGRESS, clearedMapIds: [] };
  private progressReady = false;
  private pauseMenuVisible = false;
  private pauseMenuSelection = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context is unavailable');
    this.ctx = context;
    this.worldMapData = new WorldMapDataLoader(undefined, mapDefinitionLoader, this.progression);
    this.campaignProgressStore = new LocalStorageCampaignProgressStore(this.worldMapData.getCampaignMapIds());
    this.worldMap = new WorldMap(this.worldMapData.getNodes());
    void this.campaignProgressStore.load()
      .then((progress) => {
        this.campaignProgress = progress;
        this.progressReady = true;
      })
      .catch(() => {
        this.progressReady = true;
      });
    this.audio.attachUserGestureListeners();
    void this.audio.preload();
    this.resizeCanvas();
    const initialMap = mapDefinitionLoader.getByLocation(
      this.progression.currentPlanet.id,
      this.progression.currentRegion.id,
    );
    if (!initialMap) throw new Error('[Game] initial map is missing');
    this.terrainGrid = new TerrainGrid(initialMap);
    this.pathfinder = new TerrainPathfinder(this.terrainGrid);
    this.camera = new Camera(
      this.gameplayWidth,
      this.logicalHeight,
      this.terrainGrid.width,
      this.terrainGrid.height,
    );
    this.assets = new AssetManager();
    this.renderer = new SpriteRenderer(this.assets);
    const reducedMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const systemReducedMotion = reducedMotionQuery?.matches ?? false;
    this.renderContext = {
      ctx: this.ctx,
      renderer: this.renderer,
      time: 0,
      reducedMotion: systemReducedMotion,
    };
    if (reducedMotionQuery) {
      const updateMotionPreference = (event: MediaQueryListEvent) => {
        this.renderContext.reducedMotion = this.reducedMotionOverride ?? event.matches;
      };
      if (typeof reducedMotionQuery.addEventListener === 'function') {
        reducedMotionQuery.addEventListener('change', updateMotionPreference);
      } else {
        reducedMotionQuery.addListener(updateMotionPreference);
      }
    }
    window.addEventListener('resize', () => this.resizeCanvas());
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
    this.armory = this.createArmory();
    this.camera.snapTo(this.vehicle);
    this.waveManager = this.createWaveManager();
    this.pickups = this.createInitialPickups();

    this.hud.setupMouseListeners(this.canvas, {
      getVehicle: () => this.vehicle,
      getStorage: () => this.resources,
      getUpgradeManager: () => this.upgradeManager,
      spendCost: (cost) => this.resources.spendCost(cost),
      onUpgradeSuccess: () => this.audio.playSfx('sfx.ui.upgrade-confirm'),
      getMusicVolume: () => this.audio.getMusicVolume(),
      onMusicControl: () => this.audio.cycleMusicVolume(),
      screenToWorld: (point) => this.camera.screenToWorld(point),
      getArmory: () => this.armory,
      isActive: () => this.screen === AppScreen.GAMEPLAY && !this.pauseMenuVisible,
      isPaused: () => this.state === GameState.PAUSED,
      onArmoryResearchSuccess: () => this.audio.playSfx('sfx.ui.upgrade-confirm'),
      onArmoryPurchaseSuccess: () => this.audio.playSfx('sfx.ui.upgrade-confirm'),
      installPurchasedModule: (moduleId, anchor, orientation) => this.installPurchasedModule(moduleId, anchor, orientation),
    }, { width: this.logicalWidth, height: this.logicalHeight });

    window.addEventListener('keydown', (event) => this.handleScreenKey(event));
    this.canvas.addEventListener('click', (event) => this.handleCanvasClick(event));
  }

  public start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  private beginFreshRun(): void {
    const map = this.getCurrentMap();
    if (!map) throw new Error(`[Game] map is missing for ${this.progression.currentRegion.mapId}`);
    this.audio.stopAll();
    this.setTerrainContext(map);
    this.upgradeManager = new UpgradeManager(this.tankDefinition.modules);
    this.vehicle = this.createVehicle();
    this.armory = this.createArmory();
    this.waveManager = this.createWaveManager();
    this.resetArtState();
    this.pickups = this.createInitialPickups();
    this.resources.reset();
    this.camera.snapTo(this.vehicle);
    this.state = GameState.PLAYING;
    this.screen = AppScreen.GAMEPLAY;
    this.input.reset();
    this.audio.playMusic();
  }

  private openStartMenu(): void {
    this.audio.stopAll();
    this.resetArtState();
    this.input.reset();
    this.resources.reset();
    this.state = GameState.PLAYING;
    this.screen = AppScreen.START_MENU;
    this.startMenu.reset();
    this.settingsScreen.reset();
  }

  private openSettings(): void {
    this.audio.stopMusic();
    this.input.reset();
    this.hud.resetSelection();
    this.screen = AppScreen.SETTINGS;
    this.settingsScreen.reset();
  }

  private handleStartMenuAction(action: 'start' | 'settings' | 'exit'): void {
    if (action === 'start') {
      this.openWorldMap();
    } else if (action === 'settings') {
      this.openSettings();
    } else {
      this.openStartMenu();
    }
  }

  private openWorldMap(): void {
    this.audio.stopAll();
    this.resetArtState();
    this.input.reset();
    this.state = GameState.PLAYING;
    this.screen = AppScreen.WORLD_MAP;
    this.worldMap.reset();
  }

  private handleSettingsAction(action: 'back' | 'music' | 'sfx' | 'reducedMotion'): void {
    if (action === 'back') {
      this.openStartMenu();
    } else if (action === 'music') {
      this.audio.cycleMusicVolume();
    } else if (action === 'sfx') {
      this.audio.cycleSfxVolume();
    } else {
      this.reducedMotionOverride = !this.renderContext.reducedMotion;
      this.renderContext.reducedMotion = this.reducedMotionOverride;
    }
  }

  private handleScreenKey(event: KeyboardEvent): void {
    if (this.screen === AppScreen.START_MENU) {
      const action = this.startMenu.handleKey(event.code);
      if (action) this.handleStartMenuAction(action);
      if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Enter', 'Space'].includes(event.code)) event.preventDefault();
      return;
    }
    if (this.screen === AppScreen.SETTINGS) {
      const action = this.settingsScreen.handleKey(event.code);
      if (action) this.handleSettingsAction(action);
      if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Enter', 'Space', 'Escape'].includes(event.code)) event.preventDefault();
      return;
    }
    if (this.screen === AppScreen.WORLD_MAP) {
      const action = this.worldMap.handleKey(event.code, this.campaignProgress);
      this.handleWorldMapAction(action);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter', 'Space', 'Escape'].includes(event.code)) {
        event.preventDefault();
      }
      return;
    }
    if (this.screen === AppScreen.GAMEPLAY && this.isTerminalState()) {
      if (event.code === 'Escape') this.openWorldMap();
      else if (event.code === 'Enter' || event.code === 'Space') this.handleTerminalAction();
      if (event.code === 'Escape' || event.code === 'Enter' || event.code === 'Space') event.preventDefault();
      return;
    }
    if (this.screen === AppScreen.GAMEPLAY) {
      this.handleGameplayKey(event);
    }
  }

  private handleGameplayKey(event: KeyboardEvent): void {
    if (this.pauseMenuVisible) {
      this.input.consumePauseRequest();
      if (event.code === 'Escape') {
        if (!event.repeat) this.resumeFromPauseMenu();
      } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        this.pauseMenuSelection = (this.pauseMenuSelection + PAUSE_MENU_OPTIONS.length - 1) % PAUSE_MENU_OPTIONS.length;
      } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        this.pauseMenuSelection = (this.pauseMenuSelection + 1) % PAUSE_MENU_OPTIONS.length;
      } else if (event.code === 'Enter' || event.code === 'Space') {
        this.handlePauseMenuAction(PAUSE_MENU_OPTIONS[this.pauseMenuSelection]);
      } else if (event.code === 'KeyP') {
        event.preventDefault();
        return;
      } else {
        return;
      }
      event.preventDefault();
      return;
    }

    if (event.code === 'Escape' && !event.repeat) {
      this.pauseMenuVisible = true;
      this.pauseMenuSelection = 0;
      this.setState(GameState.PAUSED);
      event.preventDefault();
    }
  }

  private handleCanvasClick(event: MouseEvent): void {
    const point = this.toCanvasPoint(event);
    if (this.screen === AppScreen.START_MENU) {
      const action = this.startMenu.handlePointer(point);
      if (action) this.handleStartMenuAction(action);
      return;
    }
    if (this.screen === AppScreen.SETTINGS) {
      const action = this.settingsScreen.handlePointer(point);
      if (action) this.handleSettingsAction(action);
      return;
    }
    if (this.screen === AppScreen.WORLD_MAP) {
      this.handleWorldMapAction(this.worldMap.handlePointer(point, this.campaignProgress));
      return;
    }
    if (this.screen === AppScreen.GAMEPLAY) {
      if (this.pauseMenuVisible) this.handlePauseMenuClick(event);
      else this.handleRestartClick(event);
    }
  }

  private handleWorldMapAction(action: { type: 'back' } | { type: 'select'; mapId: string } | { type: 'locked' } | null): void {
    if (!action) return;
    if (action.type === 'back') {
      this.openStartMenu();
    } else if (action.type === 'select' && (this.progressReady || action.mapId === 'test/terrain-test')) {
      this.progression.selectMap(action.mapId);
      this.beginFreshRun();
    }
  }

  private toCanvasPoint(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.logicalWidth / rect.width),
      y: (event.clientY - rect.top) * (this.logicalHeight / rect.height),
    };
  }

  private createVehicle(): Vehicle {
    const map = this.getCurrentMap();
    const start = map
      ? this.terrainGrid.cellToWorldCenter(map.tankStartCell)
      : { x: this.camera.width / 2, y: this.camera.height / 2 };
    const vehicle = new Vehicle(start.x, start.y, this.tankDefinition, this.upgradeManager);
    if (map && !vehicle.isTerrainPositionValid(start, this.terrainGrid)) {
      throw new Error(`[Game] map '${map.mapId}' has an invalid tank start footprint`);
    }
    return vehicle;
  }

  private createWaveManager(): WaveManager {
    const map = this.getCurrentMap();
    if (!map) throw new Error(`[Game] map is missing for ${this.progression.currentRegion.mapId}`);
    return new WaveManager(
      this.progression.currentRegion,
      this.progression.enemyDefinitions,
      { terrain: this.terrainGrid, spawnCells: map.enemySpawnCells },
    );
  }

  private createArmory(): ArmoryManager {
    return new ArmoryManager(this.tankDefinition, this.upgradeManager);
  }

  private setState(nextState: GameState): void {
    if (this.state === nextState) {
      if (nextState === GameState.PLAYING && this.screen === AppScreen.GAMEPLAY) this.audio.playMusic();
      return;
    }
    this.state = nextState;
    if (nextState === GameState.PAUSED) {
      this.audio.setMusicDucked(true);
    } else if (nextState === GameState.PLAYING) {
      this.audio.setMusicDucked(false);
      this.audio.playMusic();
    } else {
      this.audio.stopMusic();
    }
  }

  private restartGame(): void {
    this.beginFreshRun();
  }

  private recordCurrentMapClear(): void {
    const map = this.getCurrentMap();
    if (!map?.gameplay.campaign || this.campaignProgress.clearedMapIds.includes(map.mapId)) return;
    this.campaignProgress = {
      version: 1,
      clearedMapIds: [...this.campaignProgress.clearedMapIds, map.mapId],
    };
    void this.campaignProgressStore.save(this.campaignProgress).catch(() => {
      console.warn('[Game] campaign progress save failed; keeping the in-memory unlock');
    });
  }

  private createInitialPickups(): ResourcePickup[] {
    const map = this.getCurrentMap();
    const cells = map ? mapDefinitionLoader.getAccessiblePickupCells(map.mapId, INITIAL_PICKUP_COUNT) : [];
    if (cells.length > 0) {
      return cells.map((cell) => {
        const point = this.terrainGrid.cellToWorldCenter(cell);
        return new ResourcePickup(point.x, point.y, INITIAL_PICKUP_AMOUNT);
      });
    }
    return Array.from({ length: INITIAL_PICKUP_COUNT }, (_, index) => {
      const angle = (index / INITIAL_PICKUP_COUNT) * Math.PI * 2;
      return new ResourcePickup(
        this.vehicle.x + Math.cos(angle) * INITIAL_PICKUP_RADIUS,
        this.vehicle.y + Math.sin(angle) * INITIAL_PICKUP_RADIUS,
        INITIAL_PICKUP_AMOUNT
      );
    });
  }

  private installPurchasedModule(
    moduleId: string,
    anchor: { x: number; y: number },
    orientation: ModuleOrientation,
  ): import('../entities/Module').CombatModule | null {
    if (this.armory.getStock(moduleId) <= 0) return null;
    const installed = this.vehicle.installModule(moduleId, anchor, orientation);
    if (!installed) return null;
    this.armory.consume(moduleId);
    return installed;
  }

  private gameLoop(time: number): void {
    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.update(dt);
    this.render();
    requestAnimationFrame((nextTime) => this.gameLoop(nextTime));
  }

  private update(dt: number): void {
    if (this.screen !== AppScreen.GAMEPLAY) {
      this.input.consumePauseRequest();
      this.input.consumeDebugOverlayRequest();
      return;
    }
    if (this.input.consumeDebugOverlayRequest() && this.getCurrentMap()?.mapId === 'test/terrain-test') {
      this.terrainDebugVisible = !this.terrainDebugVisible;
    }
    if (this.input.consumePauseRequest()) {
      if (this.state === GameState.PLAYING) this.setState(GameState.PAUSED);
      else if (this.state === GameState.PAUSED) this.setState(GameState.PLAYING);
    }

    if (this.isTerminalState()) return;
    const isPaused = this.state === GameState.PAUSED;
    if (!isPaused) this.recentTerrainHitTimer = Math.max(0, this.recentTerrainHitTimer - dt);

    if (!isPaused) {
      this.renderContext.time += dt;
      this.vehicle.update(dt, this.input.getMovementVector(), {
        width: this.camera.width,
        height: this.camera.height,
        terrain: this.terrainGrid,
      });
      this.camera.update(dt, this.vehicle);
      this.vehicle.systems.update(dt, { x: this.vehicle.x, y: this.vehicle.y }, this.pickups, this.resources);

      for (const pickup of this.pickups) {
        if (pickup.consumeCollectionEffect()) {
          this.addEffect(new VisualEffect(pickup.x, pickup.y, 22, '#ffd54f', 'resource.resource.collect', 'decorative'));
        }
      }

      for (const module of this.vehicle.getCombatModules()) {
        module.update(
          dt,
          this.vehicle.getModuleWorldCenter(module),
          this.vehicle.getModuleFireAngle(module),
          this.enemies,
          (projectile) => this.projectiles.push(projectile),
          (type, amount) => this.resources.spend(type, amount),
          (event) => this.handleCombatSound(event),
          (from, to) => this.terrainGrid.raycast(from, to) === null,
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
      this.camera.width,
      this.camera.height,
      { x: this.vehicle.x, y: this.vehicle.y }
    );

    if (this.waveManager.waveCleared) {
      if (this.waveManager.currentWave >= this.waveManager.totalWaves) {
        this.audio.stopAll();
        this.recordCurrentMapClear();
        this.setState(GameState.REGION_CLEARED);
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
        this.addEnemyDeathEffect(enemy);
        this.enemies.splice(i, 1);
        continue;
      }

      enemy.update(dt, corePos, {
        terrain: this.terrainGrid,
        pathfinder: this.pathfinder,
        targetCell: this.terrainGrid.worldToCell(corePos),
      });
      if (this.resolveEnemyAgainstGrid(enemy, this.vehicle.getGridBounds(), previousPos) && enemy.tryContactDamage()) {
        this.vehicle.takeDamage(enemy.contactDamage, 0, { x: enemy.x - corePos.x, y: enemy.y - corePos.y });
        this.addEffect(new VisualEffect(enemy.x, enemy.y, 25, '#ff1744', 'effect.contact-damage'));
        if (!this.vehicle.isCoreActive()) {
          this.audio.stopAll();
          this.setState(GameState.GAME_OVER);
        }
      }

      if (enemy.isDead()) {
        this.pickups.push(new ResourcePickup(enemy.x, enemy.y, enemy.reward));
        this.addEnemyDeathEffect(enemy);
        this.enemies.splice(i, 1);
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.update(
        dt,
        this.enemies,
        (effect) => this.addEffect(effect),
        (event) => this.handleProjectileSound(event),
        this.terrainGrid,
      );
      if (projectile.terrainHitCell) {
        this.recentTerrainHitCell = { ...projectile.terrainHitCell };
        this.recentTerrainHitTimer = 0.45;
      }
      if (projectile.isDead()) this.projectiles.splice(i, 1);
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.update(dt);
      if (effect.dead) this.effects.splice(i, 1);
    }
  }

  private render(): void {
    const gameplayWidth = this.gameplayWidth;
    this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    this.ctx.imageSmoothingEnabled = false;

    if (this.screen !== AppScreen.GAMEPLAY) {
      if (this.screen === AppScreen.START_MENU) {
        this.startMenu.render(this.ctx, this.logicalWidth, this.logicalHeight);
      } else if (this.screen === AppScreen.SETTINGS) {
        this.settingsScreen.render(this.ctx, this.logicalWidth, this.logicalHeight, {
          musicVolume: this.audio.getMusicVolume(),
          sfxVolume: this.audio.getSfxVolume(),
          reducedMotion: this.renderContext.reducedMotion,
        });
      } else if (this.screen === AppScreen.WORLD_MAP) {
        this.worldMap.render(
          this.renderContext,
          this.logicalWidth,
          this.logicalHeight,
          this.campaignProgress,
          this.progressReady,
        );
      } else {
        this.renderUnavailableScreen();
      }
      return;
    }

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, 0, gameplayWidth, this.logicalHeight);
    this.ctx.clip();
    this.ctx.translate(-this.camera.x, -this.camera.y);
    this.renderMap();
    this.vehicle.render(this.renderContext);
    for (const enemy of this.enemies) enemy.render(this.renderContext);
    for (const pickup of this.pickups) pickup.render(this.renderContext);
    for (const projectile of this.projectiles) projectile.render(this.renderContext);
    for (const effect of this.effects) effect.render(this.renderContext);
    if (this.terrainDebugVisible) this.renderTerrainDebugOverlay();
    this.ctx.restore();

    const liveEnemyCount = this.enemies.reduce((count, enemy) => count + (enemy.isDead() ? 0 : 1), 0);
    const enemiesRemaining = Math.max(
      0,
      this.waveManager.totalWaveEnemies - this.waveManager.spawnedEnemiesCount + liveEnemyCount
    );
    this.hud.render(
      this.renderContext,
      this.logicalWidth,
      this.logicalHeight,
      this.vehicle,
      this.resources,
      this.waveManager.currentWave,
      enemiesRemaining,
      this.state === GameState.PAUSED,
      this.camera,
    );

    if (this.pauseMenuVisible) this.renderPauseMenuOverlay();
    else if (this.isTerminalState()) this.renderResultOverlay();
  }

  private handlePauseMenuAction(action: typeof PAUSE_MENU_OPTIONS[number]): void {
    if (action === 'RESUME') this.resumeFromPauseMenu();
    else this.openWorldMap();
  }

  private resumeFromPauseMenu(): void {
    this.pauseMenuVisible = false;
    this.setState(GameState.PLAYING);
  }

  private handlePauseMenuClick(event: MouseEvent): void {
    const point = this.toCanvasPoint(event);
    const layout = this.getPauseMenuLayout();
    for (const [index, button] of layout.buttons.entries()) {
      if (!this.containsPauseMenuPoint(button, point.x, point.y)) continue;
      this.pauseMenuSelection = index;
      this.handlePauseMenuAction(PAUSE_MENU_OPTIONS[index]);
      return;
    }
  }

  private renderPauseMenuOverlay(): void {
    const layout = this.getPauseMenuLayout();
    this.ctx.save();
    this.ctx.fillStyle = VisualTheme.color.overlay;
    this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    this.ctx.fillStyle = VisualTheme.color.surfacePanel;
    this.ctx.fillRect(layout.panelX, layout.panelY, layout.panelWidth, layout.panelHeight);
    this.ctx.strokeStyle = VisualTheme.color.accent;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(layout.panelX, layout.panelY, layout.panelWidth, layout.panelHeight);

    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = VisualTheme.color.accent;
    this.ctx.font = 'bold 32px monospace';
    this.ctx.fillText('GAME PAUSED', this.logicalWidth / 2, layout.panelY + 58);
    this.ctx.fillStyle = VisualTheme.color.textSecondary;
    this.ctx.font = '12px monospace';
    this.ctx.fillText('SELECT AN ACTION', this.logicalWidth / 2, layout.panelY + 84);

    for (const [index, button] of layout.buttons.entries()) {
      const selected = index === this.pauseMenuSelection;
      this.ctx.fillStyle = selected ? VisualTheme.color.surfaceAvailable : VisualTheme.color.surfaceElevated;
      this.ctx.fillRect(button.x, button.y, button.width, button.height);
      this.ctx.strokeStyle = selected ? VisualTheme.color.accent : VisualTheme.color.border;
      this.ctx.lineWidth = selected ? 2 : 1;
      this.ctx.strokeRect(button.x, button.y, button.width, button.height);
      this.ctx.fillStyle = selected ? VisualTheme.color.textPrimary : VisualTheme.color.textSecondary;
      this.ctx.font = 'bold 16px monospace';
      this.ctx.fillText(PAUSE_MENU_OPTIONS[index], this.logicalWidth / 2, button.y + 30);
    }

    this.ctx.fillStyle = VisualTheme.color.textMuted;
    this.ctx.font = '11px monospace';
    this.ctx.fillText('ESC RESUME  ·  ARROWS / WASD SELECT  ·  ENTER CONFIRM', this.logicalWidth / 2, layout.panelY + layout.panelHeight - 22);
    this.ctx.restore();
  }

  private getPauseMenuLayout(): {
    panelX: number;
    panelY: number;
    panelWidth: number;
    panelHeight: number;
    buttons: Array<{ x: number; y: number; width: number; height: number }>;
  } {
    const panelWidth = 420;
    const panelHeight = 300;
    const panelX = (this.logicalWidth - panelWidth) / 2;
    const panelY = (this.logicalHeight - panelHeight) / 2;
    const buttonWidth = 260;
    const buttonHeight = 46;
    const buttonX = (this.logicalWidth - buttonWidth) / 2;
    const buttons = PAUSE_MENU_OPTIONS.map((_, index) => ({
      x: buttonX,
      y: panelY + 108 + index * 58,
      width: buttonWidth,
      height: buttonHeight,
    }));
    return { panelX, panelY, panelWidth, panelHeight, buttons };
  }

  private containsPauseMenuPoint(
    button: { x: number; y: number; width: number; height: number },
    x: number,
    y: number,
  ): boolean {
    return x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height;
  }

  private renderMap(): void {
    const map = this.getCurrentMap();
    const backgroundAsset = map?.backgroundAsset ?? 'map.common.field-base';
    const background = this.renderer.getAsset(backgroundAsset);
    const backgroundWidth = background?.draw.width ?? this.gameplayWidth;
    const backgroundHeight = background?.draw.height ?? this.logicalHeight;
    for (let y = 0; y < this.camera.height; y += backgroundHeight) {
      for (let x = 0; x < this.camera.width; x += backgroundWidth) {
        this.renderer.drawSprite(this.renderContext, backgroundAsset, x, y);
      }
    }
    if (!map) return;

    if (map.groundAsset !== backgroundAsset) {
      const ground = this.renderer.getAsset(map.groundAsset);
      const groundWidth = ground?.draw.width ?? this.gameplayWidth;
      const groundHeight = ground?.draw.height ?? this.logicalHeight;
      for (let y = 0; y < this.camera.height; y += groundHeight) {
        for (let x = 0; x < this.camera.width; x += groundWidth) {
          this.renderer.drawSprite(this.renderContext, map.groundAsset, x, y);
        }
      }
    }

    const tileAsset = map.tileAssets[0];
    if (tileAsset) {
      for (let worldY = 0; worldY < this.camera.height; worldY += this.logicalHeight) {
        for (let worldX = 0; worldX < this.gameplayWidth; worldX += this.gameplayWidth) {
          for (const [x, y] of MAP_TILE_POSITIONS) {
            this.renderer.drawSprite(this.renderContext, tileAsset, worldX + x, worldY + y, { alpha: 0.42 });
          }
        }
      }
    }

    const propAsset = map.propAssets[0];
    if (propAsset) {
      for (let worldY = 0; worldY < this.camera.height; worldY += this.logicalHeight) {
        for (let worldX = 0; worldX < this.gameplayWidth; worldX += this.gameplayWidth) {
          for (const [x, y] of MAP_PROP_POSITIONS) {
            this.renderer.drawSprite(this.renderContext, propAsset, worldX + x, worldY + y, { alpha: 0.72 });
          }
        }
      }
    }

    const spawnEdge = this.renderer.getAsset(map.spawnEdgeAsset);
    const spawnEdgeHeight = spawnEdge?.draw.height ?? 64;
    for (let worldY = 0; worldY < this.camera.height; worldY += this.logicalHeight) {
      this.renderer.drawSprite(this.renderContext, map.spawnEdgeAsset, 0, worldY, { alpha: 0.65 });
      if (spawnEdgeHeight <= 0) break;
    }
  }

  private renderTerrainDebugOverlay(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(77, 234, 234, 0.24)';
    for (let x = 0; x <= this.terrainGrid.columns; x++) {
      ctx.beginPath();
      ctx.moveTo(x * this.terrainGrid.cellSize, 0);
      ctx.lineTo(x * this.terrainGrid.cellSize, this.terrainGrid.height);
      ctx.stroke();
    }
    for (let y = 0; y <= this.terrainGrid.rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * this.terrainGrid.cellSize);
      ctx.lineTo(this.terrainGrid.width, y * this.terrainGrid.cellSize);
      ctx.stroke();
    }

    for (let y = 0; y < this.terrainGrid.rows; y++) {
      for (let x = 0; x < this.terrainGrid.columns; x++) {
        const cell = { x, y };
        const blockedTargets = TerrainGrid.allTargets().filter((target) => this.terrainGrid.isBlocked(cell, target));
        if (blockedTargets.length === 0) continue;
        const bounds = this.terrainGrid.getCellBounds(cell);
        ctx.fillStyle = blockedTargets.includes('tank')
          ? 'rgba(255, 23, 68, 0.18)'
          : blockedTargets.includes('enemy')
            ? 'rgba(255, 179, 0, 0.16)'
            : 'rgba(171, 71, 188, 0.16)';
        ctx.fillRect(bounds.left, bounds.top, this.terrainGrid.cellSize, this.terrainGrid.cellSize);
        for (const [index, target] of TerrainGrid.allTargets().entries()) {
          if (!blockedTargets.includes(target)) continue;
          ctx.fillStyle = target === 'tank' ? '#ff1744' : target === 'enemy' ? '#ffb300' : '#ab47bc';
          ctx.fillRect(bounds.left + 3 + index * 8, bounds.bottom - 6, 6, 3);
        }
      }
    }

    const footprint = this.vehicle.getTerrainFootprintPolygon();
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(footprint[0].x, footprint[0].y);
    for (const point of footprint.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.stroke();

    for (const enemy of this.enemies) {
      const path = enemy.getPath();
      if (path.length === 0) continue;
      ctx.strokeStyle = enemy.enemyType === 'tanker' ? '#ff9f43' : '#00e676';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      for (const cell of path) {
        const point = this.terrainGrid.cellToWorldCenter(cell);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }

    if (this.recentTerrainHitCell && this.recentTerrainHitTimer > 0) {
      const bounds = this.terrainGrid.getCellBounds(this.recentTerrainHitCell);
      ctx.strokeStyle = '#ab47bc';
      ctx.lineWidth = 3;
      ctx.strokeRect(bounds.left + 2, bounds.top + 2, this.terrainGrid.cellSize - 4, this.terrainGrid.cellSize - 4);
    }
    ctx.restore();
  }

  private renderUnavailableScreen(): void {
    this.ctx.fillStyle = '#0c111c';
    this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    this.ctx.fillStyle = VisualTheme.color.accent;
    this.ctx.font = 'bold 28px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('WORLD MAP', this.logicalWidth / 2, this.logicalHeight / 2 - 16);
    this.ctx.fillStyle = VisualTheme.color.textMuted;
    this.ctx.font = '12px monospace';
    this.ctx.fillText('CAMPAIGN NAVIGATION IS LOADING', this.logicalWidth / 2, this.logicalHeight / 2 + 16);
    this.ctx.textAlign = 'left';
  }

  private getCurrentMap(): MapDefinition | null {
    const planetId = this.progression.currentPlanet.id;
    const regionId = this.progression.currentRegion.id;
    return mapDefinitionLoader.getByLocation(planetId, regionId);
  }

  private setTerrainContext(map: MapDefinition): void {
    this.terrainGrid = new TerrainGrid(map);
    this.pathfinder = new TerrainPathfinder(this.terrainGrid);
    this.camera.setWorldSize(this.terrainGrid.width, this.terrainGrid.height);
  }

  private renderResultOverlay(): void {
    const isGameOver = this.state === GameState.GAME_OVER;
    const isRegionCleared = this.state === GameState.REGION_CLEARED;
    const isPlanetCleared = this.state === GameState.PLANET_CLEARED;
    const gameplayWidth = this.gameplayWidth;
    const location = this.progression.location;
    const title = isGameOver
      ? 'CORE DESTROYED - GAME OVER'
      : isRegionCleared
        ? 'REGION CLEARED'
        : isPlanetCleared
          ? 'PLANET CLEARED'
          : 'CAMPAIGN COMPLETE';
    const buttonLabel = isGameOver ? 'RETRY' : 'WORLD MAP';
    this.ctx.save();
    this.ctx.fillStyle = VisualTheme.color.overlay;
    this.ctx.fillRect(0, 0, gameplayWidth, this.logicalHeight);
    const statusColor = isGameOver ? VisualTheme.color.danger : VisualTheme.color.success;
    const panelWidth = 460;
    const panelHeight = 220;
    const panelX = gameplayWidth / 2 - panelWidth / 2;
    const panelY = this.logicalHeight / 2 - 110;
    this.ctx.fillStyle = VisualTheme.color.surfacePanel;
    this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    this.ctx.strokeStyle = statusColor;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    this.renderResultMarker(gameplayWidth / 2, this.logicalHeight / 2 - 62, statusColor, isGameOver);
    this.ctx.fillStyle = statusColor;
    this.ctx.font = 'bold 34px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      title,
      gameplayWidth / 2,
      this.logicalHeight / 2 - 20
    );
    this.ctx.fillStyle = VisualTheme.color.textPrimary;
    this.ctx.font = '16px sans-serif';
    this.ctx.fillText(`${location.planetName} · ${location.regionName}`, gameplayWidth / 2, this.logicalHeight / 2 + 10);

    const buttonX = gameplayWidth / 2 - 100;
    const buttonY = this.logicalHeight / 2 + 30;
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

  private resizeCanvas(): void {
    const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    // ponytail: cap DPR at 2; higher backing resolutions add memory cost without changing logical gameplay.
    const dpr = Math.max(1, Math.min(2, devicePixelRatio));
    const pixelWidth = Math.round(this.logicalWidth * dpr);
    const pixelHeight = Math.round(this.logicalHeight * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  private resetArtState(): void {
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.pauseMenuVisible = false;
    this.pauseMenuSelection = 0;
    this.renderContext.time = 0;
    this.terrainDebugVisible = false;
    this.recentTerrainHitCell = null;
    this.recentTerrainHitTimer = 0;
    this.hud.resetSelection();
  }

  private addEffect(effect: VisualEffect): void {
    const maxEffects = this.renderContext.reducedMotion ? MAX_EFFECTS / 2 : MAX_EFFECTS;
    if (this.effects.length >= maxEffects) {
      const decorativeIndex = this.effects.findIndex((candidate) => candidate.isDecorative());
      if (decorativeIndex >= 0) this.effects.splice(decorativeIndex, 1);
      else if (effect.isDecorative()) return;
      else this.effects.shift();
    }
    this.effects.push(effect);
  }

  private addEnemyDeathEffect(enemy: Enemy): void {
    this.audio.playSfx('sfx.enemy.death');
    const color = enemy.enemyType === 'tanker' ? '#ff9f43' : '#ff5252';
    this.addEffect(new VisualEffect(enemy.x, enemy.y, enemy.radius * 1.6, color, 'effect.enemy.dead'));
  }

  private handleCombatSound(event: CombatSoundEvent): void {
    this.audio.playSfx(
      event.weapon === 'direct' ? 'sfx.weapon.direct-fire' : 'sfx.weapon.arc-fire'
    );
  }

  private handleProjectileSound(event: ProjectileSoundEvent): void {
    this.audio.playSfx(
      event.type === 'projectile-impact' ? 'sfx.weapon.impact' : 'sfx.weapon.explosion'
    );
  }

  private handleRestartClick(event: MouseEvent): void {
    if (!this.isTerminalState()) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) * (this.logicalWidth / rect.width);
    const mouseY = (event.clientY - rect.top) * (this.logicalHeight / rect.height);
    const gameplayWidth = this.gameplayWidth;
    if (
      mouseX >= gameplayWidth / 2 - 100 &&
      mouseX <= gameplayWidth / 2 + 100 &&
      mouseY >= this.logicalHeight / 2 + 30 &&
      mouseY <= this.logicalHeight / 2 + 80
    ) {
      this.handleTerminalAction();
    }
  }

  private handleTerminalAction(): void {
    if (this.state === GameState.GAME_OVER) this.restartGame();
    else this.openWorldMap();
  }

  private isTerminalState(): boolean {
    return this.state === GameState.GAME_OVER ||
      this.state === GameState.REGION_CLEARED ||
      this.state === GameState.PLANET_CLEARED ||
      this.state === GameState.VICTORY;
  }
}
