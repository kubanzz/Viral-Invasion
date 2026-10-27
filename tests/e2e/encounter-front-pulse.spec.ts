import{test,expect}from'@playwright/test';
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
import{aim,walk,readState}from'./campaignDriver';
import{distance}from'../../src/actors/collision';
import{type GameEvent}from'../../src/game/types';

test.use({trace:'off',video:'off'});
const entry=pathToFileURL(resolve(process.env.VI_ENTRY??'dist/index.html')).href;
test('Formal crystal counter: same guardian resists a frontal hit, accepts real valve exposure and is cleared',async({page,context},info)=>{
  test.setTimeout(85000);await context.setOffline(true);
  const events=new Map<string,GameEvent>(),errors:string[]=[],remote:string[]=[],checkpoints:Record<string,unknown>={},observations:unknown[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))remote.push(request.url());});
  const snapshot=async()=>{const state=await readState(page);for(const event of state.events)events.set(JSON.stringify(event),event);return state;};
  try{
    await page.goto(entry+'?seed=13');await page.locator('[data-action="start"]').click();const start=await snapshot();checkpoints.start=start;
    expect(start.battle!.encounter).toMatchObject({configId:'campaign-1',guideVariant:'guided'});
    const source=start.targets.find(target=>target.id==='source-a')!;await walk(page,{x:source.x-140,y:source.y+100},30);await aim(page,source);await page.keyboard.press('KeyQ');await page.keyboard.press('Digit1');await page.mouse.down();
    try{await expect.poll(async()=>(await snapshot()).targets.find(target=>target.id===source.id)!.hp,{timeout:12000}).toBe(0);}finally{await page.mouse.up();}
    while((await snapshot()).growth?.draft)await page.locator('[data-action="draft-discard"]').click();
    await expect.poll(async()=>(await snapshot()).battle!.encounter!.firstCounter.status).toBe('warning');const warning=await snapshot();checkpoints.warning=warning;
    expect(warning.battle!.warning!.applyAt-warning.battle!.warning!.startedAt).toBeGreaterThanOrEqual(8-1e-9);await page.screenshot({path:info.outputPath('warning.png')});
    await walk(page,warning.battle!.pulse.origin,35);await expect.poll(async()=>(await snapshot()).battle!.encounter!.firstCounter.status,{timeout:12000}).toBe('active');
    const before=await snapshot(),id=before.battle!.encounter!.firstCounter.targetId!,target=before.targets.find(target=>target.id===id)!;checkpoints.beforeFront=before;
    expect(before.growth!.equipped).toEqual([]);expect(distance(before.player,before.battle!.pulse.origin)).toBeLessThan(110);expect(target.traits).toContain('CARAPACE');
    const frontDeadline=Date.now()+5000;
    while(Date.now()<frontDeadline&&![...events.values()].some(event=>event.type==='CARAPACE_RESISTED'&&event.data.id===id)){
      const state=await snapshot(),live=state.targets.find(target=>target.id===id&&target.hp>0)!;expect(live).toBeDefined();
      const frontalCosine=Math.cos(Math.atan2(state.player.y-live.y,state.player.x-live.x)-(live.facing??0));observations.push({tick:state.tick,target:live,player:state.player,frontalCosine});
      await aim(page,live);await page.mouse.down();await page.waitForTimeout(60);await page.mouse.up();await snapshot();
    }
    const resistance=[...events.values()].find(event=>event.type==='CARAPACE_RESISTED'&&event.data.id===id);expect(resistance).toBeDefined();
    const resistedHit=[...events.values()].find(event=>event.type==='TARGET_HIT'&&event.tick===resistance!.tick&&event.data.id===id&&event.data.cause==='basic'&&event.data.tool===1);
    expect(resistedHit).toBeDefined();expect(resistedHit!.data.damage).toBeCloseTo(Number(resistance!.data.actual),5);expect(Number(resistedHit!.data.damage)).toBeLessThan(Number(resistance!.data.raw));expect(Number(resistedHit!.data.damage)).toBeGreaterThan(0);
    expect([...events.values()].filter(event=>event.type==='PULSE_TRIGGERED')).toHaveLength(0);checkpoints.resisted=await snapshot();await page.screenshot({path:info.outputPath('front-resistance.png')});
    const stillAlive=(await snapshot()).targets.find(target=>target.id===id&&target.hp>0)!;await aim(page,stillAlive);await page.screenshot({path:info.outputPath('valve-preview.png')});await page.keyboard.press('KeyE');
    await expect.poll(async()=>{const state=await snapshot();return(state.targets.find(target=>target.id===id)?.exposedUntil??0)>state.elapsed;}).toBe(true);
    const exposed=await snapshot();checkpoints.exposed=exposed;const pulse=[...events.values()].find(event=>event.type==='PULSE_TRIGGERED'&&String(event.data.exposedTargetIds).split(',').includes(id));expect(pulse).toBeDefined();expect(pulse!.tick).toBeGreaterThan(resistance!.tick);
    await page.screenshot({path:info.outputPath('actual-exposure.png')});
    const killDeadline=Date.now()+6000;
    while(Date.now()<killDeadline){const state=await snapshot(),current=state.targets.find(target=>target.id===id&&target.hp>0);if(!current)break;await aim(page,current);await page.mouse.down();await page.waitForTimeout(70);}
    await page.mouse.up();const cleared=await snapshot();checkpoints.cleared=cleared;
    const clear=[...events.values()].find(event=>event.type==='TARGET_CLEARED'&&event.data.id===id);expect(clear).toBeDefined();
    const hits=[...events.values()].filter(event=>event.type==='TARGET_HIT'&&event.data.id===id&&event.tick>pulse!.tick&&event.data.cause==='basic'&&Number(event.data.damage)>0);expect(hits.length).toBeGreaterThan(0);expect(hits.some(event=>Number(event.data.damage)>Number(resistedHit!.data.damage))).toBe(true);
    expect(cleared.battle!.encounter!.firstCounter.counterHit).toMatchObject({targetId:id,method:'pulse'});expect(cleared.battle!.encounter!.firstCounter.guideStatus).toBe('completed');
    await page.screenshot({path:info.outputPath('same-guardian-cleared.png')});expect(errors).toEqual([]);expect(remote).toEqual([]);
  }finally{await page.mouse.up();writeFileSync(info.outputPath('front-pulse-counter.json'),JSON.stringify({scope:'One same-guardian formal campaign sequence, real DOM movement/fire/E only: frontal accepted reduction -> actual pulse/exposure -> positive basic hits and clear. Full8s warning, no game/pose/HP/time/equipment writes. Not a full victory or human proof.',build:JSON.parse(readFileSync('dist/build-meta.json','utf8')),bundleSha256:createHash('sha256').update(readFileSync('dist/game.js')).digest('hex'),checkpoints,observations,events:[...events.values()],errors,remote,last:await snapshot()},null,2));}
});
