import {
  CAMPAIGN_PROGRESS_STORAGE_KEY,
  CampaignProgress,
  CampaignProgressStore,
  EMPTY_CAMPAIGN_PROGRESS,
  sanitizeCampaignProgress,
} from './CampaignProgressStore';

export class LocalStorageCampaignProgressStore implements CampaignProgressStore {
  private readonly validMapIds: ReadonlySet<string>;
  private readonly storage: Storage | null;
  private memoryProgress: CampaignProgress = { ...EMPTY_CAMPAIGN_PROGRESS, clearedMapIds: [] };

  public constructor(validMapIds: Iterable<string>, storage?: Storage | null) {
    this.validMapIds = new Set(validMapIds);
    this.storage = storage === undefined ? this.getBrowserStorage() : storage;
  }

  public async load(): Promise<CampaignProgress> {
    if (!this.storage) return this.clone(this.memoryProgress);
    try {
      const raw = this.storage.getItem(CAMPAIGN_PROGRESS_STORAGE_KEY);
      if (!raw) return this.clone(this.memoryProgress);
      const progress = sanitizeCampaignProgress(JSON.parse(raw) as unknown, this.validMapIds);
      this.memoryProgress = progress;
      return this.clone(progress);
    } catch {
      return this.clone(this.memoryProgress);
    }
  }

  public async save(progress: CampaignProgress): Promise<void> {
    const sanitized = sanitizeCampaignProgress(progress, this.validMapIds);
    this.memoryProgress = sanitized;
    if (!this.storage) throw new Error('campaign progress storage is unavailable');
    try {
      this.storage.setItem(CAMPAIGN_PROGRESS_STORAGE_KEY, JSON.stringify(sanitized));
    } catch (error) {
      throw error instanceof Error ? error : new Error('campaign progress save failed');
    }
  }

  private getBrowserStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private clone(progress: CampaignProgress): CampaignProgress {
    return { version: 1, clearedMapIds: [...progress.clearedMapIds] };
  }
}
