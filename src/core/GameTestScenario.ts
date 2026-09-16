import type { ThreatConfig } from './ThreatManager';

export const GAME_TEST_SCENARIOS = [
  'production-wait-input',
  'production-buffer-full',
  'production-storage-full',
  'armory-install',
  'modern-firearms',
  'modern-firearms-stress',
  'enemy-navigation',
  'enemy-navigation-fixtures',
  'enemy-navigation-worker',
  'enemy-collision-stress',
  'enemy-collision-spawn',
  'vehicle-ram',
  'threat-scaling',
  'terminal-game-over',
  'terminal-region',
] as const;

export type GameTestScenario = typeof GAME_TEST_SCENARIOS[number];

export const GAME_TEST_THREAT_CONFIG: ThreatConfig = {
  version: 1,
  time: {
    stepSeconds: 0.5,
    initialMultiplier: 0.25,
    growthMultiplier: 1.5,
    minThreatMultiplier: 0,
    maxThreatMultiplier: 4,
  },
  outputs: {
    spawnBatch: {
      threatWeight: 1,
      minMultiplier: 0.25,
      maxMultiplier: 4,
      minValue: 1,
      maxValue: 20,
      rounding: 'nearest',
    },
    attack: {
      threatWeight: 1,
      minMultiplier: 0.25,
      maxMultiplier: 4,
    },
    targetKills: {
      threatWeight: 1,
      minMultiplier: 0.5,
      maxMultiplier: 4,
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

export function getGameTestScenario(): GameTestScenario | null {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return null;

  const params = new URLSearchParams(window.location.search);
  if (params.get('test') !== '1') return null;

  const scenario = params.get('scenario');
  return isGameTestScenario(scenario) ? scenario : null;
}
export function getGameTestEnemyCount(defaultCount = 160): number {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return defaultCount;
  const rawCount = Number.parseInt(new URLSearchParams(window.location.search).get('count') ?? '', 10);
  if (!Number.isFinite(rawCount)) return defaultCount;
  return Math.min(640, Math.max(1, rawCount));
}


export function getGameTestWorkerEnabled(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return true;
  return new URLSearchParams(window.location.search).get('worker') !== 'off';
}

function isGameTestScenario(value: string | null): value is GameTestScenario {
  return value !== null && (GAME_TEST_SCENARIOS as readonly string[]).includes(value);
}
