// US-52 release review, fix lane F-A defect 1 (00896): a household card relinked
// while its new profile responds. Two sessions race on the committed schema, in
// both orders, on an owned LOCAL DB window only. Never installs migrations or
// toggles scope_editions. Refuses without ownership.
// Run: node --test --test-concurrency=1 supabase/tests/round8/service_acceptance_relink_concurrency.test.mjs
// Required env: SERVICE_ACCEPTANCE_DB_WINDOW=owned; scope_editions enabled; outbound workers stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from '../round8/owned_psql.mjs';

const url = round8DbUrl();
assert.equal(new URL(url).hostname, '127.0.0.1', 'E1 only runs against loopback');
assert.equal(new URL(url).port, '58122', 'E1 only runs against owned port 58122');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const uid = n => `e1020000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const card = n => `e1026000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const body = readFileSync(new URL('../round8/service_acceptance_release_fixes_body.psql', import.meta.url), 'utf8')
  .replaceAll('f896', 'e102');
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
    const marker = `acceptance_done_${randomUUID().replaceAll('-', '')}`;
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

// Follow FK descendants of ONLY the owned fictional identities/studios, then
// the owned paper objects (storage is outside the public/auth FK walk).
const cleanup = `
BEGIN;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE acceptance_owned_rows(rel oid, row_id tid, PRIMARY KEY(rel,row_id));
INSERT INTO acceptance_owned_rows SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'e1020000-%';
INSERT INTO acceptance_owned_rows SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'e1021000-%';
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
   EXECUTE format('INSERT INTO acceptance_owned_rows SELECT %s,child.ctid FROM %s child JOIN %s parent ON %s
    JOIN acceptance_owned_rows owned ON owned.rel=%s AND owned.row_id=parent.ctid ON CONFLICT DO NOTHING',
    fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid);
   GET DIAGNOSTICS added=ROW_COUNT; total:=total+added;
  END LOOP;
  EXIT WHEN total=0;
 END LOOP;
 SET LOCAL session_replication_role=replica;
 FOR owned IN SELECT DISTINCT rel FROM acceptance_owned_rows LOOP
  EXECUTE format('DELETE FROM %s target USING acceptance_owned_rows owned WHERE owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel);
 END LOOP;
 DELETE FROM storage.objects WHERE id::text LIKE 'e1029000-%';
 SET LOCAL session_replication_role=origin;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'e1020000-%')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'e1021000-%')
  OR EXISTS(SELECT 1 FROM storage.objects WHERE id::text LIKE 'e1029000-%') THEN
  RAISE EXCEPTION 'fixture cleanup left roots';
 END IF;
 FOR owned IN SELECT DISTINCT rel FROM acceptance_owned_rows LOOP
  EXECUTE format('SELECT count(*) FROM %s target JOIN acceptance_owned_rows owned ON owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel) INTO added;
  IF added<>0 THEN RAISE EXCEPTION 'fixture cleanup left rows in %',owned.rel::regclass; END IF;
 END LOOP;
END $cleanup$;
COMMIT;`;

test('E1 C4 relink in both orders, collision, and simultaneous required signers', { timeout: 120000 }, async () => {
  assert.equal(process.env.SERVICE_ACCEPTANCE_DB_WINDOW, 'owned', 'orchestrator-owned committed DB window required');
  const sessions = new Set();
  const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open();
  let fixtureOwned = false;
  try {
    const preflight = await a.query(`SELECT current_user='postgres' AND
      to_regprocedure('public.present_service_acceptance_offline(uuid,text,text,text)') IS NOT NULL AND
      (SELECT enabled FROM public.server_capabilities WHERE key='scope_editions') AND
      NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'e102%') AND
      NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'e102%');`);
    assert.equal(preflight, 't', 'committed 00896-00899, capability on, and empty owned fixture prefix required');
    fixtureOwned = true;
    await a.query(`BEGIN; ${section('assertion helpers')} ${section('fixture')} ${section('native helpers')}
      ${section('origin')} COMMIT;`);
    const aPid = await a.query('SELECT pg_backend_pid();');
    // Session a keeps the fixture's pg_temp helpers; each step runs as one short transaction.
    const step = async (actor, sql) => a.query(`BEGIN; SELECT pg_temp.actor(${actor}) \\g /dev/null
      ${sql}
      COMMIT;`);
    const check = async (actor, sql, message) => assert.equal(await step(actor, `SELECT (${sql});`), 't', message);
    // The winner holds its locks in session a; the loser must queue behind them in b.
    async function race(winner, loser) {
      const b = open();
      const bPid = await b.query('SELECT pg_backend_pid();');
      const won = await a.query(`BEGIN; ${winner}`);
      const waiting = b.query(`BEGIN; ${loser} COMMIT;`).then(value => ({ value }), error => ({ error }));
      await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
        WHILE NOT ${Number(aPid)}=ANY(pg_blocking_pids(${Number(bPid)})) LOOP
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: loser did not wait on the winner'; END IF;
          PERFORM pg_sleep(0.02);
        END LOOP;
      END $wait$; COMMIT;`);
      const outcome = await waiting;
      await b.close(); sessions.delete(b);
      return { won, ...outcome };
    }
    const sentRequest = async key => {
      await step(1, `INSERT INTO sa_results VALUES(${literal(key)},pg_temp.create(${literal(`rc-${key}`)}));
        SELECT pg_temp.deliver(pg_temp.req(${literal(key)}));`);
      return JSON.parse(await a.query(`SELECT jsonb_build_object('id',id,'scope',scope_content_hash,
        'manifest',evidence_manifest_hash,'revision',signer_policy_revision)::text
        FROM public.service_acceptance_requests WHERE id=pg_temp.req(${literal(key)});`));
    };
    // Plain SQL only: session b has none of a's pg_temp helpers.
    const relink = (c, n) => `UPDATE public.studio_contacts SET profile_id=${literal(uid(n))} WHERE id=${literal(card(c))};`;
    const respond = (req, n, key) => `${as(n)} SELECT public.respond_service_acceptance(${literal(req.id)},'accept','[]',NULL,
      ${literal(req.scope)},${literal(req.manifest)},${Number(req.revision)},${literal(key)})::text;`;
    const responses = req => `(SELECT jsonb_agg(jsonb_build_object('slot',s.slot,'by',x.responder_profile_id) ORDER BY s.slot)
      FROM public.service_acceptance_responses x JOIN public.service_acceptance_signers s ON s.id=x.signer_id
      WHERE x.request_id=${literal(req.id)})`;
    const answer = async (n, key, k) => JSON.parse(await step(n, `SELECT pg_temp.respond(pg_temp.req(${literal(key)}),${literal(k)})::text;`));

    // Order 1: the relink commits first. The co_client card moves onto 7, who
    // already holds the partner card; 7's queued response re-reads the links
    // after the wait and is refused with the collision, recording nothing.
    const r1 = await sentRequest('r1');
    const order1 = await race(relink(2, 7), respond(r1, 7, 'rc-r1-7'));
    assert.match(order1.error?.message ?? '', /signer_identity_collision/, 'relink first: the queued response is refused');
    await check(1, `${responses(r1)} IS NULL
      AND (SELECT profile_id=${literal(uid(7))} FROM public.studio_contacts WHERE id=${literal(card(2))})
      AND (SELECT lifecycle='sent' AND aggregate_outcome='pending' FROM public.service_acceptance_requests WHERE id=${literal(r1.id)})`,
    'relink first: the link moved and no response was recorded');
    await check(7, `pg_temp.listed(pg_temp.req('r1'))->'entry'->>'viewerRole'='observer'
      AND pg_temp.listed(pg_temp.req('r1'))->'entry'->'viewerSignerId'='null'::jsonb`,
    'relink first: the loser lists the request as an observer while two slots match');
    // Recoverable: the studio replaces the co_client slot (audited), then everyone answers once.
    await step(1, `SELECT pg_temp.replace(pg_temp.req('r1'),'co_client',pg_temp.card(5),'rc-r1-repair') \\g /dev/null`);
    assert.equal((await answer(7, 'r1', 'rc-r1-7')).aggregateOutcome, 'pending', 'relink first: after the repair 7 answers');
    await answer(8, 'r1', 'rc-r1-8');
    assert.equal((await answer(5, 'r1', 'rc-r1-5')).aggregateOutcome, 'accepted', 'relink first: the request completes');
    await check(1, `${responses(r1)}=jsonb_build_array(
        jsonb_build_object('slot','client','by',${literal(uid(5))}),
        jsonb_build_object('slot','co_client','by',${literal(uid(8))}),
        jsonb_build_object('slot','partner','by',${literal(uid(7))}))`,
    'relink first: three people answered three slots; 7 answered only the partner slot');

    // Order 2: the response commits first, then the queued relink applies. The
    // answer stays on the partner slot; the relink makes 7 match the co_client
    // slot too, so 7 answers nothing more, and the studio repairs the slot.
    await step(1, `${relink(2, 6)}`);
    const r2 = await sentRequest('r2');
    const order2 = await race(respond(r2, 7, 'rc-r2-7'), relink(2, 7));
    assert.ifError(order2.error);
    assert.equal(JSON.parse(order2.won).aggregateOutcome, 'pending', 'response first: the response committed');
    await check(1, `(SELECT profile_id=${literal(uid(7))} FROM public.studio_contacts WHERE id=${literal(card(2))})
      AND ${responses(r2)}=jsonb_build_array(jsonb_build_object('slot','partner','by',${literal(uid(7))}))`,
    'response first: the relink applied after it; the answer stays on the partner slot');
    await check(7, `pg_temp.listed(pg_temp.req('r2'))->'entry'->>'viewerRole'='observer'`,
      'response first: 7 lists the request as an observer while two slots match');
    assert.equal(await step(7, `SELECT pg_temp.expect_error(format($q$SELECT pg_temp.respond(%L,'rc-r2-7b')$q$,pg_temp.req('r2')),
      '55000','signer_identity_collision','response first: 7 cannot take the co_client slot') \\g /dev/null
      SELECT n FROM assertion_count;`).then(n => Number(n) > 0), true);
    assert.equal(JSON.parse(await step(7, `SELECT pg_temp.respond(pg_temp.req('r2'),'rc-r2-7')::text;`)).replayed, true,
      'response first: 7 still replays its own receipt');
    await step(1, `SELECT pg_temp.replace(pg_temp.req('r2'),'co_client',pg_temp.card(5),'rc-r2-repair') \\g /dev/null`);
    const refused = await step(7, `SELECT pg_temp.expect_error(format($q$SELECT pg_temp.respond(%L,'rc-r2-7c')$q$,pg_temp.req('r2')),
      '23505','already_responded','response first: after the repair 7 matches only its answered slot') \\g /dev/null
      SELECT 'ok';`);
    assert.equal(refused, 'ok');
    await answer(8, 'r2', 'rc-r2-8');
    assert.equal((await answer(5, 'r2', 'rc-r2-5')).aggregateOutcome, 'accepted', 'response first: the request completes');
    await check(1, `${responses(r2)}=jsonb_build_array(
        jsonb_build_object('slot','client','by',${literal(uid(5))}),
        jsonb_build_object('slot','co_client','by',${literal(uid(8))}),
        jsonb_build_object('slot','partner','by',${literal(uid(7))}))`,
    'response first: three people answered three slots');

    // Independent required signer slots race against the same request lock.
    await step(1, `${relink(2, 6)}`);
    const r3 = await sentRequest('r3');
    const simultaneous = await race(respond(r3, 6, 'rc-r3-6'), respond(r3, 7, 'rc-r3-7'));
    assert.ifError(simultaneous.error);
    assert.equal(JSON.parse(simultaneous.won).aggregateOutcome, 'pending');
    assert.equal(JSON.parse(simultaneous.value).aggregateOutcome, 'pending');
    await check(1, `(SELECT count(*)=2 AND count(DISTINCT signer_id)=2 FROM public.service_acceptance_responses
      WHERE request_id=${literal(r3.id)}) AND (SELECT aggregate_outcome='pending' FROM public.service_acceptance_requests
      WHERE id=${literal(r3.id)})`, 'two required signers persist in distinct slots once each');
    assert.equal((await answer(5, 'r3', 'rc-r3-5')).aggregateOutcome, 'accepted');
    await check(1, `(SELECT count(*)=3 AND count(DISTINCT signer_id)=3 FROM public.service_acceptance_responses
      WHERE request_id=${literal(r3.id)}) AND (SELECT count(*)=1 FROM public.outbound_drafts
      WHERE id=(SELECT outbound_draft_id FROM public.service_acceptance_requests WHERE id=${literal(r3.id)})
        AND status='sent')`,
      'one authoritative accepted request, three responses, one primary delivered draft');
  } finally {
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.exited));
    if (fixtureOwned) {
      const cleaner = new Session();
      try { await cleaner.query(cleanup); } finally { await cleaner.close(); }
    }
  }
});
