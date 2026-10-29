import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from '../round8/owned_psql.mjs';

const url = round8DbUrl();
assert.equal(new URL(url).hostname, '127.0.0.1');
assert.equal(new URL(url).port, '58122', 'E1 owned DB only');
const designer = 'e7130000-0000-4000-8000-000000000001';
const actor = 'e7130000-0000-4000-8000-000000000002';
const studio = 'e7131000-0000-4000-8000-000000000001';
const project = 'e7134000-0000-4000-8000-000000000001';
const relationship = 'e7133000-0000-4000-8000-000000000001';
const decision = 'e7138000-0000-4000-8000-000000000001';
const first = 'e7139000-0000-4000-8000-000000000001';
const second = 'e7139000-0000-4000-8000-000000000002';
const fixture = `
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('${designer}','e1-designer@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('${actor}','e1-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name,is_designer)
VALUES ('${designer}','e1-designer@test.invalid','E1 Designer',true),
 ('${actor}','e1-client@test.invalid','E1 Client',false) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.organizations(id,type,name,slug,status)
VALUES ('${studio}','design_studio','E1 Selection Studio','e1-selection-studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status,joined_at)
VALUES ('${designer}','${studio}','owner','active',now());
INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,status,source)
VALUES ('${relationship}','${designer}','${actor}','E1 Client','active','direct');
INSERT INTO public.projects(id,name,designer_id,created_by,client_id,studio_id,status)
VALUES ('${project}','E1 Selection Project','${designer}','${designer}','${actor}','${studio}','active');
INSERT INTO public.client_decisions(id,designer_client_id,project_id,title,status,sent_at,coordination_kind,court,due_date)
VALUES ('${decision}','${relationship}','${project}','E1 Choice','pending',now(),'selection','client',now()+interval '7 days');
INSERT INTO public.client_decision_options(id,decision_id,name,price,quantity,selected,sort_order)
VALUES ('${first}','${decision}','First',12000,1,false,0),
 ('${second}','${decision}','Second',9000,1,false,1);`;
const claims = `SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub='${actor}';
  SET LOCAL request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';`;
const choose = option => `${claims} SELECT (public.apply_client_decision('${decision}','${option}',
  'click_through',NULL,NULL,NULL)).status;`;

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
  INSERT INTO e1_owned SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'e7130000-%';
  INSERT INTO e1_owned SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'e7131000-%';
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
  IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'e7130000-%') OR
     EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'e7131000-%') THEN
    RAISE EXCEPTION 'E1 fixture cleanup left roots';
  END IF;
  END $clean$; COMMIT;`;

test('competing client choices on the same selection decision serialize', { timeout: 90000 }, async () => {
  assert.equal(process.env.E1_DB_WINDOW, 'owned');
  const sessions = new Set(); const open = () => { const s = new Session(); sessions.add(s); return s; };
  const a = open(); let fixtureOwned = false;
  try {
    assert.equal(await a.query(`SELECT current_user='postgres' AND
      NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'e7130000-%') AND
      NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'e7131000-%');`), 't');
    fixtureOwned = true;
    await a.query(`BEGIN; ${fixture} COMMIT;`);
    const b = open(); const bPid = Number(await b.query('SELECT pg_backend_pid();'));
    const aPid = Number(await a.query('SELECT pg_backend_pid();'));
    const winner = await a.query(`BEGIN; ${choose(first)}`);
    const loser = b.query(`BEGIN; ${choose(second)} COMMIT;`).then(value => ({ value }), error => ({ error }));
    await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
      WHILE NOT ${aPid}=ANY(pg_blocking_pids(${bPid})) LOOP
        IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'second choice did not wait'; END IF;
        PERFORM pg_sleep(0.02);
      END LOOP;
    END $wait$; COMMIT;`);
    const outcome = await loser;
    assert.equal(winner, 'responded');
    assert.match(outcome.error?.message ?? '', /stale|conflict|different|already|serialization/i,
      'competing choice refuses without overwriting the selected option');
    assert.equal(await a.query(`SELECT status='responded' AND selected_by='${actor}'
      FROM public.client_decisions WHERE id='${decision}';`), 't');
    assert.equal(await a.query(`SELECT count(*)=1 AND bool_and(id='${first}') FROM public.client_decision_options
      WHERE decision_id='${decision}' AND selected;`), 't');
  } finally {
    for (const s of sessions) s.kill();
    await Promise.all([...sessions].map(s => s.exited));
    if (fixtureOwned) { const cleaner = new Session(); try { await cleaner.query(cleanup); } finally { await cleaner.close(); } }
  }
});
