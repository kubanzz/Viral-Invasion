import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = 'artifacts/experience-v0151', candidate = `${base}/candidate-4`, mobile = `${base}/mobile-candidate-4`;
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const sha = async file => createHash('sha256').update(await readFile(file)).digest('hex');
try { assert.notEqual((await json(`${base}/final-inputs.json`)).final, true, 'Do not overwrite a completed final configuration'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const config = await json(`${base}/final-inputs.example.json`);
Object.assign(config, { final: false, status: 'Candidate-4 and exact current packages ready; actual final desktop/touch and newly reviewed C4 media remain pending.',
  candidate, mobileHtml: `${mobile}/Viral-Invasion-Mobile.html`, typecheck: `${base}/typecheck-command.json`,
  testRunIdentity: `${base}/test-identity.json`, unitReports: [`${base}/unit-final.json`],
  unitScope: 'Current frozen candidate-4 full1898 assertions plus explicit six-seed system run; no historical v0.15 or earlier candidate assertion counted.',
  systemSeeds: `${base}/system-six-seeds.json`, expectedSystemSeeds: 6,
  naturalDesktop: null, naturalTouch: null, layout: `${base}/layout-candidate-4/report.json`,
  expectedArtSha256: await sha('.art-generated/art-runtime.json'),
  pendingMedia: ['releases/Viral-Invasion-v0.15.1-Gameplay.png', 'releases/Viral-Invasion-v0.15.1-Rewards.png', 'releases/Viral-Invasion-v0.15.1-Trial.png', 'releases/Viral-Invasion-v0.15.1-Touch-Demo.webm'] });
const deliveries = [
  ['desktop-zip', 'releases/Viral-Invasion-G4-v0.15.1.zip'],
  ['mobile-html', 'releases/Viral-Invasion-Mobile.html', `${mobile}/Viral-Invasion-Mobile.html`],
  ['mobile-zip', 'releases/Viral-Invasion-Mobile.zip', `${mobile}/Viral-Invasion-Mobile.zip`],
  ['mobile-versioned-html', 'releases/Viral-Invasion-Mobile-v0.15.1/Viral-Invasion-Mobile.html', `${mobile}/Viral-Invasion-Mobile.html`],
  ['mobile-versioned-zip', 'releases/Viral-Invasion-Mobile-v0.15.1/Viral-Invasion-Mobile.zip', `${mobile}/Viral-Invasion-Mobile.zip`],
  ['mobile-instructions', 'releases/Viral-Invasion-Mobile-v0.15.1/手机试玩说明.txt', 'Docs/ViralInvasion_Mobile_Playtest.md'],
  ['mobile-receipt', 'releases/Viral-Invasion-Mobile-v0.15.1/package-report.json', `${mobile}/package-report.json`],
];
config.releaseFiles = await Promise.all(deliveries.map(async ([role, path, equals]) => ({ role, path, sha256: await sha(path), ...(equals ? { equals } : {}) })));
assert.equal(config.releaseFiles[0].sha256, '1b0470c87ccd27bfbe6ea51071794e9c79a3394479257597c51f88f32d453186');
config.supplemental = [{ name: 'component-fixtures', path: `${base}/component-candidate-4-r2/report.json`,
  assertions: [{ path: 'pass', value: true }, { path: 'sourcesUnchanged', value: true }, { path: 'cases', op: 'length', value: 2 }, { path: 'browsersClosed', value: true }, { path: 'serverClosed', value: true }],
  scope: 'Explicit production-component fixture: actual C4 CSS and markup plus genuinely earned C2 state/profile. Verifies complete-range visibility and button geometry, not natural progression or phone hardware.' }];
config.zipContents = [
  { path: 'releases/Viral-Invasion-G4-v0.15.1.zip', files: { 'index.html': `${candidate}/index.html`, 'game.js': `${candidate}/game.js`, 'build-meta.json': `${candidate}/build-meta.json`, 'Open-Game.cmd': 'releases/Viral-Invasion-G4-v0.15.1/Open-Game.cmd', 'README.txt': 'releases/Viral-Invasion-G4-v0.15.1/README.txt' } },
  { path: 'releases/Viral-Invasion-Mobile.zip', files: { 'Viral-Invasion-Mobile.html': `${mobile}/Viral-Invasion-Mobile.html`, '手机试玩说明.txt': 'Docs/ViralInvasion_Mobile_Playtest.md' } },
];
await writeFile(`${base}/final-inputs.json`, JSON.stringify(config, null, 2));
console.log(JSON.stringify({ final: config.final, candidate, releaseFiles: config.releaseFiles.length, naturalDesktop: config.naturalDesktop, naturalTouch: config.naturalTouch, pendingMedia: config.pendingMedia }));
