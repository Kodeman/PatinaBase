// N(fabrication instruction): requires an explicitly owned, committed W3 exit
// window. Never applies migrations, activates RPC ACLs, or enables capabilities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { round8DbUrl, round8LocalApiUrl } from './owned_psql.mjs';

const url = round8DbUrl();
const body = readFileSync(new URL('./fabrication_instruction_body.psql', import.meta.url), 'utf8').replaceAll('f879', 'f87f');
const id = n => `f87f0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function section(name) {
  const start = `-- BEGIN shared ${name}\n`, end = `-- END shared ${name}`;
  assert.equal(body.split(start).length, 2);
  assert.equal(body.split(end).length, 2);
  return body.split(start)[1].split(end)[0];
}
class Session {
  constructor() {
    this.buffer = ''; this.errors = ''; this.pending = null; this.terminalError = null;
    this.child = spawn('psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], {
      detached: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=10000' },
    });
    this.exited = new Promise(resolve => {
      this.child.once('error', error => { this.fail(error); resolve(); });
      this.child.once('exit', (code, signal) => {
        this.fail(new Error(`psql exit=${code} signal=${signal}: ${this.errors}`)); resolve();
      });
    });
    this.child.stdin.on('error', error => this.fail(error));
    this.child.stderr.on('data', data => { this.errors += data; });
    this.child.stdout.on('data', data => {
      this.buffer += data;
      if (!this.pending) return;
      const at = this.buffer.indexOf(this.pending.marker);
      if (at < 0) return;
      const value = this.buffer.slice(0, at).trim();
      this.buffer = this.buffer.slice(at + this.pending.marker.length).trimStart();
      const pending = this.pending; this.pending = null; pending.resolve(value);
    });
  }
  fail(error) {
    this.terminalError ??= error;
    const pending = this.pending; this.pending = null; pending?.reject(this.terminalError);
  }
  async query(sql) {
    if (this.terminalError) throw this.terminalError;
    if (this.child.exitCode !== null || this.child.signalCode || this.child.stdin.destroyed) {
      this.fail(new Error('psql session is terminal')); throw this.terminalError;
    }
    assert.equal(this.pending, null, 'one command per backend');
    const marker = `fi_done_${randomUUID().replaceAll('-', '')}`;
    const result = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    const timer = setTimeout(() => { this.fail(new Error('psql query deadline exceeded')); this.kill(); }, 20000);
    try {
      this.child.stdin.write(`${sql}\n\\echo ${marker}\n`, error => { if (error) this.fail(error); });
      return await result;
    } finally { clearTimeout(timer); }
  }
  kill() {
    this.fail(new Error('psql session killed'));
    if (!this.child.pid || this.child.exitCode !== null || this.child.signalCode) return;
    try { process.kill(-this.child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  async close() {
    this.fail(new Error('psql session closed'));
    if (!this.child.stdin.destroyed) this.child.stdin.end();
    const timer = setTimeout(() => this.kill(), 1000);
    try { await this.exited; } finally { clearTimeout(timer); }
  }
}

// FK closure is rooted only in the empty, owned fictional namespace. Generated
// event/issue/manifest UUIDs are included through their fixture parents.
const cleanup = `BEGIN; SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE fi_owned_rows(rel oid,row_id tid,PRIMARY KEY(rel,row_id));
INSERT INTO fi_owned_rows SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f87f%';
INSERT INTO fi_owned_rows SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f87f%';
INSERT INTO fi_owned_rows SELECT 'public.projects'::regclass,ctid FROM public.projects WHERE id::text LIKE 'f87f%';
DO $cleanup$ DECLARE fk record; predicate text; added integer; total integer; pass integer:=0; owned record;
BEGIN LOOP
 total:=0; pass:=pass+1;
 IF pass>30 THEN RAISE EXCEPTION 'fixture cleanup FK closure exceeded bound'; END IF;
 FOR fk IN SELECT c.* FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
 JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND n.nspname IN ('public','auth') LOOP
  SELECT string_agg(format('child.%I=parent.%I',a.attname,b.attname),' AND ' ORDER BY keys.ord) INTO predicate
  FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(child_key,parent_key,ord)
  JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=keys.child_key
  JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=keys.parent_key;
  EXECUTE format('INSERT INTO fi_owned_rows SELECT %s,child.ctid FROM %s child JOIN %s parent ON %s
   JOIN fi_owned_rows owned ON owned.rel=%s AND owned.row_id=parent.ctid ON CONFLICT DO NOTHING',
   fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid);
  GET DIAGNOSTICS added=ROW_COUNT; total:=total+added;
 END LOOP;
 EXIT WHEN total=0;
END LOOP;
SET LOCAL session_replication_role=replica;
FOR owned IN SELECT DISTINCT rel FROM fi_owned_rows LOOP
 EXECUTE format('DELETE FROM %s target USING fi_owned_rows owned WHERE owned.rel=%s AND target.ctid=owned.row_id',owned.rel::regclass,owned.rel);
END LOOP;
END $cleanup$; COMMIT;`;
const empty = `SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87f%')
 AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f87f%')
 AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id::text LIKE 'f87f%');`;
const begin = 'BEGIN; SELECT pg_temp.fi_actor(1);';
const labels = `SELECT public._ffe_lock_job_labels('${id(201)}');`;
const seat = mode => `SELECT id FROM public.project_parties WHERE id='${id(811)}' FOR ${mode};`;
const parent = mode => `SELECT id FROM public.client_decisions WHERE id='${id(601)}' FOR ${mode};`;
const scenarios = [
  { name: 'amount', lock: () => labels, error: 'fabrication_authority_insufficient', mutate: `
    SELECT pg_temp.fi_actor(2);
    SELECT public.verify_external_fulfilment_event((SELECT id FROM public.project_external_fulfilment_events
     WHERE fulfilment_id=pg_temp.fi_fid() AND client_request_id='race-amount'),'race-verify'); SELECT pg_temp.fi_actor(1);` },
  { name: 'hold', lock: () => labels, error: 'fabrication_hold_open', mutate: `
    SELECT public.record_external_fulfilment_event(pg_temp.fi_fid(),'hold',jsonb_build_object('decisionId','${id(601)}'),ARRAY['k-1'],'race-hold');` },
  { name: 'revoke', lock: first => seat(first ? 'SHARE' : 'UPDATE'), error: 'fabrication_authority_insufficient', mutate: `
    SELECT public.revoke_fabrication_authority((SELECT id FROM public.project_party_authority WHERE engagement_id='${id(811)}' AND scope='fabrication'),'revoked');` },
  { name: 'seat-close', lock: first => seat(first ? 'SHARE' : 'UPDATE'), error: 'fabrication_authority_seat_closed', mutate: `
    UPDATE public.project_parties SET off_job_at=current_date WHERE id='${id(811)}';` },
  { name: 'new-round', lock: first => parent(first ? 'SHARE' : 'UPDATE'), error: 'fabrication_evidence_not_approved', mutate: `
    SELECT set_config('app.client_decision_write_id','${id(601)}',true);
    UPDATE public.client_decisions SET status='pending' WHERE id='${id(601)}';
    SELECT set_config('app.client_decision_write_id','',true);
    SELECT public.submit_coordination_revision('${id(601)}','[]','race new round');` },
  { name: 'reissue', lock: instructionFirst => instructionFirst ? labels : `SELECT id FROM public.projects WHERE id='${id(201)}' FOR UPDATE;`, error: 'fabrication_evidence_issue_missing', mutate: `
    SELECT public.create_plan_issue('${id(201)}','Race I2','race-issue-2');` },
];
async function blocked(holder, pid) {
  await holder.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '4s'; BEGIN LOOP
    EXIT WHEN pg_backend_pid()=ANY(pg_blocking_pids(${pid}));
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: native contender did not block on first shared lock'; END IF;
    PERFORM pg_sleep(0.02); END LOOP; END $wait$;`);
}

test('both instruction routes serialize six mutations in both orders without 40P01', {
  timeout: 540000, skip: process.env.FABRICATION_INSTRUCTION_DB_WINDOW !== 'owned',
}, async t => {
  assert.equal(round8LocalApiUrl(process.env.API_URL), true, 'local API only');
  for (const route of ['direct', 'generic']) for (const scenario of scenarios) for (const instructionFirst of [true, false]) {
    await t.test(`${route}: ${scenario.name}, ${instructionFirst ? 'instruction' : 'mutation'} first`, async () => {
      const sessions = []; let owned = false;
      async function open() {
        const s = new Session(); sessions.push(s);
        await s.query(section('helpers') + section('runtime') + `
          GRANT EXECUTE ON FUNCTION pg_temp.fi_id(integer),pg_temp.fi_actor(integer),pg_temp.fi_fid(),
           pg_temp.fi_manifest(text),pg_temp.fi_call(text,text[],uuid,uuid,jsonb,uuid) TO authenticated;`);
        return s;
      }
      try {
        const a = await open();
        assert.equal(await a.query(empty), 't', 'owned namespace starts empty');
        assert.equal(await a.query(`SELECT enabled FROM public.server_capabilities WHERE key='scope_editions';`), 't', 'exit owner enabled committed capability');
        // Exit-window owner provides committed test-only EXECUTE rights. This
        // harness uses the real RPC bodies and refuses rather than granting.
        assert.equal(await a.query(`SELECT has_function_privilege('authenticated','public.record_fabrication_instruction(uuid,uuid,uuid,text[],jsonb,uuid)','EXECUTE')
          AND has_function_privilege('authenticated','public.record_external_fulfilment_event(uuid,text,jsonb,text[],text)','EXECUTE');`), 't', 'exit owner supplied runtime ACLs');
        owned = true; // Cleanup also covers an uncertain COMMIT acknowledgement.
        await a.query('BEGIN;\n' + section('fixture') + '\nSELECT pg_temp.fi_actor(1);\n' + section('setup') + '\nCOMMIT;');
        if (scenario.name === 'amount') await a.query(begin + `SELECT public.record_external_fulfilment_event(pg_temp.fi_fid(),'contract_reported','{"contractAmountCents":300000}',NULL,'race-amount'); COMMIT;`);
        const b = await open();
        const pid = Number(await b.query('SELECT pg_backend_pid();'));
        assert.ok(Number.isInteger(pid) && pid > 0);
        const instruction = `SET LOCAL ROLE authenticated; SELECT pg_temp.fi_call('${route}',ARRAY['k-1'],'${id(1900)}'); RESET ROLE;`;
        await a.query(begin + scenario.lock(instructionFirst));
        await b.query(begin);
        const contender = b.query((instructionFirst ? scenario.mutate : instruction) + ' COMMIT;')
          .then(value => ({ value }), error => ({ error }));
        await blocked(a, pid);
        await a.query((instructionFirst ? instruction : scenario.mutate) + ' COMMIT;');
        const result = await contender;
        assert.doesNotMatch(result.error?.message ?? '', /40P01|55P03/, 'native schedule has no deadlock or lock timeout');
        if (instructionFirst) {
          assert.equal(result.error, undefined, 'mutation completes after immutable instruction');
          assert.equal(await a.query(`SELECT count(*) FROM public.project_external_fulfilment_events WHERE fulfilment_id=pg_temp.fi_fid() AND event_kind='fabrication_instruction' AND amount_cents=200000;`), '1', 'winning instruction retains original amount');
        } else {
          assert.match(result.error?.message ?? '', new RegExp(scenario.error), 'instruction rechecks winning mutation');
          assert.equal(await a.query(`SELECT count(*) FROM public.project_external_fulfilment_events WHERE fulfilment_id=pg_temp.fi_fid() AND event_kind='fabrication_instruction';`), '0', 'losing instruction leaves no event');
        }
      } finally {
        for (const s of sessions) s.kill();
        await Promise.all(sessions.map(s => s.close()));
        if (owned) {
          const cleaner = new Session();
          try { await cleaner.query(cleanup); assert.equal(await cleaner.query(empty), 't', 'owned fixtures removed'); }
          finally { await cleaner.close(); }
        }
      }
    });
  }
});
