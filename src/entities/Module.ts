import { ResourceType } from '../core/ResourceStorage';
import {
  getOrientedModuleSize,
  GridCell,
  ModuleOrientation,
  ResourceCost,
  TankModuleDefinition,
  WeaponClass,
} from '../core/TankDefinitionLoader';
import type { SoundEffectId } from '../core/AudioManager';
import { UpgradeManager } from '../core/UpgradeManager';
import { Enemy } from './Enemy';
import { ArcProjectile, DirectProjectile, Projectile, VisualEffect } from './Projectile';
import type { EnemySpatialQuery } from '../core/EnemySpatialIndex';
import type { RenderContext } from '../rendering/RenderContext';

export type CombatSoundEvent = {
  type: 'weapon-fired';
  weapon: 'direct' | 'arc';
  weaponClass: WeaponClass;
  soundId: SoundEffectId;
  fireEffectId: string;
  position: { x: number; y: number };
};

export type LineOfSightQuery = (
  from: { x: number; y: number },
  to: { x: number; y: number },
) => boolean;

export type CombatEffectEmitter = (effect: VisualEffect) => void;

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
  protected loadedShots: number;
  protected reloadTimer = 0;
  private recoilTimer = 0;

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
    this.loadedShots = this.getMagazineSize();
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
    this.loadedShots = this.getMagazineSize();
    this.reloadTimer = 0;
    this.recoilTimer = 0;
  }

  public setPlacement(anchor: GridCell, orientation: ModuleOrientation): void {
    this.anchor = { ...anchor };
    this.orientation = orientation;
    this.size = getOrientedModuleSize(this.definition.size!, orientation);
  }

  public getStat(stat: string, fallback = 0): number {
    return this.upgrades.getEffectiveStats(this.instanceId)[stat] ?? fallback;
  }

  public getWeaponClass(): WeaponClass {
    return this.definition.weaponClass ?? (this.definition.behavior === 'arc' ? 'howitzer' : 'machine-gun');
  }

  public getRange(): number {
    return this.getStat('range', 600);
  }

  public getMinRange(): number {
    return this.getStat('minRange', 0);
  }

  public getDamage(): number {
    return this.getStat('damage', 30);
  }

  public getPenetration(): number {
    return this.getStat('penetration', Number.POSITIVE_INFINITY);
  }

  public getMagazineSize(): number {
    return Math.max(1, Math.floor(this.getStat('magazineSize', 1)));
  }

  public getLoadedShots(): number {
    return this.loadedShots;
  }

  public isReloading(): boolean {
    return this.reloadTimer > 0;
  }

  public getReloadTime(): number {
    return Math.max(0, this.getStat('reloadTime', 0));
  }

  public getFireInterval(): number {
    const fireRate = this.getStat('fireRate', this.getWeaponClass() === 'machine-gun' ? 0.2 : 0);
    return fireRate > 0 ? Math.max(0.01, fireRate) : 0;
  }

  /** Compatibility alias for older callers that treated fireRate as the cooldown. */
  public getFireRate(): number {
    return this.getFireInterval();
  }

  public abstract update(
    dt: number,
    moduleWorldPos: { x: number; y: number },
    fireAngle: number,
    enemies: Enemy[],
    spawnProjectile: (projectile: Projectile) => void,
    spendResource: (type: ResourceType, amount: number) => boolean,
    emitSound: (event: CombatSoundEvent) => void,
    hasLineOfSight?: LineOfSightQuery,
    enemyQuery?: EnemySpatialQuery,
    spawnEffect?: CombatEffectEmitter,
  ): void;

  public abstract render(
    render: RenderContext,
    worldX: number,
    worldY: number,
    width: number,
    height: number
  ): void;

  protected tickRuntime(dt: number): void {
    this.recoilTimer = Math.max(0, this.recoilTimer - dt);
  }

  protected tickReload(dt: number): boolean {
    if (this.reloadTimer <= 0) return true;
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    if (this.reloadTimer > 0) return false;
    this.loadedShots = this.getMagazineSize();
    return true;
  }

  protected spendShot(spendResource: (type: ResourceType, amount: number) => boolean): boolean {
    const usesReloadAmmo = this.getWeaponClass() === 'machine-gun';
    if (this.loadedShots <= 0) {
      this.startReload(usesReloadAmmo ? spendResource : undefined);
      return false;
    }
    if (!usesReloadAmmo && !spendResource('ammo', 1)) return false;
    this.loadedShots--;
    if (this.loadedShots <= 0) {
      this.startReload(usesReloadAmmo ? spendResource : undefined);
    }
    return true;
  }

  protected startReload(
    spendResource?: (type: ResourceType, amount: number) => boolean,
  ): boolean {
    if (this.getWeaponClass() === 'machine-gun' && (!spendResource || !spendResource('ammo', 1))) {
      return false;
    }
    const reloadTime = this.getReloadTime();
    if (reloadTime <= 0) {
      this.loadedShots = this.getMagazineSize();
      this.reloadTimer = 0;
      return true;
    }
    this.reloadTimer = reloadTime;
    return true;
  }

  protected emitFire(
    weapon: 'direct' | 'arc',
    position: { x: number; y: number },
    emitSound: (event: CombatSoundEvent) => void,
    spawnEffect?: CombatEffectEmitter,
    fireAngle = this.getFireAngle(0),
  ): void {
    this.recoilTimer = 0.12;
    const weaponClass = this.getWeaponClass();
    const fireEffectId = this.definition.fireEffectId ?? (
      weaponClass === 'howitzer' ? 'effect.explosion.arc' : 'effect.projectile.direct-hit'
    );
    emitSound({
      type: 'weapon-fired',
      weapon,
      weaponClass,
      soundId: (this.definition.fireSoundId ?? (weapon === 'direct'
        ? 'sfx.weapon.direct-fire'
        : 'sfx.weapon.arc-fire')) as SoundEffectId,
      fireEffectId,
      position: { ...position },
    });
    if (spawnEffect) {
      const color = weaponClass === 'machine-gun' ? '#ffd54f' : weaponClass === 'tank-gun' ? '#ff8f00' : '#ce93d8';
      const effectX = position.x + Math.cos(fireAngle) * 8;
      const effectY = position.y + Math.sin(fireAngle) * 8;
      spawnEffect(new VisualEffect(effectX, effectY, Math.min(24, 8 + this.getDamage() * 0.03), color, fireEffectId, 'decorative'));
    }
  }

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
    const recoilProgress = this.recoilTimer > 0 ? this.recoilTimer / 0.12 : 0;
    const recoilDistance = Math.min(width, height) * 0.12 * recoilProgress;
    const barrelAngle = this.orientation * Math.PI / 2;
    const drawX = worldX - Math.cos(barrelAngle) * recoilDistance;
    const drawY = worldY - Math.sin(barrelAngle) * recoilDistance;
    render.renderer.drawSprite(render, assetId, drawX, drawY, {
      scale,
      rotation: barrelAngle,
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
    emitSound: (event: CombatSoundEvent) => void,
    hasLineOfSight: LineOfSightQuery = () => true,
    enemyQuery?: EnemySpatialQuery,
    spawnEffect?: CombatEffectEmitter,
  ): void {
    if (!this.isActive() || dt <= 0) return;
    this.tickRuntime(dt);
    if (!this.tickReload(dt)) return;
    this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    if (this.cooldownTimer > 0) return;

    const weaponClass = this.getWeaponClass();
    const candidates = enemyQuery?.queryCircle(modulePos, this.getRange()) ?? enemies;
    const target = findClosestEnemy(
      modulePos,
      candidates,
      this.getRange(),
      fireAngle,
      this.fireArcDegrees,
      weaponClass === 'machine-gun' ? hasLineOfSight : () => true,
      this.getMinRange(),
    );
    if (!target || !this.spendShot(spendResource)) return;

    const distance = Math.hypot(target.x - modulePos.x, target.y - modulePos.y);
    const directionX = distance > 0 ? (target.x - modulePos.x) / distance : 1;
    const directionY = distance > 0 ? (target.y - modulePos.y) / distance : 0;
    const tankGun = weaponClass === 'tank-gun';
    this.cooldownTimer = this.getFireInterval();
    spawnProjectile(
      new DirectProjectile(
        modulePos.x,
        modulePos.y,
        directionX,
        directionY,
        this.getStat('projectileSpeed', 1000),
        this.getDamage(),
        tankGun ? Math.max(1, distance) : this.getStat('maxDistance', this.getRange()),
        {
          penetration: this.getPenetration(),
          explosionRadius: tankGun ? this.getStat('aoeRadius', 0) : 0,
          targetPoint: tankGun ? { x: target.x, y: target.y } : undefined,
          detonateOnEnd: tankGun,
        },
      )
    );
    this.emitFire('direct', modulePos, emitSound, spawnEffect, fireAngle);
  }

  public resetRuntime(): void {
    super.resetRuntime();
    this.cooldownTimer = 0;
  }

  public render(render: RenderContext, worldX: number, worldY: number, width: number, height: number): void {
    const assetId = this.definition.moduleAssetId ?? 'tank.module.direct-weapon';
    this.renderBody(render, assetId, worldX, worldY, this.getWeaponClass() === 'tank-gun' ? 'GUN' : 'MG', width, height);
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
    emitSound: (event: CombatSoundEvent) => void,
    _hasLineOfSight: LineOfSightQuery = () => true,
    enemyQuery?: EnemySpatialQuery,
    spawnEffect?: CombatEffectEmitter,
  ): void {
    if (!this.isActive() || dt <= 0) return;
    this.tickRuntime(dt);
    if (!this.tickReload(dt)) return;
    this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    if (this.cooldownTimer > 0) return;

    const candidates = enemyQuery?.queryCircle(modulePos, this.getRange()) ?? enemies;
    const target = findClosestEnemy(
      modulePos,
      candidates,
      this.getRange(),
      fireAngle,
      this.fireArcDegrees,
      () => true,
      this.getMinRange(),
    );
    if (!target || !this.spendShot(spendResource)) return;

    this.cooldownTimer = this.getFireInterval();
    spawnProjectile(
      new ArcProjectile(
        modulePos.x,
        modulePos.y,
        target.x,
        target.y,
        this.getStat('flightTime', 1.2),
        this.getDamage(),
        this.getStat('aoeRadius', 120),
        this.getPenetration(),
        { ignoreTerrain: true },
      )
    );
    this.emitFire('arc', modulePos, emitSound, spawnEffect, fireAngle);
  }

  public resetRuntime(): void {
    super.resetRuntime();
    this.cooldownTimer = 0;
  }

  public render(render: RenderContext, worldX: number, worldY: number, width: number, height: number): void {
    const assetId = this.definition.moduleAssetId ?? 'tank.module.arc-weapon';
    this.renderBody(render, assetId, worldX, worldY, 'HOW', width, height);
  }
}

export function findClosestEnemy(
  position: { x: number; y: number },
  enemies: readonly Enemy[],
  range: number,
  fireAngle: number,
  fireArcDegrees: number,
  hasLineOfSight: LineOfSightQuery = () => true,
  minRange = 0,
): Enemy | null {
  let closest: Enemy | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const enemy of enemies) {
    if (enemy.isDead()) continue;
    const deltaX = enemy.x - position.x;
    const deltaY = enemy.y - position.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < minRange || distance > range || distance >= minDistance) continue;
    const targetAngle = Math.atan2(deltaY, deltaX);
    const angleDifference = Math.abs(Math.atan2(
      Math.sin(targetAngle - fireAngle),
      Math.cos(targetAngle - fireAngle),
    ));
    if (angleDifference > (fireArcDegrees * Math.PI / 180) / 2) continue;
    if (!hasLineOfSight(position, { x: enemy.x, y: enemy.y })) continue;
    closest = enemy;
    minDistance = distance;
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
