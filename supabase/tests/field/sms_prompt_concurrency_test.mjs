// Self-contained LOCAL-only oracle. No reset, migration-up, real rows or services.
// Schema-only snapshot + candidate 00639 + synthetic fixtures in our own database.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = process.env.SQ51_EVIDENCE_DIR ?? resolve(process.env.HOME, '.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-51');
mkdirSync(evidence, { recursive: true });
const token = randomUUID();
const name = `sq51_prompt_${token.replaceAll('-', '')}`;
const admin = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const candidateUrl = new URL(admin); candidateUrl.pathname = name;
const url = candidateUrl.href;
const dumpBin = existsSync('/opt/homebrew/opt/libpq/bin/pg_dump') ? '/opt/homebrew/opt/libpq/bin/pg_dump' : 'pg_dump';
const log = (s) => { console.log(s); writeFileSync(resolve(evidence, `${name}.log`), `${s}\n`, { flag: 'a' }); };
const run = (bin, args, opts = {}) => {
  try { return execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, timeout: 120000, ...opts }); }
  catch (e) { throw new Error(`${bin} failed: ${e.stderr ?? e.message}`); }
};
const sql = (text, db = url) => run('psql', [db, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: text });
const file = (path) => {
  let text = readFileSync(resolve(root,path),'utf8');
  if (path==='supabase/seed/00-legacy-grants.sql') {
    // Role membership is CLUSTER-wide, not disposable-database state. Assert
    // these existing local prerequisites instead of writing shared catalogs.
    const grants = [
      ['GRANT agent_reader TO postgres;', 'agent_reader', 'postgres', true, true],
      ['GRANT agent_writer TO postgres;', 'agent_writer', 'postgres', true, true],
      ['GRANT authenticated TO edge_rls_user WITH INHERIT FALSE, SET TRUE;', 'authenticated','edge_rls_user',false,true],
    ];
    for (const [statement,role,member,inherit,set] of grants) {
      assert.equal(text.split(statement).length,2,'exact known cluster-grant prerequisite');
      text=text.replace(statement,`ASSERT EXISTS(SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member
        WHERE r.rolname='${role}' AND u.rolname='${member}' AND m.inherit_option=${inherit} AND m.set_option=${set}),
        'local role membership prerequisite ${role}/${member}';`);
    }
    log('ACL replay: database ACLs executed; three preexisting cluster role grants asserted without mutation');
  }
  return sql(text);
};
const sessions = new Set();
class Session {
  constructor() {
    this.child = spawn('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe','pipe','pipe'] });
    this.out = ''; this.err = ''; this.pending = null;
    this.child.stdout.on('data', b => { this.out += b; this.flush(); });
    this.child.stderr.on('data', b => { this.err += b; });
    this.exit = new Promise(resolve => this.child.on('exit', (code, signal) => {
      this.exited = true;
      if (this.pending) this.pending.reject(new Error(`psql exit ${code}/${signal}: ${this.err}`));
      resolve();
    }));
    sessions.add(this);
  }
  flush() {
    if (this.pending && this.out.includes(this.pending.marker)) {
      const { marker, resolve, timer } = this.pending;
      const [result, rest] = this.out.split(marker); this.out = rest.trimStart(); this.pending = null;
      clearTimeout(timer); resolve(result.trim());
    }
  }
  query(q) {
    assert.equal(this.pending, null, 'one statement in flight per session');
    return new Promise((resolve, reject) => {
      const marker = `end_${randomUUID().replaceAll('-','')}`;
      const timer = setTimeout(() => { this.child.kill('SIGTERM'); reject(new Error(`query deadline: ${q}; ${this.err}`)); }, 20000);
      this.pending = { marker, resolve, reject: e => { clearTimeout(timer); reject(e); }, timer };
      this.child.stdin.write(`${q};\n\\echo ${marker}\n`);
    });
  }
  async close() {
    if (!this.exited) this.child.stdin.end('ROLLBACK;\n\\q\n');
    await this.exit; sessions.delete(this);
  }
}
let created = false;
try {
  assert.equal(sql('select current_database()', admin).trim(), 'postgres');
  const schema = run(dumpBin, [admin, '--schema-only', '--no-owner', '--no-privileges',
    '--schema=public','--schema=app_private','--schema=svc_orders','--schema=svc_media','--schema=svc_projects','--schema=supabase_functions','--schema=auth','--schema=storage','--schema=extensions','--schema=vault','--schema=graphql','--schema=graphql_public']);
  sql(`CREATE DATABASE "${name}" TEMPLATE template0`, admin);
  created = true;
  sql(`COMMENT ON DATABASE "${name}" IS '${token}'`, admin);
  log(`created ${name} at 127.0.0.1:54322; schema only, zero copied rows`);
  sql('CREATE SCHEMA extensions; CREATE SCHEMA vault; CREATE SCHEMA graphql; CREATE EXTENSION vector WITH SCHEMA public; CREATE EXTENSION pg_trgm WITH SCHEMA public; CREATE EXTENSION moddatetime WITH SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION pg_stat_statements WITH SCHEMA extensions; CREATE EXTENSION supabase_vault WITH SCHEMA vault; CREATE EXTENSION pg_graphql WITH SCHEMA graphql; CREATE EXTENSION pg_net WITH SCHEMA extensions;');
  sql(schema.replaceAll('CREATE SCHEMA ', 'CREATE SCHEMA IF NOT EXISTS '));
  // pg_dump omits this extension-owned public shim, while types include it.
  sql(sql("SELECT pg_get_functiondef('graphql_public.graphql(text,text,jsonb,jsonb)'::regprocedure)",admin));
  file('supabase/migrations/00639_field_line_authority.sql');
  file('supabase/migrations/00641_field_line_effects_templates.sql');
  file('supabase/migrations/00639_field_line_authority.sql');
  file('supabase/migrations/00641_field_line_effects_templates.sql');
  file('supabase/seed/00-legacy-grants.sql');
  file('supabase/tests/field/sms_prompt_consumption_test.sql');
  file('supabase/seed/00-legacy-grants.sql');
  file('supabase/migrations/00639_field_line_authority.sql');
  file('supabase/tests/field/sms_prompt_consumption_test.sql');
  file('supabase/tests/field/sms_authority_test.sql');
  file('supabase/tests/field/apply_field_effect_test.sql');
  log('rolled-back consumption assertions passed twice after repeated migration and ACL seed replay; existing authority/effect suites passed');
  const types = run('supabase', ['gen','types','typescript','--db-url',url,'--schema','public,graphql_public'], { timeout: 120000 });
  const typePath = resolve(root, 'packages/supabase/src/database.types.ts');
  if (process.argv.includes('--write-types')) writeFileSync(typePath, types);
  else assert.equal(readFileSync(typePath,'utf8'), types, 'generated types match candidate database');
  log('candidate-schema types verified');
  // Shared fixture section contains synthetic rows only, with network inert in
  // this empty schema (no app_settings, Vault secrets, cron jobs or real data).
  const test = readFileSync(resolve(root,'supabase/tests/field/sms_prompt_consumption_test.sql'),'utf8');
  sql(test.split('-- FIXTURES BEGIN')[1].split('-- FIXTURES END')[0]);
  await concurrency();
  await availabilityConcurrency();
  await rawCompletionConcurrency();
  const receipts=sql("SELECT jsonb_agg(jsonb_build_array(id,consumed_sid,consumption_result,answered_at) ORDER BY id) FROM sms_prompts WHERE consumed_sid IS NOT NULL").trim();
  const command=sql(`SELECT id FROM sms_create_prompt('51000000-0000-4000-8000-000000000030',
    '51000000-0000-4000-8000-000000000020','confirm_availability','51000000-0000-4000-8000-000000000041',
    999,clock_timestamp()+interval '1 day','+15555109999','+15555100000')`).trim();
  file('supabase/migrations/00639_field_line_authority.sql');
  file('supabase/seed/00-legacy-grants.sql');
  assert.equal(sql("SELECT jsonb_agg(jsonb_build_array(id,consumed_sid,consumption_result,answered_at) ORDER BY id) FROM sms_prompts WHERE consumed_sid IS NOT NULL").trim(),receipts,'reapplication preserves every receipt');
  assert.equal(sql(`SELECT answered_at IS NULL AND proposed_effect IS NULL FROM sms_prompts WHERE id='${command}'`).trim(),'t','reapplication leaves command-only refs open');
  log('PASS populated migration/ACL replay preserves receipts and open command refs');
  log('PASS all prompt consumption and true-concurrency assertions');
} catch (e) {
  log(`FAIL ${e.stack}`); process.exitCode = 1;
} finally {
  await Promise.all([...sessions].map(s => s.close()));
  if (created) {
    try {
      const identity = sql(`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${name}' AND datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user)`, admin).trim();
      assert.equal(identity, token, 'cleanup database identity');
      assert.match(name, /^sq51_prompt_[a-f0-9]{32}$/);
      sql(`DROP DATABASE "${name}" WITH (FORCE)`, admin);
      assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname='${name}'`, admin).trim(),'0');
      log(`cleaned ${name}; identity checked; no other database modified`);
    } catch (e) { log(`CLEANUP FAILED ${name}: ${e.stack}`); process.exitCode = 1; }
  }
}

async function concurrency() {
  sql(`CREATE TABLE public.sq51_acceptances (id uuid DEFAULT gen_random_uuid());
    CREATE FUNCTION public.sq51_count_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.status='granted' AND OLD.status='pending' THEN INSERT INTO public.sq51_acceptances DEFAULT VALUES; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER sq51_count_acceptance AFTER UPDATE ON public.studio_channel_consent FOR EACH ROW EXECUTE FUNCTION public.sq51_count_acceptance();`);
  const observer = new Session();
  let generation = 0;
  for (const kind of ['flag_blocker','optin']) {
    for (const ending of ['COMMIT','ROLLBACK']) {
      for (const sameSid of [false,true]) {
        generation++;
        const tag = `${kind}/${ending}/${sameSid ? 'same' : 'distinct'} SID`;
        const a = new Session(), b = new Session();
        try {
          sql(`UPDATE public.studio_channel_consent SET status='${kind==='optin'?'pending':'granted'}',refusal_unanswered=false
            WHERE organization_id='51000000-0000-4000-8000-000000000010'`);
          const payload = kind==='optin' ? 'NULL' : `'${JSON.stringify({type:kind,target:{kind:'task',id:'51000000-0000-4000-8000-000000000040'},note:tag})}'::jsonb`;
          const prompt = JSON.parse(sql(`SELECT row_to_json(p) FROM public.sms_create_prompt(
            '51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020','${kind}',
            ${kind==='optin'?'NULL':"'51000000-0000-4000-8000-000000000040'"},${generation},clock_timestamp()+interval '1 day',
            '+15555109999','+15555100000',${payload}) p`).trim());
          const mA=randomUUID(), mB=sameSid?mA:randomUUID();
          for (const id of new Set([mA,mB])) sql(`INSERT INTO public.sms_messages(id,conversation_id,direction,body,twilio_sid)
            VALUES('${id}','51000000-0000-4000-8000-000000000050','inbound','YES ${prompt.short_code}','SM${id.replaceAll('-','')}')`);
          const call = m => `SELECT public.${kind==='optin'?'sms_grant_optin_prompt':'sms_apply_prompt'}(
            '${prompt.id}','+15555109999','+15555100000','${m}')`;
          const before = Number(sql("SELECT count(*) FROM public.client_decisions WHERE coordination_kind='rfi'").trim());
          const acceptsBefore=Number(sql('SELECT count(*) FROM public.sq51_acceptances').trim());
          const pidA=Number(await a.query('SELECT pg_backend_pid()'));
          const pidB=Number(await b.query('SELECT pg_backend_pid()'));
          await a.query("BEGIN; SET LOCAL statement_timeout='18s'; SET LOCAL idle_in_transaction_session_timeout='18s'");
          const resultA=JSON.parse(await a.query(call(mA)));
          assert.equal(resultA.status,kind==='optin'?'granted':'applied',tag+' A consumed');
          await b.query("BEGIN; SET LOCAL statement_timeout='18s'");
          let settled=false;
          const contender=b.query(call(mB));
          // Attach rejection handling immediately while waiting for the barrier.
          const outcome=contender.then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
          const deadline=Date.now()+10000;
          let blocked=false;
          while (Date.now()<deadline && !settled) {
            blocked=(await observer.query(`SELECT ${pidA}=ANY(pg_blocking_pids(${pidB}))`))==='t';
            if (blocked) break;
          }
          assert.ok(blocked,tag+' B provably blocked by A via pg_blocking_pids');
          log(`barrier ${tag}: B=${pidB} blocked by A=${pidA}`);
          await a.query(ending);
          const answer=await outcome;
          if (answer.error) throw answer.error;
          const resultB=JSON.parse(answer.value);
          const expected=ending==='ROLLBACK'?(kind==='optin'?'granted':'applied'):(sameSid?'replayed':'closed');
          assert.equal(resultB.status,expected,tag+' B rechecks locked row');
          if (expected==='replayed') assert.deepEqual(resultB.result,resultA.result,tag+' exact replay');
          await b.query('COMMIT');
          const receipt=JSON.parse(sql(`SELECT jsonb_build_object('sid',consumed_sid,'result',consumption_result,'closed',answered_at IS NOT NULL) FROM public.sms_prompts WHERE id='${prompt.id}'`).trim());
          assert.equal(receipt.sid,'SM'+(ending==='COMMIT'?mA:mB).replaceAll('-',''),tag+' winner receipt');
          assert.equal(receipt.closed,true,tag+' receipt and closure atomic');
          assert.equal(receipt.result.kind,kind==='optin'?'optin':'effect');
          if (kind==='flag_blocker') {
            assert.equal(Number(sql("SELECT count(*) FROM public.client_decisions WHERE coordination_kind='rfi'").trim()),before+1,tag+' exactly one RFI');
          } else {
            assert.equal(Number(sql('SELECT count(*) FROM public.sq51_acceptances').trim()),acceptsBefore+1,tag+' exactly one consent transition');
            assert.equal(sql("SELECT status FROM public.studio_channel_consent WHERE organization_id='51000000-0000-4000-8000-000000000010'").trim(),'granted',tag+' granted once');
            assert.equal(sql("SELECT status FROM public.studio_channel_consent WHERE organization_id='51000000-0000-4000-8000-000000000011'").trim(),'pending',tag+' other studio unchanged');
          }
          log(`PASS ${tag}: ${expected}; one business result + winner receipt`);
        } finally { await Promise.all([a.close(),b.close()]); }
      }
    }
  }
  // A locks an unconsumed prompt. B starts before expiry, but must use the
  // wall clock AFTER acquiring A's lock, not transaction-start now().
  const a=new Session(), b=new Session();
  try {
    const p=JSON.parse(sql(`SELECT row_to_json(p) FROM public.sms_create_prompt(
      '51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020','flag_blocker',
      '51000000-0000-4000-8000-000000000040',99,clock_timestamp()+interval '2 seconds','+15555109999','+15555100000',
      '{"type":"flag_blocker","target":{"kind":"task","id":"51000000-0000-4000-8000-000000000040"},"note":"expiry"}') p`).trim());
    const m=randomUUID();
    sql(`INSERT INTO sms_messages(id,conversation_id,direction,body,twilio_sid) VALUES('${m}',
      '51000000-0000-4000-8000-000000000050','inbound','YES ${p.short_code}','SM${m.replaceAll('-','')}')`);
    const pidA=Number(await a.query('SELECT pg_backend_pid()')),pidB=Number(await b.query('SELECT pg_backend_pid()'));
    await a.query(`BEGIN; SELECT id FROM sms_prompts WHERE id='${p.id}' FOR UPDATE`);
    await b.query("BEGIN; SET LOCAL statement_timeout='18s'");
    const outcome=b.query(`SELECT sms_apply_prompt('${p.id}','+15555109999','+15555100000','${m}')`)
      .then(value=>({value}),error=>({error}));
    let barrier=false; const deadline=Date.now()+10000;
    while (Date.now()<deadline) {
      barrier=(await observer.query(`SELECT ${pidA}=ANY(pg_blocking_pids(${pidB}))`))==='t';
      if (barrier) break;
    }
    assert.ok(barrier,'expiry contender blocked by lock owner');
    let expired=false;
    while (Date.now()<deadline) {
      expired=(await observer.query(`SELECT expires_at<clock_timestamp() FROM sms_prompts WHERE id='${p.id}'`))==='t';
      if (expired) break;
    }
    assert.ok(expired,'observed expiry before releasing lock');
    await a.query('COMMIT');
    const answer=await outcome; if(answer.error) throw answer.error;
    assert.equal(JSON.parse(answer.value).status,'expired','expiry checked after acquiring lock');
    await b.query('COMMIT');
    assert.equal(sql(`SELECT consumed_sid IS NULL AND answered_at IS NULL FROM sms_prompts WHERE id='${p.id}'`).trim(),'t','expired contender wrote nothing');
    log('PASS lock-wait crosses expiry: B returns expired without consumption');
  } finally { await Promise.all([a.close(),b.close()]); }
  await observer.close();
}

async function availabilityConcurrency() {
  const party='51000000-0000-4000-8000-000000000030', project='51000000-0000-4000-8000-000000000020';
  const target='51000000-0000-4000-8000-000000000040', otherTarget='51000000-0000-4000-8000-000000000041';
  const effect=JSON.stringify({type:'confirm_availability',target:{kind:'task',id:target},note:'available',availability:{date:'2026-11-03',window:'09:00-11:00'}});
  sql(`INSERT INTO project_party_authority(engagement_id,scope,effective_from) VALUES('${party}','schedule',CURRENT_DATE-1);
    UPDATE studio_channel_consent SET status='granted',refusal_unanswered=false WHERE organization_id='51000000-0000-4000-8000-000000000010';
    CREATE TABLE public.sq66_availability_writes(subject_id uuid);
    CREATE FUNCTION public.sq66_count_availability() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO public.sq66_availability_writes VALUES(NEW.subject_id); RETURN NEW; END $$;
    CREATE TRIGGER sq66_count_availability AFTER UPDATE ON field_delivery_reports FOR EACH ROW EXECUTE FUNCTION public.sq66_count_availability();`);
  const observer=new Session();
  let generation=1000;
  const create=(subject,expires="clock_timestamp()+interval '1 day'",sender='+15555109999',recipient='+15555100000') =>
    `SELECT row_to_json(p) FROM sms_create_prompt('${party}','${project}','confirm_availability','${subject}',${++generation},${expires},'${sender}','${recipient}') p`;
  const message=() => {
    const id=randomUUID();
    sql(`INSERT INTO sms_messages(id,conversation_id,direction,body,twilio_sid) VALUES('${id}',
      '51000000-0000-4000-8000-000000000050','inbound','Tuesday 9-11','SM${id.replaceAll('-','')}')`);
    return id;
  };
  const apply=(p,m) => `SELECT pg_temp.sq66_apply('${p.id}','${m}')`;
  const prepare=async s => s.query(`CREATE FUNCTION pg_temp.sq66_apply(p uuid,m uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
    RETURN sms_apply_prompt(p,'+1 (555) 510-9999','+1 (555) 510-0000',m,'${effect}'::jsonb);
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'error',SQLERRM); END $$`);
  const blocked=async (owner,waiter,tag,outcome) => {
    let barrier=false, settled=false; outcome.finally(()=>{settled=true;});
    const deadline=Date.now()+10000;
    while(Date.now()<deadline && !settled) {
      barrier=(await observer.query(`SELECT ${owner}=ANY(pg_blocking_pids(${waiter}))`))==='t';
      if(barrier) break;
    }
    assert.ok(barrier,tag+' issuance/availability serialized by actual pair lock');
    log(`barrier ${tag}: waiter=${waiter} blocked by owner=${owner}`);
  };
  const writes=() => Number(sql('SELECT count(*) FROM sq66_availability_writes').trim());
  const assertOriginal=(p,m,n,tag) => {
    assert.equal(writes(),n+1,tag+' exactly one committed availability write');
    assert.equal(sql(`SELECT count(*)=1 AND bool_and(subject_id='${target}' AND party_id='${party}' AND project_id='${project}'
      AND proposed_date='2026-11-03' AND proposed_window='09:00-11:00' AND arrived_at IS NULL) FROM field_delivery_reports`).trim(),'t',tag+' original target/date/window only');
    assert.equal(sql(`SELECT consumed_sid='SM${m.replaceAll('-','')}' AND answered_at IS NOT NULL FROM sms_prompts WHERE id='${p.id}'`).trim(),'t',tag+' original prompt receipt');
    assert.equal(sql(`SELECT body='Tuesday 9-11' AND applied_effect IS NOT NULL FROM sms_messages WHERE id='${m}'`).trim(),'t',tag+' original inbound body and stamp');
  };
  try {
    for(const first of ['creation','consumption']) {
      for(const ending of ['COMMIT','ROLLBACK']) {
        for(const expire of (first==='creation'?[false,true]:[false])) {
          const tag=`availability ${first}-first/${ending}${expire?'/expiry':''}`;
          const a=new Session(), b=new Session();
          try {
            const p=JSON.parse(sql(create(target,expire?"clock_timestamp()+interval '2 seconds'":undefined)).trim());
            const m=message(), n=writes();
            const before=sql(`SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM project_tasks t),
              (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client_decisions t))`).trim();
            await prepare(a); await prepare(b);
            const pidA=Number(await a.query('SELECT pg_backend_pid()')),pidB=Number(await b.query('SELECT pg_backend_pid()'));
            await a.query("BEGIN; SET LOCAL statement_timeout='18s'; SET LOCAL idle_in_transaction_session_timeout='18s'");
            let created, resultA;
            if(first==='creation') created=JSON.parse(await a.query(create(otherTarget,undefined,'+1 (555) 510-9999','+1 (555) 510-0000')));
            else {
              resultA=JSON.parse(await a.query(apply(p,m)));
              assert.equal(resultA.status,'applied',tag+' first consumption applies');
            }
            await b.query("BEGIN; SET LOCAL statement_timeout='18s'");
            const pending=b.query(first==='creation'?apply(p,m):create(otherTarget));
            const outcome=pending.then(value=>({value}),error=>({error}));
            await blocked(pidA,pidB,tag,outcome);
            if(first==='creation') {
              // B waits on the pair BEFORE taking the prompt row, not vice versa.
              await a.query(`SELECT id FROM sms_prompts WHERE id='${p.id}' FOR UPDATE NOWAIT`);
              if(expire) {
                let expired=false; const deadline=Date.now()+10000;
                while(Date.now()<deadline) {
                  expired=(await observer.query(`SELECT expires_at<clock_timestamp() FROM sms_prompts WHERE id='${p.id}'`))==='t';
                  if(expired) break;
                }
                assert.ok(expired,tag+' observed wall-clock expiry behind issuance lock');
              }
            }
            await a.query(ending);
            const answer=await outcome; if(answer.error) throw answer.error;
            const resultB=JSON.parse(answer.value);
            await b.query('COMMIT');
            if(first==='creation') {
              if(expire) assert.equal(resultB.status,'expired',tag+' expiry rechecked after pair lock');
              else if(ending==='COMMIT') assert.equal(resultB.sqlstate,'23514',tag+' second open prompt refuses freeform');
              else assert.equal(resultB.status,'applied',tag+' rolled-back issuance leaves original binding');
              if(expire || ending==='COMMIT') {
                assert.equal(writes(),n,tag+' refused availability zero writes');
                assert.equal(sql(`SELECT consumed_sid IS NULL AND answered_at IS NULL FROM sms_prompts WHERE id='${p.id}'`).trim(),'t',tag+' no receipt or closure');
                assert.equal(sql(`SELECT applied_effect IS NULL AND body='Tuesday 9-11' FROM sms_messages WHERE id='${m}'`).trim(),'t',tag+' no message mutation');
              } else assertOriginal(p,m,n,tag);
            } else {
              created=resultB;
              if(ending==='COMMIT') {
                assertOriginal(p,m,n,tag);
                const replay=JSON.parse(await b.query(apply(p,m)));
                assert.equal(replay.status,'replayed',tag+' later issuance cannot invalidate replay');
                assert.deepEqual(replay.result,resultA.result,tag+' exact recorded result');
                assert.equal(JSON.parse(await b.query(apply(p,message()))).status,'closed',tag+' distinct SID never repeats');
                assert.equal(writes(),n+1,tag+' retries never duplicate');
              } else {
                assert.equal(writes(),n,tag+' rolled-back consumption zero writes');
                assert.equal(JSON.parse(await b.query(apply(p,m))).sqlstate,'23514',tag+' retry sees two prompts, never retargets');
                assert.equal(sql(`SELECT consumed_sid IS NULL AND answered_at IS NULL FROM sms_prompts WHERE id='${p.id}'`).trim(),'t',tag+' rolled-back receipt remains absent');
                assert.equal(sql(`SELECT applied_effect IS NULL FROM sms_messages WHERE id='${m}'`).trim(),'t',tag+' message stamp rolled back');
              }
            }
            assert.equal(sql(`SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM project_tasks t),
              (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client_decisions t))`).trim(),before,tag+' tasks and coordination unchanged');
            assert.equal(sql(`SELECT count(*) FROM field_delivery_reports WHERE subject_id='${otherTarget}'`).trim(),'0',tag+' never substitutes competing target');
            assert.equal(sql(`SELECT count(*) FROM sms_prompts WHERE id='${created.id}' AND consumed_sid IS NOT NULL`).trim(),'0',tag+' competing prompt never consumed');
            sql(`UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE answered_at IS NULL AND id IN ('${p.id}','${created.id}')`);
            log(`PASS ${tag}: original binding, no substitution/duplicate, transactional ${ending.toLowerCase()}`);
          } finally { await Promise.all([a.close(),b.close()]); }
        }
      }
    }
  } finally { await observer.close(); }
}

async function rawCompletionConcurrency() {
  const observer=new Session();
  let generation=2000;
  try {
    for (const [first,second,effectType] of [['raw','raw','flag_blocker'],['raw','atomic','flag_blocker'],['atomic','raw','flag_blocker'],['raw','raw','note']]) {
      for (const ending of ['COMMIT','ROLLBACK']) {
        const tag=`SQ71 ${first}->${second}/${effectType}/${ending}`;
        const a=new Session(),b=new Session();
        try {
          sql("UPDATE studio_channel_consent SET status='granted',refusal_unanswered=false WHERE organization_id='51000000-0000-4000-8000-000000000010'");
          const effect={type:effectType,target:{kind:'task',id:'51000000-0000-4000-8000-000000000040'},note:tag};
          const p=JSON.parse(sql(`SELECT row_to_json(p) FROM sms_create_prompt('51000000-0000-4000-8000-000000000030',
            '51000000-0000-4000-8000-000000000020','${effectType}','51000000-0000-4000-8000-000000000040',
            ${++generation},clock_timestamp()+interval '1 day','+15555109999','+15555100000','${JSON.stringify(effect)}') p`).trim());
          const m=randomUUID();
          sql(`INSERT INTO sms_messages(id,conversation_id,direction,body,twilio_sid) VALUES('${m}',
            '51000000-0000-4000-8000-000000000050','inbound','YES ${p.short_code}','SM${m.replaceAll('-','')}')`);
          const call=(kind,replacement=false)=> kind==='atomic'
            ? `SELECT sms_apply_prompt('${p.id}','+15555109999','+15555100000','${m}')`
            : `SELECT apply_field_effect('51000000-0000-4000-8000-000000000030','${JSON.stringify(replacement?{...effect,note:'replacement ignored'}:effect)}','sms','${m}')`;
          const before=Number(sql("SELECT count(*) FROM client_decisions WHERE coordination_kind='rfi'").trim());
          const pidA=Number(await a.query('SELECT pg_backend_pid()')),pidB=Number(await b.query('SELECT pg_backend_pid()'));
          await a.query("BEGIN; SET LOCAL statement_timeout='18s'; SET LOCAL idle_in_transaction_session_timeout='18s'");
          const rA=JSON.parse(await a.query(call(first)));
          const original=first==='atomic'?rA.result.result:rA;
          assert.equal(original.applied,effectType!=='note',tag+' first legitimate result');
          // Simulate a lost response: another reader cannot see A's completion
          // yet, even though its operation is in progress. NULL cannot prove rollback.
          assert.equal(await observer.query(`SELECT applied_effect IS NULL AND party_id IS NULL AND project_id IS NULL FROM sms_messages WHERE id='${m}'`),'t',tag+' completion-unknown MVCC read sees unresolved origin');
          await b.query("BEGIN; SET LOCAL statement_timeout='18s'");
          let settled=false;
          const outcome=b.query(call(second,true)).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
          let blocked=false;const deadline=Date.now()+10000;
          while(Date.now()<deadline&&!settled){blocked=(await observer.query(`SELECT ${pidA}=ANY(pg_blocking_pids(${pidB}))`))==='t';if(blocked)break;}
          assert.ok(blocked,tag+' raw completion contender must block on original message');
          log(`barrier ${tag}: B=${pidB} blocked by A=${pidA}; unresolved read did not authorize overlap`);
          await a.query(ending);
          const answer=await outcome;if(answer.error)throw answer.error;
          const rB=JSON.parse(answer.value);
          if(ending==='COMMIT') {
            if(second==='raw')assert.deepEqual(rB,{...original,_sms_replayed:true},tag+' waiter returns original result only');
            else assert.deepEqual(rB,{status:'already_completed'},tag+' raw replay cannot close atomic prompt');
          } else {
            const saved=second==='raw'?rB:rB.result.result;
            assert.equal(saved.applied,effectType!=='note',tag+' rollback waiter applies once');
            assert.equal(saved._sms_replayed,undefined,tag+' rollback waiter is not a replay');
          }
          await b.query('COMMIT');
          const completed=JSON.parse(sql(`SELECT applied_effect FROM sms_messages WHERE id='${m}'`).trim());
          assert.equal(completed._sms_replayed,undefined,tag+' return-only sentinel never stored');
          assert.equal(Number(sql("SELECT count(*) FROM client_decisions WHERE coordination_kind='rfi'").trim()),before+(effectType==='flag_blocker'?1:0),tag+' exactly one original business operation');
          const receipt=JSON.parse(sql(`SELECT jsonb_build_object('answered',answered_at IS NOT NULL,'receipt',consumption_result) FROM sms_prompts WHERE id='${p.id}'`).trim());
          const atomicWon=ending==='COMMIT'?first==='atomic':second==='atomic';
          assert.equal(receipt.answered,atomicWon,tag+' only actual atomic winner closes prompt');
          assert.equal(receipt.receipt!==null,atomicWon,tag+' no misleading raw receipt');
          const retry=JSON.parse(sql(call('raw',true)).trim());
          assert.deepEqual(retry,{...completed,_sms_replayed:true},tag+' lost-response retry reuses durable original');
          log(`PASS ${tag}: original result, one mutation, atomic receipt iff atomic winner`);
        } finally {await Promise.all([a.close(),b.close()]);}
      }
    }
  } finally {await observer.close();}
}
