import { describe, expect, it } from 'vitest';
import { mapDefinitionLoader } from './MapDefinitionLoader';
import { ProgressionManager } from './ProgressionManager';
import { WorldMapDataLoader } from './WorldMapDataLoader';
import { WorldMap } from '../ui/WorldMap';

describe('World map data and unlock states', () => {
  it('loads the four-node campaign chain plus an always-available test node', () => {
    const loader = new WorldMapDataLoader(undefined, mapDefinitionLoader, new ProgressionManager());
    expect(loader.getCampaignMapIds()).toEqual([
      'aurelia/landing-zone',
      'aurelia/relay-fields',
      'cinder/ash-basin',
      'cinder/core-ruins',
    ]);
    expect(loader.getNodes().find((node) => node.test)?.mapId).toBe('test/terrain-test');
  });

  it('computes first, next, cleared, locked, and test states from clear IDs', () => {
    const loader = new WorldMapDataLoader();
    const worldMap = new WorldMap(loader.getNodes());
    const statuses = worldMap.getStatuses({ version: 1, clearedMapIds: ['aurelia/landing-zone'] });
    expect(statuses).toEqual(['cleared', 'available', 'locked', 'locked', 'test']);
  });
});
