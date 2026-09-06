import { TankDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager } from '../core/UpgradeManager';
import { VehicleSystems } from '../core/VehicleSystems';
import { CombatGrid } from './CombatGrid';
import { CombatModule } from './Module';
import type { RenderContext } from '../rendering/RenderContext';

export class Vehicle {
  public x: number;
  public y: number;
  public readonly tileSize = 36;
  public readonly combatGrid: CombatGrid;
  public readonly systems: VehicleSystems;
  private facingAngle = -Math.PI / 2;
  private isMoving = false;

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

  public getFacingAngle(): number {
    return this.facingAngle;
  }

  public getFacingRotation(): number {
    return this.facingAngle + Math.PI / 2;
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

  public getModuleWorldPos(gridX: number, gridY: number): { x: number; y: number } {
    return this.toWorldPoint(this.getModuleLocalPos(gridX, gridY));
  }

  public getGridCellAtWorldPoint(point: { x: number; y: number }): { x: number; y: number } | null {
    const local = this.toLocalPoint(point);
    const gridX = Math.floor((local.x + this.gridCols * this.tileSize / 2) / this.tileSize);
    const gridY = Math.floor((local.y + this.gridRows * this.tileSize / 2) / this.tileSize);
    return this.isInsideGrid(gridX, gridY) ? { x: gridX, y: gridY } : null;
  }

  private getModuleLocalPos(gridX: number, gridY: number): { x: number; y: number } {
    const centerX = (this.gridCols - 1) / 2;
    const centerY = (this.gridRows - 1) / 2;
    return {
      x: (gridX - centerX) * this.tileSize,
      y: (gridY - centerY) * this.tileSize,
    };
  }

  public getModuleWorldRect(module: CombatModule): { x: number; y: number; width: number; height: number } {
    const local = this.getModuleLocalRect(module);
    const corners = [
      { x: local.x, y: local.y },
      { x: local.x + local.width, y: local.y },
      { x: local.x + local.width, y: local.y + local.height },
      { x: local.x, y: local.y + local.height },
    ].map((point) => this.toWorldPoint(point));
    const left = Math.min(...corners.map((point) => point.x));
    const right = Math.max(...corners.map((point) => point.x));
    const top = Math.min(...corners.map((point) => point.y));
    const bottom = Math.max(...corners.map((point) => point.y));
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  public getModuleWorldCenter(module: CombatModule): { x: number; y: number } {
    const rect = this.getModuleWorldRect(module);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  public getGridBounds(): { left: number; top: number; right: number; bottom: number } {
    const corners = [
      { x: -this.gridCols * this.tileSize / 2, y: -this.gridRows * this.tileSize / 2 },
      { x: this.gridCols * this.tileSize / 2, y: -this.gridRows * this.tileSize / 2 },
      { x: this.gridCols * this.tileSize / 2, y: this.gridRows * this.tileSize / 2 },
      { x: -this.gridCols * this.tileSize / 2, y: this.gridRows * this.tileSize / 2 },
    ].map((point) => this.toWorldPoint(point));
    const left = Math.min(...corners.map((point) => point.x));
    const top = Math.min(...corners.map((point) => point.y));
    const right = Math.max(...corners.map((point) => point.x));
    const bottom = Math.max(...corners.map((point) => point.y));
    return {
      left,
      top,
      right,
      bottom,
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
    if (moveInput.x !== 0 || moveInput.y !== 0) {
      this.facingAngle = Math.atan2(moveInput.y, moveInput.x);
      this.isMoving = true;
    } else {
      this.isMoving = false;
    }

    const movementSpeed = this.getMovementSpeed();
    this.x += moveInput.x * movementSpeed * dt;
    this.y += moveInput.y * movementSpeed * dt;

    const horizontalPadding = this.gridCols * this.tileSize / 2 + 6;
    const verticalPadding = this.gridRows * this.tileSize / 2 + 6;
    this.x = Math.max(horizontalPadding, Math.min(Math.max(horizontalPadding, bounds.width - horizontalPadding), this.x));
    this.y = Math.max(verticalPadding, Math.min(Math.max(verticalPadding, bounds.height - verticalPadding), this.y));
  }

  public resetRuntime(): void {
    this.systems.resetRuntime();
    for (const module of this.getCombatModules()) module.resetRuntime();
    this.facingAngle = -Math.PI / 2;
    this.isMoving = false;
  }

  public render(render: RenderContext): void {
    const ctx = render.ctx;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.getFacingRotation());

    const gridWidth = this.gridCols * this.tileSize;
    const gridHeight = this.gridRows * this.tileSize;
    const frameX = -gridWidth / 2 - 6;
    const frameY = -gridHeight / 2 - 6;
    const frameWidth = this.gridCols * this.tileSize + 12;
    const frameHeight = this.gridRows * this.tileSize + 12;
    ctx.fillStyle = 'rgba(15, 24, 34, 0.82)';
    ctx.strokeStyle = 'rgba(77, 234, 234, 0.24)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(frameX, frameY, frameWidth, frameHeight);
    ctx.strokeRect(frameX, frameY, frameWidth, frameHeight);

    // Assemble the tank body first. The grid is a separate translucent overlay.
    render.renderer.drawSprite(
      render,
      'tank.starter.move',
      0,
      0,
      {
        frame: render.reducedMotion || !this.isMoving ? 0 : Math.floor(render.time / 0.12) % 4,
        scale: Math.max(this.gridCols, this.gridRows),
      },
    );

    for (let gy = 0; gy < this.gridRows; gy++) {
      for (let gx = 0; gx < this.gridCols; gx++) {
        const pos = this.getModuleLocalPos(gx, gy);
        const frame = this.getFramePiece(gx, gy);
        if (!frame) continue;
        render.renderer.drawSprite(render, frame.assetId, pos.x, pos.y, {
          rotation: frame.rotation,
          scale: this.tileSize / 44,
        });
      }
    }

    for (let gy = 0; gy < this.gridRows; gy++) {
      for (let gx = 0; gx < this.gridCols; gx++) {
        const pos = this.getModuleLocalPos(gx, gy);
        const cell = { x: gx, y: gy };
        ctx.fillStyle = this.combatGrid.isBlocked(cell) ? 'rgba(90, 90, 110, 0.22)' : 'rgba(255, 255, 255, 0.012)';
        ctx.fillRect(pos.x - this.tileSize / 2 + 2, pos.y - this.tileSize / 2 + 2, this.tileSize - 4, this.tileSize - 4);
        ctx.strokeStyle = this.combatGrid.isBlocked(cell) ? 'rgba(97, 97, 97, 0.38)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(pos.x - this.tileSize / 2 + 2, pos.y - this.tileSize / 2 + 2, this.tileSize - 4, this.tileSize - 4);

        render.renderer.drawSprite(
          render,
          this.combatGrid.isBlocked(cell) ? 'tank.grid.blocked' : 'tank.grid.empty',
          pos.x,
          pos.y,
          {
            alpha: this.combatGrid.isBlocked(cell) ? 0.24 : 0.08,
            scale: this.tileSize / 44,
          },
        );
      }
    }

    for (const placement of this.combatGrid.getPlacements()) {
      const rect = this.getModuleLocalRect(placement.module);
      placement.module.render(render, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height);
    }

    ctx.restore();
  }

  private getImpactModule(direction: { x: number; y: number }): CombatModule | null {
    const localDirection = this.toLocalVector(direction);
    const centerX = (this.gridCols - 1) / 2;
    const centerY = (this.gridRows - 1) / 2;
    const targetX = Math.round(centerX + Math.sign(localDirection.x));
    const targetY = Math.round(centerY + Math.sign(localDirection.y));
    return this.getModuleAt(targetX, targetY);
  }

  private getModuleLocalRect(module: CombatModule): { x: number; y: number; width: number; height: number } {
    const localAnchor = this.getModuleLocalPos(module.anchor.x, module.anchor.y);
    return {
      x: localAnchor.x - this.tileSize / 2,
      y: localAnchor.y - this.tileSize / 2,
      width: module.size.width * this.tileSize,
      height: module.size.height * this.tileSize,
    };
  }

  private toWorldPoint(point: { x: number; y: number }): { x: number; y: number } {
    const rotation = this.getFacingRotation();
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: this.x + point.x * cos - point.y * sin,
      y: this.y + point.x * sin + point.y * cos,
    };
  }

  private toLocalPoint(point: { x: number; y: number }): { x: number; y: number } {
    const rotation = this.getFacingRotation();
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const x = point.x - this.x;
    const y = point.y - this.y;
    return {
      x: x * cos + y * sin,
      y: -x * sin + y * cos,
    };
  }

  private toLocalVector(vector: { x: number; y: number }): { x: number; y: number } {
    const rotation = this.getFacingRotation();
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: vector.x * cos + vector.y * sin,
      y: -vector.x * sin + vector.y * cos,
    };
  }

  private getFramePiece(gridX: number, gridY: number): { assetId: string; rotation: number } | null {
    const onLeft = gridX === 0;
    const onRight = gridX === this.gridCols - 1;
    const onTop = gridY === 0;
    const onBottom = gridY === this.gridRows - 1;

    if (onTop && onLeft) return { assetId: 'tank.starter.frame.corner', rotation: 0 };
    if (onTop && onRight) return { assetId: 'tank.starter.frame.corner', rotation: Math.PI / 2 };
    if (onBottom && onRight) return { assetId: 'tank.starter.frame.corner', rotation: Math.PI };
    if (onBottom && onLeft) return { assetId: 'tank.starter.frame.corner', rotation: -Math.PI / 2 };
    if (onTop) return { assetId: 'tank.starter.frame.edge', rotation: 0 };
    if (onRight) return { assetId: 'tank.starter.frame.edge', rotation: Math.PI / 2 };
    if (onBottom) return { assetId: 'tank.starter.frame.edge', rotation: Math.PI };
    if (onLeft) return { assetId: 'tank.starter.frame.edge', rotation: -Math.PI / 2 };
    return null;
  }
}
