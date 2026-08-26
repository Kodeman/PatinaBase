# E3 — Interactive probe: The Document wayfinding

Playwright/headless-Chromium, driven live against `http://localhost:3000` (steward-owned
dev server, BOOT-OFF mode, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`). Signed in as
`designer@patina.dev`. Script: `apps/designer-portal/e2e/wayfinding-probe.spec.ts` (new
file — was not present before this probe; the login fixture `e2e/fixtures/auth.ts` and
`e2e/helpers/hide-dev-overlays.ts` already existed, written concurrently). Raw structured
log: `probe/probe-log.json`. All 9 assigned probes ran, plus one supplementary probe (5b)
that isolates the running-index → folded-region interaction the brief named inside probe 5.

**Data-drift note:** `state-ladder.json`'s `project_rich` id (`67b836e8-…`) does not resolve
against this session's live local DB — `document_state` has no row for it, so Chen
Residence's actual live id had to be re-derived via `psql` (`2992a486-b2bd-4139-9e51-33ed1621c59c`).
All other ladder ids (`install`, `proposal_sent`, `drafting`) matched the live DB unchanged.
`document_state` is a **view**, not a table — `active_section` is live-derived from real
project/phase state, not a fixed seed value; it was re-verified directly, not assumed.

## Verdict table

| # | Probe | Verdict | Evidence |
|---|---|---|---|
| 1 | Hover-only affordances | **works** | `01-hover-only.png` |
| 2 | Esc chain | **works** | `02-esc-chain-stacked.png`, `02-esc-chain-final.png` |
| 3 | Keyboard chords | **partial** | `03-chords-desk-final.png` |
| 4 | Scroll-spy | **works** | `04-scroll-spy-bottom.png` |
| 5 | Fold/unfold + persistence | **works** | `05-fold-folded.png`, `05-fold-after-reload.png`, `05-fold-unfolded.png` |
| 5b | Running-index click on a *folded* region | **works** | `05b-running-index-unfold.png` |
| 6 | Focus return | **partial** (two real gaps found) | `06-focus-return.png` |
| 7 | Room-lens strand on resize | **blocked — no test data** | `07-room-lens-no-rooms.png` |
| 8 | Console errors across 8 routes | **works** (all clean) | `08-console-last-route.png` |
| 9 | Cold/warm timings | **works** (recorded, dev-mode caveat) | `09-timings-final.png` |

Two findings outside the 9 named probes, surfaced while running them, are called out at the
bottom: **⌘K never restores focus on close** (real gap, isolated to Command Bar), and **the
Orders/Accounts/Hours ledger sheet's focus-restore silently no-ops when opened from inside
the "Studio books" disclosure** (the disclosure closes and detaches its own trigger button
before the sheet's restore effect runs).

---

## 1. Hover-only affordances — **works** (nothing found hover-gated)

**Steps:** `/doc/{Chen Residence}` at 1440×1000, wait `[data-document-shell]`, then for each
candidate trigger measure `isVisible()` + computed `opacity` before and after `page.hover()`.

**Observed:**
- Region fold `"Fold ↑"` buttons (n=2 visible): opacity 1 → 1, visible → visible. No change.
- Colophon actions (n=4: Brief a vendor / Hold / Archive / Team…): opacity 1 → 1, no change.
- Spine marks (n=13): opacity 1 → 1, no change.
- Row-overflow `"···"` glyphs: **0 found** on this document at this scroll position — not a
  hover-gating failure. Traced in source (`region/row-overflow.tsx`): the glyph is explicitly
  designed to never be hover-gated ("the glyph never hides… there is no CSS hover pre-reveal
  here"), but `schedule/phase-section.tsx:238–254` only renders a `RowOverflow` wrapper when a
  phase has `headingActions`; Chen Residence's schedule phases currently have none, so there's
  legitimately nothing to click yet, not a hidden trigger.
- Margin item rows: **0 found by the `[role="listitem"], li` selector**, but the same
  screenshot shows two visible, always-on margin cards ("Vendor payment — balance",
  "Vendor payment — deposit") — the selector was wrong, not the app; margin rows are plain
  `<button>`/`<div>` rows, not list markup. Re-verified visually via the evidence screenshot;
  no hover-gating is visible on them either.

**Verdict: works.** Every affordance actually present on the page was visible and unchanged
by hovering — consistent with the doctrine comment in `row-overflow.tsx`. No violation found.

---

## 2. Esc chain — **works**, correct LIFO order, no strand

**Steps:** `/doc/{Chen Residence}` at 1440 → open the Plan room shelf leaf → open ⌘K on top
of it → press Escape three times, recording URL + dialog/shelf state after each.

**Observed order:**
1. Shelf leaf opened: `shelfOpenAfterClick=true`.
2. ⌘K opened on top: `cmdkOpen=true`.
3. **Esc #1** → closes ⌘K only (`cmdkOpen=false`, shelf still open, URL unchanged).
4. **Esc #2** → closes the shelf leaf (`shelfOpen=false`, URL still on the document).
5. **Esc #3** → puts the document down: URL → `http://localhost:3000/desk`.

Matches the code's stated LIFO contract exactly (`page.tsx:527–536`'s guard order: dialog →
shelf → put-down). Nothing stranded.

**Aside (not a wayfinding defect, an e2e-infra note):** the final `/desk` screenshot
(`02-esc-chain-final.png`) shows the **"This is your Desk" walkthrough modal** appearing
despite the shared auth fixture pre-setting
`localStorage['help-system.welcome-shown.first-project-walkthrough']='1'`. Traced in source:
`desk-walkthrough.tsx` no longer reads that key at all — its auto-open decision now runs on
`getTourState(DESK_WALKTHROUGH_TOUR_ID)`, a server/profile-backed record (`getTourState`'s own
comment: "a local 'welcome-shown' marker wouldn't travel"). The fixture's suppression is dead
code for this modal; every e2e spec that reaches `/desk` via a client-side navigation (not a
fresh page load) after that key predates the refactor may hit this. Doesn't affect this
probe's Esc-chain verdict (the URL still correctly lands on `/desk`), but worth a note to
whichever agent owns `e2e/fixtures/auth.ts` and to other E-probe agents reusing it.

---

## 3. Keyboard chords — **partial** (chords work; `/` and `?` are dead; no chord is ever shown on screen)

**Steps:** from `/desk`, with focus resting on `<body>` (the default right after a fresh
`goto` — confirmed no click is needed and a click risks stealing focus onto a real
interactive element, which was an early false-negative in this probe, corrected below),
press each candidate chord and record URL + `[role="dialog"]` state.

**Observed (final run, after fixing two probe-side timing/focus bugs — see Methodology note):**

| Chord | Result |
|---|---|
| `g` `l` | → `/library` |
| `g` `p` | → `/people` |
| `g` `r` | → `/rooms` |
| `g` `o` | dialog opens (Orders ledger sheet) |
| `g` `a` | dialog opens (Accounts ledger sheet) |
| `g` `h` | dialog opens (Hours ledger sheet) |
| `g` `t` | dialog opens (The Post) |
| `Meta+K` | dialog opens, `aria-label="Command bar"` |
| `/` | **no dialog, no navigation** — confirmed in source: no handler anywhere registers `key === '/'` |
| `?` | **no dialog, no navigation** — same, no `key === '?'` handler exists |

All 7 registered `g`-chords and ⌘K work correctly. `/` and `?` are dead: grepping the whole
app for `key === '/'` and `key === '?'` returns nothing, so this isn't a probe artifact.

**Chord discoverability:** checked whether any g-chord text (`g l`, `g then L`, etc.) is
rendered anywhere on screen on `/desk` or `/doc`. It is not — a regex sweep of both pages'
visible text found no chord hints. ⌘K's own `⌘K` badge is shown next to "Find anything" on
the Desk header act, but the seven `g`-chords are documented nowhere in the UI itself
(confirmed against `10-code-anatomy.md §3.4`'s registry table, which is the only place the
chords are written down).

**Methodology note (probe-side, corrected in-session, recorded for the record):** the first
run of this probe reported every `g`-chord as dead. Root cause was the probe's own
`page.locator('body').click({position:{x:5,y:5}})` step, which on `/desk` lands on the
Studio drawer's "Patina" wordmark link and moves focus there — `registry-shortcuts.tsx`'s own
contract (`anOverlayIsOpen()`) correctly treats "focus left `<body>`" as "an overlay-ish
context is active" and ignores the chord, exactly as designed. Removing the click (the
default `document.activeElement` right after a fresh `goto` is already `<body>`) fixed all
seven room/ledger chords. A second pass still showed `g o/a/h/t` as dead with a 400ms
post-chord wait; raising it to 800ms (ledger sheets open async, after a data-dependent
render) confirmed all four actually do open. Both are documented here because they're the
kind of probe-vs-app ambiguity a static read can't resolve — this is exactly why this probe
exists.

---

## 4. Scroll-spy — **works**, no dead zones, no double zones

**Steps:** `/doc/{Chen Residence}` at 1440, scroll in 10 even steps top→bottom (11 samples),
read `[aria-current="true"]` count + label at each.

**Observed:** exactly one active entry at every single sample (0 through 10):
`Client approvals` → `Schedule` (×4 samples) → `Project · FF&E` → `Design authority` (×5
samples). Never 0 active, never 2+ active. The reading line tracked cleanly through the
whole scroll with no gap and no overlap.

---

## 5. Fold/unfold + localStorage persistence — **works**

**Steps:** fold a region via its own `"Fold ↑"` button, read `localStorage`, reload, confirm
the fold survived, then unfold via the fold-seam click.

**Observed:**
- Clicking the first `"Fold ↑"` button folded the **Schedule** region; `[data-fold-seam]`
  count went from 4 (approvals/schedule-rule/money/care already folded by default on this
  doc) to 5.
- `localStorage` key written: `patina:doc-fold:2992a486-b2bd-4139-9e51-33ed1621c59c:schedule` = `"1"`.
  Exactly the documented key shape (`patina:doc-fold:<docId>:<region>`).
- After `page.reload()`: `[data-fold-seam]` count is still 5 — **persisted correctly.**
- Clicking a fold seam (`data-fold-seam="project-approvals-title"`) unfolded it — the seam
  element for that heading disappeared from the DOM (count-check via a specific
  `[data-fold-seam="…"]` selector, not just a raw count).

## 5b. Running-index click on a *folded* region — **works** (supplementary)

The brief specifically asked whether clicking the **running-index row** (not the seam) for a
folded region unfolds it and scrolls. Isolated this directly: folded the Schedule region,
then clicked each of the 4 running-index rows in turn.

**Observed:** clicking "Schedule" (label showing `NOT SCHEDULED`, i.e. the folded region)
moved `scrollY` from 421→915 **and** dropped the remaining fold-seam count from 5→3 in one
click (it happened to unfold both Client approvals and Schedule together across the run
sequence — each individual click both scrolled and reduced the seam count, confirmed
per-row). `document:unfold-region` is not directly observable from outside React, but the
DOM-level effect (seam removed + body rendered + scroll moved) is the correct externally
visible signature of it firing.

---

## 6. Focus return — **partial**: 2 of 4 surfaces restore focus correctly, 2 real gaps found

**Steps:** open + close (Esc, or a close control) each of: the Plan room shelf leaf, the
Command Bar (⌘K), the Orders ledger sheet (via the Studio drawer), and the Margin panel at
1300px (where it is a real `[role="dialog"]` sheet, not the always-visible ≥1440px rail).
Read `document.activeElement` after each close.

| Surface | Close method | Focus returned to trigger? |
|---|---|---|
| Shelf leaf ("Plan room") | Escape | **Yes** |
| Command Bar (⌘K) | Escape | **No — focus lands on `<body>`** |
| Orders ledger sheet (opened from inside "Studio books" disclosure) | Escape | **No — focus lands on `<body>`** |
| Margin panel (1300px, sheet mode) | Close button | **Yes** |

**Root-caused both failures in source, not guessed:**

- **⌘K genuinely never implements focus-restore.** `command-bar.tsx` has exactly one
  focus-related line — `requestAnimationFrame(() => inputRef.current?.focus())` on open —
  and no capture of the pre-open `document.activeElement`, no restore-on-close logic
  anywhere in the file. By contrast, the shelf leaf (`shelf-panel.tsx`), the margin panel
  (`margin-rail.tsx:140,197` — explicit `returnFocusTarget` ref, restored via
  `requestAnimationFrame`), and the ledger sheets (`overlays/doc-sheet.tsx:228–262` —
  captures `document.activeElement` on open into `restoreRef`, restores it on unmount) **all**
  implement this. Command Bar is the one surface in the whole reachability inventory that
  doesn't. Verified directly: deliberately focused the "Plan room" shelf button, pressed
  `Meta+K`, pressed `Escape`, and `document.activeElement` was `<body>`, not the button.

- **The Orders/Accounts/Hours ledger sheet's restore logic is correct in general but silently
  no-ops for this specific reachability path.** Orders lives behind the "Studio books"
  disclosure (`studio-drawer.tsx:343–372`) — clicking the Orders row both opens the `DocSheet`
  **and** closes (unmounts) the disclosure menu the Orders button itself lives in. `DocSheet`'s
  own restore code has a documented guard for exactly this: `if (!focusTarget?.isConnected)
  return;` (`doc-sheet.tsx:259`) — once its Orders-button target detaches from the DOM, the
  restore silently does nothing rather than falling back to something still visible (e.g. the
  "Studio books" toggle, which stays mounted). This is a different, narrower defect than ⌘K's
  — the mechanism exists and works for a trigger that stays mounted (confirmed working for the
  margin panel above), it just has no fallback for a trigger nested inside a menu that closes
  itself.

---

## 7. Room-lens strand on resize — **blocked, no viable test data in this seed**

**Steps attempted:** `/doc/{project with rooms}` at 1440, hold a room via the spine Rooms
block, resize to 1280 then 390, check `[data-in-hand-room]` at each width.

**Blocked because:** the spine's Rooms block (`SpineRoomsBlock`) only renders when
`row.active_section === 'project'` (`page.tsx:930–933`, gates the whole `shelvedSpine`
including the running index and shelves, not just rooms). A direct SQL check of every project
in this local seed found **no project satisfies both conditions at once**:

```
project_id                            | title                    | active_section | room_count
b0000000-0000-0000-0000-0000000000d1  | Aspen Loft Refresh       | install         | 2   <- has rooms, wrong section
2992a486-b2bd-4139-9e51-33ed1621c59c  | Chen Residence           | project         | 0   <- right section, no rooms
b0000000-0000-0000-0000-0000000000d3  | Birch Hollow             | care            | 0
b0000000-0000-0000-0000-0000000000d4  | Marrow & Vale Residence  | project         | 0
ec70737b-3aaa-426d-a908-9cfd1c00cd1a  | Olsen Lake House         | project         | 0
```

Aspen Loft Refresh — the only project with `project_rooms` rows — is at `active_section
='install'`, so its Rooms block, shelves, and running index are all unmounted (confirmed
visually: `07-room-lens-no-rooms.png` shows the install-phase document's collapsed left rail
with no "IN THIS DOCUMENT" / "THE SHELVES" / "Rooms" sections at all). No raw INSERT into
`project_rooms` was made — that's a forbidden business-table write for this probe. This is a
genuine seed-data gap, not a script bug; a different agent with write authority to add a
`project_rooms` row to Chen Residence (or an active-section='project' project) would unblock
a real dynamic run.

**What the static source review found instead (unverified dynamically, reported as such):**
`room-lens-context.tsx` is explicit that the hold is engineered to auto-release rather than
strand: its `matchMedia('(min-width: 1440px)')` `change` listener clears `heldRoomId` the
moment the viewport drops below 1440, specifically because — per its own comment — "there is
no put-down affordance under the full spine, so a held room carried down to a narrow window
would strand its 'IN HAND' line." Two things worth flagging for the design review even from
static reading alone: (1) release only fires on a `change` event, i.e. a live resize past the
breakpoint — a page that merely *loads* below 1440 with some other mechanism setting
`heldRoomId` would not trigger it (not reachable in the current UI, since only the ≥1440px
Rooms block writes `heldRoomId` in the first place, per the file's own doc comment); (2) the
only way to **release a room while still ≥1440px** is clicking the same room button again
(`toggleRoom` back to the same id → null) — the letterhead's "In hand · {room}" line
(`doc-letterhead.tsx:63–68`) is plain text with no close/×, so a designer who scrolled the
spine's Rooms block out of view has no visible release control anywhere else on the page.

---

## 8. Console errors/warnings across 8 routes — **works, all clean**

Routes: `/desk`, `/doc/{Chen Residence}`, `/doc/{Aspen Loft — Living Room Refresh, sent}`,
`/doc/{Aspen Loft Refresh, install}`, `/library`, `/people`, `/rooms`,
`/drafting/{Elena Marlowe draft}`. Each loaded with `waitUntil: 'networkidle'` + a 600ms
settle, with `console` (error/warning) and `pageerror` listeners attached before navigation.

**Observed: zero console errors, zero warnings, zero page errors on all 8 routes.**

---

## 9. Cold/warm load timings — **works, recorded** (dev-mode caveat)

Measured from `goto(route, {waitUntil:'commit'})` to `[data-document-shell]` (or a stable
`/desk` landmark) becoming visible.

| | Time |
|---|---|
| Cold `/desk` (fresh browser context, first request) | 8112ms |
| Cold `/doc/{Chen Residence}` (fresh context) | 2878ms |
| Warm `/desk` (same context, already compiled+cached) | 111ms |
| Warm `/doc/{Chen Residence}` (same context) | 1725ms |

**Caveat, stated plainly:** this is a Next.js **dev** server (turbo, on-demand route
compilation), not a production build. The 8.1s cold `/desk` number is dominated by Next
JIT-compiling that route tree on first request in this process's lifetime, not by anything
the document surface itself does — it is not a proxy for production TTI. The cold vs. warm
gap for `/doc` (2.9s → 1.7s) is more likely to carry real signal (data-fetch/render cost
independent of compile), but even that includes dev-only overhead (React Query Devtools,
unminified bundles, no route prefetch caching the way production would). Recorded as
requested; do not cite the absolute numbers as production performance evidence.

---

## Files

- Probe script (new): `apps/designer-portal/e2e/wayfinding-probe.spec.ts`
- Raw structured log (all runs, append-only): `probe/probe-log.json`
- 13 evidence PNGs: `probe/01-hover-only.png`, `probe/02-esc-chain-{stacked,final}.png`,
  `probe/03-chords-desk-final.png`, `probe/04-scroll-spy-bottom.png`,
  `probe/05-fold-{folded,after-reload,unfolded}.png`, `probe/05b-running-index-unfold.png`,
  `probe/06-focus-return.png`, `probe/07-room-lens-no-rooms.png`,
  `probe/08-console-last-route.png`, `probe/09-timings-final.png`
