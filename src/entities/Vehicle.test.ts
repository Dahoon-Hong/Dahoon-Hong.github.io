import { describe, expect, it, vi } from 'vitest';
import { TerrainGrid, TerrainMapData } from '../core/TerrainGrid';
import { TankDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager } from '../core/UpgradeManager';
import { Vehicle } from './Vehicle';
import type { RenderContext } from '../rendering/RenderContext';

const tree = { rootId: 'root', nodes: [{ id: 'root', parentId: null, cost: {}, effects: [] }] };
const definition: TankDefinition = {
  id: 'test',
  name: 'Test Tank',
  grid: { columns: 3, rows: 3, blockedCells: [] },
  builtinModuleIds: ['core', 'power-pack', 'caterpillar-track'],
  initialCombatModules: [],
  modules: {
    core: { id: 'core', kind: 'builtin', name: 'Core', behavior: 'core', baseStats: { maxHp: 100 }, upgradeTree: tree },
    'power-pack': { id: 'power-pack', kind: 'builtin', name: 'Power', behavior: 'power-pack', baseStats: { movementSpeed: 180 }, upgradeTree: tree },
    'caterpillar-track': { id: 'caterpillar-track', kind: 'builtin', name: 'Track', behavior: 'track', baseStats: { trackMaxSpeed: 180 }, upgradeTree: tree },
  },
};

const terrain: TerrainMapData = {
  world: { cellSize: 36, columns: 10, rows: 10 },
  terrain: {
    legend: { '.': 'open', H: 'hill' },
    rows: Array.from({ length: 10 }, () => '.....H....'),
  },
  terrainTypes: {
    open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
    hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
  },
};

const rectangularDefinition: TankDefinition = {
  ...definition,
  id: 'rectangular-test',
  grid: { columns: 2, rows: 4, blockedCells: [] },
};

describe('Vehicle terrain movement', () => {
  it('stops at a wall while allowing the unblocked axis to slide', () => {
    const vehicle = new Vehicle(90, 180, definition, new UpgradeManager(definition.modules));
    const grid = new TerrainGrid(terrain);

    vehicle.update(1, { x: 1, y: 1 }, { width: grid.width, height: grid.height, terrain: grid });

    expect(vehicle.x).toBeLessThanOrEqual(120.01);
    expect(vehicle.y).toBeGreaterThan(180);
    expect(vehicle.isTerrainPositionValid({ x: vehicle.x, y: vehicle.y }, grid)).toBe(true);
  });

  it('does not tunnel through a wall at a large frame delta or leave world bounds', () => {
    const vehicle = new Vehicle(90, 180, definition, new UpgradeManager(definition.modules));
    const grid = new TerrainGrid(terrain);

    vehicle.update(10, { x: 1, y: 0 }, { width: grid.width, height: grid.height, terrain: grid });

    expect(vehicle.x).toBeLessThanOrEqual(120.01);
    expect(vehicle.y).toBeGreaterThanOrEqual(60);
    expect(vehicle.y).toBeLessThanOrEqual(300);
  });

  it('uses the rotated full hull for validity and movement resolution', () => {
    const vehicle = new Vehicle(65, 108, rectangularDefinition, new UpgradeManager(rectangularDefinition.modules));
    const grid = new TerrainGrid({
      world: { cellSize: 36, columns: 6, rows: 6 },
      terrain: {
        legend: { '.': 'open', H: 'hill' },
        rows: Array.from({ length: 6 }, () => '...H..'),
      },
      terrainTypes: terrain.terrainTypes,
    });

    expect(vehicle.isTerrainPositionValid({ x: 65, y: 108 }, grid, 0)).toBe(true);
    expect(vehicle.isTerrainPositionValid({ x: 65, y: 108 }, grid, Math.PI / 4)).toBe(false);

    vehicle.update(1, { x: 1, y: 1 }, { width: grid.width, height: grid.height, terrain: grid });
    expect(vehicle.isTerrainPositionValid({ x: vehicle.x, y: vehicle.y }, grid)).toBe(true);
  });

  it('uses a three-tile terrain footprint without shrinking the visual grid', () => {
    const grid = new TerrainGrid({
      world: { cellSize: 18, columns: 7, rows: 5 },
      terrain: {
        legend: { '.': 'open', H: 'hill' },
        rows: [
          '#######',
          '##...##',
          '##...##',
          '##...##',
          '#######',
        ],
      },
      terrainTypes: terrain.terrainTypes,
    });
    const defaultVehicle = new Vehicle(63, 45, definition, new UpgradeManager(definition.modules));
    const narrowVehicle = new Vehicle(63, 45, definition, new UpgradeManager(definition.modules), {
      terrainFootprintScale: 0.45,
    });

    expect(defaultVehicle.getTerrainFootprint()).toEqual({ halfWidth: 60, halfHeight: 60 });
    expect(narrowVehicle.getTerrainFootprint()).toEqual({ halfWidth: 24.3, halfHeight: 24.3 });
    expect(defaultVehicle.isTerrainPositionValid({ x: 63, y: 45 }, grid)).toBe(false);
    expect(narrowVehicle.isTerrainPositionValid({ x: 63, y: 45 }, grid)).toBe(true);
    expect(narrowVehicle.gridCols).toBe(3);
    expect(narrowVehicle.tileSize).toBe(36);
  });

  it('keeps a three-tile passage open with slight centerline error', () => {
    const grid = new TerrainGrid({
      world: { cellSize: 18, columns: 12, rows: 5 },
      terrain: {
        legend: { '.': 'open', H: 'hill' },
        rows: [
          '############',
          '##........##',
          '##........##',
          '##........##',
          '############',
        ],
      },
      terrainTypes: terrain.terrainTypes,
    });
    const vehicle = new Vehicle(63, 47, definition, new UpgradeManager(definition.modules), {
      terrainFootprintScale: 0.45,
    });

    expect(vehicle.isTerrainPositionValid({ x: vehicle.x, y: vehicle.y }, grid)).toBe(true);
    vehicle.update(0.5, { x: 1, y: 0 }, { width: grid.width, height: grid.height, terrain: grid });

    expect(vehicle.x).toBeGreaterThan(100);
    expect(vehicle.isTerrainPositionValid({ x: vehicle.x, y: vehicle.y }, grid)).toBe(true);
  });

  it('slides along a wall and remains stable in a blocked corner', () => {
    const vehicle = new Vehicle(90, 90, definition, new UpgradeManager(definition.modules));
    const grid = new TerrainGrid({
      world: { cellSize: 36, columns: 10, rows: 10 },
      terrain: {
        legend: { '.': 'open', H: 'hill' },
        rows: [
          '..........',
          '..........',
          '..........',
          '..........',
          '..........',
          '.....HHHHH',
          '.....H....',
          '.....H....',
          '.....H....',
          '.....H....',
        ],
      },
      terrainTypes: terrain.terrainTypes,
    });
    const start = { x: vehicle.x, y: vehicle.y };

    vehicle.update(1, { x: 1, y: 1 }, { width: grid.width, height: grid.height, terrain: grid });
    const first = { x: vehicle.x, y: vehicle.y };
    expect(grid.isBlockedOrientedRect(
      first,
      vehicle.getTerrainFootprint().halfWidth,
      vehicle.getTerrainFootprint().halfHeight,
      vehicle.getFacingRotation(),
      'tank',
    )).toBe(false);
    expect(Math.hypot(first.x - start.x, first.y - start.y)).toBeLessThanOrEqual(180.01);
    expect(first.y).toBeGreaterThan(start.y);

    vehicle.update(1, { x: 1, y: 1 }, { width: grid.width, height: grid.height, terrain: grid });
    const second = { x: vehicle.x, y: vehicle.y };
    vehicle.update(1, { x: 1, y: 1 }, { width: grid.width, height: grid.height, terrain: grid });
    expect(vehicle.x).toBeCloseTo(second.x, 4);
    expect(vehicle.y).toBeCloseTo(second.y, 4);

    vehicle.update(0.5, { x: -1, y: -1 }, { width: grid.width, height: grid.height, terrain: grid });
    expect(vehicle.x).toBeLessThan(second.x);
    expect(vehicle.y).toBeLessThan(second.y);
    expect(vehicle.isTerrainPositionValid({ x: vehicle.x, y: vehicle.y }, grid)).toBe(true);
  });

  it('keeps the resolved wall route stable across common frame rates', () => {
    const simulate = (steps: number): { x: number; y: number } => {
      const vehicle = new Vehicle(90, 180, definition, new UpgradeManager(definition.modules));
      const grid = new TerrainGrid(terrain);
      for (let index = 0; index < steps; index++) {
        vehicle.update(1 / steps, { x: 1, y: 1 }, { width: grid.width, height: grid.height, terrain: grid });
      }
      expect(vehicle.isTerrainPositionValid({ x: vehicle.x, y: vehicle.y }, grid)).toBe(true);
      return { x: vehicle.x, y: vehicle.y };
    };

    const thirty = simulate(30);
    const sixty = simulate(60);
    const oneTwenty = simulate(120);
    for (const result of [sixty, oneTwenty]) {
      expect(Math.abs(result.x - thirty.x)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(result.y - thirty.y)).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('Vehicle movement animation', () => {
  const bounds = { width: 1000, height: 1000 };
  const makeVehicle = () => new Vehicle(120, 180, definition, new UpgradeManager(definition.modules));
  const draw = (vehicle: Vehicle, time = 0, reducedMotion = false) => {
    const fillRect = vi.fn();
    const drawSprite = vi.fn();
    const noop = () => {};
    const render = {
      ctx: { save: noop, restore: noop, translate: noop, rotate: noop, beginPath: noop, rect: noop, clip: noop, strokeRect: noop, fillRect },
      renderer: { drawSprite }, time, reducedMotion,
    } as unknown as RenderContext;
    vehicle.render(render);
    return {
      rectangles: fillRect.mock.calls,
      hull: drawSprite.mock.calls.find((call) => call[1] === 'tank.starter.move')?.slice(1),
    };
  };

  it('keeps the hull fixed while treads advance with travel and retain their phase at rest', () => {
    const vehicle = makeVehicle();
    const idle = draw(vehicle);
    vehicle.update(0.01, { x: 1, y: 0 }, bounds);
    const moving = draw(vehicle, 0.13);

    expect(moving.hull).toEqual(idle.hull);
    expect(moving.rectangles).not.toEqual(idle.rectangles);
    vehicle.update(1, { x: 0, y: 0 }, bounds);
    expect(draw(vehicle, 1.13)).toEqual(moving);
    vehicle.update(0.01, { x: 1, y: 0 }, bounds);
    expect(draw(vehicle).rectangles).not.toEqual(moving.rectangles);
  });

  it('uses resolved distance, independent of frame timing, and stops at terrain and world edges', () => {
    const vehicle = makeVehicle();
    const other = makeVehicle();
    vehicle.update(0.125, { x: 1, y: 0 }, bounds);
    other.update(0.0625, { x: 1, y: 0 }, bounds);
    other.update(0.0625, { x: 1, y: 0 }, bounds);
    expect(draw(vehicle)).toEqual(draw(other));

    const grid = new TerrainGrid(terrain);
    const blocked = makeVehicle();
    const idle = draw(blocked);
    blocked.update(0.1, { x: 1, y: 0 }, { width: grid.width, height: grid.height, terrain: grid });
    expect(blocked.x).toBe(120);
    expect(draw(blocked)).toEqual(idle);
    blocked.update(0.1, { x: 1, y: 0 }, { width: 180, height: 360 });
    expect(draw(blocked)).toEqual(idle);
  });

  it('holds treads still with reduced motion and resets their phase for a new run', () => {
    const vehicle = makeVehicle();
    const idle = draw(vehicle);
    vehicle.update(0.01, { x: 1, y: 0 }, bounds);
    expect(draw(vehicle, 1, true)).toEqual(idle);
    vehicle.resetRuntime();
    expect(draw(vehicle, 2)).toEqual(idle);
  });
});
