# A3b — production RE-PROBE (Strata) after the 00533–00540 apply

Lane A3b · 2026-09-02 (UTC) / 2026-09-01 evening local · **READ-ONLY**
Project: Strata `bkvcixdmuyejfzcijpdg` · app `cloud.patina.app` (`apps/mobile/Patina`)
Probes: Supabase MCP `execute_sql` (SELECT only), `list_edge_functions`, Sanity MCP `query_documents`
(read-only GROQ), and HTTPS GET/POST with the anon key compiled into the app
(`App/Configuration/Secrets.swift`, never printed).

Re-tests the A3 lane (`research/A3-prod.md`, written 2026-09-01 20:48Z) and the A4-02…A4-05 rows
(`research/A4-reconciliation.md`), both of which concluded that migrations 00533–00540 were absent
from Strata.

---

## Headline

**The migration gap is closed and `delete-account` is deployed.** `supabase_migrations.schema_migrations`
now runs **00530 … 00554 unbroken** — all eight of 00533–00540 are present under their repo names —
and the `delete-account` edge function is ACTIVE on Strata (created **2026-09-02T01:58:03Z**, i.e.
about ten minutes after the A3 lane wrote its file). Every object the A3 "Migration ledger gap" table
named now exists.

**Three things did not move, and two of them were the loudest findings in the audit:**

1. **The catalogue is still empty.** `get_recommendations(null,null,20,0)` still returns **0 rows**.
   00533 landed — the RPC now returns the widened 24-column contract — but the *data* half never
   happened: 1 catalog+published product, 0 of them with images, 1 `product_style_spectrum` row.
   A3-01 / A4-02 stand **unchanged as T0 blockers**, and their cause is now purely data, not schema.
2. **The Sanity tour copy is still the July text.** All three `ios-app/first-launch-tour/step-*`
   docs are still `_updatedAt 2026-07-28T19:44:27Z` with the retired bodies verbatim (A4-01 / C5-01).
3. **Both anon exposures are live.** `profiles` still returns 24/24 rows to the shipped anon key;
   `notification_preferences` still carries the `auth.uid() IS NULL` ALL policy plus anon
   INSERT/UPDATE/DELETE grants (A3-04 / A3-05).

Also still open and *not* covered by the migration apply: **`increment_scan_upload_attempt`** is
still absent from `pg_proc` **and from every migration in the repo** (A3-12) — it was never part of
00533–00540, so no future apply will close it.

---

## Findings

| id | claim (short) | status | new fact | probe | output excerpt |
|---|---|---|---|---|---|
| **A3-03** | migrations 00533–00540 never applied to Strata (ledger jumps 00532→00541) | **resolved** | Ledger runs 00530…00554 unbroken; all eight present under their repo names (`piece_detail_contract`, `client_attention_notifications`, `saved_items_price_snapshot`, `client_side_server_gaps`, `house_on_today`, `client_account_anonymize`, `saved_item_note_and_presence`, `direct_orders_attribution`) | `select version, name, coalesce(array_length(statements,1),0) from supabase_migrations.schema_migrations where version between '00530' and '00560' order by version` | `00530 … 00533 piece_detail_contract (9 stmts) … 00540 direct_orders_attribution (52 stmts) … 00554` — 25 rows, no gap |
| **A4-05** | dup of A3-03 (Daily Return server half not on Strata) | **resolved** | same as A3-03 | same | same |
| **A3-02 / A4-04** | `delete-account` 404s on Strata; `purge_client_account` missing → Apple 5.1.1(v) blocker | **resolved** | Function ACTIVE (v1, `verify_jwt: true`, created **2026-09-02T01:58:03Z**). `purge_client_account(p_user_id uuid)` + `mark_client_account_purge_complete(p_purge_id uuid)` both in `pg_proc`, SECURITY DEFINER; `client_account_purges` table exists. `authenticated` has **no** EXECUTE on `purge_client_account` — correct: `delete-account/index.ts:85,99` calls it through a service-role client after re-reading the caller via their own `Authorization` header | `list_edge_functions` + `curl -X POST .../functions/v1/delete-account` with anon key + `pg_proc` lookup | `{"slug":"delete-account","version":1,"status":"ACTIVE","verify_jwt":true}`; POST → `status=401 {"error":"unauthorized"}` (was `404 {"code":"NOT_FOUND"}`) |
| **A3-01** | catalogue empty — every product surface returns nothing | **still-open** | Unchanged to the row. 00533 landed (RPC now returns the widened 24-column contract incl. `brand`, `dimensions`, `lead_time_weeks`, `finish`, `photo_verified_at`, `source_url`, `shipping_flat_cents`, `published_at`, `patina_managed`) — so the failure is now **data-only**: 1 catalog+published product, **0** with images, `product_style_spectrum` = 1 row, `v_aesthete_catalog_input` = 1 row | `select count(*), count(*) filter (where layer='catalog' and status='published'), count(*) filter (where … and coalesce(array_length(images,1),0)>0) from public.products`; `begin; select count(*) from public.get_recommendations(null,null,20,0); rollback;`; anon `GET /rest/v1/products?select=id&limit=1` with `Prefer: count=exact` | `{"total":15,"catalog_published":1,"catalog_published_with_images":0,"published_any_layer":8}`; `{"get_recommendations_rows":0}`; `HTTP/2 200`, `content-range: 0-0/1` |
| **A4-02** | dup lineage — marketplace returns zero pieces on production | **still-open** | same as A3-01; cause narrowed from "schema + data" to **data only** | same | `get_recommendations_rows: 0` |
| **A3-10** | `client_designer_roster` view does not exist (REST → PGRST205) | **resolved** | View exists (`relkind='v'`); `authenticated` holds SELECT. Anon now gets a **grant-denial**, not a not-found | `select relname, relkind from pg_class …`; anon `GET /rest/v1/client_designer_roster?select=*&limit=1` | `{"relname":"client_designer_roster","relkind":"v"}`; `status=401 {"code":"42501","message":"permission denied for view client_designer_roster"}` |
| **A3-11** | `profile_presence` table does not exist (presence write 404s) | **resolved** | Table exists, RLS on, **5 policies**: own-row SELECT/INSERT/UPDATE, service-role ALL, and "The designer of record reads her client's presence". `authenticated` holds SELECT + INSERT | `pg_class` + `pg_policies`; anon `GET /rest/v1/profile_presence?select=*&limit=1` | `{"relname":"profile_presence","relkind":"r"}`; `status=401 {"code":"42501","message":"permission denied for table profile_presence"}` |
| **A3-13** | `get_direct_order_terms` missing; `create_direct_order` not attribution-aware | **resolved** | `get_direct_order_terms()` exists — STABLE, SECURITY DEFINER, `authenticated` EXECUTE **true**, `anon` **false** (fail-closed, correct). `create_direct_order(p_product_id uuid, p_quantity integer)` matches 00540 exactly and its body carries the attribution block | `pg_proc` + `pg_get_functiondef` + `has_function_privilege`; anon `POST /rest/v1/rpc/get_direct_order_terms` | `{"proname":"get_direct_order_terms","args":"","provolatile":"s","prosecdef":true}`; attribution_hint: `attribution ── -- 1. active project SELECT p.designer_id, p.id INTO v_de…`; anon RPC → `401 42501 permission denied for function get_direct_order_terms` |
| **A3-14** | `fulfillment_*` have no client SELECT policy — a real order shows nothing | **resolved** | Each of the three tables now carries a **third** policy alongside `_select_admin` / `_select_agent_reader`: `fulfillment_orders_select_client` → `(client_profile_id = auth.uid())`; `fulfillment_order_items_select_client` → EXISTS-join on the parent order; `fulfillment_shipments_select_client` → `fulfillment_po_belongs_to_caller(po_id)` | `select tablename, policyname, cmd, roles, qual from pg_policies join pg_policy …` | 9 rows across the three tables, incl. `fulfillment_orders_select_client \| SELECT \| {authenticated} \| (client_profile_id = auth.uid())` |
| **A4-03** | every remote save 400s — `saved_items.price_cents_at_save` missing | **resolved** | Column present (`integer`), alongside the older `price_in_cents`. Full column set: `brand_name, created_at, id, image_url, name, notes, price_cents_at_save, price_in_cents, product_id, room_id, source, updated_at, user_id` | `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='saved_items'` | `{"table_name":"saved_items","column_name":"price_cents_at_save","data_type":"integer"}` |
| **A3-12** | `increment_scan_upload_attempt` does not exist on Strata or in any migration | **still-open** | Unchanged, and **not closable by any pending apply** — the name appears in exactly one place in the whole repo: the Swift call site. Zero hits in `supabase/migrations/` | `select proname from pg_proc … where proname like '%scan_upload%'`; `grep -rn "increment_scan_upload_attempt" apps/mobile/Patina supabase/migrations` | pg_proc → `[{"proname":"mark_scan_upload_complete"}]` (only row); grep → `RoomScanSyncService+AdvancedBundle.swift:649` only |
| **A3-04** | all 24 production `profiles` readable by the shipped anon key | **still-open** | Unchanged. Policy `"Profiles are viewable by everyone"` \| roles `{public}` \| SELECT \| `qual: true`. anon holds SELECT **and** INSERT/UPDATE/DELETE = true | `curl GET /rest/v1/profiles?select=id&limit=1` with anon key + `Prefer: count=exact`; `pg_policies`; `has_table_privilege('anon', …)` | `status=206`, `content-range: 0-0/24`, `rows_returned=1` (ids only — no emails read) |
| **A3-05** | anon holds SELECT/INSERT/UPDATE/DELETE on `notification_preferences` + an ALL policy for unauthenticated callers | **still-open** | Unchanged. Policy `"Service role full access to notification preferences"` \| roles `{public}` \| cmd **ALL** \| `qual: (auth.uid() IS NULL)`; anon SELECT/INSERT/UPDATE/DELETE all true. Write not exercised (read-only lane) | `curl GET /rest/v1/notification_preferences?select=user_id&limit=1`; `pg_policies`; `has_table_privilege` | `status=200`, `content-range: 0-0/1`; `{"t":"notification_preferences","sel":true,"ins":true,"upd":true,"del":true}` |
| **A3-06** | "Continue with Google" is the first button and Google is disabled on Strata | **still-open** | Unchanged. `external.google = false`; `apple: true`, `email: true`, everything else false; `disable_signup: false`, `mailer_autoconfirm: false` | `curl GET /auth/v1/settings` with anon apikey | `"apple": true, … "google": false, … "email": true` |
| **A3-07** | `handle_new_user` defaults `profiles.role` to `'designer'` — an Apple tester lands as a designer | **still-open** | Function body unchanged: `v_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'homeowner' THEN 'homeowner' ELSE NULL END` then `INSERT … COALESCE(v_role, 'designer')`. `tester@patina.cloud`'s `profiles.role` is still `designer` | `select pg_get_functiondef(oid) from pg_proc where proname='handle_new_user'`; `select role from public.profiles where id='86cdd0aa-…'` | `COALESCE(v_role, 'designer')`; `{"tester_role":"designer"}` |
| **A3-15** | tester's notification feed is four designer-portal messages, one deep-linking to an unclaimed host | **still-open** | Unchanged: 4 rows — 2 × `workspace_invite`/email, 1 × `welcome_series`/email, 1 × `welcome_series`/**in_app** whose `metadata->>'deep_link'` host is **`app.patina.cloud`** (the designer portal, not claimed by the app's AASA) | `select count(*), type, channel, split_part(split_part(metadata->>'deep_link','//',2),'/',1) from public.notification_log where user_id='86cdd0aa-…' group by 2,3,4` | `[{"n":2,"type":"workspace_invite","channel":"email","deep_link_host":null},{"n":1,"type":"welcome_series","channel":"in_app","deep_link_host":"app.patina.cloud"},…]` |
| **A3-16** | tester credential (`tester@patina.cloud` / `000000`) does not work in the iOS app — the fallback is portal-only | **still-open** | `test-account-login` is ACTIVE on Strata (**v1**, `verify_jwt: false`, created 2026-09-01T17:43:00Z) but the iOS app still has **zero** references to it | `list_edge_functions`; `grep -rn "test-account-login" apps/mobile/Patina` | function present in the list; grep → **0 hits** |
| **A3-17** | 3 editorial stories, no hero images, 3–5 min read on ~400-char bodies | **still-open** | Unchanged: 3 rows, `hero_image_url` NULL on **3/3**, `body_md` 386–489 chars, `read_minutes` ∈ {3,4,5}, all 3 currently live (`published_at` set, unexpired) | `select count(*), count(*) filter (where hero_image_url is null), min(length(body_md)), max(length(body_md)), string_agg(distinct read_minutes::text,',') from public.editorial_stories` | `{"stories":3,"hero_null":3,"min_body":386,"max_body":489,"read_minutes":"3,4,5","live_now":3}` |
| **A3-21** | production category vocabulary cannot fill the app's six-category model | **still-open** | Distribution unchanged to the row: `decor` 12 (all `layer='personal'`), `lighting` 1 (the single catalog+published row), `chair` 1 (personal/draft), `storage` 1 (personal/draft). The only row iOS can see is `lighting` | `select category, layer, status, count(*) from public.products group by 1,2,3 order by 4 desc` | `decor/personal/published 7; decor/personal/draft 3; decor/personal/in_review 2; lighting/catalog/published 1; chair/personal/draft 1; storage/personal/draft 1` |
| **A3-22** | `published_at` NULL on all 15 products and `quality_score` NULL on all catalog rows | **still-open** | Unchanged: `published_at` NULL on **15/15**, `quality_score` NULL on **15/15**, including the one catalog+published row | `select count(*) filter (where published_at is null), count(*) filter (where quality_score is null), … from public.products` | `{"published_at_null":15,"quality_score_null":15,"cat_pub_published_at_null":1,"cat_pub_quality_null":1}` |
| **A4-01 / C5-01** | Sanity still serves the retired July tour copy on all three steps, and CMS wins over the in-app fallback | **still-open** | All three docs still `_updatedAt` **2026-07-28T19:44:27Z**, `persona: "all"`, bodies verbatim as reported. Nothing in Sanity `ios-app/*` has been touched since that date | Sanity MCP `query_documents`, project `kv3qrinl`, dataset `production`, perspective `published`: `*[_type=="helpContent" && surfaceKey match "ios-app/first-launch-tour*"]{_id,surfaceKey,_updatedAt,persona,"heading":coachmarkContent.heading,"body":coachmarkContent.body}` | step-1-home: *"This is your Daily Room — picks and stories chosen for your space."*; step-2-saved: *"Add pieces to a room with + Add — they follow you everywhere."*; step-3-profile: *"Rooms, saved pieces, and settings live here."* |
| **C5-02** | all six `?` help doors open on "No help articles yet" — zero `ios-app/*` help articles in production Sanity | **still-open** | **16** `ios-app/*` `helpContent` docs of 246 total, and **0** of them have `contentType == "helpArticle"` — the exact predicate `SanityHelpClient.buildArticleListURL` requires (`SanityHelpClient.swift:295-304`). 41 `helpArticle` docs exist in the dataset, none under `ios-app/*`. The 16 are 11 `fieldHelper`, 2 `tooltip`, 3 `coachmark` | Sanity `query_documents`: `{"ios_helpArticles": count(*[_type=="helpContent" && contentType=="helpArticle" && surfaceKey match "ios-app/*"]), "all_helpArticles": count(*[_type=="helpContent" && contentType=="helpArticle"]), …}` | `{"ios_total":16,"helpContent_total":246,"ios_helpArticles":0,"all_helpArticles":41}` |

---

## Strata edge-function state (recorded)

| slug | version | status | verify_jwt | created / updated (UTC) |
|---|---|---|---|---|
| `delete-account` | **1** | ACTIVE | true | created & updated **2026-09-02T01:58:03Z** — *new since A3* |
| `create-checkout-session` | **40** | ACTIVE | true | updated **2026-09-02T01:57:42Z** |
| `apns-send` | **20** | ACTIVE | true | updated **2026-09-01T17:41:22Z** |
| `test-account-login` | **1** | ACTIVE | false | created **2026-09-01T17:43:00Z** |

Two more functions landed in the same 01:57–01:59Z batch as `delete-account`: `create-checkout-session`
v40 and `site-request-guest` v1 (created 2026-09-02T01:59:08Z). `apns-send` is unchanged from A3's
reading (v20).

---

## Security exposures — unchanged

Every exposure A3 recorded is still live. Nothing was tightened by the migration apply, and nothing
new appeared on the tables the app touches.

| surface | anon result now | A3's reading | verdict |
|---|---|---|---|
| `profiles` | `206`, `content-range 0-0/24` — all 24 rows | 200, 24/24 | **unchanged** |
| `notification_preferences` | `200`, `0-0/1`; anon SELECT/INSERT/UPDATE/DELETE all `true`; ALL policy `qual: (auth.uid() IS NULL)` | identical | **unchanged** |
| `vendors` | `206`, `0-0/4` | 200, 4 rows (incl. internal notes) | **unchanged** |
| `editorial_stories` | `206`, `0-0/3` | 200, 3 | **unchanged** |
| `products` | `200`, `0-0/1` | 200, 1 | **unchanged** |
| `saved_items`, `rooms` | `200`, `*/0` (RLS holds) | 200, 0 | **unchanged** |
| `device_push_tokens`, `fulfillment_orders` | `401` (grant-denied) | 401 `42501` | **unchanged — correct** |
| `client_designer_roster`, `profile_presence` | `401 42501` *permission denied* | `404 PGRST205` *does not exist* | **changed for the better**: the objects now exist and are grant-denied to anon rather than absent |
| `_comms_backfill_legacy_map` | `relrowsecurity = false`, 0 policies | 1 × ERROR `rls_disabled_in_public` | **unchanged** |
| `get_recommendations` | `has_function_privilege('anon', …) = true` | anon EXECUTE ✓ (advisor `anon_security_definer_function_executable`) | **unchanged** |

---

## Method notes / limits

- **No writes.** `get_recommendations` transitively writes `match_events` and `client_style_profiles`
  (via `get_aesthete_matches`), so the count probe was run as `begin; select …; rollback;`.
  Confirmed clean afterwards: `select count(*) from public.match_events where created_at > now() -
  interval '10 minutes'` → **0**.
- **`delete-account` was probed with the anon key only.** `401 unauthorized` proves the function is
  deployed and routing (the A3 reading was `404 NOT_FOUND`), and that it rejects a caller with no
  user JWT. It does **not** prove an end-to-end deletion succeeds — that needs a real signed-in
  tester JWT and is a destructive write, so it is out of scope for this lane. `purge_client_account`
  exists and the function's service-role call path is code-verified; the round trip is not.
- **`profiles` was read as `select=id` only** — no emails, phone, address or Stripe ids were fetched
  or printed. Counts come from the `content-range` header.
- **Migration *timing* is not recorded** — `supabase_migrations.schema_migrations` has no timestamp
  column (`version, statements, name, created_by, idempotency_key, rollback`, and `created_by` is
  NULL on all 25 rows). The 00533–00540 apply can only be dated by inference from the edge-function
  deploys that accompanied it.
- Unchanged from A3 and still unverifiable read-only: APNs credentials (edge-function env), GoTrue
  mail templates / Site URL, and any on-screen rendering.
