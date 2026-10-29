// N(external_presence): authoring-only in SQ-2069. Run ONLY in the W3-exit
// orchestrator-owned LOCAL window with committed 00875/00876, scope_editions=true,
// and all outbound workers stopped. No migration, grant or activation is applied.
// At most two psql backends; each query has a deadline and process-group cleanup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { round8DbUrl } from './owned_psql.mjs';
const url = round8DbUrl();
const id = n => `f87e0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
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
INSERT INTO c5_owned SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'f87e0000-%';
INSERT INTO c5_owned SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id::text LIKE 'f87e0000-%';
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

const actor = n => `DO $actor$ BEGIN PERFORM set_config('request.jwt.claim.sub','${id(n)}',true);
 PERFORM set_config('request.jwt.claims','{"sub":"${id(n)}","role":"authenticated"}',true); END $actor$;`;
const begin = n => `BEGIN; ${actor(n)}`;
const convert = (item, fulfilment, version, key) =>
 `public.set_ffe_item_external_fulfilment('${id(item)}','${id(fulfilment)}',${version},'${key}')`;
const purchase = item => `public.record_studio_purchase(jsonb_build_object(
 'projectId','${id(2)}','ffeItemId','${id(item)}','kind','antique_auction',
 'payeeName','Presence race supplier','amountCents',100))`;
const expected = (expression, state, message) => `DO $expected$ DECLARE s text; m text; BEGIN
 BEGIN PERFORM ${expression};
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,m=MESSAGE_TEXT; END;
 IF s IS DISTINCT FROM '${state}' OR strpos(COALESCE(m,''),'${message}')=0 THEN
  RAISE EXCEPTION 'ASSERTION FAILED: expected ${state}/${message}, got %/%',s,m;
 END IF; END $expected$;`;
const fixture = `BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT '${id(4)}'::uuid,'presence-owner@test.invalid','',now(),now(),now(),'authenticated','authenticated'
UNION ALL SELECT '${id(6)}'::uuid,'presence-member@test.invalid','',now(),now(),now(),'authenticated','authenticated';
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'Presence concurrency fixture',true FROM auth.users WHERE id::text LIKE 'f87e0000-%';
INSERT INTO public.organizations(id,type,name,slug,status)
VALUES('${id(10)}','design_studio','Presence concurrency','f87e-presence-concurrency','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status)
VALUES('${id(4)}','${id(10)}','owner','active'),('${id(6)}','${id(10)}','member','active');
INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status)
VALUES('${id(2)}','Presence concurrency','${id(4)}','${id(4)}','${id(10)}','active');
INSERT INTO public.proposals(id,project_id,designer_id,title,status,document_kind,commercial_state)
VALUES('${id(22)}','${id(2)}','${id(4)}','Presence concurrency agreement','accepted','design_services','executed');
INSERT INTO public.project_commercial_documents(id,project_id,proposal_id,document_kind,is_origin,created_by)
VALUES('${id(21)}','${id(2)}','${id(22)}','design_services',true,'${id(4)}');
INSERT INTO public.project_scope_editions(id,project_id,edition_number,kind,commercial_document_id,source_proposal_id,
 agreement_fingerprint,effective_at,content,content_hash,status)
VALUES('${id(20)}','${id(2)}',1,'baseline','${id(21)}','${id(22)}','fixture',now(),'{}','fixture','active');
-- No fabrication contract: 00900 requires instructed units only where one exists.
INSERT INTO public.project_scope_edition_packages(edition_id,package_key,label,inclusion,responsibilities)
VALUES('${id(20)}','pkg.chairs','Chairs','included',
 '{"design":"studio","purchasing":"gc","payer":"gc","fabrication_contract":"none","installation":"gc"}');
INSERT INTO public.project_external_fulfilments(id,project_id,scope_edition_id,package_key,units,kind,
 buyer_party_kind,payer_party_kind,contracting_party_kind,created_by,client_request_id,request_hash)
SELECT ('f87e0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(2)}','${id(20)}','pkg.chairs',
 ARRAY['chair-'||n],'client_furnishing','gc','gc','none','${id(4)}','fixture-'||n,'fixture'
 FROM generate_series(500,508)n;
INSERT INTO public.project_ffe_selection_threads(id,project_id,primary_ffe_item_id,created_by)
SELECT ('f87e0000-0000-4000-8000-'||lpad((n+1000)::text,12,'0'))::uuid,'${id(2)}',
 ('f87e0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(4)}' FROM generate_series(100,108)n;
-- 00808 backfills native rows and labels every insert; replica setup must
-- preserve that invariant so a purchase status edit does not allocate a label.
INSERT INTO public.project_ffe_items(id,project_id,name,selection_thread_id,doc_code,unit_price_cents,line_total_cents,quantity,design_disposition)
SELECT ('f87e0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(2)}','Presence race chair',
 ('f87e0000-0000-4000-8000-'||lpad((n+1000)::text,12,'0'))::uuid,'RACE-'||n,100,100,1,'selected'
 FROM generate_series(100,108)n;
INSERT INTO public.products(id,name,captured_at,layer,owner_user_id,price_trade,price_retail,configuration_mode)
VALUES('${id(600)}','Presence placement race',now(),'personal','${id(4)}',100,150,'standard');
INSERT INTO public.product_configurations(id,product_id,owner_user_id,studio_id,project_id,version,schema_revision,
 evaluation,snapshot,snapshot_hash,is_complete,is_valid,is_library_template,retail_price_cents,trade_price_cents)
VALUES('${id(601)}','${id(600)}','${id(4)}','${id(10)}',NULL,1,1,'{}','{"selections":[]}',repeat('b',64),true,true,false,150,100);
SET LOCAL session_replication_role=origin;
COMMIT;`;

async function waitForBlock(holder, pid) {
 await holder.query(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '5s'; BEGIN LOOP
  EXIT WHEN pg_backend_pid()=ANY(pg_blocking_pids(${pid}));
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: contender did not block'; END IF;
  PERFORM pg_sleep(0.02); END LOOP; END $wait$;`);
}
async function contended(a, b, pid, sql) {
 const pending = b.query(sql);
 pending.catch(() => {});
 try { await waitForBlock(a, pid); await a.query('COMMIT;'); await pending; }
 catch (error) { a.kill(); b.kill(); await pending.catch(() => {}); throw error; }
}

test('C5 conversion serializes pricing, retries, cancellation and installation', { timeout: 180000 }, async () => {
 assert.equal(process.env.EXTERNAL_PRESENCE_DB_WINDOW,'owned','orchestrator-handed committed local DB window required');
 const a = new Session();
 let b;
 let fixtureOwned = false;
 try {
  assert.equal(await a.query(`SELECT COALESCE((SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'),false)
   AND to_regprocedure('public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text)') IS NOT NULL
   AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_ffe_items' AND column_name='row_version');`),
   't','committed 00876 and active capability are prerequisites');
  assert.equal(await a.query(`SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87e0000-%')
   AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'f87e0000-%')
   AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id::text LIKE 'f87e0000-%');`),'t','fictional roots start empty');
  fixtureOwned = true;
  await a.query(fixture);
  b = new Session();
  const pid = Number(await b.query('SELECT pg_backend_pid();'));
  assert.ok(Number.isInteger(pid) && pid>0,'contender is a real backend');

  await a.query(`${begin(6)} SELECT ${convert(100,500,1,'convert-first')};`);
  await contended(a,b,pid,`${begin(6)} ${expected(`public.set_ffe_line_pricing('${id(100)}','quantity',2)`,'23514','External presence lines are not studio commerce.')} COMMIT;`);
  assert.equal(await a.query(`SELECT unit_price_cents=0 AND line_total_cents=0 AND quantity=1 AND external_fulfilment_id='${id(500)}'
   FROM public.project_ffe_items WHERE id='${id(100)}';`),'t','conversion-first refuses blocked native pricing without lost zero state');

  await a.query(`${begin(6)} SELECT public.set_ffe_line_pricing('${id(101)}','quantity',3);`);
  await contended(a,b,pid,`${begin(6)} ${expected(convert(101,501,1,'price-first'),'PT409','external_conversion_version_conflict')} COMMIT;`);
  assert.equal(await a.query(`SELECT quantity=3 AND external_fulfilment_id IS NULL AND row_version=2 FROM public.project_ffe_items WHERE id='${id(101)}';`),
   't','pricing-first preserves native edit and rejects stale conversion');

  await a.query(`${begin(6)} SELECT public.record_external_fulfilment_event('${id(502)}','cancelled','{}',NULL,'cancel-first');`);
  await contended(a,b,pid,`${begin(6)} ${expected(convert(102,502,1,'after-cancel'),'55000','fulfilment_terminal')} COMMIT;`);
  assert.equal(await a.query(`SELECT external_fulfilment_id IS NULL FROM public.project_ffe_items WHERE id='${id(102)}';`),'t','cancellation-first leaves no new binding');

  await a.query(`${begin(6)} SELECT ${convert(103,503,1,'binding-first')};`);
  await contended(a,b,pid,`${begin(6)} ${expected(`public.record_external_fulfilment_event('${id(503)}','cancelled','{}',NULL,'after-binding')`,'23514','fulfilment_cancel_lines_live')} COMMIT;`);
  assert.equal(await a.query(`SELECT NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id='${id(503)}' AND event_kind='cancelled');`),
   't','binding-first prevents cancellation event side effects');

  await a.query(begin(6));
  const event = JSON.parse(await a.query(`SELECT public.record_external_fulfilment_event('${id(503)}','installed','{}',NULL,'installed');`)).eventId;
  assert.match(event,/^[a-f0-9-]{36}$/);
  await a.query('COMMIT;');
  await a.query(`${begin(4)} SELECT public.verify_external_fulfilment_event('${event}','verify-install');`);
  await contended(a,b,pid,`${begin(6)} ${expected(convert(104,503,1,'after-install'),'55000','fulfilment_terminal')} COMMIT;`);
  assert.equal(await a.query(`SELECT status='installed' AND row_version=3 AND unit_price_cents=0 AND line_total_cents=0
   FROM public.project_ffe_items WHERE id='${id(103)}';`),'t','verified installation advances bound item once; concurrent conversion refuses');

  // Pause the actual placement wrapper's KEY SHARE + label prefix before
  // its impl upgrades the project to SHARE. Conversion touches another item,
  // so only the project/label order (not an item collision) can decide this.
  await a.query(`${begin(4)} SELECT public._ffe_lock_job_labels('${id(2)}');`);
  const afterPlacement = b.query(`${begin(6)} SELECT ${convert(108,508,1,'placement-first')}; COMMIT;`);
  afterPlacement.catch(() => {});
  let placed;
  try {
   await waitForBlock(a,pid);
   placed = JSON.parse(await a.query(`SELECT public.place_product_configuration_in_project('${id(2)}','${id(601)}');`));
   await a.query('COMMIT;');
   const converted = JSON.parse(await afterPlacement);
   assert.equal(converted.itemId,id(108),'conversion commits on the distinct existing item');
  } catch (error) { a.kill(); b.kill(); await afterPlacement.catch(() => {}); throw error; }
  assert.doesNotMatch(a.errors+b.errors,/40P01/i,'placement SHARE upgrade versus conversion never deadlocks');
  const placedId = placed.selectionId ?? placed.ffeItemId;
  assert.match(placedId,/^[a-f0-9-]{36}$/,'native placement returns a real item');
  assert.notEqual(placedId,id(108),'placement and conversion use different items');
  assert.equal(await a.query(`SELECT EXISTS(SELECT 1 FROM public.project_ffe_items item
   JOIN public.project_ffe_specs spec ON spec.ffe_item_id=item.id
   JOIN public.product_configurations config ON config.id=spec.configuration_id
   WHERE item.id='${placedId}' AND item.project_id='${id(2)}' AND item.product_id='${id(600)}'
    AND item.external_fulfilment_id IS NULL AND item.unit_price_cents=150 AND config.project_id='${id(2)}'
    AND config.previous_configuration_id='${id(601)}' AND config.ffe_item_id=item.id)
   AND EXISTS(SELECT 1 FROM public.project_ffe_items WHERE id='${id(108)}'
    AND external_fulfilment_id='${id(508)}' AND unit_price_cents=0 AND line_total_cents=0)
   AND (SELECT count(*)=1 FROM public.project_ffe_external_conversion_receipts WHERE item_id='${id(108)}');`),
   't','placement clone and zero-valued conversion both persist exactly once');

  // Pause the native purchase immediately after its item-lock prefix. The
  // contender must hold the conversion project prelock while waiting for it;
  // the purchase's immediate project FK must still be able to take KEY SHARE.
  await a.query(`${begin(6)} SELECT id FROM public.project_ffe_items WHERE id='${id(106)}' FOR UPDATE;`);
  const afterPurchase = b.query(`${begin(6)} ${expected(convert(106,506,1,'purchase-first'),'PT409','external_conversion_version_conflict')} COMMIT;`);
  afterPurchase.catch(() => {});
  try {
   await waitForBlock(a,pid);
   await a.query(`SELECT ${purchase(106)}; COMMIT;`);
   await afterPurchase;
  } catch (error) { a.kill(); b.kill(); await afterPurchase.catch(() => {}); throw error; }
  assert.doesNotMatch(a.errors+b.errors,/40P01/i,'purchase-versus-conversion never deadlocks');
  assert.equal(await a.query(`SELECT external_fulfilment_id IS NULL AND status='ordered'
   AND (SELECT count(*)=1 FROM public.studio_purchases WHERE ffe_item_id='${id(106)}')
   AND NOT EXISTS(SELECT 1 FROM public.project_ffe_external_conversion_receipts WHERE item_id='${id(106)}')
   FROM public.project_ffe_items WHERE id='${id(106)}';`),'t','purchase alone wins; blocked conversion has a typed version refusal');

  await a.query(`${begin(6)} SELECT ${convert(107,507,1,'before-purchase')};`);
  await contended(a,b,pid,`${begin(6)} ${expected(purchase(107),'23514','external_presence_studio_purchase_refused')} COMMIT;`);
  assert.doesNotMatch(a.errors+b.errors,/40P01/i,'conversion-versus-purchase never deadlocks');
  assert.equal(await a.query(`SELECT external_fulfilment_id='${id(507)}'
   AND NOT EXISTS(SELECT 1 FROM public.studio_purchases WHERE ffe_item_id='${id(107)}')
   AND (SELECT count(*)=1 FROM public.project_ffe_external_conversion_receipts WHERE item_id='${id(107)}')
   FROM public.project_ffe_items WHERE id='${id(107)}';`),'t','conversion alone wins; blocked purchase has a typed external refusal');

  await a.query(`${begin(6)} SELECT ${convert(105,505,1,'same-receipt')};`);
  const replay = b.query(`${begin(6)} SELECT (${convert(105,505,1,'same-receipt')}->>'replayed')::boolean; COMMIT;`);
  replay.catch(() => {});
  try { await waitForBlock(a,pid); await a.query('COMMIT;'); assert.equal(await replay,'t','blocked exact retry replays before stale version check'); }
  catch (error) { a.kill(); b.kill(); await replay.catch(() => {}); throw error; }
  assert.equal(await a.query(`SELECT count(*)=1 FROM public.project_ffe_external_conversion_receipts WHERE project_id='${id(2)}' AND client_request_id='same-receipt';`),
   't','concurrent exact retry records exactly one immutable receipt');
 } finally {
  // Closing both producers precedes cleanup, including any assertion failure.
  try { await Promise.allSettled([a.close(),b?.close()]); }
  finally {
   if (fixtureOwned) {
    const cleaner = new Session();
    try {
     await cleaner.query(cleanup);
     assert.equal(await cleaner.query(`SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f87e0000-%')
      AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id::text LIKE 'f87e0000-%');`),'t','zero fictional fixture residue');
    } finally { await cleaner.close(); }
   }
  }
 }
});
