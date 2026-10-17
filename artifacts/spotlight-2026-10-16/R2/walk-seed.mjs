// SQ-1047 walk seeds (SQ-1060/SQ-1114 seeds) — LOCAL Supabase only. Run after `pnpm supabase:reset`.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const WT = '/Users/kody/.claude/sidequest/worktrees/patina-merged-5f06cee3/agent-add7be5e94c3c3cb0';
const require = createRequire(WT + '/packages/supabase/package.json');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(
  execSync('supabase status -o env', { cwd: WT, encoding: 'utf8' })
    .split('\n').filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
);
if (!env.API_URL.startsWith('http://127.0.0.1:')) throw new Error('not local: ' + env.API_URL);
const PG = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = (q) => execSync(`psql "${PG}" -v ON_ERROR_STOP=1 -Atc ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();

// The cf-phase1 synthetic users are seeded banned, passwordless, with NULL token columns and no
// designer domain role. Make them usable locally (never on Strata).
sql(`update auth.users set banned_until=null, encrypted_password=extensions.crypt('password123', extensions.gen_salt('bf')), email_confirmed_at=coalesce(email_confirmed_at, now()), confirmation_token=coalesce(confirmation_token,''), recovery_token=coalesce(recovery_token,''), email_change_token_new=coalesce(email_change_token_new,''), email_change=coalesce(email_change,''), email_change_token_current=coalesce(email_change_token_current,''), phone_change=coalesce(phone_change,''), phone_change_token=coalesce(phone_change_token,''), reauthentication_token=coalesce(reauthentication_token,'') where email like 'cf-phase1-%'`);
sql(`insert into user_roles (user_id, role_id) select u, ur.role_id from user_roles ur join roles r on r.id=ur.role_id and r.domain='designer', unnest(array['cf100000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000002']::uuid[]) u where ur.user_id='a0000000-0000-0000-0000-000000000004' on conflict do nothing`);

async function as(email) {
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'password123' });
  if (error) throw error;
  const iss = JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url')).iss;
  if (!iss.startsWith('http://127.0.0.1:54321')) throw new Error('JWT iss not local: ' + iss);
  return { c, id: data.user.id };
}
const must = ({ data, error }, what) => { if (error) throw new Error(what + ': ' + JSON.stringify(error)); return data; };
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();

const LDS = 'b0000000-0000-0000-0000-000000000001';
// SQ-1114: at 36a1f096e bob also owns a 'Phase One Bob' workspace, so the 6-arg path refuses
// (studio_id_not_designer_studio); name Local Dev Studio through the K9 7-arg overload.
const in7 = (s) => ({ p_client_id: null, p_budget_min_cents: null, p_budget_max_cents: null, p_start_date: new Date().toISOString().slice(0, 10), p_id: null, p_studio_id: s });
const CLIENT_USER = 'a0000000-0000-0000-0000-000000000005';
const bob = await as('cf-phase1-bob@patina.invalid');
const alice = await as('cf-phase1-alice@patina.invalid');
const leah = await as('designer@patina.dev');

// 1. Linden Attic — bob opens it while he holds no studio seat: studio_id stays NULL.
// 2. bob joins Local Dev Studio as a plain member.
sql(`insert into organization_members (organization_id, user_id, role, status) values ('${LDS}', '${bob.id}', 'member', 'active') on conflict do nothing`);
// 3. Ashgrove Mudroom — bob, now one studio, no client.
const linden = must(await bob.c.rpc('open_project_direct', { ...in7(LDS), p_title: 'Linden Attic' }), 'linden');
const ash = must(await bob.c.rpc('open_project_direct', { ...in7(LDS), p_title: 'Ashgrove Mudroom' }), 'ash');
// 4. bob's book carries Client User so an owner can link it from the lead's book.
sql(`insert into designer_clients (designer_id, client_id, client_name, client_email, status) values ('${bob.id}', '${CLIENT_USER}', 'Client User', 'client@patina.dev', 'active')`);
const id = (r) => (typeof r === 'string' ? r : r?.id ?? r?.project_id ?? JSON.stringify(r));
const ashId = id(ash), lindenId = id(linden);
// Linden: client linked so its only billing gap is the studio.
sql(`set session_replication_role=replica; update projects set studio_id=null, client_id='${CLIENT_USER}' where id='${lindenId}'`);
// 5. bob logs 3h on Ashgrove with no rate set (rate_source='none').
must(await bob.c.from('project_time_entries').insert([
  { project_id: ashId, user_id: bob.id, started_at: hoursAgo(30), duration_minutes: 90, billable: true, notes: 'ZZ SQ-1060 measure' },
  { project_id: ashId, user_id: bob.id, started_at: hoursAgo(28), duration_minutes: 90, billable: true, notes: 'ZZ SQ-1060 drawings' },
]), 'bob hours');
// 6. Alice (solo owner): Fernhill Study stamped at creation; 2h pending, no rate.
const fern = id(must(await alice.c.rpc('open_project_direct', { p_title: 'Fernhill Study' }), 'fern'));
must(await alice.c.from('project_time_entries').insert([
  { project_id: fern, user_id: alice.id, started_at: hoursAgo(26), duration_minutes: 120, billable: true, notes: 'ZZ SQ-1060 concept' },
]), 'alice hours');
// 7. Alice legacy row: a project opened before her studio existed (studio_id NULL), seeded with triggers off.
const old = id(must(await alice.c.rpc('open_project_direct', { p_title: 'Old Mill Kitchen' }), 'old'));
sql(`set session_replication_role=replica; update projects set studio_id=null, client_id='${CLIENT_USER}' where id='${old}'`);
// 8. Leah: Harrow Road Flat (no client) gets one unbilled billable hour — its only money.
must(await leah.c.from('project_time_entries').insert([
  { project_id: 'f1900000-0000-4000-8000-000000000002', user_id: leah.id, started_at: hoursAgo(24), duration_minutes: 60, billable: true, notes: 'ZZ SQ-1060 band hour' },
]), 'leah hour');
console.log(JSON.stringify({ bob: bob.id, alice: alice.id, ashId, lindenId, fern, old }, null, 1));
console.log(sql(`select name, coalesce(studio_id::text,'NULL'), coalesce(client_id::text,'NULL'), designer_id from projects where id in ('${ashId}','${lindenId}','${fern}','${old}')`));
console.log(sql(`select p.name, e.user_id, e.rate_source, e.duration_minutes from project_time_entries e join projects p on p.id=e.project_id`));
