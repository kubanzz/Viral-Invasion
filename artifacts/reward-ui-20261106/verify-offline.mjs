import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const output = 'artifacts/reward-ui-20261106';
const meta = JSON.parse(await readFile(`${output}/final-build/build-meta.json`,'utf8'));
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage();
const errors = [], requests = [];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
try {
  await page.goto(pathToFileURL(resolve(`${output}/final-build/index.html`)).href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__viral&&!document.getElementById('app').inert,{timeout:60000});
  const observed = await page.evaluate(()=>({signature:window.__viral.diagnostics().art.signature,
    installed:['PULSE_BREAK','PURIFY_CHAIN','IMMUNE_BEACON','EXPOSE_TRACE'].every(id=>document.getElementById('viral-expedition-art-icon-styles').textContent.includes(`module-${id}`))}));
  assert.equal(observed.signature,meta.art.inputSignature);
  assert.equal(observed.installed,true);
  assert.deepEqual(errors,[]); assert.deepEqual(requests,[]);
  await writeFile(`${output}/offline-report.json`,JSON.stringify({pass:true,...observed,errors,externalRequests:requests},null,2));
  console.log(JSON.stringify({pass:true,installed:observed.installed,errors,externalRequests:requests}));
} finally {await browser.close();}
