import{describe,it,expect}from'vitest';
import{mkdirSync,writeFileSync}from'node:fs';import{dirname,resolve}from'node:path';
import{GameSession}from'../../src/game/session';
import{g3Input}from'../helpers/g3Driver';
import{type TraitId}from'../../src/game/battleTypes';
import{type ProtocolId,type DraftIntent}from'../../src/game/growthTypes';

const counters:Record<TraitId,readonly ProtocolId[]>={CARAPACE:['PULSE_BREAK'],FISSION:['PURIFY_CHAIN','IMMUNE_BEACON'],MIMIC:['EXPOSE_TRACE','IMMUNE_BEACON']};
const runs:unknown[]=[];
describe('formal campaign with deliberately unhelpful current-threat drafts',()=>{
  it.each<TraitId>(['CARAPACE','FISSION','MIMIC'])('can win the full %s case through base counters and legal noncounter picks',firstTrait=>{
    const game=new GameSession(91,{campaign:true,milestone:'G3',counterGuide:'adaptive',firstTrait});game.start();
    const choices:unknown[]=[];
    for(let action=0;action<300*60&&game.state.phase!=='result';action++){
      const state=game.state,growth=state.growth!,battle=state.battle!,draft=growth.draft;
      if(!draft){game.step(g3Input(state,'pursue'));continue;}
      const known=[...new Set([firstTrait,...battle.traits,...battle.warning?[battle.warning.trait]:[]])];
      const excluded=[...new Set(known.flatMap(trait=>counters[trait]))];
      const option=draft.options.find(candidate=>!excluded.includes(candidate.protocolId));
      let resolution='discard-no-noncounter-option';
      if(!option)expect(game.discardDraft(draft.id).kind).toBe('discarded');
      else{
        const intent:DraftIntent={runId:growth.runId,draftId:draft.id,optionId:option.id};
        const result=game.chooseDraft(intent);
        if(result.kind==='replace-required'){
          const existingCounter=growth.equipped.findIndex(slot=>excluded.includes(slot.id));const slotIndex=existingCounter>=0?existingCounter:0;
          expect(game.chooseDraft({...intent,slotIndex,expectedPreviousProtocolId:growth.equipped[slotIndex].id}).kind).toBe('committed');resolution='replace-'+slotIndex;
        }else{expect(result.kind).toBe('committed');resolution=option.kind;}
        expect(excluded).not.toContain(option.protocolId);
      }
      choices.push({tick:state.tick,knownThreats:known,excluded,candidates:draft.options.map(o=>({id:o.id,protocolId:o.protocolId,kind:o.kind})),selected:option?.protocolId??null,resolution,equipped:growth.equipped.map(slot=>({...slot}))});
    }
    const final=game.snapshot();expect(final.result).toMatchObject({success:true});expect(final.campaign!.core.status).toBe('cleared');expect(final.campaign!.stats.migrationChoice).toBe('pursue');
    expect(final.battle!.encounter!.configId).toBe('campaign-1');expect(final.battle!.stats.sourceClears).toBeGreaterThanOrEqual(4);expect(final.battle!.stats.eliteClears).toBe(2);
    expect(final.battle!.pressure.infection).toBeLessThan(35);expect(Object.values(final.campaign!.arenas).filter(arena=>arena.activated).every(arena=>arena.tissue.hp>=50)).toBe(true);
    expect(choices.length).toBeGreaterThanOrEqual(2);expect(choices.some(choice=>(choice as{selected:unknown}).selected!==null)).toBe(true);
    runs.push({seed:91,firstTrait,result:final.result,elapsed:final.elapsed,actualTraits:final.battle!.traits,core:final.campaign!.core.status,progress:final.campaign!.progress,choices});
    const path=resolve(process.env.VI_FORMAL_NONCOUNTER_REPORT??'artifacts/unit-generated/formal-noncounter-unit-first.json');mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,JSON.stringify({complete:runs.length===3,method:'Full formal TypeScript campaign through public InputFrame/DraftIntent only. Every choice avoids first/current/warned threat counters; no future outcomes are read. Discard is used only when no valid noncounter candidate exists.',scope:'Three explicit first-trait cases, not1000 adversarial cases or real browsers. Earlier equipment can incidentally counter a later unknown trait; this fact is retained, never called a future-proof noncounter build.',runs},null,2));
  });
});
