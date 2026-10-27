import { spawnSync } from 'node:child_process';
import path from 'node:path';

const id = process.env.ROUND8_OWNED_CONTAINER;
const input = process.argv[2];
const inputRoot = '/tmp/round8-input/';
const ownedId = '70faa1c702c18248cc3e1a13e2fe06c2142a61e5c155c3a89d07ae0fcd529d60';
const control = process.env.ROUND8_EXTERNAL_READING_CONTROL;

if (process.env.ROUND8_PSQL_TRANSPORT !== 'docker-exec'
  || !/^[0-9a-f]{64}$/.test(id ?? '') || id !== ownedId) {
  throw new Error('owned docker-exec transport required');
}
if (!input || process.argv.length !== 3 || path.posix.isAbsolute(input)
  || path.win32.isAbsolute(input) || input.includes('..') || input.includes('\\')
  || !input.startsWith('supabase/') || path.posix.normalize(input) !== input) {
  throw new Error('repo-relative supabase input required');
}
if (control !== undefined && (!control.startsWith(inputRoot + 'control/')
  || control.includes('..') || control.includes('\\')
  || path.posix.normalize(control) !== control
  || control === inputRoot + 'control/')) {
  throw new Error('owned input control path required');
}

const args = ['exec', '-i', '-u', 'postgres', '-e', 'PGPASSFILE=/tmp/round8-owned.pgpass',
  id, 'psql', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'round8_clone',
  '-w', '-X', '-v', 'ON_ERROR_STOP=1'];
if (control !== undefined) args.push('-v', 'external_reading_control=' + control);
args.push('-f', inputRoot + input);

const result = spawnSync('docker', args, { stdio: 'inherit', timeout: 180000 });
if (result.error?.code === 'ETIMEDOUT') {
  // Killing the local docker client does not terminate its in-container psql.
  const stop = spawnSync('docker', ['stop', '-t', '5', id], {
    stdio: 'inherit', timeout: 15000,
  });
  console.error(stop.status === 0
    ? 'SQL timeout; dedicated owned runtime stop returned zero; confirm teardown'
    : 'SQL timeout; owned runtime cleanup UNCONFIRMED');
}
if (result.error) console.error('owned psql transport failed: ' + result.error.code);
process.exit(result.status ?? 1);
