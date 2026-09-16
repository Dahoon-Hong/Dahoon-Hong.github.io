import type { EnemyNavigationAgentSnapshot } from './EnemyNavigationCoordinator';

export interface GameTestResourceSnapshot {
  amount: number;
  capacity: number;
}

export interface GameTestProductionSnapshot {
  moduleId: string;
  input: string | null;
  output: string;
  progress: number;
  interval: number;
  bufferedOutput: number;
  outputCapacity: number;
  status: string;
}

export interface GameTestCombatModuleSnapshot {
  moduleId: string;
  weaponClass: string;
  loadedShots: number;
  magazineSize: number;
  reloading: boolean;
}

export interface GameTestCombatEnemySnapshot {
  enemyType: string;
  armor: number;
  hp: number;
  maxHp: number;
}

export interface GameTestSnapshot {
  screen: string;
  gameState: string;
  wave: number;
  targetKills: number;
  killedEnemies: number;
  stageTargetKills: number;
  stageKilledEnemies: number;
  spawnedEnemies: number;
  liveEnemies: number;
  spawnSkippedEnemies?: number;
  vehicleWorldX: number;
  vehicleWorldY: number;
  cameraX: number;
  cameraY: number;
  movementInputX: number;
  movementInputY: number;
  lastKeyCode: string | null;
  lastKeyAt: number | null;
  movementDistance: number;
  lastMovementInputX: number;
  lastMovementInputY: number;
  lastMovementAt: number | null;
  lastSpawnBatchSize: number;
  lastSpawnAt: number | null;
  lastSpawnTypes: readonly string[];
  lastSpawnSkippedCount?: number;
  lastSpawnSkipReason?: string | null;
  collisionMainMs?: number;
  collisionMainMsMax?: number;
  collisionMainMsP95?: number;
  collisionCandidatesTotal?: number;
  collisionCandidatesMax?: number;
  collisionPairsThisFrame?: number;
  collisionPushesThisFrame?: number;
  collisionBlockedPushesThisFrame?: number;
  ramContactsThisFrame?: number;
  ramDamageThisFrame?: number;
  ramDamageTotal?: number;
  ramMaxRelativeClosingSpeed?: number;
  frameDeltaMs?: number;
  frameDeltaMsMax?: number;
  frameOverBudgetCount?: number;
  pathSearchesThisFrame?: number;
  cacheHits?: number;
  deduplicatedRequests?: number;
  pendingRequests?: number;
  maxSearchesThisFrame?: number;
  localSteeringAgents?: number;
  engagedAgents?: number;
  stuckAgents?: number;
  pendingNavigationAgents?: number;
  oldestPendingRequestAge?: number;
  localSteeringTransitionsThisFrame?: number;
  visibleAgents?: number;
  visibleImmediateFollowTransitions?: number;
  visibleBlockedAgents?: number;
  navigationMainMs?: number;
  navigationMainMsMax?: number;
  workerEnabled?: boolean;
  workerDispatchesThisFrame?: number;
  workerJobsInFlight?: number;
  workerQueueDepth?: number;
  workerResultsThisFrame?: number;
  workerStaleResultsThisFrame?: number;
  workerFallbackCount?: number;
  oldestWorkerRequestAge?: number;
  neighborCandidatesTotal?: number;
  neighborCandidatesMax?: number;
  stoppedAgentsByReason?: Readonly<Record<string, number>>;
  enemyNavigationAgents?: readonly EnemyNavigationAgentSnapshot[];
  timestamp: number;
  scenario: string | null;
  resources: Record<string, GameTestResourceSnapshot>;
  production: readonly GameTestProductionSnapshot[];
  armoryStock: Record<string, number>;
  mapId?: string | null;
  vehicleArmor?: number;
  combatModules?: readonly GameTestCombatModuleSnapshot[];
  combatEnemies?: readonly GameTestCombatEnemySnapshot[];
  liveProjectiles?: number;
}

type LegacyGameTestSnapshot = Omit<GameTestSnapshot, 'scenario' | 'resources' | 'production' | 'armoryStock'>;

export function isGameTestRuntime(): boolean {
  return typeof window !== 'undefined'
    && import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('test') === '1';
}

export class GameTestObserver {
  private readonly element: HTMLPreElement | null;

  public constructor(enabled = isGameTestRuntime()) {
    if (!enabled || typeof document === 'undefined') {
      this.element = null;
      return;
    }

    const element = document.createElement('pre');
    element.dataset.testid = 'game-test-observer';
    element.setAttribute('aria-label', 'Game test observer');
    Object.assign(element.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '9999',
      margin: '0',
      padding: '8px',
      color: '#00ff9d',
      background: 'rgba(0, 0, 0, 0.86)',
      font: '12px/1.35 monospace',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    });
    document.body.appendChild(element);
    this.element = element;
  }

  public isEnabled(): boolean {
    return this.element !== null;
  }

  public update(snapshot: GameTestSnapshot | LegacyGameTestSnapshot): void {
    if (!this.element) return;
    this.element.textContent = JSON.stringify(snapshot, null, 2);
  }
}
