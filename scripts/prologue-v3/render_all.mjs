import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, link, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const base = join(root, 'artifacts/world-prologue-v3/render/final');
const staging = join(base, 'frames');
const blender = join(root, '.tools/blender/blender-4.5.15-windows-x64/blender.exe');
const renderer = join(root, 'scripts/prologue-v3/render_prologue.py');
const production = join(root, 'asserts/ViralInvasion_Prologue_v3/production');
const shots = [['body', 144], ['lung', 120], ['heart', 120], ['orders', 120], ['transit', 192], ['arrival', 96]];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rendererHash = digest(await readFile(renderer));
const rendererStat = await stat(renderer);
const resume = process.argv.includes('--resume');
if (!process.argv.includes('--execute')) throw new Error('Pass --execute to render the approved 792-frame film.');
await mkdir(staging, { recursive: true }); await mkdir(production, { recursive: true });
const initialSources = new Map();
const generatedInputs = [];

async function run(args, log, shot) {
  await mkdir(resolve(log, '..'), { recursive: true });
  const stream = createWriteStream(log);
  await new Promise((done, fail) => {
    const child = spawn(blender, ['--background', '--factory-startup', '--python-exit-code', '1', ...args], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    child.stdout.on('data', chunk => {
      stream.write(chunk); const lines = (tail + chunk.toString()).split(/\r?\n/); tail = lines.pop();
      if (shot) for (const line of lines) { const match = /Saved:.*frame_(\d+)\.png/.exec(line); if (match && +match[1] % 24 === 0) console.log(`${shot}: ${match[1]} frames`); }
    });
    child.stderr.on('data', chunk => stream.write(chunk));
    child.on('error', fail);
    child.on('close', code => { stream.end(); code === 0 ? done() : fail(new Error(`Blender failed (${code}); see ${log}`)); });
  });
}

let offset = 0;
for (const [shot, count] of shots) {
  if (digest(await readFile(renderer)) !== rendererHash) throw new Error('Scene authoring source changed; finish the current revision before rendering.');
  const output = join(base, shot);
  const reportPath = join(output, `${shot}-scene-report.json`);
  let completed = false;
  if (resume) {
    try {
      const previous = JSON.parse(await readFile(reportPath, 'utf8'));
      completed = previous.shotFrames === count && previous.resolution[0] === 1280 && previous.resolution[1] === 720;
      for (let index = 1; completed && index <= count; index++) {
        const file = await stat(join(output, `frame_${String(index).padStart(4, '0')}.png`));
        completed = file.size >= 1024 && file.mtimeMs >= rendererStat.mtimeMs;
      }
    } catch { completed = false; }
  }
  if (completed) console.log(`Reusing completed ${shot}: all ${count} frames checked against the authoring source time.`);
  else {
    console.log(`Rendering ${shot}: ${count} frames, 1280x720 / 24fps`);
    await run(['--python', renderer, '--', '--shot', shot, '--animation', '--resolution', '1280x720', '--quality', 'final', '--samples', '32', '--output', output,
      '--body-plate', join(root, 'asserts/ViralInvasion_Prologue_v3/plates/body-overview.png'),
      '--vessel-plate', join(root, 'asserts/ViralInvasion_Prologue_v3/plates/bloodflow-route.png'),
      '--save-blend', join(output, `${shot}.blend`)], join(output, 'render.log'), shot);
  }
  const report = JSON.parse(await readFile(join(output, `${shot}-scene-report.json`), 'utf8'));
  for (const [path, hash] of Object.entries(report.originalSources)) {
    // This generated index also contains pending-asset reports and can refresh
    // when unrelated candidate images arrive. Check the actual original images
    // and GLB below; retain the index hash as provenance rather than original art.
    if (path.replaceAll('\\', '/').includes('/.art-generated/')) { generatedInputs.push({ shot, path, sha256: hash }); continue; }
    if (initialSources.has(path) && initialSources.get(path) !== hash) throw new Error(`Original asset drift: ${path}`);
    initialSources.set(path, hash);
  }
  for (let index = 1; index <= count; index++) {
    const input = join(output, `frame_${String(index).padStart(4, '0')}.png`);
    const target = join(staging, `${String(offset + index).padStart(4, '0')}.png`);
    if ((await stat(input)).size < 1024) throw new Error(`Incomplete frame: ${input}`);
    try { await link(input, target); } catch (error) {
      if (error.code === 'EEXIST') {
        if (digest(await readFile(input)) !== digest(await readFile(target))) throw new Error(`Staging contains an older frame: ${target}`);
      } else await copyFile(input, target);
    }
  }
  offset += count;
}
for (const [path, hash] of initialSources) if (digest(await readFile(path)) !== hash) throw new Error(`Original asset changed during rendering: ${path}`);
console.log('Encoding 792 checked frames with the local score.');
await run(['--python', join(root, 'scripts/prologue-v3/assemble_movie.py'), '--', '--frames', staging,
  '--output', join(production, 'opening-v3.mp4'), '--fade-frames', '5'], join(base, 'assembly.log'));
const movie = await readFile(join(production, 'opening-v3.mp4'));
const manifest = { version: 3, stage: 'rendered; browser verification pending', title: '病毒入侵 · 体内防线', createdOn: '2026-11-08',
  styleApproval: 'User approved preview/organ-overview-style-match.png; existing game art retained.',
  renderer: 'Blender 4.5.15 LTS / Eevee', authoringScript: 'scripts/prologue-v3/render_prologue.py', authoringSha256: rendererHash,
  movie: { path: 'production/opening-v3.mp4', width: 1280, height: 720, fps: 24, frames: offset, durationSeconds: offset / 24, bytes: movie.length, sha256: digest(movie), codec: 'H.264 8bit yuv420p / AAC' },
  shots: shots.map(([id, frames]) => ({ id, frames })),
  originalAssetsUnchanged: true, originalSources: Object.fromEntries(initialSources), generatedInputs,
  policy: 'The original player, virus, immune unit, buildings, rigs, animations and art selection are read-only. Only film files and the opening player are updated.' };
await writeFile(join(root, 'asserts/ViralInvasion_Prologue_v3/manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ movie: join(production, 'opening-v3.mp4'), bytes: movie.length, frames: offset, originalAssetsUnchanged: true }));
