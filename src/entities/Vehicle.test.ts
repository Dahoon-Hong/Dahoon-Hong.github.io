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
