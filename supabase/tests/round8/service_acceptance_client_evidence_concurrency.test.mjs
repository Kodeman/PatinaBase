// C4 §2.7 (SQ-2281 F2): the send pins every served evidence object under row locks, so a storage
// writer is totally ordered with it. Both orders, on the committed 00889 schema, OWNED local stack only.
// Run: node supabase/tests/round8/service_acceptance_client_evidence_concurrency.test.mjs
// Target: 127.0.0.1:${SQ_DB_PORT:-57322}; refuses the shared 54322. Never installs migrations. Fixtures
// reuse the "shared" sections of service_acceptance_client_evidence_test.sql under the f88f prefix,
// committed for the races and removed (FK closure from the owned roots) before and after. Inside the
// window it enables scope_editions and restores the value it found when it ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const port = process.env.SQ_DB_PORT || '57322';
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
const app = 'c4-evidence-race';
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const uid = n => `f88f0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const body = readFileSync(new URL('./service_acceptance_client_evidence_test.sql', import.meta.url), 'utf8')
  .replaceAll('f889', 'f88f').replaceAll('client-evidence', 'client-race');
function section(name) {
  const start = `-- BEGIN shared ${name}\n`;
  const end = `-- END shared ${name}`;
  assert.equal(body.split(start).length, 2, `one ${name} start marker`);
  assert.equal(body.split(end).length, 2, `one ${name} end marker`);
  return body.split(start)[1].split(end)[0];
}
// A transaction-local authenticated caller, so a later statement never inherits it.
const as = n => `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${literal(uid(n))};
  SET LOCAL request.jwt.claims=${literal(JSON.stringify({ sub: uid(n), role: 'authenticated' }))};`;
const send = n => `UPDATE public.outbound_drafts SET status='sent',delivered_at=now(),after_send_done_at=now()
  WHERE id=${literal(uid(200 + n))} AND after_send_done_at IS NULL RETURNING id;`;
const write = (path, tag) => `UPDATE storage.objects SET version=${literal(tag)},metadata=metadata||${literal(JSON.stringify({ eTag: tag }))}
  WHERE bucket_id='project-documents' AND name=${literal(path)} RETURNING id;`;

// Every SQLSTATE any session saw; the suite ends by proving none is 40P01.
const seen = [];
// Each process owns one backend. No ON_ERROR_STOP: a refusing statement keeps its
// transaction until ROLLBACK. psql's LAST_ERROR_* variables are cleared before each
// command, so a failure in ANY of its statements is reported.
class Session {
  constructor() {
    this.buffer = '';
    this.errors = '';
    this.pending = null;
    this.child = spawn('psql', [url, '-XAtq'], {
      stdio: ['pipe', 'pipe', 'pipe'], detached: true,
      env: { ...process.env, PGAPPNAME: app, PGCONNECT_TIMEOUT: '3',
        PGOPTIONS: '-c statement_timeout=60000 -c lock_timeout=10000' },
    });
    this.exited = new Promise(resolve => {
      this.child.once('error', error => { this.pending?.reject(error); resolve(); });
      this.child.once('exit', (code, signal) => {
        this.pending?.reject(new Error(`psql exit=${code} signal=${signal}: ${this.errors.slice(-2000)}`));
        this.pending = null;
        resolve();
      });
    });
    this.child.stderr.on('data', data => { this.errors = (this.errors + data).slice(-20000); });
    this.child.stdout.on('data', data => {
      this.buffer += data;
      if (!this.pending) return;
      const at = this.buffer.indexOf(`${this.pending.marker} `);
      const eol = at < 0 ? -1 : this.buffer.indexOf('\n', at);
      if (eol < 0) return;
      const out = this.buffer.slice(0, at).trim();
      const status = /^'([0-9A-Z]*)' ?(.*)$/.exec(this.buffer.slice(at + this.pending.marker.length + 1, eol));
      this.buffer = this.buffer.slice(eol + 1);
      const pending = this.pending;
      this.pending = null;
      if (!status) { pending.reject(new Error('unparseable psql status line')); return; }
      seen.push(status[1]);
      pending.resolve({ out, error: status[1] !== '', sqlstate: status[1] || '00000', message: status[2] });
    });
  }
  async query(sql) {
    assert.equal(this.pending, null, 'one command per session');
    const marker = `evidence_done_${randomUUID().replaceAll('-', '')}`;
    const result = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    const timer = setTimeout(() => this.kill(), 150000);
    try {
      this.child.stdin.write(`\\set LAST_ERROR_SQLSTATE ''\n\\set LAST_ERROR_MESSAGE ''\n${sql}\n` +
        `\\echo ${marker} :'LAST_ERROR_SQLSTATE' :LAST_ERROR_MESSAGE\n`);
      return await result;
    } finally { clearTimeout(timer); }
  }
  async ok(sql, name) {
    this.errors = '';
    const r = await this.query(sql);
    const first = this.errors.split('\n').find(line => line.includes('ERROR:')) ?? '';
    assert.equal(r.error, false, `${name}: ${r.sqlstate} ${r.message} (first: ${first})`);
    return r.out;
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

// Roots: every public/auth row whose uuid id carries the owned f88f prefix, and the
// fixture's storage objects (owner uid(1)). Then FK descendants, deleted with triggers off.
// The final cleanup first ends every straggling race backend (they hold no other work).
const cleanup = terminate => `
BEGIN;
SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='3s';
${terminate ? `SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity
 WHERE application_name=${literal(app)} AND pid<>pg_backend_pid();` : ''}
CREATE TEMP TABLE race_owned_rows(rel oid, row_id tid, PRIMARY KEY(rel,row_id));
DO $cleanup$
DECLARE root record; fk record; predicate text; added integer; total integer; pass integer:=0; owned record;
BEGIN
 FOR root IN SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='id' AND a.atttypid='uuid'::regtype AND NOT a.attisdropped
   WHERE n.nspname IN ('public','auth') AND c.relkind='r' LOOP
  EXECUTE format('INSERT INTO race_owned_rows SELECT %s,ctid FROM %s WHERE id::text LIKE %L',root.oid,root.oid::regclass,'f88f%');
 END LOOP;
 LOOP
  total:=0; pass:=pass+1;
  IF pass>30 THEN RAISE EXCEPTION 'fixture cleanup FK closure exceeded bound'; END IF;
  FOR fk IN SELECT c.* FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE c.contype='f' AND n.nspname IN ('public','auth') AND t.relkind='r' LOOP
   SELECT string_agg(format('child.%I=parent.%I',a.attname,b.attname),' AND ' ORDER BY keys.ord)
    INTO predicate FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(child_key,parent_key,ord)
    JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=keys.child_key
    JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=keys.parent_key;
   EXECUTE format('INSERT INTO race_owned_rows SELECT %s,child.ctid FROM %s child JOIN %s parent ON %s
    JOIN race_owned_rows owned ON owned.rel=%s AND owned.row_id=parent.ctid ON CONFLICT DO NOTHING',
    fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid);
   GET DIAGNOSTICS added=ROW_COUNT; total:=total+added;
  END LOOP;
  EXIT WHEN total=0;
 END LOOP;
 SET LOCAL session_replication_role=replica;
 FOR owned IN SELECT DISTINCT rel FROM race_owned_rows LOOP
  EXECUTE format('DELETE FROM %s target USING race_owned_rows owned WHERE owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel);
 END LOOP;
 DELETE FROM storage.objects WHERE bucket_id='project-documents' AND owner_id LIKE 'f88f0000-%';
 SET LOCAL session_replication_role=origin;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f88f%')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f88f%')
  OR EXISTS(SELECT 1 FROM storage.objects WHERE owner_id LIKE 'f88f%') THEN
  RAISE EXCEPTION 'fixture cleanup left roots';
 END IF;
END $cleanup$;
COMMIT;`;

test('C4 send pins served evidence objects, totally ordered with storage writers, both orders', { timeout: 300000 }, async () => {
  assert.match(port, /^[0-9]+$/, 'SQ_DB_PORT is a port number');
  assert.notEqual(port, '54322', 'never the shared 54322 stack');
  const sessions = new Set();
  const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open();
  const m = open();
  let fixtureOwned = false;
  let capabilityWas = null;
  try {
    const preflight = await a.ok(`SELECT current_user='postgres' AND current_setting('transaction_isolation')='read committed'
      AND to_regprocedure('public.get_my_service_acceptance_evidence(uuid)') IS NOT NULL
      AND to_regprocedure('public._service_acceptance_after_send()') IS NOT NULL;`, 'preflight');
    assert.equal(preflight, 't', 'committed 00889 on a read-committed postgres session required');
    // Ownership starts before the fixture can land (including a lost response); a
    // crashed earlier run's rows go first.
    fixtureOwned = true;
    const pre = await m.query(cleanup(false));
    assert.equal(pre.error, false, `pre-run cleanup: ${pre.sqlstate} ${pre.message}`);
    capabilityWas = await a.ok(`SELECT enabled FROM public.server_capabilities WHERE key='scope_editions';`, 'capability before');
    assert.ok(['t', 'f'].includes(capabilityWas), 'scope_editions capability row present');
    await a.ok(`BEGIN; SET LOCAL lock_timeout='3s'; ${section('helpers')} ${section('fixture')}
      SET LOCAL session_replication_role=replica; SELECT pg_temp.fixture_request(1); SET LOCAL session_replication_role=origin;
      COMMIT;`, 'fixture');
    const aPid = Number(await a.ok('SELECT pg_backend_pid();', 'pid'));
    const read = async sql => JSON.parse(await a.ok(`SELECT (${sql})::text;`, sql));
    const check = async (sql, name) => assert.equal(await a.ok(`SELECT (${sql});`, name), 't', name);
    const [doc1, doc3] = [await read('to_jsonb(pg_temp.doc_path(1))'), await read('to_jsonb(pg_temp.doc_path(3))')];
    const deadlocksBefore = Number(await m.ok('SELECT deadlocks FROM pg_stat_database WHERE datname=current_database();', 'deadlocks'));

    // The winner runs in session a and holds its locks until it commits; the loser
    // must queue behind it in a fresh session b.
    async function race(name, winner, loser) {
      const b = open();
      const bPid = Number(await b.ok('SELECT pg_backend_pid();', 'pid'));
      const won = await a.query(`BEGIN; ${winner}`);
      assert.equal(won.error, false, `${name}: the winner runs: ${won.sqlstate} ${won.message}`);
      assert.match(won.out, /^[0-9a-f-]{36}$/, `${name}: the winner touched exactly one row`);
      const waiting = b.query(`BEGIN; ${loser}`);
      waiting.catch(() => {});
      const queued = await m.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
        WHILE NOT ${aPid}=ANY(pg_blocking_pids(${bPid})) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: % loser did not wait on the winner',${literal(name)}; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $wait$;`);
      if (queued.error) {
        const settled = await Promise.race([waiting, new Promise(resolve => setTimeout(resolve, 500, 'still running'))]);
        assert.fail(`${name}: the loser did not wait on the winner; loser=${JSON.stringify(settled)}`);
      }
      await a.ok('COMMIT;', `${name}: winner commits`);
      const lost = await waiting;
      await b.ok(lost.error ? 'ROLLBACK;' : 'COMMIT;', `${name}: loser ends`);
      await b.close(); sessions.delete(b);
      for (const r of [won, lost]) assert.notEqual(r.sqlstate, '40P01', `${name}: no deadlock`);
      return { won, lost };
    }
    const signer = async (path, name) => {
      const out = await a.ok(`BEGIN; ${as(6)} SELECT jsonb_build_object('admitted',public._can_read_service_acceptance_evidence_object(
        ${literal(path)}),'objects',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'version',version,'eTag',metadata->>'eTag')),'[]')
        FROM storage.objects WHERE bucket_id='project-documents' AND name=${literal(path)}))::text; COMMIT;`, name);
      return JSON.parse(out);
    };
    const pinned = (request, path) => read(`(SELECT jsonb_build_object('id',p.object_id,'version',p.object_version)
      FROM public.service_acceptance_evidence_snapshot_objects p WHERE p.request_id=${literal(uid(100 + request))}
       AND p.bucket_id='project-documents' AND p.object_name=${literal(path)})`);
    const refusedOverwrite = async (path, name) => {
      const r = await a.query(`BEGIN; ${as(1)} ${write(path, 'after-send')}`);
      await a.ok('ROLLBACK;', `${name}: rollback`);
      assert.equal(r.error, true, `${name}: refused`);
      assert.equal(r.sqlstate, '23514', `${name}: check_violation, got ${r.sqlstate} ${r.message}`);
      assert.match(r.message, /bound by a sent request/, name);
    };

    // Writer first: the studio replaces document 1 while the send is due. The send's
    // FOR SHARE pin waits for it and pins the committed replacement, never the old row.
    let r = await race('writer-before-send', `${as(1)} ${write(doc1, 'race-v2')}`, send(1));
    assert.equal(r.lost.error, false, `writer-before-send: the send commits: ${r.lost.sqlstate} ${r.lost.message}`);
    await check(`(SELECT lifecycle='sent' AND sent_at IS NOT NULL FROM public.service_acceptance_requests WHERE id=${literal(uid(101))})`,
      'writer-before-send: the request is sent');
    let live = await read(`(SELECT jsonb_build_object('id',id,'version',version) FROM storage.objects
      WHERE bucket_id='project-documents' AND name=${literal(doc1)})`);
    assert.deepEqual(live, { id: r.won.out, version: 'race-v2' }, 'writer-before-send: the replacement committed');
    assert.deepEqual(await pinned(1, doc1), live, 'writer-before-send: the send pinned the committed replacement');
    assert.deepEqual(await signer(doc1, 'writer-before-send signer'), { admitted: true,
      objects: [{ id: live.id, version: 'race-v2', eTag: 'race-v2' }] }, 'writer-before-send: the signer reads the pinned object');
    await refusedOverwrite(doc1, 'writer-before-send: a post-send replacement');
    assert.deepEqual(await signer(doc1, 'writer-before-send signer again'), { admitted: true,
      objects: [{ id: live.id, version: 'race-v2', eTag: 'race-v2' }] }, 'writer-before-send: no post-send replacement is served');

    // Send first: the send pins document 3 (manifest3) and holds it; the studio's
    // replacement waits, then meets the committed pin and is refused.
    await a.ok(`BEGIN; SET LOCAL session_replication_role=replica;
      UPDATE public.service_acceptance_requests SET lifecycle='superseded',superseded_reason='successor_request',superseded_at=now()
       WHERE id=${literal(uid(101))};
      SELECT pg_temp.fixture_request(2,'manifest3'); COMMIT;`, 'second draft request on manifest3');
    const before = await read(`(SELECT jsonb_build_object('id',id,'version',version) FROM storage.objects
      WHERE bucket_id='project-documents' AND name=${literal(doc3)})`);
    r = await race('send-before-writer', send(2), `${as(1)} ${write(doc3, 'late-v2')}`);
    assert.equal(r.lost.error, true, 'send-before-writer: the queued replacement is refused');
    assert.equal(r.lost.sqlstate, '23514', `send-before-writer: check_violation, got ${r.lost.sqlstate} ${r.lost.message}`);
    assert.match(r.lost.message, /bound by a sent request/, 'send-before-writer: refused by the evidence freeze');
    live = await read(`(SELECT jsonb_build_object('id',id,'version',version) FROM storage.objects
      WHERE bucket_id='project-documents' AND name=${literal(doc3)})`);
    assert.deepEqual(live, before, 'send-before-writer: the object is unchanged');
    assert.deepEqual(await pinned(2, doc3), before, 'send-before-writer: the pin is the object as it stood at send');
    assert.deepEqual(await signer(doc3, 'send-before-writer signer'), { admitted: true,
      objects: [{ id: before.id, version: null, eTag: null }] }, 'send-before-writer: the signer reads the pinned original');

    // No 40P01 anywhere: per statement, and in the database's deadlock counter.
    assert.ok(!seen.includes('40P01'), 'no statement raised 40P01');
    await m.ok('SELECT pg_sleep(0.5); SELECT pg_stat_clear_snapshot();', 'stats settle');
    const deadlocksAfter = Number(await m.ok('SELECT deadlocks FROM pg_stat_database WHERE datname=current_database();', 'deadlocks'));
    assert.equal(deadlocksAfter, deadlocksBefore, 'pg_stat_database counted no deadlock during the races');
  } finally {
    // Close every session even after an assertion or timeout, then use a fresh backend
    // (which also terminates any straggler) so an aborted transaction cannot block cleanup.
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.exited));
    if (fixtureOwned || capabilityWas !== null) {
      const cleaner = new Session();
      try {
        if (fixtureOwned) {
          const result = await cleaner.query(cleanup(true));
          assert.equal(result.error, false, `fixture cleanup: ${result.sqlstate} ${result.message}`);
        }
        if (capabilityWas !== null) {
          await cleaner.ok(`UPDATE public.server_capabilities SET enabled=${capabilityWas === 't'} WHERE key='scope_editions';`,
            'capability restored');
        }
      } finally { await cleaner.close(); }
    }
  }
});
