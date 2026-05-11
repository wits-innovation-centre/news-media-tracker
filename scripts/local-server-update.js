/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires */
// Update script for the packaged local-server runtime.
// Re-installs production dependencies and rebuilds the Next.js standalone
// output so the latest changes take effect on the next server start.
const { execFileSync } = require('child_process');

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

console.log('Updating local server dependencies …');
run('npm', ['ci', '--omit=dev']);

console.log('');
console.log('Rebuilding Next.js standalone output …');
run('npm', ['run', 'build']);

console.log('');
console.log('Update complete.');
console.log(
  'Restart the server to apply changes: npm run local-server.start',
);
