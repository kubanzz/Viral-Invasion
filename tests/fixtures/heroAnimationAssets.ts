import type { HeroAnimationAsset, HeroClip } from '../../src/render/heroAnimation';

export interface HeroAnimationFixtureAsset extends HeroAnimationAsset {
  atlas: string; frame: string; flags: string[]; status: string;
  sourceSize: { width: number; height: number }; sourceBounds: { x: number; y: number; width: number; height: number };
  animation: { group: string; index: number; fps: number; frameCount: number; approved: boolean };
}

/** Synthetic geometry only. These fixtures are not artwork and are never selected by production. */
export function fixtureHeroAnimationAssets(): Record<string, HeroAnimationFixtureAsset> {
  const boxes: Record<HeroClip, [number, number, number, number][]> = {
    idle: [[310, 150, 404, 700], [308, 144, 408, 706], [306, 140, 412, 710], [309, 148, 406, 702]],
    walk: [[290, 150, 440, 700], [270, 170, 480, 680], [250, 205, 520, 645], [280, 180, 460, 670],
      [292, 152, 436, 698], [265, 168, 490, 682], [248, 202, 524, 648], [275, 175, 474, 675]],
    hurt: [[300, 215, 420, 635], [305, 175, 410, 675]],
    dash: [[270, 250, 480, 600], [240, 300, 540, 550], [250, 290, 520, 560], [290, 190, 440, 660]],
  };
  const fps: Record<HeroClip, number> = { idle: 6, walk: 12, hurt: 30, dash: 25 };
  const assets: Record<string, HeroAnimationFixtureAsset> = {};
  for (const clip of Object.keys(boxes) as HeroClip[]) for (const [index, [x, y, width, height]] of boxes[clip].entries()) {
    const group = `hero.front_right.${clip}`, id = `${group}.${String(index).padStart(2, '0')}`, density = .29 + index * .017;
    const packedW = Math.round(width * density), packedH = Math.round(height * density);
    const sx = packedW / width, sy = packedH / height;
    const ax = 8 + (512 - x) * sx, ay = 8 + (850 - y) * sy;
    const outputW = Math.ceil(Math.max(packedW + 16, ax + 8)), outputH = Math.ceil(Math.max(packedH + 16, ay + 8));
    assets[id] = { atlas: 'hero-fixture-atlas', frame: id, width: outputW, height: outputH,
      pivot: { x: (ax + .25) / outputW, y: (ay - .25) / outputH },
      visibleBounds: { x: 8, y: 8, width: packedW, height: packedH }, sourceSize: { width: 1024, height: 1024 },
      sourceBounds: { x, y, width, height }, flags: ['synthetic-test-geometry'], status: 'test-only',
      animation: { group, index, fps: fps[clip], frameCount: boxes[clip].length, approved: true } };
  }
  return assets;
}
