// N(billing_lock_order). Committed LOCAL DB window only; outbound workers stopped.
// Never installs migrations or toggles capability state. Authoring is not execution.
// BILLING_LOCK_ORDER_DB_WINDOW=owned node --test --test-concurrency=1 supabase/tests/round8/billing_lock_order_concurrency.test.mjs
// Reuses the native Session/owned-FK-cleanup mechanics from scope_execution N().
// The first cases exercise countersign's exact lock boundary, not its whole RPC.
// scope_execution_concurrency.test.mjs remains the native countersign/edition oracle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {round8DbUrl} from './owned_psql.mjs';
const url=round8DbUrl();
const project='f8824000-0000-4000-8000-000000000001';
const proposal='f8823000-0000-4000-8000-000000000002';
const serviceProposal='f8823000-0000-4000-8000-000000000003';
const invoice='f8826000-0000-4000-8000-000000000001';
const actor='f8820000-0000-4000-8000-000000000001';
const claims=`SET request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const fixture=readFileSync(new URL('./billing_lock_order_fixture.psql',import.meta.url),'utf8');
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


const cleanup = `
BEGIN;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE scope_owned_rows(rel oid, row_id tid, PRIMARY KEY(rel,row_id));
INSERT INTO scope_owned_rows SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f8820000-%';
INSERT INTO scope_owned_rows SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f8821000-%';
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
 IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f8820000-%')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f8821000-%') THEN
  RAISE EXCEPTION 'fixture cleanup left roots';
 END IF;
 FOR owned IN SELECT DISTINCT rel FROM scope_owned_rows LOOP
  EXECUTE format('SELECT count(*) FROM %s target JOIN scope_owned_rows owned ON owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel) INTO added;
  IF added<>0 THEN RAISE EXCEPTION 'fixture cleanup left rows in %',owned.rel::regclass; END IF;
 END LOOP;
END $cleanup$;
COMMIT;`;


test('N billing shares the countersign project-first boundary', {timeout:90000}, async()=>{
  assert.equal(process.env.BILLING_LOCK_ORDER_DB_WINDOW,'owned','orchestrator-owned committed LOCAL DB window required');
  const sessions=new Set();
  const open=()=>{const s=new Session();sessions.add(s);return s;};
  const a=open(); let fixtureOwned=false;
  try {
    assert.equal(await a.query(`SELECT current_user='postgres' AND
      strpos(pg_get_functiondef('public.issue_agreement_draw_invoice(uuid,text)'::regprocedure),'v_pinned_project_id')>0 AND
      strpos(pg_get_functiondef('app_private.issue_invoice_for_actor(uuid,date,uuid)'::regprocedure),
        E'AND project.studio_id = v_project.studio_id\n  FOR UPDATE;')>0 AND
      NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f8820000-%') AND
      NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f8821000-%');`),
      't','00882 committed and empty owned roots required');
    fixtureOwned=true;
    await a.query(`BEGIN; ${fixture} COMMIT; ${claims}`);
    const b=open(); await b.query(claims);
    const aPid=Number(await a.query('SELECT pg_backend_pid();'));
    const bPid=Number(await b.query('SELECT pg_backend_pid();'));
    async function blocked(command,proposalId){
      await a.query(`BEGIN; SELECT id FROM public.projects WHERE id='${project}' FOR UPDATE;`);
      // Handle rejection at launch so a refusal cannot become unhandled.
      const waiting=b.query(`BEGIN; ${command}`).then(value=>({value}),error=>({error}));
      await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
        WHILE NOT ${aPid}=ANY(pg_blocking_pids(${bPid})) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: billing did not wait on project owner'; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $wait$;
      SELECT id FROM public.proposals WHERE id='${proposalId}' FOR UPDATE NOWAIT;
      SELECT id FROM public.project_commercial_documents WHERE proposal_id='${proposalId}' FOR UPDATE NOWAIT;
      SELECT id FROM public.invoices WHERE id='${invoice}' FOR UPDATE NOWAIT;
      ROLLBACK;`);
      const outcome=await waiting; assert.ifError(outcome.error);
      await b.query('ROLLBACK;');
      return outcome.value;
    }
    assert.match(await blocked(`SELECT public.issue_agreement_draw_invoice('${proposal}','deposit');`,proposal),
      /"netCents": 10000/,'draw finishes after canonical owner releases without deadlock');
    assert.match(await blocked(`SELECT row_to_json(app_private.issue_invoice_for_actor('${invoice}',current_date,'${actor}'));`,serviceProposal),
      /"status":"sent"/,'executed-service issuer finishes after canonical owner releases');
    assert.equal(await a.query(`SELECT count(*)=1 AND bool_and(status='draft') FROM public.invoices WHERE designer_id='${actor}';`),
      't','rolled-back races leave no duplicate issued invoices');
    // UPDATE must remain nonlocking: taking a project lock from this trigger
    // would make the innocent memo write wait behind a's held project row.
    await a.query(`BEGIN; SELECT id FROM public.projects WHERE id='${project}' FOR UPDATE;`);
    await b.query(`BEGIN; UPDATE public.invoices SET memo='N historical edit' WHERE id='${invoice}'; ROLLBACK;`);
    await a.query('ROLLBACK;');
    // Two private issuers serialize at project UPDATE; rollback the first so
    // the second still exercises actual draft-to-sent issuance, not retry.
    await a.query(`BEGIN; SELECT app_private.issue_invoice_for_actor('${invoice}',current_date,'${actor}');`);
    const waiting=b.query(`BEGIN; SELECT app_private.issue_invoice_for_actor('${invoice}',current_date,'${actor}');`)
      .then(value=>({value}),error=>({error}));
    await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
      WHILE NOT ${aPid}=ANY(pg_blocking_pids(${bPid})) LOOP
        IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: second issuer did not serialize'; END IF;
        PERFORM pg_sleep(0.02);
      END LOOP;
    END $wait$; ROLLBACK;`);
    assert.ifError((await waiting).error); await b.query('ROLLBACK;');
    // Pin/recheck: move the discovered proposal while b waits for the pinned
    // project. b must refuse instead of following the new, unlocked parent.
    await a.query(`BEGIN; SELECT id FROM public.projects WHERE id='${project}' FOR UPDATE;`);
    const moved=b.query(`BEGIN; SELECT public.issue_agreement_draw_invoice('${proposal}','deposit');`)
      .then(value=>({value}),error=>({error}));
    await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
      WHILE NOT ${aPid}=ANY(pg_blocking_pids(${bPid})) LOOP
        IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: moved-anchor waiter did not block'; END IF;
        PERFORM pg_sleep(0.02);
      END LOOP;
    END $wait$;
    SET LOCAL session_replication_role=replica;
    UPDATE public.proposals SET project_id=NULL WHERE id='${proposal}'; COMMIT;`);
    assert.match((await moved).error?.message??'',/design-build draw not found or access denied/,'moved proposal refuses opaquely after wait');
  } finally {
    // All writers exit (and open transactions roll back) before FK cleanup.
    await Promise.all([...sessions].map(s=>s.close()));
    if(fixtureOwned){const janitor=new Session();try{await janitor.query(cleanup);}finally{await janitor.close();}}
  }
});
