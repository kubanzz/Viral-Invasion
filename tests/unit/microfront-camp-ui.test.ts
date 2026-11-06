import { describe, expect, it } from 'vitest';
import { emptyCampProfile, type CampProfileSnapshot } from '../../src/meta/campProfile';
import { TerritoryProfileStore } from '../../src/meta/endlessProfile';
import { DRAW_PITY_LIMIT, MODULE_IDS, type DrawReceipt } from '../../src/game/microfront';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { campOverlay } from '../../src/ui/campHud';
import { mainMenuOverlay } from '../../src/ui/mainMenu';

function camp(ready = true): CampProfileSnapshot {
  const data = emptyCampProfile();
  if (ready) Object.assign(data, { prologue: 'ready', campUnlocked: true, campIntroSeen: true, builtFacilities: [...INTRO_FACILITY_IDS] });
  return { data, status: { mode: 'persistent', code: 'loaded', message: '已保存' } };
}
function navigationButton(html: string, section: string): string {
  const navigation = html.match(/<nav\b[^>]*aria-label="营地设施"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
  return navigation.match(new RegExp(`<button\\b[^>]*data-section="${section}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0] ?? '';
}

describe('microfront camp player flow', () => {
  it('starts at arrival and does not expose facilities through a direct section request', () => {
    const snapshot = camp(false);
    for (const section of ['overview', 'forge', 'summon', 'missions', 'trial'] as const) {
      const html = campOverlay(snapshot, section);
      expect(html).toContain('data-action="camp-establish"');
      expect(html).toContain('稳态锚');
      expect(html).toContain('data-action="camp-close"');
      expect(html).not.toContain('data-action="camp-draw"');
      expect(html).not.toContain('data-action="camp-deploy"');
      expect(html).not.toContain('data-action="camp-craft"');
      expect(html).not.toContain('camp-trial-canvas');
    }
  });

  it('shows an individual building plan instead of its unavailable function', () => {
    const snapshot = camp(false); snapshot.data.prologue = 'building'; snapshot.data.campUnlocked = true;
    for (const section of ['warehouse', 'forge', 'shop', 'summon', 'missions', 'trial'] as const) {
      const html = campOverlay(snapshot, section, .4);
      expect(html).toContain('基础建设 0 / 5');
      expect(html).toContain('data-build-site=');
      expect(html).not.toContain('data-action="camp-establish"');
      expect(html).not.toContain('data-action="camp-draw"');
      expect(html).not.toContain('data-action="camp-craft"');
      expect(html).not.toContain('data-action="camp-equip"');
      expect(html).not.toContain('data-action="camp-buy-antibody"');
      expect(html).not.toContain('data-action="camp-deploy"');
      expect(html).not.toContain('camp-trial-canvas');
      expect(html).not.toContain('data-action="camp-skip-intro"');
    }
  });

  it('requires approaching the chosen foundation and can skip only the current building presentation', () => {
    const snapshot = camp(false); snapshot.data.prologue = 'building'; snapshot.data.campUnlocked = true;
    expect(campOverlay(snapshot, 'summon')).not.toContain('data-action="camp-build"');
    const nearby = campOverlay(snapshot, 'summon', 0, '', { nearbyStationId: 'summon' });
    expect(nearby).toContain('data-action="camp-build" data-station="summon"');
    expect(nearby).toContain('免费建造');
    snapshot.data.activeConstruction = 'summon';
    const active = campOverlay(snapshot, 'summon', .5);
    expect(active).toContain('data-action="camp-skip-construction"');
    expect(active).not.toContain('data-action="camp-build"');
    expect(active).not.toContain('data-action="camp-draw"');
    const waiting = campOverlay(snapshot, 'forge', .5, '', { nearbyStationId: 'forge' });
    expect(waiting).toContain('请待当前施工完成');
    expect(waiting).not.toContain('data-action="camp-build"');
  });

  it('opens completed facilities during the initial build while keeping the first expedition locked', () => {
    const snapshot = camp(false); Object.assign(snapshot.data, { prologue: 'building', campUnlocked: true,
      builtFacilities: ['warehouse', 'forge', 'departure'] });
    expect(campOverlay(snapshot, 'warehouse')).toContain('data-action="camp-equip"');
    expect(campOverlay(snapshot, 'forge')).toContain('data-action="camp-craft"');
    expect(campOverlay(snapshot, 'warehouse')).toContain('基础建设 3 / 5');
    expect(campOverlay(snapshot, 'shop')).not.toContain('data-action="camp-buy-antibody"');
    const departure = campOverlay(snapshot, 'missions');
    expect(departure).toContain('等待前哨整备完成');
    expect(departure).not.toContain('data-action="camp-mission"');
    expect(departure).not.toContain('data-action="camp-deploy"');
  });

  it('provides touch practice controls as soon as the warehouse is built without unlocking the first expedition', () => {
    const snapshot = camp(false); Object.assign(snapshot.data, { prologue: 'building', campUnlocked: true, builtFacilities: ['warehouse'] });
    const before = structuredClone(snapshot), html = campOverlay(snapshot, 'trial', 0, '', { trialWeaponId: 'steady' });
    expect(html).toContain('camp-trial-panel'); expect(html).toContain('camp-trial-canvas');
    expect(html).toContain('data-action="camp-trial-fire"');
    for (const slot of [1, 2, 3]) expect(html).toContain(`data-action="camp-trial-skill" data-slot="${slot}"`);
    expect(html).toContain('data-action="camp-trial-layout" data-layout="single"');
    expect(html).toContain('data-action="camp-trial-layout" data-layout="line"');
    expect(html).toContain('data-action="camp-trial-reset"'); expect(html).toContain('data-action="camp-trial-cooldowns"');
    expect(html).toContain('返回配装'); expect(html).not.toContain('准备出击'); expect(html).not.toContain('data-action="camp-deploy"');
    expect(snapshot).toEqual(before);
  });

  it('puts readable new-content and actionable badges on the corresponding facility entrances', () => {
    const snapshot = camp(); snapshot.data.materials = 10; snapshot.data.fragments.PULSE_BREAK = 5;
    snapshot.data.inventory.push({ id: 'new:bow', kind: 'weapon', templateId: 'piercing', rarity: 'blue', repaired: true });
    const html = campOverlay(snapshot, 'overview');
    expect(navigationButton(html, 'warehouse')).toContain('新装备');
    expect(navigationButton(html, 'missions')).toContain('新情报');
    expect(navigationButton(html, 'forge')).toContain('可打造');
    expect(navigationButton(html, 'shop')).not.toContain('camp-attention-badge');
    expect(navigationButton(html, 'summon')).not.toContain('camp-attention-badge');
    snapshot.data.seenEquipmentQuality.piercing = 'blue'; snapshot.data.seenMissionIds = ['membrane'];
    const viewed = campOverlay(snapshot, 'overview');
    expect(navigationButton(viewed, 'warehouse')).not.toContain('camp-attention-badge');
    expect(navigationButton(viewed, 'missions')).not.toContain('camp-attention-badge');
    expect(navigationButton(viewed, 'forge')).toContain('可打造');
    snapshot.data.materials = 0;
    expect(navigationButton(campOverlay(snapshot, 'overview'), 'forge')).not.toContain('camp-attention-badge');
  });

  it('shows real mission locks and makes a completed mission available for another expedition', () => {
    const snapshot = camp();
    const first = campOverlay(snapshot, 'missions');
    expect(first).toContain('data-mission="corridor" disabled');
    expect(first).toContain('data-mission="boundary" disabled');
    expect(first).toContain('出击 · 膜隙初染');
    expect(first).not.toContain('5—8分钟');
    expect(first).toContain('失败或撤离保留已拾金币、生质与碎片的一半');
    snapshot.data.completedMissions.push('membrane'); snapshot.data.selectedMissionId = 'corridor';
    const repeat = campOverlay(snapshot, 'departure');
    expect(repeat).toContain('已完成 · 可重复清剿');
    expect(repeat).toContain('data-mission="membrane" >');
    expect(repeat).toContain('出击 · 纤维回廊');
    expect(repeat).not.toContain('出击心脏');
  });

  it('derives recipe affordability from each template’s fragments, shared materials and core', () => {
    const snapshot = camp(); snapshot.data.materials = 40; snapshot.data.fragments.PULSE_BREAK = 20;
    let html = campOverlay(snapshot, 'forge');
    expect(html).toContain('data-template="PULSE_BREAK" data-rarity="blue" >');
    expect(html).toContain('data-template="PULSE_BREAK" data-rarity="gold" disabled');
    expect(html).toContain('data-template="steady" data-rarity="blue" disabled');
    snapshot.data.cores = 1;
    html = campOverlay(snapshot, 'forge');
    expect(html).toContain('data-template="PULSE_BREAK" data-rarity="gold" >');
    expect(html).toContain('20碎片 + 40生质 + 1核心');
    expect(html).toContain('data-action="camp-upgrade"');
  });

  it('shows three equipped modules and prevents a fourth while still offering unequip', () => {
    const snapshot = camp();
    snapshot.data.inventory.push(...MODULE_IDS.map((id, index) => ({ id: `module-${index}`, kind: 'module' as const, templateId: id, rarity: 'blue' as const, repaired: true })));
    snapshot.data.equippedModules = MODULE_IDS.slice(0, 3);
    const html = campOverlay(snapshot, 'warehouse');
    expect(html).toContain('3 / 3 槽');
    expect(html).toContain('data-module="EXPOSE_TRACE" disabled');
    expect(html).toContain('data-module="PULSE_BREAK" >卸下模组');
    expect(html).toContain('data-action="camp-decompose" data-item="module-0"');
    expect(html).toContain('基础驻军和三个武器技能始终可用');
  });

  it('discloses shared pity and costs without presenting an unaffordable ten draw', () => {
    const snapshot = camp(); snapshot.data.coins = 100; snapshot.data.pity = DRAW_PITY_LIMIT - 1;
    const html = campOverlay(snapshot, 'summon');
    expect(html.match(/<button\b[^>]*data-count="1"[^>]*>/)?.[0]).not.toMatch(/\bdisabled\b/);
    expect(html.match(/<button\b[^>]*data-count="10"[^>]*>/)?.[0]).toMatch(/\bdisabled\b/);
    expect(html).toContain('最多再接引 <b>1</b> 次必出金');
    expect(html).toContain(`aria-valuemax="${DRAW_PITY_LIMIT}" aria-valuenow="${DRAW_PITY_LIMIT - 1}"`);
    expect(html).toContain('普通 60%');
    expect(html).toContain('神级 5%');
    expect(html).toContain('神级武器40% · 神级模组40% · 锻造核心20%');
  });

  it('renders every confirmed draw exactly once and never mutates the receipt or camp', () => {
    const snapshot = camp();
    const receipt: DrawReceipt = { id: 'draw-actual', count: 10, cost: 1000, pityBefore: 0, pityAfter: 0,
      results: [...Array.from({ length: 9 }, () => ({ rarity: 'white' as const, kind: 'materials' as const, quantity: 2 })),
        { rarity: 'gold', kind: 'weapon', quantity: 1, templateId: 'piercing', itemId: 'gold-weapon' }] };
    const before = structuredClone({ snapshot, receipt });
    const first = campOverlay(snapshot, 'summon', 1, '', {}, receipt);
    expect(first.match(/class="camp-draw-result"/g)).toHaveLength(10);
    expect(first).toContain('data-draw-receipt="draw-actual"');
    expect(first).toContain('贯脉·回旋刃弓');
    expect(first).toContain('接引完成');
    expect(first).toContain('10 份收获 · 已入库');
    expect(first).toContain('camp-summon-results-panel');
    expect(first).toContain('summon-gold-count">金色 ×1');
    expect(first).toContain('data-rarity="gold" data-draw-index="10" aria-label="第10抽 · 贯脉·回旋刃弓 ×1"');
    expect([...first.matchAll(/data-draw-index="(\d+)"/g)].map(match => Number(match[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(campOverlay(snapshot, 'summon', 1, '', {}, receipt)).toBe(first);
    expect({ snapshot, receipt }).toEqual(before);
  });

  it('keeps notices readable in session storage and escapes external strings', () => {
    const snapshot = camp(); snapshot.status = { mode: 'session', code: 'unavailable', message: '仅本次保存' };
    const html = campOverlay(snapshot, 'overview', 1, '<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('仅本次保存');
    expect(html).toContain('data-action="camp-retry-save"');
  });

  it('routes a fresh player to arrival and an established player back to the micro camp', () => {
    const record = new TerritoryProfileStore(null).load();
    const fresh = mainMenuOverlay(record, true, false, 'arrival');
    expect(fresh).toContain('带队抵达');
    expect(fresh).not.toContain('首次救援成功后解锁');
    expect(fresh).not.toContain('data-action="camp-open" disabled');
    const ready = mainMenuOverlay(record, false, true, 'ready');
    expect(ready).toContain('返回微观营地');
    expect(ready).toContain('data-action="camp-open"');
    expect(ready).toContain('仓库／锻造／血流接引');
  });
});
