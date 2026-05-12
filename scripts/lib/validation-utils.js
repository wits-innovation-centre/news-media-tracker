/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires */
// Shared utilities for validation scripts.

const { execSync } = require('child_process');

/**
 * Runs a named check. Prints PASS/FAIL and accumulates counts on the
 * provided counters object `{ passed, failed }`. Returns true on pass.
 *
 * @param {{ passed: number; failed: number }} counters
 * @param {string} label
 * @param {() => string | void} fn  Return a detail string to append to "PASS (detail)".
 * @returns {boolean}
 */
function check(counters, label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    const detail = fn();
    console.log('PASS' + (detail ? ` (${detail})` : ''));
    counters.passed++;
    return true;
  } catch (err) {
    console.log('FAIL');
    console.error(`    ${err.message}`);
    counters.failed++;
    return false;
  }
}

/**
 * Returns true when `cmd --version` exits without error.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
function commandAvailable(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

module.exports = { check, commandAvailable };
