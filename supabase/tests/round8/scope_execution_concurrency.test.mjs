// N(scope_execution). Only the orchestrator's committed-state LOCAL DB window.
// Never installs migrations or toggles scope_editions. Refuses without ownership.
// Run: node --test --test-concurrency=1 supabase/tests/round8/scope_execution_concurrency.test.mjs
// Required env: SCOPE_EXECUTION_DB_WINDOW=owned; outbound workers must be stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from './owned_psql.mjs';

const url = round8DbUrl();
const actor = 'f86a0000-0000-4000-8000-000000000001';
const proposal = 'f86a3000-0000-4000-8000-000000000001';
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const body = readFileSync(new URL('./scope_execution_body.psql', import.meta.url), 'utf8').replaceAll('f869', 'f86a');
function section(name) {
  const start = `-- BEGIN shared ${name}\n`;
  const end = `-- END shared ${name}`;
  assert.equal(body.split(start).length, 2, `one ${name} start marker`);
  assert.equal(body.split(end).length, 2, `one ${name} end marker`);
  return body.split(start)[1].split(end)[0];
}

// Each process owns one backend. ON_ERROR_STOP makes an expected SQL refusal
// terminal for that client; finally closes/awaits every process before cleanup.
class Session {
  constructor() {
    this.buffer = '';
    this.errors = '';
    this.pending = null;
    this.child = spawn('psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1'], {
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
INSERT INTO scope_owned_rows SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f86a0000-%';
INSERT INTO scope_owned_rows SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f86a1000-%';
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
 IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f86a0000-%')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f86a1000-%') THEN
  RAISE EXCEPTION 'fixture cleanup left roots';
 END IF;
 FOR owned IN SELECT DISTINCT rel FROM scope_owned_rows LOOP
  EXECUTE format('SELECT count(*) FROM %s target JOIN scope_owned_rows owned ON owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel) INTO added;
  IF added<>0 THEN RAISE EXCEPTION 'fixture cleanup left rows in %',owned.rel::regclass; END IF;
 END LOOP;
END $cleanup$;
COMMIT;`;

test('native scope execution serializes retry and competing addenda', { timeout: 90000 }, async () => {
  assert.equal(process.env.SCOPE_EXECUTION_DB_WINDOW, 'owned', 'orchestrator-owned committed DB window required');
  const sessions = new Set();
  const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open();
  let fixtureOwned = false;
  try {
    const preflight = await a.query(`SELECT current_user='postgres' AND
      to_regprocedure('public._mint_scope_edition(uuid,uuid,boolean)') IS NOT NULL AND
      (SELECT enabled FROM public.server_capabilities WHERE key='scope_editions') AND
      NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f86a%') AND
      NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f86a%');`);
    assert.equal(preflight, 't', 'committed 00869, capability on, and empty owned fixture prefix required');
    // Ownership starts before the commit can land (including a lost response).
    fixtureOwned = true;
    await a.query(`BEGIN; ${section('assertion helpers')} ${section('fixture')} ${section('native helpers')}
      SELECT pg_temp.draft('${proposal}'); SELECT pg_temp.send_and_sign('${proposal}'); COMMIT;`);
    await a.query(`SET request.jwt.claim.sub='${actor}';`);
    const aPid = await a.query('SELECT pg_backend_pid();');
    async function race(left, right, stale) {
      const b = open();
      await b.query(`SET request.jwt.claim.sub='${actor}';`);
      const bPid = await b.query('SELECT pg_backend_pid();');
      await a.query(`BEGIN; SELECT pg_temp.actor(1);
        SELECT public.countersign_design_services_agreement(${literal(left)},'Execution Designer');`);
      // Attach a rejection handler immediately: the loser may fail before await.
      const waiting = b.query(`BEGIN;
        SELECT public.countersign_design_services_agreement(${literal(right)},'Execution Designer'); COMMIT;`)
        .then(value => ({ value }), error => ({ error }));
      await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
        WHILE NOT ${Number(aPid)}=ANY(pg_blocking_pids(${Number(bPid)})) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: competing execution did not wait on owner'; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $wait$; COMMIT;`);
      const outcome = await waiting;
      if (stale) assert.match(outcome.error?.message ?? '', /scope_edition_stale/, 'competing draft refuses after winner commits');
      else {
        assert.ifError(outcome.error);
        assert.match(outcome.value, /"newlyExecuted": false/, 'same-document waiter is a retry');
      }
      await b.close(); sessions.delete(b);
    }
    await race(proposal, proposal, false);
    assert.equal(await a.query(`SELECT count(*)=1 AND max(execution_seq)=1 FROM public.project_commercial_execution_order
      WHERE commercial_document_id=(SELECT id FROM public.project_commercial_documents WHERE proposal_id='${proposal}');`),
    't', 'concurrent origin retry adds exactly one order row');
    const job = await a.query(`SELECT project_id FROM public.project_commercial_documents WHERE proposal_id='${proposal}';`);
    async function addendum(title) {
      const id = JSON.parse(await a.query(`SELECT public.create_service_addendum(${literal(job)},${literal(title)});`)).proposalId;
      await a.query(`BEGIN; SELECT public.copy_agreement_parts_from_authority(${literal(id)},'Race composition');
        SELECT pg_temp.send_and_sign(${literal(id)}); COMMIT;`);
      return id;
    }
    const left = await addendum('Race amendment A');
    const right = await addendum('Race amendment B');
    await race(left, right, true);
    assert.equal(await a.query(`SELECT
      (SELECT count(*)=2 AND min(execution_seq)=1 AND max(execution_seq)=2 FROM public.project_commercial_execution_order WHERE project_id=${literal(job)}) AND
      (SELECT count(*)=2 AND count(*) FILTER(WHERE status='active')=1 AND count(*) FILTER(WHERE status='superseded')=1 FROM public.project_scope_editions WHERE project_id=${literal(job)}) AND
      (SELECT count(*)=1 FROM public.project_billing_authorities WHERE project_id=${literal(job)} AND status='active') AND
      NOT EXISTS(SELECT 1 FROM public.commercial_document_signatures WHERE proposal_id=${literal(right)} AND party_role='studio');`),
    't', 'competing addenda leave one winner, contiguous order, and no loser signature');
  } finally {
    // Close both writers even after an assertion/timeout, then use a fresh backend
    // so an aborted writer transaction cannot suppress cleanup.
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.exited));
    if (fixtureOwned) {
      const cleaner = new Session();
      try { await cleaner.query(cleanup); } finally { await cleaner.close(); }
    }
  }
});
