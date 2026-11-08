import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { ImmuneCellState } from '../../src/game/immuneCells';
import type { SeraphRole } from '../../src/game/seraphCombat';
import { legionPaintedPose } from '../../src/render/legionPresentation';
import { sourceRegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';

interface RuntimeAsset extends SourceRegisteredSpriteAsset {
  source: string; sourceSha256: string;
  animation?: { group: string; index: number; frameCount: number; fps: number; approved: boolean };
}
const runtime = JSON.parse(readFileSync(resolve('.art-generated/art-runtime.json'), 'utf8')) as {
  assets: Record<string, RuntimeAsset>; sourceManifest: Record<string, string>;
};
const selected = JSON.parse(readFileSync(resolve('asserts/art-selection.json'), 'utf8')) as {
  sprites: { id: string; source: string; expectedSha256: string }[];
};
const present = Object.keys(runtime.assets).some(id => id.startsWith('seraph24.'));
const roles: SeraphRole[] = ['commander', 'lancer', 'prism'];
const expected = roles.flatMap(role => ['front', 'back'].flatMap(view => ['idle', 'move', 'attack'].flatMap(action =>
  Array.from({ length: action === 'idle' ? 2 : 4 }, (_, index) => `seraph24.${role}.${view}.${action}.${String(index).padStart(2, '0')}`))));
function cell(role: SeraphRole): ImmuneCellState {
  return { id: `runtime:${role}`, beaconId: 'runtime', organId: 'heart', x: 500, y: 500, born: 0, until: 100,
    hp: 100, radius: 18, facing: 0, damage: 10, interval: 1, updatedAt: 1, attackReadyAt: 3, attackUntil: 0,
    targetId: 'target', activity: 'guarding', navigationAt: 0, waypoint: null, legionId: 'seraph', seraphRole: role };
}

// The v0.23 runtime intentionally has no replacement family. Once any modern
// asset is integrated, partial/misregistered/unapproved families fail normally.
describe.skipIf(!present)('v0.24 delivered Seraph runtime registration', () => {
  it('contains all sixty canonical approved frames and retires the old animated family', () => {
    const actual = Object.keys(runtime.assets).filter(id => /^seraph24\.(commander|lancer|prism)\.(front|back)\.(idle|move|attack)\./.test(id)).sort();
    expect(actual).toEqual(expected.slice().sort());
    expect(Object.keys(runtime.assets).filter(id => /^sanctum\.seraph\.(leader|wing)\.(front|back)\.(idle|move|attack)\./.test(id))).toEqual([]);
    for (const id of expected) {
      const asset = runtime.assets[id], group = id.slice(0, id.lastIndexOf('.')), index = Number(id.slice(-2));
      const count = group.endsWith('.idle') ? 2 : 4, siblings = expected.filter(other => other.startsWith(group + '.'));
      expect(asset.animation).toMatchObject({ approved: true, group, index, frameCount: count });
      expect(asset.animation!.fps).toBeGreaterThan(0); expect(Number.isFinite(asset.animation!.fps)).toBe(true);
      expect(new Set(siblings.map(other => runtime.assets[other].animation?.fps)).size).toBe(1);
      expect(asset.sourceSize).toEqual({ width: 512, height: 512 });
      expect(sourceRegisteredSpriteLayout(asset, { width: 512, height: 512 }, { x: 256, y: 435.2 }, 1), id).toBeDefined();
    }
  });
  it('binds each source PNG byte-for-byte to selection, runtime and its alpha/512px delivery', async () => {
    await Promise.all(expected.map(async id => {
      const asset = runtime.assets[id], entry = selected.sprites.find(item => item.id === id)!;
      expect(entry, id).toBeDefined(); expect(entry.source).toBe(asset.source);
      const bytes = readFileSync(resolve('asserts', asset.source)), actual = createHash('sha256').update(bytes).digest('hex');
      expect(actual).toBe(entry.expectedSha256); expect(actual).toBe(asset.sourceSha256); expect(actual).toBe(runtime.sourceManifest[asset.source]);
      const info = await sharp(bytes).metadata();
      expect(info).toMatchObject({ format: 'png', width: 512, height: 512, hasAlpha: true });
    }));
  });
  it('selects real delivered phase frames at one role scale and preserves the source foot for both views', () => {
    for (const role of roles) for (const view of ['front', 'back']) {
      const actor = cell(role); actor.facing = view === 'back' ? -Math.PI / 2 : 0;
      const reference = runtime.assets[`seraph24.${role}.front.idle.00`], height = role === 'commander' ? 72 : role === 'lancer' ? 54 : 58;
      const sourceScale = height / reference.sourceBounds!.height;
      const checkPose = (elapsed: number, expectedId: string) => {
        const pose = legionPaintedPose(runtime.assets, actor, elapsed)!;
        expect(pose?.id).toBe(expectedId); expect(pose.sourceScale).toBe(sourceScale); expect(pose.height).toBe(height);
        const asset = runtime.assets[pose.id], layout = sourceRegisteredSpriteLayout(asset, { width: 512, height: 512 }, { x: 256, y: 435.2 }, pose.sourceScale)!;
        const sourceX = asset.sourceBounds!.x! + (layout.originX * asset.width - asset.visibleBounds.x) * asset.sourceBounds!.width! / asset.visibleBounds.width;
        const sourceY = asset.sourceBounds!.y! + (layout.originY * asset.height - asset.visibleBounds.y) * asset.sourceBounds!.height / asset.visibleBounds.height;
        expect(sourceX).toBeCloseTo(256, 7); expect(sourceY).toBeCloseTo(435.2, 7);
      };
      checkPose(0, `seraph24.${role}.${view}.idle.00`);
      actor.seraphAction = { actionId: 'runtime-action', kind: role === 'prism' ? 'prism' : 'cleave', phase: 'windup',
        startedAt: 1, phaseStartedAt: 1, until: 2, targetId: 'target', origin: { x: 500, y: 500 }, aim: { x: 600, y: 500 },
        direction: { x: 1, y: 0 }, part: 0, sequence: 1, strong: false, damage: 10, traveled: 0 };
      checkPose(1.1, `seraph24.${role}.${view}.attack.00`); checkPose(1.8, `seraph24.${role}.${view}.attack.01`);
      actor.seraphAction.phase = 'recover'; actor.seraphAction.releaseTick = 60;
      checkPose(1.079, `seraph24.${role}.${view}.attack.02`); checkPose(1.08, `seraph24.${role}.${view}.attack.03`);
    }
  });
});
