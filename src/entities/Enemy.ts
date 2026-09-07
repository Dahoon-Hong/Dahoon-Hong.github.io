import type { RenderContext } from '../rendering/RenderContext';
import type { TerrainCell, TerrainGrid } from '../core/TerrainGrid';
import type { TerrainPathfinder } from '../core/TerrainPathfinder';

export type EnemyType = 'standard' | 'tanker';
type EnemyVisualState = 'idle' | 'hit' | 'dead';

export interface EnemyDefinition {
  hp: number;
  speed: number;
  radius: number;
  reward: number;
  typeName: string;
  contactDamage: number;
  contactDamageInterval: number;
}

export interface EnemyNavigationContext {
  terrain: TerrainGrid;
  pathfinder: TerrainPathfinder;
  targetCell?: TerrainCell | null;
}

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
  public readonly enemyType: EnemyType;
  private dead: boolean = false;
  private contactDamageTimer = 0;
  private hitTimer = 0;
  private path: TerrainCell[] = [];
  private waypointIndex = 0;
  private lastTargetCell: TerrainCell | null = null;
  private repathTimer: number;
  private readonly repathInterval = 0.25;

  constructor(
    x: number,
    y: number,
    hp: number,
    speed: number,
    radius: number,
    reward: number,
    typeName: string,
    enemyType: EnemyType,
    contactDamage = 10,
    contactDamageInterval = 0.2,
    repathOffset = 0,
  ) {
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.radius = radius;
    this.reward = reward;
    this.typeName = typeName;
    this.enemyType = enemyType;
    this.contactDamage = contactDamage;
    this.contactDamageInterval = contactDamageInterval;
    this.repathTimer = Math.max(0, repathOffset);
  }

  public isDead(): boolean {
    return this.dead || this.hp <= 0;
  }

  public takeDamage(amount: number): void {
    if (this.isDead()) return;

    this.hp -= Math.max(0, amount);
    this.hitTimer = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  public getPath(): readonly TerrainCell[] {
    return this.path.slice(this.waypointIndex);
  }

  public getWaypointIndex(): number {
    return this.waypointIndex;
  }

  public update(dt: number, targetPos: { x: number; y: number }, navigation?: EnemyNavigationContext): void {
    if (this.isDead()) return;

    this.contactDamageTimer = Math.max(0, this.contactDamageTimer - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);

    if (navigation) {
      this.updateWithTerrain(dt, targetPos, navigation);
      return;
    }

    this.moveToward(targetPos, dt);
  }

  private updateWithTerrain(dt: number, targetPos: { x: number; y: number }, navigation: EnemyNavigationContext): void {
    this.repathTimer = Math.max(0, this.repathTimer - dt);
    const targetCell = navigation.targetCell ?? navigation.terrain.worldToCell(targetPos);
    const enemyCell = navigation.terrain.worldToCell({ x: this.x, y: this.y });
    const remainingPath = this.path.slice(this.waypointIndex);
    const pathValid = enemyCell !== null && navigation.pathfinder.isPathValid(enemyCell, remainingPath, this.radius);
    const targetChanged = !this.sameCell(this.lastTargetCell, targetCell);
    const needsPath = targetCell !== null && (targetChanged || !pathValid || remainingPath.length === 0);

    if (this.repathTimer <= 0 && needsPath) {
      this.lastTargetCell = targetCell ? { ...targetCell } : null;
      this.path = enemyCell && targetCell
        ? navigation.pathfinder.findPath(enemyCell, targetCell, { radius: this.radius }) ?? []
        : [];
      this.waypointIndex = 0;
      this.repathTimer = this.repathInterval;
    }

    if (targetCell === null || !enemyCell) return;
    const currentPath = this.path.slice(this.waypointIndex);
    if (currentPath.length > 0 && (targetChanged ? pathValid : true)) {
      const waypoint = navigation.terrain.cellToWorldCenter(currentPath[0]);
      if (this.moveToward(waypoint, dt)) this.waypointIndex++;
      return;
    }

    if (this.path.length === 0 && this.lastTargetCell && this.sameCell(this.lastTargetCell, targetCell)) {
      // A path may legitimately be empty when the enemy and target share a cell.
      if (this.sameCell(enemyCell, targetCell)) this.moveToward(targetPos, dt);
    }
  }

  private moveToward(targetPos: { x: number; y: number }, dt: number): boolean {
    const dx = targetPos.x - this.x;
    const dy = targetPos.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return true;

    const moveDistance = this.speed * dt;
    if (dist <= moveDistance) {
      this.x = targetPos.x;
      this.y = targetPos.y;
      return true;
    }
    this.x += (dx / dist) * moveDistance;
    this.y += (dy / dist) * moveDistance;
    return false;
  }

  private sameCell(a: TerrainCell | null, b: TerrainCell | null): boolean {
    return a?.x === b?.x && a?.y === b?.y;
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

  protected getVisualState(): EnemyVisualState {
    if (this.isDead()) return 'dead';
    return this.hitTimer > 0 ? 'hit' : 'idle';
  }
}

export class StandardEnemy extends Enemy {
  constructor(x: number, y: number, definition: EnemyDefinition, repathOffset = 0) {
    super(
      x,
      y,
      definition.hp,
      definition.speed,
      definition.radius,
      definition.reward,
      definition.typeName,
      'standard',
      definition.contactDamage,
      definition.contactDamageInterval,
      repathOffset,
    );
  }

  public render(render: RenderContext): void {
    render.renderer.drawSprite(render, 'enemy.shadow.standard', this.x, this.y + this.radius * 0.35);
    render.renderer.drawSprite(render, `enemy.standard.${this.getVisualState()}`, this.x, this.y);
    if (!this.isDead()) this.renderHpBar(render);
  }
}

export class TankerEnemy extends Enemy {
  constructor(x: number, y: number, definition: EnemyDefinition, repathOffset = 0) {
    super(
      x,
      y,
      definition.hp,
      definition.speed,
      definition.radius,
      definition.reward,
      definition.typeName,
      'tanker',
      definition.contactDamage,
      definition.contactDamageInterval,
      repathOffset,
    );
  }

  public render(render: RenderContext): void {
    render.renderer.drawSprite(render, 'enemy.shadow.tanker', this.x, this.y + this.radius * 0.35);
    render.renderer.drawSprite(render, `enemy.tanker.${this.getVisualState()}`, this.x, this.y);
    if (!this.isDead()) this.renderHpBar(render);
  }
}
