export interface GameTestSnapshot {
  screen: string;
  gameState: string;
  wave: number;
  totalWaveEnemies: number;
  spawnedEnemies: number;
  liveEnemies: number;
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
  timestamp: number;
}

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

  public update(snapshot: GameTestSnapshot): void {
    if (!this.element) return;
    this.element.textContent = JSON.stringify(snapshot, null, 2);
  }
}
