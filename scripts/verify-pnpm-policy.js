#!/usr/bin/env node
'use strict';

/**
 * verify-pnpm-policy.js
 *
 * Lightweight policy-validation entrypoint used by `npm run policy.check`
 * and CI jobs.  Parses the root .npmrc and confirms all required pnpm
 * shared-store keys are present and non-empty.
 *
 * Exit 0 on success, exit 1 on any violation.
 */

const fs = require('fs');
const path = require('path');

const NPMRC_PATH = path.resolve(__dirname, '..', '.npmrc');

/** Keys that must appear in .npmrc with a non-empty value. */
const REQUIRED_KEYS = [
  'store-dir',
  'package-import-method',
  'node-linker',
  'auto-install-peers',
  'shared-workspace-lockfile',
];

/** Expected values for keys where an exact value is mandated. */
const EXPECTED_VALUES = {
  'package-import-method': 'copy',
  'node-linker': 'hoisted',
  'auto-install-peers': 'true',
  'shared-workspace-lockfile': 'true',
};

/**
 * Parse a .npmrc file into a key→value map, ignoring blank lines and comments.
 *
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseNpmrc(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`.npmrc not found at: ${filePath}`);
  }
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  /** @type {Record<string, string>} */
  const config = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    config[key] = value;
  }
  return config;
}

/**
 * Validate the parsed config map against REQUIRED_KEYS and EXPECTED_VALUES.
 *
 * @param {Record<string, string>} config
 * @returns {{ missing: string[], empty: string[], wrong: Array<{key: string, got: string, want: string}> }}
 */
function validate(config) {
  const missing = REQUIRED_KEYS.filter((k) => !(k in config));
  const empty = REQUIRED_KEYS.filter((k) => k in config && config[k] === '');
  const wrong = Object.entries(EXPECTED_VALUES)
    .filter(([k, want]) => k in config && config[k] !== want)
    .map(([k, want]) => ({ key: k, got: config[k], want }));
  return { missing, empty, wrong };
}

// ── Main ─────────────────────────────────────────────────────────────────────

let exitCode = 0;

try {
  console.log('pnpm shared-store policy check');
  console.log('================================');
  console.log(`Config file: ${NPMRC_PATH}\n`);

  const config = parseNpmrc(NPMRC_PATH);
  const { missing, empty, wrong } = validate(config);

  console.log('Policy settings:');
  for (const key of REQUIRED_KEYS) {
    const value = config[key] ?? '(missing)';
    console.log(`  ${key} = ${value}`);
  }
  console.log();

  if (missing.length > 0) {
    console.error(`FAIL — missing required keys: ${missing.join(', ')}`);
    exitCode = 1;
  }

  if (empty.length > 0) {
    console.error(`FAIL — keys present but empty: ${empty.join(', ')}`);
    exitCode = 1;
  }

  for (const { key, got, want } of wrong) {
    console.error(`FAIL — ${key}: expected "${want}", got "${got}"`);
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log('Result: OK — all required pnpm policy keys are present and correct.');
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  exitCode = 1;
}

process.exit(exitCode);
