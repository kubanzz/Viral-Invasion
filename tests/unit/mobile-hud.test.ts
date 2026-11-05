import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { TERRITORY_CANNON_BALANCE } from '../../src/game/territoryCannon';
import { initializeConstruction } from '../../src/game/construction';
import { MotherCoreController } from '../../src/game/motherCore';
import { copyMobileMinimap, mobileChargeView, mobileCooldownViews, mobileHudMarkup, mobileHudView, setMobileDetailsOpen, updateMobileHud } from '../../src/ui/mobileHud';
import { createWeaponCombat, weaponSkillViews } from '../../src/game/weaponSkills';
import { touchCopy } from '../../src/ui/touchCopy';

afterEach(() => vi.unstubAllGlobals());
const campaign = () => { const game = new GameSession(71, { campaign: true, milestone: 'G3' }); game.start(); return game; };

describe('touch battlefield status', () => {
  it('does not advertise a loaded launcher before construction and distinguishes an infected facility', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    const s = game.state; Object.assign(s.player, TERRITORY_CANNON_BALANCE.origin);
    expect(mobileHudView(s).interaction).toMatchObject({ label: '建造', nearby: false, hint: '战术栏选择蓝图，派军团施工' });
    initializeConstruction(s, ['launch-pod']);
    s.territory!.construction!.building = { id: 'infected-pod', blueprintId: 'launch-pod', ...TERRITORY_CANNON_BALANCE.origin, nodeId: 'core', builtAt: 0 };
    s.territory!.nodes.find(n => n.id === 'core')!.owner = 'infected';
    expect(mobileHudView(s).interaction).toMatchObject({ label: '停用', nearby: false, hint: '先净化建筑所在区域' });
    expect(mobileHudMarkup).toContain('id="mobile-tactical-menu"');
    expect(mobileHudMarkup).toContain('id="mobile-build-open"');
  });
  it('exposes the nearby cannon with its authoritative reload instead of the legacy pulse', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    const state = game.state; Object.assign(state.player, TERRITORY_CANNON_BALANCE.origin);
    initializeConstruction(state, ['launch-pod']);
    state.territory!.construction!.building = { id: 'mobile-pod', blueprintId: 'launch-pod',
      ...TERRITORY_CANNON_BALANCE.origin, nodeId: 'core', builtAt: 0 };
    expect(mobileHudView(state).interaction).toMatchObject({ label: '弹射', nearby: true });
    state.territory!.cannon = { readyAt: state.elapsed + 12, serial: 0 };
    expect(mobileHudView(state).interaction).toMatchObject({ label: '装填', nearby: true, hint: '装填 12秒' });
    expect(mobileCooldownViews(state).interact).toEqual({ remaining: 12, ratio: .5, label: '12' });
    state.player.x += 111;
    expect(mobileHudView(state).interaction.nearby).toBe(false);
  });

  it('points an infected or fragile player to a healthy spring, not any healthy frontline', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start(); const state = game.state;
    state.player.hp = 14; state.playerInfection = { until: state.elapsed + 8, nextTickAt: state.elapsed + 1 };
    expect(mobileHudView(state).warnings).toContainEqual({ kind: 'fatal', text: '耐久濒危 · 立即回泉' });
    expect(mobileHudView(state).warnings.some(warning => warning.text.includes('前往健康生命泉'))).toBe(true);
  });

  it('keeps nearby purification independent from weapon 3 and leaves legacy repair intact', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start(); const state = game.state;
    state.endless!.tutorial!.fired = true; state.endlessGrowth!.ranks.multishot = 1; state.cooldowns[3] = 20;
    const caption = { textContent: '' }, attributes = new Map<string, string>();
    const cleanse = { dataset: { touchAction: 'territory', active: 'false', contextual: '' }, disabled: false,
      style: { setProperty: vi.fn() }, querySelector: () => caption,
      setAttribute: (name: string, value: string) => attributes.set(name, value) };
    const repairCaption = { textContent: '' }, repairAttributes = new Map<string, string>();
    const legacyRepair = { dataset: { cooldown: '3', active: 'false', ready: '', cooling: '' }, disabled: false,
      style: { setProperty: vi.fn() }, querySelector: () => repairCaption,
      setAttribute: (name: string, value: string) => repairAttributes.set(name, value) };
    const nodes = new Map([...mobileHudMarkup.matchAll(/id="([^"]+)"/g)].map(match => [match[1], {
      textContent: '', innerHTML: '', hidden: false, dataset: {} as Record<string, string>, style: { width: '' },
    }]));
    const root = nodes.get('mobile-controls')!;
    Object.assign(root, { querySelectorAll: () => [legacyRepair], querySelector: (selector: string) => selector === '[data-touch-action="territory"]' ? cleanse : selector === '[data-touch-skill="3"]' ? legacyRepair : null });
    vi.stubGlobal('document', { getElementById: (id: string) => nodes.get(id) ?? null });
    updateMobileHud(state);
    expect(cleanse.disabled).toBe(true); expect(caption.textContent).toBe('净化');
    expect(root.dataset.weaponMode).toBe('true');
    Object.assign(state.player, state.territory!.nodes.find(node => node.id === 'front-north')!);
    const before = structuredClone(state); updateMobileHud(state);
    expect(cleanse.disabled).toBe(false); expect(cleanse.dataset.contextual).toBe('true');
    expect(legacyRepair.disabled).toBe(true);
    expect(caption.textContent).toBe('净化'); expect(attributes.get('aria-label')).toContain('不切换武器');
    expect(attributes.get('aria-label')).not.toContain('拖向');
    expect(nodes.get('mobile-hp')!.textContent).toBe('100/100');
    expect(nodes.get('mobile-combat-readout')!.textContent).toMatch(/^余敌\d+ · 3弹$/);
    expect(state).toEqual(before);
    state.tissue.hp = 50; Object.assign(state.player, state.tissue); updateMobileHud(state);
    expect(caption.textContent).toBe('抢修'); expect(cleanse.disabled).toBe(false);
    delete state.territory; updateMobileHud(state);
    expect(repairCaption.textContent).toBe('修复'); expect(repairAttributes.get('aria-label')).toContain('按住瞄准');
    expect(cleanse.disabled).toBe(true); expect(nodes.get('mobile-combat-readout')!.textContent).toBe('');
  });

  it('shows all repaired-weapon skills with their own authoritative names and cooldowns', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start(); const state = game.state;
    state.weaponCombat = createWeaponCombat({ weaponId: 'piercing', rarity: 'white', upgrade: 0 });
    state.elapsed = 10; state.weaponCombat.cooldowns[1] = 13.5;
    const views = weaponSkillViews(state);
    const buttons = ([1, 2, 3] as const).map(slot => ({
      dataset: { weaponSkill: String(slot), active: 'false', ready: '', cooling: '' },
      disabled: false, caption: { textContent: '' }, icon: { dataset: { skillId: '' }, innerHTML: '' }, attributes: new Map<string, string>(),
      style: { setProperty: vi.fn() },
      querySelector(selector: string) { return selector === '.mobile-caption' ? this.caption : this.icon; },
      setAttribute(name: string, value: string) { this.attributes.set(name, value); },
    }));
    const nodes = new Map([...mobileHudMarkup.matchAll(/id="([^"]+)"/g)].map(match => [match[1], {
      textContent: '', innerHTML: '', hidden: false, dataset: {} as Record<string, string>, style: { width: '' },
    }]));
    Object.assign(nodes.get('mobile-controls')!, {
      querySelectorAll: (selector: string) => selector === '[data-weapon-skill]' ? buttons : [], querySelector: () => null,
    });
    vi.stubGlobal('document', { getElementById: (id: string) => nodes.get(id) ?? null });
    const before = structuredClone(state); updateMobileHud(state);
    expect(buttons.map(button => button.caption.textContent)).toEqual(views.map(view => view.name));
    expect(buttons.map(button => button.icon.dataset.skillId)).toEqual(views.map(view => view.id));
    expect(new Set(buttons.map(button => button.icon.innerHTML)).size).toBe(3);
    expect(buttons.map(button => button.disabled)).toEqual([true, false, false]);
    expect(nodes.get('mobile-weapon-1-ready')!.textContent).toBe('3.5');
    expect(nodes.get('mobile-weapon-2-ready')!.textContent).toBe('');
    expect(buttons[0].style.setProperty).toHaveBeenCalledWith('--cooldown', String(3.5 / views[0].cooldown));
    expect(buttons[2].attributes.get('aria-label')).toContain('3号武器技能');
    expect(state).toEqual(before);
    buttons[0].dataset.active = 'true'; updateMobileHud(state);
    expect(buttons[0].disabled).toBe(false);
    state.weaponCombat = createWeaponCombat({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    updateMobileHud(state);
    expect(buttons.map(button => button.icon.dataset.skillId)).toEqual(['steady-burst', 'steady-repulse', 'steady-overdrive']);
    expect(buttons[0].icon.innerHTML).toContain('data-weapon-skill-icon="steady-burst"');
    updateMobileHud(state, { blocked: true }); expect(buttons.every(button => button.disabled)).toBe(true);
    delete state.territory; updateMobileHud(state); expect(buttons.every(button => button.disabled)).toBe(true);
  });

  it('does not show charged-dash sword controls or overload weapon 3 in territory copy', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    game.state.chargedSlash = { startedAt: 0, aim: game.state.player };
    expect(mobileChargeView(game.state)).toEqual({ charging: false, progress: 0, remaining: 0, label: '' });
    expect(touchCopy('按 F 净化组织；按 3 释放技能；R 注射抗体', true)).toBe('点净化组织；点技能 3 释放技能；战术栏抗体 注射抗体');
    expect(touchCopy('按3修复', false)).toBe('选择工具 3修复');
    const ids = [...mobileHudMarkup.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(mobileHudMarkup.match(/data-weapon-skill="[123]"/g)).toHaveLength(3);
    expect(mobileHudMarkup).toContain('data-touch-action="territory"');
    expect(mobileHudMarkup).toMatch(/mobile-tactical-panel[\s\S]*mobile-menu-antibody[\s\S]*<\/details>/);
  });

  it('shows charge progress independently from the normal dash cooldown', () => {
    const game = new GameSession(42, { mode: 'endless' }); game.start(); const state = game.state;
    state.elapsed = 8; state.player.dashReady = 9; state.chargedSlashReadyAt = 0;
    expect(mobileChargeView(state)).toMatchObject({ charging: false, remaining: 0, label: '长按剑气' });
    state.chargedSlash = { startedAt: 7, aim: { x: 900, y: 400 } };
    expect(mobileChargeView(state).progress).toBeCloseTo(.75);
    state.elapsed = 8.25; expect(mobileChargeView(state)).toMatchObject({ charging: true, progress: 1, label: '满蓄 · 松开' });
    state.chargedSlash = undefined; state.chargedSlashReadyAt = 14.25;
    expect(mobileChargeView(state)).toMatchObject({ charging: false, remaining: 6 });
  });
  it('retains crisis, mutation, migration and host warnings without changing simulation', () => {
    const game = campaign(), state = game.state;
    expect(game.debugHostEvent('MEDICATION').ok).toBe(true);
    state.elapsed = 5;
    state.battle!.pressure.criticalSince = 1;
    state.battle!.warning = { trait: 'CARAPACE', startedAt: 4, applyAt: 12 };
    Object.assign(state.campaign!.migration, { status: 'warning', deadline: 18 });
    const before = structuredClone(state), view = mobileHudView(state);
    expect(view.warnings.find(warning => warning.kind === 'fatal')?.text).toBe('失控 11.0s');
    expect(view.warnings.find(warning => warning.kind === 'mutation')?.text).toBe('晶壳 7.0s');
    expect(view.warnings.find(warning => warning.kind === 'migration')?.text).toBe('迁移 13.0s');
    expect(view.warnings.find(warning => warning.kind === 'host')?.text).toContain('药剂警 0.0s 3/3');
    expect(state).toEqual(before);
  });

  it('shows endangered remote organs and keeps healing points out of E interaction', () => {
    const state = campaign().state;
    state.campaign!.arenas.lung.activated = true; state.campaign!.arenas.lung.tissue.hp = 28;
    const healing = state.battle!.graph.nodes.find(node => node.kind === 'healing')!;
    state.player.x = healing.x; state.player.y = healing.y;
    state.battle!.graph.nodes = [healing];
    const view = mobileHudView(state);
    expect(view.warnings).toContainEqual({ kind: 'organ', text: '肺部回救 28%' });
    expect(view.interaction).toEqual({ label: '交互', hint: '靠近', nearby: false });
  });

  it('counts pending endless enemies and supports upgraded maximum health', () => {
    const game = new GameSession(71, { mode: 'endless' }); game.start();
    const state = game.state;
    state.endless!.wave = 7; state.endless!.remainingToSpawn = 3; state.endless!.pendingChildren = 2;
    state.targets = [{ id: 'living', x: 0, y: 0, kind: 'single', hp: 1, maxHp: 1, radius: 1, hitUntil: 0, scanned: false }];
    state.endlessGrowth!.ranks.vitality = 2;
    const view = mobileHudView(state);
    expect(view.wave).toBe('第7波 · 剩余6');
    expect(view.hp).toBe('100/140');
    expect(view.infection).toBe('');
    expect(view.vitality).toBe('');
    expect(view.notice).toContain('按住右下射击盘');
  });

  it('keeps attack and organ-crisis countdowns in compact warnings', () => {
    const state = campaign().state;
    state.elapsed = 6;
    Object.assign(state.campaign!.encounters!.crisis, { status: 'charging', organId: 'heart', chargeRemaining: 3.2, nextImpactAt: 9.2 });
    const core = state.campaign!.core;
    core.status = 'active'; core.actorId = 'mobile-core';
    core.combat = new MotherCoreController({ coreId: core.actorId, organId: 'heart', traits: ['CARAPACE', 'MIMIC'], tick: state.tick, elapsed: state.elapsed }).state;
    core.combat.phase = 'windup';
    core.combat.attack = { id: 'sweep', kind: 'crystal-sweep', trait: 'CARAPACE', startedAt: 6, resolveAt: 8.5, origin: state.player, aim: state.tissue, angle: 0, range: 330, radius: 0, halfAngle: .66, landings: [] };
    state.targets.push({ ...state.targets[0], id: core.actorId, role: 'core', hp: 340, maxHp: 680 });
    const view = mobileHudView(state);
    expect(view.warnings).toContainEqual({ kind: 'organ', text: '心脏冲击 4s' });
    expect(view.warnings).toContainEqual({ kind: 'core', text: '巢50% 蓄力2.5s 膜2' });
  });

  it('uses a short phase objective and never promotes the introductory tutorial to a notice', () => {
    const state = campaign().state;
    state.message = '感染正在沿血管传播。Q 诊断，1 精准净化，2 清群，3 修复；靠近装置按 E。';
    state.messageUntil = 8;
    const view = mobileHudView(state);
    expect(view.objective).toBe('净化感染源');
    expect(view.notice).toBe('');
    state.message = 'WASD 移动 · 鼠标瞄准 · 左键使用工具';
    expect(mobileHudView(state).notice).toBe('');
    state.elapsed = 20; state.messageUntil = 0;
    expect(mobileHudView(state).notice).toBe('');
    expect(mobileHudMarkup).toContain('data-layout="moba-v4"');
  });

  it('shows genuine feedback for at most four simulation seconds and honors earlier message expiry', () => {
    const state = campaign().state;
    state.elapsed = 5; state.message = '组织褶皱挡住治疗点，请绕到另一侧。'; state.messageUntil = 12;
    const before = structuredClone(state);
    expect(mobileHudView(state).notice).toBe('组织褶皱挡住治疗点，请绕到另一侧');
    expect(state).toEqual(before);
    state.elapsed = 8.9;
    expect(mobileHudView(state).notice).not.toBe('');
    state.elapsed = 9;
    expect(mobileHudView(state).notice).toBe('');
    state.message = '冲刺正在充能。'; state.messageUntil = 10;
    expect(mobileHudView(state).notice).toBe('冲刺正在充能');
    state.elapsed = 10;
    expect(mobileHudView(state).notice).toBe('');
  });

  it('does not keep a repeated extended message alive or share notice timing across runs', () => {
    const state = campaign().state;
    state.elapsed = 10; state.message = '扫描正在充能。'; state.messageUntil = 15;
    expect(mobileHudView(state).notice).not.toBe('');
    state.elapsed = 13; state.messageUntil = 18;
    expect(mobileHudView(state).notice).not.toBe('');
    state.elapsed = 14;
    expect(mobileHudView(state).notice).toBe('');
    const nextRun = campaign().state;
    nextRun.elapsed = 14; nextRun.message = state.message; nextRun.messageUntil = 18;
    expect(mobileHudView(nextRun).notice).toBe('扫描正在充能');
    nextRun.phase = 'paused';
    expect(mobileHudView(nextRun).notice).toBe('');
  });

  it('keeps a guided skill releasable through cooldown and hides input under modal/portrait gates', () => {
    const state = campaign().state;
    const buttons = ['attack', '2', '3', 'dash', 'scan', 'interact', 'antibody'].map(key => ({ dataset: { cooldown: key, ready: '', cooling: '', active: key === '2' ? 'true' : 'false' }, disabled: false, style: { setProperty: vi.fn() }, setAttribute: vi.fn() }));
    const nodes = new Map([...mobileHudMarkup.matchAll(/id="([^"]+)"/g)].map(match => [match[1], { textContent: '', innerHTML: '', hidden: false, dataset: {} as Record<string, string>, style: { width: '' } }]));
    const root = nodes.get('mobile-controls')!;
    Object.assign(root, { querySelectorAll: () => buttons, querySelector: () => null });
    vi.stubGlobal('document', { getElementById: (id: string) => nodes.get(id) ?? null });
    state.cooldowns[1] = 10; state.cooldowns[2] = 10; state.player.dashReady = 10;
    updateMobileHud(state);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[0].dataset.cooling).toBe('true');
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[1].dataset.cooling).toBe('true');
    expect(buttons[3].disabled).toBe(true);
    updateMobileHud(state, { blocked: true });
    expect(buttons.every(button => button.disabled)).toBe(true);
    expect(root.dataset.active).toBe('false');
    state.phase = 'paused'; updateMobileHud(state, { portrait: true });
    expect(nodes.get('mobile-rotate-notice')!.hidden).toBe(false);
    state.phase = 'menu'; updateMobileHud(state, { portrait: true });
    expect(nodes.get('mobile-rotate-notice')!.hidden).toBe(true);
  });

  it('uses actual remaining cooldown fractions and omits ready-state text', () => {
    const state = campaign().state;
    state.elapsed = 10; state.cooldowns = { 1: 10.09, 2: 11, 3: 10.35 };
    state.scanReady = 11.5; state.player.dashReady = 10.75;
    const before = structuredClone(state), cooldowns = mobileCooldownViews(state);
    for (const key of ['attack', '2', '3', 'scan', 'dash'] as const) expect(cooldowns[key].ratio).toBeCloseTo(.5, 8);
    expect(cooldowns[2].label).toBe('1.0');
    expect(state).toEqual(before);
    state.elapsed = 12;
    expect(Object.values(mobileCooldownViews(state)).every(cooldown => cooldown.ratio === 0 && cooldown.label === '')).toBe(true);
    expect(mobileHudMarkup).not.toContain('data-touch-action="cast"');
    expect(mobileHudMarkup).toContain('data-stick="attack"');
    expect(mobileHudMarkup).toContain('data-touch-skill="2"');
    expect(mobileHudMarkup).toContain('data-touch-skill="3"');
    expect(mobileHudMarkup).toContain('data-touch-skill="scan"');
  });

  it('copies the real current-mode map and hides the map entry when training has no map', () => {
    const state = campaign().state, drawImage = vi.fn(), clearRect = vi.fn(), mapButton = { hidden: false };
    const target = { width: 192, height: 116, getContext: () => ({ drawImage, clearRect }) };
    const campaignMap = { width: 196, height: 120 }, endlessMap = { width: 220, height: 130 };
    const nodes = new Map<string, unknown>([['mobile-minimap', target], ['mobile-map-button', mapButton], ['tactical-map', campaignMap], ['endless-minimap', endlessMap]]);
    vi.stubGlobal('document', { getElementById: (id: string) => nodes.get(id) ?? null });
    copyMobileMinimap(state);
    expect(drawImage).toHaveBeenLastCalledWith(campaignMap, 0, 0, 192, 116);
    const endless = new GameSession(71, { mode: 'endless' }); endless.start();
    copyMobileMinimap(endless.state);
    expect(drawImage).toHaveBeenLastCalledWith(endlessMap, 0, 0, 192, 116);
    expect(mapButton.hidden).toBe(false);
    nodes.delete('tactical-map'); copyMobileMinimap(state);
    expect(mapButton.hidden).toBe(true);
  });

  it('moves the actual current-mode panels into details and restores their original positions', () => {
    let endless = false;
    const history = { hidden: false };
    const appended: unknown[] = [], restored: unknown[] = [];
    const panels = ['.battle-objective', '.growth-panel', '.organ-overview', '.endless-wave-panel', '.endless-vitals'].map(selector => ({
      selector, parentElement: { closest: () => null }, closest: () => null,
      matches: (selectors: string) => selectors.split(',').includes(selector) || selector === '.battle-objective' && selectors.split(',').includes('.objective'),
      before: () => {},
    }));
    vi.stubGlobal('document', {
      body: { classList: { contains: () => endless, add: () => {}, remove: () => {} } },
      getElementById: () => ({ append: (panel: unknown) => appended.push(panel) }),
      querySelector: (selector: string) => selector.includes('mobile-details-dialog') ? history : panels.find(panel => panel.selector === selector),
      querySelectorAll: () => panels,
      createComment: () => ({ parentNode: {}, replaceWith: (panel: unknown) => restored.push(panel) }),
    });
    try {
      setMobileDetailsOpen(true);
      expect(history.hidden).toBe(false);
      expect(appended).toEqual(panels.slice(0, 3));
      setMobileDetailsOpen(false);
      expect(restored).toEqual(panels.slice(0, 3));
      endless = true; appended.length = 0; restored.length = 0;
      setMobileDetailsOpen(true);
      expect(history.hidden).toBe(true);
      expect(appended).toEqual([panels[1], panels[3], panels[4]]);
      setMobileDetailsOpen(false);
      expect(restored).toEqual(appended);
    } finally { setMobileDetailsOpen(false); }
  });
});
