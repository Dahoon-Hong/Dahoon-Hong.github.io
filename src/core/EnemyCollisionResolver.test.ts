import { describe, expect, it } from 'vitest';
import { EnemyCollisionResolver } from './EnemyCollisionResolver';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';
import { EnemyDefinition, StandardEnemy } from '../entities/Enemy';

const definition: EnemyDefinition = {
  spawnWeight: 1,
  spawnInterval: 0.6,
  spawnBatchSize: 5,
  hp: 45,
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

  it('forces a spawn batch at one point to spread without overlap', () => {
    const terrain = makeGrid(Array.from({ length: 8 }, () => '.'.repeat(8)));
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const enemies = [
      new StandardEnemy(90, 90, definition),
      new StandardEnemy(90, 90, definition),
      new StandardEnemy(90, 90, definition),
    ];

    resolver.separate(enemies);

    for (let first = 0; first < enemies.length; first++) {
      for (let second = first + 1; second < enemies.length; second++) {
        const distance = Math.hypot(
          enemies[first].x - enemies[second].x,
          enemies[first].y - enemies[second].y,
        );
        expect(distance).toBeGreaterThanOrEqual(definition.radius * 2 + 0.01 - 1e-6);
      }
      expect(terrain.isOpenForRadius(
        { x: enemies[first].x, y: enemies[first].y },
        enemies[first].radius,
        'enemy',
      )).toBe(true);
    }
  });

  it('resolves a large exact-overlap spawn burst within the bounded passes', () => {
    const terrain = makeGrid(Array.from({ length: 40 }, () => '.'.repeat(40)));
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const spawnPoints = [
      { x: 90, y: 90 },
      { x: 270, y: 90 },
      { x: 90, y: 270 },
      { x: 270, y: 270 },
    ];
    const enemies = Array.from({ length: 160 }, (_, index) => {
      const point = spawnPoints[index % spawnPoints.length];
      return new StandardEnemy(point.x, point.y, definition);
    });

    resolver.separate(enemies);

    for (let first = 0; first < enemies.length; first++) {
      for (let second = first + 1; second < enemies.length; second++) {
        const distance = Math.hypot(
          enemies[first].x - enemies[second].x,
          enemies[first].y - enemies[second].y,
        );
        expect(distance, `pair ${enemies[first].navigationId}/${enemies[second].navigationId}`)
          .toBeGreaterThanOrEqual(definition.radius * 2 + 0.01 - 1e-6);
      }
    }
  });

  it('separates enemies pinned beside the vehicle without re-entering it', () => {
    const terrain = makeGrid(Array.from({ length: 40 }, () => '.'.repeat(40)));
    const resolver = new EnemyCollisionResolver(terrain, 72);
    const vehicleBounds = { left: 252, top: 219, right: 360, bottom: 327 };
    const enemies = [
      new StandardEnemy(240.5, 274, definition),
      new StandardEnemy(228.1, 262.7, definition),
    ];

    expect(resolver.resolveAgainstVehicle(enemies[0], vehicleBounds, { x: 240.5, y: 274 })).toBe(true);
    resolver.separate(enemies, vehicleBounds);

    expect(Math.hypot(enemies[0].x - enemies[1].x, enemies[0].y - enemies[1].y))
      .toBeGreaterThanOrEqual(definition.radius * 2 + 0.01 - 1e-6);
    for (const enemy of enemies) {
      const closestX = Math.max(vehicleBounds.left, Math.min(vehicleBounds.right, enemy.x));
      const closestY = Math.max(vehicleBounds.top, Math.min(vehicleBounds.bottom, enemy.y));
      expect(Math.hypot(enemy.x - closestX, enemy.y - closestY)).toBeGreaterThanOrEqual(enemy.radius - 1e-6);
    }
  });
});
