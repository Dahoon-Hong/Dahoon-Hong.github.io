import { describe, expect, it } from 'vitest';
import { StandardEnemy, TankerEnemy } from '../entities/Enemy';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';
import { ProgressionManager, RegionDefinition } from './ProgressionManager';
import { THREAT_CONFIG, ThreatManager } from './ThreatManager';
import { calculateEnemySpawnCount, WaveManager } from './WaveManager';

const enemyDefinitions = {
  standard: {
    spawnWeight: 1,
    spawnInterval: 0.1,
    spawnBatchSize: 2,
    hp: 10, speed: 20, radius: 6, reward: 1, typeName: 'Standard', contactDamage: 1, contactDamageInterval: 0.2,
  },
  tanker: {
    spawnWeight: 0.5,
    spawnInterval: 0.1,
    spawnBatchSize: 1,
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
  waves: [{ targetKills: 10 }, { targetKills: 12 }],
};

describe('calculateEnemySpawnCount', () => {
  it('multiplies the base spawn by the enemy weight and respects batch size', () => {
    expect(calculateEnemySpawnCount(5, { spawnWeight: 0.4, spawnBatchSize: 3 })).toBe(2);
    expect(calculateEnemySpawnCount(5, { spawnWeight: 2, spawnBatchSize: 3 })).toBe(3);
    expect(calculateEnemySpawnCount(5, { spawnWeight: 0, spawnBatchSize: 3 })).toBe(0);
  });
});

describe('WaveManager', () => {
  it('spawns each enemy type continuously on its own interval and batch', () => {
    const manager = new WaveManager(region, enemyDefinitions, 2, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }, { x: 3, y: 1 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });

    expect(enemies).toHaveLength(3);
    expect(enemies.map((enemy) => [enemy.enemyType, enemy.x, enemy.y])).toEqual([
      ['standard', 18, 18],
      ['standard', 126, 54],
      ['tanker', 18, 18],
    ]);
    expect(manager.targetKills).toBe(10);
    expect(manager.killedEnemiesCount).toBe(0);
    expect(manager.stageTargetKills).toBe(22);
    expect(manager.stageKilledEnemiesCount).toBe(0);
    expect(manager.spawnedEnemiesCount).toBe(3);
    expect(manager.lastSpawnBatchSize).toBe(3);
    expect(manager.lastSpawnTypes).toEqual(['standard', 'standard', 'tanker']);
    expect(manager.lastSpawnAt).toBeCloseTo(0.11);
  });

  it('applies the current threat snapshot to batch, target, and contact damage', () => {
    const threatManager = new ThreatManager(1.5, 1, {
      ...THREAT_CONFIG,
      time: { ...THREAT_CONFIG.time, initialMultiplier: 1 },
    });
    const manager = new WaveManager(region, enemyDefinitions, 2, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }, { x: 3, y: 1 }],
    }, threatManager);
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    expect(manager.targetKills).toBe(15);
    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });

    expect(enemies).toHaveLength(5);
    expect(manager.lastSpawnBatchSize).toBe(5);
    expect(manager.lastSpawnContactDamage).toBe(3);
    expect(enemies[0].contactDamage).toBe(1.5);
  });

  it('skips saturated spawn attempts without inflating the spawned count', () => {
    const manager = new WaveManager(region, enemyDefinitions, 2, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }],
      canSpawn: () => false,
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });

    expect(enemies).toHaveLength(0);
    expect(manager.spawnedEnemiesCount).toBe(0);
    expect(manager.spawnSkippedCount).toBe(3);
    expect(manager.lastSpawnSkippedCount).toBe(3);
    expect(manager.lastSpawnSkipReason).toBe('admission');
  });
  it('uses 18px tile centers when spawning enemies on a tile map', () => {
    const manager = new WaveManager(region, enemyDefinitions, 2, {
      terrain: tileTerrain,
      spawnCells: [{ x: 1, y: 1 }, { x: 3, y: 2 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.11, enemies, tileTerrain.width, tileTerrain.height, { x: 0, y: 0 });

    expect(enemies.map((enemy) => [enemy.enemyType, enemy.x, enemy.y])).toEqual([
      ['standard', 27, 27],
      ['standard', 63, 45],
      ['tanker', 27, 27],
    ]);
  });

  it('does not stop spawning when the target is larger than the first batch', () => {
    const manager = new WaveManager(region, enemyDefinitions, 2, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });

    expect(enemies).toHaveLength(6);
    expect(manager.spawnedEnemiesCount).toBe(6);
    expect(manager.waveCleared).toBe(false);
  });

  it('keeps spawn intervals independent between enemy types', () => {
    const definitions = {
      ...enemyDefinitions,
      tanker: { ...enemyDefinitions.tanker, spawnInterval: 0.3 },
    } as const;
    const manager = new WaveManager(region, definitions, 2, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    expect(enemies).toHaveLength(2);
    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    expect(enemies).toHaveLength(4);
    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });

    expect(enemies).toHaveLength(7);
    expect(manager.lastSpawnTypes).toEqual(['standard', 'standard', 'tanker']);
  });

  it('clears a wave after the target number of tracked enemies is killed', () => {
    const targetRegion: RegionDefinition = {
      ...region,
      waves: [{ targetKills: 2 }],
    };
    const manager = new WaveManager(targetRegion, enemyDefinitions, 2, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    enemies.slice(0, 2).forEach((enemy) => enemy.takeDamage(999));
    manager.update(0, enemies, terrain.width, terrain.height, { x: 0, y: 0 });

    expect(manager.killedEnemiesCount).toBe(2);
    expect(manager.targetKills).toBe(2);
    expect(manager.stageTargetKills).toBe(2);
    expect(manager.stageKilledEnemiesCount).toBe(2);
    expect(manager.waveCleared).toBe(true);
    expect(manager.spawnedEnemiesCount).toBe(3);
  });

  it('resets the kill target and counters when advancing to the next wave', () => {
    const manager = new WaveManager(region, enemyDefinitions, 2, {
      terrain,
      spawnCells: [{ x: 0, y: 0 }],
    });
    const enemies: Array<StandardEnemy | TankerEnemy> = [];

    manager.update(0.11, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    enemies.slice(0, 2).forEach((enemy) => enemy.takeDamage(999));
    manager.update(0, enemies, terrain.width, terrain.height, { x: 0, y: 0 });
    manager.nextWave();

    expect(manager.currentWave).toBe(2);
    expect(manager.targetKills).toBe(12);
    expect(manager.killedEnemiesCount).toBe(0);
    expect(manager.stageKilledEnemiesCount).toBe(2);
    expect(manager.spawnedEnemiesCount).toBe(0);
    expect(manager.waveCleared).toBe(false);
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
