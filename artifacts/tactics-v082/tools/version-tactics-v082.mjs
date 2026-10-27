import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
for (const path of ['releases/Viral-Invasion-G4-v0.8.2', 'releases/Viral-Invasion-G4-v0.8.2.zip']) if (existsSync(resolve(root, path))) throw new Error('Version already exists');
for (const name of ['package.json', 'package-lock.json']) {
  const file = resolve(root, name), data = JSON.parse(readFileSync(file, 'utf8'));
  if (data.version !== '0.8.1') throw new Error(`Unexpected ${name} version`);
  data.version = '0.8.2'; if (data.packages?.['']) data.packages[''].version = '0.8.2';
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
const main = resolve(root, 'src/main.ts'), text = readFileSync(main, 'utf8');
if ((text.match(/v0\.8\.1/g) ?? []).length !== 2 || !text.includes("version: '0.8.1-G4'")) throw new Error('Unexpected visible version markers');
writeFileSync(main, text.replaceAll('v0.8.1', 'v0.8.2').replace("version: '0.8.1-G4'", "version: '0.8.2-G4'"));
console.log('Updated only package and visible version identities to 0.8.2');
