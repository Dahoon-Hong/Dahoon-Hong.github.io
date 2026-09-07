import { describe, expect, it } from 'vitest';
import { TerrainGrid, TerrainMapData } from '../core/TerrainGrid';
import { TerrainPathfinder } from '../core/TerrainPathfinder';
import { EnemyDefinition, StandardEnemy, TankerEnemy } from './Enemy';

const definition: EnemyDefinition = {
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
    terrain: { legend: { '.': 'open', H: 'hill' }, rows },
    terrainTypes: {
      open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
      hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
    },
  };
  return new TerrainGrid(map);
};

describe('Enemy terrain navigation', () => {
  it('follows a path around terrain and never enters a blocked radius', () => {
    const terrain = makeGrid(['.......', '..HHH..', '.......']);
    const pathfinder = new TerrainPathfinder(terrain);
    const enemy = new StandardEnemy(18, 54, definition);
    const target = terrain.cellToWorldCenter({ x: 6, y: 1 });

    for (let index = 0; index < 10; index++) {
      enemy.update(0.1, target, { terrain, pathfinder });
      expect(terrain.isOpenForRadius({ x: enemy.x, y: enemy.y }, enemy.radius, 'enemy')).toBe(true);
    }

    expect(enemy.getPath().length).toBeGreaterThan(0);
    expect(enemy.y).not.toBe(54);
  });

  it('stops and retries instead of teleporting when no route exists', () => {
    const terrain = makeGrid(['..H..', '..H..', '..H..', '..H..', '..H..']);
    const pathfinder = new TerrainPathfinder(terrain);
    const enemy = new TankerEnemy(18, 90, { ...definition, radius: 18 }, 0);
    const target = terrain.cellToWorldCenter({ x: 4, y: 2 });

    enemy.update(0.1, target, { terrain, pathfinder });

    expect(enemy.x).toBe(18);
    expect(enemy.y).toBe(90);
    expect(enemy.getPath()).toEqual([]);
  });
});
