import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const workdir = process.env.E1_STACK_WORKDIR;
assert.ok(workdir?.includes('/scratchpad/rc7-e1-'), 'owned E1 scratch workdir required');
const env = execFileSync('supabase', ['status', '--workdir', workdir, '-o', 'env'], { encoding: 'utf8' });
const values = Object.fromEntries([...env.matchAll(/^([A-Z_]+)="?([^"\n]+)"?$/gm)].map(([, key, value]) => [key, value]));
assert.equal(values.API_URL, 'http://127.0.0.1:58121', 'E1 API only');
assert.ok(values.ANON_KEY && values.JWT_SECRET && values.SERVICE_ROLE_KEY);
const dbUrl = process.env.ROUND8_DB_URL;
assert.equal(new URL(dbUrl).hostname, '127.0.0.1');
assert.equal(new URL(dbUrl).port, '58122', 'E1 database only');
const sql = command => execFileSync('psql', [dbUrl, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', command], { encoding: 'utf8' });
const project = 'b0000000-0000-0000-0000-00000000c0d1';
const ownStudio = 'b0000000-0000-0000-0000-000000000001';
const otherStudio = 'e1041000-0000-4000-8000-000000000001';
const uid = n => `e1040000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const token = (id, role = 'authenticated') => {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub: id, role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  const message = `${head}.${payload}`;
  return `${message}.${createHmac('sha256', values.JWT_SECRET).update(message).digest('base64url')}`;
};
const fixture = `BEGIN;
  SET LOCAL session_replication_role=replica;
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
  SELECT ('e1040000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    'rc7-e1-http-'||n||'@test.invalid','',now(),now(),now(),
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated'
  FROM unnest(ARRAY[1,2,3,4,5,11,12,13]) n;
  INSERT INTO public.profiles(id,email,full_name,is_designer)
  SELECT id,email,'E1 HTTP actor',false FROM auth.users WHERE id::text LIKE 'e1040000-%';
  INSERT INTO public.organizations(id,type,name,slug,status)
  VALUES ('${otherStudio}','design_studio','E1 Other Studio','e1-http-other-studio','active');
  INSERT INTO public.organization_members(user_id,organization_id,role,status)
  VALUES ('${uid(1)}','${ownStudio}','member','active'),
    ('${uid(2)}','${ownStudio}','guest','active'),
    ('${uid(3)}','${ownStudio}','member','removed'),
    ('${uid(4)}','${otherStudio}','owner','active');
  INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,company_name,company_kind)
  VALUES ('e1045000-0000-4000-8000-000000000011','${ownStudio}','company','trade','GC','gc'),
    ('e1045000-0000-4000-8000-000000000012','${ownStudio}','company','trade','Maker','maker'),
    ('e1045000-0000-4000-8000-000000000013','${ownStudio}','company','trade','Supplier','supplier');
  INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,profile_id,company_id)
  SELECT ('e1046000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    '${ownStudio}','person','trade','E1 HTTP party '||n,
    ('e1040000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    ('e1045000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
  FROM unnest(ARRAY[11,12,13]) n;
  SET LOCAL session_replication_role=origin;
  COMMIT;`;
const cleanup = `BEGIN;
  CREATE TEMP TABLE e1_owned(rel oid, tid tid, PRIMARY KEY(rel,tid));
  INSERT INTO e1_owned SELECT 'auth.users'::regclass,ctid FROM auth.users WHERE id::text LIKE 'e1040000-%';
  INSERT INTO e1_owned SELECT 'public.organizations'::regclass,ctid FROM public.organizations WHERE id='${otherStudio}';
  INSERT INTO e1_owned SELECT 'public.studio_contacts'::regclass,ctid FROM public.studio_contacts WHERE id::text LIKE 'e1045000-%' OR id::text LIKE 'e1046000-%';
  DO $clean$ DECLARE fk record; predicate text; added integer; total integer; pass integer:=0; owned record;
  BEGIN LOOP
    total:=0; pass:=pass+1;
    IF pass>30 THEN RAISE EXCEPTION 'E1 HTTP cleanup exceeded FK closure'; END IF;
    FOR fk IN SELECT c.* FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND n.nspname IN ('public','auth') LOOP
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
  IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'e1040000-%') OR
     EXISTS(SELECT 1 FROM public.organizations WHERE id='${otherStudio}') OR
     EXISTS(SELECT 1 FROM public.studio_contacts WHERE id::text LIKE 'e1045000-%' OR id::text LIKE 'e1046000-%') THEN
    RAISE EXCEPTION 'E1 HTTP cleanup left fixture roots';
  END IF;
  END $clean$; COMMIT;`;
const path = `${project}/${randomUUID()}.pdf`;
const bytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const digest = createHash('sha256').update(bytes).digest('hex');
const url = `${values.API_URL}/storage/v1/object/service-acceptance-paper/${path}`;
const request = (method, bearer, body) => fetch(url, {
  method, headers: { apikey: values.ANON_KEY, Authorization: `Bearer ${bearer}`,
    ...(body ? { 'content-type': 'application/pdf' } : {}) }, body,
});

test('private paper bytes: studio member succeeds, real external identities are refused', { timeout: 45000 }, async () => {
  assert.equal(sql("SELECT count(*) FROM auth.users WHERE id::text LIKE 'e1040000-%'" ).trim(), '0');
  let fixtureOwned = false;
  try {
    fixtureOwned = true;
    sql(fixture);
    const upload = await request('POST', token('a0000000-0000-0000-0000-000000000004'), bytes);
    assert.equal(upload.status, 200, `owner upload: ${upload.status} ${await upload.text()}`);
    for (const [actor, bearer, allowed] of [
      ['owner', token('a0000000-0000-0000-0000-000000000004'), true],
      ['admin', token('a0000000-0000-0000-0000-000000000003'), true],
      ['active member', token(uid(1)), true],
      ['client', token('a0000000-0000-0000-0000-000000000005'), false],
      ['other studio owner', token(uid(4)), false],
      ['guest', token(uid(2)), false], ['removed member', token(uid(3)), false],
      ['unlinked', token(uid(5)), false],
      ['gc', token(uid(11)), false], ['maker', token(uid(12)), false],
      ['supplier', token(uid(13)), false], ['anon', values.ANON_KEY, false],
    ]) {
      const download = await request('GET', bearer);
      if (allowed) {
        assert.equal(download.status, 200, `${actor} reads bytes`);
        assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'), digest,
          `${actor} receives the original SHA-256-bound bytes`);
      } else {
        const denial = await download.json();
        assert.equal(download.status, 400, `${actor} Storage refusal: ${JSON.stringify(denial)}`);
        assert.deepEqual(denial, { statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' },
          `${actor} receives the exact private-object refusal`);
      }
    }
  } finally {
    const removed = await request('DELETE', values.SERVICE_ROLE_KEY);
    assert.ok([200, 404].includes(removed.status), `service-role object cleanup: ${removed.status}`);
    if (fixtureOwned) sql(cleanup);
  }
});
