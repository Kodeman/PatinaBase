# W1b · lane D (backend) — task list

Implementer: lane D, worktree `.codex/worktrees/agent-dr-w1b-d`, branch `daily-return/w1b-d`,
base `main` @ `5b5c0c054`. Sole owner of the local Supabase stack, `supabase db reset`, and seeds
for this wave.

Planks served: **SP-10 server half** (00533), **SP-08 server half** (00534), **SP-12/SP-14 server
half** (00535), the **W1a M7/m8 escalations** + the server gap **SP-20** needs (00536), the
**`delete-account`** edge function, the **client-portal** AASA entry + public piece route (SP-03
server half), and the seed pass W5's gate depends on.

Migration numbers minted, provisionally: **00533, 00534, 00535, 00536**. Local head at start is
`00532` (applied; the file belongs to the sibling Field Companion branch and is not on `main` —
`ls supabase/migrations | tail` on this branch ends at `00531_restore_extension_execute_authenticated.sql`
plus `_pending/`). Re-check the tip before the final commit and renumber on collision.

---

## Verified repo facts this plan rests on

Every claim below was read out of the tree or probed against the local stack before writing.

| # | Fact | Evidence |
|---|---|---|
| F1 | `get_recommendations` head definition is `00246:192-307`; only 00067 and 00246 define it. Its two GRANTs are `00246:307` (authenticated) and `:308` (anon). | `grep -rln "CREATE OR REPLACE FUNCTION[^(]*get_recommendations" supabase/migrations/*.sql` → 00067, 00246 |
| F2 | `products` already has `dimensions jsonb`, `lead_time_weeks`, `brand`, `description`, `published_at`, `finish`, `patina_managed`, `source_url`. It does **not** have `photo_verified_at` or `shipping_flat_cents` (0 hits across `supabase/`). | `database.types.ts` products Row; `grep -rn photo_verified_at supabase/` → empty |
| F3 | Of the "four other callers", only **three** are real. `apps/client-portal/src/app/api/feed/[roomId]/route.ts` never calls the RPC — it names it in a comment explaining its own tier derivation. It reads `products` directly. **No code change is needed there**; the comment stays true. | read in full |
| F4 | `supabase/seed/00-legacy-grants.sql` is GENERATED (`python3 scripts/generate-legacy-grants.py`); it carries `get_recommendations` grants at `:103,:109,:1027,:1033`. Never hand-edit. | patina-db-migrations §4 |
| F5 | `notification_log` (00041): `type TEXT` (no CHECK), `channel notification_channel` enum `email/push/in_app/sms`, `status notification_status` enum, `metadata jsonb`. INSERT policy is `WITH CHECK (auth.uid() IS NULL)` — service-role only. | 00041:34-90 |
| F6 | iOS reads `metadata->>'title'` and `metadata->>'body'` (fallback `'preview'`), and routes on `metadata->>'entity_type'` / `'entity_id'` — `NotificationsAPIClient.swift:135-145`, `NotificationRouter.swift:60-88`. Feed filter is `channel=in.(in_app,push)` + `status=in.(queued,sending,delivered,unconfirmed,opened,clicked)`. **`failed` is excluded** (critique B6). | read in full |
| F7 | The two existing writers spell the body `message`, not `body` — `00289:245` and `sync_proposal_send_in_app_log` (00388). So today's bell rows render an **empty body**. | 00289, 00388 |
| F8 | `apns-send` input is `{ user_id?, tokens?, title, body, entity_type?, entity_id?, notification_log_id? }`; it stamps the passed log row `delivered` on ≥1 success and `failed` otherwise; missing APNS_* secrets → 200 `{skipped:'apns_not_configured'}`. | `apns-send/index.ts:1-30` |
| F9 | `public.invoke_edge_function(fn_name text, body jsonb)` head is 00258; POSTs with the service-role bearer from Vault, `RAISE WARNING` + `RETURN NULL` when unset. | 00258 |
| F10 | 00289 is the trigger shape to copy: SECURITY DEFINER, `SET search_path = public, pg_temp`, guards first, `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING` around the notification so it can never unwind the write. | 00289:174-250 |
| F11 | `client_decisions` (00062) has **no** `client_id`; the recipient resolves through `designer_clients.client_id` via `designer_client_id`. Status CHECK is `draft/pending/responded/expired`. | 00062 |
| F12 | `proposal-send` already writes an in-app row through `sync_proposal_send_in_app_log` (00388), keyed on `proposal_send_dispatches.in_app_log_id`, `ON CONFLICT (id) DO UPDATE`. `invoice-send` and `invoice-reminders` write **only `channel='email'`** rows via `sendCompliantEmail` — invisible to the iOS bell. | read in full |
| F13 | `invoice-reminders` stages are indexed by `invoices.reminder_count`; stage 0 = the due−3 nudge. "First stage only" = `stage === 0`. | `invoice-reminders/index.ts:22-33,282-297` |
| F14 | `saved_items` (00055) already has `room_id uuid` (nullable) and `price_in_cents`. It has **no** `price_cents_at_save`. | 00055:23,28 |
| F15 | `designer_clients` keys the client by **`client_id`** (`00014:74`). Its only policies are `00014:110` `FOR ALL USING (auth.uid() = designer_id)` and `00316:39` `designer_clients_studio_rw` — both designer-side. `RosterAPIClient.listRoster()` selects `designer_id,created_at,status` filtered `client_id=eq.<uid>&status=eq.active` → `[]` by RLS. | 00014, 00316, `RosterAPIClient.swift:39-46` |
| F16 | `rpc_start_direct_thread(counterpart UUID)` head is **00103:51** (sole definition). It checks only `auth.uid() IS NOT NULL` and `counterpart <> caller` — any authenticated user can open a thread with any profile. `GRANT … TO authenticated` at `00103:105`. | `grep -rln "CREATE OR REPLACE FUNCTION[^(]*rpc_start_direct_thread"` → 00103 only |
| F17 | **`sign_proposal` does not send the confirmation email — and it does not need to.** `sign_proposal` (00400:408) delegates to `_sign_proposal_authorized_00400`; neither invokes any edge function (`invoke_edge_function` appears nowhere in 00400). But **`ProposalsAPIClient.signProposal` already fires it client-side**, best-effort, at `ProposalsAPIClient.swift:419-429`, exactly as the portal route does. → **lane B needs no backend change for SP-04's email.** | grep over `.sql`/`.ts`/`.swift`; `ProposalsAPIClient.swift:1-16,404-431` |
| F18 | `apps/client-portal/src/app/.well-known/apple-app-site-association/route.ts` serves ONE details entry (`VP22LXHT7L.cloud.patina.field`, `/field/sr_*`) with a `components` block; its test asserts the whole object by `toEqual`. | read in full |
| F19 | Anon may read catalog products: `products_catalog_select_anon` (00152:298) `FOR SELECT TO anon USING (layer = 'catalog')`. `createClient()` from `@patina/supabase/client` returns an anon-key client on the server. | 00152, `client.ts:166-172` |
| F20 | `apps/client-portal/src/middleware.ts` redirects every unauthenticated request to `/auth/signin` unless the path is in its `isPublicPage` list. **`/piece/*` must be added or the public piece route is unreachable signed-out.** No other lane owns this file. | read in full |
| F21 | `profiles.id REFERENCES auth.users(id) ON DELETE CASCADE` (00013:12); ~90 client-owned tables cascade from `profiles` (rooms, saved_items, notification_log, device_push_tokens, client_style_profiles, companion_*, interactions, user_settings …). | probed: `pg_constraint … confdeltype='c'` |
| F22 | Deleting a client's `auth.users` row is **blocked** by designer-authority guard triggers that the FK `ON DELETE SET NULL` actions fire: `guard_proposal_authority` / `guard_proposal_copy_immutability` (proposals), `guard_project_completion_authority` / `guard_project_terminal_identity_integrity` (projects), `set_invoice_studio_id` (invoices), `guard_client_decision_option_authority` (client_decision_options), plus `comms_threads.created_by` being NOT NULL under an `ON DELETE SET NULL` FK. | probed round-by-round against `client@patina.dev` |
| F23 | The **converged** recipe: `ALTER TABLE … DISABLE TRIGGER USER` on exactly `proposals, projects, invoices, client_decisions, client_decision_options`, detach `client_decisions.selected_by`, `proposals.client_id`, `proposals.designer_client_id`, `projects.client_id`, `invoices.client_id`, hand `comms_threads.created_by` to another live participant (else delete the thread), re-enable, delete the auth user. Verified green for **all six** seeded homeowners + `client@patina.dev`, each in a rolled-back transaction. | `probe.sh` rounds 1–9; final run "ROUND 1 OK" ×7 |
| F24 | `DISABLE TRIGGER USER` keeps RI/system triggers enabled (cascades still fire) and takes ACCESS EXCLUSIVE on the table, so no concurrent writer can slip past the guard during the window. | Postgres semantics; probe confirms cascades ran |
| F25 | SQL tests are plain psql scripts with `ASSERT`s, transaction-wrapped + `ROLLBACK`, run by `scripts/run-sql-tests.sh` (or `psql -v ON_ERROR_STOP=1 -f`). | `scripts/run-sql-tests.sh`, `supabase/tests/rls/project_roster_test.sql` |
| F26 | `supabase/config.toml` has no stanza for `proposal-send`'s siblings that default to `verify_jwt = true`; a stanza is only written where intent needs stating. `[db.seed] sql_paths` lists `./seed/products.sql`. | config.toml |

---

## Interfaces neighbouring lanes rely on (publish these, then do not move them)

**00533 → lane A** (`ProductModel` decode keys). New `RETURNS TABLE`, in order:

```
id text, name text, price_cents integer, match_score integer, maker_name text,
maker_location text, maker_story text, image_url text, usdz_url text,
style_tags text[], material_tags text[], badges text[], category text, tier text,
dimensions jsonb, lead_time_weeks integer, brand text, description text,
published_at timestamptz, finish text, patina_managed boolean,
photo_verified_at timestamptz, source_url text, shipping_flat_cents integer
```

The first fourteen are byte-identical to 00067/00246. `maker_name` keeps its
`COALESCE(v.name,'Unknown Maker')` derivation — SP-10's "prefer `brand`, vendor as fallback" is a
**client-side** composition now that `brand` ships (integration note to A).

**00534 → lane C** (`NotificationsAPIClient` row contract). Each call writes **two** rows:

| | in-app row | push row |
|---|---|---|
| `channel` | `in_app` | `push` |
| `status` | `delivered` | `queued` |
| `type` | `p_entity_type \|\| '_attention'` → `proposal_attention` / `invoice_attention` / `decision_attention` | same |
| `template_id` | `client-attention` | `client-attention-push` |
| `metadata` | `{title, body, message, entity_type, entity_id, deep_link, url, …p_metadata}` | same |

`metadata.message` duplicates `body` for the portal inbox, which reads `message` (F7).
`entity_type ∈ {proposal, invoice, decision}`, lower-case, matching `NotificationRouter.swift:61-88`.
`deep_link`/`url` = `/proposals/<id>` · `/invoices/<id>` · `/decisions/<id>`.
Only the **push** row's id is handed to `apns-send`, so a failed push can never delete the bell row
(critique B6).

**`delete-account` → lane C.** `POST {SUPABASE_URL}/functions/v1/delete-account`, `verify_jwt = true`,
no body. Success `200 {"ok":true,"userId":"<uuid>"}`. Failures: `401 {"error":"unauthorized"}`,
`405 {"error":"method_not_allowed"}`, `500 {"error":"purge_failed"|"auth_delete_failed"}`.
The app's `APIConfiguration.deleteAccount` currently points at `/rest/v1/rpc/delete_user_account`,
which does not exist — lane C re-points it (integration note).

**Piece URL → lane C.** `https://client.patina.cloud/piece/<productId>`, product id being the
`products.id` uuid `get_recommendations` returns as `id text`.

---

## Task 1 — 00533: widen `get_recommendations`, add the two missing product columns

**Files**
- `supabase/migrations/00533_piece_detail_contract.sql` (new)
- `supabase/tests/aesthete/shim_contract_test.sql` (edit — the frozen-signature assertion)
- `packages/supabase/src/database.types.ts` (regenerated)
- `supabase/seed/00-legacy-grants.sql` (regenerated — this migration adds GRANTs)

**Interfaces neighbours rely on**: the `RETURNS TABLE` above (lane A).

**Failing test first.** Extend `supabase/tests/aesthete/shim_contract_test.sql`: replace the frozen
`pg_get_function_result` string with the 24-column one, and add, inside the same `DO $$` block after
the existing get_recommendations loop:

```sql
  -- ── 6. 00533 widening: the ten added columns exist, typed, and project ──
  ASSERT pg_get_function_result('get_recommendations(uuid,text,int,int)'::regprocedure)
       = 'TABLE(id text, name text, price_cents integer, match_score integer, maker_name text, maker_location text, maker_story text, image_url text, usdz_url text, style_tags text[], material_tags text[], badges text[], category text, tier text, dimensions jsonb, lead_time_weeks integer, brand text, description text, published_at timestamp with time zone, finish text, patina_managed boolean, photo_verified_at timestamp with time zone, source_url text, shipping_flat_cents integer)',
    'get_recommendations RETURNS TABLE drifted from the 00533 contract';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='products'
                    AND column_name='photo_verified_at' AND data_type='timestamp with time zone'),
    '00533 must add products.photo_verified_at';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='products'
                    AND column_name='shipping_flat_cents' AND data_type='integer'),
    '00533 must add products.shipping_flat_cents';

  -- the widened projection carries the seeded rows' real values, not nulls
  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count
    FROM get_recommendations(p_limit := 50) g
   WHERE g.dimensions IS NOT NULL AND g.lead_time_weeks IS NOT NULL;
  ASSERT v_count > 0, '00533 must project real dimensions/lead_time_weeks from the seeded catalog';
  SELECT count(*) INTO v_count FROM get_recommendations(p_limit := 50) g WHERE g.brand IS NOT NULL;
  ASSERT v_count > 0, '00533 must project products.brand';
  PERFORM pg_temp.reset_role();
```

**Run**: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/aesthete/shim_contract_test.sql`
→ must FAIL on the drifted `RETURNS TABLE` before 00533 is applied.

**Implementation.** 00533 banner names the lineage `00067 → 00246 → 00533` and that this is the
program's one non-additive step. Body, in order:

1. `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS photo_verified_at timestamptz;`
   `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shipping_flat_cents integer;`
2. `DROP FUNCTION IF EXISTS public.get_recommendations(uuid, text, int, int);`
3. `CREATE FUNCTION public.get_recommendations(...)` — argument list byte-identical to 00246:193-197,
   `RETURNS TABLE` as published above, **body copied verbatim from 00246:216-300** with the delta
   confined to the `RETURN QUERY` select list: the fourteen existing expressions unchanged, then
   `p.dimensions, p.lead_time_weeks, p.brand, p.description, p.published_at, p.finish,
   p.patina_managed, p.photo_verified_at, p.source_url, p.shipping_flat_cents`.
   `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` unchanged.
4. `COMMENT ON FUNCTION …` — restate the frozen-prefix rule: the first fourteen columns are the
   00067 contract and never move; new columns are appended.
5. Re-apply both grants (00246:307-308): `GRANT EXECUTE … TO authenticated;` `… TO anon;`

Task 9 regenerates `00-legacy-grants.sql` once, after every GRANT in the wave has landed.

**Pass run**: `supabase db reset` (unsandboxed), then the shim contract test → PASS.
Then `pnpm db:generate` and confirm the `products` Row and the `get_recommendations` Returns block
in `database.types.ts` carry the new columns.

**Commit**
```
git add supabase/migrations/00533_piece_detail_contract.sql supabase/tests/aesthete/shim_contract_test.sql packages/supabase/src/database.types.ts
git commit -m "feat(db): 00533 — the piece contract says size, lead time and maker" -- <same paths>
```

---

## Task 2 — 00534: `notify_client_attention` + the decision trigger

**Files**
- `supabase/migrations/00534_client_attention_notifications.sql` (new)
- `supabase/tests/notifications/client_attention_test.sql` (new)

**Interfaces neighbours rely on**: the two-row contract above (lane C).

**Failing test first.** `supabase/tests/notifications/client_attention_test.sql`, in the house style
(BEGIN … `DO $$ … ASSERT … $$` … ROLLBACK), fixtures under a `d5000000-…` id prefix:

1. **grant posture** — `NOT has_function_privilege('authenticated', 'notify_client_attention(uuid,text,uuid,text,text,jsonb)', 'EXECUTE')`, same for `anon` and `PUBLIC`; `has_function_privilege('service_role', …)` true.
2. **two rows, one call** — after `PERFORM notify_client_attention(client, 'invoice', inv, 'Invoice ready', 'Invoice INV-1 is due Sep 1.', '{"project_id":"…","amount_cents":425000,"due_date":"2026-09-01"}')`: exactly 2 `notification_log` rows for that user/entity; one `channel='in_app' AND status='delivered'`, one `channel='push' AND status='queued'`.
3. **row contract** — both carry `metadata->>'entity_type' = 'invoice'`, `metadata->>'entity_id' = inv::text`, non-empty `metadata->>'title'` and `metadata->>'body'`, `metadata->>'message' = metadata->>'body'`, `metadata->>'deep_link' = '/invoices/'||inv`.
4. **the bell survives a failed push** — `UPDATE notification_log SET status='failed' WHERE channel='push' AND …` then assert exactly 1 row still matches the client's visible filter `channel IN ('in_app','push') AND status IN ('queued','sending','delivered','opened','clicked')`. (Critique B6, asserted as behaviour.)
5. **de-duplication** — calling twice for the same `(user, entity_type, entity_id)` while the in-app row is unopened leaves **one** `in_app` row, with the second call's title/body.
6. **the decision trigger** — `INSERT INTO client_decisions (designer_client_id, project_id, title, status) VALUES (…, 'pending')` produces the two rows for `designer_clients.client_id`, `entity_type='decision'`, `entity_id = <decision id>`; a `status='draft'` insert produces **none**.
7. **the trigger never unwinds the write** — insert a pending decision for a `designer_clients` row whose `client_id` is NULL; the decision row still exists and no notification row was written.

**Run**: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/notifications/client_attention_test.sql`
→ FAILS (function does not exist).

**Implementation.** 00534, banner citing 00041 (row shape + service-only INSERT), 00289 (trigger
shape), 00388 (the sibling in-app writer), and critique B6/M5/M26.

```
public.notify_client_attention(
  p_user_id uuid, p_entity_type text, p_entity_id uuid,
  p_title text, p_body text, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid   -- the push row's id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
```

- guards: `p_user_id`/`p_entity_id` NOT NULL and `p_entity_type IN ('proposal','invoice','decision')`, else `RETURN NULL` (a notification helper must never abort its caller's transaction).
- builds `v_meta` = `p_metadata || jsonb_build_object('entity_type', …, 'entity_id', p_entity_id::text, 'title', p_title, 'body', p_body, 'message', p_body, 'deep_link', v_path, 'url', v_path)` where `v_path` is `/proposals/|/invoices/|/decisions/` + id.
- **in-app**: `SELECT id INTO v_in_app FROM notification_log WHERE user_id = p_user_id AND channel='in_app' AND opened_at IS NULL AND metadata->>'entity_type' = p_entity_type AND metadata->>'entity_id' = p_entity_id::text ORDER BY created_at DESC LIMIT 1;` — UPDATE its `metadata`/`type`/`status='delivered'` when found, INSERT otherwise. This is SP-08's "de-duplicate on entity id"; it is also what keeps `proposal-send`'s existing dispatch row (Task 3) from becoming a second bell row.
- **push**: always INSERT `channel='push', status='queued'`, returning `v_push`.
- `PERFORM public.invoke_edge_function('apns-send', jsonb_build_object('user_id', p_user_id, 'title', p_title, 'body', p_body, 'entity_type', p_entity_type, 'entity_id', p_entity_id::text, 'notification_log_id', v_push))` — wrapped in `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING`, so an unconfigured Vault (local) never breaks a send.
- `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` then `GRANT EXECUTE … TO service_role;` (critique M5).
- **`sync_proposal_send_in_app_log(uuid)` redefined**, lineage `00388 → 00534`, body verbatim from 00388 with the delta confined to the `metadata` jsonb: it keeps `proposal_id`/`dispatch_id`/`sent_at`/`subject`/`message`/`deep_link` and **adds** `entity_type='proposal'`, `entity_id`, `title`, `body`. Without this the dedup key does not exist on the row proposal-send already writes, and Task 3's call site would print a second bell row; it also fixes the empty body F7 describes. Grants re-applied exactly as 00388 wrote them (`REVOKE … FROM PUBLIC, anon, authenticated; GRANT … TO service_role`).
- `public.notify_client_decision_raised()` trigger fn, 00289 shape: `RETURN NEW` unless `NEW.status = 'pending'`; resolve `v_client := (SELECT dc.client_id FROM designer_clients dc WHERE dc.id = NEW.designer_client_id)`; `RETURN NEW` when null; `BEGIN PERFORM notify_client_attention(v_client, 'decision', NEW.id, 'A decision needs you', COALESCE(NULLIF(btrim(NEW.title),''), 'Your designer needs a decision.'), jsonb_build_object('project_id', NEW.project_id, 'due_date', NEW.due_date)); EXCEPTION WHEN OTHERS THEN RAISE WARNING …; END;`
- `REVOKE EXECUTE ON FUNCTION public.notify_client_decision_raised() FROM PUBLIC, anon, authenticated;`
- `DROP TRIGGER IF EXISTS on_client_decision_raised_notify_client ON public.client_decisions;`
  `CREATE TRIGGER on_client_decision_raised_notify_client AFTER INSERT ON public.client_decisions FOR EACH ROW EXECUTE FUNCTION public.notify_client_decision_raised();`

**Pass run**: `supabase db reset`, then the new test + `supabase/tests/proposals/proposal_send_dispatch_guard_test.sql` (it exercises 00388's writer) → both PASS.

**Commit**
```
git add supabase/migrations/00534_client_attention_notifications.sql supabase/tests/notifications/client_attention_test.sql
git commit -m "feat(db): 00534 — the bell learns what money and decisions are waiting" -- <same paths>
```

---

## Task 3 — the three call sites (`proposal-send`, `invoice-send`, `invoice-reminders`)

**Files**
- `supabase/functions/proposal-send/index.ts`
- `supabase/functions/invoice-send/index.ts`
- `supabase/functions/invoice-reminders/index.ts`
- `supabase/functions/_shared/client-attention.ts` (new)
- `supabase/functions/_shared/client-attention.test.ts` (new)

`_shared/client-attention.ts` is a **new** module — no existing function imports it, so the
"redeploy every importer" hazard is bounded to the three functions this task edits.

**Interface**
```ts
export interface AttentionInput {
  userId: string; entityType: "proposal" | "invoice" | "decision";
  entityId: string; title: string; body: string;
  metadata?: Record<string, unknown>;
}
export async function notifyClientAttention(
  admin: { rpc(fn: string, args: Record<string, unknown>): Promise<{ error: unknown }> },
  input: AttentionInput,
): Promise<{ ok: boolean; error?: string }>;
```
Best-effort by contract: it swallows every failure into `{ ok:false, error }` and never throws, so a
notification can never fail a send. It calls `admin.rpc('notify_client_attention', { p_user_id, p_entity_type, p_entity_id, p_title, p_body, p_metadata })`.

**Failing test first** — `_shared/client-attention.test.ts`, pure logic, no permissions needed:
1. maps the input onto the exact `p_*` argument names;
2. returns `{ok:true}` when the rpc returns no error;
3. returns `{ok:false, error}` and does **not** throw when the rpc returns an error;
4. returns `{ok:false}` and does not throw when the rpc itself rejects;
5. refuses an entity type outside the three and never calls the rpc.

**Run**: `deno test --config supabase/functions/deno.json supabase/functions/_shared/client-attention.test.ts` → FAILS (module missing).

**Implementation.**
- `proposal-send/index.ts` — inside `syncInAppLog(dispatchId)` (`:361-366`), after the existing rpc succeeds, read the dispatch's `client_id`, `proposal_id`, `proposal_title`, `total_amount` from the snapshot the gateway already holds and call `notifyClientAttention(admin, {entityType:'proposal', title:'A proposal is ready for you', body:'<studio> sent "<title>" for your review.', metadata:{project_id}})`. Dedup (Task 2) folds it onto the row 00388 just wrote and adds the push row.
- `invoice-send/index.ts` — after the `sendCompliantEmail` block succeeds and only when `sendType === 'sent'` and `clientUserId` is non-null: `notifyClientAttention(admin, {entityType:'invoice', entityId:invoice.id, title:'An invoice is ready', body:'<senderName> sent invoice <number> for <project>.', metadata:{project_id, amount_cents: invoice.total_cents, due_date: invoice.due_date}})`.
- `invoice-reminders/index.ts` — inside the per-invoice loop, after `sent++` and the successful stamp, **only when `stage === 0`** (F13) and `clientUserId` is non-null: the same call with the reminder's own title/body.
- Every call is awaited, its result logged with `console.warn` when `!ok`, and never allowed to change the function's response.

**Pass run**
```
deno test --config supabase/functions/deno.json supabase/functions/_shared/client-attention.test.ts
deno test --config supabase/functions/deno.json supabase/functions/proposal-send/
deno check --config supabase/functions/deno.json supabase/functions/invoice-send/index.ts supabase/functions/invoice-reminders/index.ts
```
Delete `./deno.lock` if one appears at repo root.

**Commit**
```
git add supabase/functions/_shared/client-attention.ts supabase/functions/_shared/client-attention.test.ts supabase/functions/proposal-send/index.ts supabase/functions/invoice-send/index.ts supabase/functions/invoice-reminders/index.ts
git commit -m "feat(functions): money and proposals now reach the client's bell" -- <same paths>
```

---

## Task 4 — 00535: `saved_items.price_cents_at_save`

**Files**
- `supabase/migrations/00535_saved_items_price_snapshot.sql` (new)
- `supabase/tests/notifications/client_attention_test.sql` — no; a new
  `supabase/tests/rls/saved_items_snapshot_test.sql` (new)

**Failing test first** — assert the column exists, is `integer`, is nullable, and that the owner
policies from 00055 still admit an insert carrying it while a second user's select returns zero rows.

**Implementation.** Banner records m8: **`room_id` already exists** (`00055:23`, nullable) — the
migration therefore adds only the price snapshot, and states that so the next reader does not go
looking for a missing column.

```sql
ALTER TABLE public.saved_items ADD COLUMN IF NOT EXISTS price_cents_at_save integer;
ALTER TABLE public.saved_items ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL;  -- no-op; kept for replay on an older stack
COMMENT ON COLUMN public.saved_items.price_cents_at_save IS
  'Retail price in cents at the moment of saving. Distinct from price_in_cents, which mirrors the piece today; the pair is what lets the app say a price moved without inventing a figure (C5).';
```

No GRANT/REVOKE → no legacy-grants regeneration for this file alone.

**Pass run**: `supabase db reset`, then the new test → PASS. `pnpm db:generate` (folded into Task 9).

**Commit**
```
git add supabase/migrations/00535_saved_items_price_snapshot.sql supabase/tests/rls/saved_items_snapshot_test.sql
git commit -m "feat(db): 00535 — a save remembers what the piece cost that day" -- <same paths>
```

---

## Task 5 — 00536: the W1a escalations, and the server gap Delete Account needs

**Files**
- `supabase/migrations/00536_client_side_server_gaps.sql` (new)
- `supabase/tests/rls/designer_clients_client_read_test.sql` (new)
- `supabase/tests/auth/account_purge_test.sql` (new)

Three server-side gaps, each blocking a W1b **client** plank: the roster the client cannot read
(M7), the direct thread anyone can open (m8), and the account the client cannot close (SP-20).
Grouping them under one number is a deliberate call — recorded in the banner and in `d-notes.md`
for Fable to override.

**Failing tests first.**

`designer_clients_client_read_test.sql` — fixtures: designer D, clients C1 (active roster row) and
C2 (archived roster row), stranger S.
1. as C1: `SELECT` over `designer_clients` filtered `client_id = C1` returns **1** row and it names D.
2. as C1: an archived row is **not** returned (the policy is scoped `status = 'active'`).
3. as C2: zero rows (archived).
4. as S: zero rows.
5. as C1: `UPDATE`/`DELETE`/`INSERT` on that row all affect **0** rows — the new leg is SELECT only.
6. as D: the designer still sees both rows (00014:110 intact).

`account_purge_test.sql` — fixtures: designer D, client C with a `designer_clients` row, an
`accepted` proposal, an activated project, an issued invoice, a pending decision with two options,
a project comms thread C created, plus a room and a saved item.
1. grant posture: `purge_client_account` not executable by `PUBLIC`/`anon`/`authenticated`; executable by `service_role`.
2. `SELECT public.purge_client_account(C)` then `DELETE FROM auth.users WHERE id = C` **succeeds**.
3. after it: the proposal, project, invoice and decision rows **still exist**, with `client_id` / `selected_by` / `designer_client_id` NULL — the designer's record survives the erasure.
4. the client's own rows are gone: `rooms`, `saved_items`, `notification_log`, `device_push_tokens`, `designer_clients` all return 0 for C.
5. the project thread survives with `created_by` handed to D; a direct thread with no other live participant is deleted.
6. every guard trigger it disabled is **enabled again** afterwards: `SELECT bool_and(tgenabled = 'O') FROM pg_trigger WHERE tgrelid IN (…5 tables…) AND NOT tgisinternal` is true.

`rpc_start_direct_thread`'s new predicate is asserted inside the same file: as a client with **no**
relationship to D, `rpc_start_direct_thread(D)` raises `insufficient_privilege`; after inserting an
active `designer_clients` row it returns a thread id; the designer→client direction still works.

**Run**: both files under `psql -v ON_ERROR_STOP=1 -f` → FAIL.

**Implementation.** 00536, three sections.

1. **Roster read (M7).** Exactly the shape W1a's fixer proposed:
```sql
CREATE POLICY designer_clients_client_read ON public.designer_clients
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() AND status = 'active');
```
`client_id` is the column `RosterAPIClient` filters on (F15). SELECT only; the designer's
`FOR ALL` leg and the studio leg are untouched.

2. **Direct-thread counterpart (m8).** `CREATE OR REPLACE FUNCTION public.rpc_start_direct_thread(counterpart UUID)` — body **verbatim from 00103:51-104** (the sole definition, F16), parameter name `counterpart` preserved (renaming it fails with *cannot change name of input parameter*), with one guard grafted after the existing `counterpart <> v_caller` check:

```sql
  IF NOT (
       EXISTS (SELECT 1 FROM public.designer_clients dc
                WHERE dc.status = 'active'
                  AND ((dc.designer_id = counterpart AND dc.client_id = v_caller)
                    OR (dc.designer_id = v_caller AND dc.client_id = counterpart)))
    OR EXISTS (SELECT 1 FROM public.leads l
                WHERE l.status IN ('accepted','claimed')
                  AND ((l.designer_id = counterpart AND l.homeowner_id = v_caller)
                    OR (l.designer_id = v_caller AND l.homeowner_id = counterpart)))
    OR EXISTS (SELECT 1 FROM public.projects p
                WHERE ((p.designer_id = counterpart AND p.client_id = v_caller)
                    OR (p.designer_id = v_caller AND p.client_id = counterpart)))
  ) THEN
    RAISE EXCEPTION 'no relationship with that counterpart'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
```
Symmetric, so the designer side keeps working. `GRANT EXECUTE … TO authenticated` re-applied
(00103:105) — `CREATE OR REPLACE` preserves grants, but stating it keeps the generated ACL seed honest.
The `leads` status vocabulary is read out of the live CHECK before writing; if `claimed` is not a
member, the predicate carries only what the constraint admits.

3. **`purge_client_account(p_user_id uuid) RETURNS void`**, SECURITY DEFINER,
`SET search_path = public, pg_temp`, `REVOKE ALL … FROM PUBLIC, anon, authenticated;
GRANT EXECUTE … TO service_role;`. Body is exactly the recipe F23 proved, in order:

```
ALTER TABLE public.proposals               DISABLE TRIGGER USER;
ALTER TABLE public.projects                DISABLE TRIGGER USER;
ALTER TABLE public.invoices                DISABLE TRIGGER USER;
ALTER TABLE public.client_decisions        DISABLE TRIGGER USER;
ALTER TABLE public.client_decision_options DISABLE TRIGGER USER;
  UPDATE client_decisions SET selected_by = NULL WHERE selected_by = p_user_id;
  UPDATE proposals SET client_id = NULL WHERE client_id = p_user_id;
  UPDATE proposals SET designer_client_id = NULL
   WHERE designer_client_id IN (SELECT id FROM designer_clients WHERE client_id = p_user_id);
  UPDATE projects SET client_id = NULL WHERE client_id = p_user_id;
  UPDATE invoices SET client_id = NULL WHERE client_id = p_user_id;
  UPDATE comms_threads t SET created_by = (…first other live participant…)
   WHERE t.created_by = p_user_id AND EXISTS (…another live participant…);
  DELETE FROM comms_threads WHERE created_by = p_user_id;
… ENABLE TRIGGER USER on all five, in an EXCEPTION WHEN OTHERS THEN <re-enable>; RAISE; block …
```
The banner states plainly why: `proposals.client_id`, `projects.client_id` and `invoices.client_id`
are immutable under `guard_proposal_copy_immutability` / `guard_project_completion_authority` /
`set_invoice_studio_id`, with **no** escape hatch, so the FK's own `ON DELETE SET NULL` cannot fire
(F22). `DISABLE TRIGGER USER` keeps RI triggers live — the cascades still run — and takes ACCESS
EXCLUSIVE, so no concurrent writer can slip past the guard during the window (F24). An erasure
request outranks edition immutability; the designer's document survives with the person detached.

**Pass run**: `supabase db reset`, then both new tests, then
`supabase/tests/document/*`, `supabase/tests/proposals/*` (nothing there may regress).

**Commit**
```
git add supabase/migrations/00536_client_side_server_gaps.sql supabase/tests/rls/designer_clients_client_read_test.sql supabase/tests/auth/account_purge_test.sql
git commit -m "feat(db): 00536 — a client can see their designer, reach only their designer, and leave" -- <same paths>
```

---

## Task 6 — the `delete-account` edge function

**Files**
- `supabase/functions/delete-account/index.ts` (new)
- `supabase/functions/delete-account/handler.ts` (new — the testable core)
- `supabase/functions/delete-account/handler.test.ts` (new)
- `supabase/config.toml` (the `[functions.delete-account]` stanza)

Split the way `proposal-send` is split: `handler.ts` takes its dependencies as an injected gateway
so the test needs no network and no stack.

**Interface**
```ts
export interface DeleteAccountGateway {
  authenticate(req: Request): Promise<{ userId: string } | null>;
  purge(userId: string): Promise<{ ok: boolean; error?: string }>;   // rpc purge_client_account
  deleteAuthUser(userId: string): Promise<{ ok: boolean; error?: string }>;
}
export function createDeleteAccountHandler(gw: DeleteAccountGateway): (req: Request) => Promise<Response>;
```

**Failing test first** — `handler.test.ts`:
1. `OPTIONS` → 200 with the CORS headers (the app calls it from a client).
2. `GET` → 405 `method_not_allowed`.
3. no/invalid Authorization → 401 `unauthorized`, and **neither** `purge` nor `deleteAuthUser` ran.
4. happy path → 200 `{ok:true, userId}`, `purge` called **before** `deleteAuthUser`, each once, both with the authenticated id and nothing from the body (a caller must not be able to delete someone else).
5. a body naming another user id is ignored — the calls still carry the token's own id.
6. purge fails → 500 `purge_failed`, `deleteAuthUser` **not** called (never orphan an auth user whose rows are half-detached).
7. auth delete fails → 500 `auth_delete_failed`.
8. no vendor/provider error text reaches the response body (C5) — the assertion greps the serialized body for the injected failure string and requires it absent.

**Run**: `deno test --config supabase/functions/deno.json supabase/functions/delete-account/` → FAILS.

**Implementation.**
- `handler.ts`: the order and the error shapes above, `json(body, status)` helper, `corsHeaders` inline (browser/app-callable, per patina-edge-functions §4).
- `index.ts`: `verify_jwt` stays at the platform default **true** — the platform validates the JWT and the function re-reads the caller with `supabase.auth.getUser()` through a client carrying the caller's Authorization header, exactly as `invoice-send` does at `:84-93`; the service-role client is created **after** that succeeds. `purge` = `admin.rpc('purge_client_account', { p_user_id })`; `deleteAuthUser` = `admin.auth.admin.deleteUser(userId)`.
- `config.toml`: a stanza with `verify_jwt = true` and a comment saying why it is explicit — the gateway must never be relaxed here, since the function's whole job is destructive and self-addressed.

**Pass run**: `deno test --config supabase/functions/deno.json supabase/functions/delete-account/`.

**Commit**
```
git add supabase/functions/delete-account supabase/config.toml
git commit -m "feat(functions): delete-account — a way to close the account, for real" -- <same paths>
```

---

## Task 7 — client-portal: the AASA details entry for `cloud.patina.app`

**Files**
- `apps/client-portal/src/app/.well-known/apple-app-site-association/route.ts`
- `apps/client-portal/src/app/.well-known/apple-app-site-association/__tests__/route.test.ts`

**Failing test first** — extend the existing `toEqual` assertion to two details entries and add:
- a case asserting the second entry is `VP22LXHT7L.cloud.patina.app` with
  `paths: ["/piece/*", "/invoice/*", "/proposal/*", "/decision/*"]`;
- a case asserting the Field entry is **unchanged** (appID, paths and its `components` block), so the
  Field app's live links cannot regress;
- a case asserting `GET()` still serves `application/json` with no redirect.

**Run**: `pnpm --filter @patina/client-portal test -- src/app/.well-known` → FAILS.

**Implementation.** Append the second `details` entry. Field stays first (order is not significant
to Apple, but keeping it first keeps the diff to an addition). No `components` block on the new
entry — the four `paths` patterns are the whole rule.

**Pass run**: the same jest command → PASS.

**Commit**
```
git add apps/client-portal/src/app/.well-known
git commit -m "feat(client-portal): associate the client app with the piece, invoice, proposal and decision paths" -- <same paths>
```

---

## Task 8 — client-portal: the public `/piece/[id]` route

**Files**
- `apps/client-portal/src/app/piece/[id]/page.tsx` (new)
- `apps/client-portal/src/app/piece/[id]/piece-content.ts` (new — the pure shaping the test drives)
- `apps/client-portal/src/app/piece/[id]/__tests__/piece-content.test.ts` (new)
- `apps/client-portal/src/middleware.ts` (one line — see below)

`middleware.ts` is owned by **no** lane (A/B/C are `apps/mobile/**` only). Without a `/piece/`
entry in `isPublicPage`, every signed-out visit to a shared link is redirected to `/auth/signin`
and SP-03 is unbuildable (F20). The edit is one predicate and one line in the `isPublicPage`
disjunction; it is also written into `d-notes.md` so the steward sees it at integration.

**Interface** (`piece-content.ts`, pure, so the test needs no Next runtime):
```ts
export interface PieceRow { id: string; name: string; brand: string|null; description: string|null;
  price_retail: number|null; images: string[]|null; dimensions: unknown; lead_time_weeks: number|null;
  vendors: { name: string|null } | { name: string|null }[] | null }
export interface PieceView { id: string; name: string; maker: string|null; price: string|null;
  imageUrl: string|null; blurb: string|null; size: string|null; leadTime: string|null; appLink: string }
export function toPieceView(row: PieceRow): PieceView;
export function pieceMetadata(view: PieceView): { title: string; description: string;
  openGraph: { title: string; description: string; images: string[]; type: "website" } };
```

**Failing test first** — `piece-content.test.ts`:
1. maker prefers `brand`, falls back to the vendor name, and is **null** when neither resolves — never the string "Unknown Maker" (SP-10/C5).
2. price formats integer cents as `$4,200` and is **null** when `price_retail` is null — no `$0`.
3. `size` renders `38″ W × 20″ D × 30″ H` from `{width:38,depth:20,height:30,unit:"in"}` and is **null** for null/garbage dimensions.
4. `leadTime` renders `Ships in 8–10 weeks` from `lead_time_weeks: 9`… — pinned: `8` → `Ships in about 8 weeks`; null → null. (One shape, no invented range.)
5. `imageUrl` is the first image or null; an empty array is null.
6. `appLink` is `patina://piece/<id>`.
7. `pieceMetadata` puts the piece and its maker in the OG title (`"Heirloom Oak Dining Table by Nordic Atelier"`), falls back to the bare name with no maker, and never emits an empty `images` entry.

**Run**: `pnpm --filter @patina/client-portal test -- src/app/piece` → FAILS.

**Implementation.**
- `page.tsx`: `export const dynamic = 'force-dynamic'`, `generateMetadata({params})` and the default
  export both reading through `createClient()` from `@patina/supabase/client` — the **anon** client,
  so the `products_catalog_select_anon` policy (F19) is the gate rather than a service key. Select
  `id, name, brand, description, price_retail, images, dimensions, lead_time_weeks, vendors(name)`
  by id. No `status` filter: `get_recommendations` does not filter on status either, so a link the
  app can produce must resolve (recorded in `d-notes.md`).
- Missing row → Next's `notFound()`, and `generateMetadata` returns a plain "Piece not found" title —
  no leak of whether an id ever existed.
- The page renders name, maker, price, image, and the honest spec rows (each omitted when null),
  plus an "Open in Patina" link to `appLink`. Copy in Patina's voice; no vendor/system text.
- New file under `src` ⇒ its test ships in the same change (client-portal's coverage floor, patina-testing §4).

**Pass run**: `pnpm --filter @patina/client-portal test -- src/app/piece src/app/.well-known`
and `pnpm turbo type-check --filter=@patina/client-portal`.

**Commit**
```
git add apps/client-portal/src/app/piece apps/client-portal/src/middleware.ts
git commit -m "feat(client-portal): a shared piece has a page of its own" -- <same paths>
```

---

## Task 9 — seeds, generated ACLs, generated types

**Files**
- `supabase/seed/products.sql`
- `supabase/seed/00-legacy-grants.sql` (regenerated)
- `packages/supabase/src/database.types.ts` (regenerated)

**Failing check first**: `psql "$SUPABASE_DB_URL" -t -A -c "select count(*) from products where layer='catalog' and dimensions is not null and lead_time_weeks is not null"` → expect **0** before, **≥6** after.

**Implementation.** Add `dimensions` and `lead_time_weeks` to the INSERT column list and give values
on **eight** of the twelve rows — real proportions per piece type, `{"width":…,"depth":…,"height":…,"unit":"in"}`.
Four rows are deliberately left null so the app's honest-absence branch has something to exercise
(SP-10: "omit each line entirely when the column is null"). `ON CONFLICT (id) DO NOTHING` stays, so a
stack that is not reset keeps its rows — the values land on the next `db reset`, which this lane owns.

Then, once (00533 and 00536 both add GRANT/REVOKE):
```
python3 scripts/generate-legacy-grants.py
pnpm db:generate
git diff --stat packages/supabase/src/database.types.ts supabase/seed/00-legacy-grants.sql
```

**Pass run**: `supabase db reset` (unsandboxed), then the count check → ≥6.

**Commit**
```
git add supabase/seed/products.sql supabase/seed/00-legacy-grants.sql packages/supabase/src/database.types.ts
git commit -m "chore(db): seed the catalog with size and lead time; regenerate ACLs and types" -- <same paths>
```

---

## Task 10 — the lane gate, and the notes the other lanes are waiting on

**Files**: `artifacts/ios-daily-return-2026-08-26/waves/w1b/d-notes.md` (not committed to the repo —
it lives in the artifacts tree, which is untracked for this program's wave folders; commit it only
if `git status` shows it as tracked).

**Gate, every command in the foreground, output pasted into the report:**
```
supabase db reset                                                   # unsandboxed; lane D only
scripts/run-sql-tests.sh                                            # the whole supabase/tests tier
deno test --config supabase/functions/deno.json supabase/functions/_shared/client-attention.test.ts
deno test --config supabase/functions/deno.json supabase/functions/delete-account/
deno test --config supabase/functions/deno.json supabase/functions/proposal-send/
pnpm turbo type-check --filter=@patina/client-portal
pnpm --filter @patina/client-portal test -- src/app/piece src/app/.well-known
ls supabase/migrations | tail                                       # renumber check before the last commit
git status --porcelain                                              # must be empty
```
`scripts/run-sql-tests.sh` compares against `supabase/tests/KNOWN_FAILURES.md`; read that file first
and report any pre-existing expected failure separately from anything this lane caused.

**`d-notes.md` carries, at minimum:**
- **lane B · SP-04** — F17: `sign_proposal` does **not** send the confirmation email, and does not need to; `ProposalsAPIClient.signProposal` (`:419-429`) already fires `proposal-sign-confirmation` best-effort after the RPC. No backend change; B's work is the sheet copy only.
- **lane C · 00534** — the two-row contract table above, verbatim, plus: iOS `AppNotificationType(serverType:)` has no case for `proposal_attention` / `invoice_attention` / `decision_attention`, so all three fall to `.newRecommendations`'s icon — C's mapping needs three cases. And `metadata.body` is now written (00289/00388 wrote `message` only, F7).
- **lane C · delete-account** — the endpoint contract above; `APIConfiguration.swift:182,220` points at a `delete_user_account` RPC that does not exist and must be re-pointed at `/functions/v1/delete-account`.
- **lane C · SP-03** — the piece URL shape and the AASA paths now served.
- **lane A · SP-10** — the exact `RETURNS TABLE` order, and that `maker_name` keeps `COALESCE(v.name,'Unknown Maker')`: preferring `brand` and suppressing the literal is A's composition.
- **steward** — `apps/client-portal/src/middleware.ts` is owned by no lane and carries a one-line addition (F20); 00536 groups three unrelated escalations under one number, flagged for Fable.

**Commit**: nothing repo-tracked; the report carries the evidence.

---

## Deviations from this plan, as executed

Recorded rather than quietly absorbed. Five, all small.

1. **The products seed moved from Task 9 into Task 1.** Task 1's new contract assertions include
   "the projection carries the catalog's real values, not a column of nulls", and 0 of 19 catalog
   rows had `dimensions` or `lead_time_weeks` before the seed pass — so the test could not go green
   without it. Committed with 00533.

2. **The `rpc_start_direct_thread` cases live in `designer_clients_client_read_test.sql`,** not in
   `account_purge_test.sql` as Task 5 wrote. Both are relationship-scoped; the purge file is about
   erasure. Nine assertion groups there, six in the purge file.

3. **00536 gained a third item, `purge_client_account(uuid)`** — unplanned. The plan asked the
   `delete-account` edge function to "cascade app rows then auth admin delete", and probing showed
   the cascade is refused by five designer-authority guard triggers with no escape hatch from a
   service-role client. Full evidence and the reasoning in `d-notes.md` §6(b); it is the one decision
   in this lane that wants a second opinion.

4. **`apps/client-portal/src/middleware.ts` was edited** — one `const` and one disjunct. Owned by no
   lane in `steward.md` §6, and the new public route is unreachable signed-out without it.
   `d-notes.md` §6(a) carries the exact diff.

5. **The whole client-portal jest suite was run, not only the two narrow paths.** It surfaced two
   pre-existing failures inherited from `main` in files this lane never touched
   (`portal-access.test.ts`, `orders.test.ts` — the latter's subject module does not exist).
   Reported as a baseline in `d-notes.md` §7 rather than fixed: neither is in this lane's file set.

Not deviations, but worth stating: Task 1's "four other callers" turned out to be **three** — the
client-portal feed route only mentions `get_recommendations` in a comment (F3, confirmed by reading
it in full), so it needed no change. And the seed split is nine rows with dimensions / seven with a
lead time, not the "eight" the plan estimated.
