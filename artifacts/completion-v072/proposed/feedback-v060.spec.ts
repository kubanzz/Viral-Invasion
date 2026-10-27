import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync,readFileSync} from 'node:fs';
import {readState,walk,aim} from './campaignDriver';
import {fullRun} from './fullRunDriver';
import type {MigrationChoice} from '../../src/game/campaignTypes';
import type {ProtocolId} from '../../src/game/growthTypes';
import {PATROL_CONFIG,protocolRank} from '../../src/game/protocols';
import {IMMUNE_CELL_BALANCE} from '../../src/game/immuneCells';
import {activeWorld,type GameEvent,type GameState,type Vec} from '../../src/game/types';
import {distance,normalized,wallHit} from '../../src/actors/collision';

const entry=pathToFileURL(resolve('dist/index.html')).href;
test.use({video:'off',trace:'off'});
test.beforeEach(async({context})=>{await context.setOffline(true);});

// Match the semantic log to accepted positive HP loss; planned activations are
// not damage evidence. These helpers only read snapshots and issue DOM input.
function acceptedHits(state:GameState,type:'IMMUNE_PATROL_HIT'|'PROTOCOL_BEACON_HIT'|'PROTOCOL_RICOCHET_HIT',sinceTick:number):GameEvent[]{
 const protocol=type==='PROTOCOL_RICOCHET_HIT'?'PURIFY_CHAIN':'IMMUNE_BEACON';
 return state.events.filter(event=>event.type===type&&event.tick>=sinceTick&&Number(event.data.damage)>0&&state.events.some(hit=>
  hit.type==='TARGET_HIT'&&hit.tick===event.tick&&hit.data.rootId===event.data.rootId&&hit.data.id===event.data.targetId&&hit.data.protocolId===protocol&&hit.data.cause==='protocol'&&Number(hit.data.damage)>0));
}
const stoppedInput='fullRun releases movement and mouse before onDraft; mouse.up → walk with real WASD → aim at live noncore target → Q → observe without firing';

async function demonstrateAdvancedBeacon(page:Page,writeEvidence:(record:unknown)=>void):Promise<void>{
 await page.mouse.up();
 const before=await readState(page),slot=before.growth!.equipped.find(item=>item.id==='IMMUNE_BEACON');
 expect(slot&&protocolRank(slot)).toBeGreaterThanOrEqual(2);
 const metricBefore=before.runMetrics!.summary.control.beaconBites;
 const target=before.targets.filter(item=>item.hp>0&&item.role!=='core').sort((a,b)=>
  Number(b.role==='source')-Number(a.role==='source')||b.hp-a.hp||distance(a,before.player)-distance(b,before.player))[0];
 expect(target,'An advanced squad needs a real surviving noncore target').toBeTruthy();
 // Prefer a clear approach on the player's side. walk uses real keys and the
 // world's visible collision footprints, never a player/target state write.
 const outward=normalized(before.player.x-target.x,before.player.y-target.y);
 const approach:Vec={x:target.x+outward.x*190,y:target.y+outward.y*190};
 await walk(page,approach,25);
 await expect.poll(async()=>{const s=await readState(page);return s.phase==='playing'&&s.scanReady<=s.elapsed&&s.growth!.beaconReadyAt<=s.elapsed;},{timeout:16000}).toBe(true);
 const ready=await readState(page),fresh=ready.targets.find(item=>item.id===target.id&&item.hp>0);
 expect(fresh,'The stopped-fire target must still be alive').toBeTruthy();
 expect(fresh!.role).not.toBe('core');expect(distance(ready.player,fresh!)).toBeLessThan(400);
 const wall=wallHit(ready.player,normalized(fresh!.x-ready.player.x,fresh!.y-ready.player.y),distance(ready.player,fresh!),activeWorld(ready));
 expect(wall===null||wall>=distance(ready.player,fresh!)-fresh!.radius,'Squad placement must have a real clear path').toBe(true);
 const record:{input:string;before:GameState;ready:GameState;target:unknown;observations:unknown[];after?:GameState;acceptedEvents?:GameEvent[]}={input:stoppedInput,before,ready,target:fresh,observations:[]};
 writeEvidence(record);
 await aim(page,fresh!);await page.keyboard.press('KeyQ');
 let bitten:GameState|undefined;
 await expect.poll(async()=>{
  const state=await readState(page),beacon=state.growth!.beacon,events=acceptedHits(state,'PROTOCOL_BEACON_HIT',ready.tick);
  record.observations.push({tick:state.tick,phase:state.phase,beacon,cells:state.growth!.cells,metrics:state.runMetrics!.summary.control,target:state.targets.find(item=>item.id===target.id),acceptedEvents:events});
  writeEvidence(record);
  const advanced=state.growth!.equipped.find(item=>item.id==='IMMUNE_BEACON');
  const sameSquad=beacon?.mode==='protocol'&&state.growth!.cells?.length===3&&events.some(event=>state.growth!.cells!.some(cell=>cell.id===event.data.cellId&&cell.beaconId===beacon.id));
  const passed=state.phase==='playing'&&!!advanced&&protocolRank(advanced)>=2&&sameSquad&&state.runMetrics!.summary.control.beaconBites>metricBefore;
  if(passed)bitten=state;return passed;
 },{timeout:7000,intervals:[40,60,100]}).toBe(true);
 record.after=bitten;record.acceptedEvents=acceptedHits(bitten!,'PROTOCOL_BEACON_HIT',ready.tick);writeEvidence(record);
 expect(bitten!.runMetrics!.summary.limited).toBe(false);
 expect(record.acceptedEvents.length).toBeGreaterThan(0);
}

test('Feedback: spacious arena, follow camera, visible native cell patrol and paused freeze',async({page},info)=>{
 test.setTimeout(65000);if(info.project.name==='edge')await page.setViewportSize({width:1100,height:560});
 await page.goto(`${entry}?seed=7`);await page.locator('[data-action="start"]').click();
 const start=await readState(page);expect(start.world!.width).toBe(2400);expect(start.world!.height).toBe(1500);
 const before=await page.evaluate(()=>({origin:window.__viral.toScreen({x:0,y:0}),player:window.__viral.toScreen(window.__viral.snapshot().player)}));
 await expect(page.locator('#tactical-map')).toBeVisible();await page.screenshot({path:info.outputPath('entry-district.png')});
 const source=start.targets.find(t=>t.id==='source-a')!;
 await walk(page,{x:source.x-140,y:source.y+100},45);
 // Mark beside the source: marking its center spawns a patrol already within
 // 58-unit contact reach, which correctly bites without moving at all.
 const patrolAim={x:source.x-110,y:source.y};
 await page.mouse.up();const beforeSummon=await readState(page),patrolBefore=beforeSummon.runMetrics!.summary.control.patrolBites;
 writeFileSync(info.outputPath('patrol-input.json'),JSON.stringify({input:'mouse.up → offset aim → Q; observe movement and positive accepted bite without firing',patrolAim,source,beforeSummon},null,2));
 await aim(page,patrolAim);await page.keyboard.press('KeyQ');
 await expect.poll(async()=>(await readState(page)).growth?.cells?.length).toBe(1);
 const summoned=await readState(page),cell=summoned.growth!.cells![0];expect(summoned.growth!.beacon!.mode).toBe('patrol');expect(summoned.growth!.equipped).toHaveLength(0);
 expect(distance(summoned.growth!.beacon!,source)).toBeLessThan(PATROL_CONFIG.radius);
 expect(distance(cell,source)).toBeGreaterThan(source.radius+cell.radius+IMMUNE_CELL_BALANCE.biteReach+10);
 const patrolObservations:unknown[]=[];let movedState:GameState|undefined;
 await expect.poll(async()=>{const s=await readState(page),same=s.growth!.cells?.find(item=>item.id===cell.id);
  patrolObservations.push({tick:s.tick,cell:same,metrics:s.runMetrics!.summary.control,acceptedEvents:acceptedHits(s,'IMMUNE_PATROL_HIT',beforeSummon.tick)});
  writeFileSync(info.outputPath('patrol-movement-observations.json'),JSON.stringify({summoned,cell,patrolObservations},null,2));
  if(same&&distance(same,cell)>5)movedState=s;return !!movedState;
 },{timeout:2000,intervals:[30,50,80]}).toBe(true);
 await expect.poll(async()=>{const s=await readState(page),events=acceptedHits(s,'IMMUNE_PATROL_HIT',beforeSummon.tick).filter(event=>event.data.cellId===cell.id);
  writeFileSync(info.outputPath('patrol-accepted-observation.json'),JSON.stringify({beforeSummon,summoned,movedState,after:s,acceptedEvents:events},null,2));
  return s.runMetrics!.summary.control.patrolBites>patrolBefore&&events.length>0;
 },{timeout:7000,intervals:[40,60,100]}).toBe(true);
 const attacked=await readState(page),patrolAcceptedEvents=acceptedHits(attacked,'IMMUNE_PATROL_HIT',beforeSummon.tick).filter(event=>event.data.cellId===cell.id);
 expect(patrolAcceptedEvents.length).toBeGreaterThan(0);expect(attacked.runMetrics!.summary.control.patrolBites).toBeGreaterThan(patrolBefore);expect(attacked.runMetrics!.summary.limited).toBe(false);
 await page.screenshot({path:info.outputPath('cell-patrol-bite.png')});
 const after=await page.evaluate(()=>({origin:window.__viral.toScreen({x:0,y:0}),player:window.__viral.toScreen(window.__viral.snapshot().player)}));
 expect(Math.hypot(after.origin.x-before.origin.x,after.origin.y-before.origin.y)).toBeGreaterThan(200);
 const moved=movedState!.growth!.cells!.find(item=>item.id===cell.id)!;expect(distance(moved,cell)).toBeGreaterThan(5);
 const roundTrip=await page.evaluate(()=>{const p=window.__viral.snapshot().player;const world={x:p.x+60,y:p.y-40};return{world,back:window.__viral.toWorld(window.__viral.toScreen(world))};});
 expect(roundTrip.back.x).toBeCloseTo(roundTrip.world.x,8);expect(roundTrip.back.y).toBeCloseTo(roundTrip.world.y,8);
 const nearest=attacked.targets.filter(t=>t.hp>0).sort((a,b)=>Math.hypot(a.x-attacked.player.x,a.y-attacked.player.y)-Math.hypot(b.x-attacked.player.x,b.y-attacked.player.y))[0];
 await page.keyboard.press('Digit1');await aim(page,nearest);await page.mouse.down();await page.waitForTimeout(80);await page.mouse.up();
 await expect.poll(async()=>{const s=await readState(page);return s.events.some(e=>e.tick>=attacked.tick&&e.type==='TARGET_HIT'&&e.data.cause==='basic');}).toBe(true);
 await page.keyboard.press('Escape');const paused=await readState(page);await page.waitForTimeout(350);expect(await readState(page)).toEqual(paused);
 writeFileSync(info.outputPath('spatial-cell-evidence.json'),JSON.stringify({start,before,input:{kind:'real WASD walk, offset mouse aim, Q, no firing',patrolAim},beforeSummon,summoned,movedState,patrolObservations,patrolAcceptedEvents,attacked,after,paused,build:JSON.parse(readFileSync('dist/build-meta.json','utf8'))},null,2));
});

for(const [index,choice]of (['block','pursue','ignore'] as MigrationChoice[]).entries())test(`Feedback: ${choice} route wins through a visible advanced build`,async({page},info)=>{
 test.skip(info.project.name!==(index===1?'edge':'chrome'),'Three migration routes are allocated across the two browsers.');test.setTimeout(220000);
 const primary:ProtocolId=index===1?'PURIFY_CHAIN':'IMMUNE_BEACON';
 const errors:string[]=[],remote:string[]=[],drafts:unknown[]=[],demonstrations:unknown[]=[],acceptedBenefits=new Map<string,GameEvent>(),captured=new Set<string>();let advancedBeaconDemonstrated=false;
 const saveDemonstration=(record:unknown)=>{if(demonstrations.at(-1)!==record)demonstrations.push(record);writeFileSync(info.outputPath('advanced-demonstrations.json'),JSON.stringify({choice,primary,demonstrations},null,2));};
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
 await page.goto(`${entry}?seed=${[1,91,13][index]}`);await page.locator('[data-action="start"]').click();
 await fullRun(page,choice,async scene=>{await page.screenshot({path:info.outputPath(`${scene}.png`)});},true,async s=>{
  const draft=s.growth!.draft!,current=s.growth!.equipped.find(p=>p.id===primary);
  const option=draft.options.find(o=>o.protocolId===primary&&(!current||(o.rank??1)>protocolRank(current)))??draft.options.find(o=>o.kind==='equip')??draft.options[0];
  drafts.push({elapsed:s.elapsed,equipped:s.growth!.equipped,options:draft.options,selected:option});
  await expect(page.locator('.draft-change').first()).toBeVisible();await expect(page.locator('.draft-action').first()).toBeVisible();
  await page.screenshot({path:info.outputPath(`draft-${draft.serial}.png`)});
  await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
  if((await readState(page)).growth?.draft?.status==='replacing')await page.locator('[data-action="draft-replace"]').last().click();
  await expect(page.locator('#evolution-feedback')).toContainText('进化完成');
  const committed=await readState(page),advanced=committed.growth!.equipped.find(slot=>slot.id===primary);
  // onDraft is entered with fullRun's held keys and mouse already released.
  // Demonstrate the upgraded ability before resuming its aggressive strategy.
  if(primary==='IMMUNE_BEACON'&&!advancedBeaconDemonstrated&&committed.phase==='playing'&&advanced&&protocolRank(advanced)>=2){
   await demonstrateAdvancedBeacon(page,saveDemonstration);advancedBeaconDemonstrated=true;
  }
 },async s=>{
  const actual=[...acceptedHits(s,'PROTOCOL_BEACON_HIT',0),...acceptedHits(s,'PROTOCOL_RICOCHET_HIT',0)];
  for(const event of actual)acceptedBenefits.set(`${event.tick}:${event.type}:${event.data.rootId}:${event.data.targetId}`,event);
  const event=actual.find(e=>s.tick-e.tick<=25);
  const cells=s.growth!.cells??[];
  const visible=await (event&&!captured.has(event.type)?page.evaluate(points=>points.every(p=>{const v=window.__viral.toScreen(p);return v.x>0&&v.x<innerWidth&&v.y>80&&v.y<innerHeight-110;}),cells):Promise.resolve(false));
  if(event&&!captured.has(event.type)&&(event.type!=='PROTOCOL_BEACON_HIT'||cells.length===3&&visible)){
   captured.add(event.type);await page.screenshot({path:info.outputPath(`${event.type.toLowerCase()}-live.png`)});
   const after=await readState(page);writeFileSync(info.outputPath(`${event.type.toLowerCase()}-live.json`),JSON.stringify({before:s,after,scope:'Actual live screenshot bracket, not guaranteed same tick.'},null,2));
  }
 });
 const final=await readState(page);writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,primary,drafts,demonstrations,advancedBeaconDemonstrated,acceptedBenefits:[...acceptedBenefits.values()],final,errors,remote},null,2));
 expect(final.result?.success).toBe(true);expect(final.campaign!.migration.choice).toBe(choice);
 expect(final.growth!.equipped.some(p=>protocolRank(p)>=2)).toBe(true);expect(final.runMetrics!.summary.limited).toBe(false);
 if(primary==='IMMUNE_BEACON'){
  expect(advancedBeaconDemonstrated).toBe(true);expect(final.runMetrics!.summary.control.beaconBites).toBeGreaterThan(0);
 }else{
  expect(final.runMetrics!.summary.control.ricochetHits).toBeGreaterThan(0);
  expect([...acceptedBenefits.values()].some(event=>event.type==='PROTOCOL_RICOCHET_HIT'&&Number(event.data.rank)>=2)).toBe(true);
 }
 expect(final.growth!.cells).toEqual([]);expect(errors).toEqual([]);expect(remote).toEqual([]);
 await page.screenshot({path:info.outputPath('result.png')});writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,primary,drafts,demonstrations,advancedBeaconDemonstrated,acceptedBenefits:[...acceptedBenefits.values()],final,errors,remote},null,2));
 await page.locator('[data-action="retry"]').click();const retry=await readState(page);expect(retry.growth!.equipped).toEqual([]);expect(retry.growth!.cells).toEqual([]);expect(retry.player.hp).toBe(100);expect(retry.world!.width).toBe(2400);
});
