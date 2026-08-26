import { Vehicle } from '../entities/Vehicle';
import { ResourceModule, DirectWeaponModule, ArcWeaponModule, BaseModule } from '../entities/Module';

export class HUDManager {
  private selectedTile: { gx: number; gy: number } | null = null;
  private feedbackMessage: string | null = null;
  private feedbackColor: string = '#e57373';

  private setFeedback(message: string, color: string = '#e57373'): void {
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

      // 1. Check if user clicked on vehicle 3x3 grid tile
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

      // 2. Check if user clicked on Shop buttons at bottom HUD
      const shopY = canvas.height - 70;
      const shopItems = [
        { type: 'RESOURCE', cost: 20, name: '+ Resource Generator' },
        { type: 'DIRECT_WEAPON', cost: 30, name: '+ Gatling Gun' },
        { type: 'ARC_WEAPON', cost: 50, name: '+ Mortar Grenade' },
      ];

      for (let i = 0; i < shopItems.length; i++) {
        const btnX = 20 + i * 210;
        const btnY = shopY;
        const btnW = 200;
        const btnH = 50;

        if (
          mouseX >= btnX &&
          mouseX <= btnX + btnW &&
          mouseY >= btnY &&
          mouseY <= btnY + btnH
        ) {
          if (!this.selectedTile) {
            this.setFeedback('Select a grid slot first.');
            return;
          }

          const { gx, gy } = this.selectedTile;
          const existingModule = vehicle.getModuleAt(gx, gy);
          if (existingModule) {
            this.setFeedback('This slot is already occupied.');
            return;
          }

          const item = shopItems[i];
          if (getResource() < item.cost) {
            this.setFeedback(`Not enough resource. Need ⚡ ${item.cost}.`);
            return;
          }

          let newMod: BaseModule | null = null;
          if (item.type === 'RESOURCE') newMod = new ResourceModule(gx, gy);
          else if (item.type === 'DIRECT_WEAPON') newMod = new DirectWeaponModule(gx, gy);
          else if (item.type === 'ARC_WEAPON') newMod = new ArcWeaponModule(gx, gy);

          if (!newMod || !vehicle.canInstallModule(newMod)) {
            this.setFeedback('Cannot install a module here.');
            return;
          }

          if (spendResource(item.cost) && vehicle.installModule(newMod)) {
            this.setFeedback('Module installed.', '#81c784');
          } else {
            this.setFeedback('Module installation failed.');
          }
          return;
        }
      }

      // 3. Upgrade button inside tile detail popup
      if (this.selectedTile) {
        const existing = vehicle.getModuleAt(this.selectedTile.gx, this.selectedTile.gy);
        if (existing && existing.type !== 'CORE') {
          const upgradeCost = existing.getUpgradeCost();
          const upBtnX = canvas.width - 220;
          const upBtnY = 135;
          const upBtnW = 200;
          const upBtnH = 45;

          if (
            mouseX >= upBtnX &&
            mouseX <= upBtnX + upBtnW &&
            mouseY >= upBtnY &&
            mouseY <= upBtnY + upBtnH
          ) {
            if (getResource() < upgradeCost) {
              this.setFeedback(`Not enough resource. Need ⚡ ${upgradeCost}.`);
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
    resources: number,
    wave: number,
    enemiesRemaining: number,
    isPaused: boolean
  ): void {
    ctx.save();

    // 1. Top Status Bar Overlay
    ctx.fillStyle = 'rgba(20, 20, 30, 0.85)';
    ctx.fillRect(0, 0, canvasWidth, 50);

    // HP Info
    const coreHp = vehicle.coreModule.currentHp;
    const coreMaxHp = vehicle.coreModule.maxHp;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`CORE HP: ${coreHp} / ${coreMaxHp}`, 20, 30);

    // HP Bar
    ctx.fillStyle = '#333344';
    ctx.fillRect(180, 15, 150, 18);
    ctx.fillStyle = coreHp > coreMaxHp * 0.4 ? '#00e676' : '#ff3d00';
    ctx.fillRect(180, 15, Math.max(0, (coreHp / coreMaxHp) * 150), 18);

    // Resource Counter
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`⚡ Resource: ${resources}`, 360, 30);

    // Wave Info
    ctx.fillStyle = '#4deaea';
    ctx.fillText(`WAVE: ${wave} (Enemies: ${enemiesRemaining})`, 580, 30);

    // Controls Legend
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '13px sans-serif';
    ctx.fillText(`[WASD]: Move | [Space]: ${isPaused ? 'RESUME ▶' : 'PAUSE ❚❚'}`, 940, 30);

    // Pause Overlay Indicator
    if (isPaused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 50, canvasWidth, canvasHeight - 120);

      ctx.fillStyle = '#ffd54f';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED - Manage & Upgrade Modules', canvasWidth / 2, 90);
    }

    // 2. Tile Highlight Selection
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

      // Selected Tile Inspector Panel at Right Top
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

      if (mod) {
        ctx.fillText(`Selected: [${this.selectedTile.gx},${this.selectedTile.gy}]`, inspectorX + 10, inspectorY + 22);
        ctx.fillText(`${mod.name} (Lv.${mod.level})`, inspectorX + 10, inspectorY + 42);
        ctx.fillStyle = mod.isActive() ? '#81c784' : '#e57373';
        ctx.font = '12px sans-serif';
        ctx.fillText(
          `HP: ${mod.currentHp} / ${mod.maxHp} (${mod.isActive() ? 'ACTIVE' : 'DISABLED'})`,
          inspectorX + 10,
          inspectorY + 62
        );

        if (mod.type !== 'CORE') {
          const upCost = mod.getUpgradeCost();
          ctx.fillStyle = resources >= upCost ? '#4caf50' : '#e57373';
          ctx.fillRect(inspectorX + 10, inspectorY + 75, 200, 45);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`UPGRADE (Lv.${mod.level + 1})`, inspectorX + 110, inspectorY + 93);
          ctx.fillText(`Cost: ⚡ ${upCost}`, inspectorX + 110, inspectorY + 110);
        } else {
          ctx.fillStyle = '#aaa';
          ctx.textAlign = 'left';
          ctx.fillText('Core module cannot be moved', inspectorX + 10, inspectorY + 88);
        }
      } else {
        ctx.fillText(`Selected: Slot [${this.selectedTile.gx},${this.selectedTile.gy}]`, inspectorX + 10, inspectorY + 25);
        ctx.fillStyle = '#8888aa';
        ctx.font = '12px sans-serif';
        ctx.fillText(`Select a module from bottom shop`, inspectorX + 10, inspectorY + 50);
        ctx.fillText(`to build here.`, inspectorX + 10, inspectorY + 70);
      }
    }

    if (this.feedbackMessage) {
      ctx.fillStyle = this.feedbackColor;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(this.feedbackMessage, canvasWidth - 20, 225);
    }

    // 3. Shop HUD Bar at Bottom
    ctx.fillStyle = 'rgba(15, 15, 25, 0.9)';
    ctx.fillRect(0, canvasHeight - 70, canvasWidth, 70);

    const shopItems = [
      { type: 'RESOURCE', cost: 20, name: '+ Resource Gen (⚡20)' },
      { type: 'DIRECT_WEAPON', cost: 30, name: '+ Gatling Gun (⚡30)' },
      { type: 'ARC_WEAPON', cost: 50, name: '+ Mortar Grenade (⚡50)' },
    ];

    for (let i = 0; i < shopItems.length; i++) {
      const item = shopItems[i];
      const btnX = 20 + i * 220;
      const btnY = canvasHeight - 60;
      const btnW = 205;
      const btnH = 48;

      const canAfford = resources >= item.cost && this.selectedTile !== null;
      ctx.fillStyle = canAfford ? '#1e3a5f' : '#2a2a3a';
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.strokeStyle = canAfford ? '#4deaea' : '#555566';
      ctx.lineWidth = canAfford ? 2 : 1;
      ctx.strokeRect(btnX, btnY, btnW, btnH);

      ctx.fillStyle = canAfford ? '#ffffff' : '#888899';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.name, btnX + btnW / 2, btnY + 28);
    }

    ctx.restore();
  }
}
