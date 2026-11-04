import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createEndlessGrowth, offerEndlessUpgrade } from '../../src/game/endlessGrowth';
import { makeDraftOption } from '../../src/game/protocols';
import { draftOverlay } from '../../src/ui/growthHud';
import { endlessOverlay } from '../../src/ui/endlessHud';
import { endlessChoiceCopy, protocolChoiceCopy } from '../../src/ui/upgradeChoices';
import type { DraftOption } from '../../src/game/growthTypes';
import type { EndlessUpgradeOption } from '../../src/game/endlessGrowthTypes';

describe('readable upgrade choices', () => {
  it('locks the heart-rescue beacon slot while offering other replacement choices normally', () => {
    const game = new GameSession(13, { mode: 'endless', territory: true }); game.start();
    const growth = game.state.growth!;
    growth.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced', rank: 1 }, { id: 'PURIFY_CHAIN', tuning: 'balanced', rank: 1 }, { id: 'EXPOSE_TRACE', tuning: 'balanced', rank: 1 }];
    const option = makeDraftOption('PULSE_BREAK', 'balanced', 'equip');
    growth.draft = { id: 'locked-replacement', source: 'xp', serial: 1, options: [option, { ...option, id: 'second' }, { ...option, id: 'third' }], status: 'replacing', selectedOptionId: option.id };
    const html = draftOverlay(game.state)!;
    expect(html).toContain('关卡能力·军团驻防');
    expect(html).toContain('disabled aria-disabled="true"');
    expect(html).not.toContain('data-previous="IMMUNE_BEACON"');
    expect(html).toContain('data-previous="PURIFY_CHAIN"');
    delete game.state.territory;
    expect(draftOverlay(game.state)).toContain('data-previous="IMMUNE_BEACON"');
  });

  it('keeps committing buttons short and the complete mechanics in separate optional disclosures', () => {
    const game = new GameSession(13, { campaign: true, milestone: 'G3' }); game.start();
    const options = ['IMMUNE_BEACON', 'PURIFY_CHAIN', 'EXPOSE_TRACE'].map(id => makeDraftOption(id as DraftOption['protocolId'], 'balanced', 'equip')) as [DraftOption, DraftOption, DraftOption];
    game.state.growth!.draft = { id: 'simple-draft', source: 'xp', serial: 1, options, status: 'choosing' };
    const before = structuredClone(game.state), html = draftOverlay(game.state)!;
    const buttons = [...html.matchAll(/<button class="draft-choice choice-select"[\s\S]*?<\/button>/g)].map(match => match[0]);
    expect(buttons).toHaveLength(3);
    for (const [index, button] of buttons.entries()) {
      expect(button).toContain('data-choice-icon='); expect(button).toContain('class="choice-summary"');
      expect(button).not.toContain('<details'); expect(button).not.toContain(options[index].effect);
      expect(button).not.toContain('>SUMMON<'); expect(button).not.toContain('>CHAIN<');
      expect(html).toContain(options[index].effect);
    }
    expect(html.match(/<details class="upgrade-details">/g)).toHaveLength(3);
    expect(buttons[0]).toContain('消耗 3 组织完整度');
    expect(html).not.toContain('id="antibody-use"');
    expect(game.state).toEqual(before);
  });

  it('keeps changing a tuning distinct from gaining a rank', () => {
    const current = { id: 'EXPOSE_TRACE' as const, tuning: 'balanced' as const, rank: 3 as const };
    const copy = protocolChoiceCopy(makeDraftOption(current.id, 'focused', 'retune', 3, current), current);
    expect(copy.change).toBe('均衡 → 聚焦 · 阶数不变');
    expect(copy.caution).toContain('不直接造成伤害');
  });

  it('shows the additional aftershock without implying the main explosion loses damage', () => {
    const growth = createEndlessGrowth(13), option: EndlessUpgradeOption = { id: 'catalysis', title: '催化裂解', description: '完整机制', currentRank: 0, nextRank: 1 };
    const copy = endlessChoiceCopy(option, growth);
    expect(copy.summary).toContain('保持完整伤害'); expect(copy.action).toContain('0.35秒');
    expect(copy.change).toContain('75%半径'); expect(copy.caution).toContain('不递归');
  });

  it('explains new controls at the actual upgraded rank, including a two-rank breakthrough', () => {
    const growth = createEndlessGrowth(13); growth.ranks = { nova: 2, dash: 4, immune: 2 };
    const option = (id: EndlessUpgradeOption['id'], currentRank: number, nextRank: number): EndlessUpgradeOption => ({ id, currentRank, nextRank, title: id, description: '' });
    expect(endlessChoiceCopy(option('nova', 2, 3), growth).action).toContain('按住左键连发');
    expect(endlessChoiceCopy(option('dash', 4, 6), growth).summary).toContain('追加回斩');
    expect(endlessChoiceCopy(option('immune', 2, 3), growth).action).toContain('装备灯塔后');
  });

  it('keeps every original endless choice token and complete description available', () => {
    const game = new GameSession(13, { mode: 'endless' }); game.start();
    offerEndlessUpgrade(game.state.endlessGrowth!, 1);
    const html = endlessOverlay(game.state, false, false)!;
    for (const option of game.state.endlessGrowth!.draft!.options) {
      const button = html.match(new RegExp(`<button class="endless-upgrade choice-select"[^>]*data-upgrade="${option.id}"[\\s\\S]*?<\\/button>`))![0];
      expect(button).not.toContain(option.description); expect(button).not.toContain('<details');
      expect(html).toContain(option.description.replace(/&/g, '&amp;'));
    }
    expect(html.match(/<summary /g)).toHaveLength(3);
  });
});
