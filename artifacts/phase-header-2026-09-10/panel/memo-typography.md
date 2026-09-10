# Memo — the Typographer / Editorial Designer seat

**Lens:** the *register* of the head — how many type steps it spends, which family carries which rank,
how many rules fire before the first fact, and what studio stationery does that this stack does not.

## 1. Findings on today's head

**T1 — Seven sizes, six of the seven steps, before one fact of the job.** 40 · 34 · 15 · 14 · 13 · 12 ·
11, across blocks 1–6. The 40 is off-scale — SPEC §A3 tops at `.t-d1` 34. A masthead that spends the
whole scale leaves none for the letter. *(high)*

**T2 — B1 prints Edna's name twice, 29px apart, in two families.** `vitalsFor()` returns
`[client_name, 'In discovery']` and `doc-letterhead.tsx:78` prints the same client as the Playfair 40
title. No stationery sets the addressee twice. *(high)*

**T3 — Those vitals sit at 11px** (`:92`) — a party name and the project's state, the two things V9 P2
floors at 15px, in the slot reserved for running heads. The line answering "where does this stand" is
the smallest type on the page. *(high)*

**T4 — One fact, three castings.** `In discovery` (Inter 11 grey) · `DISCOVERY & PROGRAMMING · CORE ·
STAGE 02` (Mono 12 caps clay-ink) · `IN PROGRESS` + `Discovery` (Mono 11 caps over Playfair 34).
Repetition in a masthead isn't emphasis; it's a reader checking whether the second one said something
new. *(high)*

**T5 — B3 mis-casts `.t-meta`.** `section-stage-line.tsx:25` sets `12px uppercase tracking-[.09em]`;
§A3 makes 12px meta **sentence case** and 11px `.t-head` the only UPPER step, at `.08em`. An eighth
step that isn't in the contract — and it's the loudest line in the head. *(high)*

**T6 — Negative Playfair tracking below 40px.** `:78` ships `text-[32px] … tracking-[-0.015em]`,
widening to 40 only at 1180; §A3 says *"never negative below 40px."* At 390 the household name is the
tightest serif on the surface. *(high)*

**T7 — The head truncates in three places** — `text-ellipsis whitespace-nowrap` on the vitals (`:92`)
and `LINE_CLIP` on both band lines (`lens-band.tsx:38`). §A4 forbids `text-overflow: ellipsis`
outright. A clipped name is a misprint. *(high)*

**T8 — All three rule weights fire before content, and `--rule-mid` twice** (letterhead, band, then
`RegionRule` strong at B5). "End of section" prints twice before a section begins. *(med-high)*

**T9 — The head's only body-register sentence is the wrong one.** `preworkStatus()`
(`page.tsx:1966-68`) falls back to the literal `'Nothing yet'` when the ladder has no segment, so B5
prints it in Inter 14 above B6's "3 of 5 essentials captured". *(high on the print; med on the cause)*

**T10 — There is no body register in the head at all.** Between the 34/40px serif and the 11–14px
metadata nothing is set as prose. A letterhead is a name and then a *letter*; this is a name and six
captions. *(high)*

**T11 — B6's running head is a party name** — `WORKING WITH EDNA COURTNEY`, Mono 11 caps. R140 puts
names at the largest true type. Third printing of Edna, smallest step, in caps. *(med-high)*

**T12 — Weight standing in for a step:** `**3** of 5` bolds a numeral inside 14px Inter. The sheet has
a figure step (`.t-money`) and a display step; it has no "bold the number" device. *(med)*

## 2. What every head must carry

Three ranks and one rule, in order — **what · where · next** — one family per rank.

| Rank | Line | Step | Family |
|---|---|---|---|
| running head | the stop, plus the stage only where a resolver truly knows it | `.t-head` 11 UPPER | DM Mono |
| what | the job's name | `.t-d1` **34** | Playfair 500 |
| what (opt.) | its own title, when it differs from the name | `.t-authorship` 20 | Playfair italic |
| where | one sentence of standing + at most one clause of what's missing | `.t-body` **16** | Inter |
| next | one act | `.act` 13 UPPER | DM Mono |

Money inside the sentence is `.t-money`; dates are *14 November 2026*. Mono appears **twice** in the
whole head — running head and act — and nowhere between.

**Edna Courtney — discovery**
> `DISCOVERY` · **Edna Courtney** · *Whole-house refresh · 1927 foursquare, Beaverdale*
> Three of five essentials are captured — budget comfort and how they live are still Edna's to answer.
> `ADD BUDGET COMFORT`

**Cedar Lane Study — direction**
> `DIRECTION` · **Cedar Lane Study** · *Nora Ellison*
> Two of three rooms are scoped and no fee schedule is chosen — open since 2 September 2026.
> `OPEN THE CONTRACT ROOM`

**Sonnenberg residence — project**
> `PROJECT · DESIGN DEVELOPMENT · CORE · STAGE 06 OF 11 · ESTIMATED` · **Sonnenberg residence**
> Week 3 of 9 toward 14 November 2026. Six of eleven pieces are in production and one is blocked;
> `$17,500.00` has been overdue since 12 August 2026.
> `RELEASE THE NEXT ROOM`

Sonnenberg does not print `$212,000` — R140: the owed figure outranks the agreed one, and the agreed
one has no business in a head.

| Was | Is | Why cut |
|---|---|---|
| B1 vitals `Edna Courtney · In discovery` | gone | Name is the title (T2); state is now the 16px sentence (T3). |
| B3 `DISCOVERY & PROGRAMMING · CORE · STAGE 02` | folded into the running head at 11 caps | An eighth step, louder than the name (T5). |
| B4 track bars + `CORE · 02` | gone from the head | A chart is not a register; it moves behind the spine door. |
| B5 eyebrow `IN PROGRESS` | gone | The running head names the stop; "in progress" is what an open document means. |
| B5 status `Nothing yet` | gone | Replaced by the one true standing sentence (T9). |
| B6 eyebrow `WORKING WITH EDNA COURTNEY` | gone | Third printing of the name, smallest step (T11). |
| B6 `**3** of 5 … keep going` | the standing sentence, unbolded | One step, not a weight (T12); "keep going" is encouragement. |
| ellipsis clips (B1, B2) | wrap | §A4 (T7). |
| three rules before content | one `--rule-mid` under the head | The 2px region rule first fires at THE ESSENTIALS (T8). |

## 3. My one direction — **The Masthead**

One head per spread. The letterhead absorbs the stage line and, at pre-work stops, the region head —
there the document *is* one region, and a head above it is a title page for a one-page book. At
project stops the region heads stay; the running head names the stop above them.

**Discovery · desktop (≥1180)**

```
┌──────────────────────────────────────────────────────────────┐
│ ▤  DISCOVERY                                    ledger ▸     │  11 mono caps · door
│                                                              │
│ Edna Courtney                                                │  Playfair 34
│ Whole-house refresh · 1927 foursquare, Beaverdale            │  Playfair italic 20
│                                                              │
│ Three of five essentials are captured — budget comfort and   │  Inter 16
│ how they live are still Edna's to answer.                    │
│                                                              │
│ ADD BUDGET COMFORT     RUN THE DISCOVERY CALL   ATTACH SCAN  │  13 mono acts
├──────────────────────────────────────────────────────────────┤  ← --rule-mid, the ONLY rule
│ THE ESSENTIALS — STRUCTURED ································ │  ← 2px region rule fires HERE
```

**Direction** — identical skeleton, running head `DIRECTION`, leader `OPEN THE CONTRACT ROOM`.
**Project** — the running head carries the resolved stage phrase; the sentence runs two lines with
`$17,500.00` in `.t-money`; the region heads below are untouched.

**390** — same four lines, same order, nothing removed. The name wraps at word boundaries, never
clips; the italic line drops when it equals the name; the sentence takes three lines; acts stack
left-aligned at 44px. The running head wraps rather than elides — on Sonnenberg it takes two lines,
and that is correct.

**How the three relate.** The **band is the masthead's reprise, not a peer.** Line 1 already yields
while the letterhead is in frame (`lens-band.tsx:233-250`); line 2 now yields with it, so the standing
sentence prints once. Scrolled past, the band prints identity · stop · sentence · act — the masthead
at 56px, which is what a running head is for. The **stage line becomes a door** (tertiary scored
phrase opening the workflow spine); the **pre-work region head is deleted.**

**Hover · focus · press.** The name is not a control. The stage phrase and ledger door take the
tertiary grammar — resting 1px `--oak`, `--ink-faint` 1.5px on hover, R126's clip-path wash under the
pointer. Focus: the 2px clay-ink ring on the same box. Press darkens ink to `--ink`; nothing
translates, nothing shadows.

**The quiet case (P5)** — Osterberg, care, nothing owed: `CARE` / **Osterberg residence** /
"Everything is settled. Installed 22 August 2026." / one rule. No act, no count, no eyebrow, no band
sentence. A region with nothing to say renders nothing — including the head's act row.

## 4. Honors / departs

**Honors.** V9 P2 (the sentence rises 11 → 16; owed prints, agreed does not), P3, P5. SPEC §A3 and
§A4 (seven steps, 24px module, wrap never truncate). R66's soft gate. R124/R125 copy. R140 whole.

**Departs.**
- `touches: R126` — 40px → `.t-d1` 34, negative tracking → 0. R126 fenced typography at "no further
  than the mockup"; R140 spent that fence for a written sheet, and 40 is not on it. The scale only
  works if its top step is the top.
- `touches: R111, I114` — R111's `stage · track · position · fidelity` survives *as words* but loses
  its 12px caps line and its bars. R111 ruled the phrase's shape, never that it must be the loudest
  line on the spread.
- `touches: R127` — "nothing between the band and the first head" becomes band and head as one
  utterance at two scales. R127's own acceptance walk records the stage line printing *between* them
  at proposal — that is the "something" that crept back.
- `touches: R66` — the readiness band loses its ground, glyph and eyebrow, keeping the act; its count
  moved into the sentence, so the band was stating it twice.

## 5. The one risk I want Kody to rule on

**Does the head print a stage number at all, and at which stops?** The bridge is a four-entry static
map (`workflow-stage-derivation.ts:92-100`) in which **direction→05 while proposal→03 — the order
inverts.** Printing `STAGE 02 OF 11` at Edna is a promise the map breaks two stops later: Nora reads
05, the Halvorsen proposal reads 03, and a designer with sixteen jobs reads that as the project going
backwards. Recommendation: **at pre-work stops the running head prints the stop's word alone
(`DISCOVERY`, `DIRECTION`, `PROPOSAL`) and the stage lives behind the door; at project/install/care,
where a schedule resolver genuinely selects it, it prints the full phrase.** The alternative is to
complete and rule the stop↔stage map so the numbers rise monotonically — a bigger job, and R124/R125
left that mapping deliberately unruled. Either is defensible; printing today's map unchanged is not.
