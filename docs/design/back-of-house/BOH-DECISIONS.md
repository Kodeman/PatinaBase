# DECISIONS — Back of House (Fulfillment Operations)

Append-only shared memory for the Back-of-House workstream track.
Same methodology as the-document track: design authority rules (R), Claude
Code implements and logs (I), decisions (D), open questions (O) resolve in
place, Leah sessions (L). Corrections are new dated entries referencing the
old one — never edits. Authority order: **codebase → spec → prototypes →
DECISIONS.md.**

Lands at: `docs/design/back-of-house/DECISIONS.md`

---

### D1 · Track charter — 2026-07-16

Back of House is a **second workstream track**, parallel to the-document,
with its own log (this file), its own spec series
(`back-of-house-spec-v*.md`), and its own prototypes. It covers the operator
fulfillment system: intake → split → transmit → acknowledge → produce → ship
→ deliver → settle, plus the minimal ledger (per R1.3), exceptions, vendor
directory, and client-notification dispatch.

Boundaries with the-document track: the Designer Portal, the Desk, proposals,
FF&E, and anything a *designer* touches stays on the-document track. The one
shared surface is Leah's Mission Control swipe card, which this track writes
review items *into* but does not redesign. Ops concerns never enter the
Designer Portal's log; portal concerns never enter this one.

ID families restart at 1 within this track. Cross-track references are
written fully qualified ("the-document R22") to avoid collisions.

Design principles carry over where they apply: typography-first, no box
shadows on content, Strata rules not tabs, exception-first surfaces, Leah's
time budgeted in seconds. The action test (the-document R22) applies to the
queue's bands: if the only available act is waiting, the order belongs in
**Watching**, not Needs Action Now.

---

### R1 · Founding ruling — the thirteen calls — 2026-07-16

Product interview conducted 2026-07-16 against the Back-of-House PRD
(`back-of-house-prd.md`, landed alongside). Thirteen questions, multichoice
with marked recommendations; Kody's answers below with rationale in full so
they survive translation to code. These are the founding constraints of the
v1 build.

**R1.1 — Intake is greenfield (1C).** iOS checkout is not treated as live for
this build. Fulfillment defines the intake contract — the Stripe
payment-capture webhook shape and the order/order_items insert it produces —
and Phase 0 runs against **seeded orders**. When checkout ships, it binds to
this contract; fulfillment never waits on iOS.

**R1.2 — Fulfillment owns creating the minimal upstream tables (2C).** No
`vendors`, `catalog_items`, `clients`, or `designers` tables are assumed to
exist. This track creates minimal versions, each marked
`-- minimal · ownership migrates to its home system later`. Claude Code
still audits before creating (the-document I25 lesson: the table sometimes
already exists) — but the expectation is greenfield.

**R1.3 — Build the minimal double-entry ledger inside this project (3B —
against the recommendation, deliberately).** The recommendation was a stub
`ledger_events` table with the real ledger built later. Kody ruled to build
the real thing now, minimally: fixed chart of accounts, balanced journal
entries enforced at the database, append-only with reversing-entry
corrections, a fixed set of posting templates, and a daily Stripe
reconciliation view. No multi-currency, no period close, no sub-ledgers.
Rationale: the ledger is the source of truth the whole payment architecture
already names; deferring it means fulfillment ships against a stub and gets
rewired later. Cost acknowledged: **Phase 2 grows by one week (build is now
eight weeks, not seven)** and the ledger gets its own slice (S6) gating
settlement (S7).

**R1.4 — Leah's surface is a stub owned by this track's contract (4B).**
A `leah_reviews` table plus a minimal mobile-first card rendered at
`/mission-control?assignee=leah`. The stub *is* the contract; when Mission
Control proper is built, it adopts this table and route. Substitution
exceptions are the only writer in v1.

**R1.5 — Placement: `apps/admin`, new `/fulfillment` zone (5A).** No new
deployment surface; ships inside the existing admin app per the
modular-monolith rule. Claude Code audits the admin app's actual routing and
auth pattern in S0 before scaffolding.

**R1.6 — Vendor protocols are operator data-entry, seeded ×6 (6C).** Three
transmission types in code — **email · portal · CSV** — everything else
(contacts, SLAs, lead times, freight arrangement, payment terms, change
window, blind-ship, claims windows) is profile fields the operator fills in
the UI. Six placeholder vendor profiles are seeded for testing; Kody
replaces them with real protocol sheets on day one. Code never blocks on
vendor facts.

**R1.7 — The Workbench carries an unmapped-item state (7B).** Catalog→vendor
mapping is not trusted to be complete. An order line with no vendor mapping
renders in an explicit **Unmapped** state with manual vendor assignment (and
cost entry) required before the split can confirm. This state is the
permanent safety net, not a migration shim.

**R1.8 — Transactional email is Resend, sending as `orders@patina.cloud`
(8A).** Vendor replies go to a human-read inbox in v1; inbound parsing is
the v1.1 rung. Domain verification is a manual step (O3).

**R1.9 — Client notifications: email + push through existing infrastructure
(9C).** A notification **dispatcher** abstracts channels: Resend email
adapter plus a push adapter targeting the existing APNs path. Claude Code
audits whether a callable push-send path exists (O1); until it does, the
push adapter degrades to a logged skip and email carries alone. The
derived-status API contract ships regardless, so the iOS tracking screen
binds whenever ready.

**R1.10 — PO PDFs render with react-pdf (10A).** Pure JS, fits the
prebuilt-image deploy flow, no headless browser in the container. The PO is
a typographic document well within its range. PDFs archive to R2.

**R1.11 — Timeline: run the full phase plan (11B).** First real order is a
month-plus out. Phases run as specified (now eight weeks per R1.3), with
slice ordering inside phases still chosen so the system is usable mid-build.

**R1.12 — The three numbers are config-table defaults, tunable in the UI
(12★).** Per-vendor commission seeded at **16%**; settlement variance
tolerance **greater of $25 or 2%** of PO value; Workbench margin-floor
warning at **< 25%** projected margin. A `fulfillment_config` table, not
constants.

**R1.13 — Governance: this track, this log (13B).** Document-workstream
style: rulings → spec → slices with acceptance criteria. Back of House gets
its own DECISIONS.md (this file) rather than a one-shot handoff doc (rots)
or a section in the-document's log (pollutes it with ops concerns).

Artifacts paired with this ruling (land together, per Mode F):
`back-of-house-prd.md` · `back-of-house-presentation.html` ·
`back-of-house-spec-v1.md` · `back-of-house-v1-package.md`.

---

### O1 · Does a callable APNs push-send path exist? — 2026-07-16

Opened by R1.9. Claude Code resolves during the S0 audit: locate any
existing push infrastructure (service, Edge Function, or iOS-side
registration) and record what it found as an I-entry. If none is callable,
the push adapter ships as a logged skip and this stays open until wired.

**Resolved in place — 2026-07-16 (see I1.3).** A callable path exists.
`apns-send` (Edge Function, hardened commit `c5cb52e7`) is invoked
server-side via `public.invoke_edge_function`, with live call sites already
in production migrations 00330, 00331, and 00334; the token store is
`device_push_tokens` (00335). The BOH push adapter wires directly to this
path. Narrow tail left open: with `APNS_AUTH_KEY` / `APNS_KEY_ID` /
`APNS_TEAM_ID` / `APNS_TOPIC` unset, the function returns
`{skipped:'apns_not_configured'}` and the adapter logs a
`notification.push_skipped` event rather than failing — so BOH ships
end-to-end today, and closes hard the moment Kody provisions the APNs
secrets (the same provisioning gap the-document's arrival-arc track is
separately owed — one secret, two consumers). Code path: done. Secrets:
Kody's.

---

### O2 · Counsel items touching this build — 2026-07-16

Marketplace-facilitator sales tax (multi-state, Patina as merchant of
record) and money-transmission posture on Rail A remain open with counsel —
pre-existing items, not created by this track. The build's posture: collect
per-order tax data cleanly and tag Pledge postings without legally
characterizing them, so counsel's determinations change labels, not data.
Resolves when counsel signs off.

---

### O3 · Resend domain verification for patina.cloud — 2026-07-16

Manual step, Kody: add Resend's DNS records for `orders@patina.cloud`
(SPF/DKIM) before S3 can send real PO email. Until verified, S3 tests
against Resend's sandbox. Resolve in place with the date verified.

**Note — 2026-07-16 (see I1.4).** Narrower than it looked: the
`patina.cloud` domain is already Resend-verified (it carries the branded
email system, 2026-07-13). No DNS work remains — sending as
`orders@patina.cloud` is a `from:` override through `_shared/send-email.ts`,
not a new domain. Near-resolved; stays open only until the first real PO
send in S3 proves the override live, at which point close with the date.

---

### I1 · S0 audit — the Part B pre-scaffolding verifications — 2026-07-16

The five audit-first verifications the package requires before S0
scaffolding (`back-of-house-v1-package.md` Part B), run fresh against the
live codebase and logged here before any BOH migration or code lands.

1. **Placement.** The admin app is `apps/admin-portal` (the package's
   `apps/admin` shorthand does not exist as a directory name) — App Router
   route group `(dashboard)`, zones defined as config in
   `src/config/navigation.ts` (`ZoneConfig[]`, keys `overview · people ·
   content · operations · system`), `typedRoutes: true` in
   `next.config.js`, TypeScript checked at build (`ignoreBuildErrors`
   unset — no working ESLint config here, consistent with the repo-wide
   convention that only designer-portal has one), `jest.config.js` +
   `playwright.config.ts` both present. Workspace package scope is
   `@patina/*` (confirmed via `packages/supabase/package.json`), so the
   package's `@strata/fulfillment` lands as `packages/fulfillment` =
   `@patina/fulfillment`. Mission Control exists today and
   `/mission-control?assignee=leah` already renders a real
   `LeahReviewDeck` component — the package's §9.4 "stub card" is
   superseded: BOH substitution-exception reviews integrate as a second
   card source over `leah_reviews`, and the table stays the contract per
   R1.4.
2. **Tables (the-document I25 lesson applied).** `vendors` exists since
   `00001_initial_schema.sql` (`CREATE TABLE vendors`, public schema,
   already FK'd from `products.vendor_id`) — REUSED, zero DDL; all BOH
   protocol facts land in a new `vendor_profiles` 1:1, per R2.2.
   `catalog_items`, `clients`, and `designers` do not exist anywhere in
   `supabase/migrations/` — confirmed greenfield, per R1.2.
   `orders`/`order_items`/`shipments` exist only inside the isolated
   `svc_orders` Prisma schema (`00052_svc_orders_schema.sql`,
   `CREATE SCHEMA IF NOT EXISTS svc_orders`) — no collision with public
   BOH names. `profiles` exists (`00013_profiles_table.sql`, not 00001 —
   worth the correction for anyone chasing the FK later). Conceptual
   neighbors on the record: `direct_orders`
   (`00276_direct_orders.sql`, `public.direct_orders`), `concierge_orders`
   (table `public.concierge_orders`, landed in
   `00308_transaction_tracker.sql` — file slug and table name diverge,
   noting it so the number is trusted over the filename), and
   `purchase_orders` (`00148_procurement_workspace_v1.sql`, designer
   procurement — NOT reused for BOH POs). Remaining spec names are
   greenfield. Resolutions per R2.1/R2.2.
3. **Push path (resolves O1).** `apns-send` exists and is hardened
   (commit `c5cb52e7`), callable server-side via
   `public.invoke_edge_function` (defined in
   `00258_edge_settings_vault.sql`) with live call sites in `00330`
   (`accept_design_request.sql`), `00331` (`ceremony_complete.sql`), and
   `00334` (`refresh_offered_slots.sql`); the device-token store is
   `device_push_tokens` (`00335`). With `APNS_AUTH_KEY` / `APNS_KEY_ID` /
   `APNS_TEAM_ID` / `APNS_TOPIC` unset, the function returns
   `{skipped:'apns_not_configured'}` gracefully rather than erroring. The
   BOH push adapter wires to this same path and writes
   `notification.push_skipped` events until Kody provisions the secrets.
4. **Resend + Stripe env (O3 narrowed).** `patina.cloud` is already
   Resend-verified — sending as `orders@patina.cloud` is a `from:`
   override through `_shared/send-email.ts`, no DNS work remains. O3
   closes with the first real send in S3. Stripe: intake rides the
   existing `stripe-webhook` credentials; nothing new to provision there.
5. **Realtime.** Enabled (`supabase/config.toml [realtime] enabled =
   true`); portals already subscribe via `postgres_changes`.
   `fulfillment_events` does not exist yet in any publication (confirmed
   greenfield) and will be added to `supabase_realtime` in migration.

Two further findings surfaced mid-audit, logged here rather than opening
new O-entries since both are resolved facts, not open questions:

6. **Stripe intake seam.** `stripe-webhook/index.ts` already handles
   `payment_intent.succeeded` in its money-path switch and fans out via
   `stripe-webhook/reconcile-emit.ts` (`enqueueStripeEventTask`) onto the
   `public.agent_tasks` queue (00297, `_shared/agent-queue.ts`),
   identifiers-only payloads. BOH intake is an additive enqueue branch on
   `metadata.patina_order = 'boh_v1'` minting a first-class
   `fulfillment_intake` task, consumed by a new `fulfillment-intake` edge
   function whose core the package's §12 seed script drives directly —
   same code path, no side doors.
7. **PO PDFs.** react-pdf (R1.10) is proven in Deno edge functions in
   production today: `npm:@react-pdf/renderer@4.3.0` is imported directly
   in `supabase/functions/_shared/po-pdf.ts`, alongside `spec-pdf.ts`; the
   spike record is `docs/_archive/handoffs/procurement-wave4-pdf-spike.md`.
   The portal Node route path stays WASM-risky under OpenNext/workerd, so
   BOH renders PDFs in edge functions, matching the existing pattern.
   Brand fonts under Deno are untested for this specific font set — S3
   opens with a font-embedding spike; the pre-blessed fallback is base-14
   Helvetica.

8. **Migration numbering.** Verified fresh, not assumed: current head is
   **00339** (`00339_room_scan_documents_view.sql`); `ls
   supabase/migrations/*.sql | sort | tail -5` confirms 00335–00339 as the
   trailing five. room-view's 00337–00339 (room-scan geometry, ingest
   crons, documents view) **are merged to `origin/main`** as of this audit
   — `git merge-base --is-ancestor room-view/integration origin/main`
   returns `MERGED`, and this worktree's `origin/main` checkout
   (`76da8ef8`) already carries all three files. BOH reserves block
   **00350–00369** (S0: 00350–00354 · S3: 00358–00359 · S6: 00360–00363),
   single migration writer per wave, renumber ritual against the live
   main tip at every main merge (patina-parallel-work).
9. **No CI.** Confirmed no workflow runs tests/types/lint on push or PR in
   this repo (per CLAUDE.md, and no `test:boh-audit` script exists yet in
   the root `package.json`). The package's §5.1 "CI runs the
   zero-invisibility audit" is substituted with `.assert.sql` checks under
   `supabase/functions/_tests/` (existing convention there —
   `apns-send.test.ts`, `catalog-normalizer.test.ts`, etc. — BOH follows
   the same shape) plus a root `pnpm test:boh-audit` script, run as a
   seed-gated local gate in every slice's verification.
10. **Feel artifacts and log provenance.** `back-of-house-prd.md` does not
    exist anywhere in the repo (confirmed by a repo-wide `find`, not just
    a `docs/` scope) despite D1 and R1's text naming it as "landed
    alongside" — `docs/prds/back-of-house-presentation.html` is the sole
    feel authority on disk. The on-disk log filename is `BOH-DECISIONS.md`
    (spec/package text says `DECISIONS.md`) — kept as-is, this file is the
    only copy. One more provenance note for the record: at the start of
    this audit, this file plus its sibling `back-of-house-spec-v1.md` and
    `back-of-house-v1-package.md` existed only as **untracked** files in
    the main checkout's working tree — not committed to `origin/main` or
    any branch (`git show main:docs/design/back-of-house/BOH-DECISIONS.md`
    fails; no `boh/*` branch existed on `origin` before this session's
    `boh/i1-audit`). Part A's framing ("lands whole... nothing to append")
    assumed a landed base; this worktree's first commit on this file
    necessarily introduces the whole file to git history, base content
    included, not just this append.

---

### R2 · Session rulings — reconciliation calls (four) — 2026-07-16

Product decisions made by Kody against the S0 audit findings (I1),
in-session:

1. **R1.2 override — reuse + snapshot.** No new `clients` / `designers` /
   `catalog_items` tables. `fulfillment_orders` carries client/designer
   snapshots plus nullable FKs (`client_profile_id → profiles`,
   `designer_client_id → designer_clients`, `designer_profile_id →
   profiles`); `public.products` IS the catalog (mapped = `vendor_id` +
   `price_trade` present, both live columns per I1.2/I1.6); intake
   snapshots name/sku/cost onto order lines so later product edits never
   move an order.
2. **Naming.** Lifecycle tables take a `fulfillment_` prefix
   (`fulfillment_orders`, `_order_items`, `_vendor_pos`,
   `_vendor_po_lines`, `_shipments`, `_exceptions`,
   `_client_notifications`, `_config`, `_events`); bare names kept for
   `vendor_profiles`, `leah_reviews` (the R1.4 cross-track contract), and
   `ledger_accounts` / `ledger_entries` / `ledger_lines`. Rationale: three
   order-ish tables already exist (`svc_orders.orders`, `direct_orders`
   00276, `concierge_orders` 00308) plus `purchase_orders` (00148,
   designer procurement — NOT reused for BOH POs); a bare `orders` or
   `vendor_pos` would collide in meaning even where it wouldn't collide in
   SQL.
3. **Reconciliation.** Real Stripe balance-transaction API pull in v1
   (against the recommendation, deliberately — same pattern as R1.3): S6
   builds a daily balance-transactions sync (edge function + pg_cron +
   append-only mirror table); the daily view reconciles ledger account
   1000 against actual balance transactions, not webhook payloads. Deltas
   surface in Needs Action Now.
4. **Program authorization.** Full program authorized — all 8 delivery
   waves. Kody reviews at checkpoints C0–C4; phase merges to `main` wait
   on drop feedback.

---

### I2 · S0 shipped — schema, intake, seeds, telemetry — 2026-07-16

S0 (Phase 0 Foundation, `back-of-house-v1-package.md` Part B) is built and pushed on branch `boh/s0-foundation`, **11 commits** off `origin/boh/integration`, gated by a clean full `supabase db reset` replay (00001→00354 + all seeds, no errors) plus regenerated `database.types.ts` and `seed/00-legacy-grants.sql`. Everything the package's S0 slice asked for is present; the deviations below are logged, not silent.

**Migrations 00350–00354** (block reserved in I1.8; head was 00339, no collision):

1. **00350 · fulfillment core** (`0e3a415f`) — the eight lifecycle tables (`vendor_profiles` 1:1 on the reused `public.vendors`; `fulfillment_orders` with `order_no` identity + client/designer snapshots + nullable FKs and **no status column**, status is derived per §2; `fulfillment_order_items` carrying the line state machine and `mapping_state`; `fulfillment_vendor_pos`/`_vendor_po_lines`/`_shipments`/`_exceptions`; `leah_reviews`, the R1.4 cross-track contract, bare-named). The line/PO state machines are enforced by triggers that mirror `@patina/fulfillment/state-machine.ts` (one step forward; `cancelled` only from pre-`shipped`). `fulfillment_writer_guard()` is defined here and attached to every table: a write raises unless `app.fulfillment_writer` is `'rpc'` (set by the RPCs) or `'migration'` (seeds) — §11's "nothing mutates outside the helper" as a DB-level review gate. RLS is the 00335 idiom: admin-domain SELECT + `agent_reader` read-only, **zero** write policies/grants for `authenticated`.
2. **00351 · events + config + notes** (`b3511366`) — `fulfillment_events`, the append-only Run Log (UPDATE/DELETE raise unconditionally, no GUC exemption; INSERT still guarded), added to the `supabase_realtime` publication for the S1 queue; `fulfillment_client_notifications`; `fulfillment_config` seeded with the seven R1.12/§10 defaults (commission 16%, settlement tolerance greater-of $25/2%, margin floor 25%, pledge accrual, SLA hours, inspection windows, the America/Chicago business-hours calendar); `fulfillment_business_hours_between()` (STABLE, weekend-aware — verified Fri 16:00→Mon 10:00 CT = 2.0 business hours); the 1-row PostHog mirror cursor.
3. **00352 · minimal ledger** (`5d4ad264`) — `ledger_accounts`/`ledger_entries`/`ledger_lines`, the fixed 15-account chart seeded, balance enforced at the database by a **DEFERRABLE INITIALLY DEFERRED** constraint trigger (per-entry Σdebit=Σcredit AND ≥2 lines, checked at commit), append-only on entries and lines. Only template **T1 (capture)** exists — `ledger_post` + `ledger_post_t1_capture`, EXECUTE revoked from every portal-facing role including `service_role` (the SECURITY DEFINER RPCs owned by postgres retain it). T2–T6 are deliberately absent (S6).
4. **00353 · RPC family + views** (`3853aac1`) — the SECURITY DEFINER RPC surface (each sets the writer GUC, validates, mutates, logs a `fulfillment_events` row with before/after + `duration_ms`, then locks down to `service_role`): `fulfillment_intake_order` (the only S0-exercised path), plus `assign_line_vendor`, `move_line`, `confirm_split`, `record_transmission`/`_ack`/`_shipment`/`_delivery`, `open_exception`, `resolve_exception`, `settle_po`, `record_client_note`, `update_config`, `update_vendor_profile`, `rule_leah_review` — existing now so downstream slices bind to frozen signatures. Views `fulfillment_order_status_v` + `fulfillment_queue_v` (security_invoker, base-RLS-gated) and `client_order_status_v` (definer, own-row scoped — see amendments).
5. **00354 · crons** (`60cbd709`) — `fulfillment-intake-worker` (1 min) and `fulfillment-events-mirror` (5 min) via `public.invoke_edge_function`; job_runs bookkeeping lives inside the edge fns (00300 idiom).

**Package** `@patina/fulfillment` (`e4ffca57`) — src-direct like `@patina/agent-queue`, shipping `types.ts` (the union/DTO vocabulary) and `state-machine.ts` (`LINE_CHAIN`/`PO_CHAIN` + `canLineTransition`/`canPoTransition`), with a vitest spec that asserts the maps against the 9-state line chain (5/5 green).

**Edge functions + webhook** (`72de088a`, additive-only) — `fulfillment-intake` with the two-entry core (worker path claims `fulfillment_intake` tasks and re-fetches the PI fresh; seed path accepts an inline `seed_pi`, same normalize→RPC, no side door), `fulfillment-events-mirror` (PostHog mirror + cursor), and one additive branch in `stripe-webhook/index.ts` on `metadata.patina_order='boh_v1'` minting a `fulfillment_intake` task (idempotency-key = PI id, identifiers-only payload, log-and-swallow after the money path). Verified: `handlePaymentIntentSettled` no-ops for a BOH PI (no matching payable, `if (!row) return`), so the switch is a safe pass-through; 19 new Deno tests + a 91/91 regression sweep held.

**Seeds** (`64ce7883`, `e3683083`, `ddce1947`) — six `vendor_profiles` over existing seeded vendor UUIDs covering email/portal/csv × prepay/fifty-fifty/net-30; catalog mapping onto `public.products` (mapped = `vendor_id` + `price_trade`, per R2.1) with exactly two deliberately-unmapped products; `scripts/seed-fulfillment-orders.ts` posting five fabricated captures **through the intake fn** (one 5-line/5-vendor order, one single-line, three mixed hitting the unmapped items — §12, no side doors); the seven-assertion `fulfillment_foundation.assert.sql`; `seed:fulfillment` + `test:boh-audit` scripts.

**The package's S0 accepts-when, restated as verified fact:** the full reset replays clean; five seeded orders are visible by SQL with correct line states; each carries exactly one balanced T1 capture entry; exactly two order items land `mapping_state='unmapped'`; every seed mutation appears in `fulfillment_events` (order.intake + ledger.posted per order); an unbalanced ledger entry is rejected by the database at commit (the ≥2-lines / Σdebit=Σcredit trigger fires); an UPDATE on `fulfillment_events` is denied (append-only); and re-delivering the same PI writes nothing (intake is idempotent on `stripe_payment_intent_id`). `generate-legacy-grants.py` was re-run after the GRANT/REVOKE migrations and `db:generate` regenerated the types (additive-only, +1120 lines, zero drift on existing definitions — the pre-existing 11-error `@patina/supabase` standalone `tsc` failure is base-branch module-resolution noise, unchanged by this work).

**Two implementation bugs found and fixed — the class of thing this log exists to remember:**

- **D11 · the writer guard had a NULL hole.** `current_setting('app.fulfillment_writer', true)` returns NULL when the GUC is unset, and `NULL NOT IN ('rpc','migration')` evaluates to NULL, which a bare `IF … THEN RAISE` treats as false — so a guardless raw write was silently *allowed* on first probe. Fixed in 00350 with `COALESCE(current_setting(…), '')` so the unset case is a real deny. The guard read correctly and did the opposite of its intent; only probing the actual raw INSERT surfaced it.
- **D12 · zero-amount ledger lines violated the XOR check.** A T1 capture with `freight_charged_cents=0` (or `tax_cents=0`) built a `4100`/`2100` line with `0/0`, tripping `ledger_lines`'s `(debit>0) <> (credit>0)` constraint and aborting intake. Fixed in `ledger_post` (00352) to skip any all-zero line — the entry stays balanced (Dr 1000 equals the remaining nonzero credits) and keeps ≥2 lines. Surfaced only when the first intake ran a real capture through the T1 template.

**Review amendments applied (R2-session, folded before build):** `ledger_accounts` is writer-guarded like every other fulfillment/ledger table (a raw edit to an account code fails as a side door; the chart seed uses the `'migration'` escape); `client_order_status_v` is a **definer** view owned by postgres, own-row `auth.uid()`-scoped, client-safe columns only (no vendor/PO/cost), carrying a COMMENT that warns against "fixing" it to security_invoker (which would zero out client reads); `notification.drafted` was added to the event grammar and `fulfillment_record_client_note` made dual-phase (draft → `notification.drafted`, send-stamp → `notification.sent`/`notification.push_skipped`); and `fulfillment_resolve_exception`'s preview branch carries the literal `-- S7 MUST replace this placeholder; acceptance test compares preview lines to posted lines`.

**Deferred, by design — the fences for later slices:** `fulfillment_settle_po` is a stub raising `not_implemented_until_S6`; `fulfillment_resolve_exception`'s preview returns `{lines:[], note:'ledger_consequence_deferred_to_S7'}` (S7 must replace it — its acceptance test compares preview to posted); T2–T6 posting templates are unbuilt (S6); and there is **no DB CHECK asserting `captured_total = product_subtotal + freight + tax`** — the identity is enforced transitively, because an out-of-balance capture makes the T1 entry fail the ledger balance trigger and aborts intake, but S6 may want to harden it into an explicit order-level constraint or a validation raise inside `fulfillment_intake_order`.

**Two-phase local seed (by design, §12).** `supabase db reset` loads only reference data (the six vendor profiles + catalog mapping); the five orders do **not** appear from a bare reset — they require `supabase functions serve` running and then `pnpm seed:fulfillment`, which posts the fabricated captures through the live `fulfillment-intake` seed path. This is deliberate: seeds flow through the intake contract, there is no direct-SQL order insert to drift from production intake.

---

### I3 · S1 shipped — the Fulfillment Queue — 2026-07-16

S1 is built and pushed on branch `boh/s1-queue`, **7 commits** off `origin/boh/integration`: the Queue screen (three Strata-section bands, per-PO stage dots, clay next-action verbs, `n`-key note-drawer stub) · data layer (`fulfillment_queue_v` DTO-passthrough route + hooks) · keyboard (`use-queue-keyboard`, a deliberate clone of `use-inbox-keyboard`, not a generalization) · realtime (400ms-debounced `fulfillment_events` subscription) · zone registration + `/fulfillment/{shipments,exceptions,vendors,config,orders/[orderId]}` placeholder stubs · fixtures + the zero-invisibility audit · the e2e spec. Gated by a fresh `db reset` + `pnpm test:boh-audit` (the S0 foundation assert A1–A7 and the new zero-invisibility audit Q1–Q7, all PASS, plus 11 Deno tests), a clean admin-portal build (typedRoutes), and a 3/3 Playwright pass.

**00353 amended in place** (S0's cut, unshipped). The original band CASE had no path for bare `intake`/`split` (fell to `quiet`) and no SLA-breach signal — structurally could never surface a stale order. Restructured `fulfillment_order_status_v` via CTEs (same output contract, additive columns only) and extended `fulfillment_queue_v` with `breached`, `stage_age_business_hours`, `next_action_kind`/`params`, `po_stages`, and a corrected band CASE. **Band model — flagged for design authority's C1 look, not spec-dictated to this precision**: `intake`/`split` unconditionally Needs Action Now (ball in the operator's court); `transmitted` Watching unless ack-chase-breached; `acknowledged`/`in_production`/`shipped` Watching; `delivered` Quiet (matches the S0 author's implicit intent — `delivered` was the one state already absent from the original watching list). Screenshot review noted two consequences of this model, accepted as-is for now: stage dots absent pre-split (no PO rows exist yet to dot), and Needs Action Now reads crowded since every unconfirmed order lands there regardless of breach.

**A6 re-scoped** (`fulfillment_foundation.assert.sql`, S0's): was a bare "5 orders, all intake," true only before any slice legitimately advances a seeded order — S1's fixtures do exactly that, which would permanently red it. Scoped to the `pi_boh_seed_%` PI-id prefix, preserving its actual intent without going stale.

**Fixtures — three, not the brief's literal two.** `scripts/seed-fulfillment-fixtures.sql`: (a) a stale intake order backdated past the 4-business-hour split-confirm SLA via the sanctioned `app.fulfillment_writer='migration'` side door → Needs Action Now, terracotta age; (b) an order walked `intake → split → transmitted → acknowledged → shipped` through the real RPCs → Watching (the action test, the-document R22); (c), this script's own addition, one RPC further to `delivered` → Quiet — without it the Quiet band is unreachable by any seed this slice can produce (`fulfillment_queue_v` excludes `settled`; settlement is an S6 stub), and the accepts-when's three-bands-populated screenshot had no other path.

**Accepts-when, verified fact:** the zero-invisibility audit (Q1–Q7) passes clean against 8 orders — every non-settled order in exactly one band, all three bands populated; full keyboard traversal without the mouse (Playwright, 3/3); the stale fixture is Needs Action Now with `breached=true`; the in-transit fixture is Watching; realtime refresh was demonstrated live — a `fulfillment_assign_line_vendor` RPC fired via psql flipped a row's verb in the browser with zero manual reload.

Nav gated behind `NEXT_PUBLIC_ENABLE_FULFILLMENT`; every `/fulfillment/*` route stays URL-routable regardless. **Known context, not a regression:** admin-portal's full jest suite carries 232 pre-existing failures across 23 unrelated suites (catalog, media-uploader, accessibility, a timezone-dependent date test) — confirmed untouched via `git diff`; S1's own suites are green (15/15 jest, `use-queue-keyboard`; 20/20 vitest, `next-action`).

---

### I4 · S2 shipped — the Order Workbench (→ screenshot drop 1) — 2026-07-17

S2 is built and pushed on branch `boh/s2-workbench` off `origin/boh/integration`:
the real Order Workbench replaces S1's placeholder at
`/fulfillment/orders/[orderId]` — a three-track grid (client order 5fr · a literal
1px hairline column · vendor POs 7fr) with the ①…ⓝ mono thread on both sides, a
live money strip, drag-to-regroup, and the unmapped→confirm gate. Gated by a
clean admin-portal build (typedRoutes), 53 `@patina/fulfillment` vitest, 3/3
Workbench Playwright, 3/3 S1-queue Playwright (unchanged), the W1–W3 post-confirm
assertions, and a full `pnpm test:boh-audit` green on a clean reseed (A1–A7,
Q1–Q7, 11 Deno).

**No 00353 amendment — composed, not migrated.** The detail DTO
(`GET /api/admin/fulfillment/orders/[orderId]`) is composed in the route from base
tables (order + items + PO drafts + `vendor_profiles⋈vendors` + the three config
numbers), one round trip. The three mutations bind the S0 RPCs verbatim:
`fulfillment_assign_line_vendor`, `fulfillment_move_line`,
`fulfillment_confirm_split`. The escape hatch went unused: nothing was genuinely
blocked (patina-parallel-work — prefer composing over SQL changes).

**Money model (`@patina/fulfillment/money.ts`) — flagged for the C1 look.**
`projectedCommission = (product subtotal + freight) − vendor cost − freight est`
= Patina's *realized* retail−trade spread, matching the presentation §07
arithmetic; Pledge accrual = 25% of it (§8 T3); margin = commission/revenue,
terracotta below the 25% config floor. Deliberate calls, each documented in the
function header and drop-1's `index.md` KNOWN DEVIATIONS:
- The config's per-vendor `commission_rate_default` (16%) is a *settlement* input
  (S6) and a vendor fallback — **not** the Workbench projection basis (which uses
  real costs). Threaded through the DTO for completeness; C1 rules.
- v1 freight est = `freight_charged` (no independent source until S5), so freight
  nets to zero in the margin.
- **The seeded 5-vendor order renders terracotta at the default floor.** Every
  seeded mapped product is priced at exactly 80% trade (uniform 20% spread) →
  order 1's blended margin is ~19.75%, *below* the 25% floor. The signature order
  legitimately trips the warning (the strip doing its job); the presentation's
  healthy numbers were illustrative. **C1 owed:** revisit seed trade spreads or the
  floor default.
- Unmapped lines read optimistically (0 cost until priced) so margin reads high
  until assignment, then drops — intentional ("mis-mapped cost caught before the
  PO goes out").

**Drag semantics (deviation from the literal brief, logged).** The brief said
`onDragEnd → fulfillment_move_line`. But pre-confirm no `vendor_po_lines` rows
exist for `move_line` to repoint, so a **pre-confirm** drop between proposed
groups persists via `fulfillment_assign_line_vendor` (reassign the line's vendor);
`move_line` drives the **post-confirm** reshuffle (the shot-04 cards are
draggable). The pure `resolveDragOutcome` (drag.ts, 9 vitest) decides
move/assign/popover/noop; the component just dispatches. dnd-kit + Playwright:
native `dragTo` does not fire the PointerSensor — the e2e drives synthetic
`page.mouse` motion past the 8px activation constraint (the repo's boards-QA
precedent).

**Two e2e false-positives found and fixed — the class of thing this log
remembers.** Optimistic mutations (`setQueryData` in `onMutate`) render the moved/
assigned state *before* the POST resolves; asserting immediately and then letting
the next test navigate **aborted the in-flight request** — the assign/move never
reached the server (0 `line.moved` / `line.vendor_assigned` events despite green
tests). Fixed by `Promise.all([waitForResponse(POST 200), action()])` so the test
asserts the **persisted** state. In real use the operator does not navigate
mid-request, so this is a test-timing bug, not a product bug — but it would have
shipped a test that proved nothing.

**S1 Enter-path.** The only S1 edit: `boh-queue.spec.ts`'s keyboard test asserted
the placeholder copy ("The Order Workbench lands in S2."); updated to assert the
real `workbench-root` renders (the Enter target is now the real screen). No S1
queue component changed.

**Anti-drift tripwire.** `format.test.ts` pins the formatters to the LIVE
`fulfillment_confirm_split` output read from the DB on the seeded 5-vendor order
(`PO-2026-00001-A…E`, side_mark `PRIYA ANAND-1`) — captured via a rolled-back
`BEGIN…confirm…ROLLBACK` so order 1 stayed pre-confirm for the screenshots.

Owed to design authority: the **C1 look** at drop-1 (`docs/design/back-of-house/
drops/drop-1/`) — chiefly the money model + the terracotta-at-default-floor seed
mismatch. Deferred by design: post-confirm cards beyond `draft` are read-only;
move-line reshuffle is drop-1-adjacent, not required by the four PNGs.

---

### R3 · C1 rulings — Drop 1 review, six calls — 2026-07-17

Product interview conducted against Drop 1 (Queue + Workbench on the seeded state, `drops/drop-1/`). Kody's answers with rationale:

1. **R3.1 — Commission is Patina's target margin.** The per-vendor 16% (R1.12) is a quoting/settlement benchmark, not a separate money flow. The strip's "projected commission" = realized retail−trade spread, exactly as S2 built it; T3's "realized commission" at settlement = the actual spread; the Pledge accrues at 25% of that. No designer-payable or vendor-receivable leg exists on Rail A v1.
2. **R3.2 — Seeds re-priced to realistic economics.** Varied trade ratios (~25–45% spreads) replace the uniform 80%-trade placeholder pricing; exactly one deliberately thin order stays below the floor as the warning's truthful demo. The 25% margin floor (R1.12) is untouched — the data was wrong, not the ruling.
3. **R3.3 — Band model ratified as landed (I3).** `intake`/`split` sit unconditionally in Needs Action Now — the operator is the one being waited on, so the band IS the worklist, sorted breach-first. Watching stays pure: only orders where someone else moves next.
4. **R3.4 — Stage dots are ORDER lifecycle dots.** Six fixed dots per row (split · transmitted · acknowledged · in production · shipped · delivered), present from intake and filling with the derived min stage. Per-PO stage detail belongs to the Workbench, not the queue row.
5. **R3.5 — Side-marks are surname-only.** `{SURNAME}-{order#}` (`ANAND-1`), falling back to the full uppercased name when no surname parses — shorter carton marks, less client PII in transit.
6. **R3.6 — Breadcrumb fixed now**, in the C1 batch (deduped zone segment; `Order #{n} · {client}` replaces the raw UUID), not deferred to Phase 1.

Implementation record: I5.

---

### I5 · C1 fixes shipped — R3 rulings addressed — 2026-07-17

All four of Kody's Drop 1 review items landed on `boh/c1-fixes`, 6 commits off `origin/boh/integration`. **R3.2** re-priced the seed catalog per-product (was: uniform 80% trade/20% spread on every product, tripping the margin floor everywhere) to varied ~25–45% spreads, leaving exactly one deliberately-thin line (marble side table, ~19%, order 5's sole qty-2 line) as the floor warning's truthful demo — orders #1/#2 now read healthy, #5 terracotta. **R3.4** replaced the Queue's per-PO stage dots (nothing to dot pre-split, count varied with vendor count) with six FIXED order-lifecycle dots present on every row from intake, filling off `fulfillment_queue_v.min_stage_idx` (no view amendment needed — the ordinal was already exposed). **R3.5** changed `side_mark` from the full uppercased client name to a surname-only mark (`ANAND-1`, falling back to the full name for single-token names); synchronized in `fulfillment_confirm_split` (00353, in-place amendment — unshipped, sanctioned) and `@patina/fulfillment/format.ts`; the anti-drift golden was re-pinned against a live `BEGIN…confirm_split…ROLLBACK` on the reseeded order 1. **R3.6** fixed the Workbench breadcrumb: deduped the doubled FULFILLMENT segment (a zone-config artifact — the fulfillment zone's label collides with its own first URL segment — fixed generically in `useActiveZone`) and replaced the raw order UUID with `Order #{n} · {client name}` via a new page-settable `BreadcrumbProvider` context. Accepts-when: fresh `db reset` + reseed + fixtures replay clean; `test:boh-audit` fully green (A1–A7, Q1–Q7, 11 Deno); `packages/fulfillment` 54/54 vitest incl. re-pinned goldens; admin-portal build green; `boh-queue`/`boh-workbench`/`boh-drop1-screens` Playwright specs green (chromium); Drop 1's four PNGs re-captured in place, KNOWN DEVIATIONS #1 and #5 closed.

---

### I6 · S3 shipped — PO Composer & Transmission Log — 2026-07-17

S3 built and pushed on `boh/s3-transmission`, 4 commits off `origin/boh/integration` (Wave-E pair with S4). **Task-1 font spike = OUTCOME A**: base64 data-URL `Font.register` genuinely embeds `FontFile2` TrueType glyphs under Deno react-pdf (verified vs a Helvetica control) — the PO paper ships **brand fonts** (Playfair masthead + DM Mono PO number/line-table via `_shared/fulfillment-fonts.ts`, generated by `scripts/gen-fulfillment-fonts.ts`; Helvetica base-14 body to skip the 325 KB Inter). The paper (`_shared/fulfillment-po-pdf.ts`) is PATTERN-COPIED from `po-pdf.ts` (never edited): masthead, PO number, side-mark, ship-to, requested ship, blind-ship instruction, vendor change-window + claims terms, qty/cost table. `fulfillment-po/{core,index}` runs preview | send (orders@patina.cloud, dry-run local, Resend id logged) | mark_transmitted (portal/csv), each through `fulfillment_record_transmission` (append-only log); `verify_jwt=false` + in-code service_role check.

**00358 (additive — the 00350–54 pack is now on main):** corrected `fulfillment_queue_v`'s ack-chase math from `ceil()+>` (structurally could only render day 3+) to `floor()+>=`, so "Chase {surname} — day N" is reachable exactly at the 2-business-day SLA — the presentation's "Chase Vandermeer — day 3" verb, surname threaded via `next_action_params.client_surname` (blessed: matches the design mockup). Also enriched `client_order_status_v` (S4-flagged) with client-safe `eta` + per-stage timestamps for the iOS status API — no vendor/PO/cost columns cross the definer boundary. `fulfillment_record_ack` already sets `committed_ship` (the client-ETA basis) — verified, no amendment.

Composer at `/fulfillment/pos/[poId]` (po-paper preview via `<object>` blob, transmit-panel branching email/portal/csv on the vendor protocol, DM Mono append-only transmission-log with zero edit affordances, ack-capture form), reached via a "Compose" link on each real PO card. The ack route drafts the ETA-change note through **S4's `notifications/draft` route (primary)** with the `fulfillment_record_client_note` RPC as the in-tree fallback. Accepts-when verified: fresh reset+seed+fixtures; `test:boh-audit` fully green (A1–A7, Q1–Q7, **T1–T5**, 29 Deno — now globs `fulfillment-*.test.ts`, auto-including S4's notify/status once merged); `@patina/fulfillment` 65/65 vitest; admin-portal build EXIT 0; `boh-composer` Playwright 1/1. A CHASE fixture (Camille Vandermeer) demonstrates "Chase Vandermeer — day 2", weekend-aware.

---

### I7 · S4 shipped — notification dispatcher, derived-status API, vendor directory + config UI — 2026-07-17

S4 is built and pushed on branch `boh/s4-notifications`, **5 commits** off `origin/boh/integration`, developed against unit harnesses (`supabase/functions/_tests/fake-supabase.ts`, static analysis, `pnpm --filter @patina/admin-portal build`) rather than a live stack — this wave's S3 sibling owned the local Supabase stack, port 3001, and all queue-component files. **Live verification against a running stack is deferred to the combined Wave E pass**, after both slices merge.

**New `supabase/functions/_shared/fulfillment-templates.ts`** — the single source of client-note copy for the five spec §6 transitions (confirmed · in-production ETA · shipped [+ freight-inspection-guidance paragraph for ltl/white_glove] · delivered check-in · ETA change/exception), rendered inside `renderBrandedShell` (`_shared/branded-email.ts`, imported not copied). Input is `ClientSafeOrderProjection` — order number, client name, item name/qty list, ETA(s), shipping mode, a pre-approved exception note — a type with no field a vendor name, PO number, or cost figure could occupy, not merely a documented convention. `subjectForTransition`/`pushCopyForTransition` are exported separately so the send leg can re-derive identical subject/push copy from a persisted notification row (which stores only `transition` + `template_key`, not the original draft-time projection) without duplicating copy elsewhere.

**New `fulfillment-notify/{core.ts,index.ts}`** — `draft` renders + persists via `fulfillment_record_client_note`'s draft phase (00353); `send` reads back the (possibly operator-edited) body, sends email via `sendCompliantEmail` (`from: "Patina Orders <orders@patina.cloud>"`, category `operational`), stamps `edit_diff: {original, sent}` only when the text actually changed, then ALWAYS attempts a sibling push notification — its own draft+send-stamp pair through the same RPC. `apns-send`'s `apns_not_configured` skip (O1), a missing `client_profile_id`, zero registered tokens, or any dispatch-time error all become a `skipped_reason` via the RPC's send-stamp phase, never a thrown error; the email leg degrades identically (a failed send still stamps `skipped_reason` and the call still returns 200 with `email.success=false`). Dispatcher degrades per-channel, never throws — verified by dedicated tests, not just asserted in a comment.

**New `fulfillment-status/{core.ts,index.ts}`** — the derived-status API for iOS (spec §6/§9.5). JWT-forwarding (the `confirm-scan-bundle` pattern, NOT service-role) so `client_order_status_v`'s own-row `auth.uid()` scope is the actual security boundary, not a filter this function adds itself. `{orders:[{order_number, status, status_label, eta, timeline:[{at, kind, label}]}]}`, `kind` closed to `confirmed|in_production|shipped|delivered|delayed`.

**⚠ Schema gap found and flagged, not worked around** (S3 is sole migration writer this wave — the protocol this program runs on): `client_order_status_v` (00353) exposes only `{order_id, order_no, intake_at, client_status}` — no ETA, no per-stage timestamp. `fulfillment-status` is built honestly against exactly what's there: `eta` is always `null` in v1, and `timeline` carries exactly one PROVEN entry (`confirmed @ intake_at`) plus, when the order has advanced past confirmed, a second entry with `at: null` rather than a fabricated timestamp — the function never claims to know a time it doesn't have. Relayed to S3 for the view-enrichment (client-safe ETA/timeline columns); `fulfillment-status` needs no code change on this side once that lands — it already reads whatever the view exposes.

**Admin portal (spec §6/§7/§10):** note-drawer send flow replaces S1's stub — opening picks the transition from the row's derived state (`transitionForDerivedStatus`), reuses an existing unsent draft or POSTs `.../notifications/draft`, renders the body in an editable textarea; unedited: `n` or bare Enter sends immediately, no `edit_diff`; edited: only the button or Cmd/Ctrl+Enter sends — the explicit-action demotion; pure decision logic (`resolveNoteSendMode`/`resolveNoteDrawerSendAction`) lives in `@patina/fulfillment`, unit-tested there. New routes: `POST notifications/draft` (composes the CLIENT-SAFE context server-side — vendor/PO/cost data never crosses this boundary), `POST notifications/[id]/send`, `GET notifications?orderId=` (drawer history + dedup so re-opening never mints a duplicate draft). Vendor Directory replaces S1's placeholder: `/fulfillment/vendors` lists every vendor, profiled or not (R1.6 — an unprofiled vendor reads as a visible gap, not an absent row) + `/fulfillment/vendors/[vendorId]` profile editor (all R1.6 fields via `fulfillment_update_vendor_profile`) + scorecard (median ack, on-time-ship, damage, fill, exception-by-cause; trailing 90d, n shown; EmptyState at n=0 — the seed reality; manual CSV export); scorecard math is a route-layer computation over already-fetched rows — no new view/RPC. Config editor replaces S1's placeholder: typed rate/pct/hours/cents fields for the six flat-scalar keys + a structured business-hours week+holidays editor, `updated_by`/`updated_at` shown; writes via `fulfillment_update_config` (full-value overwrite matching the RPC). `services/fulfillment.ts` and the hooks index got their S4 sections appended at the end only; no existing content reordered.

**Two RPC quirks worked around, logged rather than silently swallowed:** `fulfillment_update_vendor_profile`'s `ON CONFLICT` branch is `COALESCE(EXCLUDED.x, vendor_profiles.x)` for every column — a patch can create or overwrite a field but never clear a previously-set one back to `null` (documented in `@patina/fulfillment/vendor-form.ts`; an RPC change is out of scope this wave). `fulfillment_record_client_note`'s send-stamp phase names its skip event `notification.push_skipped` unconditionally on any non-null `skipped_reason` — including an EMAIL send failure; inherited as-is (S3-owned migration); the dispatcher's return value still correctly reports `email.success=false`.

**Tests — the accepts-when, verified fact:** the leak test scans every rendered template's subject/html/text/push-copy AND every persisted draft/sent body across all 5 transitions × 2 channels for the six seeded vendor names, the `PO-\d` pattern, and a cost-figure pattern — zero matches; freight-inspection paragraph present for ltl/white_glove, absent for parcel; edit-diff stamping verified both ways; the push-skip path writes `skipped_reason: 'apns_not_configured'` while email still succeeds independently. `_tests/fulfillment-status.test.ts` — response shape, the closed kind enum, a deep key/pattern scan of the full API response. `packages/fulfillment` 108/108 vitest; admin-portal jest 22 new tests green (note-drawer 9/9, vendor-profile-editor 6/6, config-key-editor 7/7; S1's `use-queue-keyboard` 9/9 unaffected); full Deno regression sweep 140/140 (excluding the pre-existing stack-dependent `stripe-rail.test.ts`); admin-portal build green with every new route in the route table.

**Deferred to the Wave E combined pass (needs the stack):** live `functions serve` exercise of `fulfillment-notify`/`fulfillment-status` against a real DB; a browser click-through of Queue → `n` → draft → send; Resend live-send confirmation (sandbox/dry-run per O3's posture); re-verifying `fulfillment-status`'s `eta`/`timeline` once S3's `client_order_status_v` enrichment lands.

---

*Entries: D1 · O1 (resolved) · O2 (open) · O3 (near-resolved) · I1–I7 · R1–R3 · L— · last id = I7 · footer maintained manually (append_entry.py targets the-document's DECISIONS.md only — see I1 discussion; this file's footer follows the same cumulative-index convention by hand)*
