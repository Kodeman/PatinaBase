import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertOwnedContainer, verifySqlInputs, controlSql, main } from './owned_psql.mjs';

const owner = 'sq2173-test-owner';
const ticket = 'SQ-2173';
const owned = () => [{ Name: '/round8-reader-test',
  Image: 'sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426',
  Config: { Image: 'public.ecr.aws/supabase/postgres:17.6.1.063', Env: ['PGDATA=/var/lib/postgresql/data'],
    Labels: { 'sidequest.ticket': ticket, 'sidequest.owner': owner } },
  Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }, { Type: 'tmpfs', Destination: '/var/run/postgresql' }],
  HostConfig: { NetworkMode: 'none', PortBindings: {}, ReadonlyRootfs: true, IpcMode: 'private', PidMode: '',
    SecurityOpt: ['no-new-privileges:true'] }, NetworkSettings: { Ports: {} } }];
test('accepts an isolated native postgres fixture', () => assert.doesNotThrow(() => assertOwnedContainer(owned(), owner, ticket)));
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
  ['missing owner label', c => { delete c.Config.Labels['sidequest.owner']; }],
  ['missing PGDATA', c => { c.Config.Env = []; }],
  ['container IPC', c => { c.HostConfig.IpcMode = 'container:other'; }],
  ['host PID', c => { c.HostConfig.PidMode = 'host'; }],
  ['host IPC', c => { c.HostConfig.IpcMode = 'host'; }],
  ['container PID', c => { c.HostConfig.PidMode = 'container:other'; }],
  ['wrong image id', c => { c.Image = 'sha256:' + '0'.repeat(64); }],
  ['wrong owner', c => { c.Config.Labels['sidequest.owner'] = 'other'; }],
  ['wrong ticket', c => { c.Config.Labels['sidequest.ticket'] = 'SQ-2110'; }],
]) test('refuses ' + name, () => { const value = owned(); change(value[0]); assert.throws(() => assertOwnedContainer(value, owner, ticket)); });
test('accepts the real Docker --tmpfs inspect shape', () => {
  const value = owned();
  value[0].Mounts = [];
  value[0].HostConfig.Tmpfs = { '/var/lib/postgresql/data': 'rw', '/var/run/postgresql': 'rw' };
  assert.doesNotThrow(() => assertOwnedContainer(value, owner, ticket));
});
for (const [name, missing] of [
  ['PGDATA', '/var/lib/postgresql/data'],
  ['socket directory', '/var/run/postgresql'],
]) test('refuses real Docker --tmpfs shape missing ' + name, () => {
  const value = owned();
  value[0].Mounts = [];
  value[0].HostConfig.Tmpfs = { '/var/lib/postgresql/data': 'rw', '/var/run/postgresql': 'rw' };
  delete value[0].HostConfig.Tmpfs[missing];
  assert.throws(() => assertOwnedContainer(value, owner, ticket), /isolated owned postgres container required/);
});
test('refuses unset ownership and ticket pins', () => {
  assert.throws(() => assertOwnedContainer(owned(), undefined, ticket));
  assert.throws(() => assertOwnedContainer(owned(), owner, undefined));
  assert.throws(() => assertOwnedContainer(owned(), owner, 'SQ-2170'));
});
test('refuses missing and multiple inspect results', () => {
  for (const value of [null, [], [...owned(), ...owned()]]) assert.throws(() => assertOwnedContainer(value, owner, ticket));
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
  const env = { ROUND8_PSQL_TRANSPORT: 'docker-exec', ROUND8_OWNED_TICKET: ticket, ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_CONTAINER: 'a'.repeat(64),
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
  assert.equal(main({ ROUND8_PSQL_TRANSPORT: 'docker-exec', ROUND8_OWNED_TICKET: ticket, ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_CONTAINER: 'a'.repeat(64) },
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
  assert.throws(() => main({ ROUND8_PSQL_TRANSPORT: 'docker-exec', ROUND8_OWNED_TICKET: ticket, ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_CONTAINER: 'a'.repeat(64) },
    ['node', 'helper', 'supabase/tests/entry.sql'], run), /snapshot mismatch/);
});
test('deleted-block controls remove only their named native block', () => {
  const reader = 'prefix\n   SELECT 1 FROM bindings b JOIN fulfilments f ON f.id=b.fulfilment_id\n bindings body\n  ) AND NOT EXISTS(\n   SELECT 1 FROM receipts v LEFT JOIN events e ON e.id=v.event_id\n receipts body\n  ) AND NOT EXISTS(\nsuffix';
  const binding = controlSql('control/deleted-bindings.sql', () => Buffer.from(reader)).toString();
  const receipt = controlSql('control/deleted-receipts.sql', () => Buffer.from(reader)).toString();
  assert.ok(!binding.includes('bindings body') && binding.includes('receipts body'));
  assert.ok(!receipt.includes('receipts body') && receipt.includes('bindings body'));
});

const nativeReaderPath = 'supabase/migrations/00884_round8_external_package_reading.sql';
const nativeReader = readFileSync(new URL('../../migrations/00884_round8_external_package_reading.sql', import.meta.url), 'utf8');
const coverageDeletions = [
  ['n1a', ' AND r.id::text=revision_id'],
  ['n1b', " AND (c->>'unit')=ANY(b.units)"],
  ['n1c', 'mm.manifest_id=e.manifest_id AND '],
  ['n1d', `         AND b.covers_plan_issue_id IS NOT DISTINCT FROM
          (SELECT issued.plan_issue_id FROM events issued
           WHERE issued.fulfilment_id=e.fulfilment_id AND issued.event_kind='package_issued'
            AND issued.event_seq<e.event_seq AND f.kind='gc_cabinetry'
           ORDER BY issued.event_seq DESC LIMIT 1)
`],
  ['n1e', ' AND b.fulfilment_id=e.fulfilment_id'],
  ['n1f', ' AND issued.event_seq<e.event_seq'],
  ['n1g', 'issued.fulfilment_id=e.fulfilment_id AND '],
  ['n1h', " AND f.kind='gc_cabinetry'"],
  ['n1i', " AND pinned->>'id'=f.configuration_id::text"],
  ['n1j', "pinned->>'kind'='product_configuration' AND "],
];
for (const [name, needle] of coverageDeletions) {
  const file = 'control/' + name + '.sql';
  const expected = Buffer.from(nativeReader.replace(needle, ''));
  test(name + ' removes exactly its single native conjunct and rejects source drift', () => {
    const read = path => { assert.equal(path, nativeReaderPath); return Buffer.from(nativeReader); };
    assert.equal(nativeReader.split(needle).length, 2);
    assert.deepEqual(controlSql(file, read), expected);
    for (const source of [nativeReader.replace(needle, ''), nativeReader + needle]) {
      assert.throws(() => controlSql(file, () => Buffer.from(source)), /conjunct missing or ambiguous/);
    }
  });
  test(name + ' verifies control bytes and refuses mutable overlay drift', () => {
    const read = path => Buffer.from(path === file ? expected : '\\i :external_reading_control\n');
    const control = '/tmp/round8-input/' + file;
    assert.deepEqual(verifySqlInputs('supabase/tests/entry.sql', control, read,
      path => read(path.slice('/tmp/round8-input/'.length))), ['supabase/tests/entry.sql', file]);
    assert.throws(() => verifySqlInputs('supabase/tests/entry.sql', control, read,
      path => path === control ? Buffer.from('changed') : read(path.slice('/tmp/round8-input/'.length))), /mismatch/);
  });
  test(name + ' executes only a read-only hashed overlay derived from the pinned commit', () => {
    const snapshot = new Map();
    let executed = false;
    const entry = Buffer.from('\\i :external_reading_control\n');
    const run = (binary, args, options) => {
      const ok = stdout => ({ status: 0, stdout: Buffer.from(stdout ?? '') });
      if (binary === 'git') {
        if (args[0] === 'rev-parse') return ok('b'.repeat(40));
        assert.ok(args[1].startsWith('b'.repeat(40) + ':'));
        return ok(args[1].endsWith(':supabase/tests/entry.sql') ? entry : nativeReader);
      }
      assert.equal(binary, 'docker');
      if (args[0] === 'inspect') return ok(JSON.stringify(owned()));
      if (args.includes('install')) {
        assert.equal(args[args.indexOf('-m') + 1], '0444');
        snapshot.set(args.at(-1), options.input);
      } else if (args.includes('cat')) {
        const path = args.at(-1);
        return ok(path.startsWith('/tmp/round8-input/') ? (path.endsWith(file) ? expected : entry) : snapshot.get(path));
      } else if (args.includes('psql')) {
        const variable = args.find(arg => arg.startsWith('external_reading_control='));
        const overlay = variable.slice('external_reading_control='.length);
        assert.match(overlay, /^\/tmp\/round8-verified-[0-9a-f-]+\/control\/n1[a-j]\.sql$/);
        assert.deepEqual(snapshot.get(overlay), expected);
        executed = true;
      } else if (args.includes('chmod')) assert.deepEqual(args.slice(3, 5), ['-R', 'a-w']);
      else assert.ok(args.includes('mkdir'));
      return ok();
    };
    const env = { ROUND8_PSQL_TRANSPORT: 'docker-exec', ROUND8_OWNED_TICKET: ticket,
      ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_CONTAINER: 'a'.repeat(64), ROUND8_NEGATIVE_CONTROL: '1',
      ROUND8_EXTERNAL_READING_CONTROL: '/tmp/round8-input/' + file };
    assert.throws(() => main({ ...env, ROUND8_NEGATIVE_CONTROL: undefined },
      ['node', 'helper', 'supabase/tests/entry.sql'], () => assert.fail('must not spawn')), /negative-control/);
    assert.equal(main(env, ['node', 'helper', 'supabase/tests/entry.sql'], run), 0);
    assert.ok(executed);
  });
}
