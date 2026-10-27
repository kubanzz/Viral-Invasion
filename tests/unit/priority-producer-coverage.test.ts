import{describe,it,expect}from'vitest';
import{readFileSync,mkdirSync,writeFileSync}from'node:fs';import{resolve,dirname}from'node:path';
import{GameSession}from'../../src/game/session';
import{tacticalFeedback,TACTICAL_RECORD_LIMIT}from'../../src/game/tacticalFeedback';
import{campaignOverlay}from'../../src/ui/campaignHud';
import{type GameEvent}from'../../src/game/types';

// Explicit presentation/event fixtures. They do not prove natural combat or actual endings.
const examples:Array<{type:string,data:GameEvent['data']}>=[];
const add=(type:string,data:GameEvent['data']={})=>examples.push({type,data});
for(const trait of['CARAPACE','FISSION','MIMIC']){
  add('EVOLUTION_WARNING',{trait,duration:8});add('EVOLUTION_APPLIED',{trait});add('CORE_MEMBRANE_BROKEN',{trait,remaining:1});add('ELITE_CLEARED',{trait,organId:'heart'});
}
for(const organId of['heart','lung']){
  add('ORGAN_ALARM',{organId});add('ORGAN_ALARM_CLEARED',{organId});add('CORE_LOCATED',{organId});add('INFECTION_SOURCE_CLEARED',{organId});
  add('BACKGROUND_PRESSURE',{organId,openSources:2,integrityLoss:.75});add('ORGAN_TRAVELLED',{to:organId,backgroundLoss:.75});
  add('ORGAN_CRISIS_STARTED',{organId,sourceId:'explicit-feedback-fixture',chargeSeconds:8,maximumImpacts:3,blockedByAirway:false});
  add('ORGAN_CRISIS_INTERRUPTED',{organId,sourceId:'explicit-feedback-fixture',chargeSeconds:8,interruptions:1,reason:organId==='heart'?'pulse':'airway'});
  add('ORGAN_CRISIS_CLEARED',{organId,sourceId:'explicit-feedback-fixture',impacts:1,interruptions:1});
}
for(const choice of['pursue','block','ignore'])add('MIGRATION_DECIDED',{choice});
for(const type of['INFECTION_CRISIS_STARTED','INFECTION_CRISIS_RECOVERED','MIGRATION_WARNING','MIGRATION_BLOCK_STARTED','MIGRATION_BLOCK_CANCELLED','MIGRATION_PREEMPTIVELY_BLOCKED','MIGRATION_INTERCEPTED','MIGRATION_ESTABLISHED','CORE_COMBAT_STARTED','CORE_MEMBRANES_OPENED','CORE_CORROSION_INTERRUPTED','CORE_CLEARED','RETEST_COMPLETED'])add(type);
add('RUN_ENDED',{reason:'隔离提示夹具的终局原因'});

describe('exhaustive shipped high-priority feedback categories',()=>{
  it('keeps every real producer category reviewable after raw-log and action-history eviction',()=>{
    const source=readFileSync(resolve('src/game/tacticalFeedback.ts'),'utf8');
    const declared=[...source.matchAll(/case '([A-Z_]+)'/g)].map(match=>match[1]);
    expect([...new Set(examples.map(example=>example.type))].sort()).toEqual([...new Set([...declared,'ORGAN_CRISIS_STARTED','ORGAN_CRISIS_INTERRUPTED','ORGAN_CRISIS_CLEARED'])].sort());
    const game=new GameSession(13,{campaign:true,milestone:'G3'});game.start();
    const feedbacks=examples.map(example=>{const event={...example,tick:game.state.tick};const feedback=tacticalFeedback(event);expect(feedback,example.type).toBeDefined();game.emit(example.type,example.data);return{type:example.type,data:example.data,...feedback!};});
    const high=feedbacks.filter(feedback=>feedback.priority>=2);const uniqueHigh=new Map(high.map(feedback=>[feedback.key,feedback]));
    expect(uniqueHigh.size).toBeGreaterThan(30);expect(game.state.tacticalRecords!.length).toBeLessThan(TACTICAL_RECORD_LIMIT);
    const before=game.snapshot(),urgent=game.state.message,until=game.state.messageUntil;
    for(let i=0;i<1000;i++){game.emit('SCAN_COMPLETED',{found:i%4});game.message('普通充能或修复提示',1,0);}
    expect(game.state.events).toHaveLength(512);expect(game.state.events.some(event=>event.type==='EVOLUTION_WARNING')).toBe(false);
    expect(game.state.message).toBe(urgent);expect(game.state.messageUntil).toBe(until);expect(game.state.tacticalRecords).toEqual(before.tacticalRecords);
    const markup=campaignOverlay(game.state,false,false,false,true)!;
    for(const feedback of uniqueHigh.values()){
      expect(game.state.tacticalRecords!.find(record=>record.key===feedback.key)?.text).toBe(feedback.text);
      const escaped=feedback.text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');expect(markup).toContain(escaped);
    }
    const output=resolve(process.env.VI_PRIORITY_PRODUCERS_REPORT??'artifacts/unit-generated/priority-producer-coverage.json');mkdirSync(dirname(output),{recursive:true});
    writeFileSync(output,JSON.stringify({method:'Explicit feedback fixtures across every shipped tacticalFeedback switch category and valid trait/organ/choice variants. Accepted through GameSession.emit, then1000 ordinary messages/events. Actual history markup checked; no live browser state injection or natural ending claim.',examples:feedbacks,highPriorityUniqueKeys:uniqueHigh.size,totalRecordKeys:before.tacticalRecords!.length,recordLimit:TACTICAL_RECORD_LIMIT,rawEventsAfter:game.state.events.length,allHighCategoriesRetained:true,allHighCategoriesRendered:true,ordinaryMessagesDidNotReplaceUrgent:true},null,2));
  });
});
