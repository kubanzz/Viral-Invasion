import { describe, expect, it } from 'vitest';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { DRAW_PITY_LIMIT, MODULE_NAMES, type AntibodyDrawResult, type DrawReceipt } from '../../src/game/microfront';
import { WEAPONS } from '../../src/game/expedition';
import { emptyCampProfile, type CampProfileSnapshot } from '../../src/meta/campProfile';
import { campSummonMarkup, campSummonOverlay, summonPrizeName } from '../../src/ui/campSummonHud';
import { CampSummonSequence, SUMMON_TIMING } from '../../src/ui/campSummonSequence';

function camp(): CampProfileSnapshot {
  const data = emptyCampProfile();
  Object.assign(data, { prologue: 'ready', campUnlocked: true, campIntroSeen: true, builtFacilities: [...INTRO_FACILITY_IDS] });
  return { data, status: { mode: 'persistent', code: 'loaded', message: '已保存' } };
}
function receipt(results: AntibodyDrawResult[]): DrawReceipt {
  return { id: 'confirmed-receipt', count: results.length === 1 ? 1 : 10, cost: results.length === 1 ? 100 : 1000,
    pityBefore: 0, pityAfter: 0, pityLimit: 50, results };
}
const visibleText = (html: string): string => html.replace(/<[^>]*>/g, '');
const summaryItems = (html: string): string[] => [...html.matchAll(/<li\b[^>]*class="camp-draw-result"[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);
const batchItems = (html: string): string[] => [...html.matchAll(/<li\b[^>]*class="summon-batch-card"[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);
function drawButton(html: string, count: 1 | 10): string {
  return html.match(new RegExp(`<button\\b[^>]*data-action="camp-draw"[^>]*data-count="${count}"[^>]*>`))?.[0] ?? '';
}

describe('camp summon suspense UI', () => {
  it('keeps every actual identity out of charge and rarity markup before a reveal', () => {
    const sequence = new CampSummonSequence();
    const actual = receipt([
      { kind: 'module', rarity: 'blue', templateId: 'IMMUNE_BEACON', quantity: 1 },
      { kind: 'weapon', rarity: 'gold', templateId: 'piercing', quantity: 1 },
      { kind: 'module', rarity: 'purple', templateId: 'PURIFY_CHAIN', quantity: 1 },
    ]);
    sequence.start(actual, 0);
    const charge = campSummonOverlay(sequence.view);
    sequence.update(SUMMON_TIMING.charge);
    const rarity = campSummonOverlay(sequence.view);
    for (const html of [charge, rarity]) {
      for (const identity of ['piercing', 'IMMUNE_BEACON', 'PURIFY_CHAIN', WEAPONS.piercing.name, MODULE_NAMES.IMMUNE_BEACON, MODULE_NAMES.PURIFY_CHAIN])
        expect(html).not.toContain(identity);
      expect(html).not.toContain('summon-unveiled');
      expect(html).not.toContain('summon-result-frame');
      expect(batchItems(html)).toEqual([]);
      expect(html).toContain('data-action="camp-summon-skip"');
    }
    expect(charge).toContain('data-phase="charge" data-rarity="white"');
    expect(charge).toContain(`--phase-duration:${SUMMON_TIMING.charge}ms`);
    expect(visibleText(charge)).not.toMatch(/金色|神级/);
    expect(rarity).toContain('data-phase="rarity" data-rarity="gold"');
    expect(rarity).toContain(`--phase-duration:${SUMMON_TIMING.rarity}ms`);
    expect(visibleText(rarity)).toContain('金色灵幻体');
  });

  it.each([
    { kind: 'weapon', templateId: 'piercing', quantity: 1, name: WEAPONS.piercing.name, art: 'weapon-piercing' },
    { kind: 'module', templateId: 'EXPOSE_TRACE', quantity: 3, name: MODULE_NAMES.EXPOSE_TRACE, art: 'module-EXPOSE_TRACE' },
    { kind: 'core', quantity: 2, name: '锻造核心', art: 'forge-core' },
  ] as const)('preserves the large single-result $kind reveal with its actual icon, name and quantity', prize => {
    const actual = receipt([{ kind: prize.kind, rarity: 'gold', quantity: prize.quantity,
      ...('templateId' in prize ? { templateId: prize.templateId } : {}) }]);
    const before = structuredClone(actual), sequence = new CampSummonSequence();
    sequence.start(actual, 0); sequence.update(SUMMON_TIMING.charge); sequence.reveal();
    const html = campSummonOverlay(sequence.view);
    expect(sequence.view?.resultCount).toBe(1);
    expect(html).toContain('data-phase="item" data-rarity="gold"');
    expect(html).toContain('data-layout="single" data-result-count="1"');
    expect(html).toContain('class="summon-unveiled-art"');
    expect(batchItems(html)).toEqual([]);
    expect(html).toContain(`<h2 id="summon-reveal-title">${prize.name}</h2>`);
    expect(html).toMatch(new RegExp(`data-camp-art="(?:summon-hero-)?${prize.art}"`));
    expect(html).toContain(`<b class="summon-hero-count">×${prize.quantity}</b>`);
    expect(html.match(/id="summon-reveal-title"/g)).toHaveLength(1);
    expect(html).not.toContain(WEAPONS.steady.name);
    expect(html).not.toContain('weapon-steady');
    expect(html).not.toContain('biomass');
    expect(actual).toEqual(before);
  });

  it.each(['white', 'blue', 'purple'] as const)('never announces gold for a wholly %s draw', rarity => {
    const sequence = new CampSummonSequence();
    sequence.start(receipt([{ kind: 'module', rarity, templateId: 'PULSE_BREAK', quantity: 1 }]), 0);
    const charge = campSummonOverlay(sequence.view);
    sequence.update(SUMMON_TIMING.charge); const tease = campSummonOverlay(sequence.view);
    sequence.reveal(); const item = campSummonOverlay(sequence.view);
    for (const html of [charge, tease, item]) {
      expect(html).not.toContain('data-rarity="gold"');
      expect(visibleText(html)).not.toMatch(/金色|神级/);
    }
    expect(tease).toContain(`data-rarity="${rarity}"`);
    expect(tease).not.toContain(MODULE_NAMES.PULSE_BREAK);
    expect(item).toContain(MODULE_NAMES.PULSE_BREAK);
  });

  it.each([1, 5, 10, 20])('reveals %i actual results together in saved order with one collection action', count => {
    const palette: AntibodyDrawResult[] = [
      { kind: 'fragments', rarity: 'white', templateId: 'steady', quantity: 7 },
      { kind: 'weapon', rarity: 'gold', templateId: 'piercing', quantity: 1 },
      { kind: 'module', rarity: 'purple', templateId: 'PURIFY_CHAIN', quantity: 2 },
      { kind: 'materials', rarity: 'blue', quantity: 5 },
      { kind: 'core', rarity: 'gold', quantity: 3 },
    ];
    const actual = receipt(Array.from({ length: count }, (_, index) => ({ ...palette[index % palette.length] })));
    const before = structuredClone(actual), sequence = new CampSummonSequence(); sequence.start(actual, 0);
    const charge = campSummonOverlay(sequence.view);
    sequence.update(SUMMON_TIMING.charge); const rarity = campSummonOverlay(sequence.view);
    sequence.reveal(); const revealed = campSummonOverlay(sequence.view);
    for (const html of [charge, rarity, revealed]) {
      expect(html).toContain(`data-layout="${count > 1 ? 'batch' : 'single'}" data-result-count="${count}"`);
      expect(html).not.toContain('summon-step');
      expect(html).not.toContain('summon-progress');
    }
    for (const html of [charge, rarity]) {
      expect(batchItems(html)).toEqual([]);
      expect(html).not.toContain('summon-unveiled-art');
      for (const result of actual.results) expect(html).not.toContain(summonPrizeName(result));
    }
    const collect = [...revealed.matchAll(/<button\b[^>]*data-action="camp-summon-next"[^>]*>[\s\S]*?<\/button>/g)];
    expect(collect).toHaveLength(1);
    expect(revealed).not.toContain('继续揭晓');
    if (count > 1) {
      const cards = batchItems(revealed);
      expect(cards).toHaveLength(count);
      expect(cards.map(card => Number(/data-draw-index="(\d+)"/.exec(card)![1])))
        .toEqual(actual.results.map((_, index) => index + 1));
      expect(cards.map(card => /data-rarity="(\w+)"/.exec(card)![1]))
        .toEqual(actual.results.map(result => result.rarity));
      expect(cards.map(card => Number(/data-quantity="(\d+)"/.exec(card)![1])))
        .toEqual(actual.results.map(result => result.quantity));
      cards.forEach((card, index) => {
        expect(card).toContain(`<b>×${actual.results[index].quantity}</b>`);
        expect(card).toContain(`<strong>${summonPrizeName(actual.results[index])}</strong>`);
      });
      expect(revealed).toContain('<h2 id="summon-reveal-title">脉流的馈赠</h2>');
      expect(revealed).toContain(`class="summon-batch-count">${count} 份馈赠`);
      expect(collect[0][0]).toContain('全部收下');
      expect(revealed).not.toContain('summon-unveiled-art');
    } else {
      expect(batchItems(revealed)).toEqual([]);
      expect(revealed).toContain('summon-unveiled-art');
      expect(revealed).toContain('<b class="summon-hero-count">×7</b>');
      expect(revealed).not.toContain('summon-batch-count');
    }
    sequence.next();
    expect(sequence.view?.phase).toBe('complete');
    expect(campSummonOverlay(sequence.view)).toBe('');
    const summary = campSummonMarkup(camp(), sequence.view!.receipt);
    expect(summaryItems(summary)).toHaveLength(count);
    expect(summary).toContain(`${count} 份收获 · 已入库`);
    expect(actual).toEqual(before);
  });

  it('uses the same membrane opening for single and batch draws with the same best rarity', () => {
    const focus = (html: string): string => html.slice(html.indexOf('<div class="summon-focus">'), html.indexOf('<div class="summon-identity"'));
    const gold: AntibodyDrawResult = { kind: 'weapon', rarity: 'gold', templateId: 'piercing', quantity: 1 };
    const single = new CampSummonSequence(), batch = new CampSummonSequence();
    single.start(receipt([gold]), 0);
    batch.start(receipt([{ kind: 'materials', rarity: 'white', quantity: 2 }, gold]), 0);
    expect(focus(campSummonOverlay(single.view))).toBe(focus(campSummonOverlay(batch.view)));
    single.update(SUMMON_TIMING.charge); batch.update(SUMMON_TIMING.charge);
    expect(focus(campSummonOverlay(single.view))).toBe(focus(campSummonOverlay(batch.view)));
    expect(campSummonOverlay(batch.view)).toContain('data-rarity="gold"');
    expect(campSummonOverlay(batch.view)).not.toContain('weapon-piercing');
  });

  it.each([[10, 1], [1, 5], [1, 20]] as const)('uses actual array length when declared count%i has %i results', (declared, count) => {
    const actual = { ...receipt(Array.from({ length: count }, () => ({ kind: 'materials' as const, rarity: 'white' as const, quantity: 2 }))), count: declared };
    const sequence = new CampSummonSequence(); sequence.start(actual, 0); sequence.update(SUMMON_TIMING.charge + SUMMON_TIMING.rarity);
    const html = campSummonOverlay(sequence.view);
    expect(html).toContain(`data-layout="${count > 1 ? 'batch' : 'single'}" data-result-count="${count}"`);
    expect(count === 1 ? html.includes('summon-unveiled-art') : batchItems(html).length === count).toBe(true);
    if (count > 1) expect(html).toContain(`class="summon-batch-count">${count} 份馈赠`);
    const summary = campSummonMarkup(camp(), actual);
    expect(summaryItems(summary)).toHaveLength(count);
    expect(summary).toContain(`${count} 份收获 · 已入库`);
  });

  it('shows no false gold hint when a mixed batch contains only ordinary, blue and purple prizes', () => {
    const actual = receipt([
      { kind: 'materials', rarity: 'white', quantity: 2 },
      { kind: 'module', rarity: 'blue', templateId: 'IMMUNE_BEACON', quantity: 1 },
      { kind: 'module', rarity: 'purple', templateId: 'PURIFY_CHAIN', quantity: 1 },
    ]);
    const sequence = new CampSummonSequence(); sequence.start(actual, 0); sequence.update(SUMMON_TIMING.charge);
    const tease = campSummonOverlay(sequence.view); sequence.reveal(); const html = campSummonOverlay(sequence.view);
    expect(tease).toContain('data-rarity="purple"');
    for (const stage of [tease, html]) expect(visibleText(stage)).not.toMatch(/金色|神级/);
    expect(batchItems(html).map(card => /data-rarity="(\w+)"/.exec(card)![1])).toEqual(['white', 'blue', 'purple']);
  });

  it('shows all ten receipt entries once in their saved order after skipping, without changing the camp or receipt', () => {
    const snapshot = camp(), actual = receipt([
      { kind: 'materials', rarity: 'white', quantity: 2 },
      { kind: 'weapon', rarity: 'gold', templateId: 'piercing', quantity: 1 },
      { kind: 'fragments', rarity: 'blue', templateId: 'steady', quantity: 7 },
      { kind: 'module', rarity: 'purple', templateId: 'PURIFY_CHAIN', quantity: 1 },
      { kind: 'materials', rarity: 'white', quantity: 3 },
      { kind: 'core', rarity: 'gold', quantity: 1 },
      { kind: 'fragments', rarity: 'white', templateId: 'EXPOSE_TRACE', quantity: 4 },
      { kind: 'module', rarity: 'blue', templateId: 'IMMUNE_BEACON', quantity: 1 },
      { kind: 'materials', rarity: 'blue', quantity: 5 },
      { kind: 'weapon', rarity: 'white', templateId: 'steady', quantity: 1 },
    ]);
    const before = structuredClone({ snapshot, actual }), sequence = new CampSummonSequence();
    sequence.start(actual, 0); sequence.skip();
    expect(campSummonOverlay(sequence.view)).toBe('');
    const html = campSummonMarkup(snapshot, sequence.view!.receipt), items = summaryItems(html);
    expect(items).toHaveLength(10);
    expect(items.map(item => Number(/data-draw-index="(\d+)"/.exec(item)![1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(items.map(item => /data-rarity="(\w+)"/.exec(item)![1])).toEqual(actual.results.map(result => result.rarity));
    expect(items.map(item => Number(/<b>×(\d+)<\/b>/.exec(item)![1]))).toEqual(actual.results.map(result => result.quantity));
    expect(items[0]).toContain('修复生质');
    expect(items[1]).toContain(WEAPONS.piercing.name);
    expect(items[2]).toContain(WEAPONS.steady.name + '碎片');
    expect(items[5]).toContain('锻造核心');
    expect(visibleText(html)).toContain('金色 ×2');
    expect(campSummonMarkup(snapshot, sequence.view!.receipt)).toBe(html);
    expect({ snapshot, actual }).toEqual(before);
  });

  it('shows the 50-pull shared cap with one remaining at pity49 and disables each unaffordable option', () => {
    expect(DRAW_PITY_LIMIT).toBe(50);
    const snapshot = camp(); snapshot.data.pity = 49;
    for (const [coins, singleDisabled, tenDisabled] of [[0, true, true], [99, true, true], [100, false, true], [999, false, true], [1000, false, false]] as const) {
      snapshot.data.coins = coins;
      const html = campSummonMarkup(snapshot);
      expect(html).toContain('aria-valuemax="50" aria-valuenow="49"');
      expect(html).toContain('最多再接引 <b>1</b> 次必出金');
      expect(visibleText(html)).toContain('连续 49 次未出金，第 50 次必出金');
      expect(drawButton(html, 1)).not.toBe('');
      expect(drawButton(html, 10)).not.toBe('');
      expect(/\bdisabled\b/.test(drawButton(html, 1))).toBe(singleDisabled);
      expect(/\bdisabled\b/.test(drawButton(html, 10))).toBe(tenDisabled);
    }
  });

  it('escapes the receipt identity and omits inactive overlays', () => {
    const snapshot = camp(), actual = receipt([{ kind: 'materials', rarity: 'white', quantity: 2 }]);
    actual.id = 'receipt"><img src=x onerror=alert(1)>';
    const sequence = new CampSummonSequence(); sequence.start(actual, 0);
    for (const html of [campSummonMarkup(snapshot, actual), campSummonOverlay(sequence.view)]) {
      expect(html).toContain('receipt&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
      expect(html).not.toContain('<img src=x');
    }
    expect(campSummonOverlay()).toBe('');
    sequence.start(actual, 0, true);
    expect(campSummonOverlay(sequence.view)).toBe('');
  });
});
