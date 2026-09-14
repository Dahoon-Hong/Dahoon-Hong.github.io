import { describe, expect, it } from 'vitest';
import { ProgressionManager, validateEnemyData } from './ProgressionManager';

const definition = {
  spawnWeight: 1,
  spawnInterval: 0.6,
  spawnBatchSize: 2,
  hp: 10,
  speed: 20,
  radius: 6,
  reward: 1,
  typeName: 'Example',
  contactDamage: 1,
  contactDamageInterval: 0.2,
};

const validData = { spawn: 5, standard: definition, tanker: definition };

describe('enemy data contract', () => {
  it('exposes the base spawn and per-enemy spawn settings', () => {
    const progression = new ProgressionManager();

    expect(progression.baseEnemySpawn).toBe(20);
    expect(progression.enemyDefinitions.standard.spawnWeight).toBe(2);
    expect(progression.enemyDefinitions.standard.spawnInterval).toBe(0.6);
    expect(progression.enemyDefinitions.standard.spawnBatchSize).toBe(5);
    expect(Object.keys(progression.enemyDefinitions)).toEqual(['standard', 'tanker']);
  });

  it('rejects a missing or invalid base spawn', () => {
    expect(() => validateEnemyData({ standard: definition, tanker: definition })).toThrow('enemyData.spawn');
    expect(() => validateEnemyData({ ...validData, spawn: 1.5 })).toThrow('enemyData.spawn');
    expect(() => validateEnemyData({ ...validData, spawn: 0 })).toThrow('enemyData.spawn');
    expect(() => validateEnemyData({ ...validData, standard: { ...definition, armor: -1 } })).toThrow('armor');
  });

  it('accepts zero weight to disable one enemy type', () => {
    expect(() => validateEnemyData({
      ...validData,
      standard: { ...definition, spawnWeight: 0 },
    })).not.toThrow();
  });

  it('rejects invalid per-enemy spawn settings', () => {
    expect(() => validateEnemyData({ ...validData, standard: { ...definition, spawnWeight: -1 } })).toThrow('spawnWeight');
    expect(() => validateEnemyData({ ...validData, standard: { ...definition, spawnWeight: NaN } })).toThrow('spawnWeight');
    expect(() => validateEnemyData({ ...validData, standard: { ...definition, spawnInterval: 0 } })).toThrow('spawnInterval');
    expect(() => validateEnemyData({ ...validData, standard: { ...definition, spawnBatchSize: 0 } })).toThrow('spawnBatchSize');
    expect(() => validateEnemyData({ ...validData, standard: { ...definition, spawnBatchSize: 1.5 } })).toThrow('spawnBatchSize');
    expect(() => validateEnemyData({
      ...validData,
      standard: { ...definition, spawnWeight: 0 },
      tanker: { ...definition, spawnWeight: 0 },
    })).toThrow('at least one spawnWeight');
  });
});
