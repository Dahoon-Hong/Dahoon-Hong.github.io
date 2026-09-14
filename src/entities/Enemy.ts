import type { RenderContext } from '../rendering/RenderContext';
import type { TerrainCell, TerrainGrid, TerrainPoint } from '../core/TerrainGrid';

export type EnemyType = 'standard' | 'tanker';
type EnemyVisualState = 'idle' | 'hit' | 'dead';

export interface EnemyDefinition {
  spawnWeight: number;
  spawnInterval: number;
  spawnBatchSize: number;
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
  targetCell?: TerrainCell | null;
  nearbyEnemies?: readonly Enemy[];
  directive?: EnemyNavigationDirective;
}

export type EnemyNavigationMode = 'path' | 'local' | 'engaged' | 'repath';

export interface EnemyNavigationDirective {
  mode: EnemyNavigationMode;
  targetCell: TerrainCell | null;
  targetPoint: TerrainPoint | null;
  arrivalRadius: number;
  stopDistance: number;
  probeDistance: number;
  separationWeight: number;
  maxNearbyEnemies: number;
}

export interface EnemyNavigationTelemetry {
  movementDistance: number;
  safeProgress: number;
  steeringDirection: TerrainPoint | null;
  blockedProbeCount: number;
  stopped: boolean;
  stoppedReason: 'arrival' | 'blocked' | 'pending-path' | null;
}

export abstract class Enemy {
  private static nextNavigationId = 1;

  public readonly navigationId = Enemy.nextNavigationId++;
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
  private lastMoveSafeProgress = 1;
  private navigationTelemetry: EnemyNavigationTelemetry = {
    movementDistance: 0,
    safeProgress: 1,
    steeringDirection: null,
    blockedProbeCount: 0,
    stopped: false,
    stoppedReason: null,
  };

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

  public applyNavigationPath(path: readonly TerrainCell[], targetCell: TerrainCell | null): void {
    this.path = path.map((cell) => ({ ...cell }));
    this.waypointIndex = 0;
    this.lastTargetCell = targetCell ? { ...targetCell } : null;
  }

  public clearNavigationPath(): void {
    this.path = [];
    this.waypointIndex = 0;
    this.lastTargetCell = null;
  }

  public getPath(): readonly TerrainCell[] {
    return this.path.slice(this.waypointIndex);
  }

  public getWaypointIndex(): number {
    return this.waypointIndex;
  }

  public getNavigationTelemetry(): EnemyNavigationTelemetry {
    return {
      ...this.navigationTelemetry,
      steeringDirection: this.navigationTelemetry.steeringDirection
        ? { ...this.navigationTelemetry.steeringDirection }
        : null,
    };
  }

  public update(dt: number, targetPos: { x: number; y: number }, navigation?: EnemyNavigationContext): void {
    if (this.isDead()) return;

    const startX = this.x;
    const startY = this.y;
    this.lastMoveSafeProgress = 1;
    this.navigationTelemetry = {
      movementDistance: 0,
      safeProgress: 1,
      steeringDirection: null,
      blockedProbeCount: 0,
      stopped: false,
      stoppedReason: null,
    };
    this.contactDamageTimer = Math.max(0, this.contactDamageTimer - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);

    if (navigation) {
      this.updateWithTerrain(dt, targetPos, navigation);
    } else {
      this.moveToward(targetPos, dt);
    }

    this.navigationTelemetry.movementDistance = Math.hypot(this.x - startX, this.y - startY);
    this.navigationTelemetry.safeProgress = this.lastMoveSafeProgress;
  }

  private updateWithTerrain(dt: number, targetPos: { x: number; y: number }, navigation: EnemyNavigationContext): void {
    const directive = navigation.directive;
    if (directive?.mode === 'local' || directive?.mode === 'engaged') {
      this.updateWithLocalSteering(dt, directive, navigation);
      return;
    }

    const targetCell = directive
      ? directive.targetCell
      : navigation.targetCell ?? navigation.terrain.worldToCell(targetPos);
    const enemyCell = navigation.terrain.worldToCell({ x: this.x, y: this.y });
    if (targetCell === null || !enemyCell) return;
    const currentPath = this.path.slice(this.waypointIndex);
    if (directive?.mode === 'repath' && currentPath.length === 0) {
      const previous = { x: this.x, y: this.y };
      this.updateWithLocalSteering(dt, directive, navigation);
      if (this.x === previous.x && this.y === previous.y && !this.navigationTelemetry.stopped) {
        this.navigationTelemetry.stoppedReason = this.navigationTelemetry.blockedProbeCount > 0
          ? 'blocked'
          : 'pending-path';
      }
      return;
    }
    if (currentPath.length > 0) {
      const waypoint = navigation.terrain.cellToWorldCenter(currentPath[0]);
      if (this.moveToward(waypoint, dt, navigation.terrain)) this.waypointIndex++;
      return;
    }

    if (this.path.length === 0 && this.lastTargetCell && this.sameCell(this.lastTargetCell, targetCell)) {
      // A path may legitimately be empty when the enemy and target share a cell.
      if (this.sameCell(enemyCell, targetCell)) {
        this.moveToward(directive?.targetPoint ?? targetPos, dt, navigation.terrain);
      }
    }
  }

  private updateWithLocalSteering(
    dt: number,
    directive: EnemyNavigationDirective,
    navigation: EnemyNavigationContext,
  ): void {
    const targetPoint = directive.targetPoint;
    if (!targetPoint) return;

    const toTarget = { x: targetPoint.x - this.x, y: targetPoint.y - this.y };
    const distance = Math.hypot(toTarget.x, toTarget.y);
    if (distance <= directive.stopDistance) {
      this.navigationTelemetry.stopped = true;
      this.navigationTelemetry.stoppedReason = 'arrival';
      return;
    }

    const seek = { x: toTarget.x / distance, y: toTarget.y / distance };
    const separation = this.getSeparation(navigation.nearbyEnemies ?? [], directive.maxNearbyEnemies);
    const desired = this.normalize({
      x: seek.x + separation.x * directive.separationWeight,
      y: seek.y + separation.y * directive.separationWeight,
    }, seek);
    const direction = this.findSafeSteeringDirection(desired, dt, directive.probeDistance, navigation.terrain);
    if (!direction) return;

    const arrivalScale = directive.mode === 'engaged'
      ? Math.min(1, Math.max(0, distance / Math.max(1, directive.arrivalRadius)))
      : distance < directive.arrivalRadius
        ? distance / Math.max(1, directive.arrivalRadius)
        : 1;
    this.moveAlong(direction, this.speed * dt * arrivalScale, navigation.terrain);
  }

  private getSeparation(nearbyEnemies: readonly Enemy[], maxNearbyEnemies: number): TerrainPoint {
    let x = 0;
    let y = 0;
    let considered = 0;
    for (const other of nearbyEnemies) {
      if (other === this || other.isDead()) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const distance = Math.hypot(dx, dy);
      const minimumDistance = this.radius + other.radius + 8;
      if (distance <= 1e-9 || distance >= minimumDistance) continue;
      const strength = (minimumDistance - distance) / minimumDistance;
      x += (dx / distance) * strength;
      y += (dy / distance) * strength;
      considered++;
      if (considered >= maxNearbyEnemies) break;
    }
    return this.normalize({ x, y }, { x: 0, y: 0 });
  }

  private findSafeSteeringDirection(
    desired: TerrainPoint,
    dt: number,
    probeDistance: number,
    terrain: TerrainGrid,
  ): TerrainPoint | null {
    const desiredAngle = Math.atan2(desired.y, desired.x);
    const offsets = [0, -Math.PI / 9, Math.PI / 9, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2, Math.PI];
    const lookAhead = Math.min(probeDistance, Math.max(this.speed * dt, terrain.cellSize * 0.25));
    let best: TerrainPoint | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const offset of offsets) {
      const angle = desiredAngle + offset;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const end = {
        x: this.x + direction.x * lookAhead,
        y: this.y + direction.y * lookAhead,
      };
      if (!terrain.isOpenForRadiusSegment({ x: this.x, y: this.y }, end, this.radius, 'enemy')) {
        this.navigationTelemetry.blockedProbeCount++;
        continue;
      }
      const score = direction.x * desired.x + direction.y * desired.y - Math.abs(offset) * 0.05;
      if (score <= bestScore) continue;
      best = direction;
      bestScore = score;
    }
    this.navigationTelemetry.steeringDirection = best ? { ...best } : null;
    return best;
  }

  private normalize(value: TerrainPoint, fallback: TerrainPoint): TerrainPoint {
    const length = Math.hypot(value.x, value.y);
    if (length <= 1e-9) return { ...fallback };
    return { x: value.x / length, y: value.y / length };
  }

  private moveToward(targetPos: { x: number; y: number }, dt: number, terrain?: TerrainGrid): boolean {
    const dx = targetPos.x - this.x;
    const dy = targetPos.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return true;

    const moveDistance = this.speed * dt;
    const requestedDistance = Math.min(dist, moveDistance);
    this.moveAlong({ x: dx / dist, y: dy / dist }, requestedDistance, terrain);
    const safeProgress = this.lastMoveSafeProgress;
    return requestedDistance >= dist - 1e-9 && safeProgress >= 1 - 1e-9;
  }

  private moveAlong(direction: TerrainPoint, distance: number, terrain?: TerrainGrid): void {
    if (distance <= 0) {
      this.lastMoveSafeProgress = 1;
      return;
    }
    const requestedEnd = {
      x: this.x + direction.x * distance,
      y: this.y + direction.y * distance,
    };
    const safeProgress = terrain
      ? terrain.getSafeRadiusProgress({ x: this.x, y: this.y }, requestedEnd, this.radius, 'enemy')
      : 1;
    this.lastMoveSafeProgress = safeProgress;
    this.x += (requestedEnd.x - this.x) * safeProgress;
    this.y += (requestedEnd.y - this.y) * safeProgress;
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
  constructor(x: number, y: number, definition: EnemyDefinition) {
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
    );
  }

  public render(render: RenderContext): void {
    render.renderer.drawSprite(render, 'enemy.shadow.standard', this.x, this.y + this.radius * 0.35);
    render.renderer.drawSprite(render, `enemy.standard.${this.getVisualState()}`, this.x, this.y);
    if (!this.isDead()) this.renderHpBar(render);
  }
}

export class TankerEnemy extends Enemy {
  constructor(x: number, y: number, definition: EnemyDefinition) {
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
    );
  }

  public render(render: RenderContext): void {
    render.renderer.drawSprite(render, 'enemy.shadow.tanker', this.x, this.y + this.radius * 0.35);
    render.renderer.drawSprite(render, `enemy.tanker.${this.getVisualState()}`, this.x, this.y);
    if (!this.isDead()) this.renderHpBar(render);
  }
}
