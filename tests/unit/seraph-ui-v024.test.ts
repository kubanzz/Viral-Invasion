import { describe, expect, it } from 'vitest';
import { emptyCampProfile, type CampProfileSnapshot } from '../../src/meta/campProfile';
import { LEGIONS } from '../../src/game/legionCatalog';
import type { DrawReceipt } from '../../src/game/microfront';
import type { GameState } from '../../src/game/types';
import { campHouseMarkup, SERAPH_FORMATION, seraphFormationMarkup } from '../../src/ui/campLifeHud';
import { campSummonMarkup, campSummonOverlay } from '../../src/ui/campSummonHud';
import { CampSummonSequence, SUMMON_TIMING } from '../../src/ui/campSummonSequence';
import { legionView } from '../../src/ui/legionHud';

const camp = (): CampProfileSnapshot => ({ data: emptyCampProfile(), status: { mode: 'persistent', code: 'loaded', message: '已保存' } });
function gold(duplicate = false): DrawReceipt {
  return { id: 'legion-draw:seraph-ui', pool: 'legion', count: 1, cost: 100, pityBefore: 49, pityAfter: 0, pityLimit: 50,
    results: [{ kind: 'legion', rarity: 'gold', legionId: 'seraph', quantity: 1, ...(duplicate ? { duplicateMaterials: 50 } : {}) }] };
}
function battle(seraph: boolean): GameState {
  return { phase: 'playing', elapsed: 2, territory: {}, battle: { organId: 'heart' }, growth: { antibodyCharges: 2,
    cells: [{ beaconId: 'squad', legionId: seraph ? 'seraph' : 'phagocyte', organId: 'heart', hp: 60, until: 100, antibodyUntil: 0 }] } } as unknown as GameState;
}

describe('seraph three-role collection and summon information', () => {
  it('shows the exact four-member formation and a distinct duty for each role', () => {
    expect(SERAPH_FORMATION.reduce((sum, role) => sum + role.count, 0)).toBe(4);
    const html = seraphFormationMarkup();
    for (const role of SERAPH_FORMATION) {
      expect(html).toContain(`data-seraph-role="${role.id}"`);
      expect(html).toContain(`data-camp-art="seraph-${role.id}"`);
      expect(html).toContain(role.name); expect(html).toContain(role.duty);
    }
    expect(html).toContain('近战命中后'); expect(html).toContain('共享圣裁追击');
    expect(html).not.toMatch(/pursuitReadyAt|beacon|damage transaction|DPS|6s/);
  });
  it('keeps ordinary legions, food and assignment choices while exposing seraph roles in the collection', () => {
    const snapshot = camp(); snapshot.data.ownedLegions.push('seraph'); snapshot.data.legionLoadout[0] = 'seraph';
    const before = structuredClone(snapshot), html = campHouseMarkup(snapshot);
    expect(html).toContain(LEGIONS.phagocyte.description); expect(html).toContain(LEGIONS.ranger.description);
    expect(html).toContain('data-seraph-formation="full"'); expect(html).toContain('data-seraph-formation="compact"');
    expect(html).toContain('data-collection-legion="seraph"'); expect(html).toContain('data-action="camp-legion-assign"');
    expect(html).toContain('归来消耗1粮'); expect(snapshot).toEqual(before);
  });
  it('retains independent fifty-pull pity and all original duplicate conversion rules', () => {
    const snapshot = camp(); snapshot.data.legionPity = 49; const before = structuredClone(snapshot);
    const html = campSummonMarkup(snapshot, undefined, 'legion');
    expect(html).toContain('最多再接引 <b>1</b> 次必得传说军团');
    expect(html).toContain('独立50抽必得传说'); expect(html).toContain('10/20/50生质');
    expect(html).toContain('data-seraph-role="prism"'); expect(snapshot).toEqual(before);
  });
  it('does not reveal seraph identities during charge or rarity suspense', () => {
    const sequence = new CampSummonSequence(); sequence.start(gold(), 0);
    const charge = campSummonOverlay(sequence.view); sequence.update(2000); const rarity = campSummonOverlay(sequence.view);
    for (const html of [charge, rarity]) {
      for (const role of SERAPH_FORMATION) expect(html).not.toContain(role.name);
      expect(html).not.toContain('summon-seraph-detail'); expect(html).not.toContain(LEGIONS.seraph.name);
    }
  });
  it.each([false, true])('explains a revealed seraph squad without altering its original receipt (duplicate=%s)', duplicate => {
    const receipt = gold(duplicate), before = structuredClone(receipt), sequence = new CampSummonSequence();
    sequence.start(receipt, 0); sequence.update(SUMMON_TIMING.charge); sequence.reveal();
    const html = campSummonOverlay(sequence.view);
    expect(html).toContain('统御者<b>×1</b>'); expect(html).toContain('悬翼枪卫<b>×2</b>'); expect(html).toContain('棱光咏卫<b>×1</b>');
    expect(html).toContain('Q集火合击 · R残像协同');
    expect(html).toContain(duplicate ? '50生质已入库' : '已永久解锁'); expect(receipt).toEqual(before);
  });
  it('keeps the ten-result disclosure compact and preserves the saved result order', () => {
    const receipt = gold(); receipt.count = 10; receipt.cost = 1000;
    receipt.results = Array.from({ length: 10 }, (_, index) => index === 6 ? gold().results[0] : { kind: 'materials' as const, rarity: 'white' as const, quantity: 5 });
    const sequence = new CampSummonSequence(); sequence.start(receipt, 0); sequence.update(SUMMON_TIMING.charge); sequence.reveal(); const html = campSummonOverlay(sequence.view);
    expect(html.match(/class="summon-batch-card"/g)).toHaveLength(10);
    expect(html.match(/class="seraph-prize-summary"/g)).toHaveLength(1);
    expect(html).toContain('统御者×1 · 枪卫×2 · 咏卫×1'); expect(html).not.toContain('data-seraph-formation="full"');
    expect(html.indexOf('data-draw-index="7"')).toBeLessThan(html.indexOf('data-draw-index="8"'));
  });
  it('uses short player-facing Q/R seraph guidance and retains normal legion guidance', () => {
    const normal = legionView(battle(false)), seraph = legionView(battle(true));
    expect(normal.antibodyLabel).toBe('注射抗体'); expect(normal.hint).toBe('裂变 · 扣血 1/3 · 强化 8 秒');
    expect(seraph.qHint).toBe('集火合击 / 空地驻防'); expect(seraph.antibodyLabel).toBe('曜卫残像');
    expect(seraph.hint).toBe('同兵种残像 · 扣血 1/3 · 强化 8 秒');
    expect(seraph.antibodyTitle).toContain('共享圣裁追击'); expect(seraph.status).not.toContain('cooldown');
  });
});
