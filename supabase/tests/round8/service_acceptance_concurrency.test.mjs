// N(service_acceptance). C4 §2.12 races on the committed 00886 schema, owned LOCAL DB window only.
// Never installs migrations or toggles scope_editions. Refuses without ownership.
// Run: node --test --test-concurrency=1 supabase/tests/round8/service_acceptance_concurrency.test.mjs
// Required env: SERVICE_ACCEPTANCE_DB_WINDOW=owned; scope_editions enabled; outbound workers stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from './owned_psql.mjs';

const url = round8DbUrl();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const uid = n => `f88c0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const secondCard = 'f88c6000-0000-4000-8000-000000000004';
const body = readFileSync(new URL('./service_acceptance_body.psql', import.meta.url), 'utf8').replaceAll('f886', 'f88c');
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
INSERT INTO acceptance_owned_rows SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f88c0000-%';
INSERT INTO acceptance_owned_rows SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f88c1000-%';
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
 DELETE FROM storage.objects WHERE id::text LIKE 'f88c9000-%';
 SET LOCAL session_replication_role=origin;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f88c0000-%')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f88c1000-%')
  OR EXISTS(SELECT 1 FROM storage.objects WHERE id::text LIKE 'f88c9000-%') THEN
  RAISE EXCEPTION 'fixture cleanup left roots';
 END IF;
 FOR owned IN SELECT DISTINCT rel FROM acceptance_owned_rows LOOP
  EXECUTE format('SELECT count(*) FROM %s target JOIN acceptance_owned_rows owned ON owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel) INTO added;
  IF added<>0 THEN RAISE EXCEPTION 'fixture cleanup left rows in %',owned.rel::regclass; END IF;
 END LOOP;
END $cleanup$;
COMMIT;`;

test('C4 service acceptance serializes response, supersession, replacement and paper review', { timeout: 120000 }, async () => {
  assert.equal(process.env.SERVICE_ACCEPTANCE_DB_WINDOW, 'owned', 'orchestrator-owned committed DB window required');
  const sessions = new Set();
  const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open();
  let fixtureOwned = false;
  try {
    const preflight = await a.query(`SELECT current_user='postgres' AND
      to_regprocedure('public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text)') IS NOT NULL AND
      (SELECT enabled FROM public.server_capabilities WHERE key='scope_editions') AND
      NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f88c%') AND
      NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f88c%') AND
      NOT EXISTS(SELECT 1 FROM storage.objects WHERE id::text LIKE 'f88c%');`);
    assert.equal(preflight, 't', 'committed 00886, capability on, and empty owned fixture prefix required');
    // Ownership starts before the commit can land (including a lost response).
    fixtureOwned = true;
    await a.query(`BEGIN; ${section('assertion helpers')} ${section('fixture')} ${section('native helpers')}
      ${section('origin')} COMMIT;`);
    const aPid = await a.query('SELECT pg_backend_pid();');
    const read = async sql => JSON.parse(await a.query(`SELECT (${sql})::text;`));
    const check = async (sql, message) => assert.equal(await a.query(`SELECT (${sql});`), 't', message);
    // The winner holds its locks in session a; the loser must queue behind them in b.
    async function race(winner, loser) {
      const b = open();
      const bPid = await b.query('SELECT pg_backend_pid();');
      const won = JSON.parse(await a.query(`BEGIN; ${as(winner.actor)} SELECT ${winner.call}::text;`));
      // Attach a rejection handler immediately: the loser may fail before await.
      const waiting = b.query(`BEGIN; ${as(loser.actor)} SELECT ${loser.call}::text; COMMIT;`)
        .then(value => ({ value: JSON.parse(value) }), error => ({ error }));
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
    // A sent request on the active edition; prepare(…) adds same-transaction setup.
    async function sentRequest(key, prepare = '') {
      await a.query(`BEGIN; SELECT pg_temp.actor(1);
        INSERT INTO sa_results VALUES(${literal(key)},pg_temp.create(${literal(`cc-${key}`)}));
        SELECT pg_temp.deliver(pg_temp.req(${literal(key)})); ${prepare} COMMIT;`);
      return read(`SELECT jsonb_build_object('id',id,'scope',scope_content_hash,'manifest',evidence_manifest_hash,
        'partner',pg_temp.signer(id,'partner')) FROM public.service_acceptance_requests WHERE id=pg_temp.req(${literal(key)})`);
    }
    const amendment = key => `INSERT INTO sa_results VALUES(${literal(key)},public.create_service_addendum(pg_temp.project(),${literal(key)}));
      SELECT public.copy_agreement_parts_from_authority((pg_temp.v(${literal(key)})->>'proposalId')::uuid,'race copy');
      SELECT pg_temp.send_and_sign((pg_temp.v(${literal(key)})->>'proposalId')::uuid);`;
    const proposal = async key => read(`SELECT pg_temp.v(${literal(key)})->'proposalId'`);
    const respond = (req, key) => `public.respond_service_acceptance(${literal(req.id)},'accept','[]',NULL,
      ${literal(req.scope)},${literal(req.manifest)},1,${literal(key)})`;
    const countersign = id => `public.countersign_design_services_agreement(${literal(id)},'Acceptance Designer')`;
    const replace = (req, reason, key) => `public.replace_service_acceptance_signer(${literal(req.id)},
      ${literal(req.partner)},NULL,${literal(secondCard)},1,${literal(reason)},${literal(key)})`;
    const paper = (key, n) => `INSERT INTO sa_results VALUES(${literal(`${key}-paper`)},pg_temp.record_paper(pg_temp.req(${literal(key)}),
      pg_temp.signer(pg_temp.req(${literal(key)}),'partner'),pg_temp.paper(${n},1),'accept',${literal(`cc-${key}-paper`)}));
      SELECT pg_temp.stamp(${literal(`${key}-paper`)});`;
    const review = (intake, key) => `public.review_service_acceptance_paper_intake(${literal(intake.intakeId)},'confirmed',
      ${literal(intake.documentSha256)},NULL,${literal(key)})`;

    // 1a. Supersession commits first: the response queues, then refuses on the terminal request.
    const r1 = await sentRequest('r1', amendment('amend1'));
    let race1 = await race({ actor: 1, call: countersign(await proposal('amend1')) }, { actor: 5, call: respond(r1, 'cc-x1') });
    assert.match(race1.error?.message ?? '', /request_not_open/, 'a response queued behind supersession refuses');
    await check(`SELECT lifecycle='superseded' AND superseded_reason='scope_edition_superseded'
      AND NOT EXISTS(SELECT 1 FROM public.service_acceptance_responses WHERE request_id=r.id)
      FROM public.service_acceptance_requests r WHERE id=${literal(r1.id)}`, 'supersession wins: no response on the superseded request');

    // 1b. The response commits first: the amendment queues, then supersedes the request; the response stays evidence.
    const r2 = await sentRequest('r2', amendment('amend2'));
    race1 = await race({ actor: 5, call: respond(r2, 'cc-x2') }, { actor: 1, call: countersign(await proposal('amend2')) });
    assert.ifError(race1.error);
    assert.equal(race1.won.aggregateOutcome, 'pending', 'one of two required signers leaves the request pending');
    await check(`SELECT r.lifecycle='superseded' AND r.superseded_reason='scope_edition_superseded'
      AND x.presented_scope_content_hash=r.scope_content_hash AND x.responded_at<r.superseded_at
      AND (SELECT status='superseded' FROM public.project_scope_editions WHERE id=r.scope_edition_id)
      FROM public.service_acceptance_requests r JOIN public.service_acceptance_responses x ON x.request_id=r.id
      WHERE r.id=${literal(r2.id)}`, 'response wins: the amendment then supersedes the request and keeps the response');

    // 2. Two replacements presenting revision 1: exactly one applies.
    const r3 = await sentRequest('r3');
    const race2 = await race({ actor: 1, call: replace(r3, 'Owner replaces the partner', 'cc-rp-a') },
      { actor: 3, call: replace(r3, 'Admin replaces the partner', 'cc-rp-b') });
    assert.match(race2.error?.message ?? '', /stale_signer_policy/, 'the queued replacement sees revision 2');
    assert.equal(race2.won.signerPolicyRevision, 2);
    await check(`SELECT r.signer_policy_revision=2
      AND (SELECT count(*)=1 FROM public.service_acceptance_signers WHERE request_id=r.id AND status='replaced')
      AND (SELECT replacement_client_request_id='cc-rp-a' FROM public.service_acceptance_signers WHERE id=${literal(r3.partner)})
      AND NOT EXISTS(SELECT 1 FROM public.service_acceptance_signers WHERE replacement_client_request_id='cc-rp-b')
      AND (SELECT household_person_id=${literal(secondCard)} FROM public.service_acceptance_signers
        WHERE request_id=r.id AND slot='partner' AND status='active')
      FROM public.service_acceptance_requests r WHERE r.id=${literal(r3.id)}`, 'one replacement, one revision bump');

    // 3a. Replacement commits first: the queued confirmation finds its intake lapsed.
    const r4 = await sentRequest('r4', paper('r4', 41));
    const p4 = await read(`SELECT pg_temp.v('r4-paper')`);
    const race3 = await race({ actor: 1, call: replace(r4, 'Partner travelling', 'cc-rp-3a') },
      { actor: 3, call: review(p4, 'cc-rv-3a') });
    assert.match(race3.error?.message ?? '', /request_not_open/, 'a confirmation queued behind a replacement refuses');
    assert.deepEqual(race3.won.lapsedIntakeIds, [p4.intakeId], 'the replacement lapsed the pending intake');
    await check(`SELECT r.signer_policy_revision=2 AND r.lifecycle='sent'
      AND NOT EXISTS(SELECT 1 FROM public.service_acceptance_responses WHERE request_id=r.id)
      AND (SELECT review_state='lapsed' AND lapsed_reason='signer_policy_revised' AND reviewed_by IS NULL
        FROM public.service_acceptance_paper_intakes WHERE id=${literal(p4.intakeId)})
      FROM public.service_acceptance_requests r WHERE r.id=${literal(r4.id)}`, 'replacement wins: no response from the lapsed paper');

    // 3b. Confirmation commits first at revision 1; the queued replacement re-derives without it.
    const r5 = await sentRequest('r5', paper('r5', 51));
    const p5 = await read(`SELECT pg_temp.v('r5-paper')`);
    const race4 = await race({ actor: 3, call: review(p5, 'cc-rv-3b') },
      { actor: 1, call: replace(r5, 'Partner moved abroad', 'cc-rp-3b') });
    assert.ifError(race4.error);
    assert.equal(race4.won.aggregateOutcome, 'pending', 'the client is still pending after the paper confirmation');
    assert.equal(race4.value.signerPolicyRevision, 2);
    assert.deepEqual(race4.value.lapsedIntakeIds, [], 'nothing pending to lapse once the intake is confirmed');
    await check(`SELECT r.signer_policy_revision=2 AND r.lifecycle='sent' AND r.aggregate_outcome='pending'
      AND (SELECT count(*)=1 AND bool_and(x.method='paper_intake' AND x.presented_signer_policy_revision=1
        AND x.signer_id=${literal(r5.partner)}) FROM public.service_acceptance_responses x WHERE x.request_id=r.id)
      AND (SELECT status='replaced' FROM public.service_acceptance_signers WHERE id=${literal(r5.partner)})
      AND NOT EXISTS(SELECT 1 FROM public.service_acceptance_responses x JOIN public.service_acceptance_signers s
        ON s.id=x.signer_id WHERE x.request_id=r.id AND s.status='active')
      AND jsonb_array_length(public._service_acceptance_pending_required(r.id))=2
      FROM public.service_acceptance_requests r WHERE r.id=${literal(r5.id)}`,
    'confirmation wins at revision 1; the replaced signer no longer counts and no active signer holds a revision-1 response');
  } finally {
    // Close every writer even after an assertion/timeout, then use a fresh backend
    // so an aborted writer transaction cannot suppress cleanup.
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.exited));
    if (fixtureOwned) {
      const cleaner = new Session();
      try { await cleaner.query(cleanup); } finally { await cleaner.close(); }
    }
  }
});
