import {
  ArsenalModule,
  ArmorPlateModule,
  BaseModule,
  CaterpillarTrackModule,
  CoreModule,
  DirectWeaponModule,
  GathererModule,
  PowerPackModule,
  RecyclerModule,
  ResourceModule,
} from './Module';

export class Vehicle {
  public x: number;
  public y: number;
  public speed: number = 180;
  public tileSize: number = 44;
  public gridRows: number = 3;
  public gridCols: number = 3;

  public modules: (BaseModule | null)[][];
  public coreModule: CoreModule;

  constructor(startX: number, startY: number) {
    this.x = startX;
    this.y = startY;

    // Initialize the current 3x3 grid.
    this.modules = Array.from({ length: this.gridRows }, () => Array(this.gridCols).fill(null));

    const corePosition = this.getCoreGridPosition();
    this.coreModule = new CoreModule(corePosition.gx, corePosition.gy);
    this.modules[corePosition.gy][corePosition.gx] = this.coreModule;

    // Pre-install the initial resource, weapon, gatherer, and mobility modules.
    this.modules[0][1] = new ResourceModule(0, 1);
    this.modules[1][0] = new DirectWeaponModule(1, 0);
    this.modules[2][1] = new GathererModule(1, 2);
    this.modules[0][0] = new RecyclerModule(0, 0);
    this.modules[0][2] = new ArsenalModule(2, 0);
    this.modules[1][2] = new PowerPackModule(2, 1);
    this.modules[2][0] = new CaterpillarTrackModule(0, 2);
  }

  public getModuleAt(gridX: number, gridY: number): BaseModule | null {
    if (!this.isInsideGrid(gridX, gridY)) return null;
    return this.modules[gridY][gridX];
  }

  public getMovementSpeed(): number {
    const powerPack = this.findModule<PowerPackModule>('POWER_PACK');
    if (!powerPack || !powerPack.isActive()) return 0;

    const track = this.findModule<CaterpillarTrackModule>('CATERPILLAR_TRACK');
    if (!track || !track.isActive()) return powerPack.getMovementSpeed() * 0.5;

    return Math.min(powerPack.getMovementSpeed(), track.getMaxSpeed());
  }

  public takeDamage(
    amount: number,
    penetration = 0,
    impactDirection: { x: number; y: number } = { x: 0, y: 0 }
  ): void {
    const damage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (damage <= 0) return;

    const armor = this.findModule<ArmorPlateModule>('ARMOR_PLATE');
    const remainingDamage = armor ? armor.absorbDamage(damage, penetration) : damage;
    if (remainingDamage <= 0) return;

    const target = this.getImpactModule(impactDirection);
    if (target && target !== armor && target.type !== 'CORE' && target.isActive()) {
      const targetHp = target.currentHp;
      target.takeDamage(remainingDamage);
      const overflowDamage = Math.max(0, remainingDamage - targetHp);
      if (overflowDamage > 0) this.coreModule.takeDamage(overflowDamage);
      return;
    }

    this.coreModule.takeDamage(remainingDamage);
  }

  private getImpactModule(direction: { x: number; y: number }): BaseModule | null {
    const core = this.getCoreGridPosition();
    const gridX = core.gx + Math.sign(direction.x);
    const gridY = core.gy + Math.sign(direction.y);
    if (gridX === core.gx && gridY === core.gy) return this.coreModule;
    return this.getModuleAt(gridX, gridY);
  }

  private findModule<T extends BaseModule>(type: BaseModule['type']): T | null {
    for (const row of this.modules) {
      for (const module of row) {
        if (module?.type === type) return module as T;
      }
    }
    return null;
  }

  public getCoreGridPosition(): { gx: number; gy: number } {
    return {
      gx: Math.floor(this.gridCols / 2),
      gy: Math.floor(this.gridRows / 2),
    };
  }

  public isInsideGrid(gridX: number, gridY: number): boolean {
    return gridX >= 0 && gridX < this.gridCols && gridY >= 0 && gridY < this.gridRows;
  }

  public isCorePosition(gridX: number, gridY: number): boolean {
    const corePosition = this.getCoreGridPosition();
    return gridX === corePosition.gx && gridY === corePosition.gy;
  }

  public canInstallModule(module: BaseModule): boolean {
    if (!this.isInsideGrid(module.gridX, module.gridY)) return false;
    if (module.type === 'CORE' && !this.isCorePosition(module.gridX, module.gridY)) return false;
    if (module.type !== 'CORE' && this.isCorePosition(module.gridX, module.gridY)) return false;
    return this.modules[module.gridY][module.gridX] === null;
  }

  public installModule(module: BaseModule): boolean {
    if (!this.canInstallModule(module)) return false;
    this.modules[module.gridY][module.gridX] = module;
    return true;
  }

  public getModuleWorldPos(gridX: number, gridY: number): { x: number; y: number } {
    const corePosition = this.getCoreGridPosition();
    const offsetX = (gridX - corePosition.gx) * this.tileSize;
    const offsetY = (gridY - corePosition.gy) * this.tileSize;
    return { x: this.x + offsetX, y: this.y + offsetY };
  }

  public update(dt: number, moveInput: { x: number; y: number }, bounds: { width: number; height: number }): void {
    const movementSpeed = this.getMovementSpeed();
    this.x += moveInput.x * movementSpeed * dt;
    this.y += moveInput.y * movementSpeed * dt;

    // Clamp inside canvas bounds with padding
    const padding = 70;
    this.x = Math.max(padding, Math.min(bounds.width - padding, this.x));
    this.y = Math.max(padding, Math.min(bounds.height - padding, this.y));
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 1. Draw Platform Base Frame
    const halfWidth = (this.gridCols * this.tileSize) / 2 + 6;
    const halfHeight = (this.gridRows * this.tileSize) / 2 + 6;

    ctx.fillStyle = '#1e1e2d';
    ctx.strokeStyle = '#4deaea';
    ctx.lineWidth = 2;
    ctx.fillRect(this.x - halfWidth, this.y - halfHeight, halfWidth * 2, halfHeight * 2);
    ctx.strokeRect(this.x - halfWidth, this.y - halfHeight, halfWidth * 2, halfHeight * 2);

    // 2. Draw 3x3 Grid Slots & Installed Modules
    for (let gy = 0; gy < this.gridRows; gy++) {
      for (let gx = 0; gx < this.gridCols; gx++) {
        const pos = this.getModuleWorldPos(gx, gy);
        const mod = this.modules[gy][gx];

        // Empty Slot Outline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          pos.x - this.tileSize / 2 + 2,
          pos.y - this.tileSize / 2 + 2,
          this.tileSize - 4,
          this.tileSize - 4
        );

        if (mod) {
          mod.render(ctx, pos.x, pos.y, this.tileSize);
        }
      }
    }

    ctx.restore();
  }
}
