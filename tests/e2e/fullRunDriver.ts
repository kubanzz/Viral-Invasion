import type { Page } from '@playwright/test';
import { g3Input } from '../helpers/g3Driver';
import type { MigrationChoice } from '../../src/game/campaignTypes';
import { readState,aim,chooseDraftInput } from './campaignDriver';
import type { GameState, InputFrame } from '../../src/game/types';

export interface FullRunOptions {
  inputOverride?: (state: GameState, planned: InputFrame) => InputFrame | Promise<InputFrame>;
  automaticScan?: boolean;
  timeoutMs?: number;
}

export async function fullRun(page:Page,choice:MigrationChoice,onScene?:(name:string)=>Promise<void>,build=true,onDraft?:(state:GameState)=>Promise<void>,onUpdate?:(state:GameState)=>Promise<void|boolean>,options:FullRunOptions={}):Promise<void>{
  const deadline=Date.now()+(options.timeoutMs??180000),seen=new Set<string>();let lastScan=-10,lastInteract=-10;
  const held=new Set<string>();
  let organ='';
  const release=async()=>{for(const key of held)await page.keyboard.up(key);held.clear();};
  try {
  while(Date.now()<deadline){
    const s=await readState(page);
    if(s.battle!.organId!==organ){await release();organ=s.battle!.organId;}
    if(s.phase==='result'){await page.mouse.up();return;}
    if(await page.locator('[data-action="close-migration-guide"]').isVisible()){await release();await page.mouse.up();await page.locator('[data-action="close-migration-guide"]').click();continue;}
    if(s.growth?.draft){await release();await page.mouse.up();if(onDraft)await onDraft(s);else if(build)await chooseDraftInput(page);else await page.locator('[data-action="draft-discard"]').click();continue;}
    if(s.phase!=='playing')throw new Error(`Unexpected ${s.phase} at ${s.elapsed}`);
    // A callback that opens a real modal can request fresh key holds afterward.
    if(onUpdate&&await onUpdate(s)){await release();await page.mouse.up();continue;}
    const scene=s.campaign!.core.combat?.attack?'core':s.battle!.organId==='lung'?'lung':s.campaign!.migration.status==='warning'?'migration':null;
    if(scene&&!seen.has(scene)){seen.add(scene);if(onScene)await onScene(scene);}
    const planned=g3Input(s,choice),input=options.inputOverride?await options.inputOverride(s,planned):planned;
    if(s.tool!==input.tool)await page.keyboard.press(`Digit${input.tool}`);
    await aim(page,input.aim);if(input.fire)await page.mouse.down();else await page.mouse.up();
    if((options.automaticScan!==false||input.scan)&&s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
    if(input.interact&&s.elapsed-lastInteract>.25){await page.keyboard.press('KeyE');lastInteract=s.elapsed;}
    const keys=[Math.abs(input.moveX)>.383?input.moveX>0?'KeyD':'KeyA':'',Math.abs(input.moveY)>.383?input.moveY>0?'KeyS':'KeyW':''].filter(Boolean);
    for(const key of held)if(!keys.includes(key)){await page.keyboard.up(key);held.delete(key);}
    for(const key of keys)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
    await page.waitForTimeout(85);
  }
  const s=await readState(page);throw new Error(`Full input run timeout: ${JSON.stringify({phase:s.phase,organ:s.battle!.organId,objective:s.battle!.objective,migration:s.campaign!.migration.status})}`);
  } finally { await release(); await page.mouse.up(); }
}
