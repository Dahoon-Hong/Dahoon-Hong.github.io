import { describe, expect, it } from 'vitest';
import { EnemyCollisionResolver } from './EnemyCollisionResolver';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';
import { EnemyDefinition, EnemyNavigationDirective, StandardEnemy } from '../entities/Enemy';

const definition: EnemyDefinition = {
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

const makeGrid = (rows: string[]): TerrainGrid => {
  const map: TerrainMapData = {
    world: { cellSize: 36, columns: rows[0].length, rows: rows.length },
    terrain: {
      legend: { '.': 'open', H: 'hill' },
      rows,
    },
    terrainTypes: {
      open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
      hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
    },
  };
  return new TerrainGrid(map);
};

const localDirective: EnemyNavigationDirective = {
  mode: 'local',
  targetCell: { x: 6, y: 2 },
  targetPoint: { x: 234, y: 90 },
  arrivalRadius: 36,
  stopDistance: 2,
  probeDistance: 24,
  separationWeight: 0,
  maxNearbyEnemies: 8,
};

describe('EnemyCollisionResolver', () => {
  it('clips a vehicle push before an enemy enters a wall', () => {
    const terrain = makeGrid([
      '..H.....',
      '..H.....',
      '..H.....',
      '..H.....',
      '........',
      '........',
    ]);
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const enemy = new StandardEnemy(122, 126, definition);

    expect(terrain.isOpenForRadius({ x: enemy.x, y: enemy.y }, enemy.radius, 'enemy')).toBe(true);
    expect(resolver.resolveAgainstVehicle(
      enemy,
      { left: 126, top: 108, right: 162, bottom: 144 },
      { x: 122, y: 126 },
    )).toBe(true);

    expect(terrain.isOpenForRadius({ x: enemy.x, y: enemy.y }, enemy.radius, 'enemy')).toBe(true);
    expect(enemy.x).toBeGreaterThan(120);
  });

  it('returns equal and opposite velocity intents without changing positions', () => {
    const terrain = makeGrid(Array.from({ length: 8 }, () => '.'.repeat(8)));
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const first = new StandardEnemy(90, 90, definition);
    const second = new StandardEnemy(90, 90, definition);
    const enemies = [first, second];
    const nearby = new Map([
      [first, [second]],
      [second, [first]],
    ]);

    const intents = resolver.collectPushIntents(enemies, (enemy) => nearby.get(enemy) ?? [], 0.1);

    expect(first.x).toBe(90);
    expect(first.y).toBe(90);
    expect(second.x).toBe(90);
    expect(second.y).toBe(90);
    expect(intents.get(first)).toBeDefined();
    expect(intents.get(second)).toBeDefined();
    expect(intents.get(first)?.x).toBeCloseTo(-(intents.get(second)?.x ?? 0));
    expect(intents.get(first)?.y).toBeCloseTo(-(intents.get(second)?.y ?? 0));
    expect(resolver.getStats()).toMatchObject({
      collisionPairsThisFrame: 1,
      collisionPushesThisFrame: 2,
    });
  });

  it('separates a spawn overlap through normal terrain movement over updates', () => {
    const terrain = makeGrid(Array.from({ length: 8 }, () => '.'.repeat(8)));
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const first = new StandardEnemy(90, 90, definition);
    const second = new StandardEnemy(90, 90, definition);
    const enemies = [first, second];
    const nearby = new Map([
      [first, [second]],
      [second, [first]],
    ]);

    for (let frame = 0; frame < 10; frame++) {
      const intents = resolver.collectPushIntents(enemies, (enemy) => nearby.get(enemy) ?? [], 0.1);
      for (const enemy of enemies) {
        enemy.update(0.1, localDirective.targetPoint ?? { x: 234, y: 90 }, {
          terrain,
          directive: localDirective,
          collisionPush: intents.get(enemy),
        });
      }
    }

    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    expect(distance).toBeGreaterThanOrEqual(definition.radius * 2 - 1e-6);
    expect(first.x !== 90 || first.y !== 90).toBe(true);
    expect(second.x !== 90 || second.y !== 90).toBe(true);
    for (const enemy of enemies) {
      expect(terrain.isOpenForRadius({ x: enemy.x, y: enemy.y }, enemy.radius, 'enemy')).toBe(true);
    }
  });

  it('allows an overlapping spawn when at least one escape probe is open', () => {
    const terrain = makeGrid(Array.from({ length: 8 }, () => '.'.repeat(8)));
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const existing = [new StandardEnemy(90, 90, definition)];

    expect(resolver.canSpawnAt({ x: 90, y: 90 }, definition.radius, existing)).toBe(true);
  });

  it('skips a spawn when every escape probe is blocked by terrain', () => {
    const terrain = makeGrid([
      'HHH',
      'H.H',
      'HHH',
    ]);
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const center = terrain.cellToWorldCenter({ x: 1, y: 1 });
    const existing = [new StandardEnemy(center.x, center.y, definition)];

    expect(resolver.getSpawnAdmission(center, definition.radius, existing)).toEqual({
      allowed: false,
      reason: 'saturated',
    });
  });

  it('keeps collision work bounded by the supplied neighbor snapshot', () => {
    const terrain = makeGrid(Array.from({ length: 40 }, () => '.'.repeat(40)));
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const enemies = Array.from({ length: 640 }, (_, index) => new StandardEnemy(
      90 + (index % 32) * 24,
      90 + Math.floor(index / 32) * 24,
      definition,
    ));
    const nearby = () => enemies.slice(0, 8);

    resolver.collectPushIntents(enemies, nearby, 0.1);

    expect(resolver.getStats()).toMatchObject({
      collisionCandidatesTotal: 640 * 8,
      collisionCandidatesMax: 8,
    });
  });
});
