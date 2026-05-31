/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires */
const { spawnSync } = require('child_process');
const { commandAvailable } = require('./lib/validation-utils');

const composeArgs = process.argv.slice(2);

const hasComposePlugin = spawnSync('docker', ['compose', 'version'], {
    stdio: 'ignore',
}).status === 0;

let command;
let commandArgs;

if (hasComposePlugin) {
    command = 'docker';
    commandArgs = ['compose', ...composeArgs];
} else if (commandAvailable('docker-compose')) {
    command = 'docker-compose';
    commandArgs = composeArgs;
} else {
    console.error('Neither `docker compose` nor `docker-compose` is available.');
    process.exit(1);
}

const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
});

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

if (typeof result.status === 'number') {
    process.exit(result.status);
}

if (result.signal) {
    process.kill(process.pid, result.signal);
}

process.exit(1);