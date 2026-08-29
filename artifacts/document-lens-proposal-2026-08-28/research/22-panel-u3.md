# 22 — Panel U3: The spine as instrument

Seat: U3 (UX/UI, Sonnet, medium). Surface: `/doc/[id]`. Unit of analysis: four scroll states
(top/seam/mid/foot) × three widths (1440/1280/390), per the program's standing grid.

---

## 1. One line

The rail is not a map of the paper's depth — it is a second table of contents wearing four
tenses at once (Put down = leaving, the seven marks = the whole arc, the active caption =
this minute, the breath = right now), it never changes as the reader actually reads (its
ink is bit-for-bit identical at s0/s1/s2/s3 — 54.9% at 1440, 24.0% at 1280, confirmed in
`12-layout-measurements.md`), it goes almost fully dark before any project exists (657px of
void at 1440 on the pre-work doc), and at the one width where a working designer is most
likely to sit for hours — 1180–1439 — it sheds the only part of itself that was ever a map
(the running index) down to a 56px glyph column, with nothing standing in for what it lost.

---

## 2. Answers, in order

### (1) Ink vs void at each scroll state, 1440 and 1280

Source: `research/12-layout-measurements.json` / `.md`. The headline fact for a spine review
is that **none of these numbers change across s0→s3** on the rich document at either
desktop width — the rail's DOM does not respond to scroll position (only the active-caption
text and the breathing dot do, and neither is captured by the ink metric). So "what the rail
*is*" at each state is, empirically, the same object photographed four times:

- **1440, rich, s0/s1/s2/s3 (all identical):** ink 54.9% of the 900px rail; longest empty
  run 270px (y 630→900, the foot); interactive-child count 8; marker-row extent 181×49.5px
  laid out **horizontally** (y 94.5–144). At 54.9% ink this is the densest state the rail
  ever reaches — Put down, 7 marks, active caption, 4-row running index, the full timer
  card, the presence line — and it is already showing before the reader has scrolled at all
  (`w1440-rich-s0.png`), so the "instrument" reads as fully deployed at rest, not something
  that reveals itself as she works.
- **1280, rich, s0/s1/s2/s3 (all identical):** ink drops to 24.0%; longest empty run grows
  to 296px; interactive-child count drops to 3 (of the same 8 at 1440 — the running
  index's ~4 buttons plus the timer's Pause/+Log are simply gone from the DOM's visible
  form, per `doc-spine.tsx:141` `hidden` and `spine-timer.tsx:128` `min-[980px]:block`
  nested inside a `min-[1440px]:block` wrapper). Marker row re-lays **vertically**,
  41.5×373.5px (y 81–454.5) — confirmed in `w1280-spine-glyph-rail.png`.
  the rail becomes: Put down (word + glyph), 7 marks stacked, active caption (`Project /
  ACTIVE`), a compact timer doorway (`In hand / 21m`). Nothing else.
- **1440, prework, s0/s1 (s2 not applicable, no FF&E region on this doc; s3 collapses):**
  ink 13.9%, longest empty run **657px** — more than 70% of a 900px viewport is blank rail
  stock. `w1440-prework-s0.png` shows exactly this: Put down, 4 marks (of 7, cropped visibly
  toward "future"), a `Proposal / AWAITING SIGNATURE` caption, a presence line — and
  nothing between the caption and the foot. No running index mounts (empty `regions` array,
  `document-index.ts:81`), and no full `SpineTimer` card was observed in this shot either
  (unlike the rich doc), so the void is even larger than the arithmetic difference between
  "index present" and "index absent" would suggest.
- **1280, prework, s0/s1:** ink 20.7% (higher than the 1440 figure because the glyph rail's
  fixed elements — marks, put-down, compact caption — occupy proportionally more of a
  rail that has nothing else to lose), longest empty run 340px.

**What the rail *is*, stated plainly:** at 1440 it is a static instrument panel that front-
loads its densest form at rest and never becomes denser or sparser as the reader moves
through the paper; at 1280 it is the same panel with its most information-bearing third
(the index, the timer, the presence line) physically deleted from the accessible DOM; on a
pre-work document at either width it is close to bare scaffolding.

### (2) The second-look test, tenant by tenant

*"Something earns the left edge only if it is true across the whole document at once, or
true outside this document."*

- **Put down (`doc-spine.tsx:48`) — IN.** "Leaving this document" is true outside the
  document by construction (`/desk`) and is the one universal exit every document shares.
  No sentence about *this* paper changes whether Put down belongs at the edge.
- **The seven-mark row (`:99-110`) — IN.** The arc (brief→discovery→direction→proposal→
  project→install→care) is true across the whole document at once — it does not describe a
  scroll position, it describes the paper's total shape, visible identically from any
  scroll state (confirmed: marker-row rects are unchanged s0→s3 in the measurement data).
  This is the one tenant that actually satisfies the test's first clause.
- **The active label pair (the caption under the marks, `doc-spine.tsx:122-136`) — OUT, as
  currently built.** It fails both clauses: it is true only *right now*, at the current
  scroll position (it changes: `Client approvals` at s0/s1, `Pieces` at s2, `Money` at s3 —
  confirmed across `w1440-rich-s0/s2/s3.png`), and it says nothing that is true outside the
  document. It also duplicates information already on the page — the active region's own
  `<h2 data-region-head>` (e.g. "Pieces", `w1440-region-head-ffe.png`) prints the same name
  the caption prints, at 24px versus the caption's 11-12px. The sentence that decides it:
  *a two-line text block whose entire content changes on every scroll tick, and that
  repeats a heading the reader can already see on the page, is not a fixed instrument — it
  is a live readout, and a live readout belongs fused into the map's position marker (the
  reading line the running index already owns), not standing beside it as its own block.*
- **`spine-running-index.tsx` — IN, and the strongest tenant on the rail.** `On this paper`
  lists the whole project spread's regions (approvals/schedule/ffe/money) at once, derived
  from `PROJECT_PAPER_ORDER` — the canonical mount order, not a scroll-dependent snapshot.
  This is genuinely "true across the whole document at once": it is the one place the rail
  currently behaves like a map rather than a caption.
- **`spine-timer.tsx` (the full card: elapsed figure, Pause/Resume, +Log, note/adjust) —
  OUT.** This is a session widget — "you have been in this document for 18 minutes" is true
  only for the current visit and is not a fact about the paper's structure. It fails both
  clauses of the test. Per the probe log, the timer is a genuinely live clock (advances
  without an explicit start), which reinforces that it belongs with other live, per-session
  chrome (the Studio Drawer, already global per D8) rather than with the paper's fixed
  navigational furniture.
- **The presence line ("Just you · visible to the studio") — OUT.** This is collaboration
  metadata about the current session, not a fact about the document's shape. It is not true
  "across the whole document" (it can change mid-session, e.g. `You and …`) and it is not a
  fact "outside this document" either — it is squarely a session fact. It is the cheapest
  item to relocate: one static mono line with no interactive behavior measured anywhere.
- **`doc-breath` on the active mark — IN, but only as a property of an already-IN tenant.**
  It is not a separate item competing for space; it is a 3s opacity swell applied to
  whichever mark in the (IN) arc row is currently active (R15). Its "right now" tense rides
  on top of a tenant that already earned its place, so it costs nothing extra.

**The diagnosis, tested rather than assumed:** the brief's suspicion holds. The rail's top
third — Put down (leaving) immediately followed by the arc (the whole document) immediately
followed by the active caption (this minute) with the breath (right now) sitting inside the
arc itself — genuinely does compress four different tenses into roughly the first 145px of
rail (Put down ~44px + marker row ~49.5px + caption ~40px at 1440, per the anatomy's own
class list), and two of those four tenants (the caption, and — one section down — the
timer) fail the test outright when actually applied rather than assumed.

### (3) What the horizontal seven-mark row teaches, correctly and wrongly

**Correctly:** it teaches sequence (there is a fixed, ordered path — brief before discovery
before direction, etc.), it teaches scope (there are exactly seven phases, no more, no
fewer — Lynch's "edge" of the whole system is visible at a glance), and inert future marks
correctly teach "not yet reached" as distinct from "skipped" (R124/I146's stage-sentence
work backs this). At 1440 this reads almost like a mile marker for the whole engagement —
a genuine landmark, visible identically at every scroll state.

**Wrongly:** every mark is drawn at the same size regardless of what it contains. `xs` at
1440 is 22px wide for `brief` exactly as it is for `project` — and per this program's own
seed data, `project` is where the shelved running index gains four sub-regions
(approvals/schedule/ffe/money) each with their own body content, while `brief`,
`discovery`, `direction`, and `proposal` mount zero index rows at all
(`document-index.ts:81`). A Lynch "district" is supposed to communicate extent along with
identity; this row deliberately withholds extent — seven identical glyphs cannot
distinguish "a one-page proposal" from "the region that will consume the rest of this
reader's week." A first-time reader scanning the row at s0 has no way to predict that most
of her future scrolling lives inside mark 5 of 7.

### (4) The pre-work rail, read by a designer in week one

`w1440-prework-s0.png` / `s1.png`, cross-checked against `document-index.ts:76-82`
(`paperRegionsForSection`: `[]` for every section except `project`/`install`/`care`) and
`12-layout-measurements.md`'s prework rows. In week one — brief, discovery, direction, or
proposal — the rail she sees is: Put down, the seven marks (mostly future/inert), a two-
line caption (`Proposal / AWAITING SIGNATURE`), and a presence line. **No "On this paper"
heading ever appears, because `SpineRunningIndex` returns `null` on zero entries
(`spine-running-index.tsx:61`) and the section-to-region map hands it zero entries by
design.** The rail's single most map-like feature is completely absent for four of the
paper's seven phases — the exact phases a new engagement spends its first weeks in.

**What an index line with no number behind it reads as, once regions do exist:** the same
component (`spine-shelved-blocks.tsx:63-65`) that renders `On this paper` rows for a
populated project also has fallback text for a region with nothing in it yet — `'Money
unread'`, `'Nothing moving yet'`, `'Reading…'` — printed in the exact same row shape, same
weight, same position as a row carrying real numbers (`w1440-spine-full.png`'s `Schedule /
NOT SCHEDULED` is the same pattern, already live). **This is the design problem the brief
names:** before any question of data volume, the rail gives an empty region's line no
different visual claim on the reader's attention than a live, urgent one — "Money · $6,200
OWED" and a hypothetical "Money · Nothing moving yet" sit at the same font size, same
indent, same list position. A reader has to *read the words* to learn a row is inert; the
row's shape alone doesn't tell her. That is fixable in the map's visual grammar regardless
of whether the underlying seed ever grows past 3 FF&E lines.

### (5) What the 56px glyph column loses at 1180–1439, and where it does not re-appear

Measured directly (`interactive-child count in the rail drops from 8 (1440) to 3 (1280)`,
`12-layout-measurements.md`), confirmed visually in `w1280-spine-glyph-rail.png` against
`w1440-spine-full.png`. Lost, itemized:

- The entire `On this paper` running index — all region rows (Client approvals, Schedule,
  Pieces, Money on the rich doc), each with its status value (`0 IN THE LOG`, `NOT
  SCHEDULED`, `3 PIECES · 0 ROOMS`, `$6,200 OWED`).
- The full `SpineTimer` card's Pause/Resume control, `+ Log` control, and the note/adjust
  block — the compact doorway shows only the bare elapsed figure (`In hand / 21m`), with
  no controls visible in the captured state.
- The presence line (`Just you · visible to the studio`) — absent from
  `w1280-spine-glyph-rail.png` entirely.

**Kept:** Put down (word form), all seven marks (now vertical), and the active-section
caption (still present at `text-[11px]`, confirmed showing `Project / ACTIVE` in the shot).

**Where it re-appears, checked:** the money/schedule/pieces/approvals values that vanish
from the index are **partially** duplicated in the job ticket's eight rows, which render
identically at every width (`Money — $6,200 owed you, 15 days`, `Pieces — 3 unspecified`),
so a reader scrolled to the top of the paper can still find that data in the ticket. But the
**presence line has no duplicate anywhere measured** at 1180–1439 — the margin rail sits
closed-by-default as an off-canvas sheet at this width (`12-layout-measurements.md` caveat
4) and carries no presence indicator in its header per the anatomy notes, and the mobile
bar/sheets pattern only exists below 1180. Confidence 0.7 that no equivalent exists at this
width outside the rail — what would settle it: opening the margin sheet and the account
avatar area at 1280 and confirming neither prints a collaborator line.

### (6) What a depth-map rail would have to show, that it does not today

- **Position within the whole:** not the seven-mark arc (which shows phase, not depth-into-
  phase) but something like "you are 40% through Project" — nothing today measures or
  displays fractional position inside a phase.
- **Each region's extent:** a Pieces row that reads "3 pieces" gives a count but not a
  sense of how much reading/scrolling that count implies relative to the paper's total
  length; nothing on the rail today encodes length (e.g. a proportional bar, a rough
  scroll-distance figure).
- **Which regions carry an exception:** the ticket's seam already ranks exceptions
  (`money-at-risk` / `promise-past-due` / `piece-stuck`, `ticket-derivation.ts:826-830`) —
  but that ranking is *not* surfaced per-region on the rail's index; `On this paper` prints
  plain values (`$6,200 OWED`), not a flag distinguishing "overdue and needs you" from
  "on track."
- **Distance to the next thing that needs her:** the red-letter zone/`DocumentGuide`
  computes exactly this kind of "next up" reasoning already (`page.tsx:1838-1847`), but it
  lives in the header stack, not on the rail — the rail has no equivalent of "next stop."
- **Where she has already been:** nothing on the rail distinguishes read/settled regions
  from unread ones beyond the coarse `settled`/`active`/`future` state on the seven marks;
  within the *active* mark (`project`, where four regions live) there is no finer-grained
  "already visited" signal at all.

### (7) Where Put down, the timer, and the presence line should live if the rail becomes a map

Answered for both desktop widths together, since the cost pattern is the same shape at each
even though the absolute pixels differ:

- **Put down** — stays in the rail, top, exactly where it is. It is already IN by the
  second-look test and costs the map nothing: it is a fixed 44px (1440) / similar (1280)
  band regardless of what fills the rest of the rail. No reason to move it; moving it away
  from the one place a reader's eye already goes to leave would only add friction to the
  one universal exit.
- **The timer** — move to the Studio Drawer (global chrome on every screen per D8) or fold
  into the letterhead's vitals row as a compact live figure. Cost: the full `SpineTimer`
  card claims roughly 130-160px of rail height at 1440 (border + `px-3 py-2.5` + elapsed
  line + control row + note block, per the anatomy's class list) for zero navigational
  value; removing it returns that space directly to the map (position/extent/exception
  content from Q6). At 1280 it is already reduced to a doorway icon, so the visual cost of
  moving it is close to zero there — the win is consistency, not reclaimed pixels.
- **The presence line** — move next to the collaborator avatar that already exists in the
  document's top chrome (`Leah Hartwell` appears in the bottom bar in `w1440-rich-s0.png`;
  a "who else is here" fact belongs beside a face, not as an isolated mono caption at the
  foot of a navigation rail). Cost: near zero — it is a single static line with no measured
  interactive behavior, and its current position (bottom of the rail, `mt-2`) is not load-
  bearing for anything else on the rail.

Net effect at both widths: removing the timer and presence line from the rail frees the
exact vertical budget (roughly 150-200px at 1440) that Q5 shows disappears entirely at
1280–1439 today — meaning the map content that currently *cannot* survive the compact tier
could fit in the space reclaimed from content that never belonged on the rail in the first
place.

### (8) What a navigator would need to know that this evidence pack does not tell her

- **Usage, not just layout.** Nothing here measures click-through on Put down, the seven
  marks, the running-index rows, or the compact timer doorway. A redesign that reallocates
  space on the assumption that the index is "the strongest tenant" (per Q2) is working from
  structural reasoning alone, with no confirmation that designers actually use it today.
- **Real-world region extent.** The rich seed has 3 FF&E lines and 0 rooms
  (`12-layout-measurements.md` caveat 1) — any depth-per-region meter designed against this
  specimen would need calibrating against production distributions (a project with 60 FF&E
  lines) before its proportions mean anything; this pack cannot supply that.
- **Screen-reader / keyboard behavior of the spine specifically.** The probe log (`03-
  interactive-probe.md`) walks the ticket, region fold, Esc/⌘K, and CLS in detail, but does
  not tab through the seven marks or the running-index button list — a map redesign
  changing what's focusable in the rail has no baseline a11y walk to compare against.
- **Whether "exception" flags generalize beyond the ticket.** The ticket's seam ranks three
  exception kinds (`money-at-risk`/`promise-past-due`/`piece-stuck`); it's unconfirmed
  whether that vocabulary is meant to (or could) drive a per-region flag on a rail map, or
  whether it's ticket-specific plumbing.
- **The I114 mapping.** The canon digest flags that `active_section` (what the seven marks
  track) and the region set (what the running index tracks) are related but not identically
  keyed, and that reconciliation is a session Kody has left owed through every prior wave
  (`11-canon-digest.md`, (C) I114 line). A depth-map that organizes "position within the
  whole" by region rather than by section is building on ground nobody has ruled stable
  yet.

---

## 3. Findings

```json
{ "id": "U3-01", "lens": "U3", "persona": null, "task_ids": ["T1","T3"],
  "key": "doc|1440|all|rail-ink-scroll-invariant",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "off",
  "title": "Rail's ink density never changes across scroll states",
  "observation": "Spine ink utilisation reads 54.9% at s0, s1, s2, and s3 alike (rich/1440); marker-row rects and interactive-child count (8) are identical at every state.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s0.png","w1440-rich-s2.png"], "refs": ["research/12-layout-measurements.md"] },
  "severity": "medium", "confidence": 0.85, "already_ruled": null,
  "suggested_fix": "Give the rail a live position signal that visibly changes with scroll, not just the caption text.",
  "hesitation_seconds_estimate": 5 }
```

```json
{ "id": "U3-02", "lens": "U3", "persona": null, "task_ids": ["T1","T3"],
  "key": "doc|1280|all|rail-index-and-timer-fully-hidden",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "Compact rail deletes the index, full timer, and presence line",
  "observation": "Interactive-child count drops from 8 (1440) to 3 (1280); `On this paper`, the SpineTimer card's Pause/+Log/note controls, and the presence line are absent from `w1280-spine-glyph-rail.png`.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 400,
  "evidence": { "shots": ["w1280-spine-glyph-rail.png","w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:141,145"] },
  "severity": "high", "confidence": 0.85, "already_ruled": null,
  "suggested_fix": "Keep a compact index (values only, no timer/presence) instead of dropping it entirely between 1180 and 1439.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U3-03", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|1440|foot|rail-270px-dead-run",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "off",
  "title": "270px of rail stock carries nothing at the foot of the rail",
  "observation": "Longest empty run on rich/1440 measures 270px (y 630-900), present unchanged at s0 through s3.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 270,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["research/12-layout-measurements.md"] },
  "severity": "low", "confidence": 0.8, "already_ruled": null,
  "suggested_fix": "Spend the rail's lower third on depth content (extent/exception markers) rather than leaving it blank.",
  "hesitation_seconds_estimate": 3 }
```

```json
{ "id": "U3-04", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|1440|top|prework-rail-657px-void",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "Pre-work rail is 70%+ empty at 1440",
  "observation": "Prework/1440 rail ink is 13.9% with a 657px longest empty run; only Put down, four cropped marks, an 'AWAITING SIGNATURE' caption, and a presence line render below the marks.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 657,
  "evidence": { "shots": ["w1440-prework-s0.png"], "refs": ["research/12-layout-measurements.md"] },
  "severity": "high", "confidence": 0.85, "already_ruled": null,
  "suggested_fix": "Give week-one sections (brief/discovery/direction/proposal) their own index content instead of returning null.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U3-05", "lens": "U3", "persona": null, "task_ids": ["T3"],
  "key": "doc|1440|all|active-caption-fails-second-look",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "off",
  "title": "Active label pair duplicates the on-page region heading",
  "observation": "Rail caption reads 'Pieces' at s2, matching the page's own <h2> 'Pieces' region head verbatim, at 11-12px vs the head's 24px.",
  "why_it_blocks": "crowding",
  "frame_cost_estimate": 40,
  "evidence": { "shots": ["w1440-rich-s2.png","w1440-region-head-ffe.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:122-136"] },
  "severity": "medium", "confidence": 0.7, "already_ruled": null,
  "suggested_fix": "Fuse the caption into the running index's own reading-line marker rather than a separate text block.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U3-06", "lens": "U3", "persona": null, "task_ids": ["T3"],
  "key": "doc|1440|all|timer-fails-second-look",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "off",
  "title": "Full session timer sits in the navigation instrument",
  "observation": "The 'IN HAND / 18 min / PAUSE / + LOG' card renders permanently on the rail; it is a per-visit session fact, not a document-structure fact.",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 150,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/spine-timer.tsx:91-181"] },
  "severity": "medium", "confidence": 0.75, "already_ruled": null,
  "suggested_fix": "Move the full timer card to the Studio Drawer; keep the rail free for depth content.",
  "hesitation_seconds_estimate": 8 }
```

```json
{ "id": "U3-07", "lens": "U3", "persona": null, "task_ids": ["T3"],
  "key": "doc|1440|all|presence-line-fails-second-look",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "off",
  "title": "Presence line is session metadata, not a navigation fact",
  "observation": "'JUST YOU · VISIBLE TO THE STUDIO' prints as the rail's last line at every scroll state, describing session collaboration, not document structure.",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 40,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:150-154"] },
  "severity": "low", "confidence": 0.7, "already_ruled": null,
  "suggested_fix": "Move the presence line beside the collaborator avatar already shown in the document's chrome.",
  "hesitation_seconds_estimate": 5 }
```

```json
{ "id": "U3-08", "lens": "U3", "persona": null, "task_ids": ["T1","T3"],
  "key": "doc|1440|top|marker-row-equal-weight-hides-depth",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "Seven marks give every phase the same visual weight",
  "observation": "Each StrataMark is 22px (xs) regardless of phase; 'project' shelves four sub-regions (approvals/schedule/ffe/money) while 'brief'/'discovery'/'direction'/'proposal' shelve zero.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/lib/document/document-index.ts:76-82"] },
  "severity": "high", "confidence": 0.8, "already_ruled": null,
  "suggested_fix": "Vary mark length/weight by the region content each phase actually shelves.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U3-09", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|1280|top|marker-row-vertical-loses-arc-legibility",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "top", "flag": "off",
  "title": "Vertical mark stack reads less like a single arc than the horizontal row",
  "observation": "At 1280 the seven marks lay out 41.5x373.5px vertically (y 81-454.5), stretching what was a compact 181x49.5px horizontal row at 1440 across nearly half the viewport height.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 373,
  "evidence": { "shots": ["w1280-spine-glyph-rail.png"], "refs": ["research/12-layout-measurements.md"] },
  "severity": "low", "confidence": 0.55, "already_ruled": null,
  "suggested_fix": "Compress or bind the vertical mark stack visually (a single connecting rule) so it still reads as one arc.",
  "hesitation_seconds_estimate": 6 }
```

```json
{ "id": "U3-10", "lens": "U3", "persona": null, "task_ids": ["T4"],
  "key": "doc|1440|top|prework-week-one-no-index",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "Brief/discovery/direction/proposal never mount a running index",
  "observation": "`paperRegionsForSection` returns [] for every section but project/install/care; `SpineRunningIndex` returns null on zero entries, so 'On this paper' never renders in week one.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 300,
  "evidence": { "shots": ["w1440-prework-s0.png"], "refs": ["apps/designer-portal/src/lib/document/document-index.ts:76-82","apps/designer-portal/src/components/document/spine-running-index.tsx:61"] },
  "severity": "high", "confidence": 0.85, "already_ruled": null,
  "suggested_fix": "Give week-one sections their own index content (even if it's just 'no regions yet') rather than nothing.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U3-11", "lens": "U3", "persona": null, "task_ids": ["T4"],
  "key": "doc|1440|top|empty-index-line-same-weight-as-live-one",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "An empty region's index line looks identical to a live one",
  "observation": "Fallback text ('Money unread', 'Nothing moving yet') and live values ('$6,200 OWED') print at the same font size, weight, and row position in the same component.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/spine-shelved-blocks.tsx:63-65"] },
  "severity": "medium", "confidence": 0.65, "already_ruled": null,
  "suggested_fix": "Visually recede empty-state index rows (lighter weight, italic) distinct from populated ones.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U3-12", "lens": "U3", "persona": null, "task_ids": ["T1","T3"],
  "key": "doc|1280|all|no-presence-equivalent-outside-rail",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "No presence indicator exists anywhere at 1180-1439 once hidden",
  "observation": "The margin rail sits closed-by-default (off-canvas sheet) at 1280 and carries no presence line in its header per the anatomy notes; the mobile bar pattern only exists below 1180 -- confidence 0.7, would settle by opening the margin sheet and account avatar at 1280 to confirm.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 40,
  "evidence": { "shots": ["w1280-spine-glyph-rail.png"], "refs": ["research/12-layout-measurements.md"] },
  "severity": "medium", "confidence": 0.7, "already_ruled": null,
  "suggested_fix": "Surface presence somewhere persistent at 1180-1439 (e.g. beside the account avatar) rather than only in the full rail.",
  "hesitation_seconds_estimate": 12 }
```

```json
{ "id": "U3-13", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|1440|all|no-exception-flag-on-index-rows",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "off",
  "title": "Running index doesn't flag which regions carry an exception",
  "observation": "'Money / $6,200 OWED' prints as plain text; the ticket's own seam ranks this same fact as an exception (money-at-risk) elsewhere, but the index gives it no visual distinction.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:826-830"] },
  "severity": "medium", "confidence": 0.6, "already_ruled": null,
  "suggested_fix": "Reuse the ticket's exception ranking to mark index rows that need attention.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U3-14", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|1440|all|no-distance-to-next-on-rail",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "off",
  "title": "Rail has no 'what needs you next' signal of its own",
  "observation": "The red-letter zone/DocumentGuide computes next-up reasoning already, but it lives in the header stack (page.tsx:1838-1847), not on the rail; the rail has no equivalent.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1838-1847"] },
  "severity": "low", "confidence": 0.6, "already_ruled": null,
  "suggested_fix": "Surface a 'next stop' pointer on the rail instead of only in the folding header.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U3-15", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|1440|all|no-already-visited-signal-within-active-mark",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "off",
  "title": "No 'where I've been' signal inside the active phase's four regions",
  "observation": "The seven marks show settled/active/future at the phase level only; within 'project' (where approvals/schedule/ffe/money all live) nothing distinguishes regions already scrolled past.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:64-120"] },
  "severity": "medium", "confidence": 0.6, "already_ruled": null,
  "suggested_fix": "Add a lightweight visited/unvisited state to the running index's own rows.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U3-16", "lens": "U3", "persona": null, "task_ids": ["T3"],
  "key": "doc|all|top|four-tenses-top-third-of-rail",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "Top ~145px of rail mixes leaving, the arc, the moment, and right-now",
  "observation": "Put down (leaving), 7-mark row (whole arc), active caption (this moment), and the breathing dot (right now) all sit within the first ~145px of vertical rail space.",
  "why_it_blocks": "crowding",
  "frame_cost_estimate": 145,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:46-136"] },
  "severity": "medium", "confidence": 0.75, "already_ruled": null,
  "suggested_fix": "Separate the exit affordance from the live position readout visually (extra rule or spacing).",
  "hesitation_seconds_estimate": 8 }
```

```json
{ "id": "U3-17", "lens": "U3", "persona": null, "task_ids": ["T3"],
  "key": "doc|1280|top|four-tenses-top-third-of-rail-1280",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "top", "flag": "off",
  "title": "Compact rail still mixes leaving, arc, and moment at the top",
  "observation": "Put down, the vertical 7-mark stack, and the 'Project / ACTIVE' caption appear together above the compact timer doorway in `w1280-spine-glyph-rail.png`.",
  "why_it_blocks": "crowding",
  "frame_cost_estimate": 100,
  "evidence": { "shots": ["w1280-spine-glyph-rail.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:46-136"] },
  "severity": "low", "confidence": 0.65, "already_ruled": null,
  "suggested_fix": "Same separation treatment as the 1440 finding, adapted to the narrower column.",
  "hesitation_seconds_estimate": 6 }
```

```json
{ "id": "U3-18", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|390|top|mobile-sheet-outperforms-desktop-compact-rail",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "top", "flag": "off",
  "title": "Mobile's spine sheet is a better map than the 1280 glyph rail",
  "observation": "`m390-mobile-spine-sheet.png` lists all seven sections by full name with a status line each (NOT RECORDED / ACTIVE / --), plus a margin summary -- richer than the 56px glyph column shown at 1280.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["m390-mobile-spine-sheet.png","w1280-spine-glyph-rail.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:441"] },
  "severity": "low", "confidence": 0.7, "already_ruled": null,
  "suggested_fix": "Bring the mobile sheet's per-section status list into the 1180-1439 compact rail as an on-demand panel.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U3-19", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|1440|foot|s3-active-caption-mismatches-frame-content",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "off",
  "title": "Rail says 'Money' active while the frame shows roster/authorizations",
  "observation": "At s3 the rail caption reads 'Money' (bold, ruled) while the visible frame shows 'AUTHORIZATIONS & TRADE SCOPES', 'The accounts', 'Closing the book', and a roster row -- none labeled Money.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s3.png"], "refs": ["apps/designer-portal/src/hooks/use-document-running-index.ts:81-87"] },
  "severity": "medium", "confidence": 0.55, "already_ruled": null,
  "suggested_fix": "Verify the foot-of-paper fallback (last present key) reads correctly against what's actually visible at the foot.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U3-20", "lens": "U3", "persona": null, "task_ids": ["T1","T3"],
  "key": "doc|1440|all|timer-and-presence-cost-quantified",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "off",
  "title": "Timer + presence claim ~190px of rail with zero navigational value",
  "observation": "SpineTimer card (border, padding, elapsed line, control row, note block) plus the presence line together occupy roughly 150-190px of the 900px rail at rest.",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 190,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/spine-timer.tsx:128","apps/designer-portal/src/components/document/doc-spine.tsx:145-154"] },
  "severity": "medium", "confidence": 0.7, "already_ruled": null,
  "suggested_fix": "Relocate both to reclaim ~190px for depth-map content (extent bars, exception flags).",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U3-21", "lens": "U3", "persona": null, "task_ids": ["T3"],
  "key": "doc|1440|seam|ticket-still-unfolded-at-defined-seam-state",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "off",
  "title": "Program's own s1 'seam' definition doesn't match what renders",
  "observation": "`w1440-rich-s1.png` shows the ticket still fully unfolded (8 rows, 'FOLD UP' control) even though the brief defines s1 as 'the ticket pinned as its two-line seam'; measurement confirms ticket height 347px (unfolded) at s1.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s1.png"], "refs": ["research/12-layout-measurements.md"] },
  "severity": "low", "confidence": 0.6, "already_ruled": null,
  "suggested_fix": "Reconcile the program's s1 definition with the actual pin/fold timing, or note the discrepancy for other seats.",
  "hesitation_seconds_estimate": 5 }
```

```json
{ "id": "U3-22", "lens": "U3", "persona": null, "task_ids": ["T1"],
  "key": "doc|1440|top|prework-rail-lacks-timer-card-too",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "Pre-work rail shows no timer card at all, unlike the rich doc",
  "observation": "`w1440-prework-s0.png` shows no 'IN HAND' timer box beneath the caption, unlike the rich doc's identical-width shot, suggesting SpineTimer's mount is conditional on session state not yet triggered on this doc.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-prework-s0.png","w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/spine-timer.tsx:91-128"] },
  "severity": "low", "confidence": 0.5, "already_ruled": null,
  "suggested_fix": "Confirm whether the timer's mount condition is intentional or a session-state edge case worth documenting.",
  "hesitation_seconds_estimate": 5 }
```

---

## 4. What stays true

1. **The seven-mark arc genuinely earns the edge.** It is the one tenant that passes the
   second-look test outright — true across the whole document at once, unchanged by
   scrolling. Any lens redesign should keep a whole-arc landmark, even if its per-mark
   weighting changes.
2. **The running index (`On this paper`) is the closest thing to a real map today** and
   should survive as the seed of any depth-map redesign, not be replaced wholesale.
3. **The scroll-spy mechanism itself is fast and correct** — the probe log confirms zero
   flicker on click (an immediate, held `aria-current` within 50ms, stable past the 700ms
   jump lock) and a reading band that leads the eye rather than trailing it. Whatever
   content the map ends up carrying, the underlying position-tracking plumbing does not
   need to be rebuilt.
4. **Region fold's focus-on-unfold discipline works exactly as documented** — unfolding a
   region reliably lands focus on its heading. This is worth preserving as the model for
   any new disclosure a lens redesign adds to the rail.
5. **The mobile spine sheet already demonstrates a workable fuller map** (full section
   names + status per row) that the compact desktop tier could learn from rather than
   needing to invent a new pattern from scratch.
6. **`--doc-seam-height`'s single-writer contract is clean** and any lens work touching the
   header/rail relationship should keep reading it rather than introducing a second offset
   source.
