import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:667,height:320}});
  await page.goto('http://127.0.0.1:5173/artifacts/territory-20261103/actor-animation-preview.html?normal=1&identity=enemy.carapace&clip=walk');
  await page.waitForFunction(()=>window.__actorAnimationProbe?.ready);
  const receipt=await page.evaluate(()=>window.__actorAnimationProbe.inspect()),body=receipt.diagnostics.phaser.nativeSprites.find(s=>s.id.startsWith('preview:enemy.carapace')),
    signals=receipt.diagnostics.phaser.rasterDimensions.find(layer=>layer.id==='signals');
  const result={scope:'Actual normal Renderer Phaser layer depths; one frozen nonhero supplied state. Carapace accents are drawn to the shared full-screen signals texture.',body,signals,
    signalsAboveBody:signals.visible&&signals.depth>body.depth,stateUnchanged:receipt.stateUnchanged};
  await writeFile('artifacts/territory-20261103/native-signal-depth.json',JSON.stringify(result,null,2));
  if(!result.signalsAboveBody||!result.stateUnchanged)throw Error('Signals depth failed');
  console.log(JSON.stringify(result));
}finally{await browser.close();}
