import { describe, expect, it } from 'vitest';
import { EXPEDITION_ART_SPECS, EXPEDITION_ICON_IDS, expeditionIconStyles, sourceRegisteredSpriteFrame, type ExpeditionArtIdentity,
  type ExpeditionIconRuntime, type ExpeditionSpriteAsset } from '../../src/render/expeditionArt';

function clip(identity: ExpeditionArtIdentity, action: string, direction = 'fixed') {
  const count = (EXPEDITION_ART_SPECS[identity].clips as Record<string, number>)[action], group = `fantasy.expedition.${identity}.${direction}.${action}`;
  const assets: Record<string, ExpeditionSpriteAsset> = {};
  for (let index = 0; index < count; index++) assets[`${group}.${String(index).padStart(2, '0')}`] = {
    width: 512, height: 512, pivot: { x: .5, y: .85 }, visibleBounds: { x: 80, y: 80, width: 352, height: 356 },
    sourceSize: { width: 512, height: 512 }, sourceBounds: { x: 80, y: 80, width: 352, height: 356 },
    actorRegistration: { canvas: { width: 512, height: 512 }, foot: { x: 256, y: 435.2 }, commonCanvasScale: 1 },
    animation: { group, index, frameCount: count, fps: 5, approved: true },
  };
  return assets;
}
describe('registered expedition native frames', () => {
  it('keeps the approved logical canvas and sole through construction states', () => {
    const assets = clip('basePod', 'construction');
    const first = sourceRegisteredSpriteFrame(assets, 'basePod', 'construction', 0, { progress: 0 })!;
    const last = sourceRegisteredSpriteFrame(assets, 'basePod', 'construction', 0, { progress: 1 })!;
    expect(first.index).toBe(0); expect(last.index).toBe(2); expect(first.layout).toEqual(last.layout);
    expect(first.layout.width).toBe(128); expect(first.layout.originX).toBe(.5); expect(first.layout.originY).toBe(.85);
  });
  it('uses authored rear views and only mirrors the matching horizontal direction', () => {
    const assets = { ...clip('ritualPriest', 'channel', 'front_right'), ...clip('ritualPriest', 'channel', 'back_right') };
    const rear = sourceRegisteredSpriteFrame(assets, 'ritualPriest', 'channel', .2, { facing: -Math.PI / 2 })!;
    const rearLeft = sourceRegisteredSpriteFrame(assets, 'ritualPriest', 'channel', .2, { direction: 'back_left' })!;
    expect(rear.id).toContain('.back_right.'); expect(rear.flipX).toBe(false); expect(rearLeft.id).toBe(rear.id); expect(rearLeft.flipX).toBe(true);
    expect(sourceRegisteredSpriteFrame(assets, 'ritualPriest', 'channel', .2, { facing: Math.PI })!.id).toContain('.front_right.');
  });
  it('loops breathing states but clamps a fire one-shot to its final frame', () => {
    const assets = { ...clip('rapidPod', 'ready'), ...clip('rapidPod', 'fire') };
    expect(sourceRegisteredSpriteFrame(assets, 'rapidPod', 'ready', .4)!.index).toBe(0);
    expect(sourceRegisteredSpriteFrame(assets, 'rapidPod', 'fire', 2)!.index).toBe(2);
  });
  it('does not silently select partial, unreviewed, or misregistered clips', () => {
    const assets = clip('heartDevourer', 'phase2'), first = Object.values(assets)[0];
    first.animation!.approved = false; expect(sourceRegisteredSpriteFrame(assets, 'heartDevourer', 'phase2')).toBeUndefined();
    expect(sourceRegisteredSpriteFrame(assets, 'heartDevourer', 'phase2', 0, { allowUnreviewed: true })).toBeDefined();
    first.animation!.approved = true; first.actorRegistration!.foot.y = 430;
    expect(sourceRegisteredSpriteFrame(assets, 'heartDevourer', 'phase2')).toBeUndefined();
    first.actorRegistration!.foot.y = 435.2; delete assets[Object.keys(assets)[1]];
    expect(sourceRegisteredSpriteFrame(assets, 'heartDevourer', 'phase2')).toBeUndefined();
  });
  it('rejects invalid view/progress input without state changes or native exceptions', () => {
    const assets = clip('basePod', 'ready'), before = structuredClone(assets);
    expect(sourceRegisteredSpriteFrame(assets, 'basePod', 'ready', 0, { progress: NaN })).toBeUndefined();
    expect(sourceRegisteredSpriteFrame(assets, 'basePod', 'ready', 0, { facing: Infinity })).toBeUndefined();
    expect(sourceRegisteredSpriteFrame(assets, 'basePod', 'unknown')).toBeUndefined(); expect(assets).toEqual(before);
  });
  it('uses the individually approved dimensions for every facility and boss', () => {
    for (const [identity, definition] of Object.entries(EXPEDITION_ART_SPECS)) {
      const action = Object.keys(definition.clips)[0], direction = definition.directional ? 'front_right' : 'fixed';
      const result = sourceRegisteredSpriteFrame(clip(identity as ExpeditionArtIdentity, action, direction), identity as ExpeditionArtIdentity, action)!;
      expect(result.logicalWidth).toBe(definition.width); expect(result.layout.width).toBe(definition.width);
    }
  });
});
describe('expedition atlas-backed UI icons', () => {
  it('uses actual atlas rectangles and only embeds an atlas URI once', () => {
    const runtime: ExpeditionIconRuntime = { assets: {}, atlases: [{ key: 'test-atlas', dataUri: 'data:image/png;base64,dGVzdA==',
      data: { frames: {}, meta: { size: { w: 200, h: 100 } } } }] };
    const assets = runtime.assets as Record<string, { atlas: string; frame: string; animation: { approved: boolean } }>;
    for (const id of [EXPEDITION_ICON_IDS['weapon-steady'], EXPEDITION_ICON_IDS['weapon-piercing']]) {
      assets[id] = { atlas: 'test-atlas', frame: id, animation: { approved: true } };
      runtime.atlases[0].data.frames![id] = { frame: { x: 100, y: 20, w: 50, h: 50 } };
    }
    const styles = expeditionIconStyles(runtime);
    expect(styles.installed).toEqual(['weapon-steady', 'weapon-steady-broken', 'weapon-piercing', 'weapon-piercing-broken']); expect(styles.css.match(/data:image\/png/g)).toHaveLength(1);
    expect(styles.css).toContain('background-size:400% 200%'); expect(styles.css).toContain('background-position:66.66666666666666% 40%');
    expect(styles.css).not.toContain('http');
  });
  it('retains code-native UI glyphs when a reviewed native frame is missing', () => {
    expect(expeditionIconStyles({ assets: {}, atlases: [] })).toEqual({ css: '', installed: [] });
  });
  it('installs reviewed static reward icons and retains the glyph for an unreviewed icon', () => {
    const reviewed = EXPEDITION_ICON_IDS['module-PULSE_BREAK'], pending = EXPEDITION_ICON_IDS['module-PURIFY_CHAIN'];
    const runtime: ExpeditionIconRuntime = { assets: {
      [reviewed]: { atlas: 'reward-atlas', frame: reviewed, status: 'ui-reviewed', flags: ['reward-icons-v1'] },
      [pending]: { atlas: 'reward-atlas', frame: pending, status: 'candidate', flags: ['reward-icons-v1'] },
    }, atlases: [{ key: 'reward-atlas', dataUri: 'data:image/png;base64,dGVzdA==', data: {
      meta: { size: { w: 256, h: 128 } }, frames: {
        [reviewed]: { frame: { x: 0, y: 0, w: 128, h: 128 } },
        [pending]: { frame: { x: 128, y: 0, w: 128, h: 128 } },
      },
    } }] };
    const styles = expeditionIconStyles(runtime);
    expect(styles.installed).toEqual(['module-PULSE_BREAK']);
    expect(styles.css).toContain('[data-camp-art="module-PULSE_BREAK"]>.mission-reward-glyph{display:none}');
    expect(styles.css).not.toContain('module-PURIFY_CHAIN');
  });
});
