import { ResourceStorage } from '../core/ResourceStorage';
import { GridCell, ModuleOrientation, ResourceCost, TankModuleDefinition, UpgradeNodeDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager, UpgradeNodeState } from '../core/UpgradeManager';
import { CombatModule } from '../entities/Module';
import { Vehicle } from '../entities/Vehicle';
import type { RenderContext } from '../rendering/RenderContext';
import { VisualTheme } from '../rendering/VisualTheme';
import type { Camera } from '../core/Camera';
import type { ArmoryManager } from '../core/ArmoryManager';

interface HUDCallbacks {
  getVehicle: () => Vehicle;
  getStorage: () => ResourceStorage;
  getUpgradeManager: () => UpgradeManager;
  spendCost: (cost: ResourceCost) => boolean;
  onUpgradeSuccess: () => void;
  getMusicVolume: () => number;
  onMusicControl: () => void;
  screenToWorld: (point: { x: number; y: number }) => { x: number; y: number };
  getArmory: () => ArmoryManager;
  isPaused: () => boolean;
  onArmoryResearchSuccess: () => void;
  onArmoryPurchaseSuccess: () => void;
  installPurchasedModule: (moduleId: string, anchor: GridCell, orientation: ModuleOrientation) => CombatModule | null;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type MarkerKind = 'selected' | 'available' | 'insufficient' | 'locked' | 'disabled';

interface Subject {
  instanceId: string;
  moduleId: string;
  definition: TankModuleDefinition;
  combatModule: CombatModule | null;
}

interface NodeHitbox extends Rect {
  instanceId: string;
  nodeId: string;
}

interface InstallHitbox extends Rect {
  moduleId: string;
}

interface PurchaseHitbox extends Rect {
  moduleId: string;
  action: 'purchase' | 'install';
}

interface DragState {
  module: CombatModule;
  offset: GridCell;
  orientation: ModuleOrientation;
  previewAnchor: GridCell | null;
}

interface LogicalViewport {
  width: number;
  height: number;
}

export class HUDManager {
  public static readonly PANEL_WIDTH = 340;

  private selectedCell: { gx: number; gy: number } | null = null;
  private selectedInstanceId: string | null = null;
  private selectedInstallModuleId: string | null = null;
  private selectedInstallOrientation: ModuleOrientation = 0;
  private dragState: DragState | null = null;
  private suppressNextClick = false;
  private feedbackMessage: string | null = null;
  private feedbackColor: string = VisualTheme.color.danger;
  private nodeHitboxes: NodeHitbox[] = [];
  private installHitboxes: InstallHitbox[] = [];
  private purchaseHitboxes: PurchaseHitbox[] = [];
  private subjectHitboxes: Array<Rect & { instanceId: string }> = [];
  private getUpgradeManager: (() => UpgradeManager) | null = null;
  private getArmory: (() => ArmoryManager) | null = null;
  private getMusicVolume: (() => number) | null = null;
  private onMusicControl: (() => void) | null = null;
  private musicControlRect: Rect | null = null;
  private pointer: { x: number; y: number } | null = null;
  private screenToWorld: ((point: { x: number; y: number }) => { x: number; y: number }) | null = null;

  public setupMouseListeners(
    canvas: HTMLCanvasElement,
    callbacks: HUDCallbacks,
    viewport: LogicalViewport = { width: canvas.width, height: canvas.height },
  ): void {
    this.getUpgradeManager = callbacks.getUpgradeManager;
    this.getArmory = callbacks.getArmory;
    this.getMusicVolume = callbacks.getMusicVolume;
    this.onMusicControl = callbacks.onMusicControl;
    this.screenToWorld = callbacks.screenToWorld;
    canvas.addEventListener('mousemove', (event) => {
      const point = this.toCanvasPoint(canvas, event, viewport);
      this.pointer = point;
      this.updateDragPreview(point, callbacks.getVehicle());
    });
    canvas.addEventListener('mouseleave', () => {
      this.pointer = null;
      if (this.dragState) this.dragState.previewAnchor = null;
    });
    canvas.addEventListener('mousedown', (event) => {
      this.handlePointerDown(this.toCanvasPoint(canvas, event, viewport), callbacks);
    });
    canvas.addEventListener('mouseup', (event) => {
      this.handlePointerUp(this.toCanvasPoint(canvas, event, viewport), callbacks);
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyR' || event.repeat) return;
      if (this.handleRotation(callbacks)) event.preventDefault();
    });
    canvas.addEventListener('click', (event) => {
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        return;
      }
      const point = this.toCanvasPoint(canvas, event, viewport);
      const mouseX = point.x;
      const mouseY = point.y;
      const vehicle = callbacks.getVehicle();
      const panelX = viewport.width - HUDManager.PANEL_WIDTH;

      if (mouseX >= panelX) {
        if (this.handlePanelClick(mouseX, mouseY, callbacks, vehicle)) return;
        return;
      }

      if (this.musicControlRect && this.contains(this.musicControlRect, mouseX, mouseY)) {
        this.onMusicControl?.();
        return;
      }

      const worldPoint = callbacks.screenToWorld(point);
      const cell = vehicle.getGridCellAtWorldPoint(worldPoint);
      if (cell) {
        const module = vehicle.getModuleAt(cell.x, cell.y);
        if (this.selectedInstallModuleId) {
          if (module) {
            this.setFeedback('Choose an empty grid cell.');
            return;
          }
          const orientation = this.selectedInstallOrientation;
          if (!vehicle.canInstallModule(this.selectedInstallModuleId, cell, orientation)) {
            this.setFeedback('The module footprint does not fit here.');
            return;
          }
          const installed = callbacks.installPurchasedModule(this.selectedInstallModuleId, cell, orientation);
          if (installed) {
            this.selectedInstanceId = installed.instanceId;
            this.selectedCell = null;
            this.selectedInstallModuleId = null;
            this.setFeedback('Combat module installed.', VisualTheme.color.success);
          } else {
            this.setFeedback('Combat module installation failed.');
          }
          return;
        }
        this.selectedCell = { gx: cell.x, gy: cell.y };
        this.selectedInstanceId = module?.instanceId ?? null;
        this.feedbackMessage = null;
        return;
      }
    });
  }

  public resetSelection(): void {
    this.selectedCell = null;
    this.selectedInstanceId = null;
    this.selectedInstallModuleId = null;
    this.selectedInstallOrientation = 0;
    this.dragState = null;
    this.suppressNextClick = false;
    this.feedbackMessage = null;
    this.nodeHitboxes = [];
    this.installHitboxes = [];
    this.purchaseHitboxes = [];
    this.subjectHitboxes = [];
  }

  public render(
    render: RenderContext,
    canvasWidth: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage,
    wave: number,
    enemiesRemaining: number,
    isPaused: boolean,
    camera: Camera,
  ): void {
    const ctx = render.ctx;
    const gameplayWidth = canvasWidth - HUDManager.PANEL_WIDTH;
    this.ensureSelectedSubject(vehicle);

    ctx.save();
    this.renderTopBar(render, canvasWidth, vehicle, storage, wave, enemiesRemaining, isPaused, gameplayWidth);
    this.renderSelection(ctx, vehicle, camera);
    this.renderModulePreviews(render, vehicle, camera, gameplayWidth, canvasHeight);

    if (isPaused) {
      this.renderPauseOverlay(render, gameplayWidth, canvasHeight);
    }

    this.renderPanel(render, canvasWidth, canvasHeight, vehicle, storage, isPaused);
    ctx.restore();
  }

  private handlePanelClick(
    mouseX: number,
    mouseY: number,
    callbacks: HUDCallbacks,
    vehicle: Vehicle
  ): boolean {
    for (const hitbox of this.subjectHitboxes) {
      if (this.contains(hitbox, mouseX, mouseY)) {
        this.selectedInstanceId = hitbox.instanceId;
        this.selectedCell = null;
        this.selectedInstallModuleId = null;
        this.feedbackMessage = null;
        return true;
      }
    }

    for (const hitbox of this.nodeHitboxes) {
      if (!this.contains(hitbox, mouseX, mouseY)) continue;
      const manager = callbacks.getUpgradeManager();
      const isArmoryNode = hitbox.instanceId === vehicle.systems.getInstanceId('armory');
      if (isArmoryNode && !callbacks.isPaused()) {
        this.setFeedback('Pause before researching Armory modules.');
        return true;
      }
      const selected = manager.select(hitbox.instanceId, hitbox.nodeId, callbacks.spendCost);
      if (selected) {
        if (isArmoryNode) callbacks.onArmoryResearchSuccess();
        else callbacks.onUpgradeSuccess();
      }
      this.setFeedback(selected ? 'Upgrade selected.' : 'Upgrade unavailable or too expensive.', selected ? VisualTheme.color.success : VisualTheme.color.danger);
      return true;
    }

    for (const hitbox of this.purchaseHitboxes) {
      if (!this.contains(hitbox, mouseX, mouseY)) continue;
      if (hitbox.action === 'purchase') {
        const purchased = callbacks.getArmory().purchase(hitbox.moduleId, callbacks.spendCost);
        if (purchased) callbacks.onArmoryPurchaseSuccess();
        this.setFeedback(purchased ? 'Combat module purchased.' : 'Purchase unavailable or too expensive.', purchased ? VisualTheme.color.success : VisualTheme.color.danger);
      } else if (!callbacks.isPaused()) {
        this.setFeedback('Pause before installing modules.');
      } else if (callbacks.getArmory().getStock(hitbox.moduleId) > 0) {
        this.selectedInstallModuleId = hitbox.moduleId;
        this.selectedInstallOrientation = vehicle.getCombatModuleDefinitions()
          .find((module) => module.id === hitbox.moduleId)?.defaultOrientation ?? 0;
        this.selectedCell = null;
        this.selectedInstanceId = vehicle.systems.getInstanceId('armory');
        this.setFeedback('Select an empty grid cell to install.', VisualTheme.color.success);
      }
      return true;
    }

    for (const hitbox of this.installHitboxes) {
      if (!this.contains(hitbox, mouseX, mouseY)) continue;
      if (!this.selectedCell) {
        this.setFeedback('Select an empty grid cell first.');
        return true;
      }
      if (!callbacks.isPaused()) {
        this.setFeedback('Pause before installing modules.');
        return true;
      }
      const anchor = { x: this.selectedCell.gx, y: this.selectedCell.gy };
      if (!vehicle.canInstallModule(hitbox.moduleId, anchor)) {
        this.setFeedback('The module footprint does not fit here.');
        return true;
      }

      const orientation = vehicle.getCombatModuleDefinitions()
        .find((module) => module.id === hitbox.moduleId)?.defaultOrientation ?? 0;
      const installed = callbacks.installPurchasedModule(hitbox.moduleId, anchor, orientation);
      if (!installed) {
        this.setFeedback('Module installation failed.');
        return true;
      }
      this.selectedInstanceId = installed.instanceId;
      this.selectedCell = null;
      this.selectedInstallModuleId = null;
      this.setFeedback('Combat module installed.', VisualTheme.color.success);
      return true;
    }

    return false;
  }

  private handlePointerDown(point: { x: number; y: number }, callbacks: HUDCallbacks): void {
    const vehicle = callbacks.getVehicle();
    const gameplayWidth = 1280 - HUDManager.PANEL_WIDTH;
    if (!callbacks.isPaused() || point.x >= gameplayWidth || this.selectedInstallModuleId) return;
    const worldPoint = this.screenToWorld?.(point);
    if (!worldPoint) return;
    const cell = vehicle.getGridCellAtWorldPoint(worldPoint);
    const module = cell ? vehicle.getModuleAt(cell.x, cell.y) : null;
    if (!module) return;

    this.dragState = {
      module,
      offset: { x: cell!.x - module.anchor.x, y: cell!.y - module.anchor.y },
      orientation: module.orientation,
      previewAnchor: { ...module.anchor },
    };
    this.selectedInstanceId = module.instanceId;
    this.selectedCell = null;
    this.feedbackMessage = null;
    this.suppressNextClick = true;
  }

  private handlePointerUp(point: { x: number; y: number }, callbacks: HUDCallbacks): void {
    if (!this.dragState) return;
    const vehicle = callbacks.getVehicle();
    this.updateDragPreview(point, vehicle);
    const drag = this.dragState;
    const moved = callbacks.isPaused() && drag.previewAnchor
      ? vehicle.moveModule(drag.module, drag.previewAnchor, drag.orientation)
      : false;
    this.setFeedback(
      moved ? 'Combat module moved.' : 'Invalid module placement; original position kept.',
      moved ? VisualTheme.color.success : VisualTheme.color.danger,
    );
    this.dragState = null;
    this.suppressNextClick = true;
  }

  private updateDragPreview(point: { x: number; y: number }, vehicle: Vehicle): void {
    if (!this.dragState) return;
    const gameplayWidth = 1280 - HUDManager.PANEL_WIDTH;
    if (point.x >= gameplayWidth) {
      this.dragState.previewAnchor = null;
      return;
    }
    const worldPoint = this.screenToWorld?.(point);
    const cell = worldPoint ? vehicle.getGridCellAtWorldPoint(worldPoint) : null;
    this.dragState.previewAnchor = cell
      ? { x: cell.x - this.dragState.offset.x, y: cell.y - this.dragState.offset.y }
      : null;
  }

  private handleRotation(callbacks: HUDCallbacks): boolean {
    if (!callbacks.isPaused()) return false;
    const vehicle = callbacks.getVehicle();
    if (this.selectedInstallModuleId) {
      this.selectedInstallOrientation = this.nextOrientation(this.selectedInstallOrientation);
      this.setFeedback(`Install direction ${this.selectedInstallOrientation * 90}° clockwise.`, VisualTheme.color.success);
      return true;
    }

    if (this.dragState) {
      this.dragState.orientation = this.nextOrientation(this.dragState.orientation);
      if (this.pointer) this.updateDragPreview(this.pointer, vehicle);
      this.setFeedback(`Module direction ${this.dragState.orientation * 90}° clockwise.`, VisualTheme.color.success);
      return true;
    }

    const module = this.selectedInstanceId && !this.selectedInstanceId.startsWith('builtin:')
      ? vehicle.getCombatModule(this.selectedInstanceId)
      : null;
    if (!module) return false;
    const rotated = vehicle.rotateModule(module);
    this.setFeedback(
      rotated ? `Module direction ${module.orientation * 90}° clockwise.` : 'The rotated footprint does not fit here.',
      rotated ? VisualTheme.color.success : VisualTheme.color.danger,
    );
    return true;
  }

  private nextOrientation(orientation: ModuleOrientation): ModuleOrientation {
    return ((orientation + 1) % 4) as ModuleOrientation;
  }

  private renderTopBar(
    render: RenderContext,
    canvasWidth: number,
    vehicle: Vehicle,
    storage: ResourceStorage,
    wave: number,
    enemiesRemaining: number,
    isPaused: boolean,
    gameplayWidth: number
  ): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    ctx.fillStyle = theme.surfaceTopbar;
    ctx.fillRect(0, 0, canvasWidth, VisualTheme.spacing.topBarHeight);

    const coreHp = vehicle.getCoreHp();
    const coreMaxHp = vehicle.getCoreMaxHp();
    this.drawIcon(render, 'ui.icon.core', 22, 25, 0.8);
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CORE', 38, 15);
    ctx.fillStyle = theme.surfaceElevated;
    ctx.fillRect(38, 22, 150, 10);
    ctx.fillStyle = coreHp > coreMaxHp * 0.4 ? theme.success : theme.danger;
    ctx.fillRect(38, 22, Math.max(0, Math.min(150, (coreHp / Math.max(1, coreMaxHp)) * 150)), 10);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '10px monospace';
    ctx.fillText(`${Math.ceil(coreHp)} / ${Math.ceil(coreMaxHp)}`, 38, 42);

    const resourceItems = [
      { label: 'RES', icon: 'ui.icon.resource', type: 'resource' as const },
      { label: 'MAT', icon: 'resource.icon.matter', type: 'matter' as const },
      { label: 'AMM', icon: 'resource.icon.ammo', type: 'ammo' as const },
      { label: 'NAN', icon: 'resource.icon.nano', type: 'nano' as const },
    ];
    resourceItems.forEach((item, index) => {
      const x = 210 + index * 106;
      this.drawIcon(render, item.icon, x + 10, 25, 0.72);
      ctx.fillStyle = theme.textSecondary;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(item.label, x + 23, 19);
      ctx.fillStyle = theme.resource;
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.floor(storage.get(item.type))}/${storage.getCapacity(item.type)}`, x + 23, 35);
    });

    const waveX = Math.max(650, gameplayWidth - 280);
    this.drawDiamond(ctx, waveX + 8, 22, 6, theme.accent, false);
    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`WAVE ${wave}`, waveX + 20, 20);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '10px monospace';
    ctx.fillText(`${enemiesRemaining} HOSTILES`, waveX + 20, 35);

    const controlsX = Math.max(waveX + 98, gameplayWidth - 178);
    ctx.fillStyle = theme.textMuted;
    ctx.font = '10px sans-serif';
    const musicRect = { x: gameplayWidth - 88, y: 5, width: 84, height: 36 };
    this.musicControlRect = musicRect;
    const musicVolume = this.getMusicVolume?.() ?? 0;
    ctx.fillStyle = musicVolume > 0 ? theme.surfaceSelected : theme.surfaceDisabled;
    ctx.fillRect(musicRect.x, musicRect.y, musicRect.width, musicRect.height);
    ctx.strokeStyle = musicVolume > 0 ? theme.accent : theme.borderMuted;
    ctx.lineWidth = 1;
    ctx.strokeRect(musicRect.x, musicRect.y, musicRect.width, musicRect.height);
    ctx.fillStyle = musicVolume > 0 ? theme.textPrimary : theme.textDisabled;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      musicVolume > 0 ? 'MUSIC ' + Math.round(musicVolume * 100) + '%' : 'MUSIC OFF',
      musicRect.x + musicRect.width / 2,
      musicRect.y + 22
    );
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.textMuted;
    ctx.font = '10px sans-serif';
    ctx.fillText('WASD MOVE', controlsX, 19);
    ctx.fillText(`SPACE ${isPaused ? 'RESUME' : 'PAUSE'}`, controlsX, 35);
  }

  private renderSelection(ctx: CanvasRenderingContext2D, vehicle: Vehicle, camera: Camera): void {
    if (this.selectedCell) {
      const selectedModule = vehicle.getModuleAt(this.selectedCell.gx, this.selectedCell.gy);
      if (selectedModule) {
        this.drawScreenPolygon(
          ctx,
          vehicle.getPlacementWorldCorners(selectedModule.moduleId, selectedModule.anchor, selectedModule.orientation)
            .map((point) => camera.worldToScreen(point)),
          VisualTheme.color.accent,
          3,
        );
        return;
      }
      const point = camera.worldToScreen(vehicle.getModuleWorldPos(this.selectedCell.gx, this.selectedCell.gy));
      ctx.strokeStyle = VisualTheme.color.warning;
      ctx.lineWidth = 3;
      ctx.strokeRect(point.x - vehicle.tileSize / 2 + 1, point.y - vehicle.tileSize / 2 + 1, vehicle.tileSize - 2, vehicle.tileSize - 2);
      return;
    }

    if (!this.selectedInstanceId || this.selectedInstanceId.startsWith('builtin:')) return;
    const selectedModule = vehicle.getCombatModule(this.selectedInstanceId);
    if (!selectedModule) return;
    this.drawScreenPolygon(
      ctx,
      vehicle.getPlacementWorldCorners(selectedModule.moduleId, selectedModule.anchor, selectedModule.orientation)
        .map((point) => camera.worldToScreen(point)),
      VisualTheme.color.accent,
      2,
    );
  }

  private renderModulePreviews(
    render: RenderContext,
    vehicle: Vehicle,
    camera: Camera,
    gameplayWidth: number,
    canvasHeight: number,
  ): void {
    const ctx = render.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, VisualTheme.spacing.topBarHeight, gameplayWidth, Math.max(0, canvasHeight - VisualTheme.spacing.topBarHeight));
    ctx.clip();

    if (this.dragState) {
      const drag = this.dragState;
      if (drag.previewAnchor) {
        const valid = vehicle.canMoveModule(drag.module, drag.previewAnchor, drag.orientation);
        this.drawPlacementGhost(render, vehicle, camera, drag.module.moduleId, drag.previewAnchor, drag.orientation, valid);
        const center = vehicle.getPlacementWorldCenter(drag.module.moduleId, drag.previewAnchor, drag.orientation);
        if (center) this.drawFireArcPreview(render, camera, center, vehicle.getPlacementFireAngle(drag.orientation), drag.module.fireArcDegrees, drag.module.getStat('range', 240), drag.module.moduleId);
      } else {
        this.drawFireArcPreview(render, camera, vehicle.getModuleWorldCenter(drag.module), vehicle.getModuleFireAngle(drag.module), drag.module.fireArcDegrees, drag.module.getStat('range', 240), drag.module.moduleId);
      }
    } else if (this.selectedInstallModuleId) {
      const anchor = this.getInstallPreviewAnchor(vehicle, gameplayWidth);
      if (anchor) {
        const definition = vehicle.getCombatModuleDefinitions().find((module) => module.id === this.selectedInstallModuleId);
        const center = vehicle.getPlacementWorldCenter(this.selectedInstallModuleId, anchor, this.selectedInstallOrientation);
        if (definition && center) {
          const valid = vehicle.canInstallModule(this.selectedInstallModuleId, anchor, this.selectedInstallOrientation);
          this.drawPlacementGhost(render, vehicle, camera, this.selectedInstallModuleId, anchor, this.selectedInstallOrientation, valid);
          this.drawFireArcPreview(render, camera, center, vehicle.getPlacementFireAngle(this.selectedInstallOrientation), definition.fireArcDegrees ?? 360, definition.baseStats.range ?? 240, definition.id);
        }
      }
    } else if (this.selectedInstanceId && !this.selectedInstanceId.startsWith('builtin:')) {
      const module = vehicle.getCombatModule(this.selectedInstanceId);
      if (module) {
        this.drawFireArcPreview(render, camera, vehicle.getModuleWorldCenter(module), vehicle.getModuleFireAngle(module), module.fireArcDegrees, module.getStat('range', 240), module.moduleId);
      }
    }

    ctx.restore();
  }

  private getInstallPreviewAnchor(vehicle: Vehicle, gameplayWidth: number): GridCell | null {
    if (!this.pointer || this.pointer.x >= gameplayWidth || !this.screenToWorld) return null;
    const worldPoint = this.screenToWorld(this.pointer);
    return vehicle.getGridCellAtWorldPoint(worldPoint);
  }

  private drawPlacementGhost(
    render: RenderContext,
    vehicle: Vehicle,
    camera: Camera,
    moduleId: string,
    anchor: GridCell,
    orientation: ModuleOrientation,
    valid: boolean,
  ): void {
    const points = vehicle.getPlacementWorldCorners(moduleId, anchor, orientation).map((point) => camera.worldToScreen(point));
    if (points.length === 0) return;
    const ctx = render.ctx;
    this.drawScreenPolygon(
      ctx,
      points,
      valid ? VisualTheme.color.success : VisualTheme.color.danger,
      2,
      valid ? 'rgba(102, 187, 106, 0.24)' : 'rgba(239, 83, 80, 0.24)',
    );
  }

  private drawFireArcPreview(
    render: RenderContext,
    camera: Camera,
    center: { x: number; y: number },
    fireAngle: number,
    fireArcDegrees: number,
    range: number,
    moduleId: string,
  ): void {
    const screenCenter = camera.worldToScreen(center);
    const radius = Math.min(220, Math.max(70, range));
    const halfArc = Math.min(Math.PI, Math.max(0, fireArcDegrees) * Math.PI / 360);
    const color = moduleId === 'arc-weapon' ? '#ab47bc' : '#29b6f6';
    const ctx = render.ctx;
    ctx.save();
    ctx.fillStyle = moduleId === 'arc-weapon' ? 'rgba(171, 71, 188, 0.12)' : 'rgba(41, 182, 246, 0.12)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(screenCenter.x, screenCenter.y);
    ctx.arc(screenCenter.x, screenCenter.y, radius, fireAngle - halfArc, fireAngle + halfArc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(screenCenter.x, screenCenter.y);
    ctx.lineTo(screenCenter.x + Math.cos(fireAngle) * radius, screenCenter.y + Math.sin(fireAngle) * radius);
    ctx.stroke();
    ctx.restore();
  }

  private drawScreenPolygon(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    stroke: string,
    lineWidth: number,
    fill?: string,
  ): void {
    if (points.length === 0) return;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    if (fill) ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private renderPauseOverlay(render: RenderContext, gameplayWidth: number, canvasHeight: number): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    const panelWidth = 460;
    const panelHeight = 150;
    const panelX = gameplayWidth / 2 - panelWidth / 2;
    const panelY = Math.max(110, canvasHeight / 2 - panelHeight / 2);

    ctx.save();
    ctx.fillStyle = theme.overlaySoft;
    ctx.fillRect(0, VisualTheme.spacing.topBarHeight, gameplayWidth, Math.max(0, canvasHeight - VisualTheme.spacing.topBarHeight));
    ctx.fillStyle = theme.surfacePanel;
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    this.drawPauseMarker(ctx, panelX + 42, panelY + 44, 10);
    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PAUSED', panelX + 66, panelY + 52);
    ctx.fillStyle = theme.textPrimary;
    ctx.font = '13px sans-serif';
    ctx.fillText('Install and upgrade modules while simulation is stopped.', panelX + 24, panelY + 88);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '11px monospace';
    ctx.fillText('SPACE / P  RESUME', panelX + 24, panelY + 119);
    ctx.restore();
  }

  private renderPanel(
    render: RenderContext,
    canvasWidth: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage,
    isPaused: boolean,
  ): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    const panelX = canvasWidth - HUDManager.PANEL_WIDTH;
    ctx.fillStyle = theme.surfacePanel;
    ctx.fillRect(panelX, VisualTheme.spacing.topBarHeight, HUDManager.PANEL_WIDTH, canvasHeight - VisualTheme.spacing.topBarHeight);
    ctx.strokeStyle = theme.divider;
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, VisualTheme.spacing.topBarHeight, HUDManager.PANEL_WIDTH, canvasHeight - VisualTheme.spacing.topBarHeight);

    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('UPGRADE WEB', panelX + 12, 73);
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`GRID ${vehicle.gridCols}x${vehicle.gridRows}`, canvasWidth - 12, 73);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Built-in systems are active from start', panelX + 12, 89);

    this.renderSubjectList(render, panelX, vehicle);
    const contentTop = this.getPanelContentTop(vehicle);
    if (this.selectedCell && !vehicle.getModuleAt(this.selectedCell.gx, this.selectedCell.gy)) {
      this.renderInstallPanel(render, panelX, canvasHeight, vehicle, contentTop, isPaused);
    } else if (this.selectedInstanceId === vehicle.systems.getInstanceId('armory')) {
      this.renderArmoryPanel(render, panelX, canvasHeight, vehicle, storage, contentTop, isPaused);
    } else {
      this.renderUpgradePanel(render, panelX, canvasHeight, vehicle, storage, contentTop);
    }

    if (this.feedbackMessage) {
      ctx.fillStyle = this.feedbackColor;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(this.feedbackMessage, panelX + 12, canvasHeight - 12);
    }
  }

  private renderSubjectList(render: RenderContext, panelX: number, vehicle: Vehicle): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    this.subjectHitboxes = [];
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('SYSTEMS', panelX + 12, 108);

    const builtinIds = vehicle.getBuiltInModuleIds();
    const builtinRows = Math.ceil(builtinIds.length / 2);
    for (let index = 0; index < builtinIds.length; index++) {
      const column = Math.floor(index / builtinRows);
      const row = index % builtinRows;
      const instanceId = vehicle.systems.getInstanceId(builtinIds[index]);
      this.renderSubjectButton(render, panelX + 8 + column * 164, 114 + row * 20, 158, instanceId, vehicle);
    }

    const combatModules = vehicle.getCombatModules();
    const combatY = this.getCombatSectionY(vehicle);
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('COMBAT MODULES', panelX + 12, combatY);
    for (let index = 0; index < combatModules.length; index++) {
      this.renderSubjectButton(render, panelX + 8 + (index % 2) * 164, combatY + 6 + Math.floor(index / 2) * 20, 158, combatModules[index].instanceId, vehicle);
    }
  }

  private renderSubjectButton(
    render: RenderContext,
    x: number,
    y: number,
    width: number,
    instanceId: string,
    vehicle: Vehicle
  ): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    const subject = this.getSubject(instanceId, vehicle);
    if (!subject) return;
    const selected = this.selectedInstanceId === instanceId && !this.selectedCell;
    const hovered = this.isHovered({ x, y, width, height: 18 });
    ctx.fillStyle = selected ? theme.surfaceSelected : hovered ? theme.surfaceNode : theme.surfaceElevated;
    ctx.fillRect(x, y, width, 18);
    ctx.strokeStyle = selected || hovered ? theme.accent : theme.border;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(x, y, width, 18);
    this.drawIcon(render, this.moduleIcon(subject.moduleId), x + 12, y + 9, 0.72);
    if (selected) this.drawStatusMarker(ctx, x + width - 10, y + 9, 'selected', 5);
    ctx.fillStyle = selected ? theme.white : theme.textPrimary;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(this.truncate(subject.definition.name, 17), x + 24, y + 13);
    ctx.fillStyle = theme.success;
    ctx.textAlign = 'right';
    ctx.fillText(subject.combatModule ? `Lv.${subject.combatModule.level}` : 'WEB', x + width - 5, y + 13);
    this.subjectHitboxes.push({ x, y, width, height: 18, instanceId });
  }

  private renderUpgradePanel(
    render: RenderContext,
    panelX: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage,
    top: number,
  ): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    this.nodeHitboxes = [];
    this.installHitboxes = [];
    this.purchaseHitboxes = [];
    const subject = this.selectedInstanceId ? this.getSubject(this.selectedInstanceId, vehicle) : null;
    if (!subject || !this.selectedInstanceId) {
      ctx.fillStyle = theme.textMuted;
      ctx.font = '12px sans-serif';
      ctx.fillText('Select a system or combat module.', panelX + 12, 280);
      return;
    }

    this.drawIcon(render, this.moduleIcon(subject.moduleId), panelX + 22, top, 0.8);
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(this.truncate(subject.definition.name, 28), panelX + 38, top + 6);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '11px sans-serif';
    ctx.fillText(subject.combatModule ? `HP ${Math.ceil(subject.combatModule.currentHp)} / ${Math.ceil(subject.combatModule.maxHp)}` : 'BUILT-IN / ACTIVE', panelX + 12, top + 22);
    this.renderUpgradeWeb(render, panelX, top + 34, canvasHeight - 32, this.selectedInstanceId, storage);
  }

  private renderInstallPanel(
    render: RenderContext,
    panelX: number,
    canvasHeight: number,
    vehicle: Vehicle,
    top: number,
    isPaused: boolean,
  ): void {
    if (!this.selectedCell) return;
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    this.nodeHitboxes = [];
    this.installHitboxes = [];
    this.purchaseHitboxes = [];
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`INSTALL AT [${this.selectedCell.gx}, ${this.selectedCell.gy}]`, panelX + 12, top);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '11px sans-serif';
    ctx.fillText('Purchased combat modules only · footprint anchor is top-left', panelX + 12, top + 16);

    const armory = this.getArmory?.();
    const modules = vehicle.getCombatModuleDefinitions().filter((module) => (armory?.getStock(module.id) ?? 0) > 0);
    if (modules.length === 0) {
      ctx.fillStyle = theme.textMuted;
      ctx.fillText('Purchase a module from ARMORY first.', panelX + 12, top + 48);
      return;
    }
    for (let index = 0; index < modules.length; index++) {
      const definition = modules[index];
      const y = top + 33 + index * 38;
      const canFit = vehicle.canInstallModule(definition.id, { x: this.selectedCell.gx, y: this.selectedCell.gy });
      const enabled = isPaused && canFit;
      ctx.fillStyle = enabled ? theme.surfaceAvailable : theme.surfaceDisabled;
      ctx.fillRect(panelX + 12, y, HUDManager.PANEL_WIDTH - 24, 30);
      ctx.strokeStyle = enabled ? theme.accent : theme.borderMuted;
      ctx.lineWidth = enabled ? 2 : 1;
      ctx.strokeRect(panelX + 12, y, HUDManager.PANEL_WIDTH - 24, 30);
      this.drawIcon(render, this.moduleIcon(definition.id), panelX + 29, y + 15, 0.72);
      const status = enabled ? 'available' : canFit ? 'insufficient' : 'disabled';
      this.drawStatusMarker(ctx, panelX + HUDManager.PANEL_WIDTH - 24, y + 15, status, 6);
      ctx.fillStyle = enabled ? theme.textPrimary : theme.textDisabled;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${this.truncate(definition.name, 17)} ${definition.size?.width}x${definition.size?.height}`, panelX + 42, y + 13);
      ctx.font = '10px sans-serif';
      ctx.fillText(`Owned ${armory?.getStock(definition.id) ?? 0}`, panelX + 42, y + 24);
      this.installHitboxes.push({ x: panelX + 12, y, width: HUDManager.PANEL_WIDTH - 24, height: 30, moduleId: definition.id });
    }

    ctx.fillStyle = theme.textMuted;
    ctx.font = '11px sans-serif';
    ctx.fillText('Multi-cell modules occupy every cell in their footprint.', panelX + 12, Math.min(canvasHeight - 32, top + 33 + modules.length * 38 + 10));
  }

  private renderArmoryPanel(
    render: RenderContext,
    panelX: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage,
    top: number,
    isPaused: boolean,
  ): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    this.nodeHitboxes = [];
    this.installHitboxes = [];
    this.purchaseHitboxes = [];
    this.drawIcon(render, this.moduleIcon('armory'), panelX + 22, top, 0.8);
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('ARMORY RESEARCH', panelX + 38, top + 6);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '11px sans-serif';
    ctx.fillText('Research modules, then purchase stock.', panelX + 12, top + 22);
    this.renderUpgradeWeb(
      render,
      panelX,
      top + 34,
      Math.min(canvasHeight - 190, top + 190),
      vehicle.systems.getInstanceId('armory'),
      storage,
    );
    this.renderArmoryModuleCards(render, panelX, top + 210, storage, isPaused);
  }

  private renderArmoryModuleCards(
    render: RenderContext,
    panelX: number,
    top: number,
    storage: ResourceStorage,
    isPaused: boolean,
  ): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    const armory = this.getArmory?.();
    if (!armory) return;
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('COMBAT MODULE STOCK', panelX + 12, top);

    for (const [index, definition] of armory.getCombatModuleDefinitions().entries()) {
      const y = top + 8 + index * 38;
      const researched = armory.isResearched(definition.id);
      const stock = armory.getStock(definition.id);
      const purchaseCost = armory.getPurchaseCost(definition.id);
      const canPurchase = researched && storage.canAfford(purchaseCost);
      const action = !researched ? 'LOCKED' : stock > 0 ? 'INSTALL' : 'PURCHASE';
      const enabled = action === 'INSTALL' ? isPaused : canPurchase;
      ctx.fillStyle = enabled ? theme.surfaceAvailable : theme.surfaceDisabled;
      ctx.fillRect(panelX + 12, y, HUDManager.PANEL_WIDTH - 24, 30);
      ctx.strokeStyle = enabled ? theme.accent : theme.borderMuted;
      ctx.lineWidth = enabled ? 2 : 1;
      ctx.strokeRect(panelX + 12, y, HUDManager.PANEL_WIDTH - 24, 30);
      this.drawIcon(render, this.moduleIcon(definition.id), panelX + 29, y + 15, 0.72);
      ctx.fillStyle = enabled ? theme.textPrimary : theme.textDisabled;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${this.truncate(definition.name, 18)} · ${definition.size?.width}x${definition.size?.height}`, panelX + 42, y + 13);
      ctx.font = '10px sans-serif';
      ctx.fillText(researched ? `Owned ${stock} · ${this.formatCost(purchaseCost)}` : 'Research required', panelX + 42, y + 24);
      ctx.fillStyle = enabled ? theme.accent : theme.textDisabled;
      ctx.textAlign = 'right';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(action, panelX + HUDManager.PANEL_WIDTH - 18, y + 18);
      ctx.textAlign = 'left';
      if (enabled) {
        this.purchaseHitboxes.push({
          x: panelX + HUDManager.PANEL_WIDTH - 92,
          y: y + 4,
          width: 74,
          height: 22,
          moduleId: definition.id,
          action: action === 'INSTALL' ? 'install' : 'purchase',
        });
      }
    }
  }

  private getCombatSectionY(vehicle: Vehicle): number {
    const builtinRows = Math.ceil(vehicle.getBuiltInModuleIds().length / 2);
    return 114 + builtinRows * 20 + 8;
  }

  private getPanelContentTop(vehicle: Vehicle): number {
    const combatRows = Math.max(1, Math.ceil(vehicle.getCombatModules().length / 2));
    return this.getCombatSectionY(vehicle) + 6 + combatRows * 20 + 18;
  }

  private renderUpgradeWeb(
    render: RenderContext,
    panelX: number,
    top: number,
    bottom: number,
    instanceId: string,
    storage: ResourceStorage
  ): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    const states = this.lastUpgradeStates(instanceId);
    const graphX = panelX + 10;
    const graphWidth = HUDManager.PANEL_WIDTH - 20;
    const nodeWidth = 98;
    const nodeHeight = 72;
    const positions = new Map<string, Rect>();
    const depths = new Map<string, number>();
    const getDepth = (state: UpgradeNodeState): number => {
      if (depths.has(state.definition.id)) return depths.get(state.definition.id)!;
      if (!state.definition.parentId) {
        depths.set(state.definition.id, 0);
        return 0;
      }
      const parent = states.find((candidate) => candidate.definition.id === state.definition.parentId);
      const depth = parent ? getDepth(parent) + 1 : 0;
      depths.set(state.definition.id, depth);
      return depth;
    };

    const maxDepth = states.reduce((max, state) => Math.max(max, getDepth(state)), 0);
    const levelGap = maxDepth > 0 ? Math.max(62, (bottom - top - nodeHeight) / maxDepth) : 0;
    for (let depth = 0; depth <= maxDepth; depth++) {
      const level = states.filter((state) => depths.get(state.definition.id) === depth);
      const spacing = graphWidth / (level.length + 1);
      level.forEach((state, index) => {
        positions.set(state.definition.id, {
          x: graphX + spacing * (index + 1) - nodeWidth / 2,
          y: top + depth * levelGap,
          width: nodeWidth,
          height: nodeHeight,
        });
      });
    }

    ctx.save();
    ctx.strokeStyle = theme.borderMuted;
    ctx.lineWidth = 1;
    for (const state of states) {
      if (!state.definition.parentId) continue;
      const parent = positions.get(state.definition.parentId);
      const child = positions.get(state.definition.id);
      if (!parent || !child) continue;
      ctx.beginPath();
      ctx.moveTo(parent.x + parent.width / 2, parent.y + parent.height);
      ctx.lineTo(child.x + child.width / 2, child.y);
      ctx.stroke();
    }

    this.nodeHitboxes = [];
    for (const state of states) {
      const rect = positions.get(state.definition.id);
      if (!rect) continue;
      const affordable = state.status === 'available' && storage.canAfford(state.definition.cost);
      const hovered = this.isHovered(rect);
      ctx.fillStyle = state.status === 'selected'
        ? theme.surfaceSelected
        : state.status === 'available' && affordable
          ? theme.surfaceAvailable
          : state.status === 'available' || state.status === 'disabled'
            ? theme.surfaceDisabled
            : theme.surfaceNode;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeStyle = state.status === 'selected'
        ? theme.success
        : state.status === 'available' && affordable
          ? theme.accent
          : state.status === 'available'
            ? theme.warning
            : hovered
              ? theme.accent
              : theme.borderMuted;
      ctx.lineWidth = state.status === 'selected' || hovered || affordable ? 2 : 1;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      const marker: MarkerKind = state.status === 'available' && !affordable ? 'insufficient' : state.status;
      this.drawStatusMarker(ctx, rect.x + 10, rect.y + 10, marker, 6);
      ctx.fillStyle = state.status === 'locked' || state.status === 'disabled' || !affordable ? theme.textDisabled : theme.textPrimary;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      const textX = rect.x + rect.width / 2 + 4;
      const textWidth = rect.width - 18;
      this.wrapText(ctx, state.definition.id, textWidth, 2).forEach((line, index) => {
        ctx.fillText(line, textX, rect.y + 15 + index * 11);
      });
      ctx.font = '10px sans-serif';
      ctx.fillText(state.status === 'selected' ? 'SELECTED' : this.formatCost(state.definition.cost), textX, rect.y + 40);
      ctx.fillStyle = theme.textSecondary;
      this.wrapText(ctx, this.formatEffects(state.definition), textWidth, 2).forEach((line, index) => {
        ctx.fillText(line, textX, rect.y + 54 + index * 11);
      });
      this.nodeHitboxes.push({ ...rect, instanceId, nodeId: state.definition.id });
    }
    ctx.restore();
  }

  private drawIcon(render: RenderContext, id: string, x: number, y: number, scale = 1): void {
    render.renderer.drawSprite(render, id, x, y, { scale });
  }

  private moduleIcon(moduleId: string): string {
    return `ui.icon.${moduleId}`;
  }

  private drawStatusMarker(ctx: CanvasRenderingContext2D, x: number, y: number, status: MarkerKind, size: number): void {
    const theme = VisualTheme.color;
    const color = status === 'selected'
      ? theme.success
      : status === 'available'
        ? theme.accent
        : status === 'insufficient'
          ? theme.warning
          : theme.textDisabled;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    if (status === 'available') {
      this.drawDiamond(ctx, x, y, size, color, false);
    } else if (status === 'selected') {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeStyle = theme.surfacePanel;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.3, y);
      ctx.lineTo(x - size * 0.05, y + size * 0.28);
      ctx.lineTo(x + size * 0.38, y - size * 0.3);
      ctx.stroke();
    } else if (status === 'insufficient') {
      ctx.beginPath();
      ctx.moveTo(x, y - size / 2);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.lineTo(x - size / 2, y + size / 2);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - size * 0.16);
      ctx.lineTo(x, y + size * 0.18);
      ctx.stroke();
      ctx.fillRect(x - 0.75, y + size * 0.28, 1.5, 1.5);
    } else if (status === 'locked') {
      ctx.strokeRect(x - size * 0.42, y - size * 0.02, size * 0.84, size * 0.58);
      ctx.beginPath();
      ctx.arc(x, y - size * 0.02, size * 0.3, Math.PI, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - size / 2, y - size / 2);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPauseMarker(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const theme = VisualTheme.color;
    ctx.save();
    ctx.fillStyle = theme.resource;
    ctx.fillRect(x - size * 0.55, y - size, size * 0.35, size * 2);
    ctx.fillRect(x + size * 0.2, y - size, size * 0.35, size * 2);
    ctx.restore();
  }

  private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, filled: boolean): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    if (filled) ctx.fill();
    else ctx.stroke();
    ctx.restore();
  }

  private isHovered(rect: Rect): boolean {
    return this.pointer ? this.contains(rect, this.pointer.x, this.pointer.y) : false;
  }

  private toCanvasPoint(canvas: HTMLCanvasElement, event: MouseEvent, viewport: LogicalViewport): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (viewport.width / rect.width),
      y: (event.clientY - rect.top) * (viewport.height / rect.height),
    };
  }

  private lastUpgradeStates(instanceId: string): UpgradeNodeState[] {
    return this.getUpgradeManager ? this.getUpgradeManager().getNodeStates(instanceId) : [];
  }

  private ensureSelectedSubject(vehicle: Vehicle): void {
    if (this.selectedInstanceId && this.getSubject(this.selectedInstanceId, vehicle)) return;
    const coreId = vehicle.systems.getInstanceId('core');
    this.selectedInstanceId = this.getSubject(coreId, vehicle) ? coreId : vehicle.getCombatModules()[0]?.instanceId ?? null;
  }

  private getSubject(instanceId: string, vehicle: Vehicle): Subject | null {
    if (instanceId.startsWith('builtin:')) {
      const moduleId = instanceId.slice('builtin:'.length);
      const definition = vehicle.getBuiltInDefinition(moduleId);
      return definition ? { instanceId, moduleId, definition, combatModule: null } : null;
    }
    const combatModule = vehicle.getCombatModules().find((module) => module.instanceId === instanceId) ?? null;
    if (!combatModule) return null;
    const definition = vehicle.getCombatModuleDefinitions().find((module) => module.id === combatModule.moduleId);
    return definition ? { instanceId, moduleId: combatModule.moduleId, definition, combatModule } : null;
  }

  private contains(rect: Rect, x: number, y: number): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private setFeedback(message: string, color: string = VisualTheme.color.danger): void {
    this.feedbackMessage = message;
    this.feedbackColor = color;
  }

  private formatCost(cost: ResourceCost): string {
    const entries = Object.entries(cost).filter(([, amount]) => (amount ?? 0) > 0);
    return entries.length === 0 ? 'FREE' : entries.map(([type, amount]) => `${type[0].toUpperCase()}:${amount}`).join(' ');
  }

  private formatEffects(node: UpgradeNodeDefinition): string {
    return node.effects
      .map((effect) => {
        const stat = effect.stat
          .replace('production', 'prod.')
          .replace('Interval', 'Int.')
          .replace('movementSpeed', 'move');
        const value = effect.operation === 'multiply' ? `x${effect.value}` : `+${effect.value}`;
        return `${stat} ${value}`;
      })
      .join(' ');
  }

  private wrapText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines: number): string[] {
    if (!value) return [];

    const lines: string[] = [];
    let current = '';
    for (const word of value.trim().split(/\s+/)) {
      if (ctx.measureText(word).width <= maxWidth) {
        const candidate = current ? `${current} ${word}` : word;
        if (!current || ctx.measureText(candidate).width <= maxWidth) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
        continue;
      }

      if (current) {
        lines.push(current);
        current = '';
      }
      let chunk = '';
      for (const character of word) {
        if (chunk && ctx.measureText(`${chunk}${character}`).width > maxWidth) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk += character;
        }
      }
      current = chunk;
    }
    if (current) lines.push(current);

    if (lines.length <= maxLines) return lines;
    const visible = lines.slice(0, maxLines);
    let last = visible[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    visible[maxLines - 1] = `${last}…`;
    return visible;
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
  }
}
