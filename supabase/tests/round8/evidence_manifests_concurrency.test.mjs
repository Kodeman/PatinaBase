// N(evidence_manifest_lock_order): run only in an orchestrator-owned committed LOCAL DB window.
// No migrations or capabilities are installed here. Both mint transactions roll back.
// EVIDENCE_MANIFEST_DB_WINDOW=owned node --test --test-concurrency=1 supabase/tests/round8/evidence_manifests_concurrency.test.mjs
// Run byte-identical harness against 74b6080d (placement) and b34eac755 (approval) for negative controls in that window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const url='postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const project='f8770000-0000-4000-8000-000000000020';
const config='f8770000-0000-4000-8000-000000000044';
const revision='f8770000-0000-4000-8000-000000000047';
const body=readFileSync(new URL('./evidence_manifests_body.psql',import.meta.url),'utf8');
const fixture=body.slice(body.indexOf('SET LOCAL session_replication_role=replica;'),body.indexOf('CREATE TEMP TABLE members'));
const claims="SET request.jwt.claim.sub='f8770000-0000-4000-8000-000000000002';";
const mint=`SELECT public.create_evidence_manifest('${project}','f8770000-0000-4000-8000-000000000030','package_issue',
 jsonb_build_array(jsonb_build_object('kind','custom_commission_revision','id','${revision}','rev',1,'sha256',
 encode(extensions.digest(public._plan_room_canonical_json(jsonb_build_object('configurationId','${config}','revision',1,
 'brief','{}'::jsonb,'drawings','[]'::jsonb,'quote','{}'::jsonb,'provenance','{}'::jsonb)),'sha256'),'hex'))),'concurrency');`;
class Session {
  constructor() {
    this.buffer = '';
    this.errors = '';
    this.pending = null;
    this.terminalError = null;
    this.child = spawn('psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'], detached: true,
      env: { ...process.env, PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=10000' },
    });
    this.exited = new Promise(resolve => {
      this.child.once('error', error => { this.fail(error); resolve(); });
      this.child.once('exit', (code, signal) => {
        this.fail(new Error(`psql exit=${code} signal=${signal}: ${this.errors}`));
        resolve();
      });
    });
    this.child.stdin.on('error', error => this.fail(error));
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
  fail(error) {
    this.terminalError ??= error;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(this.terminalError);
  }
  async query(sql) {
    if (this.terminalError) throw this.terminalError;
    if (this.child.exitCode !== null || this.child.signalCode || this.child.stdin.destroyed) {
      this.fail(new Error('psql session is terminal'));
      throw this.terminalError;
    }
    assert.equal(this.pending, null, 'one command per session');
    const marker = `scope_done_${randomUUID().replaceAll('-', '')}`;
    const result = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    const timer = setTimeout(() => {
      this.fail(new Error('psql query deadline exceeded'));
      this.kill();
    }, 20000);
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


const cleanup = `
BEGIN;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE scope_owned_rows(rel oid, row_id tid, PRIMARY KEY(rel,row_id));
INSERT INTO scope_owned_rows SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f877%';
INSERT INTO scope_owned_rows SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f877%';
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
 IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f877%')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f877%') THEN
  RAISE EXCEPTION 'fixture cleanup left roots';
 END IF;
 FOR owned IN SELECT DISTINCT rel FROM scope_owned_rows LOOP
  EXECUTE format('SELECT count(*) FROM %s target JOIN scope_owned_rows owned ON owned.rel=%s AND target.ctid=owned.row_id',
   owned.rel::regclass,owned.rel) INTO added;
  IF added<>0 THEN RAISE EXCEPTION 'fixture cleanup left rows in %',owned.rel::regclass; END IF;
 END LOOP;
END $cleanup$;
COMMIT;`;

async function withFixture(run, setup='') {
 assert.equal(process.env.EVIDENCE_MANIFEST_DB_WINDOW,'owned','orchestrator-owned committed LOCAL DB window required');
 const a=new Session(); const b=new Session(); let owned=false;
 try {
  assert.equal(await a.query(`SELECT to_regprocedure('public.create_evidence_manifest(uuid,uuid,text,jsonb,text)') IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f877%')
   AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f877%');`),'t','00877 installed and owned roots absent');
  owned=true;
  await a.query(`BEGIN; ${fixture} ${setup} COMMIT; ${claims}`);
  await b.query(claims);
  await run(a,b);
 } finally {
  try {
   a.kill(); b.kill();
   await Promise.all([a.close(),b.close()]);
  } finally {
   // Assertion failures can terminate either psql; cleanup never reuses them.
   if(owned){
    const cleaner=new Session();
    try {await cleaner.query(cleanup);} finally {await cleaner.close();}
   }
  }
 }
}

async function waitForBlocked(a,b,label) {
 const aPid=Number(await a.query('SELECT pg_backend_pid();'));
 await a.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN
  WHILE NOT ${aPid}=ANY(pg_blocking_pids(${b})) LOOP
   IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: ${label}'; END IF;
   PERFORM pg_sleep(0.02);
  END LOOP;
 END $wait$;`);
}

// Exact 00808/00809 placement boundary: job-label -> configuration -> revision.
test('N manifest shares job-label seam and locks configuration before revision', {timeout:90000}, async()=>{
 await withFixture(async(a,b)=>{
  const bPid=Number(await b.query('SELECT pg_backend_pid();'));
  async function exercise(hold, probe, label){
   await a.query(`BEGIN; ${hold}`);
   const waiting=b.query(`BEGIN; ${mint}`).then(value=>({value}),error=>({error}));
   await waitForBlocked(a,bPid,'manifest did not wait at native lock boundary');
   const result=await a.query(`DO $probe$ BEGIN
    ${probe}
    EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'ASSERTION FAILED: ${label}';
   END $probe$; SELECT true;`);
   assert.equal(result,'t',label);
   await a.query('ROLLBACK;');
   const minted=await waiting;
   if(minted.error) throw minted.error;
   assert.match(minted.value,/manifestId/, 'mint completes without deadlock after native writer releases');
   await b.query('ROLLBACK;');
  }
  await exercise(`SELECT public._ffe_lock_job_labels('${project}');`,
   `PERFORM 1 FROM public.product_configurations WHERE id='${config}' FOR UPDATE NOWAIT;
     PERFORM 1 FROM public.custom_commission_revisions WHERE id='${revision}' FOR UPDATE NOWAIT;`,
   'mint takes job-label seam before members');
  await exercise(`SELECT id FROM public.product_configurations WHERE id='${config}' FOR UPDATE;`,
   `PERFORM 1 FROM public.custom_commission_revisions WHERE id='${revision}' FOR UPDATE NOWAIT;`,
   'mint does not lock revision ahead of blocked configuration');
 });
});

// Native 00403 approval holds revision X UPDATE while waiting for configuration UPDATE.
test('N in-flight native approval cannot deadlock mint of approved Y or ineligible X', {timeout:90000}, async()=>{
 const x='f8770000-0000-4000-8000-000000000079';
 await withFixture(async(a,b)=>{
  const bPid=Number(await b.query('SELECT pg_backend_pid();'));
  assert.match(await a.query(`BEGIN; ${mint}`),/manifestId/,'approved Y mints before native approval of X');
  const approving=b.query(`BEGIN; SELECT public.transition_custom_commission_revision('${x}','approved',NULL,
   '{"approval":{"designerApproved":true,"clientApproved":true}}');`)
   .then(value=>({value}),error=>({error}));
  await waitForBlocked(a,bPid,'native approval did not wait for configuration held by mint of Y');
  assert.equal(await a.query(`SET LOCAL lock_timeout='500ms';
   DO $refuse$ BEGIN
    PERFORM public.create_evidence_manifest('${project}','f8770000-0000-4000-8000-000000000030','package_issue',
     jsonb_build_array(jsonb_build_object('kind','custom_commission_revision','id','${x}','rev',2,'sha256',repeat('a',64))),
     'inflight-x');
    RAISE EXCEPTION 'ASSERTION FAILED: in-flight X was eligible';
   EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'manifest_member_not_frozen' THEN RAISE; END IF;
   END $refuse$;
   SELECT NOT EXISTS(SELECT 1 FROM public.evidence_manifest_requests WHERE project_id='${project}' AND idempotency_key='inflight-x')
    AND (SELECT count(*)=1 FROM public.evidence_manifests WHERE project_id='${project}')
    AND (SELECT count(*)=1 FROM public.evidence_manifest_members pin JOIN public.evidence_manifests manifest
     ON manifest.id=pin.manifest_id WHERE manifest.project_id='${project}');`),
   't','in-flight X refuses as ineligible without waiting or writing a manifest receipt or pin');
  await a.query('ROLLBACK;');
  const approved=await approving;
  if(approved.error) throw approved.error;
  assert.match(approved.value,/approved/,'native approval completes after mint Y releases configuration');
  assert.equal(await b.query(`SELECT status='approved' FROM public.custom_commission_revisions WHERE id='${x}';`),
   't','native approval of X reached approved');
  await b.query('ROLLBACK;');
 },`SET LOCAL session_replication_role=replica;
  UPDATE public.product_configurations SET status='saved',is_valid=true,is_complete=true,approved_at=NULL,approved_by=NULL WHERE id='${config}';
  SET LOCAL session_replication_role=origin;`);
});
