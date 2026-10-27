import{test,expect,type Page}from'@playwright/test';
import{writeFileSync,readFileSync}from'node:fs';import{createHash}from'node:crypto';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
import{readState,aim}from'./campaignDriver';
import{failureRouteInput,type FailureRoute}from'../helpers/failureDriver';
import{PROFILE_STORAGE_KEY}from'../../src/meta/profile';
import{type GameEvent,type InputFrame}from'../../src/game/types';

test.use({trace:'off',video:'off'});
const entry=pathToFileURL(resolve(process.env.VI_ENTRY??'dist/index.html')).href;
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const readProfile=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PROFILE_STORAGE_KEY);
for(const route of['collapse','infection']as FailureRoute[])test(`Formal lifecycle: natural ${route}, paused warning, one loss and clean held-input menu/retry`,async({page,context},info)=>{
  test.setTimeout(390000);await context.setOffline(true);
  const errors:string[]=[],remote:string[]=[],failedRequests:string[]=[],events=new Map<string,GameEvent>(),samples:unknown[]=[],inputs:unknown[]=[],checkpoints:Record<string,unknown>={};
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push('console:'+message.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url()))remote.push(request.url());});page.on('requestfailed',request=>failedRequests.push(request.url()));
  const held=new Set<string>();let firing=false,lastAimAt=0;
  const release=async()=>{for(const key of held)await page.keyboard.up(key);held.clear();await page.mouse.up();firing=false;};
  const apply=async(input:InputFrame)=>{
    const keys=new Set([input.moveX&&input.moveX<0?'KeyA':input.moveX&&input.moveX>0?'KeyD':'',input.moveY&&input.moveY<0?'KeyW':input.moveY&&input.moveY>0?'KeyS':''].filter(Boolean));
    if([...held].some(key=>!keys.has(key))||[...keys].some(key=>!held.has(key))||!!input.fire!==firing)inputs.push({atTick:(await readState(page)).tick,keys:[...keys],fire:!!input.fire,aim:input.aim});
    for(const key of held)if(!keys.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of keys)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
    if(input.fire||Date.now()-lastAimAt>1000){await aim(page,input.aim!);lastAimAt=Date.now();}
    if(!!input.fire!==firing){if(input.fire)await page.mouse.down();else await page.mouse.up();firing=!!input.fire;}
  };
  const snapshot=async()=>{const state=await readState(page);for(const event of state.events)events.set(JSON.stringify(event),event);return state;};
  try{
    // Acknowledge onboarding with its real button, then start a new adaptive case.
    // No profile, time, actor or HP is injected, including during this bootstrap.
    await page.goto(entry+'?seed=13');await page.locator('[data-action="start"]').click();await page.locator('[data-action="skip-counter-guide"]').click();
    await page.keyboard.press('Escape');await page.locator('[data-action="menu"]').click();
    await page.goto(entry+'?seed=13&trait='+(route==='collapse'?'MIMIC':'CARAPACE'));
    await page.locator('[data-action="start"]').click();await page.keyboard.press('Digit3');
    const initial=await snapshot();checkpoints.initial=initial;expect(initial.battle!.encounter!.configId).toBe('campaign-1');expect(initial.battle!.encounter!.guideVariant).toBe('adaptive');expect(initial.world!.width).toBe(2400);
    expect((await readProfile(page)).stats.runs).toBe(0);
    let corner=0,paused=false,nextSample=0;const deadline=Date.now()+340000;
    while(Date.now()<deadline){
      const state=await snapshot();if(state.phase==='result')break;
      if(state.phase==='paused'&&state.growth?.draft){await release();await page.locator('[data-action="draft-discard"]').click();continue;}
      expect(state.phase).toBe('playing');
      if(state.elapsed>=nextSample){samples.push({tick:state.tick,elapsed:state.elapsed,hp:state.player.hp,tissue:state.tissue.hp,infection:state.battle!.pressure.infection,vitality:state.battle!.pressure.vitality,criticalSince:state.battle!.pressure.criticalSince});nextSample=state.elapsed+5;}
      if(!paused&&(route==='collapse'?state.battle!.pressure.organAlarm:state.battle!.pressure.criticalSince!==null)){
        checkpoints.warning=state;await page.screenshot({path:info.outputPath('warning.png')});
        await page.keyboard.press('Escape');const before=await snapshot();await release();await page.waitForTimeout(350);const after=await snapshot();
        expect(before.phase).toBe('paused');expect(after).toEqual(before);checkpoints.paused={before,after};
        await page.locator('[data-action="continue"]').click();paused=true;
      }
      const planned=failureRouteInput(await snapshot(),route,corner);corner=planned.corner;await apply(planned.input);await page.waitForTimeout(90);
    }
    await release();const final=await snapshot();checkpoints.final=final;expect(paused).toBe(true);expect(final.phase).toBe('result');expect(final.result?.success).toBe(false);expect(final.player.hp).toBeGreaterThan(0);
    expect(final.events.filter(event=>event.type==='RUN_ENDED')).toHaveLength(1);
    if(route==='collapse'){expect(final.result!.reason).toContain('身体崩溃');expect(final.battle!.pressure.vitality).toBe(0);expect(final.battle!.pressure.infection).toBeLessThan(100);}
    else{expect(final.result!.reason).toContain('感染失控');expect(final.battle!.pressure.vitality).toBeGreaterThan(0);expect(final.battle!.pressure.infection).toBe(100);expect(final.elapsed-final.battle!.pressure.criticalSince!).toBeCloseTo(15,5);}
    await expect(page.locator('.campaign-modal')).toBeVisible();await expect.poll(async()=>(await readProfile(page)).stats.losses).toBe(1);
    const saved=await readProfile(page);checkpoints.saved=saved;expect(saved.stats.runs).toBe(1);expect(saved.recentRuns).toHaveLength(1);expect(saved.recentRuns[0].reason).toBe(final.result!.reason);
    await page.screenshot({path:info.outputPath('real-failure.png')});
    await page.mouse.move(5,5);await page.mouse.down();await page.keyboard.down('KeyD');await page.waitForTimeout(300);
    expect(await snapshot()).toEqual(final);expect(await readProfile(page)).toEqual(saved);
    await page.locator('[data-action="retry"]').click();await page.waitForTimeout(220);const retry=await snapshot();checkpoints.retry=retry;
    expect(retry.phase).toBe('playing');expect(retry.player.hp).toBe(100);expect(retry.growth!.xp).toBe(0);expect(retry.growth!.equipped).toEqual([]);expect(retry.battle!.pressure.criticalSince).toBeNull();expect(retry.shots).toBe(0);expect(retry.battle!.stats.sourceClears).toBe(0);expect((await readProfile(page)).stats).toEqual(saved.stats);
    await page.keyboard.up('KeyD');await page.mouse.up();
    await page.keyboard.down('KeyD');await page.mouse.move(5,5);await page.mouse.down();await page.keyboard.press('Escape');const pause=await snapshot();await page.waitForTimeout(200);expect((await snapshot()).tick).toBe(pause.tick);
    await page.locator('[data-action="menu"]').click();await page.locator('[data-action="start"]').click();await page.waitForTimeout(220);const fresh=await snapshot();checkpoints.afterMenu=fresh;
    expect(fresh.player.hp).toBe(100);expect(fresh.growth!.xp).toBe(0);expect(fresh.growth!.equipped).toEqual([]);expect(fresh.shots).toBe(0);expect(fresh.player.x).toBe(initial.player.x);expect(fresh.player.y).toBe(initial.player.y);
    await page.keyboard.up('KeyD');await page.mouse.up();await page.keyboard.press('Escape');await page.locator('[data-action="menu"]').click();await page.reload();
    const persisted=await readProfile(page);checkpoints.persisted=persisted;expect(persisted.stats).toEqual(saved.stats);expect(persisted.recordedRunIds).toEqual(saved.recordedRunIds);expect(persisted.achievements).toEqual(saved.achievements);expect(persisted.recentRuns).toEqual(saved.recentRuns);
    expect(errors).toEqual([]);expect(remote).toEqual([]);expect(failedRequests).toEqual([]);
  }finally{
    await release();await page.keyboard.up('KeyD');
    writeFileSync(info.outputPath('natural-failure-lifecycle.json'),JSON.stringify({route,browser:info.project.name,build:JSON.parse(readFileSync('dist/build-meta.json','utf8')),bundleSha256:hash('dist/game.js'),method:'Normal formal campaign with actual onboarding skip, new case and real DOM input. No game/profile/time/HP/position writes. Input changes and read snapshots recorded. Not human or performance evidence.',checkpoints,samples,inputs,events:[...events.values()],errors,remote,failedRequests,last:await snapshot()},null,2));
  }
});
