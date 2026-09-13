import progressionData from '../data/progression.json';
import enemyData from '../data/enemies.json';
import { EnemyDefinition, EnemyType } from '../entities/Enemy';

export interface EnemyDataRoot {
  spawn: number;
  standard: EnemyDefinition;
  tanker: EnemyDefinition;
}

export interface WaveDefinition {
  targetKills: number;
}

export interface RegionDefinition {
  id: string;
  mapId: string;
  campaign?: boolean;
  name: string;
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
const ENEMY_TYPES: readonly EnemyType[] = ['standard', 'tanker'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidEnemyData(path: string, message: string): never {
  throw new Error(`[Progression] ${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalidEnemyData(path, 'expected an object');
  return value;
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    invalidEnemyData(path, 'expected a finite number > 0');
  }
  return value;
}

function nonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    invalidEnemyData(path, 'expected a finite number >= 0');
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    invalidEnemyData(path, 'expected a finite integer >= 1');
  }
  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalidEnemyData(path, 'expected a non-empty string');
  }
  return value;
}

function validateEnemyDefinition(value: unknown, type: EnemyType): asserts value is EnemyDefinition {
  const definition = record(value, `enemyData.${type}`);
  nonNegativeNumber(definition.spawnWeight, `enemyData.${type}.spawnWeight`);
  positiveNumber(definition.spawnInterval, `enemyData.${type}.spawnInterval`);
  positiveInteger(definition.spawnBatchSize, `enemyData.${type}.spawnBatchSize`);
  positiveNumber(definition.hp, `enemyData.${type}.hp`);
  nonNegativeNumber(definition.speed, `enemyData.${type}.speed`);
  positiveNumber(definition.radius, `enemyData.${type}.radius`);
  nonNegativeNumber(definition.reward, `enemyData.${type}.reward`);
  nonEmptyString(definition.typeName, `enemyData.${type}.typeName`);
  nonNegativeNumber(definition.contactDamage, `enemyData.${type}.contactDamage`);
  positiveNumber(definition.contactDamageInterval, `enemyData.${type}.contactDamageInterval`);
}

export function validateEnemyData(data: unknown): asserts data is EnemyDataRoot {
  const root = record(data, 'enemyData');
  positiveInteger(root.spawn, 'enemyData.spawn');
  const spawnWeights = ENEMY_TYPES.map((type) => {
    const definition = root[type];
    validateEnemyDefinition(definition, type);
    return (definition as EnemyDefinition).spawnWeight;
  });
  if (spawnWeights.every((weight) => weight === 0)) {
    invalidEnemyData('enemyData', 'at least one spawnWeight must be > 0');
  }
}

validateEnemyData(enemyData);
const ENEMY_DATA = enemyData;
const ENEMY_DEFINITIONS: Readonly<Record<EnemyType, EnemyDefinition>> = {
  standard: ENEMY_DATA.standard,
  tanker: ENEMY_DATA.tanker,
};

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

  public get baseEnemySpawn(): number {
    return ENEMY_DATA.spawn;
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
    const mapIds = new Set<string>();
    for (const planet of definition.planets) {
      if (!planet.regions.length) throw new Error(`[Progression] planet '${planet.id}' has no regions`);
      for (const region of planet.regions) {
        if (mapIds.has(region.mapId)) throw new Error(`[Progression] duplicate map '${region.mapId}'`);
        mapIds.add(region.mapId);
        if (!region.waves.length) throw new Error(`[Progression] region '${region.id}' has no waves`);
        for (const wave of region.waves) {
          if (!Number.isInteger(wave.targetKills) || wave.targetKills <= 0) {
            throw new Error(`[Progression] invalid wave in region '${region.id}'`);
          }
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
