import { describe, expect, it } from 'vitest';
import { MapDataRoot, MapDefinitionLoader } from './MapDefinitionLoader';

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
});
