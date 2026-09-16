# Synthesis — the standing head of every spread (panel of 2026-09-10)

Five memos (information · typography · interaction · designer · critic), 51 findings, merged here into
what the panel agrees on, three directions that genuinely differ, the rulings owed to Kody, and the
defects found along the way. The deck is built from this file; the memos are its evidence.

## 1. What the panel agrees on (five of five unless marked)

**A1 — The head answers "where" six times and "what" zero times.** Blocks 1, 2, 3, 4, 5, 6 each state
a position. Nothing prints what the job is — house, rooms, money, date. (IA F1, designer F1/F6, typographer T4/T10.)

**A2 — Two of the six statements are false or fabricated.** Block 5's `Nothing yet` is a hardcoded
constant — `registerFor` returns `empty('Nothing yet')` unconditionally for brief/discovery/direction
(`lens-ladder-derivation.ts:556-561`) — printed 40px above block 6's true `3 of 5`. Blocks 3/4 on any
pre-work spread are synthesized from the four-entry static `SECTION_STAGE` map with no position and no
fidelity: `DISCOVERY & PROGRAMMING · CORE · STAGE 02` is a per-stop constant, identical on every
discovery spread forever. A line that cannot change is not information. (IA F2/F3, all seats.)

**A3 — The stage number runs backwards.** `SECTION_STAGE`: brief→01 · discovery→02 · direction→05 ·
proposal→03. A designer walking a job forward reads 01 → 02 → 05 → 03. R124/R125 left this mapping
unruled. Every seat flagged it; four of five recommend the same exit (see R1).

**A4 — The eleven-stage × three-track vocabulary is Patina's, not the studio's.** "Core · stage 02" is
not a thing Leah says to a client, a hire, or a bookkeeper. The track bar's length is grid arithmetic
(`w-full` in an equal column) that reads as "40% done" — a dashboard with one widget. (designer F3/F7,
IA F4, critic F7.)

**A5 — The name prints twice; the glyph prints twice.** `vitalsFor` returns `[client_name, 'In discovery']`
under a Playfair title that *is* the client name — the function's own "avoid showing it twice" rule,
applied to every branch but this one. The StrataMark appears at the letterhead (whole-document fill)
and in the readiness band (essentials fill): same glyph, two denominators, neither labelled. (IA F5/F6,
typographer T2, critic F5, designer F8.)

**A6 — The register is inverted.** Seven sizes and six of seven type steps before one fact; the line
that answers "where does this stand" is the smallest type on the page (11px vitals), while the largest
true type goes to the word "Discovery". V9 P2 gives that type to money, dates and names. (typographer
T1/T3/T9, IA F9.)

**A7 — What every head must carry, in this order, once:** *what* (name + the nouns of the job) · *where*
(one sentence with a dated fact and a count, at body size) · *next* (one owed thing, its owner, one
act). The sticky band is that head condensed — never a second voice. The stage vocabulary prints on
the glass only where a schedule resolver genuinely anchors it (project · install · care); at pre-work
stops it lives behind a door. The quiet case prints nothing it does not need (P5).

**A8 — The cut list.** Every direction below makes these cuts; they differ in where the surviving head lives.

| Block | Was | Is | Why |
|---|---|---|---|
| 1 vitals | `Edna Courtney · In discovery` | the nouns of the job, or nothing | name already 34px above; state moves to the sentence |
| 3 sub-label | `DISCOVERY & PROGRAMMING · CORE · STAGE 02` | behind a door at pre-work; printed at project/install/care | a per-stop constant (A2); inverted (A3); not studio vocabulary (A4) |
| 4 track band | 40% bar + `CORE · 02` | deleted from the head | encodes no quantity |
| 5 region head | `IN PROGRESS` / **Discovery** / `Nothing yet` | eyebrow deleted; status deleted; the name yields or becomes a section rule | the status is a lie (A2); the name is the fourth "where" |
| 6 readiness band | glyph · `WORKING WITH EDNA COURTNEY` · **3** of 5 … keep going · act | its one true sentence promoted into the head; glyph, eyebrow, "keep going" deleted | the only true statement of where Edna stands was the fourth block down |
| 2 band line 2 | a second head above the head | the head's reprise at 56px, yielding while the head is in frame | R127 was right; blocks 3/4/5 are the "something between" that crept back |
| 7 tool row + undo | six acts before content | kept, below the first content region; the undo gains its consequence sentence | three good doors; they are not the head |

## 2. Three directions

The seats converged on the cuts and split on **where the one head lives and whose voice it speaks in.**
That split is the deck.

### Direction 1 — The Masthead *(typographer's seat; the IA's "Three-Line Head" folded in)*

**Thesis:** the letterhead absorbs everything — one masthead of four lines under one rule, and the
sticky band is that masthead's 56px reprise, not a peer.

- running head: `DISCOVERY` (DM Mono 11 caps; at project/install/care the resolved phrase
  `PROJECT · DESIGN DEVELOPMENT · CORE · STAGE 06 · ESTIMATED`); a tertiary door `ledger ▸` at right
- name: Playfair 34 (`.t-d1`, top of the scale — the 40 goes)
- subject: Playfair italic 20 (`.t-authorship`) — `Whole-house refresh · 1927 foursquare, Beaverdale`; drops when it equals the name
- standing: **one Inter 16 sentence** — `Three of five essentials are captured — budget comfort and how they live are still Edna's to answer.`
- acts: the leader + the tool row on one line, DM Mono 13
- exactly one `--rule-mid` under the head; the 2px region rule first fires at THE ESSENTIALS
- the pre-work region head (block 5) is **deleted** — at a one-region stop a head above the head is a
  title page for a one-page book; at project stops the region heads stay under the running head
- the band: line 1 already yields while the letterhead is in frame; line 2 now yields with it; scrolled
  past, the band prints identity · stop · sentence · act — the masthead at 56px

Sentences: Cedar Lane — `DIRECTION` / **Cedar Lane Study** / *Nora Ellison* / `Two of three rooms are
scoped and no fee schedule is chosen — open since 2 September 2026.` / `OPEN THE CONTRACT ROOM`.
Sonnenberg — `PROJECT · DESIGN DEVELOPMENT · CORE · STAGE 06 · ESTIMATED` / **Sonnenberg residence** /
`Week 3 of 9 toward 14 November 2026. Six of eleven pieces are in production and one is blocked;
$17,500.00 has been overdue since 12 August 2026.` / `RELEASE THE NEXT ROOM`. (R140: the owed figure
outranks the agreed; $212,000 does not print in a head.)

Honors V9 P2/P3/P5, SPEC §A3/§A4 (seven steps, wrap never truncate), R66, R140.
`touches: R126` (40→34, negative tracking→0) · `R111, I114` (the phrase survives as words at 11 caps,
loses its own line and bars) · `R127` (band and head become one utterance at two scales) · `R66` (the
readiness band loses ground, glyph, eyebrow; keeps its act).

### Direction 2 — The Band *(interaction's seat; the critic's landmark fold)*

**Thesis:** the 56px sticky band is already the one declared head (R127) — make it the page's only
leader region and delete everything that restates it; the letterhead keeps the name and nothing else.

- letterhead: StrataMark + name only; vitals line deleted
- band line 1: `EDNA COURTNEY · DISCOVERY` (11 mono); at project the resolver phrase
  `SONNENBERG RESIDENCE · PROJECT · DESIGN DEVELOPMENT · WEEK 3 OF 9` with `$212,000` right-flush
- band line 2: the standing sentence at 15px + **one** act + the door:
  `Two essentials open — working budget, how they live. Call held 6 September.` `ADD WORKING BUDGET` `+1 MORE`
- the door is fixed: each row carries its own act, the named item is not re-listed (see D1 below);
  rows split by kind — standing exceptions in terracotta-ink, open inputs in clay-ink
- the stage line (3/4) merges into line 1 and is deleted as a separate print
- the region head (5) keeps its `<h2>` and its rule but prints **nothing** while the band already
  states the standing fact; the stage eyebrow slot in `RegionHead` carries the resolved phrase at
  project/install/care only (the phantom sr-only `<h3>` goes with it — fixes the h1→h3→h2 inversion)
- the readiness band (6) demotes to a caption: the glyph stays (R66's ritual), the count becomes text
  with no `da-act` class; the moment `ready` flips, its fact and act *become* the band's sentence —
  one primary, never two
- keyboard order, desktop and 390: band act → door → tool row ×3 → undo. Five stops, each distinct
- the undo prints its consequence always: `Move back to New Lead — returns this to the lead queue;
  nothing here is lost.`
- 390 pinned: `[Edna Courtney · Discovery]` / `Open · budget, lifestyle` `ADD BUDGET +1`

Sentences: Cedar Lane line 2 — `One room unscoped; fee schedule not chosen.` `CHOOSE THE FEE SCHEDULE`
(named per gap, never the generic act while a specific gap exists). Sonnenberg line 2 — `$17,500
overdue since 12 August; one piece blocked.` `RESOLVE THE BALANCE` `+1 MORE`.

Honors R127 (the 56px contract is the whole height contract), R126/R140 register unchanged, the
`-ink` 4.5:1 floor, W3-R2's inputs-own-section.
`touches: R111` (the sub-label loses its own pre-content line) · `R66` (the readiness act is removed in
favor of the band's) · `I114` (the stage folds into the region head rather than standing free) · `I118`
(names the activate/no-activate split without resolving it).

### Direction 3 — The Standing Paragraph *(the practicing designer's seat)*

**Thesis:** the head speaks in the studio's own voice — the facts of the job, then two sentences that
say where it stands and **who is waiting on whom** — and the eleven-stage vocabulary leaves the glass
entirely.

- name: Playfair 34
- facts line: **Inter 16, ink, tabular** — not metadata — `Whole-house refresh · Beaverdale foursquare ·
  began 4 September`; Direction leads with rooms and the open gate; Project leads with money and the
  target date: `$212,000 · eleven pieces · target 14 November`
- one hairline
- standing sentence: `Three of five essentials in hand; her call ran 6 September.`
- owing sentence, owners named: `Waiting on Edna: budget comfort, and how they live.` — the owed items
  are oak-scored words that jump to their facet
- one act, right: `ASK EDNA FOR BOTH`; the consequence is the sentence above it (P3)
- 2px region rule; then **Discovery** at Playfair 26 as a plain section rule with the stage phrase, if
  it prints at all, as a mono-11 caption at the right of that rule
- the band merges into this head (its reprise on scroll); the track bar deletes; the second glyph deletes
- 390: the same four rows, one column; the act drops to its own 44px full-width row; the whole head is
  ≤5 lines so the essentials checklist is above the fold on a phone
- quiet case: Osterberg — name / `Installed 22 August · settled` / `Nothing is waiting.` / no act, no
  band, no rule

Sentences: Cedar Lane — **Cedar Lane Study** · *Nora Ellison* / `Two rooms of three scoped · direction
opened 2 September` / `The direction is drafted and can't go out without a fee schedule.` / `That one
is yours.` `OPEN THE CONTRACT ROOM`. Sonnenberg — `$212,000 · eleven pieces · target 14 November` /
`Six pieces in production, one blocked; $17,500 overdue since 12 August.` / `The invoice is
Sonnenberg's; the blocked piece is yours.` `CHASE THE BLOCKED PIECE`. Vandersteen — `Install Thursday,
18 September — eight days out` / `Two arrivals are waiting on your inspection. Nothing else is on you.`
`INSPECT THE TWO ARRIVALS`.

Requires one thing that does not exist: a one-line description per engagement (`Whole-house refresh ·
Beaverdale foursquare`). Without it the facts line is assembled from `project_type` + rooms + money and
reads stiffly on half the jobs. (R4.)

Honors R127 (finally enforced), V9 P2 (money/dates/names raised off the metadata floor), P3, P5, R66
soft gate, every non-license.
`touches: R111, I114` (the stage sub-label leaves the head entirely) · `I114, R113` (the track band goes;
"render a band, never an error" becomes "render nothing") · `R126` (34 not 40; facts at Inter 16 not
mono 12) · `R66` (the StrataMark leaves the readiness band).

### Side by side

| | The Masthead | The Band | The Standing Paragraph |
|---|---|---|---|
| Where the head lives | the letterhead | the sticky band | the letterhead, in prose |
| Voice | editorial, one sentence | operational, one line | the studio's, two sentences with owners |
| Stage vocabulary | running head at project+; door at pre-work | band line 1 at project+; region eyebrow | off the glass; mono caption at the section rule if at all |
| Region head at pre-work | deleted | kept, prints nothing | a Playfair 26 section rule |
| Readiness band | act kept, rest folded | caption; becomes the band's sentence when ready | folded into the owing sentence |
| Lines before first content (Discovery, desktop) | 5 | 3 (+ caption) | 5 |
| Rulings crossed | R126 R111 I114 R127 R66 | R111 R66 I114 | R111 I114 R113 R126 R66 |
| New data needed | none | none | one-line description (optional) |
| Panel lean | the most complete answer to "what is this project" | the least construction; the safest ship | the most honest answer to "who is waiting" |

## 3. Rulings for Kody

**R1 — Does the eleven-stage vocabulary print at pre-work stops at all?** Four seats say: it is
machinery, not paper. Print it only where a schedule resolver anchors it (project · install · care);
at brief/discovery/direction/proposal it lives behind a door. This closes A3 without ruling the
mapping. The alternative — complete and rule the stop↔stage map so numbers rise monotonically — is
a bigger job R124/R125 deliberately deferred. *Lean: machinery.*

**R2 — May the head speak in studio-private voice?** "Waiting on Edna: budget comfort" and "$17,500
overdue since 12 August" are exactly what Leah needs and exactly what she does not want Edna reading
across the dining table. Rule whether the designer's Document names who is late and what is owed at
the top, with the client page carrying its own gentler sentence — or keeps one voice both parties
read. *Lean: studio-private, neutral phrasing ("Waiting on Edna:", never "Edna owes you").* This decides
whether the money line may sit at the top at all.

**R3 — Does the pre-work region head survive?** At a one-region stop, is **Discovery** at Playfair 34
under an eyebrow a head, a section rule, or nothing? The Masthead deletes it; The Band keeps it silent;
The Standing Paragraph makes it a section rule. *Lean: a section rule — a name that yields while the
head names it.*

**R4 — A one-line description per engagement.** "Whole-house refresh · Beaverdale foursquare" is the
truest line on Edna's page and today it does not exist. Add an optional field, seeded from
`project_type` + named rooms, editable by the studio? *Lean: yes; the head degrades to the assembled
line without it.*

**R5 — One leader per page.** Today the band's act and "Begin the Direction" are both `primary` with
no coordinating region. Rule that the page has one leader act, and the readiness act becomes the
band's/head's act the moment `ready` flips. *Lean: one leader.*

**R6 — The name at 40 or 34.** R126 set the letterhead at 40; SPEC's scale tops at 34. Two seats want
34 so the sentence can rise to 16 without the head spending the whole scale. *Lean: 34.*

## 4. Found along the way (defects independent of any direction)

**D1 — The `+N MORE` door lists every open input with the same act.** `page.tsx` ~2145 builds each
sheet row as `{ …, act: guideAct }` — one shared act object. For Edna, the "Lifestyle needs" row's
button says and does "Add working budget." Direction's drafting-gap rows share "Open the Contract
Room" regardless of the gap named. Verified in the worktree. Every direction inherits this until it is
patched on its own. *(interaction F1, confirmed by Fable)*

**D2 — Region-jump targets lose their focus ring.** `RegionHead`'s `<h2>` is `tabIndex={-1}` with a
bare `outline-none` and no `focus-visible:` pair; the utilities layer suppresses the global ring.
Rail/ladder jumps focus it. `doc-letterhead.tsx` has the correct declaration two files away. *(critic F2)*

**D3 — A raw pigment printed as text below the house floor.** The stage sub-label uses
`--color-aged-oak` (#8B7355): 4.30:1 on paper-doc, 4.20:1 on paper — under the 4.5:1 floor
`globals.css` itself documents; `clay-ink` (5.75:1) is one token away. `lens-contrast.spec.ts` never
selects `[data-section-stage-line]`, which is how it shipped. *(critic F3/F4)*

**D4 — Heading order h1 → h3 → h2.** The non-hosted stage line prints a sr-only `<h3>Workflow stage</h3>`
between the letterhead's `<h1>` and the region's `<h2>`. *(critic F1)*

**D5 — Typographic contract breaches in the head.** Negative Playfair tracking at 32px
(`doc-letterhead.tsx:78`; §A3 forbids below 40); `text-ellipsis` on the vitals and `LINE_CLIP` on both
band lines (§A4 forbids truncation); the sub-label's 12px UPPER at .09em is an eighth step the sheet
does not have. *(typographer T5/T6/T7)*

**D6 — `Nothing yet` is a literal fallback**, not a derivation — `preworkStatus()` in `page.tsx` and
`registerFor` in `lens-ladder-derivation.ts`. *(IA F2, typographer T9)*

**D7 — The undo has no forward consequence sentence** when available; only its refusal reason prints
when blocked. Its `aria-disabled`-in-tab-order refusal pattern is the right model and should be kept.
*(interaction F4, critic F10)*
