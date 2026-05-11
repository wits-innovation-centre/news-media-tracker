/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires */
// Health-check script for the packaged local-server runtime.
// Reads LOCAL_SERVER_PORT from .env.local-server (or the environment),
// calls /api/health and prints the result. Exits 0 on healthy, 1 on failure.
const http = require('http');
const { loadLocalServerEnv } = require('./local-server-env');

loadLocalServerEnv();

const DEFAULT_PORT = 3000;
const port = parseInt(
  process.env.LOCAL_SERVER_PORT || String(DEFAULT_PORT),
  10,
);
const url = `http://localhost:${port}/api/health`;

console.log(`Checking health at ${url} …`);

const req = http.get(url, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(body);
        console.log('Status  :', json.status);
        console.log('Message :', json.message);
        console.log('Version :', json.version);
        console.log('Time    :', json.timestamp);
        process.exit(0);
      } catch {
        console.log('Response:', body);
        process.exit(0);
      }
    } else {
      console.error(`Unexpected status: ${res.statusCode}`);
      process.exit(1);
    }
  });
});

req.setTimeout(5000);
req.on('error', (err) => {
  console.error(`Health check failed: ${err.message}`);
  console.error(
    'Is the local server running? Start it with: npm run local-server.start',
  );
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error('Health check timed out after 5s.');
  process.exit(1);
});
