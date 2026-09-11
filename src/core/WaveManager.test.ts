import { describe, expect, it } from 'vitest';
import { StandardEnemy, TankerEnemy } from '../entities/Enemy';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';
import { ProgressionManager, RegionDefinition } from './ProgressionManager';
import { WaveManager } from './WaveManager';

const enemyDefinitions = {
  standard: {
    hp: 10, speed: 20, radius: 6, reward: 1, typeName: 'Standard', contactDamage: 1, contactDamageInterval: 0.2,
  },
  tanker: {
    hp: 20, speed: 10, radius: 8, reward: 2, typeName: 'Tanker', contactDamage: 2, contactDamageInterval: 0.2,
  },
} as const;

const terrain = new TerrainGrid({
  world: { cellSize: 36, columns: 4, rows: 2 },
  terrain: { legend: { '.': 'open' }, rows: ['....', '....'] },
  terrainTypes: {
    open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
  },
} satisfies TerrainMapData);

const tileTerrain = new TerrainGrid({
  world: { cellSize: 18, columns: 4, rows: 3 },
  terrain: { legend: { '.': 'open' }, rows: ['....', '....', '....'] },
  terrainTypes: {
    open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
  },
} satisfies TerrainMapData);

const region: RegionDefinition = {
  id: 'test-wave',
  mapId: 'test/test-wave',
  campaign: false,
  name: 'Test Wave',
  spawnInterval: 0.1,
  spawnIntervalStep: 0,
  minimumSpawnInterval: 0.1,
  waves: [{ standard: 2, tanker: 1 }],
};

describe('WaveManager', () => {
  it('uses map-defined spawn cells in a stable cycle', () => {
    const manager = new WaveManager(region, enemyDefinitions, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }, { x: 3, y: 1 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.1, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    manager.update(0.1, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    manager.update(0.1, enemies, terrain.width, terrain.height, { x: 0, y: 0 });

    expect(enemies).toHaveLength(3);
    expect(enemies.map((enemy) => [enemy.enemyType, enemy.x, enemy.y])).toEqual([
      ['standard', 18, 18],
      ['standard', 126, 54],
      ['tanker', 18, 18],
    ]);
  });

  it('uses 18px tile centers when spawning enemies on a tile map', () => {
    const manager = new WaveManager(region, enemyDefinitions, {
      terrain: tileTerrain,
      spawnCells: [{ x: 1, y: 1 }, { x: 3, y: 2 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.1, enemies, tileTerrain.width, tileTerrain.height, { x: 0, y: 0 });
    manager.update(0.1, enemies, tileTerrain.width, tileTerrain.height, { x: 0, y: 0 });
    manager.update(0.1, enemies, tileTerrain.width, tileTerrain.height, { x: 0, y: 0 });

    expect(enemies.map((enemy) => [enemy.enemyType, enemy.x, enemy.y])).toEqual([
      ['standard', 27, 27],
      ['standard', 63, 45],
      ['tanker', 27, 27],
    ]);
  });

  it('excludes non-campaign regions from sequential progression', () => {
    const progression = new ProgressionManager({
      planets: [
        {
          id: 'a',
          name: 'A',
          regions: [{ ...region, id: 'test-only', mapId: 'a/test-only' }],
        },
        {
          id: 'b',
          name: 'B',
          regions: [{ ...region, id: 'campaign', mapId: 'b/campaign', campaign: true }],
        },
      ],
    });

    expect(progression.currentRegion.mapId).toBe('a/test-only');
    expect(progression.advance()).toBe('planet');
    expect(progression.currentRegion.mapId).toBe('b/campaign');
  });
});
