import type { Page } from '@playwright/test';
import { g3Input } from '../helpers/g3Driver';
import type { MigrationChoice } from '../../src/game/campaignTypes';
import { readState,aim,chooseDraftInput } from './campaignDriver';

export async function fullRun(page:Page,choice:MigrationChoice,onScene?:(name:string)=>Promise<void>,build=true):Promise<void>{
  const deadline=Date.now()+150000,seen=new Set<string>();let lastScan=-10,lastInteract=-10;
  while(Date.now()<deadline){
    const s=await readState(page);
    if(s.phase==='result'){await page.mouse.up();return;}
    if(await page.locator('[data-action="close-migration-guide"]').isVisible()){await page.mouse.up();await page.locator('[data-action="close-migration-guide"]').click();continue;}
    if(s.growth?.draft){await page.mouse.up();if(build)await chooseDraftInput(page);else await page.locator('[data-action="draft-discard"]').click();continue;}
    if(s.phase!=='playing')throw new Error(`Unexpected ${s.phase} at ${s.elapsed}`);
    const scene=s.campaign!.core.combat?.attack?'core':s.battle!.organId==='lung'?'lung':s.campaign!.migration.status==='warning'?'migration':null;
    if(scene&&!seen.has(scene)){seen.add(scene);if(onScene)await onScene(scene);}
    const input=g3Input(s,choice);
    if(s.tool!==input.tool)await page.keyboard.press(`Digit${input.tool}`);
    await aim(page,input.aim);if(input.fire)await page.mouse.down();else await page.mouse.up();
    if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
    if(input.interact&&s.elapsed-lastInteract>.25){await page.keyboard.press('KeyE');lastInteract=s.elapsed;}
    const keys=[Math.abs(input.moveX)>.383?input.moveX>0?'KeyD':'KeyA':'',Math.abs(input.moveY)>.383?input.moveY>0?'KeyS':'KeyW':''].filter(Boolean);
    for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(85);for(const key of keys)await page.keyboard.up(key);
  }
  const s=await readState(page);throw new Error(`Full input run timeout: ${JSON.stringify({phase:s.phase,organ:s.battle!.organId,objective:s.battle!.objective,migration:s.campaign!.migration.status})}`);
}
