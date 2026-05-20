import { describe, it, expect, beforeEach } from 'vitest';
import { Input } from '../lib/car/input.js';

function makeFakeCanvas() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    setPointerCapture() {},
    // _setDragScreen() calls this; return a sane rect so the math doesn't NaN.
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1080, height: 1920 };
    },
    dispatch(name, event) {
      const arr = handlers.get(name) || [];
      for (const fn of arr) fn(event);
    },
  };
}

describe('Input', () => {
  let canvas, input;
  beforeEach(() => {
    // Stub the window-level listeners that input.js attaches.
    globalThis.window = globalThis.window || {
      _handlers: new Map(),
      addEventListener(name, fn) {
        if (!this._handlers.has(name)) this._handlers.set(name, []);
        this._handlers.get(name).push(fn);
      },
    };
    canvas = makeFakeCanvas();
    input = new Input(canvas);
  });

  it('starts with zero steering', () => {
    input.update();
    expect(input._steering ?? 0).toBe(0);
  });

  it('produces positive steering on rightward drag', () => {
    canvas.dispatch('pointerdown', { clientX: 100, clientY: 200, pointerId: 1, pointerType: 'touch' });
    canvas.dispatch('pointermove', { clientX: 250, clientY: 200, pointerId: 1, pointerType: 'touch' });
    input.update();
    expect(input._steering).toBeGreaterThan(0.5);
  });

  it('clamps to ±1 at very large drags', () => {
    canvas.dispatch('pointerdown', { clientX: 100, clientY: 200, pointerId: 1, pointerType: 'touch' });
    canvas.dispatch('pointermove', { clientX: 9999, clientY: 200, pointerId: 1, pointerType: 'touch' });
    input.update();
    expect(input._steering).toBe(1);
  });

  it('resets steering on pointerup', () => {
    canvas.dispatch('pointerdown', { clientX: 100, clientY: 200, pointerId: 1, pointerType: 'touch' });
    canvas.dispatch('pointermove', { clientX: 250, clientY: 200, pointerId: 1, pointerType: 'touch' });
    input.update();
    canvas.dispatch('pointerup', { clientX: 250, clientY: 200, pointerId: 1, pointerType: 'touch' });
    expect(input._steering).toBe(0);
  });
});
