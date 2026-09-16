# Information Architect — the standing head of every spread

**Lens:** three vocabularies collide in this head. My job is to say which one is a fact, which one is
machinery, and what one head must carry to answer *what · where · next* in one glance.

## 1. Findings on today's head

**F1 — The head answers "where" six times and "what" zero times (high).** Blocks 1, 2, 3, 4, 5 and 6
each state a position; nothing on the paper says what the job *is*. Edna's spread never prints
"whole-house refresh, four rooms, 1927 foursquare" — facts `client_discovery` already holds (`rooms`,
`project_type`). The head is all axis, no subject.

**F2 — Block 5's status line is a hardcoded constant, and it contradicts block 6 (high).**
`preworkStatus()` (page.tsx:1966) reads the ladder segment's `countLine`; `registerFor` returns
`empty('Nothing yet')` unconditionally for `brief · discovery · direction`
(`lens-ladder-derivation.ts:556-561`). It is structurally incapable of ever stating the stop. So
"Nothing yet" prints 40px above "3 of 5 essentials captured", which is derived from real data
(`deriveDiscoveryReadiness`). This is not a copy bug; it is a stop with no register.

**F3 — Blocks 3/4 on a pre-work spread are fabricated, not derived (high).** With no `project_id`,
`SectionStageLineMount` calls `deriveSectionWorkflowStageDocument`, which builds one synthetic group
from the four-entry `SECTION_STAGE` map — `phases: []`, no provenance, no resolver selection — so
`subLabelFor` gets `position = null` and `fidelity = null`. `DISCOVERY & PROGRAMMING · CORE · STAGE
02` is a **constant per stop**, identical on every discovery spread forever. A line that cannot
change is not information.

**F4 — The track band reads as a progress bar and encodes nothing (high).** `section-stage-line.tsx`
renders a `w-full` 3px bar inside a `minmax(0,1fr)` column of a `max-w-[21rem]` list. Its length is
grid arithmetic, not a quantity. In the screenshot it looks like "≈40% done". It means "Core track is
live."

**F5 — Two Strata Marks, two scales, one glyph (high).** The letterhead mark takes
`deriveFillState(sections)` — shaping/commitment/delivery across the whole engagement (≈[0.5, 0, 0]
for Edna). The readiness band's mark takes `deriveDiscoveryReadiness().fill` — essentials/depth/ready
(≈[0.6, 0.38, 0]). Same three-bar glyph, ~300px apart, two unrelated denominators, neither labelled.

**F6 — The letterhead prints the client's name twice (high).** `vitalsFor` deliberately drops
`client_name` on project and proposal spreads ("to avoid showing it twice") and then returns
`[client_name, 'In discovery']` on the relationship branch — where `row.title` *is* the client's
name. The rule exists in the same function and is not applied to the stop that needs it.

**F7 — Block 2 is nearly empty at s0, by design (med).** `LensBand` line 1 yields identity/stage at
s0 (D-B38) and `rightSlot` returns `null` for brief/discovery/direction, so at the top of the page
the band is one sentence and one act — correctly. The clutter is blocks 3, 4 and 5 sitting in the gap
R127 declared empty ("nothing between the band and the first head").

**F8 — The mapping inverts (high).** `SECTION_STAGE`: brief→01, discovery→02, **direction→05**,
**proposal→03**. Walking a job forward prints 01 → 02 → 05 → 03. R124 item 7 put the mapping on
I114's agenda and left it unruled.

**F9 — Register collision (high).** One fact, three registers within 200px: an 11px mono machine
string (3), a 34px Playfair proper noun (5), a 20px Inter sentence (6). V9 P2 gives the largest true
type to money, dates and names; today it goes to the word "Discovery".

**F10 — Under flag `worktable`, the name prints a third time (low).** `IntakeSpreadHeader` mounts on
the discovery spread only and promotes the household identity again, below blocks 3/4/5.

## 2. What every head must carry

One register per question, in this order, once:

| Line | Question | Type step | Rule |
|---|---|---|---|
| A | **What** — title | Playfair 40 (32 at 390) | the engagement's own name |
| B | **What** — subject | Inter 15 ink | nouns: type · rooms/pieces · money. Never the client's name when the title is the client's name |
| C | **Where** | Inter 15 ink, tabular numerals; the date phrase is an oak-scored door | one clause of state + one dated fact + one count |
| D | **Next** | Inter 15 + DM Mono 13 act | one owed thing, its owner, one act |

Exact sentences:

- **Edna Courtney** — B: `Whole-house refresh · 4 rooms · Beaverdale`. C: `In discovery since
  6 September · 3 of 5 essentials captured`. D: `Budget comfort and how they live are Edna's to give.`
  · act `ADD BUDGET COMFORT`.
- **Cedar Lane Study** — B: `Study · 2 of 3 rooms scoped`. C: `Drafting since 2 September · fee
  schedule not chosen`. D: `The direction needs its fee schedule before it can be sent.` · act
  `OPEN THE CONTRACT ROOM`.
- **Sonnenberg residence** — B: `$212,000 · 11 pieces · target 14 November`. C: `Design Development ·
  week 3 of 9 · estimated`. D: `$17,500 has been overdue since 12 August.` · act `SEND THE REMINDER`.

**Was → Is → why cut**

| Was | Is | Why |
|---|---|---|
| 1 vitals `Edna Courtney · In discovery` | line B (subject nouns) | the title already says the name; `vitalsFor`'s own rule, applied to the branch that skipped it |
| 3 `DISCOVERY & PROGRAMMING · CORE · STAGE 02` | inside the line-C door | a constant per stop (F3); the derivation is untouched, only its mouth moves |
| 4 track band `CORE · 02` | inside the door; on the glass only where a resolver anchors it (project/install/care) | encodes no quantity (F4) |
| 5 `IN PROGRESS` / **Discovery** / `Nothing yet` | the region root keeps its rule and its ladder key; name + status yield while the head is in frame | the status line cannot state the stop (F2) and the name is the fourth printing of "where" |
| 6 readiness band's sentence | promoted to line C | it is the only true statement of where Edna stands |
| 6 second Strata Mark | deleted | one glyph, one denominator (F5) |
| 2 band line 2 at s0 | yields while line D is in frame | the band is the head, condensed — never a second voice |

## 3. My one direction — **The Three-Line Head**

The head is one block: title, subject, where, next. The sticky band is that head condensed, not an
addition; the section head is a rule and a name that yields while the head above is in frame.

**Discovery, desktop**
```
▤  (one mark)
Edna Courtney                                            Playfair 40
Whole-house refresh · 4 rooms · Beaverdale               Inter 15 muted
In discovery since 6 September · 3 of 5 essentials       Inter 15 ink
   ^^^^^^^^^^^^^^^^^^^^^^^^^^ oak-scored → "Where this sits"
Budget comfort and how they live are Edna's to give.  ADD BUDGET COMFORT   +2 MORE
──────────────────────────────────────────────────────── hairline
[ 56px band — line 1 empty at s0, line 2 yielded while line D is in frame ]
THE ESSENTIALS — STRUCTURED ————————————————————————————— first head
```
**Direction** is the same four lines (`Drafting since 2 September…`), act `OPEN THE CONTRACT ROOM`.
**Project** keeps line C's stage vocabulary *on the glass* — `Design Development · week 3 of 9 ·
estimated` is a resolver answer with a position and a fidelity, which is exactly what R111 built —
and the track bands print below it, where they carry live tracks.

**390:** A wraps; B and C print; D prints sentence + act; the band takes the act over on scroll.
Nothing else changes — the head is already one column.

**Merge / demote / door / delete:** merge 1+6 into A–D; demote 5 to a yielding name; door for 3+4 on
pre-work spreads; delete the second mark and the duplicated name.

**Hover / focus / press:** line C's date phrase is the head's only hover target — oak underline on
hover, 2px clay-ink focus ring, press opens a `DocSheet` ("Where this sits": `Discovery &
Programming · Core · stage 02`, provenance, fidelity), Esc restores focus to the phrase. The act
takes the tier its consequence earns (secondary two-score for `ADD BUDGET COMFORT`; filled charcoal
only where money moves).

**The quiet case (P5):** line D renders nothing when the stage's rest sentence carries neither a fact
nor an act — Osterberg prints A, B, `Settled 22 August` and stops. Where the rest sentence carries a
fact it prints (`Install day is Thursday, 18 September.`). A head that says "nothing is waiting on
you" is a region with nothing to say, saying it.

## 4. Honors / departs

Honors: R126/R140 register, V9 P2/P3/P5, R66's soft gate, R108/R113 (the fidelity word and
band-as-state survive, inside the door), and R127's "nothing between the band and the first head" —
which this direction *restores* by clearing blocks 3/4/5 out of that gap.

Departs: `touches: R111, I114` — the section sub-label leaves the glass on brief/discovery/direction/
proposal and becomes a disclosure; `deriveSectionStageLine` is unchanged, only its mouth moves. Worth
it because on those four stops the string is a per-stop constant (F3). `touches: R127` — the band's
line 2 yields while line D is in frame, the mirror of the letterhead yield line 1 already takes.
`touches: W4-R1` — the active stop's head yields its name and status while the document head names
them; every other stop is unchanged. No V9 non-license is touched.

## 5. The one risk Kody should rule

**The eleven-stage vocabulary printing forward-inverted (F8).** If any stage number prints on
pre-work spreads, a designer walking brief → direction → proposal reads 01 → 02 → 05 → 03. Two exits:
fix `SECTION_STAGE`, or rule that the eleven-stage × three-track vocabulary is machinery — it prints
only where a resolver anchors it (project · install · care) and lives behind the door everywhere
else. **My ruling: the second.** It costs nothing, closes I114's oldest open item without ruling the
mapping, and buys back the two lines the head needs for what the job actually is.
