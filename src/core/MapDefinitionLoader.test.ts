import { describe, expect, it } from 'vitest';
import { MapDataRoot, MapDefinitionLoader, mapDefinitionLoader } from './MapDefinitionLoader';

const makeRoot = (overrides: Partial<MapDataRoot> = {}): MapDataRoot => ({
  version: 1,
  terrainTypes: {
    open: { blocks: { tank: false, enemy: false, projectile: false } },
    hill: { blocks: { tank: true, enemy: true, projectile: true } },
  },
  maps: [{
    mapId: 'test/example',
    planetId: 'test',
    regionId: 'example',
    world: { cellSize: 36, columns: 3, rows: 2 },
    terrain: { legend: { '.': 'open', H: 'hill' }, rows: ['...', 'H..'] },
    tankStartCell: { x: 1, y: 0 },
    enemySpawnCells: [{ x: 2, y: 0 }],
    assets: {
      background: 'map.background',
      ground: 'map.ground',
      tiles: [],
      props: [],
      spawnEdge: 'map.spawn-edge',
      terrain: { hillCenter: 'map.hill-center', hillEdge: 'map.hill-edge', hillCorner: 'map.hill-corner' },
    },
    repeat: { background: false, tile: false },
    safeMargin: { top: 0, right: 0, bottom: 0, left: 0 },
    gameplay: { decorativeOnly: false, campaign: true },
  }],
  ...overrides,
});

const noAssets = { sprites: {} };

describe('MapDefinitionLoader', () => {
  it('loads a typed map and exposes a grid and accessible pickup cells', () => {
    const loader = new MapDefinitionLoader(makeRoot(), noAssets);
    const map = loader.getById('test/example');

    expect(map?.mapId).toBe('test/example');
    expect(loader.createTerrainGrid('test/example').width).toBe(108);
    expect(loader.getAccessiblePickupCells('test/example', 2)).toEqual([{ x: 1, y: 0 }, { x: 0, y: 0 }]);
  });

  it('rejects row shape, unknown symbols, and duplicate map IDs', () => {
    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [{
        ...makeRoot().maps[0] as Record<string, unknown>,
        terrain: { legend: { '.': 'open' }, rows: ['..'] },
      }],
    }), noAssets)).toThrow(/exactly 2 rows/);

    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [{
        ...makeRoot().maps[0] as Record<string, unknown>,
        terrain: { legend: { '.': 'open' }, rows: ['...', '.X.'] },
      }],
    }), noAssets)).toThrow(/unknown terrain symbol/);

    const first = makeRoot().maps[0];
    expect(() => new MapDefinitionLoader(makeRoot({ maps: [first, first] }), noAssets)).toThrow(/duplicate map ID/);
  });

  it('requires explicit terrain data instead of the legacy decorative fallback', () => {
    const legacyMap = { ...(makeRoot().maps[0] as Record<string, unknown>) };
    delete legacyMap.world;
    delete legacyMap.terrain;
    expect(() => new MapDefinitionLoader(makeRoot({ maps: [legacyMap] }), noAssets)).toThrow(/world/);
  });

  it('loads every production map and the terrain test map at the explicit world size', () => {
    expect(mapDefinitionLoader.getAll()).toHaveLength(5);
    for (const map of mapDefinitionLoader.getAll()) {
      expect(map.world).toEqual({ cellSize: 36, columns: 80, rows: 60 });
      expect(map.terrain.rows).toHaveLength(60);
      expect(map.enemySpawnCells.length).toBeGreaterThanOrEqual(3);
      expect(mapDefinitionLoader.getAccessiblePickupCells(map.mapId, 10)).not.toHaveLength(0);
    }
    expect(mapDefinitionLoader.getById('test/terrain-test')?.gameplay.campaign).toBe(false);
  });
});
