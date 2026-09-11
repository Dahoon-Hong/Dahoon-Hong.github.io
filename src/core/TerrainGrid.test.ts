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

  it('keeps collision and raycast boundaries correct for an 18px grid', () => {
    const grid = new TerrainGrid({
      ...map,
      world: { cellSize: 18, columns: 8, rows: 5 },
      terrain: {
        legend: { '.': 'open', H: 'hill' },
        rows: ['........', '...H....', '........', '........', '........'],
      },
    });

    expect(grid.worldToCell({ x: 18, y: 18 })).toEqual({ x: 1, y: 1 });
    expect(grid.cellToWorldCenter({ x: 3, y: 1 })).toEqual({ x: 63, y: 27 });
    expect(grid.isBlockedAabb({ left: 54, top: 18, right: 72, bottom: 36 }, 'tank')).toBe(true);
    expect(grid.isOpenForRadius({ x: 45, y: 27 }, 4, 'enemy')).toBe(true);
    expect(grid.isOpenForRadius({ x: 45, y: 27 }, 10, 'enemy')).toBe(false);

    const hit = grid.raycast({ x: 0, y: 27 }, { x: 144, y: 27 });
    expect(hit?.cell).toEqual({ x: 3, y: 1 });
    expect(hit?.point.x).toBeCloseTo(54);
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

  it('uses polygon regions for exact footprint, sweep, and raycast checks', () => {
    const grid = new TerrainGrid({
      ...map,
      terrain: {
        legend: {},
        regions: [{
          id: 'diagonal-wall',
          terrainTypeId: 'hill',
          polygon: [
            { x: 90, y: 18 },
            { x: 126, y: 18 },
            { x: 126, y: 90 },
            { x: 90, y: 90 },
          ],
        }],
      },
    });

    expect(grid.isBlockedAabb({ left: 84, top: 42, right: 96, bottom: 54 }, 'tank')).toBe(true);
    expect(grid.isOpenForRadius({ x: 72, y: 54 }, 12, 'enemy')).toBe(true);
    expect(grid.isOpenForRadius({ x: 78, y: 54 }, 12, 'enemy')).toBe(false);
    expect(grid.isOpenForRadiusSegment({ x: 54, y: 54 }, { x: 144, y: 54 }, 4, 'enemy')).toBe(false);

    const hit = grid.raycast({ x: 0, y: 54 }, { x: 180, y: 54 });
    expect(hit?.point.x).toBeCloseTo(90);
    expect(hit?.progress).toBeCloseTo(0.5);
    expect(hit?.cell).toEqual({ x: 2, y: 1 });
  });

  it('checks rotated rectangles and their translation plus rotation sweep', () => {
    const grid = new TerrainGrid({
      world: { cellSize: 36, columns: 6, rows: 6 },
      terrain: {
        legend: { '.': 'open', H: 'hill' },
        rows: Array.from({ length: 6 }, () => '...H..'),
      },
      terrainTypes: map.terrainTypes,
    });

    expect(grid.isBlockedOrientedRect({ x: 87, y: 90 }, 20, 10, 0, 'tank')).toBe(false);
    expect(grid.isBlockedOrientedRect({ x: 87, y: 90 }, 20, 10, Math.PI / 4, 'tank')).toBe(true);
    expect(grid.isBlockedOrientedRect({ x: 20, y: 72 }, 20, 10, 0, 'tank')).toBe(false);
    expect(grid.isBlockedOrientedRect({ x: 20, y: 72 }, 20, 10, Math.PI / 4, 'tank')).toBe(true);

    const safeProgress = grid.getSafeOrientedRectProgress(
      { x: 54, y: 90 },
      { x: 162, y: 90 },
      10,
      10,
      0,
      Math.PI / 4,
      'tank',
    );
    expect(safeProgress).toBeLessThan(1);
    const safePoint = { x: 54 + (162 - 54) * safeProgress, y: 90 };
    expect(grid.isBlockedOrientedRect(safePoint, 10, 10, Math.PI / 4 * safeProgress, 'tank')).toBe(false);
  });
});
