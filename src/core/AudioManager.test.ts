import { describe, expect, it } from 'vitest';
import { AudioManager } from './AudioManager';

describe('AudioManager volume controls', () => {
  it('cycles music volume in 20 percent steps', () => {
    const audio = new AudioManager();

    for (const expected of [0.6, 0.8, 1, 0, 0.2, 0.4]) {
      audio.cycleMusicVolume();
      expect(audio.getMusicVolume()).toBeCloseTo(expected);
    }
  });

  it('cycles SFX volume in 20 percent steps', () => {
    const audio = new AudioManager();

    for (const expected of [1, 0, 0.2, 0.4, 0.6, 0.8]) {
      audio.cycleSfxVolume();
      expect(audio.getSfxVolume()).toBeCloseTo(expected);
    }
  });
});
