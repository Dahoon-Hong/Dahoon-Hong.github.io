import progressionData from '../data/progression.json';
import { EnemyDefinition, EnemyType } from '../entities/Enemy';

export interface WaveDefinition {
  standard: number;
  tanker: number;
}

export interface RegionDefinition {
  id: string;
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
  enemies: Record<EnemyType, EnemyDefinition>;
  planets: PlanetDefinition[];
}

export type ProgressionAdvance = 'region' | 'planet' | 'complete';

const DEFINITION: ProgressionDefinition = progressionData;

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
    return this.definition.enemies;
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
    return this.regionIndex + 1 < this.currentPlanet.regions.length;
  }

  public hasNextPlanet(): boolean {
    return this.planetIndex + 1 < this.definition.planets.length;
  }

  public advance(): ProgressionAdvance {
    if (this.hasNextRegion()) {
      this.regionIndex++;
      return 'region';
    }
    if (this.hasNextPlanet()) {
      this.planetIndex++;
      this.regionIndex = 0;
      return 'planet';
    }
    return 'complete';
  }

  private validate(definition: ProgressionDefinition): void {
    if (!definition.planets.length) throw new Error('[Progression] no planets found');
    for (const [type, enemy] of Object.entries(definition.enemies)) {
      if (!Number.isFinite(enemy.hp) || enemy.hp <= 0 || !Number.isFinite(enemy.speed) || enemy.speed < 0 ||
          !Number.isFinite(enemy.contactDamage) || enemy.contactDamage < 0 ||
          !Number.isFinite(enemy.contactDamageInterval) || enemy.contactDamageInterval <= 0) {
        throw new Error(`[Progression] invalid enemy '${type}'`);
      }
    }
    for (const planet of definition.planets) {
      if (!planet.regions.length) throw new Error(`[Progression] planet '${planet.id}' has no regions`);
      for (const region of planet.regions) {
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
}
