import { describe, expect, it } from 'vitest';
import { resolveTouchLayout, type TouchLayoutInput } from '../../src/ui/responsiveLayout';

const mouse: TouchLayoutInput = { width: 1280, height: 720, coarsePointer: false, maxTouchPoints: 0 };

describe('responsive touch layout', () => {
  it('uses the compact layout at either inclusive viewport limit, even with a mouse', () => {
    expect(resolveTouchLayout({ ...mouse, width: 1024 })).toBe(true);
    expect(resolveTouchLayout({ ...mouse, height: 600 })).toBe(true);
    expect(resolveTouchLayout({ ...mouse, width: 1025, height: 601 })).toBe(false);
    expect(resolveTouchLayout({ ...mouse, width: 1024.5, height: 600.5 })).toBe(false);
  });

  it('distinguishes a real coarse touch surface from touch API exposure on a large mouse-driven display', () => {
    expect(resolveTouchLayout({ ...mouse, coarsePointer: true, maxTouchPoints: 5 })).toBe(true);
    expect(resolveTouchLayout({ ...mouse, maxTouchPoints: 5 })).toBe(false);
    expect(resolveTouchLayout({ ...mouse, coarsePointer: true })).toBe(false);
    for (const maxTouchPoints of [NaN, Infinity, -1]) expect(resolveTouchLayout({ ...mouse, coarsePointer: true, maxTouchPoints })).toBe(false);
  });

  it('re-evaluates repeated desktop-to-phone-to-desktop resizes and only explicit true forces touch', () => {
    const sizes = [{ width: 1280, height: 720 }, { width: 844, height: 390 }, { width: 1280, height: 720 }];
    for (let pass = 0; pass < 2; pass++) expect(sizes.map(size => resolveTouchLayout({ ...mouse, ...size }))).toEqual([false, true, false]);
    expect(resolveTouchLayout({ ...mouse, forceTouch: true })).toBe(true);
    expect(resolveTouchLayout({ ...mouse, forceTouch: false })).toBe(false);
    expect(resolveTouchLayout({ ...mouse, width: 844, forceTouch: false })).toBe(true);
  });

  it('keeps unmeasured or invalid viewports on desktop until valid measurements arrive', () => {
    for (const size of [{ width: 0, height: 0 }, { width: 0, height: 720 }, { width: 1280, height: -1 }, { width: Infinity, height: 720 }, { width: 1280, height: NaN }]) {
      expect(resolveTouchLayout({ ...mouse, ...size, coarsePointer: true, maxTouchPoints: 5 })).toBe(false);
      expect(resolveTouchLayout({ ...mouse, ...size, forceTouch: true })).toBe(true);
    }
    expect(resolveTouchLayout({ ...mouse, width: 844, height: 390 })).toBe(true);
  });
});
