# W2 walk — Smart Lens ladder rail, mobile sections sheet, money landing, room-in-hand

Server: `:3000` confirmed serving `.codex/worktrees/agent-lens-w2-int` cwd
(`lsof -p 46800 -d cwd` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-w2-int/apps/designer-portal`).

**Provenance discrepancy:** the brief names `document-lens/w2` = integration @ `06ad45de9`.
The worktree's actual `git log -1 --oneline` is:

```
5a6eb0049 feat(document): W2 integration — the ladder is wired; presence in the drawer; Boards
```

`06ad45de9` does not appear anywhere in this branch's history (`git log --oneline | grep 06ad45de9` — zero
matches). Branch is `document-lens/w2`, working tree clean apart from sandbox-denied `.env*` stat noise. Walking
proceeded against the live `5a6eb0049` server since that is what `:3000` actually serves — flagging the mismatch
rather than guessing which SHA is stale.

## Seed check

`docker exec -i supabase_db_supabase psql -U postgres -d postgres < build/seed/seed-verify.sql` — **15 PASS, 2
FAIL** (brief expected 17 PASS):

```
                       check_name                       |   actual   |  expected  | result
--------------------------------------------------------+------------+------------+--------
 a non-clean receiving_inspections row exists           | 1          | >= 1       | PASS
 a separate PO reaches clean-delivered >= 1              | 1          | >= 1       | PASS
 blocked lines = 2 (console + COM)                      | 2          | = 2        | PASS
 damaged = 1                                            | 1          | = 1        | PASS
 install milestone = current_date + 21                  | 2026-09-19 | 2026-09-19 | PASS
 lines >= 60                                            | 62         | >= 60      | PASS
 lines with product >= 40                               | 58         | >= 40      | PASS
 margin_items beside Pieces (anchor=line) = 3           | 3          | = 3        | PASS
 margin_items total = 7                                 | 8          | = 7        | FAIL
 margin_items whole job (anchor=letterhead/section) = 4 | 5          | = 4        | FAIL
 open damage_claims on a line of this project = 1       | 1          | = 1        | PASS
 overdue approvals = 2                                  | 2          | = 2        | PASS
 PO unacknowledged >= 14d = 1                           | 1          | = 1        | PASS
 pre-work doc d6 exists (sent, unopened)                | 1          | = 1        | PASS
 purchase orders >= 3                                   | 4          | >= 3       | PASS
 rooms >= 4                                             | 5          | >= 4       | PASS
 unspecified = 2                                        | 2          | = 2        | PASS
(17 rows)
```

`margin_items total` is 8 vs an expected 7, and the whole-job anchor count is 5 vs an expected 4 — one extra
`margin_items` row landed in the whole-job bucket somewhere between when the fixture was authored and now. Not a
Smart Lens defect (margin/margin_items belongs to a different surface), but it means the seed is not in the exact
state the walk brief assumes; noted rather than silently walking past it.

## Walk script

`build/w2-walk.mjs` (copied from `build/w1-walk.mjs`, renamed `w2-*`, extended). One correction made mid-run: the
original `[data-index-region="ffe"]` locator (unscoped) picked the rail's own ladder button first — that attribute
is reused on `spine/lens-ladder.tsx`'s segment buttons (`data-index-region={segment.key}`) as well as on the real
body region roots, and the rail copy is `hidden` below 1180px, so at 390 the walk hung for 30s waiting for an
invisible element. Fixed by scoping to `[data-document-paper] [data-index-region="ffe"]` (same convention the
project's own `quiet-responsive-shell.spec.ts:320` uses for `money`).

All 12 base states + all requested clips captured, 25 PNGs total in `build/w2-walk/`.

## Acceptance table

| # | Bullet | Result | Evidence |
|---|---|---|---|
| 1 | Rail is a ladder — six segments in paper order (Client approvals · Schedule · Pieces · Money · Closing the book · The record), each with name + value line at 1440 | **seen** | `w2-1440-s0-project.png` / `w2-1440-spine-clip-s0.png`. Values: `NOTHING YET`, `INSTALL SEP 19 · 3 WEEKS`, `62 LINES · 1 DAMAGED`, `$17,500 OUT · $28,080 UNDRAWN`, `NOTHING YET`, `4 COMPLETE`. |
| 2 | `--rule-mid` reading bracket beside the active segment, moves on scroll (s0 vs s2) | **seen** | s0: bracket beside `Client approvals` (`w2-1440-spine-clip-s0.png`, `w2-1280-spine-clip-s0.png`). s2: bracket beside `Pieces` at both 1440 and 1280 (`w2-1440-spine-clip-s2.png`, `w2-1280-spine-clip-s2.png`). s3: bracket beside `The record` (`w2-1440-s3-project.png`, `w2-1280-s3-project.png`). Money-jump: bracket beside `Money` (`w2-1440-money-landed-spine-clip.png`). Confirmed moving at both widths. |
| 3 | The value of the segment whose head is in frame is still printed (`headInFrame` not wired — note) | **seen, as expected for this wave** | With Money's region head landed essentially exactly at the ticket seam (see row 9 — as "in frame" as this state gets), the rail still prints `$17,500 OUT · $28,080 UNDRAWN` under `Money` rather than yielding to just the name (`w2-1440-money-landed-spine-clip.png`). Source confirms: `lens-ladder.tsx` accepts `headInFrame` but `doc-spine.tsx` never passes a live value (defaults to `null`); `w2-review-correctness.md` C-13 documents this as landing latent until W3 wires the observer. This is the documented not-yet-wired state, not a new regression. |
| 4 | Room rungs under Pieces at 1440 (Living room · Dining room · Primary bedroom · Mudroom · Kitchen) and NOT at 1280 | **seen, with a DOM caveat** | Rungs only render when Pieces is the reading position or a room is held (`printRooms = activeKey === 'ffe' \|\| heldRoom`, `lens-ladder.tsx:76`) — at s0 (default active = Client approvals) no rungs show at either width, which is correct, not a gap. With Pieces active (s2 / room-in-hand) at **1440**: all five rungs visible (`w2-1440-spine-clip-s2.png`, `w2-1440-room-in-hand-spine-clip.png`). At **1280** in the same active state: a direct DOM probe found `[data-room-chip]` count = 5 but `offsetParent: false` on all five (CSS `hidden min-[1440px]:block`) — **present in the DOM, not visually seen**, confirming the "NOT at 1280" visual bullet while also reproducing the review's already-filed **C-03** finding (focusable-but-`display:none` rows break the roving-tabindex/Tab walk at 1280). |
| 5 | `FILED WITH THIS JOB` with `Plan room · Spec book · Boards · Call sheet` | **differs — real layout collision at 1440 when Pieces is expanded** | The heading and all four doors are present and correctly labelled at every width/state (1440 s0/s3, 1280 all states, 390 sections sheet). But at **1440**, whenever Pieces is the active/held segment (so its 5 room rungs render), the doors block visually **overlaps** the tail of the rail instead of being pushed below it. See dedicated finding below. |
| 6 | `Put down` above the head; head = household · arc · `PROCUREMENT & ORDERS` / `3 OF 5` | **seen** | `← PUT DOWN` top-left, `Client User` household line, brand mark strip, `PROCUREMENT & ORDERS` / `3 OF 5` arc + progress — all four widths/states. |
| 7 | At 1280 every label prints as words, the arc wraps 4+3 | **seen (labels), differs (wrap count)** | All labels print as full words at 1280 (`Client approvals`, `Closing the book`, etc. — no truncation, confirmed in `w2-1280-spine-clip-s0.png`). The arc itself wraps as two lines — `PROCUREMENT &` / `ORDERS` — which by word count is 2+1 (or 13+6 characters), not an obvious "4+3" split. Reporting the literal wrap observed; flagging the bullet's specific "4+3" phrasing as not matching what's on screen for this seed's arc text (nothing else on the rail wraps at 1280). |
| 8 | Pieces prints `62 LINES · 5 ROOMS · 1 DAMAGED` form at 1280 | **seen, exact match** | `w2-1280-spine-clip-s0.png` / `-s2.png`: `Pieces / 62 LINES · 5 ROOMS · 1 DAMAGED`. |
| 9 | Pressing `Money` lands the region head under the ticket seam (`[data-index-region="money"]` top ≈ seam) | **seen — pass, 0.36px delta** | `moneyLanding` measurement: `seamHeight = 64`, `regionTop = 64.359375`, `delta = 0.359375`. Well inside the project's own e2e tolerance (`quiet-responsive-shell.spec.ts` gates ≤ 4px). `w2-1440-money-landed-full.png` shows the Money region head at the very top of the scrollable column. |
| 10 | Room in hand prints `IN HAND · LIVING ROOM` + `Put down the room` in the head, `aria-pressed` on the rung | **seen, exact match** | DOM: `data-spine-room-in-hand` text `"In hand · Living Room"` (CSS-uppercased to `IN HAND · LIVING ROOM` on screen), `data-spine-release-room` button text `"Put down the room"`, `[data-room-chip]` `aria-pressed="true"`. `w2-1440-room-in-hand-full.png` / `-spine-clip.png`. |
| 11 | At 390 sections sheet prints `Put down`, six stops with value lines, `aria-current` on the reading stop, four doors | **seen, exact match** | `w2-390-sections-sheet-clip.png`: `← PUT DOWN · BACK TO THE DESK`, all six stops with value lines, `Client approvals` row shaded (its `aria-current` count = 1, confirmed programmatically), `FILED WITH THIS JOB` + `Plan room` / `Spec book` / `Boards` / `Call sheet` (the last cropped in the screenshot but present in the captured dialog `innerText`). Sheet also continues below the fold with a `ROOMS` nav list and the `IN THE MARGIN` items — out of scope for this walk but noted. |
| 12 | Mobile bar prints `AT <STOP>` and it CHANGES between s0 and s2 (frozen-first-paint fix) | **seen** | s0: `AT CLIENT APP…` (truncated "At Client Approvals", `w2-390-mobile-bar-clip-s0.png`). s2: `AT PIECES` (`w2-390-mobile-bar-clip-s2.png`). s3: `AT THE RECORD` (`w2-390-s3-project.png`). Confirmed changing across scroll states — the frozen-first-paint defect from before this wave does not reproduce. |
| 13 | Old `On this paper` list is gone | **confirmed gone** | No "On this paper" text or `role="group"` of that name in any screenshot or DOM query. Replaced by `nav[aria-label="This paper"]` (name change per the review's C-4 ruling). |
| 14 | No timer/presence in the rail | **confirmed** | Only `Client User` (a static household/presence identity line, part of the head design) appears inside `[data-document-spine]`. The `IN HAND TODAY · 2h 0m` timer visible at the very bottom of full-page shots lives in the page's persistent global footer bar, outside the spine element entirely. |

## The overlap defect (row 5), in numbers

Reproduced twice independently — scrolling Pieces into reading position (s2) and pressing the Living room heading
(room-in-hand) — both at 1440. A direct DOM probe on the room-in-hand state:

```
Mudroom     top=582.0  bottom=631.5   (a room rung, inside the ladder's nav)
Filed with this job   top=587.0  bottom=621.0   (the doors heading, a sibling block after the nav)
Kitchen     top=631.5  bottom=681.0   (a room rung)
Plan room   top=625.5  bottom=675.0   (the first door)
```

`Filed with this job` (587–621) sits entirely inside `Mudroom`'s box (582–631.5); `Plan room` (625.5–675) overlaps
`Kitchen` (631.5–681) by ~43.5px. This is a genuine visual collision, not a screenshot artifact — the rects come
straight from `getBoundingClientRect()`. The ladder's track div (`ref={trackRef}`, `spine/lens-ladder.tsx:147`,
classes `relative flex min-h-0 flex-1 flex-col`) measured a bounding height of **259px** while its own rendered
children (room rungs included) extend to **331.75px** past the track's top — `min-h-0` lets the flex item shrink
below its content's natural height inside the `nav`'s `flex-1` column, and with no `overflow:hidden` the overflow
spills downward into the doors block, which is a normal-flow sibling positioned immediately after the
now-too-short track box. `[data-document-spine]` itself reports `scrollHeight === clientHeight === 900` — the
aside is not scrolling itself (the failure mode the existing review's **C-26**/RF-05 note anticipated); instead
the inner track shrinks and its own content overlaps the next sibling. Screenshots: `w2-1440-spine-clip-s2.png`
(Money/Filed-with-this-job/Plan-room garbled over Closing-the-book/Mudroom/Kitchen) and
`w2-1440-room-in-hand-spine-clip.png` / `-full.png` (same collision, one segment further down since Pieces holds
a segment's worth of extra content while a room is held).

Does not reproduce at 1280 (no room rungs ever render there, so Pieces never grows past its collapsed height).

## Measurements

| Measurement | Value |
|---|---|
| `[data-document-spine]` width at 1280 | **136px** (matches the expected value) |
| `[data-document-spine]` width at 1440 | 200px |
| Rail head height (`[data-spine-head]`) at 1440 | **117px** |
| Rail head height (`[data-spine-head]`) at 1280 | **139.5px** |
| Ladder track height (`nav[aria-label="This paper"]`, s0) at 1440 | 648px |
| Ladder track height (`nav[aria-label="This paper"]`, s0) at 1280 | 639px |
| Money-jump landing delta (`\|regionTop − seamHeight\|`) | 0.36px (seamHeight 64, regionTop 64.36) |

### R1 instrument — distinct `innerText` lines in the rail, 1440/s0

**Count: 21.** In order:

```
1.  ←
2.  PUT DOWN
3.  Client User
4.  PROCUREMENT & ORDERS
5.  3 OF 5
6.  Client approvals
7.  NOTHING YET
8.  Schedule
9.  INSTALL SEP 19 · 3 WEEKS
10. Pieces
11. 62 LINES · 1 DAMAGED
12. Money
13. $17,500 OUT · $28,080 UNDRAWN
14. Closing the book
15. The record
16. 4 COMPLETE
17. FILED WITH THIS JOB
18. Plan room
19. Spec book
20. Boards
21. Call sheet
```

(Matches the standalone `build/w2-r1-instrument.mjs` run already on disk from earlier the same day — same 21,
same order — so this is stable across runs, not a fluke of timing.)

### Label-only count (excluding value lines)

The brief asks for this "separately" without defining the split, so the rule used here is stated explicitly:
a **value** line is one that carries a measured reading — it contains a digit, or is the literal fallback text
(`NOTHING YET` / `NOT KNOWN YET`). Everything else — segment names, the arc, the household/presence line, the
back control, and the doors — is a **label** line. Under that rule:

- **Value lines (6):** `3 OF 5`, `NOTHING YET`, `INSTALL SEP 19 · 3 WEEKS`, `62 LINES · 1 DAMAGED`,
  `$17,500 OUT · $28,080 UNDRAWN`, `4 COMPLETE`
- **Label-only lines (15):** `←`, `PUT DOWN`, `Client User`, `PROCUREMENT & ORDERS`, `Client approvals`,
  `Schedule`, `Pieces`, `Money`, `Closing the book`, `The record`, `FILED WITH THIS JOB`, `Plan room`,
  `Spec book`, `Boards`, `Call sheet`

**Label-only count = 15.** (This is a judgment call on where to draw "label" vs. "value" for the back-arrow glyph,
the `PUT DOWN` action, and the `Client User` presence line — all three lack digits and are counted as labels
here; a stricter reading that treats them as chrome rather than content would put the label count at 12.)

## Console errors (quoted)

```
[console error @1440] Failed to load resource: the server responded with a status of 500 (Internal Server Error)
[console error @1440] Failed to load resource: net::ERR_NAME_NOT_RESOLVED
[console error @1280] Failed to load resource: the server responded with a status of 500 (Internal Server Error)
[console error @1280] Failed to load resource: net::ERR_NAME_NOT_RESOLVED
[console error @390] Failed to load resource: net::ERR_NAME_NOT_RESOLVED
```

The `500` fires once per context, right after `page.goto('/auth/signin?...')`, before the sign-in form is even
interacted with — same transient shape `w1-walk.md` recorded ("occurred once, before the sign-in redirect
resolved") and did not recur once signed in. The `ERR_NAME_NOT_RESOLVED` triples fire once per context at the
bottom of the long paper (s3) — consistent with an unreachable external asset domain referenced from `The record`
/ care-band spread, not from anything this wave touched. No console errors were observed from the ladder, the
sections sheet, the money-jump, or the room-in-hand interactions themselves.

## Files

- Screenshots/clips: `build/w2-walk/*.png` (25 files)
- Raw measurements: `build/w2-walk/measurements.json`
- R1 instrument (prior run, cross-checked): `build/w2-walk/r1-rail-labels.json`, `build/w2-walk/w2-1440-s0-rail.png`
- Walk script: `build/w2-walk.mjs`

## Commands run unsandboxed (W2-walk)

- `docker exec -i supabase_db_supabase psql -U postgres -d postgres < build/seed/seed-verify.sql` — seed check
- `node build/w2-walk.mjs` — first attempt (hung on the unscoped `[data-index-region="ffe"]` locator at 390, killed)
- `node /tmp/debug390.mjs` — ad hoc debug script to inspect the two `[data-index-region="ffe"]` matches (rail button vs. body region) and their visibility
- `node build/w2-walk.mjs` — corrected run, produced all 25 screenshots + `measurements.json`
- `node /tmp/roomrungs.mjs` — ad hoc script confirming room-chip DOM presence/visibility at 1440 vs 1280 when Pieces is active
- `node /tmp/overlap-check.mjs` — ad hoc script measuring the `Filed with this job` / `Mudroom` / `Plan room` / `Kitchen` bounding boxes that document the overlap defect
