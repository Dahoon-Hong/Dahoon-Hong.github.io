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
  hp: 45,
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
});
