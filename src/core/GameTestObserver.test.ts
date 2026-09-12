import { describe, expect, it } from 'vitest';
import { GameTestObserver, isGameTestRuntime } from './GameTestObserver';

describe('GameTestObserver', () => {
  it('stays disabled outside the browser test runtime', () => {
    const observer = new GameTestObserver(false);

    expect(isGameTestRuntime()).toBe(false);
    expect(observer.isEnabled()).toBe(false);
    expect(() => observer.update({
      screen: 'START_MENU',
      gameState: 'PLAYING',
      wave: 1,
      totalWaveEnemies: 0,
      spawnedEnemies: 0,
      liveEnemies: 0,
      vehicleWorldX: 0,
      vehicleWorldY: 0,
      cameraX: 0,
      cameraY: 0,
      movementInputX: 0,
      movementInputY: 0,
      lastKeyCode: null,
      lastKeyAt: null,
      movementDistance: 0,
      lastMovementInputX: 0,
      lastMovementInputY: 0,
      lastMovementAt: null,
      lastSpawnBatchSize: 0,
      lastSpawnAt: null,
      lastSpawnTypes: [],
      timestamp: 0,
    })).not.toThrow();
  });
});
