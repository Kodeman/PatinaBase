# Walk addendum — independent part-1/part-2 walk (session 1c3d5f88, 2026-08-13)

*(Independent prod walk by a second session, run before coordination was established. Two walkers: part 1 = desk + lead-capture ("Fable UX Walk" lead, kody+doctest@kochaver.com) through drafting; part 2 = project-phase deep walk on Winkys winktastic loft + install/care inspection on Harper Vale + cross-nav. All screenshots below are VERIFIED Chrome captures (MCP save_to_disk), copied to `artifacts/doc-ux-review-2026-08-13/shots-addendum/`. Findings deduped against 02/03/04; corroborations marked.)*

## New findings (not in 02–04)

### A1 — Desk card send-trap: an urgent-action card's ENTIRE surface fires the send flow · MAJOR · HIGH
The "Test Walker" desk card (invoice-overdue variant) is a single `<button>` whose whole surface — including the project TITLE — opens the Accounts/Receivables **send-reminder composer overlay**. There is NO way to open the underlying project doc from that card; clicking the title (the universal "open it" affordance, and exactly what the sibling Winkys/SMS House cards do) drops the designer into a client-facing send flow instead. The composer does require a further explicit send click (a downstream confirm exists — unlike the picklist auto-invite in 04#2), but the card-level affordance is the trap: intent "open project" is answered with "contact client." Pairs with 04#2 as theme: send-affordances disguised as navigation. Shot: `screenshot-1786628009248-34.jpg`.

### A2 — "← THE DOCUMENT" from a room scan lands on the WRONG document · MAJOR · HIGH
From Winkys (`/doc/0cafa955…`) → "THE SCAN" → `/room/fa361ed4…?from=document`, the "← THE DOCUMENT" breadcrumb navigated to a **different** project doc (`/doc/0e048e19…`, a second "Kody Winky" project with different dates/budget). The breadcrumb follows the room's canonical-doc link, not actual navigation history — verified by comparing UUIDs and page content. A designer mid-thought is silently teleported to another job. Shots: `screenshot-1786627616149-32.jpg`, `screenshot-1786627616150-33.jpg`.
(Corollary: there are duplicate near-identical project docs — two "Kody Winky" projects — corroborating 02's People-room duplicate rows from the doc side.)

### A3 — "IN HAND" timer misattributes time to the wrong document · MINOR · HIGH
After navigating from Winkys into "[UX Audit] Kochaver install journey", the persistent bottom-bar timer still read "Winkys winktastic loft · 3 min in hand." Time-tracking trust/attribution risk. Shot: `screenshot-1786628506933-39.jpg`.

### A4 — Per-band bespoke loading cascade; placeholders read as broken · MAJOR · HIGH
Every band loads independently with its own italic loading string and NO spinner/skeleton: observed simultaneously "Reading approvals…", "READING PROJECT WORKFLOW…", "RESOLVING THE SCHEDULE…", "Reading the work…", "Loading working budget…", "Loading authorizations…", "OPENING THE LEDGER…". Unfolding a settled phase ("Brief") showed only "Opening the brief..." for 3+ seconds. First-run users could reasonably conclude the page is broken. Nuance for the deck: this cascade appears on COLD navigation (typed URL / fresh load) only; in-app client-side routing is fast and flash-free — so the "Picking up…" blank-load finding is cold-nav-scoped. Shots: `screenshot-1786622716946-22.jpg` (stuck unfold), `screenshot-1786627405023-30.jpg` (whole-page cascade — strongest evidence).

### A5 — Primary coordination CTA "RESOLVE THE SCHEDULE" appears to no-op · MAJOR (if reproducible) · MEDIUM
On Harper Vale, clicking the top coordination band's only action ("RESOLVE THE SCHEDULE", under "Two installs collide — week of Nov 30") produced no navigation, scroll, modal, or visible change. Single trial, no network correlation. The most prominent CTA on the page doing nothing visible slots into T6/T1. Shot: `screenshot-1786628661896-46.jpg`.

### A6 — "RELEASE FOR AUTHORIZATION" gives zero feedback when nothing is eligible · MINOR · MEDIUM
On Winkys (all 4 FF&E lines already approved/authorized/specified), the click produced no selection mode, toast, or disabled-state explanation — can't tell the click registered.

### A7 — Visible "FIND ANYTHING ⌘K" control doesn't open the command bar · MINOR · HIGH
Clicking the rendered "FIND ANYTHING ⌘K" text link scrolled the page instead of opening ⌘K; only the literal keyboard chord worked. The one discoverable entry point to the portal's only global nav is inert to the mouse.

### A8 — Cold navigation restores mid-scroll position; header/spine not visible on first paint · MINOR/POLISH · MEDIUM
Fresh full-page loads of a doc URL landed mid-scroll (reproduced twice on Winkys). Probably intentional "continue where you left off," but a first-time viewer following a shared link never sees the header or phase spine on landing.

### A9 — Triplicate "Capture a lead" entry points on the Desk · MINOR · HIGH
Three duplicate capture-a-lead affordances visible on one Desk screen (part-1 walker). Shots: early `screenshot-17866045…` series.

## Corroborations of 02–04 (independent reproductions — raises confidence)

- **04#1 / Direction skip**: independently hit — "Begin the Direction" on a fresh lead jumped straight to the Design Agreement in /drafting; no Direction-phase UI en route.
- **04#6 / doc URL rebinding**: independently hit from a different path — after drafting, "Save agreement" errored to **"No document answers to this name"** (part-1 walker, lead "Fable UX Walk", client kody+doctest@kochaver.com). Second reproduction of the URL/identity break at the Direction boundary.
- **T6 / leaked machinery**: "SECTION GUIDANCE · NO PROJECT PHASE TOPOLOGY" seen on "[UX Audit] Kochaver install journey" (shot `screenshot-1786628506933-39.jpg`); "NO ACTIVE OR DELAYED PHASE IS CONFIGURED" seen on Winkys, Test Walker, and the audit doc — systemic, not one doc (shots `screenshot-1786622337802-17.jpg`/`-18.jpg`).
- **T2 / install composes nothing new — code finding CONFIRMED in UI**: on Harper Vale, the install/care render drops the Design Authority band, Working Budget grid, and Authorizations & Trade Scopes ledger entirely; FF&E collapses to one un-room-grouped line "0 OF 1 INSTALLED · BILL 1 UNINVOICED"; the Care task list is the only unfolded working surface. Shots: `screenshot-1786628558106-40.jpg`/`-41.jpg`.
- **Positive counterweights worth one deck line**: the "Draw an invoice" composer (Bill N uninvoiced) is genuinely well-built and cancels cleanly (`screenshot-1786628635854-43.jpg`); Sheets overlays (Call Sheet, Accounts) behave correctly with "PUT BACK · ESC"; Esc→desk with the gold "recently visited" ring is a lovely orientation touch.

## Precise render-order anatomy (for mock accuracy)

**Project phase (Winkys, confirmed):** header (title/client/dates/budget band/"PHASES ▸" all-dash estimate table) → coordination callout (`PROJECT · ACTIVE WORK · GATE`) → action row (Message client / Preview as client / The Scan / Sharing / Milestones / Call sheet) → THE FOLIO (collapsed) → Client approvals → PREVIOUS WORK + settled-bar accordions (Brief/Discovery/Direction/Proposal) → "Workflow stage" (empty-state text) → Schedule band (6 phases, foldable, "Name a phase…" ghost row) → REVISIONS → **Project · FF&E** (room-grouped, SPEC BOOK → / ADD TO PROJECT / RELEASE FOR AUTHORIZATION) → Design Authority → Working Budget → Authorizations & Trade Scopes → "CLOSE THE BOOK…" (Care collapsed to one unlabeled link) → The accounts (folded, STUDIO EYES ONLY) → Mood boards (empty) → Plan room → footer.

**Install/Care (Harper Vale, confirmed):** header → Care-scoped coordination callout → action row → Client approvals → previous-work Gantt strip (TODAY marker, BASELINE caption) → "Workflow stage" (same empty-state) → Care band header ("The book closed Jul 31") → **Install one-liner** (0 OF 1 INSTALLED · BILL 1 UNINVOICED — no room grouping, no controls) → unfolded Care task list → Folio → accounts (folded) → mood boards / plan room / footer. **Absent vs project: authority band, budget grid, authorizations ledger, room grouping, all FF&E actions.**

**Spine behavior:** settled markers scroll-to + unfold inline; future markers ("—") do nothing with no feedback; the active phase marker is bold but not clickable to anything distinct.

## Screenshot manifest (captioned, in shots-addendum/)

- `…604490568-0` … `…604652276-9` — part 1: Desk, capture-a-lead modal, brief essentials flow (5 essentials autosave)
- `…607228459-10` … `…607429320-18` — part 1: "Begin the Direction"→drafting jump, agreement facets, save-agreement dead end
- `…607666844-0` / `…607677491-1` — cold-nav "Picking up…" blank, then mid-scroll landing
- `…621961551-2`…`-4` — Winkys top: header, coordination callout, approvals
- `…622069347-6` — "PHASES ▸" all-dash estimate table
- `…622124471-7`/`-8` — schedule band folded · `…622137803-9`/`-10` — FF&E room-grouped
- `…622147534-11`/`-12` — authority/budget/authorizations stack · `…622177772-13`/`-14` — doc bottom (close-the-book, accounts, mood/plan, footer)
- `…622319109-15`/`-16`, `…622337802-17`/`-18` — "NO ACTIVE OR DELAYED PHASE IS CONFIGURED"
- `…622463383-19`, `…622634248-20`…`…622716946-22` — settled-accordion loading placeholders
- `…622868811-26` — Esc→desk gold ring · `…623917766-28` — The Rooms
- `…627405023-29` — graceful roster error · `…627405023-30` — whole-page loading cascade
- `…627616149-32`/`-33` — wrong-doc breadcrumb (A2)
- `…628009248-34` — desk card send-trap (A1)
- `…628506933-39` — audit doc + SECTION GUIDANCE leak + timer misattribution (A3)
- `…628558106-40`/`-41` — Harper Vale install/care top, spine SETTLED/ONGOING
- `…628635854-43` — invoice composer · `…628654827/28` — call sheet overlay
- `…628661896-46` — RESOLVE THE SCHEDULE no-op (A5)

## Untested / caveats
- No live Project→Install transition performed (no safe sandbox at the right stage; Harper Vale's settled install band used instead).
- A5/A6 single-trial, no network-log correlation.
- Prod residue from THIS session's walks (in addition to the logged "UX Walk Aug 13" residue): lead "Fable UX Walk" (client kody+doctest@kochaver.com) with a drafted agreement — no invite was fired from this session's walks.
