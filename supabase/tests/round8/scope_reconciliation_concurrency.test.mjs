// N(scope_reconciliation): run ONLY in an orchestrator-owned committed LOCAL DB window.
// Required: SCOPE_RECONCILIATION_DB_WINDOW=owned, committed 00868/00869/00870,
// scope_editions=true, outbound workers stopped. No migration/grant is installed.
// Paused executions flip the setting only within their transaction, restoring
// true before COMMIT; no committed capability setting is changed.
// Run: node --test --test-concurrency=1 supabase/tests/round8/scope_reconciliation_concurrency.test.mjs
// Negative control: add SCOPE_RECONCILIATION_NEGATIVE_CONTROL=inverted. Only the
// new retry schedule calls a session-local scratch function; public SQL is untouched.
// It must assertion-fail with 40P01/55P03, never count a setup failure as the control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const url = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
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
  return definition.replace(name, 'CREATE OR REPLACE FUNCTION pg_temp.scope_reconciliation_inverted(')
    .replace(proposalLock, '')
    .replace(projectLock, `${documentSet}\n ${proposalLock}\n ${projectLock}`);
}

// Each process owns one backend. ON_ERROR_STOP makes an expected SQL refusal
// terminal for that client; finally closes/awaits every process before cleanup.
class Session {
  constructor() {
    this.buffer = '';
    this.errors = '';
    this.pending = null;
    this.child = spawn('psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], {
      stdio: ['pipe', 'pipe', 'pipe'], detached: true,
      env: { ...process.env, PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=10000' },
    });
    this.exited = new Promise(resolve => {
      this.child.once('error', error => { this.pending?.reject(error); resolve(); });
      this.child.once('exit', (code, signal) => {
        this.pending?.reject(new Error(`psql exit=${code} signal=${signal}: ${this.errors}`));
        this.pending = null;
        resolve();
      });
    });
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
  async query(sql) {
    assert.equal(this.pending, null, 'one command per session');
    const marker = `scope_done_${randomUUID().replaceAll('-', '')}`;
    const result = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    const timer = setTimeout(() => this.kill(), 20000);
    try {
      this.child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      return await result;
    } finally { clearTimeout(timer); }
  }
  kill() {
    if (this.child.exitCode !== null || this.child.signalCode) return;
    try { process.kill(-this.child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  async close() {
    this.child.stdin.end();
    const timer = setTimeout(() => this.kill(), 1000);
    try { await this.exited; } finally { clearTimeout(timer); }
  }
}

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
  assert.equal(process.env.SCOPE_RECONCILIATION_DB_WINDOW, 'owned', 'orchestrator-owned committed DB window required');
  const negativeControl = process.env.SCOPE_RECONCILIATION_NEGATIVE_CONTROL;
  assert.ok(negativeControl === undefined || negativeControl === 'inverted', 'only the explicit inverted negative control is supported');
  const sessions = new Set();
  const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open();
  let fixtureOwned = false;
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
    const b = open();
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
    async function waitForProjectLock() {
      // A row wait is normally an ungranted transactionid lock, while B's
      // heavyweight tuple lock is already granted. Bind both to this project
      // and A's actual transaction; an unrelated pg_blocking_pids hit is not proof.
      const wait = `SELECT tuple_lock.relation::regclass::text AS relation,
        tuple_lock.page, tuple_lock.tuple, blocked.transactionid::text AS transaction_id,
        blocked.pid AS waiter_pid, holder.pid AS blocker_pid
        FROM pg_locks tuple_lock
        JOIN pg_locks blocked ON blocked.pid=tuple_lock.pid
          AND blocked.locktype='transactionid' AND blocked.mode='ShareLock' AND NOT blocked.granted
        JOIN pg_locks holder ON holder.locktype=blocked.locktype AND holder.transactionid=blocked.transactionid
          AND holder.mode='ExclusiveLock' AND holder.granted AND holder.pid=${aPid}
        JOIN public.projects project ON project.id=${literal(job)}
          AND project.ctid=('(' || tuple_lock.page::text || ',' || tuple_lock.tuple::text || ')')::tid
        WHERE tuple_lock.pid=${bPid} AND tuple_lock.locktype='tuple'
          AND tuple_lock.relation='public.projects'::regclass
          AND tuple_lock.database=(SELECT oid FROM pg_database WHERE datname=current_database())
          AND ${aPid}=ANY(pg_blocking_pids(${bPid}))`;
      const evidence = JSON.parse(await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
        WHILE NOT EXISTS(${wait}) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: reconciliation did not wait on the owned project tuple and transaction'; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $wait$;
      SELECT row_to_json(proven_wait) FROM (${wait}) proven_wait;`));
      assert.equal(evidence.blocker_pid, aPid, 'project tuple wait is blocked by session A');
      assert.equal(evidence.waiter_pid, bPid, 'project tuple wait belongs to reconciliation session B');
      console.info('project-row wait proved', evidence);
    }
    let retryReconcile = reconcile(documents[2], randomUUID());
    if (negativeControl === 'inverted') {
      const definition = await b.query("SELECT pg_get_functiondef('public.reconcile_scope_edition(uuid,uuid,uuid)'::regprocedure);");
      await b.query(invertedReconciliation(definition));
      retryReconcile = retryReconcile.replace('public.reconcile_scope_edition(', 'pg_temp.scope_reconciliation_inverted(');
      console.info('negative control: session-local proposal→project reconciliation copy');
    }
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
    await waitForProjectLock();
    const retried = await a.query(`SELECT public.countersign_design_services_agreement(${literal(proposals[2])},'Execution Designer'); COMMIT;`)
      .then(value => ({ value }), error => ({ error }));
    const orderedOutcome = await ordered;
    assert.equal([retried.error?.message, orderedOutcome.error?.message].filter(Boolean).join('\n'), '',
      'project→proposal contention: native executed-proposal retry and reconciliation both complete without deadlock or lock timeout');
    const retriedResult = JSON.parse(retried.value);
    assert.equal(retriedResult.newlyExecuted, false, 'contending native countersign is an execution retry, not an appended execution');
    assert.equal(retriedResult.proposalId, proposals[2], 'native retry used the proposal in reconciliation snapshot');
    assert.equal(retriedResult.projectId, job, 'native retry used the project owned by session A');
    const orderedResult = JSON.parse(orderedOutcome.value);
    assert.equal(orderedResult.commercialDocumentId, documents[2], 'contending reconciliation reaches the current executed document');
    assert.equal(orderedResult.editionIds.length, 2, 'contending reconciliation composes both recorded successors');
    assert.equal(await a.query(`SELECT
      (SELECT count(*)=1 AND bool_and(status='stale') FROM public.project_scope_editions WHERE project_id=${literal(job)}) AND
      NOT EXISTS(SELECT 1 FROM public.project_scope_reconciliations WHERE project_id=${literal(job)}) AND
      (SELECT count(*)=3 FROM public.project_commercial_execution_order WHERE project_id=${literal(job)});`),
    't', 'rolled-back contention proof preserves existing moved-set and receipt fixtures');
    // B snapshots the old set while A owns the project. A then appends a real
    // execution before releasing it. B must refuse instead of omitting it.
    await a.query(`BEGIN; SELECT 1 FROM public.projects WHERE id=${literal(job)} FOR UPDATE;`);
    const moved = b.query(reconcile(documents[2], randomUUID())).then(value => ({ value }), error => ({ error }));
    await waitForProjectLock();
    await a.query(pausedExecution(4) + ' COMMIT;');
    const movedOutcome = await moved;
    assert.match(movedOutcome.error?.message ?? '', /scope_reconcile_order_moved/, 'moved execution set refuses with serialization failure');
    await b.close(); sessions.delete(b);
    assert.equal(await a.query(`SELECT
      (SELECT count(*)=1 AND bool_and(status='stale') FROM public.project_scope_editions WHERE project_id=${literal(job)}) AND
      NOT EXISTS(SELECT 1 FROM public.project_scope_reconciliations WHERE project_id=${literal(job)});`),
    't', 'moved-set refusal leaves no partial edition or receipt');
    const c = open();
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
  } finally {
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.exited));
    if (fixtureOwned) {
      const cleaner = new Session();
      try { await cleaner.query(cleanup); } finally { await cleaner.close(); }
    }
  }
});
