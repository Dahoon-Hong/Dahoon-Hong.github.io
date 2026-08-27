export abstract class Enemy {
  public x: number;
  public y: number;
  public hp: number;
  public maxHp: number;
  public speed: number;
  public radius: number;
  public reward: number;
  public typeName: string;
  private dead: boolean = false;

  constructor(
    x: number,
    y: number,
    hp: number,
    speed: number,
    radius: number,
    reward: number,
    typeName: string
  ) {
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.radius = radius;
    this.reward = reward;
    this.typeName = typeName;
  }

  public isDead(): boolean {
    return this.dead || this.hp <= 0;
  }

  public takeDamage(amount: number): void {
    if (this.isDead()) return;

    this.hp -= Math.max(0, amount);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  public update(dt: number, targetPos: { x: number; y: number }): void {
    if (this.isDead()) return;

    const dx = targetPos.x - this.x;
    const dy = targetPos.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }
  }

  public abstract render(ctx: CanvasRenderingContext2D): void;

  protected renderHpBar(ctx: CanvasRenderingContext2D): void {
    const barW = this.radius * 2;
    const barH = 4;
    const barX = this.x - this.radius;
    const barY = this.y - this.radius - 8;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX, barY, barW, barH);

    const healthRatio = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = healthRatio > 0.5 ? '#66bb6a' : healthRatio > 0.2 ? '#ffa726' : '#ef5350';
    ctx.fillRect(barX, barY, barW * healthRatio, barH);
    ctx.restore();
  }
}

export class StandardEnemy extends Enemy {
  constructor(x: number, y: number) {
    super(x, y, 45, 95, 12, 10, 'Standard');
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = '#ff5252';
    ctx.fillStyle = '#b71c1c';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    this.renderHpBar(ctx);
    ctx.restore();
  }
}

export class TankerEnemy extends Enemy {
  constructor(x: number, y: number) {
    super(x, y, 160, 45, 18, 25, 'Tanker');
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = '#ff9800';
    ctx.fillStyle = '#e65100';
    ctx.lineWidth = 3;

    ctx.beginPath();
    // Render Square/Hexagon wireframe
    const sides = 6;
    for (let i = 0; i < sides; i++) {
      const angle = (i * Math.PI * 2) / sides;
      const px = this.x + Math.cos(angle) * this.radius;
      const py = this.y + Math.sin(angle) * this.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    this.renderHpBar(ctx);
    ctx.restore();
  }
}
