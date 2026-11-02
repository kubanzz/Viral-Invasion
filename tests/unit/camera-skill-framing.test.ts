import { describe, expect, it } from 'vitest';
import { Camera, CAMERA_PLAYER_FRAME, type CameraFollowOptions, type CameraPlayerFrame, type CameraViewport } from '../../src/render/camera';
import { HEART_WORLD, LUNG_WORLD } from '../../src/game/organConfig';
import { WORLD, type Vec } from '../../src/game/types';
import artRuntime from '../../.art-generated/art-runtime.json';
import { approvedHeroAnimationClips, type HeroAnimationAsset } from '../../src/render/heroAnimation';
import { aimedPaintedTool, registeredSpriteBodyBounds } from '../../src/render/spriteGeometry';
import { createHeroRig } from '../../src/render/heroRig';

const viewport = (width: number, height: number): CameraViewport => ({ left: 132, top: 80, right: width - 260, bottom: height - 24 });
function settle(camera: Camera, player: Vec, aim: Vec, view: CameraViewport, world = HEART_WORLD) {
  for (let frame = 0; frame < 180; frame++) camera.follow(player, world, { aim, viewport: view, deltaSeconds: 1 / 60 });
}
function padded(camera: Camera, point: Vec, view: CameraViewport) {
  const screen = camera.worldToScreen(point);
  expect(screen.x).toBeGreaterThanOrEqual(view.left + 20 - 1e-5);
  expect(screen.x).toBeLessThanOrEqual(view.right - 20 + 1e-5);
  expect(screen.y).toBeGreaterThanOrEqual(view.top + 20 - 1e-5);
  expect(screen.y).toBeLessThanOrEqual(view.bottom - 20 + 1e-5);
  const roundTrip = camera.screenToWorld(screen);
  expect(roundTrip.x).toBeCloseTo(point.x, 8); expect(roundTrip.y).toBeCloseTo(point.y, 8);
  return screen;
}
function paddedBody(camera: Camera, point: Vec, view: CameraViewport, frame: Readonly<CameraPlayerFrame> = CAMERA_PLAYER_FRAME) {
  const screen = camera.worldToScreen(point);
  expect(screen.x + frame.left * camera.scale).toBeGreaterThanOrEqual(view.left + 20 - 1e-5);
  expect(screen.x + frame.right * camera.scale).toBeLessThanOrEqual(view.right - 20 + 1e-5);
  expect(screen.y + frame.top * camera.scale).toBeGreaterThanOrEqual(view.top + 20 - 1e-5);
  expect(screen.y + frame.bottom * camera.scale).toBeLessThanOrEqual(view.bottom - 20 + 1e-5);
}

describe('optional skill-preview camera framing', () => {
  it('covers the current registered hero, articulated gait and aimed emitter with the framing envelope', () => {
    const assets = artRuntime.assets as unknown as Record<string, HeroAnimationAsset>;
    const frames = Object.values(approvedHeroAnimationClips(assets)).flatMap(clip => clip?.frames ?? []);
    expect(frames.length).toBeGreaterThanOrEqual(4);
    const envelope = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const frame of frames) for (const flipX of [false, true]) for (let direction = 0; direction < 8; direction++) for (const recoil of [0, 4]) {
      const facing = direction * Math.PI / 4, angle = Math.atan2(Math.sin(facing) * .72, Math.cos(facing));
      const point = { x: 0, y: 0 }, toolPoint = { x: -Math.cos(facing) * recoil, y: -Math.sin(facing) * recoil };
      const grip = { x: toolPoint.x + Math.cos(angle) * 21, y: toolPoint.y * .72 - 19 + Math.sin(angle) * 3 };
      const tool = aimedPaintedTool(assets['weapon.emitter.painted'], toolPoint, facing, 0, grip);
      expect(tool).toBeDefined();
      for (const gait of [{ phase: 0, amount: 0, lean: 0 }, { phase: Math.PI / 2, amount: 1, lean: 1 }, { phase: Math.PI, amount: 1, lean: 0 }, { phase: Math.PI * 1.5, amount: 1, lean: -1 }]) {
        const body = createHeroRig(assets[frame.id], frame.layout, point, flipX, 0, gait, tool)?.bounds ?? registeredSpriteBodyBounds(frame.layout, point, flipX);
        for (const bounds of [body, tool!.bounds]) {
          envelope.left = Math.min(envelope.left, bounds.left); envelope.right = Math.max(envelope.right, bounds.right);
          envelope.top = Math.min(envelope.top, bounds.top); envelope.bottom = Math.max(envelope.bottom, bounds.bottom);
        }
      }
    }
    expect(envelope.left).toBeGreaterThanOrEqual(CAMERA_PLAYER_FRAME.left);
    expect(envelope.right).toBeLessThanOrEqual(CAMERA_PLAYER_FRAME.right);
    expect(envelope.top).toBeGreaterThanOrEqual(CAMERA_PLAYER_FRAME.top);
    expect(envelope.bottom).toBeLessThanOrEqual(CAMERA_PLAYER_FRAME.bottom);
    expect(envelope.bottom - envelope.top).toBeGreaterThan(86);
  });
  it('retains the recorded desktop follow values exactly when preview framing is never requested', () => {
    // Recorded from the pre-framing camera, covering snap, smooth follow, the
    // existing world-edge clamps and the no-delta legacy snap behaviour.
    const camera = new Camera(1366, 768);
    const samples: { point: Vec; options: CameraFollowOptions; expected: { scale: number; panX: number; panY: number; screen: Vec } }[] = [
      { point: { x: 450, y: 1070 }, options: { snap: true }, expected: { scale: 1.0666666666666667, panX: -80, panY: -748.3333333333333, screen: { x: 522.6666666666666, y: 407.04 } } },
      { point: { x: 460, y: 1060 }, options: { deltaSeconds: 1 / 60 }, expected: { scale: 1.0666666666666667, panX: -80, panY: -748.3333333333333, screen: { x: 533.3333333333334, y: 399.36 } } },
      { point: { x: 1200, y: 750 }, options: { deltaSeconds: 4 / 60 }, expected: { scale: 1.0666666666666667, panX: -393.78011049507717, panY: -596.5939156473346, screen: { x: 987.9678821385843, y: 277.815872782847 } } },
      { point: { x: 2170, y: 280 }, options: { deltaSeconds: .1 }, expected: { scale: 1.0666666666666667, panX: -987.8433723364624, panY: -282.4814334979492, screen: { x: 1388.9670695077734, y: 158.09425907357502 } } },
      { point: { x: 2200, y: 1300 }, options: {}, expected: { scale: 1.0666666666666667, panX: -1279.375, panY: -748.3333333333333, screen: { x: 1110, y: 583.6800000000001 } } },
    ];
    for (const sample of samples) {
      camera.follow(sample.point, HEART_WORLD, sample.options);
      expect({ scale: camera.scale, panX: camera.panX, panY: camera.panY, screen: camera.worldToScreen(sample.point) }).toEqual(sample.expected);
    }
  });

  for (const [width, height] of [[667, 280], [667, 320], [844, 320], [932, 375]]) {
    it(`fits the entire hero and 650-unit skill points in every direction inside ${width}x${height}`, () => {
      const view = viewport(width, height), player = Object.freeze({ x: 1100, y: 800 });
      for (const world of [HEART_WORLD, LUNG_WORLD]) for (const offset of [{ x: 0, y: -650 }, { x: 0, y: 650 }, { x: -650, y: 0 }, { x: 650, y: 0 }]) {
        const camera = new Camera(width, height), aim = Object.freeze({ x: player.x + offset.x, y: player.y + offset.y });
        camera.follow(player, world, { snap: true }); settle(camera, player, aim, view, world);
        const baseScale = Math.min(width / 1152, height / 720);
        expect(camera.scale).toBeGreaterThanOrEqual(baseScale * .5 - 1e-10);
        expect(camera.scale).toBeLessThanOrEqual(baseScale);
        const playerScreen = padded(camera, player, view); paddedBody(camera, player, view); padded(camera, aim, view);
        // The camera anchor stays clear of the movement wheel, right-side
        // skills and top status area; neither rule coordinates nor aim change.
        expect(playerScreen.x).toBeGreaterThan(128); expect(playerScreen.x).toBeLessThan(width - 240);
        expect(Math.hypot(aim.x - player.x, aim.y - player.y)).toBe(650);
      }
    });
  }

  it('keeps player and aimed points in the usable area at each organ boundary, including off-arena previews', () => {
    const camera = new Camera(667, 280), view = viewport(667, 280);
    for (const player of [{ x: 150, y: 180 }, { x: 2250, y: 1320 }]) for (const offset of [{ x: -650, y: 0 }, { x: 650, y: 0 }, { x: 0, y: -650 }, { x: 0, y: 650 }]) {
      const aim = { x: player.x + offset.x, y: player.y + offset.y };
      settle(camera, player, aim, view);
      padded(camera, player, view); paddedBody(camera, player, view); padded(camera, aim, view);
    }
  });

  it('keeps the full actor clear while zoom enters, moves and switches from an upward to a downward preview', () => {
    const camera = new Camera(667, 280), view = viewport(667, 280), player = { x: 1100, y: 800 };
    camera.follow(player, HEART_WORLD, { snap: true });
    for (const offset of [{ x: 0, y: -650 }, { x: 0, y: 650 }, { x: -650, y: 0 }, { x: 650, y: 0 }]) {
      for (let frame = 0; frame < 40; frame++) {
        player.x += frame < 8 ? 13 : 0;
        const aim = { x: player.x + offset.x, y: player.y + offset.y };
        camera.follow(player, HEART_WORLD, { aim, viewport: view, deltaSeconds: 1 / 60 });
        paddedBody(camera, player, view);
      }
      const aim = { x: player.x + offset.x, y: player.y + offset.y };
      settle(camera, player, aim, view); paddedBody(camera, player, view); padded(camera, aim, view);
    }
  });

  it('fits both the full actor and target with actual short-phone safe areas and header clearance', () => {
    const camera = new Camera(844, 320), view = { left: 176, top: 88, right: 540, bottom: 275 }, player = { x: 150, y: 180 };
    for (const offset of [{ x: -650, y: 0 }, { x: 650, y: 0 }, { x: 0, y: -650 }, { x: 0, y: 650 }]) {
      const aim = { x: player.x + offset.x, y: player.y + offset.y };
      settle(camera, player, aim, view); paddedBody(camera, player, view); padded(camera, aim, view);
    }
  });

  it('uses the supplied viewport for ordinary mobile follow without zooming actors', () => {
    const camera = new Camera(667, 280), view = viewport(667, 280), player = { x: 1100, y: 800 };
    camera.follow(player, HEART_WORLD, { viewport: view, snap: true });
    expect(camera.scale).toBe(280 / 720);
    const screen = camera.worldToScreen(player);
    expect(screen.x).toBeCloseTo((view.left + view.right) / 2, 8);
    expect(screen.y).toBeCloseTo((view.top + view.bottom) / 2, 8);
  });

  it('smooths both zoom entry and cancellation without making preview changes a new camera scope', () => {
    const camera = new Camera(667, 280), view = viewport(667, 280), player = { x: 1100, y: 800 }, aim = { x: 1100, y: 1450 };
    camera.follow(player, HEART_WORLD, { snap: true });
    const baseScale = camera.scale;
    camera.follow(player, HEART_WORLD, { aim, viewport: view, deltaSeconds: 1 / 60 });
    const target = new Camera(667, 280); target.follow(player, HEART_WORLD, { aim, viewport: view, snap: true });
    expect(camera.scale).toBeLessThan(baseScale); expect(camera.scale).toBeGreaterThan(target.scale);
    settle(camera, player, aim, view);
    const before = { scale: camera.scale, screen: camera.worldToScreen(player) };
    const normal = new Camera(667, 280); normal.follow(player, HEART_WORLD, { snap: true });
    camera.follow(player, HEART_WORLD, { deltaSeconds: 1 / 60 });
    const first = camera.worldToScreen(player), final = normal.worldToScreen(player);
    expect(camera.scale).toBeGreaterThan(before.scale); expect(camera.scale).toBeLessThan(baseScale);
    expect(Math.hypot(first.x - before.screen.x, first.y - before.screen.y)).toBeLessThan(Math.hypot(final.x - before.screen.x, final.y - before.screen.y));
    for (let frame = 0; frame < 180; frame++) camera.follow(player, HEART_WORLD, { deltaSeconds: 1 / 60 });
    expect(camera.scale).toBe(baseScale);
    expect(camera.worldToScreen(player).x).toBeCloseTo(final.x, 6); expect(camera.worldToScreen(player).y).toBeCloseTo(final.y, 6);
  });

  it('resets preview zoom after resize and preserves the original small-world training projection', () => {
    const camera = new Camera(667, 280), player = { x: 1100, y: 800 }, aim = { x: 1100, y: 1450 };
    settle(camera, player, aim, viewport(667, 280));
    camera.resize(844, 320);
    camera.follow(player, HEART_WORLD, { aim, viewport: viewport(844, 320), deltaSeconds: 1 / 60 });
    const fresh = new Camera(844, 320); fresh.follow(player, HEART_WORLD, { aim, viewport: viewport(844, 320), snap: true });
    expect(camera.scale).toBe(fresh.scale); expect(camera.worldToScreen(player)).toEqual(fresh.worldToScreen(player));
    camera.follow({ x: 330, y: 440 }, WORLD, { aim: { x: 330, y: 1090 }, viewport: viewport(844, 320), deltaSeconds: 1 / 60 });
    const training = new Camera(844, 320); training.follow({ x: 330, y: 440 }, WORLD);
    expect(camera.scale).toBe(training.scale); expect(camera.worldToScreen({ x: 330, y: 440 })).toEqual(training.worldToScreen({ x: 330, y: 440 }));
  });

  it('bounds impossible/extreme previews and malformed viewport data without losing the player or producing NaN', () => {
    const camera = new Camera(667, 280), player = { x: 1100, y: 800 }, aim = { x: 1100, y: 10800 }, view = viewport(667, 280);
    settle(camera, player, aim, view);
    expect(camera.scale).toBeCloseTo(280 / 720 * .5, 8); padded(camera, player, view); paddedBody(camera, player, view);
    camera.follow(player, HEART_WORLD, { aim: { x: NaN, y: Infinity }, viewport: { left: 400, top: NaN, right: 100, bottom: 20 }, snap: true });
    expect(Number.isFinite(camera.panX + camera.panY + camera.scale)).toBe(true);
    expect(camera.scale).toBe(280 / 720);
  });
});
