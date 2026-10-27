import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = 'artifacts/completion-v074/visual-plan';
const sourcePath = 'scripts/measure-campaign-performance.mjs';
const source = readFileSync(sourcePath, 'utf8');
const start = source.indexOf('  // Reach a safe, real repair station');
const end = source.indexOf('  await page.evaluate(() => {', start);
if (start < 0 || end < 0) throw Error('Actual formal setup/warmup boundary changed; inspect before deriving.');
const prefix = source.slice(0, end);
const tail = readFileSync(base + '/density-tail.jsfrag', 'utf8');
writeFileSync(base + '/density-driver.mjs', prefix + tail);
writeFileSync(base + '/density-driver-origin.json', JSON.stringify({ generatedAt: new Date().toISOString(),
  original: sourcePath, originalSha256: createHash('sha256').update(source).digest('hex'),
  scope: 'Verbatim public-input formal setup/warmup through24 actors from existing proven campaign pressure driver. Replaces the entire frame/memory measurement section with two actual quality-mode visual captures. No FPS observer, natural/forced-GC memory probe, clock or gameplay-state injection is executed.',
  originalPrefixBytes: Buffer.byteLength(prefix), tail: base + '/density-tail.jsfrag' }, null, 2));
console.log('Prepared current formal density visual driver; no browser launched.');
