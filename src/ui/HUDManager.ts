import { ResourceStorage } from '../core/ResourceStorage';
import { ResourceCost, TankModuleDefinition, UpgradeNodeDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager, UpgradeNodeState } from '../core/UpgradeManager';
import { CombatModule } from '../entities/Module';
import { Vehicle } from '../entities/Vehicle';
import type { RenderContext } from '../rendering/RenderContext';
import { VisualTheme } from '../rendering/VisualTheme';
import type { Camera } from '../core/Camera';

interface HUDCallbacks {
  getVehicle: () => Vehicle;
  getStorage: () => ResourceStorage;
  getUpgradeManager: () => UpgradeManager;
  spendCost: (cost: ResourceCost) => boolean;
  onUpgradeSuccess: () => void;
  getMusicVolume: () => number;
  onMusicControl: () => void;
  screenToWorld: (point: { x: number; y: number }) => { x: number; y: number };
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

interface LogicalViewport {
  width: number;
  height: number;
}

export class HUDManager {
  public static readonly PANEL_WIDTH = 340;

  private selectedCell: { gx: number; gy: number } | null = null;
  private selectedInstanceId: string | null = null;
  private feedbackMessage: string | null = null;
  private feedbackColor: string = VisualTheme.color.danger;
  private nodeHitboxes: NodeHitbox[] = [];
  private installHitboxes: InstallHitbox[] = [];
  private subjectHitboxes: Array<Rect & { instanceId: string }> = [];
  private getUpgradeManager: (() => UpgradeManager) | null = null;
  private getMusicVolume: (() => number) | null = null;
  private onMusicControl: (() => void) | null = null;
  private musicControlRect: Rect | null = null;
  private pointer: { x: number; y: number } | null = null;

  public setupMouseListeners(
    canvas: HTMLCanvasElement,
    callbacks: HUDCallbacks,
    viewport: LogicalViewport = { width: canvas.width, height: canvas.height },
  ): void {
    this.getUpgradeManager = callbacks.getUpgradeManager;
    this.getMusicVolume = callbacks.getMusicVolume;
    this.onMusicControl = callbacks.onMusicControl;
    canvas.addEventListener('mousemove', (event) => {
      this.pointer = this.toCanvasPoint(canvas, event, viewport);
    });
    canvas.addEventListener('mouseleave', () => {
      this.pointer = null;
    });
    canvas.addEventListener('click', (event) => {
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
      for (let gy = 0; gy < vehicle.gridRows; gy++) {
        for (let gx = 0; gx < vehicle.gridCols; gx++) {
          const pos = vehicle.getModuleWorldPos(gx, gy);
          const half = vehicle.tileSize / 2;
          if (worldPoint.x < pos.x - half || worldPoint.x > pos.x + half || worldPoint.y < pos.y - half || worldPoint.y > pos.y + half) continue;

          this.selectedCell = { gx, gy };
          const module = vehicle.getModuleAt(gx, gy);
          this.selectedInstanceId = module?.instanceId ?? null;
          this.feedbackMessage = null;
          return;
        }
      }
    });
  }

  public resetSelection(): void {
    this.selectedCell = null;
    this.selectedInstanceId = null;
    this.feedbackMessage = null;
    this.nodeHitboxes = [];
    this.installHitboxes = [];
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

    if (isPaused) {
      this.renderPauseOverlay(render, gameplayWidth, canvasHeight);
    }

    this.renderPanel(render, canvasWidth, canvasHeight, vehicle, storage);
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
        this.feedbackMessage = null;
        return true;
      }
    }

    for (const hitbox of this.nodeHitboxes) {
      if (!this.contains(hitbox, mouseX, mouseY)) continue;
      const manager = callbacks.getUpgradeManager();
      const selected = manager.select(hitbox.instanceId, hitbox.nodeId, callbacks.spendCost);
      if (selected) callbacks.onUpgradeSuccess();
      this.setFeedback(selected ? 'Upgrade selected.' : 'Upgrade unavailable or too expensive.', selected ? VisualTheme.color.success : VisualTheme.color.danger);
      return true;
    }

    for (const hitbox of this.installHitboxes) {
      if (!this.contains(hitbox, mouseX, mouseY)) continue;
      if (!this.selectedCell) {
        this.setFeedback('Select an empty grid cell first.');
        return true;
      }
      const anchor = { x: this.selectedCell.gx, y: this.selectedCell.gy };
      if (!vehicle.canInstallModule(hitbox.moduleId, anchor)) {
        this.setFeedback('The module footprint does not fit here.');
        return true;
      }

      const definition = vehicle.getCombatModuleDefinitions().find((module) => module.id === hitbox.moduleId);
      if (!definition || !callbacks.getStorage().canAfford(definition.installCost ?? {})) {
        this.setFeedback('Not enough resource for this combat module.');
        return true;
      }

      if (!callbacks.spendCost(definition.installCost ?? {})) {
        this.setFeedback('Module installation failed.');
        return true;
      }
      const installed = vehicle.installModule(hitbox.moduleId, anchor);
      if (!installed) {
        this.setFeedback('Module installation failed.');
        return true;
      }
      this.selectedInstanceId = installed.instanceId;
      this.selectedCell = null;
      this.setFeedback('Combat module installed.', VisualTheme.color.success);
      return true;
    }

    return false;
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
    if (!this.selectedCell) return;
    const selectedModule = vehicle.getModuleAt(this.selectedCell.gx, this.selectedCell.gy);
    const rect = selectedModule
      ? vehicle.getModuleWorldRect(selectedModule)
      : {
          x: vehicle.getModuleWorldPos(this.selectedCell.gx, this.selectedCell.gy).x - vehicle.tileSize / 2,
          y: vehicle.getModuleWorldPos(this.selectedCell.gx, this.selectedCell.gy).y - vehicle.tileSize / 2,
          width: vehicle.tileSize,
          height: vehicle.tileSize,
        };
    const screen = camera.worldToScreen({ x: rect.x, y: rect.y });
    ctx.strokeStyle = selectedModule ? VisualTheme.color.accent : VisualTheme.color.warning;
    ctx.lineWidth = 3;
    ctx.strokeRect(screen.x + 1, screen.y + 1, rect.width - 2, rect.height - 2);
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
    storage: ResourceStorage
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
    if (this.selectedCell && !vehicle.getModuleAt(this.selectedCell.gx, this.selectedCell.gy)) {
      this.renderInstallPanel(render, panelX, canvasHeight, vehicle, storage);
    } else {
      this.renderUpgradePanel(render, panelX, canvasHeight, vehicle, storage);
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
    for (let index = 0; index < builtinIds.length; index++) {
      const column = Math.floor(index / 5);
      const row = index % 5;
      const instanceId = vehicle.systems.getInstanceId(builtinIds[index]);
      this.renderSubjectButton(render, panelX + 8 + column * 164, 114 + row * 20, 158, instanceId, vehicle);
    }

    const combatModules = vehicle.getCombatModules();
    const combatY = 222;
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
    storage: ResourceStorage
  ): void {
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    this.nodeHitboxes = [];
    this.installHitboxes = [];
    const subject = this.selectedInstanceId ? this.getSubject(this.selectedInstanceId, vehicle) : null;
    if (!subject || !this.selectedInstanceId) {
      ctx.fillStyle = theme.textMuted;
      ctx.font = '12px sans-serif';
      ctx.fillText('Select a system or combat module.', panelX + 12, 280);
      return;
    }

    this.drawIcon(render, this.moduleIcon(subject.moduleId), panelX + 22, 266, 0.8);
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(this.truncate(subject.definition.name, 28), panelX + 38, 272);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '11px sans-serif';
    ctx.fillText(subject.combatModule ? `HP ${Math.ceil(subject.combatModule.currentHp)} / ${Math.ceil(subject.combatModule.maxHp)}` : 'BUILT-IN / ACTIVE', panelX + 12, 288);
    this.renderUpgradeWeb(render, panelX, 300, canvasHeight - 32, this.selectedInstanceId, storage);
  }

  private renderInstallPanel(
    render: RenderContext,
    panelX: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage
  ): void {
    if (!this.selectedCell) return;
    const ctx = render.ctx;
    const theme = VisualTheme.color;
    this.nodeHitboxes = [];
    this.installHitboxes = [];
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`INSTALL AT [${this.selectedCell.gx}, ${this.selectedCell.gy}]`, panelX + 12, 272);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '11px sans-serif';
    ctx.fillText('Combat modules only · footprint anchor is top-left', panelX + 12, 288);

    const modules = vehicle.getCombatModuleDefinitions();
    for (let index = 0; index < modules.length; index++) {
      const definition = modules[index];
      const y = 305 + index * 38;
      const canFit = vehicle.canInstallModule(definition.id, { x: this.selectedCell.gx, y: this.selectedCell.gy });
      const canAfford = storage.canAfford(definition.installCost ?? {});
      const enabled = canFit && canAfford;
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
      ctx.fillText(`Cost ${this.formatCost(definition.installCost ?? {})}`, panelX + 42, y + 24);
      this.installHitboxes.push({ x: panelX + 12, y, width: HUDManager.PANEL_WIDTH - 24, height: 30, moduleId: definition.id });
    }

    ctx.fillStyle = theme.textMuted;
    ctx.font = '11px sans-serif';
    ctx.fillText('Multi-cell modules occupy every cell in their footprint.', panelX + 12, Math.min(canvasHeight - 32, 405));
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
