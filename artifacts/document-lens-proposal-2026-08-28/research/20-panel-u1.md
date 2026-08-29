# 20 — Panel U1 · Attention & focus architecture

Seat: **U1** (Opus, high effort). Grid: four scroll states (`s0 top` · `s1 seam` · `s2 mid` ·
`s3 foot`) × three widths (1440×900 · 1280×800→measured at 900 · 390×844). Docs: **rich** = Chen
Residence project spread; **prework** = Aspen Loft — Living Room Refresh proposal.

**Shots I could not use:** `prework-s2` at all three widths — no PNG exists and none was written; the
proposal document renders zero `[data-region-head]` / `[data-index-region]` elements
(`01-shot-ledger.md` capture-caveats; `12-layout-measurements.md` caveat 2–3). Every other shot in
my minimum set was read. `w1440-letterhead-vitals-phases-open.png` is verified but shows no
additional content (Chen has 0 phases), so I did not use it to judge the Phases fold's opened form.

**Seed-thinness caveat, stated once and referenced per finding:** the rich rung carries 3 FF&E
lines, 0 rooms, 0 phases, no client. Findings that depend on richness are marked; the direction each
would move on a real 60-line, 4-room schedule is given inline.

---

## 1. One line

At `s1` — the offset the whole program is named for — **the only thing the document removes from the
frame is its own name.** At 1440 `s1` (scrollY 226) not one string on screen says *Chen Residence*:
the 40px letterhead has scrolled off, the ticket is still unfolded at its full 347.25px and prints
`THE JOB · PROJECT`, the spine caption prints `Project` / `ACTIVE`, and the margin prints nothing
about this job at all. The 19 other things the top band asked her to hold at `s0` are all still
there — five ways of saying nothing is scheduled, five money statements carrying four different
numbers, five ticket rows whose entire content is that nothing exists — and the one item that
answered *which paper am I holding* is the single item scroll took away. The header is not too big
because it says too much; it is too big because it says the same six facts three times each and then
drops the one fact nothing else carries. Every other defect on this list is downstream of that
inversion.

---

## 2. Question 1 — Twelve cells, every element classified

**Method.** Each element on screen is assigned to exactly one class: *carrying* (it holds the object
of the act, or is the control that performs it), *orienting* (it answers "where am I / what is this /
what state is it in" without being the act), *neither* (it restates something already answered on the
same screen, prints the absence of content she did not ask about, or is chrome whose doors all lead
off this document). Vertical extents are the measured rects in `12-layout-measurements.json`;
horizontal extents are the column widths (`spine 200 / paper column 1008 / margin 232` at 1440;
`56 / 1224 / 0-on-canvas` at 1280; `390 / — / —` at 390). Areas are px².

### 2.1 The twelve cells

| Cell | Frame px² | carrying | orienting | neither |
|---|---|---|---|---|
| rich 1440 s0 | 1,296,000 | 203,820 (15.7%) | 299,060 (23.1%) | 793,120 (61.2%) |
| rich 1440 s1 | 1,296,000 | 197,220 (15.2%) | 274,860 (21.2%) | 823,920 (63.6%) |
| rich 1440 s2 | 1,296,000 | 411,180 (31.7%) | 219,860 (17.0%) | 664,960 (51.3%) |
| rich 1440 s3 | 1,296,000 | 190,200 (14.7%) | 194,660 (15.0%) | 911,140 (70.3%) |
| rich 1280 s0 | 1,152,000 | 145,044 (12.6%) | 263,152 (22.8%) | 743,804 (64.6%) |
| rich 1280 s1 | 1,152,000 | 145,044 (12.6%) | 238,952 (20.7%) | 768,004 (66.7%) |
| rich 1280 s2 | 1,152,000 | 324,216 (28.1%) | 169,152 (14.7%) | 658,632 (57.2%) |
| rich 1280 s3 | 1,152,000 | 123,240 (10.7%) | 159,552 (13.9%) | 869,208 (75.4%) |
| rich 390 s0 | 329,160 | 75,270 (22.9%) | 60,060 (18.2%) | 193,830 (58.9%) |
| rich 390 s1 | 329,160 | 75,270 (22.9%) | 24,960 (7.6%) | 228,930 (69.5%) |
| rich 390 s2 | 329,160 | 78,000 (23.7%) | 95,160 (28.9%) | 156,000 (47.4%) |
| rich 390 s3 | 329,160 | 39,000 (11.9%) | 42,120 (12.8%) | 248,040 (75.4%) |

Prework, for contrast (no `[data-region-head]` exists on this document at any width):
1440 s0 — carrying 137,700 (10.6%) · orienting 168,300 (13.0%) · **neither 990,000 (76.4%)**;
1440 s1 — carrying 224,100 (17.3%) · orienting 60,300 (4.7%) · neither 1,011,600 (78.0%).

### 2.2 The element-by-element roll-up (1440 s0, the fully worked cell)

**Paper column, 1008 × 900 = 907,200 px².** Content measure 900px wide; 108px is permanent gutter.

| Element (verbatim) | y extent | px tall | class | why |
|---|---|---|---|---|
| `<main>` `pt-8` | 0–36 | 36 | neither | pad |
| StrataMark `lg` (three grey bars) | 36–70 | 34 | neither | teaches the arc; no state of *this* paper |
| `Chen Residence` | 70–113 | 43 | orienting | the only identity string on the paper |
| `No client linked — attach one ↗` | 119–148 | 29 | orienting | a true fact + a door |
| `START —  TARGET —  SET A BUDGET BAND  PHASES ▸` | 148–169 | 21 | neither | four fields, two print a dash, one is a fold with 0 phases behind it |
| letterhead `pb-5` + `doc-rule-mid` + `mb-4` | 169–225 | 56 | neither | pad |
| gap + sentinel | 225–243 | 18 | neither | pad |
| `THE JOB · PROJECT` + `FOLD ↑` | 243–265 | 22 | orienting | third statement of stage on this screen |
| `ROOMS  No rooms yet →` | 265–301 | 36 | neither | prints absence |
| `PIECES  3 unspecified →` | 301–337 | 36 | orienting | a real count |
| `DRAWINGS  Nothing filed →` | 337–374 | 37 | neither | prints absence |
| `SPEC  0 of 3 specified · by room →` | 374–410 | 36 | orienting | a real count |
| `BOARDS  No boards yet · start one →` | 410–447 | 37 | neither | prints absence |
| `MONEY  $6,200 owed you, 15 days · $16,330 deposit not drawn →` | 447–484 | 37 | orienting | the paper's money summary |
| `DATES  No install date yet →` | 484–521 | 37 | neither | prints absence |
| `PEOPLE  Nobody on it yet →` | 521–558 | 37 | neither | prints absence |
| ticket `py-2.5` + `border-y` | 558–590 | 32 | neither | pad |
| `NEEDS ATTENTION · IN ONE PLACE` + two needs + `SEND REMINDER` / `OPEN THE SCHEDULE` | 590–743 | 153 | **carrying** | T3's whole answer, both acts, one zone |
| gap | 743–748 | 5 | neither | pad |
| `MESSAGE THE CLIENT  PREVIEW AS THE CLIENT  SHARING · MILESTONES  CALL SHEET · 0` | 748–792 | 44 | neither | four standing doors; none is the named act at this offset |
| `Client approvals  NO DECISION LEAD · NO APPROVALS AUTHORED  UNFOLD ↓` | 792–847 | 55 | orienting | names a region and its emptiness |
| `Schedule dates  UNFOLD ↓` + `No active phase handoffs need attention.` | 847–900 | 53 | neither | says nothing needs anything |

Paper column verticals: **carrying 153 (17.0%) · orienting 250 (27.8%) · neither 497 (55.2%)**.

**Spine, 200 × 900 = 180,000 px².** `← PUT DOWN` (44px, orienting — the exit); seven marks
`181×49.5` (orienting, but see §4/§8 of U3's remit — it teaches the arc, not this paper); `Project` /
`ACTIVE` (34px, orienting); `ON THIS PAPER` + `Client approvals / 0 IN THE LOG` + `Schedule / NOT
SCHEDULED` + `Pieces / 3 PIECES · 0 ROOMS` + `Money / $6,200 OWED` (208px, orienting); the `IN HAND /
18 min / PAUSE / + LOG` card (127px, **neither**); `JUST YOU · VISIBLE TO THE STUDIO` (34px,
**neither**); the measured 270px empty run y630→900 (**neither**). Roll-up: orienting 67,100 (37.3%)
· neither 112,900 (62.7%) · carrying 0.

**Margin, 232 × 900 = 208,800 px².** The first-touch note `— The margin on the right is where
decisions and money gather. Esc puts the document down — and the hours log themselves while it's in
your hand. / APPEARS ONCE · RECEDES ON USE` occupies y28–258 = 230px = 53,360 px² (**neither**);
`IN THE MARGIN  + NOTE` 30px (orienting); seven `.doc-elevated` chips, measured stack 577.14px
(`chipStackPctOfRail 0.641`) — of which the three `MONEY · …` invoice chips answer the red-letter
act (66,120 px², **carrying**) and `TIME · AUG 29`, `TIME · AUG 27`, and the two
`MONEY · VENDOR PAYMENT DUE` chips do not (**neither**). Roll-up: carrying 66,120 (31.7%) ·
orienting 6,960 (3.3%) · neither 135,720 (65.0%).

**Studio drawer**, 1440 × 60 = 86,400 px², every door off this document (`Library`, `People`,
`The Scans`, `Ledgers ↑`, `Find anything ⌘K`, `IN HAND TODAY 1h 09m`, `THE POST`, `LH Leah
Hartwell / LEAH HARTWELL`): **neither** at all four states.

### 2.3 Reconciliation with `12-layout-measurements.json` — four disagreements, all against the file

The file's `frameBudget` is a 1-pixel-row vertical partition into `chrome / headerSummary /
activeRegion / other`. It reports rich 1440 s0 as **chrome 60 (6.7%) · headerSummary 736 (81.8%) ·
activeRegion 0 (0.0%) · other 104 (11.6%)**. My vertical numbers for the same column are carrying
153 · orienting 250 · neither 497. These do not conflict numerically — 736 = letterhead 189 + gaps
18 + ticket 347 + needs-attention 153 + gaps 5 + instruments 44 — they conflict in **naming**, and
the naming is the indictment:

1. **The file has no bucket for the act.** The 152.75px `NEEDS ATTENTION · IN ONE PLACE` zone is the
   single most task-carrying band on the paper at `s0`, and the file scores it inside
   `headerSummary`. The headline "81.8% is header" therefore overstates the waste by 152.75px
   (17.0% of the frame). **Finding against the file**, not against the classification: the
   `headerSummary` bucket conflates "the summary of the job" with "the one named next act". The
   honest reading of s0 is *61.2% neither*, not *81.8% header* — a smaller number that is harder to
   argue with, because none of it is the work.
2. **`activeRegionPx` at s2 counts prose as work.** The file reports rich 1440 s2 as activeRegion
   775px (86.1%). Reading the shot: of those 775 rows, `Plan the project work` + `List the concrete
   work here so the next action and due date stay visible in the document.` +
   `START WITH · TASK · OPTIONAL DUE DATE · OPTIONAL ESTIMATE` + `ADD THE FIRST TASK` is ~120px, the
   `FOLIO  + FILE` strip is ~45px, and the inter-block dashed gaps are ~110px. ~433 of the 775 is
   not the FF&E schedule. **Finding against the file:** `[data-active-section]`'s on-screen extent is
   a mount-boundary measure, not a work measure.
3. **`firstRegionHeadY` is contingent on stored fold state, and the file does not record it.** At
   rich 1440 s0 the file gives `firstRegionHeadY = 1005.31` with key `schedule`. The reason it is not
   `approvals` (which is earlier in `PROJECT_PAPER_ORDER`) is that **Client approvals starts folded**
   on this document (probe §3: "Client approvals, the nested 'Schedule dates' rule sub-widget, and
   Care band all start folded by default"), so no `[data-region-head]` renders for it —
   `headerStack.approvals` (55.5px) is a `FoldSeam`, not a head. The fold key
   `patina:doc-fold:<docId>:<region>` outlives the session (`use-region-fold.ts:42-46`), so a
   returning designer measures a different `firstRegionHeadY` on the same document. **Finding against
   the file:** no cell records `data-folded` per region, so `firstRegionHeadY` is not reproducible
   from the file alone.
4. **The brief's own premise is wrong on this seed, and the file is right.** My brief states "At 1440
   `s0` the first region head lands at y 700–790 of 900 (78–88%)." The measured value is
   **1005.31px = 111.7% of the frame** — 215–305px worse. What actually lands in the 700–790 band is
   the `LetterheadInstruments` row (747.81–791.81) and the top edge of the folded approvals seam
   (791.81). See §6 for the arithmetic this changes.

One further reconciliation note: the file's `frameBudget` is deliberately width-blind for the rails
("rail width is reported separately as a horizontal-band percentage", method note; caveat 8), which
is why rich 1280 s0 and rich 1440 s0 report **identical** row buckets (60/736/0/104) despite the rail
dropping 200→56px and the margin leaving the canvas entirely. The two cells are not comparable on
the file's numbers alone. That is why question 7 needs the 2-D classification above, and why my
answer there is a px² answer.

---

## 3. Question 2 — Every pair where the second answers what the first already answered

Verbatim strings; all on **one screen** at the state named.

**D1 · Project identity — 1440 s0, three answers.** `Chen Residence` (40px letterhead) ·
`Project` / `ACTIVE` (spine caption) · `THE JOB · PROJECT` (ticket head). At `s1` two of the three
survive; the one that names the job does not. At `s2`/`s3` the seam prints `THE JOB · PROJECT` and
`$6,200 owed you · 3 unspecified` — still no name. `deriveTicketIdentity` builds
`The job · <Section> · <Phase> N of M` (`ticket-derivation.ts:797-802`); the project name is not a
term in it. **The cheapest duplicate to prove is also the one that is not a duplicate at all below
s0.** (F: U1-01, U1-02)

**D2 · Stage — 1440 s0, four answers.** `THE JOB · PROJECT` (ticket head) · `Project` / `ACTIVE`
(spine) · the active StrataMark in the seven-mark row · and, once she scrolls, the seam's own
`PROJECT`. No stage tab plate is on the document itself at any state on this seed (the six saturated
plates live on the desk roster heads per R126) — so the four answers are four ways of printing the
same word in three type registers.

**D3 · Money — 1440 s0, five statements, four different numbers.** Ticket
`MONEY  $6,200 owed you, 15 days · $16,330 deposit not drawn` · spine `Money` / `$6,200 OWED` ·
red-letter `Invoice INV-2026-W02 · $3,800 overdue — oldest due Aug 14 — send a reminder` · margin
`MONEY · SENT / INV-2026-W02 / Walk seed — 15 days overdue (receivables chase)` · and at `s3` the
account band `The accounts · this project  $0 BUDGET · $14,420 COMMITTED · 20% MARGIN`. Four numbers
($6,200 / $16,330 / $3,800 / $14,420) that are each true of a different question, printed with no
shared frame that says which question each answers. (F: U1-03, U1-30)

**D4 · Install date / schedule — 1440 s0→s1, five ways of saying "nothing".** Letterhead vitals
`START —  TARGET —` · ticket `DATES  No install date yet` · spine `Schedule` / `NOT SCHEDULED` ·
the schedule frame's seam `Schedule dates  UNFOLD ↓` + `No active phase handoffs need attention.` ·
and at s1 the region head `Schedule` / `0 phases · nothing active · next milestone —`. On a real
project with a live install Tuesday these five would carry the same date five times instead of the
same absence five times — the count does not improve with richness, only the payload does.

**D5 · Approvals — 1440 s0, twice, 550px apart.** Spine `Client approvals` / `0 IN THE LOG` and
paper `Client approvals  NO DECISION LEAD · NO APPROVALS AUTHORED  UNFOLD ↓`. Same region, same
emptiness, same word, one at y252 in the rail and one at y792 on the paper. (F: U1-29)

**D6 · Pieces — 1440, five statements across s0/s2.** Ticket `PIECES  3 unspecified` · ticket
`SPEC  0 of 3 specified · by room` · spine `Pieces` / `3 PIECES · 0 ROOMS` · the seam
`$6,200 owed you · 3 unspecified` · the region head `Pieces` / `the FF&E schedule, by room · 1 group
· 3 lines` / `3 unspecified · 3 uninvoiced`. The number 3 prints seven times on the s2 screen.

**D7 · Rooms — three.** Ticket `ROOMS  No rooms yet` · spine `3 PIECES · 0 ROOMS` · FF&E group head
`Not in a room yet`.

**D8 · The clock — two, disagreeing, 700px apart.** Spine `IN HAND` / `18 min` and drawer
`IN HAND TODAY 1h 09m`. Both present at all four states at 1440 and 1280; the only word
distinguishing session from day is `TODAY`, set in the same mono at the same size. (F: U1-08)

**D9 · The person — twice inside one chip.** Drawer `LH  Leah Hartwell / LEAH HARTWELL`; and again at
s3 on the paper, `LEAH HARTWELL  HANDS ON THE WORK: YOU`.

**D10 · The proposal's sent state — prework 1440 s1, three statements, two identical buttons.**
`PROPOSAL · WITH THE CLIENT` / `Sent Aug 27 · not opened yet` / `NUDGE CLIENT USER`, then ~230px
below, `Proposal · v1` / `AWAITING SIGNATURE` / `SENT YESTERDAY —  NUDGE CLIENT USER`, then the
strip `SENT  Aug 27` · `OPENED  not yet` · `READING  —` · `MOST READ  —`. Two `NUDGE CLIENT USER`
buttons in one frame. This is T7's whole screen. (F: U1-23 evidence)

**D11 · The fold verb — 1440 s1, four on one screen.** Ticket `FOLD ↑` · `Client approvals … UNFOLD
↓` · `Schedule dates  UNFOLD ↓` · `Schedule … FOLD ↑`. Four identical-weight controls at the right
edge, two saying the opposite of the other two, with nothing distinguishing "this is folded because
you folded it" from "this is folded because it was born that way". (F: U1-21)

**D12 · Client, and its contradiction.** `No client linked — attach one ↗` (letterhead) sits 600px
above `MESSAGE THE CLIENT` and `PREVIEW AS THE CLIENT` (instruments) and 450px above
`Invoice INV-2026-W02 · $3,800 overdue`. Three elements on one screen assume a client; one says there
isn't one. This is not a duplicate — it is a duplicate's worse cousin, a contradiction that survives
because no element on the screen knows what the others printed. (F: U1-31)

---

## 4. Question 3 — The irreducible set

A member qualifies only if I can name the moment its absence costs an act. Five qualify.

**IR1 · The document's name.** *The moment:* P2 has eleven documents open across a Monday morning.
At `s2` she reaches for `SPEC THE 3 UNSPECIFIED →`. The only strings on screen that could tell her
which client she is about to spec are `THE JOB · PROJECT` and `Project` / `ACTIVE`. Both are true of
all eleven. She scrolls to the top (1 act) or Escapes to the desk and re-enters (2 acts). **Cost:
1–2 acts, at every offset below the letterhead, on every one of the seven spreads.** Today this is
carried nowhere below `s0`.

**IR2 · Stage + phase position.** *The moment:* at `s2` she reaches for `BILL 3 UNINVOICED LINES →`.
Whether billing is legal depends on whether the paper is in `project` or still `proposal`. Absent,
she scrolls up. **Cost: 1 act.** Today this is carried four times (D2) — it needs one home, not four.

**IR3 · The worst standing exception.** *The moment:* she finishes at `s3`, decides the paper is
done, and puts it down. If `Invoice INV-2026-W02 · $3,800 overdue` is not on screen at that instant,
it ages another day and the next contact with it is a client email. **Cost: a day, not an act** —
which is why this is the strongest member. Today the seam carries the worst *two*
(`ticket-derivation.ts:826-859`) and silently drops a third (see U1-27).

**IR4 · The exit.** *The moment:* T11, at any offset. Esc works at rest (probe §4, confirmed
`doc/<id>` → `/desk`) but is invisible; `← PUT DOWN` is the only signifier. **Cost: without it, a
browser Back, which is not the same act.** Today it costs a 200px column to print a 44px word.

**IR5 · Where I am in the paper, and how much is left.** *The moment:* at `s2` on a real 60-line,
4-room schedule she needs Money. Without a position-and-extent signal she flings toward the foot,
overshoots into the colophon, and comes back — 3–4 gestures. **Cost: 3–4 acts, and it gets strictly
worse with richness** (on this 3-line seed the whole FF&E body is one screen, so the cost is
currently ~0 and the finding is under-measured). Today: `ON THIS PAPER` with four entries, **≥1440
only**, and only on `project`/`install`/`care` (`document-index.ts:76-82`).

**Members I cannot defend, and therefore rule out of the set:**

- `IN HAND` / `18 min` / `PAUSE` / `+ LOG` — 127px × 200px, present at all four states. Logging is an
  act she initiates; the drawer already prints `IN HAND TODAY 1h 09m`. No moment where its absence
  costs an act. **Out.**
- `JUST YOU · VISIBLE TO THE STUDIO` — 34px, present at all four states, changes only when a second
  person opens the same paper (probe §9: unchanged over a 65s wait). Nothing she does differs. **Out.**
- The seven-mark StrataMark row — teaches the seven-section arc, which is true of every Patina
  document, not of this one; future marks are inert (`doc-spine.tsx:98-104`). **Out of the
  irreducible set** (it may stay as a landmark; it may not claim "never leaves").
- The margin's first-touch note — its own copy says `APPEARS ONCE · RECEDES ON USE`. **Out.**
- `MESSAGE THE CLIENT  PREVIEW AS THE CLIENT  SHARING · MILESTONES  CALL SHEET · 0` — four standing
  doors, none of which is ever the guide's named act. **Out.**
- The eight ticket rows in their unfolded form — the seam already proves two lines carry the answer.
  **Out** as a set; see Q8/A for the fact each row is protecting.

---

## 5. Question 4 — Where always-visible costs more than it gives

Elements present at **all four** scroll states, and the number of states at which each is actually
read (read = it answers a question she is asking at that offset):

| Element (verbatim) | px² at 1440 | read at | verdict |
|---|---|---|---|
| `← PUT DOWN` | 8,800 | 1 of 4 (whenever she leaves) | keep, shrink |
| Seven-mark row | 9,900 | 0 of 4 (no state of this paper changes it) | demote |
| `Project` / `ACTIVE` | 6,800 | 3 of 4 (duplicate at s0) | keep, merge with IR1 |
| `ON THIS PAPER` + four index entries | 41,600 | 2 of 4 (s1, s2) | keep, extend |
| `IN HAND` / `18 min` / `PAUSE` / `+ LOG` | 25,400 | 0 of 4 | **evict** |
| `JUST YOU · VISIBLE TO THE STUDIO` | 6,800 | 0 of 4 | **evict** |
| Margin first-touch note | 53,360 | 0 of 4 after first use | **evict — its own copy promises it will** |
| Seven margin chips | 133,900 | 2 of 4 (s0 partly, s3 partly; **0 of 7 relate to what is in frame at s2**) | make positional |
| Studio drawer (8 doors, all off-document) | 86,400 | 0 of 4 | out of scope, but count it |
| 270px rail empty run y630→900 | 54,000 | 0 of 4 | it is the room the map needs |

**Total always-visible area read at 0 of 4 states, 1440: 181,860 px² = 14.0% of the frame, at every
offset.** At 1280 the equivalent (timer 3,360 + empty run 16,576 + drawer 86,400) is 106,336 px² =
9.2%, but only because the margin's 53,360px² of never-read note left the canvas along with the
133,900px² of chips that sometimes *are* read — a bad trade, quantified in §8.

---

## 6. Question 5 — The 405px arithmetic

**First, the premise is wrong and the file is right.** The brief says the first region head lands at
700–790 (78–88%). The measurement is **1005.31px, 111.7% of a 900px frame**
(`12-layout-measurements.json` → `rich.1440.s0.firstRegionHeadY`, key `schedule`). What lands in
700–790 is `LetterheadInstruments` (747.81–791.81). The gap is 215–305px, and it is not a rounding
argument: the anatomy's own hand-estimate of ~810px assumed the **approvals** `<h2>` would be first,
but approvals is folded by default on this document (probe §3), so it renders a 55.5px `FoldSeam`
with no head, and the first head is `schedule`, 158px further down. **All the arithmetic below is
against 1005.31, not 790.**

**The stack above the first head, as measured:**

| Term | px | source |
|---|---|---|
| `<main>` `pt-8` | 32 | `page.tsx:1791` |
| Letterhead (`#document-project-status`) | 189.31 | rect 36→225.31 |
| gap + `doc-ticket-sentinel` | 18.0 | 225.31→243.31 |
| Job ticket, unfolded, 8 rows | 347.25 | rect 243.31→590.56 |
| `NEEDS ATTENTION · IN ONE PLACE` | 152.75 | rect 590.56→743.31 |
| gap | 4.5 | 743.31→747.81 |
| `LetterheadInstruments` | 44.0 | rect 747.81→791.81 |
| Approvals `FoldSeam` | 55.5 | rect 791.81→847.31 |
| Schedule frame (seam + glance + phase control) | 102.5 | rect 847.31→949.81 |
| `header-stack-end` → `schedule` head gap | 55.5 | `gaps[0]` |
| **Total** | **1001.31** (+4 rounding = 1005.31) | |

**What fraction of that band is a decision she already made?** Taking "already made" as *restates a
fact printed elsewhere on the same screen, or prints the absence of something she did not ask for*:
the four vitals dashes (21) + five empty ticket rows (180) + the ticket head's third statement of
stage (15) + the approvals seam duplicating the spine's `Client approvals / 0 IN THE LOG` (55.5) +
the schedule frame duplicating the spine's `Schedule / NOT SCHEDULED` (102.5) + the instruments row
(44) = **418 of 1005.31 = 41.6%.** The remaining 587px is 152.75 of act, ~200 of genuine
first-statement orientation, and ~234 of padding and rules.

**The constraint to land the first head at 405px (45%).** 1005.31 − 405 = **600.31px must leave the
stack.** The largest single term is the ticket, and seaming it saves 347.25 − 64.06 = **283.19px**
(probe §1 measured exactly this: the head jumped −283.19px in one frame at scrollY 280). That alone
lands at 722 (80.2%). Every remaining term is smaller than the shortfall:

- ticket→seam 283.19 → **722.1** (80.2%)
- + letterhead off the scroll flow 189.31 → **532.8** (59.2%)
- + instruments 44 → **488.8** (54.3%)
- + approvals seam 55.5 → **433.3** (48.1%)
- + `<main>` `pt-8` 32 → **401.3** (44.6%) ✅

**Statement of the constraint, not the design:** *no single move reaches 45%.* The minimum
sufficient set that does not delete the act is **five simultaneous removals** — seam the ticket,
take the 189px letterhead out of the scrolled flow, relocate the 44px instruments row, collapse one
of the two pre-head seams, and spend the 32px top pad. Preserving the 152.75px red-letter zone is
what makes it five instead of four; deleting it would let four moves do it (401.3 + 152.75 would
still be 554, so in fact even deleting the act does not save a move — **the red-letter zone is not
what is in the way**). Equivalently: the header stack must lose 60% of its height while keeping
100% of its distinct facts, which is only arithmetically possible if the 41.6% that is already
answered elsewhere goes first — 418 of the required 600.31 is available at zero information cost,
and the remaining 182.31px must come from geometry (padding, rules, and moving the letterhead out
of flow), not from content.

---

## 7. Question 6 — Chunking: what the top band asks her to hold

Counted literally: an independent thing = a string or control she must read and decide about
separately, because nothing on screen groups it with its neighbour.

**1440 `s0`, the paper's top band alone — 20:** (1) `Chen Residence` · (2) `No client linked — attach
one ↗` · (3) `START —` · (4) `TARGET —` · (5) `SET A BUDGET BAND` · (6) `PHASES ▸` · (7)
`THE JOB · PROJECT` + `FOLD ↑` · (8–15) the eight ticket rows, each label + value + arrow · (16)
`NEEDS ATTENTION · IN ONE PLACE` · (17) `Invoice INV-2026-W02 · $3,800 overdue …` + `SEND REMINDER` ·
(18) `Name the phases for this project` + `OPEN THE SCHEDULE` · (19) the four-door instruments row ·
(20) `Client approvals  NO DECISION LEAD · NO APPROVALS AUTHORED  UNFOLD ↓`.
Whole frame at 1440 s0: 20 (paper) + 8 (spine: Put down, mark row, `Project`/`ACTIVE`, four index
entries, timer card, presence line — counted as 8 groups) + 9 (margin: first-touch note, `IN THE
MARGIN`, seven chips) + 8 (drawer) = **45 independent items.** Working-memory budget: ~4.

**1280 `s0` — 39.** Paper unchanged at 20 (identical DOM). Spine rises to 10 as the seven marks
stack vertically and each becomes its own row-height target, and `Project` / `ACTIV` / `E` becomes
three lines. Margin drops to 1 (`MARGIN ←`). Drawer 8.

**390 `s0` — 22.** Title, household chip, four vitals, seam identity `THE JOB · PROJECT`, seam
exceptions `$6,200 owed you · 3 unspecified`, `UNFOLD ↓`, zone label, two needs, two acts, four
instrument doors, three `MONEY · …` chips, three mobile-bar zones. **390 is the only width whose top
band does not carry the eight ticket rows** — `seamAtRest = useMediaMatch('(max-width: 1179px)')`
(`job-ticket.tsx:202,244`) — and it is therefore the quietest of the three at rest. That is the
proof the condensed form is legible, and it is currently only true where the frame is smallest.

**At `s1`:** 1440 → **19**; 1280 → **18**; 390 → **14**.
The delta at every width is the *same single item*: the project's name. 1440 loses items 1–6 (the
letterhead) and gains nothing; of the six, five were dashes, absences and a fold with nothing behind
it, and one — item 1 — was the only string on the frame that identified the paper. **Scroll removes
one orienting item and zero of the nineteen non-orienting ones.** That is the chunking finding, and
it is the same sentence as §1.

---

## 8. Question 7 — The 1180–1439 natural experiment

The tier drops the rail 200→56px (`page.tsx:1764`) and moves the margin from a 232px `col-start-3`
grid column to a `fixed`, off-canvas, `translate-x-full` sheet behind a `MARGIN ←` tab
(`margin-rail.tsx:227-228, 256-262`). Using my own px² classification:

| | 1440 s0 | 1280 s0 | Δ |
|---|---|---|---|
| Frame | 1,296,000 px² | 1,152,000 px² | −11.1% |
| carrying | 203,820 (15.7%) | 145,044 (12.6%) | **−28.8% absolute, −3.1 pts** |
| orienting | 299,060 (23.1%) | 263,152 (22.8%) | −12.0% absolute, −0.3 pts |
| neither | 793,120 (61.2%) | 743,804 (64.6%) | −6.2% absolute, **+3.4 pts** |

**Attention degrades, and the mechanism is legible.** The tier removes 232px of margin, of which
66,120 px² was *carrying* (the three `MONEY · SENT / INV-2026-W02` chips that answer the red-letter
act) and 135,720 px² was *neither*. It gives back only 48px of content measure to the paper
(900→948px), because `<main>` is `max-w-[1040px]` with `px-10` and was never measure-constrained at
1440. So the tier trades away a third of the frame's carrying pixels to buy a 5.3% wider line. On
`neither` the tier looks like a win in absolute px² (−49,316) and is a loss as a ratio (+3.4 pts),
because the frame shrank faster than the waste did.

**Three degradations that are not in the numbers and are visible in the shots:**

1. `Project` / `ACTIVE` renders as three lines — `Project` / `ACTIV` / `E` — a word broken
   mid-syllable in the one element that carries stage below the fold
   (`w1280-spine-glyph-rail.png`, `w1280-rich-s0.png`, `w1280-rich-s1.png`).
2. The seven StrataMark bars overrun the 56px column's left edge and are clipped by
   `min-[1180px]:overflow-x-hidden` (`doc-spine.tsx:44`) — the mark row is 41.5px wide against a
   56px column with `px-1.5`, and the rendered bars start at x=0 with their left ends cut
   (`w1280-spine-glyph-rail.png`).
3. The studio drawer's own labels collide: `Find anything ⌘K` overprints `IN HAND` so the strip reads
   `Find anytIN gHAND⌘K TODAY 1h 12m` (`w1280-rich-s0.png`, `w1280-rich-s1.png`). Not the document's
   fault, but it is on the frame at all four states at this width.

**And one improvement, which must be preserved by anything that replaces the tier:** the margin sheet
causes **zero reflow** — probe §6 measured `firstRegionHeadY` at 1005.3125 before *and* after opening
it, and Escape returns focus to the trigger. Whatever the lens does at 1280, opening the margin must
keep costing the paper nothing.

**Net verdict:** the 1180–1439 tier is not a smaller version of 1440; it is a different, worse
allocation. It spends 50,400 px² on a rail that is 48% empty and clips its own glyphs, and it takes
the only positionally-relevant chips off the canvas without leaving a count behind. The lens should
not inherit this tier's shape.

---

## 9. Question 8 — Where "uncluttered" and "nothing hides" genuinely pull apart

Eight places. Each is a decision the proposal must make and defend; none has a free answer.

**A · The eight constant ticket rows.** `ROOMS  No rooms yet`, `DRAWINGS  Nothing filed`,
`BOARDS  No boards yet · start one`, `DATES  No install date yet`, `PEOPLE  Nobody on it yet` — five
of eight rows, 180px of the 900px frame at s0, whose entire content is that nothing exists. But an
empty row is a *positive* fact — "no drawings have been filed", not "drawings did not load" — and
`ticket-derivation.test.ts:140-166` pins all eight on every spread precisely so the paper cannot lie
by omission. **The decision: does an empty row keep its line, or does one line — `5 of 8 empty` —
carry it?** On the prework spread this is at its worst: seven of eight rows print an absence and
carry no door at all (only `ROOMS` has an arrow), 290px of frame with zero acts in it.

**B · The red-letter zone versus the guide.** They are mutually exclusive (`page.tsx:1839-1846`). Any
lens that condenses on scroll must decide whether the 152.75px `NEEDS ATTENTION · IN ONE PLACE` zone
may yield. It is the only place `$3,800 overdue — oldest due Aug 14` prints on the paper. A quieter
screen here is a screen where a designer puts the document down without seeing the overdue invoice.
**The decision: the zone never yields, or it yields to a one-line count (`1 overdue · $3,800`) that
is a different string from the seam's `$6,200 owed you`.**

**C · The spine's index values.** `0 IN THE LOG` · `NOT SCHEDULED` · `3 PIECES · 0 ROOMS` ·
`$6,200 OWED`. Dropping them to bare labels makes the rail quiet and loses four standing numbers.
Keeping them duplicates the paper (D5, D6). **The decision must be a rule, not a list: the rail
carries the number the paper is not currently printing** — which means the rail's content is a
function of scroll position, not of the document.

**D · The margin at 1280.** `MARGIN ←` is maximally uncluttered and maximally hiding: seven chips,
three of them invoices, one tap away and zero pixels on screen, **with no count on the tab.** At
1440 the same seven chips cost 133,900 px². **The decision: the closed tab prints its count, or the
hiding is a lie.** (This one is nearly free and I would take it in wave one.)

**E · Empty-state prose.** At `s3`, `An authorization releases signed schedule items for purchasing —
release one from the schedule. A trade scope buys work: written here, bid here, signed by the client,
then engaged.` plus `No authorizations recorded yet` plus `Release furnishings from the FF&E schedule
when prices are ready for client approval, or begin a trade scope here.` = ~310px. At `s2`,
`Plan the project work` / `List the concrete work here so the next action and due date stay visible
in the document.` = ~120px. This is P3's entire week-one education, and it is P1's tax on every visit
for the life of the project. **The decision: teach once per document and recede — the pattern the
margin note already promises (`APPEARS ONCE · RECEDES ON USE`) and does not keep.**

**F · The four empty vitals.** `START —  TARGET —  SET A BUDGET BAND  PHASES ▸`. Each dash is a true
fact and each is a door that exists nowhere else on the paper. Quieting the row deletes four
entry points. **The decision: are these vitals, or are they setup?** They read as vitals and behave
as setup.

**G · The seam's `.slice(0, 2)` — a "nothing hides" violation already shipped.** The seam prints the
worst two standing exceptions and drops a third **whole**, with no "+1"
(`ticket-derivation.ts:826-859`). On this thin seed there are two. On the specimen in §8 of the
instrument sheet there are at least four (overdue approval, overdue COM, unacked PO-2026-0418,
damage claim closing tomorrow) — so at install week the seam is silently 50% honest at every offset
below `s0`. **The decision: the seam prints a count of what it did not print.**

**H · The 390 chips.** At `s1`, five `MONEY · …` chips stack inline for ~250px of an 844px frame
(29.6%), none of them anchored to anything in view. Quieting to one chip loses four decisions;
keeping them spends nearly a third of the phone. **The decision: at 390, are chips positional (only
what is anchored to the region in frame) or are they the margin flattened?** Today they are the
margin flattened, and the margin does not know where she is.

---

## 10. Findings

```json
[
{ "id": "U1-01", "lens": "U1", "persona": null, "task_ids": ["T3","T4","T11"],
  "key": "doc|1440|s1|no-identity-string-anywhere-in-frame",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "both",
  "title": "At the seam nothing on screen names the document",
  "observation": "At scrollY 226 the frame carries `THE JOB · PROJECT`, `Project` / `ACTIVE`, `ROOMS  No rooms yet` … `PEOPLE  Nobody on it yet`, `NEEDS ATTENTION · IN ONE PLACE`. The string `Chen Residence` is not on screen anywhere.",
  "why_it_blocks": "orientation", "frame_cost_estimate": 900,
  "evidence": { "shots": ["w1440-rich-s1.png","w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:797-802"] },
  "severity": "high", "confidence": 0.95, "already_ruled": null,
  "suggested_fix": "Put the project name in the ticket's identity line so it survives the fold.",
  "hesitation_seconds_estimate": 8 },

{ "id": "U1-02", "lens": "U1", "persona": null, "task_ids": ["T3","T4","T9"],
  "key": "doc|all|s2|seam-identity-omits-project-name",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "both",
  "title": "Seam identity line carries stage but never the name",
  "observation": "Pinned seam prints two lines: `THE JOB · PROJECT` and `$6,200 owed you · 3 unspecified`. `deriveTicketIdentity` builds `The job · <Section> · <Phase> N of M` — the project name is not a term in it. Same at 390 and 1280.",
  "why_it_blocks": "orientation", "frame_cost_estimate": 64,
  "evidence": { "shots": ["w1440-ticket-seam.png","w1440-rich-s2.png","m390-rich-s2.png"], "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:797-802"] },
  "severity": "high", "confidence": 0.95, "already_ruled": "I149",
  "suggested_fix": "Line one becomes `Chen Residence · Project · Phase 4 of 6`; drop `The job`.",
  "hesitation_seconds_estimate": 10 },

{ "id": "U1-03", "lens": "U1", "persona": null, "task_ids": ["T9","T13"],
  "key": "doc|1440|s0|five-money-statements-four-numbers",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Five money statements, four numbers, one screen",
  "observation": "`MONEY  $6,200 owed you, 15 days · $16,330 deposit not drawn` (ticket) · `Money` / `$6,200 OWED` (spine) · `Invoice INV-2026-W02 · $3,800 overdue — oldest due Aug 14` (red letter) · `MONEY · SENT / INV-2026-W02` ×2 (margin).",
  "why_it_blocks": "clutter", "frame_cost_estimate": 260,
  "evidence": { "shots": ["w1440-rich-s0.png","w1440-margin-rail.png"], "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:653-657"] },
  "severity": "high", "confidence": 0.9, "already_ruled": "I148",
  "suggested_fix": "One money statement per frame; the others print only the number the frame lacks.",
  "hesitation_seconds_estimate": 25 },

{ "id": "U1-04", "lens": "U1", "persona": null, "task_ids": ["T3","T5","T6"],
  "key": "doc|1440|s0|ticket-prints-five-rows-of-absence",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Five of eight ticket rows print only absence",
  "observation": "`ROOMS  No rooms yet`, `DRAWINGS  Nothing filed`, `BOARDS  No boards yet · start one`, `DATES  No install date yet`, `PEOPLE  Nobody on it yet` — 180px of a 900px frame. Thin-seed dependent; on a real project these carry payloads but still cost the same 8 rows.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 180,
  "evidence": { "shots": ["w1440-ticket-unfolded.png","w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:780-793"] },
  "severity": "medium", "confidence": 0.85, "already_ruled": "I149",
  "suggested_fix": "Rows with nothing behind them collapse to one line: `Nothing filed in 5 of 8`.",
  "hesitation_seconds_estimate": 12 },

{ "id": "U1-05", "lens": "U1", "persona": null, "task_ids": ["T4","T9","T10"],
  "key": "doc|1440|s0|first-region-head-at-1005-not-790",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "First region head lands a full frame below the fold",
  "observation": "Measured `firstRegionHeadY` = 1005.31px against a 900px viewport = 111.7%. The 700–790 band the brief names holds `MESSAGE THE CLIENT / PREVIEW AS THE CLIENT / SHARING · MILESTONES / CALL SHEET · 0` (747.81–791.81), not a head.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 900,
  "evidence": { "shots": ["w1440-rich-s0.png"], "refs": ["artifacts/document-lens-proposal-2026-08-28/research/12-layout-measurements.json"] },
  "severity": "blocker", "confidence": 0.95, "already_ruled": null,
  "suggested_fix": "Target 405px; the arithmetic needs five simultaneous removals (§6), not one.",
  "hesitation_seconds_estimate": 20 },

{ "id": "U1-06", "lens": "U1", "persona": null, "task_ids": ["T1","T3"],
  "key": "doc|1440|s0|top-band-asks-twenty-independent-holds",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Top band asks her to hold twenty things at once",
  "observation": "Counted literally on the paper: title, `No client linked — attach one ↗`, four vitals (`START —`, `TARGET —`, `SET A BUDGET BAND`, `PHASES ▸`), ticket head, eight rows, zone label, two needs, instruments row, approvals seam = 20. Whole frame with spine, margin and drawer = 45.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 736,
  "evidence": { "shots": ["w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1797-1900"] },
  "severity": "high", "confidence": 0.85, "already_ruled": null,
  "suggested_fix": "Cap the resting top band at five items; everything else earns its way in.",
  "hesitation_seconds_estimate": 30 },

{ "id": "U1-07", "lens": "U1", "persona": null, "task_ids": ["T16","T9"],
  "key": "doc|1440|all|margin-first-touch-note-never-recedes",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "both",
  "title": "First-touch note promises to recede and never does",
  "observation": "`— The margin on the right is where decisions and money gather. Esc puts the document down — and the hours log themselves while it's in your hand.` / `APPEARS ONCE · RECEDES ON USE`, present identically at s0, s1, s2 and s3, 230px × 232px = 53,360px².",
  "why_it_blocks": "clutter", "frame_cost_estimate": 230,
  "evidence": { "shots": ["w1440-margin-rail.png","w1440-rich-s3.png"], "refs": ["apps/designer-portal/src/components/document/margin-note.tsx:39-42"] },
  "severity": "medium", "confidence": 0.75, "already_ruled": null,
  "suggested_fix": "Mark seen on first scroll past the margin, not on first note capture.",
  "hesitation_seconds_estimate": 4 },

{ "id": "U1-08", "lens": "U1", "persona": null, "task_ids": ["T1","T11"],
  "key": "doc|1440|all|two-in-hand-clocks-disagree-on-screen",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "both",
  "title": "Two In-hand clocks on screen showing different times",
  "observation": "Spine card prints `IN HAND` / `18 min` / `PAUSE` `+ LOG`; the studio drawer 700px below prints `IN HAND TODAY 1h 09m`. Both present at all four states; the only distinguishing word is `TODAY`, same mono, same size.",
  "why_it_blocks": "orientation", "frame_cost_estimate": 127,
  "evidence": { "shots": ["w1440-spine-full.png","w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/spine-timer.tsx:128-140"] },
  "severity": "medium", "confidence": 0.85, "already_ruled": null,
  "suggested_fix": "One clock. Keep the drawer's day total; the session figure lives in its sheet.",
  "hesitation_seconds_estimate": 15 },

{ "id": "U1-09", "lens": "U1", "persona": null, "task_ids": ["T3","T4","T11"],
  "key": "doc|1440|all|always-visible-read-at-zero-of-four",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "both",
  "title": "Fourteen percent of every frame is read at no state",
  "observation": "Present at all four states and read at none: the `IN HAND` card (25,400px²), `JUST YOU · VISIBLE TO THE STUDIO` (6,800), the margin first-touch note (53,360), the seven-mark row (9,900), the studio drawer (86,400) = 181,860px² = 14.0% of 1440×900.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 126,
  "evidence": { "shots": ["w1440-spine-full.png","w1440-rich-s2.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:143-154"] },
  "severity": "medium", "confidence": 0.8, "already_ruled": "D12",
  "suggested_fix": "Evict the timer card and presence line to the rail's foot sheet; keep the exit.",
  "hesitation_seconds_estimate": 6 },

{ "id": "U1-10", "lens": "U1", "persona": null, "task_ids": ["T3","T11"],
  "key": "doc|1280|s0|active-breaks-across-two-lines-in-rail",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
  "title": "Stage word breaks mid-syllable in the glyph rail",
  "observation": "The 56px rail renders the active caption as three lines: `Project` / `ACTIV` / `E`. `PUT DOWN` also wraps to two lines, and `In hand` / `21m` wraps to three.",
  "why_it_blocks": "crowding", "frame_cost_estimate": 60,
  "evidence": { "shots": ["w1280-spine-glyph-rail.png","w1280-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:122-136"] },
  "severity": "high", "confidence": 0.95, "already_ruled": null,
  "suggested_fix": "At 1180–1439 the caption is a glyph plus a tooltip-free abbreviation, never a wrapped word.",
  "hesitation_seconds_estimate": 5 },

{ "id": "U1-11", "lens": "U1", "persona": null, "task_ids": ["T3","T11"],
  "key": "doc|1280|s0|marker-bars-clipped-at-rail-left-edge",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
  "title": "Seven marker bars are clipped by the rail edge",
  "observation": "At 1280 the seven StrataMark rows stack vertically (measured 41.5×373.5) inside a 56px column with `px-1.5` and `min-[1180px]:overflow-x-hidden`; the rendered bars begin at x=0 with their left ends cut off.",
  "why_it_blocks": "crowding", "frame_cost_estimate": 373,
  "evidence": { "shots": ["w1280-spine-glyph-rail.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:44"] },
  "severity": "medium", "confidence": 0.7, "already_ruled": null,
  "suggested_fix": "Give the compact marks their own 24px glyph rather than a scaled-down bar set.",
  "hesitation_seconds_estimate": 3 },

{ "id": "U1-12", "lens": "U1", "persona": null, "task_ids": ["T1","T11"],
  "key": "doc|1280|s0|drawer-labels-overprint-each-other",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
  "title": "Studio drawer labels overprint at 1280",
  "observation": "The strip reads `Find anytIN gHAND⌘K TODAY 1h 12m` — `Find anything` and its `⌘K` chip overlap `IN HAND` and its figure. Present at all four scroll states at this width.",
  "why_it_blocks": "crowding", "frame_cost_estimate": 60,
  "evidence": { "shots": ["w1280-rich-s0.png","w1280-rich-s1.png"], "refs": ["apps/designer-portal/src/components/document/studio-drawer.tsx:289"] },
  "severity": "medium", "confidence": 0.8, "already_ruled": "D8",
  "suggested_fix": "Drop the drawer's In-hand figure below 1440; the spine already carries it.",
  "hesitation_seconds_estimate": 4 },

{ "id": "U1-13", "lens": "U1", "persona": null, "task_ids": ["T3","T9","T16"],
  "key": "doc|1280|s0|compact-tier-carries-less-than-full-tier",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
  "title": "The compact tier carries a third fewer working pixels",
  "observation": "Classified px²: 1440 s0 carrying 203,820 (15.7%) → 1280 s0 carrying 145,044 (12.6%), a 28.8% absolute drop, while `neither` rises from 61.2% to 64.6%. The tier removes 66,120px² of anchored money chips and returns only 48px of content measure (900→948).",
  "why_it_blocks": "information-loss", "frame_cost_estimate": 232,
  "evidence": { "shots": ["w1280-rich-s0.png","w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/margin-rail.tsx:258-262"] },
  "severity": "high", "confidence": 0.75, "already_ruled": "D12",
  "suggested_fix": "At 1180–1439 keep positional chips on canvas; hide only the non-anchored ones.",
  "hesitation_seconds_estimate": 20 },

{ "id": "U1-14", "lens": "U1", "persona": null, "task_ids": ["T16","T9"],
  "key": "doc|1280|s0|margin-tab-prints-no-count",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
  "title": "Closed margin tab hides seven items behind no number",
  "observation": "The only margin affordance at 1280 is the fixed tab reading `MARGIN ←`. Behind it sit seven `.doc-elevated` chips (three of them invoices). The tab prints no count, and the closed state is indistinguishable from a document with an empty margin.",
  "why_it_blocks": "information-loss", "frame_cost_estimate": 46,
  "evidence": { "shots": ["w1280-margin-tab-closed.png","w1280-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/margin-rail.tsx:227-228"] },
  "severity": "high", "confidence": 0.9, "already_ruled": "D3",
  "suggested_fix": "Tab prints `MARGIN · 7`; zero items prints `MARGIN` with no number.",
  "hesitation_seconds_estimate": 25 },

{ "id": "U1-15", "lens": "U1", "persona": null, "task_ids": ["T4","T8"],
  "key": "doc|1440|s2|active-region-bucket-counts-prose-as-work",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "mid", "flag": "both",
  "title": "Measurement file scores empty-state prose as active region",
  "observation": "File reports rich/1440/s2 activeRegion 775px (86.1%). On screen those rows include `Plan the project work` / `List the concrete work here so the next action and due date stay visible in the document.` / `ADD THE FIRST TASK` and `FOLIO  + FILE`. ~433 of 775 is not the FF&E schedule.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 433,
  "evidence": { "shots": ["w1440-rich-s2.png"], "refs": ["artifacts/document-lens-proposal-2026-08-28/research/12-layout-measurements.md"] },
  "severity": "medium", "confidence": 0.8, "already_ruled": null,
  "suggested_fix": "Split the active-region bucket into body-rows vs region-chrome before setting targets.",
  "hesitation_seconds_estimate": 0 },

{ "id": "U1-16", "lens": "U1", "persona": null, "task_ids": ["T9","T13"],
  "key": "doc|1440|s3|authorizations-prose-eats-310px",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "both",
  "title": "Foot spends 310px teaching a concept with no content",
  "observation": "`AUTHORIZATIONS & TRADE SCOPES` / `An authorization releases signed schedule items for purchasing — release one from the schedule. A trade scope buys work: written here, bid here, signed by the client, then engaged.` / `No authorizations recorded yet` / `DRAFT A TRADE SCOPE`.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 310,
  "evidence": { "shots": ["w1440-rich-s3.png"], "refs": ["apps/designer-portal/src/components/document/approvals/project-approval-document.tsx:584-602"] },
  "severity": "medium", "confidence": 0.85, "already_ruled": null,
  "suggested_fix": "Teach once per document like the margin note; then print the act alone.",
  "hesitation_seconds_estimate": 10 },

{ "id": "U1-17", "lens": "U1", "persona": null, "task_ids": ["T9","T15"],
  "key": "doc|1440|s3|foot-carries-fourteen-percent",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "both",
  "title": "Foot is the least working frame on the paper",
  "observation": "Classified: carrying 190,200px² (14.7%), orienting 194,660 (15.0%), neither 911,140 (70.3%). On screen: the 310px authorizations block, `The accounts · this project  $0 BUDGET · $14,420 COMMITTED · 20% MARGIN`, `Closing the book  0 OF 6 CLOSED OUT`, a roster nudge, then ~115px of blank paper.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 630,
  "evidence": { "shots": ["w1440-rich-s3.png"], "refs": ["artifacts/document-lens-proposal-2026-08-28/research/12-layout-measurements.json"] },
  "severity": "medium", "confidence": 0.8, "already_ruled": "I137",
  "suggested_fix": "The foot condenses to the Record and the colophon; the rest yields on approach.",
  "hesitation_seconds_estimate": 12 },

{ "id": "U1-18", "lens": "U1", "persona": null, "task_ids": ["T16","T9"],
  "key": "doc|390|s1|five-money-chips-eat-thirty-percent",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "seam", "flag": "both",
  "title": "Five money chips take a third of the phone frame",
  "observation": "Normalised to the 844px frame: `MONEY · DRAFT  Draft invoice`, `MONEY · SENT  INV-2026-W01`, `MONEY · SENT  INV-2026-W02`, `MONEY · VENDOR PAYMENT DUE  Vendor payment …` ×2 stack for ~250px = 29.6%. None is anchored to anything in view.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 250,
  "evidence": { "shots": ["m390-rich-s1.png","m390-mobile-margin-chips.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-margin-chips.tsx:89"] },
  "severity": "high", "confidence": 0.85, "already_ruled": "D3",
  "suggested_fix": "At 390 print only chips anchored to the region in frame; the rest live in the sheet.",
  "hesitation_seconds_estimate": 15 },

{ "id": "U1-19", "lens": "U1", "persona": null, "task_ids": ["T3","T11"],
  "key": "doc|390|s0|mobile-bar-left-zone-obscured-by-puck",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "both",
  "title": "Studio puck covers the mobile bar's orientation zone",
  "observation": "The bar's left zone reads `IN THIS DOCUMENT` / `Project`; the circular dark studio mark overprints the first characters of both lines so it renders as `⬤N THIS` / `⬤OCUMENT` / `Project`. Present at all four states. Normalised to the 844px frame.",
  "why_it_blocks": "orientation", "frame_cost_estimate": 77,
  "evidence": { "shots": ["m390-mobile-bar.png","m390-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:216"] },
  "severity": "high", "confidence": 0.85, "already_ruled": "D8",
  "suggested_fix": "Below 1180 the studio puck yields its corner to the document bar's identity zone.",
  "hesitation_seconds_estimate": 6 },

{ "id": "U1-20", "lens": "U1", "persona": null, "task_ids": ["T4","T8"],
  "key": "doc|390|s2|first-piece-line-at-eighty-two-percent",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "mid", "flag": "both",
  "title": "First FF&E line sits at eighty-two percent of the phone frame",
  "observation": "Normalised to 844px: seam 0–64, then `Pieces` / `the FF&E schedule, by room · 1 group · 3 lines` / `3 unspecified · 3 uninvoiced`, then four stacked ledger acts, then `Plan the project work` prose, then `FOLIO  + FILE`, then `Not in a room yet`; `Møbler Lounge Chair — Bouclé · ×2` begins at ~690px.",
  "why_it_blocks": "crowding", "frame_cost_estimate": 626,
  "evidence": { "shots": ["m390-rich-s2.png"], "refs": ["apps/designer-portal/src/components/document/ffe-section.tsx:1290-1302"] },
  "severity": "high", "confidence": 0.85, "already_ruled": "I148",
  "suggested_fix": "At 390 the region head's ledger acts collapse to one primary plus an overflow glyph.",
  "hesitation_seconds_estimate": 18 },

{ "id": "U1-21", "lens": "U1", "persona": null, "task_ids": ["T4","T10"],
  "key": "doc|1440|s1|four-fold-verbs-one-screen-no-provenance",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "both",
  "title": "Four fold verbs on one screen, none says why",
  "observation": "In one frame: ticket `FOLD ↑`, `Client approvals  NO DECISION LEAD · NO APPROVALS AUTHORED  UNFOLD ↓`, `Schedule dates  UNFOLD ↓`, `Schedule … FOLD ↑`. Nothing distinguishes folded-because-she-folded-it from folded-by-default.",
  "why_it_blocks": "orientation", "frame_cost_estimate": 110,
  "evidence": { "shots": ["w1440-rich-s1.png","w1440-fold-seam-folded.png"], "refs": ["apps/designer-portal/src/components/document/region/use-region-fold.ts:97-142"] },
  "severity": "medium", "confidence": 0.8, "already_ruled": "I136",
  "suggested_fix": "A chosen fold prints its verb; a born-folded region prints its summary only.",
  "hesitation_seconds_estimate": 10 },

{ "id": "U1-22", "lens": "U1", "persona": null, "task_ids": ["T7","T12"],
  "key": "doc|1440|s0|prework-rails-carry-five-strings",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Pre-work spreads spend both rails on five strings",
  "observation": "Proposal doc at 1440 s0: the 200px spine prints `← PUT DOWN`, four marks, `Proposal` / `AWAITING SIGNATURE`, `JUST YOU · VISIBLE TO THE STUDIO` — ink 13.9%, longest empty run 657px. The 232px margin prints `IN THE MARGIN  + NOTE` and `The margin — decisions, messages, and money gather here`.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 432,
  "evidence": { "shots": ["w1440-prework-s0.png"], "refs": ["apps/designer-portal/src/lib/document/document-index.ts:76-82"] },
  "severity": "high", "confidence": 0.9, "already_ruled": "I136",
  "suggested_fix": "Index every spread, or narrow both rails on spreads with nothing to index.",
  "hesitation_seconds_estimate": 8 },

{ "id": "U1-23", "lens": "U1", "persona": null, "task_ids": ["T7","T5","T6"],
  "key": "doc|1440|s0|prework-ticket-seven-dead-rows",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Pre-work ticket prints seven rows with no doors",
  "observation": "Proposal doc: only `ROOMS  No rooms yet` carries an arrow. `PIECES  5 unspecified`, `DRAWINGS  Nothing filed`, `SPEC  0 of 5 specified · by room`, `BOARDS  No boards yet`, `MONEY  Nothing moving yet`, `DATES  No dates yet`, `PEOPLE  No roster yet` carry none — ~290px of frame with zero acts.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 290,
  "evidence": { "shots": ["w1440-prework-s0.png","w1440-prework-s1.png"], "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:781-788"] },
  "severity": "medium", "confidence": 0.9, "already_ruled": "I150",
  "suggested_fix": "A ticket whose doors are all `none` rests as its seam, as it already does at 390.",
  "hesitation_seconds_estimate": 12 },

{ "id": "U1-24", "lens": "U1", "persona": null, "task_ids": ["T3","T4"],
  "key": "doc|1440|s1|seam-state-does-not-exist-at-the-seam",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "both",
  "title": "The named seam state does not exist at that offset",
  "observation": "The letterhead's bottom clears the viewport at scrollY 226, but the ticket's own sentinel does not fire until scrollY 280. Between them the ticket is still 347.25px unfolded and prints `THE JOB · PROJECT` with all eight rows. Measured at s1: `seamHeightRaw` is empty, `data-unfolded` is `true`.",
  "why_it_blocks": "orientation", "frame_cost_estimate": 283,
  "evidence": { "shots": ["w1440-rich-s1.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:218-228"] },
  "severity": "medium", "confidence": 0.9, "already_ruled": null,
  "suggested_fix": "Tie the pin to the letterhead's exit, not to a sentinel 54px later.",
  "hesitation_seconds_estimate": 5 },

{ "id": "U1-25", "lens": "U1", "persona": null, "task_ids": ["T4","T10"],
  "key": "doc|1440|s1|paper-jumps-283px-at-the-pin",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "both",
  "title": "Paper flinches 283px upward in a single frame",
  "observation": "At scrollY 280 the ticket swaps 347.25px → 64.06px in one React commit; the first region head's document Y jumps −283.19px. Sampled every ~17ms for 400ms: 23 of 23 samples read exactly 64.0625px — no interpolation in either direction.",
  "why_it_blocks": "motion", "frame_cost_estimate": 283,
  "evidence": { "shots": ["w1440-ticket-seam.png","w1440-ticket-unfolded.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:244"] },
  "severity": "high", "confidence": 0.95, "already_ruled": null,
  "suggested_fix": "Make the seam height continuous over the pin band so the paper never jumps.",
  "hesitation_seconds_estimate": 8 },

{ "id": "U1-26", "lens": "U1", "persona": null, "task_ids": ["T3","T15","T16"],
  "key": "doc|1440|s0|instruments-row-never-the-named-act",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Instruments row spends 44px on doors nobody was sent to",
  "observation": "`MESSAGE THE CLIENT`, `PREVIEW AS THE CLIENT`, `SHARING · MILESTONES`, `CALL SHEET · 0` sit directly under the zone whose named acts are `SEND REMINDER` and `OPEN THE SCHEDULE`. Two of the four address a client the letterhead says is `No client linked`.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 44,
  "evidence": { "shots": ["w1440-instruments-row.png","w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/letterhead-instruments.tsx:317-321"] },
  "severity": "low", "confidence": 0.7, "already_ruled": "R27",
  "suggested_fix": "Instruments condense to an overflow glyph unless one of them is the named act.",
  "hesitation_seconds_estimate": 6 },

{ "id": "U1-27", "lens": "U1", "persona": null, "task_ids": ["T13","T14","T10"],
  "key": "doc|all|s2|seam-drops-third-exception-silently",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "both",
  "title": "Seam drops a third standing exception with no trace",
  "observation": "The seam prints the worst two by rank and drops any third whole (`.slice(0, 2)`), printing `Nothing overdue` only when there are none. On this thin seed it prints `$6,200 owed you · 3 unspecified`; at install week with four standing exceptions two are invisible at every offset below top.",
  "why_it_blocks": "information-loss", "frame_cost_estimate": 22,
  "evidence": { "shots": ["w1440-ticket-seam.png"], "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:826-859"] },
  "severity": "high", "confidence": 0.85, "already_ruled": "I149",
  "suggested_fix": "Print the two, then the count it withheld: `· +2 more`.",
  "hesitation_seconds_estimate": 0 },

{ "id": "U1-28", "lens": "U1", "persona": null, "task_ids": ["T3","T10"],
  "key": "doc|1440|s0|letterhead-vitals-print-four-dashes",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Vitals line prints two dashes and an empty fold",
  "observation": "`START —  TARGET —  SET A BUDGET BAND  PHASES ▸`. Two fields print a dash; `PHASES ▸` opens onto nothing (0 phases configured — the toggle's box measures 189.3px before and after the click).",
  "why_it_blocks": "clutter", "frame_cost_estimate": 21,
  "evidence": { "shots": ["w1440-rich-s0.png","w1440-letterhead-vitals-phases-open.png"], "refs": ["apps/designer-portal/src/components/document/letterhead-vitals.tsx:445-454"] },
  "severity": "low", "confidence": 0.8, "already_ruled": null,
  "suggested_fix": "A fold with nothing behind it does not render its trigger.",
  "hesitation_seconds_estimate": 7 },

{ "id": "U1-29", "lens": "U1", "persona": null, "task_ids": ["T3","T4"],
  "key": "doc|1440|s0|approvals-answered-twice-550px-apart",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Approvals emptiness printed twice on one screen",
  "observation": "Spine at y252: `Client approvals` / `0 IN THE LOG`. Paper at y792: `Client approvals  NO DECISION LEAD · NO APPROVALS AUTHORED  UNFOLD ↓`. Same region, same emptiness, 540px apart, in two different type registers.",
  "why_it_blocks": "clutter", "frame_cost_estimate": 55,
  "evidence": { "shots": ["w1440-rich-s0.png","w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/spine-running-index.tsx:86-114"] },
  "severity": "medium", "confidence": 0.85, "already_ruled": "I137",
  "suggested_fix": "The rail prints a region's value only while that region is out of frame.",
  "hesitation_seconds_estimate": 5 },

{ "id": "U1-30", "lens": "U1", "persona": null, "task_ids": ["T9"],
  "key": "doc|1440|s3|account-band-adds-a-fourth-money-number",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "both",
  "title": "Account band adds a fourth money number at the foot",
  "observation": "`The accounts · this project  $0 BUDGET · $14,420 COMMITTED · 20% MARGIN  STUDIO EYES ONLY  UNFOLD ↓` sits in the same frame as the spine's `Money` / `$6,200 OWED` and the seam's `$6,200 owed you · 3 unspecified`. Three money surfaces, three scopes, no shared frame naming the scope.",
  "why_it_blocks": "orientation", "frame_cost_estimate": 37,
  "evidence": { "shots": ["w1440-rich-s3.png"], "refs": ["apps/designer-portal/src/components/document/commercial/money-region.tsx:227-251"] },
  "severity": "medium", "confidence": 0.8, "already_ruled": "I148",
  "suggested_fix": "Each money surface prefixes its scope word: owed / committed / drawn.",
  "hesitation_seconds_estimate": 20 },

{ "id": "U1-31", "lens": "U1", "persona": null, "task_ids": ["T7","T16"],
  "key": "doc|1440|s0|no-client-linked-beside-two-client-acts",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Screen says no client and offers two client acts",
  "observation": "`No client linked — attach one ↗` at y119 sits above `MESSAGE THE CLIENT` and `PREVIEW AS THE CLIENT` at y767 and above `Invoice INV-2026-W02 · $3,800 overdue — oldest due Aug 14 — send a reminder` at y651. Thin-seed dependent, but the composition permits the contradiction on any document.",
  "why_it_blocks": "orientation", "frame_cost_estimate": 44,
  "evidence": { "shots": ["w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/letterhead-instruments.tsx:317-321"] },
  "severity": "medium", "confidence": 0.7, "already_ruled": null,
  "suggested_fix": "Client-bound instruments do not mount while the letterhead says no client is linked.",
  "hesitation_seconds_estimate": 15 }
]
```

---

## 11. What stays true

Six things already work and a lens must not break them.

1. **The two-line seam is the best ink-to-answer ratio in the shell.** 64.0625px carrying an identity
   line and the two worst standing exceptions, measured stable across 23 of 23 samples
   (probe §1). Whatever the lens condenses to, this is the proven form — it needs the project's
   name added (U1-02), not a redesign.
2. **The running index leads the eye rather than trailing it.** `-20% 0px -62% 0px` flips
   approvals→schedule at scrollY 400, schedule→pieces at 1200, pieces→money at 1960, and the 700ms
   jump lock produces **zero flicker** on a click — no intermediate entry is ever `aria-current`
   (probe §2). Density work must reuse this band and this lock, not invent a second observer.
3. **A folded region is never mistakable for an empty one.** `FoldSeam` always prints name, summary
   and `unfold ↓` — probe §3 read `Money · no budget yet · $0 authorized · unfold ↓` off a region
   with a genuinely empty body. Scroll-driven condensation must inherit this law, not suspend it.
4. **390 already starts quiet, and proves the condensed form is readable.** `seamAtRest` at
   `max-width: 1179px` means the phone's ticket rests as the seam and the top band carries 22 items
   instead of 45. The desktop lens is not inventing a new state; it is adopting the one 390 ships.
5. **Opening the margin at 1280 costs the paper nothing.** `firstRegionHeadY` = 1005.3125 before and
   after, and Escape returns focus to the trigger (probe §6). Any new margin behaviour must keep
   that zero-reflow promise.
6. **Region heads own no outer spacing.** `RegionHead` declares no `mt-*`/`mb-*`/padding
   (`region-head.tsx:118-121`); every gap belongs to the caller. That is what makes the {6, 29, 56}
   gap spread fixable in one place without touching a single head — and it is the cheapest
   structural asset the lens has.
