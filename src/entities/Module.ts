import { Enemy } from './Enemy';
import { Projectile, DirectProjectile, ArcProjectile } from './Projectile';
import { ResourcePickup } from './ResourcePickup';
import { ResourceType } from '../core/ResourceStorage';

export type ModuleType =
  | 'CORE'
  | 'RESOURCE'
  | 'GATHERER'
  | 'RECYCLER'
  | 'ARSENAL'
  | 'COMPOSER'
  | 'RAIL'
  | 'DIRECT_WEAPON'
  | 'ARC_WEAPON';

export abstract class BaseModule {
  public type: ModuleType;
  public name: string;
  public level: number = 1;
  public gridX: number; // 0..2
  public gridY: number; // 0..2
  public cost: number;
  public maxHp: number;
  public currentHp: number;

  constructor(
    type: ModuleType,
    name: string,
    gridX: number,
    gridY: number,
    cost: number,
    maxHp: number = 100
  ) {
    this.type = type;
    this.name = name;
    this.gridX = gridX;
    this.gridY = gridY;
    this.cost = cost;
    this.maxHp = maxHp;
    this.currentHp = maxHp;
  }

  public isActive(): boolean {
    return this.currentHp > 0;
  }

  public takeDamage(amount: number): void {
    this.currentHp = Math.max(0, this.currentHp - Math.max(0, amount));
  }

  public getUpgradeCost(): number {
    return Math.floor(this.cost * Math.pow(1.5, this.level));
  }

  public upgrade(): boolean {
    this.level += 1;
    return true;
  }

  public abstract update(
    dt: number,
    moduleWorldPos: { x: number; y: number },
    enemies: Enemy[],
    spawnProjectile: (proj: Projectile) => void,
    addResource: (type: ResourceType, amount: number) => number,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void;

  public abstract render(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    tileSize: number
  ): void;
}

// Core Module
export class CoreModule extends BaseModule {
  constructor(gridX: number = 1, gridY: number = 1) {
    super('CORE', 'Core Engine', gridX, gridY, 0, 100);
  }

  public upgrade(): boolean {
    super.upgrade();
    this.maxHp += 50;
    this.currentHp = Math.min(this.currentHp + 50, this.maxHp);
    return true;
  }

  public update(): void {
    // Core update logic if any
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    const half = tileSize / 2;
    ctx.save();
    ctx.fillStyle = '#00e676';
    ctx.fillRect(worldX - half + 4, worldY - half + 4, tileSize - 8, tileSize - 8);

    // Inner Core Pulse
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(worldX, worldY, 8 + Math.sin(Date.now() / 200) * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`CORE Lv.${this.level}`, worldX, worldY + 14);
    ctx.restore();
  }
}

// Resource Module
export class ResourceModule extends BaseModule {
  private timer: number = 0;

  constructor(gridX: number, gridY: number) {
    super('RESOURCE', 'Resource Generator', gridX, gridY, 20);
  }

  public update(
    dt: number,
    _pos: { x: number; y: number },
    _enemies: Enemy[],
    _spawnProj: (p: Projectile) => void,
    addResource: (type: ResourceType, amount: number) => number,
    _spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    if (!this.isActive()) return;

    this.timer += dt;
    const interval = Math.max(0.25, (2.0 - (this.level - 1) * 0.2) / 2);
    if (this.timer >= interval) {
      this.timer -= interval;
      const amount = (5 + (this.level - 1) * 3) * 2;
      addResource('resource', amount);
    }
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    const half = tileSize / 2;
    ctx.save();
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(worldX - half + 4, worldY - half + 4, tileSize - 8, tileSize - 8);

    ctx.fillStyle = '#ff8f00';
    ctx.beginPath();
    ctx.arc(worldX, worldY, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`RES Lv.${this.level}`, worldX, worldY + 14);
    ctx.restore();
  }
}

// Gatherer Module
export class GathererModule extends BaseModule {
  constructor(gridX: number, gridY: number) {
    super('GATHERER', 'Resource Gatherer', gridX, gridY, 25);
  }

  public getCollectionRadius(): number {
    return 120 + (this.level - 1) * 20;
  }

  public collect(
    modulePos: { x: number; y: number },
    pickups: ResourcePickup[],
    tryAddResource: (amount: number) => boolean
  ): void {
    if (!this.isActive()) return;

    for (const pickup of pickups) {
      if (pickup.isEmpty()) continue;

      const distance = Math.hypot(pickup.x - modulePos.x, pickup.y - modulePos.y);
      if (distance <= this.getCollectionRadius()) {
        if (tryAddResource(pickup.amount)) {
          pickup.collect(pickup.amount);
        }
      }
    }
  }

  public update(
    _dt: number,
    _pos: { x: number; y: number },
    _enemies: Enemy[],
    _spawnProj: (p: Projectile) => void,
    _addResource: (type: ResourceType, amount: number) => number,
    _spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    // Collection is handled by Game after all modules have updated.
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    const half = tileSize / 2;
    ctx.save();
    ctx.fillStyle = '#66bb6a';
    ctx.fillRect(worldX - half + 4, worldY - half + 4, tileSize - 8, tileSize - 8);

    ctx.strokeStyle = '#1b5e20';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(worldX, worldY, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`COLL Lv.${this.level}`, worldX, worldY + 14);
    ctx.restore();
  }
}

// Direct Weapon Module (Machine Gun)
export class DirectWeaponModule extends BaseModule {
  private cooldownTimer: number = 0;

  constructor(gridX: number, gridY: number) {
    super('DIRECT_WEAPON', 'Gatling Cannon', gridX, gridY, 30);
  }

  public getRange(): number {
    return 600 + (this.level - 1) * 60;
  }

  public getDamage(): number {
    return 30 + (this.level - 1) * 16;
  }

  public getFireRate(): number {
    return Math.max(0.075, (0.4 - (this.level - 1) * 0.04) / 2);
  }

  public getProjectileSpeed(): number {
    return 1000;
  }

  public getMaxDistance(): number {
    return 1000;
  }

  public update(
    dt: number,
    modulePos: { x: number; y: number },
    enemies: Enemy[],
    spawnProjectile: (proj: Projectile) => void,
    _addResource: (type: ResourceType, amount: number) => number,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    if (!this.isActive() || dt <= 0) return;

    this.cooldownTimer -= dt;
    if (this.cooldownTimer <= 0) {
      // Find closest enemy within range
      let closest: Enemy | null = null;
      let minDist = Number.POSITIVE_INFINITY;

      for (const enemy of enemies) {
        if (enemy.isDead()) continue;
        const dist = Math.hypot(enemy.x - modulePos.x, enemy.y - modulePos.y);
        if (dist <= this.getRange() && dist < minDist) {
          minDist = dist;
          closest = enemy;
        }
      }

      if (closest && spendResource('ammo', 1)) {
        this.cooldownTimer = this.getFireRate();
        const dirX = minDist > 0 ? (closest.x - modulePos.x) / minDist : 1;
        const dirY = minDist > 0 ? (closest.y - modulePos.y) / minDist : 0;
        spawnProjectile(
          new DirectProjectile(
            modulePos.x,
            modulePos.y,
            dirX,
            dirY,
            this.getProjectileSpeed(),
            this.getDamage(),
            this.getMaxDistance()
          )
        );
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    const half = tileSize / 2;
    ctx.save();
    ctx.fillStyle = '#29b6f6';
    ctx.fillRect(worldX - half + 4, worldY - half + 4, tileSize - 8, tileSize - 8);

    ctx.strokeStyle = '#01579b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(worldX, worldY, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`GUN Lv.${this.level}`, worldX, worldY + 14);
    ctx.restore();
  }
}

// Arc Weapon Module (Grenade Launcher)
export class ArcWeaponModule extends BaseModule {
  private cooldownTimer: number = 0;

  constructor(gridX: number, gridY: number) {
    super('ARC_WEAPON', 'Mortar Grenade', gridX, gridY, 50);
  }

  public getRange(): number {
    return 800 + (this.level - 1) * 80;
  }

  public getDamage(): number {
    return 90 + (this.level - 1) * 40;
  }

  public getFireRate(): number {
    return Math.max(0.4, (1.8 - (this.level - 1) * 0.15) / 2);
  }

  public getAOERadius(): number {
    return 120 + (this.level - 1) * 20;
  }

  public getFlightTime(): number {
    return 1.2;
  }

  public update(
    dt: number,
    modulePos: { x: number; y: number },
    enemies: Enemy[],
    spawnProjectile: (proj: Projectile) => void,
    _addResource: (type: ResourceType, amount: number) => number,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    if (!this.isActive() || dt <= 0) return;

    this.cooldownTimer -= dt;
    if (this.cooldownTimer <= 0) {
      // Find enemy with most surrounding enemies or closest
      let target: Enemy | null = null;
      let minDist = Number.POSITIVE_INFINITY;

      for (const enemy of enemies) {
        if (enemy.isDead()) continue;
        const dist = Math.hypot(enemy.x - modulePos.x, enemy.y - modulePos.y);
        if (dist <= this.getRange() && dist < minDist) {
          minDist = dist;
          target = enemy;
        }
      }

      if (target && spendResource('ammo', 1)) {
        this.cooldownTimer = this.getFireRate();
        spawnProjectile(
          new ArcProjectile(
            modulePos.x,
            modulePos.y,
            target.x,
            target.y,
            this.getFlightTime(),
            this.getDamage(),
            this.getAOERadius()
          )
        );
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    const half = tileSize / 2;
    ctx.save();
    ctx.fillStyle = '#ab47bc';
    ctx.fillRect(worldX - half + 4, worldY - half + 4, tileSize - 8, tileSize - 8);

    ctx.fillStyle = '#4a148c';
    ctx.beginPath();
    ctx.arc(worldX, worldY, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`MORT Lv.${this.level}`, worldX, worldY + 14);
    ctx.restore();
  }
}

export abstract class ProductionModule extends BaseModule {
  private outputAmount = 0;
  private readonly outputCapacity = 20;
  public readonly outputType: ResourceType;

  protected constructor(
    type: ModuleType,
    name: string,
    gridX: number,
    gridY: number,
    cost: number,
    outputType: ResourceType
  ) {
    super(type, name, gridX, gridY, cost);
    this.outputType = outputType;
  }

  public getOutputAmount(): number {
    return this.outputAmount;
  }

  public takeOutput(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const moved = Math.min(this.outputAmount, amount);
    this.outputAmount -= moved;
    return moved;
  }

  protected canProduce(amount: number): boolean {
    return this.outputAmount + amount <= this.outputCapacity;
  }

  protected queueOutput(amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || !this.canProduce(amount)) return false;
    this.outputAmount += amount;
    return true;
  }

  protected renderProductionModule(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    tileSize: number,
    color: string,
    label: string
  ): void {
    const half = tileSize / 2;
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(worldX - half + 4, worldY - half + 4, tileSize - 8, tileSize - 8);
    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${label} ${this.getOutputAmount()}`, worldX, worldY + 14);
    ctx.restore();
  }
}

export function compareProductionPriority(a: ProductionModule, b: ProductionModule): number {
  const ammoPriority = Number(b.outputType === 'ammo') - Number(a.outputType === 'ammo');
  return ammoPriority || a.gridY - b.gridY || a.gridX - b.gridX;
}

export class RecyclerModule extends ProductionModule {
  private timer = 0;

  constructor(gridX: number, gridY: number) {
    super('RECYCLER', 'Recycler', gridX, gridY, 20, 'matter');
  }

  public update(
    dt: number,
    _pos: { x: number; y: number },
    _enemies: Enemy[],
    _spawnProj: (p: Projectile) => void,
    _addResource: (type: ResourceType, amount: number) => number,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    if (!this.isActive()) return;
    this.timer += dt;
    if (this.timer < 1) return;

    this.timer -= 1;
    if (this.canProduce(5) && spendResource('resource', 10)) this.queueOutput(5);
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    this.renderProductionModule(ctx, worldX, worldY, tileSize, '#8d6e63', 'REC');
  }
}

export class ArsenalModule extends ProductionModule {
  private timer = 0;

  constructor(gridX: number, gridY: number) {
    super('ARSENAL', 'Arsenal', gridX, gridY, 20, 'ammo');
  }

  public update(
    dt: number,
    _pos: { x: number; y: number },
    _enemies: Enemy[],
    _spawnProj: (p: Projectile) => void,
    _addResource: (type: ResourceType, amount: number) => number,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    if (!this.isActive()) return;
    this.timer += dt;
    if (this.timer < 1.5) return;

    this.timer -= 1.5;
    if (this.canProduce(1) && spendResource('matter', 5)) this.queueOutput(1);
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    this.renderProductionModule(ctx, worldX, worldY, tileSize, '#ef6c00', 'ARS');
  }
}

export class MatterComposerModule extends ProductionModule {
  private timer = 0;

  constructor(gridX: number, gridY: number) {
    super('COMPOSER', 'Matter Composer', gridX, gridY, 25, 'nano');
  }

  public update(
    dt: number,
    _pos: { x: number; y: number },
    _enemies: Enemy[],
    _spawnProj: (p: Projectile) => void,
    _addResource: (type: ResourceType, amount: number) => number,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    if (!this.isActive()) return;
    this.timer += dt;
    if (this.timer < 2.5) return;

    this.timer -= 2.5;
    if (this.canProduce(1) && spendResource('matter', 10)) this.queueOutput(1);
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    this.renderProductionModule(ctx, worldX, worldY, tileSize, '#26a69a', 'NANO');
  }
}

export class RailModule extends BaseModule {
  private timer = 0;

  constructor(gridX: number, gridY: number) {
    super('RAIL', 'Rail Transport', gridX, gridY, 10);
  }

  public update(
    _dt: number,
    _pos: { x: number; y: number },
    _enemies: Enemy[],
    _spawnProj: (p: Projectile) => void,
    _addResource: (type: ResourceType, amount: number) => number,
    _spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    // Transport is handled by Game after all producers have updated.
  }

  public transfer(
    dt: number,
    modules: (BaseModule | null)[][],
    addResource: (type: ResourceType, amount: number) => number
  ): void {
    if (!this.isActive()) return;
    this.timer += dt;
    if (this.timer < 1) return;
    this.timer -= 1;

    const sources: ProductionModule[] = [];
    for (const row of modules) {
      for (const module of row) {
        if (module instanceof ProductionModule && module.getOutputAmount() > 0) {
          sources.push(module);
        }
      }
    }
    sources.sort(compareProductionPriority);

    // Rail is the long-distance fallback; local outputs are collected by Game first.
    for (const source of sources) {

      const moved = addResource(source.outputType, Math.min(20, source.getOutputAmount()));
      if (moved > 0) {
        source.takeOutput(moved);
        return;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, tileSize: number): void {
    const half = tileSize / 2;
    ctx.save();
    ctx.fillStyle = '#78909c';
    ctx.fillRect(worldX - half + 4, worldY - half + 4, tileSize - 8, tileSize - 8);
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(worldX - 12, worldY - 8);
    ctx.lineTo(worldX + 12, worldY + 8);
    ctx.moveTo(worldX - 12, worldY + 8);
    ctx.lineTo(worldX + 12, worldY - 8);
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RAIL', worldX, worldY + 14);
    ctx.restore();
  }
}
