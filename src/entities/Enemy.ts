import type { RenderContext } from '../rendering/RenderContext';

export type EnemyType = 'standard' | 'tanker';

export interface EnemyDefinition {
  hp: number;
  speed: number;
  radius: number;
  reward: number;
  typeName: string;
  contactDamage: number;
  contactDamageInterval: number;
}

const DEFAULT_STANDARD_DEFINITION: EnemyDefinition = {
  hp: 45,
  speed: 95,
  radius: 12,
  reward: 10,
  typeName: 'Standard',
  contactDamage: 10,
  contactDamageInterval: 0.2,
};

const DEFAULT_TANKER_DEFINITION: EnemyDefinition = {
  hp: 160,
  speed: 45,
  radius: 18,
  reward: 25,
  typeName: 'Tanker',
  contactDamage: 10,
  contactDamageInterval: 0.2,
};

export abstract class Enemy {
  public x: number;
  public y: number;
  public hp: number;
  public maxHp: number;
  public speed: number;
  public radius: number;
  public reward: number;
  public typeName: string;
  public readonly contactDamage: number;
  public readonly contactDamageInterval: number;
  private dead: boolean = false;
  private contactDamageTimer = 0;

  constructor(
    x: number,
    y: number,
    hp: number,
    speed: number,
    radius: number,
    reward: number,
    typeName: string,
    contactDamage = 10,
    contactDamageInterval = 0.2
  ) {
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.radius = radius;
    this.reward = reward;
    this.typeName = typeName;
    this.contactDamage = contactDamage;
    this.contactDamageInterval = contactDamageInterval;
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

    this.contactDamageTimer = Math.max(0, this.contactDamageTimer - dt);

    const dx = targetPos.x - this.x;
    const dy = targetPos.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }
  }

  public tryContactDamage(): boolean {
    if (this.contactDamageTimer > 0) return false;
    this.contactDamageTimer = this.contactDamageInterval;
    return true;
  }

  public abstract render(render: RenderContext): void;

  protected renderHpBar(render: RenderContext): void {
    const ctx = render.ctx;
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
  constructor(x: number, y: number, definition: EnemyDefinition = DEFAULT_STANDARD_DEFINITION) {
    super(
      x,
      y,
      definition.hp,
      definition.speed,
      definition.radius,
      definition.reward,
      definition.typeName,
      definition.contactDamage,
      definition.contactDamageInterval
    );
  }

  public render(render: RenderContext): void {
    render.renderer.drawSprite(render, 'enemy.shadow.standard', this.x, this.y + this.radius * 0.35);
    render.renderer.drawSprite(render, 'enemy.standard.idle', this.x, this.y);
    this.renderHpBar(render);
  }
}

export class TankerEnemy extends Enemy {
  constructor(x: number, y: number, definition: EnemyDefinition = DEFAULT_TANKER_DEFINITION) {
    super(
      x,
      y,
      definition.hp,
      definition.speed,
      definition.radius,
      definition.reward,
      definition.typeName,
      definition.contactDamage,
      definition.contactDamageInterval
    );
  }

  public render(render: RenderContext): void {
    render.renderer.drawSprite(render, 'enemy.shadow.tanker', this.x, this.y + this.radius * 0.35);
    render.renderer.drawSprite(render, 'enemy.tanker.idle', this.x, this.y);
    this.renderHpBar(render);
  }
}
