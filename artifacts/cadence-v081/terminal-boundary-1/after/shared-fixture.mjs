function terminalFissionBoundary(Session, terminal, lethal, fissionFirst) {
  const session = new Session(71, { mode: "endless" });
  session.start();
  const s = session.state, events = [];
  s.world = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(s.player, { x: 600, y: 700, hp: terminal === "player" && lethal ? 1 : 100, dashUntil: 0 });
  Object.assign(s.tissue, { x: 1400, y: 700, hp: terminal === "tissue" && lethal ? 1 : 100 });
  Object.assign(s.endless, { phase: "combat", remainingToSpawn: 2, nextSpawnAt: 100 });
  const body = (id, x, y) => ({
    id,
    x,
    y,
    kind: "single",
    role: "virus",
    radius: 22,
    hp: 68,
    maxHp: 68,
    hitUntil: 0,
    scanned: false,
    traits: [],
    facing: 0,
    born: 0,
    attackReady: 0,
    generation: 0,
    sourceId: "endless:wave:1"
  });
  const victim = terminal === "player" ? s.player : s.tissue;
  const killer = { ...body("killer", victim.x - 45, victim.y), attackAt: 1 / 60, attackAim: { x: victim.x, y: victim.y }, attackTarget: terminal, attackRadius: 58 };
  const pending = {
    ...body("pending-fission", 820, 700),
    kind: "cluster",
    hp: 0,
    deadAt: 0,
    traits: ["FISSION"],
    splitAt: 1 / 60,
    splitPositions: [{ x: 793, y: 710 }, { x: 847, y: 710 }]
  };
  const later = body("later-threat", s.player.x + 45, s.player.y);
  s.targets = fissionFirst ? [pending, killer, later] : [killer, pending, later];
  const before = session.snapshot();
  session.bus.on("event", (event) => events.push({ ...structuredClone(event), observedPlayerHp: s.player.hp, observedTissueHp: s.tissue.hp, observedPhase: s.phase }));
  session.step({ moveX: 0, moveY: 0, aim: { x: s.player.x + 1, y: s.player.y }, fire: false });
  return { session, s, events, before, pending, later };
}
export {
  terminalFissionBoundary
};
