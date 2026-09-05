# Studio invoices — invoices with no house

**Ask (Kody, 2026-09-05):** Middle West Studio wants to generate invoices not tied to a project. Plan the designer-portal build, and present the plan as an HTML deck with mockups for feedback *before* implementing.

**Classification:** architectural (a new invoice shape at the DB layer, a new composer branch, a new client-page state). Path: research → design → proposal deck with rulings → Kody rules → wave build.

**Naming note:** Middle West Studio is Patina's own parent studio (VISION.md:25) — Leah's studio, §2's customer at §2's moment. This is the first customer asking, not an outside ticket. "Ad-hoc" is already claimed vocabulary (R74: the fourth *line kind* on a project invoice), so the feature is named **the studio invoice** — an invoice drawn for a household with no house.

---

## Context — why this is being built

A studio bills things that are not a project: a consultation, a site visit, a paid design review, a retainer to hold a slot, a reimbursable. Today every invoice in Patina is hard-bound to a project at four layers, so the only way to bill one is to open a phantom project (R79 `open_project_direct`) and invoice it — which litters the Desk, the client page, and the ledger with houses that aren't houses. That breaks the promise that "the studio won't notice Patina": the studio keeps Honeybook/QuickBooks for the rest of its billing, and The Document never becomes the whole book (R36).

**Vision test:** surface = The Document (designer portal; the client page is its homeowner face, R135). Studio moment = the bookkeeper/first hire billing without opening a project. Stream = subscription floor (The Document must carry the studio's entire billing to earn the floor). Promise = the studio won't notice Patina. Passes on all four — not a side journey.

---

## What the research established (verified in code, 2026-09-05)

**The coupling, layer by layer** (a project-less invoice is impossible today):

| Layer | Coupling | Path |
|---|---|---|
| Schema | `invoices.project_id UUID NOT NULL … ON DELETE CASCADE` | `supabase/migrations/00178_invoices_v1.sql:31` |
| Create RPC | `create_draft_invoice(p_project_id, …)` re-validates the (designer, client, studio, status='active') tuple through the project | `00511_public_sd_hardening.sql:3344-3417` |
| Studio trigger (**the real gate**) | `set_invoice_studio_id()` RAISES on any NULL-project row, INSERT and UPDATE, before its service_role early-return — issue, pay, void, chase, webhook settle all fail | head `00511:2616-3040`, trigger `:3076-3088`, hash pinned `supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1733` |
| Money trigger | `apply_invoice_payment_effects` INNER JOINs `projects` to write `designer_earnings` → a project-less invoice would **silently record no earnings** | head `00277_refund_reconciliation.sql:128-268`, join at `:203` |
| Client RLS | all three client-read policies (invoices / line items / payments) reach the homeowner only through `projects.client_id` | `00178:257-354` |
| Checkout | success/cancel URL hard-coded to `/projects/${invoice.project_id}?invoice=…#letterbox` | `supabase/functions/create-checkout-session/index.ts:292-293` |
| Hook | `CreateDraftInvoiceInput.projectId: string` + "canonical billing tuple" guard | `packages/supabase/src/hooks/use-invoices.ts:260, 711-718` |
| Composer | nothing renders below the project `<select>` until a project is chosen | `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx:320-343` |
| Desk | `buildDeskReceivables` keys its map on `project_id` | `apps/designer-portal/src/lib/document/desk-receivables.ts:69` |
| Client page | one page keyed on `projectId`; no house → `ProjectsEmptyState` | `apps/client-portal/src/components/threshold/threshold.tsx:266`, `src/app/page.tsx:57-68` |

**What already works project-less** (reuse, don't rebuild):
- `set_invoice_studio_id` falls back to `_primary_studio_for(designer_id)` (`00318:52-55`, head `00511:2616`).
- Numbering: `studio_invoice_counters` keyed on `studio_id`; uniqueness index already has a studio-less branch (`00513:39-48`).
- `resolveStudioIdentity` accepts `{ designerId }` as well as `{ projectId }` (`supabase/functions/_shared/studio-identity.ts:33-45`).
- Email/webhook copy already falls back `invoice.project?.name ?? 'your project'`; recipient resolution prefers `invoices.client_id` then `designer_clients.client_email`.
- `create-checkout-session` payer check reads `invoices.client_id` first (`:234`); `get_invoice_payment_options` only falls to the project when `client_id` is null (`00428:743`).
- The middleware fold `/invoices/<id>` → `/?invoice=<id>#letterbox` (`apps/client-portal/src/lib/retired-routes.ts:129-138`) — the invoice email link needs no change.
- **Houseless precedent:** direct orders with no project stand on the road of the client's lowest-id house (`apps/client-portal/src/lib/threshold/road-orders.ts:18-24`) — the ruled pattern for money with no house.
- **Client identity:** `ClientPicker` (`apps/designer-portal/src/components/portal/client-picker.tsx`) picks a `profiles.id` from the `designer_clients` roster and can invite-and-create inline (`useAddClient` → `/api/clients/invite`); R73 "invite-on-send" is the one identity model. `open-project-sheet.tsx` is the structural precedent (ClientPicker + a few fields + one RPC + client-minted UUID).
- The Accounts book (`components/document/accounts/accounts-book.tsx`) is already studio-level and unscoped; its registry entry aliases `billing/money/payments/invoices`; `draw-invoice` is already an unscoped Desk/⌘K verb.
- Rulings to cite: R36 (Accounts book = the studio's money ledger), R74 (folio + composer), R73 (invite-on-send), R79 (open a project directly), R83 (inline failure bands), R96/R134 (ledgers may page), R135 (client page = The Document's homeowner face; acts never leave the page), D1/D2/D4 (strict focus, no toasts, zero shadows).

**Not entangled:** the studio's own subscription to Patina has zero schema/code today (VISION §3 floor is vision text only) — "invoice" here is unambiguously studio → homeowner.

---

## Recommended design

### Principle
A studio invoice is the **same invoice** with `project_id = NULL`, a household, and a title. Same numbering, same folio, same acts (issue & send · record payment · resend · void · print), same rail (Checkout + webhook + surcharge), same earnings. No new table, no new ledger page, no new nav entry, no new client route.

### DB (one migration; MEMORY.md 2026-09-05: 00568 landed and a peer session is minting 00569 — **mint from 00570**; `ls supabase/migrations | tail` + re-check the tip before merge)
1. `ALTER TABLE invoices ALTER COLUMN project_id DROP NOT NULL` (keep the FK; cascade is fine for project-bound rows). Add `CONSTRAINT chk_invoices_anchor CHECK (project_id IS NOT NULL OR (client_id IS NOT NULL AND studio_id IS NOT NULL))` — the studio is required so numbering always comes off `studio_invoice_counters`, never the designer-keyed studioless fallback.
2. `ADD COLUMN title text` — the "regarding" line (`Design consultation · Sept 2026`). Nullable; project invoices leave it null and keep reading the project name.
3. **The real gate: `public.set_invoice_studio_id()`** (head `00511_public_sd_hardening.sql:2616-3040`; trigger def `:3076-3088`, fires on INSERT and `UPDATE OF` nearly every column). Today it RAISES `studio_id_not_designer_studio` on any NULL-project row, on both INSERT and UPDATE, *before* the service_role early-return — so issue, record payment, void, chase, reminders, and the Stripe webhook settle would all fail. Add a `IF NEW.project_id IS NULL THEN … END IF` studio branch to both arms: validate `studio_id` is an active `design_studio`, `designer_id` is an active non-guest member, the actor is a member or service_role/postgres; keep the immutability checks on project_id/designer_id/client_id/studio_id; keep every project-path line byte-identical. Its body SHA-256 is pinned in `supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1733` (17-row manifest) — re-hash there.
4. New RPC `public.create_draft_studio_invoice(p_client_id uuid, p_studio_id uuid, p_title text, p_tax_rate numeric, p_payment_terms_days int, p_memo text, p_lines jsonb) RETURNS uuid` — SECURITY DEFINER, `search_path = pg_catalog, public, pg_temp`, `TO authenticated`, registered in the 00511 SD roster the way `:7189` does. Guards: `is_active_studio_member(p_studio_id)`; the household is on a `designer_clients` roster of an active member of that studio (the roster is per-designer, 00014:72-99 — resolve and stamp that member as `invoices.designer_id`, which is what RLS and `is_studio_comember` hang off); lines `kind='adhoc'` only (reject milestone/time/ffe explicitly — `guard_time_entry_invoice_authority` 00412:2643 and the milestone latch would otherwise raise opaquely later); reuse the payload checks from `00511:3482-3560`. Sets `project_id = NULL`, `studio_id = p_studio_id`. Do **not** overload `create_draft_invoice`.
5. **Do not touch `app_private.issue_invoice_for_actor`.** The browser issue chain is `public.issue_invoice` (00412:2694) → `_issue_invoice_pre_00412` (00397:1372) → `_issue_invoice_authorized_legacy_00397` (the 00318:99-207 body), which never reads `projects` and numbers off `v_invoice.studio_id`. `issue_invoice_for_actor` is only reached from countersign/execute flows, requires exactly one commercial anchor line, and its hash is pinned at contract test `:1846`. Once (3) lands, issue / record payment / void / chase all work unchanged.
6. `apply_invoice_payment_effects` (head `00277:128-270`; anchored grep to confirm) — `LEFT JOIN projects`; description `COALESCE(pr.name, i.title, 'Studio invoice')`; `designer_earnings.project_id` stays NULL. Without this the earnings row is silently dropped and studio revenue never reaches the Earnings page.
7. Client RLS (additive; 00178's stay): SELECT on `invoices` where `client_id = auth.uid() AND status <> 'draft'`; matching SELECT on `invoice_line_items` and `invoice_payments` via `EXISTS invoices i`.
8. Studio identity: `resolve_studio_identity(p_project_id, p_designer_id)` (00320:27) has no studio arg and falls to `_primary_studio_for(designer)` — the wrong letterhead for a two-studio designer. Add `p_studio_id` (or read `organizations` by `invoice.studio_id` in `_shared/studio-identity.ts`).
9. Latent, documented not fixed: `invoices.client_id … ON DELETE SET NULL` (00178:33) now conflicts with the CHECK on a hard profile delete; the purge path (00538/00539) anonymizes rather than deletes, so it never fires today.
10. SQL tests: new `supabase/tests/billing/studio_invoice_test.sql` — draft → issue (studio number minted) → Checkout claim → settle (earnings row present with NULL project) → refund contra → void; RLS: household reads issued only, co-member reads, stranger never confirms existence; two-studio designer numbers off the chosen studio. Keep `invoice_checkout_integrity_test.sql:326-345` (contractor rejection) and the two `studio_id_not_designer_studio` suites (`commercial/multi_studio_signature_test.sql`, `rls/00563_…test.sql`) green. Add a null-project case to `supabase/functions/_tests/stripe-rail.test.ts`.

### Edge functions (**5** importers; a `_shared` edit means redeploy every importer)
- The embed `project:projects!invoices_project_id_fkey(id, name, client_id)` is already a left embed — `project: null` is safe at runtime; the lie is the local TS type `project_id: string`. Fix the type, select `title`, and `projectName = invoice.project?.name ?? invoice.title ?? 'your studio'` in each.
- `create-checkout-session`: return URLs via the already null-tolerant `clientProjectLink(CLIENT_PORTAL_URL, invoice.project_id, 'letterbox', { invoice, checkout, session_id })` (`_shared/client-portal-links.ts:51`) → `/?invoice=<id>&checkout=…#letterbox`; Stripe product name falls back to `title`; identity by `studio_id`.
- `invoice-send`, `invoice-reminders`, `stripe-webhook`, **`invoice-check-intent`** (missed in the first pass — `:65,124,141,167,220,260`): same pattern; `notification_log.metadata.project_id` nullable.
- `_shared/studio-identity.ts:33` `resolveStudioIdentity(admin, { projectId?, designerId? })` gains `studioId`. `_shared/invoice-emails.ts` keeps `projectName: string`; callers pass the fallback.
- No new function.

### `@patina/supabase` (source-resolved, no dist rebuild)
- `use-invoices.ts`: `Invoice.project_id: string | null` (`:196-241`), add `title: string | null`; `useCreateDraftStudioInvoice()` → the new rpc (beside `useCreateDraftInvoice` `:654-730`); `useInvoices` (`:386`) is unscoped and already embeds `project(id, name)`, so studio rows reach the designer ledger for free; `useProjectInvoices` (`:457`) filters `.eq('project_id')` and never returns them. **No `useClientInvoices()` exists** — add one (unscoped, RLS-driven, key `['invoices', 'client']`) for the client page and print route. `invalidateInvoiceEffects(qc, projectId?)` (`:358`) is already null-tolerant. Regenerate `database.types.ts` (`pnpm db:generate`; `:7808/7839/7870` today say `string`).
- Do the nullable-type change and every red site in the same PR (designer + client portals; admin has no invoice queries).

### Designer portal (flag `studio-invoice`, `useFeatureFlag`, fail-closed; `NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:true` locally)
- **Composer** (`invoice-composer.tsx`): the "the document" section becomes **"for"** — the project `<select>` gains a first option *"the studio · no house"* (flag-gated). Choosing it swaps the pull-through sections for: `ClientPicker` (household; inline "Add new client" is the R73 path), **regarding** (title, required), then the existing **ad-hoc lines · tax · terms · memo · totals · Draft** — same `DocumentAction actionKey="draft-invoice"`, same R83 error band. When the designer belongs to more than one active studio (Kody does — two orgs), a **studio** line appears above the household; otherwise the single studio is silent. Pure-logic twin in `lib/document/invoice-composer.ts` (`canDraft` = household + title + ≥1 line).
- **Overlays** (`invoice-overlays.tsx:24-26, 88-92`): `InvoiceComposerContext` gains `mode?: 'studio'`; `onDrafted(invoiceId, projectId)` and the `router.push('/doc/'+projectId)` guard a null project.
- **Ledger / Receivables rows** (`accounts-ledger-page.tsx:131,145`; `accounts-receivables-page.tsx:122,127,170,215`): the house column reads `project?.name ?? title` with a small mono `studio` stamp; `onOpenDocument(null)` is already typed nullable — the doorway simply doesn't render.
- **Folio** (`invoice-folio.tsx:180-181, 208/217/245/285/308, 343, 353-359`): head reads *household · title · status*; `projectId: invoice.project_id ?? undefined` into the mutations; the `document ↗` doorway hidden when no project; acts unchanged; print unchanged.
- **Desk** (`desk-receivables.ts:69-71`, a `Map<string,…>` keyed by project — a TS error the moment the type goes nullable; `desk-derivation.ts:1318` looks needs up by `row.project_id`): skip `project_id === null` in v1 (no crash, no phantom folder). Studio-invoice dunning lives on the Receivables page (already unscoped). A Desk need line for overdue studio invoices is a ruling (S9), not built in v1.
- `account-summary.ts:12-18` sums `useInvoices()` — studio revenue counts in the front matter (desired). `money-ladder` / `use-money-ladder` are project-scoped and untouched.
- **People room** — the household profile's invoices list (if it exists) gains the studio rows for free via `client_id`.
- Analytics: no new module; `DocumentAction` keys carry `region_key='invoice-composer'` + a new `action_key='choose-studio-invoice'`.
- Tests: `lib/document/__tests__/invoice-composer.test.ts` (canDraft branches), `accounts/__tests__/invoice-folio.test.tsx` (null project head), `desk-receivables` null case, registry/hierarchy contracts unchanged.

### Client page (no flag — R135; harmless until rows exist)
- **Adopted house**: `threshold.tsx:272` merges `useClientInvoices()` studio rows into `invoices` and `houseIds` (`:283-291`) when *this* house is the adopted one — the same lowest-project-id rule `road-orders.ts:18-24` uses for houseless orders; the envelope says on its own line *"From the studio · not for a house"*. `letterbox.tsx:128-140` looks the named invoice up in the passed list, so feeding it the merged list is enough. `earlier-invoices`, `settlement`, `invoice-rollup`, `derive`, `standing` are pure over `Invoice[]` — untouched.
- **The named letter must land on the adopted house**: `lib/data/active-project.ts:99-113` `resolveHouseForInstrument` does `.in('project_id', projectIds)` and returns null for a studio invoice (and returns null whenever the client has <2 houses), so `/?invoice=<studio>` would fall to the *last-moved* house where the letter isn't. Add a studio-invoice branch in `app/page.tsx` + `active-project.ts` that resolves to the adopted house.
- **No house at all**: `app/page.tsx:23-66` → `ProjectsEmptyState` today, which mounts no `Letterbox`, so the Checkout return (`lib/threshold/checkout-return.ts:40-139`, consumed only by `letterbox.tsx`/`road-orders.tsx` under a mounted Threshold) is never read. Render a **letterbox-only Threshold** — the studio's letterhead, the letter, settle in place — when the client has ≥1 issued studio invoice. Same components, one new model branch.
- `/invoices/[id]/print` (`print/page.tsx:27` is id-keyed via `useInvoice`, RLS-driven): title in place of project name.
- Tests: `components/threshold/__tests__/{letterbox,earlier-invoices,threshold}.test.tsx`, `lib/data/__tests__/active-project.test.ts`, `app/__tests__/page.test.tsx`.
- **iOS Patina client app** (`Patina/Services/API/InvoicesAPIClient.swift:71,91`): `project_id` and `project` are **already optional** and `listInvoices()` (`:200`) is unscoped — the new RLS policy alone surfaces studio invoices with no decode risk. v1 touches only: add `title` to `listSelect` (`:183-186`); `InvoiceDetailView.swift:117` `"Your project"` → title fallback; `BudgetViewModel.swift:87-118` groups by `compactMap(\.project_id)` so studio invoices silently vanish from Budget — add a "From the studio" section or leave and note (ruling S11). Tests: `InvoicesMoneyRailTests.swift:26`, `BudgetAggregationTests.swift:109/183`. Capture app: no invoice touches.

### Ship order (after rulings, under an in-session "ship")
migration `db push` → 4 edge fns → `@patina/supabase` types regen → designer portal (`./infra/deploy-portal.sh designer`) → client portal (`deploy-portal.sh client`, remember `NEXT_PUBLIC_SUPABASE_STORAGE_KEY`) → PostHog flag `studio-invoice` verified against `/flags` with a real-browser UA before enabling (fail-closed lever `NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:false`) → walk.

---

## Rulings the deck puts to Kody (each with a recommendation; "go with your recommendations" = build as recommended)

| # | Ruling | Recommendation |
|---|---|---|
| S1 | **Shape.** First-class project-less invoice (nullable `project_id`) vs a hidden shell project per invoice vs "just use R79 open-a-project" | First-class. Shell projects pollute Desk/client page/ledger; R79 is the wrong answer for a consult that may never become a house. |
| S2 | **Name.** "Studio invoice" vs "loose invoice" vs "direct invoice" | *Studio invoice* — reads on the ledger as `Studio · Design consultation` beside `Hollis House`. "Ad-hoc" stays the line kind (R74). |
| S3 | **Where it's drawn.** Same composer with a "for: the studio" choice vs a separate "Draw a studio invoice" verb/sheet | Same composer. One verb, one sheet, one habit; no registry/⌘K/Contents/help-parity churn. |
| S4 | **Who it's for.** A household on the roster (R73 invite-on-send; account created when the letter is opened) vs an email-only recipient with a tokenized public pay page | Household + R73. One identity model; no public pay page (new attack surface, no precedent, contradicts R135). |
| S5 | **Where the client pays.** Letterbox of the adopted house + letterbox-only front door vs a new client route | Letterbox. R135 forbids new routes; houseless orders already ruled the adopted-house pattern. |
| S6 | **What lines.** Ad-hoc lines only vs also unbilled time / FF&E | Ad-hoc only. Time entries and FF&E are project-bound; pulling them cross-project invents a second pull-through. |
| S7 | **Earnings.** Studio invoices count as `design_fee` earnings in the Accounts Earnings page | Yes — R36/R37 "what you earn" is design fees regardless of house. |
| S8 | **Two-studio designers.** Silent primary studio vs an explicit studio line when the designer belongs to >1 | Explicit line when >1, silent otherwise. (Prod flow fix 00566 already needed a two-studio guard for signatures.) |
| S9 | **Desk visibility.** Receivables-page only (v1) vs a Desk need line for an overdue studio invoice | Receivables only in v1; Desk need line = Wave 4 candidate. Studio invoices have no folder to hang a need on. |
| S10 | **Flag.** `studio-invoice` on the designer side only; DB + client page unflagged | Yes. Client page is flagless by R135; DB changes are inert without rows. |
| S11 | **iOS.** Null-safety only in v1 vs full placement in the iOS Invoices list | Null-safety only; place in a later wave after the Daily Return / approvals program settles. |
| S12 | **Title required?** Required "regarding" line vs optional | Required. It is the only thing that names the letter on the ledger, in the email subject, and on the client's mat. |

---

## Deliverable 1 — the proposal deck (this session, after plan approval)

**Output:** `artifacts/studio-invoices-2026-09-05/proposal.html` (self-contained, Google Fonts only), published as a private Artifact; `README.md` beside it; the research reports saved as `discovery/01-data-model.md`, `02-designer-portal.md`, `03-client-pay-path-and-rulings.md`, `04-blast-radius.md` (the agent reports, verbatim — durable outputs, per feedback_workflow_outputs_durable_path).

**Visual language:** the same paper system as `artifacts/client-approval-experience-2026-09-03/proposal.html` (Playfair Display / Newsreader / DM Mono; `--ground #FAF7F2`, `--paper`, `--rule`, `--ink #2C2926`, `--clay #C4A57B`, `--clay-ink #7C5E30`, `--terracotta-ink #9C5340`, sage ink; zero shadows; light + dark tokens). Mockups are **working HTML panels** in the Document's own idiom (DM-mono labels 11px uppercase, `INPUT` hairline fields, `DocumentAction` primary/inked/secondary, `Stamp`), not screenshots.

**Sections:**
1. Masthead — *Studio invoices: an invoice with no house.* Standing line; meta (asked by, prepared, status: for rulings).
2. Why now — the vision test in four lines; the phantom-project workaround and what it costs.
3. What exists — the current path, a compact map of the ten couplings (table above) and the eight things that already work project-less.
4. The design in one paragraph + the principle ("the same invoice, no house").
5. **Mockups** (each a panel with a caption and the ruling it answers):
   - M1 Composer, *for: a house* (today) → *for: the studio* (proposed): household ClientPicker, regarding, ad-hoc lines, tax/terms/memo, totals, Draft. Two-studio variant inset.
   - M2 The Accounts Ledger with a studio row beside house rows (`Studio · Design consultation · INV-0031 · sent · $450.00`).
   - M3 The Invoice folio head for a studio invoice (household · title · stamp; no document doorway) with the acts row.
   - M4 The Receivables page with an overdue studio invoice and its chase action.
   - M5 The client page letterbox: adopted-house variant with the "From the studio" line; letterbox-only front door for a client with no house; the settlement act.
   - M6 The email: subject and first lines for a studio invoice (title in place of project name).
   - M7 Draft error band (R83) + the void confirmation copy.
6. Data model + rail — a short diagram: invoice → (house | household) → letterbox → Checkout → webhook → earnings; the migration list; RLS delta; the four edge functions.
7. Waves — W1 DB + edge (+ SQL tests), W2 designer portal behind the flag, W3 client page + iOS null-safety, W4 candidates (Desk need line, iOS placement, default terms, recurring retainers). Per wave: files, gates, deploy set.
8. Risk register (from the blast-radius inventory, `discovery/04-blast-radius.md`):
   1. The `set_invoice_studio_id` rewrite loosens the 00511 authority model → studio branch only when `project_id IS NULL`; project path byte-identical; contract-test re-hash; `invoice_checkout_integrity_test:326` contractor rejection stays green.
   2. Stripe webhook settle fails on a studio invoice (trigger UPDATE arm) → trigger + `apply_invoice_payment_effects` ship in the same migration; SQL test settles a null-project invoice end to end.
   3. Studio revenue missing from Earnings (00277 inner join) → LEFT JOIN + title; assert the `designer_earnings` row.
   4. Wrong studio letterhead for a two-studio designer → identity by `invoice.studio_id`, never `_primary_studio_for`.
   5. Client lands on the wrong house / named letter missing → adopted-house branch in `page.tsx` + `active-project.ts`; merged list in `threshold.tsx`; e2e on `/?invoice=<studio>`.
   6. Zero-house client hits `ProjectsEmptyState` and the Checkout return is never consumed → letterbox-only front door mounts `Letterbox`.
   7. Nullable `project_id` breaks TS across portals → type change + every red site in one PR; designer/client `type-check` are the gates (their builds don't type-check).
   8. Overdue studio invoices invisible on the Desk and in iOS Budget → explicit v1 ruling (S9, S11); they always appear in the ledger, receivables, and the iOS invoice list.
9. **Rulings S1–S12** with recommendations, as a numbered list Kody can answer inline.
10. Appendix — every file cited; open questions the code couldn't answer.

**Build dispatch (Fable orchestrates; never executes):**
- Step 0 — a **fork** subagent (inherits this session's context, so it holds all four research reports verbatim) writes them to `artifacts/studio-invoices-2026-09-05/discovery/01–04*.md` unchanged, then builds `proposal.html` + README from: this plan, those reports, the prior deck's stylesheet (`artifacts/client-approval-experience-2026-09-03/proposal.html`), `patina-brand-voice` (load it: all client-facing copy in M5/M6 is homeowner-readable), and `artifact-design`. Brief: deliver exactly the sections above; mockups as working HTML; light+dark; no shadows; cite paths; no line numbers beyond what the reports contain; final action = report the file path and KB size.
- One **Sonnet** reviewer agent (separate context) adversarially reviews the deck: every cited path exists (`ls`/grep), every ruling has a recommendation, copy passes the voice skill, mockups match the described composer fields, dark-mode tokens complete, no `project_id`-required claims contradicted by the reports. Report all findings with confidence + severity.
- Fable filters findings → writer fixes → Fable publishes via the Artifact tool (favicon 🧾, title "Studio Invoices") and hands Kody the link.
- Also write the memory file `project_studio_invoices_2026_09_05.md` + MEMORY.md pointer (deck link, rulings, waves, "nothing built").

## Deliverable 2 — the build (only after Kody rules; not this turn)

Waves as in §7 above, each in its own worktree (patina-parallel-work), Sonnet implementers + separate reviewers, gates:
- W1: `supabase db reset` clean; `supabase/tests` SQL suite (incl. the re-hashed `public_sd_hardening_contract_test.sql`) + the new studio-invoice suite green; Deno `_shared` tests + `stripe-rail.test.ts` null-project case; `deno check` on the five functions; signer-script webhook probe settles a studio invoice and produces the earnings row.
- W2: `pnpm --filter @patina/designer-portal type-check` + full designer jest on a clean checkout (lesson from Field Companion); flag off → no "the studio" option; flag on → draft → issue → send (Mailhog) → folio.
- W3: client jest; a walk as a seeded household with zero houses (letterbox-only door) and with two houses (adopted house); a Stripe test-mode card + ACH settle; iOS: build + decode a studio invoice fixture without crash.
- Ship chain under an in-session "ship"; verify with `wrangler deployments list` (bottom row) + behavior probes; grep served chunks for the new composer string.

## Verification of Deliverable 1 (this session)
- `proposal.html` opens standalone; every `<a href="#…">` in the index resolves; light and dark render; no external asset beyond Google Fonts.
- Reviewer's path check: 0 dead citations.
- Artifact published; link returned; memory written.
