import { ResourceType } from '../core/ResourceStorage';
import { GridCell, ResourceCost, TankModuleDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager } from '../core/UpgradeManager';
import { Enemy } from './Enemy';
import { ArcProjectile, DirectProjectile, Projectile } from './Projectile';

export abstract class CombatModule {
  public readonly type = 'COMBAT';
  public readonly moduleId: string;
  public readonly instanceId: string;
  public readonly name: string;
  public readonly anchor: GridCell;
  public readonly size: { width: number; height: number };
  public readonly installCost: ResourceCost;
  public currentHp: number;

  protected readonly definition: TankModuleDefinition;
  protected readonly upgrades: UpgradeManager;

  public constructor(
    definition: TankModuleDefinition,
    instanceId: string,
    anchor: GridCell,
    upgrades: UpgradeManager
  ) {
    if (!definition.size) throw new Error(`[Combat] module '${definition.id}' is missing size`);

    this.definition = definition;
    this.moduleId = definition.id;
    this.instanceId = instanceId;
    this.name = definition.name;
    this.anchor = { ...anchor };
    this.size = { ...definition.size };
    this.installCost = { ...(definition.installCost ?? {}) };
    this.upgrades = upgrades;
    this.currentHp = this.maxHp;
  }

  public get maxHp(): number {
    return this.getStat('maxHp', 100);
  }

  public get level(): number {
    return this.upgrades.getLevel(this.instanceId);
  }

  public isActive(): boolean {
    return this.currentHp > 0;
  }

  public takeDamage(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.currentHp = Math.max(0, this.currentHp - amount);
  }

  public getStat(stat: string, fallback = 0): number {
    return this.upgrades.getEffectiveStats(this.instanceId)[stat] ?? fallback;
  }

  public abstract update(
    dt: number,
    moduleWorldPos: { x: number; y: number },
    enemies: Enemy[],
    spawnProjectile: (projectile: Projectile) => void,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void;

  public abstract render(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    width: number,
    height: number
  ): void;

  protected renderBody(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    width: number,
    height: number,
    color: string,
    label: string
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(worldX - width / 2 + 4, worldY - height / 2 + 4, width - 8, height - 8);
    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${label} Lv.${this.level}`, worldX, worldY + 4);
    ctx.restore();
  }
}

export class DirectWeaponModule extends CombatModule {
  private cooldownTimer = 0;

  public update(
    dt: number,
    modulePos: { x: number; y: number },
    enemies: Enemy[],
    spawnProjectile: (projectile: Projectile) => void,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    if (!this.isActive() || dt <= 0) return;
    this.cooldownTimer -= dt;
    if (this.cooldownTimer > 0) return;

    const target = findClosestEnemy(modulePos, enemies, this.getRange());
    if (!target || !spendResource('ammo', 1)) return;

    const distance = Math.hypot(target.x - modulePos.x, target.y - modulePos.y);
    this.cooldownTimer = this.getFireRate();
    spawnProjectile(
      new DirectProjectile(
        modulePos.x,
        modulePos.y,
        distance > 0 ? (target.x - modulePos.x) / distance : 1,
        distance > 0 ? (target.y - modulePos.y) / distance : 0,
        this.getStat('projectileSpeed', 1000),
        this.getStat('damage', 30),
        this.getStat('maxDistance', 1000)
      )
    );
  }

  public getRange(): number {
    return this.getStat('range', 600);
  }

  public getDamage(): number {
    return this.getStat('damage', 30);
  }

  public getFireRate(): number {
    return Math.max(0.075, this.getStat('fireRate', 0.2));
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, width: number, height: number): void {
    this.renderBody(ctx, worldX, worldY, width, height, this.isActive() ? '#29b6f6' : '#546e7a', 'GUN');
    ctx.save();
    ctx.strokeStyle = '#01579b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(worldX, worldY, Math.min(width, height) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export class ArcWeaponModule extends CombatModule {
  private cooldownTimer = 0;

  public update(
    dt: number,
    modulePos: { x: number; y: number },
    enemies: Enemy[],
    spawnProjectile: (projectile: Projectile) => void,
    spendResource: (type: ResourceType, amount: number) => boolean
  ): void {
    if (!this.isActive() || dt <= 0) return;
    this.cooldownTimer -= dt;
    if (this.cooldownTimer > 0) return;

    const target = findClosestEnemy(modulePos, enemies, this.getRange());
    if (!target || !spendResource('ammo', 1)) return;

    this.cooldownTimer = this.getFireRate();
    spawnProjectile(
      new ArcProjectile(
        modulePos.x,
        modulePos.y,
        target.x,
        target.y,
        this.getStat('flightTime', 1.2),
        this.getStat('damage', 90),
        this.getStat('aoeRadius', 120)
      )
    );
  }

  public getRange(): number {
    return this.getStat('range', 800);
  }

  public getDamage(): number {
    return this.getStat('damage', 90);
  }

  public getFireRate(): number {
    return Math.max(0.4, this.getStat('fireRate', 1.8));
  }

  public render(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, width: number, height: number): void {
    this.renderBody(ctx, worldX, worldY, width, height, this.isActive() ? '#ab47bc' : '#6a1b9a', 'MORT');
    ctx.save();
    ctx.fillStyle = '#4a148c';
    ctx.beginPath();
    ctx.arc(worldX, worldY, Math.min(width, height) * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function findClosestEnemy(
  position: { x: number; y: number },
  enemies: Enemy[],
  range: number
): Enemy | null {
  let closest: Enemy | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const enemy of enemies) {
    if (enemy.isDead()) continue;
    const distance = Math.hypot(enemy.x - position.x, enemy.y - position.y);
    if (distance <= range && distance < minDistance) {
      closest = enemy;
      minDistance = distance;
    }
  }

  return closest;
}

export function createCombatModule(
  definition: TankModuleDefinition,
  instanceId: string,
  anchor: GridCell,
  upgrades: UpgradeManager
): CombatModule | null {
  if (definition.kind !== 'combat') return null;
  if (definition.behavior === 'direct') return new DirectWeaponModule(definition, instanceId, anchor, upgrades);
  if (definition.behavior === 'arc') return new ArcWeaponModule(definition, instanceId, anchor, upgrades);
  return null;
}
