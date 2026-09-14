import { describe, expect, it } from 'vitest';
import { TankModuleDefinition } from './TankDefinitionLoader';
import { UpgradeManager } from './UpgradeManager';

const definition: TankModuleDefinition = {
  id: 'armory',
  kind: 'builtin',
  name: 'Armory',
  behavior: 'armory',
  baseStats: {},
  upgradeTree: {
    rootId: 'root',
    nodes: [
      { id: 'root', parentId: null, cost: {}, effects: [] },
      { id: 'lane-a', parentId: 'root', exclusiveGroup: null, cost: {}, effects: [] },
      { id: 'lane-b', parentId: 'root', exclusiveGroup: null, cost: {}, effects: [] },
      { id: 'branch-a', parentId: 'lane-a', cost: {}, effects: [] },
      { id: 'branch-b', parentId: 'lane-a', cost: {}, effects: [] },
    ],
  },
};

describe('UpgradeManager branch rules', () => {
  it('keeps null-group siblings independent while preserving default exclusivity', () => {
    const upgrades = new UpgradeManager({ armory: definition });
    upgrades.registerInstance('builtin:armory', 'armory');
    expect(upgrades.select('builtin:armory', 'lane-a', () => true)).toBe(true);
    expect(upgrades.select('builtin:armory', 'lane-b', () => true)).toBe(true);
    expect(upgrades.select('builtin:armory', 'branch-a', () => true)).toBe(true);
    expect(upgrades.getNodeStates('builtin:armory').find((state) => state.definition.id === 'branch-b')?.status).toBe('disabled');
  });
});
