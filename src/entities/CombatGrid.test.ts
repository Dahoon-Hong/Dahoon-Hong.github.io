import { describe, expect, it } from 'vitest';
import { TankModuleDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager } from '../core/UpgradeManager';
import { CombatGrid } from './CombatGrid';

const moduleDefinition: TankModuleDefinition = {
  id: 'test-weapon',
  kind: 'combat',
  name: 'Test Weapon',
  behavior: 'direct',
  size: { width: 2, height: 1 },
  baseStats: {
    maxHp: 100,
    damage: 20,
    maxRange: 200,
    minRange: 0,
    penetration: 10,
    magazineSize: 1,
    reloadTime: 1,
  },
  upgradeTree: {
    rootId: 'root',
    nodes: [
      { id: 'root', parentId: null, cost: {}, effects: [] },
      { id: 'damage', parentId: 'root', cost: {}, effects: [{ stat: 'damage', operation: 'add', value: 5 }] },
    ],
  },
};

describe('CombatGrid module storage', () => {
  it('removes a placement without destroying the reusable upgraded instance', () => {
    const upgrades = new UpgradeManager({ 'test-weapon': moduleDefinition });
    const grid = new CombatGrid(
      { columns: 3, rows: 3, blockedCells: [] },
      { 'test-weapon': moduleDefinition },
      upgrades,
    );

    const module = grid.install('test-weapon', { x: 0, y: 0 });
    if (!module) throw new Error('module installation failed');
    expect(upgrades.select(module.instanceId, 'damage', () => true)).toBe(true);
    module.takeDamage(25);

    expect(grid.remove(module)).toBe(true);
    expect(grid.getPlacements()).toHaveLength(0);
    expect(grid.getModuleAtCell(0, 0)).toBeNull();
    expect(grid.getModuleAtCell(1, 0)).toBeNull();
    expect(grid.getStoredCombatModuleCount('test-weapon')).toBe(1);

    const reinstalled = grid.install('test-weapon', { x: 1, y: 1 });
    expect(reinstalled).toBe(module);
    expect(reinstalled?.instanceId).toBe(module.instanceId);
    expect(reinstalled?.level).toBe(2);
    expect(reinstalled?.currentHp).toBe(75);
    expect(grid.getStoredCombatModuleCount('test-weapon')).toBe(0);
    expect(grid.getModuleAtCell(1, 1)).toBe(module);
    expect(grid.getModuleAtCell(2, 1)).toBe(module);
  });
});
