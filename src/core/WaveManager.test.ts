import { describe, expect, it } from 'vitest';
import { StandardEnemy, TankerEnemy } from '../entities/Enemy';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';
import { EnemySpawnPolicy, ProgressionManager, RegionDefinition } from './ProgressionManager';
import { calculateSpawnScaling, WaveManager } from './WaveManager';

const enemyDefinitions = {
  standard: {
    hp: 10, speed: 20, radius: 6, reward: 1, typeName: 'Standard', contactDamage: 1, contactDamageInterval: 0.2,
  },
  tanker: {
    hp: 20, speed: 10, radius: 8, reward: 2, typeName: 'Tanker', contactDamage: 2, contactDamageInterval: 0.2,
  },
} as const;

const spawnPolicy: EnemySpawnPolicy = {
  baseBatchSize: 1,
  batchSizePerThreat: 0,
  maxBatchSize: 3,
  intervalStep: 0,
  intervalMultiplier: 1,
  minimumInterval: 0.1,
};

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
    const manager = new WaveManager(region, enemyDefinitions, spawnPolicy, {
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
    const manager = new WaveManager(region, enemyDefinitions, spawnPolicy, {
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

  it('calculates threat scaling with region and global interval floors', () => {
    expect(calculateSpawnScaling(3, {
      spawnInterval: 1,
      spawnIntervalStep: -0.1,
      minimumSpawnInterval: 0.4,
    }, {
      baseBatchSize: 1,
      batchSizePerThreat: 1,
      maxBatchSize: 3,
      intervalStep: -0.3,
      intervalMultiplier: 1,
      minimumInterval: 0.25,
    })).toEqual({ threatLevel: 2, batchSize: 3, spawnInterval: 0.25 });
    expect(calculateSpawnScaling(2, {
      spawnInterval: 0.1,
      spawnIntervalStep: -0.2,
      minimumSpawnInterval: 0.8,
    }, spawnPolicy).spawnInterval).toBe(0.8);
  });

  it('applies the configured five-enemy batch and half interval', () => {
    expect(calculateSpawnScaling(1, {
      spawnInterval: 1.2,
      spawnIntervalStep: -0.1,
      minimumSpawnInterval: 0.7,
    }, {
      baseBatchSize: 5,
      batchSizePerThreat: 0,
      maxBatchSize: 5,
      intervalStep: 0,
      intervalMultiplier: 0.5,
      minimumInterval: 0.25,
    })).toEqual({ threatLevel: 0, batchSize: 5, spawnInterval: 0.6 });
  });

  it('clamps negative waves and keeps large results finite', () => {
    const scaling = calculateSpawnScaling(Number.MAX_VALUE, {
      spawnInterval: 1,
      spawnIntervalStep: 1,
      minimumSpawnInterval: 0.1,
    }, {
      baseBatchSize: 1,
      batchSizePerThreat: 1,
      maxBatchSize: 3,
      intervalStep: 1,
      intervalMultiplier: 1,
      minimumInterval: 0.25,
    });
    expect(scaling.threatLevel).toBe(Number.MAX_VALUE - 1);
    expect(scaling.batchSize).toBe(3);
    expect(Number.isFinite(scaling.spawnInterval)).toBe(true);
    expect(calculateSpawnScaling(-2, region, spawnPolicy).threatLevel).toBe(0);
  });

  it('spawns a policy batch without changing queue order or over-spawning', () => {
    const batchRegion: RegionDefinition = {
      ...region,
      waves: [{ standard: 1, tanker: 0 }, { standard: 2, tanker: 1 }],
    };
    const batchPolicy: EnemySpawnPolicy = { ...spawnPolicy, batchSizePerThreat: 1 };
    const manager = new WaveManager(batchRegion, enemyDefinitions, batchPolicy, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }, { x: 3, y: 1 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.1, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    expect(enemies).toHaveLength(1);
    manager.nextWave();
    manager.update(0.1, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    expect(enemies).toHaveLength(3);
    manager.update(0.1, enemies, terrain.width, terrain.height, { x: 0, y: 0 });

    expect(enemies).toHaveLength(4);
    expect(enemies.map((enemy) => [enemy.enemyType, enemy.x, enemy.y])).toEqual([
      ['standard', 18, 18],
      ['standard', 18, 18],
      ['standard', 126, 54],
      ['tanker', 18, 18],
    ]);
    expect(manager.spawnedEnemiesCount).toBe(3);
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
