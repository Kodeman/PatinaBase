# 01 — Shot ledger

Program: The Document — Life (flatness review). Run 2026-08-28 against the STEWARD's live
`pnpm dev:designer` server (port 3000, PID 52138), local Supabase (`127.0.0.1:54321`/`:54322`),
`NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,
studio-workspaces:true'`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, signed in as
`designer@patina.dev`.

Harness: `research/capture-shots.mjs` (ported from
`artifacts/document-wayfinding-directions-2026-08-25/research/wayfinding-shots.mjs`, re-verified
against the current codebase). Two passes: `SHOT_W=1440/390`, prefixes `w1440-`/`m390-`. All 22
PNGs below were opened with the Read tool and classified by hand.

**22 of 22 shots exist. 21 verified as the intended surface (one — `status-chips` — is a
documented, source-confirmed unreachable state on this local DB, not a harness bug; a full-page
fallback was still captured per the brief's "never silently skip" rule).**

**Required gate check: `w1440-desk.png` shows the roster (job LINES, grouped by stage —
Brief·5/Discovery·1/Direction·3/Proposal·2/Project·4/Install·1 — each a text row with an
`OPEN THE JOB` link), not folio/card grid.** Confirmed against source: `desk-roster.tsx`
(`data-testid="desk-roster"`) renders `<ul>` text lines with no card wrapper; the `.folio-face`
shadow/card class used by the old folio grid is defined in `globals.css` but imported by zero
`.tsx` files app-wide (dead CSS — see `12-measurements.md` claim 9).

## Table — 1440×900 (`w1440-` prefix)

| file | route / rung | what it shows | notes |
|---|---|---|---|
| `w1440-desk.png` | `/desk` | Full desk: greeting, "The studio isn't fully set up" nudge, the roster (16 live jobs · 1 overdue) grouped Brief/Discovery/Direction/Proposal/Project/Install, then the Studio footer (Rooms/Ledgers/Begin) | **Modal-dismiss required** — see harness notes §1 |
| `w1440-doc-project-rich.png` | `/doc/<Chen Residence>` (project_rich) | Chen Residence, project stage: needs-attention band ("Name the phases"), Schedule composer (Patina Six/past project/blank), Pieces (3 FF&E lines: Møbler Lounge Chair, Oak Drum Side Table, Custom Walnut Sectional — 2 "IN PRODUCTION", 1 "RECEIVED"), Money region, Closing the book, margin rail with 2 vendor-payment items | |
| `w1440-doc-project-plain.png` | `/doc/<Marrow & Vale>` (project_plain) | Marrow & Vale Residence — every field empty (0 rooms/pieces/drawings/spec/boards/money/dates/people), full phase timeline (Design Development in progress, 6 days overdue on sign-off), 0 pieces/no budget | Confirmed 0 FF&E via psql before capture |
| `w1440-doc-proposal-sent.png` | `/doc/<Aspen Loft>` (proposal_sent) | Aspen Loft — Living Room Refresh, "Sent Aug 27 · not opened yet," client-copy preview (Milestones view), full investment table (5 line items, $18,500 total) | |
| `w1440-doc-install.png` | `/doc/<Aspen Loft Refresh>` (install) | Aspen Loft Refresh, Installation & Styling active: needs-attention ("1 decision overdue — oldest due Aug 25"), "No FF&E lines are scheduled for installation," Closing the book (0 of 6, portfolio-snapshot form) | State lifted via RPC — see `00-env-and-ids.md` §4 |
| `w1440-doc-brief.png` | `/doc/<Full Room — Marcus Wright>` (brief) | Lead "Full Room," Marcus Wright — brief essentials (match 0.85, budget $5k–$15k, 1–3 months), pull-quote, "New lead — respond by Aug 31," Accept·Begin/Nurture/Pass | |
| `w1440-room-library.png` | `/library` | The Library: search, "My Library" (raw captures) empty state, shelf filter chips, 0/0/19 counts | fullPage |
| `w1440-room-people.png` | `/people` | Directory, 9 people, filter chips (All/Field/Clients/Leads/...), full roster incl. Client User×2, 5 leads, Elena Marlowe | fullPage |
| `w1440-ledger-sheet-orders.png` | `/desk` + Orders ledger dialog | Orders ledger sheet open: Ledger/The week/Receiving/Vendors tabs, throughput (6 open · 1 unsent), PO rows AP-012/CER-0044 with status pills | Opened via `document:open-ledger` CustomEvent, `detail.name` (not `.key`) |
| `w1440-desk-roster-rows.png` | `/desk`, clip `[data-testid="desk-roster"]` | Clipped roster only: Brief·5 through Direction·3 groups, each job line with name/status/deadline + OPEN THE JOB | |
| `w1440-spine-detail.png` | `/doc/<Chen Residence>`, clip `[data-document-spine]` | Clipped spine rail: Put down link, tick-mark progress bar, "ON THIS PAPER" (Client approvals/Schedule/Pieces/Money), "IN HAND" widget | |
| `w1440-drawer-strip.png` | `/desk`, clip `[aria-label="Studio drawer"]` | Clipped bottom Studio drawer: wordmark, Library/People/The Scans/Ledgers, Find anything, Hands free, The Post, account | |
| `w1440-ffe-lines.png` | `/doc/<Chen Residence>`, clip `#project-ffe` | Clipped Pieces/FF&E region: "Not in a room yet" group, 3 lines with vendor + status pill + price, ADD A LINE/FILE | |
| `w1440-margin-rail.png` | `/doc/<Chen Residence>`, clip `[data-margin-panel]` | Clipped margin rail: onboarding note, "IN THE MARGIN" — Time·Aug 28, 2 vendor-payment-due cards | |
| `w1440-status-chips.png` | **UNREACHABLE — see below** | Fallback full-page shot of `/drafting/<Elena Marlowe direction draft>` | Documented failure, not a silent skip — see below |

## Table — 390×844 (`m390-` prefix, `isMobile`, dpr 2)

Brief required 3 of these (`desk`, `doc-project-rich`, `mobile-bar`); the harness also captured
the other 4 doc rungs at 390 as a low-cost bonus (not required by the brief, included for
completeness).

| file | what it shows | notes |
|---|---|---|
| `m390-desk.png` | Full mobile desk: greeting, roster grouped by stage, Studio footer | **fullPage stitching artifact**: the fixed bottom Studio-bar strip ("...he Desk / TODAY / MORE") is visibly duplicated mid-page, baked into the stitched image where Playwright's fullPage capture crossed a viewport boundary while the `position:fixed` bar was still painted. This is a screenshot-technique artifact of `page.screenshot({fullPage:true})` with a fixed element present, not an app bug. |
| `m390-doc-project-rich.png` | Chen Residence, mobile layout: title, needs-attention, Schedule composer, Pieces/FF&E, Money, Closing the book | Renders as a single reflowed column, all content present |
| `m390-doc-project-plain.png` | Marrow & Vale, mobile layout, same empty-state fields as desktop | |
| `m390-doc-proposal-sent.png` | Aspen Loft proposal, mobile layout | |
| `m390-doc-install.png` | Aspen Loft Refresh, install stage, mobile layout | |
| `m390-doc-brief.png` | Full Room (Marcus Wright) brief, mobile layout | **Same fullPage-stitch artifact** as `m390-desk.png`: the fixed bottom bar ("IN THIS DOCUMENT / Brief... RESPOND TO THE INQUIRY / MORE") is duplicated mid-page in the stitch. |
| `m390-mobile-bar.png` | Viewport (not fullPage) crop of the bottom of `/doc/<Chen Residence>`: "IN THIS DOCUMENT · Project · More" bar | Confirms `[data-testid="mobile-bar"]` renders; no stitching artifact since this is a single-viewport shot, not fullPage |

## `status-chips` — confirmed unreachable, not a harness bug

`StatusChip` (`status-chip.tsx`) is imported ONLY by plan-room / spec-book / light-table-card /
drafting-room components (`grep -rl "from '.*status-chip'" apps/designer-portal/src` — 7 files,
all under those four areas). Two independent psql checks against the local DB close off every
place it could render on any reachable page:

1. `plan_sheets` and `plan_transmittals` both have **0 rows** on this DB — the Plan room shelf
   on every ladder document renders its "No drawings filed yet" empty state, never the
   drawing-log/current-set views where `plan-room-set.tsx`'s `StatusChip`s live.
2. `drafting-room.tsx`'s own `StatusChip` (≈line 294) is gated on a truthy `spec`, sourced from a
   proposal item's product spec — but `proposal_items` has rows on exactly ONE proposal DB-wide
   (`b0...002`, the sent Aspen Loft proposal, 5 items), and **none** of those 5 (or any other
   `proposal_items` row anywhere) has a `product_id` set. Every draft/direction proposal,
   including the one probed live below, has 0 items.

Live probe (documented in the harness, `capture-shots.mjs`'s `status-chips` block): navigated to
`/drafting/d0c10000-0000-0000-0000-0000000000b2` ("Elena Marlowe — Living Room Direction," an ad
hoc probe target, not a ladder rung) and searched for the `StatusChip` dot's exact selector
(`span[aria-hidden].h-1\.5.w-1\.5.rounded-full`). It matched exactly one element — a `<svg
class="lucide ...">` notification-bell icon in the header, a coincidental class collision on
`rounded-full`, not a real chip. No raw data write was made to force a reachable case (forbidden
— business-table write). The saved `w1440-status-chips.png` is a full-page fallback of that
Drafting Room page, marked FAILED in the harness's own `failed[]` log rather than mislabeled as
verified content.

## Harness notes

1. **The welcome/tour modal ("This is your Desk") covered the roster on the first capture
   pass**, blocking both `w1440-desk.png` and `w1440-desk-roster-rows.png`. The ported
   localStorage preset (`help-system.welcome-shown.first-project-walkthrough`) — carried over
   from the wayfinding program's harness — does NOT suppress it: `getTourState` (from
   `@patina/help-system`) reads through whichever backend is installed, and for a signed-in
   designer that's a Supabase-backed adapter
   (`packages/help-system/src/proactive/TourController/tourState.ts`'s own doc comment), not
   localStorage. Fixed by adding a `dismissWelcomeModal()` step to `gotoDesk()` that clicks
   "Skip for now" (`[data-testid="welcome-modal-overlay"]` → `getByRole('button', {name: 'Skip
   for now'})`) whenever the overlay is visible, then re-ran both passes clean.
2. **Chen Residence tied Olsen Lake House exactly** on the project_rich tiebreak (3
   `project_ffe_items` and 4 `purchase_orders` each, psql-verified) — Chen was chosen to match
   the plan's own stated expectation and the prior wayfinding program's precedent, not because
   the tie broke numerically. Documented in `state-ladder.json`'s `query_used` field for
   `project_rich`.
3. **The `install` rung required a state lift**, ported verbatim from the wayfinding program's
   `research/lift-states.sql` (this program's copy: `research/lift-install.sql`): no project on
   this local DB was at `active_section='install'` after a reseed reset Aspen Loft Refresh back
   to `active_section='project'`. Ran the exact same RPC chain — `expire_client_decision` (the
   `c301` signoff blocker) → `advance_project_phase(c102)` → `advance_project_phase(c103)` —
   confirmed idempotent (the SQL no-ops if already applied) and re-verified via psql afterward
   (`active_section='install'`, `current_phase='installation'`). No raw table writes.
4. **`node_modules` resolution**: `@playwright/test` doesn't resolve from a script living outside
   `apps/designer-portal`'s own tree under native Node ESM. Fixed the same way the wayfinding
   program did: a `research/node_modules` symlink to `apps/designer-portal/node_modules`.
5. **Sandbox note**: Chromium launches, the dev-server boot/kill, and all psql queries required
   `dangerouslyDisableSandbox: true` (mach-port-rendezvous / DB-socket restrictions, not product
   issues). Every unsandboxed command is logged in `00-env-and-ids.md`.
