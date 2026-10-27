import { readFile } from 'node:fs/promises';
const path = process.argv[2];
if (!path?.startsWith('artifacts/readability-v076/')) throw Error('Expected this iteration report.');
const report = JSON.parse(await readFile(path, 'utf8'));
const sample = report.samples?.at(-1);
console.log(JSON.stringify({ path, status: report.status, pass: report.pass, activeSimulationSeconds: report.activeSimulationSeconds,
  captured: report.captures, missing: report.missing, errors: report.errors, error: report.error, realResult: report.realResult,
  final: report.final && { phase: report.final.phase, elapsed: report.final.elapsed, hp: report.final.player.hp, tissue: report.final.tissue.hp,
    infection: report.final.battle?.pressure.infection, result: report.final.result },
  sample: sample && { elapsed: sample.elapsed, tick: sample.tick, playerHp: sample.playerHp ?? sample.hp, tissueHp: sample.tissueHp ?? sample.tissue,
    sourceClears: sample.sourceClears, lesson: sample.lesson,
    contexts: sample.contexts?.map(context => ({ kind: context.kind, eligible: context.eligible, witness: context.witness,
      visible: context.visibleMobileCount, world: context.worldLiveMobileCount, nearby: context.nearbyIds?.length,
      foreground: context.foreground?.relevantActorIds, effects: context.activeEffectKinds, particles: context.particleEffectIds,
      playerHud: context.playerHudOverlaps?.length, targetHud: context.targetHudOverlaps?.length, dangerHud: context.dangerHudOverlaps?.length })) } }));
