import { describe, expect, it } from 'vitest';
import type { EnemyDefinition } from '../entities/Enemy';
import {
  calculateOutputMultiplier,
  calculateThreatMultiplier,
  parseThreatConfig,
  scaleIntegerThreatValue,
  ThreatConfig,
  ThreatManager,
} from './ThreatManager';

const config: ThreatConfig = {
  version: 1,
  time: {
    stepSeconds: 1,
    initialMultiplier: 1,
    growthMultiplier: 2,
    minThreatMultiplier: 0,
    maxThreatMultiplier: 3,
  },
  outputs: {
    spawnBatch: {
      threatWeight: 1,
      minMultiplier: 0.5,
      maxMultiplier: 3,
      minValue: 1,
      maxValue: 20,
      rounding: 'nearest',
    },
    attack: {
      threatWeight: 1,
      minMultiplier: 0.25,
      maxMultiplier: 3,
    },
    targetKills: {
      threatWeight: 1,
      minMultiplier: 0.5,
      maxMultiplier: 3,
      minValue: 1,
      maxValue: 100,
      rounding: 'nearest',
    },
  },
  formula: {
    threatMode: 'multiplicative-exponential-time',
    outputMode: 'weighted-linear',
  },
};

const standardDefinition: EnemyDefinition = {
  spawnWeight: 1,
  spawnInterval: 1,
  spawnBatchSize: 2,
  hp: 10,
  speed: 20,
  radius: 6,
  reward: 1,
  typeName: 'Standard',
  contactDamage: 4,
  contactDamageInterval: 0.2,
};

describe('ThreatManager configuration', () => {
  it('loads the production config and rejects invalid ranges or formula modes', () => {
    expect(parseThreatConfig(config)).toEqual(config);
    expect(() => parseThreatConfig({
      ...config,
      time: { ...config.time, stepSeconds: 0 },
    })).toThrow(/stepSeconds/);
    expect(() => parseThreatConfig({
      ...config,
      time: { ...config.time, initialMultiplier: 0 },
    })).toThrow(/initialMultiplier/);
    expect(() => parseThreatConfig({
      ...config,
      outputs: {
        ...config.outputs,
        attack: { ...config.outputs.attack, minMultiplier: 2, maxMultiplier: 1 },
      },
    })).toThrow(/minMultiplier/);
    expect(() => parseThreatConfig({
      ...config,
      formula: { ...config.formula, outputMode: 'script' },
    })).toThrow(/outputMode/);
  });
});

describe('ThreatManager', () => {
  it('combines map, difficulty, and exponential stage time in order', () => {
    expect(calculateThreatMultiplier(1.2, 0.5, 0, config)).toBeCloseTo(0.6);
    expect(calculateThreatMultiplier(1.2, 0.5, 0.99, config)).toBeCloseTo(0.6);
    expect(calculateThreatMultiplier(1.2, 0.5, 1, config)).toBeCloseTo(1.2);
    expect(calculateThreatMultiplier(1.2, 0.5, 2, config)).toBeCloseTo(2.4);
  });

  it('ramps the shared threat from a low start to the current baseline in five minutes', () => {
    const rampConfig: ThreatConfig = {
      ...config,
      time: {
        ...config.time,
        stepSeconds: 60,
        initialMultiplier: 0.25,
        growthMultiplier: 1.32,
      },
      outputs: {
        ...config.outputs,
        spawnBatch: { ...config.outputs.spawnBatch, minMultiplier: 0.25 },
      },
    };
    const manager = new ThreatManager(1, 1, rampConfig);

    expect(calculateThreatMultiplier(1, 1, 0, rampConfig)).toBeCloseTo(0.25);
    expect(calculateThreatMultiplier(1, 1, 300, rampConfig)).toBeCloseTo(1, 2);
    expect(calculateThreatMultiplier(1, 1, 360, rampConfig)).toBeGreaterThan(1);
    expect(manager.getSpawnBatch(20, { spawnWeight: 2, spawnBatchSize: 5 })).toBe(1);

    manager.advance(300);
    expect(manager.getSpawnBatch(20, { spawnWeight: 2, spawnBatchSize: 5 })).toBe(5);

    manager.advance(60);
    expect(manager.getSpawnBatch(20, { spawnWeight: 2, spawnBatchSize: 5 })).toBeGreaterThan(5);
  });

  it('advances at exact boundaries and resets the Stage timer', () => {
    const manager = new ThreatManager(1, 1, config);

    expect(manager.getSnapshot()).toMatchObject({
      stageElapsedSeconds: 0,
      timeIndex: 0,
      threatMultiplier: 1,
    });
    manager.advance(0.99);
    expect(manager.getSnapshot().timeIndex).toBe(0);
    manager.advance(0.01);
    expect(manager.getSnapshot().timeIndex).toBe(1);
    manager.advance(2);
    expect(manager.getSnapshot().timeIndex).toBe(3);
    manager.reset();
    expect(manager.getSnapshot().stageElapsedSeconds).toBe(0);
    expect(manager.getSnapshot().timeIndex).toBe(0);
  });

  it('applies weighted output ranges and integer rounding rules', () => {
    expect(calculateOutputMultiplier(0.5, {
      threatWeight: 0,
      minMultiplier: 0.5,
      maxMultiplier: 3,
    })).toBe(1);
    expect(calculateOutputMultiplier(0.5, {
      threatWeight: 1,
      minMultiplier: 0.75,
      maxMultiplier: 3,
    })).toBe(0.75);
    expect(calculateOutputMultiplier(8, {
      threatWeight: 1,
      minMultiplier: 0.5,
      maxMultiplier: 3,
    })).toBe(3);
    expect(scaleIntegerThreatValue(3, 1.5, {
      threatWeight: 1,
      minMultiplier: 0.5,
      maxMultiplier: 3,
      minValue: 1,
      maxValue: 20,
      rounding: 'nearest',
    })).toBe(5);
    expect(scaleIntegerThreatValue(1, 0.1, config.outputs.spawnBatch)).toBe(1);
  });

  it('scales batch, target, and contact damage without mutating definitions', () => {
    const manager = new ThreatManager(1.5, 1, config);

    expect(manager.getSpawnBatch(2, standardDefinition)).toBe(3);
    expect(manager.getTargetKills(3)).toBe(5);
    const scaledDefinition = manager.getScaledEnemyDefinition(standardDefinition);

    expect(scaledDefinition.contactDamage).toBe(6);
    expect(scaledDefinition.contactDamageInterval).toBe(standardDefinition.contactDamageInterval);
    expect(standardDefinition.contactDamage).toBe(4);
  });

  it('clamps overflow to the configured maximum and ignores invalid delta', () => {
    const overflowConfig: ThreatConfig = {
      ...config,
      time: { ...config.time, growthMultiplier: Number.MAX_VALUE },
    };
    const manager = new ThreatManager(1, 1, overflowConfig);

    manager.advance(Number.NaN);
    expect(manager.getSnapshot().stageElapsedSeconds).toBe(0);
    manager.advance(1);
    const snapshot = manager.getSnapshot();
    expect(snapshot.threatMultiplier).toBe(3);
    expect(Number.isFinite(snapshot.threatMultiplier)).toBe(true);
    expect(() => new ThreatManager(Number.NaN, 1, config)).toThrow(/mapBaseMultiplier/);
    expect(() => new ThreatManager(1, 0, config)).toThrow(/difficultyMultiplier/);
  });
});
