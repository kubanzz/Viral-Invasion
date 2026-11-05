
import { Renderer } from './src/render/phaserRenderer';
import { GameSession } from './src/game/session';
import { createWeaponCombat } from './src/game/weaponSkills';
const renderer = new Renderer(document.querySelector('canvas'));
await renderer.ready;
window.__weaponFixture = {
  async show(weaponId, facing) {
    const session = new GameSession(71, { mode: 'endless', territory: true }); session.start();
    const state = session.state;
    state.weaponCombat = createWeaponCombat({ weaponId, rarity: 'white', upgrade: 0 });
    state.expedition.loadout = { weaponId, rarity: 'white', upgrade: 0 };
    state.elapsed = 1.2; state.tick = 72; state.targets = []; state.events = []; state.effects = [];
    state.playerProjectiles = []; state.playerFlight = undefined;
    Object.assign(state.player, { x: 1200, y: 750, facing, moving: false, hurtUntil: 0, dashUntil: 0, actionUntil: 0 });
    if (state.growth) { state.growth.cells = []; state.growth.beacons = []; state.growth.beacon = null; state.growth.marks = []; }
    const aim = { x: state.player.x + Math.cos(facing) * 220, y: state.player.y + Math.sin(facing) * 220 };
    renderer.prepareCamera(state, { snap: true }); renderer.render(state, aim, { cameraPrepared: true });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { diagnostics: renderer.diagnostics(state), foot: renderer.camera.worldToScreen(state.player), cameraScale: renderer.camera.scale };
  }
};
window.__weaponFixtureReady = true;
