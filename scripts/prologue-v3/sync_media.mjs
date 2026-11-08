import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
/** An unfinished film must never block another feature's release build. */
export async function syncPrologueMedia() {
  const posterPath = resolve(root, 'asserts/ViralInvasion_Prologue_v3/production/approved-poster.jpg');
  const moviePath = resolve(root, 'asserts/ViralInvasion_Prologue_v3/production/opening-v3.mp4');
  const manifestPath = resolve(root, 'asserts/ViralInvasion_Prologue_v3/manifest.json');
  const poster = await readFile(posterPath);
  let movie;
  try { movie = await readFile(moviePath); await readFile(manifestPath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    movie = undefined;
  }
  const ready = !!movie;
  const value = { version: 3, ready, movie: movie ? `data:video/mp4;base64,${movie.toString('base64')}` : '', poster: `data:image/jpeg;base64,${poster.toString('base64')}` };
  const path = resolve(root, '.art-generated/prologue-media.json'), bytes = JSON.stringify(value);
  await mkdir(resolve(path, '..'), { recursive: true });
  if (await readFile(path, 'utf8').catch(() => '') !== bytes) await writeFile(path, bytes);
  const sources = [posterPath, ...(ready ? [moviePath, manifestPath] : [])].map(path => relative(root, path).replaceAll('\\', '/'));
  return { ready, path, sources };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await syncPrologueMedia();
  console.log(`Opening media: ${result.ready ? 'Blender film ready' : 'using previous buildable opening while the film renders'}.`);
}
