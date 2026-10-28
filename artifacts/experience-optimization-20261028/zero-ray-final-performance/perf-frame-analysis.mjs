/** Summarize recorded frame intervals without claiming why a frame was long. */
export function summarizeFrameIntervals(intervals) {
  const sorted = intervals.map(frame => frame.durationMs).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const percentile = fraction => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  return { frames: sorted.length, activeDurationMs: total, averageFps: total ? sorted.length * 1000 / total : 0,
    p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: sorted.at(-1) ?? null };
}

/** Capture overlap marks possible measurement interference, never causation. */
export function classifyCaptureOverlap(intervals, captures) {
  for (const frame of intervals) {
    if (![frame.startMs, frame.endMs, frame.durationMs].every(Number.isFinite)
      || frame.endMs < frame.startMs || frame.durationMs < 0) throw new Error('Invalid frame interval');
  }
  for (const capture of captures) {
    if (![capture.startMs, capture.endMs].every(Number.isFinite) || capture.endMs < capture.startMs) throw new Error('Invalid capture window');
  }
  const overlapping = [], outside = [];
  for (const frame of intervals) {
    const matchingCaptureIds = captures.filter(c => frame.startMs <= c.endMs && frame.endMs >= c.startMs).map(c => c.id);
    const marked = { ...frame, matchingCaptureIds };
    (matchingCaptureIds.length ? overlapping : outside).push(marked);
  }
  return { all: summarizeFrameIntervals(intervals), captureOverlapping: summarizeFrameIntervals(overlapping),
    outsideCapture: summarizeFrameIntervals(outside), overlapping, outside };
}
