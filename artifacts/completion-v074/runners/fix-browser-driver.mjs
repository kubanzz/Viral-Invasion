import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
if(process.argv[2]!=='--apply')throw Error('Explicit apply required after first executions terminate.');
const root='artifacts/completion-v074',folder=root+'/driver-corrections';
for(const p of ['browser/targeted-1/execution.json','system/attempt-1/execution.json']){
 if(!existsSync(root+'/'+p))throw Error('Qualification still live: '+p);
 const e=JSON.parse(readFileSync(root+'/'+p));if(!e.sourceUnchanged||!e.bundleUnchanged)throw Error('Unexpected changed inputs');
}
const file='tests/e2e/formal-failure-lifecycle.spec.ts',before=readFileSync(file,'utf8');
const old="await page.locator('[data-action=\"menu\"]').click();await page.locator('[data-action=\"start\"]').click();await page.waitForTimeout(220);const fresh=await snapshot();checkpoints.afterMenu=fresh;";
if(!before.includes(old)||existsSync(folder+'/correction.json'))throw Error('Unexpected driver or existing correction.');
const replacement="// The physical left button remains held from the battlefield, so the canvas\n    // still owns pointer capture until pointerup. Activate the UI with real Enter\n    // while D/left remain held; this tests input clearing without an impossible\n    // second left-button press before releasing the first.\n    await page.locator('[data-action=\"menu\"]').focus();await page.keyboard.press('Enter');\n    await expect.poll(async()=>(await snapshot()).phase).toBe('menu');\n    await page.locator('[data-action=\"start\"]').focus();await page.keyboard.press('Enter');await page.waitForTimeout(220);const fresh=await snapshot();checkpoints.afterMenu=fresh;";
const after=before.replace(old,replacement),hash=s=>createHash('sha256').update(s).digest('hex');
mkdirSync(folder,{recursive:true});writeFileSync(folder+'/formal-failure-lifecycle-before.ts',before);writeFileSync(file,after);
writeFileSync(folder+'/correction.json',JSON.stringify({at:new Date().toISOString(),file,beforeSha256:hash(before),afterSha256:hash(after),cause:'Held mouse kept canvas pointer capture, so a synthetic second mouse-down/up locator click never activated the menu. Actual collapse/loss/retry had succeeded. Real keyboard Enter activates menu/start while D/left remain physically held.',assertionsPreserved:true,productionChanged:false,firstExecution:root+'/browser/targeted-1/execution.json',method:'Only new browser driver changed after both original qualification commands terminated. No gameplay state/DOM visual/profile writes.'},null,2));
console.log('Updated real keyboard transition driver; original attempt preserved.');
