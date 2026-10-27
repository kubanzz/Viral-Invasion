import { build } from 'esbuild';
import { access, mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const outputPath = resolve('artifacts/gameplay-v078/pressure-baseline.json');
try { await access(outputPath); throw new Error(`Refusing to overwrite ${outputPath}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const sourcePaths = ['src/game/session.ts', 'src/game/battle.ts', 'src/game/endless.ts', 'src/game/endlessGrowth.ts', 'src/game/growth.ts', '.tools/endless-pressure-baseline.mjs'];
const fingerprints = await Promise.all(sourcePaths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
const compiled = await build({ stdin: { contents: "export {GameSession} from './src/game/session'; export {distance,normalized,wallHit} from './src/actors/collision'; export {activeWorld} from './src/game/types';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { GameSession, distance, normalized, wallHit, activeWorld } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const priorities = ['multishot', 'power', 'haste', 'pierce', 'vitality', 'immune', 'nova', 'dash', 'scan'];

function run(seed) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start();
  const waveRecords = new Map(), choices = [], inputHash = createHash('sha256');
  let maxLiving = 0, maxConcurrent = 0, playerDamage = 0, organDamage = 0, telegraphs = 0, acceptedHits = 0;
  const births = new Map(), eliteAppearances = [], damageByActor = new Map();
  let stop = 'simulation-budget', waveStartedAt = 0;
  const record = wave => {
    if (!waveRecords.has(wave)) waveRecords.set(wave, { wave, enteredAt: session.state.elapsed, combatStartedAt: null, clearedAt: null,
      playerDamage: 0, organDamage: 0, telegraphs: 0, acceptedHits: 0, maxLiving: 0, playerHpAtClear: null, tissueHpAtClear: null });
    return waveRecords.get(wave);
  };
  record(1);
  session.bus.on('event', event => {
    const s = session.state, wave = s.endless.wave, current = record(wave);
    if (event.type === 'ENDLESS_WAVE_WARNING') waveStartedAt = s.elapsed;
    if (event.type === 'ENDLESS_WAVE_STARTED') current.combatStartedAt = s.elapsed;
    if (event.type === 'ACTOR_SPAWNED') {
      const actor = s.targets.find(target => target.id === event.data.id);
      if (actor) {
        births.set(actor.id, s.elapsed);
        if (actor.role === 'elite') eliteAppearances.push({ id: actor.id, wave, bornAt: s.elapsed, traits: actor.traits, hp: actor.hp,
          distanceAtBirth: distance(s.player, actor), firstTelegraphAt: null, clearedAt: null });
      }
    }
    if (event.type === 'ATTACK_TELEGRAPHED') {
      telegraphs++; current.telegraphs++;
      const elite = eliteAppearances.find(item => item.id === event.data.actorId);
      if (elite && elite.firstTelegraphAt === null) elite.firstTelegraphAt = s.elapsed;
    }
    if (event.type === 'PLAYER_HURT') {
      const damage = Number(event.data.damage) || 0; playerDamage += damage; current.playerDamage += damage;
      damageByActor.set(String(event.data.actorId), (damageByActor.get(String(event.data.actorId)) ?? 0) + damage);
    }
    if (event.type === 'ORGAN_INTEGRITY_CHANGED' && Number(event.data.before) > Number(event.data.after)) {
      const damage = Number(event.data.before) - Number(event.data.after); organDamage += damage; current.organDamage += damage;
    }
    if (event.type === 'TARGET_HIT' && Number(event.data.damage) > 0) { acceptedHits++; current.acceptedHits++; }
    if (event.type === 'TARGET_CLEARED') {
      const elite = eliteAppearances.find(item => item.id === event.data.id); if (elite) elite.clearedAt = s.elapsed;
    }
    if (event.type === 'ENDLESS_WAVE_CLEARED') {
      current.clearedAt = s.elapsed; current.playerHpAtClear = s.player.hp; current.tissueHpAtClear = s.tissue.hp;
    }
  });

  function choosePending() {
    for (let count = 0; count < 12 && session.state.phase === 'paused'; count++) {
      const s = session.state;
      if (s.growth.draft) {
        const id = s.growth.draft.id, result = session.discardDraft(id);
        if (result.kind !== 'discarded') throw new Error(`Cannot discard protocol draft: ${JSON.stringify(result)}`);
        choices.push({ wave: s.endless.wave, type: 'protocol-discard', id }); continue;
      }
      const draft = s.endlessGrowth.draft;
      if (draft) {
        const option = draft.options.slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
        if (!session.chooseCombatUpgrade(draft.id, option.id, s.growth.runId)) throw new Error(`Combat selection rejected: ${draft.id}`);
        choices.push({ wave: draft.wave, type: 'combat-upgrade', id: option.id }); continue;
      }
      session.resume();
    }
    if (session.state.phase === 'paused') throw new Error('Unresolved modal pause');
  }

  for (let step = 0; step < 900 * 60; step++) {
    const s = session.state;
    if (s.phase === 'paused') choosePending();
    if (s.phase === 'result') { stop = 'real-failure'; break; }
    if (s.endless.clearedWaves >= 10) { stop = 'ten-waves-cleared'; break; }
    if (s.elapsed - waveStartedAt > 120) { stop = 'wave-time-budget-120s'; break; }
    const candidates = s.targets.filter(target => target.hp > 0).filter(target => {
      const length = distance(s.player, target);
      const wall = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), length, activeWorld(s));
      return wall === null || wall >= length - target.radius;
    }).sort((a, b) => distance(s.player, a) - distance(s.player, b) || a.id.localeCompare(b.id));
    const target = candidates[0];
    const input = { moveX: 0, moveY: 0, tool: 1, fire: !!target, aim: target ? { x: target.x, y: target.y } : { x: s.player.x + 1, y: s.player.y } };
    inputHash.update(JSON.stringify(input)); session.step(input);
    const live = s.targets.filter(target => target.hp > 0), pending = live.filter(target => target.attackAt !== undefined).length;
    maxLiving = Math.max(maxLiving, live.length); maxConcurrent = Math.max(maxConcurrent, pending);
    record(s.endless.wave).maxLiving = Math.max(record(s.endless.wave).maxLiving, live.length);
    if (live.length > 24 || pending > 3) throw new Error('Production population or attack-concurrency cap exceeded');
  }
  const s = session.state;
  return { seed, stop, elapsed: s.elapsed, phase: s.phase, wave: s.endless.wave, clearedWaves: s.endless.clearedWaves,
    result: s.result, finalPlayerHp: s.player.hp, finalTissueHp: s.tissue.hp, totalPlayerDamage: playerDamage, totalOrganDamage: organDamage,
    telegraphs, maxConcurrentTelegraphs: maxConcurrent, maxLiving, acceptedPositiveHits: acceptedHits, shots: s.shots,
    inputs: { movement: 0, scan: s.scans, dashes: s.dashes, toolsUsed: [1], interact: false, inputSha256: inputHash.digest('hex') },
    finalPosition: { x: s.player.x, y: s.player.y }, finalGrowth: { level: s.endlessGrowth.level, ranks: s.endlessGrowth.ranks },
    waves: [...waveRecords.values()], elites: eliteAppearances, choices,
    liveAtStop: s.targets.filter(target => target.hp > 0).map(target => {
      const d = distance(s.player, target), hit = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), d, activeWorld(s));
      return { id: target.id, x: target.x, y: target.y, hp: target.hp, traits: target.traits, generation: target.generation,
        distance: d, lineOfSightBlocked: hit !== null && hit < d - target.radius, bornAt: births.get(target.id), attackAt: target.attackAt ?? null };
    }), damageByActor: Object.fromEntries(damageByActor) };
}

const results = [7, 71].map(run);
const report = { schemaVersion: 1, measuredAtUtc: new Date().toISOString(), purpose: 'Real GameSession stationary precision-only pressure baseline; gameplay simulation,not a browser/performance/human-fun acceptance.',
  command: 'node .tools/endless-pressure-baseline.mjs', strategy: { movement: false, attacks: 'tool1 held,aim nearest unobstructed living target every tick',
    unused: ['Q', 'tool2', 'tool3', 'dash', 'interact'], combatUpgradePriority: priorities,
    protocolDrafts: 'Public discardDraft; initial IMMUNE_BEACON remains inactive because Q is never used.',
    stop: '10 actual completed waves,real failure,or120 simulation seconds on one wave; no automatic wall navigation.',
    mutationScope: 'Only public GameSession start/step/discardDraft/chooseCombatUpgrade/resume actions; no HP,world,target,position,wave,clock or equipment-state injection.' },
  fingerprints, results };
await mkdir(dirname(outputPath), { recursive: true });
const handle = await open(outputPath, 'wx');
try { await handle.writeFile(JSON.stringify(report, null, 2)); } finally { await handle.close(); }
console.log(JSON.stringify({ outputPath, results: results.map(({ seed, stop, elapsed, wave, clearedWaves, finalPlayerHp, finalTissueHp, totalPlayerDamage, totalOrganDamage, telegraphs, maxLiving, elites, liveAtStop }) =>
  ({ seed, stop, elapsed, wave, clearedWaves, finalPlayerHp, finalTissueHp, totalPlayerDamage, totalOrganDamage, telegraphs, maxLiving, elites, liveAtStop })) }, null, 2));
