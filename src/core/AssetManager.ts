import assetManifest from '../data/assets.json';

export type AssetStatus = 'pending' | 'ready' | 'failed' | 'missing';

export interface SpriteAsset {
  id: string;
  src: string;
  draw: { width: number; height: number };
  pivot: { x: number; y: number };
  frames: { columns: number; rows: number; duration: number };
  layer: string;
  fallback: string;
}

export interface AssetLoadReport {
  ready: string[];
  failed: Array<{ id: string; reason: string }>;
  missing: string[];
}

type AssetManifest = {
  version: number;
  sprites: Record<string, Omit<SpriteAsset, 'id'>>;
};

const MANIFEST = assetManifest as AssetManifest;

export class AssetManager {
  private readonly entries = new Map<string, SpriteAsset>();
  private readonly statuses = new Map<string, AssetStatus>();
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly loadPromises = new Map<string, Promise<void>>();
  private readonly errors = new Map<string, string>();
  private readonly validationErrors: string[] = [];
  private readonly warned = new Set<string>();

  public constructor(manifest: AssetManifest = MANIFEST) {
    if (!manifest || typeof manifest !== 'object') {
      this.validationErrors.push('manifest must be an object');
      return;
    }
    if (!Number.isInteger(manifest.version) || manifest.version < 1) {
      this.validationErrors.push('manifest version must be a positive integer');
    }

    for (const [id, rawEntry] of Object.entries(manifest.sprites ?? {})) {
      const entry = { id, ...rawEntry };
      const reason = this.validateEntry(entry);
      if (reason) {
        this.statuses.set(id, 'missing');
        this.validationErrors.push(`${id}: ${reason}`);
        continue;
      }
      this.entries.set(id, entry);
      this.statuses.set(id, 'pending');
    }
  }

  public preload(ids: readonly string[] = [...this.entries.keys()]): Promise<AssetLoadReport> {
    return Promise.all(ids.map((id) => this.load(id))).then(() => this.getLoadReport(ids));
  }

  public get(id: string): SpriteAsset | null {
    return this.entries.get(id) ?? null;
  }

  public getImage(id: string): HTMLImageElement | null {
    return this.images.get(id) ?? null;
  }

  public has(id: string): boolean {
    return this.entries.has(id);
  }

  public getStatus(id: string): AssetStatus {
    return this.statuses.get(id) ?? 'missing';
  }

  public getValidationErrors(): readonly string[] {
    return this.validationErrors;
  }

  private load(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return Promise.resolve();
    if (this.statuses.get(id) === 'ready' || this.statuses.get(id) === 'failed') return Promise.resolve();

    const existing = this.loadPromises.get(id);
    if (existing) return existing;

    const promise = new Promise<void>((resolve) => {
      if (typeof Image === 'undefined') {
        this.fail(id, 'Image API is unavailable');
        resolve();
        return;
      }

      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        this.images.set(id, image);
        this.statuses.set(id, 'ready');
        resolve();
      };
      image.onerror = () => {
        this.fail(id, `could not load ${entry.src}`);
        resolve();
      };
      image.src = entry.src;
    });

    this.loadPromises.set(id, promise);
    return promise;
  }

  private getLoadReport(ids: readonly string[]): AssetLoadReport {
    const report: AssetLoadReport = { ready: [], failed: [], missing: [] };
    for (const id of ids) {
      const status = this.getStatus(id);
      if (status === 'ready') report.ready.push(id);
      else if (status === 'failed') report.failed.push({ id, reason: this.errors.get(id) ?? 'unknown load error' });
      else report.missing.push(id);
    }
    return report;
  }

  private fail(id: string, reason: string): void {
    this.statuses.set(id, 'failed');
    this.errors.set(id, reason);
    if (this.warned.has(id)) return;
    this.warned.add(id);
    console.warn(`[AssetManager] ${id}: ${reason}`);
  }

  private validateEntry(entry: SpriteAsset): string | null {
    if (!entry || typeof entry !== 'object') return 'entry is not an object';
    if (!entry.src || typeof entry.src !== 'string') return 'src is empty';
    if (!entry.draw || !this.isPositive(entry.draw.width) || !this.isPositive(entry.draw.height)) {
      return 'draw size must be positive';
    }
    if (!entry.pivot || !this.isUnit(entry.pivot.x) || !this.isUnit(entry.pivot.y)) {
      return 'pivot must be between 0 and 1';
    }
    if (!entry.frames || !Number.isInteger(entry.frames.columns) || entry.frames.columns < 1 ||
        !Number.isInteger(entry.frames.rows) || entry.frames.rows < 1 ||
        !Number.isFinite(entry.frames.duration) || entry.frames.duration < 0) {
      return 'frames are invalid';
    }
    if (!entry.layer || !entry.fallback) return 'layer and fallback are required';
    return null;
  }

  private isPositive(value: number): boolean {
    return Number.isFinite(value) && value > 0;
  }

  private isUnit(value: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= 1;
  }
}
