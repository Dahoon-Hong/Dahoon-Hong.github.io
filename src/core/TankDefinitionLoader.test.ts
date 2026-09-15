import { describe, expect, it } from 'vitest';
import { TankDefinitionLoader } from './TankDefinitionLoader';

describe('modern firearms tank data', () => {
  it('loads all nine modern tank weapons with the approved contracts', () => {
    const tank = new TankDefinitionLoader().getDefault();
    const expected = {
      'machine-gun-12.7mm': ['machine-gun', 1, 1, 360, 0, 620, 20],
      'machine-gun-20mm': ['machine-gun', 1, 1, 360, 0, 740, 15],
      'machine-gun-30mm': ['machine-gun', 1, 1, 360, 0, 860, 10],
      'tank-gun-76mm': ['tank-gun', 1, 2, 30, 120, 760, 1],
      'tank-gun-90mm': ['tank-gun', 1, 2, 30, 150, 880, 1],
      'tank-gun-120mm': ['tank-gun', 1, 2, 30, 190, 1000, 1],
      'mortar-60mm': ['howitzer', 1, 1, 45, 100, 680, 1],
      'howitzer-105mm': ['howitzer', 2, 2, 45, 180, 840, 1],
      'howitzer-155mm': ['howitzer', 2, 2, 45, 280, 1000, 1],
    } as const;

    expect(Object.keys(expected)).toHaveLength(9);
    expect(tank.resourceCapacities).toEqual({ resource: 300, matter: 300, ammo: 300, nano: 300 });
    for (const [id, [weaponClass, width, height, arc, minRange, maxRange, magazineSize]] of Object.entries(expected)) {
      const definition = tank.modules[id];
      expect(definition).toBeDefined();
      expect(definition.weaponClass).toBe(weaponClass);
      expect(definition.size).toEqual({ width, height });
      expect(definition.fireArcDegrees).toBe(arc);
      expect(definition.baseStats.minRange).toBe(minRange);
      expect(definition.baseStats.maxRange).toBe(maxRange);
      expect(definition.baseStats.range).toBeUndefined();
      expect(definition.baseStats.maxDistance).toBeUndefined();
      expect(definition.baseStats.magazineSize).toBe(magazineSize);
      expect(definition.moduleAssetId).toMatch(/^tank\.module\.modern\./);
      expect(definition.fireSoundId).toMatch(/^sfx\.weapon\./);
      expect(definition.fireEffectId).toBeTruthy();
    }
  });
});
