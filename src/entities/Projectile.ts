import { Enemy } from './Enemy';
import type { RenderContext } from '../rendering/RenderContext';
import type { TerrainCell, TerrainGrid } from '../core/TerrainGrid';
import type { EnemySpatialQuery } from '../core/EnemySpatialIndex';

const PROJECTILE_BROAD_PHASE_MARGIN = 32;

function segmentHitProgress(
  pointX: number,
  pointY: number,
  radius: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number | null {
  const dx = endX - startX;
  const dy = endY - startY;
  const offsetX = startX - pointX;
  const offsetY = startY - pointY;
  const a = dx * dx + dy * dy;
  const radiusSquared = radius * radius;
  if (a === 0) return offsetX * offsetX + offsetY * offsetY <= radiusSquared ? 0 : null;
  const c = offsetX * offsetX + offsetY * offsetY - radiusSquared;
  if (c <= 0) return 0;
  const b = 2 * (offsetX * dx + offsetY * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = (-b - Math.sqrt(discriminant)) / (2 * a);
  return root >= 0 && root <= 1 ? root : null;
}

export type ProjectileSoundEvent =
  | { type: 'projectile-impact'; position: { x: number; y: number } }
  | { type: 'explosion'; position: { x: number; y: number } };

export interface DirectProjectileOptions {
  penetration?: number;
  explosionRadius?: number;
  targetPoint?: { x: number; y: number };
  detonateOnEnd?: boolean;
}

export interface ArcProjectileOptions {
  ignoreTerrain?: boolean;
  maxArcHeight?: number;
}

export function canPenetrate( penetration: number, armor: number): boolean {
  return Number.isFinite(penetration)
    ? penetration > Math.max(0, armor)
    : penetration === Number.POSITIVE_INFINITY;
}

export function applyArmoredDamage(enemy: Enemy, damage: number, penetration: number): number {
  if (!canPenetrate(penetration, enemy.armor)) return penetration;
  enemy.takeDamage(damage);
  return Number.isFinite(penetration) ? penetration - enemy.armor : penetration;
}

export abstract class Projectile {
  public x: number;
  public y: number;
  public damage: number;
  public dead = false;
  public terrainHitCell: TerrainCell | null = null;

  constructor(x: number, y: number, damage: number) {
    this.x = x;
    this.y = y;
    this.damage = damage;
  }

  public isDead(): boolean {
    return this.dead;
  }

  public abstract update(
    dt: number,
    enemies: Enemy[],
    spawnEffect: (effect: VisualEffect) => void,
    emitSound: (event: ProjectileSoundEvent) => void,
    terrain?: TerrainGrid,
    enemyQuery?: EnemySpatialQuery,
  ): void;
  public abstract render(render: RenderContext): void;
}

export type VisualEffectPriority = 'critical' | 'decorative';

export class VisualEffect {
  public x: number;
  public y: number;
  public radius: number;
  public maxRadius: number;
  public color: string;
  public readonly assetId: string;
  public readonly priority: VisualEffectPriority;
  public life = 0.3;
  private timer = 0;
  public dead = false;

  constructor(
    x: number,
    y: number,
    maxRadius: number,
    color: string,
    assetId = 'effect.projectile.direct-hit',
    priority: VisualEffectPriority = 'critical',
  ) {
    this.x = x;
    this.y = y;
    this.radius = 2;
    this.maxRadius = maxRadius;
    this.color = color;
    this.assetId = assetId;
    this.priority = priority;
  }

  public isDecorative(): boolean {
    return this.priority === 'decorative';
  }

  public update(dt: number): void {
    this.timer += dt;
    const progress = this.timer / this.life;
    this.radius = this.maxRadius * Math.sin(progress * Math.PI);
    if (this.timer >= this.life) this.dead = true;
  }

  public render(render: RenderContext): void {
    const asset = render.renderer.getAsset(this.assetId);
    const baseRadius = asset ? Math.min(asset.draw.width, asset.draw.height) / 2 : 16;
    const radius = render.reducedMotion ? this.maxRadius * 0.65 : this.radius;
    render.renderer.drawSprite(render, this.assetId, this.x, this.y, {
      scale: Math.max(0.2, radius / baseRadius),
      alpha: Math.max(0, 1 - this.timer / this.life),
      tint: this.color,
    });
  }
}

export class DirectProjectile extends Projectile {
  private dirX: number;
  private dirY: number;
  private speed: number;
  private maxDistance: number;
  private traveled = 0;
  private remainingPenetration: number;
  private readonly explosionRadius: number;
  private readonly targetPoint: { x: number; y: number } | null;
  private readonly detonateOnEnd: boolean;
  private readonly hitEnemies = new Set<Enemy>();

  constructor(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    speed: number,
    damage: number,
    maxDistance = 600,
    options: DirectProjectileOptions = {},
  ) {
    super(x, y, damage);
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = Math.max(0, speed);
    this.maxDistance = Math.max(0, maxDistance);
    this.remainingPenetration = options.penetration ?? Number.POSITIVE_INFINITY;
    this.explosionRadius = Math.max(0, options.explosionRadius ?? 0);
    this.targetPoint = options.targetPoint ? { ...options.targetPoint } : null;
    this.detonateOnEnd = options.detonateOnEnd ?? false;
  }

  public update(
    dt: number,
    enemies: Enemy[],
    spawnEffect: (effect: VisualEffect) => void,
    emitSound: (event: ProjectileSoundEvent) => void,
    terrain?: TerrainGrid,
    enemyQuery?: EnemySpatialQuery,
  ): void {
    if (this.dead) return;

    const previousX = this.x;
    const previousY = this.y;
    const remainingDistance = Math.max(0, this.maxDistance - this.traveled);
    const moveDist = Math.min(this.speed * Math.max(0, dt), remainingDistance);
    this.x += this.dirX * moveDist;
    this.y += this.dirY * moveDist;
    this.traveled += moveDist;
    const segmentEndX = this.x;
    const segmentEndY = this.y;

    const candidates = enemyQuery?.querySegment(
      { x: previousX, y: previousY },
      { x: segmentEndX, y: segmentEndY },
      PROJECTILE_BROAD_PHASE_MARGIN,
    ) ?? enemies;
    const enemyHits: Array<{ enemy: Enemy; progress: number }> = [];
    for (const enemy of candidates) {
      if (enemy.isDead() || this.hitEnemies.has(enemy)) continue;
      const progress = segmentHitProgress(
        enemy.x,
        enemy.y,
        enemy.radius + 5,
        previousX,
        previousY,
        this.x,
        this.y,
      );
      if (progress !== null) enemyHits.push({ enemy, progress });
    }
    enemyHits.sort((a, b) => a.progress - b.progress);

    const terrainHit = terrain?.raycast({ x: previousX, y: previousY }, { x: segmentEndX, y: segmentEndY });
    const terrainProgress = terrainHit?.progress ?? Number.POSITIVE_INFINITY;
    for (const hit of enemyHits) {
      if (hit.progress > terrainProgress + 1e-9) break;
      this.x = previousX + (segmentEndX - previousX) * hit.progress;
      this.y = previousY + (segmentEndY - previousY) * hit.progress;
      this.hitEnemies.add(hit.enemy);
      const penetrated = canPenetrate(this.remainingPenetration, hit.enemy.armor);
      if (!penetrated) {
        if (this.detonateOnEnd) {
          this.detonate(this.x, this.y, enemies, spawnEffect, emitSound, enemyQuery);
        } else {
          this.impact(spawnEffect, emitSound);
        }
        this.dead = true;
        return;
      }

      this.remainingPenetration = applyArmoredDamage(hit.enemy, this.damage, this.remainingPenetration);
      spawnEffect(new VisualEffect(this.x, this.y, 15, '#29b6f6', 'effect.projectile.direct-hit'));
    }

    if (terrainHit) {
      this.terrainHitCell = terrainHit.cell;
      this.x = terrainHit.point.x;
      this.y = terrainHit.point.y;
      if (this.detonateOnEnd) {
        this.detonate(this.x, this.y, enemies, spawnEffect, emitSound, enemyQuery);
      } else {
        this.impact(spawnEffect, emitSound);
      }
      this.dead = true;
      return;
    }

    this.x = segmentEndX;
    this.y = segmentEndY;

    if (this.traveled >= this.maxDistance - 1e-9) {
      if (this.detonateOnEnd) {
        const point = this.targetPoint ?? { x: this.x, y: this.y };
        this.x = point.x;
        this.y = point.y;
        this.detonate(this.x, this.y, enemies, spawnEffect, emitSound, enemyQuery);
      }
      this.dead = true;
    }
  }

  public render(render: RenderContext): void {
    render.renderer.drawSprite(render, 'effect.projectile.direct', this.x, this.y, {
      rotation: Math.atan2(this.dirY, this.dirX),
      scale: this.detonateOnEnd ? 1.35 : 1,
    });
  }

  private impact(
    spawnEffect: (effect: VisualEffect) => void,
    emitSound: (event: ProjectileSoundEvent) => void,
  ): void {
    spawnEffect(new VisualEffect(this.x, this.y, 15, '#90a4ae', 'effect.projectile.direct-hit'));
    emitSound({ type: 'projectile-impact', position: { x: this.x, y: this.y } });
  }

  private detonate(
    x: number,
    y: number,
    enemies: Enemy[],
    spawnEffect: (effect: VisualEffect) => void,
    emitSound: (event: ProjectileSoundEvent) => void,
    enemyQuery?: EnemySpatialQuery,
  ): void {
    const candidates = enemyQuery?.queryCircle({ x, y }, this.explosionRadius + PROJECTILE_BROAD_PHASE_MARGIN) ?? enemies;
    for (const enemy of candidates) {
      if (enemy.isDead()) continue;
      const distance = Math.hypot(enemy.x - x, enemy.y - y);
      const impactRadius = this.explosionRadius + enemy.radius;
      if (distance > impactRadius) continue;
      const factor = this.explosionRadius > 0
        ? Math.max(0, 1 - distance / impactRadius)
        : distance <= enemy.radius ? 1 : 0;
      if (factor <= 0) continue;
      applyArmoredDamage(enemy, this.damage * factor, this.remainingPenetration);
    }
    spawnEffect(new VisualEffect(x, y, Math.max(18, this.explosionRadius), '#ff8f00', 'effect.explosion.arc'));
    emitSound({ type: 'explosion', position: { x, y } });
  }
}

export class ArcProjectile extends Projectile {
  private startX: number;
  private startY: number;
  private targetX: number;
  private targetY: number;
  private totalTime: number;
  private elapsedTime = 0;
  private readonly maxArcHeight: number;
  private aoeRadius: number;
  private penetration: number;
  private readonly ignoreTerrain: boolean;

  constructor(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    flightTime: number,
    damage: number,
    aoeRadius: number,
    penetration = Number.POSITIVE_INFINITY,
    options: ArcProjectileOptions = {},
  ) {
    super(startX, startY, damage);
    this.startX = startX;
    this.startY = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.totalTime = Math.max(0.001, flightTime);
    this.aoeRadius = Math.max(0, aoeRadius);
    this.penetration = penetration;
    this.ignoreTerrain = options.ignoreTerrain ?? false;
    this.maxArcHeight = Math.max(0, options.maxArcHeight ?? 80);
  }

  public update(
    dt: number,
    enemies: Enemy[],
    spawnEffect: (effect: VisualEffect) => void,
    emitSound: (event: ProjectileSoundEvent) => void,
    terrain?: TerrainGrid,
    enemyQuery?: EnemySpatialQuery,
  ): void {
    if (this.dead) return;

    this.elapsedTime = Math.min(this.totalTime, this.elapsedTime + Math.max(0, dt));
    const t = Math.min(1, this.elapsedTime / this.totalTime);
    const previousX = this.x;
    const previousY = this.y;
    this.x = this.startX + (this.targetX - this.startX) * t;
    this.y = this.startY + (this.targetY - this.startY) * t;

    if (!this.ignoreTerrain) {
      const terrainHit = terrain?.raycast({ x: previousX, y: previousY }, { x: this.x, y: this.y });
      if (terrainHit) {
        this.terrainHitCell = terrainHit.cell;
        this.x = terrainHit.point.x;
        this.y = terrainHit.point.y;
        spawnEffect(new VisualEffect(this.x, this.y, 15, '#90a4ae', 'effect.projectile.direct-hit'));
        emitSound({ type: 'projectile-impact', position: { x: this.x, y: this.y } });
        this.dead = true;
        return;
      }
    }

    if (t >= 1) {
      const candidates = enemyQuery?.queryCircle(
        { x: this.targetX, y: this.targetY },
        this.aoeRadius + PROJECTILE_BROAD_PHASE_MARGIN,
      ) ?? enemies;
      for (const enemy of candidates) {
        if (enemy.isDead()) continue;
        const distance = Math.hypot(enemy.x - this.targetX, enemy.y - this.targetY);
        const impactRadius = this.aoeRadius + enemy.radius;
        if (distance > impactRadius) continue;
        const damageFactor = Math.max(0, 1 - distance / impactRadius);
        if (damageFactor > 0) applyArmoredDamage(enemy, this.damage * damageFactor, this.penetration);
      }

      spawnEffect(new VisualEffect(this.targetX, this.targetY, this.aoeRadius, '#ab47bc', 'effect.explosion.arc'));
      emitSound({ type: 'explosion', position: { x: this.targetX, y: this.targetY } });
      this.dead = true;
    }
  }

  public render(render: RenderContext): void {
    const ctx = render.ctx;
    const t = Math.min(1, this.elapsedTime / this.totalTime);
    const arcZ = 4 * this.maxArcHeight * t * (1 - t);
    const groundX = this.x;
    const groundY = this.y;
    const airX = groundX;
    const airY = groundY - arcZ;

    render.renderer.drawSprite(render, 'effect.projectile.arc-target', this.targetX, this.targetY, {
      scale: this.aoeRadius / 32,
      alpha: render.reducedMotion ? 0.35 : 0.55,
    });

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(groundX, groundY, 8 * (1 - t * 0.3), 4 * (1 - t * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(171, 71, 188, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.targetX, this.targetY, this.aoeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(groundX, groundY);
    ctx.lineTo(airX, airY);
    ctx.stroke();
    ctx.restore();

    render.renderer.drawSprite(render, 'effect.projectile.arc', airX, airY, {
      rotation: Math.atan2(this.targetY - this.startY, this.targetX - this.startX),
      scale: 1 + (render.reducedMotion ? 0 : Math.sin(t * Math.PI) * 0.3),
    });
  }
}
