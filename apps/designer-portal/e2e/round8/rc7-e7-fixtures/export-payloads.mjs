#!/usr/bin/env node
// RC-7 E7: export what each consumer actually receives from the owned stack
// after mixed-fixture.sql. Every actor signs in through GoTrue (password grant)
// and every read goes through PostgREST with that session, exactly as the
// web hooks, iOS Patina (DecisionsAPIClient) and Capture
// (SupabaseDecisionsReadService) issue them.
//
//   RC7_E7_ENV=<file from `supabase status -o env`> node export-payloads.mjs
//
// Refuses any API URL but 127.0.0.1:59121. Keys are read from the env file and
// never printed. Output: payloads/*.json beside this file (stable order).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = process.env.RC7_E7_ENV;
if (!envFile) throw new Error('RC7_E7_ENV is required');
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter(Boolean)
  .map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]; }));
const api = env.API_URL;
if (api !== 'http://127.0.0.1:59121') throw new Error(`refused: ${api} is not the owned rc7-e7 API`);
const anon = env.ANON_KEY;
const uid = (n) => `e7e70000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const email = (n) => `rc7-e7-${n}@patina.test`;

async function signIn(n) {
  const res = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email: email(n), password: 'password123' }),
  });
  if (!res.ok) throw new Error(`sign-in ${n}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.user?.id !== uid(n)) throw new Error(`sign-in ${n}: wrong user`);
  return body.access_token;
}
async function call(token, method, path, body) {
  const res = await fetch(`${api}/rest/v1/${path}`, {
    method,
    headers: { apikey: anon, Authorization: `Bearer ${token}`, Accept: 'application/json',
      'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}
const rpc = (token, name, args = {}) => call(token, 'POST', `rpc/${name}`, args);
const get = (token, path) => call(token, 'GET', path);

// IDs the fixture recorded (read as the stack owner through the service key,
// never printed): projects and requests.
const service = env.SERVICE_ROLE_KEY;
const results = await call(service, 'GET', 'rc7_e7_fixture_results?select=key,value');
if (results.status !== 200) {
  throw new Error(`fixture results unreadable (HTTP ${results.status}); grant select on rc7_e7_fixture_results to service_role`);
}
const r = Object.fromEntries(results.body.map((row) => [row.key, row.value]));
const project = { job1: r.origin1.projectId, job2: r.origin2.projectId, job3: r.origin3.projectId };
const request = { r1: r.r1.requestId, r2: r.r2.requestId, p1: r.p1.requestId, s1: r.s1.requestId, s2: r.s2.requestId };
const decision = (n) => `e7e7a000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// The exact selects the native readers send.
const iosDecisionColumns = 'id,project_id,title,description:context,status,decision_type,'
  + 'coordination_kind,court,approval_contract,recommended_option_id,viewed_at,responded_at,due_date,'
  + 'client_consent_method,client_consented_at,created_at,';
const iosDecisionSelect = `${iosDecisionColumns}project:projects(name,designer:profiles!projects_designer_id_fkey(id,display_name,full_name,business_name))`;
const iosOptionSelect = 'id,decision_id,title:name,description:designer_note,image_url,price_cents:price,'
  + 'is_recommended,selected,sort_order,product:products(name,images,price_retail)';
const captureDecisionColumns = 'id,title,context,status,created_at,viewed_at,due_date,'
  + 'project:projects(name),designer_client:designer_clients(client_name,client_email,client:profiles!client_id(full_name))';
const captureOptionColumns = 'id,name,designer_note,image_url,price,is_recommended,selected,product:products(name,images,price_retail)';
const enc = encodeURIComponent;

const out = { meta: { api, exportedAt: new Date().toISOString(), project, request }, actors: {} };
const actors = {
  1: 'studio_owner', 2: 'studio_member', 3: 'studio_admin', 4: 'other_studio_owner', 5: 'client_lead',
  6: 'co_client', 7: 'replaced_partner', 8: 'replacement_partner', 9: 'gc_party', 10: 'outsider',
};
for (const [n, label] of Object.entries(actors)) {
  const token = await signIn(Number(n));
  const a = {};
  a.list_my_project_decision_reviews = await rpc(token, 'list_my_project_decision_reviews');
  a.get_my_service_acceptance_requests = await rpc(token, 'get_my_service_acceptance_requests');
  for (const [job, id] of Object.entries(project)) {
    a[`get_project_decision_reviews.${job}`] = await rpc(token, 'get_project_decision_reviews', { p_project_id: id });
    a[`get_studio_service_completion.${job}`] = await rpc(token, 'get_studio_service_completion', { p_project_id: id });
  }
  for (let d = 1; d <= 5; d += 1) {
    a[`get_project_decision_review.a${d}`] = await rpc(token, 'get_project_decision_review', { p_decision_id: decision(d) });
  }
  for (const key of ['r2', 'p1', 's2']) {
    a[`get_my_service_acceptance_evidence.${key}`] = await rpc(token, 'get_my_service_acceptance_evidence', { p_request_id: request[key] });
  }
  // iOS Patina: DecisionsAPIClient.listPending + listOptions (legacy rail).
  a['ios.client_decisions.pending'] = await get(token,
    `client_decisions?select=${enc(iosDecisionSelect)}&status=eq.pending&order=due_date.asc.nullslast,created_at.desc`);
  a['ios.client_decision_options.b1'] = await get(token,
    `client_decision_options?select=${enc(iosOptionSelect)}&decision_id=eq.e7e7b000-0000-4000-8000-000000000001&order=sort_order.asc`);
  // Capture: SupabaseDecisionsReadService.listPending + decisionDetail.
  a['capture.client_decisions.pending'] = await get(token,
    `client_decisions?select=${enc(captureDecisionColumns)}&status=eq.pending&order=due_date.asc.nullslast,created_at.desc`);
  a['capture.client_decisions.a1'] = await get(token,
    `client_decisions?select=${enc(captureDecisionColumns)}&id=eq.${decision(1)}`);
  a['capture.client_decision_options.b1'] = await get(token,
    `client_decision_options?select=${enc(captureOptionColumns)}&decision_id=eq.e7e7b000-0000-4000-8000-000000000001&order=sort_order.asc,id.asc`);
  // Client portal project counts: the legacy pending read (projects.ts).
  a['client.legacy_pending_decisions'] = await get(token,
    `client_decisions?select=${enc('project_id,court,coordination_kind,designer_clients!inner(client_id)')}`
    + `&status=eq.pending&or=${enc('(approval_contract.is.null,approval_contract.neq.project_artifact_v1)')}`
    + `&designer_clients.client_id=eq.${uid(Number(n))}`);
  if (['1', '2', '3'].includes(n)) {
    for (const [job, id] of Object.entries(project)) {
      a[`get_project_service_acceptance.${job}`] = await rpc(token, 'get_project_service_acceptance', { p_project_id: id });
      a[`get_project_external_fulfilments.${job}`] = await rpc(token, 'get_project_external_fulfilments', { p_project_id: id });
    }
  }
  if (['5', '6'].includes(n)) {
    a['get_client_project_threshold.job1'] = await rpc(token, 'get_client_project_threshold', { p_project_id: project.job1 });
  }
  out.actors[label] = a;
}

const dir = join(here, 'payloads');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'mixed-payloads.json'), `${JSON.stringify(out, null, 2)}\n`);
const summary = Object.fromEntries(Object.entries(out.actors).map(([label, a]) => [label,
  Object.fromEntries(Object.entries(a).map(([k, v]) => [k, `${v.status}:${Array.isArray(v.body) ? `[${v.body.length}]` : typeof v.body}`]))]));
console.log(JSON.stringify(summary, null, 1));
