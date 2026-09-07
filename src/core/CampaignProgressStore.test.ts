import { describe, expect, it } from 'vitest';
import { CAMPAIGN_PROGRESS_STORAGE_KEY, CampaignProgress } from './CampaignProgressStore';
import { LocalStorageCampaignProgressStore } from './LocalStorageCampaignProgressStore';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  public get length(): number { return this.values.size; }
  public clear(): void { this.values.clear(); }
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  public removeItem(key: string): void { this.values.delete(key); }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('CampaignProgressStore', () => {
  it('loads the first-run state and filters unknown, duplicate, and test IDs', async () => {
    const storage = new MemoryStorage();
    storage.setItem(CAMPAIGN_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      clearedMapIds: ['aurelia/landing-zone', 'test/terrain-test', 'aurelia/landing-zone', 'unknown'],
    }));
    const store = new LocalStorageCampaignProgressStore(['aurelia/landing-zone', 'cinder/core-ruins'], storage);

    await expect(store.load()).resolves.toEqual({ version: 1, clearedMapIds: ['aurelia/landing-zone'] });
  });

  it('falls back to memory for malformed or inaccessible storage and keeps a failed save', async () => {
    const inaccessible = {
      getItem(): string { throw new Error('blocked'); },
      setItem(): void { throw new Error('blocked'); },
    } as unknown as Storage;
    const store = new LocalStorageCampaignProgressStore(['aurelia/landing-zone'], inaccessible);
    await expect(store.load()).resolves.toEqual({ version: 1, clearedMapIds: [] });

    const progress: CampaignProgress = { version: 1, clearedMapIds: ['aurelia/landing-zone'] };
    await expect(store.save(progress)).rejects.toThrow('blocked');
    await expect(store.load()).resolves.toEqual(progress);
  });
});
