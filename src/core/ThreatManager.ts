import threatData from '../data/threat.json';
import type { EnemyDefinition } from '../entities/Enemy';
import { calculateEnemySpawnCount } from './WaveManager';

export type ThreatRounding = 'nearest' | 'floor' | 'ceil';
export type ThreatMode = 'multiplicative-exponential-time';
export type ThreatOutputMode = 'weighted-linear';

export interface ThreatOutputConfig {
  threatWeight: number;
  minMultiplier: number;
  maxMultiplier: number;
}

export interface ThreatIntegerOutputConfig extends ThreatOutputConfig {
  minValue: number;
  maxValue: number;
  rounding: ThreatRounding;
}

export interface ThreatConfig {
  version: number;
  time: {
    stepSeconds: number;
    initialMultiplier: number;
    growthMultiplier: number;
    minThreatMultiplier: number;
    maxThreatMultiplier: number;
  };
  outputs: {
    spawnBatch: ThreatIntegerOutputConfig;
    attack: ThreatOutputConfig;
    targetKills: ThreatIntegerOutputConfig;
  };
  formula: {
    threatMode: ThreatMode;
    outputMode: ThreatOutputMode;
  };
}

export interface ThreatSnapshot {
  stageElapsedSeconds: number;
  timeIndex: number;
  threatMultiplier: number;
  spawnBatchMultiplier: number;
  attackMultiplier: number;
  targetKillsMultiplier: number;
}

export interface ThreatProvider {
  getSnapshot(): ThreatSnapshot;
  getSpawnBatch(
    baseEnemySpawn: number,
    definition: Pick<EnemyDefinition, 'spawnWeight' | 'spawnBatchSize'>,
  ): number;
  getScaledEnemyDefinition(definition: EnemyDefinition): EnemyDefinition;
  getTargetKills(baseTargetKills: number): number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(path: string, message: string): never {
  throw new Error('[Threat] ' + path + ': ' + message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(path, 'expected an object');
  return value;
}

function finiteNumber(value: unknown, path: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    invalid(path, 'expected a finite number >= ' + minimum);
  }
  return value;
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    invalid(path, 'expected a finite number > 0');
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    invalid(path, 'expected a finite integer >= 1');
  }
  return value;
}

function rounding(value: unknown, path: string): ThreatRounding {
  if (value !== 'nearest' && value !== 'floor' && value !== 'ceil') {
    invalid(path, "must be 'nearest', 'floor', or 'ceil'");
  }
  return value;
}

function outputConfig(value: unknown, path: string): ThreatOutputConfig {
  const source = record(value, path);
  const threatWeight = finiteNumber(source.threatWeight, path + '.threatWeight', 0);
  const minMultiplier = positiveNumber(source.minMultiplier, path + '.minMultiplier');
  const maxMultiplier = positiveNumber(source.maxMultiplier, path + '.maxMultiplier');
  if (minMultiplier > maxMultiplier) {
    invalid(path, 'minMultiplier must not exceed maxMultiplier');
  }
  return { threatWeight, minMultiplier, maxMultiplier };
}

function integerOutputConfig(value: unknown, path: string): ThreatIntegerOutputConfig {
  const source = record(value, path);
  const base = outputConfig(value, path);
  const minValue = positiveInteger(source.minValue, path + '.minValue');
  const maxValue = positiveInteger(source.maxValue, path + '.maxValue');
  if (minValue > maxValue) invalid(path, 'minValue must not exceed maxValue');
  return { ...base, minValue, maxValue, rounding: rounding(source.rounding, path + '.rounding') };
}

export function parseThreatConfig(value: unknown): ThreatConfig {
  const source = record(value, 'threat');
  const version = positiveInteger(source.version, 'threat.version');
  if (version !== 1) invalid('threat.version', 'unsupported version ' + version);

  const time = record(source.time, 'threat.time');
  const stepSeconds = positiveNumber(time.stepSeconds, 'threat.time.stepSeconds');
  const initialMultiplier = positiveNumber(time.initialMultiplier, 'threat.time.initialMultiplier');
  const growthMultiplier = finiteNumber(time.growthMultiplier, 'threat.time.growthMultiplier', 1);
  const minThreatMultiplier = finiteNumber(time.minThreatMultiplier, 'threat.time.minThreatMultiplier', 0);
  const maxThreatMultiplier = finiteNumber(time.maxThreatMultiplier, 'threat.time.maxThreatMultiplier', 0);
  if (minThreatMultiplier > maxThreatMultiplier) {
    invalid('threat.time', 'minThreatMultiplier must not exceed maxThreatMultiplier');
  }

  const outputs = record(source.outputs, 'threat.outputs');
  const spawnBatch = integerOutputConfig(outputs.spawnBatch, 'threat.outputs.spawnBatch');
  const attack = outputConfig(outputs.attack, 'threat.outputs.attack');
  const targetKills = integerOutputConfig(outputs.targetKills, 'threat.outputs.targetKills');

  const formula = record(source.formula, 'threat.formula');
  if (formula.threatMode !== 'multiplicative-exponential-time') {
    invalid('threat.formula.threatMode', "unsupported mode; expected 'multiplicative-exponential-time'");
  }
  if (formula.outputMode !== 'weighted-linear') {
    invalid('threat.formula.outputMode', "unsupported mode; expected 'weighted-linear'");
  }

  return {
    version,
    time: { stepSeconds, initialMultiplier, growthMultiplier, minThreatMultiplier, maxThreatMultiplier },
    outputs: { spawnBatch, attack, targetKills },
    formula: {
      threatMode: 'multiplicative-exponential-time',
      outputMode: 'weighted-linear',
    },
  };
}

export const THREAT_CONFIG = parseThreatConfig(threatData);

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateThreatMultiplier(
  mapBaseMultiplier: number,
  difficultyMultiplier: number,
  stageElapsedSeconds: number,
  config: ThreatConfig,
): number {
  if (!Number.isFinite(mapBaseMultiplier) || mapBaseMultiplier <= 0) {
    invalid('mapBaseMultiplier', 'expected a finite number > 0');
  }
  if (!Number.isFinite(difficultyMultiplier) || difficultyMultiplier <= 0) {
    invalid('difficultyMultiplier', 'expected a finite number > 0');
  }
  if (!Number.isFinite(stageElapsedSeconds) || stageElapsedSeconds < 0) {
    invalid('stageElapsedSeconds', 'expected a finite number >= 0');
  }

  const timeIndex = Math.floor(stageElapsedSeconds / config.time.stepSeconds);
  const timeMultiplier = config.time.initialMultiplier * Math.pow(config.time.growthMultiplier, timeIndex);
  const combined = mapBaseMultiplier * difficultyMultiplier * timeMultiplier;
  return clamp(
    Number.isFinite(combined) ? combined : config.time.maxThreatMultiplier,
    config.time.minThreatMultiplier,
    config.time.maxThreatMultiplier,
  );
}

export function calculateOutputMultiplier(
  threatMultiplier: number,
  output: ThreatOutputConfig,
): number {
  const combined = 1 + output.threatWeight * (threatMultiplier - 1);
  return clamp(
    Number.isFinite(combined) ? combined : output.maxMultiplier,
    output.minMultiplier,
    output.maxMultiplier,
  );
}

export function roundThreatValue(value: number, mode: ThreatRounding): number {
  if (mode === 'floor') return Math.floor(value);
  if (mode === 'ceil') return Math.ceil(value);
  return Math.round(value);
}

export function scaleIntegerThreatValue(
  baseValue: number,
  multiplier: number,
  output: ThreatIntegerOutputConfig,
): number {
  if (!Number.isFinite(baseValue) || baseValue <= 0) return 0;
  const scaled = baseValue * multiplier;
  const rounded = Number.isFinite(scaled)
    ? roundThreatValue(scaled, output.rounding)
    : output.maxValue;
  return clamp(rounded, output.minValue, output.maxValue);
}

export class ThreatManager implements ThreatProvider {
  private readonly mapBaseMultiplier: number;
  private readonly difficultyMultiplier: number;
  private readonly config: ThreatConfig;
  private elapsed = 0;

  public constructor(
    mapBaseMultiplier: number,
    difficultyMultiplier: number,
    config: ThreatConfig = THREAT_CONFIG,
  ) {
    if (!Number.isFinite(mapBaseMultiplier) || mapBaseMultiplier <= 0) {
      invalid('mapBaseMultiplier', 'expected a finite number > 0');
    }
    if (!Number.isFinite(difficultyMultiplier) || difficultyMultiplier <= 0) {
      invalid('difficultyMultiplier', 'expected a finite number > 0');
    }
    this.mapBaseMultiplier = mapBaseMultiplier;
    this.difficultyMultiplier = difficultyMultiplier;
    this.config = parseThreatConfig(config);
  }

  public get stageElapsedSeconds(): number {
    return this.elapsed;
  }

  public advance(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const nextElapsed = this.elapsed + dt;
    this.elapsed = Number.isFinite(nextElapsed) ? nextElapsed : Number.MAX_SAFE_INTEGER;
  }

  public reset(): void {
    this.elapsed = 0;
  }

  public getSnapshot(): ThreatSnapshot {
    const timeIndex = Math.floor(this.elapsed / this.config.time.stepSeconds);
    const threatMultiplier = calculateThreatMultiplier(
      this.mapBaseMultiplier,
      this.difficultyMultiplier,
      this.elapsed,
      this.config,
    );
    return {
      stageElapsedSeconds: this.elapsed,
      timeIndex,
      threatMultiplier,
      spawnBatchMultiplier: calculateOutputMultiplier(threatMultiplier, this.config.outputs.spawnBatch),
      attackMultiplier: calculateOutputMultiplier(threatMultiplier, this.config.outputs.attack),
      targetKillsMultiplier: calculateOutputMultiplier(threatMultiplier, this.config.outputs.targetKills),
    };
  }

  public getSpawnBatch(
    baseEnemySpawn: number,
    definition: Pick<EnemyDefinition, 'spawnWeight' | 'spawnBatchSize'>,
  ): number {
    const baseBatch = calculateEnemySpawnCount(baseEnemySpawn, definition);
    if (baseBatch === 0) return 0;
    return scaleIntegerThreatValue(baseBatch, this.getSnapshot().spawnBatchMultiplier, this.config.outputs.spawnBatch);
  }

  public getScaledEnemyDefinition(definition: EnemyDefinition): EnemyDefinition {
    const scaledContactDamage = definition.contactDamage * this.getSnapshot().attackMultiplier;
    return {
      ...definition,
      contactDamage: Number.isFinite(scaledContactDamage)
        ? Math.max(0, scaledContactDamage)
        : Number.MAX_SAFE_INTEGER,
    };
  }

  public getTargetKills(baseTargetKills: number): number {
    return scaleIntegerThreatValue(
      baseTargetKills,
      this.getSnapshot().targetKillsMultiplier,
      this.config.outputs.targetKills,
    );
  }
}
