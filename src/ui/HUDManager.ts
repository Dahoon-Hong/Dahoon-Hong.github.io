import { ResourceStorage } from '../core/ResourceStorage';
import { ResourceCost, TankModuleDefinition, UpgradeNodeDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager, UpgradeNodeState } from '../core/UpgradeManager';
import { CombatModule } from '../entities/Module';
import { Vehicle } from '../entities/Vehicle';

interface HUDCallbacks {
  getVehicle: () => Vehicle;
  getStorage: () => ResourceStorage;
  getUpgradeManager: () => UpgradeManager;
  spendCost: (cost: ResourceCost) => boolean;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

export class HUDManager {
  public static readonly PANEL_WIDTH = 340;

  private selectedCell: { gx: number; gy: number } | null = null;
  private selectedInstanceId: string | null = null;
  private feedbackMessage: string | null = null;
  private feedbackColor = '#e57373';
  private nodeHitboxes: NodeHitbox[] = [];
  private installHitboxes: InstallHitbox[] = [];
  private subjectHitboxes: Array<Rect & { instanceId: string }> = [];
  private getUpgradeManager: (() => UpgradeManager) | null = null;

  public setupMouseListeners(canvas: HTMLCanvasElement, callbacks: HUDCallbacks): void {
    this.getUpgradeManager = callbacks.getUpgradeManager;
    canvas.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
      const mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
      const vehicle = callbacks.getVehicle();
      const panelX = canvas.width - HUDManager.PANEL_WIDTH;

      if (mouseX >= panelX) {
        if (this.handlePanelClick(mouseX, mouseY, callbacks, vehicle)) return;
        return;
      }

      for (let gy = 0; gy < vehicle.gridRows; gy++) {
        for (let gx = 0; gx < vehicle.gridCols; gx++) {
          const pos = vehicle.getModuleWorldPos(gx, gy);
          const half = vehicle.tileSize / 2;
          if (mouseX < pos.x - half || mouseX > pos.x + half || mouseY < pos.y - half || mouseY > pos.y + half) continue;

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
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage,
    wave: number,
    enemiesRemaining: number,
    isPaused: boolean
  ): void {
    const gameplayWidth = canvasWidth - HUDManager.PANEL_WIDTH;
    this.ensureSelectedSubject(vehicle);

    ctx.save();
    this.renderTopBar(ctx, canvasWidth, vehicle, storage, wave, enemiesRemaining, isPaused, gameplayWidth);
    this.renderSelection(ctx, vehicle);

    if (isPaused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 50, gameplayWidth, Math.max(0, canvasHeight - 50));
      ctx.fillStyle = '#ffd54f';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED - Manage & Upgrade Modules', gameplayWidth / 2, 90);
    }

    this.renderPanel(ctx, canvasWidth, canvasHeight, vehicle, storage);
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
      this.setFeedback(selected ? 'Upgrade selected.' : 'Upgrade unavailable or too expensive.', selected ? '#81c784' : '#e57373');
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
      this.setFeedback('Combat module installed.', '#81c784');
      return true;
    }

    return false;
  }

  private renderTopBar(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    vehicle: Vehicle,
    storage: ResourceStorage,
    wave: number,
    enemiesRemaining: number,
    isPaused: boolean,
    gameplayWidth: number
  ): void {
    ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
    ctx.fillRect(0, 0, canvasWidth, 50);

    const coreHp = vehicle.getCoreHp();
    const coreMaxHp = vehicle.getCoreMaxHp();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`CORE HP: ${Math.ceil(coreHp)} / ${Math.ceil(coreMaxHp)}`, 20, 30);
    ctx.fillStyle = '#333344';
    ctx.fillRect(180, 15, 150, 18);
    ctx.fillStyle = coreHp > coreMaxHp * 0.4 ? '#00e676' : '#ff3d00';
    ctx.fillRect(180, 15, Math.max(0, Math.min(150, (coreHp / Math.max(1, coreMaxHp)) * 150)), 18);

    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(
      `R:${Math.floor(storage.get('resource'))}/${storage.getCapacity('resource')}  M:${Math.floor(storage.get('matter'))}/${storage.getCapacity('matter')}  A:${Math.floor(storage.get('ammo'))}/${storage.getCapacity('ammo')}  N:${Math.floor(storage.get('nano'))}/${storage.getCapacity('nano')}`,
      350,
      30
    );

    ctx.fillStyle = '#4deaea';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`WAVE: ${wave} (${enemiesRemaining})`, Math.max(650, gameplayWidth - 280), 30);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '13px sans-serif';
    ctx.fillText(`[WASD]: Move | [Space]: ${isPaused ? 'RESUME' : 'PAUSE'}`, Math.max(650, gameplayWidth - 145), 30);
  }

  private renderSelection(ctx: CanvasRenderingContext2D, vehicle: Vehicle): void {
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
    ctx.strokeStyle = selectedModule ? '#4deaea' : '#ffff00';
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
  }

  private renderPanel(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage
  ): void {
    const panelX = canvasWidth - HUDManager.PANEL_WIDTH;
    ctx.fillStyle = 'rgba(16, 18, 30, 0.97)';
    ctx.fillRect(panelX, 50, HUDManager.PANEL_WIDTH, canvasHeight - 50);
    ctx.strokeStyle = '#263c58';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, 50, HUDManager.PANEL_WIDTH, canvasHeight - 50);

    ctx.fillStyle = '#4deaea';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('UPGRADE WEB', panelX + 12, 73);
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`GRID ${vehicle.gridCols}x${vehicle.gridRows}`, canvasWidth - 12, 73);
    ctx.fillStyle = '#899bb1';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Built-in systems are active from start', panelX + 12, 89);

    this.renderSubjectList(ctx, panelX, vehicle);
    if (this.selectedCell && !vehicle.getModuleAt(this.selectedCell.gx, this.selectedCell.gy)) {
      this.renderInstallPanel(ctx, panelX, canvasHeight, vehicle, storage);
    } else {
      this.renderUpgradePanel(ctx, panelX, canvasHeight, vehicle, storage);
    }

    if (this.feedbackMessage) {
      ctx.fillStyle = this.feedbackColor;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(this.feedbackMessage, panelX + 12, canvasHeight - 12);
    }
  }

  private renderSubjectList(ctx: CanvasRenderingContext2D, panelX: number, vehicle: Vehicle): void {
    this.subjectHitboxes = [];
    ctx.fillStyle = '#b4c7dc';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('SYSTEMS', panelX + 12, 108);

    const builtinIds = vehicle.getBuiltInModuleIds();
    for (let index = 0; index < builtinIds.length; index++) {
      const column = Math.floor(index / 5);
      const row = index % 5;
      const instanceId = vehicle.systems.getInstanceId(builtinIds[index]);
      this.renderSubjectButton(ctx, panelX + 8 + column * 164, 114 + row * 20, 158, instanceId, vehicle);
    }

    const combatModules = vehicle.getCombatModules();
    const combatY = 222;
    ctx.fillStyle = '#b4c7dc';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('COMBAT MODULES', panelX + 12, combatY);
    for (let index = 0; index < combatModules.length; index++) {
      this.renderSubjectButton(ctx, panelX + 8 + (index % 2) * 164, combatY + 6 + Math.floor(index / 2) * 20, 158, combatModules[index].instanceId, vehicle);
    }
  }

  private renderSubjectButton(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    instanceId: string,
    vehicle: Vehicle
  ): void {
    const subject = this.getSubject(instanceId, vehicle);
    if (!subject) return;
    const selected = this.selectedInstanceId === instanceId && !this.selectedCell;
    ctx.fillStyle = selected ? '#204b5e' : '#1c2636';
    ctx.fillRect(x, y, width, 18);
    ctx.strokeStyle = selected ? '#4deaea' : '#33445d';
    ctx.strokeRect(x, y, width, 18);
    ctx.fillStyle = selected ? '#ffffff' : '#afbed0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(this.truncate(subject.definition.name, 20), x + 5, y + 13);
    ctx.fillStyle = '#81c784';
    ctx.textAlign = 'right';
    ctx.fillText(subject.combatModule ? `Lv.${subject.combatModule.level}` : 'WEB', x + width - 5, y + 13);
    this.subjectHitboxes.push({ x, y, width, height: 18, instanceId });
  }

  private renderUpgradePanel(
    ctx: CanvasRenderingContext2D,
    panelX: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage
  ): void {
    this.nodeHitboxes = [];
    this.installHitboxes = [];
    const subject = this.selectedInstanceId ? this.getSubject(this.selectedInstanceId, vehicle) : null;
    if (!subject || !this.selectedInstanceId) {
      ctx.fillStyle = '#68778c';
      ctx.font = '12px sans-serif';
      ctx.fillText('Select a system or combat module.', panelX + 12, 280);
      return;
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(subject.definition.name, panelX + 12, 272);
    ctx.fillStyle = '#8295aa';
    ctx.font = '11px sans-serif';
    ctx.fillText(subject.combatModule ? `HP ${Math.ceil(subject.combatModule.currentHp)} / ${Math.ceil(subject.combatModule.maxHp)}` : 'BUILT-IN / ACTIVE', panelX + 12, 288);
    this.renderUpgradeWeb(ctx, panelX, 300, canvasHeight - 32, this.selectedInstanceId, storage);
  }

  private renderInstallPanel(
    ctx: CanvasRenderingContext2D,
    panelX: number,
    canvasHeight: number,
    vehicle: Vehicle,
    storage: ResourceStorage
  ): void {
    if (!this.selectedCell) return;
    this.nodeHitboxes = [];
    this.installHitboxes = [];
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`INSTALL AT [${this.selectedCell.gx}, ${this.selectedCell.gy}]`, panelX + 12, 272);
    ctx.fillStyle = '#8295aa';
    ctx.font = '11px sans-serif';
    ctx.fillText('Combat modules only · footprint anchor is top-left', panelX + 12, 288);

    const modules = vehicle.getCombatModuleDefinitions();
    for (let index = 0; index < modules.length; index++) {
      const definition = modules[index];
      const y = 305 + index * 38;
      const canFit = vehicle.canInstallModule(definition.id, { x: this.selectedCell.gx, y: this.selectedCell.gy });
      const canAfford = storage.canAfford(definition.installCost ?? {});
      const enabled = canFit && canAfford;
      ctx.fillStyle = enabled ? '#1d4960' : '#292d39';
      ctx.fillRect(panelX + 12, y, HUDManager.PANEL_WIDTH - 24, 30);
      ctx.strokeStyle = enabled ? '#4deaea' : '#525868';
      ctx.strokeRect(panelX + 12, y, HUDManager.PANEL_WIDTH - 24, 30);
      ctx.fillStyle = enabled ? '#ffffff' : '#858b99';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${this.truncate(definition.name, 21)} ${definition.size?.width}x${definition.size?.height}`, panelX + 20, y + 13);
      ctx.font = '10px sans-serif';
      ctx.fillText(`Cost ${this.formatCost(definition.installCost ?? {})}`, panelX + 20, y + 24);
      this.installHitboxes.push({ x: panelX + 12, y, width: HUDManager.PANEL_WIDTH - 24, height: 30, moduleId: definition.id });
    }

    ctx.fillStyle = '#718096';
    ctx.font = '11px sans-serif';
    ctx.fillText('Multi-cell modules occupy every cell in their footprint.', panelX + 12, Math.min(canvasHeight - 32, 405));
  }

  private renderUpgradeWeb(
    ctx: CanvasRenderingContext2D,
    panelX: number,
    top: number,
    bottom: number,
    instanceId: string,
    storage: ResourceStorage
  ): void {
    const states = this.lastUpgradeStates(instanceId);
    const graphX = panelX + 10;
    const graphWidth = HUDManager.PANEL_WIDTH - 20;
    const nodeWidth = 98;
    const nodeHeight = 50;
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
    ctx.strokeStyle = '#46627b';
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
      const color = state.status === 'selected' ? '#1b7c62' : state.status === 'available' && storage.canAfford(state.definition.cost) ? '#164f81' : state.status === 'disabled' ? '#3d3545' : '#2b3443';
      ctx.fillStyle = color;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeStyle = state.status === 'available' ? '#4deaea' : state.status === 'selected' ? '#81c784' : '#566275';
      ctx.lineWidth = state.status === 'available' ? 2 : 1;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.fillStyle = state.status === 'locked' || state.status === 'disabled' ? '#7f8998' : '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.truncate(state.definition.id, 15), rect.x + rect.width / 2, rect.y + 17);
      ctx.font = '10px sans-serif';
      ctx.fillText(state.status === 'selected' ? 'SELECTED' : this.formatCost(state.definition.cost), rect.x + rect.width / 2, rect.y + 31);
      ctx.fillStyle = '#b7c8d8';
      ctx.fillText(this.truncate(this.formatEffects(state.definition), 18), rect.x + rect.width / 2, rect.y + 44);
      this.nodeHitboxes.push({ ...rect, instanceId, nodeId: state.definition.id });
    }
    ctx.restore();
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

  private setFeedback(message: string, color = '#e57373'): void {
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

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
  }
}
