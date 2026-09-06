import { Enemy } from './Enemy';
import type { RenderContext } from '../rendering/RenderContext';

function distanceSquaredToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): number {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    const dx = pointX - startX;
    const dy = pointY - startY;
    return dx * dx + dy * dy;
  }

  const projection = Math.max(
    0,
    Math.min(
      1,
      ((pointX - startX) * segmentX + (pointY - startY) * segmentY) /
        segmentLengthSquared
    )
  );
  const closestX = startX + segmentX * projection;
  const closestY = startY + segmentY * projection;
  const dx = pointX - closestX;
  const dy = pointY - closestY;
  return dx * dx + dy * dy;
}

export type ProjectileSoundEvent =
  | { type: 'projectile-impact'; position: { x: number; y: number } }
  | { type: 'explosion'; position: { x: number; y: number } };

export abstract class Projectile {
  public x: number;
  public y: number;
  public damage: number;
  public dead: boolean = false;

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
    emitSound: (event: ProjectileSoundEvent) => void
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
  public life: number = 0.3; // seconds
  private timer: number = 0;
  public dead: boolean = false;

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
    if (this.timer >= this.life) {
      this.dead = true;
    }
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

// Direct Linear Projectile (Bullet)
export class DirectProjectile extends Projectile {
  private dirX: number;
  private dirY: number;
  private speed: number;
  private maxDistance: number;
  private traveled: number = 0;

  constructor(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    speed: number,
    damage: number,
    maxDistance: number = 600
  ) {
    super(x, y, damage);
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = speed;
    this.maxDistance = maxDistance;
  }

  public update(
    dt: number,
    enemies: Enemy[],
    spawnEffect: (e: VisualEffect) => void,
    emitSound: (event: ProjectileSoundEvent) => void
  ): void {
    if (this.dead) return;

    const previousX = this.x;
    const previousY = this.y;
    const moveDist = Math.min(this.speed * dt, this.maxDistance - this.traveled);
    this.x += this.dirX * moveDist;
    this.y += this.dirY * moveDist;
    this.traveled += moveDist;

    // Check hit against enemies
    for (const enemy of enemies) {
      if (enemy.isDead()) continue;
      const hitRadius = enemy.radius + 5;
      if (
        distanceSquaredToSegment(enemy.x, enemy.y, previousX, previousY, this.x, this.y) <=
        hitRadius * hitRadius
      ) {
        enemy.takeDamage(this.damage);
        spawnEffect(new VisualEffect(this.x, this.y, 15, '#29b6f6', 'effect.projectile.direct-hit'));
        emitSound({ type: 'projectile-impact', position: { x: this.x, y: this.y } });
        this.dead = true;
        break;
      }
    }

    if (this.traveled >= this.maxDistance) {
      this.dead = true;
    }
  }

  public render(render: RenderContext): void {
    render.renderer.drawSprite(render, 'effect.projectile.direct', this.x, this.y, {
      rotation: Math.atan2(this.dirY, this.dirX),
    });
  }
}

// Arc Parabolic Projectile (Grenade / Mortar Shell)
export class ArcProjectile extends Projectile {
  private startX: number;
  private startY: number;
  private targetX: number;
  private targetY: number;
  private totalTime: number;
  private elapsedTime: number = 0;
  private maxArcHeight: number = 80;
  private aoeRadius: number;

  constructor(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    flightTime: number,
    damage: number,
    aoeRadius: number
  ) {
    super(startX, startY, damage);
    this.startX = startX;
    this.startY = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.totalTime = flightTime;
    this.aoeRadius = aoeRadius;
  }

  public update(
    dt: number,
    enemies: Enemy[],
    spawnEffect: (e: VisualEffect) => void,
    emitSound: (event: ProjectileSoundEvent) => void
  ): void {
    if (this.dead) return;

    this.elapsedTime = Math.min(this.totalTime, this.elapsedTime + dt);
    const t = Math.min(1, this.elapsedTime / this.totalTime);

    // Ground position interpolation
    this.x = this.startX + (this.targetX - this.startX) * t;
    this.y = this.startY + (this.targetY - this.startY) * t;

    if (t >= 1) {
      // Arrived at target: AOE Explosion!
      for (const enemy of enemies) {
        if (enemy.isDead()) continue;
        const dist = Math.hypot(enemy.x - this.targetX, enemy.y - this.targetY);
        if (dist <= this.aoeRadius + enemy.radius) {
          // Full damage at center, falloff at edges
          const damageFactor = Math.max(0, 1 - dist / (this.aoeRadius + enemy.radius));
          enemy.takeDamage(this.damage * damageFactor);
        }
      }

      spawnEffect(new VisualEffect(this.targetX, this.targetY, this.aoeRadius, '#ab47bc', 'effect.explosion.arc'));
      emitSound({ type: 'explosion', position: { x: this.targetX, y: this.targetY } });
      this.dead = true;
    }
  }

  public render(render: RenderContext): void {
    const ctx = render.ctx;
    const t = Math.min(1, this.elapsedTime / this.totalTime);
    // Parabola height Z = 4 * H * t * (1 - t)
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

    // 1. Landing Shadow on Ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(groundX, groundY, 8 * (1 - t * 0.3), 4 * (1 - t * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();

    // Target reticle indicator
    ctx.strokeStyle = 'rgba(171, 71, 188, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.targetX, this.targetY, this.aoeRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Dotted line connecting shadow to shell in air
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
