import { ResourceStorage } from '../core/ResourceStorage';
import { Vehicle } from '../entities/Vehicle';
import {
  ResourceModule,
  GathererModule,
  RecyclerModule,
  ArsenalModule,
  MatterComposerModule,
  RailModule,
  DirectWeaponModule,
  ArcWeaponModule,
  PowerPackModule,
  CaterpillarTrackModule,
  ArmorPlateModule,
  BaseModule,
  ModuleType,
} from '../entities/Module';

const SHOP_BUTTON_X = 20;
const SHOP_BUTTON_WIDTH = 150;
const SHOP_BUTTON_HEIGHT = 48;
const SHOP_BUTTON_GAP = 5;
const SHOP_COLUMNS = 8;
const SHOP_PANEL_PADDING = 10;
const SHOP_ITEMS: readonly { type: ModuleType; cost: number; label: string }[] = [
  { type: 'RESOURCE', cost: 20, label: '+ Resource Gen (20)' },
  { type: 'GATHERER', cost: 25, label: '+ Gatherer (25)' },
  { type: 'RECYCLER', cost: 20, label: '+ Recycler (20)' },
  { type: 'ARSENAL', cost: 20, label: '+ Arsenal (20)' },
  { type: 'COMPOSER', cost: 25, label: '+ Composer (25)' },
  { type: 'RAIL', cost: 10, label: '+ Rail (10)' },
  { type: 'DIRECT_WEAPON', cost: 30, label: '+ Gatling (30)' },
  { type: 'ARC_WEAPON', cost: 50, label: '+ Mortar (50)' },
  { type: 'POWER_PACK', cost: 40, label: '+ Power Pack (40)' },
  { type: 'CATERPILLAR_TRACK', cost: 35, label: '+ Track (35)' },
  { type: 'ARMOR_PLATE', cost: 30, label: '+ Armor (30)' },
];
const SHOP_ROWS = Math.ceil(SHOP_ITEMS.length / SHOP_COLUMNS);
const SHOP_PANEL_HEIGHT =
  SHOP_PANEL_PADDING * 2 +
  SHOP_ROWS * SHOP_BUTTON_HEIGHT +
  (SHOP_ROWS - 1) * SHOP_BUTTON_GAP;

function getShopButtonRect(index: number, canvasHeight: number): { x: number; y: number } {
  const row = Math.floor(index / SHOP_COLUMNS);
  const column = index % SHOP_COLUMNS;
  return {
    x: SHOP_BUTTON_X + column * (SHOP_BUTTON_WIDTH + SHOP_BUTTON_GAP),
    y: canvasHeight - SHOP_PANEL_HEIGHT + SHOP_PANEL_PADDING + row * (SHOP_BUTTON_HEIGHT + SHOP_BUTTON_GAP),
  };
}

export class HUDManager {
  private selectedTile: { gx: number; gy: number } | null = null;
  private feedbackMessage: string | null = null;
  private feedbackColor = '#e57373';

  private setFeedback(message: string, color = '#e57373'): void {
    this.feedbackMessage = message;
    this.feedbackColor = color;
  }

  public setupMouseListeners(
    canvas: HTMLCanvasElement,
    getVehicle: () => Vehicle,
    getResource: () => number,
    spendResource: (amount: number) => boolean
  ): void {
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      const vehicle = getVehicle();

      for (let gy = 0; gy < vehicle.gridRows; gy++) {
        for (let gx = 0; gx < vehicle.gridCols; gx++) {
          const pos = vehicle.getModuleWorldPos(gx, gy);
          const half = vehicle.tileSize / 2;
          if (
            mouseX >= pos.x - half &&
            mouseX <= pos.x + half &&
            mouseY >= pos.y - half &&
            mouseY <= pos.y + half
          ) {
            this.selectedTile = { gx, gy };
            this.feedbackMessage = null;
            return;
          }
        }
      }

      for (let i = 0; i < SHOP_ITEMS.length; i++) {
        const { x: btnX, y: btnY } = getShopButtonRect(i, canvas.height);
        if (
          mouseX >= btnX &&
          mouseX <= btnX + SHOP_BUTTON_WIDTH &&
          mouseY >= btnY &&
          mouseY <= btnY + SHOP_BUTTON_HEIGHT
        ) {
          if (!this.selectedTile) {
            this.setFeedback('Select a grid slot first.');
            return;
          }

          const { gx, gy } = this.selectedTile;
          if (vehicle.getModuleAt(gx, gy)) {
            this.setFeedback('This slot is already occupied.');
            return;
          }

          const item = SHOP_ITEMS[i];
          if (getResource() < item.cost) {
            this.setFeedback(`Not enough resource. Need ${item.cost}.`);
            return;
          }

          let newModule: BaseModule | null = null;
          if (item.type === 'RESOURCE') newModule = new ResourceModule(gx, gy);
          else if (item.type === 'GATHERER') newModule = new GathererModule(gx, gy);
          else if (item.type === 'RECYCLER') newModule = new RecyclerModule(gx, gy);
          else if (item.type === 'ARSENAL') newModule = new ArsenalModule(gx, gy);
          else if (item.type === 'COMPOSER') newModule = new MatterComposerModule(gx, gy);
          else if (item.type === 'RAIL') newModule = new RailModule(gx, gy);
          else if (item.type === 'DIRECT_WEAPON') newModule = new DirectWeaponModule(gx, gy);
          else if (item.type === 'ARC_WEAPON') newModule = new ArcWeaponModule(gx, gy);
          else if (item.type === 'POWER_PACK') newModule = new PowerPackModule(gx, gy);
          else if (item.type === 'CATERPILLAR_TRACK') newModule = new CaterpillarTrackModule(gx, gy);
          else if (item.type === 'ARMOR_PLATE') newModule = new ArmorPlateModule(gx, gy);

          if (!newModule || !vehicle.canInstallModule(newModule)) {
            this.setFeedback('Cannot install a module here.');
            return;
          }

          if (spendResource(item.cost) && vehicle.installModule(newModule)) {
            this.setFeedback('Module installed.', '#81c784');
          } else {
            this.setFeedback('Module installation failed.');
          }
          return;
        }
      }

      if (this.selectedTile) {
        const existing = vehicle.getModuleAt(this.selectedTile.gx, this.selectedTile.gy);
        if (existing && existing.type !== 'CORE') {
          const upgradeCost = existing.getUpgradeCost();
          const upBtnX = canvas.width - 220;
          const upBtnY = 135;
          if (
            mouseX >= upBtnX &&
            mouseX <= upBtnX + 200 &&
            mouseY >= upBtnY &&
            mouseY <= upBtnY + 45
          ) {
            if (getResource() < upgradeCost) {
              this.setFeedback(`Not enough resource. Need ${upgradeCost}.`);
            } else if (spendResource(upgradeCost)) {
              existing.upgrade();
              this.setFeedback('Module upgraded.', '#81c784');
            }
          }
        }
      }
    });
  }

  public resetSelection(): void {
    this.selectedTile = null;
    this.feedbackMessage = null;
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
    ctx.save();

    ctx.fillStyle = 'rgba(20, 20, 30, 0.85)';
    ctx.fillRect(0, 0, canvasWidth, 50);

    const coreHp = vehicle.coreModule.currentHp;
    const coreMaxHp = vehicle.coreModule.maxHp;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`CORE HP: ${coreHp} / ${coreMaxHp}`, 20, 30);

    ctx.fillStyle = '#333344';
    ctx.fillRect(180, 15, 150, 18);
    ctx.fillStyle = coreHp > coreMaxHp * 0.4 ? '#00e676' : '#ff3d00';
    ctx.fillRect(180, 15, Math.max(0, (coreHp / coreMaxHp) * 150), 18);

    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(
      `R:${storage.get('resource')}/${storage.getCapacity('resource')}  M:${storage.get('matter')}/${storage.getCapacity('matter')}  A:${storage.get('ammo')}/${storage.getCapacity('ammo')}  N:${storage.get('nano')}/${storage.getCapacity('nano')}`,
      360,
      30
    );

    ctx.fillStyle = '#4deaea';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`WAVE: ${wave} (${enemiesRemaining})`, 700, 30);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '13px sans-serif';
    ctx.fillText(`[WASD]: Move | [Space]: ${isPaused ? 'RESUME' : 'PAUSE'}`, 940, 30);

    if (isPaused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 50, canvasWidth, Math.max(0, canvasHeight - 50 - SHOP_PANEL_HEIGHT));
      ctx.fillStyle = '#ffd54f';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED - Manage & Upgrade Modules', canvasWidth / 2, 90);
    }

    if (this.selectedTile) {
      const pos = vehicle.getModuleWorldPos(this.selectedTile.gx, this.selectedTile.gy);
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        pos.x - vehicle.tileSize / 2,
        pos.y - vehicle.tileSize / 2,
        vehicle.tileSize,
        vehicle.tileSize
      );

      const inspectorX = canvasWidth - 230;
      const inspectorY = 60;
      ctx.fillStyle = 'rgba(30, 30, 45, 0.9)';
      ctx.fillRect(inspectorX, inspectorY, 220, 150);
      ctx.strokeStyle = '#4deaea';
      ctx.lineWidth = 1;
      ctx.strokeRect(inspectorX, inspectorY, 220, 150);

      const mod = vehicle.getModuleAt(this.selectedTile.gx, this.selectedTile.gy);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Selected: [${this.selectedTile.gx},${this.selectedTile.gy}]`, inspectorX + 10, inspectorY + 22);

      if (mod) {
        ctx.fillText(`${mod.name} (Lv.${mod.level})`, inspectorX + 10, inspectorY + 42);
        ctx.fillStyle = mod.isActive() ? '#81c784' : '#e57373';
        ctx.font = '12px sans-serif';
        ctx.fillText(
          `HP: ${mod.currentHp} / ${mod.maxHp} (${mod.isActive() ? 'ACTIVE' : 'DISABLED'})`,
          inspectorX + 10,
          inspectorY + 62
        );

        if (mod.type !== 'CORE') {
          const upgradeCost = mod.getUpgradeCost();
          ctx.fillStyle = storage.get('resource') >= upgradeCost ? '#4caf50' : '#e57373';
          ctx.fillRect(inspectorX + 10, inspectorY + 75, 200, 45);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`UPGRADE (Lv.${mod.level + 1})`, inspectorX + 110, inspectorY + 93);
          ctx.fillText(`Cost: ${upgradeCost}`, inspectorX + 110, inspectorY + 110);
        } else {
          ctx.fillStyle = '#aaa';
          ctx.textAlign = 'left';
          ctx.fillText('Core module cannot be moved', inspectorX + 10, inspectorY + 88);
        }
      } else {
        ctx.fillStyle = '#8888aa';
        ctx.font = '12px sans-serif';
        ctx.fillText('Select a module from bottom shop', inspectorX + 10, inspectorY + 50);
        ctx.fillText('to build here.', inspectorX + 10, inspectorY + 70);
      }
    }

    if (this.feedbackMessage) {
      ctx.fillStyle = this.feedbackColor;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(this.feedbackMessage, canvasWidth - 20, 225);
    }

    ctx.fillStyle = 'rgba(15, 15, 25, 0.9)';
    ctx.fillRect(0, canvasHeight - SHOP_PANEL_HEIGHT, canvasWidth, SHOP_PANEL_HEIGHT);
    for (let i = 0; i < SHOP_ITEMS.length; i++) {
      const item = SHOP_ITEMS[i];
      const { x: btnX, y: btnY } = getShopButtonRect(i, canvasHeight);
      const canAfford = storage.get('resource') >= item.cost && this.selectedTile !== null;
      ctx.fillStyle = canAfford ? '#1e3a5f' : '#2a2a3a';
      ctx.fillRect(btnX, btnY, SHOP_BUTTON_WIDTH, SHOP_BUTTON_HEIGHT);
      ctx.strokeStyle = canAfford ? '#4deaea' : '#555566';
      ctx.lineWidth = canAfford ? 2 : 1;
      ctx.strokeRect(btnX, btnY, SHOP_BUTTON_WIDTH, SHOP_BUTTON_HEIGHT);
      ctx.fillStyle = canAfford ? '#ffffff' : '#888899';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, btnX + SHOP_BUTTON_WIDTH / 2, btnY + 28);
    }

    ctx.restore();
  }
}
