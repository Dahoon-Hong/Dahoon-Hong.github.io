export const CAMPAIGN_PROGRESS_STORAGE_KEY = 'platform-vehicle-defense.campaign-progress.v1';

export interface CampaignProgress {
  version: 1;
  clearedMapIds: string[];
}

export interface CampaignProgressStore {
  load(): Promise<CampaignProgress>;
  save(progress: CampaignProgress): Promise<void>;
}

export const EMPTY_CAMPAIGN_PROGRESS: CampaignProgress = {
  version: 1,
  clearedMapIds: [],
};

export function sanitizeCampaignProgress(
  value: unknown,
  validMapIds: ReadonlySet<string>,
): CampaignProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_CAMPAIGN_PROGRESS, clearedMapIds: [] };
  const source = value as { version?: unknown; clearedMapIds?: unknown };
  if (source.version !== 1 || !Array.isArray(source.clearedMapIds)) {
    return { ...EMPTY_CAMPAIGN_PROGRESS, clearedMapIds: [] };
  }

  const clearedMapIds: string[] = [];
  const seen = new Set<string>();
  for (const mapId of source.clearedMapIds) {
    if (typeof mapId !== 'string' || !validMapIds.has(mapId) || seen.has(mapId)) continue;
    seen.add(mapId);
    clearedMapIds.push(mapId);
  }
  return { version: 1, clearedMapIds };
}
