import { ResourceType } from '../core/ResourceStorage';
import {
  getOrientedModuleSize,
  GridCell,
  ModuleOrientation,
  ResourceCost,
  TankModuleDefinition,
} from '../core/TankDefinitionLoader';
import { UpgradeManager } from '../core/UpgradeManager';
import { Enemy } from './Enemy';
import { ArcProjectile, DirectProjectile, Projectile } from './Projectile';
import type { RenderContext } from '../rendering/RenderContext';

export type CombatSoundEvent = {
  type: 'weapon-fired';
  weapon: 'direct' | 'arc';
  position: { x: number; y: number };
};

export abstract class CombatModule {
  public readonly type = 'COMBAT';
  public readonly moduleId: string;
  public readonly instanceId: string;
  public readonly name: string;
  public anchor: GridCell;
  public orientation: ModuleOrientation;
  public size: { width: number; height: number };
  public readonly installCost: ResourceCost;
  public currentHp: number;

  protected readonly definition: TankModuleDefinition;
  protected readonly upgrades: UpgradeManager;

  public constructor(
    definition: TankModuleDefinition,
    instanceId: string,
    anchor: GridCell,
    upgrades: UpgradeManager,
    orientation: ModuleOrientation = definition.defaultOrientation ?? 0,
  ) {
    if (!definition.size) throw new Error(`[Combat] module '${definition.id}' is missing size`);

    this.definition = definition;
    this.moduleId = definition.id;
    this.instanceId = instanceId;
    this.name = definition.name;
    this.anchor = { ...anchor };
    this.orientation = orientation;
    this.size = getOrientedModuleSize(definition.size, orientation);
    this.installCost = { ...(definition.installCost ?? {}) };
    this.upgrades = upgrades;
    this.currentHp = this.maxHp;
  }

  public get maxHp(): number {
    return this.getStat('maxHp', 100);
  }

  public get baseSize(): { width: number; height: number } {
    return { ...this.definition.size! };
  }

  public get fireArcDegrees(): number {
    return this.definition.fireArcDegrees ?? 360;
  }

  public getFireAngle(tankFacingAngle: number): number {
    return tankFacingAngle + this.orientation * Math.PI / 2;
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

  public resetRuntime(): void {
    this.currentHp = this.maxHp;
  }

  public setPlacement(anchor: GridCell, orientation: ModuleOrientation): void {
    this.anchor = { ...anchor };
    this.orientation = orientation;
    this.size = getOrientedModuleSize(this.definition.size!, orientation);
  }

  public getStat(stat: string, fallback = 0): number {
    return this.upgrades.getEffectiveStats(this.instanceId)[stat] ?? fallback;
  }

  public abstract update(
    dt: number,
    moduleWorldPos: { x: number; y: number },
    fireAngle: number,
    enemies: Enemy[],
    spawnProjectile: (projectile: Projectile) => void,
    spendResource: (type: ResourceType, amount: number) => boolean,
    emitSound: (event: CombatSoundEvent) => void
  ): void;

  public abstract render(
    render: RenderContext,
    worldX: number,
    worldY: number,
    width: number,
    height: number
  ): void;

  protected renderBody(
    render: RenderContext,
    assetId: string,
    worldX: number,
    worldY: number,
    label: string,
    width = 44,
    height = 44,
  ): void {
    const asset = render.renderer.getAsset(assetId);
    const scale = asset ? Math.min(width / asset.draw.width, height / asset.draw.height) : width / 44;
    render.renderer.drawSprite(render, assetId, worldX, worldY, {
      scale,
      rotation: this.orientation * Math.PI / 2,
      alpha: this.isActive() ? 1 : 0.58,
      tint: this.isActive() ? undefined : '#17232d',
    });
    const ctx = render.ctx;
    ctx.save();
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
    fireAngle: number,
    enemies: Enemy[],
    spawnProjectile: (projectile: Projectile) => void,
    spendResource: (type: ResourceType, amount: number) => boolean,
    emitSound: (event: CombatSoundEvent) => void
  ): void {
    if (!this.isActive() || dt <= 0) return;
    this.cooldownTimer -= dt;
    if (this.cooldownTimer > 0) return;

    const target = findClosestEnemy(modulePos, enemies, this.getRange(), fireAngle, this.fireArcDegrees);
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
    emitSound({ type: 'weapon-fired', weapon: 'direct', position: { x: modulePos.x, y: modulePos.y } });
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

  public render(render: RenderContext, worldX: number, worldY: number, width: number, height: number): void {
    this.renderBody(render, 'tank.module.direct-weapon', worldX, worldY, 'GUN', width, height);
    const ctx = render.ctx;
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
    fireAngle: number,
    enemies: Enemy[],
    spawnProjectile: (projectile: Projectile) => void,
    spendResource: (type: ResourceType, amount: number) => boolean,
    emitSound: (event: CombatSoundEvent) => void
  ): void {
    if (!this.isActive() || dt <= 0) return;
    this.cooldownTimer -= dt;
    if (this.cooldownTimer > 0) return;

    const target = findClosestEnemy(modulePos, enemies, this.getRange(), fireAngle, this.fireArcDegrees);
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
    emitSound({ type: 'weapon-fired', weapon: 'arc', position: { x: modulePos.x, y: modulePos.y } });
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

  public render(render: RenderContext, worldX: number, worldY: number, width: number, height: number): void {
    this.renderBody(render, 'tank.module.arc-weapon', worldX, worldY, 'MORT', width, height);
    const ctx = render.ctx;
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
  range: number,
  fireAngle: number,
  fireArcDegrees: number,
): Enemy | null {
  let closest: Enemy | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const enemy of enemies) {
    if (enemy.isDead()) continue;
    const deltaX = enemy.x - position.x;
    const deltaY = enemy.y - position.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= range && distance < minDistance) {
      const targetAngle = Math.atan2(deltaY, deltaX);
      const angleDifference = Math.abs(Math.atan2(
        Math.sin(targetAngle - fireAngle),
        Math.cos(targetAngle - fireAngle),
      ));
      if (angleDifference > (fireArcDegrees * Math.PI / 180) / 2) continue;
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
  upgrades: UpgradeManager,
  orientation: ModuleOrientation = definition.defaultOrientation ?? 0,
): CombatModule | null {
  if (definition.kind !== 'combat') return null;
  if (definition.behavior === 'direct') return new DirectWeaponModule(definition, instanceId, anchor, upgrades, orientation);
  if (definition.behavior === 'arc') return new ArcWeaponModule(definition, instanceId, anchor, upgrades, orientation);
  return null;
}
