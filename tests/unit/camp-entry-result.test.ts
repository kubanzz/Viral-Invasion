import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { territoryResultOverlay, territoryResultView } from '../../src/ui/territoryHud';
import { mainMenuOverlay } from '../../src/ui/mainMenu';
import { TerritoryProfileStore } from '../../src/meta/endlessProfile';
import { emptyCampProfile } from '../../src/meta/campProfile';

function game() { const session = new GameSession(71, { mode:'endless', territory:true }); session.start(); return session; }
function rescue(session: GameSession) {
  const state=session.state;
  state.territory!.stage='victory';state.phase='paused';
  state.territory!.rescueSnapshot={runId:'earned-receipt',seed:state.seed,atTick:12000,elapsed:200,wave:5,clearedWaves:5,
    score:2200,kills:400,bestCombo:80,level:5,playerHp:80,coreHp:76,fullyPurifiedSeconds:8,longestFullyPurifiedSeconds:6};
}

describe('camp entry and unambiguous expedition outcomes',()=>{
  it.each(['player','core'] as const)('labels a real %s death as failure without granting the camp', kind=>{
    const session=game();session.state[kind==='player'?'player':'tissue'].hp=0;
    session.step({moveX:0,moveY:0,aim:{x:1200,y:900},fire:false});
    expect(session.state.phase).toBe('result');expect(session.state.result?.success).toBe(false);
    const items=new Map<string,string>();
    const store=new TerritoryProfileStore({getItem:key=>items.get(key)??null,setItem:(key,value)=>{items.set(key,value);},removeItem:key=>{items.delete(key);}});
    store.recordRun(session.state);
    const html=territoryResultOverlay(session.state,store.load(),false)!;
    expect(store.status.message).toBe('本次挑战记录已保存。');
    expect(html).not.toContain('救援成果已保存');
    expect(html).toContain(kind==='player'?'救援失败：玩家耐久归零':'救援失败：心核被摧毁');
    expect(html).toContain('心脏营地尚未解锁');expect(html).toContain('○ 未完成');
    expect(html).not.toContain('data-action="camp-open"');expect(html).not.toContain('战利品已带回');
    expect(emptyCampProfile().campUnlocked).toBe(false);
  });
  it('preserves actual rescue and offers the camp after ending continued guard',()=>{
    const session=game();rescue(session);expect(session.continueTerritoryGuard()).toBe(true);
    session.state.player.hp=0;session.step({moveX:0,moveY:0,aim:{x:1200,y:900},fire:false});
    const html=territoryResultOverlay(session.state,undefined,true)!;
    expect(territoryResultView(session.state)?.status).toBe('saved');
    expect(html).toContain('守卫结束，救援成果仍在');expect(html).toContain('data-action="camp-open"');
    expect(html).not.toContain('救援失败：玩家耐久归零');
  });
  it('still offers the camp on the successful result instead of only the initial pause screen',()=>{
    const session=game();rescue(session);expect(session.finishTerritoryRescue()).toBe(true);
    expect(territoryResultOverlay(session.state,undefined,true)).toContain('data-action="camp-open"');
  });
  it('lets an already unlocked camp survive a failed expedition without calling this run successful',()=>{
    const session=game();session.state.player.hp=0;session.step({moveX:0,moveY:0,aim:{x:0,y:0},fire:false});
    const html=territoryResultOverlay(session.state,undefined,true)!;
    expect(html).toContain('救援失败');expect(html).toContain('返回已解锁营地');expect(html).toContain('本局未带回的战利品不入库');
    expect(session.state.territory?.rescueSnapshot).toBeUndefined();
  });
  it('distinguishes withdrawal and rejects an unbacked success flag as proof of rescue',()=>{
    const session=game();session.finish(false,'主动撤离：本次尚未完成救援。');
    expect(territoryResultView(session.state)?.status).toBe('withdrawn');
    expect(territoryResultOverlay(session.state,undefined,false)).toContain('已撤离，本次救援尚未完成');
    session.state.result={success:true,reason:'结束远征'};
    expect(territoryResultView(session.state)?.status).toBe('incomplete');
    expect(territoryResultOverlay(session.state,undefined,false)).not.toContain('data-action="camp-open"');
  });
  it('starts with arrival and offers an already established micro camp without a rescue lock',()=>{
    const record=new TerritoryProfileStore(null).load();
    const locked=mainMenuOverlay(record,true,false), unlocked=mainMenuOverlay(record,true,true);
    expect(locked).toContain('带队抵达');expect(locked).not.toContain('首次救援成功后解锁');
    expect(unlocked).toContain('data-action="endless-start"');expect(unlocked).toContain('返回微观营地');
    expect(unlocked).not.toMatch(/data-action="camp-open" disabled/);
  });
});
