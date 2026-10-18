// SQ-1323 copy (via SQ-1317) of the SQ-1047 R2 fixtures — LOCAL only. `node fixtures.mjs draft` → a fresh Juniper Row draft.
// Ashgrove: one priced + one unpriced piece. Linden (no studio): bob's pending hours + an unpriced piece.
// Wren: a milestone (no client). Juniper Row: Leah's job for a household with no email + a draft invoice.
import { createRequire } from 'node:module';
import { sql, env, WT } from './walk-lib.mjs';
if (!env.API_URL.startsWith('http://127.0.0.1:')) throw new Error('not local');
const { createClient } = createRequire(WT + '/packages/supabase/package.json')('@supabase/supabase-js');
const LDS = 'b0000000-0000-0000-0000-000000000001';
const LEAH = sql(`select id from auth.users where email='designer@patina.dev'`);
const BOB = sql(`select id from auth.users where email='cf-phase1-bob@patina.invalid'`);
const WREN = 'f1900000-0000-4000-8000-000000000003';
const pid = (name) => sql(`select id from projects where name='${name}' order by created_at desc limit 1`);
const ash = pid('Ashgrove Mudroom'), linden = pid('Linden Attic');
const piece = (project, name, cents) =>
  sql(`insert into project_ffe_items (project_id, name, quantity, unit_price_cents) values ('${project}', '${name}', 1, ${cents ?? 'null'}) returning id`);

if (process.argv[2] === 'base') {
  const out = {};
  out.ashPriced = piece(ash, 'ZZ Oak entry bench', 120000);
  out.ashUnpriced = piece(ash, 'ZZ Iron coat hooks', null);
  out.lindenUnpriced = piece(linden, 'ZZ Dormer reading lamp', null);
  sql(`insert into project_time_entries (project_id, user_id, started_at, duration_minutes, billable, notes) values ('${linden}', '${BOB}', now() - interval '20 hours', 60, true, 'ZZ SQ-1047 survey')`);
  if (sql(`select count(*) from project_payment_milestones where label='ZZ SQ-1047 deposit'`) === '0')
    sql(`insert into project_payment_milestones (project_id, label, percentage, amount_cents, status, sort_order) values ('${WREN}', 'ZZ SQ-1047 deposit', 50, 120000, 'pending', 98)`);

  // A household with no email anywhere: profile email NULL, Leah's book row with no client_email.
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const email = 'zz-sq1047-juniper@patina.invalid';
  let hid = sql(`select id from auth.users where email='${email}'`);
  if (!hid) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: 'password123', email_confirm: true, user_metadata: { full_name: 'Juniper Okafor' } });
    if (error) throw error;
    hid = data.user.id;
  }
  sql(`update profiles set email=null, full_name='Juniper Okafor' where id='${hid}'`);
  if (sql(`select count(*) from designer_clients where designer_id='${LEAH}' and client_id='${hid}'`) === '0')
    sql(`insert into designer_clients (designer_id, client_id, client_name, client_email, status) values ('${LEAH}', '${hid}', 'Juniper Okafor', null, 'active')`);
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: e0 } = await c.auth.signInWithPassword({ email: 'designer@patina.dev', password: 'password123' });
  if (e0) throw e0;
  const iss = JSON.parse(Buffer.from(s.session.access_token.split('.')[1], 'base64url')).iss;
  if (iss !== 'http://127.0.0.1:54321/auth/v1') throw new Error('iss ' + iss);
  let jun = pid('Juniper Row');
  if (!jun) {
    const { data, error } = await c.rpc('open_project_direct', { p_title: 'Juniper Row', p_client_id: hid, p_budget_min_cents: null, p_budget_max_cents: null, p_start_date: new Date().toISOString().slice(0, 10), p_id: null, p_studio_id: LDS });
    if (error) throw new Error('juniper: ' + JSON.stringify(error));
    jun = typeof data === 'string' ? data : data?.id ?? data?.project_id;
  }
  const row = sql(`select designer_id||'|'||client_id||'|'||coalesce(studio_id::text,'') from projects where id='${jun}'`).split('|');
  const { data: inv, error: e1 } = await c.rpc('create_draft_invoice', {
    p_project_id: jun, p_expected_designer_id: row[0], p_expected_client_id: row[1], p_expected_studio_id: row[2] || null,
    p_internal_notes: 'ZZ SQ-1047 send', p_lines: [{ kind: 'adhoc', description: 'ZZ SQ-1047 concept fee', quantity: 1, unit_amount_cents: 45000, sort_order: 0 }],
  });
  if (e1) throw new Error('draft: ' + JSON.stringify(e1));
  Object.assign(out, { ash, linden, juniper: jun, household: hid, invoice: inv.id });
  console.log(JSON.stringify(out, null, 1));
}
// node fixtures.mjs draft → a fresh Juniper Row draft (Leah's own RPC); prints its id last.
if (process.argv[2] === 'draft') {
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const { error: e0 } = await c.auth.signInWithPassword({ email: 'designer@patina.dev', password: 'password123' });
  if (e0) throw e0;
  const jun = pid('Juniper Row');
  const row = sql(`select designer_id||'|'||client_id||'|'||coalesce(studio_id::text,'') from projects where id='${jun}'`).split('|');
  const { data: inv, error } = await c.rpc('create_draft_invoice', {
    p_project_id: jun, p_expected_designer_id: row[0], p_expected_client_id: row[1], p_expected_studio_id: row[2] || null,
    p_internal_notes: 'ZZ SQ-1047 send', p_lines: [{ kind: 'adhoc', description: 'ZZ SQ-1047 concept fee', quantity: 1, unit_amount_cents: 45000, sort_order: 0 }],
  });
  if (error) throw new Error('draft: ' + JSON.stringify(error));
  console.log(inv.id);
}
