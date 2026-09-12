import { afterEach, describe, expect, it } from 'vitest';
import { InputManager } from './InputManager';

type PointerListener = (event: PointerEvent) => void;

const originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;

function installFakeWindow(): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener: () => undefined },
  });
}

function makeCanvas(): { canvas: HTMLCanvasElement; emit: (type: string, event: Partial<PointerEvent>) => void } {
  const listeners = new Map<string, PointerListener[]>();
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    addEventListener: (type: string, listener: PointerListener) => {
      const typeListeners = listeners.get(type) ?? [];
      typeListeners.push(listener);
      listeners.set(type, typeListeners);
    },
    setPointerCapture: () => undefined,
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    emit: (type, event) => {
      for (const listener of listeners.get(type) ?? []) listener(event as PointerEvent);
    },
  };
}

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('InputManager touch joystick', () => {
  it('creates the joystick at the touch point, clamps its radius, and releases it', () => {
    installFakeWindow();
    const input = new InputManager();
    const { canvas, emit } = makeCanvas();
    input.setupTouchJoystick(canvas, {
      width: 1280,
      height: 720,
      gameplayWidth: 940,
      top: 50,
      isActive: () => true,
    });

    emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 200 });
    expect(input.getTouchJoystick()).toEqual({
      base: { x: 300, y: 200 },
      knob: { x: 300, y: 200 },
      radius: 64,
    });

    emit('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 200 });
    expect(input.getTouchJoystick()?.knob).toEqual({ x: 364, y: 200 });
    expect(input.getMovementVector()).toEqual({ x: 1, y: 0 });

    emit('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 200 });
    expect(input.getTouchJoystick()).toBeNull();
    expect(input.getMovementVector()).toEqual({ x: 0, y: 0 });
  });

  it('does not start inside the top bar or the right HUD panel', () => {
    installFakeWindow();
    const input = new InputManager();
    const { canvas, emit } = makeCanvas();
    input.setupTouchJoystick(canvas, {
      width: 1280,
      height: 720,
      gameplayWidth: 940,
      top: 50,
      isActive: () => true,
    });

    emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 20 });
    expect(input.getTouchJoystick()).toBeNull();
    emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 1000, clientY: 200 });
    expect(input.getTouchJoystick()).toBeNull();
  });
});
