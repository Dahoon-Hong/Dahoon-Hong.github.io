import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../core/TerrainGrid';
import { ArcProjectile, DirectProjectile, VisualEffect } from './Projectile';
import { EnemyDefinition, StandardEnemy } from './Enemy';

const terrain = new TerrainGrid({
  world: { cellSize: 36, columns: 7, rows: 3 },
  terrain: { legend: { '.': 'open', H: 'hill' }, rows: ['.......', '..H....', '.......'] },
  terrainTypes: {
    open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
    hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
  },
});

const enemyDefinition: EnemyDefinition = {
  spawnWeight: 1,
  spawnInterval: 0.6,
  spawnBatchSize: 5,
  hp: 45,
  armor: 0,
  speed: 95,
  radius: 12,
  reward: 10,
  typeName: 'Standard',
  contactDamage: 10,
  contactDamageInterval: 0.2,
};

describe('projectile terrain collision', () => {
  it('stops a fast direct projectile at the first hill before the enemy', () => {
    const projectile = new DirectProjectile(18, 54, 1, 0, 1000, 30, 500);
    const enemy = new StandardEnemy(162, 54, enemyDefinition);
    const effects: VisualEffect[] = [];

    projectile.update(0.2, [enemy], (effect) => effects.push(effect), () => undefined, terrain);

    expect(projectile.isDead()).toBe(true);
    expect(projectile.x).toBeCloseTo(72);
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(effects).toHaveLength(1);
  });

  it('applies the same terrain blocking rule to arc projectiles', () => {
    const projectile = new ArcProjectile(18, 54, 162, 54, 1, 90, 60);
    const enemy = new StandardEnemy(162, 54, enemyDefinition);
    const effects: VisualEffect[] = [];
    const events: string[] = [];

    projectile.update(1, [enemy], (effect) => effects.push(effect), (event) => events.push(event.type), terrain);

    expect(projectile.isDead()).toBe(true);
    expect(projectile.x).toBeCloseTo(72);
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(events).toEqual(['projectile-impact']);
    expect(effects).toHaveLength(1);
  });

  it('requires strict penetration and subtracts armor for each pierced target', () => {
    const first = new StandardEnemy(80, 0, { ...enemyDefinition, hp: 200, armor: 10 });
    const second = new StandardEnemy(160, 0, { ...enemyDefinition, hp: 200, armor: 10 });
    const blocked = new StandardEnemy(240, 0, { ...enemyDefinition, hp: 200, armor: 15 });
    const projectile = new DirectProjectile(
      0,
      0,
      1,
      0,
      1_000,
      30,
      300,
      { penetration: 25 },
    );

    projectile.update(0.3, [first, second, blocked], () => undefined, () => undefined);

    expect(first.hp).toBe(170);
    expect(second.hp).toBe(170);
    expect(blocked.hp).toBe(200);
    expect(projectile.isDead()).toBe(true);
  });

  it('allows a tank shell to stack line damage with its target-point explosion', () => {
    const target = new StandardEnemy(80, 0, { ...enemyDefinition, hp: 300, armor: 10 });
    const projectile = new DirectProjectile(
      0,
      0,
      1,
      0,
      1_000,
      50,
      100,
      { penetration: 25, explosionRadius: 30, targetPoint: { x: 100, y: 0 }, detonateOnEnd: true },
    );

    projectile.update(0.1, [target], () => undefined, () => undefined);

    expect(target.hp).toBeLessThan(250);
    expect(projectile.isDead()).toBe(true);
  });

  it('detonates a tank shell at the first terrain block', () => {
    const enemy = new StandardEnemy(100, 54, { ...enemyDefinition, hp: 200, armor: 10 });
    const events: string[] = [];
    const projectile = new DirectProjectile(
      18,
      54,
      1,
      0,
      1_000,
      60,
      500,
      {
        penetration: 100,
        explosionRadius: 40,
        targetPoint: { x: 162, y: 54 },
        detonateOnEnd: true,
      },
    );

    projectile.update(0.2, [enemy], () => undefined, (event) => events.push(event.type), terrain);

    expect(projectile.isDead()).toBe(true);
    expect(projectile.x).toBeCloseTo(72);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(events).toEqual(['explosion']);
  });

  it('lets a modern arc shell pass over terrain and apply armored blast damage', () => {
    const enemy = new StandardEnemy(162, 54, { ...enemyDefinition, hp: 200, armor: 10 });
    const projectile = new ArcProjectile(18, 54, 162, 54, 1, 90, 60, 20, { ignoreTerrain: true });

    projectile.update(1, [enemy], () => undefined, () => undefined, terrain);

    expect(enemy.hp).toBe(110);
    expect(projectile.isDead()).toBe(true);
  });
});
