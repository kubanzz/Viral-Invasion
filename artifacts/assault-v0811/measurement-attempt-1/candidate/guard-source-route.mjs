/** New optional public-input policy; never used by the original-policy comparison. */
export function createGuardSourceRoute(session, api) {
  const { distance, normalized, activeWorld, endlessCombatStats } = api;
  const guards = new Map(), attempted = new Set(), decisions = [];
  const point = value => ({ x: value.x, y: value.y });
  let announced = new Set(), lastDecision = null;
  session.bus.on('event', event => {
    const s = session.state;
    if (event.type === 'ENDLESS_SOURCE_ANNOUNCED') announced.add(event.data.id);
    if (event.type === 'IMMUNE_GUARD_ASSIGNED' && s.endless.source && announced.has(s.endless.source.id))
      guards.set(s.endless.source.id, { at: s.elapsed, beaconId: event.data.beaconId,
        plannedUntil: event.data.plannedUntil, actualBeaconUntilAtEvent: s.growth.beacon?.until ?? null });
  });
  function apply(s, buildName, base, helpers) {
    const source = s.endless.source, stats = endlessCombatStats(s.endlessGrowth), beacon = s.growth.beacon;
    const repair = s.tissue.hp < 72 || s.player.hp < stats.maxHp * .55 && s.tissue.hp < 99;
    const danger = s.targets.some(enemy => enemy.hp > 0 && helpers.threatening(enemy, s.player, activeWorld(s), s.player.radius));
    let decision = repair ? 'original-repair' : danger ? 'original-dodge' : 'original';
    let input = base;
    if (source?.status === 'active' && announced.has(source.id) && (s.endlessGrowth.ranks.immune ?? 0) >= 3 && !repair && !danger) {
      const order = guards.get(source.id);
      if (!order && !attempted.has(source.id)) {
        const inReach = distance(s.player, s.tissue) <= 640 + 1e-7;
        if (!inReach) {
          const destination = { x: s.tissue.x - 90, y: s.tissue.y - 55 }, next = helpers.waypoint(s, destination);
          const move = distance(s.player, destination) > 12 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
          input = { ...base, moveX: move.x, moveY: move.y, scan: false }; decision = 'approach-tissue-for-guard';
        } else if (s.scanReady <= s.elapsed) {
          attempted.add(source.id);
          input = { ...base, aim: point(s.tissue), scan: true }; decision = 'request-guard-at-tissue';
        } else { input = { ...base, scan: false }; decision = 'wait-public-scan-ready-for-guard'; }
      } else if (order && beacon?.id === order.beaconId && beacon.guard && beacon.until > s.elapsed) {
        const actual = s.targets.find(target => target.id === source.id && target.hp > 0), position = source.position;
        const gap = distance(s.player, position), away = normalized(s.player.x - position.x, s.player.y - position.y);
        let destination = point(s.player);
        if (gap > 280 || !helpers.visible(s, position, actual?.radius ?? 34)) destination = point(position);
        else if (gap < 150) destination = { x: position.x + away.x * 250, y: position.y + away.y * 250 };
        const next = helpers.waypoint(s, destination), move = distance(s.player, destination) > 12 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
        const nearby = s.targets.filter(target => target.hp > 0 && distance(target, position) <= stats.areaRadius + target.radius).length;
        const area = !!actual && s.cooldowns[2] <= s.elapsed && nearby >= 3;
        input = { ...base, moveX: move.x, moveY: move.y, aim: point(position), fire: !!actual, tool: area ? 2 : 1, scan: false,
          interact: !!actual && distance(s.player, s.battle.pulse.origin) < 90 && s.battle.pulse.readyAt <= s.elapsed };
        decision = actual ? 'guard-accepted-clear-live-source' : 'guard-accepted-approach-announced-source';
      }
    }
    // Preserve an accepted finite guard even during original repair/dodge overrides.
    if (beacon?.guard && beacon.until > s.elapsed && decision !== 'request-guard-at-tissue') input = { ...input, scan: false };
    if (decision !== lastDecision) { decisions.push({ tick: s.tick, at: s.elapsed, wave: s.endless.wave, decision,
      sourceId: source?.id ?? null, player: point(s.player), fire: input.fire, tool: input.tool, scan: input.scan }); lastDecision = decision; }
    return input;
  }
  return { apply, result: () => ({ policy: 'guard-then-source', attemptedSourceIds: [...attempted], acceptedGuardSources: [...guards], decisions,
    scope: 'Separate new public policy. No no-fire cell window, enemy survival requirement, lifetime extension, direct damage or position injection.' }) };
}
