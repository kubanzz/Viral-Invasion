import { describe, expect, it } from 'vitest';
import { TouchActivationGuard } from '../../src/ui/touchActivation';

describe('touch activation through rebuilt camp buttons', () => {
  it('rejects the compatibility click on a replacement overview button, preserving its first toggle', () => {
    const guard = new TouchActivationGuard(), oldButton = { action: 'camp-view' }, replacement = { action: 'camp-view' };
    guard.handled(oldButton, 100);
    expect(guard.rejectsClick({ isTrusted: false, detail: 0 }, oldButton, 100)).toBe(false);
    expect(guard.rejectsClick({ isTrusted: true, detail: 1, pointerType: 'touch' }, replacement, 155)).toBe(true);
    expect(guard.rejectsClick({ isTrusted: true, detail: 1, pointerType: 'mouse', sourceCapabilities: { firesTouchEvents: true } }, replacement, 155)).toBe(true);
  });
  it('preserves mouse, keyboard, different actions and later gestures', () => {
    const guard = new TouchActivationGuard(), data = { action: 'camp-crop', plot: '0' };
    guard.handled(data, 100);
    expect(guard.rejectsClick({ isTrusted: true, detail: 1, pointerType: 'mouse' }, data, 130)).toBe(false);
    expect(guard.rejectsClick({ isTrusted: true, detail: 0, pointerType: '' }, data, 130)).toBe(false);
    expect(guard.rejectsClick({ isTrusted: true, detail: 1, pointerType: 'touch' }, { ...data, plot: '1' }, 130)).toBe(false);
    expect(guard.rejectsClick({ isTrusted: true, detail: 1, pointerType: 'touch' }, { action: 'camp-view' }, 130)).toBe(false);
    expect(guard.rejectsClick({ isTrusted: true, detail: 1, pointerType: 'touch' }, data, 900)).toBe(false);
    guard.handled(data, 910);
    expect(guard.rejectsClick({ isTrusted: false, detail: 0 }, data, 910)).toBe(false);
    guard.clear(); expect(guard.rejectsClick({ isTrusted: true, detail: 1, pointerType: 'touch' }, data, 920)).toBe(false);
  });
});
