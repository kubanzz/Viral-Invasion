import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { aim, chooseDraftInput, completeHeart, readState, walk } from './campaignDriver';
import { getChainConfig, protocolRank } from '../../src/game/protocols';

const entry=pathToFileURL(resolve('dist/index.html')).href;
test('G2: seeded evolution, event-driven paused drafts, real build and clean retry',async({page,context},info)=>{
  test.setTimeout(150000);
  const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await context.setOffline(true);await context.route(/^https?:/i,async route=>{remote.push(route.request().url());await route.abort();});
  await page.goto(`${entry}?fixture=G2&seed=130026`);await page.locator('[data-action="start"]').click();
  let firstDraftSeen=false;
  await completeHeart(page,async()=>{await page.screenshot({path:info.outputPath('g2-warning.png')});},async()=>{await page.screenshot({path:info.outputPath('g2-pulse.png')});},async state=>{
    if(firstDraftSeen)return;firstDraftSeen=true;await page.screenshot({path:info.outputPath('g2-draft.png')});
    const tick=state.tick, draftId=state.growth!.draft!.id;
    await page.keyboard.press('Escape');await page.keyboard.press('Tab');
    await page.locator('[data-action="help"]').last().click();await expect(page.getByRole('dialog',{name:'操作指南'})).toBeVisible();
    await page.locator('[data-action="close-help"]').click();
    // Explicit synthetic focus-loss regression; this does not claim physical OS blur.
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    info.annotations.push({type:'focus-provenance',description:'Draft focus-loss event is synthetic. Physical OS blur remains unverified.'});
    await page.waitForTimeout(300);const frozen=await readState(page);expect(frozen.tick).toBe(tick);expect(frozen.growth!.draft!.id).toBe(draftId);expect(frozen.growth!.equipped).toEqual([]);
  });
  const result=await readState(page);
  expect(result.result?.success).toBe(true);
  expect(firstDraftSeen).toBe(true);
  expect(result.growth!.consumedDraftIds.length).toBeGreaterThanOrEqual(2);
  expect(result.growth!.equipped.length).toBeGreaterThanOrEqual(2);
  expect(result.growth!.equipped.length).toBeLessThanOrEqual(3);
  expect(result.battle!.evolutionDecisions).toHaveLength(2);
  for(const d of result.battle!.evolutionDecisions!){expect(d.kind).toBe('warn');if(d.kind==='warn')for(const c of d.candidates)expect(c.probability).toBeLessThanOrEqual(.55+1e-10);}
  await page.screenshot({path:info.outputPath('g2-success.png')});
  await info.attach('g2-result',{body:Buffer.from(JSON.stringify(result,null,2)),contentType:'application/json'});
  const runId=result.growth!.runId;
  await page.locator('[data-action="retry"]').click();const retry=await readState(page);
  expect(retry.seed).toBe(result.seed);expect(retry.growth!.runId).not.toBe(runId);expect(retry.growth!.equipped).toEqual([]);expect(retry.growth!.xp).toBe(0);expect(retry.growth!.draft).toBeNull();
  expect(errors).toEqual([]);expect(remote).toEqual([]);
});

test('G2 RUN-06: legally acquire both pairs, trigger their real effects, research a fourth and replace',async({page,context},info)=>{
  test.setTimeout(180000);await context.setOffline(true);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const observedEvents=new Map<string,Awaited<ReturnType<typeof readState>>['events'][number]>();
  const observe=(snapshot:Awaited<ReturnType<typeof readState>>)=>{for(const event of snapshot.events)observedEvents.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`,event);};
  const checkpoint=async(name:string,extra:Record<string,unknown>={})=>{const snapshot=await readState(page);observe(snapshot);writeFileSync(info.outputPath(`${name}.json`),JSON.stringify({snapshot,observedEvents:[...observedEvents.values()],...extra,build:JSON.parse(readFileSync('dist/build-meta.json','utf8'))},null,2));return snapshot;};
  const sawPair=(pair:string)=>[...observedEvents.values()].some(event=>event.type==='PROTOCOL_SYNERGY'&&event.data.pair===pair);
  await page.goto(`${entry}?fixture=G2&seed=130026&trait=CARAPACE`);await page.locator('[data-action="start"]').click();
  await walk(page,{x:620,y:520},35);await page.keyboard.press('KeyQ');
  let lastScan=-9;const deadline=Date.now()+90000;
  const evolutionFrames:Record<string,Awaited<ReturnType<typeof readState>>>={};
  // Keep the second source alive until the first elite is cleared, so there are
  // genuine neighbors to chain through. This changes only target priorities.
  while(Date.now()<deadline){
    const s=await readState(page);observe(s);if(s.phase==='paused'&&s.growth?.draft){await page.mouse.up();await chooseDraftInput(page);continue;}
    if(s.phase!=='playing')throw new Error(`Opening failed: ${s.result?.reason}`);
    const frameName=s.battle!.traits.length?'after':s.battle!.warning?'warning':s.elapsed>=10?'before':null;
    if(frameName&&!evolutionFrames[frameName]){evolutionFrames[frameName]=s;await page.screenshot({path:info.outputPath(`g2-evolution-${frameName}.png`)});}
    if(s.battle!.stats.eliteClears>=1&&s.growth!.equipped.length>=2)break;
    if(s.elapsed-lastScan>3.2){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
    const target=s.targets.find(t=>t.hp>0&&t.id==='source-a')??s.targets.find(t=>t.hp>0&&t.role==='elite')??s.targets.find(t=>t.hp>0&&t.role==='virus'&&Math.hypot(t.x-s.player.x,t.y-s.player.y)<150);
    const heal=s.tissue.hp<75;
    if(heal||target){await page.keyboard.press(heal?'Digit3':'Digit1');await aim(page,heal?s.tissue:target!);await page.mouse.down();}
    else await page.mouse.up();
    await page.waitForTimeout(120);
  }
  await page.mouse.up();let state=await checkpoint('g2-opening-before-assert');
  expect(state.battle!.stats.sourceClears).toBe(1);expect(state.battle!.stats.eliteClears).toBeGreaterThanOrEqual(1);
  expect(state.growth!.equipped.map(p=>p.id)).toEqual(expect.arrayContaining(['PULSE_BREAK','PURIFY_CHAIN']));
  await walk(page,state.battle!.pulse.origin,65);
  // Start on a high-HP source with a genuine nearby body during surge. Keep
  // using precision fire after surge ends so the same 4-second exposure can
  // actually be finished. A lone area hit per six-second rhythm lets it expire;
  // a patrol-wounded 68-HP body may also die before area fire can mark it.
  const chainDeadline=Date.now()+30000;
  const pulseAttempts:unknown[]=[];
  let finishing:string|null=null,finishUntil=0;
  while(Date.now()<chainDeadline){
    state=await readState(page);observe(state);if(state.phase==='paused'&&state.growth?.draft){await page.mouse.up();await chooseDraftInput(page);continue;}
    if(sawPair('PULSE_BREAK+PURIFY_CHAIN'))break;
    if(state.phase!=='playing')break;
    const source=state.targets.find(t=>t.hp>0&&t.id==='source-b');
    const chain=state.growth!.equipped.find(slot=>slot.id==='PURIFY_CHAIN')!;
    const range=getChainConfig(chain.tuning,protocolRank(chain)).range;
    let target=state.targets.find(t=>t.id===finishing&&t.hp>0);
    if(!target||state.elapsed>=finishUntil){target=undefined;finishing=null;}
    if(!target&&source&&state.battle!.pulse.phase==='surge'&&state.battle!.pulse.phaseRemaining>.18){
      const neighbors=state.targets.filter(t=>t.hp>0&&t.id!==source.id&&Math.hypot(t.x-source.x,t.y-source.y)<Math.min(range-20,125));
      if(neighbors.length){target=source;finishing=source.id;finishUntil=state.elapsed+3.8;pulseAttempts.push({kind:'start',tick:state.tick,elapsed:state.elapsed,player:state.player,target:source,neighbors});}
    }
    if(!target){await page.mouse.up();await page.waitForTimeout(60);continue;}
    // Read actual resonance hits: moving bodies can intercept a precision ray.
    // Finish the truly exposed target instead of assuming the aimed source hit.
    const exposed=state.targets.filter(t=>t.hp>0&&(t.exposedUntil??0)>state.elapsed&&state.events.some(e=>e.type==='PROTOCOL_RESONANCE_HIT'&&e.data.targetId===t.id&&e.tick>=state.tick-240)).sort((a,b)=>(a.exposedUntil??0)-(b.exposedUntil??0))[0];
    if(exposed){target=exposed;finishing=exposed.id;finishUntil=Math.min(finishUntil,exposed.exposedUntil!);}
    pulseAttempts.push({kind:'precision',tick:state.tick,elapsed:state.elapsed,phase:state.battle!.pulse.phase,target:{id:target.id,hp:target.hp,x:target.x,y:target.y,exposedUntil:target.exposedUntil},finishUntil});
    await page.keyboard.press('Digit1');await aim(page,target);await page.mouse.down();await page.waitForTimeout(70);
  }
  await page.mouse.up();state=await checkpoint('g2-pulse-chain-before-assert',{pulseAttempts});expect(sawPair('PULSE_BREAK+PURIFY_CHAIN')).toBe(true);
  await page.screenshot({path:info.outputPath('g2-pulse-chain-build.png')});
  await walk(page,{x:475,y:610},25);
  const researchSteps:Array<{before:Awaited<ReturnType<typeof readState>>;after:Awaited<ReturnType<typeof readState>>}>=[];
  const researchOpenings:unknown[]=[];
  let replacementSeen=false;
  for(let i=0;i<2&&(!replacementSeen||!['EXPOSE_TRACE','IMMUNE_BEACON'].every(id=>state.growth!.equipped.some(slot=>slot.id===id)));i++){
    const beforeResearch=await readState(page);
    await page.keyboard.press('KeyE');await expect.poll(async()=>(await readState(page)).growth!.draft!==null).toBe(true);
    const opened=await readState(page);researchOpenings.push({before:beforeResearch,opened});
    expect(opened.growth!.draft!.source).toBe('research');expect(beforeResearch.growth!.research-opened.growth!.research).toBe(3);
    while((await readState(page)).growth!.draft){const before=await readState(page);await chooseDraftInput(page,['EXPOSE_TRACE','IMMUNE_BEACON','PULSE_BREAK','PURIFY_CHAIN']);const after=await readState(page);observe(after);researchSteps.push({before,after});if(before.growth!.draft!.status==='replacing'&&before.growth!.equipped.length===3&&after.growth!.equipped.some(slot=>!before.growth!.equipped.some(old=>old.id===slot.id)))replacementSeen=true;}
    // XP may already supply the third protocol. Once the researched fourth has
    // genuinely replaced a slot and both desired routes are present, another
    // generic "new route first" draft would just re-equip the discarded route.
    state=await readState(page);
  }
  state=await checkpoint('g2-fourth-protocol-before-assert',{researchSteps,researchOpenings,replacementSeen});expect(replacementSeen).toBe(true);expect(state.growth!.equipped).toHaveLength(3);
  expect(state.growth!.equipped.map(p=>p.id)).toEqual(expect.arrayContaining(['EXPOSE_TRACE','IMMUNE_BEACON']));
  const traceDeadline=Date.now()+25000;
  while(Date.now()<traceDeadline){
    state=await readState(page);observe(state);if(state.phase==='paused'&&state.growth?.draft){await chooseDraftInput(page,['EXPOSE_TRACE','IMMUNE_BEACON','PULSE_BREAK','PURIFY_CHAIN']);continue;}
    const target=state.targets.find(t=>t.hp>0&&t.role!=='source');
    if(target&&state.scanReady<=state.elapsed){await aim(page,target);await page.keyboard.press('KeyQ');}
    if(sawPair('EXPOSE_TRACE+IMMUNE_BEACON'))break;
    await page.waitForTimeout(120);
  }
  state=await checkpoint('g2-trace-beacon-before-assert');expect(sawPair('EXPOSE_TRACE+IMMUNE_BEACON')).toBe(true);
  await page.screenshot({path:info.outputPath('g2-trace-beacon.png')});
  await info.attach('g2-both-synergy-events',{body:Buffer.from(JSON.stringify(state,null,2)),contentType:'application/json'});
  await info.attach('g2-evolution-frames',{body:Buffer.from(JSON.stringify(evolutionFrames,null,2)),contentType:'application/json'});
  await completeHeart(page);const final=await checkpoint('g2-final-before-assert',{errors});expect(final.result?.success).toBe(true);expect(errors).toEqual([]);
});
