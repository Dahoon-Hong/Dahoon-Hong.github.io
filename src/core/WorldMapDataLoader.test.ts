import { describe, expect, it } from 'vitest';
import { mapDefinitionLoader } from './MapDefinitionLoader';
import { ProgressionManager } from './ProgressionManager';
import { WorldMapDataLoader } from './WorldMapDataLoader';
import { WorldMap } from '../ui/WorldMap';

describe('World map data and unlock states', () => {
  it('loads the three-node campaign chain plus the canonical development/test node', () => {
    const loader = new WorldMapDataLoader(undefined, mapDefinitionLoader, new ProgressionManager());
    expect(loader.getCampaignMapIds()).toEqual([
      'aurelia/relay-fields',
      'cinder/ash-basin',
      'cinder/core-ruins',
    ]);
    expect(loader.getNodes().find((node) => node.test)?.mapId).toBe('aurelia/landing-zone');
  });

  it('computes test, available, cleared, and locked states from clear IDs', () => {
    const loader = new WorldMapDataLoader();
    const worldMap = new WorldMap(loader.getNodes());
    const statuses = worldMap.getStatuses({ version: 1, clearedMapIds: ['cinder/ash-basin'] });
    expect(statuses).toEqual(['test', 'available', 'cleared', 'available']);
  });
});
