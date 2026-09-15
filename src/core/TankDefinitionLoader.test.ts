import { describe, expect, it } from 'vitest';
import { TankDefinitionLoader } from './TankDefinitionLoader';

describe('modern firearms tank data', () => {
  it('loads all nine modern tank weapons with the approved contracts', () => {
    const tank = new TankDefinitionLoader().getDefault();
    const expected = {
      'machine-gun-12.7mm': ['machine-gun', 1, 1, 360, 0, 20],
      'machine-gun-20mm': ['machine-gun', 1, 1, 360, 0, 15],
      'machine-gun-30mm': ['machine-gun', 1, 1, 360, 0, 10],
      'tank-gun-76mm': ['tank-gun', 1, 2, 30, 120, 1],
      'tank-gun-90mm': ['tank-gun', 1, 2, 30, 150, 1],
      'tank-gun-120mm': ['tank-gun', 1, 2, 30, 190, 1],
      'mortar-60mm': ['howitzer', 1, 1, 45, 100, 1],
      'howitzer-105mm': ['howitzer', 2, 2, 45, 180, 1],
      'howitzer-155mm': ['howitzer', 2, 2, 45, 280, 1],
    } as const;

    expect(Object.keys(expected)).toHaveLength(9);
    for (const [id, [weaponClass, width, height, arc, minRange, magazineSize]] of Object.entries(expected)) {
      const definition = tank.modules[id];
      expect(definition).toBeDefined();
      expect(definition.weaponClass).toBe(weaponClass);
      expect(definition.size).toEqual({ width, height });
      expect(definition.fireArcDegrees).toBe(arc);
      expect(definition.baseStats.minRange).toBe(minRange);
      expect(definition.baseStats.magazineSize).toBe(magazineSize);
      expect(definition.moduleAssetId).toMatch(/^tank\.module\.modern\./);
      expect(definition.fireSoundId).toMatch(/^sfx\.weapon\./);
      expect(definition.fireEffectId).toBeTruthy();
    }
  });
});
