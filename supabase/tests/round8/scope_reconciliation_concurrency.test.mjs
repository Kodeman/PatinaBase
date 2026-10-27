// N(scope_reconciliation): run ONLY in an orchestrator-owned committed LOCAL DB window.
// Required: SCOPE_RECONCILIATION_DB_WINDOW=owned, committed 00868/00869/00870,
// scope_editions=true, outbound workers stopped. No migration/grant is installed.
// Paused executions flip the setting only within their transaction, restoring
// true before COMMIT; no committed capability setting is changed.
// Transport (shared with SQ-2170): ROUND8_PSQL_TRANSPORT=docker-exec,
// ROUND8_OWNED_CONTAINER=<64-hex id> and ROUND8_OWNED_OWNER=<provisioning claim holder>
// are required; there is no fallback to the shared local Supabase stack. Each session is
// one `docker exec -i` psql child that reads a private 0600 pgpass file at
// /tmp/round8-owned.pgpass inside the container and connects to the ROUND8_CLONE_DB
// database (default round8_clone; see owned_seed.mjs). ROUND8_OWNER_TICKET is required and
// must equal the container's sidequest.ticket label exactly; it has no default.
// Run: node --test --test-concurrency=1 supabase/tests/round8/scope_reconciliation_concurrency.test.mjs
// Negative control: add SCOPE_RECONCILIATION_NEGATIVE_CONTROL=inverted. Only the
// new retry schedule calls a session-local scratch function; public SQL is untouched.
// It must assertion-fail with 40P01/55P03, never count a setup failure as the control:
// a missing copy, a missing project-tuple wait, or any session failure that is not a
// 40P01/55P03 raised inside its own contending call fails with INVALID-CONTROL instead.
// Harness self-tests (no docker, no database) run alone with --test-name-pattern='^harness:'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { assertLocalDocker, assertOwnedContainer, round8CloneDb, round8OwnerTicket } from './owned_psql.mjs';

const container = process.env.ROUND8_OWNED_CONTAINER ?? '';
const pinnedImage = { tag: 'public.ecr.aws/supabase/postgres:17.6.1.063',
  id: 'sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426' };
const socketDir = '/var/run/postgresql';
// W1 predicate (SQ-2170 R1) over one `docker inspect` result; returns every failed check.
// HostConfig.Tmpfs is the only accepted storage: a bind, a named or anonymous volume,
// VolumesFrom or any non-tmpfs mount could hand the harness a foreign socket or data dir.
function ownershipFailures(inspected, { id, owner, ticket }) {
  const owned = inspected.length === 1 ? inspected[0] : undefined;
  const host = owned?.HostConfig ?? {};
  const tmpfs = Object.keys(host.Tmpfs ?? {});
  const pgdata = (owned?.Config?.Env ?? []).find(entry => entry.startsWith('PGDATA='))?.slice('PGDATA='.length);
  const shared = mode => mode === 'host' || String(mode ?? '').startsWith('container:');
  const checks = {
    exactContainer: owned?.Id === id,
    networkNone: host.NetworkMode === 'none',
    noPortBindings: Object.keys(host.PortBindings ?? {}).length === 0
      && Object.keys(owned?.NetworkSettings?.Ports ?? {}).length === 0,
    readonlyRootfs: host.ReadonlyRootfs === true,
    notSupabaseStack: typeof owned?.Name === 'string' && !owned.Name.replace(/^\//, '').startsWith('supabase_'),
    pinnedImageTag: owned?.Config?.Image === pinnedImage.tag,
    pinnedImageId: owned?.Image === pinnedImage.id,
    onlyTmpfsMounts: [...(owned?.Mounts ?? []), ...(host.Mounts ?? [])].every(mount => mount?.Type === 'tmpfs'),
    noBinds: (host.Binds ?? []).length === 0,
    noVolumes: (host.VolumesFrom ?? []).length === 0 && Object.keys(owned?.Config?.Volumes ?? {}).length === 0,
    tmpfsSocketDir: tmpfs.includes(socketDir),
    tmpfsPgdata: pgdata?.startsWith('/') === true && tmpfs.includes(pgdata),
    privateIpc: !shared(host.IpcMode),
    privatePid: !shared(host.PidMode),
    ticketLabel: !!ticket && owned?.Config?.Labels?.['sidequest.ticket'] === ticket,
    ownerLabel: !!owner && owned?.Config?.Labels?.['sidequest.owner'] === owner,
  };
  const failures = Object.keys(checks).filter(check => !checks[check]);
  if (failures.length) return failures;
  try { assertOwnedContainer(inspected, owner, ticket); }
  catch { return ['ownedContainer']; }
  return [];
}
// Fail closed before any child is spawned: local daemon only, then the isolated owned container.
function verifyOwnedTransport() {
  assert.equal(process.env.ROUND8_PSQL_TRANSPORT, 'docker-exec', 'ROUND8_PSQL_TRANSPORT=docker-exec is required');
  assert.match(container, /^[0-9a-f]{64}$/, 'ROUND8_OWNED_CONTAINER must be an exact 64-hex container id');
  assert.ok(process.env.ROUND8_OWNED_OWNER, 'ROUND8_OWNED_OWNER must name the claim holder that provisioned the container');
  const ticket = round8OwnerTicket();
  round8CloneDb();
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
  assertLocalDocker(process.env, (_binary, args) => docker(args));
  assert.deepEqual(ownershipFailures(JSON.parse(docker(['inspect', '--type', 'container', container])),
    { id: container, owner: process.env.ROUND8_OWNED_OWNER, ticket }), [], 'isolated owned postgres container required');
}
// Every backend carries a run-unique application_name so cleanup can prove it ended.
const runTag = 'scope_recon_' + randomUUID().slice(0, 8);
// The docker CLI does not forward host env, so the session settings travel with -e.
const psqlArgv = applicationName => ['exec', '-i', '-u', 'postgres', '-e', 'PGPASSFILE=/tmp/round8-owned.pgpass',
  '-e', 'PGCONNECT_TIMEOUT=3', '-e', 'PGOPTIONS=-c statement_timeout=15000 -c lock_timeout=10000',
  '-e', 'PGAPPNAME=' + applicationName,
  container, 'psql', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', round8CloneDb(),
  '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const actor = 'f87b0000-0000-4000-8000-000000000001';
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const body = readFileSync(new URL('./scope_reconciliation_body.psql', import.meta.url), 'utf8').replaceAll('f870', 'f87b');
function section(name) {
  const start = '-- BEGIN shared ' + name + '\n';
  const end = '-- END shared ' + name;
  assert.equal(body.split(start).length, 2, 'one ' + name + ' start marker');
  assert.equal(body.split(end).length, 2, 'one ' + name + ' end marker');
  return body.split(start)[1].split(end)[0];
}

function invertedReconciliation(definition) {
  const name = 'CREATE OR REPLACE FUNCTION public.reconcile_scope_edition(';
  const projectLock = 'PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;';
  const proposalLock = `PERFORM 1 FROM public.proposals p WHERE p.id IN (
   SELECT d.proposal_id FROM public.project_commercial_documents d WHERE d.id=ANY(documents))
   ORDER BY p.id FOR UPDATE;`;
  const documentSet = `SELECT array_agg((d->>'id')::uuid ORDER BY d->>'id') INTO documents
  FROM jsonb_array_elements(before_lock->'documents') d;`;
  for (const anchor of [name, projectLock, proposalLock, documentSet]) {
    assert.equal(definition.split(anchor).length, 2, 'negative-control source anchor must be unique: ' + anchor);
  }
  assert.ok(definition.indexOf(projectLock) < definition.indexOf(proposalLock),
    'negative-control source must start with canonical project→proposal locks');
  // Copy the installed native body, changing only its name and lock placement.
  // The receipt/snapshot checks remain; this schedule always uses a fresh request.
  // pg_get_functiondef has no terminator; without one psql only buffers the CREATE.
  return definition.replace(name, 'CREATE OR REPLACE FUNCTION pg_temp.scope_reconciliation_inverted(')
    .replace(proposalLock, '')
    .replace(projectLock, `${documentSet}\n ${proposalLock}\n ${projectLock}`) + ';';
}

const within = (promise, ms) => new Promise(resolve => {
  const timer = setTimeout(resolve, ms, false);
  promise.then(() => { clearTimeout(timer); resolve(true); });
});

// Each process owns one backend. ON_ERROR_STOP makes an expected SQL refusal
// terminal for that client; finally closes every process (bounded) before cleanup.
// A session is terminal after its exit, a spawn or stdin error, or a command
// deadline, and then refuses every command. An exit rejects the pending command
// only on 'close', after stdout and stderr have drained, so classification reads
// psql's complete stderr.
class Session {
  constructor(name, { command = 'docker', args = psqlArgv, deadlineMs = 20000 } = {}) {
    this.name = `${runTag}_${name}`;
    this.buffer = '';
    this.errors = '';
    this.pending = null;
    this.ended = null;
    this.exit = null;
    this.deadlineMs = deadlineMs;
    this.child = spawn(command, args(this.name), { stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    this.closed = new Promise(resolve => {
      this.child.once('error', error => {
        this.fail('transport', `child error ${error.code ?? error.message}`);
        if (!(this.child.pid > 0)) resolve();
      });
      this.child.once('exit', (code, signal) => { this.exit = { code, signal }; this.ended ??= `exit=${code} signal=${signal}`; });
      this.child.once('close', (code, signal) => {
        this.exit ??= { code, signal };
        this.fail('exit', `exit=${this.exit.code} signal=${this.exit.signal}`);
        resolve();
      });
    });
    this.child.stdin.on('error', error => { this.fail('transport', `stdin ${error.code ?? error.message}`); this.kill(); });
    this.child.stderr.on('data', data => { this.errors += data; });
    this.child.stdout.on('data', data => {
      this.buffer += data;
      if (!this.pending) return;
      const at = this.buffer.indexOf(this.pending.marker);
      if (at < 0) return;
      const result = this.buffer.slice(0, at).trim();
      this.buffer = this.buffer.slice(at + this.pending.marker.length).trimStart();
      const pending = this.pending;
      this.pending = null;
      pending.resolve(result);
    });
  }
  failure(kind, cause) {
    return Object.assign(new Error(`psql ${kind} ${cause}: ${this.errors}`),
      { kind, exitCode: this.exit?.code ?? null, signal: this.exit?.signal ?? null, stderr: this.errors });
  }
  fail(kind, cause) {
    this.ended ??= cause;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(this.failure(kind, cause));
  }
  async query(sql) {
    if (this.ended) throw this.failure('transport', `session terminated (${this.ended}); command not sent`);
    assert.equal(this.pending, null, 'one command per session');
    const marker = `scope_done_${randomUUID().replaceAll('-', '')}`;
    const result = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    // The deadline rejects the command itself; the kill only reaps the process group.
    const timer = setTimeout(() => { this.fail('timeout', `command exceeded ${this.deadlineMs} ms`); this.kill(); }, this.deadlineMs);
    try {
      this.child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      return await result;
    } finally { clearTimeout(timer); }
  }
  // Never throws, so a failed kill cannot skip cleanup; close() reports it.
  kill() {
    if (!(this.child.pid > 0) || this.child.exitCode !== null || this.child.signalCode) return;
    try { process.kill(-this.child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') this.killError ??= error; }
  }
  // Bounded: EOF, SIGKILL after graceMs, then stop waiting on pipes that never close.
  // Resolves null once closed, otherwise a report; either way the caller continues.
  async close(graceMs = 1000) {
    this.child.stdin.end();
    if (await within(this.closed, graceMs)) return null;
    this.kill();
    if (await within(this.closed, 5000)) return null;
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    return `${this.name} did not close after SIGKILL${this.killError ? ' (kill ' + this.killError.code + ')' : ''}`;
  }
}

// Classify one session's outcome at a contention step on its own. A lock failure is
// exactly one SQL error (psql ON_ERROR_STOP exit 3, observed on 'close' with drained
// stderr) with 40P01/55P03 raised inside the session's own contending call; a timeout,
// a spawn/stdin transport loss or a command refused by a terminated session never is.
function failureOf(session, step, outcome, call) {
  const error = outcome.error;
  if (!error) return null;
  const states = [...String(error.stderr ?? '').matchAll(/^ERROR:\s+([0-9A-Z]{5}):/gm)].map(match => match[1]);
  const kind = error.kind === 'timeout' ? 'timeout' : error.kind !== 'exit' || error.exitCode !== 3 || error.signal ? 'transport'
    : states.length === 1 ? 'sql' : 'unparsed';
  const sqlstate = kind === 'sql' ? states[0] : null;
  const lock = ['40P01', '55P03'].includes(sqlstate) && call.test(error.stderr);
  return { session, step, kind, sqlstate, lock, detail: error.message };
}
const report = failures => failures.map(f => `${f.session} ${f.step}: ${f.kind}${f.sqlstate ? ' ' + f.sqlstate : ''}`
  + `${f.lock ? ' (lock failure inside the contending call)' : ''}\n${f.detail}`).join('\n');

// Killing the host docker CLI ends neither its in-container psql nor its backend.
// pg_stat_activity is snapshotted per transaction, so each poll clears it.
const backendsGone = names => `DO $gone$
DECLARE owned_names text[]:=ARRAY[${names.map(literal).join(',')}]::text[];
 deadline timestamptz:=clock_timestamp()+interval '10s'; signalled integer:=0; alive text;
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT string_agg(pid||':'||application_name||':'||coalesce(state,'?'),', ' ORDER BY pid) INTO alive
   FROM pg_stat_activity WHERE application_name=ANY(owned_names) AND pid<>pg_backend_pid();
  EXIT WHEN alive IS NULL;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'CLEANUP REFUSED: owned session backends still alive: %',alive; END IF;
  IF signalled=0 AND clock_timestamp()>deadline-interval '8s' THEN
   SELECT count(*) FILTER(WHERE pg_terminate_backend(pid)) INTO signalled
    FROM pg_stat_activity WHERE application_name=ANY(owned_names) AND pid<>pg_backend_pid();
  END IF;
  PERFORM pg_sleep(0.05);
 END LOOP;
 PERFORM set_config('scope_reconciliation.terminated',signalled::text,false);
END $gone$;
SELECT current_setting('scope_reconciliation.terminated');`;

// Follow FK descendants of ONLY the owned fictional identities/studios. Collect
// fresh ctids before deleting, with all test writers closed. This also covers
// native activation children that lack a direct project_id/proposal_id column.
const cleanup = `
BEGIN;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE scope_owned_rows(rel oid, row_id tid, PRIMARY KEY(rel,row_id));
INSERT INTO scope_owned_rows SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f87b0000-%';
INSERT INTO scope_owned_rows SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f87b1000-%';
DO $cleanup$
DECLARE fk record; predicate text; added integer; total integer; pass integer:=0; owned record;
BEGIN
 LOOP
  total:=0; pass:=pass+1;
  IF pass>30 THEN RAISE EXCEPTION 'fixture cleanup FK closure exceeded bound'; END IF;
  FOR fk IN SELECT c.* FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE c.contype='f' AND n.nspname IN ('public','auth') LOOP
   SELECT string_agg(format('child.%I=parent.%I',a.attname,b.attname),' AND ' ORDER BY keys.ord)
    INTO predicate FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(child_key,parent_key,ord)
    JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=keys.child_key
    JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=keys.parent_key;
   EXECUTE format('INSERT INTO scope_owned_rows SELECT %s,child.ctid FROM %s child JOIN %s parent ON %s
    JOIN scope_owned_rows owned ON owned.rel=%s AND owned.row_id=parent.ctid ON CONFLICT DO NOTHING',
    fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid);
   GET DIAGNOSTICS added=ROW_COUNT; total:=total+added;
  END LOOP;
  EXIT WHEN total=0;
 END LOOP;
 SET LOCAL session_replication_role=replica;
 FOR owned IN SELECT DISTINCT rel FROM scope_owned_rows LOOP
  EXECUTE format('DELETE FROM %s target USING scope_owned_rows owned WHERE owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel);
 END LOOP;
 SET LOCAL session_replication_role=origin;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87b0000-%')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f87b1000-%') THEN
  RAISE EXCEPTION 'fixture cleanup left roots';
 END IF;
 FOR owned IN SELECT DISTINCT rel FROM scope_owned_rows LOOP
  EXECUTE format('SELECT count(*) FROM %s target JOIN scope_owned_rows owned ON owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel) INTO added;
  IF added<>0 THEN RAISE EXCEPTION 'fixture cleanup left rows in %',owned.rel::regclass; END IF;
 END LOOP;
END $cleanup$;
COMMIT;`;

test('reconciliation follows execution locks and refuses moved sets with atomic receipts', { timeout: 180000 }, async () => {
  verifyOwnedTransport();
  assert.equal(process.env.SCOPE_RECONCILIATION_DB_WINDOW, 'owned', 'orchestrator-owned committed DB window required');
  const negativeControl = process.env.SCOPE_RECONCILIATION_NEGATIVE_CONTROL;
  assert.ok(negativeControl === undefined || negativeControl === 'inverted', 'only the explicit inverted negative control is supported');
  const sessions = new Set();
  const names = [];
  const open = name => { const s = new Session(name); sessions.add(s); names.push(s.name); return s; };
  const a = open('a');
  let fixtureOwned = false;
  let failure;
  try {
    assert.equal(await a.query(`SELECT current_user='postgres' AND
      to_regprocedure('public.reconcile_scope_edition(uuid,uuid,uuid)') IS NOT NULL AND
      (SELECT enabled FROM public.server_capabilities WHERE key='scope_editions') AND
      NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87b%') AND
      NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f87b%');`),
    't', 'committed staged migrations, enabled capability, empty owned fixture prefix required');
    fixtureOwned = true;
    // Prepare native signed addenda but leave executions to the two sessions.
    const preparation = section('reconciliation scenario').split("UPDATE public.server_capabilities SET enabled=false")[0]
      .replace("amendment(4,'design')", "amendment(4,'installation')");
    await a.query(`BEGIN; ${section('assertion helpers')} ${section('fixture')}
      ${section('native helpers')} ${section('reconciliation helpers')} ${preparation} COMMIT;`);
    await a.query(`SET request.jwt.claim.sub=${literal(actor)};`);
    const job = await a.query("SELECT pg_temp.fixture('job');");
    const proposals = {};
    const documents = {};
    for (const n of [2, 3, 4]) {
      proposals[n] = await a.query(`SELECT pg_temp.fixture('proposal${n}');`);
      documents[n] = await a.query(`SELECT pg_temp.fixture('doc${n}');`);
    }
    const pausedExecution = n => `UPDATE public.server_capabilities SET enabled=false WHERE key='scope_editions';
      SELECT public.countersign_design_services_agreement(${literal(proposals[n])},'Execution Designer');
      UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';`;
    const reconcile = (target, request) => `SELECT public.reconcile_scope_edition(${literal(job)},${literal(target)},${literal(request)});`;
    const b = open('b');
    await b.query(`SET request.jwt.claim.sub=${literal(actor)};`);
    // t1 precedes t2, but t2 executes first. No timer orders the transactions.
    const t1 = await a.query('BEGIN; SELECT extract(epoch FROM now());');
    const t2 = await b.query('BEGIN; SELECT extract(epoch FROM now());');
    assert.ok(Number(t1) < Number(t2), 'transaction starts are strictly ordered');
    await b.query(pausedExecution(3) + ' COMMIT;');
    await a.query(pausedExecution(2) + ' COMMIT;');
    assert.equal(await a.query(`SELECT
      (SELECT array_agg(commercial_document_id ORDER BY execution_seq) FILTER(WHERE execution_seq>1)=
        ARRAY[${literal(documents[3])}::uuid,${literal(documents[2])}::uuid]
        FROM public.project_commercial_execution_order WHERE project_id=${literal(job)}) AND
      (SELECT stale_commercial_document_id=${literal(documents[3])}::uuid AND status='stale'
        FROM public.project_scope_editions WHERE project_id=${literal(job)}) AND
      (SELECT a.signed_at < b.signed_at FROM public.commercial_document_signatures a,
        public.commercial_document_signatures b WHERE a.proposal_id=${literal(proposals[2])}
        AND b.proposal_id=${literal(proposals[3])} AND a.party_role='studio' AND b.party_role='studio');`),
    't', 'reversed transaction starts cannot replace recorded execution order');
    await a.query(`SELECT pg_temp.expect_error(${literal(reconcile(documents[3], randomUUID()))},
      '23514','scope_reconcile_not_latest','later timestamp is not latest execution');`);
    const aPid = Number(await a.query('SELECT pg_backend_pid();'));
    const bPid = Number(await b.query('SELECT pg_backend_pid();'));
    async function waitForProjectLock(observer, waiterPid, blockerPid) {
      // A row wait is normally an ungranted transactionid lock, while the waiter's
      // heavyweight tuple lock is already granted. Bind both to this project
      // and the holder's actual transaction; an unrelated pg_blocking_pids hit is not proof.
      const wait = `SELECT tuple_lock.relation::regclass::text AS relation,
        tuple_lock.page, tuple_lock.tuple, blocked.transactionid::text AS transaction_id,
        blocked.pid AS waiter_pid, holder.pid AS blocker_pid
        FROM pg_locks tuple_lock
        JOIN pg_locks blocked ON blocked.pid=tuple_lock.pid
          AND blocked.locktype='transactionid' AND blocked.mode='ShareLock' AND NOT blocked.granted
        JOIN pg_locks holder ON holder.locktype=blocked.locktype AND holder.transactionid=blocked.transactionid
          AND holder.mode='ExclusiveLock' AND holder.granted AND holder.pid=${blockerPid}
        JOIN public.projects project ON project.id=${literal(job)}
          AND project.ctid=('(' || tuple_lock.page::text || ',' || tuple_lock.tuple::text || ')')::tid
        WHERE tuple_lock.pid=${waiterPid} AND tuple_lock.locktype='tuple'
          AND tuple_lock.relation='public.projects'::regclass
          AND tuple_lock.database=(SELECT oid FROM pg_database WHERE datname=current_database())
          AND ${blockerPid}=ANY(pg_blocking_pids(${waiterPid}))`;
      const evidence = JSON.parse(await observer.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
        WHILE NOT EXISTS(${wait}) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: contender did not wait on the owned project tuple and transaction'; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $wait$;
      SELECT row_to_json(proven_wait) FROM (${wait}) proven_wait;`));
      assert.equal(evidence.blocker_pid, blockerPid, 'project tuple wait is blocked by the project holder');
      assert.equal(evidence.waiter_pid, waiterPid, 'project tuple wait belongs to the contending session');
      console.info('project-row wait proved', evidence);
    }
    let retryReconcile = reconcile(documents[2], randomUUID());
    // PL/pgSQL CONTEXT frames name the function unqualified when its schema is on the path.
    let reconcileCall = /\breconcile_scope_edition\(/;
    if (negativeControl === 'inverted') {
      try {
        const definition = await b.query("SELECT pg_get_functiondef('public.reconcile_scope_edition(uuid,uuid,uuid)'::regprocedure);");
        await b.query(invertedReconciliation(definition));
        assert.equal(await b.query("SELECT to_regprocedure('pg_temp.scope_reconciliation_inverted(uuid,uuid,uuid)') IS NOT NULL;"), 't',
          'session B must hold the installed pg_temp.scope_reconciliation_inverted copy');
      } catch (error) {
        throw new Error('INVALID-CONTROL (setup): inverted reconciliation copy was not installed: ' + error.message, { cause: error });
      }
      retryReconcile = retryReconcile.replace('public.reconcile_scope_edition(', 'pg_temp.scope_reconciliation_inverted(');
      reconcileCall = /\.scope_reconciliation_inverted\(/;
      console.info('negative control: session-local proposal→project reconciliation copy');
    }
    const countersignCall = /\bcountersign_design_services_agreement\(/;
    // Unlike the moved-set schedule, retry an already-executed proposal IN B's
    // snapshot. Inverted reconciliation holds that proposal while waiting for
    // A's project, so A's native project→proposal retry closes the deadlock cycle.
    assert.equal(await a.query(`SELECT EXISTS(SELECT 1 FROM
      jsonb_array_elements(public._scope_reconciliation_snapshot(${literal(job)})->'documents') d
      WHERE d->>'id'=${literal(documents[2])} AND d->>'proposalId'=${literal(proposals[2])}) AND
      (SELECT commercial_state='executed' FROM public.proposals WHERE id=${literal(proposals[2])});`),
    't', 'native retry proposal is already executed and belongs to the reconciliation snapshot');
    await a.query(`BEGIN; SELECT 1 FROM public.projects WHERE id=${literal(job)} FOR UPDATE;`);
    const ordered = b.query('BEGIN; ' + retryReconcile + ' ROLLBACK;').then(value => ({ value }), error => ({ error }));
    try {
      await waitForProjectLock(a, bPid, aPid);
    } catch (error) {
      // The inverted copy still takes the project lock, only later; no wait means it never ran.
      if (negativeControl === 'inverted') throw new Error('INVALID-CONTROL (setup): inverted reconciliation never waited on the owned project tuple: ' + error.message);
      throw error;
    }
    const retried = await a.query(`SELECT public.countersign_design_services_agreement(${literal(proposals[2])},'Execution Designer'); COMMIT;`)
      .then(value => ({ value }), error => ({ error }));
    const orderedOutcome = await ordered;
    const failures = [failureOf('A', 'native countersign retry', retried, countersignCall),
      failureOf('B', 'reconciliation', orderedOutcome, reconcileCall)].filter(Boolean);
    // Under inversion, detection means every session failure is a lock failure inside its own contending call.
    if (negativeControl === 'inverted' && failures.length && !failures.every(f => f.lock)) {
      throw new Error('INVALID-CONTROL: inverted contention failed outside a 40P01/55P03 in the contending calls:\n' + report(failures));
    }
    const contention = report(failures);
    assert.equal(contention, '',
      'project→proposal contention: native executed-proposal retry and reconciliation both complete without deadlock or lock timeout');
    const retriedResult = JSON.parse(retried.value);
    assert.equal(retriedResult.newlyExecuted, false, 'contending native countersign is an execution retry, not an appended execution');
    assert.equal(retriedResult.proposalId, proposals[2], 'native retry used the proposal in reconciliation snapshot');
    assert.equal(retriedResult.projectId, job, 'native retry used the project owned by session A');
    const orderedResult = JSON.parse(orderedOutcome.value);
    assert.equal(orderedResult.commercialDocumentId, documents[2], 'contending reconciliation reaches the current executed document');
    assert.equal(orderedResult.editionIds.length, 2, 'contending reconciliation composes both recorded successors');
    // Native countersign in its natural order: no project pre-lock in its session. B holds
    // the project row as reconciliation's first statement does, then reconciles. A canonical
    // project→proposal countersign queues on that tuple holding no proposal or document lock;
    // one regressed to proposal→project would hold proposal 2 there, closing a 40P01/55P03 cycle.
    await b.query(`BEGIN; SELECT 1 FROM public.projects WHERE id=${literal(job)} FOR UPDATE;`);
    const natural = a.query(`SELECT public.countersign_design_services_agreement(${literal(proposals[2])},'Execution Designer');`)
      .then(value => ({ value }), error => ({ error }));
    await waitForProjectLock(b, aPid, bPid);
    const holding = await b.query(reconcile(documents[2], randomUUID()) + ' ROLLBACK;').then(value => ({ value }), error => ({ error }));
    const naturalOutcome = await natural;
    const naturalContention = report([failureOf('A', 'natural native countersign retry', naturalOutcome, countersignCall),
      failureOf('B', 'reconciliation holding the project', holding, reconcileCall)].filter(Boolean));
    assert.equal(naturalContention, '',
      'proposal→project countersign contention: natural native countersign retry and reconciliation both complete without deadlock or lock timeout');
    const naturalResult = JSON.parse(naturalOutcome.value);
    assert.equal(naturalResult.newlyExecuted, false, 'natural native countersign is an execution retry');
    assert.equal(naturalResult.proposalId, proposals[2], 'natural native countersign used the proposal in reconciliation snapshot');
    const holdingResult = JSON.parse(holding.value);
    assert.equal(holdingResult.commercialDocumentId, documents[2], 'reconciliation holding the project reaches the current executed document');
    assert.equal(holdingResult.editionIds.length, 2, 'reconciliation holding the project composes both recorded successors');
    assert.equal(await a.query(`SELECT
      (SELECT count(*)=1 AND bool_and(status='stale') FROM public.project_scope_editions WHERE project_id=${literal(job)}) AND
      NOT EXISTS(SELECT 1 FROM public.project_scope_reconciliations WHERE project_id=${literal(job)}) AND
      (SELECT count(*)=3 FROM public.project_commercial_execution_order WHERE project_id=${literal(job)});`),
    't', 'rolled-back contention proof preserves existing moved-set and receipt fixtures');
    // B snapshots the old set while A owns the project. A then appends a real
    // execution before releasing it. B must refuse instead of omitting it.
    await a.query(`BEGIN; SELECT 1 FROM public.projects WHERE id=${literal(job)} FOR UPDATE;`);
    const moved = b.query(reconcile(documents[2], randomUUID())).then(value => ({ value }), error => ({ error }));
    await waitForProjectLock(a, bPid, aPid);
    await a.query(pausedExecution(4) + ' COMMIT;');
    const movedOutcome = await moved;
    assert.match(movedOutcome.error?.message ?? '', /scope_reconcile_order_moved/, 'moved execution set refuses with serialization failure');
    await b.close(); // stays in sessions: finally reports a B that never closed
    assert.equal(await a.query(`SELECT
      (SELECT count(*)=1 AND bool_and(status='stale') FROM public.project_scope_editions WHERE project_id=${literal(job)}) AND
      NOT EXISTS(SELECT 1 FROM public.project_scope_reconciliations WHERE project_id=${literal(job)});`),
    't', 'moved-set refusal leaves no partial edition or receipt');
    const c = open('c');
    await c.query(`SET request.jwt.claim.sub=${literal(actor)};`);
    const cPid = Number(await c.query('SELECT pg_backend_pid();'));
    const request = randomUUID();
    const command = reconcile(documents[4], request);
    const first = JSON.parse(await a.query('BEGIN; ' + command));
    const duplicate = c.query(command).then(value => ({ value }), error => ({ error }));
    await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
      WHILE NOT ${aPid}=ANY(pg_blocking_pids(${cPid})) LOOP
        IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: duplicate request did not wait'; END IF;
        PERFORM pg_sleep(0.02);
      END LOOP;
    END $wait$; COMMIT;`);
    const duplicateOutcome = await duplicate;
    assert.ifError(duplicateOutcome.error);
    assert.deepEqual(JSON.parse(duplicateOutcome.value), first, 'concurrent same request returns identical immutable receipt');
    assert.equal(await a.query(`SELECT
      (SELECT array_agg(commercial_document_id ORDER BY edition_number) FILTER(WHERE edition_number>1)=
        ARRAY[${literal(documents[3])}::uuid,${literal(documents[2])}::uuid,${literal(documents[4])}::uuid]
        AND count(*) FILTER(WHERE status='active')=1 FROM public.project_scope_editions WHERE project_id=${literal(job)}) AND
      (SELECT count(*)=4 FROM public.project_scope_edition_phases WHERE edition_id=${literal(first.activeEditionId)}) AND
      (SELECT count(*)=1 FROM public.project_scope_reconciliations WHERE project_id=${literal(job)});`),
    't', 'retry mints three cumulative successors in execution order exactly once');
    assert.equal(await a.query("SELECT enabled FROM public.server_capabilities WHERE key='scope_editions';"), 't',
      'committed capability setting is preserved');
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // Every failure path reaches cleanup: each close is bounded and never throws.
    const unclosed = (await Promise.all([...sessions].map(s => s.close(0)))).filter(Boolean);
    // Prove every tagged backend ended (terminating stragglers) before any fixture delete.
    const cleaner = new Session('cleanup');
    try {
      const terminated = await cleaner.query(backendsGone(names));
      console.info('owned session backends gone', { sessions: names.length, terminated: Number(terminated) });
      if (fixtureOwned) await cleaner.query(cleanup);
      assert.deepEqual(unclosed, [], 'CLEANUP REFUSED: host psql clients did not close');
    } catch (error) {
      // A cleanup failure must not hide the test failure that preceded it.
      throw failure ? new Error(`${error.message}\nafter test failure: ${failure.message}`, { cause: failure }) : error;
    } finally { await cleaner.close(); }
  }
});

// Harness self-tests: pure node, no docker and no database.
const ownedId = 'a'.repeat(64);
const ownedInspect = () => [{
  Id: ownedId, Name: '/sq2110-native-fixture', Image: pinnedImage.id, Mounts: [], NetworkSettings: { Ports: {} },
  Config: { Image: pinnedImage.tag, Env: ['PGDATA=/var/lib/postgresql/data'], Volumes: null,
    Labels: { 'sidequest.ticket': 'SQ-2110', 'sidequest.owner': 'owner-fixture' } },
  HostConfig: { NetworkMode: 'none', PortBindings: {}, ReadonlyRootfs: true, Binds: null, VolumesFrom: null, IpcMode: 'private',
    Privileged: false, CapAdd: null, SecurityOpt: ['no-new-privileges:true'],
    PidMode: '', Tmpfs: { '/tmp': 'rw', '/var/run/postgresql': 'rw', '/var/lib/postgresql/data': 'rw' } },
}];

test('harness: W1 refuses foreign storage, shared namespaces and unowned provenance', () => {
  const owner = { id: ownedId, owner: 'owner-fixture', ticket: 'SQ-2110' };
  assert.deepEqual(ownershipFailures(ownedInspect(), owner), [], 'the r19-shaped owned container passes');
  const failed = mutate => { const inspected = ownedInspect(); mutate(inspected[0]); return ownershipFailures(inspected, owner); };
  const pgdata = '/var/lib/postgresql/data';
  for (const [name, mutate, expected] of [
    ['bind-mounted foreign socket', c => {
      c.Mounts = [{ Type: 'bind', Source: socketDir, Destination: socketDir, RW: true }];
      c.HostConfig.Binds = [socketDir + ':' + socketDir];
    }, ['onlyTmpfsMounts', 'noBinds']],
    ['HostConfig.Mounts bind over PGDATA', c => { c.HostConfig.Mounts = [{ Type: 'bind', Source: '/srv/pg', Target: pgdata }]; }, ['onlyTmpfsMounts']],
    ['named volume', c => { c.Mounts = [{ Type: 'volume', Name: 'pgdata', Destination: pgdata }]; }, ['onlyTmpfsMounts']],
    ['anonymous volume', c => {
      c.Config.Volumes = { [pgdata]: {} };
      c.Mounts = [{ Type: 'volume', Name: 'f'.repeat(64), Destination: pgdata }];
    }, ['onlyTmpfsMounts', 'noVolumes']],
    ['VolumesFrom', c => { c.HostConfig.VolumesFrom = ['another-container']; }, ['noVolumes']],
    ['socket directory not tmpfs', c => { delete c.HostConfig.Tmpfs[socketDir]; }, ['tmpfsSocketDir']],
    ['PGDATA outside tmpfs', c => { c.Config.Env = ['PGDATA=/srv/pgdata']; }, ['tmpfsPgdata']],
    ['PGDATA unset', c => { c.Config.Env = []; }, ['tmpfsPgdata']],
    ['host IPC', c => { c.HostConfig.IpcMode = 'host'; }, ['privateIpc']],
    ['joined IPC', c => { c.HostConfig.IpcMode = 'container:another-container'; }, ['privateIpc']],
    ['host PID', c => { c.HostConfig.PidMode = 'host'; }, ['privatePid']],
    ['joined PID', c => { c.HostConfig.PidMode = 'container:another-container'; }, ['privatePid']],
    ['other ticket label', c => { c.Config.Labels['sidequest.ticket'] = 'SQ-2170'; }, ['ticketLabel']],
    ['other owner label', c => { c.Config.Labels['sidequest.owner'] = 'another-claim'; }, ['ownerLabel']],
    ['pinned tag on another image id', c => { c.Image = 'sha256:' + '0'.repeat(64); }, ['pinnedImageId']],
  ]) assert.deepEqual(failed(mutate), expected, name + ' is refused by exactly ' + expected.join(', '));
  assert.deepEqual(ownershipFailures(ownedInspect(), { id: ownedId, owner: undefined, ticket: 'SQ-2110' }), ['ownerLabel'], 'unset owner is refused');
  assert.deepEqual(ownershipFailures(ownedInspect(), { ...owner, ticket: undefined }), ['ticketLabel'], 'unset ROUND8_OWNER_TICKET is refused');
  assert.deepEqual(ownershipFailures(ownedInspect(), { ...owner, ticket: 'SQ-2170' }), ['ticketLabel'], 'another ROUND8_OWNER_TICKET is refused');
  assert.deepEqual(ownershipFailures(ownedInspect(), { ...owner, ticket: 'SQ-211' }), ['ticketLabel'], 'a prefix of the label is refused');
});

// A stand-in psql child: plain node in its own process group.
const fakePsql = `const [mode, text] = process.argv.slice(1); const fs = require('node:fs');
if (mode === 'exit-before-stderr') process.stdin.once('data', () => {
  // A descendant still holds stderr, so the exit is observed before the error text.
  require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => require("node:fs").writeSync(2, process.argv[1]), 200)', text],
    { stdio: ['ignore', 'ignore', 'inherit'] });
  process.exit(3);
});
if (mode === 'stdin-closed') { fs.closeSync(0); fs.writeSync(1, 'stdin closed\\n'); setInterval(() => {}, 1000); }
if (mode === 'silent') { process.stdin.resume(); setInterval(() => {}, 1000); }`;
const fake = (mode, deadlineMs) => new Session('fake', { command: process.execPath, args: () => ['-e', fakePsql, mode,
  'ERROR:  40P01: deadlock detected\nCONTEXT:  PL/pgSQL function reconcile_scope_edition(uuid,uuid,uuid) line 9 at PERFORM\n'], deadlineMs });
const reconcileContext = /\breconcile_scope_edition\(/;
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));

test('harness: an exit is classified from stderr drained on close, then the session refuses commands', { timeout: 10000 }, async () => {
  const session = fake('exit-before-stderr', 5000);
  try {
    const exited = await outcome(session.query('SELECT 1;'));
    assert.equal(exited.error?.kind, 'exit', 'the exit rejects the command on close');
    const lock = failureOf('B', 'reconciliation', exited, reconcileContext);
    assert.deepEqual([lock.kind, lock.sqlstate, lock.lock], ['sql', '40P01', true], 'classification reads the post-close stderr');
    const started = Date.now();
    const refused = await outcome(session.query('SELECT 1;'));
    assert.ok(Date.now() - started < 1000, 'a terminated session rejects at once, not at the deadline');
    const late = failureOf('B', 'reconciliation', refused, reconcileContext);
    assert.deepEqual([late.kind, late.lock], ['transport', false], 'a command after termination is a transport failure even after exit 3');
  } finally { assert.equal(await session.close(0), null); }
});

test('harness: a stdin error is a transport failure', { timeout: 10000 }, async () => {
  const session = fake('stdin-closed', 5000);
  try {
    await new Promise(resolve => session.child.stdout.once('data', resolve));
    const broken = await outcome(session.query('SELECT 1;'));
    assert.match(broken.error?.message ?? '', /^psql transport stdin /, 'the stdin error rejects the pending command');
    const failure = failureOf('A', 'native countersign retry', broken, reconcileContext);
    assert.deepEqual([failure.kind, failure.lock], ['transport', false], 'a stdin error is never a detection');
  } finally { assert.equal(await session.close(0), null); }
});

test('harness: the command deadline rejects without waiting for the kill', { timeout: 10000 }, async () => {
  const session = fake('silent', 300);
  let kills = 0;
  session.kill = () => { kills += 1; };
  try {
    const timedOut = await outcome(session.query('SELECT 1;'));
    assert.equal(timedOut.error?.kind, 'timeout', 'the deadline rejects the pending command');
    assert.deepEqual([kills, session.child.exitCode, session.child.signalCode], [1, null, null], 'rejected while the child still runs');
    assert.equal(failureOf('A', 'step', timedOut, reconcileContext).kind, 'timeout', 'a deadline is never a detection');
    assert.equal((await outcome(session.query('SELECT 1;'))).error?.kind, 'transport', 'a timed-out session refuses commands');
  } finally {
    delete session.kill;
    assert.equal(await session.close(0), null);
  }
});

test('harness: a spawn failure rejects at once and still closes', { timeout: 10000 }, async () => {
  const session = new Session('missing', { command: '/nonexistent/round8-psql', args: () => [] });
  const missing = await outcome(session.query('SELECT 1;'));
  assert.equal(failureOf('A', 'step', missing, reconcileContext).kind, 'transport', 'a spawn failure is a transport failure');
  assert.equal(await session.close(0), null, 'cleanup is reachable after a spawn failure');
});
