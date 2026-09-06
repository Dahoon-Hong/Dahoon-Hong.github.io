import { TankDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager } from '../core/UpgradeManager';
import { VehicleSystems } from '../core/VehicleSystems';
import { CombatGrid } from './CombatGrid';
import { CombatModule } from './Module';
import type { RenderContext } from '../rendering/RenderContext';

export class Vehicle {
  public x: number;
  public y: number;
  public readonly tileSize = 44;
  public readonly combatGrid: CombatGrid;
  public readonly systems: VehicleSystems;

  constructor(startX: number, startY: number, definition: TankDefinition, upgrades: UpgradeManager) {
    this.x = startX;
    this.y = startY;
    this.systems = new VehicleSystems(definition, upgrades);
    this.combatGrid = new CombatGrid(definition.grid, definition.modules, upgrades);
    this.combatGrid.installInitial(definition.initialCombatModules);
  }

  public get gridRows(): number {
    return this.combatGrid.rows;
  }

  public get gridCols(): number {
    return this.combatGrid.columns;
  }

  public getCoreGridPosition(): { gx: number; gy: number } {
    const cell = this.combatGrid.getCoreCell();
    return { gx: cell.x, gy: cell.y };
  }

  public getCoreHp(): number {
    return this.systems.getCoreHp();
  }

  public getCoreMaxHp(): number {
    return this.systems.getCoreMaxHp();
  }

  public isCoreActive(): boolean {
    return this.systems.isCoreActive();
  }

  public getMovementSpeed(): number {
    return this.systems.getMovementSpeed();
  }

  public getCombatModules(): CombatModule[] {
    return this.combatGrid.getPlacements().map((placement) => placement.module);
  }

  public getCombatModuleDefinitions() {
    return this.combatGrid.getCombatModuleDefinitions();
  }

  public getBuiltInModuleIds(): readonly string[] {
    return this.systems.getBuiltInModuleIds();
  }

  public getBuiltInDefinition(moduleId: string) {
    return this.systems.getBuiltInDefinition(moduleId);
  }

  public getModuleAt(gridX: number, gridY: number): CombatModule | null {
    if (!this.isInsideGrid(gridX, gridY)) return null;
    return this.combatGrid.getModuleAtCell(gridX, gridY);
  }

  public canInstallModule(moduleId: string, anchor: { x: number; y: number }): boolean {
    return this.combatGrid.canInstall(moduleId, anchor);
  }

  public installModule(moduleId: string, anchor: { x: number; y: number }): CombatModule | null {
    return this.combatGrid.install(moduleId, anchor);
  }

  public isInsideGrid(gridX: number, gridY: number): boolean {
    return gridX >= 0 && gridX < this.gridCols && gridY >= 0 && gridY < this.gridRows;
  }

  public isCorePosition(gridX: number, gridY: number): boolean {
    const core = this.getCoreGridPosition();
    return gridX === core.gx && gridY === core.gy;
  }

  public getModuleWorldPos(gridX: number, gridY: number): { x: number; y: number } {
    const core = this.getCoreGridPosition();
    return {
      x: this.x + (gridX - core.gx) * this.tileSize,
      y: this.y + (gridY - core.gy) * this.tileSize,
    };
  }

  public getModuleWorldRect(module: CombatModule): { x: number; y: number; width: number; height: number } {
    const anchor = this.getModuleWorldPos(module.anchor.x, module.anchor.y);
    const width = module.size.width * this.tileSize;
    const height = module.size.height * this.tileSize;
    return {
      x: anchor.x - this.tileSize / 2,
      y: anchor.y - this.tileSize / 2,
      width,
      height,
    };
  }

  public getModuleWorldCenter(module: CombatModule): { x: number; y: number } {
    const rect = this.getModuleWorldRect(module);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  public getGridBounds(): { left: number; top: number; right: number; bottom: number } {
    const topLeft = this.getModuleWorldPos(0, 0);
    const left = topLeft.x - this.tileSize / 2;
    const top = topLeft.y - this.tileSize / 2;
    return {
      left,
      top,
      right: left + this.gridCols * this.tileSize,
      bottom: top + this.gridRows * this.tileSize,
    };
  }

  public takeDamage(
    amount: number,
    penetration = 0,
    impactDirection: { x: number; y: number } = { x: 0, y: 0 }
  ): void {
    const damage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (damage <= 0 || !this.isCoreActive()) return;

    const armor = Math.max(0, this.systems.getArmorValue() - Math.max(0, penetration));
    const remainingDamage = Math.max(0, damage - armor);
    if (remainingDamage <= 0) return;

    const target = this.getImpactModule(impactDirection);
    if (target?.isActive()) {
      const targetHp = target.currentHp;
      target.takeDamage(remainingDamage);
      const overflow = Math.max(0, remainingDamage - targetHp);
      if (overflow > 0) this.systems.takeCoreDamage(overflow);
      return;
    }

    this.systems.takeCoreDamage(remainingDamage);
  }

  public update(
    dt: number,
    moveInput: { x: number; y: number },
    bounds: { width: number; height: number }
  ): void {
    const movementSpeed = this.getMovementSpeed();
    this.x += moveInput.x * movementSpeed * dt;
    this.y += moveInput.y * movementSpeed * dt;

    const core = this.getCoreGridPosition();
    const leftPadding = core.gx * this.tileSize + this.tileSize / 2 + 6;
    const topPadding = core.gy * this.tileSize + this.tileSize / 2 + 6;
    const rightPadding = (this.gridCols - 1 - core.gx) * this.tileSize + this.tileSize / 2 + 6;
    const bottomPadding = (this.gridRows - 1 - core.gy) * this.tileSize + this.tileSize / 2 + 6;
    this.x = Math.max(leftPadding, Math.min(Math.max(leftPadding, bounds.width - rightPadding), this.x));
    this.y = Math.max(topPadding, Math.min(Math.max(topPadding, bounds.height - bottomPadding), this.y));
  }

  public resetRuntime(): void {
    this.systems.resetRuntime();
    for (const module of this.getCombatModules()) module.resetRuntime();
  }

  public render(render: RenderContext): void {
    const ctx = render.ctx;
    ctx.save();

    const gridBounds = this.getGridBounds();
    const frameX = gridBounds.left - 6;
    const frameY = gridBounds.top - 6;
    const frameWidth = this.gridCols * this.tileSize + 12;
    const frameHeight = this.gridRows * this.tileSize + 12;
    ctx.fillStyle = '#1e1e2d';
    ctx.strokeStyle = '#4deaea';
    ctx.lineWidth = 2;
    ctx.fillRect(frameX, frameY, frameWidth, frameHeight);
    ctx.strokeRect(frameX, frameY, frameWidth, frameHeight);

    for (let gy = 0; gy < this.gridRows; gy++) {
      for (let gx = 0; gx < this.gridCols; gx++) {
        const pos = this.getModuleWorldPos(gx, gy);
        const cell = { x: gx, y: gy };
        render.renderer.drawSprite(render, this.getFrameAsset(gx, gy), pos.x, pos.y);
        ctx.fillStyle = this.combatGrid.isBlocked(cell) ? 'rgba(90, 90, 110, 0.65)' : 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(pos.x - this.tileSize / 2 + 2, pos.y - this.tileSize / 2 + 2, this.tileSize - 4, this.tileSize - 4);
        ctx.strokeStyle = this.combatGrid.isBlocked(cell) ? '#616161' : 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(pos.x - this.tileSize / 2 + 2, pos.y - this.tileSize / 2 + 2, this.tileSize - 4, this.tileSize - 4);

        if (this.isCorePosition(gx, gy)) this.renderCore(render, pos.x, pos.y);
        else {
          render.renderer.drawSprite(
            render,
            this.combatGrid.isBlocked(cell) ? 'tank.grid.blocked' : 'tank.grid.empty',
            pos.x,
            pos.y,
          );
        }
      }
    }

    for (const placement of this.combatGrid.getPlacements()) {
      const rect = this.getModuleWorldRect(placement.module);
      placement.module.render(render, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height);
    }

    ctx.restore();
  }

  private getImpactModule(direction: { x: number; y: number }): CombatModule | null {
    const core = this.getCoreGridPosition();
    const targetX = core.gx + Math.sign(direction.x);
    const targetY = core.gy + Math.sign(direction.y);
    if (targetX === core.gx && targetY === core.gy) return null;
    return this.getModuleAt(targetX, targetY);
  }

  private renderCore(render: RenderContext, worldX: number, worldY: number): void {
    const ctx = render.ctx;
    const ratio = this.getCoreMaxHp() > 0 ? this.getCoreHp() / this.getCoreMaxHp() : 0;
    render.renderer.drawSprite(render, 'tank.grid.core', worldX, worldY, {
      scale: render.reducedMotion ? 1 : 1 + Math.sin(render.time * 5) * 0.08,
      alpha: ratio > 0 ? 1 : 0.55,
      tint: ratio > 0 ? undefined : '#17232d',
    });
    ctx.save();
    ctx.fillStyle = ratio > 0 ? '#00e676' : '#424242';
    ctx.fillRect(worldX - this.tileSize / 2 + 5, worldY - this.tileSize / 2 + 5, 4, 4);
    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CORE', worldX, worldY + 14);
    ctx.restore();
  }

  private getFrameAsset(gridX: number, gridY: number): string {
    const onLeft = gridX === 0;
    const onRight = gridX === this.gridCols - 1;
    const onTop = gridY === 0;
    const onBottom = gridY === this.gridRows - 1;
    if ((onLeft || onRight) && (onTop || onBottom)) return 'tank.starter.frame.corner';
    if (onLeft || onRight || onTop || onBottom) return 'tank.starter.frame.edge';
    return 'tank.starter.frame.center';
  }
}
