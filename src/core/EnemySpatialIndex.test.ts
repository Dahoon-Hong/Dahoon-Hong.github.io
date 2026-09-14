import { describe, expect, it } from 'vitest';
import { EnemySpatialIndex } from './EnemySpatialIndex';
import { EnemyDefinition, StandardEnemy } from '../entities/Enemy';

const definition: EnemyDefinition = {
  spawnWeight: 1,
  spawnInterval: 0.6,
  spawnBatchSize: 5,
  hp: 45,
  armor: 0,
  speed: 95,
  radius: 12,
  reward: 10,
  typeName: 'Standard',
  contactDamage: 10,
  contactDamageInterval: 0.2,
};

describe('EnemySpatialIndex', () => {
  it('returns nearby enemies across adjacent buckets and excludes distant enemies', () => {
    const index = new EnemySpatialIndex(72);
    const center = new StandardEnemy(72, 72, definition);
    const nearby = new StandardEnemy(112, 72, definition);
    const distant = new StandardEnemy(288, 72, definition);

    index.build([center, nearby, distant]);

    expect(index.query(center, 8)).toEqual([nearby]);
  });

  it('excludes dead enemies and caps the nearest result count', () => {
    const index = new EnemySpatialIndex(72);
    const center = new StandardEnemy(72, 72, definition);
    const first = new StandardEnemy(84, 72, definition);
    const second = new StandardEnemy(96, 72, definition);
    const third = new StandardEnemy(108, 72, definition);
    const dead = new StandardEnemy(80, 72, definition);
    dead.takeDamage(dead.maxHp);

    index.build([center, first, second, third, dead]);

    expect(index.query(center, 1)).toEqual([first]);
    expect(index.query(center, 2)).toEqual([first, second]);
    expect(index.query(center, 8)).not.toContain(dead);
  });

  it('resets buckets when a new enemy set is built', () => {
    const index = new EnemySpatialIndex(72);
    const first = new StandardEnemy(72, 72, definition);
    const second = new StandardEnemy(84, 72, definition);

    index.build([first, second]);
    index.build([first]);

    expect(index.query(first, 8)).toEqual([]);
  });

  it('returns enemies in a target circle and an expanded projectile segment', () => {
    const index = new EnemySpatialIndex(72);
    const inCircle = new StandardEnemy(120, 72, definition);
    const inSegment = new StandardEnemy(190, 90, definition);
    const outside = new StandardEnemy(400, 400, definition);
    index.build([inCircle, inSegment, outside]);

    expect(index.queryCircle({ x: 72, y: 72 }, 60)).toEqual([inCircle]);
    expect(index.querySegment({ x: 0, y: 72 }, { x: 220, y: 72 }, 24)).toEqual([inCircle, inSegment]);
  });
});
