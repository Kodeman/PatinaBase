// INSERT-only seed for the US-50 walk. Local stack only. Names prefixed "US-50 Walk".
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const API = "http://127.0.0.1:54321";
const cfg = readFileSync("/Users/kody/Code/patina-merged/apps/designer-portal/playwright.config.ts", "utf8");
const svc = cfg.match(/SUPABASE_SERVICE_ROLE_KEY:\s*'(eyJ[^']+)'/)?.[1];
if (!svc) throw new Error("no local service key");
const PASSWORD = "password123";
const psql = (sql) => execFileSync("/opt/homebrew/opt/libpq/bin/psql", [DB, "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
async function ensureUser(email, name, role = "designer") {
  const ex = psql(`select id from auth.users where email=${q(email)}`);
  if (ex) return ex;
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: "POST", headers: { apikey: svc, Authorization: `Bearer ${svc}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name, role } }) });
  const j = await r.json(); if (!j.id) throw new Error(JSON.stringify(j)); return j.id;
}
const OWNER = "us50-owner@patina.dev", MEMBER = "us50-member@patina.dev", CLIENT = "us50-client@patina.dev";
const ownerId = await ensureUser(OWNER, "US-50 Walk Owner");
const memberId = await ensureUser(MEMBER, "US-50 Walk Member");
const clientId = await ensureUser(CLIENT, "US-50 Walk Client", "homeowner");
const ID = (n) => `50500000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const STUDIO = ID(1), PROJECT = ID(2), RECEIVER = ID(3), V_SOFA = ID(10), V_LAMP = ID(11), V_WORK = ID(12), V_MILL = ID(13), V_RUG = ID(14);
const tour = q(JSON.stringify({ tours: { "desk-walkthrough": { completed: true } } }));
psql(`
BEGIN;
INSERT INTO public.profiles (id,email,full_name,display_name,role,help_state) VALUES
 (${q(ownerId)},${q(OWNER)},'US-50 Walk Owner','US-50 Walk Owner','designer',${tour}::jsonb),
 (${q(memberId)},${q(MEMBER)},'US-50 Walk Member','US-50 Walk Member','designer',${tour}::jsonb)
 ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id,role_id) SELECT ${q(ownerId)},id FROM public.roles WHERE name IN ('independent_designer','studio_owner','app_user') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id,role_id) SELECT ${q(memberId)},id FROM public.roles WHERE name IN ('studio_designer','app_user') ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id,type,name,slug,status,address,release_threshold_cents,require_release_per_order)
 VALUES (${q(STUDIO)},'design_studio','US-50 Walk Studio','us-50-walk-studio','active','{"street":"7 Loom St","city":"Madison","state":"WI","zip":"53703","country":"US"}'::jsonb,500000,false) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at)
 SELECT m.user_id,${q(STUDIO)},m.role::public.member_role,'active',now() FROM (VALUES (${q(ownerId)}::uuid,'owner'),(${q(memberId)}::uuid,'member')) AS m(user_id,role)
 WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=${q(STUDIO)});
INSERT INTO public.studio_locations (id,organization_id,kind,label,address,is_default_receiver)
 VALUES (${q(RECEIVER)},${q(STUDIO)},'receiver','US-50 Walk Receiving Warehouse','{"street":"900 Dock Ln","city":"Madison","state":"WI","zip":"53716","country":"US"}'::jsonb,true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id,email,full_name,display_name,role) VALUES (${q(clientId)},${q(CLIENT)},'US-50 Walk Client','US-50 Walk Client','homeowner') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.designer_clients (designer_id,client_id,client_email,status)
 SELECT ${q(ownerId)},${q(clientId)},${q(CLIENT)},'active' WHERE NOT EXISTS (SELECT 1 FROM public.designer_clients WHERE designer_id=${q(ownerId)} AND client_id=${q(clientId)});
INSERT INTO public.projects (id,name,designer_id,created_by,client_id,studio_id,status,site_address)
 VALUES (${q(PROJECT)},'US-50 Walk — Hartwell Residence',${q(ownerId)},${q(ownerId)},${q(clientId)},${q(STUDIO)},'active','41 Hartwell Rd, Madison, WI 53711') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.vendors (id,name,orders_email,contact_info,default_payment_terms) VALUES
 (${q(V_SOFA)},'US-50 Walk Hale Furniture','orders+us50@hale.test','{"email":"orders+us50@hale.test"}'::jsonb,'fifty_fifty'),
 (${q(V_LAMP)},'US-50 Walk Brightwell Lighting','orders+us50@brightwell.test','{"email":"orders+us50@brightwell.test"}'::jsonb,NULL),
 (${q(V_WORK)},'US-50 Walk Hollis Workroom','work+us50@hollis.test','{"email":"work+us50@hollis.test"}'::jsonb,NULL),
 (${q(V_MILL)},'US-50 Walk Maren Mills','mill+us50@maren.test','{"email":"mill+us50@maren.test"}'::jsonb,NULL),
 (${q(V_RUG)},'US-50 Walk Loom & Co Rugs','orders+us50@loom.test','{"email":"orders+us50@loom.test"}'::jsonb,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.project_ffe_items (id,project_id,name,item_type,status,quantity,design_disposition,assignment_scope,vendor_id,vendor_name,unit_price_cents,line_total_cents,trade_price_cents,sort_order) VALUES
 (${q(ID(20))},${q(PROJECT)},'US-50 Walk Channel-back sofa','fixed','approved',1,'selected','throughout',${q(V_SOFA)},'US-50 Walk Hale Furniture',480000,480000,320000,1),
 (${q(ID(21))},${q(PROJECT)},'US-50 Walk Table lamp (pair)','fixed','approved',2,'selected','throughout',${q(V_LAMP)},'US-50 Walk Brightwell Lighting',68000,136000,45000,2),
 (${q(ID(22))},${q(PROJECT)},'US-50 Walk Custom lounge chair (COM)','fixed','approved',1,'selected','throughout',${q(V_WORK)},'US-50 Walk Hollis Workroom',360000,360000,240000,3),
 (${q(ID(23))},${q(PROJECT)},'US-50 Walk COM velvet for lounge chair','fixed','approved',1,'selected','throughout',${q(V_MILL)},'US-50 Walk Maren Mills',90000,90000,60000,4),
 (${q(ID(24))},${q(PROJECT)},'US-50 Walk Antique brass mirror (dealer find)','fixed','approved',1,'selected','throughout',NULL,NULL,95000,95000,NULL,5),
 (${q(ID(25))},${q(PROJECT)},'US-50 Walk Hand-knotted rug 9x12','fixed','approved',1,'selected','throughout',${q(V_RUG)},'US-50 Walk Loom & Co Rugs',420000,420000,280000,6)
 ON CONFLICT (id) DO NOTHING;
UPDATE public.project_ffe_items SET parent_ffe_item_id=${q(ID(22))}, link_kind='com' WHERE id=${q(ID(23))} AND parent_ffe_item_id IS NULL;
COMMIT;`);
console.log(JSON.stringify({ ownerId, memberId, clientId, project: PROJECT, studio: STUDIO, member: MEMBER, password: PASSWORD }));
