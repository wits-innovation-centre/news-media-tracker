/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires */
// Validates docker-compose.yml configuration and structural requirements.
// Runs `docker compose config` when the Docker CLI is available; otherwise
// falls back to file-based structural checks only.
// Lightweight — suitable for local and CI execution.
// Exit 0 on all checks passed, 1 on any failure.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { check: _check, commandAvailable } = require('./lib/validation-utils');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = path.join(ROOT, 'docker-compose.yml');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');

const counters = { passed: 0, failed: 0 };
const check = (label, fn) => _check(counters, label, fn);

console.log('Docker Compose config validation');
console.log('=================================');

// ── 1. File present ───────────────────────────────────────────────────────────
check('compose file present', () => {
  if (!fs.existsSync(COMPOSE_FILE)) {
    throw new Error(`docker-compose.yml not found at ${COMPOSE_FILE}`);
  }
});

const content = fs.existsSync(COMPOSE_FILE)
  ? fs.readFileSync(COMPOSE_FILE, 'utf8')
  : '';

// ── 2. Required services ──────────────────────────────────────────────────────
check('sqld service defined', () => {
  if (!/^\s{2}sqld:/m.test(content)) {
    throw new Error('sqld service not found in docker-compose.yml');
  }
});

check('app service defined', () => {
  if (!/^\s{2}app:/m.test(content)) {
    throw new Error('app service not found in docker-compose.yml');
  }
});

// ── 3. external-server profile ────────────────────────────────────────────────
check('external-server profile assigned to services', () => {
  const count = (content.match(/external-server/g) || []).length;
  if (count < 2) {
    throw new Error(
      `expected "external-server" profile on at least 2 services; found ${count}`,
    );
  }
  return `${count} references`;
});

// ── 4. sqld healthcheck ───────────────────────────────────────────────────────
check('sqld healthcheck defined', () => {
  if (!content.includes('healthcheck:')) {
    throw new Error('no healthcheck block found in docker-compose.yml');
  }
});

// ── 5. app depends_on sqld with service_healthy ───────────────────────────────
check('app depends_on sqld with service_healthy condition', () => {
  if (!content.includes('service_healthy')) {
    throw new Error(
      'app service does not declare condition: service_healthy for sqld dependency',
    );
  }
});

// ── 6. Named volumes ──────────────────────────────────────────────────────────
check('named volumes defined (sqld-data, app-data)', () => {
  if (!content.includes('sqld-data:') || !content.includes('app-data:')) {
    throw new Error('named volumes sqld-data and/or app-data not found');
  }
});

// ── 7. .env.example completeness ─────────────────────────────────────────────
check('.env.example documents all required variables', () => {
  if (!fs.existsSync(ENV_EXAMPLE)) {
    throw new Error('.env.example not found');
  }
  const envContent = fs.readFileSync(ENV_EXAMPLE, 'utf8');
  const required = [
    'SQLD_AUTH_JWT_KEY',
    'DATABASE_AUTH_TOKEN',
    'SQLD_HTTP_PORT',
    'APP_PORT',
    'NEXT_PUBLIC_API_BASE_URL',
  ];
  const missing = required.filter((v) => !envContent.includes(v));
  if (missing.length > 0) {
    throw new Error(`missing vars in .env.example: ${missing.join(', ')}`);
  }
  return `${required.length} required vars present`;
});

// ── 8. Docker CLI validation (skipped gracefully when Docker is not installed) ─
if (commandAvailable('docker')) {
  check('docker compose config --quiet', () => {
    try {
      execSync('docker compose config --quiet', { cwd: ROOT, stdio: 'pipe' });
    } catch (err) {
      const stderr = (err.stderr || Buffer.alloc(0)).toString();
      throw new Error(`docker compose config failed:\n${stderr.slice(0, 500)}`);
    }
  });

  check('external-server profile resolves cleanly', () => {
    try {
      const out = execSync(
        'docker compose --profile external-server config --services',
        { cwd: ROOT, stdio: 'pipe' },
      )
        .toString()
        .trim();
      const services = out.split('\n').filter(Boolean);
      const expected = ['sqld', 'app'];
      const missing = expected.filter((s) => !services.includes(s));
      if (missing.length > 0) {
        throw new Error(
          `expected services not resolved: ${missing.join(', ')} (got: ${services.join(', ')})`,
        );
      }
      return services.join(', ');
    } catch (err) {
      if (err.message && err.message.includes('expected services')) throw err;
      const stderr = (err.stderr || Buffer.alloc(0)).toString();
      throw new Error(
        `compose profile resolution failed:\n${stderr.slice(0, 500)}`,
      );
    }
  });
} else {
  console.log(
    '  docker compose config         ... SKIP (Docker CLI not available)',
  );
  console.log(
    '  external-server profile check ... SKIP (Docker CLI not available)',
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Compose validation: ${counters.passed} passed, ${counters.failed} failed`);
if (counters.failed > 0) {
  process.exit(1);
}
