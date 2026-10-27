import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { assertOwnedContainer, verifySqlInputs, controlSql, main, defaultDbUrl, round8DbUrl, round8OwnerTicket, round8CloneDb,
  round8LocalApiUrl } from './owned_psql.mjs';
import { assertOutsideRepo, assertSourceStack, create, idempotentRoles, image as seedImage, seed, sourceProject, startCommand,
  untoleratedErrors } from './owned_seed.mjs';

const owner = 'sq2173-test-owner';
const ticket = 'SQ-2173';
const owned = () => [{ Name: '/round8-reader-test',
  Image: 'sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426',
  Config: { Image: 'public.ecr.aws/supabase/postgres:17.6.1.063', Env: ['PGDATA=/var/lib/postgresql/data'],
    Labels: { 'sidequest.ticket': ticket, 'sidequest.owner': owner } },
  Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }, { Type: 'tmpfs', Destination: '/var/run/postgresql' }],
  HostConfig: { NetworkMode: 'none', PortBindings: {}, ReadonlyRootfs: true, IpcMode: 'private', PidMode: '',
    Privileged: false, CapAdd: null, SecurityOpt: ['no-new-privileges:true'] }, NetworkSettings: { Ports: {} } }];
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
  ['missing security options', c => { delete c.HostConfig.SecurityOpt; }],
  ['disabled no-new-privileges', c => { c.HostConfig.SecurityOpt = ['no-new-privileges:false']; }],
  ['unconfined seccomp equals', c => { c.HostConfig.SecurityOpt = ['no-new-privileges:true', 'seccomp=unconfined']; }],
  ['unconfined seccomp colon', c => { c.HostConfig.SecurityOpt = ['no-new-privileges:true', 'seccomp:unconfined']; }],
  ['unconfined apparmor equals', c => { c.HostConfig.SecurityOpt = ['no-new-privileges:true', 'apparmor=unconfined']; }],
  ['unconfined apparmor colon', c => { c.HostConfig.SecurityOpt = ['no-new-privileges:true', 'apparmor:unconfined']; }],
  ['disabled label equals', c => { c.HostConfig.SecurityOpt = ['no-new-privileges:true', 'label=disable']; }],
  ['disabled label colon', c => { c.HostConfig.SecurityOpt = ['no-new-privileges:true', 'label:disable']; }],
  ['contradicting no-new-privileges', c => { c.HostConfig.SecurityOpt = ['no-new-privileges:true', 'no-new-privileges:false']; }],
  ['bare no-new-privileges', c => { c.HostConfig.SecurityOpt = ['no-new-privileges']; }],
  ['privileged container', c => { c.HostConfig.Privileged = true; }],
  ['added capabilities', c => { c.HostConfig.CapAdd = ['SYS_ADMIN']; }],
  ['wrong image id', c => { c.Image = 'sha256:' + '0'.repeat(64); }],
  ['wrong owner', c => { c.Config.Labels['sidequest.owner'] = 'other'; }],
  ['wrong ticket', c => { c.Config.Labels['sidequest.ticket'] = 'SQ-2110'; }],
]) test('refuses ' + name, () => { const value = owned(); change(value[0]); assert.throws(() => assertOwnedContainer(value, owner, ticket)); });
test('accepts the Docker equals spelling for no-new-privileges', () => {
  const value = owned();
  value[0].HostConfig.SecurityOpt = ['no-new-privileges=true'];
  assert.doesNotThrow(() => assertOwnedContainer(value, owner, ticket));
});
for (const option of ['no-new-privileges:true-extra', 'no-new-privileges', 'no-new-privileges:yes']) {
  test('refuses non-exact no-new-privileges option ' + option, () => {
    const value = owned();
    value[0].HostConfig.SecurityOpt = [option];
    assert.throws(() => assertOwnedContainer(value, owner, ticket));
  });
}
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

// SQ-2186 transport parameters: each env var is proved unset, wrong and right.
test('ROUND8_DB_URL: unset keeps the exact shared-stack default', () => {
  assert.equal(round8DbUrl({}), 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  assert.equal(round8DbUrl({}), defaultDbUrl);
});
for (const value of ['postgresql://postgres:postgres@127.0.0.1:57322/postgres', 'postgres://postgres:postgres@localhost:57322/postgres',
  'postgresql://postgres:postgres@127.0.0.1/postgres']) {
  test('ROUND8_DB_URL accepts loopback ' + value, () => assert.equal(round8DbUrl({ ROUND8_DB_URL: value }), value));
}
for (const value of ['', 'host=127.0.0.1 port=57322', 'http://127.0.0.1:57322/postgres',
  'postgresql://postgres:postgres@db.bkvcixdmuyejfzcijpdg.supabase.co:5432/postgres', 'postgresql://postgres@10.0.0.5:5432/postgres',
  'postgresql://postgres@[::1]:57322/postgres', 'postgresql://127.0.0.1:54322@evil.example/postgres',
  'postgresql://postgres@127.0.0.1:57322/postgres?host=evil.example', 'postgresql://postgres@127.0.0.1:57322/postgres?hostaddr=10.0.0.5',
  'postgresql://postgres@127.0.0.1:57322/postgres?service=remote', 'postgresql://postgres@127.0.0.1:57322,evil.example:5432/postgres',
  'postgresql://postgres@evil.example,127.0.0.1:57322/postgres', 'postgresql:///postgres', 'postgresql://postgres@127.0.0.1:57322/a%3Dhost',
  'postgresql://postgres@127.0.0.1:57322/postgres#x']) {
  test('ROUND8_DB_URL refuses ' + JSON.stringify(value), () => assert.throws(() => round8DbUrl({ ROUND8_DB_URL: value }), /127\.0\.0\.1 or localhost/));
}
test('ROUND8_OWNER_TICKET: unset and malformed refuse, an exact ticket passes', () => {
  for (const value of [undefined, '', 'sq-2110', 'SQ-2110 ', 'SQ-0', 'SQ-2110\n']) {
    assert.throws(() => round8OwnerTicket({ ROUND8_OWNER_TICKET: value }), /ROUND8_OWNER_TICKET/);
  }
  assert.equal(round8OwnerTicket({ ROUND8_OWNER_TICKET: 'SQ-2186' }), 'SQ-2186');
});
test('ROUND8_CLONE_DB: unset defaults, connection strings and odd names refuse', () => {
  assert.equal(round8CloneDb({}), 'round8_clone');
  assert.equal(round8CloneDb({ ROUND8_CLONE_DB: 'round8_clone_sq2186' }), 'round8_clone_sq2186');
  for (const value of ['', 'host=evil dbname=x', 'postgresql://evil/x', 'Round8', 'round8 clone', '1db', 'a'.repeat(64)]) {
    assert.throws(() => round8CloneDb({ ROUND8_CLONE_DB: value }), /ROUND8_CLONE_DB/);
  }
});
test('API_URL local check accepts only an http 127.0.0.1 origin', () => {
  for (const value of ['http://127.0.0.1:54321', 'http://127.0.0.1:57321/']) assert.equal(round8LocalApiUrl(value), true, value);
  for (const value of [undefined, '', 'http://127.0.0.1:54321@evil.example', 'https://bkvcixdmuyejfzcijpdg.supabase.co',
    'http://localhost:54321', 'http://127.0.0.1', 'https://127.0.0.1:54321', 'http://127.0.0.1:54321/rest/v1', 'http://127.0.0.1:54321?x=1']) {
    assert.equal(round8LocalApiUrl(value), false, String(value));
  }
});
const cloneRun = calls => (binary, args) => {
  calls.push(args);
  const ok = stdout => ({ status: 0, stdout: Buffer.from(stdout ?? '') });
  if (binary === 'git') return ok(args[0] === 'rev-parse' ? 'b'.repeat(40) : 'SELECT 1;\n');
  if (args[0] === 'inspect') return ok(JSON.stringify(owned()));
  return ok(args.includes('cat') ? 'SELECT 1;\n' : '');
};
test('ROUND8_CLONE_DB selects the owned psql database; a wrong value never spawns', () => {
  const env = { ROUND8_PSQL_TRANSPORT: 'docker-exec', ROUND8_OWNED_TICKET: ticket, ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_CONTAINER: 'a'.repeat(64) };
  for (const [clone, expected] of [[undefined, 'round8_clone'], ['round8_clone_sq2186', 'round8_clone_sq2186']]) {
    const calls = [];
    assert.equal(main({ ...env, ROUND8_CLONE_DB: clone }, ['node', 'helper', 'supabase/tests/entry.sql'], cloneRun(calls)), 0);
    const psql = calls.find(args => args.includes('psql'));
    assert.equal(psql[psql.indexOf('-d') + 1], expected);
  }
  assert.throws(() => main({ ...env, ROUND8_CLONE_DB: 'host=evil' }, ['node', 'helper', 'supabase/tests/entry.sql'],
    () => assert.fail('must not spawn')), /ROUND8_CLONE_DB/);
});

// owned_seed.mjs: pure guards (no docker).
test('seed source project refuses unset and the shared stack', () => {
  for (const value of [undefined, '', 'supabase', '../x', 'Patina']) assert.throws(() => sourceProject({ ROUND8_SEED_SOURCE_PROJECT: value }));
  assert.equal(sourceProject({ ROUND8_SEED_SOURCE_PROJECT: 'patina-r8-harness' }), 'patina-r8-harness');
});
const sourceInspect = () => [{ Name: '/supabase_db_patina-r8-harness', Image: seedImage.id, State: { Running: true },
  Config: { Image: seedImage.tag, Labels: { 'com.supabase.cli.project': 'patina-r8-harness' } } }];
test('seed source must be the named running CLI database on the pinned image', () => {
  assert.doesNotThrow(() => assertSourceStack(sourceInspect(), 'patina-r8-harness'));
  for (const change of [c => { c.Name = '/supabase_db_supabase'; }, c => { c.Config.Labels['com.supabase.cli.project'] = 'supabase'; },
    c => { c.Config.Image = 'postgres:17'; }, c => { c.Image = 'sha256:' + '0'.repeat(64); }, c => { c.State.Running = false; }]) {
    const value = sourceInspect(); change(value[0]);
    assert.throws(() => assertSourceStack(value, 'patina-r8-harness'), /isolated CLI source stack/);
  }
  assert.throws(() => assertSourceStack([...sourceInspect(), ...sourceInspect()], 'patina-r8-harness'));
});
test('roles dump becomes idempotent only for plain CREATE ROLE lines', () => {
  const out = idempotentRoles('CREATE ROLE anon;\nALTER ROLE anon WITH NOLOGIN;\nGRANT anon TO postgres;\n');
  assert.match(out, /^DO \$role\$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END \$role\$;$/m);
  assert.match(out, /^ALTER ROLE anon WITH NOLOGIN;$/m);
  assert.throws(() => idempotentRoles('CREATE ROLE "Odd";\n'), /unsupported roles dump/);
  assert.throws(() => idempotentRoles('ALTER ROLE anon WITH NOLOGIN;\n'), /unsupported roles dump/);
});
test('dump directory must sit outside the repository', () => {
  const repo = new URL('../../..', import.meta.url).pathname;
  assert.throws(() => assertOutsideRepo(new URL('.', import.meta.url).pathname, repo), /outside the repository/);
  assert.doesNotThrow(() => assertOutsideRepo(tmpdir(), repo));
});
test('only the trigger-made graphql ACL failure is tolerated during restore', () => {
  const stderr = 'psql:<stdin>:7: ERROR:  function graphql_public.graphql(text, text, jsonb, jsonb) does not exist\n'
    + 'psql:<stdin>:9: ERROR:  relation "public.projects" does not exist\n';
  assert.deepEqual(untoleratedErrors(stderr).untolerated, ['relation "public.projects" does not exist']);
  assert.deepEqual(untoleratedErrors(stderr.split('\n')[0]).untolerated, []);
});
test('owned start command restores the native tree before postgres and pins cron to the clone', () => {
  const command = startCommand('QUJD', 'round8_clone');
  assert.ok(command.indexOf('tar -xzf - --strip-components=1 -C /etc/postgresql-custom') < command.indexOf('exec docker-entrypoint.sh'));
  assert.match(command, / -c cron\.launch_active_jobs=off -c cron\.database_name=round8_clone /);
});
test('seed and create refuse before any docker call without their owned inputs', () => {
  const base = { ROUND8_SEED_SOURCE_PROJECT: 'patina-r8-harness', ROUND8_OWNED_CONTAINER: 'a'.repeat(64),
    ROUND8_OWNED_OWNER: owner, ROUND8_OWNED_TICKET: ticket };
  const never = () => assert.fail('must not spawn');
  for (const drop of ['ROUND8_SEED_SOURCE_PROJECT', 'ROUND8_OWNED_CONTAINER', 'ROUND8_OWNED_OWNER', 'ROUND8_OWNED_TICKET']) {
    assert.throws(() => seed({ ...base, [drop]: undefined }, never), /ROUND8_/);
  }
  assert.throws(() => seed({ ...base, ROUND8_CLONE_DB: 'host=evil' }, never), /ROUND8_CLONE_DB/);
  assert.throws(() => create({ ROUND8_OWNED_OWNER: owner }, never), /ROUND8_OWNED_TICKET/);
});
