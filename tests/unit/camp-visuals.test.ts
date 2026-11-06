import { describe, expect, it } from 'vitest';
import { CAMP_COURTYARDS, CAMP_WALL_THICKNESS, campLayout } from '../../src/game/campLayout';
import type { GameState } from '../../src/game/types';
import { CAMP_GROUND_ASSET_IDS, CAMP_VISUAL_SIZES, campAreaLabels, campBoundaryTrace, campDecorations,
  campGroundPatchRect, drawCampGround, type CampGroundImages } from '../../src/render/campVisuals';

const stateAt = (x = 1200, y = 900, camp = true) => ({ tissue: { x, y }, ...(camp ? { camp: { introSeconds: 8, introComplete: true } } : {}) }) as GameState;
function groundRecording(ownerDocument?: Document) {
  const draws: unknown[][] = [], strokes: unknown[] = [];
  const target: Record<string, unknown> = { canvas: { ownerDocument } };
  const ctx = new Proxy(target, {
    get(object, key: string) {
      if (key in object) return object[key];
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'drawImage') return (...args: unknown[]) => draws.push(args);
      if (key === 'stroke') return () => strokes.push(object.strokeStyle);
      return () => {};
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, draws, strokes };
}

describe('camp presentation shares the physical courtyard plan', () => {
  it('keeps a single open curb with round ends outside each 92-unit model gate', () => {
    for (const c of CAMP_COURTYARDS) {
      const points = campBoundaryTrace(c), first = points[0], last = points[points.length - 1];
      const clearance = c.gate.width / 2 + CAMP_WALL_THICKNESS / 2;
      expect(first.x).toBe(c.gate.center.x);expect(last.x).toBe(c.gate.center.x);
      expect(Math.abs(first.y - c.gate.center.y)).toBe(clearance);
      expect(Math.abs(last.y - c.gate.center.y)).toBe(clearance);
      expect(first.y).not.toBe(last.y);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (Math.abs(a.x - c.gate.center.x) > .01 || Math.abs(b.x - c.gate.center.x) > .01) continue;
        const low = Math.min(a.y, b.y), high = Math.max(a.y, b.y);
        expect(high <= c.gate.center.y - c.gate.width / 2 || low >= c.gate.center.y + c.gate.width / 2).toBe(true);
      }
    }
  });

  it('clips injected ground images behind the model curb instead of stretching them over the gate', () => {
    for (const c of CAMP_COURTYARDS) {
      const patch = campGroundPatchRect(c), margin = CAMP_WALL_THICKNESS / 2 + 2;
      expect(patch.left).toBe(c.rect.left + margin);expect(patch.right).toBe(c.rect.right - margin);
      expect(patch.top).toBe(c.rect.top + margin);expect(patch.bottom).toBe(c.rect.bottom - margin);
      expect(CAMP_GROUND_ASSET_IDS[c.id]).toBe(`fantasy.camp.ground.${c.id}`);
    }
  });

  it('anchors all decorations to the heart and keeps the spine and gate mouths clear', () => {
    const state = stateAt(0, 0), layout = campLayout(state), decorations = campDecorations(state);
    expect(decorations.length).toBeLessThanOrEqual(22);
    expect(decorations.filter(d => d.kind === 'sprite' && d.assetId === 'fantasy.tree.healthy')).toHaveLength(2);
    for (const d of decorations) {
      const r = layout.paths.spine;
      expect(d.x < r.left || d.x > r.right || d.y < r.top || d.y > r.bottom).toBe(true);
      for (const { gate } of layout.courtyards) expect(Math.hypot(d.x - gate.center.x, d.y - gate.center.y)).toBeGreaterThan(60);
      if (d.kind === 'sprite') expect(d.assetId).not.toMatch(/loot|biomass|blueprint|weapon/);
    }
    const moved = campDecorations(stateAt(1600, 1100));
    expect(moved.map((d, i) => [d.x - decorations[i].x, d.y - decorations[i].y])).toEqual(decorations.map(() => [1600, 1100]));
  });

  it('places district labels on outer south edges and never labels an old battlefield', () => {
    const s = stateAt(), layout = campLayout(s), labels = campAreaLabels(s);
    expect(labels.map(label => label.lines[0].text)).toEqual(['整备区', '补给区', '出击区']);
    labels.forEach((label, i) => expect(label.anchor.y).toBe(layout.courtyards[i].rect.bottom + 28));
    expect(campAreaLabels(stateAt(0, 0, false))).toEqual([]);expect(campDecorations(stateAt(0, 0, false))).toEqual([]);
  });

  it('removes only a painted courtyard\'s small plants and keeps trees, furniture and stable ordering', () => {
    const state = stateAt(), all = campDecorations(state), paintedIds = CAMP_COURTYARDS.map(c => c.id);
    for (const courtyardId of paintedIds) {
      const partial = campDecorations(state, [courtyardId]);
      expect(partial.map(d => d.id)).toEqual(all.filter(d => !d.id.startsWith(`camp-decor:${courtyardId}-leaf-`)).map(d => d.id));
      expect(partial).toHaveLength(all.length - 4);
    }
    const fullyPainted = campDecorations(state, paintedIds);
    expect(fullyPainted).toHaveLength(7);
    expect(fullyPainted.filter(d => d.kind === 'fixture')).toHaveLength(5);
    expect(fullyPainted.filter(d => d.kind === 'sprite').map(d => d.assetId)).toEqual(['fantasy.tree.healthy', 'fantasy.tree.healthy']);
    expect(campDecorations(state, ['supply', 'supply'])).toEqual(campDecorations(state, ['supply']));
  });

  it('lets painted grounds own their grain and planting while retaining the code curb and thresholds', () => {
    const capture = (images: CampGroundImages) => {
      const fills: unknown[] = [], strokes: unknown[] = [], draws: unknown[][] = [];
      const target: Record<string, unknown> = { canvas: { ownerDocument: undefined } };
      const ctx = new Proxy(target, {
        get(object, key: string) {
          if (key in object) return object[key];
          if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
          if (key === 'fill') return () => fills.push(object.fillStyle);
          if (key === 'stroke') return () => strokes.push(object.strokeStyle);
          if (key === 'drawImage') return (...args: unknown[]) => draws.push(args);
          return () => {};
        },
      }) as unknown as CanvasRenderingContext2D;
      drawCampGround(ctx, stateAt(), images);return { fills, strokes, draws };
    };
    const image = {} as CanvasImageSource, fallback = capture({}), partial = capture({ workshop: image });
    expect(fallback.fills.filter(fill => fill === '#7b927d16').length).toBeGreaterThan(0);
    expect(partial.fills).not.toContain('#7b927d16');
    expect(partial.fills).toContain('#b7aa8816');expect(partial.fills).toContain('#7f9d9116');
    const painted = capture({ workshop: image, supply: image, departure: image });
    expect(painted.draws).toHaveLength(3);
    for (const color of ['#7b927d16', '#b7aa8816', '#7f9d9116', '#a9c39a', '#91ae8b', '#b9cda4']) expect(painted.fills).not.toContain(color);
    expect(painted.strokes.filter(color => color === '#e2d6b9')).toHaveLength(3);
  });

  it('preserves the approved hero, heart and facility scale relationship', () => {
    expect(CAMP_VISUAL_SIZES.heroCanvas).toBe(76);expect(CAMP_VISUAL_SIZES.coreCanvas).toBe(230);
    expect(CAMP_VISUAL_SIZES.stationWidths).toEqual({ warehouse: 280, forge: 156, shop: 168, departure: 190, summon: 130 });
    expect(CAMP_VISUAL_SIZES.newForgeWidth).toBe(248);
  });

  it('leaves a district unfinished until every planned facility in that district is built', () => {
    const s = stateAt(); s.camp = { prologue: 'building', introComplete: false, introSeconds: 1000, builtFacilities: ['warehouse'] };
    const images = { workshop: {} as CanvasImageSource, supply: {} as CanvasImageSource, departure: {} as CanvasImageSource };
    const incomplete = groundRecording(); drawCampGround(incomplete.ctx, s, images);
    expect(incomplete.draws).toEqual([]); expect(campAreaLabels(s)).toEqual([]); expect(campDecorations(s)).toEqual([]);
    expect(incomplete.strokes).not.toContain('#e2d6b9');

    s.camp.activeConstruction = 'forge'; s.camp.constructionSeconds = 1000;
    const stillBuilding = groundRecording(); drawCampGround(stillBuilding.ctx, s, images);
    expect(stillBuilding.draws).toEqual([]); expect(campAreaLabels(s)).toEqual([]);

    s.camp.builtFacilities!.push('forge'); delete s.camp.activeConstruction;
    const workshop = groundRecording(); drawCampGround(workshop.ctx, s, images);
    expect(workshop.draws.map(draw => draw[0])).toEqual([images.workshop]);
    expect(workshop.strokes.filter(color => color === '#e2d6b9')).toHaveLength(1);
    expect(campAreaLabels(s).map(label => label.lines[0].text)).toEqual(['整备区']);
    const decor = campDecorations(s);
    expect(decor.some(d => d.id === 'camp-decor:tree-west')).toBe(true);
    expect(decor.some(d => d.id.startsWith('camp-decor:workshop-leaf-'))).toBe(true);
    expect(decor.some(d => /supply|departure|tree-east/.test(d.id))).toBe(false);
  });

  it('finishes districts independently and adds each district floor, label and planting only once', () => {
    const s = stateAt(); s.camp = { prologue: 'building', introComplete: false, introSeconds: 0, builtFacilities: ['shop'] };
    expect(campAreaLabels(s)).toEqual([]); expect(campDecorations(s)).toEqual([]);
    s.camp.builtFacilities!.push('summon');
    expect(campAreaLabels(s).map(label => label.lines[0].text)).toEqual(['补给区']);
    const supplyDecor = campDecorations(s);
    expect(supplyDecor.some(d => d.id === 'camp-decor:tree-east')).toBe(true);
    expect(supplyDecor.filter(d => d.id.startsWith('camp-decor:supply-leaf-'))).toHaveLength(4);
    expect(supplyDecor.some(d => /workshop|departure|tree-west/.test(d.id))).toBe(false);
    expect(campDecorations(s, ['supply']).map(d => d.id)).toEqual(['camp-decor:tree-east']);

    s.camp.builtFacilities!.push('departure');
    expect(campAreaLabels(s).map(label => label.lines[0].text)).toEqual(['补给区', '出击区']);
    const images = { workshop: {} as CanvasImageSource, supply: {} as CanvasImageSource, departure: {} as CanvasImageSource };
    const partial = groundRecording(); drawCampGround(partial.ctx, s, images);
    expect(partial.draws.map(draw => draw[0])).toEqual([images.supply, images.departure]);
    s.camp.builtFacilities!.push('forge', 'warehouse'); s.camp.prologue = 'ready'; s.camp.introComplete = true;
    const completed = groundRecording(); drawCampGround(completed.ctx, s, images);
    expect(completed.draws.map(draw => draw[0])).toEqual([images.workshop, images.supply, images.departure]);
    expect(campAreaLabels(s)).toHaveLength(3);
    expect(campDecorations(s).filter(d => d.id.startsWith('camp-decor:workshop-leaf-'))).toHaveLength(4);
  });

  it('refreshes the cached ground when a district completes without rebuilding it for unrelated scene ticks', () => {
    const rasters: { canvas: HTMLCanvasElement; recording: ReturnType<typeof groundRecording> }[] = [];
    const owner = { createElement(tag: string) {
      expect(tag).toBe('canvas'); const recording = groundRecording();
      const canvas = { width: 0, height: 0, getContext: () => recording.ctx } as unknown as HTMLCanvasElement;
      rasters.push({ canvas, recording }); return canvas;
    } } as unknown as Document;
    const live = groundRecording(owner), s = stateAt();
    s.camp = { prologue: 'building', introComplete: false, introSeconds: 0, builtFacilities: ['warehouse'] };
    const workshop = {} as CanvasImageSource, images = { workshop };
    drawCampGround(live.ctx, s, images);
    expect(rasters).toHaveLength(1); expect(rasters[0].recording.draws).toEqual([]);
    expect(live.draws.at(-1)![0]).toBe(rasters[0].canvas);

    s.camp.introSeconds = 100; s.camp.activeConstruction = 'forge'; s.camp.constructionSeconds = 1;
    drawCampGround(live.ctx, s, images); expect(rasters).toHaveLength(1);
    s.camp.builtFacilities!.push('forge'); delete s.camp.activeConstruction;
    drawCampGround(live.ctx, s, images);
    expect(rasters).toHaveLength(2);
    expect(rasters[1].recording.draws.map(draw => draw[0])).toEqual([workshop]);
    expect(live.draws.at(-1)![0]).toBe(rasters[1].canvas);
    drawCampGround(live.ctx, s, images); expect(rasters).toHaveLength(2);
    s.camp.builtFacilities!.push('shop');
    drawCampGround(live.ctx, s, images); expect(rasters).toHaveLength(2);
    s.camp.builtFacilities!.push('summon');
    drawCampGround(live.ctx, s, images); expect(rasters).toHaveLength(3);
    expect(rasters[2].recording.draws.map(draw => draw[0])).toEqual([workshop]);
    expect(rasters[2].recording.strokes.filter(color => color === '#e2d6b9')).toHaveLength(2);
  });
});
