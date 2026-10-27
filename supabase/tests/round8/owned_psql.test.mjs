import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertOwnedContainer, verifySqlInputs, controlSql, main } from './owned_psql.mjs';

const owner = 'sq2170-test-owner';
const owned = () => [{ Name: '/round8-reader-test',
  Image: 'sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426',
  Config: { Image: 'public.ecr.aws/supabase/postgres:17.6.1.063', Env: ['PGDATA=/var/lib/postgresql/data'],
    Labels: { 'sidequest.ticket': 'SQ-2170', 'sidequest.owner': owner } },
  Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }, { Type: 'tmpfs', Destination: '/var/run/postgresql' }],
  HostConfig: { NetworkMode: 'none', PortBindings: {}, ReadonlyRootfs: true, IpcMode: 'private', PidMode: '' }, NetworkSettings: { Ports: {} } }];
test('accepts an isolated native postgres fixture', () => assert.doesNotThrow(() => assertOwnedContainer(owned(), owner)));
for (const [name, change] of [
  ['shared name', c => { c.Name = '/supabase_db_supabase'; }],
  ['network', c => { c.HostConfig.NetworkMode = 'bridge'; }],
  ['configured ports', c => { c.HostConfig.PortBindings = { '5432/tcp': [] }; }],
  ['live ports', c => { c.NetworkSettings.Ports = { '5432/tcp': null }; }],
  ['writable root', c => { c.HostConfig.ReadonlyRootfs = false; }],
  ['image', c => { c.Config.Image = 'postgres:17'; }],
  ['bind mount', c => { c.Mounts.push({ Type: 'bind', Destination: '/host' }); }],
  ['volume mount', c => { c.Mounts.push({ Type: 'volume', Destination: '/data' }); }],
  ['host config mount', c => { c.HostConfig.Mounts = [{ Type: 'volume' }]; }],
  ['host config bind', c => { c.HostConfig.Binds = ['/host:/data']; }],
  ['inherited volumes', c => { c.HostConfig.VolumesFrom = ['other']; }],
  ['non-tmpfs PGDATA', c => { c.Mounts.shift(); }],
  ['non-tmpfs socket', c => { c.Mounts.pop(); }],
  ['host IPC', c => { c.HostConfig.IpcMode = 'host'; }],
  ['container PID', c => { c.HostConfig.PidMode = 'container:other'; }],
  ['wrong image id', c => { c.Image = 'sha256:' + '0'.repeat(64); }],
  ['wrong owner', c => { c.Config.Labels['sidequest.owner'] = 'other'; }],
  ['wrong ticket', c => { c.Config.Labels['sidequest.ticket'] = 'SQ-2110'; }],
]) test('refuses ' + name, () => { const value = owned(); change(value[0]); assert.throws(() => assertOwnedContainer(value, owner)); });
test('refuses missing and multiple inspect results', () => {
  for (const value of [null, [], [...owned(), ...owned()]]) assert.throws(() => assertOwnedContainer(value, owner));
});
const files = {
  'supabase/tests/entry.sql': Buffer.from('\\ir child.psql\n'),
  'supabase/tests/child.psql': Buffer.from('\\ir ../migrations/reader.sql\n\\i :external_reading_control\n'),
  'supabase/migrations/reader.sql': Buffer.from('SELECT 1;'),
  'control/old-reader.sql': Buffer.from('SELECT 0;'),
};
const local = file => { if (!files[file]) throw Error('missing input'); return files[file]; };
const remote = file => local(file.replace('/tmp/round8-input/', ''));
test('checks the complete recursive SQL include set', () => {
  assert.deepEqual(verifySqlInputs('supabase/tests/entry.sql', undefined, local, remote), Object.keys(files).slice(0, 3));
});
test('checks the separately authorized old-reader bytes too', () => {
  assert.equal(verifySqlInputs('supabase/tests/entry.sql', '/tmp/round8-input/control/old-reader.sql', local, remote).length, 4);
});
for (const file of Object.keys(files).slice(0, 3)) {
  test('refuses differing bytes: ' + file, () => assert.throws(() => verifySqlInputs('supabase/tests/entry.sql', undefined,
    local, name => name === '/tmp/round8-input/' + file ? Buffer.from('changed') : remote(name)), /mismatch/));
  test('refuses missing bytes: ' + file, () => assert.throws(() => verifySqlInputs('supabase/tests/entry.sql', undefined,
    local, name => { if (name === '/tmp/round8-input/' + file) throw Error('missing'); return remote(name); }), /missing/));
}
test('unapproved control and malformed transport never inspect or execute', () => {
  const env = { ROUND8_PSQL_TRANSPORT: 'docker-exec', ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_CONTAINER: 'a'.repeat(64),
    ROUND8_EXTERNAL_READING_CONTROL: '/tmp/round8-input/control/old-reader.sql' };
  const run = () => assert.fail('must not spawn');
  assert.throws(() => main(env, ['node', 'helper', 'supabase/tests/entry.sql'], run), /negative-control/);
  assert.throws(() => main({}, ['node', 'helper', 'supabase/tests/entry.sql'], run), /transport/);
  assert.throws(() => main({ ...env, ROUND8_NEGATIVE_CONTROL: '1',
    ROUND8_EXTERNAL_READING_CONTROL: '/tmp/round8-input/control/wrong.sql' },
  ['node', 'helper', 'supabase/tests/entry.sql'], run), /negative-control/);
});
for (const include of ['\\include child.psql', '\\include_relative child.psql',
  'SELECT 1; \\ir child.psql', 'SELECT 1; \\i child.psql', '\\i/absolute.sql', '\\ir\'quoted.sql\'']) {
  test('refuses unsupported include syntax: ' + include, () => {
    const read = () => Buffer.from(include + '\n');
    assert.throws(() => verifySqlInputs('supabase/tests/entry.sql', undefined, read, read), /unsupported SQL include/);
  });
}
test('executes a read-only verified snapshot of pinned committed bytes, not mutable inputs', () => {
  const snapshot = new Map();
  let executed = false;
  const run = (binary, args, options) => {
    const ok = stdout => ({ status: 0, stdout: Buffer.from(stdout ?? '') });
    if (binary === 'git') {
      if (args[0] === 'rev-parse') return ok('b'.repeat(40) + '\n');
      assert.equal(args[1], 'b'.repeat(40) + ':supabase/tests/entry.sql');
      return ok('SELECT 1;\n');
    }
    assert.equal(binary, 'docker');
    if (args[0] === 'inspect') {
      assert.deepEqual(args.slice(0, 3), ['inspect', '--type', 'container']);
      return ok(JSON.stringify(owned()));
    }
    if (args.includes('install')) {
      assert.equal(args[args.indexOf('-m') + 1], '0444');
      snapshot.set(args.at(-1), options.input);
      return ok();
    }
    if (args.includes('cat')) {
      const file = args.at(-1);
      return ok(file.startsWith('/tmp/round8-input/') ? 'SELECT 1;\n' : snapshot.get(file));
    }
    if (args.includes('psql')) {
      const entry = args.at(-1);
      assert.match(entry, /^\/tmp\/round8-verified-[0-9a-f-]+\/supabase\/tests\/entry.sql$/);
      assert.equal(snapshot.get(entry).toString(), 'SELECT 1;\n');
      executed = true;
    } else if (args.includes('chmod')) assert.deepEqual(args.slice(3, 5), ['-R', 'a-w']);
    else assert.ok(args.includes('mkdir'));
    return ok();
  };
  assert.equal(main({ ROUND8_PSQL_TRANSPORT: 'docker-exec', ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_CONTAINER: 'a'.repeat(64) },
    ['node', 'helper', 'supabase/tests/entry.sql'], run), 0);
  assert.ok(executed);
});
test('rejects changed bytes after copying, before psql', () => {
  const run = (binary, args) => {
    if (binary === 'git') return { status: 0, stdout: Buffer.from(args[0] === 'rev-parse' ? 'b'.repeat(40) : 'SELECT 1;') };
    if (args[0] === 'inspect') return { status: 0, stdout: JSON.stringify(owned()) };
    assert.ok(!args.includes('psql'));
    return { status: 0, stdout: Buffer.from(args.at(-1).startsWith('/tmp/round8-input/') ? 'SELECT 1;' : 'changed copy') };
  };
  assert.throws(() => main({ ROUND8_PSQL_TRANSPORT: 'docker-exec', ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_CONTAINER: 'a'.repeat(64) },
    ['node', 'helper', 'supabase/tests/entry.sql'], run), /snapshot mismatch/);
});
test('deleted-block controls remove only their named native block', () => {
  const reader = 'prefix\n   SELECT 1 FROM bindings b JOIN fulfilments f ON f.id=b.fulfilment_id\n bindings body\n  ) AND NOT EXISTS(\n   SELECT 1 FROM receipts v LEFT JOIN events e ON e.id=v.event_id\n receipts body\n  ) AND NOT EXISTS(\nsuffix';
  const binding = controlSql('control/deleted-bindings.sql', () => Buffer.from(reader)).toString();
  const receipt = controlSql('control/deleted-receipts.sql', () => Buffer.from(reader)).toString();
  assert.ok(!binding.includes('bindings body') && binding.includes('receipts body'));
  assert.ok(!receipt.includes('receipts body') && receipt.includes('bindings body'));
});
