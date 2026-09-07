export class InputManager {
  private keys: Set<string> = new Set();
  public pauseRequested = false;
  public debugOverlayRequested = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!e.repeat && (e.code === 'Space' || e.code === 'KeyP')) {
        this.pauseRequested = true;
      }
      if (!e.repeat && e.code === 'F3') this.debugOverlayRequested = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  public getMovementVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;

    if (x !== 0 && y !== 0) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
    }

    return { x, y };
  }

  public consumePauseRequest(): boolean {
    if (this.pauseRequested) {
      this.pauseRequested = false;
      return true;
    }
    return false;
  }

  public consumeDebugOverlayRequest(): boolean {
    if (!this.debugOverlayRequested) return false;
    this.debugOverlayRequested = false;
    return true;
  }

  public reset(): void {
    this.keys.clear();
    this.pauseRequested = false;
    this.debugOverlayRequested = false;
  }
}
