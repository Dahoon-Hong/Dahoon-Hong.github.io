import { describe, expect, it } from 'vitest';
import { TankDefinitionLoader } from './TankDefinitionLoader';
import { ResourceStorage } from './ResourceStorage';

describe('resource storage capacities', () => {
  it('uses capacities from the starter tank JSON configuration', () => {
    const tank = new TankDefinitionLoader().getDefault();
    const storage = new ResourceStorage({ resource: 50 }, tank.resourceCapacities);

    expect(tank.resourceCapacities).toEqual({ resource: 300, matter: 300, ammo: 300, nano: 300 });
    for (const type of ['resource', 'matter', 'ammo', 'nano'] as const) {
      expect(storage.getCapacity(type)).toBe(300);
    }
  });

  it('applies a separate capacity to each resource type', () => {
    const storage = new ResourceStorage(
      { resource: 120, matter: 80, ammo: 250, nano: 40 },
      { resource: 120, matter: 80, ammo: 250, nano: 40 },
    );

    expect(storage.getCapacity('resource')).toBe(120);
    expect(storage.getCapacity('matter')).toBe(80);
    expect(storage.getCapacity('ammo')).toBe(250);
    expect(storage.getCapacity('nano')).toBe(40);
    expect(storage.add('ammo', 1)).toBe(0);
  });
});
