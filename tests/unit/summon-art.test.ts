import { describe, expect, it } from 'vitest';
import artRuntime from '../../.art-generated/art-runtime.json';
import { EXPEDITION_ICON_IDS } from '../../src/render/expeditionArt';
import { fitSummonArtBounds, summonArtMarkup, type SummonArtAsset } from '../../src/ui/summonArt';

function visibleFit(asset: Required<SummonArtAsset>) {
  const fit = fitSummonArtBounds(asset), b = asset.visibleBounds;
  return { fit, centerX: fit.left + (b.x + b.width / 2) / asset.width * fit.width,
    centerY: fit.top + (b.y + b.height / 2) / asset.height * fit.height,
    visibleWidth: b.width / asset.width * fit.width,
    visibleHeight: b.height / asset.height * fit.height };
}

describe('summon art visible-bound fitting', () => {
  it('centers an offset held-weapon silhouette and preserves the nonsquare frame aspect', () => {
    const asset = { width: 225, height: 258, visibleBounds: { x: 86.03125, y: 97.03125, width: 121.34375, height: 133.375 } };
    const before = structuredClone(asset), result = visibleFit(asset);
    expect(result.fit.fitted).toBe(true);
    expect(result.centerX).toBeCloseTo(50, 10);
    expect(result.centerY).toBeCloseTo(50, 10);
    expect(Math.max(result.visibleWidth, result.visibleHeight)).toBeCloseTo(100, 10);
    expect(result.visibleWidth / result.visibleHeight).toBeCloseTo(asset.visibleBounds.width / asset.visibleBounds.height, 10);
    expect(result.fit.width / result.fit.height).toBeCloseTo(asset.width / asset.height, 10);
    expect(asset).toEqual(before);
  });

  it('fits a wide eye-shaped module by its width without stretching its visible shape', () => {
    const result = visibleFit({ width: 128, height: 128, visibleBounds: { x: 12, y: 32.5, width: 104, height: 63 } });
    expect(result.visibleWidth).toBeCloseTo(100, 10);
    expect(result.visibleHeight).toBeCloseTo(63 / 104 * 100, 10);
    expect(result.centerX).toBeCloseTo(50, 10);
    expect(result.centerY).toBeCloseTo(50, 10);
    expect(result.fit.width).toBeCloseTo(result.fit.height, 10);
  });

  it('keeps valid full-frame art centered and respects a nonsquare full-frame aspect', () => {
    expect(fitSummonArtBounds({ width: 100, height: 100, visibleBounds: { x: 0, y: 0, width: 100, height: 100 } }))
      .toEqual({ width: 100, height: 100, left: 0, top: 0, fitted: true });
    expect(fitSummonArtBounds({ width: 200, height: 100, visibleBounds: { x: 0, y: 0, width: 200, height: 100 } }))
      .toEqual({ width: 100, height: 50, left: 0, top: 25, fitted: true });
  });

  it('uses an unmodified full-frame fallback for missing, nonfinite, empty or out-of-frame bounds', () => {
    const valid = { width: 100, height: 100, visibleBounds: { x: 10, y: 10, width: 80, height: 80 } };
    const invalid: (SummonArtAsset | undefined | null)[] = [undefined, null, {}, { ...valid, width: 0 }, { ...valid, height: NaN },
      { width: 100, height: 100 }, { ...valid, visibleBounds: { x: -1, y: 0, width: 80, height: 80 } },
      { ...valid, visibleBounds: { x: 0, y: -1, width: 80, height: 80 } },
      { ...valid, visibleBounds: { x: 0, y: 0, width: 0, height: 80 } },
      { ...valid, visibleBounds: { x: 0, y: 0, width: 80, height: Infinity } },
      { ...valid, visibleBounds: { x: 21, y: 0, width: 80, height: 80 } },
      { ...valid, visibleBounds: { x: 0, y: 21, width: 80, height: 80 } },
      { ...valid, visibleBounds: { x: 0, y: 0, width: Number.MIN_VALUE, height: Number.MIN_VALUE } }];
    for (const asset of invalid) expect(fitSummonArtBounds(asset)).toEqual({ width: 100, height: 100, left: 0, top: 0, fitted: false });
  });

  it('prefers the selected hero atlas descriptor for each supported prize and teaser without CSS transforms', () => {
    const runtime = artRuntime as unknown as { assets: Record<string, Required<SummonArtAsset>> };
    for (const name of ['gold-antibody', 'forge-core', 'biomass', 'weapon-steady', 'weapon-piercing', 'module-PULSE_BREAK', 'module-PURIFY_CHAIN', 'module-IMMUNE_BEACON', 'module-EXPOSE_TRACE']) {
      const selectedName = `summon-hero-${name}`;
      const asset = runtime.assets[EXPEDITION_ICON_IDS[selectedName]];
      expect(asset, `selected atlas descriptor for ${name}`).toBeDefined();
      const result = visibleFit(asset), html = summonArtMarkup(name, 'summon-hero');
      expect(result.centerX).toBeCloseTo(50, 8);
      expect(result.centerY).toBeCloseTo(50, 8);
      expect(Math.max(result.visibleWidth, result.visibleHeight)).toBeCloseTo(100, 8);
      expect(html).toContain('class="summon-fitted-art summon-hero"');
      expect(html).toContain(`data-camp-art="${selectedName}"`);
      expect(html).toContain('position:absolute;width:');
      expect(html).not.toContain('transform');
    }
  });

  it('renders safe full-frame markup for unknown names and escapes attribute inputs', () => {
    expect(summonArtMarkup('missing-art')).toContain('width:100%;height:100%;left:0%;top:0%');
    const html = summonArtMarkup('bad"><img src=x>', 'hero" onclick="bad()');
    expect(html).toContain('data-camp-art="bad&quot;&gt;&lt;img src=x&gt;"');
    expect(html).toContain('hero&quot; onclick=&quot;bad()');
    expect(html).not.toContain('<img');
    expect(html).not.toContain(' onclick="bad()');
  });
});
