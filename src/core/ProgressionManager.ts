import progressionData from '../data/progression.json';
import enemyData from '../data/enemies.json';
import { EnemyDefinition, EnemyType } from '../entities/Enemy';

export interface WaveDefinition {
  standard: number;
  tanker: number;
}

export interface RegionDefinition {
  id: string;
  mapId: string;
  campaign?: boolean;
  name: string;
  spawnInterval: number;
  spawnIntervalStep: number;
  minimumSpawnInterval: number;
  waves: WaveDefinition[];
}

export interface PlanetDefinition {
  id: string;
  name: string;
  regions: RegionDefinition[];
}

export interface ProgressionDefinition {
  planets: PlanetDefinition[];
}

export type ProgressionAdvance = 'region' | 'planet' | 'complete';

const DEFINITION: ProgressionDefinition = progressionData;
const ENEMY_DEFINITIONS: Readonly<Record<EnemyType, EnemyDefinition>> = enemyData;

export class ProgressionManager {
  private readonly definition: ProgressionDefinition;
  private planetIndex = 0;
  private regionIndex = 0;

  constructor(definition: ProgressionDefinition = DEFINITION) {
    this.validate(definition);
    this.definition = definition;
  }

  public get currentPlanet(): PlanetDefinition {
    return this.definition.planets[this.planetIndex];
  }

  public get currentRegion(): RegionDefinition {
    return this.currentPlanet.regions[this.regionIndex];
  }

  public get enemyDefinitions(): Readonly<Record<EnemyType, EnemyDefinition>> {
    return ENEMY_DEFINITIONS;
  }

  public get location(): { planetIndex: number; regionIndex: number; planetName: string; regionName: string } {
    return {
      planetIndex: this.planetIndex,
      regionIndex: this.regionIndex,
      planetName: this.currentPlanet.name,
      regionName: this.currentRegion.name,
    };
  }

  public hasNextRegion(): boolean {
    return this.findNextCampaignLocation(this.planetIndex, this.regionIndex) !== null;
  }

  public hasNextPlanet(): boolean {
    const next = this.findNextCampaignLocation(this.planetIndex, this.regionIndex);
    return next !== null && next.planetIndex !== this.planetIndex;
  }

  public advance(): ProgressionAdvance {
    const next = this.findNextCampaignLocation(this.planetIndex, this.regionIndex);
    if (!next) return 'complete';
    const changedPlanet = next.planetIndex !== this.planetIndex;
    this.planetIndex = next.planetIndex;
    this.regionIndex = next.regionIndex;
    return changedPlanet ? 'planet' : 'region';
  }

  public selectMap(mapId: string): RegionDefinition {
    for (let planetIndex = 0; planetIndex < this.definition.planets.length; planetIndex++) {
      const regionIndex = this.definition.planets[planetIndex].regions.findIndex((region) => region.mapId === mapId);
      if (regionIndex >= 0) {
        this.planetIndex = planetIndex;
        this.regionIndex = regionIndex;
        return this.currentRegion;
      }
    }
    throw new Error(`[Progression] unknown map '${mapId}'`);
  }

  public getRegionByMapId(mapId: string): RegionDefinition | null {
    for (const planet of this.definition.planets) {
      const region = planet.regions.find((candidate) => candidate.mapId === mapId);
      if (region) return region;
    }
    return null;
  }

  public getAllRegions(options: { campaignOnly?: boolean } = {}): Array<{ planet: PlanetDefinition; region: RegionDefinition }> {
    return this.definition.planets.flatMap((planet) => planet.regions
      .filter((region) => !options.campaignOnly || region.campaign !== false)
      .map((region) => ({ planet, region })));
  }

  private validate(definition: ProgressionDefinition): void {
    if (!definition.planets.length) throw new Error('[Progression] no planets found');
    for (const [type, enemy] of Object.entries(ENEMY_DEFINITIONS)) {
      if (!Number.isFinite(enemy.hp) || enemy.hp <= 0 || !Number.isFinite(enemy.speed) || enemy.speed < 0 ||
          !Number.isFinite(enemy.contactDamage) || enemy.contactDamage < 0 ||
          !Number.isFinite(enemy.contactDamageInterval) || enemy.contactDamageInterval <= 0) {
        throw new Error(`[Progression] invalid enemy '${type}'`);
      }
    }
    const mapIds = new Set<string>();
    for (const planet of definition.planets) {
      if (!planet.regions.length) throw new Error(`[Progression] planet '${planet.id}' has no regions`);
      for (const region of planet.regions) {
        if (mapIds.has(region.mapId)) throw new Error(`[Progression] duplicate map '${region.mapId}'`);
        mapIds.add(region.mapId);
        if (!Number.isFinite(region.spawnInterval) || region.spawnInterval <= 0 ||
            !Number.isFinite(region.spawnIntervalStep) ||
            !Number.isFinite(region.minimumSpawnInterval) || region.minimumSpawnInterval <= 0) {
          throw new Error(`[Progression] invalid spawn settings in region '${region.id}'`);
        }
        if (!region.waves.length) throw new Error(`[Progression] region '${region.id}' has no waves`);
        for (const wave of region.waves) {
          if (!Number.isInteger(wave.standard) || wave.standard < 0 || !Number.isInteger(wave.tanker) || wave.tanker < 0) {
            throw new Error(`[Progression] invalid wave in region '${region.id}'`);
          }
          if (wave.standard + wave.tanker === 0) throw new Error(`[Progression] empty wave in region '${region.id}'`);
        }
      }
    }
  }

  private findNextCampaignLocation(
    planetIndex: number,
    regionIndex: number,
  ): { planetIndex: number; regionIndex: number } | null {
    for (let candidatePlanet = planetIndex; candidatePlanet < this.definition.planets.length; candidatePlanet++) {
      const startRegion = candidatePlanet === planetIndex ? regionIndex + 1 : 0;
      for (let candidateRegion = startRegion; candidateRegion < this.definition.planets[candidatePlanet].regions.length; candidateRegion++) {
        if (this.definition.planets[candidatePlanet].regions[candidateRegion].campaign !== false) {
          return { planetIndex: candidatePlanet, regionIndex: candidateRegion };
        }
      }
    }
    return null;
  }
}
