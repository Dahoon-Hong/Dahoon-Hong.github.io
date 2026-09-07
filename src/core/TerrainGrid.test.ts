import { describe, expect, it } from 'vitest';
import { TerrainGrid, TerrainMapData } from './TerrainGrid';

const map: TerrainMapData = {
  world: { cellSize: 36, columns: 5, rows: 3 },
  terrain: {
    legend: { '.': 'open', H: 'hill' },
    rows: ['.....', '..H..', '.....'],
  },
  terrainTypes: {
    open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
    hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
  },
};

describe('TerrainGrid', () => {
  it('converts points at cell boundaries and computes world bounds', () => {
    const grid = new TerrainGrid(map);

    expect(grid.worldToCell({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(grid.worldToCell({ x: 36, y: 36 })).toEqual({ x: 1, y: 1 });
    expect(grid.worldToCell({ x: 180, y: 36 })).toBeNull();
    expect(grid.cellToWorldCenter({ x: 2, y: 1 })).toEqual({ x: 90, y: 54 });
    expect(grid.getWorldBounds()).toEqual({ left: 0, top: 0, right: 180, bottom: 108, width: 180, height: 108 });
  });

  it('uses data-defined target blocking and treats world outside as blocked', () => {
    const grid = new TerrainGrid(map);

    expect(grid.isBlocked({ x: 2, y: 1 }, 'tank')).toBe(true);
    expect(grid.isBlocked({ x: 2, y: 1 }, 'enemy')).toBe(true);
    expect(grid.isBlocked({ x: 0, y: 0 }, 'projectile')).toBe(false);
    expect(grid.isBlocked({ x: -1, y: 0 }, 'tank')).toBe(true);
    expect(grid.isBlockedAabb({ left: 0, top: 0, right: 36, bottom: 36 }, 'tank')).toBe(false);
    expect(grid.isBlockedAabb({ left: -1, top: 0, right: 20, bottom: 20 }, 'tank')).toBe(true);
  });

  it('returns the first terrain hit for a swept segment', () => {
    const grid = new TerrainGrid({
      ...map,
      terrain: { ...map.terrain, rows: ['.....', '..H.H', '.....'] },
    });
    const hit = grid.raycast({ x: 0, y: 54 }, { x: 180, y: 54 });

    expect(hit?.cell).toEqual({ x: 2, y: 1 });
    expect(hit?.progress).toBeCloseTo(72 / 180);
    expect(hit?.point.x).toBeCloseTo(72);
  });

  it('does not let a radius footprint touch a hill', () => {
    const grid = new TerrainGrid(map);

    expect(grid.isOpenForRadius({ x: 66, y: 54 }, 12, 'enemy')).toBe(false);
    expect(grid.isOpenForRadius({ x: 66, y: 54 }, 4, 'enemy')).toBe(true);
    expect(grid.isOpenForRadius({ x: 0, y: 54 }, 1, 'enemy')).toBe(false);
  });
});
