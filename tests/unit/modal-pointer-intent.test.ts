import { describe, expect, it } from 'vitest';
import { ModalPointerIntent } from '../../src/ui/modalPointerIntent';

describe('modal pointer ownership across compatibility click IDs', () => {
  it.each([[0, 1], [1, 0], [4, undefined]])('accepts an actual same-button press with down %s / click %s and consumes it', (downId, clickId) => {
    const intent = new ModalPointerIntent(), button = new EventTarget();
    intent.pointerDown(downId, button, downId === 0 ? 'touch' : 'mouse'); intent.pointerUp(downId, button);
    expect(intent.acceptsClick({ detail: 1, pointerId: clickId, pointerType: 'mouse' }, button, true)).toBe(true);
    expect(intent.acceptsClick({ detail: 1, pointerId: clickId, pointerType: 'mouse' }, button, true)).toBe(false);
  });
  it.each([[0, 1], [1, 0]])('does not turn down %s / click %s on a canvas or old draft into a new modal submission', (downId, clickId) => {
    const intent = new ModalPointerIntent(), oldButton = new EventTarget(), newButton = new EventTarget();
    intent.pointerDown(downId, null, 'touch'); intent.pointerUp(downId, newButton);
    expect(intent.acceptsClick({ detail: 1, pointerId: clickId, pointerType: 'mouse' }, newButton, true)).toBe(false);
    intent.pointerDown(downId, oldButton, 'touch'); intent.pointerUp(downId, newButton);
    expect(intent.acceptsClick({ detail: 1, pointerId: clickId, pointerType: 'mouse' }, newButton, true)).toBe(false);
  });
  it('rejects a cancelled press and preserves keyboard or assistive activation', () => {
    const intent = new ModalPointerIntent(), button = new EventTarget();
    intent.pointerDown(0, button); intent.pointerCancel(0);
    expect(intent.acceptsClick({ detail: 1, pointerId: 1 }, button, true)).toBe(false);
    expect(intent.acceptsClick({ detail: 0, pointerId: -1 }, button, true)).toBe(true);
  });
  it.each([[0, 1], [1, 0]])('does not borrow held button contact %s for old canvas contact %s release', (canvasId, buttonId) => {
    const intent = new ModalPointerIntent(), button = new EventTarget();
    intent.pointerDown(canvasId, null, 'touch'); intent.pointerDown(buttonId, button, 'touch');
    intent.pointerUp(canvasId, null);
    expect(intent.acceptsClick({ detail: 1, pointerId: buttonId, pointerType: 'mouse' }, button, true)).toBe(false);
    intent.pointerUp(buttonId, button);
    expect(intent.acceptsClick({ detail: 1, pointerId: buttonId, pointerType: 'mouse' }, button, true)).toBe(true);
  });
  it('does not alias unrelated positive mouse IDs even for a completed button', () => {
    const intent = new ModalPointerIntent(), button = new EventTarget();
    intent.pointerDown(5, button, 'mouse'); intent.pointerUp(5, button);
    expect(intent.acceptsClick({ detail: 1, pointerId: 8, pointerType: 'mouse' }, button, true)).toBe(false);
    expect(intent.acceptsClick({ detail: 1, pointerId: 5, pointerType: 'mouse' }, button, true)).toBe(true);
  });
  it('also removes a completed contact when the browser later cancels it', () => {
    const intent = new ModalPointerIntent(), button = new EventTarget();
    intent.pointerDown(0, button, 'touch'); intent.pointerUp(0, button); intent.pointerCancel(0);
    expect(intent.acceptsClick({ detail: 1, pointerId: 1, pointerType: 'mouse' }, button, true)).toBe(false);
  });
});
