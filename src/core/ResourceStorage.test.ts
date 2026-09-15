import { describe, expect, it } from 'vitest';
import resourceConfig from '../data/resources.json';
import { ResourceStorage } from './ResourceStorage';

describe('resource storage capacities', () => {
  it('uses capacities from the JSON configuration by default', () => {
    const storage = new ResourceStorage();

    expect(storage.getCapacity('resource')).toBe(resourceConfig.capacities.resource);
    expect(storage.getCapacity('matter')).toBe(resourceConfig.capacities.matter);
    expect(storage.getCapacity('ammo')).toBe(resourceConfig.capacities.ammo);
    expect(storage.getCapacity('nano')).toBe(resourceConfig.capacities.nano);
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
