# Invoice data model & payment rail — factual survey

Repo: `/Users/kody/Code/patina-merged`. All paths absolute below are relative to that root unless written in full.

Surveyed 2026-09-05 (Explore agent, read-only). Verbatim report.

---

## 8. Migrations head (answered first, it's short)

```
supabase/migrations/00563_proposal_signing_multi_studio.sql
supabase/migrations/00564_client_signoff_approval.sql
supabase/migrations/00565_the_client_page.sql
supabase/migrations/_pending/00106_drop_client_messages.sql   (parked, not applied)
```
Head = **00565**. 521 entries in `supabase/migrations`.

(Orchestrator note: MEMORY.md on 2026-09-05 records 00566–00568 landed on main after this survey and a peer session minting 00569 — studio invoices mint from **00570**.)

---

## 1. The `invoices` table

### Created by
`/Users/kody/Code/patina-merged/supabase/migrations/00178_invoices_v1.sql:29` — `CREATE TABLE public.invoices (...)` (through line 64).

### Every migration that ALTERs it, sorted
| Migration | Line | Change |
|---|---|---|
| `00178_invoices_v1.sql` | 29–75 | create + indexes |
| `00178_invoices_v1.sql` | 232 | `ENABLE ROW LEVEL SECURITY` |
| `00182_invoices_void_draft_fix.sql` | 12–17 | drop/re-add `chk_invoices_number_when_issued` → `status IN ('draft','void') OR invoice_number IS NOT NULL` |
| `00209_invoice_chase.sql` | 20 | `ADD COLUMN ar_last_chased_at TIMESTAMPTZ` |
| `00318_studio_invoice_numbering_and_ops.sql` | 20–24 | `ADD COLUMN studio_id uuid REFERENCES organizations(id) ON DELETE SET NULL` + `idx_invoices_studio` |
| `00513_invoice_numbering_studio_uniqueness.sql` | 40–52 | index swap only (no columns) |

No later migration adds columns. Verified against generated types at `/Users/kody/Code/patina-merged/packages/supabase/src/database.types.ts:7787-7880`.

### Final column set (as of head)
```
id                          uuid PK  default gen_random_uuid()
project_id                  uuid NOT NULL  → projects(id) ON DELETE CASCADE      ← NOT NULL
designer_id                 uuid NOT NULL  → profiles(id) ON DELETE CASCADE
client_id                   uuid NULL      → profiles(id) ON DELETE SET NULL
studio_id                   uuid NULL      → organizations(id) ON DELETE SET NULL   (00318)
invoice_number              text NULL
status                      text NOT NULL default 'draft'
issue_date                  date NULL
due_date                    date NULL
payment_terms_days          integer NOT NULL default 15  CHECK >= 0
currency                    text NOT NULL default 'USD'
subtotal_cents              integer NOT NULL default 0  CHECK >= 0
tax_rate                    numeric(6,4) NOT NULL default 0
tax_cents                   integer NOT NULL default 0
total_cents                 integer NOT NULL default 0
amount_paid_cents           integer NOT NULL default 0
memo                        text
internal_notes              text
stripe_checkout_session_id  text
sent_at / paid_at / voided_at   timestamptz
void_reason                 text
reminder_count              integer NOT NULL default 0
last_reminder_at            timestamptz
ar_flagged_at               timestamptz
ar_last_chased_at           timestamptz        (00209)
created_at / updated_at     timestamptz NOT NULL default now()
```

**Answers to the specific questions:**
- `project_id` — **NOT NULL, FK to `projects`, ON DELETE CASCADE** (`00178:31`). Generated type confirms `project_id: string` in `Row` *and* required in `Insert` (`database.types.ts:7805`, `:7836`).
- `client_id` — **yes**, nullable, FK to `profiles` (`00178:33`). Note: it points at a *user profile*, not at a `designer_clients` row.
- `studio_id` — **yes**, added 00318 (`00318:20-21`). There is no `studio_workspace_id`.
- `designer_id` — **yes**, NOT NULL (`00178:32`).
- `milestone_id` — **no** on the header. Milestones attach per-line (`invoice_line_items.milestone_id`) and the milestone row carries a back-latch `project_payment_milestones.invoice_id` (00397).
- `proposal_id` — **no** on the header. Commercial-document linkage is one-way: `project_commercial_documents.deposit_invoice_id`, `project_billing_authorities.retainer_invoice_id`, `trade_scope_draws.invoice_id`, `concierge_orders.client_invoice_id`.

### Status enum
Not a Postgres enum — a `TEXT` CHECK: `('draft','sent','partially_paid','paid','void')` (`00178:34-35`). TS twin at `/Users/kody/Code/patina-merged/packages/shared/src/invoice/index.ts:12-20`.

Two table CHECKs:
- `chk_invoices_paid_at_when_paid` (`00178:57-58`)
- `chk_invoices_number_when_issued` — head form in `00182:15-17`.

### Number generation
No sequence, no trigger. Numbers are minted **inside `issue_invoice`** (`00318_studio_invoice_numbering_and_ops.sql:155-172`):
- if `invoices.studio_id IS NOT NULL` → upsert `studio_invoice_counters(studio_id)` `next_number + 1`;
- else → upsert `invoice_counters(designer_id)` `next_number + 1`.
Format: `'INV-' || LPAD(v_number::TEXT, 4, '0')` (`00318:180`).

Counter tables: `public.invoice_counters(designer_id PK, next_number)` (`00178:159-162`) and `public.studio_invoice_counters(studio_id PK, next_number)` (`00318:76-79`). Both RLS-enabled with **zero policies** (RPC-only).

Uniqueness (head = 00513):
- `uniq_invoices_studio_number` on `(studio_id, invoice_number) WHERE studio_id IS NOT NULL AND invoice_number IS NOT NULL` (`00513:39-41`)
- `uniq_invoices_designer_number_studioless` on `(designer_id, invoice_number) WHERE studio_id IS NULL AND invoice_number IS NOT NULL` (`00513:46-48`)
- legacy `uniq_invoices_designer_number` DROPPED (`00513:53`)

### Line-item storage
A **real table**, `public.invoice_line_items` (`00178:82-100`). There is no JSONB `line_items` column on `invoices`. Columns (final, per `database.types.ts:7631-7645`):

```
id, invoice_id (NOT NULL, CASCADE), kind, milestone_id, ffe_item_id,
description (NOT NULL), quantity numeric(10,2), unit_amount_cents,
amount_cents, metadata jsonb NOT NULL default '{}', sort_order, created_at
```
- `kind` CHECK rebuilt in `00187_invoice_ffe_lines.sql:76-80` → `('milestone','time','adhoc','ffe')` (constraint `chk_line_items_kind`).
- `ffe_item_id` added `00187:92-94`; partial unique `uniq_invoice_line_items_ffe_item` (`00187:117`).
- `uniq_invoice_line_items_milestone` partial unique on `milestone_id` (`00178:105-107`).

### Surcharge / fee columns
Migration `/Users/kody/Code/patina-merged/supabase/migrations/00428_invoice_payment_method_surcharge.sql`:
- New table `public.studio_billing_settings(studio_id PK → organizations, card_surcharge_bps int NOT NULL default 300 CHECK 0..300, check_remit_to text, created_at, updated_at)` — `00428:43-52`.
- `invoice_checkout_attempts` += `payment_method text` (CHECK `('card','us_bank_account')` or NULL), `surcharge_cents int NOT NULL default 0` — `00428:105-120`.
- `invoice_payments` += `surcharge_cents int NOT NULL default 0`, `stripe_payment_method_type text` (same CHECK) — `00428:124-138`.
- **`invoices` itself gets NO surcharge column.** The doc-comment at `00428:14-18` states `invoice_payments.amount_cents` stays the pure invoice-applied balance; charged gross = amount + surcharge; `method` stays `'stripe'`.
- Rounding formula lives once in `public.invoice_payment_surcharge_cents(amount_cents, method, card_bps)` (`00428:154-...`): `(cents::bigint * bps + 5000) / 10000`; ACH = `LEAST(formula(cents, 80), 500)`. TS twin: `/Users/kody/Code/patina-merged/packages/shared/src/invoice/index.ts`.
- Read RPC `public.get_invoice_payment_options(uuid)` (`00428:720-763`) — **dereferences `projects.client_id` via `invoice.project_id`** at `00428:743-744` as an authorization fallback.

---

## 2. RLS policies (latest definition of each)

RLS is enabled on `invoices`, `invoice_line_items`, `invoice_payments` at `00178:232-234`. There are **two live policy families**, both still in force — no migration has dropped the 00178 set.

### Family A — owner policies, head = `00178_invoices_v1.sql`
| Policy | Line | Predicate |
|---|---|---|
| `Designers can view their invoices` (SELECT) | 239-241 | `designer_id = auth.uid()` |
| `Designers can create their invoices` (INSERT) | 243-245 | `designer_id = auth.uid()` |
| `Designers can update their draft invoices` (UPDATE) | 248-251 | `designer_id = auth.uid() AND status = 'draft'` (USING + WITH CHECK) |
| `Designers can delete their invoices` (DELETE) | 253-255 | `designer_id = auth.uid()` |
| `Clients can view issued invoices on their projects` (SELECT) | 257-265 | `status <> 'draft' AND EXISTS (SELECT 1 FROM projects p WHERE p.id = invoices.project_id AND p.client_id = auth.uid())` ← **client read is keyed on the PROJECT, not `invoices.client_id`** |
| `Designers can view line items on their invoices` | 268-275 | invoice.designer_id = auth.uid() |
| `Designers can add/update/delete line items on their draft invoices` | 277-315 | invoice.designer_id = auth.uid() AND invoice.status='draft' |
| `Clients can view line items on issued invoices` | 318-330 | `JOIN projects p ON p.id = i.project_id ... p.client_id = auth.uid()` |
| `Designers can view payments on their invoices` | 333-340 | invoice.designer_id = auth.uid() |
| `Clients can view payments on issued invoices` | 342-354 | `JOIN projects p ON p.id = i.project_id ... p.client_id = auth.uid()` |

`invoice_payments` has **no INSERT/UPDATE policy at all** — writes go through the definer RPC or service role.

### Family B — studio co-member policies, head = `00316_studio_shared_workspace_rls.sql`
All `TO authenticated`, all keyed on the SECURITY DEFINER helper `public.is_studio_comember(designer_id)`:

| Policy | Line |
|---|---|
| `invoices_studio_select` | 266-268 — `is_studio_comember(designer_id)` |
| `invoices_studio_insert` | 270-272 |
| `invoices_studio_update_draft` | 274-277 — `+ status = 'draft'` |
| `invoice_line_items_studio_select` | 279-282 |
| `invoice_line_items_studio_insert_draft` | 284-287 |
| `invoice_line_items_studio_update_draft` | 289-294 |
| `invoice_line_items_studio_delete_draft` | 296-299 |
| `invoice_payments_studio_select` | 301-304 |

Deliberately **no studio DELETE on `invoices`** (comment `00316:262-264`).

### The helpers the policies key on
- `public.is_studio_comember(p_owner uuid)` — head `/Users/kody/Code/patina-merged/supabase/migrations/00556_admin_studio_management.sql:51-76` (00315 body + `organizations.status='active'` join). Self-branch `p_owner = auth.uid()` OR shared active non-guest `organization_members` in an active org.
- `public.is_active_studio_member(p_org_id)` — `00417_studio_contacts.sql:~30-55` (org-keyed sibling), used by `studio_billing_settings` policies at `00428:65-88`.
- `public._can_manage_invoice_owner(p_owner)` — `00397_billing_checkout_integrity.sql:903`.
- `public.can_manage_invoice(p_invoice_id)` — `00397:1251-1263`; "invoice owner or an active non-guest peer in the same active design_studio" (comment `00397:1268`).

### Triggers on `invoices`
- `set_invoices_updated_at` — `00178:220-222`
- `set_invoice_studio_id` — created `00318:63-66`, **redefined at `/Users/kody/Code/patina-merged/supabase/migrations/00511_public_sd_hardening.sql:3073-3087`** with a much wider `UPDATE OF` column list. Function head = `00511:2616`. It derives `studio_id` from **`projects.studio_id` first**, falling back to `_primary_studio_for(designer_id)` (00318 form at `00318:52-55`).
- `ae_invoice_sent_dispatch` / `ae_payment_received_dispatch` — `00291_activation_event_bridge.sql:343-347`, `:378-381` (AFTER UPDATE OF status).
- On `invoice_payments`: `trg_invoice_payments_apply_effects` AFTER INSERT OR UPDATE OF status — `00178:695-709`.
- On `invoice_line_items`: `sync_invoice_line_milestone_latch_trg` AFTER INSERT/UPDATE/DELETE — `00397:1216-1220`; plus BEFORE INSERT / BEFORE UPDATE OF invoice_id guards at `00397:950-952`, `:980-982`.

---

## 3. RPCs / functions that create or mutate invoices

### HEAD migration per function (anchored, sorted-last)

| Function | HEAD | Notes |
|---|---|---|
| `public.issue_invoice(uuid, date)` | `00412_design_services_commercial_authority.sql:2694-2727` | thin wrapper: time-entry authorization + retainer-paid gate, then calls `_issue_invoice_pre_00412` |
| `public._issue_invoice_pre_00412(uuid,date)` | renamed at `00412:2690` from the `00397:1371` wrapper | which calls… |
| `public._issue_invoice_authorized_legacy_00397(uuid,date)` | renamed at `00397:1367` from `00318:99` | **the real body** — numbering, totals, milestone flip |
| `app_private.issue_invoice_for_actor(uuid,date,uuid)` | `00511:3713-4096` | private owner-only core used by the 6 ceremony callers (list asserted at `00511:7317-7325`) |
| `public.record_invoice_payment(...)` | `00397:1406-1441` | wrapper → `_record_invoice_payment_authorized_legacy_00397` (body = `00318:212-260`) |
| `public.void_invoice(uuid,text)` | `00397:1454-1478` | wrapper → `_void_invoice_authorized_legacy_00397` (body = `00187:154-227`) |
| `public.apply_invoice_payment_effects(uuid)` | **`00277_refund_reconciliation.sql:128-268`** | see below |
| `public.draft_invoice_from_milestone(uuid)` | `00397:573-...` | inserts the invoice header at `00397:831-838` |
| `public.generate_milestone_invoice(uuid)` | `00397:1225-1247` | authz wrapper around the above |
| `public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)` | **`00511:3344-3697`** | the authenticated composer boundary the portal calls |
| `public.can_manage_invoice(uuid)` | `00397:1251` |  |
| `public._can_manage_invoice_owner(uuid)` | `00397:903` |  |
| `public.chase_invoice(uuid)` | `00209:33-63` | stamps `ar_last_chased_at` |
| `public.set_invoice_studio_id()` | `00511:2616` |  |
| `public.sync_invoice_line_milestone_latch()` | `00397:~1150-1210` |  |
| `public.claim_invoice_checkout_attempt(...)` | `00428:190` |  |
| `public.finalize_invoice_checkout_attempt(...)` | `00428:414` |  |
| `public.settle_invoice_checkout_payment(...)` | `00428:606` |  |
| `public.fail_invoice_checkout_attempt(...)` | `00397:1747` |  |
| `public.recover_invoice_checkout_session_evidence(...)` | `00428` |  |
| `public.get_invoice_payment_options(uuid)` | `00428:720` |  |
| `public.get_ffe_invoice_coverage(uuid)` | `00187:250` | takes `p_project_id` |
| `public.guard_invoiced_time_entry()` | `00177:51` |  |
| `public.issue_trade_draw_invoice(uuid)` | `00425` (referenced `00511:128`) |  |

### `apply_invoice_payment_effects(p_invoice_id)` — head `00277:128-268`

SECURITY DEFINER, `service_role` EXECUTE only (`00277:275-276`). Fired by the AFTER trigger on `invoice_payments`. What it touches:

1. `SELECT * FROM invoices WHERE id = ... FOR UPDATE` (`00277:141`).
2. Sums `invoice_payments.amount_cents WHERE status='succeeded'` (`00277:148-150`).
3. Derives status — never resurrects `void` (`00277:153-165`).
4. **`UPDATE invoices SET amount_paid_cents, status, paid_at, updated_at`** (`00277:175-180`).
5. **`INSERT INTO designer_earnings`** one row per succeeded payment (`00277:185-207`). Columns written: `designer_id, source_type='design_fee', gross_amount, platform_fee=0, net_amount, description, status ('confirmed' for stripe / 'paid' otherwise), paid_at, earned_at, invoice_id, invoice_payment_id, project_id`. **Critically it is an INNER JOIN:**
   ```sql
   FROM invoice_payments p
   JOIN invoices i  ON i.id = p.invoice_id
   JOIN projects pr ON pr.id = i.project_id      -- 00277:203
   ```
   and the description string interpolates `pr.name` (`00277:195`). **A project-less invoice would silently produce zero earnings rows** — no error, just no revenue recognition. This is the single biggest project-coupling in the payment rail.
6. **Refund contra rows** into `designer_earnings` keyed on `reverses_invoice_payment_id` (`00277:221-243`) — this leg joins only `invoice_payments` → `designer_earnings`, so it is project-agnostic (it copies `orig.project_id`).
7. **Milestone paid-through:** `UPDATE project_payment_milestones SET status='paid', paid_at` via `invoice_line_items.milestone_id` (`00277:245-253`); and the un-pay mirror back to `'outstanding'` on refund (`00277:254-266`). Both are no-ops when no line carries a `milestone_id`.

Notably it does **not** roll up onto `projects.*` directly.

### Other project-coupled invoice functions
- `create_draft_invoice` (`00511:3344`) requires `p_project_id` and re-validates the exact `(project.designer_id, client_id, studio_id, status='active', studio.type='design_studio')` tuple twice, raising `insufficient_privilege` on any miss (`00511:3383-3417`).
- `issue_invoice_for_actor` (`00511:3713`) opens with `JOIN public.projects AS project ON project.id = invoice.project_id` and requires `invoice.designer_id = project.designer_id AND invoice.client_id = project.client_id AND invoice.studio_id = project.studio_id` (`00511:3745-3752`). Its comment (`00511:4098-4100`) notes commercial *proposals* may retain NULL `project_id`, but the invoice's project join is unconditional.
- `issue_invoice` body (`00318:110-201`) itself only touches `invoices`, `invoice_line_items`, the counters, and `project_payment_milestones` — **no direct `projects` read**.
- `record_invoice_payment` body (`00318:212-260`) — no `projects` read; blocks `method='stripe'`; caps at remaining balance.
- `draft_invoice_from_milestone` inserts `project_id, designer_id, client_id` from the milestone's project (`00397:831-838`).

---

## 4. Edge functions

### `supabase/functions/invoice-send/index.ts` (377 lines)
- **Input:** `{ invoiceId: string, message?: string, type?: 'sent' | 'reminder' }` (header comment `:26-32`). `verify_jwt` default on.
- Authorization: `can_manage_invoice` via caller-JWT client (`:5-6`, `:9-10`).
- Project/client derefs:
  - `:64` `project_id: string` in `InvoiceRow`; `:72` `project: {id,name,client_id}`
  - `:147-152` the select — `project:projects!invoices_project_id_fkey(id, name, client_id)`, `client:profiles!invoices_client_id_fkey(...)`
  - `:202` `const clientUserId = invoice.client_id ?? invoice.project?.client_id ?? null;`
  - `:217-225` fallback to `designer_clients.client_email` keyed on `client_id`
  - `:238-242` `resolveStudioIdentity(admin, { projectId: invoice.project_id })` — branding
  - `:247` `const projectName = invoice.project?.name ?? 'your project'` (safe fallback)
  - `:297`, `:339` `project_id: invoice.project_id` written into `notification_log.metadata`
  - `:301-302`, `:337` email copy interpolates `projectName`

### `supabase/functions/invoice-reminders/index.ts` (457 lines)
- **Input:** none — cron-invoked. Schedule: `invoice-reminders-daily` at 15:00 UTC, `/Users/kody/Code/patina-merged/supabase/migrations/00181_invoice_reminders_cron.sql:27-36`.
- Derefs: `:90` `project_id`, `:99` `project` join, `:121` `invoice.client_id ?? invoice.project?.client_id`, `:136-144` `designer_clients.client_email` fallback, `:176` / `:317` `projectName`, `:262` the PostgREST join, `:328-330` `resolveStudioIdentity({ projectId })`, `:196 :231 :360 :413 :435` `project_id` into notification metadata.
- Cadence columns it owns: `reminder_count`, `last_reminder_at`, `ar_flagged_at` (updates at `:165`, `:387`).

### `supabase/functions/create-checkout-session/index.ts` (1434 lines)
- **Input:** exactly one of `{ invoiceId }` / `{ po_payment_id }` / `{ direct_order_id }`; optional `{ payment_method: 'card'|'us_bank_account' }` (invoices only) and `{ reconcile_session_id }`. Header contract `:9-30`; parsing at `:1360-1372`.
- **Does it require a project? Yes, in three ways** (all in `loadInvoicePayable`, `:207-340`):
  1. `:216-218` the select joins `projects!invoices_project_id_fkey(id, name, client_id)`.
  2. `:234` **payer identification:** `const isClient = caller.id === (invoice.client_id ?? invoice.project?.client_id)` — the client is identified from `invoices.client_id` first, **project.client_id as legacy fallback**. There is no `invoices.client_email` column anywhere; email is never used for checkout authorization.
  3. `:264-271` branding label via `resolveStudioIdentity({ projectId: invoice.project_id })` and `invoice.project?.name ?? 'Patina project'`.
  4. `:292-293` **success/cancel URLs are hard-coded to `${CLIENT_PORTAL_URL}/projects/${invoice.project_id}?invoice=…#letterbox`** — a project-less invoice has no return URL under the current shape. (Compare the direct-order path, `:531-542`, which already tolerates `order.project_id === null` via `clientProjectLink` and the comment at `:693-695`: "An order raised without a project has no house to return to".)
- Guards: status must be `sent` or `partially_paid` (`:240-249`); `amountDue > 0` (`:250-258`).
- DB claim/settle boundary: `claim_invoice_checkout_attempt` (`:1048`), attempt row + pending `invoice_payments` insert (`:318-338`).

### `supabase/functions/stripe-webhook/index.ts` (2176 lines)
- **Input:** raw Stripe event, `verify_jwt = false` (`supabase/config.toml:330-331`). Resolution order documented `:23-39`.
- It **only flips `invoice_payments` rows**; the 00178 trigger owns rollup/status/milestones/earnings (`:18-20`).
- Money boundary: `settle_invoice_checkout_payment` RPC (`:366`).
- Project derefs, all inside notification/email composition:
  - `:150` `project_id` on `InvoiceJoined`; `:285-295` `loadInvoiceJoined` selects `project:projects!invoices_project_id_fkey(id, name, client_id)` + client + designer profiles
  - `:309` `invoice.client_id ?? invoice.project?.client_id`; `:313-327` profile / `designer_clients` fallback chain
  - `:393`, `:496` `projectName = invoice.project?.name ?? 'your project'`
  - `:415-416`, `:506-507` `resolveStudioIdentity({ projectId, designerId })` — note **this one already passes `designerId` as an alternative**
  - `:441`, `:470`, `:531`, `:553` `project_id: invoice.project_id` into notification metadata
  - `:557` designer email copy interpolates `projectName`

### `supabase/functions/invoice-check-intent/index.ts`
- `{ invoiceId }`, `verify_jwt = true` (`supabase/config.toml:636-637`). Writes **nothing** to `invoice_payments`; only a designer `notification_log` row of type `invoice_check_intent` with a 24h idempotency window (`:9-13`, `:29-32`, `:46`).

---

## 5. Existing notion of invoice type / kind

**There is no `invoice_type`, `kind`, `category`, or equivalent column on `invoices`.** Confirmed by grep across `supabase/migrations` and by `database.types.ts:7788-7818`.

The only typing that exists is **per line**, in two layers:

1. `invoice_line_items.kind` — CHECK `('milestone','time','adhoc','ffe')`, head `00187_invoice_ffe_lines.sql:78-80`.
2. **A `metadata` JSONB convention** used by the ceremony RPCs to mark commercial anchors (`00511_public_sd_hardening.sql`):
   - `{'commercialDocumentId': …, 'kind': 'design_services_retainer'}` — `00511:4534`
   - `{'commercialDocumentId': …, 'kind': 'furnishings_deposit'}` — `00511:4959`, `:5688`
   - `{'tradeScopeDocumentId': …, 'kind': 'trade_draw'}` — `00511:5306`, `:6043`, `:6389`
   - `{'source': 'milestone_autodraft' | 'milestone_draft_repair'}` — `00397:848`, `:551`
   `create_draft_invoice` **rejects** caller-supplied commercial anchors — the allowlist of line keys is at `00511:3502-3512` and anchors are validated/blocked at `00511:3849-3898`.

Adjacent "type" notions living elsewhere:
- `project_billing_authorities.retainer_activation_policy` CHECK `('immediate','retainer_paid')` and `retainer_invoice_id` — `00412:75-76`, `:147-149`.
- `po_payments.kind` CHECK `('deposit','balance','milestone')` (different rail; label map at `create-checkout-session/index.ts:371-375`).
- `project_payment_milestones.trigger_kind = 'on_signing'` (deposit autodraft) — `00274_deposit_autodraft_on_signing.sql:291-322`.
- `designer_earnings.source_type = 'design_fee'` is the only value invoices ever write (`00277:187`).

---

## 6. `designer_earnings`, studio finance, QBO

### `designer_earnings`
Created `/Users/kody/Code/patina-merged/supabase/migrations/00014_portal_business_features.sql:299-329`:
```
id, designer_id NOT NULL, source_type, proposal_id, proposal_item_id, order_id,
gross_amount, platform_fee, net_amount, commission_rate, description,
status ('pending'|'confirmed'|'paid'|'cancelled' by convention, no CHECK),
payout_id, paid_at, earned_at, created_at
```
Extended by `00178:174-178` with `invoice_id`, `invoice_payment_id`, `project_id`; unique idempotency index `uniq_designer_earnings_invoice_payment` on `invoice_payment_id` (`00178:182-184`). `00277` adds `reverses_invoice_payment_id` with its own partial unique index. RLS: `Designers can view their earnings` — `designer_id = auth.uid()` (`00014:343-344`), SELECT only.

### `designer_payouts`
`00014:347-374`. `designer_id, amount, currency, period_start/end, status, payment_method, payment_reference, processed_at, failed_reason, created_at`. SELECT-only RLS at `00014:381-382`. **No table links payouts to invoices** — the link is the soft `designer_earnings.payout_id` (no FK).

### `studio_ledger`
**Does not exist.** `grep -rn "studio_ledger" supabase/migrations` → 0 hits. The only studio-scoped finance table is `studio_billing_settings` (00428) and the counter table `studio_invoice_counters` (00318).

### `qbo` / QuickBooks
**No `qbo` anything in migrations** (`grep -rn "qbo\|quickbooks" supabase/migrations` → 0 hits).

`/Users/kody/Code/patina-merged/supabase/functions/qbo-export/index.ts` (644 lines) is **a vendor-Bills export only**. It reads `po_payments` joined to `purchase_orders` → `vendors` / `projects` (`:294-299`, `:318-339`) scoped by `purchase_orders.designer_id = caller.id`, and emits one CSV row per PO payment event. Header comment `:1-6`: "One row per po_payments event (deposit + balance + each milestone = separate rows)."

**Invoices do not feed QBO export at all.** There is no A/R export. The only invoice→accounting path is `designer_earnings` written by `apply_invoice_payment_effects`.

---

## 7. Clients and "the studio"

### There is no `clients` table.
Three distinct things exist:

1. **`profiles`** — the auth-backed person. `invoices.client_id`, `projects.client_id`, `proposals.client_id` all FK here.
2. **`designer_clients`** — `/Users/kody/Code/patina-merged/supabase/migrations/00014_portal_business_features.sql:72-99`. **This is the designer-owned roster, independent of any project.**
   ```
   id, designer_id NOT NULL → profiles, client_id NOT NULL → profiles,
   nickname, notes, tags text[], source, lead_id, status ('active'|'archived'|'prospect'),
   total_projects, total_revenue, first_project_at, last_project_at, created_at, updated_at,
   UNIQUE(designer_id, client_id)
   ```
   RLS: `Designers can manage their clients` FOR ALL `auth.uid() = designer_id` (`00014:110-111`); a studio-comember policy was added in `00316` (`client_activity_log` leg visible at `00316:230-233`). Later migrations add `client_email` / `client_name` (used as the email fallback in every invoice edge function). Note it is keyed on **`designer_id`, not `studio_id`** — a client roster row is owned by an individual designer.
3. **`client_profiles`** — `00001_initial_schema.sql:135`, the original homeowner-preferences table (legacy).
4. **`studio_contacts`** — `/Users/kody/Code/patina-merged/supabase/migrations/00417_studio_contacts.sql:70-124`. The **studio-scoped shared rolodex**, keyed on `organization_id`, with `entity_kind ('person'|'company')`, free-text `contact_kind` (vocabulary includes `'client'`, `'lead'` — see `00417:132-137`), `full_name/company_name/email/phone/phone_e164`, `specialties text[]`, soft links `vendor_id`, `profile_id`, soft-delete via `archived_at`. RLS keyed on `is_active_studio_member(organization_id)`. **This is the only client-like record that is studio-owned and project-independent.** It has no FK relationship to `projects.client_id` or `invoices.client_id`.

### `projects.client_id`
FK to `profiles`. `invoices.client_id` is a **snapshot** of it — `create_draft_invoice` requires `project.client_id = p_expected_client_id` (`00511:3393`), and `issue_invoice_for_actor` requires `invoice.client_id = project.client_id` (`00511:3749`). `set_invoice_studio_id` (00511 form) treats the project/client/designer/studio tuple as immutable on UPDATE.

### "The studio" — canonical name
There is **no `studio_workspaces` and no `studio_members` table**. The four files matching that grep (`00148`, `00150`, `00151`, `00152`) use "workspace" only in prose about the procurement workspace.

The canonical model is:
- **`public.organizations`** with `type organization_type = 'design_studio'` — `/Users/kody/Code/patina-merged/supabase/migrations/00021_user_management_foundation.sql:102-121`; enum at `00021:10-12` (`'design_studio','manufacturer','contractor','admin_team'`); `status organization_status ('active','suspended','pending_approval','deactivated')`.
- **`public.organization_members`** — `00021:132-146`: `user_id, organization_id, role member_role, permissions_override, invited_by, invitation_token, status member_status, joined_at`, `UNIQUE(user_id, organization_id)`.
- Column name for "the studio" on domain tables is **`studio_id uuid REFERENCES organizations(id)`** — on `projects` (00317), `invoices` (00318), `studio_billing_settings`, `studio_invoice_counters`, `studio_contacts` (as `organization_id`).
- Derivation helper: `public._primary_studio_for(uuid)` — `00315_studio_comember_helper.sql:64-79` (owner-role first, then earliest `joined_at`, restricted to `o.type = 'design_studio'`).

---

## Cross-cutting: everywhere a project-less invoice would currently break

Consolidated, for the design work that follows:

| Location | Coupling |
|---|---|
| `00178:31` | `invoices.project_id` is `NOT NULL` with a CASCADE FK |
| `00277:203` | `apply_invoice_payment_effects` **INNER JOINs `projects`** to write `designer_earnings` — silently emits no earnings row |
| `00277:195` | earnings `description` interpolates `pr.name` |
| `00178:257-265`, `:318-330`, `:342-354` | all three **client-side RLS policies** reach the client only through `projects.client_id` |
| `00511:3344+` | `create_draft_invoice` takes `p_project_id` and requires an active project + exact 4-tuple; it is the only authenticated creation path (`packages/supabase/src/hooks/use-invoices.ts:702-714`) |
| `00511:3745` | `issue_invoice_for_actor` JOINs `projects` unconditionally |
| `00511:2616` / `00318:52` | `set_invoice_studio_id` derives from `projects.studio_id`, falls back to `_primary_studio_for(designer_id)` — this leg already works project-less |
| `00428:743` | `get_invoice_payment_options` reads `projects.client_id` as an authz fallback |
| `create-checkout-session/index.ts:234` | payer identity falls back to `invoice.project?.client_id` |
| `create-checkout-session/index.ts:292-293` | success/cancel URLs are `/projects/${invoice.project_id}` — hard requirement today |
| `invoice-send:202,238-247`; `invoice-reminders:121,317,328`; `stripe-webhook:309,393,415` | recipient resolution + branding + copy read `invoice.project` (name has a `?? 'your project'` fallback; `resolveStudioIdentity` already accepts `{ designerId }` as an alternative — `supabase/functions/_shared/studio-identity.ts:33-45`) |
| `00397:1216` | `sync_invoice_line_milestone_latch` only fires when a line carries `milestone_id` — inert for project-less |
| `00513:39-48` | numbering uniqueness already has a studio-less fallback branch |
