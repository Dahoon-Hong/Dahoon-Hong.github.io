import { Enemy } from './Enemy';
import { Projectile, DirectProjectile, ArcProjectile } from './Projectile';

export type ModuleType = 'CORE' | 'RESOURCE' | 'DIRECT_WEAPON' | 'ARC_WEAPON';

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
    addResource: (amount: number) => void
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
    addResource: (amount: number) => void
  ): void {
    if (!this.isActive()) return;

    this.timer += dt;
    const interval = Math.max(0.5, 2.0 - (this.level - 1) * 0.2);
    if (this.timer >= interval) {
      this.timer -= interval;
      const amount = 5 + (this.level - 1) * 3;
      addResource(amount);
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

// Direct Weapon Module (Machine Gun)
export class DirectWeaponModule extends BaseModule {
  private cooldownTimer: number = 0;

  constructor(gridX: number, gridY: number) {
    super('DIRECT_WEAPON', 'Gatling Cannon', gridX, gridY, 30);
  }

  public getRange(): number {
    return 300 + (this.level - 1) * 30;
  }

  public getDamage(): number {
    return 15 + (this.level - 1) * 8;
  }

  public getFireRate(): number {
    return Math.max(0.15, 0.4 - (this.level - 1) * 0.04);
  }

  public update(
    dt: number,
    modulePos: { x: number; y: number },
    enemies: Enemy[],
    spawnProjectile: (proj: Projectile) => void
  ): void {
    if (!this.isActive()) return;

    this.cooldownTimer -= dt;
    if (this.cooldownTimer <= 0) {
      // Find closest enemy within range
      let closest: Enemy | null = null;
      let minDist = this.getRange();

      for (const enemy of enemies) {
        if (enemy.isDead()) continue;
        const dist = Math.hypot(enemy.x - modulePos.x, enemy.y - modulePos.y);
        if (dist < minDist) {
          minDist = dist;
          closest = enemy;
        }
      }

      if (closest) {
        this.cooldownTimer = this.getFireRate();
        const dirX = (closest.x - modulePos.x) / minDist;
        const dirY = (closest.y - modulePos.y) / minDist;
        spawnProjectile(
          new DirectProjectile(modulePos.x, modulePos.y, dirX, dirY, 500, this.getDamage(), 500)
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
    return 400 + (this.level - 1) * 40;
  }

  public getDamage(): number {
    return 45 + (this.level - 1) * 20;
  }

  public getFireRate(): number {
    return Math.max(0.8, 1.8 - (this.level - 1) * 0.15);
  }

  public getAOERadius(): number {
    return 60 + (this.level - 1) * 10;
  }

  public update(
    dt: number,
    modulePos: { x: number; y: number },
    enemies: Enemy[],
    spawnProjectile: (proj: Projectile) => void
  ): void {
    if (!this.isActive()) return;

    this.cooldownTimer -= dt;
    if (this.cooldownTimer <= 0) {
      // Find enemy with most surrounding enemies or closest
      let target: Enemy | null = null;
      let minDist = this.getRange();

      for (const enemy of enemies) {
        if (enemy.isDead()) continue;
        const dist = Math.hypot(enemy.x - modulePos.x, enemy.y - modulePos.y);
        if (dist < minDist) {
          minDist = dist;
          target = enemy;
        }
      }

      if (target) {
        this.cooldownTimer = this.getFireRate();
        spawnProjectile(
          new ArcProjectile(
            modulePos.x,
            modulePos.y,
            target.x,
            target.y,
            1.2,
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
