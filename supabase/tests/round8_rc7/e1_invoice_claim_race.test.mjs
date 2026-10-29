import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from '../round8/owned_psql.mjs';

const url = round8DbUrl();
assert.equal(new URL(url).hostname, '127.0.0.1');
assert.equal(new URL(url).port, '58122', 'E1 owned DB only');
const source = readFileSync(new URL('../billing/time_claim_atomicity_test.sql', import.meta.url), 'utf8');
const fixture = source.split(/-- ─── fixtures ─[^\n]*\n/)[1]
  .split(/-- ─── helpers ─/)[0].replaceAll('a710', 'e710');
assert.ok(fixture.includes('INSERT INTO project_time_entries') && fixture.includes('INSERT INTO invoices'));
const id = suffix => `e7100000-0000-4000-8000-0000000000${suffix}`;
const actor = 'e7100000-0000-4000-8000-000000000001';
const entry = id('b2');
const claim = invoice => `SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub='${actor}';
  SET LOCAL request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';
  SELECT COALESCE(array_agg(id)::text,'{}') FROM public.claim_time_entries('${id(invoice)}',ARRAY['${entry}']::uuid[]) AS id;`;

class Session {
  constructor() {
    this.buffer = ''; this.errors = ''; this.pending = null;
    this.child = spawn('psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1'], {
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
  async query(sql) {
    assert.equal(this.pending, null);
    const marker = `e1_done_${randomUUID().replaceAll('-', '')}`;
    const done = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    const timer = setTimeout(() => this.kill(), 20000);
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

const cleanup = `BEGIN;
  CREATE TEMP TABLE e1_owned(rel oid, tid tid, PRIMARY KEY(rel,tid));
  INSERT INTO e1_owned SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'e7100000-%';
  INSERT INTO e1_owned SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'e7100000-%';
  DO $clean$ DECLARE fk record; predicate text; added integer; total integer; pass integer:=0; owned record;
  BEGIN LOOP
    total:=0; pass:=pass+1;
    IF pass>30 THEN RAISE EXCEPTION 'E1 cleanup exceeded FK closure'; END IF;
    FOR fk IN SELECT c.* FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE c.contype='f' AND n.nspname IN ('public','auth') LOOP
      SELECT string_agg(format('child.%I=parent.%I',a.attname,b.attname),' AND ' ORDER BY keys.ord)
        INTO predicate FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(child_key,parent_key,ord)
        JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=keys.child_key
        JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=keys.parent_key;
      EXECUTE format('INSERT INTO e1_owned SELECT %s,child.ctid FROM %s child JOIN %s parent ON %s
        JOIN e1_owned owned ON owned.rel=%s AND owned.tid=parent.ctid ON CONFLICT DO NOTHING',
        fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid);
      GET DIAGNOSTICS added=ROW_COUNT; total:=total+added;
    END LOOP;
    EXIT WHEN total=0;
  END LOOP;
  SET LOCAL session_replication_role=replica;
  FOR owned IN SELECT DISTINCT rel FROM e1_owned LOOP
    EXECUTE format('DELETE FROM %s target USING e1_owned owned WHERE owned.rel=%s AND target.ctid=owned.tid',
      owned.rel::regclass,owned.rel);
  END LOOP;
  SET LOCAL session_replication_role=origin;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'e7100000-%') OR
     EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'e7100000-%') THEN
    RAISE EXCEPTION 'E1 fixture cleanup left roots';
  END IF;
  END $clean$; COMMIT;`;

test('two invoice drafts claiming the same hour serialize without detaching the winner', { timeout: 90000 }, async () => {
  assert.equal(process.env.E1_DB_WINDOW, 'owned');
  const sessions = new Set(); const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open(); let fixtureOwned = false;
  try {
    assert.equal(await a.query(`SELECT current_user='postgres' AND
      NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'e7100000-%') AND
      NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'e7100000-%');`), 't');
    fixtureOwned = true;
    await a.query(`BEGIN; ${fixture} COMMIT;`);
    const b = open(); const bPid = Number(await b.query('SELECT pg_backend_pid();'));
    const aPid = Number(await a.query('SELECT pg_backend_pid();'));
    await a.query(`BEGIN; ${claim('a1')}`);
    const loser = b.query(`BEGIN; ${claim('a2')} COMMIT;`).then(value => ({ value }), error => ({ error }));
    await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
      WHILE NOT ${aPid}=ANY(pg_blocking_pids(${bPid})) LOOP
        IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'second invoice did not wait on claim'; END IF;
        PERFORM pg_sleep(0.02);
      END LOOP;
    END $wait$; COMMIT;`);
    const outcome = await loser; assert.ifError(outcome.error);
    assert.match(outcome.value, /\{\}/, 'loser claims zero hours');
    assert.equal(await a.query(`SELECT invoice_id='${id('a1')}' FROM public.project_time_entries WHERE id='${entry}';`), 't');
    assert.equal(await a.query(`SELECT count(*)=1 FROM public.project_time_entries
      WHERE id='${entry}' AND invoice_id IN ('${id('a1')}','${id('a2')}');`), 't');
    assert.equal(await a.query(`SELECT count(*)=3 AND bool_and(status='draft') FROM public.invoices WHERE project_id='${id('e1')}';`), 't',
      'all three fixture drafts remain drafts');
  } finally {
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.exited));
    if (fixtureOwned) { const cleaner = new Session(); try { await cleaner.query(cleanup); } finally { await cleaner.close(); } }
  }
});
