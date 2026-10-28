import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { classifyCaptureOverlap, summarizeFrameIntervals } = await import(pathToFileURL(resolve('scripts/perf-frame-analysis.mjs')).href);
const frame = (startMs: number, endMs: number) => ({ startMs, endMs, durationMs: endMs - startMs });

describe('screenshot interference annotation', () => {
  it('retains a long capture-overlapping interval in raw metrics and reports unaffected intervals separately', () => {
    const rows = [frame(0, 16), frame(16, 32), frame(32, 532), frame(532, 548)];
    const result = classifyCaptureOverlap(rows, [{ id: 'dense', startMs: 42, endMs: 530 }]);
    expect(result.all).toEqual(summarizeFrameIntervals(rows));
    expect(result.all.maxMs).toBe(500);
    expect(result.captureOverlapping.frames).toBe(1);
    expect(result.overlapping[0].matchingCaptureIds).toEqual(['dense']);
    expect(result.outsideCapture.frames).toBe(3);
    expect(result.outsideCapture.maxMs).toBe(16);
  });
  it('keeps intervals crossing a capture boundary, supports multiple captures and does not infer causation', () => {
    const result = classifyCaptureOverlap([frame(0, 10), frame(10, 20), frame(20, 30)], [
      { id: 'first', startMs: 10, endMs: 10 }, { id: 'second', startMs: 19, endMs: 21 },
    ]);
    expect(result.overlapping.map((row: { matchingCaptureIds: string[] }) => row.matchingCaptureIds)).toEqual([
      ['first'], ['first', 'second'], ['second'],
    ]);
    expect(result.outsideCapture.frames).toBe(0);
    expect(result.outsideCapture.p95Ms).toBeNull();
  });
  it('rejects malformed frame or capture windows', () => {
    expect(() => classifyCaptureOverlap([frame(3, 2)], [])).toThrow('Invalid frame interval');
    expect(() => classifyCaptureOverlap([frame(0, 10)], [{ id: 'bad', startMs: 2, endMs: 1 }])).toThrow('Invalid capture window');
  });
});
