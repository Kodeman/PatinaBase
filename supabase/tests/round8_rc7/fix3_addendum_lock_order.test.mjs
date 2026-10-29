// RC7-fix3: create_service_addendum takes the job before the billing-source proposal.
// Before the fix it inserted the addendum proposal (FK KEY SHARE on the source
// proposal) before locking the project, so against reconcile_scope_edition
// (project FOR UPDATE, then proposals FOR UPDATE) the two formed a 40P01 cycle.
// Three sessions: a gate holds the source proposal FOR KEY SHARE so reconcile
// parks holding the project; then the addendum is started as the designer.
// Run (owned stack only): FIX3_DB_WINDOW=owned ROUND8_DB_URL=postgresql://postgres:postgres@127.0.0.1:60622/postgres \
//   node --test --test-concurrency=1 supabase/tests/round8_rc7/fix3_addendum_lock_order.test.mjs
// Negative control: load the pre-fix create_service_addendum body (git 751c916ef:00869)
// and add FIX3_NEGATIVE_CONTROL=prefix-body; the same schedule must then end in 40P01.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from '../round8/owned_psql.mjs';

const url = round8DbUrl();
assert.equal(new URL(url).hostname, '127.0.0.1');
assert.equal(new URL(url).port, '60622', 'fix3 owned DB only');
const negativeControl = process.env.FIX3_NEGATIVE_CONTROL === 'prefix-body';
const prefix = 'f8c3';
// The reconciliation oracle's shared fixture and scenario: three paused native
// addenda leave a stale edition that reconcile_scope_edition can replay.
const body = readFileSync(new URL('../round8/scope_reconciliation_body.psql', import.meta.url), 'utf8')
  .replaceAll('f870', prefix).replaceAll('scope-execution-', 'fix3-lock-order-');
function section(name) {
  const start = '-- BEGIN shared ' + name + '\n';
  const end = '-- END shared ' + name;
  assert.equal(body.split(start).length, 2, 'one ' + name + ' start marker');
  return body.split(start)[1].split(end)[0];
}
const actor = n => `${prefix}0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const claims = n => `SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub='${actor(n)}';
  SET LOCAL request.jwt.claims='{"sub":"${actor(n)}","role":"authenticated"}';`;
const projectLock = 'PERFORM 1 FROM public.projects WHERE id = p_project_id FOR KEY SHARE;';

class Session {
  constructor() {
    this.buffer = ''; this.errors = ''; this.pending = null;
    this.child = spawn('psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], {
      stdio: ['pipe', 'pipe', 'pipe'], detached: true,
      env: { ...process.env, PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=10000' },
    });
    this.exited = new Promise(resolve => {
      this.child.once('error', error => { this.pending?.reject(error); resolve(); });
      this.child.once('exit', (code, signal) => {
        this.pending?.reject(new Error(`psql exit=${code} signal=${signal}: ${this.errors}`));
        this.pending = null; resolve();
      });
    });
    this.child.stderr.on('data', data => { this.errors += data; });
    this.child.stdout.on('data', data => {
      this.buffer += data;
      const at = this.pending && this.buffer.indexOf(this.pending.marker);
      if (at < 0 || at === null) return;
      const output = this.buffer.slice(0, at).trim();
      this.buffer = this.buffer.slice(at + this.pending.marker.length).trimStart();
      const pending = this.pending; this.pending = null; pending.resolve(output);
    });
  }
  async query(sql, deadlineMs = 20000) {
    assert.equal(this.pending, null);
    const marker = `fix3_done_${randomUUID().replaceAll('-', '')}`;
    const done = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    const timer = setTimeout(() => this.kill(), deadlineMs);
    try { this.child.stdin.write(`${sql}\n\\echo ${marker}\n`); return await done; }
    finally { clearTimeout(timer); }
  }
  kill() {
    if (this.child.exitCode !== null || this.child.signalCode) return;
    try { process.kill(-this.child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  async close() {
    this.child.stdin.end(); const timer = setTimeout(() => this.kill(), 1000);
    try { await this.exited; } finally { clearTimeout(timer); }
  }
}

const settle = promise => promise.then(value => ({ value }), error => ({ error }));
const waitBlocked = (waiter, holder, what) => `DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '8s'; BEGIN
  WHILE NOT ${holder}=ANY(pg_blocking_pids(${waiter})) LOOP
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION '${what} did not wait'; END IF;
    PERFORM pg_sleep(0.02);
  END LOOP;
END $wait$;`;

const cleanup = (capability, granted) => `BEGIN;
  CREATE TEMP TABLE fix3_owned(rel oid, tid tid, PRIMARY KEY(rel,tid));
  INSERT INTO fix3_owned SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE '${prefix}0000-%';
  INSERT INTO fix3_owned SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE '${prefix}1000-%';
  DO $clean$ DECLARE fk record; predicate text; added integer; total integer; pass integer:=0; owned record;
  BEGIN LOOP
    total:=0; pass:=pass+1;
    IF pass>30 THEN RAISE EXCEPTION 'fix3 cleanup exceeded FK closure'; END IF;
    FOR fk IN SELECT c.* FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE c.contype='f' AND n.nspname IN ('public','auth') LOOP
      SELECT string_agg(format('child.%I=parent.%I',a.attname,b.attname),' AND ' ORDER BY keys.ord)
        INTO predicate FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(child_key,parent_key,ord)
        JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=keys.child_key
        JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=keys.parent_key;
      EXECUTE format('INSERT INTO fix3_owned SELECT %s,child.ctid FROM %s child JOIN %s parent ON %s
        JOIN fix3_owned owned ON owned.rel=%s AND owned.tid=parent.ctid ON CONFLICT DO NOTHING',
        fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid);
      GET DIAGNOSTICS added=ROW_COUNT; total:=total+added;
    END LOOP;
    EXIT WHEN total=0;
  END LOOP;
  SET LOCAL session_replication_role=replica;
  FOR owned IN SELECT DISTINCT rel FROM fix3_owned LOOP
    EXECUTE format('DELETE FROM %s target USING fix3_owned owned WHERE owned.rel=%s AND target.ctid=owned.tid',
      owned.rel::regclass,owned.rel);
  END LOOP;
  SET LOCAL session_replication_role=origin;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE '${prefix}0000-%') OR
     EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE '${prefix}1000-%') THEN
    RAISE EXCEPTION 'fix3 fixture cleanup left roots';
  END IF;
  END $clean$;
  UPDATE public.server_capabilities SET enabled=${capability} WHERE key='scope_editions';
  ${granted ? 'REVOKE EXECUTE ON FUNCTION public.reconcile_scope_edition(uuid,uuid,uuid) FROM authenticated;' : ''}
  COMMIT;`;

test(`addendum creation vs reconcile on one job: ${negativeControl ? 'pre-fix body deadlocks (negative control)' : 'project first, no 40P01'}`,
  { timeout: 120000 }, async () => {
  assert.equal(process.env.FIX3_DB_WINDOW, 'owned');
  const sessions = new Set(); const open = () => { const s = new Session(); sessions.add(s); return s; };
  const setup = open(); let owned = null;
  try {
    const [absent, capability, granted, fixed] = (await setup.query(`SELECT current_user='postgres'
      AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE '${prefix}0000-%')
      AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE '${prefix}1000-%'),
      (SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'),
      has_function_privilege('authenticated','public.reconcile_scope_edition(uuid,uuid,uuid)','EXECUTE'),
      strpos(pg_get_functiondef('public.create_service_addendum(uuid,text)'::regprocedure),'${projectLock}') BETWEEN 1 AND
        strpos(pg_get_functiondef('public.create_service_addendum(uuid,text)'::regprocedure),'INSERT INTO public.proposals');`)).split('|');
    assert.equal(absent, 't', 'fixture starts absent');
    assert.equal(fixed, negativeControl ? 'f' : 't',
      negativeControl ? 'negative control needs the pre-fix body installed' : 'installed body locks the project before the proposal insert');
    owned = { capability: capability === 't', granted: granted !== 't' };
    await setup.query(`BEGIN;
      ${section('assertion helpers')}${section('fixture')}${section('native helpers')}
      ${section('reconciliation helpers')}${section('reconciliation scenario')}
      UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';
      ${owned.granted ? 'GRANT EXECUTE ON FUNCTION public.reconcile_scope_edition(uuid,uuid,uuid) TO authenticated;' : ''}
      COMMIT;`, 90000);
    const [job, doc4, source, inSet] = (await setup.query(`SELECT pg_temp.fixture('job'), pg_temp.fixture('doc4'),
      a.source_proposal_id, EXISTS(SELECT 1 FROM public.project_commercial_documents d
        WHERE d.project_id=a.project_id AND d.proposal_id=a.source_proposal_id AND d.executed_at IS NOT NULL)
      FROM public.project_billing_authorities a WHERE a.project_id=pg_temp.fixture('job') AND a.status='active'
      ORDER BY a.effective_at DESC LIMIT 1;`)).split('|');
    assert.equal(inSet, 't', 'billing source is one of the proposals reconcile locks');
    const request = randomUUID();

    const gate = open(); const recon = open(); const add = open();
    const [gatePid, reconPid, addPid] = await Promise.all([gate, recon, add].map(async s => Number(await s.query('SELECT pg_backend_pid();'))));
    // 1. Gate: a KEY SHARE holder on the billing-source proposal.
    assert.equal(await gate.query(`BEGIN; SELECT count(*) FROM (SELECT 1 FROM public.proposals
      WHERE id='${source}' FOR KEY SHARE) x;`), '1');
    // 2. Reconcile takes the project FOR UPDATE, then parks on the source proposal.
    const reconciled = settle(recon.query(`BEGIN; ${claims(2)}
      SELECT public.reconcile_scope_edition('${job}','${doc4}','${request}')->>'editionIds' IS NOT NULL;`));
    await setup.query(waitBlocked(reconPid, gatePid, 'reconcile'));
    assert.equal(await setup.query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=${reconPid} AND locktype='tuple'
      AND relation='public.proposals'::regclass);`), 't', 'reconcile waits on a proposals row (it holds the project)');
    // 3. The designer creates an addendum on the same job.
    const added = settle(add.query(`BEGIN; ${claims(1)}
      SELECT public.create_service_addendum('${job}','Fix3 lock-order addendum')->>'proposalId';`));
    await setup.query(waitBlocked(addPid, reconPid, 'addendum creation'));
    const [onProject, proposalWritten] = (await setup.query(`SELECT
      EXISTS(SELECT 1 FROM pg_locks WHERE pid=${addPid} AND locktype='tuple' AND relation='public.projects'::regclass),
      EXISTS(SELECT 1 FROM pg_locks WHERE pid=${addPid} AND relation='public.proposals'::regclass AND mode='RowExclusiveLock');`)).split('|');
    assert.equal(onProject, 't', 'addendum creation waits on the projects row held by reconcile');
    assert.equal(proposalWritten, negativeControl ? 't' : 'f',
      negativeControl ? 'pre-fix body already inserted the proposal (holds the source KEY SHARE)'
        : 'fixed body waits before inserting the proposal, so it holds no source-proposal lock');
    // 4. Release the gate.
    await gate.query('COMMIT;');

    if (negativeControl) {
      const outcomes = await Promise.all([reconciled, added]);
      const deadlocked = outcomes.filter(o => /ERROR:\s+40P01: deadlock detected/.test(o.error?.message ?? ''));
      assert.equal(deadlocked.length, 1, `exactly one side is the 40P01 victim: ${outcomes.map(o => o.error?.message ?? o.value).join(' || ')}`);
      const survivor = outcomes.indexOf(outcomes.find(o => !o.error));
      assert.notEqual(survivor, -1, 'the other side completes');
      await [recon, add][survivor].query('ROLLBACK;');
      console.log(`negative control: 40P01 victim=${outcomes[0].error ? 'reconcile' : 'addendum'}`);
      return;
    }

    // Fixed: reconcile completes while the addendum is still parked on the project.
    const r = await reconciled;
    assert.equal(r.error, undefined, `reconcile completes: ${r.error?.message}`);
    assert.equal(r.value, 't');
    await setup.query(waitBlocked(addPid, reconPid, 'addendum creation (after reconcile returned)'));
    await recon.query('COMMIT;');
    const a = await added;
    assert.equal(a.error, undefined, `addendum completes without 40P01: ${a.error?.message}`);
    assert.match(a.value, /^[0-9a-f-]{36}$/);
    await add.query('COMMIT;');
    assert.equal(await setup.query(`SELECT
      (SELECT count(*)=1 FROM public.project_scope_reconciliations WHERE project_id='${job}' AND client_request_id='${request}')
      AND (SELECT count(*)=1 FROM public.project_commercial_documents WHERE project_id='${job}'
        AND proposal_id='${a.value}' AND document_kind='service_addendum' AND source_proposal_id='${source}')
      AND (SELECT p.drafted_against_scope_edition_id=e.id FROM public.proposals p, public.project_scope_editions e
        WHERE p.id='${a.value}' AND e.project_id='${job}' AND e.status='active');`), 't',
      'readback: one receipt; the addendum is bound to the job and drafted against the reconciled active edition');
  } finally {
    for (const s of sessions) if (s !== setup) s.kill();
    await Promise.all([...sessions].filter(s => s !== setup).map(s => s.exited));
    setup.kill(); await setup.exited;
    if (owned) { const cleaner = new Session(); try { await cleaner.query(cleanup(owned.capability, owned.granted), 60000); } finally { await cleaner.close(); } }
  }
});
