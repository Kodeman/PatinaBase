# Direction B — The Shop Ticket

*The Document — Wayfinding Review · 2026-08-25 · Lane B (restructure where the findings demand it)
· verified against `main@695addb5f`*

---

## 0. Name + summary

**The Shop Ticket.**

In a workshop the ticket travels with the job: one card, clipped to the work, saying what is on
this job and where each part of it sits — and it reads the same at the bench, in the finishing
room, and on the truck. Patina's document has no such card. It has a map made of chrome: the
running index, the rooms block and the shelves live in the spine, which grows them `≥1440px only`
(I136) and only when `engagement_kind === 'project' && active_section === 'project'` (F14,
`doc-spine.tsx:135`). Whether Leah can see what is on the Vandersteen job depends on how wide her
browser is and which week of the year it is. Direction B takes the map off the chrome and clips it
to the paper: one band under the letterhead, seven rows, the same seven on brief and on care, at
1440 and at 390. The spine goes back to what D12 already says it is — put down, marks, timer,
presence. And because every job carries the same ticket, the Desk can stack them: six jobs grouped
by the stage they are in, which answers "show me everything that's in install" (T2, 1.50 — the
review's worst task) at zero acts.

---

## 1. Thesis

**Orientation belongs to the job, not to the screen: if the seven things a designer reaches for
(rooms · pieces · drawings · boards · money · dates · people) are printed on the paper itself
rather than in width-gated chrome, then every item-reach cell is one act at 1440, 1280 and 390 and
on all seven sections — and the same seven rows, stacked across jobs, answer the phase-wide
question without a new tier.**

Falsifiable three ways: (a) if any of the seven classes still costs more than one act from an open
document at any tier, the thesis is wrong; (b) if the install and care spreads still lose reach
that the project spread has (F14, F48), the thesis is wrong; (c) if a designer asked "what's in
install" still has to type, filter or remember, the thesis is wrong.

---

## 2. The IA / map

Act counts are from the anatomy's own reachability inventory (§7) for today, and from this
direction for tomorrow. **⌘K-only** means pure recall. `[Δ]` marks a change from today, with the
finding that forces it.

### 2.1 `/desk` — the studio's one cross-job surface

```
/desk
├─ Header — greeting · TUESDAY · AUGUST 25
│   ├─ ＋ Capture a lead · begin a Brief ................. 1  [Δ F24: sub-label now on the Desk, not only in ⌘K]
│   ├─ ＋ Open a project · no proposal needed ............ 1  [Δ F24]
│   └─ Find anything ⌘K ................................. 1
├─ EVERY JOB · 6 live · 2 overdue ....................... 0  [Δ F04/F23/F39/F65 — replaces the folio grid + Studio pulse]
│   ├─ a stage heading (BRIEF…CARE, empty stages omitted)  0  ← T2 answered by a heading, not a filter
│   ├─ a job line → open the job ....................... 1
│   └─ a job line's own act (Nudge · File the claim · …) 1
├─ THE STUDIO (Contents — labels + doorways only, R95/C15 unchanged)
│   ├─ ROOMS: Library · People · Scans ................. 1  [Δ F17]
│   ├─ LEDGERS: Orders · Accounts · Hours · The Post ... 1
│   └─ BEGIN: + Open the Drafting Room ................. 1  [Δ F51: no longer ⌘K-only]
├─ Studio Drawer (≥1180) ............................... 1–2 [Δ F17; `Studio books` → `The ledgers`]
├─ g-chords g l/p/r/o/a/h/t ............................ 1 (2 keys) — now printed, see §5
└─ ⌘K .................................................. 1 to open, 2 to any row
    └─ RETIRED: the `Recent boards` strip [Δ F62 — boards get one door, on the ticket]
```

**Gone:** the four-up folio grid with `NEEDS YOUR HAND 8` over four cards and four folded (F23),
`STUDIO PULSE` (F39), `RECENT BOARDS` (F62). **Arrived:** one roster of every live job, grouped by
stage. Needs are no longer a separate list; they are a red-letter mark on the job's line. Nothing
is folded on first paint.

### 2.2 `/doc/[id]` — the document, at every width

```
/doc/[id]
├─ SPINE (≥1440: 200px · 1180–1439: 56px · <1180: sheet)
│   ├─ ← Put down 1 (Esc, 1 key) · seven marks 1 · timer · presence
│   ├─ On this paper — running index, ≥1440 .......... 1 per region [Δ labels only; C11 intact]
│   ├─ ✗ Rooms block ................................. MOVED to the ticket [Δ F01/F14/F60 — amendment B1]
│   └─ ✗ Shelves block ............................... MOVED to the ticket [Δ F01/F14/F48 — amendment B1]
├─ LETTERHEAD — title · household chip · vitals · folio
├─ ★ THE TICKET — one band, seven rows, every width, every section [Δ NEW; F01 F02 F14 F16 F17 F30 F48 F60 F62 F72 F82]
│   ├─ Rooms ... expands in place; a chip LIFTS (C8's lens doctrine kept) ......... 1
│   ├─ Pieces .. scrolls + unfolds Project · FF&E, room-grouped .................. 1
│   ├─ Drawings ≥1440 plan-room leaf · below routes /doc/{id}/plans .............. 1
│   ├─ Spec .... leaf or /doc/{id}/spec-book — on EVERY section [Δ F48] .......... 1
│   ├─ Boards .. the one boards door; carries `Start a board` [Δ F30/F62] ........ 1
│   ├─ Money ... unfolds Money; the row names what is owed [Δ F16/I141] .......... 1
│   ├─ Dates ... unfolds Schedule; prints the install date in words .............. 1
│   └─ People .. opens the Call sheet [Δ F29; flag-absent state named] ........... 1
├─ GUIDE / RED-LETTER ZONE — one sentence, one act (§3) [Δ F07/F18/F77]
├─ REGIONS — Client approvals · Schedule · Project · FF&E · Money (mount order unchanged, C11)
├─ THE RECORD `The record · {n} settled` [Δ F90] · kickoff · colophon
├─ MARGIN — rail ≥1440 · sheet 1180–1439 · chips <1180 (unchanged)
└─ ⌘K — opener now printed at 390 [Δ F49]
```

**Every change, with its finding:** rooms + shelves blocks leave the spine and become ticket rows
(F01, F14, F60 — amendment B1); spec book gains a door on install/care (F48); boards go from three
doors to one (F62, F30, F84); the money row names receivables (F16, I141); the room lens works
below 1440 (F60); the stage word prints at 1280 (F02, partly); the Drafting Room gains a Desk
doorway (F51); the Desk becomes a stage-grouped roster (F04, F23, F39, F65); `The Rooms` → `Scans`,
`Studio books` → `The ledgers` (F17); `Design authority` → `Money` (F09, F61); `Knowledge` retired
(F12, closes a known-open); ⌘K gains a phone opener (F49) and a plan-room row (F50, SP-16).

**What does not move:** what-stays-true #1–#12 — the Esc LIFO, `← Put down`, the send-wall line,
`Add a room` in flow (C12), the index's scroll-spy and derivation (C11), fold persistence, the
one-piece-one-line FF&E row, zero shadows (C2), honest empties, the drawer's discipline.

---

## 3. The per-stage "what's next" organ

### 3.1 What replaces what

`deriveDocumentGuide`'s precedence (`document-guide.ts:316–397`) is **kept for rungs 1–5** and
**replaced at rung 6**. Rung 6 is `stageCopy[stage]`, a static table whose action labels are five
shrugs out of seven (F18), plus the default need action `Review now`. Direction B replaces it with
**`deriveTicketLeader(ticket, stage)`**: the sentence and the act are computed from the same seven
ticket rows on screen, so the guide can never name something the map does not show.

```
1  unavailable      → unchanged (`:327`), eyebrow fixed by SP-08
2  paused           → unchanged (`:340`)
3  gate             → unchanged (`:362`)
4  need             → unchanged (`:374`), reason line fixed by SP-06
5  proposal         → unchanged (`:383`), fallthrough act fixed by SP-12
6  ticket leader    → REPLACES `stageCopy[stage]` (`:388–397`)
```

**Guide vs red-letter (F07, `page.tsx:1111–1118`).** They stay mutually exclusive; what changes is
that **the zone's first row registers the mobile primary** (`red-letter-zone.tsx`, mirroring
`document-guide.tsx:52–64`) — today only the guide does, so at 390 the urgent zone has no act and
the bar shows a truncated `MESSAGE THE CLI…`. One primary, always the urgent one.

### 3.2 The tie-break, stated once

When two ticket rows are both unclear, the guide prints the first that survives this order:

1. **Money at risk today** — a carrier window, a price expiry, a deposit that gates a release.
2. **A dated promise to the client** — an approval or a signature past its date.
3. **A piece that cannot move** — an unanswered PO, a missing COM, a damaged line.
4. **Work that can wait** — everything else, in ticket order (rooms → pieces → drawings → spec →
   boards → money → dates → people).

Ties inside a rank go to the older date. If no row is unclear, the guide prints the stage's rest
state (below) — never a shrug.

### 3.3 The seven sentences and acts (Vandersteen specimen where it applies)

| Section | Sentence (headline) | Act label | Where it sits | Tie-break when two compete |
|---|---|---|---|---|
| `brief` | `A new inquiry, five days old.` | `ACCEPT · BEGIN A BRIEF` | Guide block | A response-by date outranks age; a budget band, if named, rides the sentence (`$15k – $50k`, SP-17) |
| `discovery` | `Five things still missing before you can price it.` | `ADD SCOPE & ROOMS` | Guide block; focuses the checklist row of the same name (SP-18, F43) | First unmet input in checklist order; client-owned outranks studio-owned |
| `direction` | `The direction isn't written yet.` | `OPEN THE DRAFTING ROOM` | Guide block; the Direction · v1 block drops its duplicate `CONTINUE DRAFTING` (F64) | If boards exist but the offer doesn't, the offer wins |
| `proposal` | `Sent to Erin Byrne six days ago. Never opened.` | `NUDGE ERIN BYRNE` | Guide block, anchored to the send-wall's live act (SP-12, F36) | Rung 5 owns this section; countersign outranks nudge; nudge withheld on `issued_on_paper` (C13 errata) |
| `project` | `Sturdy Oak hasn't answered PO-2026-0418 in fourteen days. The lead time already runs past install.` | `CHASE THE PO` | Red-letter zone when a dated need exists, else the guide block | Rank 2 outranks rank 3 — on Tue Aug 25 the specimen's zone carries the two dated approvals (older first: 6 days, then 3 days) and the PO rides the ticket's `Pieces` row, which also carries the console's carrier window. The zone's contents are §8's, unchanged |
| `install` | `The carrier window on the brass-and-oak console closes tomorrow.` | `FILE THE CLAIM` | Red-letter zone | Rank 1; then a missing piece for install day; then punch list |
| `care` | `Two punch-list items and the final walkthrough are left.` | `WORK THE PUNCH LIST` | Guide block — Care grows a branch it lacks today (F77) | Checklist clear but money isn't → `An invoice has been out 22 days.` / `SEND A REMINDER` |

**Rest states**, so no stage can shrug when nothing is unclear: `brief` `Nothing to decide yet.`;
`discovery` `Discovery is complete. Shape the direction.` / `BEGIN THE DIRECTION`; `direction` `The
direction is written. Send it.` / `SEND THE AGREEMENT`; `proposal` `Signed. Open the project.` /
`OPEN THE PROJECT`; `project` `Everything ordered is moving.` / `RELEASE THE NEXT ROOM`; `install`
`Install day is Tuesday, September 15.` / `HOLD THE WINDOW`; `care` `Everything is settled — close
the book when you're ready.` / `CLOSE THE BOOK` (the care band's own copy, already gated by
`closureReady`). Every one is a verb and an object. `Review` appears nowhere.

---

## 4. The item-reach table

Reach = acts to the item's own surface **from an open document**. `⌘K-only` and `unreachable` are
today's readings from anatomy §7. Every cell over 2 is a declared exception with its reason.

| Class | ≥1440 | 1280 | 390 |
|---|---|---|---|
| **Rooms** | now 1 (spine block) · **B: 1** — Ticket › Rooms expands, a chip lifts | now **unreachable** (F01, F60) · **B: 1** | now rooms-only list, no lens (F15) · **B: 1**, chip lifts |
| **Products — an FF&E line** | now 2 · **B: 2** (Pieces → room-grouped line) | now 2, but no lens over 36 lines (F60) · **B: 2** with the lens | now 2, heading covered by the `ADD TO PROJECT` plate (F28) · **B: 2**, plate demoted |
| — *its spec attributes* | route only, no link from the line (F57) · **B: 3** ⚠ | **B: 3** ⚠ | **B: 3** ⚠ |
| **Boards** | now 1 on `project` only, plus two rival doors (F62) · **B: 1**, the only door | now **unreachable** · **B: 1** | now **unreachable** · **B: 1** |
| **Documents — plans** | now 1; typed ⌘K returns No match (F50) · **B: 1** | now **unreachable** · **B: 1** | now **unreachable** · **B: 1** |
| **Documents — spec book** | now 1 on `project`, **no door at all on install/care** (F48) · **B: 1 on all seven sections** | same · **B: 1** | same · **B: 1** |
| **Money** | now 1, but 3–4 rival doors (F08) and no receivable anywhere (F16) · **B: 1**, the row names what is owed | **B: 1** | **B: 1** |
| **Schedule** | now 1; two regions share the name (F35, SP-02) · **B: 1** (Dates) | **B: 1** | **B: 1** |
| **People — the roster** | now 1 (instrument or shelf, flag `call-sheet`); **unreachable from the Desk** (F29) · **B: 1** | now **unreachable** below 1440 except the instrument · **B: 1** | now 1 · **B: 1** |

**Declared exceptions (every cell over 2):**

1. **Spec attributes of one FF&E line = 3 acts at every tier** (`Ticket › Pieces` → line unfold →
   `Edit spec details →`, SP-19). Two editable homes for one attribute is how `RECEIVED` and
   `DELIVERED` came to disagree about the same walnut sectional (F58). One editable home, one
   visible route.
2. **Every class from `/desk` = 2 acts** (open the job, then the ticket row). Reason: C1/D1 —
   "Strict one document at a time. No split view, no peek/hold." Direction B pays that price and
   builds no Desk-side artifact browser; what it buys is that act two is the *same* act on every
   job, at every width, in every section. F82 is answered by making act two constant, not by
   removing it.

**Install and care, explicitly (F14, F48).** On `w1440-doc-install` and `w1440-doc-care` the spine
prints `← PUT DOWN`, seven marks, the active label and the timer, and nothing else —
`DocSpineShelvedBlocks` mounts only when `engagement_kind === 'project' && active_section ===
'project'`. So on the two spreads where she is standing in a house, rooms, boards, plans, spec book
and roster are **unreachable at every width**, and no registry row exists for ⌘K to find the spec
book (F48). Under Direction B the ticket is mounted by the document, not the section: **install and
care read identically to project — all seven rows, one act, at 1440, 1280 and 390.** That single
change moves T6 (2.58), T13 (2.78) and T14 (2.78) off the floor.

---

## 5. Lexicon stance

Voice rules applied throughout: Playfair headline, Inter body, DM Mono label; plain-spoken Midwest;
studio word paired with trade word where a term is real but opaque; never engine/AI framing.

| Old label | New label | Why (brand voice + finding) |
|---|---|---|
| `Design authority` (region, seam, index row) | **`Money`** · sub `what's authorized, what's owed` | F09/F61: today `money` appears only in a small eyebrow while the name reads as a permissions setting — P2 and P3 both first-glanced it that way. Plainest true word, plus the trade pairing. One label in `PROJECT_PAPER_ORDER` (`document-index.ts:34–55`); C11's derivation untouched. |
| `Knowledge` (shelf) | **retired** | F12: the row reads `Knowledge   STUDIO LIBRARY →`, the leaf calls itself `STUDIO LIBRARY · CROSS-PROJECT`, holds nothing, and duplicates a drawer door. Deleting it **closes a named known-open item** (I136) rather than renaming around it. |
| `The Rooms` (drawer, `g r`) | **`Scans`** · sub `rooms you've measured` | F17: `Scans` says exactly what `/rooms` holds — cards titled by person, `Kitchen · scanned Aug 24`. P4 opened `The Rooms` looking for a sofa and backed out. |
| the spine's `Rooms` block | **`Rooms`** (ticket row) · sub `{n} rooms · {n} lines` | F17: the one sense a designer means keeps the noun. |
| `Plan room` (shelf) | **`Drawings`** (ticket row) · leaf eyebrow keeps **`The plan room · the current set`** | F17/F50: `Drawings` is what P3 decodes on sight; `plan room` is a real trade word, kept where a trade reader meets it. Studio word outside, trade word inside. |
| `The Record` (canon) / `Previous work · {n} complete` (screen) | **`The record · {n} settled`** | F90: canon names it `The Record` (C10, I137:8608) and the string never prints. `settled` is the paper's own state word (`section-derivation.ts:15`). |
| `In this document` (spine index heading) | **`On this paper`** | The product's own metaphor — "the paper IS the screen" (D12) — and it stops colliding with the ticket's `The job`. |
| the seven section names vs the Patina Six (F42) | **kept apart by register, never renamed** | Two vocabularies, two jobs: the seven (`Brief · Discovery · Direction · Proposal · Project · Install · Care`) name **sections of the paper**; the Six (`Consultation · Schematic Design · Design Development · Procurement & Orders · Installation & Styling · Completion`) name **phases of the work**. Direction B forbids them from printing in one glance: sections live in the spine and the ticket's stage cell prints the **phase** — `Procurement & Orders · 4 of 6` — never the section word. The Schedule region already speaks only the Six. That removes the collision on one paper without touching `active_section` and therefore **without depending on I114**. |
| `Closing the book` | **kept**, glossed: `Closing the book · the last six things` | The best trade phrase on the surface; it only needs to say how many things are left, which `care-band.tsx:293–315` already computes. |
| `Studio books` (drawer group) | **`The ledgers`** | Three books today. `The ledgers` matches the Contents column head that already reads `LEDGERS` (`desk-contents.tsx:204`) and frees `book` for the job's own two (C20). |
| `The Post` | **kept**; SP-11 adds the connective `Mail & messages` | P1–P4 all read it as mail; the kinship with `Message {Family}` is the plank's job, not a rename's. |
| `Add to project` (FF&E leader) | **`Add a line`** (SP-09) | Shared plank. |
| `Team…` (colophon) | **`Add to the team`** (SP-10) | Shared plank. |
| ⌘K `ask the Engine` | **plain search language** (SP-07) | Shared plank — hard brand rule, never engine framing. |

**Candidate section↔stage mapping — labelled `candidate for I114`, and nothing in this direction
depends on it.** `brief` → Consultation · `discovery` → Schematic Design · `direction` → Design Development ·
`proposal` → *no phase — the agreement sits between Design Development and Procurement* ·
`project` → Procurement & Orders · `install` → Installation & Styling · `care` → Completion. The
asymmetry (seven sections, six phases, one with no phase) is why the mapping is hard — and why the
first slice reads `active_section` for **placement only** and prints the phase from the schedule's
own data. If Kody rules differently, nothing in the ticket changes.

---

## 6. Five mock screens — drawing instructions

**Rules for the builder.** Every number, name and date is the §8 Vandersteen specimen; where §8
gives no figure, print the product's own honest empty (`Nothing filed`, `No boards yet`, `Nobody on
it yet`) — never invent one. Today is Tuesday 2026-08-25; the timer reads `0:47`; The Post carries a
dot, never a count. Zero shadows (C2); every act is bare DM Mono scored ink (C6). `SP-xx` marks a
shared plank, drawn identically to Direction A's mocks.

### M1 · `/desk` at ≥1440

Top to bottom, single column, `max-w-[1040px]`:

1. **Header.** Playfair `Good morning, Leah` · DM Mono `TUESDAY · AUGUST 25`. Right: three scored
   acts, each with its sub-label printed on the Desk for the first time (F24) — `＋ CAPTURE A LEAD`
   / `BEGIN A BRIEF`, `＋ OPEN A PROJECT` / `NO PROPOSAL NEEDED`, `FIND ANYTHING ⌘K`.
2. **`EVERY JOB · 6 LIVE · 2 OVERDUE`** (DM Mono eyebrow, rule above it). One Inter line beneath:
   `Two things are overdue — Vandersteen and Byrne.` Nothing is folded.
3. **The roster**, grouped by stage in the paper's own order; empty stages are not printed. Each
   group is a DM Mono heading with a count; each job is one line — Playfair name · Inter
   place-and-state · one scored act at the right. Overdue lines carry a red-letter mark at the left
   margin (no badge — C4); setup chores wear a different stamp colour from dated overdue items
   (SP-20).

   ```
   DISCOVERY · 1
     Reinhardt lake house        Green Lake WI · 0 of 5 essentials captured — keep going
                                                                    ADD SCOPE & ROOMS   (SP-18)
   DIRECTION · 1
     Kaminski condo              Milwaukee · the direction isn't written yet
                                                                    OPEN THE DRAFTING ROOM
   PROPOSAL · 1
   ▌ Byrne remodel               Cedarburg WI · design agreement sent August 19 —
                                 six days, never opened · $9,400 · four milestones
                                                                    NUDGE ERIN BYRNE     (SP-12)
   PROJECT · 1
   ▌ Vandersteen residence       Shorewood Hills · Procurement & Orders · 4 of 6 ·
                                 install Tuesday, September 15 · OVERDUE 6 DAYS —
                                 primary bedroom approval
                                                                    OPEN THE JOB
   INSTALL · 1
     Okonkwo kitchen             Middleton WI · installed August 14 · punch list open
                                                                    WORK THE PUNCH LIST
   CARE · 1
     The sixth job               quiet · nothing needs your hand
   ```

4. **`THE STUDIO`** — the Contents Page, unchanged in kind (R95/C15: labels + doorways only), with
   three edits: `The Rooms` → `Scans`, `Studio books` → `The ledgers`, and `Open the Drafting Room`
   added to the `BEGIN` column (F51 — it stops being ⌘K-only).
5. **Studio Drawer** strip along the foot, unchanged but for those two renames.

**Gone:** the four-up folio grid, `4 IN REACH · 4 FOLDED BELOW`, `REVEAL 4 MORE FOLIOS ↓` (F23),
`STUDIO PULSE` (F39, its two live facts absorbed into the roster header), `RECENT BOARDS` (F62).

### M2 · `/doc/[id]` project section at ≥1440 — the Vandersteen residence

Three columns: 200px spine · `max-w-[1040px]` paper · 232px margin.

**Spine** — `← Put down`; seven marks in one row, `Project` lifted; `Project / ACTIVE`;
**`ON THIS PAPER`** with four rows (`Client approvals · 2 awaiting` / `Schedule · install September
2026` — SP-02 renames the fold-seam Rule `Schedule dates` / `Project · FF&E · 36 lines · 4 rooms` /
**`Money · $141,600 ordered`** — label and value both change, F09/F61); then `● IN HAND / 0:47`,
`PAUSE`, `+ LOG`; then `Just you · visible to the studio`.
**No Rooms block. No shelves block.**

**Paper**, top to bottom:

1. **Letterhead** — Playfair `Vandersteen residence`; italic `for the Vandersteens ↗`;
   DM Mono vitals `Procurement & Orders · Target September 2026 · $184,500`.
2. **THE TICKET** — the new organ. A rule above, a rule below, no box, no fill.
   ```
   THE JOB · PROJECT                          PROCUREMENT & ORDERS · 4 OF 6        FOLD ↑
   Rooms      4 rooms · 36 lines                                                        →
   Pieces     29 ordered · 6 delivered · 2 in transit · 1 damaged · 2 unspecified        →
   Drawings   Nothing filed                                                              →
   Spec       34 of 36 specified · by room                                               →
   Boards     No boards yet · start one                                                  →
   Money      $141,600 ordered · $17,500 owed you, 22 days · $12,300 deposit not drawn    →
   Dates      Install Tuesday, September 15 · three weeks out                            →
   People     Nobody on it yet                                                           →
   ```
   Labels DM Mono, values Inter, `→` is the door. `Rooms` expands **in place** to four chips —
   `Living room 14 · Dining room 8 · Primary bedroom 9 · Mudroom 5` — and clicking one lifts it
   across FF&E, the spec leaf and the boards leaf, keeping its state word with `In hand` added and
   hiding nothing (C8's lens doctrine, unchanged). `Pieces` leads with exceptions. With `call-sheet`
   off, `People` reads `the call sheet isn't turned on for this studio` — absence and emptiness
   never look alike.
3. **Red-letter zone** — exactly the specimen's two, older first, no badge:
   ```
   NEEDS ATTENTION · IN ONE PLACE
   ▌ OVERDUE 6 DAYS   The Vandersteens still haven't approved the Hartland wool rug and
                      the walnut nightstands for the primary bedroom. Sent August 13.
                                                                    SEND A REMINDER
   ▌ OVERDUE 3 DAYS   The reading chair still has no fabric. The workroom needed COM by
                      August 22 to hold install.                    CHOOSE THE FABRIC
   ```
4. **Letterhead instruments** — `MESSAGE THE VANDERSTEENS` (leader) · `PREVIEW AS THE
   VANDERSTEENS` · `SHARING · MILESTONES` · `CALL SHEET · 0`. The leader is conditional on a client
   existing (F52).
5. **Regions**, mount order unchanged (C11): `Client approvals` (2 awaiting · lead: the
   Vandersteens) · `Schedule` · **`Project · FF&E`** — head `4 groups · 36 lines · 2 awaiting
   authorization`, ledger `RELEASE FOR AUTHORIZATION` (leader) · `ADD A LINE` (SP-09) · `BILL 3
   UNINVOICED` · `SPEC BOOK →`; rooms print as headings with `ADD A ROOM` in flow at the foot (C12).
   The damaged line unfolds to `Brass-and-oak console · Fond du Lac Ironworks · delivered August 19
   · top panel gouged · photographed at receiving · claim drafted, not filed · carrier window closes
   tomorrow`, acts `FILE THE CLAIM` and `EDIT SPEC DETAILS →` (SP-19).
6. **`Money`** — renamed head, four rows `Authorized` (SP-03) · `Plan` · `Committed` · `Moved ·
   $14,420 in motion — ordered through installed (committed, not yet paid out)` (SP-04), the
   migration sentence deleted (SP-05), and **a fifth rung, `Owed you · $17,500 · Invoice 2026-114 ·
   22 days`** (F16 / known-open I141) with act `SEND A REMINDER`.
7. **`The record · 3 settled`** (F90) · kickoff band · colophon (`Brief a vendor · Hold · Archive ·
   Add to the team`, SP-10).

**Margin rail** (232px) — `IN THE MARGIN`, `+ DECISION`, `+ NOTE`, the specimen's live items.

### M3 · `/doc/[id]` at 1280 — the same job

Two columns: 56px spine · paper. The margin is its `MARGIN ←` tab.
**The paper is identical to M2, ticket included** — same eight lines, same values, same doors. The
ticket's values wrap to a second line where they must; nothing is dropped.
The spine is the compact rail: bare `←`, seven marks, `● In hand / 0:47`. The word `Project`
appears on screen once, in the ticket's own eyebrow `THE JOB · PROJECT` (F02, the substance).
`Drawings`, `Spec` and `Boards` route to `/doc/{id}/plans`, `/doc/{id}/spec-book` and the board,
each returning `← Vandersteen residence` (SP-14); at 1280 there is no 320px leaf, so there is no
force-close on resize either. **Everything that vanishes at 1280 today (F01) is on this screen.**

### M4 · `/doc/[id]` at 390 — the same job in her hand

One column, `px-7`. Order: letterhead → **ticket, folded to its seam** → red-letter zone →
instruments → regions → record → colophon → mobile bar.

- The ticket at rest is **one scored seam line**, the product's own device:
  `THE JOB · PROJECT · Procurement & Orders 4 of 6 · 1 damaged · $17,500 owed you   UNFOLD ↓`.
  Unfolded it is M2's eight lines stacked, values under each label. The mobile spine sheet keeps
  sections and the margin and stops pretending to be a map (F15).
- **FF&E head fix (F28):** `Project · FF&E` prints on its own line and the ledger acts sit *below*
  it, wrapped, so nothing covers the heading. `ADD A LINE` (SP-09) is scored ink at 44px height,
  not a filled plate.
- **Mobile bar:** left `IN THIS DOCUMENT / Project`; centre **the red-letter zone's first act** —
  `SEND A REMINDER` — because the zone now registers the mobile primary (F07); right `···  MORE`.
  Between the context word and the centre act sits a new **`⌘K`/`FIND` glyph button**, 44×44 — the
  first visible way to open the command bar on a phone (F49).
- The `More` menu prints `The Post   NEW` (state, not a count — SP-15) under the group label
  `Mail & messages` (SP-11), then `The ledgers`, then `Time in hand`, then `Leave a note`.
- Region status text no longer truncates mid-word: `Client approvals — 2 awaiting · the
  Vandersteens` wraps (F87).

### M5 · `/doc/[id]` **install** section at ≥1440 — the Okonkwo kitchen

*Why this one:* it is the exact screen where today's map does not exist. On an install document
`DocSpineShelvedBlocks` never mounts, so rooms, shelves, plan room, spec book, boards and the
roster are unreachable at every width, and the spec book has no registry row for ⌘K either (F14,
F48). If the ticket reads the same here as on M2, the thesis holds; if it needs a special case, it
does not.

Draw M2's exact composition with the Okonkwo kitchen's own facts, and **no invented figures**:

```
SPINE   ← Put down · seven marks, Install lifted · Install / INSTALLATION
        ON THIS PAPER — Client approvals · Schedule · Install · Money
        ● IN HAND / 0:47 · Just you · visible to the studio

LETTERHEAD   Okonkwo kitchen        for the Okonkwos ↗
             Installation & Styling · Middleton WI

THE JOB · INSTALL                      INSTALLATION & STYLING · 5 OF 6        FOLD ↑
Rooms      Kitchen                                                                →
Pieces     Everything delivered · punch list open                                 →
Drawings   Nothing filed                                                          →
Spec       Nothing specified yet                                                  →   ← the door F48 says does not exist
Boards     No boards yet · start one                                              →
Money      No balance due · verified from billing                                 →
Dates      Installed August 14 · punch list open                                  →
People     Nobody on it yet                                                       →

GUIDE      INSTALL · FINISH IN THE FIELD
           Two punch-list items are still open.            WORK THE PUNCH LIST

REGIONS    Client approvals · Schedule · Install (heading reads `Install`, and on a Care
           document the same heading reads `Care` — SP-01) · Money · Closing the book ·
           The record · colophon
```

Everything empty says so plainly, and each of the seven rows is still one act. The same drawing at
390 is M4's composition with these values — the screen she actually holds standing in the Okonkwos'
kitchen.

---

## 7. Keeps · Refuses · Costs

**Keeps.** The Esc/put-down LIFO. `← Put down` as a trade verb. The send-wall state line as the
model for every state-plus-one-act line — the ticket's rows are drawn in its image. `Add a room` in
flow (C12). The running index's derivation and scroll-spy (C11). Fold persistence. One piece and
its PO state on one line. Zero shadows (C2), scored ink (C6), one leader per region (C7), the
Record at the foot (C10), honest empties, the drawer's no-badge law (C4) and 44×44 discipline. The
room lens that lifts and never filters — C8's lens clause, extended to two more widths.

**Refuses.** A fleet or roster *tier* — the phase-wide question is answered by grouping the Desk's
own jobs, so nothing new has to be learned. A Desk-side artifact browser — reaching a board still
costs opening its job, because D1 is right (C1). Split views, peeks, tabs. Restoring the shelves at
1280 *as shelves* — they come back as paper, never as chrome. Badges on the drawer. A second
editable home for spec attributes (F58's lesson). Any dependency on I114. The send–seal wall.

**Costs — engineering surface.**

| What | Where (anatomy) |
|---|---|
| New organ + derivation | `components/document/job-ticket.tsx`, `src/lib/document/ticket-derivation.ts` (new); mounted in `doc/[id]/page.tsx` after the letterhead |
| Spine loses two blocks | `doc-spine.tsx:135`; delete `spine-rooms-block.tsx`, `spine-shelves-block.tsx`; `spine-shelved-blocks.tsx:103–150` values move to the ticket; `spine-running-index.tsx` untouched |
| Shelves become ticket rows | `shelves.ts:33–110` (the `knowledge` entry deleted, the ≥1440 gate removed); `shelves/shelf-panel.tsx:94` gains a below-1440 route mode; `page.tsx:553–562` force-close-on-resize removed; `room-lens-context.tsx` loses its below-1440 auto-release |
| Guide rung 6 replaced | `document-guide.ts:91–141` (`stageCopy` action labels), `:388–397`; `red-letter-zone.tsx` + `document-guide.tsx:52–64` (mobile primary) |
| Money gains a rung, and a name | `money-region.tsx:245–336`; `document-index.ts:34–55` (one label) |
| Spec book ungated | `ffe-section.tsx:1009–1015`; a spec-book row added to `registry.tsx` so ⌘K can find it |
| Renames | `registry.tsx:106–119` (`The Rooms` → `Scans`), `studio-drawer.tsx:361` (`Studio books` → `The ledgers`), `desk-contents.tsx:220–236` (Drafting Room entry) |
| Desk roster | `desk/page.tsx:328–380`, `folder-card.tsx`; `studio-pulse.tsx` and `recent-boards-strip.tsx` unmounted |
| ⌘K | `command-bar.tsx` — SP-07 copy, SP-16 plan-room row, a 44×44 phone opener in `mobile-bar.tsx` |
| Tests | `worktable.test.tsx` byte-identity assertion rebased onto "main + ticket"; a new fixture per section for the ticket's honest empties |

No migration, no data-model change; every ticket value is already read by the spine blocks or the
region heads. One new fail-closed flag, `job-ticket`.

**Amendment ledger.**

**B1 — amends C8 / I136 (`DECISIONS.md:8427`).**
Quoted clause (11 words): *"The spine grows three blocks — ≥1440px only."*
**Gains:** the job's rooms, drawings, spec book, boards and roster stop being a ≥1440 privilege and
a `active_section === 'project'` privilege — they become one act at 1440, 1280 and 390, on all
seven sections, closing F01, F14, F48, F60, F72 and half of F82, and moving three of the five worst
tasks (T5 2.50, T6 2.58, T14 2.78).
**Gives up:** the shelved spine as an organ — both blocks are deleted, and ~180px at the top of
every document's measure goes to the ticket. I136's sentence "the paper holds the work, the shelves
hold the artifacts" survives in meaning, not in furniture: artifacts are *listed* on the paper and
still *open* beside it at ≥1440.
**Rollback:** `job-ticket` off restores `doc-spine.tsx:135` and both blocks byte-identically; the
running index, the lens, and C11 were never touched, so there is nothing else to unwind.

**B2 — amends C14 / I138 (`DECISIONS.md:8740–8742`) — conditional, and pre-priced.**
Quoted clause (7 words): *"the flag off is main's composition exactly."*
This binds only if Kody reads that clause as a standing guarantee about *any* future flag rather
than a statement about `worktable` at I138. If he does: **gains** — the ticket can land without
waiting on Kody's still-owed flag-on Worktable walk, which has never happened (I143); **gives up** —
`worktable.test.tsx`'s byte-identity assertion now reads "main plus whatever has GA'd", and one
guard becomes two; **rollback** — turn `job-ticket` off and the assertion is literally true again.
Named here rather than left for a verifier to find.

---

## 8. First slice

**Ship the ticket on `project` and `install` documents only, all seven rows, all three widths,
behind `job-ticket`. Nothing else.** Not the Desk roster, not the guide rewrite, not the renames —
those are waves two and three.

Why it changes a Tuesday: on 2026-08-25 Leah opens the Vandersteen to learn whether the console
claim can still be filed and whether Sturdy Oak ever answered. Today "where is anything" is a 200px
spine she only has at 1440, and on the install document not at all. After this slice one band under
the letterhead says `1 damaged`, `$17,500 owed you, 22 days` and `$12,300 deposit not drawn` before
she has scrolled — and each of the seven is one click, on the laptop in the car as much as on the
studio monitor.

**Metric it moves:** *unaided acts* (Leah-01) — item-reach goes from 4 acts, ⌘K-only or unreachable
to 1 act in eleven of the twenty-one cells in §4, including all seven on install. Secondary:
*old-portal flights*, which P1's own tell says spike during install week.

**Estimate:** 8 working days (≈1.5 weeks) — the derivation is a re-read of values
`spine-shelved-blocks.tsx:103–150` already computes; the new work is one component, one flag, one
width rule, and the below-1440 leaf-to-route branch.

**Files:** `job-ticket.tsx` + `ticket-derivation.ts` (new) · `doc/[id]/page.tsx` (mount,
`:553–562`) · `doc-spine.tsx:135` · `shelves.ts:33–110` · `shelves/shelf-panel.tsx:94` ·
`ffe-section.tsx:1009–1015` · `room-lens-context.tsx`.

**Does not depend on I114**: placement reads `active_section`; the phase cell reads the schedule.

---

## 9. Landing on both baselines

**Flag off — today's paper.** The ticket mounts between the letterhead and the guide/red-letter
zone. The spine keeps `← Put down`, the marks, `On this paper`, the timer and the presence line,
and loses the rooms and shelves blocks (B1). At ≥1440 a ticket row still opens a 320px leaf beside
the spine — the reading position no longer re-wraps under it, because the ticket, not the FF&E
head, is what the leaf sits beside (F45). Below 1440 the same row routes to the leaf's own page and
returns `← Vandersteen residence` (SP-14). The regions, their mount order, their leaders and the
Record are untouched.

**Flag on — the Worktable (C14, the destination).** The ticket mounts **above `TableFrame`**: it is
the job's header, the table is the job's middle — I138's own division. Per table: **Intake** — the
ticket's empty rows *are* the `opens when…` seams the brief spread invents separately, so those
three inert rows are deleted (F71). **Speccing** — the `Boards` row anchors to the on-paper boards
strip instead of opening a leaf, so Q1/C9 stands untouched and the third door (the Desk strip) is
the one that dies (F62, F84); the rooms rail is deleted, because `Rooms` is a ticket row on every
table and no longer appears and disappears between direction and project (F54). **Finalize** —
unchanged, except `The client's copy` becomes an eighth ticket row on proposal documents rather
than a proposal-only shelf. **Delivery** — the release lift keeps the table head (I141); the money
seam is deleted, because the `Money` row is a truer version of the same compression and carries the
receivable the seam cannot (F16, I141's known-open); the install setting finally moves an item-reach
cell, which is exactly what F32 says it does not do today.

**Shared:** the ticket itself — same eight lines, same values, same doors, same seam at 390 — in
both flag states. **Differs:** what sits beneath it.

---

## 10. Coverage

**Blockers and highs.** `Addressed by` names the section/move; every row is one of addressed,
deferred or out of scope.

| id | sev | Addressed by | or deferred / out of scope |
|---|---|---|---|
| F01 | blocker | §2.2, §6 M3 — the map moves to the paper (amendment B1) | — |
| F04 | blocker | §2.1, §6 M1 — the Desk roster grouped by stage; `install` is a heading | — |
| F14 | blocker | §4, §6 M5 — the ticket is mounted by the document, not the section | — |
| F28 | blocker | §6 M4 — FF&E head on its own line, ledger acts wrapped below, `Add a line` unplated | — |
| F48 | blocker | §2.2, §4, §6 M5 — `Spec` is a ticket row on all seven sections; a spec-book registry row for ⌘K | — |
| F49 | blocker | §6 M4 — a 44×44 `⌘K` opener in the mobile bar | — |
| F02 | high | §6 M3 — `THE JOB · PROJECT` prints the section word at 1280 | the bare `←` put-down glyph **deferred**: 56px cannot hold the word; the ticket now names the job in words instead |
| F03 | high | SP-01 | — |
| F05 | high | §6 M2 — `Rooms` row and room-grouped FF&E; zero-room projects print `No rooms yet · add one` beside the row | — |
| F07 | high | §3.1 — the red-letter zone registers the mobile primary | — |
| F09 | high | §5 — `Design authority` → `Money` | — |
| F10 | high | §5 — the seven chords print as DM Mono hints beside their drawer rows and Contents rows (no new surface) | — |
| F15 | high | §6 M4 — the ticket's seam is the map at 390; the spine sheet keeps sections and margin only | — |
| F16 | high | §6 M2 — a fifth money rung, `Owed you · $17,500 · Invoice 2026-114 · 22 days`, and the ticket's `Money` row (known-open I141) | — |
| F17 | high | §5 — `Scans` / `Rooms` / `Drawings`, one noun each | — |
| F18 | high | §3.3 — seven sentences, seven acts, zero `Review` | — |
| F29 | high | §4 exception 2 — `People` is a ticket row, 2 acts from the Desk | the Desk-side roster door is **refused** (C1) |
| F30 | high | §2.2, §6 M2 — `Boards · No boards yet · start one` carries the act on the row | — |
| F32 | high | §9 flag-on — the ticket moves every cell on the Delivery table and on install | — |
| F33 | high | SP-07 | — |
| F50 | high | SP-16 | — |
| F51 | high | §2.1 — `Open the Drafting Room` joins the Desk `BEGIN` column | — |
| F52 | high | §6 M2 — the letterhead leader is conditional on a client existing | — |
| F53 | high | §6 M2 — **deferred**: the reply-on-the-record surface is the named product debt (I140-errata's sibling); the ticket does not invent one | deferred, reason named |
| F54 | high | §9 flag-on — `Rooms` is a ticket row on every table | — |
| F55 | high | §6 — a `Skip to the paper` bypass link as the layout's first focusable node | — |
| F56 | high | **out of scope** — a token-level change across ~374 uses needs its own accessibility pass; the ticket adds no new terracotta text | out of scope, reason named |
| F57 | high | SP-19 | — |
| F58 | high | **deferred** — §7 Refuses: one editable home; reconciling `RECEIVED`/`DELIVERED` is a state decision, not a naming one | deferred, reason named |
| F59 | high | SP-03 | — |
| F60 | high | §6 M2/M3/M4 — the lens moves to the ticket's room chips and works at every width | — |
| F61 | high | §6 M2 — the index row reads `Money · $141,600 ordered`, the tier that is live | — |

**Mediums and lows addressed:** F08 (the ticket's `Money` row leads; the head's three acts demote),
F12, F13 (the roster prints place, so two `Aspen` rows differ before the click), F23, F24, F26
(SP-05), F34, F35 (SP-02), F36 (SP-12), F37 (⌘K opens on `This surface` with a document in hand),
F38, F39, F40, F41 (SP-20), F42, F43 (SP-18), F44 (SP-17), F45, F46 (SP-13), F47 (SP-15), F62, F63
(§5's three nouns settle the three verbs), F64, F65, F71, F72, F74 (the ticket is the phone's ledger
door for money and dates), F75 (SP-06), F76 (SP-04), F77, F78 (the `MARGIN ←` tab gains its count
from the same derivation), F82, F83 (SP-11), F84, F87, F88 (`The record · nothing settled yet`),
F90, F91 (SP-08), F92 (SP-09), F93 (SP-10), F95, F96 (money unfolds when the receivable is live —
I141-errata's own rule), F100 (SP-14).

**Not addressed, named:** F11, F21 (focus-restore defects — real, and Lane A's ground), F25, F66,
F67, F70, F73, F79, F80, F81, F85, F86, F94, F97, F98, F99, F101.
