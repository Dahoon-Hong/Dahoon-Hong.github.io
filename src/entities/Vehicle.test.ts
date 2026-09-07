import { describe, expect, it } from 'vitest';
import { TerrainGrid, TerrainMapData } from '../core/TerrainGrid';
import { TankDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager } from '../core/UpgradeManager';
import { Vehicle } from './Vehicle';

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
