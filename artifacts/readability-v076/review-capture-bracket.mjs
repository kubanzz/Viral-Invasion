import { readFile } from 'node:fs/promises';
const path = process.argv[2];
if (!path?.startsWith('artifacts/readability-v076/')) throw Error('Expected this iteration sidecar.');
const item = JSON.parse(await readFile(path, 'utf8'));
console.log(JSON.stringify({ path, bracketValid: item.bracketValid, spanTicks: item.after.state.tick - item.before.state.tick,
  qualifications: Object.fromEntries(['before', 'after'].map(side => { const q = item.qualification[side], s = item[side].state;
    return [side, { tick: s.tick, elapsed: s.elapsed, eligible: q.eligible, witness: q.witness, visible: q.visibleMobileCount,
      nearby: q.nearbyIds, foreground: q.foreground.relevantActorIds, particleIds: q.particleEffectIds,
      effects: s.effects.map(e => ({ id: e.id, kind: e.kind, remaining: e.born + e.duration - s.elapsed })),
      playerHud: q.playerHudOverlaps, targetHud: q.targetHudOverlaps, dangerHud: q.dangerHudOverlaps }]; })) }));
