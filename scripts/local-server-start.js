/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires */
// Start script for the packaged local-server runtime.
// Reads LOCAL_DATA_PATH and LOCAL_SERVER_PORT from .env.local-server (or the
// environment), then spawns the Next.js standalone server.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { loadLocalServerEnv } = require('./local-server-env');

loadLocalServerEnv();

const DEFAULT_PORT = 3000;
const port = parseInt(process.env.LOCAL_SERVER_PORT || String(DEFAULT_PORT), 10);
const dataPath = process.env.LOCAL_DATA_PATH || './data';
const serverScript = path.join('.next', 'standalone', 'server.js');

// Ensure data directory exists
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

if (!fs.existsSync(serverScript)) {
  console.error(
    `Error: ${serverScript} not found.\n` +
    'Please build the app first with the standalone output enabled:\n' +
    '  pnpm run build',
  );
  process.exit(1);
}

const serverUrl = `http://localhost:${port}`;

console.log(`Starting local server on ${serverUrl}`);
console.log(`Data path : ${dataPath}`);

const server = spawn('node', [serverScript], {
  env: {
    ...process.env,
    PORT: String(port),
    HOSTNAME: 'localhost',
    NODE_ENV: 'production',
    LOCAL_DATA_PATH: dataPath,
  },
  stdio: 'inherit',
});

server.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Server exited with code ${code}`);
    process.exit(code);
  }
});

// Wait for the server to pass a health check then print the ready URL.
const TIMEOUT_MS = 30000;
const startTime = Date.now();
let serverReady = false;

function waitForServer() {
  if (serverReady) return;
  const req = http.get(`${serverUrl}/api/health`, (res) => {
    if (res.statusCode === 200) {
      serverReady = true;
      console.log('');
      console.log(`Local server is ready at ${serverUrl}`);
      console.log(`Health check: ${serverUrl}/api/health`);
    } else {
      scheduleRetry();
    }
  });
  req.setTimeout(1000);
  req.on('error', scheduleRetry);
  req.on('timeout', () => {
    req.destroy();
    scheduleRetry();
  });
}

function scheduleRetry() {
  if (serverReady) return;
  if (Date.now() - startTime > TIMEOUT_MS) {
    console.warn(
      `Server did not respond within ${TIMEOUT_MS / 1000}s. It may still be starting.`,
    );
    console.log(`Once ready, visit: ${serverUrl}`);
    return;
  }
  setTimeout(waitForServer, 500);
}

setTimeout(waitForServer, 1000);
