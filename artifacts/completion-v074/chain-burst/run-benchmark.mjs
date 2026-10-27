import { build } from 'esbuild';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve, relative, join } from 'node:path';
import os from 'node:os';
import { verifyFrozen074, inspectWork074, acquireExclusive074 } from '../runtime-guards.mjs';

const folder = 'artifacts/completion-v074/chain-burst';
const entry = `${folder}/benchmark.ts`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const runRequested = process.argv.includes('--run-isolated');
const attempt = process.argv[process.argv.indexOf('--run-isolated') + 1];
if (runRequested && (!attempt || !/^[a-zA-Z0-9_-]+$/.test(attempt))) throw new Error('Provide a new isolated attempt name after --run-isolated.');
const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
const program = ts.createProgram([resolve(entry)], { ...config.options, noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => process.cwd(), getCanonicalFileName: name => name, getNewLine: () => '\n' }));
  process.exitCode = 1;
} else {
  const frozen = await verifyFrozen074();
  const consumed = new Map();
  const bundled = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true,
    plugins: [{ name: 'exact-source-capture', setup(builder) {
      builder.onLoad({ filter: /\.(?:ts|tsx|js|mjs|json)$/ }, async args => {
        const bytes = await readFile(args.path); consumed.set(relative(process.cwd(), args.path).replaceAll('\\', '/'), bytes);
        const ext = args.path.split('.').at(-1);
        return { contents: bytes.toString('utf8'), loader: ext === 'mjs' ? 'js' : ext, resolveDir: resolve(args.path, '..') };
      });
    } }] });
  const bundle = bundled.outputFiles[0].contents;
  const sourceManifest = Object.fromEntries([...consumed].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, { sha256: sha(bytes), bytes: bytes.length }]));
  if (!runRequested) {
    console.log(JSON.stringify({ prepared: true, typecheckPassed: true, browserStarted: false, testsExecuted: false,
      sourceInputCount: consumed.size, bundleBytes: bundle.length, bundleSha256: sha(bundle),
      frozen: { version: frozen.version, gameSha256: frozen.gameSha256, buildInputCount: frozen.buildInputCount },
      guardReadiness: await inspectWork074(),
      mode: 'Preparation only. No measured result or acceptance claim. Use --run-isolated only after parent authorizes execution against frozen sources.' }));
  } else {
    // This branch is deliberately separate from the default preparation check.
    // It imports only the isolated mechanism bundle, never dist or main.ts.
    const output = join(folder, attempt);
    const exclusive = await acquireExclusive074(output, 'isolated100-event-chain-burst');
    try {
    await mkdir(output);
    const save = (name, value) => writeFile(join(output, name), typeof value === 'string' || ArrayBuffer.isView(value) ? value : JSON.stringify(value, null, 2), { flag: 'wx' });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const html = '<!doctype html><meta charset="utf-8"><title>AC-M08-04 isolated mechanism benchmark</title><style>html,body{margin:0;background:#15151d;color:#eee;font:14px sans-serif}#status{height:32px;padding:8px;box-sizing:border-box}canvas{display:block;width:1440px;height:900px}</style><div id="status">隔离机制工具加载中</div><canvas id="bench-canvas"></canvas><script type="module" src="/benchmark.mjs"></script>';
    await save('benchmark.bundle.mjs', bundle); await save('index.html', html); await save('esbuild-meta.json', bundled.metafile);
    const requirementPath = 'DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md';
    const requirementRaw = await readFile(requirementPath);
    const requirement = requirementRaw.toString('utf8').split(/\r?\n/).map((text, index) => ({ line: index + 1, text })).find(item => item.text.includes('`AC-M08-04`'));
    const pre = { schemaVersion: 1, startedAt: new Date().toISOString(), head, frozen, exclusiveGuard: exclusive.record, sourceManifest, sourceManifestSha256: sha(JSON.stringify(sourceManifest)),
      runnerSha256: sha(await readFile(new URL(import.meta.url))), bundleSha256: sha(bundle),
      runtimeGuardSha256: sha(await readFile('artifacts/completion-v074/runtime-guards.mjs')),
      requirement: { path: requirementPath, sha256: sha(requirementRaw), ...requirement },
      isolation: 'Standalone loopback HTML with actual modules. No dist/main.ts, existing live-game access, archive/storage operations, or formal encounter. Explicit fixture presets are not gameplay progress.',
      measurementPlan: { qualityModes: ['standard', 'low'], scenarios: ['cap24-hits100', 'cap24-resonance-recursion100', 'overcap100-clears100'],
        samplesPerCase: 60, warmupsPerCase: 6, basicEventsPerSample: 100, overCapCaseClearlySeparate: true },
    };
    await save('pre-run.json', pre);
    let browser, context, page, terminalResult, terminalError;
    const errors = [], unexpectedRequests = [], started = Date.now();
    const server = createServer((request, response) => {
      if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
      else if (request.url === '/benchmark.mjs') { response.setHeader('Content-Type', 'application/javascript; charset=utf-8'); response.end(bundle); }
      else if (request.url === '/favicon.ico') { response.statusCode = 204; response.end(); }
      else { unexpectedRequests.push(request.url); response.statusCode = 404; response.end(); }
    });
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
    try {
      await exclusive.assertExclusive();
      await verifyFrozen074();
      const { chromium } = await import('@playwright/test');
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      context = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1 });
      page = await context.newPage(); page.on('pageerror', error => errors.push(error.stack ?? String(error)));
      const address = server.address(), origin = `http://127.0.0.1:${address.port}`;
      await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : (unexpectedRequests.push(route.request().url()), route.abort()));
      await page.goto(origin + '/'); await page.waitForFunction(() => window.__isolatedChainBurst?.prepared === true);
      await page.screenshot({ path: join(output, 'prepared-isolated-fixture.png') });
      let timeout;
      const raw = await Promise.race([
        page.evaluate(() => window.__isolatedChainBurst.run({ samples: 60, warmups: 6 })),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Isolated benchmark exceeded a 60-second bounded execution.')), 60000); }),
      ]).finally(() => clearTimeout(timeout));
      await exclusive.assertExclusive();
      const frozenAtEnd = await verifyFrozen074();
      await save('raw-samples.json', raw);
      await page.screenshot({ path: join(output, 'completed-isolated-fixture.png') });
      const inputs = await Promise.all(Object.entries(sourceManifest).map(async ([path, info]) => ({ path, expectedSha256: info.sha256, currentSha256: sha(await readFile(path)) })));
      const sourceUnchanged = inputs.every(item => item.expectedSha256 === item.currentSha256);
      const timingSummary = raw.cases.map(record => ({ scenario: record.scenario, quality: record.quality, timing: record.timing, provisionalTimingAssessment: record.provisionalTimingAssessment }));
      const report = { ...pre, frozenAtEnd, generatedAt: new Date().toISOString(), browser: browser.version(),
        machine: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(), headless: true },
        sourceUnchanged, errors, unexpectedRequests, completedMechanismChecks: sourceUnchanged && errors.length === 0 && unexpectedRequests.length === 0 && raw.cases.length === 6,
        timingSummary, rawPath: `${output}/raw-samples.json`,
        acceptanceScope: 'Actual isolated production host/growth/renderer mechanism and observed browser timing. Provisional diagnostic millisecond targets are declared separately and are not invented wording of AC-M08-04. No natural formal-game, FPS-duration, ordinary100-actor, new-player or all-device claim.',
      };
      report.diagnosticTimingTargetsMet = raw.cases.every(record => Object.entries(record.provisionalTimingAssessment).filter(([key]) => key !== 'definition').every(([, value]) => value === true));
      report.pass = report.completedMechanismChecks && report.diagnosticTimingTargetsMet;
      await save('report.json', report);
      terminalResult = { startedAt: pre.startedAt, elapsedMs: Date.now() - started,
        exitCode: report.pass ? 0 : 1, status: report.pass ? 'passed' : 'failed', completedMechanismChecks: report.completedMechanismChecks,
        diagnosticTimingTargetsMet: report.diagnosticTimingTargetsMet, sourceUnchanged, inputs };
      console.log(JSON.stringify({ output, pass: report.pass, completedMechanismChecks: report.completedMechanismChecks, diagnosticTimingTargetsMet: report.diagnosticTimingTargetsMet, timingSummary }));
      if (!report.pass) process.exitCode = 1;
    } catch (error) {
      terminalError = { startedAt: pre.startedAt, status: 'failed', error: String(error), stack: error.stack, errors, unexpectedRequests };
      throw error;
    } finally {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close();
      await new Promise(resolveClose => server.close(resolveClose));
      if (terminalError) await save('execution-error.json', { ...terminalError, finishedAt: new Date().toISOString(), browserCloseSucceeded: true });
      else if (terminalResult) await save('execution.json', { ...terminalResult, finishedAt: new Date().toISOString(), browserCloseSucceeded: true });
    }
    } finally { await exclusive.release(); }
  }
}
