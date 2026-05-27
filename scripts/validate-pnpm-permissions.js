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

function findWorkspaceRoot(startDir) {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

const WORKSPACE_ROOT = findWorkspaceRoot(ROOT);

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

function assertNotRootOwned(filePath) {
  if (process.platform === 'win32') {
    return 'ownership checks skipped on Windows';
  }
  if (!fs.existsSync(filePath)) {
    return;
  }
  const stats = fs.statSync(filePath);
  if (stats.uid === 0) {
    throw new Error(
      `Path is root-owned: ${filePath}. ` +
      `Fix with: sudo chown -R $(id -u):$(id -g) "${filePath}"`,
    );
  }
}

function listChildDirs(parentDir) {
  if (!fs.existsSync(parentDir)) {
    return [];
  }
  return fs
    .readdirSync(parentDir)
    .map((name) => path.join(parentDir, name))
    .filter((childPath) => {
      try {
        return fs.statSync(childPath).isDirectory();
      } catch {
        return false;
      }
    });
}

function firstRootOwnedPath(searchRoot) {
  if (process.platform === 'win32' || !fs.existsSync(searchRoot)) {
    return '';
  }
  try {
    if (fs.lstatSync(searchRoot).uid === 0) {
      return searchRoot;
    }

    // Bounded scan: node_modules root + top-level packages + one extra level
    // for scoped packages (e.g. @scope/pkg). This is where ownership drift
    // from sudo installs typically appears and keeps validation fast.
    const firstLevel = fs.readdirSync(searchRoot, { withFileTypes: true });
    for (const entry of firstLevel) {
      const entryPath = path.join(searchRoot, entry.name);
      let stats;
      try {
        stats = fs.lstatSync(entryPath);
      } catch {
        continue;
      }
      if (stats.uid === 0) {
        return entryPath;
      }
      if (entry.isDirectory() && entry.name.startsWith('@')) {
        let scopedEntries = [];
        try {
          scopedEntries = fs.readdirSync(entryPath, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const scopedEntry of scopedEntries) {
          const scopedPath = path.join(entryPath, scopedEntry.name);
          try {
            if (fs.lstatSync(scopedPath).uid === 0) {
              return scopedPath;
            }
          } catch {
            // Skip unstable entries.
          }
        }
      }
    }
    return '';
  } catch {
    return '';
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

// ── 5. Ownership drift checks for key paths ─────────────────────────────────
check('critical project paths are not root-owned', () => {
  const keyPaths = [
    ROOT,
    path.join(ROOT, 'package.json'),
    path.join(ROOT, 'node_modules'),
    WORKSPACE_ROOT,
    path.join(WORKSPACE_ROOT, 'pnpm-lock.yaml'),
    path.join(WORKSPACE_ROOT, 'node_modules'),
  ];
  keyPaths.forEach((entry) => {
    assertNotRootOwned(entry);
  });
  return process.platform === 'win32'
    ? 'ownership checks skipped on Windows'
    : `workspace root: ${WORKSPACE_ROOT}`;
});

check('workspace node_modules trees do not contain root-owned entries', () => {
  if (process.platform === 'win32') {
    return 'ownership checks skipped on Windows';
  }

  const scanRoots = [
    path.join(ROOT, 'node_modules'),
    path.join(WORKSPACE_ROOT, 'node_modules'),
    ...listChildDirs(path.join(WORKSPACE_ROOT, 'apps')).map((dir) =>
      path.join(dir, 'node_modules'),
    ),
    ...listChildDirs(path.join(WORKSPACE_ROOT, 'packages')).map((dir) =>
      path.join(dir, 'node_modules'),
    ),
  ].filter((p, idx, arr) => arr.indexOf(p) === idx && fs.existsSync(p));

  for (const root of scanRoots) {
    const rootOwned = firstRootOwnedPath(root);
    if (rootOwned) {
      throw new Error(
        `Found root-owned entry under ${root}: ${rootOwned}. ` +
        'Fix ownership before running pnpm install.',
      );
    }
  }

  return `${scanRoots.length} node_modules tree(s) scanned (bounded top-level ownership check)`;
});

// ── 6. .npmrc store-dir safety check ─────────────────────────────────────────
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

// ── 7. pnpm store status (only if store already exists) ──────────────────────
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
