import { ACTOR_REQUIRED_GROUPS, ACTOR_STATIC_IDS, type ActorAsset } from '../../src/render/actorAnimation';

/** Synthetic geometry only. These are not production art or visual approvals. */
export function fixtureActorAnimationAssets(): Record<string, ActorAsset & { atlas: string; frame: string; flags: string[]; status: string }> {
  const result: ReturnType<typeof fixtureActorAnimationAssets> = {};
  for (const group of ACTOR_REQUIRED_GROUPS) for (let index = 0; index < group.count; index++) {
    const id = group.identity === 'mother' && group.count === 1 ? group.group : `${group.group}.${String(index).padStart(2, '0')}`;
    const size = group.identity === 'mother' ? 1024 : 512, foot = { x: size * .5, y: size * .85 };
    const sourceBounds = { x: size * .2 + index, y: size * .15 + index, width: size * .6 - index * 2, height: size * .7 - index };
    result[id] = { atlas: 'test-actors', frame: id, flags: [], status: 'test-fixture', width: size / 2, height: size / 2,
      pivot: { x: .5, y: .85 }, visibleBounds: Object.fromEntries(Object.entries(sourceBounds).map(([key, value]) => [key, value / 2])) as typeof sourceBounds,
      sourceBounds, sourceSize: { width: size, height: size }, source: `fixture/${id}.png`, sourceSha256: '0'.repeat(64),
      actorRegistration: { canvas: { width: size, height: size }, foot, commonCanvasScale: 1,
        ...(group.identity === 'hero' ? { grip: { x: size * .66 + index, y: size * .68 } } : {}) },
      animation: { group: group.group, index, frameCount: group.count, fps: group.clip === 'walk' ? 12 : 6, approved: true } };
  }
  for (const id of Object.values(ACTOR_STATIC_IDS)) {
    const tool = id === ACTOR_STATIC_IDS.emitter, foot = tool ? { x: 96, y: 320 } : { x: 256, y: 435.2 };
    const sourceBounds = tool ? { x: 48, y: 240, width: 352, height: 112 } : { x: 100, y: 70, width: 312, height: 365.2 };
    result[id] = { atlas: 'test-actors', frame: id, flags: [], status: 'test-fixture', width: 256, height: 256,
      pivot: { x: foot.x / 512, y: foot.y / 512 }, sourceSize: { width: 512, height: 512 }, sourceBounds,
      visibleBounds: Object.fromEntries(Object.entries(sourceBounds).map(([key, value]) => [key, value / 2])) as typeof sourceBounds,
      source: `fixture/${id}.png`, sourceSha256: '0'.repeat(64),
      actorRegistration: { canvas: { width: 512, height: 512 }, foot, commonCanvasScale: 1,
        ...(tool ? { grip: foot, muzzle: { x: 390, y: 285 } } : {}) },
      ...(tool ? { sourceMuzzle: { x: 390, y: 285 } } : {}),
      animation: { group: id, index: 0, frameCount: 1, fps: 1, approved: true } };
  }
  return result;
}
