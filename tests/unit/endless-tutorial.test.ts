import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { endlessTutorialHint } from '../../src/ui/endlessTutorial';

const run = () => { const game = new GameSession(71, { mode: 'endless' }); game.start(); return game; };
describe('one actionable challenge instruction', () => {
  it('starts with shooting and gives touch players their own gesture', () => {
    const s=run().state,before=structuredClone(s);
    expect(endlessTutorialHint(s)).toContain('按住左键持续射击');
    expect(endlessTutorialHint(s,true)).toContain('按住右下净化盘');
    expect(endlessTutorialHint(s)).not.toContain('Q');
    expect(s).toEqual(before);
  });
  it('prioritizes an unrepaired organ over a new ability and then restores its instruction', () => {
    const s=run().state;
    Object.assign(s.endless!.tutorial!,{fired:true,tissueHurt:true,repaired:false,upgradeHint:'nova',upgradeHintUntil:7});
    s.tissue.hp=70;
    expect(endlessTutorialHint(s)).toContain('按 3');
    expect(endlessTutorialHint(s,true)).toContain('修复按钮拖向组织');
    s.endless!.tutorial!.repaired=true;
    expect(endlessTutorialHint(s)).toContain('按 2');
    s.elapsed=8; s.endless!.wave=2;
    expect(endlessTutorialHint(s)).toContain('可选支援');
    s.endless!.tutorial!.deployed=true;
    expect(endlessTutorialHint(s)).toBe('');
  });
  it('does not teach through a modal or a campaign', () => {
    const s=run().state; s.phase='paused';
    expect(endlessTutorialHint(s,true)).toBe('');
    delete s.endless; s.phase='playing';
    expect(endlessTutorialHint(s)).toBe('');
  });
});
