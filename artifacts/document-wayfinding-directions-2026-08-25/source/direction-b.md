# Direction B — The Shop Ticket

*Wayfinding Review · 2026-08-25 · Lane B · `main@695addb5f` · **v2**, revised against both
critiques (log, §11)*

---

## 0. Name + summary

**The Shop Ticket.**

In a workshop the ticket travels with the job: one card, clipped to the work, saying what is on this
job and where each part of it sits — and it reads the same at the bench, in the finishing room and
on the truck. Patina's document has no such card. Its map is made of chrome: the running index, the
rooms block and the shelves live in the spine, which mounts them `≥1440px only` (C8/I136) and only
when `engagement_kind === 'project' && active_section === 'project'` (F14, `doc-spine.tsx:135`).
Whether Leah can see what is on the Vandersteen job depends on how wide her browser is and which
section she is standing on. Direction B clips the map to the paper instead: one band under the
letterhead, eight rows, the same eight on project and on care, at 1440 and at 390. The spine goes
back to what D12 says it is. And because every job carries the same ticket, the Desk can stack them:
six jobs grouped by stage, which answers "show me everything that's in install" (T2, 1.50 — the
review's worst task) at zero acts.

---

## 1. Thesis

**Orientation belongs to the job, not to the screen: if the eight things a designer reaches for
(rooms · pieces · drawings · spec · boards · money · dates · people) are printed on the paper
itself rather than in width-gated chrome, then every item-reach cell is one act at 1440, 1280 and
390 and on all seven sections — and the same eight rows, stacked across jobs, answer the
phase-wide question without a new tier.**

Eight rows over the instrument's seven reach classes: `documents (plans/spec book)` splits into
`Drawings` and `Spec`, because they have different doors and F48 proves one missing.

Falsified by: (a) any of the eight classes costing more than one act from an open document at any
tier; (b) install and care still losing reach the project spread has (F14, F48); (c) a designer
asked "what's in install" still having to type, filter or remember.

**Structurally, not by degree:** A moves existing doors to the bodies they already act on and adds
no organ. B *deletes* two spine organs (`spine-rooms-block.tsx`, `spine-shelves-block.tsx`), *adds*
one that has never existed, and moves two width rules held since I136. B removes furniture A leaves
standing.

---

## 2. The IA / map

Act counts are from the anatomy's reachability inventory (§7) for today, and from this direction
for tomorrow. **⌘K-only** means pure recall. `[Δ]` marks a change, with the finding that forces it.

### 2.1 `/desk` — the studio's one cross-job surface

```
/desk
├─ Header — greeting · TUESDAY · AUGUST 25
│   ├─ ＋ Capture a lead · begin a Brief ................. 1  [Δ F24: sub-label now on the Desk]
│   ├─ ＋ Open a project · no proposal needed ............ 1  [Δ F24]
│   └─ Find anything ⌘K ................................. 1
├─ EVERY JOB · 6 live · 2 overdue ....................... 0  [Δ F04/F23/F39/F65]
│   ├─ a stage heading (BRIEF…CARE, empties omitted) ... 0  ← T2, by a heading not a filter
│   ├─ a job line → open the job ....................... 1
│   └─ its own act (Nudge · File the claim · …) ........ 1
├─ THE STUDIO (Contents — labels + doorways only, R95/C15 unchanged)
│   ├─ ROOMS: Library · People · Scans ................. 1  [Δ F17]
│   ├─ LEDGERS: Orders · Accounts · Hours · The Post ... 1
│   └─ BEGIN: + Open the Drafting Room ................. 1  [Δ F51: no longer ⌘K-only]
├─ Studio Drawer (≥1180) ............................... 1–2 [Δ F17]
├─ g-chords g l/p/r/o/a/h/t ............................ 1 (2 keys) — now printed, §5
└─ ⌘K .................................................. 1 to open, 2 to any row
    └─ RETIRED: the `Recent boards` strip [Δ F62]
```

One roster of every live job, grouped by stage, replaces the folio grid (F23), `STUDIO PULSE`
(F39) and `RECENT BOARDS` (F62). Needs are a red-letter mark on the job's line, not a separate
list; nothing folds on first paint.

### 2.2 `/doc/[id]` — the document, at every width

```
/doc/[id]
├─ SPINE (≥1440: 200px · 1180–1439: 56px · <1180: sheet)
│   ├─ ← Put down 1 (Esc, 1 key) · seven marks 1 · timer · presence
│   ├─ On this paper — running index, ≥1440 .......... 1 per region [Δ labels only; C11 intact]
│   ├─ ✗ Rooms block ................................. MOVED to the ticket [Δ F01/F14/F60 — amendment B1]
│   └─ ✗ Shelves block ............................... MOVED to the ticket [Δ F01/F14/F48 — amendment B1]
├─ LETTERHEAD — title · household chip · vitals · folio
├─ ★ THE TICKET — one band, eight rows, every width, every section [Δ NEW; F01 F02 F14 F16 F17 F30 F48 F60 F62 F72 F82]
│   ├─ Rooms ... expands in place; a chip LIFTS at every width [Δ B2/F60] ... 1
│   ├─ Pieces .. unfolds the Pieces region, room-grouped .................... 1
│   ├─ Drawings ≥1440 leaf · below routes /doc/{id}/plans ................... 1
│   ├─ Spec .... leaf or /doc/{id}/spec-book — on EVERY section [Δ F48] ..... 1
│   ├─ Boards .. the one boards door; carries `Start a board` [Δ F30/F62] ... 1
│   ├─ Money ... unfolds Money; names what is owed [Δ F16/I141] ............. 1
│   ├─ Dates ... unfolds Schedule; the install date in words ................ 1
│   └─ People .. opens the Call sheet [Δ F29; flag-absent state named] ...... 1
├─ GUIDE / RED-LETTER ZONE — one sentence, one act (§3) [Δ F07/F18/F77]
├─ REGIONS — Client approvals · Schedule · Pieces · Money (mount order unchanged, C11)
├─ THE RECORD `The record · {n} settled` [Δ F90] · kickoff · colophon
├─ MARGIN — rail ≥1440 · sheet 1180–1439 · chips <1180 (unchanged)
└─ ⌘K — opener now printed in the phone's `More` menu [Δ F49]
```

Every change carries its finding in §10. **What does not move:** the Esc LIFO, `← Put down`, the send-wall line, `Add a room` in flow (C12),
the index's derivation (C11), fold persistence, one piece on one line, zero shadows (C2), honest
empties, the drawer's discipline.

---

## 3. The per-stage "what's next" organ

### 3.1 What replaces what

`deriveDocumentGuide`'s precedence (`document-guide.ts:316–397`) is **kept for rungs 1–5** and
**replaced at rung 6** — `stageCopy[stage]`, a static table whose labels are five shrugs out of
seven (F18). In its place, **`deriveTicketLeader(ticket, stage)`** computes the sentence and the act
from the same eight ticket rows on screen, so the guide can never name what the map does not show.

Rungs 1–5 stand — `unavailable` (`:327`, eyebrow by SP-08), `paused` (`:340`), `gate` (`:362`),
`need` (`:374`, reason line by SP-06), `proposal` (`:383`, fallthrough act by SP-12). Rung 6
(`:388–397`) is replaced.

**Guide vs red-letter (F07, `page.tsx:1111–1118`).** They stay mutually exclusive; what changes is
that **the zone's first row registers the mobile primary** (`red-letter-zone.tsx`, mirroring
`document-guide.tsx:52–64`). Today only the guide does, so at 390 the urgent zone has no act and the
bar shows a truncated `MESSAGE THE CLI…`. One primary, always the urgent one.

### 3.2 The tie-break, stated once

When two ticket rows are both unclear, the guide prints the first that survives this order:

1. **Money at risk today** — a carrier window, a price expiry, a deposit gating a release.
2. **A dated promise to the client** — an approval or signature past its date.
3. **A piece that cannot move** — an unanswered PO, a missing COM, a damaged line.
4. **Work that can wait** — everything else, in ticket order.

Ties inside a rank go to the older date; with no row unclear, the guide prints the stage's rest
state, never a shrug.

### 3.3 The seven sentences and acts (Vandersteen specimen where it applies)

Placement: the guide block, except where a dated need exists — then the red-letter zone, where
`project` and `install` land on the specimen.

| Section | Sentence (headline) | Act label | Tie-break when two compete |
|---|---|---|---|
| `brief` | `A new inquiry, five days old.` | `ACCEPT · BEGIN A BRIEF` | A response-by date outranks age; a budget band rides the sentence (SP-17) |
| `discovery` | `Five things still missing before you can price it.` | `ADD SCOPE & ROOMS` (focuses the checklist row of the same name, SP-18/F43) | First unmet input in checklist order; client-owned outranks studio-owned |
| `direction` | `The direction isn't written yet.` | `OPEN THE DRAFTING ROOM` (the Direction · v1 block drops its duplicate `CONTINUE DRAFTING`, F64) | If boards exist but the offer doesn't, the offer wins |
| `proposal` | `Sent to Erin Byrne six days ago. Never opened.` | `NUDGE ERIN BYRNE`, on the send-wall's live act (SP-12, F36) | Rung 5 owns it; countersign outranks nudge; nudge withheld on `issued_on_paper` (C13 errata) |
| `project` | `Sturdy Oak hasn't answered PO-2026-0418 in fourteen days. The lead time already runs past install.` | `CHASE THE PO` | Rank 2 over rank 3 — on Tue Aug 25 the zone carries §8's two dated approvals, older first, and the PO rides the `Pieces` row |
| `install` | `The carrier window on the brass-and-oak console closes tomorrow.` | `FILE THE CLAIM` | Rank 1; then a missing piece for install day; then punch list |
| `care` | `Two punch-list items and the final walkthrough are left.` | `WORK THE PUNCH LIST` (Care grows a branch it lacks today, F77) | Checklist clear but money isn't → `An invoice has been out 22 days.` / `SEND A REMINDER` |

**Rest states**, so no stage shrugs: `brief` `Nothing to decide yet.`; `discovery` `Discovery is
complete. Shape the direction.` / `BEGIN THE DIRECTION`; `direction` `The direction is written. Send
it.` / `SEND THE AGREEMENT`; `proposal` `Signed. Open the project.` / `OPEN THE PROJECT`; `project`
`Everything ordered is moving.` / `RELEASE THE NEXT ROOM`; `install` `Install day is Tuesday,
September 15.` / `HOLD THE WINDOW`; `care` `Everything is settled.` / `CLOSE THE BOOK` (the care
band's own copy, gated by `closureReady`). Every one a verb and an object; `Review` appears nowhere.

---

## 4. The item-reach table

Reach = acts to the item's surface **from an open document**. Today's readings are re-derived from
anatomy §7's act-count column and distinguish **unreachable** (no path) from **2, ⌘K-only** (a path,
by recall). ⌘K mounts unconditionally in the `(document)` layout (`layout.tsx:75`) with no width
gate (anatomy §5), so recall doors still work at 1280; F49's "no visible opener" is scoped to 390.

| Class | ≥1440 today → B | 1280 today → B | 390 today → B |
|---|---|---|---|
| **Rooms (and the lens)** | 1 (spine block) → **1**, Ticket › Rooms expands, a chip lifts | **unreachable** — no chip, filter or search-by-room; a resize below 1440 auto-releases the hold (F01, F60) → **1** | rooms list, no lens (F15) → **1**, chip lifts |
| **Products — an FF&E line** | 2 → **2** (Pieces → room-grouped line) | 2, no lens over 36 lines (F60) → **2** with the lens | 2, heading covered by the `ADD TO PROJECT` plate (F28) → **2**, plate demoted |
| — *its spec attributes* | route only, no link from the line (F57) → **3** ⚠ | **3** ⚠ | **3** ⚠ |
| **Boards** | 1 on `project` only, plus two rival doors (F62) → **1**, the only door | **2, ⌘K-only** via `Recent boards` (`command-bar.tsx:507`), and only if recently opened → **1** | same, no visible opener (F49) → **1** |
| **Documents — plans** | 1; typed `plan` returns `No match` (F50) → **1** | **2, ⌘K-only** (`command-bar.tsx:562–572`), same typed failure → **1** | 2, ⌘K-only, no opener → **1** |
| **Documents — spec book** | 1 on `project`; **no door on install/care**, no registry row, so ⌘K finds it in neither branch (F48) → **1 on all seven sections** | **unreachable** — the section-gated FF&E link is the only door → **1** | **unreachable** → **1** |
| **Money** | 1, but 3–4 rival doors (F08), no receivable anywhere (F16) → **1**, the row names what is owed | 1 → **1** | 1 → **1** |
| **Schedule** | 1; two regions share the name (F35, SP-02) → **1** (Dates) | 1 → **1** | 1 → **1** |
| **People — the roster** | 1 via the letterhead `Call sheet · {n}` instrument (flag `call-sheet`, `letterhead-instruments.tsx:449–462`); **unreachable from the Desk** (F29) → **1** | 1 flag-on, **2 ⌘K-only** flag-off → **1** | 1 → **1** |

**Declared exceptions (every cell over 2):**

1. **Spec attributes of one FF&E line = 3 acts at every tier** (`Ticket › Pieces` → line unfold →
   `Edit spec details →`, SP-19). Two editable homes for one attribute is how `RECEIVED` and
   `DELIVERED` came to disagree about the same walnut sectional (F58). One editable home with one
   visible route is what a future data-model ruling should buy — **this direction does not close
   F58**; it declines to add the second home that would deepen it.
2. **Every class from `/desk` = 2 acts** (open the job, then the ticket row) — C1/D1, "no split
   view, no peek/hold." B builds no Desk-side artifact browser; what it buys is that act two is the
   *same* act on every job, width and section. F82 is answered by making act two constant, not by
   removing it.

**Install and care, explicitly (F14, F48).** On `w1440-doc-install` and `w1440-doc-care` the spine
prints `← PUT DOWN`, seven marks, the active label and the timer, and nothing else, because
`DocSpineShelvedBlocks` mounts only when `engagement_kind === 'project' && active_section ===
'project'`. On the two spreads where she is standing in a house, rooms, boards, plans, spec book and
roster are **unreachable at every width**. Under Direction B the ticket is mounted by the document,
not the section: **install and care read identically to project — all eight rows, one act, at 1440,
1280 and 390** — which moves **T6 (2.58), T13 (2.78) and T14 (2.78)** off the floor. T5 (2.50, the
mood board) is moved on the `direction` spread, which is wave two, not the first slice (§8).

---

## 5. Lexicon stance

Playfair headline, Inter body, DM Mono label; plain-spoken Midwest; studio word paired with trade
word where a term is real but opaque; never engine/AI framing.

| Old label | New label | Why (brand voice + finding) |
|---|---|---|
| `Design authority` (region, seam, index row) | **`Money`** · sub `what's authorized, what's owed` | F09/F61: `money` prints today only in a small eyebrow while the name reads as a permissions setting — P2 and P3 both first-glanced it that way. One label in `document-index.ts:34–55`; C11's derivation untouched. |
| `Project · FF&E` (region head, index row) | **`Pieces`** · sub `the FF&E schedule, by room` | F17/C20: the ticket must not invent a fourth noun for a class the region already names, and `FF&E` is on P3's own can't-define list. Studio word outside, trade word in the sub-line — the `Drawings`/`plan room` pattern. **Head and ticket row carry one word.** Second label in `document-index.ts:34–55`. |
| `Knowledge` (shelf) | **retired** | F12: the row reads `Knowledge   STUDIO LIBRARY →`, the leaf calls itself `STUDIO LIBRARY · CROSS-PROJECT`, holds nothing, duplicates a drawer door. Deleting it **closes a known-open item**. |
| `The Rooms` (drawer, `g r`) | **`Scans`** · sub `rooms you've measured` | F17: `Scans` says what `/rooms` holds — `Kitchen · scanned Aug 24`. P4 opened `The Rooms` looking for a sofa and backed out. |
| `Plan room` (shelf) | **`Drawings`** (ticket row) · leaf eyebrow keeps **`The plan room · the current set`** | F17/F50: `Drawings` is what P3 decodes on sight; `plan room` is a real trade word, kept where a trade reader meets it. |
| `The Record` / `Previous work · {n} complete` | **`The record · {n} settled`** | F90: canon names it `The Record` (C10, `DECISIONS.md:8608`) and the string never prints. `settled` is the paper's own state word (`section-derivation.ts:15`). |
| `In this document` (index heading) | **`On this paper`** | The product's own metaphor (D12); stops colliding with the ticket's `The job`. |
| the seven section names vs the Patina Six (F42) | **kept apart by register, never renamed** | Two vocabularies, two jobs: the seven name **sections of the paper**, the Six name **phases of the work**. They never print in one glance — sections live in the spine; the ticket's stage cell prints the **phase** (`Procurement & Orders · 4 of 6`), never the section word. No `active_section` change, so **no dependency on I114**. |
| `Studio books` (drawer group) | **`The ledgers`** | Matches the Contents head that already reads `LEDGERS` (`desk-contents.tsx:204`) and frees `book` for the job's own two (C20). `The Post` is kept; SP-11 adds `Mail & messages`. `Closing the book` is kept, glossed `· the last six things` (a count `care-band.tsx:293–315` already computes). The spine's rooms block keeps its noun as the ticket's `Rooms` row. |

Shared planks apply as drawn in both decks: `Add to project` → `Add a line` (SP-09), `Team…` → `Add
to the team` (SP-10), and ⌘K's `ask the Engine` framing dropped for plain search language (SP-07 —
a hard brand rule).

**Candidate section↔stage mapping — `candidate for I114`, and nothing here depends on it.** `brief`
→ Consultation · `discovery` → Schematic Design · `direction` → Design Development · `proposal` →
*no phase; the agreement sits between Design Development and Procurement* · `project` → Procurement
& Orders · `install` → Installation & Styling · `care` → Completion. That asymmetry is why the
mapping is hard, and why the first slice reads `active_section` for **placement only** and prints
the phase from the schedule's own data. If Kody rules otherwise, nothing in the ticket changes.

---

## 6. Five mock screens — drawing instructions

**Rules for the builder.** Every number, name and date is the §8 specimen; where §8 gives no figure,
print the product's own honest empty (`Nothing filed`, `No boards yet`, `Nobody on it yet`), never
an invented one. Today is Tuesday 2026-08-25; the timer reads `0:47`; The Post carries a dot, never
a count. Zero shadows (C2); every act is bare DM Mono scored ink (C6). `SP-xx` marks a shared
plank, drawn identically in both decks.

### M1 · `/desk` at ≥1440

Single column, `max-w-[1040px]`:

1. **Header.** Playfair `Good morning, Leah` · DM Mono `TUESDAY · AUGUST 25`. Right: three scored
   acts, each with its sub-label on the Desk for the first time (F24) — `＋ CAPTURE A LEAD` / `BEGIN
   A BRIEF`, `＋ OPEN A PROJECT` / `NO PROPOSAL NEEDED`, `FIND ANYTHING ⌘K`.
2. **`EVERY JOB · 6 LIVE · 2 OVERDUE`** (DM Mono eyebrow over a rule), then one Inter line: `Two
   things are overdue — Vandersteen and Byrne.` Nothing folded.
3. **The roster**, grouped by stage in the paper's order; empty stages unprinted. Each group is a DM
   Mono heading with a count; each job one line — Playfair name · Inter place-and-state · one scored
   act at the right. Overdue lines carry a red-letter mark at the left margin (no badge — C4); setup
   chores wear a different stamp colour from dated overdue items (SP-20). Where a job's overdue need
   is an unpaid invoice the state text carries its figure and age — the value
   `folder-card.tsx:317–336` already reads for its receivables act.

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
                                 install Tuesday, September 15 · $17,500 out 22 days ·
                                 OVERDUE 6 DAYS — primary bedroom approval
                                                                    OPEN THE JOB
   INSTALL · 1
     Okonkwo kitchen             Middleton WI · installed August 14 · punch list open
                                                                    WORK THE PUNCH LIST
   CARE · 1
     The sixth job               quiet · nothing needs your hand
   ```

   **Density rule, for P2's eleven jobs.** One line per job (wrapping to two or three), never a
   card; headings never fold; within a group, red-letter first, then oldest. Eleven jobs is eleven
   lines under five or six headings — one screen at 1440, one scroll at 1280. The deck draws the
   specimen's six; the rest obey this rule.

4. **`THE STUDIO`** — the Contents Page, unchanged in kind (R95/C15), with three edits: `The Rooms`
   → `Scans`, `Studio books` → `The ledgers`, `Open the Drafting Room` added to `BEGIN` (F51).
5. **Studio Drawer** strip along the foot, unchanged but for those two renames. Gone: the four-up
   folio grid and `REVEAL 4 MORE FOLIOS ↓` (F23), `STUDIO PULSE` (F39, its two live facts absorbed
   into the roster header), `RECENT BOARDS` (F62).

### M2 · `/doc/[id]` project section at ≥1440 — the Vandersteen residence

Three columns: 200px spine · `max-w-[1040px]` paper · 232px margin.

**Spine** — `← Put down`; seven marks in one row, `Project` lifted; `Project / ACTIVE`;
**`ON THIS PAPER`** with four rows (`Client approvals · 2 awaiting` / `Schedule · install September
2026` — SP-02 renames the fold-seam Rule `Schedule dates` / **`Pieces · 36 lines · 4 rooms`** /
**`Money · $141,600 ordered`**); `● IN HAND / 0:47`, `PAUSE`, `+ LOG`; `Just you · visible to the
studio`. **No Rooms block. No shelves block.**

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
   across Pieces, the spec leaf and the boards leaf, keeping its state word with `In hand` added and
   hiding nothing (I136's never-filters clause kept exactly; only the ≥1440 release is amended, B2).
   With `call-sheet` off, `People` reads `the call sheet isn't turned on for this studio` — absence
   and emptiness never look alike. **The `Pieces` row is a summary and exception index, never a
   replacement for the region:** it leads with what is wrong, so P4 sees the damaged console before
   she scrolls, while reconciliation still runs line by line below (F57). §7 prices that.
3. **Red-letter zone** — `NEEDS ATTENTION · IN ONE PLACE`, then exactly §8's two, older first, no
   badge: `▌ OVERDUE 6 DAYS   The Vandersteens still haven't approved the Hartland wool rug and the
   walnut nightstands for the primary bedroom. Sent August 13.` / `SEND A REMINDER`; then `▌ OVERDUE
   3 DAYS   The reading chair still has no fabric. The workroom needed COM by August 22 to hold
   install.` / `CHOOSE THE FABRIC`.
4. **Letterhead instruments** — `MESSAGE THE VANDERSTEENS` (leader, conditional on a client — F52)
   · `PREVIEW AS THE VANDERSTEENS` · `SHARING · MILESTONES` · `CALL SHEET · 0`.
5. **Regions**, mount order unchanged (C11): `Client approvals` (2 awaiting) · `Schedule` ·
   **`Pieces`** — head `4 groups · 36 lines · 2 awaiting authorization`, sub `the FF&E schedule, by
   room`, ledger `RELEASE FOR AUTHORIZATION` (leader) · `ADD A LINE` (SP-09) · `BILL 3 UNINVOICED` ·
   `SPEC BOOK →`; rooms are headings with `ADD A ROOM` in flow at the foot (C12). The damaged line
   unfolds to `Brass-and-oak console · Fond du Lac Ironworks · delivered August 19 · top panel
   gouged · claim drafted, not filed · carrier window closes tomorrow`, acts `FILE THE CLAIM` and
   `EDIT SPEC DETAILS →` (SP-19).
6. **`Money`** — renamed head; `Authorized` (SP-03) · `Plan` · `Committed` · `Moved · $14,420 in
   motion — ordered through installed (committed, not yet paid out)` (SP-04), migration sentence
   deleted (SP-05), and **a fifth rung `Owed you · $17,500 · Invoice 2026-114 · 22 days`** (F16 /
   I141), act `SEND A REMINDER`.
7. **`The record · 3 settled`** (F90) · kickoff · colophon (SP-10). **Margin rail** (232px) — `IN
   THE MARGIN`, `+ DECISION`, `+ NOTE`, the specimen's live items.

### M3 · `/doc/[id]` at 1280 — the same job

Two columns: 56px spine · paper; the margin is its `MARGIN ←` tab. **The paper is identical to M2,
ticket included** — same nine lines, values wrapping where they must. The spine is the compact rail:
bare `←`, seven marks, `● In hand / 0:47`. The word `Project` appears once, in the ticket's eyebrow
`THE JOB · PROJECT` (F02, the substance). `Drawings`, `Spec` and `Boards` route to
`/doc/{id}/plans`, `/doc/{id}/spec-book` and the board, each returning `← Vandersteen residence`
(SP-14); with no 320px leaf there is no force-close on resize either. **Everything that vanishes at
1280 today (F01) is on this screen**, the room lens included — its put-down affordance at this width
is the ticket's room chip (B2).

### M4 · `/doc/[id]` at 390 — the same job in her hand

One column, `px-7`. Order: letterhead → **ticket, folded to its seam** → red-letter zone →
instruments → regions → record → colophon → mobile bar.

- **The ticket at rest is one scored seam with a fixed wrap rule** — the one line that must always
  be legible at 390, so it is specified, not left to reflow:
  ```
  THE JOB · PROJECT · Procurement & Orders 4 of 6
  1 damaged · $17,500 owed you                                            UNFOLD ↓
  ```
  Line 1 is identity — section, phase, fraction — never elided. Line 2 is the worst two exceptions
  in tie-break order (§3.2), then the glyph. Two lines, two exceptions maximum; a third is dropped
  whole, never abbreviated, and the unfold shows it. Nothing truncates mid-word. With no exception,
  line 2 reads `Nothing overdue`.
- Unfolded, the seam becomes M2's nine lines stacked. The mobile spine sheet keeps sections and the
  margin and stops pretending to be a map (F15).
- **Pieces head fix (F28):** `Pieces` on its own line, ledger acts wrapped *below* it, so nothing
  covers the heading; `ADD A LINE` (SP-09) is scored ink at 44px, not a filled plate.
- **Mobile bar — three elements, not four.** Left `IN THIS DOCUMENT / Project`; centre **the
  red-letter zone's first act** — `SEND A REMINDER`, because the zone now registers the mobile
  primary (F07); right `···  MORE`. The menu's **first row is `Find anything` · `⌘K` · 44px** — the
  first reachable way to open the command bar on a phone (F49). It sits in the menu, not on the
  bar, because the bar already carries a context control, an act that can run to `OPEN THE DRAFTING
  ROOM`, and `More`; a fourth 44×44 target is what makes the act truncate. The seam two inches above
  is B's phone-side map. The menu then prints `The Post NEW` (SP-15) under `Mail & messages`
  (SP-11), then `The ledgers`, `Time in hand`, `Leave a note`.
- Region status no longer truncates mid-word: `Client approvals — 2 awaiting · the Vandersteens`
  wraps (F87).

### M5 · `/doc/[id]` **install** section at ≥1440 — the Okonkwo kitchen

*Why this one:* it is the screen where today's map does not exist at all — `DocSpineShelvedBlocks`
never mounts on an install document, and the spec book has no ⌘K registry row either (F14, F48). If
the ticket reads the same here as on M2 the thesis holds; if it needs a special case, it does not.
Draw M2's composition with the Okonkwo kitchen's own facts, **no invented figures**:

Spine: `← Put down`, seven marks with Install lifted, `ON THIS PAPER — Client approvals · Schedule ·
Install · Money`, `● IN HAND / 0:47`. Letterhead: `Okonkwo kitchen` · `for the Okonkwos ↗` ·
`Installation & Styling · Middleton WI`. Then:

```
THE JOB · INSTALL                      INSTALLATION & STYLING · 5 OF 6        FOLD ↑
Rooms      Kitchen                                                                →
Pieces     Everything delivered · punch list open                                 →
Drawings   Nothing filed                                                          →
Spec       Nothing specified yet                                                  →   ← the door F48 says does not exist
Boards     No boards yet · start one                                              →
Money      No balance due · verified from billing                                 →
Dates      Installed August 14 · punch list open                                  →
People     Nobody on it yet                                                       →

GUIDE      NEXT UP · FINISH IN THE FIELD                             (SP-08)
           Two punch-list items are still open.            WORK THE PUNCH LIST
```

Regions follow in mount order, the FF&E heading reading `Install` here and `Care` on a care document
(SP-01), then Money, Closing the book, The record, colophon.

Everything empty says so plainly; each of the eight rows is still one act. **The same drawing serves
the care spread** — swap the heading (SP-01) and the guide sentence (§3.3). The ticket does not
change, which is the point of mounting it on the document rather than the section. At 390 it is M4's
composition with these values — the screen she holds standing in the Okonkwos' kitchen.

---

## 7. Keeps · Refuses · Costs

**Keeps.** The Esc/put-down LIFO. `← Put down`. The send-wall state line as the model for every
state-plus-one-act line — the ticket's rows are drawn in its image. `Add a room` in flow (C12). The
index's derivation and scroll-spy (C11). Fold persistence. One piece and its PO state on one line.
Zero shadows (C2), scored ink (C6), one leader per region (C7), the Record at the foot (C10), honest
empties, the no-badge law (C4), 44×44. The lens that lifts and never filters. **And on the
Worktable: the Speccing rooms rail and the Delivery money seam both stand** (§9).

**Refuses.** A fleet or roster *tier* — the phase-wide question is answered by grouping the Desk's
own jobs. A Desk-side artifact browser — reaching a board still costs opening its job, because D1 is
right (C1). Split views, peeks, tabs. The shelves restored at 1280 *as shelves*. Badges. A second
editable home for spec attributes (F58). Any I114 dependency. The send–seal wall.

**Declared gaps.** (a) **P2's Monday question is half-answered** — the roster answers "who's in
install" (T2) at zero acts and prints a job's own receivable, but nothing prints a studio-wide total
or a "since Friday" delta; F16 closes *inside* a document, not across the fleet, and no cross-job
read exists to close it cheaply. (b) **P4 pays a glance** — the `Pieces` row is a layer above the
region, not a replacement, so her install-minus-ten reconciliation still runs line by line below.
The trade: her exceptions are visible before the first scroll, on install and care spreads where no
summary exists at all today (F14, F27).

**Costs — engineering surface.**

| What | Where (anatomy) |
|---|---|
| New organ + derivation | `job-ticket.tsx`, `lib/document/ticket-derivation.ts` (new); mounted in `doc/[id]/page.tsx` after the letterhead |
| Spine loses two blocks | `doc-spine.tsx:135`; delete `spine-rooms-block.tsx`, `spine-shelves-block.tsx`; `spine-shelved-blocks.tsx:103–150` values move to the ticket; `spine-running-index.tsx` untouched |
| Shelves become ticket rows | `shelves.ts:33–110` (`knowledge` deleted, ≥1440 gate removed); `shelf-panel.tsx:94` gains a below-1440 route mode it lacks; `page.tsx:553–562` force-close removed |
| **Room lens below 1440 (first ever)** | `room-lens-context.tsx` — auto-release removed; the ticket's room chip becomes the put-down affordance whose absence was the release's stated reason |
| **Receivable read (new, not a re-read)** | `$17,500 owed you` is computed by neither `spine-shelved-blocks.tsx:103–150` nor `money-region.tsx:245–336` — F16 exists *because* nothing reads it |
| Guide rung 6 replaced | `document-guide.ts:91–141`, `:388–397`; `red-letter-zone.tsx` + `document-guide.tsx:52–64` |
| Money/Pieces names · spec book ungated | `money-region.tsx:245–336`, `ffe-section.tsx` head + `:1009–1015`, `document-index.ts:34–55`, a spec-book row in `registry.tsx` |
| Renames · Desk roster · ⌘K · tests | `registry.tsx:106–119`, `studio-drawer.tsx:361`, `desk-contents.tsx:220–236`; `desk/page.tsx:328–380`, `folder-card.tsx` (`studio-pulse.tsx`, `recent-boards-strip.tsx` unmounted); `command-bar.tsx`, `mobile-bar.tsx`; `worktable.test.tsx` rebased onto "main + ticket", a fixture per section |

No migration, no data-model change. One new fail-closed flag, `job-ticket`.

**Amendment ledger — two, both clauses of one entry (C8 / I136). Counted as two.**

**B1 — the mount gate.** Quoted (`DECISIONS.md:8427`ff, C8): *"The spine grows three blocks —
≥1440px only."*
**Gains:** rooms, drawings, spec book, boards and roster stop being a ≥1440 and `active_section
=== 'project'` privilege — one act at every tier on all seven sections, closing F01, F14, F48, F72
and half of F82, moving T6, T13, T14.
**Gives up:** the shelved spine as an organ — both blocks deleted, ~180px of every document's
measure to the ticket. I136's "the paper holds the work, the shelves hold the artifacts" survives in
meaning, not furniture: artifacts are *listed* on the paper and still *open* beside it at ≥1440.
**Rollback:** `job-ticket` off restores `doc-spine.tsx:135` and both blocks byte-identically.

**B2 — the lens's width release.** Quoted (`DECISIONS.md:8461–8462`): *"The hold releases if the
window drops below 1440px, where nothing on screen could put it down."*
**Gains:** F60 — a held room lifts at 1280 and 390; the clause's own stated reason stops being true
the moment the ticket's room chip exists.
**Gives up:** the guarantee that a lift is only seen beside a full spine; a designer resizing
mid-hold keeps the hold instead of losing it, so the letterhead must name the room in hand at every
width (it does — the sentence I136 already requires).
**Rollback:** `job-ticket` off restores the auto-release. **I136's never-filters clause is
untouched.**

**Not amendments, stated so a verifier need not guess.** §9's flag-on landing **deletes nothing
ratified**: the Speccing `rooms-rail` (I139, `:8858–8859`) and the Delivery money seam (I141,
`:9075–9076`) both stand, the ticket's rows anchoring to them; the Intake spread's inert `opens
when…` rows (F71) are left to the Worktable's wave.

**One ruling request, not an amendment.** C14/I138 says *"the flag off is main's composition
exactly"* (`:8740–8742`) — narrowly that binds the `worktable` guard; broadly it freezes any feature
shipping ahead of Kody's owed flag-on walk. `job-ticket` is its own fail-closed flag and does not
change `worktable`'s off-state composition, so **B asserts the narrow reading and asks Kody to
confirm it**; read broadly, the ticket waits for the walk and the design is unchanged. Doctrine cost
is two named amendments — Lane B's price for the reach, stated plainly.

---

## 8. First slice

**Ship the ticket on project-kind documents — `project`, `install`, `care` — all eight rows, all
three widths, behind `job-ticket`. Nothing else.** Not the Desk roster, the guide rewrite or the
renames. Install and care come free with project: the change removes one mount condition, not three
implementations, which is why F14 closes on day one rather than in wave three. The proposal-chain
spreads are wave two, so **T5's mood board is not moved by this slice**.

Why it changes a Tuesday: on 2026-08-25 Leah opens the Vandersteen to learn whether the console
claim can still be filed and whether Sturdy Oak answered. Today "where is anything" is a 200px spine
she only has at 1440, and on the install document not at all. After this slice one band says
`1 damaged`, `$17,500 owed you, 22 days` and `$12,300 deposit not drawn` before she scrolls, and
each of the eight is one click — on the laptop in the car as much as the studio monitor.

**Metric it moves:** *unaided acts* (Leah-01) — item-reach goes from unreachable or ⌘K-only to one
act in eleven of §4's cells, including all eight on install and care. Secondary: *old-portal
flights*, which P1's tell says spike during install week.

**Estimate: 12 working days**, itemized:

| Line item | Days |
|---|---|
| `job-ticket.tsx` + `ticket-derivation.ts`, eight rows, honest empties, per-section fixtures | 4 |
| Below-1440 room lens — removing the auto-release, making the chip the put-down affordance | 3 |
| `shelf-panel.tsx` leaf→route mode below 1440 + removing the force-close (`page.tsx:553–562`) | 2 |
| The receivable read (new query wiring — see §7; F16's whole premise is that nothing reads it) | 2 |
| Flag, mount, `worktable.test.tsx` rebase | 1 |

**Files:** `job-ticket.tsx` + `ticket-derivation.ts` (new) · `doc/[id]/page.tsx` ·
`doc-spine.tsx:135` · `shelves.ts:33–110` · `shelf-panel.tsx:94` · `ffe-section.tsx:1009–1015` ·
`room-lens-context.tsx` · `registry.tsx`. **No I114 dependency**: placement reads `active_section`,
the phase cell reads the schedule.

---

## 9. Landing on both baselines

**Flag off — today's paper.** The ticket mounts between the letterhead and the guide/red-letter
zone. The spine keeps `← Put down`, the marks, `On this paper`, the timer and the presence line, and
loses the rooms and shelves blocks (B1). At ≥1440 a row still opens a 320px leaf beside the spine,
and the reading position no longer re-wraps under it because the ticket, not the region head, is
what the leaf sits beside (F45). Below 1440 the row routes to the leaf's page and returns `←
Vandersteen residence` (SP-14). Regions, mount order, leaders and the Record are untouched.

**Flag on — the Worktable (C14, the destination).** The ticket mounts **above `TableFrame`**: the
job's header over the job's middle, I138's own division. Nothing ratified is deleted. **Intake** —
the ticket's empty rows say what the spread's inert `opens when…` seams say (F71); the seams stand
for the Worktable's own wave to rule on. **Speccing** — the `Rooms` row **anchors to I139's rooms
rail** rather than replacing it, so the rail keeps being add-a-room's speccing home
(`DECISIONS.md:8895`) and F54 is answered by the row existing on every table; the `Boards` row
anchors to the on-paper strip, so Q1/C9 stands and the door that dies is the Desk strip (F62, F84).
**Finalize** — unchanged, except `The client's copy` becomes a ninth row on proposal documents
rather than a proposal-only shelf. **Delivery** — the release lift keeps the table head and **the
money seam stands** (I141); the `Money` row is the seam's index, not its replacement, and carries
the receivable the seam is scoped not to (F16). The install setting finally moves an item-reach
cell — exactly what F32 says the Worktable does not do today.

**Shared:** the ticket — same rows, values, doors and seam — in both flag states. **Differs:** what
sits beneath it.

---


---

## 10. Coverage

**Blockers.** F01 §2.2/M3, the map moves to the paper (B1) · F04 §2.1/M1, the stage-grouped roster
(wave two) · F14 §4/M5/§8, mounted by the document; project · install · care in slice one · F28 M4,
`Pieces` head on its own line · F48 §2.2/§4/M5, `Spec` on all seven sections plus a ⌘K registry row
· F49 M4, `Find anything ⌘K` as the `More` menu's first 44px row (on the bar: refused, reason in
M4).

**Highs.** F02 M3, the section word at 1280 (the bare `←` glyph deferred — 56px cannot hold it) ·
F05 M2, `Rooms` row and room-grouped Pieces, zero-room projects printing `No rooms yet · add one` ·
F07 §3.1, the zone registers the mobile primary · F09/F17/F61 §5, one noun each · F10 §5, chords
printed · F15 M4, the seam is the map at 390 · F16 M2, a fifth money rung and the `Money` row —
**fleet-wide `who owes me` not closed**, §7 gap (a) · F18 §3.3, seven sentences, zero `Review` ·
F29 §4 exception 2, a Desk-side roster door refused (C1) · F30/F62 M2, one boards door · F32/F54
§9 · F51/F52 §2.1 and M2 · F55 §6, a `Skip to the paper` bypass · F60 M2/M3/M4, the lens at every
width (B2) · F03/F33/F50/F57/F59 = SP-01/SP-07/SP-16/SP-19/SP-03.
**Deferred, reason named:** F53 (the reply-on-the-record surface is a named product debt,
I140-errata), F58 (§4 exception 1 — a data-model ruling, not a naming one). **Out of scope:** F56
(a ~374-use token change needs its own accessibility pass).

**Mediums and lows addressed:** F08, F12, F13, F23, F24, F26, F34–F47, F63–F65, F71 (named, left to
the Worktable's wave), F72, F74–F78, F82–F84, F87, F88, F90–F93, F95, F96, F100.
**Not addressed, named:** F11, F21 (focus-restore — Lane A's ground), F25, F66, F67, F70, F73,
F79–F81, F85, F86, F94, F97–F99, F101.

---

## 11. Revision log

*v1 at `source/direction-b-v1.md`. Nothing rejected: each finding accepted as written, or by a
different route, named.*

- **C-BP-01** lens amendment unnamed — **accepted**: **B2** quotes I136's lens-release sentence with
  trade and rollback; M2 and §7 now agree on which clause moves.
- **C-BP-02** `Pieces` unlexiconed — **accepted**: a §5 row, and the region head renamed to match, so
  one class carries one word (C20).
- **C-BP-03** care excluded — **accepted**: §8 ships project + install + care; §4, §10, M5 agree.
- **C-BP-04** P2's fleet question — **accepted**: the roster line prints a job's own receivable
  (`folder-card.tsx:317–336`); the studio-wide total and Friday delta are a §7 declared gap.
- **C-BP-05** conditional amendment — **accepted**: the I138 hedge becomes a ruling request.
- **C-BP-06** 390 seam wrap — **accepted**: M4 fixes two lines, two exceptions, no mid-word cuts.
- **C-BP-07** fourth bar element — **accepted**: ⌘K moves into `More`, with the reason.
- **C-BP-08** eleven jobs — **accepted**: M1 gains a density rule, inventing no jobs.
- **C-BP-09** F58 prose — **accepted**: §4 says plainly that F58 is not closed.
- **C-BF-01** I139/I141 deleted unnamed — **accepted by a different route**: the deletions are
  withdrawn, both stand, the ticket anchors to them; §7 states it.
- **C-BF-02** 1280 baseline overstated — **accepted**: §4 re-derived from anatomy §7.
- **C-BF-03** seven/eight/nine — **accepted**: eight rows throughout, thesis corrected.
- **C-BF-04** T13 vs T5 — **accepted**: the mount fix moves T6/T13/T14, T5 is wave two.
- **C-BF-05** receivable not a re-read — **accepted**: new query wiring in §7, two days in §8.
- **C-BF-06** 8 days optimistic — **accepted**: 12 days, itemized.
- **C-BF-07** B2 self-inflicted — **accepted**, same fix as C-BP-05.
- **C-BF-08** P4 worst-off — **accepted**: M2 states summary-not-replacement, §7 names the cost.
- **C-BF-09** distinctness — **no change needed**; §1 states the structural difference anyway.
