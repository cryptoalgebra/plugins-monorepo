#!/usr/bin/env node
// Applies one textual mutation to a contract, runs the given specs, restores the file and
// verifies the file is byte-identical again. A test suite that stays green under a mutation
// is not guarding the line that changed.
//
//   node packages/test-utils/scripts/mutate.js <pkg> <contract> <find> <replace> [spec...]
//   RUN_PKG=<other-pkg> node ... mutate.js ...   judge the mutation by another package's suite
//   An empty <replace> deletes the anchor. Exit 0: killed, 1: survived, 2-4: bad arguments,
//   5: no verdict, 6: restore failed, 130: interrupted.
//
// Gas snapshots are not compared, so a gas change alone kills nothing. Snapshots are never
// written, so a mutant cannot record its own values. A failure only counts as a kill when the
// same test passes without the mutation, so a red baseline does not kill every mutant.
// Until the next compile, the package artifacts still hold the mutant's build.
//
// Two habits this encodes. It refuses an ambiguous anchor, because replacing the first of
// several occurrences mutates something other than what you meant. And a mutation that survives
// only accuses the tests once you know the behaviour actually changed: an equivalent mutant and
// a stale build both look like a passing suite, so pair every survivor with a control mutation
// the suite must notice.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const [pkg, rel, find, replace, ...specs] = process.argv.slice(2);
if (!pkg || !rel || !find || replace === undefined) {
  console.error('usage: mutate.js <pkg> <contract> <find> <replace> [spec...]');
  process.exit(2);
}

const abs = path.join(ROOT, 'packages', pkg, rel);
const runDir = path.join(ROOT, 'packages', process.env.RUN_PKG || pkg);
// A copy of the original beside the contract, in case this process dies without restoring it
const backup = abs + '.mutate-backup';
if (!fs.existsSync(abs)) {
  console.error(`no such contract: ${abs}`);
  process.exit(2);
}
if (!fs.existsSync(runDir)) {
  console.error(`no such package to run: ${runDir}`);
  process.exit(2);
}
if (fs.existsSync(backup)) {
  console.error(`${backup} exists: an earlier run did not restore ${rel}. Check the contract, then delete it`);
  process.exit(2);
}

const originalBytes = fs.readFileSync(abs);
const original = originalBytes.toString('utf8');

if (!original.includes(find)) {
  console.error(`find string not present in ${rel}\n  looked for: ${find}`);
  process.exit(3);
}
const occurrences = original.split(find).length - 1;
if (occurrences > 1) {
  console.error(`ambiguous: "${find}" occurs ${occurrences} times — refusing`);
  process.exit(4);
}

// Ctrl-C reaches hardhat too. Handling it keeps node alive until the finally below restores the file
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    interrupted = true;
    console.log('interrupted: the run was cut short, its verdict does not count');
    if (process.exitCode !== 6) process.exitCode = 130;
  });
}

function runSpecs() {
  // UPDATE_SNAPSHOT would let a mutant rewrite the values it is judged by, CI stops any snapshot write.
  // Matched without case, as Windows reads environment names
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !['UPDATE_SNAPSHOT', 'CI', 'SKIP_GAS_SNAPSHOTS'].includes(k.toUpperCase()))
  );
  Object.assign(env, { SKIP_GAS_SNAPSHOTS: '1', CI: '1' });
  // One command string: an argument array alongside shell: true is deprecated (DEP0190)
  const run = spawnSync(['npx hardhat test', ...specs.map((s) => `"${s}"`)].join(' '), {
    cwd: runDir,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 256 * 1024 * 1024,
    env,
  });
  const out = (run.stdout || '') + (run.stderr || '');
  const passing = /^\s*(\d+) passing \(/m.exec(out);
  const failing = /^\s*(\d+) failing\r?$/m.exec(out);
  // Each summary block opens with "  N) " and names the test on the lines up to the first one ending in ':'
  const failed = [];
  if (failing) {
    for (const block of out.slice(failing.index).split(/\r?\n {2}\d+\) /).slice(1)) {
      const lines = block.split('\n').map((l) => l.trim());
      const end = lines.findIndex((l) => l.endsWith(':'));
      failed.push(lines.slice(0, end < 0 ? 1 : end + 1).join(' / '));
    }
  }
  return { run, out, passing: passing ? +passing[1] : 0, failing: failing ? +failing[1] : 0, failed };
}

let mutated = false;
let verdict;
try {
  fs.writeFileSync(backup, originalBytes);
  // A function replacer, so `$&` and friends in the mutation are taken literally
  fs.writeFileSync(abs, original.replace(find, () => replace));
  mutated = true;
  console.log(`mutation applied to ${rel}`);
  verdict = runSpecs();
} catch (e) {
  console.log(`result: no verdict, ${e.message}`);
  process.exitCode = 5;
} finally {
  // Compared with the bytes read at start, not with git: the file may carry uncommitted edits
  try {
    if (!fs.readFileSync(abs).equals(originalBytes)) fs.writeFileSync(abs, originalBytes);
    if (!fs.readFileSync(abs).equals(originalBytes)) throw new Error('bytes differ');
    fs.rmSync(backup, { force: true });
    if (mutated) console.log('restored: byte-identical to before the mutation');
  } catch (e) {
    console.log(`RESTORE FAILED: ${rel} (${e.message}), the original is in ${backup}`);
    process.exitCode = 6;
  }
}

const complete = (r) => !r.run.error && !r.run.signal && (r.passing || r.failing) && r.failed.length === r.failing;

// Deferred past the poll phase, so a Ctrl-C that arrived during the run is seen before any verdict
setImmediate(() => {
  if (!verdict || process.exitCode !== undefined || interrupted) return;
  const { run, out, passing, failing, failed } = verdict;
  if (!passing && !failing && !run.error && !run.signal) {
    const compile = /Error HH\d+|CompilerError|Compilation failed/.test(out);
    console.log(compile ? 'result: did not compile' : 'result: nothing ran — check the spec paths');
    process.exitCode = 5;
    return;
  }
  if (!complete(verdict)) {
    console.log(`result: no verdict, the run ended with ${run.error ? run.error.code : run.signal || 'an unreadable summary'}`);
    process.exitCode = 5;
    return;
  }
  // A test that fails without the mutation as well cannot have caught it
  const baseline = failing ? runSpecs() : undefined;
  setImmediate(() => {
    if (interrupted) return;
    let kills = failed;
    if (baseline && !complete(baseline)) {
      console.log('result: no verdict, the run without the mutation did not complete');
      process.exitCode = 5;
      return;
    }
    if (baseline && baseline.failing) {
      kills = kills.filter((t) => !baseline.failed.includes(t));
      console.log(`baseline: ${baseline.failing} failing without the mutation, they cannot judge it`);
    }
    process.exitCode = kills.length ? 0 : 1;
    console.log(`result: ${passing} passing, ${failing} failing, ${kills.length} caused by the mutation`);
    kills.slice(0, 12).forEach((t) => console.log('   ' + t.slice(0, 130)));
  });
});
