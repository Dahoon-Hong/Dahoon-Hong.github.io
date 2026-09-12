export interface TouchJoystickState {
  base: { x: number; y: number };
  knob: { x: number; y: number };
  radius: number;
}

interface TouchJoystickConfig {
  width: number;
  height: number;
  gameplayWidth: number;
  top: number;
  isActive: () => boolean;
}

interface TouchJoystickRuntime extends TouchJoystickState {
  pointerId: number;
  vector: { x: number; y: number };
}

const TOUCH_JOYSTICK_RADIUS = 64;

export class InputManager {
  private keys: Set<string> = new Set();
  private touchJoystick: TouchJoystickRuntime | null = null;
  public pauseRequested = false;
  public debugOverlayRequested = false;
  public lastKeyCode: string | null = null;
  public lastKeyAt: number | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      this.lastKeyCode = e.code;
      this.lastKeyAt = performance.now();
      if (!e.repeat && (e.code === 'Space' || e.code === 'KeyP')) {
        this.pauseRequested = true;
      }
      if (!e.repeat && e.code === 'F3') this.debugOverlayRequested = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  public setupTouchJoystick(canvas: HTMLCanvasElement, config: TouchJoystickConfig): void {
    const toCanvasPoint = (event: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (config.width / rect.width),
        y: (event.clientY - rect.top) * (config.height / rect.height),
      };
    };

    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || this.touchJoystick || !config.isActive()) return;
      const point = toCanvasPoint(event);
      if (point.x >= config.gameplayWidth || point.y < config.top) return;

      this.touchJoystick = {
        pointerId: event.pointerId,
        base: point,
        knob: point,
        radius: TOUCH_JOYSTICK_RADIUS,
        vector: { x: 0, y: 0 },
      };
      canvas.setPointerCapture?.(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!this.touchJoystick || event.pointerId !== this.touchJoystick.pointerId) return;
      if (!config.isActive()) {
        this.clearTouchJoystick(canvas);
        return;
      }

      const point = toCanvasPoint(event);
      const deltaX = point.x - this.touchJoystick.base.x;
      const deltaY = point.y - this.touchJoystick.base.y;
      const distance = Math.hypot(deltaX, deltaY);
      const clampedDistance = Math.min(distance, this.touchJoystick.radius);
      const scale = distance === 0 ? 0 : clampedDistance / distance;
      this.touchJoystick.knob = {
        x: this.touchJoystick.base.x + deltaX * scale,
        y: this.touchJoystick.base.y + deltaY * scale,
      };
      const magnitude = this.touchJoystick.radius === 0 ? 0 : clampedDistance / this.touchJoystick.radius;
      this.touchJoystick.vector = {
        x: distance === 0 ? 0 : (deltaX / distance) * magnitude,
        y: distance === 0 ? 0 : (deltaY / distance) * magnitude,
      };
    });

    const releaseJoystick = (event: PointerEvent): void => {
      if (!this.touchJoystick || event.pointerId !== this.touchJoystick.pointerId) return;
      this.clearTouchJoystick(canvas);
    };
    canvas.addEventListener('pointerup', releaseJoystick);
    canvas.addEventListener('pointercancel', releaseJoystick);
  }

  public getMovementVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;

    if (this.touchJoystick) {
      x += this.touchJoystick.vector.x;
      y += this.touchJoystick.vector.y;
    }

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }

    return { x, y };
  }

  public getTouchJoystick(): TouchJoystickState | null {
    if (!this.touchJoystick) return null;
    return {
      base: { ...this.touchJoystick.base },
      knob: { ...this.touchJoystick.knob },
      radius: this.touchJoystick.radius,
    };
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
    this.touchJoystick = null;
    this.pauseRequested = false;
    this.debugOverlayRequested = false;
    this.lastKeyCode = null;
    this.lastKeyAt = null;
  }

  private clearTouchJoystick(canvas: HTMLCanvasElement): void {
    const pointerId = this.touchJoystick?.pointerId;
    this.touchJoystick = null;
    if (pointerId !== undefined && canvas.hasPointerCapture?.(pointerId)) {
      canvas.releasePointerCapture?.(pointerId);
    }
  }
}
