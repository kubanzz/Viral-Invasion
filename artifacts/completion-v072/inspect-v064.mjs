import fs from 'node:fs';
const root = 'artifacts/completion-v072/browser/attempt-1/output';
const cases = [];
for (const project of ['chrome', 'edge']) {
  const evidence = `${root}/feedback-v064-obstacle-vis-b01a4--then-win-and-retry-cleanly-${project}/obstacle-visibility-evidence.json`;
  if (!fs.existsSync(evidence)) { cases.push({ project, evidence, pending: true }); continue; }
  const raw = JSON.parse(fs.readFileSync(evidence, 'utf8'));
  const shape = state => state && ({ tick: state.tick, elapsed: state.elapsed, phase: state.phase,
    stage: state.campaign?.encounters?.stage, organ: state.battle?.organId,
    equipped: state.growth?.equipped, sources: state.targets?.filter(target => target.role === 'source').map(target => ({ id: target.id, hp: target.hp, x: target.x, y: target.y })),
    live: state.targets?.filter(target => target.hp > 0).map(target => ({ id: target.id, role: target.role, hp: target.hp, x: target.x, y: target.y, traits: target.traits })),
    accepted: state.runMetrics?.summary.control });
  cases.push({ project, evidence, bundle: raw.bundleSha256, selectedScreenshot: raw.selectedScreenshot,
    acceptedBites: raw.acceptedBites?.length, attempts: raw.attempts?.length, final: shape(raw.final),
    drafts: raw.drafts.map(item => ({ selected: item.selected, before: shape(item.before), after: shape(item.after) })),
    demonstrations: raw.demonstrations.map(item => ({ before: shape(item.before), skipped: item.skipped,
      target: item.target, squad: item.squad, acceptedBites: item.acceptedBites?.length,
      afterWalk: shape(item.preparation?.afterWalk), observations: item.preparation?.observations?.map(observation => ({ tick: observation.tick, phase: observation.phase, player: observation.player, targets: observation.targets, scanReady: observation.scanReady, beaconReadyAt: observation.beaconReadyAt })), after: shape(item.after) })),
    errors: raw.errors, remote: raw.remote });
}
const result = { method: 'Read-only analysis of failed/present per-case raw while the parent suite is frozen and running; no browser execution, source edits or test edits.', cases,
  sourceFindings: [
    { path: 'tests/e2e/feedback-v064-obstacle-visibility.spec.ts', marker: "target.role === 'virus'", fact: 'Driver early guard and candidate selection ignore live elites. It also only calls demonstration after each draft, not routinely when later production arrives.' },
    { path: 'tests/helpers/g3Driver.ts', marker: "t.role==='source'?-3:t.role==='elite'?-2", fact: 'Default fullRun plan clears source-b before the guardian, reducing future mobile-target supply by the time both pair members are acquired.' },
    { path: 'src/game/encounterConfig.ts', marker: 'opening', fact: 'Guided opening production is bounded until its accepted guardian resolves; simply waiting forever for new ordinary bodies before guardian clear is not a valid repair.' },
  ],
  recommendedNormalInputRoute: [
    'Keep source-b alive through the visual demonstration by overriding only target priorities via fullRun inputOverride; clear source-a and scan normally for the first XP card.',
    'Prioritize the actual first guardian, using real valve pulse plus basic precision for guided counter. This advances the encounter, produces the second earned card and restores normal finite production.',
    'Choose Beacon/Trace using real draft buttons. When both are present, stop destructive fire near source-b, lure actual surviving mobile bodies with WASD toward fold-b and wait for real Q and squad cooldowns.',
    'Repeat bounded lure/Q observation if no accepted marked bite or screenshot bracket yet. Preserve enemies by withholding fire, not writing HP or preserving state artificially; real failure must remain possible.',
    'Keep same original proof: three same current squad cells at full draw alpha, actual upper-body fold overlap at both screenshot endpoints, same-squad positive marked accepted bite, complete victory and clean retry.',
    'Use runMetrics beaconBites plus actual same-root TARGET_HIT/PROTOCOL_BEACON_HIT attribution for hit facts; do not replace proof with activations, body spacing alone or a cue from another squad.',
  ],
  feasibilityLimits: 'If only an elite survives, broadening eligible mobile targets may be truthful but should still require real lure reachability/contact/marked bite and the same screenshot/body predicates. Preserving source-b is more reliable than depending on finite opening ordinary bodies. Root must wait for current suite terminal before any test change; this artifact proposes strategy only.' };
fs.writeFileSync('artifacts/completion-v072/v064-driver-analysis.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ path: 'artifacts/completion-v072/v064-driver-analysis.json', cases: cases.map(item => ({ project: item.project, pending: item.pending, acceptedBites: item.acceptedBites, attempts: item.attempts, demonstrations: item.demonstrations?.map(demo => ({ tick: demo.before?.tick, stage: demo.before?.stage, skipped: demo.skipped, liveRoles: demo.before?.live?.map(target => `${target.role}:${target.id}`), sources: demo.before?.sources })) })) }, null, 2));
