// N(external_fulfilment). Requires an orchestrator-handed LOCAL DB window:
// EXTERNAL_FULFILMENT_DB_WINDOW=owned, committed 00868/00871/00875,
// scope_editions=true and notification/outbound workers stopped. This harness
// never applies migrations, grants privileges or changes the capability.
// Service-fixture calls exercise real actor checks, not authenticated activation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from './owned_psql.mjs';

const url = round8DbUrl();
const body = readFileSync(new URL('./external_fulfilment_body.psql', import.meta.url), 'utf8').replaceAll('f875', 'f87c');
const id = n => `f87c0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function section(name) {
  const start = `-- BEGIN shared ${name}\n`;
  const end = `-- END shared ${name}`;
  assert.equal(body.split(start).length, 2, `one ${name} start marker`);
  assert.equal(body.split(end).length, 2, `one ${name} end marker`);
  return body.split(start)[1].split(end)[0];
}

class Session {
  constructor() {
    this.buffer = '';
    this.errors = '';
    this.pending = null;
    this.child = spawn('psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], {
      detached: true, stdio: ['pipe', 'pipe', 'pipe'],
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
    this.child.stdin.on('error', error => this.pending?.reject(error));
    this.child.stderr.on('data', data => { this.errors += data; });
    this.child.stdout.on('data', data => {
      this.buffer += data;
      if (!this.pending) return;
      const at = this.buffer.indexOf(this.pending.marker);
      if (at < 0) return;
      const value = this.buffer.slice(0, at).trim();
      this.buffer = this.buffer.slice(at + this.pending.marker.length).trimStart();
      const pending = this.pending;
      this.pending = null;
      pending.resolve(value);
    });
  }
  async query(sql) {
    assert.equal(this.pending, null, 'one query per backend');
    const marker = `c5_done_${randomUUID().replaceAll('-', '')}`;
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

// Delete only FK descendants of this run's initially-empty fictional roots.
// Native resolver notifications are included by their real FK, not guessed IDs.
const cleanup = `BEGIN;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE c5_owned(rel oid,row_id tid,PRIMARY KEY(rel,row_id));
INSERT INTO c5_owned SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f87c0000-%';
INSERT INTO c5_owned SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f87c0000-%';
DO $cleanup$ DECLARE fk record; predicate text; added integer; total integer; pass integer:=0; owned record; BEGIN
 LOOP
  total:=0; pass:=pass+1;
  IF pass>30 THEN RAISE EXCEPTION 'fixture FK closure exceeded bound'; END IF;
  FOR fk IN SELECT c.* FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND n.nspname IN ('public','auth') LOOP
   SELECT string_agg(format('child.%I=parent.%I',a.attname,b.attname),' AND ' ORDER BY keys.ord) INTO predicate
    FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(child_key,parent_key,ord)
    JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=keys.child_key
    JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=keys.parent_key;
   EXECUTE format('INSERT INTO c5_owned SELECT %s,child.ctid FROM %s child JOIN %s parent ON %s
    JOIN c5_owned owned ON owned.rel=%s AND owned.row_id=parent.ctid ON CONFLICT DO NOTHING',
    fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid);
   GET DIAGNOSTICS added=ROW_COUNT; total:=total+added;
  END LOOP;
  EXIT WHEN total=0;
 END LOOP;
 SET LOCAL session_replication_role=replica;
 FOR owned IN SELECT DISTINCT rel FROM c5_owned LOOP
  EXECUTE format('DELETE FROM %s target USING c5_owned owned WHERE owned.rel=%s AND target.ctid=owned.row_id',owned.rel::regclass,owned.rel);
 END LOOP;
 SET LOCAL session_replication_role=origin;
 FOR owned IN SELECT DISTINCT rel FROM c5_owned LOOP
  EXECUTE format('SELECT count(*) FROM %s target JOIN c5_owned owned ON owned.rel=%s AND target.ctid=owned.row_id',owned.rel::regclass,owned.rel) INTO added;
  IF added<>0 THEN RAISE EXCEPTION 'fixture residue in %',owned.rel::regclass; END IF;
 END LOOP;
END $cleanup$;
COMMIT;`;

const begin = actor => `BEGIN; SELECT pg_temp.c5_actor(${actor});`;
const approve = n => `SELECT public._resolve_coordination_item_authorized('${id(600 + n)}',NULL,NULL,'${id(700 + n)}',NULL,'${id(1)}');`;
const bind = (fid, n) => `public.bind_fulfilment_evidence(${quote(fid)},'${id(600 + n)}',ARRAY['chair'],'bind-${n}')`;
function waitForBlock(holder, waitingPid) {
  return holder.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
   LOOP
    EXIT WHEN pg_backend_pid()=ANY(pg_blocking_pids(${waitingPid}));
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: contender did not wait on holder'; END IF;
    PERFORM pg_sleep(0.02);
   END LOOP;
  END $wait$;`);
}

const firstLock = `SELECT public._ffe_lock_job_labels('${id(201)}');`;

// Hold only the resolver's first lock, then let the binder reach it. A correct
// binder waits WITHOUT the decision lock. The test-local inverse takes that
// decision first, producing an actual cycle when the resolver continues.
async function lockOrderBarrier(open, fid, inverted) {
  const holder = open();
  const contender = open();
  try {
    await holder.query(section('helpers'));
    await contender.query(section('helpers'));
    const pid = Number(await contender.query('SELECT pg_backend_pid();'));
    await holder.query(`${begin(1)} ${firstLock}`);
    const binding = contender.query(`${begin(1)}
     ${inverted ? `SELECT id FROM public.client_decisions WHERE id='${id(606)}' FOR SHARE;` : ''}
     SELECT ${bind(fid, 6)}; ROLLBACK;`);
    binding.catch(() => {});
    await waitForBlock(holder, pid);
    const resolution = holder.query(`${approve(6)} ROLLBACK;`);
    const results = await Promise.allSettled([resolution, binding]);
    const failures = results.filter(result => result.status === 'rejected');
    if (inverted) {
      assert.ok(failures.some(result => /(?:40P01|55P03)/.test(result.reason.message)),
        'decision→job-label negative control must deadlock or hit database lock_timeout');
      assert.ok(failures.every(result => /(?:40P01|55P03)/.test(result.reason.message)),
        'negative control must not pass on an unrelated SQL/connection failure');
    } else {
      assert.equal(failures.length, 0, 'native job-label→decision order completes under first-lock barrier');
    }
  } finally {
    // Failed psql exits roll back; successful calls explicitly roll back, so
    // both schedules leave the same submitted decision for the next schedule.
    await Promise.all([holder.close(), contender.close()]);
  }
}

test('C5 first-lock barrier rejects inversion and verification competes for sequence allocation', { timeout: 180000 }, async () => {
  assert.equal(process.env.EXTERNAL_FULFILMENT_DB_WINDOW, 'owned', 'orchestrator-handed committed DB window required');
  const sessions = new Set();
  const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open();
  let fixtureOwned = false;
  try {
    assert.equal(await a.query(`SELECT COALESCE((SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'),false)
     AND to_regprocedure('public.bind_fulfilment_evidence(uuid,uuid,text[],text)') IS NOT NULL;`), 't', 'committed C5 and enabled capability required');
    assert.equal(await a.query(`SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87c0000-%')
     AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f87c0000-%')
     AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id::text LIKE 'f87c0000-%');`), 't', 'all fictional fixture roots start empty');
    fixtureOwned = true;
    await a.query(`BEGIN; ${section('helpers')} ${section('fixture')} COMMIT;`);
    await a.query(begin(1));
    const fid = JSON.parse(await a.query(`SELECT public.create_external_fulfilment('${id(201)}','${id(301)}','pkg.client','client_furnishing',ARRAY['chair','table'],NULL,NULL,'create');`)).fulfilmentId;
    const c200 = JSON.parse(await a.query(`SELECT public.record_external_fulfilment_event(${quote(fid)},'contract_reported','{"contractAmountCents":200000}',NULL,'c200');`)).eventId;
    const c300 = JSON.parse(await a.query(`SELECT public.record_external_fulfilment_event(${quote(fid)},'contract_reported','{"contractAmountCents":300000}',NULL,'c300');`)).eventId;
    await a.query('COMMIT;');
    const b = open();
    await b.query(section('helpers'));
    const pidB = Number(await b.query('SELECT pg_backend_pid();'));
    assert.ok(Number.isInteger(pidB) && pidB > 0);

    await lockOrderBarrier(open, fid, false);
    await lockOrderBarrier(open, fid, true);
    assert.equal(await a.query(`SELECT NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_evidence_bindings WHERE decision_id='${id(606)}')
     AND (SELECT status='submitted' FROM public.coordination_item_revisions WHERE id='${id(706)}');`), 't', 'native and inverted barrier schedules both roll back');

    // Binder first: native approval really waits, then commits an approved round.
    await a.query(begin(1));
    await a.query(`SELECT ${bind(fid, 1)};`);
    const approval = b.query(`${begin(1)} ${approve(1)} COMMIT;`);
    // Attach a rejection handler before observing the waiting session.
    approval.catch(() => {});
    await waitForBlock(a, pidB);
    await a.query('COMMIT;');
    await approval;
    assert.equal(await a.query(`SELECT count(*)=1 AND bool_and(r.status='approved') FROM public.project_external_fulfilment_evidence_bindings binding
     JOIN public.coordination_item_revisions r ON r.decision_id=binding.decision_id WHERE binding.fulfilment_id=${quote(fid)} AND binding.decision_id='${id(601)}';`), 't', 'binder-first commits exactly one binding and native approval');

    // Approval first: binder waits, re-reads committed approval, refuses late bind.
    await a.query(`${begin(1)} ${approve(2)}`);
    const rejectedBind = b.query(`${begin(1)}
     DO $late$ BEGIN
      BEGIN PERFORM ${bind(fid, 2)};
      EXCEPTION WHEN check_violation THEN
       IF SQLERRM='fabrication_evidence_already_approved' THEN RETURN; END IF;
       RAISE;
      END;
      RAISE EXCEPTION 'ASSERTION FAILED: late binding was accepted';
     END $late$; COMMIT;`);
    rejectedBind.catch(() => {});
    await waitForBlock(a, pidB);
    await a.query('COMMIT;');
    await rejectedBind;
    assert.equal(await a.query(`SELECT NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_evidence_bindings WHERE decision_id='${id(602)}');`), 't', 'approval-first leaves no late binding');

    // Approval transaction starts earlier, but binds later: timestamps cannot
    // prove preapproval. Only the shared source-state locks give that guarantee.
    await a.query(begin(1));
    const approvalStart = await a.query('SELECT now()::text;');
    await b.query(`${begin(1)} SELECT ${bind(fid, 5)}; COMMIT;`);
    await a.query(`${approve(5)} COMMIT;`);
    assert.equal(await a.query(`SELECT b.bound_at>r.reviewed_at AND r.reviewed_at=${quote(approvalStart)}::timestamptz
     FROM public.project_external_fulfilment_evidence_bindings b JOIN public.coordination_item_revisions r ON r.decision_id=b.decision_id WHERE b.decision_id='${id(605)}';`), 't', 'binding precedes native approval despite later bound_at');

    // Earlier-started verifier commits last. B holds ONLY the first lock while
    // A enters the real verifier and blocks. B then verifies concurrently with
    // A's outstanding call, so both allocate sequences through the native seam.
    const pidA = Number(await a.query('SELECT pg_backend_pid();'));
    await a.query(begin(2));
    await a.query('SELECT now();');
    await b.query(`${begin(2)} ${firstLock}`);
    const laterVerification = a.query(`SELECT public.verify_external_fulfilment_event(${quote(c300)},'v300'); COMMIT;`);
    laterVerification.catch(() => {});
    await waitForBlock(b, pidA);
    await b.query(`SELECT public.verify_external_fulfilment_event(${quote(c200)},'v200'); COMMIT;`);
    await laterVerification;
    assert.equal(await a.query(`SELECT older.verified_at<newer.verified_at AND older.verification_seq=2 AND newer.verification_seq=1
     AND public._fabrication_instructed_amount_cents(${quote(fid)})=300000
     FROM public.project_external_fulfilment_events older CROSS JOIN public.project_external_fulfilment_events newer
     WHERE older.id=${quote(c300)} AND newer.id=${quote(c200)};`), 't', 'server amount follows higher verification_seq despite earlier transaction time');
  } finally {
    await Promise.all([...sessions].map(s => s.close()));
    if (fixtureOwned) {
      const cleaner = new Session();
      try {
        await cleaner.query(cleanup);
        assert.equal(await cleaner.query(`SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87c0000-%')
         AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id::text LIKE 'f87c0000-%')
         AND NOT EXISTS(SELECT 1 FROM public.project_external_fulfilments WHERE project_id::text LIKE 'f87c0000-%');`), 't', 'zero fictional fixture residue');
      } finally { await cleaner.close(); }
    }
  }
});
