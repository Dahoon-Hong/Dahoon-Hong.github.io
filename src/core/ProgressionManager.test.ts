import { describe, expect, it } from 'vitest';
import { ProgressionManager, validateEnemyData } from './ProgressionManager';

const definition = {
  hp: 10,
  speed: 20,
  radius: 6,
  reward: 1,
  typeName: 'Example',
  contactDamage: 1,
  contactDamageInterval: 0.2,
};

const spawn = {
  baseBatchSize: 1,
  batchSizePerThreat: 0,
  maxBatchSize: 3,
  intervalStep: 0,
  minimumInterval: 0.25,
};

const validData = { spawn, standard: definition, tanker: definition };

describe('enemy data contract', () => {
  it('exposes spawn policy separately from enemy definitions', () => {
    const progression = new ProgressionManager();

    expect(progression.enemySpawnPolicy).toEqual({
      baseBatchSize: 1,
      batchSizePerThreat: 0,
      maxBatchSize: 3,
      intervalStep: 0,
      minimumInterval: 0.25,
    });
    expect(Object.keys(progression.enemyDefinitions)).toEqual(['standard', 'tanker']);
  });

  it('rejects malformed or out-of-range spawn policy fields', () => {
    expect(() => validateEnemyData({ standard: definition, tanker: definition })).toThrow('enemyData.spawn');
    expect(() => validateEnemyData({ ...validData, spawn: { ...spawn, baseBatchSize: 1.5 } })).toThrow('baseBatchSize');
    expect(() => validateEnemyData({ ...validData, spawn: { ...spawn, batchSizePerThreat: -1 } })).toThrow('batchSizePerThreat');
    expect(() => validateEnemyData({ ...validData, spawn: { ...spawn, maxBatchSize: 0 } })).toThrow('maxBatchSize');
    expect(() => validateEnemyData({ ...validData, spawn: { ...spawn, maxBatchSize: 1 } })).not.toThrow();
    expect(() => validateEnemyData({ ...validData, spawn: { ...spawn, intervalStep: NaN } })).toThrow('intervalStep');
    expect(() => validateEnemyData({ ...validData, spawn: { ...spawn, intervalStep: -0.1 } })).not.toThrow();
    expect(() => validateEnemyData({ ...validData, spawn: { ...spawn, minimumInterval: 0 } })).toThrow('minimumInterval');
    expect(() => validateEnemyData({ ...validData, spawn: { ...spawn, baseBatchSize: 2, maxBatchSize: 1 } })).toThrow('maxBatchSize');
  });
});
