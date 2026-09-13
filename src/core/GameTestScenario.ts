export const GAME_TEST_SCENARIOS = [
  'production-wait-input',
  'production-buffer-full',
  'production-storage-full',
  'armory-install',
  'enemy-navigation',
  'terminal-game-over',
  'terminal-region',
] as const;

export type GameTestScenario = typeof GAME_TEST_SCENARIOS[number];

export function getGameTestScenario(): GameTestScenario | null {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return null;

  const params = new URLSearchParams(window.location.search);
  if (params.get('test') !== '1') return null;

  const scenario = params.get('scenario');
  return isGameTestScenario(scenario) ? scenario : null;
}

function isGameTestScenario(value: string | null): value is GameTestScenario {
  return value !== null && (GAME_TEST_SCENARIOS as readonly string[]).includes(value);
}
