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

  it('loads an 18px tile map without changing its world dimensions', () => {
    const loader = new MapDefinitionLoader(makeRoot({
      maps: [{
        ...makeRoot().maps[0] as Record<string, unknown>,
        world: { cellSize: 18, columns: 5, rows: 5 },
        terrain: { legend: { '.': 'open', H: 'hill' }, rows: ['.....', '.....', '.....', '.....', '.....'] },
        tankStartCell: { x: 1, y: 1 },
        enemySpawnCells: [{ x: 3, y: 3 }],
      }],
    }), noAssets);
    const map = loader.getById('test/example');

    expect(map?.world).toEqual({ cellSize: 18, columns: 5, rows: 5 });
    expect(map?.tankCollisionScale).toBe(1);
    expect(map?.tankCollisionShape).toBe('rect');
    expect(loader.createTerrainGrid('test/example').getWorldBounds()).toEqual({
      left: 0,
      top: 0,
      right: 90,
      bottom: 90,
      width: 90,
      height: 90,
    });
  });

  it('rejects unsupported cell sizes', () => {
    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [{
        ...makeRoot().maps[0] as Record<string, unknown>,
        world: { cellSize: 20, columns: 3, rows: 2 },
      }],
    }), noAssets)).toThrow(/must be one of 18 or 36/);
  });

  it('validates the optional tank collision scale', () => {
    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [{
        ...makeRoot().maps[0] as Record<string, unknown>,
        tankCollisionScale: 1.1,
      }],
    }), noAssets)).toThrow(/must be between 0.1 and 1/);
  });

  it('validates the optional tank collision shape', () => {
    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [{
        ...makeRoot().maps[0] as Record<string, unknown>,
        tankCollisionShape: 'capsule',
      }],
    }), noAssets)).toThrow(/must be 'rect' or 'circle'/);
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

  it('loads polygon regions, validates artwork coordinates, and rejects mixed terrain sources', () => {
    const baseMap = makeRoot().maps[0] as Record<string, unknown>;
    const regionMap = {
      ...baseMap,
      terrain: {
        regions: [{
          id: 'west-wall',
          type: 'hill',
          polygon: [
            { x: 0, y: 36 },
            { x: 36, y: 36 },
            { x: 36, y: 72 },
            { x: 0, y: 72 },
          ],
        }],
      },
      artwork: {
        worldSize: { width: 108, height: 72 },
        origin: { x: 0, y: 0 },
      },
    };
    const loader = new MapDefinitionLoader(makeRoot({ maps: [regionMap] }), noAssets);
    const map = loader.getById('test/example');
    expect(map?.terrain.rows).toBeUndefined();
    expect(map?.terrain.regions).toHaveLength(1);
    expect(map?.artwork).toEqual({
      worldSize: { width: 108, height: 72 },
      origin: { x: 0, y: 0 },
    });
    expect(loader.createTerrainGrid('test/example').getTerrainTypeId({ x: 0, y: 1 })).toBe('hill');

    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [{ ...regionMap, terrain: { ...regionMap.terrain, rows: ['...', '...'], legend: { '.': 'open' } } }],
    }), noAssets)).toThrow(/either rows or regions/);
    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [{ ...regionMap, artwork: { worldSize: { width: 72, height: 72 }, origin: { x: 0, y: 0 } } }],
    }), noAssets)).toThrow(/must match the terrain world/);
  });

  it('rejects non-convex, duplicate, and out-of-bounds region polygons', () => {
    const baseMap = makeRoot().maps[0] as Record<string, unknown>;
    const withPolygon = (polygon: Array<{ x: number; y: number }>) => ({
      ...baseMap,
      terrain: { regions: [{ id: 'region', type: 'hill', polygon }] },
    });
    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [withPolygon([{ x: 0, y: 0 }, { x: 72, y: 0 }, { x: 36, y: 18 }, { x: 72, y: 36 }, { x: 0, y: 36 }])],
    }), noAssets)).toThrow(/must be convex/);
    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [withPolygon([{ x: 0, y: 0 }, { x: 36, y: 0 }, { x: 36, y: 36 }, { x: 36, y: 36 }])],
    }), noAssets)).toThrow(/duplicate points/);
    expect(() => new MapDefinitionLoader(makeRoot({
      maps: [withPolygon([{ x: 0, y: 0 }, { x: 109, y: 0 }, { x: 109, y: 36 }, { x: 0, y: 36 }])],
    }), noAssets)).toThrow(/inside the world bounds/);
  });

  it('loads every production map and the terrain test map at the explicit world size', () => {
    expect(mapDefinitionLoader.getAll()).toHaveLength(5);
    const expectedRegionCounts: Record<string, number> = {
      'aurelia/relay-fields': 4,
      'cinder/ash-basin': 4,
      'cinder/core-ruins': 7,
      'test/terrain-test': 11,
    };
    const expectedWorlds = {
      'aurelia/landing-zone': { cellSize: 18, columns: 160, rows: 120 },
      'aurelia/relay-fields': { cellSize: 36, columns: 80, rows: 60 },
      'cinder/ash-basin': { cellSize: 36, columns: 80, rows: 60 },
      'cinder/core-ruins': { cellSize: 36, columns: 80, rows: 60 },
      'test/terrain-test': { cellSize: 36, columns: 80, rows: 60 },
    } as const;
    for (const map of mapDefinitionLoader.getAll()) {
      expect(map.world).toEqual(expectedWorlds[map.mapId as keyof typeof expectedWorlds]);
      if (map.mapId === 'aurelia/landing-zone') {
        expect(map.tankCollisionScale).toBe(0.45);
        expect(map.tankCollisionShape).toBe('circle');
        expect(map.terrain.rows).toHaveLength(120);
        expect(map.terrain.regions).toBeUndefined();
        expect(map.tankStartCell).toEqual({ x: 73, y: 48 });
        expect(map.enemySpawnCells).toEqual([
          { x: 25, y: 67 },
          { x: 38, y: 32 },
          { x: 68, y: 72 },
          { x: 128, y: 18 },
        ]);
        expect([map.tankStartCell, ...map.enemySpawnCells].every((cell) =>
          map.terrain.rows?.[cell.y]?.[cell.x] === '.')).toBe(true);
      } else {
        expect(map.tankCollisionScale).toBe(1);
        expect(map.tankCollisionShape).toBe('rect');
        expect(map.terrain.regions).toHaveLength(expectedRegionCounts[map.mapId]);
      }
      expect(map.enemySpawnCells.length).toBeGreaterThanOrEqual(3);
      expect(mapDefinitionLoader.getAccessiblePickupCells(map.mapId, 10)).not.toHaveLength(0);
    }
    expect(mapDefinitionLoader.getById('test/terrain-test')?.gameplay.campaign).toBe(false);
    expect(mapDefinitionLoader.getById('test/terrain-test')?.artwork).toEqual({
      worldSize: { width: 2880, height: 2160 },
      origin: { x: 0, y: 0 },
    });
  });
});
