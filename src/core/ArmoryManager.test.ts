import { describe, expect, it } from 'vitest';
import { ArmoryManager } from './ArmoryManager';
import { TankDefinitionLoader } from './TankDefinitionLoader';
import { UpgradeManager } from './UpgradeManager';

describe('modern firearms armory', () => {
  it('allows all three research lanes to progress independently', () => {
    const tank = new TankDefinitionLoader().getDefault();
    const upgrades = new UpgradeManager(tank.modules);
    upgrades.registerInstance('builtin:armory', 'armory');
    const armory = new ArmoryManager(tank, upgrades);

    expect(armory.getCombatModuleDefinitions().map((definition) => definition.id)).toEqual([
      'direct-weapon',
      'machine-gun-20mm',
      'machine-gun-30mm',
      'tank-gun-76mm',
      'tank-gun-90mm',
      'tank-gun-120mm',
      'arc-weapon',
      'howitzer-105mm',
      'howitzer-155mm',
    ]);

    expect(armory.isResearched('direct-weapon')).toBe(true);
    expect(armory.isResearched('machine-gun-20mm')).toBe(false);
    expect(upgrades.select('builtin:armory', 'research-machine-gun-20mm', () => true)).toBe(true);
    expect(upgrades.select('builtin:armory', 'research-tank-gun-76mm', () => true)).toBe(true);
    expect(upgrades.select('builtin:armory', 'research-arc-weapon', () => true)).toBe(true);
    expect(armory.isResearched('machine-gun-20mm')).toBe(true);
    expect(armory.isResearched('tank-gun-76mm')).toBe(true);
    expect(armory.isResearched('arc-weapon')).toBe(true);
    expect(armory.isResearched('machine-gun-30mm')).toBe(false);

    expect(upgrades.select('builtin:armory', 'research-machine-gun-30mm', () => true)).toBe(true);
    expect(upgrades.select('builtin:armory', 'research-tank-gun-90mm', () => true)).toBe(true);
    expect(upgrades.select('builtin:armory', 'research-tank-gun-120mm', () => true)).toBe(true);
    expect(upgrades.select('builtin:armory', 'research-howitzer-105mm', () => true)).toBe(true);
    expect(upgrades.select('builtin:armory', 'research-howitzer-155mm', () => true)).toBe(true);

    for (const definition of armory.getCombatModuleDefinitions()) {
      expect(armory.purchase(definition.id, () => true)).toBe(true);
      expect(armory.getStock(definition.id)).toBe(1);
    }
  });
});
