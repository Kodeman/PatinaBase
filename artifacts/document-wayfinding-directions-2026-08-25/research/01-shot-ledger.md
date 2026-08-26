# E1 — Shot ledger (flag OFF, `worktable` off)

Program: The Document — Wayfinding Review. Run 2026-08-25 against the STEWARD's live
`pnpm dev:designer` server (port 3000, PID 36975 at session start), local Supabase
(`127.0.0.1:54321` / `:54322`), `NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,
room-file:true,studio-workspaces:true'` (no `worktable`), designer@patina.dev.

Harness: `research/wayfinding-shots.mjs` (ported from
`apps/designer-portal/scripts/the-document-track3-shots.mjs`). Three passes:
`SHOT_W=1440/1280/390`, prefixes `w1440-`/`w1280-`/`m390-`. All 67 PNGs below were opened
with the Read tool and classified by hand — this table is not `done[]`/`failed[]` from the
script log.

**verified_count = 65** (65 of 67 files show exactly the intended surface; 2 are honest
failure-fallback screenshots for a genuinely unreachable state, documented below rather than
miscounted as evidence).

## Table

| name | width | verdict | what it shows | notes |
|---|---|---|---|---|
| desk | 1440/1280/390 | verified (×3) | Desk landing: greeting, Needs your hand folder cards, Studio pulse, Studio/Ledgers/Begin columns | |
| doc-brief | 1440/1280/390 | verified (×3) | Lead "Full Room" (Sarah Chen) — Brief section, match/budget/timeline chips, room scan slot | id corrected, see Harness notes §2 |
| doc-discovery | 1440/1280/390 | verified (×3) | Relationship "The Ashfords" — Discovery essentials checklist, 0 of 5 captured | |
| doc-direction | 1440/1280/390 | verified (×3) | Draft proposal "Elena Marlowe — Living Room Direction" — Direction·v1, 0% drafted | |
| doc-proposal-sent | 1440/1280/390 | verified (×3) | "Aspen Loft — Living Room Refresh", awaiting signature, sent Aug 24, full investment table $18,500 | |
| doc-project-rich | 1440/1280/390 | verified (×3) | "Chen Residence" — needs-attention, Client approvals/Schedule/FF&E/Design authority regions, 3-line FF&E schedule, kickoff band | id corrected, see Harness notes §2; 0 rooms (see rooms-block) |
| doc-project-plain | 1440/1280/390 | verified (×3) | "Marrow & Vale Residence" — same region set, all empty (0 FF&E/decisions/invoices/POs/rooms) | |
| doc-install | 1440/1280/390 | verified (×3) | "Aspen Loft Refresh" — Installation & Styling active, 1 decision overdue, Closing-the-book band already visible (1/6) | install state re-lifted, see Harness notes §1 |
| doc-care | 1440/1280/390 | verified (×3) | "Birch Hollow" — Care·ongoing, "book closed Aug 25", Request client review | care state re-lifted, see Harness notes §1 |
| spine-detail | 1440/1280 | verified (×2) | Full-tier spine: 7 marks in a row + active section label/sub beneath | |
| spine-hover-overflow | 1440/1280 | verified (×2) | Same spine with one mark's hover background highlighted (see Harness notes §3 — no literal "···" overflow trigger exists in this codebase; this is the closest real affordance) | |
| running-index-midscroll | 1440 | verified | Chen doc scrolled ~45%; running index highlights "Project · FF&E" as the reading line | |
| rooms-block | 1440 | **unreachable** | Fallback screenshot only (Install region body, no rooms block) | See Harness notes §4 — the shelved spine (rooms block included) only mounts when `active_section === 'project'`, but no current project-stage document has any `project_rooms` rows |
| room-lens-held | 1440 | **unreachable** | Same fallback as rooms-block | Same root cause |
| shelves-block | 1440 | verified | Chen doc spine, unopened shelves list: Plan room/Spec book/Mood boards/Call sheet/Knowledge with statuses | |
| shelf-planroom | 1440 | verified | Plan room leaf open beside spine: "No drawings filed yet", Open the plan room | |
| shelf-specbook | 1440 | verified | Spec book leaf open: 3 specified items with production/delivered status + prices | |
| shelf-moodboards | 1440 | verified | Mood boards leaf open: "No boards yet" | |
| shelf-knowledge | 1440 | verified | Knowledge leaf open: "Nothing filed for this project", Open the studio library | |
| shelf-callsheet-doorway | 1440 | verified | Shelves list with Call sheet row hovered (doorway, not a leaf — no panel opens) | Hover delta subtle; row content confirmed correct regardless |
| margin-closed | 1440 | verified | Margin rail, empty state: "The margin — decisions, messages, and money gather here" | |
| margin-open | 1440 | verified | Identical to margin-closed | **Genuine finding, not a harness bug**: at ≥1440 the margin rail has no closed state at all (`visible = isFullRail \|\| openAsSheet`, `isFullRail` is always true ≥1440) — the toggle trigger only exists 1180–1439px. "Open" and "closed" are the same state at this width. |
| margin-composer | 1440 | verified | Full "New decision" composer sheet: kind (Selection/RFI/Submittal/Punch), subject grid, whose-court grid, what's-being-decided field | Ran on project-plain (Marrow & Vale), not project-rich — see Harness notes §5 |
| red-letter-zone | 1440 | verified | Clipped "Needs attention" zone: "Name the phases for this project" / Open the schedule | Not `role="alert"` — see Harness notes §6 |
| money-region | 1440 | verified | Full "Design authority" region unfolded: Authority/Plan/Committed/Moved rows, explainer, Working budget, Authorizations & trade scopes | Required a harness fix — see Harness notes §7 |
| record-foot | 1440 | verified | Foot of Chen doc: FF&E lines, Design authority seam, Closing-the-book seam, kickoff band, colophon (Leah Hartwell / Brief a vendor / Hold / Archive / Team…) | |
| guide-proposal-sent | 1440 | verified | Top of Aspen Loft proposal-sent doc: guide headline "Wait for the client's signature" | |
| install-section | 1440 | verified | Install section of Aspen Loft: Installation & Styling phase, "Plan the install work", Closing-the-book seam | |
| care-band | 1440 | verified | Care section of Birch Hollow: "The book closed Aug 25", Request client review, accounts summary | |
| cmdk-open | 1440 | verified | ⌘K dialog open over Desk: Recent (Birch/Aspen×2), Begin group | |
| cmdk-typed | 1440 | verified | ⌘K with "install" typed: "No match — Browse the Help Center" + "Ask the Engine · 'install'" | |
| cmdk-engine-row | 1440 | verified | ⌘K with "walnut console" typed: same no-match + Ask the Engine row | |
| drawer-strip | 1440 | verified | Clipped bottom Studio drawer strip only: wordmark, Library/People/Rooms/Studio books, Hands free, The Post, account | |
| drawer-open | 1440 | verified | Desk with Studio books menu open: Orders/Accounts/Hours/Leave a note | |
| drawer-books | 1440 | verified | Desk (page settling — skeleton cards still loading) with Studio books menu open | Re-ran once for a cleaner capture — first attempt's page-load timing was noted but not a harness bug |
| ledger-sheet-orders | 1440 | verified | Full Orders ledger sheet: Ledger/The week/Receiving/Vendors tabs, throughput, PO rows (AP-012, CER-0044…) | Required a harness fix — see Harness notes §8 |
| room-library | 1440 | verified (fullPage) | `/library` — Find a piece search, My Library empty state, stats footer | |
| room-people | 1440 | verified (fullPage) | `/people` — Directory, filter chips, full roster (Client User×2, leads, etc.) | |
| room-rooms | 1440 | verified (fullPage) | `/rooms` — 6 scanned rooms, each a card with quality/geometry status | |
| leaf-plans-route | 1440 | verified (fullPage) | `/doc/<Chen>/plans` — The plan room, "Start the current drawing set", Choose a PDF | |
| leaf-specbook-route | 1440 | verified (fullPage) | `/doc/<Chen>/spec-book` — Workbench, 3 unassigned items, full spec fields for the first one | |
| board-route | 1440 | **skipped** | — | No mood board exists locally (`project_boards`/`proposal_boards` both 0 rows, psql-confirmed twice — once by E0, re-verified here) |
| drafting-route | 1440 | verified (fullPage) | `/drafting/<direction id>` — The Drafting Room outline: Scope/Vision/Phases/Exclusions/Payments/Terms + live client's-copy panel | |
| room-file-route | 1440 | verified (fullPage) | `/room/<Aspen Dining Room id>` — "This room is still being drawn." **plus a real app error toast**: "Cannot coerce the result to a single JSON object" | **Genuine defect, not a harness artifact** — see Harness notes §9 |
| mobile-bar | 390 | verified | Bottom bar on Chen doc: "In this document / Project / More" | |
| mobile-spine-sheet | 390 | verified | Section-handle sheet open: Brief→Discovery→Direction→Proposal→**Project** (active)→Install→Care, "In the margin · 3" | |
| mobile-margin-chips | 390 | verified | Top of Chen doc: two letterhead-anchored margin chips ("Vendor payment — deposit", "Vendor payment — balance") beneath the title | Required a harness fix — see Harness notes §10 |
| mobile-more-actions | 390 | verified | "More studio actions" sheet: Time in hand, The Post (3 new), Studio books, Leave a note | |

**67 files total. 65 verified as the intended surface, 1 skipped by design (no board data
exists), 2 confirmed-unreachable-with-current-fixture-data (both rooms-block/room-lens-held,
same root cause).**

## Unreachable states

- **rooms-block / room-lens-held (1440-only, project-stage doc)**: `DocSpineShelvedBlocks`
  (which contains `SpineRoomsBlock`) only mounts when `row.engagement_kind === 'project' &&
  row.active_section === 'project'` (`doc/[id]/page.tsx`, `shelvedSpine` derivation). Of the
  8 ladder documents, only Aspen Loft (`d1`) and Birch Hollow (`d3`) have any `project_rooms`
  rows (2 and 0 respectively as of this run — Birch actually has 0 too, only Aspen has rooms),
  and both are pinned to `install`/`care` for this program, not `project`. Chen, Olsen, and
  Marrow & Vale — the three documents currently sitting at `active_section='project'` — all
  have 0 `project_rooms` rows. No reachable document in the current fixture set can show both
  conditions at once. Not fixed by writing directly to `project_rooms` (forbidden — raw
  business-table write); flagged instead as a genuine fixture/product-shape gap worth a ruling
  from the design review (is a rooms-less "in-progress project" document even representative
  of what most designers see day to day, if the rooms block never appears for one?).
- **board-route**: no mood board exists on the local stack. `project_boards` and
  `proposal_boards` both have 0 rows (confirmed via direct psql query against
  `127.0.0.1:54322`, independently of E0's report). `extra.board_id` in `state-ladder.json`
  is `null` for the same reason. Not created — would require a raw insert into a business
  table, forbidden by this program's hard rules.

## Harness notes

1. **The local DB was reset/reseeded between E0's research run and this shot pass.** Every
   fixed-UUID row in `state-ladder.json` (the `b0…` prefixed ids, `d0c10000-…`) survived
   unchanged, but every row relying on `gen_random_uuid()` did not — the 5 `lead` rows and the
   Chen/Olsen `project` rows all got new ids. This also reset Aspen Loft/Birch Hollow back to
   their pre-lift `active_section='project'` state (no phase advanced, book not closed) — i.e.
   E0's §5 RPC work no longer stood at shot time. **Re-verified via `psql` and redid the exact
   same RPC chain E0 documented**: `expire_client_decision(c301)` →
   `advance_project_phase(d1, c102)` → `advance_project_phase(d1, c103)` for install;
   `advance_project_phase(d3, c602)` → `advance_project_phase(d3, c603)` →
   `close_project(d3, <6-key closure array>)` for care. All ran clean against the current DB
   (output matched E0's exactly), and `document_state` was re-verified afterward:
   `d1 → active_section='install', current_phase='installation'`;
   `d3 → project_status='completed', active_section='care'`. No raw table writes — every
   mutation went through the same designer-authorized RPCs E0 used.
2. **`brief` and `project_rich` ids corrected in the harness** (not in `state-ladder.json`
   itself, which is E0's deliverable and was left untouched): `brief` now points at
   `def699b9-4ffa-4d8e-8a9f-17b3d7db84fd` (a current "Full Room" lead, same title/shape as
   the original). `project_rich` now points at `2992a486-b2bd-4139-9e51-33ed1621c59c` (the
   current Chen Residence row) — re-verified via psql that it still ties Olsen Lake House for
   richest active project (3 `project_ffe_items`, 4 `purchase_orders`), matching E0's original
   tiebreak reasoning exactly.
3. **No literal "···" overflow trigger exists anywhere in `doc-spine.tsx` or
   `region-head.tsx`** — confirmed by source grep at harness-build time (`grep -rn "⋯\|
   MoreHorizontal" src/components/document/` returned nothing). The brief's selector
   guess for `spine-hover-overflow` doesn't correspond to a real element. Substituted the
   closest real affordance: hovering a spine mark's native `title="Jump to {Label}"` tooltip
   trigger, which does produce a visible hover-background change.
4. See "Unreachable states" above for the rooms-block root cause.
5. **`margin-composer` runs on project-plain (Marrow & Vale), not project-rich (Chen).**
   `canCompose = Boolean(projectId && designerClientId)` in `margin-rail.tsx:365` — the
   "+ Decision" composer button is gated on the project having a `client_id`. Chen Residence
   has none (psql-verified: `client_id` is null); Marrow & Vale does.
6. **`[role="alert"][aria-label="Needs attention"]` in the brief does not match anything.**
   `red-letter-zone.tsx` explicitly avoids `role="alert"` by design (its own comment: "It is a
   region, not an alert... must never seize a screen reader mid-sentence") — it's a plain
   `<section aria-label="Needs attention">`. Used `[aria-label="Needs attention"]` instead.
7. **`money-region` needed a real fix, not just a selector swap.** When folded,
   `FoldSeam` *unmounts* the `RegionHead` entirely — `#money-region-heading` is not hidden,
   it's simply absent from the DOM — and is replaced by a button carrying
   `data-fold-seam="money-region-heading"` (`fold-seam.tsx`). The first attempt looked for any
   generic "unfold ↓" text, found none reliably, and produced a near-useless capture (just the
   literal string "UNFOLD ↓", nothing else). Fixed to target that specific `data-fold-seam`
   attribute, click it, then wait for the heading and clip
   `section[aria-label="Money"]`.
8. **`ledger-sheet-orders` needed a real fix.** The `document:open-ledger` CustomEvent's
   payload field is `name`, not `key` (`studio-drawer.tsx`'s `onOpen` handler destructures
   `detail.name` — confirmed by source read). The first attempt dispatched `{ key: 'orders' }`
   and the event handler silently no-opped (`LEDGERS.find((l) => l.key === name)` where `name`
   was `undefined`), leaving the Desk unchanged behind it. Fixed the payload shape and added a
   `[role="dialog"]` wait instead of a blind timeout.
9. **`room-file-route` surfaced a genuine app defect, not a harness problem.** The captured
   page shows "This room is still being drawn." plus a live error toast reading "Cannot
   coerce the result to a single JSON object" — a raw PostgREST `.single()` cardinality error
   leaking to the UI. The room id used (`b0000000-0000-0000-0000-0000000d2c0a`, "Dining Room"
   on Aspen Loft) was independently re-verified via psql to exist as exactly one row in
   `project_rooms` immediately before this shot, so the error is not caused by a bad/missing
   id from `state-ladder.json` — it's the route's own data-fetching logic breaking on
   otherwise-valid data. Recommend flagging to the review as a real wayfinding dead-end (a
   designer following a "→ room" link from anywhere lands on a raw backend error).
10. **`mobile-margin-chips` needed a real fix, not just a wait tweak.** The brief's shot name
    maps to a real, dedicated component (`mobile-margin-chips.tsx`) that renders
    letterhead-anchored margin items as chips beneath the document title — a mobile-only
    replacement for the desktop margin rail (hidden below 980px). The first attempt
    mistakenly opened the "More" sheet instead (duplicating `mobile-more-actions`). Fixed to
    stay at the top of the Chen document, which does have margin items (2 letterhead-anchored
    "Vendor payment due" notes, confirmed present in the desktop margin rail screenshots) —
    the chips render correctly there.
11. **Module resolution**: `@playwright/test` doesn't resolve from
    `research/wayfinding-shots.mjs`'s own directory under native Node ESM (the script lives
    outside `apps/designer-portal`'s `node_modules` tree, and Node's ESM resolver — unlike
    CJS `NODE_PATH` — walks up from the *importing file's* location, not `cwd`). Fixed with a
    `research/node_modules` symlink to `apps/designer-portal/node_modules` (not a business
    write — purely a local dev convenience inside the artifacts dir, left in place for anyone
    re-running this harness).
12. **Sandbox note**: three-pass Chromium launches ("Check failed: kr == KERN_SUCCESS...
    Permission denied") required `dangerouslyDisableSandbox: true` for the actual shot runs —
    a sandbox mach-port-rendezvous restriction, not a product issue. Read-only verification
    (opening PNGs, grepping source, psql queries) all ran sandboxed normally.
13. **`shelf-callsheet-doorway`**: the hover-state delta on the Call sheet row is visually
    subtle in a static screenshot (no open panel — it's a doorway, not a leaf) — the shot
    still correctly shows the row's label/status in context; treat this one shot's "verified"
    as "content confirmed correct, hover affordance itself not independently provable from
    the PNG alone."

## Flag-on (Worktable)

Program: The Document — Wayfinding Review, E2 evidence:shots-flag-on. Run 2026-08-25 against
the STEWARD's live `pnpm dev:designer` server (port 3000), restarted with
`NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,
studio-workspaces:true,worktable:true'` — confirmed live in process env (steward's report).
These are the Worktable's first screenshots.

**Flag-live proof, before any content shot was trusted**: `TableFrame` (`table-frame.tsx:54`)
renders `<div data-table={table} data-table-setting={setting}>` around the composed table, and
`deriveTable` (`lib/document/table-derivation.ts`) maps `active_section='brief'` → `table:
'intake'`. The harness (`wayfinding-shots-wt.mjs`) opened the brief document and waited on
`page.waitForSelector('[data-table="intake"]')` before taking any other shot — this selector
matching *is* the proof the flag took (with the flag off, per E1, `TableFrame` renders only
`{children}` and no `data-table` attribute exists anywhere in the DOM). It matched on the first
try, at all three widths (`wt-flag-proof-intake-1440/1280/390.png`). Independently, the brief
document's flag-ON render also carries new content E1's flag-OFF `doc-brief` shot never showed
(three "opens when…" seam rows — `IntakeFutureSeams`, mounted only inside `data-table="intake"`)
— a second, content-level confirmation on top of the selector proof. **No `grep -rl
'worktable:true' apps/designer-portal/.next/static` was needed** — Next dev compiles per-route
on first visit (`.next/dev` had only 214 files before this run, none mentioning `worktable`;
that's normal for a dev server that hadn't been asked for `/doc/[id]` yet, not evidence the flag
was off), and the DOM proof above is direct rather than inferred from a build artifact.

Harness: `research/wayfinding-shots-wt.mjs` (new — copied and cut down from E1's
`wayfinding-shots.mjs`, same login/hide-overlay helpers, same corrected ladder ids). Three
passes, `SHOT_W=1440/1280/390`, all filenames prefixed `wt-`. **verified_count = 21** — every
PNG below was opened with the Read tool and classified by hand.

### Table

| name | width | verdict | what it shows | notes |
|---|---|---|---|---|
| wt-flag-proof-intake | 1440/1280/390 | verified (×3) | Flag-live proof shot — brief doc with `[data-table="intake"]` present | bonus evidence, not in the brief's required list |
| wt-intake | 1440/1280 | verified (×2) | Table I on the brief doc ("Full Room", Sarah Chen) — Brief section as before, PLUS three new "opens when…" seam rows (Schedule/Project·FF&E/Design authority) at the foot | the new content vs. E1's flag-off `doc-brief` |
| wt-speccing | 1440/1280 | verified (×2) | Table II on the direction doc ("Elena Marlowe — Living Room Direction") — rooms rail, Direction·v1 drafting card, scheme (0 items/Add a line), Capture Inbox (5 pending), boards strip, library reach-in | full tool set present |
| wt-finalize | 1440/1280 | verified (×2) | Table III on the sent proposal ("Aspen Loft — Living Room Refresh") — "Wait for the client's signature" guide, Proposal·v1 block, investment table $18,500, "The Offer" (Phases/Exclusions/Payments/Terms, all "not yet") | |
| wt-delivery-project | 1440/1280 | verified (×2) | Table IV/procurement on Chen Residence — needs-attention band, Schedule composer (3 starting-point options), Project·FF&E (3 lines), Design authority, Closing the book | margin rail shows 2 "Vendor payment" money items |
| wt-delivery-install | 1440/1280 | verified (×2) | Table IV/install on Aspen Loft Refresh — 1 overdue decision, Schedule timeline (Aug–Oct), Installation & Styling phase, a distinct "Install" spread ("Plan the install work", install window), Closing the book (1/6) | margin rail shows 4 real decision drafts, install-specific copy |
| wt-delivery-care | 1440/1280 | verified (×2) | Table IV/procurement-setting on Birch Hollow — Care band ("book closed Aug 25", Request client review), THEN an "Install" spread reading "Plan the care work" / "No FF&E lines are scheduled for installation" | **see Finding 1 below** |
| wt-intake-head | 1440 | verified | `IntakeSpreadHeader` clip: "CAPTURED BY YOU / The Ashfords (no-login household)" | shot on **discovery**, not brief — see notes |
| wt-speccing-tools | 1440 | verified | Clip of the whole `[data-table="speccing"]` frame: rooms rail → Direction·v1 → scheme → Capture Inbox | clip height capped at viewport (1400px) — library-reach-in row exists lower on the full page but fell outside this clip, see notes |
| wt-finalize-head | 1440 | verified | Clip of `[data-finalize-head]`: no headline text, just the "Preview as Client User" leader button | headline is empty **by design**, not a bug — see notes |
| wt-delivery-head | 1440 | verified | Clip of the Money region head (Authority/Plan/Committed/Moved) — release lift NOT present | see notes; release lift never appeared naturally |
| wt-delivery-project-390 | 390 | verified (fullPage) | Table IV/procurement on Chen Residence at mobile width — every tool (Schedule composer, FF&E lines, Design authority) renders as real content, not `display:none` | satisfies A4 doctrine check |
| wt-speccing-390 | 390 | verified (fullPage) | Table II on the direction doc at mobile width — rooms rail, scheme, Capture Inbox, boards strip ("Boards · 0 BOARDS"), "Reach into the library…" all present and readable | satisfies A4 doctrine check |

**21 files, 21 verified.** No unreachable/skipped shots in this pass — every state the brief
asked for was reachable from the existing ladder ids without a state mutation.

### The four tables, in plain words

**I — Intake.** On the brief document (a fresh lead) the table looks almost exactly like the
flag-off Brief section — same match/budget/timeline chips, same pull-quote, same accept/nurture/
pass controls — with one addition at the foot: three quiet rows reading "Schedule — opens when
the project begins," "Project · FF&E — opens with the direction," "Design authority — opens when
the project begins." They're inert (no click affordance visible, no button), just a preview of
what's coming — Q6's "printed identity only, never a control surface" doctrine, visible in
practice. On the discovery document the same table adds a second thing brief doesn't get: a
promoted identity line above the fold ("Captured by you / The Ashfords (no-login household)")
that isn't printed anywhere else on a discovery doc — its purpose, stated plainly, is to give a
discovery paper the same "who is this for" the brief already prints via its own section.

**II — Speccing.** The direction document turns into a small workbench: a rooms rail at the top
("Rooms · All · + Add a room"), the drafting-status card below it ("Direction · v1 — Not started
yet — open the Drafting Room to write it"), an empty item scheme ("0 items… The scheme starts
loose — a first line is enough" with Add Item/Add Allowance/Add TBD buttons), a live Capture
Inbox showing 5 pending vendor captures with thumbnails, a boards strip ("Start a board" — or, at
1280px, a folded "Boards · 0 boards · Unfold ↓" row — the same tool, two different chrome
depending on width), and a "Reach into the library…" line at the very foot. All four promised
tools (rooms rail / scheme / boards strip / library reach-in) are present and none of them
collapse to nothing on mobile — they reflow into a stacked column instead.

**III — Finalize.** The sent proposal (Aspen Loft) keeps its existing "Wait for the client's
signature" guide and signing-activity block essentially unchanged, then adds "The Offer" — four
checklist-style rows (Phases / Exclusions / Payments / Terms), each currently reading "no phases
yet," "none stated," "no schedule yet," "not yet written." This is the Drafting Room's Offer
movement folded open under the read-only proposal spread; it's honest about the proposal having
none of that content drafted yet rather than hiding the rows. The table's own promised "verdict
headline" is blank here — by design, per the component's own comment ("empty when the client has
not weighed in") — because this proposal was sent yesterday and has not been opened, so there are
no client verdicts yet to roll up; the "leader" slot correctly shows the one live action available
("Preview as Client User").

**IV — Delivery.** Three different documents land on this table with three different postures.
Chen Residence (a plain active project, `procurement` setting) gets the fullest picture: a
needs-attention band ("Name the phases for this project"), a three-option schedule composer
("The Patina Six" / "From a past project" / "Start blank"), the Project·FF&E ledger (3 lines,
$5,700+$1,920+$6,800), Design authority, and Closing the book — with two real "Vendor payment"
money items pinned in the margin rail. Aspen Loft Refresh (`install` setting) shows the install-
specific spread instead: a real phase timeline (Aug–Oct), "Installation & Styling — Main lane · In
progress," a distinct "Install" section ("Plan the install work" / "No FF&E lines are scheduled
for installation" / "Install window: no window is held — Hold a window"), and Closing the book at
1 of 6 — with four genuine decision drafts filed in the margin. Birch Hollow (`care`, but the
derivation resolves `case 'care'` to the **same `procurement` setting as Chen**, per
`table-derivation.ts:67-68`) shows the Care band first ("The book closed Aug 25 — Request client
review"), correct — but is then immediately followed by the exact same "Install" spread Aspen
Loft shows, with its copy half-swapped: the section heading literally says **"Install"** and the
empty-state line literally says **"No FF&E lines are scheduled for installation"**, while the
paragraph just above it correctly says "Plan the **care** work." See Finding 1.

### Findings

1. **Mislabeled FF&E spread on the Care table — heading says "Install" on a closed-out, care-
   stage document.** `doc/[id]/page.tsx` mounts `<FFESection mode="install" sectionKey="care"
   .../>` for `spreadSection === 'care'` (page.tsx:1436-1445) — deliberately reusing the
   `install` FF&E rendering mode for care documents. Inside `ffe-section.tsx`, the section's own
   heading (line ~1037) is hardcoded off `mode` alone: `mode === 'install' ? 'Install' :
   'Project · FF&E'` — it never consults `sectionKey`, so it prints the literal word "Install"
   regardless of which section actually called it. The empty-state copy at line 1232 ("No FF&E
   lines are scheduled for installation.") is likewise unconditional on `mode==='install'`. The
   *body* text one component over (`work-block.tsx:181`, `Plan the ${sectionLabel} work`) DOES
   read `sectionKey` correctly and prints "Plan the **care** work" — so the same spread carries
   both the correct word ("care") and the wrong one ("Install") a few lines apart. This is
   **not** Worktable/flag-gated code — `page.tsx`'s `mode="install"` call for the care section is
   unconditional, so a designer viewing a closed-out project's Care section (flag on or off)
   sees a section that calls itself "Install" work weeks or months after installation finished.
   Visible in `wt-delivery-care-1440.png` and `-1280.png`, roughly at the vertical midpoint of
   the page, directly under the Care band's "Request client review" line.

### Harness notes (E2-specific)

1. **Ids re-verified, not re-corrected.** psql against `127.0.0.1:54322` confirmed all 8 ladder
   ids (E1's two corrections included) still resolve to the same `active_section`/
   `proposal_status` E1 recorded — no further reseed happened between E1 and E2's runs. The
   harness carries E1's two corrected ids (`brief`, `project_rich`) verbatim.
2. **`wt-intake-head` shot on discovery, not brief, by design.** `IntakeSpreadHeader`'s own
   doc comment states it deliberately renders only on the Intake table's discovery spread,
   never on brief — brief's own `BriefSection` already prints the same three facts
   (name/arrival/description) below it, so the header would either duplicate them or print
   nothing on a brief document. Confirmed by reading the component before shooting; the brief's
   original wording ("brief or discovery doc") already allowed either.
3. **`wt-speccing-tools` clip is taller than one viewport's worth of content and gets cut off
   at the bottom.** `clipShot`'s width/height are clamped to the browser viewport
   (`Math.min(H - y, ...)`), and the full `[data-table="speccing"]` frame (rooms rail through
   Capture Inbox) runs past 1400px of content — the boards strip is the last thing visible in
   the clip; library-reach-in ("Reach into the library…") exists further down the page (visible
   in full in `wt-speccing-1440.png`/`wt-speccing-390.png`) but not in this particular clip.
   Not re-attempted with a taller viewport because the brief asked for "viewport/clipped" at
   1440, and a taller-than-viewport capture would stop being a viewport shot.
4. **`wt-finalize-head`'s clip is two lines, not a "head."** Verified via a one-off Playwright
   probe (`page.locator('[data-finalize-head]').innerHTML()`) that the div genuinely contains
   only the leader action group (`<button>Preview as Client User</button>`) — no `<h2>` — for
   this proposal. Traced to `useFinalizeLeader`: `headline` is `formatVerdictRollup(...)`, which
   the hook's own doc comment says is `"empty when the client has not weighed in"`; Aspen Loft
   was sent yesterday and has not been opened (0 client verdicts), so an empty headline is
   correct, not a rendering failure.
5. **`wt-delivery-head`: `ReleaseLift` never appeared naturally on any ladder document.**
   `page.tsx:1347`: `{deliveryProcurement && releaseOffered && <ReleaseLift />}` — `
   releaseOffered` is local component state, flipped only via `FFESection`'s
   `onReleaseOffered` callback (a runtime interaction the brief's "do NOT mutate state" rule
   forbids forcing). The harness checked for `[data-release-lift]` first and, finding none,
   fell back to the Money region head alone (after clicking its `data-fold-seam` unfold
   trigger, per E1's harness notes §7) — genuinely "the money seam," honestly missing "the
   release lift" half of the brief's ask.
6. **The "table is ready to turn" line (`[data-table-turn]`, `table-turn-line.tsx`) was checked
   on all 7 ladder documents and is absent on every one** — `TableTurnLine` only mounts when
   `pending` (the composition the derivation would compose *now*) differs from `composition`
   (the pinned one), i.e. only after `active_section` or `proposalStatus` has moved since the
   table was last pinned. None of the 7 states in the ladder are mid-transition, so this line
   was never observed. Not forced, per the brief.
7. **Filename collision fixed mid-run.** The harness's `shot()`/`clipShot()` helpers write to
   `${PREFIX}${name}.png`; an early version of the script both set `PREFIX=wt-` by default AND
   named the per-table shots `wt-intake` etc., so the 1280 pass silently overwrote the 1440
   pass's files under the same filename (`wt-wt-intake.png`, from `wt-` + `wt-intake`). Caught
   before any content was verified — fixed by embedding the width in the per-table shot names
   (`intake-${W}` → `wt-intake-1440.png`, `wt-intake-1280.png`, no collision) and re-running
   both passes clean. No PNG in the table above was verified from a since-overwritten file.
8. **Sandbox note**: same as E1 — three-pass Chromium launches needed
   `dangerouslyDisableSandbox: true` (mach-port-rendezvous restriction, not a product issue).
