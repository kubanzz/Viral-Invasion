import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { aim, readState } from './campaignDriver';
import { g3Input, g3EnduranceInput, waypoint } from '../helpers/g3Driver';
import type { MigrationChoice } from '../../src/game/campaignTypes';

const entry=pathToFileURL(resolve('dist/index.html')).href;
for(const choice of ['pursue','block','ignore'] as MigrationChoice[]){
  test(`G3: offline ${choice} migration, fused mother core and active retest through real input`,async({page,context},info)=>{
    test.setTimeout(180000);
    const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await context.setOffline(true);await context.route(/^https?:/i,async route=>{remote.push(route.request().url());await route.abort();});
    await page.goto(`${entry}?seed=91`);await page.locator('[data-action="start"]').click();
    const captured=new Set<string>(),seenEvents=new Map<string,unknown>(),deadline=Date.now()+150000;
    let lastScan=-10,lastInteract=-10;
    while(Date.now()<deadline){
      const s=await readState(page);
      for(const event of s.events)seenEvents.set(JSON.stringify(event),event);
      if(s.phase==='result')break;
      if(s.growth?.draft){await page.mouse.up();await page.locator('[data-action="draft-discard"]').click();continue;}
      expect(s.phase).toBe('playing');
      const capture=async(name:string)=>{if(!captured.has(name)){captured.add(name);await page.screenshot({path:info.outputPath(`${name}.png`)});}};
      if(s.campaign!.migration.status==='warning')await capture('migration-warning');
      if(s.battle!.organId==='lung')await capture('lung-first-arrival');
      if(s.campaign!.core.combat?.attack)await capture(`mother-${s.campaign!.core.combat.activeTrait}`);
      if(s.campaign!.core.combat?.membrane.remaining===0)await capture('mother-membranes-open');
      const input=g3Input(s,choice);
      if(s.tool!==input.tool)await page.keyboard.press(`Digit${input.tool}`);
      await aim(page,input.aim);
      if(input.fire)await page.mouse.down();else await page.mouse.up();
      if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
      // Discrete DOM events read the same nearby device used by keyboard users.
      if(input.interact&&s.elapsed-lastInteract>.25){await page.keyboard.press('KeyE');lastInteract=s.elapsed;}
      const keys=[Math.abs(input.moveX)>.1?input.moveX>0?'KeyD':'KeyA':'',Math.abs(input.moveY)>.1?input.moveY>0?'KeyS':'KeyW':''].filter(Boolean);
      for(const key of keys)await page.keyboard.down(key);
      await page.waitForTimeout(85);
      for(const key of keys)await page.keyboard.up(key);
    }
    await page.mouse.up();
    const final=await readState(page);
    writeFileSync(info.outputPath('route.json'),JSON.stringify({choice,errors,remote,events:[...seenEvents.values()],final},null,2));
    await page.screenshot({path:info.outputPath('result.png')});
    expect(final.result,JSON.stringify({phase:final.phase,organ:final.battle!.organId,core:final.campaign!.core.status,migration:final.campaign!.migration,player:final.player.hp})).toMatchObject({success:true});
    expect(final.campaign!.stats.migrationChoice).toBe(choice);
    expect(final.campaign!.core.combat!.seenTraits).toHaveLength(2);
    expect(final.campaign!.core.combat!.membrane.remaining).toBe(0);
    expect(final.campaign!.progress.organConditions).toBe(true);
    expect(final.campaign!.progress.infectionCondition).toBe(true);
    if(choice!=='block')expect(final.campaign!.stats.airwayUses).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);expect(remote).toEqual([]);
  });
}

test('G3: 180 seconds under a live lung source, breath cycles, repair and legal retreat',async({page,context},info)=>{
  test.setTimeout(360000);
  await context.setOffline(true);await page.goto(`${entry}?seed=91`);await page.locator('[data-action="start"]').click();
  let began:number|null=null,lastScan=-10,lastInteract=-10;
  const phases=new Set<string>(),spawned=new Set<string>(),deadline=Date.now()+330000;
  while(Date.now()<deadline){
    const s=await readState(page);
    if(s.growth?.draft){await page.mouse.up();await page.locator('[data-action="draft-discard"]').click();continue;}
    expect(s.phase).toBe('playing');
    if(s.battle!.organId==='lung'&&began===null){began=s.elapsed;await page.screenshot({path:info.outputPath('lung-pressure-start.png')});}
    if(began!==null&&s.battle!.organId==='heart'){
      writeFileSync(info.outputPath('lung-pressure.json'),JSON.stringify({duration:s.elapsed-began,phases:[...phases],spawned:[...spawned],final:s},null,2));
      expect(s.elapsed-began).toBeGreaterThanOrEqual(180);expect(phases.size).toBe(2);expect(spawned.size).toBeGreaterThan(15);
      await page.screenshot({path:info.outputPath('retreated-heart.png')});return;
    }
    const input=began===null?g3Input(s,'pursue'):g3EnduranceInput(s);
    if(began!==null){
      phases.add(s.campaign!.arenas.lung.flow!.phase);
      for(const event of s.events)if(event.type==='ACTOR_SPAWNED'&&event.tick/60>=began)spawned.add(String(event.data.id));
      if(s.elapsed-began>=180){const exit=s.battle!.graph.nodes.find(n=>n.kind==='exit')!,next=waypoint(s,exit);input.moveX=next.x-s.player.x;input.moveY=next.y-s.player.y;input.interact=Math.hypot(exit.x-s.player.x,exit.y-s.player.y)<85;}
    }
    if(s.tool!==input.tool)await page.keyboard.press(`Digit${input.tool}`);await aim(page,input.aim);
    if(input.fire)await page.mouse.down();else await page.mouse.up();
    if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
    if(input.interact&&s.elapsed-lastInteract>.25){await page.keyboard.press('KeyE');lastInteract=s.elapsed;}
    const keys=[Math.abs(input.moveX)>.1?input.moveX>0?'KeyD':'KeyA':'',Math.abs(input.moveY)>.1?input.moveY>0?'KeyS':'KeyW':''].filter(Boolean);
    for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(85);for(const key of keys)await page.keyboard.up(key);
  }
  throw new Error('Lung pressure driver did not retreat before its deadline');
});
