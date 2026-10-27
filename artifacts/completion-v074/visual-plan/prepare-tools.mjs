import { build } from 'esbuild';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = 'artifacts/completion-v074/visual-plan';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const live = await build({ entryPoints: [base + '/capture-live.ts'], outfile: base + '/capture-live.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@playwright/test'], metafile: true });
const drawing = await build({ entryPoints: [base + '/render-fixture.ts'], outfile: base + '/prepared-fixture.js', bundle: true, platform: 'browser', format: 'iife', metafile: true });
writeFileSync(base + '/prepared-tools.json', JSON.stringify({ preparedAt: new Date().toISOString(), browserStarted: false,
  scope: 'Compilation only. Repeat preparation after final074 source is frozen; runtime demands explicit matching version/SHA and preserves old attempt output.',
  liveInputs: Object.fromEntries(Object.keys(live.metafile.inputs).sort().map(path => [path, hash(path)])),
  drawingInputs: Object.fromEntries(Object.keys(drawing.metafile.inputs).sort().map(path => [path, hash(path)])),
}, null, 2));
console.log('Prepared live-input and isolated drawing tools; no browser launched.');
