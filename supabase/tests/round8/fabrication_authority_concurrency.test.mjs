// N(fabrication): RUN ONLY in the orchestrator's committed local DB window.
// Requires 00878 installed, FABRICATION_AUTHORITY_DB_WINDOW=owned and outbound
// workers stopped. Never migrates, activates RPCs, or changes capabilities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const url = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const body = readFileSync(new URL('./fabrication_authority_body.psql', import.meta.url), 'utf8').replaceAll('f878', 'f87e');
const id = n => `f87e0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function section(name) {
  const start = `-- BEGIN shared ${name}\n`, end = `-- END shared ${name}`;
  assert.equal(body.split(start).length, 2);
  assert.equal(body.split(end).length, 2);
  return body.split(start)[1].split(end)[0];
}
class Session {
  constructor() {
    this.buffer = ''; this.errors = ''; this.pending = null;
    this.child = spawn('psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], {
      detached: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=7000' },
    });
    this.exited = new Promise(resolve => {
      this.child.once('error', error => { this.pending?.reject(error); resolve(); });
      this.child.once('exit', (code, signal) => {
        this.pending?.reject(new Error(`psql exit=${code} signal=${signal}: ${this.errors}`));
        this.pending = null; resolve();
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
      const pending = this.pending; this.pending = null; pending.resolve(value);
    });
  }
  async query(sql) {
    assert.equal(this.pending, null, 'one query per backend');
    const marker = `fa_done_${randomUUID().replaceAll('-', '')}`;
    const result = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    const timer = setTimeout(() => this.kill(), 20000);
    try { this.child.stdin.write(`${sql}\n\\echo ${marker}\n`); return await result; }
    finally { clearTimeout(timer); }
  }
  kill() {
    if (this.child.exitCode !== null || this.child.signalCode) return;
    try { process.kill(-this.child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  async close() {
    this.child.stdin.end();
    const timer = setTimeout(() => this.kill(), 1000);
    try { await this.exited; } finally { clearTimeout(timer); }
  }
}
const begin = `BEGIN; SELECT pg_temp.fa_actor(1); SET LOCAL ROLE service_role;`;
const grant = (seat, key, from = 'current_date', to = 'NULL') =>
  `SELECT (public.grant_fabrication_authority('${id(seat)}',${from},'${key}',${to})).id;`;
async function blocked(holder, pid) {
  await holder.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '4s'; BEGIN LOOP
    EXIT WHEN pg_backend_pid()=ANY(pg_blocking_pids(${pid}));
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: contender did not block'; END IF;
    PERFORM pg_sleep(0.02); END LOOP; END $wait$;`);
}
const cleanup = `BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL session_replication_role=replica;
 DELETE FROM public.project_party_authority WHERE engagement_id IN (SELECT id FROM public.project_parties WHERE project_id IN('${id(201)}','${id(202)}'));
 DELETE FROM public.project_parties WHERE project_id IN('${id(201)}','${id(202)}');
 DELETE FROM public.projects WHERE id IN('${id(201)}','${id(202)}');
 DELETE FROM public.organization_members WHERE organization_id IN('${id(101)}','${id(102)}');
 DELETE FROM public.organizations WHERE id IN('${id(101)}','${id(102)}');
 DELETE FROM public.profiles WHERE id::text LIKE 'f87e0000-%';
 DELETE FROM auth.users WHERE id::text LIKE 'f87e0000-%'; COMMIT;`;

test('fabrication seat serialization, first-lock inversion control, close/grant and revoke/close races', {
  timeout: 150000, skip: process.env.FABRICATION_AUTHORITY_DB_WINDOW !== 'owned',
}, async () => {
  const sessions = new Set(); let owned = false;
  async function open() {
    const s = new Session(); sessions.add(s);
    await s.query(section('helpers') + '\nGRANT EXECUTE ON FUNCTION pg_temp.fa_actor(integer),pg_temp.fa_id(integer) TO service_role;');
    return s;
  }
  async function finish(s) { await s.close(); sessions.delete(s); }
  let a;
  try {
    a = await open();
    assert.equal(await a.query(`SELECT NOT EXISTS(SELECT 1 FROM public.projects WHERE id::text LIKE 'f87e0000-%')
      AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f87e0000-%')
      AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id::text LIKE 'f87e0000-%')
      AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87e0000-%');`), 't', 'owned namespace starts empty');
    await a.query('BEGIN;\n' + section('fixture') + '\nCOMMIT;'); owned = true;
    // Finite and pending overlap race: B takes its snapshot before A commits.
    let b = await open(); let pid = Number(await b.query('SELECT pg_backend_pid();'));
    await a.query(begin + grant(301, 'race-a', 'current_date+1', 'current_date+30'));
    await b.query(begin);
    const competing = b.query(grant(301, 'race-b', 'current_date+20', 'current_date+40'));
    const observed = competing.then(value => ({ value }), error => ({ error }));
    await blocked(a, pid); await a.query('COMMIT;');
    assert.match((await observed).error?.message ?? '', /fabrication_authority_overlap/, 'one finite grant wins, pending overlap refuses');
    await finish(b);
    assert.equal(await a.query(`SELECT count(*) FROM public.project_party_authority WHERE engagement_id='${id(301)}';`), '1');

    // A owns ONLY the seat, B enters revoke. A then takes the authority lock.
    // The inverse test-local contender owns authority before waiting on seat;
    // it must deadlock/timeout rather than falsely passing after all locks exist.
    for (const inverted of [false, true]) {
      b = await open(); pid = Number(await b.query('SELECT pg_backend_pid();'));
      await a.query(begin + `SELECT id FROM public.project_parties WHERE id='${id(301)}' FOR UPDATE;`);
      await b.query(begin);
      const contender = b.query(inverted
        ? `SELECT id FROM public.project_party_authority WHERE engagement_id='${id(301)}' FOR UPDATE;
           SELECT id FROM public.project_parties WHERE id='${id(301)}' FOR UPDATE; ROLLBACK;`
        : `SELECT public.revoke_fabrication_authority((SELECT id FROM public.project_party_authority WHERE engagement_id='${id(301)}'),'revoked'); ROLLBACK;`);
      const result = contender.then(value => ({ value }), error => ({ error }));
      await blocked(a, pid);
      const holder = a.query(`SELECT id FROM public.project_party_authority WHERE engagement_id='${id(301)}' FOR UPDATE; ROLLBACK;`);
      const settled = await Promise.allSettled([holder, result.then(r => { if (r.error) throw r.error; })]);
      const failures = settled.filter(r => r.status === 'rejected');
      if (inverted) {
        assert.ok(failures.some(r => /40P01|55P03/.test(r.reason.message)), 'inverse lock order must deadlock or time out');
        // The holder can be PostgreSQL's deadlock victim; replace it before reuse.
        await finish(a); a = await open();
      } else assert.equal(failures.length, 0, 'native seat-first order completes');
      await finish(b);
    }
    // Grant waiting behind a close must re-read the committed closed seat.
    b = await open(); pid = Number(await b.query('SELECT pg_backend_pid();'));
    await a.query(begin + `UPDATE public.project_parties SET off_job_at=current_date WHERE id='${id(302)}';`);
    await b.query(begin);
    const late = b.query(grant(302, 'late')).then(value => ({ value }), error => ({ error }));
    await blocked(a, pid); await a.query('COMMIT;');
    assert.match((await late).error?.message ?? '', /fabrication_authority_seat_closed/, 'close wins and late grant refuses');
    await finish(b);
    // Close waiting behind a grant must count and revoke the committed finite grant.
    b = await open(); pid = Number(await b.query('SELECT pg_backend_pid();'));
    await a.query(begin + grant(303, 'before-close', 'current_date+1', 'current_date+30'));
    await b.query(begin);
    const close = b.query(`UPDATE public.project_parties SET off_job_at=current_date WHERE id='${id(303)}'; COMMIT;`);
    const closing = close.then(value => ({ value }), error => ({ error }));
    await blocked(a, pid); await a.query('COMMIT;');
    assert.equal((await closing).error, undefined, 'grant then close completes without inversion');
    await finish(b);
    assert.equal(await a.query(`SELECT end_reason='seat_closed' AND revoked_at IS NOT NULL AND effective_to=effective_from
      FROM public.project_party_authority WHERE engagement_id='${id(303)}';`), 't', 'pending grant closed without extension');
    // Revoke and seat close contend on the same first lock, not child→parent.
    b = await open(); pid = Number(await b.query('SELECT pg_backend_pid();'));
    await a.query(begin + grant(304, 'before-revoke') + 'COMMIT;');
    await a.query(begin + `SELECT public.revoke_fabrication_authority((SELECT id FROM public.project_party_authority WHERE engagement_id='${id(304)}'),'revoked');`);
    await b.query(begin);
    const afterRevoke = b.query(`UPDATE public.project_parties SET off_job_at=current_date WHERE id='${id(304)}'; COMMIT;`)
      .then(value => ({ value }), error => ({ error }));
    await blocked(a, pid); await a.query('COMMIT;');
    assert.equal((await afterRevoke).error, undefined);
    await finish(b);
    assert.equal(await a.query(`SELECT end_reason='revoked' AND NOT public.party_holds_fabrication_authority('${id(304)}',0)
      FROM public.project_party_authority WHERE engagement_id='${id(304)}';`), 't', 'close preserves winning revocation');
  } finally {
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.close()));
    if (owned) {
      const cleaner = new Session();
      try {
        await cleaner.query(cleanup);
        assert.equal(await cleaner.query(`SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87e0000-%')
          AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id::text LIKE 'f87e0000-%');`), 't', 'owned fixtures removed');
      } finally { await cleaner.close(); }
    }
  }
});
