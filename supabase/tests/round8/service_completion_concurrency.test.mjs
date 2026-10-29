// N(service_completion). C6 §2.11 F7 races on the committed 00888 schema, owned LOCAL DB window only.
// Never installs migrations. Refuses without ownership. Inside the owned window it enables
// scope_editions and restores the value it found when it ends.
// Run: node --test --test-concurrency=1 supabase/tests/round8/service_completion_concurrency.test.mjs
// Required env: SERVICE_COMPLETION_DB_WINDOW=owned and ROUND8_DB_URL naming the owned stack.
// Fixtures reuse the "shared" sections of service_completion_test.sql under the f88e prefix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from './owned_psql.mjs';

const url = round8DbUrl();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const uid = n => `f88e0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const body = readFileSync(new URL('./service_completion_test.sql', import.meta.url), 'utf8').replaceAll('f888', 'f88e');
function section(name) {
  const start = `-- BEGIN shared ${name}\n`;
  const end = `-- END shared ${name}`;
  assert.equal(body.split(start).length, 2, `one ${name} start marker`);
  assert.equal(body.split(end).length, 2, `one ${name} end marker`);
  return body.split(start)[1].split(end)[0];
}
// A transaction-local caller, so a later statement never inherits it.
const as = n => `SET LOCAL request.jwt.claim.sub=${literal(uid(n))};
  SET LOCAL request.jwt.claims=${literal(JSON.stringify({ sub: uid(n), role: 'authenticated' }))};`;

// Every SQLSTATE any session saw; the suite ends by proving none is 40P01.
const seen = [];
// Each process owns one backend. No ON_ERROR_STOP: a refusing completion keeps its
// locks until ROLLBACK, so a queued writer can be observed waiting behind it. psql's
// LAST_ERROR_* variables are cleared before each command, so a failure in ANY of its
// statements is reported (a COMMIT after an error only rolls back, without an error).
class Session {
  constructor() {
    this.buffer = '';
    this.errors = '';
    this.pending = null;
    this.child = spawn('psql', [url, '-XAtq'], {
      stdio: ['pipe', 'pipe', 'pipe'], detached: true,
      env: { ...process.env, PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=10000' },
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
    const marker = `completion_done_${randomUUID().replaceAll('-', '')}`;
    const result = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    const timer = setTimeout(() => this.kill(), 30000);
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

// Follow FK descendants of ONLY the owned fictional identities/studios, plus the
// owned product rows (catalogue rows hang off no fixture identity).
const cleanup = `
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE completion_owned_rows(rel oid, row_id tid, PRIMARY KEY(rel,row_id));
INSERT INTO completion_owned_rows SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f88e0000-%';
INSERT INTO completion_owned_rows SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f88e1000-%';
INSERT INTO completion_owned_rows SELECT 'public.vendors'::regclass,ctid FROM public.vendors WHERE id::text LIKE 'f88ea000-%';
INSERT INTO completion_owned_rows SELECT 'public.products'::regclass,ctid FROM public.products WHERE id::text LIKE 'f88ea000-%';
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
   EXECUTE format('INSERT INTO completion_owned_rows SELECT %s,child.ctid FROM %s child JOIN %s parent ON %s
    JOIN completion_owned_rows owned ON owned.rel=%s AND owned.row_id=parent.ctid ON CONFLICT DO NOTHING',
    fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid);
   GET DIAGNOSTICS added=ROW_COUNT; total:=total+added;
  END LOOP;
  EXIT WHEN total=0;
 END LOOP;
 SET LOCAL session_replication_role=replica;
 FOR owned IN SELECT DISTINCT rel FROM completion_owned_rows LOOP
  EXECUTE format('DELETE FROM %s target USING completion_owned_rows owned WHERE owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel);
 END LOOP;
 SET LOCAL session_replication_role=origin;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f88e0000-%')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f88e1000-%')
  OR EXISTS(SELECT 1 FROM public.products WHERE id::text LIKE 'f88ea000-%') THEN
  RAISE EXCEPTION 'fixture cleanup left roots';
 END IF;
 FOR owned IN SELECT DISTINCT rel FROM completion_owned_rows LOOP
  EXECUTE format('SELECT count(*) FROM %s target JOIN completion_owned_rows owned ON owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel) INTO added;
  IF added<>0 THEN RAISE EXCEPTION 'fixture cleanup left rows in %',owned.rel::regclass; END IF;
 END LOOP;
END $cleanup$;
COMMIT;`;

test('C6 completion is totally ordered with every contributing writer, both orders, no 40P01', { timeout: 300000 }, async () => {
  assert.equal(process.env.SERVICE_COMPLETION_DB_WINDOW, 'owned', 'orchestrator-owned committed DB window required');
  const sessions = new Set();
  const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open();
  const m = open();
  let fixtureOwned = false;
  let capabilityWas = null;
  try {
    const preflight = await a.ok(`SELECT current_user='postgres' AND current_setting('transaction_isolation')='read committed' AND
      to_regprocedure('public.complete_studio_service(uuid,uuid,text,text)') IS NOT NULL AND
      NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f88e%') AND
      NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f88e%') AND
      NOT EXISTS(SELECT 1 FROM public.products WHERE id::text LIKE 'f88e%');`, 'preflight');
    assert.equal(preflight, 't', 'committed 00888 and empty owned fixture prefix required');
    // Restored in finally, even when the enabling statement's response is lost.
    capabilityWas = await a.ok(`SELECT enabled FROM public.server_capabilities WHERE key='scope_editions';`, 'capability before');
    assert.ok(['t', 'f'].includes(capabilityWas), 'scope_editions capability row present');
    await a.ok(`UPDATE public.server_capabilities SET enabled=true WHERE key='scope_editions';`, 'capability on for the window');
    const deadlocksBefore = Number(await m.ok('SELECT deadlocks FROM pg_stat_database WHERE datname=current_database();', 'deadlocks'));
    // Ownership starts before the commit can land (including a lost response).
    fixtureOwned = true;
    await a.ok(`BEGIN; ${section('assertion helpers')} ${section('fixture')} ${section('native helpers')}
      ${section('origin')} ${section('completion helpers')}
      SELECT pg_temp.actor(1); SELECT pg_temp.finish_phases();
      INSERT INTO sa_results VALUES('q1',pg_temp.create('c-q1')); SELECT pg_temp.deliver(pg_temp.req('q1'));
      COMMIT;`, 'fixture');
    const aPid = Number(await a.ok('SELECT pg_backend_pid();', 'pid'));
    const read = async sql => JSON.parse(await a.ok(`SELECT (${sql})::text;`, sql));
    const check = async (sql, name) => assert.equal(await a.ok(`SELECT (${sql});`, name), 't', name);
    const setup = async (sql, name) => a.ok(`BEGIN; SELECT pg_temp.actor(1); ${sql} COMMIT;`, name);
    const project = await read('to_jsonb(pg_temp.project())');
    const view = () => read(`jsonb_build_object('req',pg_temp.current_req(),'hash',pg_temp.hash(),'codes',to_jsonb(pg_temp.codes()))`);
    const complete = (v, key) => `SELECT public.complete_studio_service(${literal(project)},${literal(v.req)},${literal(v.hash)},${literal(key)})::text;`;
    const live = () => read(`(SELECT to_jsonb(c) FROM public.studio_service_completions c WHERE project_id=pg_temp.project() AND revoked_at IS NULL)`);
    const revoke = async name => {
      const c = await live();
      assert.ok(c, `${name}: a live completion to revoke`);
      await a.ok(`BEGIN; ${as(1)} SELECT public.revoke_studio_service_completion(${literal(c.id)},'Race reset')::text; COMMIT;`, `${name} revoke`);
    };
    const ready = async name => check(`pg_temp.codes()='{}' AND NOT EXISTS(SELECT 1 FROM public.studio_service_completions
      WHERE project_id=pg_temp.project() AND revoked_at IS NULL)`, `${name}: back to a ready, uncompleted service`);

    // The winner runs in session a and keeps its locks until it commits; the loser must
    // queue behind it in b. Commands end with the measured statement. A winner that
    // REFUSES has already released its locks: PostgreSQL's AbortTransaction releases
    // them at the error, not at the later ROLLBACK. Such a winner is ordered first
    // without a wait (waits: false), and the loser then runs alone.
    async function race(name, winner, loser, { waits = true } = {}) {
      const b = open();
      const bPid = Number(await b.ok('SELECT pg_backend_pid();', 'pid'));
      const won = await a.query(`BEGIN; ${as(winner.actor)} ${winner.sql}`);
      if (!waits) assert.equal(won.error, true, `${name}: an unwaited winner is a refusal`);
      const waiting = b.query(`BEGIN; ${as(loser.actor)} ${loser.sql}`);
      waiting.catch(() => {});
      const queued = !waits ? { error: false } : await m.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
        WHILE NOT ${aPid}=ANY(pg_blocking_pids(${bPid})) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: % loser did not wait on the winner',${literal(name)}; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $wait$;`);
      if (queued.error) {
        const settled = await Promise.race([waiting, new Promise(resolve => setTimeout(resolve, 500, 'still running'))]);
        assert.fail(`${name}: loser did not wait on the winner; winner=${JSON.stringify(won)} loser=${JSON.stringify(settled)}`);
      }
      await a.ok(won.error ? 'ROLLBACK;' : 'COMMIT;', `${name}: winner ends`);
      const lost = await waiting;
      await b.ok(lost.error ? 'ROLLBACK;' : 'COMMIT;', `${name}: loser ends`);
      await b.close(); sessions.delete(b);
      for (const r of [won, lost]) assert.notEqual(r.sqlstate, '40P01', `${name}: no deadlock`);
      return { won, lost };
    }
    const refused = (r, codes, name) => {
      assert.equal(r.error, true, `${name}: completion refuses`);
      assert.ok(codes.some(([state, text]) => r.sqlstate === state && r.message.includes(text)),
        `${name}: expected one of ${JSON.stringify(codes)}, got ${r.sqlstate} ${r.message}`);
    };
    const succeeded = (r, name) => assert.equal(r.error, false, `${name}: ${r.sqlstate} ${r.message}`);
    const writeFirstRefuses = [['23514', 'service_obligations_open'], ['PT409', 'stale_obligations']];

    // C4 response (request q1 sent, nobody has answered).
    const q1 = await read(`(SELECT jsonb_build_object('id',id,'scope',scope_content_hash,'manifest',evidence_manifest_hash,
      'rev',signer_policy_revision) FROM public.service_acceptance_requests WHERE id=pg_temp.req('q1'))`);
    const respond = (response, conditions, key) => `SELECT public.respond_service_acceptance(${literal(q1.id)},${literal(response)},
      ${literal(JSON.stringify(conditions))},NULL,${literal(q1.scope)},${literal(q1.manifest)},${q1.rev},${literal(key)},'portal_authenticated')::text;`;
    // A completion cannot commit before the response that records the acceptance, so in
    // this order it refuses on acceptance_not_accepted and the response commits after it.
    let v = await view();
    assert.deepEqual(v.codes, ['acceptance_not_accepted'], 'only the acceptance blocks before the race');
    let r = await race('C4 completion-first', { actor: 1, sql: complete(v, 'k-c4-a') },
      { actor: 5, sql: respond('accept_with_conditions', [{ text: 'Touch up the paint' }, { text: 'Replace the knob' }], 'x-c4-a') },
      { waits: false });
    refused(r.won, [['23514', 'acceptance_not_accepted']], 'C4 completion-first');
    succeeded(r.lost, 'C4 completion-first: the queued response commits after it');
    v = await view();
    r = await race('C4 response-first', { actor: 6, sql: respond('accept', [], 'x-c4-b') },
      { actor: 1, sql: complete(v, 'k-c4-b') });
    succeeded(r.won, 'C4 response-first: the response commits');
    refused(r.lost, [['PT409', 'stale_obligations']], 'C4 response-first: completion sees the acceptance and refuses its stale hash');
    await check(`(SELECT lifecycle='closed' AND aggregate_outcome='accepted_with_conditions' FROM public.service_acceptance_requests
      WHERE id=pg_temp.req('q1')) AND jsonb_array_length(pg_temp.derive()->'conditions')=2 AND pg_temp.codes()='{}'`,
    'C4: accepted with two open conditions, no blockers');

    // resolve_service_acceptance_condition (K3 Option A).
    const condition = n => read(`to_jsonb(pg_temp.condition(pg_temp.req('q1'),${n}))`);
    const [c1, c2] = [await condition(1), await condition(2)];
    const resolve = (c, key) => `SELECT public.resolve_service_acceptance_condition(${literal(q1.id)},${literal(c)},'Done on site',
      '{"issueId":"f88ee000-0000-4000-8000-000000000001"}',${literal(key)})::text;`;
    v = await view();
    r = await race('resolution-first', { actor: 1, sql: resolve(c1, 'r-1') }, { actor: 1, sql: complete(v, 'k-res-a') });
    succeeded(r.won, 'resolution-first: the resolution commits');
    refused(r.lost, [['PT409', 'stale_obligations']], 'resolution-first: completion refuses the pre-resolution hash');
    v = await view();
    r = await race('completion-first resolution', { actor: 1, sql: complete(v, 'k-res-b') }, { actor: 3, sql: resolve(c2, 'r-2') });
    succeeded(r.won, 'completion-first resolution: completion commits');
    assert.equal(JSON.parse(r.won.out).state, 'completed_with_conditions');
    succeeded(r.lost, 'completion-first resolution: the queued resolution commits after it');
    assert.equal(JSON.parse(r.lost.out).completionState, 'completed', 'the last resolution moves the completion to completed');
    await check(`(SELECT state='completed' AND conditions_closed_at IS NOT NULL AND open_condition_ids=ARRAY[${literal(c2)}]::uuid[]
      FROM public.studio_service_completions WHERE project_id=pg_temp.project() AND revoked_at IS NULL)`,
    'Option A: the completion closed in the resolution transaction');
    await revoke('resolution');
    await ready('resolution');

    // Keyed completions racing (SQ-2257). The loser passes the cheap pre-lock lookup
    // while the winner is uncommitted, then reads the winner's receipt after the key.
    const receipt = res => JSON.parse(res.out);
    v = await view();
    r = await race('identical completions', { actor: 1, sql: complete(v, 'k-twin') }, { actor: 1, sql: complete(v, 'k-twin') });
    succeeded(r.won, 'identical completions: the first commits');
    succeeded(r.lost, 'identical completions: the queued twin returns a receipt');
    assert.equal(receipt(r.lost).replayed, true, 'identical completions: the twin replays');
    assert.equal(receipt(r.lost).completionId, receipt(r.won).completionId, 'identical completions: one completion');
    await revoke('identical completions');
    await ready('identical completions');
    v = await view();
    r = await race('same key, another actor', { actor: 1, sql: complete(v, 'k-reuse-actor') }, { actor: 3, sql: complete(v, 'k-reuse-actor') });
    succeeded(r.won, 'same key, another actor: the first commits');
    refused(r.lost, [['23505', 'idempotency_key_reused']], 'same key, another actor');
    await revoke('same key, another actor');
    await ready('same key, another actor');
    v = await view();
    r = await race('same key, another body', { actor: 1, sql: complete(v, 'k-reuse-body') },
      { actor: 1, sql: complete({ ...v, hash: '0'.repeat(64) }, 'k-reuse-body') });
    succeeded(r.won, 'same key, another body: the first commits');
    refused(r.lost, [['23505', 'idempotency_key_reused']], 'same key, another body');
    await revoke('same key, another body');
    await ready('same key, another body');
    v = await view();
    r = await race('different keys', { actor: 1, sql: complete(v, 'k-diff-a') }, { actor: 1, sql: complete(v, 'k-diff-b') });
    succeeded(r.won, 'different keys: the first commits');
    refused(r.lost, [['23505', 'service_already_completed']], 'different keys');
    await revoke('different keys');
    await ready('different keys');

    // SQ-2256 schedule: a first completion (a), two resolvers of its request (b, c) and
    // a key holder (x) queued between them. Before the step-3 request lock, b saw no
    // completion row, c locked the committed row and waited on the key, and b then
    // waited on c's row: a hard 40P01. Now b and c queue on the request instead.
    await setup(`SELECT pg_temp.accepted('q2','[{"text":"Rehang the door"}]');`, 'second request with one condition');
    const q2 = await read(`to_jsonb(pg_temp.req('q2'))`);
    const c3 = await read(`to_jsonb(pg_temp.condition(pg_temp.req('q2'),1))`);
    const resolveQ2 = key => `SELECT public.resolve_service_acceptance_condition(${literal(q2)},${literal(c3)},'Door rehung',
      '{"issueId":"f88ee000-0000-4000-8000-000000000001"}',${literal(key)})::text;`;
    v = await view();
    assert.equal(v.req, q2, 'q2 is the current request');
    assert.deepEqual(v.codes, [], 'q2 leaves no blocker');
    const [rb, rc, kx] = [open(), open(), open()];
    const pidOf = async s => Number(await s.ok('SELECT pg_backend_pid();', 'pid'));
    const [bPid, cPid, xPid] = [await pidOf(rb), await pidOf(rc), await pidOf(kx)];
    const blocked = (pid, by, name) => m.ok(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
      WHILE NOT ${by === null ? `cardinality(pg_blocking_pids(${pid}))>0` : `${by}=ANY(pg_blocking_pids(${pid}))`} LOOP
        IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: % did not wait',${literal(name)}; END IF;
        PERFORM pg_sleep(0.02);
      END LOOP;
    END $wait$;`, name);
    const first = await a.query(`BEGIN; ${as(1)} ${complete(v, 'k-three')}`);
    succeeded(first, 'three sessions: the first completion holds the key');
    const held = kx.query(`BEGIN; SELECT pg_advisory_xact_lock_shared(public._service_obligation_key(${literal(project)}));`);
    held.catch(() => {});
    await blocked(xPid, aPid, 'three sessions: the key holder queues behind the completion');
    const bRun = rb.query(`BEGIN; ${as(1)} ${resolveQ2('r-three-b')}`);
    bRun.catch(() => {});
    await blocked(bPid, aPid, 'three sessions: resolver b waits on the completion');
    await a.ok('COMMIT;', 'three sessions: the completion commits');
    succeeded(await held, 'three sessions: the key holder takes the key');
    await blocked(bPid, xPid, 'three sessions: resolver b waits on the key holder');
    const cRun = rc.query(`BEGIN; ${as(3)} ${resolveQ2('r-three-c')}`);
    cRun.catch(() => {});
    await blocked(cPid, null, 'three sessions: resolver c waits');
    await kx.ok('COMMIT;', 'three sessions: the key holder ends');
    const bDone = await bRun;
    await rb.ok(bDone.error ? 'ROLLBACK;' : 'COMMIT;', 'three sessions: resolver b ends');
    const cDone = await cRun;
    await rc.ok(cDone.error ? 'ROLLBACK;' : 'COMMIT;', 'three sessions: resolver c ends');
    for (const s of [rb, rc, kx]) { await s.close(); sessions.delete(s); }
    for (const done of [bDone, cDone]) assert.notEqual(done.sqlstate, '40P01', 'three sessions: no deadlock');
    succeeded(bDone, 'three sessions: resolver b resolves the last condition');
    assert.equal(receipt(bDone).completionState, 'completed', 'three sessions: b moves the completion to completed');
    refused(cDone, [['23505', 'service_acceptance_condition_resolved']], 'three sessions: resolver c');
    await check(`(SELECT count(*)=1 FROM public.service_acceptance_condition_resolutions WHERE request_id=${literal(q2)})
      AND (SELECT count(*)=1 AND bool_and(state='completed' AND conditions_closed_at IS NOT NULL)
        FROM public.studio_service_completions WHERE project_id=pg_temp.project() AND revoked_at IS NULL)`,
    'three sessions: one resolution and one completed completion');
    await revoke('three sessions');
    await ready('three sessions');

    // A stale hash is refused (PT409), and so is REPEATABLE READ.
    v = await view();
    let x = await a.query(`BEGIN; ${as(1)} ${complete({ ...v, hash: '0'.repeat(64) }, 'k-stale')}`);
    await a.ok('ROLLBACK;', 'stale ends');
    refused(x, [['PT409', 'stale_obligations']], 'a stale obligation hash');
    x = await a.query(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${as(1)} ${complete(v, 'k-rr')}`);
    await a.ok('ROLLBACK;', 'repeatable read ends');
    refused(x, [['25000', 'service_completion_requires_read_committed']], 'REPEATABLE READ');

    // place_product_in_project_v2 places a new live studio line (the governing case).
    await setup(`SET LOCAL session_replication_role=replica;
      INSERT INTO public.products(id,name,captured_at,layer,owner_user_id,price_trade,price_retail,configuration_mode)
      VALUES('f88ea000-0000-4000-8000-000000000002','Completion race lamp',now(),'personal',pg_temp.uid(1),30000,50000,'standard');
      SET LOCAL session_replication_role=origin;`, 'product fixture');
    const place = key => `SELECT public.place_product_in_project_v2(jsonb_build_object('projectId',${literal(project)},
      'productId','f88ea000-0000-4000-8000-000000000002','assignmentScope','throughout','disposition','selected',
      'duplicateMode','create','idempotencyKey',${literal(key)}))::text;`;
    const lines = () => read(`(SELECT count(*) FROM public.project_ffe_items WHERE project_id=pg_temp.project() AND removed_at IS NULL)`);
    await setup(`INSERT INTO sa_results VALUES('lines-before',(SELECT COALESCE(jsonb_agg(id),'[]') FROM public.project_ffe_items
      WHERE project_id=pg_temp.project() AND removed_at IS NULL));`, 'live lines before placement');
    const linesBefore = await lines();
    const retireLines = `SELECT pg_temp.replica(true);
      UPDATE public.project_ffe_items SET removed_at=now(),removed_by=pg_temp.uid(1),removal_reason='Race reset'
      WHERE project_id=pg_temp.project() AND removed_at IS NULL AND NOT pg_temp.v('lines-before') @> jsonb_build_array(id);
      SELECT pg_temp.replica(false);`;
    v = await view();
    r = await race('placement-first', { actor: 1, sql: place('place-a') }, { actor: 1, sql: complete(v, 'k-place-a') });
    succeeded(r.won, 'placement-first: the line is placed');
    refused(r.lost, writeFirstRefuses, 'placement-first: completion sees the new line');
    assert.equal(await lines(), linesBefore + 1, 'placement-first: one new live line');
    await setup(retireLines, 'retire placed line');
    await ready('placement-first');
    v = await view();
    r = await race('completion-first placement', { actor: 1, sql: complete(v, 'k-place-b') }, { actor: 1, sql: place('place-b') });
    succeeded(r.won, 'completion-first placement: completion commits');
    succeeded(r.lost, 'completion-first placement: the placement commits after it');
    assert.equal(await lines(), linesBefore + 1, 'completion-first placement: the line lands against a completed service');
    await revoke('placement');
    await setup(retireLines, 'retire placed line');
    await ready('placement');

    // A direct-table FF&E status regression from installed. Lines that a race updates get
    // their selection thread, which the deferred primary-thread check reads at commit.
    const thread = n => `SELECT pg_temp.replica(true); INSERT INTO public.project_ffe_selection_threads(id,project_id,
      primary_ffe_item_id,created_by) VALUES(pg_temp.fid('b000',${n}),pg_temp.project(),pg_temp.fid('b000',${n}),pg_temp.uid(1));
      SELECT pg_temp.replica(false);`;
    await setup(`SELECT pg_temp.package('pkg.race','included','{"purchasing":"studio","payer":"studio"}');
      SELECT pg_temp.line(21,'pkg.race','installed'); ${thread(21)}`, 'installed studio line');
    await ready('installed line');
    // authenticated holds no UPDATE grant on project_ffe_items, so the direct write is the service path's.
    const regress = `WITH u AS (UPDATE public.project_ffe_items SET status='delivered'
      WHERE id='f88eb000-0000-4000-8000-000000000021' RETURNING 1) SELECT count(*) FROM u;`;
    const reinstall = `SELECT pg_temp.line(21,'pkg.race','installed');`;
    v = await view();
    r = await race('status-regression-first', { actor: 1, sql: regress }, { actor: 1, sql: complete(v, 'k-ffe-a') });
    assert.equal(r.won.out, '1', `status-regression-first: the studio RLS write lands (${r.won.message})`);
    refused(r.lost, [['23514', 'studio_line_open']], 'status-regression-first: completion sees the regression');
    await setup(reinstall, 'reinstall');
    v = await view();
    r = await race('completion-first status regression', { actor: 1, sql: complete(v, 'k-ffe-b') }, { actor: 1, sql: regress });
    succeeded(r.won, 'completion-first status regression: completion commits');
    assert.equal(r.lost.out, '1', `completion-first status regression: the write lands after it (${r.lost.message})`);
    await revoke('status regression');
    await setup(reinstall, 'reinstall');
    await ready('status regression');

    // A phase reopened from completed (direct table write).
    const phase = await read(`to_jsonb((SELECT project_phase_id FROM public.project_scope_edition_phases
      WHERE edition_id=pg_temp.ed() AND package_key='pkg.kitchen' AND service_slot='design'))`);
    const reopen = `WITH u AS (UPDATE public.project_phases SET status='in_progress',completed_at=NULL
      WHERE id=${literal(phase)} AND status='completed' RETURNING 1) SELECT count(*) FROM u;`;
    const reclose = `SELECT pg_temp.finish_phases();`;
    v = await view();
    r = await race('phase-reopen-first', { actor: 1, sql: reopen }, { actor: 1, sql: complete(v, 'k-phase-a') });
    assert.equal(r.won.out, '1', `phase-reopen-first: the phase reopens (${r.won.message})`);
    refused(r.lost, [['23514', 'agreed_phase_open']], 'phase-reopen-first: completion sees the open phase');
    await setup(reclose, 'reclose phase');
    v = await view();
    r = await race('completion-first phase reopen', { actor: 1, sql: complete(v, 'k-phase-b') }, { actor: 1, sql: reopen });
    succeeded(r.won, 'completion-first phase reopen: completion commits');
    assert.equal(r.lost.out, '1', `completion-first phase reopen: the reopen lands after it (${r.lost.message})`);
    await revoke('phase reopen');
    await setup(reclose, 'reclose phase');
    await ready('phase reopen');

    // A client_decisions insert and a scope_change_requests insert.
    const decide = n => `INSERT INTO public.client_decisions(id,designer_id,designer_client_id,project_id,title,status)
      VALUES('f88ee100-0000-4000-8000-00000000000${n}',${literal(uid(1))},'f88e2000-0000-4000-8000-000000000001',
      ${literal(project)},'Race decision','pending');`;
    const expire = `SELECT pg_temp.replica(true); UPDATE public.client_decisions SET status='expired' WHERE id::text LIKE 'f88ee100-%';
      SELECT pg_temp.replica(false);`;
    const change = n => `INSERT INTO public.scope_change_requests(id,project_id,requested_by,title,description)
      VALUES('f88ee200-0000-4000-8000-00000000000${n}',${literal(project)},${literal(uid(1))},
      'Race change','Add a window seat');`;
    const cancel = `SELECT pg_temp.replica(true); UPDATE public.scope_change_requests SET status='cancelled'
      WHERE id::text LIKE 'f88ee200-%'; SELECT pg_temp.replica(false);`;
    for (const [label, write, undo, code] of [['client decision', decide, expire, 'client_decision_unresolved'],
      ['scope change', change, cancel, 'scope_change_unresolved']]) {
      v = await view();
      r = await race(`${label}-first`, { actor: 1, sql: write(1) }, { actor: 1, sql: complete(v, `k-${code}-a`) });
      succeeded(r.won, `${label}-first: the insert commits`);
      refused(r.lost, [['23514', code]], `${label}-first: completion sees it`);
      await setup(undo, `settle ${label}`);
      v = await view();
      r = await race(`completion-first ${label}`, { actor: 1, sql: complete(v, `k-${code}-b`) }, { actor: 1, sql: write(2) });
      succeeded(r.won, `completion-first ${label}: completion commits`);
      succeeded(r.lost, `completion-first ${label}: the insert commits after it`);
      await revoke(label);
      await setup(undo, `settle ${label}`);
      await ready(label);
    }

    // C5: a converted line reversed with set_ffe_item_external_fulfilment.
    await setup(`SELECT pg_temp.package('pkg.ext','included','{"installation":"gc"}');
      SELECT pg_temp.fulfilment(61,'pkg.ext','received'); SELECT pg_temp.line(61,'pkg.ext','specified'); ${thread(61)}`,
    'external fixture');
    const lineVersion = () => read(`(SELECT row_version FROM public.project_ffe_items WHERE id='f88eb000-0000-4000-8000-000000000061')`);
    const convert = async key => setup(`SELECT public.set_ffe_item_external_fulfilment('f88eb000-0000-4000-8000-000000000061',
      'f88ed000-0000-4000-8000-000000000061',${await lineVersion()},${literal(key)});`, `convert ${key}`);
    const reverse = async key => `SELECT public.set_ffe_item_external_fulfilment('f88eb000-0000-4000-8000-000000000061',
      NULL,${await lineVersion()},${literal(key)})::text;`;
    const isStudio = () => read(`(SELECT external_fulfilment_id IS NULL FROM public.project_ffe_items WHERE id='f88eb000-0000-4000-8000-000000000061')`);
    await convert('conv-a');
    await ready('converted line');
    v = await view();
    r = await race('reversal-first', { actor: 1, sql: await reverse('rev-a') }, { actor: 1, sql: complete(v, 'k-rev-a') });
    succeeded(r.won, 'reversal-first: the reversal commits');
    succeeded(r.lost, 'reversal-first: completion re-derives after it; the reversal changes no obligation here');
    assert.equal(await isStudio(), true, 'reversal-first: the line is a studio line again');
    await revoke('reversal-first');
    await convert('conv-b');
    v = await view();
    r = await race('completion-first reversal', { actor: 1, sql: complete(v, 'k-rev-b') }, { actor: 1, sql: await reverse('rev-b') });
    succeeded(r.won, 'completion-first reversal: completion commits');
    succeeded(r.lost, 'completion-first reversal: the reversal commits after it');
    assert.equal(await isStudio(), true, 'completion-first reversal: reversed against a completed service');
    await revoke('reversal');
    await ready('reversal');

    // C5: an installed event verified in a studio-installed package (R8).
    const installFixture = n => `SELECT pg_temp.fulfilment(${n},'pkg.install','received');
      SELECT pg_temp.line(${n},'pkg.install','installed',pg_temp.fid('d000',${n})); ${thread(n)}
      INSERT INTO sa_results VALUES('ev-${n}',to_jsonb(pg_temp.event(pg_temp.fid('d000',${n}),'installed',false)));`;
    const verify = async (n, key) => `SELECT public.verify_external_fulfilment_event(${literal(await read(`pg_temp.v('ev-${n}')`))},
      ${literal(key)})::text;`;
    await setup(`SELECT pg_temp.package('pkg.install','included','{"installation":"studio"}'); ${installFixture(71)}`, 'install fixture');
    v = await view();
    assert.deepEqual(v.codes, ['studio_installation_open:pkg.install'], 'a reported install still blocks');
    r = await race('verification-first', { actor: 1, sql: await verify(71, 'ver-a') }, { actor: 1, sql: complete(v, 'k-ver-a') });
    succeeded(r.won, 'verification-first: the verification commits');
    refused(r.lost, [['PT409', 'stale_obligations']], 'verification-first: completion refuses the pre-verification hash');
    // Completion-first needs a ready service: a second reported install on the verified
    // fulfilment leaves no blocker, and its verification is still a contributing write.
    await setup(`INSERT INTO sa_results VALUES('ev-72',to_jsonb(pg_temp.event(pg_temp.fid('d000',71),'installed',false)));`,
      'second reported install');
    await ready('verified install');
    v = await view();
    r = await race('completion-first verification', { actor: 1, sql: complete(v, 'k-ver-b') },
      { actor: 1, sql: await verify(72, 'ver-b') });
    succeeded(r.won, 'completion-first verification: completion commits');
    succeeded(r.lost, 'completion-first verification: the verification commits after it');
    await check(`(SELECT evidence_level='verified' FROM public.project_external_fulfilment_events WHERE id=(pg_temp.v('ev-72')#>>'{}')::uuid)`,
      'completion-first verification: the second install is verified against a completed service');
    await revoke('verification');
    await ready('verification');

    // KEY SHARE (SQ-2230 census): a writer that UPDATEs projects after a contributing
    // write is not blocked by a completion queued on the key between the two.
    {
      const b = open();
      const bPid = Number(await b.ok('SELECT pg_backend_pid();', 'pid'));
      v = await view();
      await a.ok(`BEGIN; ${as(1)} UPDATE public.project_phases SET status=status WHERE id=${literal(phase)};`, 'contributing write');
      const waiting = b.query(`BEGIN; ${as(1)} ${complete(v, 'k-keyshare')}`);
      waiting.catch(() => {});
      await m.ok(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
        WHILE NOT ${aPid}=ANY(pg_blocking_pids(${bPid})) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: completion did not queue on the key'; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $wait$;`, 'KEY SHARE: completion queues on the shared key');
      const later = await a.query(`SET LOCAL lock_timeout='3s'; UPDATE public.projects SET updated_at=updated_at WHERE id=${literal(project)};`);
      assert.equal(later.error, false, `KEY SHARE: the projects UPDATE is not blocked by completion (${later.sqlstate} ${later.message})`);
      await a.ok('COMMIT;', 'writer commits');
      const done = await waiting;
      await b.ok(done.error ? 'ROLLBACK;' : 'COMMIT;', 'completion ends');
      await b.close(); sessions.delete(b);
      succeeded(done, 'KEY SHARE: completion commits after the writer');
      await revoke('key share');
    }

    // R20: an invoice insert does not wait on the service-obligation key.
    {
      const b = open();
      v = await view();
      succeeded(await a.query(`BEGIN; ${as(1)} ${complete(v, 'k-invoice')}`), 'invoice: completion holds the key');
      const invoice = await b.query(`BEGIN; SET LOCAL lock_timeout='2s';
        INSERT INTO public.invoices(id,project_id,designer_id,invoice_number,status,total_cents,amount_paid_cents,tax_rate)
        VALUES('f88ef000-0000-4000-8000-000000000001',${literal(project)},${literal(uid(1))},'SC-RACE','sent',1000,0,0);`);
      assert.equal(invoice.error, false, `R20: the invoice insert does not wait (${invoice.sqlstate} ${invoice.message})`);
      await b.ok('COMMIT;', 'invoice commits');
      await a.ok('COMMIT;', 'completion commits');
      await b.close(); sessions.delete(b);
      await check(`(SELECT (financial_hold->>'balanceCents')::bigint=0 FROM public.studio_service_completions
        WHERE project_id=pg_temp.project() AND revoked_at IS NULL)`, 'R20: the hold is the one read in the completion transaction');
      await revoke('invoice');
      await setup(`SELECT pg_temp.replica(true); UPDATE public.invoices SET status='void' WHERE id='f88ef000-0000-4000-8000-000000000001';
        SELECT pg_temp.replica(false);`, 'void race invoice');
    }

    // close_project (FOR UPDATE) against completion (FOR KEY SHARE at step 1).
    // close_project refuses on any uninstalled or unpaid line, unpaid milestone or uncollected total,
    // and a refusing close releases its lock at the error, so the fixture is made closable.
    await setup(`SELECT pg_temp.replica(true); UPDATE public.project_ffe_items SET status='installed',
        unit_price_cents=0, line_total_cents=0 WHERE project_id=pg_temp.project();
      UPDATE public.project_payment_milestones SET status='paid' WHERE project_id=pg_temp.project() AND amount_cents>0;
      UPDATE public.projects SET total_amount_cents=0 WHERE id=pg_temp.project() AND total_amount_cents>0;
      SELECT pg_temp.replica(false);
      INSERT INTO sa_results VALUES('project-row',(SELECT to_jsonb(p) FROM public.projects p WHERE id=pg_temp.project()));`,
    'closable project');
    await ready('closable project');
    const reopenProject = `SELECT pg_temp.replica(true);
      DO $restore$ DECLARE saved jsonb:=pg_temp.v('project-row'); now_row jsonb; cols text; BEGIN
        SELECT to_jsonb(p) INTO now_row FROM public.projects p WHERE id=pg_temp.project();
        SELECT string_agg(format('%I=s.%I',k,k),',') INTO cols FROM jsonb_object_keys(saved) k
        WHERE saved->k IS DISTINCT FROM now_row->k AND k IN (SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='projects' AND is_generated='NEVER');
        IF cols IS NOT NULL THEN
          EXECUTE format('UPDATE public.projects t SET %s FROM jsonb_populate_record(NULL::public.projects,$1) s WHERE t.id=s.id',cols)
          USING saved;
        END IF;
      END $restore$; SELECT pg_temp.replica(false);`;
    const closeout = JSON.stringify(await read('pg_temp.closeout()'));
    // No snapshot: the first close freezes the edition, which then refuses a changed snapshot on the second close.
    const close = `SELECT public.close_project(${literal(project)},${literal(closeout)},NULL)::text;`;
    v = await view();
    r = await race('close-first', { actor: 1, sql: close }, { actor: 1, sql: complete(v, 'k-close-a') });
    succeeded(r.won, 'close-first: close_project commits');
    succeeded(r.lost, 'close-first: completion commits after it (C6 reads no projects column)');
    await revoke('close-first');
    await setup(reopenProject, 'reopen project');
    await check(`(SELECT to_jsonb(p)=pg_temp.v('project-row') FROM public.projects p WHERE id=pg_temp.project())`, 'project row restored');
    v = await view();
    r = await race('completion-first close', { actor: 1, sql: complete(v, 'k-close-b') }, { actor: 1, sql: close });
    succeeded(r.won, 'completion-first close: completion commits');
    succeeded(r.lost, 'completion-first close: close_project commits after it');
    await revoke('close');
    await setup(reopenProject, 'reopen project');

    // No 40P01 anywhere: per statement, and in the database's deadlock counter.
    assert.ok(!seen.includes('40P01'), 'no statement raised 40P01');
    for (const s of [...sessions].filter(s => s !== m)) { await s.close(); sessions.delete(s); }
    await m.ok('SELECT pg_sleep(0.5); SELECT pg_stat_clear_snapshot();', 'stats settle');
    const deadlocksAfter = Number(await m.ok('SELECT deadlocks FROM pg_stat_database WHERE datname=current_database();', 'deadlocks'));
    assert.equal(deadlocksAfter, deadlocksBefore, 'pg_stat_database counted no deadlock during the races');
  } finally {
    // Close every writer even after an assertion/timeout, then use a fresh backend
    // so an aborted writer transaction cannot suppress cleanup.
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.exited));
    if (fixtureOwned || capabilityWas !== null) {
      const cleaner = new Session();
      try {
        if (capabilityWas !== null) {
          await cleaner.ok(`UPDATE public.server_capabilities SET enabled=${capabilityWas === 't'} WHERE key='scope_editions';`,
            'capability restored');
        }
        if (fixtureOwned) {
          const result = await cleaner.query(cleanup);
          assert.equal(result.error, false, `fixture cleanup: ${result.sqlstate} ${result.message}`);
        }
      } finally { await cleaner.close(); }
    }
  }
});
