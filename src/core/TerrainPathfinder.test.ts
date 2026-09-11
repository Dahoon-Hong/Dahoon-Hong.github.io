import { describe, expect, it } from 'vitest';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';
import { TerrainPathfinder } from './TerrainPathfinder';

const makeGrid = (rows: string[], cellSize = 36): TerrainGrid => {
  const columns = rows[0].length;
  const map: TerrainMapData = {
    world: { cellSize, columns, rows: rows.length },
    terrain: { legend: { '.': 'open', H: 'hill' }, rows },
    terrainTypes: {
      open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
      hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
    },
  };
  return new TerrainGrid(map);
};

describe('TerrainPathfinder', () => {
  it('finds and compacts an eight-direction path around a wall', () => {
    const pathfinder = new TerrainPathfinder(makeGrid([
      '.......',
      '..HHH..',
      '.......',
    ]));
    const path = pathfinder.findPath({ x: 0, y: 1 }, { x: 6, y: 1 }, { radius: 4 });

    expect(path).not.toBeNull();
    expect(path?.[path.length - 1]).toEqual({ x: 6, y: 1 });
    expect(path?.length).toBeLessThan(7);
    expect(pathfinder.isPathValid({ x: 0, y: 1 }, path ?? [], 4)).toBe(true);
  });

  it('rejects diagonal corner cutting', () => {
    const pathfinder = new TerrainPathfinder(makeGrid([
      '....',
      '.H..',
      '..H.',
      '....',
    ]));

    expect(pathfinder.findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, { radius: 4 })).not.toBeNull();
    expect(pathfinder.isPathValid({ x: 0, y: 0 }, [{ x: 1, y: 1 }], 4)).toBe(false);
  });

  it('accounts for radius and reports an unreachable goal', () => {
    const narrow = makeGrid([
      '..H..',
      '..H..',
      '..H..',
      '..H..',
      '..H..',
    ]);
    const pathfinder = new TerrainPathfinder(narrow);

    expect(pathfinder.findPath({ x: 0, y: 2 }, { x: 4, y: 2 }, { radius: 18 })).toBeNull();
    expect(pathfinder.findPath({ x: 0, y: 0 }, { x: 1, y: 0 }, { radius: 18 })).not.toBeNull();
  });

  it('finds an 18px tile path without changing cell coordinates', () => {
    const pathfinder = new TerrainPathfinder(makeGrid([
      '.......',
      '..HHH..',
      '.......',
    ], 18));
    const path = pathfinder.findPath({ x: 0, y: 1 }, { x: 6, y: 1 }, { radius: 4 });

    expect(path).not.toBeNull();
    expect(path?.[path.length - 1]).toEqual({ x: 6, y: 1 });
    expect(pathfinder.isPathValid({ x: 0, y: 1 }, path ?? [], 4)).toBe(true);
  });
});
