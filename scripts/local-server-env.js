/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires */
// Shared helper: load .env.local-server into process.env.
// Environment variables already set by the caller take precedence.
const fs = require('fs');

const ENV_FILE = '.env.local-server';

function loadLocalServerEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

module.exports = { loadLocalServerEnv };
