#!/usr/bin/env node
// Runs every *.fuzz.spec.ts in the workspace, widened by a factor, once per seed. Local only.
//
//   node packages/test-utils/scripts/fuzz.js [scale] [seed...]
//
// scale multiplies each spec's committed FUZZ_RUNS (default 1). Without seeds the specs keep their
// committed one. Exit 0 when everything passed, 1 when anything failed, 2 on bad arguments.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const [scaleArg = '1', ...seeds] = process.argv.slice(2);
const scale = Number(scaleArg);
if (!Number.isInteger(scale) || scale < 1 || seeds.some((s) => !/^\d+$/.test(s))) {
  console.error('usage: fuzz.js [scale] [seed...]   both positive integers');
  process.exit(2);
}

const specs = [];
for (const pkg of fs.readdirSync(path.join(ROOT, 'packages')).sort()) {
  const testDir = path.join(ROOT, 'packages', pkg, 'test');
  if (!fs.existsSync(testDir)) continue;
  for (const file of fs.readdirSync(testDir).filter((f) => f.endsWith('.fuzz.spec.ts')).sort()) {
    // Read from the spec itself, so a changed default can never drift from what gets scaled
    const defaults = [...fs.readFileSync(path.join(testDir, file), 'utf8').matchAll(/FUZZ_RUNS \?\? (\d+)/g)];
    if (defaults.length !== 1) {
      console.error(`${pkg}/test/${file}: expected one FUZZ_RUNS default, found ${defaults.length}`);
      process.exit(2);
    }
    specs.push({ pkg, file: `test/${file}`, runs: Number(defaults[0][1]) * scale });
  }
}

let failed = 0;
for (const seed of seeds.length ? seeds : [undefined]) {
  for (const { pkg, file, runs } of specs) {
    const env = { ...process.env, FUZZ_RUNS: String(runs) };
    if (seed === undefined) delete env.FUZZ_SEED;
    else env.FUZZ_SEED = seed;

    const started = Date.now();
    // One command string: an argument array alongside shell: true is deprecated (DEP0190)
    const run = spawnSync(`npx hardhat test ${file}`, {
      cwd: path.join(ROOT, 'packages', pkg),
      env,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    const out = (run.stdout || '') + (run.stderr || '');
    const passing = /(\d+) passing/.exec(out);
    const failing = /(\d+) failing/.exec(out);
    const ok = run.status === 0 && passing !== null && failing === null;
    if (!ok) failed++;

    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${pkg}/${file} seed=${seed ?? 'committed'} runs=${runs}: ` +
        `${passing ? passing[1] : 0} passing, ${failing ? failing[1] : 0} failing, ${seconds}s`
    );
    if (!ok) {
      out
        .split('\n')
        .filter((l) => /^\s+\d+\) |Property failed|Counterexample|seed:|Error/.test(l) && !/^\s*at /.test(l))
        .slice(0, 20)
        .forEach((l) => console.log('       ' + l.trim().slice(0, 160)));
    }
  }
}
process.exitCode = failed ? 1 : 0;
