import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
const result = await build({
  entryPoints: ['.tools/result-layout-v073.ts'], outfile: '.tools/result-layout-v073.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  external: ['@playwright/test'], metafile: true,
});
writeFileSync('.tools/result-layout-v073-meta.json', JSON.stringify(result.metafile, null, 2));
console.log('Prepared standalone result-layout probe; no browser launched.');
