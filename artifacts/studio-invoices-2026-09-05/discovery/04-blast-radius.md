# Studio invoices — blast-radius inventory

Produced 2026-09-05 (Plan agent, read-only) against the proposed design: `invoices.project_id` nullable, a `title` column, a new `create_draft_studio_invoice` RPC, household-keyed client RLS, null-safe edge functions, a composer branch, and the adopted-house letterbox. Verbatim report.

## 0. Two hard blockers the design does not name

**B1. `public.set_invoice_studio_id()` (HEAD `supabase/migrations/00511_public_sd_hardening.sql:2616-3040`) rejects every NULL-project row on both INSERT and UPDATE.** It is not "fighting" a NULL project; it forbids one outright:
- UPDATE branch (2645-2658): `SELECT project.* ... WHERE project.id = NEW.project_id AND project.client_id IS NOT DISTINCT FROM NEW.client_id AND project.studio_id = NEW.studio_id; IF NOT FOUND THEN RAISE 'studio_id_not_designer_studio'` — and this runs *before* the `service_role`/`postgres` early return (2672-2674). So `issue_invoice`, `apply_invoice_payment_effects` (the Stripe webhook path), `record_invoice_payment`, `void_invoice`, `chase_invoice`, and `invoice-reminders`' `.update()` all raise on a studio invoice.
- INSERT branch (2682-2803): project lookup keyed on `NEW.project_id`, then the explicit guard at ~2858: `IF NEW.project_id IS NULL OR NEW.designer_id IS NULL OR NEW.studio_id IS NULL OR NOT FOUND THEN RAISE`.
- The trigger fires on `UPDATE OF` almost every column (00511:3079-3088: status, amount_paid_cents, paid_at, reminder_count, last_reminder_at, ar_last_chased_at, updated_at…).
- Its body SHA-256 is pinned in `supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1733` (17-row manifest, `body_sha256` compare at 1740-1760).

The design must add a studio-invoice branch to this trigger (project_id IS NULL ⇒ validate `studio_id` is an active `design_studio`, designer is an active non-guest member, actor is a member or `service_role`/postgres; UPDATE immutability on project_id/designer_id/client_id/studio_id stays), and re-hash the contract test.

**B2. `app_private.issue_invoice_for_actor` is the wrong function to LEFT-JOIN.** The browser `issue_invoice` RPC chain is `public.issue_invoice` (00412:2694) → `_issue_invoice_pre_00412` (00397:1372) → `_issue_invoice_authorized_legacy_00397` (the 00318:99-207 body). That legacy body never touches `projects`; it numbers off `v_invoice.studio_id` (00318:157-170). `issue_invoice_for_actor` (00511:3713) is reached only from countersign/execute flows and *requires exactly one commercial anchor line* (`v_anchor_count <> 1 → RAISE`, 00511:3861-3865), so an adhoc-only studio invoice could never pass it anyway. Leave `issue_invoice_for_actor` alone (its body hash is pinned at contract test :1846). The only issue-path fix needed is B1.

## 1. SQL inventory

Legend: (a) raises, (b) silently drops the row, (c) fine.

| Object | HEAD | Refs | Verdict |
|---|---|---|---|
| `invoices` table: `project_id NOT NULL … ON DELETE CASCADE` | 00178:31 | — | change to nullable + CHECK. Also add `studio_id IS NOT NULL` to the CHECK when `project_id IS NULL` (see §9) |
| `idx_invoices_project` | 00178:71 | btree on project_id | (c) |
| `uniq_invoices_studio_number` / `uniq_invoices_designer_number_studioless` | 00513:39-47 | keyed on studio_id/designer_id | (c) as long as studio invoices always carry `studio_id` |
| Policy "Clients can view issued invoices on their projects" | 00178:257 | `projects p WHERE p.id = invoices.project_id` | (b) — client cannot see studio invoices; new policy needed |
| Policy "Clients can view line items on issued invoices" | 00178:318 | inner join projects | (b) — new policy needed |
| Policy "Clients can view payments on issued invoices" | 00178:342 | inner join projects | (b) — new policy needed |
| Designer/studio policies (`designer_id = auth.uid()`, `is_studio_comember(designer_id)`) | 00178:239-255, 00316:266-303 | no project | (c) |
| `set_invoice_studio_id()` trigger fn | 00511:2616 | see B1 | (a) on every INSERT/UPDATE |
| `set_invoice_studio_id` trigger def | 00511:3076 | — | unchanged |
| `create_draft_invoice` | 00511:3344 | project-tuple joins | (a) by design; new sibling RPC |
| `app_private.issue_invoice_for_actor` | 00511:3713 | `JOIN projects` + anchor count | (a) but unreachable for studio invoices; **do not modify** |
| `public.issue_invoice` → `_issue_invoice_pre_00412` → `_issue_invoice_authorized_legacy_00397` | 00412:2694 / 00397:1372 / 00318:99 | none on projects; counter via `v_invoice.studio_id` | (c) once B1 fixed |
| `record_invoice_payment` → `_record_invoice_payment_authorized_legacy_00397` | 00397:1406 / 00318:212 | none | (c) once B1 fixed |
| `apply_invoice_payment_effects` | 00277:128-270 | 200-206: `JOIN projects pr ON pr.id = i.project_id` for `designer_earnings` insert, description `'Invoice … — ' \|\| pr.name` | (b) earnings row silently dropped ⇒ studio-invoice revenue never appears in `use-earnings`; plus (a) via B1 on the `UPDATE invoices` at 172 |
| `void_invoice` | 00397:1271-1362 | none on projects | (c) once B1 fixed |
| `draft_invoice_from_milestone` | 00397:573 | `v_existing_invoice.project_id IS DISTINCT FROM v_m.project_id` (625, 667, 744) | (c) — milestone-only path, studio invoices never hold milestone lines |
| `sync_invoice_line_milestone_latch` | 00397:992 | 1108: project tuple compare | (c) — trigger only when `milestone_id` set; reject milestone lines in the new RPC |
| `get_ffe_invoice_coverage` | 00187:250 | keyed on `project_ffe_items.project_id`; invoices LEFT JOIN by line | (c) |
| `claim_invoice_checkout_attempt` | 00428:190 | 229-233: `SELECT client_id INTO v_project_client FROM projects WHERE id = v_invoice.project_id; v_expected_payer := coalesce(v_invoice.client_id, v_project_client)` | (c) — scalar subselect returns NULL; `client_id` is required by CHECK |
| `get_invoice_payment_options` | 00428:720 | 743-750 same pattern | (c) |
| `finalize_invoice_checkout_attempt` / `recover_invoice_checkout_session_evidence` / `settle_invoice_checkout_payment` / `sync_invoice_checkout_attempt` | 00428:414/505/606/782 | no project refs (grep: only 230 & 744 in file) | (c), except settle → payment insert → `apply_invoice_payment_effects` → B1 |
| `chase_invoice` | 00209:33 | none | (c) after B1 (its UPDATE at :56 fires the trigger) |
| `guard_invoiced_time_entry` | 00177:51 | none | (c) |
| `guard_time_entry_invoice_authority` | 00412:2628 | 2643: `i.project_id = NEW.project_id AND i.status='draft'` | (c) — time lines rejected for studio invoices, which is correct; new RPC must reject `kind='time'` |
| `ae_dispatch_invoice_sent` / `ae_dispatch_payment_received` | 00291:321/356 | only `NEW.designer_id`, `NEW.id`; wrapped in EXCEPTION | (c) |
| `document_state` view | 00327:83 | no invoice refs (the `i.project_id` hits in 00191-00327 are `project_ffe_items`) | (c) |
| `margin_items` view | 00543:92 (invoice branch 208-237) | `inv.project_id as project_id`, no NOT NULL filter | (c) — row emitted with NULL project_id; consumers filter by project so it never shows |
| `coordination_court_summary` / `task_blocked_state` | 00219:30/60 | no invoices | (c) |
| `close_project` | 00399:7457-7595 | `WHERE invoice.project_id = p_project_id` | (c) |
| `get_project_authority_summary`, `list_furnishings_authorizations`, `list_trade_scopes`, `get_client_commercial_document_bundle`, `apply_scope_change`, `issue_trade_draw_invoice` | 00422/00423/00425/00510/00511 | all project- or `deposit_invoice_id`-keyed | (c) |
| `notify_client_attention` (00534) / `mark_first_document_opened` (00559) / `get_recommendations` (00534) | — | 00534 only maps entity_type→`/invoices/` deep link; no invoice reads | (c) |
| `purge_client_account` | 00539:192 | writes nothing to invoices (00538 banner) | (c). Note 00536's older body did `UPDATE invoices SET client_id = NULL` — superseded |
| `resolve_studio_identity(p_project_id, p_designer_id)` | 00320:27 | no `p_studio_id`; falls to `_primary_studio_for(designer)` | **wrong brand for a two-studio designer** (§9) |
| `notifications.project_id` | 00054:297 | nullable | (c) |
| `designer_earnings.project_id` | 00178:183 | nullable | (c) |

No `list_client_invoices`/`get_client_invoices` RPC exists; every client read is PostgREST + RLS.

## 2. Edge functions

Files selecting `invoices` with the `project:projects!invoices_project_id_fkey(id, name, client_id)` embed (a left embed, so `project: null` is safe at runtime; the local TS type `project_id: string` is the lie):

| File | Lines | Change |
|---|---|---|
| `supabase/functions/invoice-send/index.ts` | 64 type; 151 embed; 241-247 `resolveStudioIdentity({projectId: invoice.project_id})`, `projectName = invoice.project?.name ?? 'your project'`; 297/339 notification `project_id` | type `project_id: string \| null`; select `title`; `projectName = project?.name ?? title ?? …`; identity by `studio_id` (§9) |
| `supabase/functions/invoice-reminders/index.ts` | 90; 176; 262; 317-342; 387 `.update()` | same; the `.update()` is a B1 victim until the trigger is fixed |
| `supabase/functions/create-checkout-session/index.ts` | 196; 218; 234 payer check; 265-270 identity + product name; 292-293 success/cancel `/projects/${invoice.project_id}?invoice=…` | URL branch to `/?invoice=…#letterbox` when null; product name fallback to `title` |
| `supabase/functions/stripe-webhook/index.ts` | 150; 290; 393-441; 496-557; 1653-1669 | same pattern (three email sites) |
| `supabase/functions/invoice-check-intent/index.ts` | 65; 124; 141; 167; 220; 260 | same pattern — **not in the design's list** |
| `supabase/functions/commercial-document-notify/index.ts` | 230-231, 308 `String(invoiceRow.project_id)` | deposit invoices only; (c) |
| `supabase/functions/_shared/studio-identity.ts:33` | `resolveStudioIdentity(admin, opts: { projectId?: string \| null; designerId?: string \| null })` — **no `studioId`** | add `studioId` path (direct `organizations` read or new RPC arg) |
| `_shared/invoice-emails.ts` | `projectName: string` required at 67/170/326/378/549 | callers pass `title` fallback; no signature change strictly needed |
| `_shared/client-portal-links.ts:51` `clientProjectLink(base, projectId \| null, anchor, params)` | already null-tolerant → `/` | (c); use it for the null-project success URL |
| `_shared/client-attention.ts:42` | `project_id` optional in metadata | (c) |
| `stripe-event-processor/core.ts` | no invoice/project refs | (c) |

`client-invite`, `decision-*`, `apns-send`, `daily-digest`, `notification-digest`: no `invoices` selects.

## 3. packages/supabase

`packages/supabase/src/hooks/use-invoices.ts`:
- `Invoice` (196-241): `project_id: string;` → `string | null`; add `title: string | null`; `project?: {…}` already optional.
- `useInvoices` (386): unscoped, embeds `project:projects!…(id, name)` → studio invoices flow into the designer ledger automatically.
- `useProjectInvoices` (457): `.eq('project_id', projectId)` — never returns studio invoices; a new `useClientInvoices()` (unscoped, RLS-driven) is required for the client portal.
- `useCreateDraftInvoice` (654-730): loads the project tuple then `rpc('create_draft_invoice', …)`; add `useCreateDraftStudioInvoice` calling the new RPC.
- `invalidateInvoiceEffects(queryClient, projectId?)` (358) already null-tolerant.
- `useIssueInvoice`/`useVoidInvoice` (896/1231) `projectId ?? invoice?.project_id` fine.
- `packages/supabase/src/database.types.ts:7808/7839/7870` `project_id: string` → regen.
- No invoice reads in `use-earnings.ts`, `use-clients.ts`, `use-organizations.ts`, `use-studio-billing.ts` beyond names; no `use-account-page.ts` exists.

## 4. Designer portal (`apps/designer-portal/src`)

| File | Lines | Change |
|---|---|---|
| `components/document/accounts/invoice-folio.tsx` | 180-181 `invoice.client_id ?? invoice.project?.client_id`; 208/217/245/285/308 `projectId: invoice.project_id` into mutations; 343 `invoice.project?.name`; 353-359 open-document button | `projectId: invoice.project_id ?? undefined`; heading `project?.name ?? title`; hide button when null |
| `components/document/accounts/accounts-ledger-page.tsx` | 131 `inv.project?.name ?? 'Project'`; 145 `onOpenDocument(inv.project_id)` | `?? inv.title ?? 'Studio'`; signature already `string \| null` |
| `components/document/accounts/accounts-receivables-page.tsx` | 122/127 `projectId: invoice.project_id`; 170; 215 | same |
| `components/document/accounts/accounts-book.tsx` | 60 `useInvoices()`; 89-92 `openDocument` returns on null | (c) |
| `lib/document/desk-receivables.ts` | 69-71 `Map<string,…>.get(inv.project_id)` | TS error once nullable; either skip null or add a studio-level bucket. Today a studio-invoice overdue never reaches the Desk because `desk-derivation.ts:1318` looks up by `row.project_id` |
| `hooks/use-desk-engagements.ts` | 211-214 select | add nothing; (c) |
| `lib/document/account-summary.ts` | 12-18 sums over `useInvoices()` | (c) — studio revenue counted (desired) |
| `lib/document/money-ladder.ts` / `hooks/use-money-ladder.ts` | project-scoped `useProjectInvoices` | (c) |
| `components/document/accounts/invoice-composer.tsx` | 74 `useState(context.projectId ?? '')`; 77-91 all project hooks; 72 `onDrafted(invoiceId, projectId)` | add mode toggle + `ClientPicker` (`components/portal/client-picker.tsx`, used by `overlays/household-sheet.tsx`) + title; gate with `useFeatureFlag('studio-invoice')` (`hooks/use-feature-flag.ts`) |
| `components/document/accounts/invoice-overlays.ts` | 24-26 `InvoiceComposerContext { projectId? }`; 88-92 `router.push('/doc/'+projectId)` | add `mode: 'studio'`, guard push |
| `components/document/command-bar.tsx` | 470 `draw-invoice`; 803-807 `draw-invoice-here` | optional "Draw a studio invoice" verb |
| `lib/document/desk-derivation.ts`, `lens-band-derivation.ts`, `ffe-leader.ts`, `people/views/person-profile.tsx` | no invoice project derefs | (c); person-profile is where a client-scoped invoice list would be *added* |

## 5. Client portal (`apps/client-portal/src`)

- `components/threshold/threshold.tsx:272` `useProjectInvoices(projectId)` — project-keyed; studio invoices invisible. `houseIds` (283-291) built from it, so `correspondence.ts` notices about a studio invoice are also unfiled.
- `components/threshold/letterbox.tsx:128-140` — `useNamedInvoice()`/`useCheckoutReturn()` look the id up in the passed `invoices` prop; feed it the merged list (project + studio for the adopted house).
- `earlier-invoices.tsx`, `settlement.tsx`, `lib/threshold/invoice-rollup.ts`, `derive.ts`, `standing.ts` — pure over `Invoice[]`; no project deref. (c)
- `lib/threshold/checkout-return.ts:40-139` reads `window.location.search` and is consumed by `letterbox.tsx` and `road-orders.tsx`, both mounted under `Threshold` on `/` and `/projects/[id]` — so the `/?invoice=…&checkout=…#letterbox` return works **only when a Threshold renders**.
- `app/page.tsx:23-66` — `fetchClientProjects()` → `resolveHouseForInstrument` → `resolveActiveHouse` → loop `fetchClientProjectView`; zero houses ⇒ `ProjectsEmptyState` (no letterbox, no checkout-return consumer).
- `lib/data/active-project.ts:99-113` `resolveHouseForInstrument`: `.in('project_id', projectIds)` ⇒ studio invoice → `null` → falls to the *last-moved* house, not the lowest-id adopted house. Also `if (projectIds.length < 2) return null`. Needs a studio-invoice branch selecting the adopted house.
- `lib/data/active-project.ts:42` movement clock reads `invoices.project_id` — NULL rows ignored (fine, but a studio invoice will never "move" a house).
- `lib/threshold/road-orders.ts:18-24` — the `standsUnfiled` rule (lowest project id the client can open) is decided by the caller; reuse it.
- `middleware.ts:270-282` + `lib/retired-routes.ts:135-142` fold `/invoices/<id>` → `/?invoice=<id>#letterbox` unconditionally; works for a no-house client only after the letterbox-only front door exists.
- `app/invoices/[invoiceId]/print/page.tsx:27` `useInvoice(invoiceId)` — id-keyed, RLS-driven; fine once the new policy lands; check its project-name line.
- No `useClientInvoices()` exists anywhere.

## 6. iOS (`apps/mobile/Patina`)

- `Patina/Services/API/InvoicesAPIClient.swift:71` `public let project_id: String?`, `:91` `public let project: RemoteInvoiceProjectRef?` — **already optional; nil decodes safely.** `listInvoices()` (200) is unscoped `.from("invoices")`, so the new RLS policy alone surfaces studio invoices; add `title` to `listSelect` (183-186).
- `Features/Budget/BudgetViewModel.swift:87-118` groups by `compactMap(\.project_id)` ⇒ studio invoices **silently dropped** from Budget.
- `Features/Invoices/Views/InvoiceDetailView.swift:117` `invoice.project?.name ?? "Your project"` → fallback to title; `:286` guards `if let projectId`.
- `InvoiceListView.swift:148`, `StudioQueueBuilder.swift:171`, `YourDesignerSeat.swift:156` nil-tolerant.
- `Capture`: no invoice touches.

## 7. Admin portal

No `invoices` queries (`settle-dialog.tsx` is a local string). Nothing to do.

## 8. Tests to update

SQL: `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` (:1733 `set_invoice_studio_id()` sha; 17-row manifest count at :1739; new SD RPC must be added to the roster the same way), `supabase/tests/billing/invoice_checkout_integrity_test.sql` (:326-345 contractor-rejection assertion must survive the new branch; raw `INSERT INTO invoices` at 149/167/210/370/681 unaffected), `supabase/tests/commercial/multi_studio_signature_test.sql`, `supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql` (both assert `studio_id_not_designer_studio`). New: studio-invoice create/issue/pay/void/RLS suite.
Deno: `supabase/functions/_tests/stripe-rail.test.ts` (:169/214/1012 `project_id: ids.project`) — add a null-project case.
packages: `packages/supabase/src/hooks/__tests__/use-invoices.test.ts`.
Designer portal: `components/document/accounts/__tests__/invoice-folio.test.tsx` (:15/42/192), `hooks/__tests__/use-desk-engagements.test.tsx` (13 refs), `lib/document/__tests__/desk-derivation.test.ts`, `command-bar.test.tsx`.
Client portal: `components/threshold/__tests__/{letterbox,earlier-invoices,threshold}.test.tsx`, `lib/data/__tests__/active-project.test.ts`, `app/__tests__/page.test.tsx`.
iOS: `PatinaTests/InvoicesMoneyRailTests.swift:26`, `BudgetAggregationTests.swift:109/183`.

## 9. Where the design is wrong or has hidden coupling

1. **B1** — the trigger, not the issue RPC, is the gate. Without a studio branch nothing writes.
2. **B2** — patching `issue_invoice_for_actor` is wasted and breaks a pinned hash; the browser path is the 00318 legacy body.
3. **`apply_invoice_payment_effects` earnings join** (00277:204) drops the `designer_earnings` row ⇒ studio revenue missing from earnings/payout. Change to LEFT JOIN + `COALESCE(pr.name, i.title)`.
4. **Studio identity for a two-studio designer**: `resolve_studio_identity` has no studio arg; with `projectId: null` every email/checkout brands with `_primary_studio_for(designer)`. Read brand by `invoice.studio_id` instead.
5. **CHECK is too weak**: `project_id IS NOT NULL OR client_id IS NOT NULL` still admits a studio-less studio invoice, which would then number off `invoice_counters` under `uniq_invoices_designer_number_studioless`. Require `(project_id IS NOT NULL) OR (client_id IS NOT NULL AND studio_id IS NOT NULL)`.
6. **`client_id … ON DELETE SET NULL` (00178:33) vs the new CHECK**: a hard delete of a client profile that owns studio invoices now fails at the FK action. Current purge (00538/00539) anonymizes rather than deletes, so it's latent; document it.
7. **Roster ownership**: `designer_clients` is per-designer (00014:72-99), not per-studio. The RPC needs to decide whose roster: pass/derive `designer_id` = the studio member whose roster holds the client, and stamp that as `invoices.designer_id` (RLS and `is_studio_comember` hang off it).
8. **Line-kind lock**: the new RPC must reject `milestone`, `time`, `ffe` kinds; `guard_time_entry_invoice_authority` (00412:2643) and the latch trigger would otherwise raise later with opaque errors.
9. **Client front door**: `resolveHouseForInstrument` returns null for studio invoices, so `?invoice=` lands on the last-moved house, not the adopted one, and `useProjectInvoices` there won't contain it — the named letter is silently missing. The "lowest project id" rule must be applied in `page.tsx` for studio invoices, and the letterbox must receive project + studio invoices.
10. **Desk need**: overdue studio invoices never produce a Desk need (`desk-receivables.ts` keyed by project). Decide whether that's acceptable for v1.

## Wave-ordered change list

**Wave 1 — DB + edge (one migration; the agent wrote `00566_studio_invoices.sql` — MEMORY.md now says mint from 00570; re-check the tip)**
1. `ALTER TABLE invoices ALTER project_id DROP NOT NULL; ADD title text; ADD CONSTRAINT chk_invoices_anchor CHECK (project_id IS NOT NULL OR (client_id IS NOT NULL AND studio_id IS NOT NULL))`.
2. `CREATE OR REPLACE FUNCTION public.set_invoice_studio_id()` — copy 00511:2616 body, add `IF NEW.project_id IS NULL THEN <studio branch> END IF` before the project lookups in both INSERT and UPDATE paths; keep immutability checks.
3. `public.create_draft_studio_invoice(p_client_id, p_studio_id, p_tax_rate, p_payment_terms_days, p_memo, p_title, p_lines)` — SECURITY DEFINER, `search_path = pg_catalog, public, pg_temp`, validate `is_active_studio_member(p_studio_id)`, resolve `designer_id` via `designer_clients`, reject non-adhoc kinds, reuse the payload checks from 00511:3482-3560; grant to `authenticated`; add it to the SD roster check the way 00511:7189 does.
4. `apply_invoice_payment_effects` (00277:128): `LEFT JOIN projects`, `COALESCE(pr.name, i.title, '')`.
5. Three client policies on `invoices` / `invoice_line_items` / `invoice_payments`: `client_id = auth.uid() AND status <> 'draft'` (via `EXISTS invoices i` for the child tables).
6. Optionally add `p_studio_id` to `resolve_studio_identity` (00320) — or have edge functions read `organizations` by `invoice.studio_id`.
7. Edge: `invoice-send`, `invoice-reminders`, `create-checkout-session`, `stripe-webhook`, `invoice-check-intent` — type `project_id: string | null`, select `title`, `projectName` fallback, identity by `studio_id`, success/cancel URL via `clientProjectLink(CLIENT_PORTAL_URL, invoice.project_id, 'letterbox', {invoice, checkout, session_id})`.
8. Tests: re-hash `public_sd_hardening_contract_test.sql`, new `supabase/tests/billing/studio_invoice_test.sql`, `stripe-rail.test.ts` null-project case. Regenerate `database.types.ts`.

**Wave 2 — designer portal + hooks**
9. `use-invoices.ts`: `Invoice.project_id: string | null`, `title`, `useCreateDraftStudioInvoice`.
10. `invoice-composer.tsx` + `invoice-overlays.ts`: studio mode behind `useFeatureFlag('studio-invoice')`, `ClientPicker`, title field; `onDrafted` with null project.
11. `invoice-folio.tsx`, `accounts-ledger-page.tsx`, `accounts-receivables-page.tsx`, `desk-receivables.ts`: null-safe per §4. Update the four designer test files.

**Wave 3 — client page + iOS**
12. `packages/supabase` `useClientInvoices()`; `threshold.tsx` merges it into `invoices`/`houseIds` when this house is the adopted one (reuse the `road-orders.ts` lowest-id rule); `app/page.tsx` + `active-project.ts` resolve studio invoices to the adopted house; letterbox-only front door for zero-house clients that mounts `Letterbox` (so `useCheckoutReturn` runs); print page title fallback. Update the six client test files.
13. iOS: add `title` to `RemoteInvoice`/`listSelect`; `BudgetViewModel` studio section; `InvoiceDetailView:117` fallback; update the two test files.

## Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Trigger rewrite (B1) loosens the 00511 authority model | Studio branch only when `project_id IS NULL`; keep every project-path check byte-identical; contract test re-hash + `invoice_checkout_integrity_test:326` contractor rejection kept green |
| 2 | Stripe webhook fails on studio invoice payments (B1 on UPDATE) | Wave 1 must ship the trigger and `apply_invoice_payment_effects` together; add a `settle_invoice_checkout_payment` test on a null-project invoice |
| 3 | Studio revenue missing from earnings (00277 join) | LEFT JOIN + title; assert `designer_earnings` row in the new SQL test |
| 4 | Wrong studio brand on emails for multi-studio designers | Resolve identity by `invoice.studio_id` |
| 5 | Client lands on the wrong house / cannot find the named invoice | Adopted-house rule in `page.tsx`; merged invoice list in `threshold.tsx`; e2e on `/?invoice=<studio>` |
| 6 | Zero-house client hits `ProjectsEmptyState`, checkout return never consumed | Letterbox-only front door that mounts `Letterbox`/`useCheckoutReturn` |
| 7 | TS build breaks across portals when `project_id` becomes nullable | Do the type change first in Wave 2 and fix every red site listed in §4/§5 in the same PR |
| 8 | Overdue studio invoices invisible on the Desk and in iOS Budget | Explicit v1 decision; at minimum they appear in the Accounts ledger/receivables and iOS invoice list |

### Critical Files for Implementation
- `/Users/kody/Code/patina-merged/supabase/migrations/00511_public_sd_hardening.sql` (set_invoice_studio_id 2616-3040, create_draft_invoice 3344, trigger 3076, roster 7189)
- `/Users/kody/Code/patina-merged/supabase/migrations/00277_refund_reconciliation.sql` (apply_invoice_payment_effects 128-270)
- `/Users/kody/Code/patina-merged/supabase/tests/edge_api/public_sd_hardening_contract_test.sql` (pinned hashes 1733, 1846)
- `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-invoices.ts` (Invoice type 196, hooks 386-475, 654-730)
- `/Users/kody/Code/patina-merged/apps/client-portal/src/lib/data/active-project.ts` (resolveHouseForInstrument 99-113) and `/Users/kody/Code/patina-merged/apps/client-portal/src/app/page.tsx`
