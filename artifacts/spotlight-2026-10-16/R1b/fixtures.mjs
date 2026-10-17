// SQ-1114 fixtures for rows 8 and the re-pend before row 3 — LOCAL only. Run after walk-seed.mjs.
// node fixtures.mjs base   → milestone on Wren (Leah, no client) + a draft and a sent invoice for the send rows
// node fixtures.mjs repend → two more pending (rate_source='none') hours for bob on Ashgrove
import { createRequire } from 'node:module';
import { sql, env, WT } from './walk-lib.mjs';
if (!env.API_URL.startsWith('http://127.0.0.1:')) throw new Error('not local');
const { createClient } = createRequire(WT + '/packages/supabase/package.json')('@supabase/supabase-js');
const LEAH = sql(`select id from auth.users where email='designer@patina.dev'`);
const BOB = sql(`select id from auth.users where email='cf-phase1-bob@patina.invalid'`);
const WREN = 'f1900000-0000-4000-8000-000000000003';
const mode = process.argv[2];

if (mode === 'base') {
  if (sql(`select count(*) from project_payment_milestones where label='ZZ SQ-1114 deposit'`) === '0') sql(`insert into project_payment_milestones (project_id, label, percentage, amount_cents, status, sort_order) values ('${WREN}', 'ZZ SQ-1114 deposit', 50, 120000, 'pending', 99)`);
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: e0 } = await c.auth.signInWithPassword({ email: 'designer@patina.dev', password: 'password123' });
  if (e0) throw e0;
  const iss = JSON.parse(Buffer.from(s.session.access_token.split('.')[1], 'base64url')).iss;
  if (iss !== 'http://127.0.0.1:54321/auth/v1') throw new Error('iss ' + iss);
  // A Leah project with a client, for the send rows; the invoices are written by her own RPCs.
  const row = sql(`select id||'|'||designer_id||'|'||client_id||'|'||coalesce(studio_id::text,'') from projects where designer_id='${LEAH}' and client_id is not null and status::text not in ('archived','cancelled') order by created_at limit 1`);
  const [pid, did, cid, sid] = row.split('|');
  console.log('send project', row, sql(`select name from projects where id='${pid}'`));
  for (const which of ['issue', 'resend']) {
    const { data, error } = await c.rpc('create_draft_invoice', {
      p_project_id: pid, p_expected_designer_id: did, p_expected_client_id: cid, p_expected_studio_id: sid || null,
      p_internal_notes: `ZZ SQ-1114 ${which}`,
      p_lines: [{ kind: 'adhoc', description: `ZZ SQ-1114 ${which} line`, quantity: 1, unit_amount_cents: 25000, sort_order: 0 }],
    });
    if (error) throw new Error(which + ': ' + JSON.stringify(error));
    if (which === 'resend') {
      const { error: e2 } = await c.rpc('issue_invoice', { p_invoice_id: data.id });
      if (e2) throw new Error('issue: ' + JSON.stringify(e2));
    }
    console.log(which, sql(`select id||' '||status||' '||coalesce(invoice_number,'-') from invoices where id='${data.id}'`));
  }
}
if (mode === 'repend') {
  const ash = sql(`select id from projects where name='Ashgrove Mudroom' order by created_at desc limit 1`);
  sql(`insert into project_time_entries (project_id, user_id, started_at, duration_minutes, billable, notes) values ('${ash}', '${BOB}', now() - interval '32 hours', 60, true, 'ZZ SQ-1114 repend a'), ('${ash}', '${BOB}', now() - interval '31 hours', 60, true, 'ZZ SQ-1114 repend b')`);
  console.log(sql(`select rate_source, count(*) from project_time_entries where project_id='${ash}' group by 1`));
}
