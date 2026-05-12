/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires */
// Validates that pnpm can operate without EACCES permission errors in the
// configured runtime environment. Checks the pnpm store path accessibility
// and that the current user can write all relevant install directories.
// Lightweight — suitable for local and CI execution.
// Exit 0 on pass, 1 on any failure.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { check: _check, commandAvailable } = require('./lib/validation-utils');

const ROOT = path.resolve(__dirname, '..');

const counters = { passed: 0, failed: 0 };
const check = (label, fn) => _check(counters, label, fn);

function assertWritable(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return; // not yet created — no permission issue at this point
  }
  try {
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    if (err.code === 'EACCES') {
      const user = os.userInfo().username;
      throw new Error(
        `EACCES at ${dirPath} — not writable by user "${user}". ` +
          `Fix with: sudo chown -R $(id -u):$(id -g) "${dirPath}"`,
      );
    }
    throw err;
  }
}

console.log('pnpm install permission validation');
console.log('===================================');

// ── 1. pnpm availability ──────────────────────────────────────────────────────
if (!commandAvailable('pnpm')) {
  console.log(
    '  pnpm available ... SKIP (pnpm not installed — not a failure for npm-only setups)',
  );
  console.log('');
  console.log(
    'pnpm permission validation: skipped (pnpm not found in PATH)',
  );
  process.exit(0);
}

check('pnpm version', () =>
  execSync('pnpm --version', { stdio: 'pipe' }).toString().trim(),
);

// ── 2. Store path resolution ──────────────────────────────────────────────────
let storePath = '';

check('pnpm store path resolvable', () => {
  const raw = execSync('pnpm config get store-dir', { stdio: 'pipe' })
    .toString()
    .trim();
  if (raw && raw !== 'undefined') {
    storePath = raw;
  } else {
    const xdgData =
      process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    storePath = path.join(xdgData, 'pnpm', 'store');
  }
  return storePath;
});

// ── 3. Store directory writable ───────────────────────────────────────────────
check('pnpm store directory writable', () => {
  assertWritable(storePath);
  if (!fs.existsSync(storePath)) {
    return 'will be created on first install';
  }
  return storePath;
});

// ── 4. Project node_modules writable ─────────────────────────────────────────
check('project node_modules writable', () => {
  assertWritable(path.join(ROOT, 'node_modules'));
});

// ── 5. .npmrc store-dir safety check ─────────────────────────────────────────
check('.npmrc does not configure a root-owned store path', () => {
  const npmrc = path.join(ROOT, '.npmrc');
  if (!fs.existsSync(npmrc)) {
    return 'no .npmrc';
  }
  const content = fs.readFileSync(npmrc, 'utf8');
  const storeMatch = content.match(/^store-dir\s*=\s*(.+)$/m);
  if (!storeMatch) {
    return 'no store-dir override';
  }
  const configuredStore = storeMatch[1].trim();
  if (/^\/(root|var|usr|opt)/.test(configuredStore)) {
    throw new Error(
      `store-dir "${configuredStore}" points to a system path — ` +
        'this causes EACCES when running as a non-root user. ' +
        'Set store-dir to a user-writable path (e.g., ~/.local/share/pnpm/store).',
    );
  }
  return `store-dir = ${configuredStore}`;
});

// ── 6. pnpm store status (only if store already exists) ──────────────────────
if (storePath && fs.existsSync(storePath)) {
  check('pnpm store status (integrity)', () => {
    try {
      execSync('pnpm store status', { cwd: ROOT, stdio: 'pipe' });
    } catch (err) {
      const stderr = (err.stderr || Buffer.alloc(0)).toString();
      if (stderr.includes('EACCES')) {
        throw new Error(
          `EACCES detected during pnpm store status:\n${stderr.slice(0, 400)}`,
        );
      }
      // Integrity warnings are soft failures locally; hard in CI
      if (process.env.CI) {
        throw new Error(
          `pnpm store status failed in CI:\n${stderr.slice(0, 400)}`,
        );
      }
      return 'integrity warnings present (non-fatal outside CI)';
    }
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`pnpm permission validation: ${counters.passed} passed, ${counters.failed} failed`);
if (counters.failed > 0) {
  process.exit(1);
}
