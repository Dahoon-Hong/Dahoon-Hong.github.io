import { Enemy } from './Enemy';

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

  public abstract update(dt: number, enemies: Enemy[], spawnEffect: (effect: VisualEffect) => void): void;
  public abstract render(ctx: CanvasRenderingContext2D): void;
}

export class VisualEffect {
  public x: number;
  public y: number;
  public radius: number;
  public maxRadius: number;
  public color: string;
  public life: number = 0.3; // seconds
  private timer: number = 0;
  public dead: boolean = false;

  constructor(x: number, y: number, maxRadius: number, color: string) {
    this.x = x;
    this.y = y;
    this.radius = 2;
    this.maxRadius = maxRadius;
    this.color = color;
  }

  public update(dt: number): void {
    this.timer += dt;
    const progress = this.timer / this.life;
    this.radius = this.maxRadius * Math.sin(progress * Math.PI);
    if (this.timer >= this.life) {
      this.dead = true;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = Math.max(0, 1 - this.timer / this.life);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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

  public update(dt: number, enemies: Enemy[], spawnEffect: (e: VisualEffect) => void): void {
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
        spawnEffect(new VisualEffect(this.x, this.y, 15, '#29b6f6'));
        this.dead = true;
        break;
      }
    }

    if (this.traveled >= this.maxDistance) {
      this.dead = true;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

  public update(dt: number, enemies: Enemy[], spawnEffect: (e: VisualEffect) => void): void {
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

      spawnEffect(new VisualEffect(this.targetX, this.targetY, this.aoeRadius, '#ab47bc'));
      this.dead = true;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    const t = Math.min(1, this.elapsedTime / this.totalTime);
    // Parabola height Z = 4 * H * t * (1 - t)
    const arcZ = 4 * this.maxArcHeight * t * (1 - t);

    const groundX = this.x;
    const groundY = this.y;
    const airX = groundX;
    const airY = groundY - arcZ;

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

    // 3. Mortar shell in air
    ctx.fillStyle = '#ea80fc';
    ctx.shadowColor = '#e040fb';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(airX, airY, 6 + Math.sin(t * Math.PI) * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
