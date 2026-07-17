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

*Entries: D1 · O1 (resolved) · O2 (open) · O3 (near-resolved) · I1 · R1–R2 · L— · last id = R2 · footer maintained manually (append_entry.py targets the-document's DECISIONS.md only — see I1 discussion; this file's footer follows the same cumulative-index convention by hand)*
