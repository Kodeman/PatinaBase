# 30 — Collated findings (semantic merge of nine panel seats)

Source: `20-panel-u1.md` … `28-panel-p4.md` — 203 raw findings from nine seats (U1–U5, P1–P4),
merged into **101 canonical findings**. Every raw id is preserved in `merged_from`; nothing was dropped.
Merged rows take the MAX severity and MAX confidence of their contributors and the union of their task ids.
Machine-readable: `30-collated-findings.json`. Verified against `main@695addb5f`.

---

## 1. Canonical findings

| id | title | seats | sev | conf | width | flag | tasks | already_ruled |
|---|---|---|---|---|---|---|---|---|
| F01 | Shelves, rooms block and running index are absent below 1440 | U1 U3 U5 P1 P2 P3 P4 (7) | blocker | 0.95 | 1280 | both | T4 T5 T6 | C8 (I136 — index/rooms/shelves ≥1440 only) |
| F02 | At 1280 the spine is an unlabelled 56px icon rail | U1 U2 U3 U4 U5 P1 P2 (7) | high | 0.95 | 1280 | both | T3 T4 T5 T6 T7 T10 T11 T15 | C8 (compact tier is an icon rail by width-regime design) |
| F03 | Care-stage FF&E spread is headed `Install` | U1 U2 U3 U4 P1 P3 P4 (7) | high | 0.95 | all | both | T3 T4 T6 T14 | C18 (R7 truth device) |
| F04 | Nothing answers a phase-wide question; ⌘K `install` returns No match | U1 U2 P1 P2 P3 P4 (6) | blocker | 0.95 | all | both | T2 T13 | known-open: T2 install-as-label / T4 no fleet view (canon digest §B) |
| F05 | FF&E lines print under `Unsorted`, never under a room heading | U2 P1 P2 P3 P4 (5) | high | 0.90 | all | both | T4 T8 | — |
| F06 | Orders ledger shows no PO acknowledgment state | U4 P1 P2 P3 P4 (5) | high | 0.70 | all | both | T13 | — |
| F07 | The mobile bar's one big act is a truncated `MESSAGE THE CLI…` | U1 U2 P1 P2 P4 (5) | high | 0.90 | 390 | both | T1 T3 T7 T9 T16 | C7 (I135's one-leader contract) |
| F08 | Three-to-four competing doors answer one money question | U2 U5 P1 P3 P4 (5) | medium | 0.85 | all | both | T9 | C7 (I135 one leader per region) |
| F09 | The money region is named `Design authority` and carries no money scent | U4 P1 P2 P3 (4) | high | 0.90 | all | both | T9 | — |
| F10 | The seven g-chords work but are printed nowhere on screen | U1 U5 P1 P3 (4) | high | 0.90 | all | both | T2 T4 T5 T6 T9 T11 T12 T13 T15 T16 | — |
| F11 | Ledger sheet focus-restore silently no-ops from the Studio books menu | U2 U5 P2 P4 (4) | medium | 0.95 | all | both | T9 T13 T14 | — |
| F12 | The `Knowledge` shelf is a redirect that names itself three ways | U1 U4 P1 P3 (4) | medium | 0.90 | 1440 | both | T1 T5 T6 | Knowledge naming (known-open, I136) |
| F13 | ⌘K Recent lists two rows both titled `Aspen` | U2 U3 P2 P3 (4) | medium | 0.80 | all | off | T1 T11 T12 | — |
| F14 | Index, rooms and shelves vanish on install and care documents | U1 U3 P1 (3) | blocker | 0.97 | all | both | T4 T5 T6 T13 T14 T15 | C8 (I136 ratifies the ≥1440 spine, not the section gate) |
| F15 | The mobile spine sheet lists sections and nothing else | P1 P2 P3 (3) | high | 0.95 | 390 | both | T5 T6 T15 | C8; D3 mobile spine sheet |
| F16 | `Who still owes me` is unanswerable inside the document | U1 P1 P2 (3) | high | 0.90 | all | both | T9 | adjacent known-open: money doesn't seam on install/care (I141) |
| F17 | Three different things are called a `room` | U1 U4 P4 (3) | high | 0.90 | all | both | T4 T5 T6 T8 | C20 (one name per surface, applied to nouns) |
| F18 | Five of seven stage default acts are `Review {X}`, a shrug | U2 U4 P1 (3) | high | 0.90 | all | both | T3 T7 T9 T10 T11 T13 T15 | — |
| F19 | A sent, unopened proposal is invisible on the Desk | U1 P1 P2 (3) | high | 0.70 | all | both | T2 T7 | C13 (I137 SP3 — the send-wall line's home is inside the document) |
| F20 | Nothing on the paper names a PO, receiving or a claim | P1 P3 P4 (3) | high | 0.85 | all | both | T13 T14 | — |
| F21 | ⌘K never restores focus to its trigger on close | U2 U5 P2 (3) | medium | 0.95 | all | both | T1 T2 T5 T6 T9 T11 T12 T13 T16 | — |
| F22 | Flag-off, an absent call sheet looks like an empty crew | U2 U5 P1 (3) | medium | 0.80 | all | off | T15 | — |
| F23 | `NEEDS YOUR HAND 8` prints over four folios | U1 P1 P2 (3) | medium | 0.95 | all | both | T1 T11 | — |
| F24 | The two Desk begin verbs carry no distinguishing sub-label | U2 P1 P2 (3) | medium | 0.85 | all | both | T12 | — |
| F25 | A held room has no visible release control once scrolled away | U2 U5 P2 (3) | medium | 0.50 | 1440 | both | T4 | C8 |
| F26 | The money explainer is a dense paragraph that names its own old UI | U3 U4 P2 (3) | medium | 0.90 | 1440 | off | T9 | — |
| F27 | The install spread shows no FF&E lines at all | P1 P4 (2) | blocker | 0.85 | all | both | T4 T13 T14 | — |
| F28 | At 390 the `ADD TO PROJECT` plate covers the FF&E heading | U3 P4 (2) | blocker | 0.90 | 390 | off | T4 T8 | — |
| F29 | The roster cannot be reached from the Desk at all | U1 P3 (2) | high | 0.95 | all | both | T15 | C15 (R95 — Contents = labels + doorways only) |
| F30 | The Mood boards shelf opens onto another fold, with no way to start one | U1 P1 (2) | high | 0.85 | 1440 | both | T5 | — |
| F31 | The downstream damage of a date move is prose, not a preview | U2 P1 (2) | high | 0.55 | all | both | T10 | — |
| F32 | The Worktable moves no item-reach cell and leaves install week untouched | U1 P1 (2) | high | 0.90 | all | on | T4 T5 T6 T13 T14 T15 | C14 (Q3/I138 — the Worktable is the destination) |
| F33 | ⌘K's placeholder and fallback both invite `ask the Engine` | U4 (1) | high | 0.95 | all | off | T1 T2 T6 T9 | — |
| F34 | The FF&E head leads with `ADD TO PROJECT` and shows three acts at once | U2 P1 (2) | medium | 0.85 | all | both | T4 T8 T9 | C7 (I135 one leader per region); I141 demotes the head when the release lift shows |
| F35 | Two regions on one paper are both called `Schedule` | U1 U2 (2) | high | 0.95 | all | both | T3 T10 | C11 (I137 — the index is derived from mount order) |
| F36 | The proposal guide says `Review signing controls` instead of the live act | U2 U4 (2) | medium | 0.85 | all | both | T3 T7 | C13 |
| F37 | ⌘K opens on Recent and Begin; the doorways are below the fold | U1 P2 (2) | medium | 0.85 | all | both | T6 T9 T13 T15 | — |
| F38 | Desk Contents names doors without saying what is behind them | U1 U4 (2) | medium | 0.85 | all | both | T9 T13 T14 | C15 (R95 forbids counts/tiles/metrics — a static sub-label is neither) |
| F39 | Studio pulse is folded by default and names nothing | U1 P2 (2) | medium | 0.85 | all | both | T1 T2 | — |
| F40 | A folded region and an empty one read the same | U3 P1 (2) | medium | 0.75 | all | both | T1 T3 T9 | — |
| F41 | Setup chores and dated overdue needs wear the same red-letter clothes | U3 P1 (2) | medium | 0.80 | all | both | T1 T3 | D8 forbids badges but does not govern hue reuse |
| F42 | Seven section names and `The Patina Six` both print on one paper | U4 P3 (2) | medium | 0.85 | 1440 | both | T1 T3 T10 | I114 (known-open, section↔stage mapping) |
| F43 | The guide's act names a different verb than the row beneath it | U2 P3 (2) | low | 0.75 | 1440 | off | T3 | — |
| F44 | Brief chips print raw template text (`15k_50k`, `3 6 Months`) | U2 P3 (2) | low | 0.85 | 1440 | off | T1 T3 | — |
| F45 | Opening a shelf re-wraps the paper she was reading | U1 P1 (2) | low | 0.85 | 1440 | both | T5 T6 T11 | C8 / C1 (I136 exempts reference material from D1's split-view ban) |
| F46 | The Orders sheet prints `PUT BACK · ESC` twice | U2 P1 (2) | low | 0.85 | 1440 | both | T13 | — |
| F47 | `The Post` shows `3 NEW` on mobile and an unlabelled dot on desktop | U1 P4 (2) | low | 0.90 | 390 | both | T16 | C4 (D8 — no badges, no pulsing counts) |
| F48 | Spec book has no door on install or care | U1 (1) | blocker | 0.92 | all | both | T4 T6 | — |
| F49 | No visible way to open ⌘K anywhere on a phone | U2 (1) | blocker | 0.85 | 390 | both | T2 T5 T6 | C8 |
| F50 | The plan room disappears from ⌘K the moment she types `plan` | U1 (1) | high | 0.93 | all | both | T6 | — |
| F51 | The Drafting Room's only Desk doorway is ⌘K | U5 (1) | high | 0.85 | all | off | T12 | — |
| F52 | `MESSAGE THE CLIENT` leads the letterhead on a doc with no client | U1 (1) | high | 0.93 | all | both | T16 | C18 (R7 — stamps only say true things) |
| F53 | Answering a client question happens off the document | P1 (1) | high | 0.80 | all | both | T16 | — |
| F54 | The rooms rail exists on direction and disappears on the project | P1 (1) | high | 0.85 | all | on | T4 T8 | C14 |
| F55 | No bypass-blocks control anywhere in the layout | U5 (1) | high | 0.60 | all | both | T1 T3 T9 T11 T12 T13 | — |
| F56 | Terracotta and clay ink fail 1.4.3 contrast everywhere they appear | U5 (1) | high | 0.90 | all | both | T3 T4 T7 T9 T10 T13 T14 T15 | — |
| F57 | The FF&E line she must edit is not editable on the paper | U1 (1) | high | 0.85 | all | both | T4 | C1/D14 (the Room-vs-Sheet weight is ruled; the round-trip cost is not) |
| F58 | The same FF&E line reads `RECEIVED` on paper and `DELIVERED` in the spec book | P4 (1) | high | 0.80 | 1440 | off | T6 T13 | — |
| F59 | `Committed` means $0 in one region and $14,420 in another | P4 (1) | high | 0.80 | 1440 | off | T9 | — |
| F60 | The room lens has no substitute below 1440 | U3 (1) | high | 0.80 | 1280 | off | T4 | C8 (room lens is part of the shelved-spine ≥1440 restriction) |
| F61 | The index says `NO AUTHORITY YET` over $14,420 in motion | U1 (1) | high | 0.90 | 1440 | both | T9 | — |
| F62 | Boards have three doors with three different names | P1 (1) | medium | 0.85 | all | both | T5 | C9 (I139/Q1 — boards on the paper for speccing only) |
| F63 | Three `add a room` verbs mean three different things | U1 (1) | medium | 0.80 | all | both | T4 T8 | C12 (I137 SP4 rules where the FF&E one lives) |
| F64 | Two acts open the same Drafting Room, worded differently | U2 (1) | medium | 0.85 | all | both | T3 | C7 |
| F65 | Nothing on the Desk says what changed while she was gone | P1 (1) | medium | 0.85 | all | both | T1 | — |
| F66 | The Drafting Room uses a different visual language from the paper | U3 (1) | medium | 0.60 | 1440 | off | T3 | C2/C6 govern the document surface; whether the Drafting Room is bound is not explicit |
| F67 | Orders is a global cross-project ledger, not a project-scoped view | U2 (1) | medium | 0.60 | 1440 | off | T13 T14 | C4 |
| F68 | `CLOSE THE BOOK` looks equally clickable while blockers are listed above | U2 (1) | medium | 0.50 | 1440 | both | T10 | — |
| F69 | `BEGIN THE DIRECTION` is offered live with 0 of 5 essentials captured | U2 (1) | medium | 0.60 | 1440 | off | T3 | — |
| F70 | Three equal Worktable add-actions get three different visual weights | U3 (1) | medium | 0.60 | 1440 | on | T8 | I135's one-leader rule governs region heads, not a same-row action trio |
| F71 | Intake's `opens when…` seams point at the wrong stages | U1 (1) | medium | 0.88 | all | on | T3 T6 | — |
| F72 | The Rooms block disappears at zero rooms with no placeholder | U3 (1) | medium | 0.55 | 1440 | off | T4 | — |
| F73 | One boxed control breaks the flat scored-ink grammar | U3 (1) | medium | 0.65 | 1440 | off | T9 | C6 (scored ink — no boxes/borders/fills for DocumentAction) |
| F74 | The drawer is hidden below 1180; Orders costs 2+ taps at 390 | U3 (1) | medium | 0.75 | 390 | off | T13 T14 | — |
| F75 | The guide's need-reason reads as a system log, not her voice | U4 (1) | medium | 0.90 | all | both | T3 | — |
| F76 | The money row `Moved` is not decodable from the word alone | U4 (1) | medium | 0.85 | 1440 | off | T9 | — |
| F77 | The Care-stage document shows no guide headline at all | U2 (1) | medium | 0.50 | 1440 | off | T3 T15 | — |
| F78 | The compact-tier margin is a closed, unlabelled `MARGIN ←` tab | U3 (1) | medium | 0.85 | 1280 | off | T7 T9 T16 | D8 forbids badges generally; a plain count on a closed trigger was not itself ruled |
| F79 | Unsent POs carry the same visual weight as routine status | P2 (1) | medium | 0.60 | all | both | T13 | — |
| F80 | The full spec-book workbench shows no order or PO status | P4 (1) | medium | 0.70 | 1440 | off | T6 | — |
| F81 | `No client linked` silently blocks the money and approvals chain | P4 (1) | medium | 0.60 | 1440 | off | T9 | — |
| F82 | Every project artifact is behind opening the document first | U1 (1) | medium | 0.90 | all | both | T5 T6 T15 | C1 (D1 forbids split views, not a Desk door that opens a document at an artifact) |
| F83 | `The Post` and `Message {Family}` name the same idea differently | U4 (1) | low | 0.60 | all | off | T16 | — |
| F84 | The Worktable's on-paper boards strip exists only at the Speccing table | P3 (1) | low | 0.80 | 1440 | on | T5 | C9 (Q1 boards-strip reversal is speccing-only by ratified rule) |
| F85 | The Capture Inbox introduces a new bordered card pattern | U3 (1) | low | 0.40 | 1440 | on | T8 | — |
| F86 | The Desk header cramps and wraps at 390 | U3 (1) | low | 0.75 | 390 | off | T1 | — |
| F87 | Region status text truncates mid-word at 390 | U3 (1) | low | 0.60 | 390 | off | T3 | — |
| F88 | The Record has no footprint before the first completion | U3 (1) | low | 0.50 | 1440 | off | T3 | — |
| F89 | An unexplained circular badge overlaps page content | U3 (1) | low | 0.30 | 1440 | off | T1 T3 | — |
| F90 | Canon's `The Record` never prints on screen | U4 (1) | low | 0.80 | all | both | T3 T11 | C10 |
| F91 | `Next up` appears only when guidance is broken | U4 (1) | low | 0.75 | all | off | T3 T11 | — |
| F92 | `Add to project` and `Open a project` share a word, not a meaning | U4 (1) | low | 0.55 | all | off | T8 T12 | — |
| F93 | The colophon's `Team…` is the one vague act among plain verbs | U4 (1) | low | 0.70 | 1440 | off | T15 | — |
| F94 | Canon's `Contents Page` prints on screen as `THE STUDIO` | U4 (1) | low | 0.70 | 1440 | off | T1 | R95/C15 |
| F95 | The spine's mark count changes between documents | U1 (1) | low | 0.65 | all | both | T3 T11 | — |
| F96 | The money region is folded by default | U2 (1) | low | 0.75 | all | both | T9 | — |
| F97 | The margin rail has no functional closed state at ≥1440 | U2 (1) | low | 0.85 | 1440 | off | T16 | — |
| F98 | The Receiving tab was never opened — project scoping unverified | U2 (1) | low | 0.40 | 1440 | off | T14 | — |
| F99 | Free-text description prints in the same register as studio copy | P3 (1) | low | 0.60 | 1440 | off | T3 | — |
| F100 | The two leaf routes name the project differently on the way back | P1 (1) | low | 0.90 | 1440 | both | T6 | — |
| F101 | Whether a ledger sheet preserves her place from a document is unverified | P4 (1) | low | 0.60 | 1440 | off | T13 T14 | — |

**Severity spread:** blocker 7 · high 31 · medium 39 · low 24.

---

## 2. Per-task obviousness — mean of the nine seats' own task tables

1 = could not find, 5 = without thinking. Split scores in a seat's table (e.g. `5 (≥1440) / 1 (1280)`)
were averaged before the cross-seat mean; P4 left T14's how-to-get-there unscored, so that cell is a mean of eight.

| Task | | mean what-to-do | mean how-to-get-there | combined |
|---|---|---|---|---|
| T1 | what does today need — across everything | 4.11 | 4.44 | **4.28** |
| T2 | everything in install | 1.89 | 1.11 | **1.50** |
| T3 | next move on this one | 3.94 | 4.33 | **4.14** |
| T4 | change the fabric on the living room sofa | 3.22 | 2.56 | **2.89** |
| T5 | pull up the mood board | 2.78 | 2.22 | **2.50** |
| T6 | where's the floor plan / spec book | 3.00 | 2.17 | **2.58** |
| T7 | did they open it — nudge them | 4.44 | 4.00 | **4.22** |
| T8 | add the mudroom | 4.22 | 4.11 | **4.17** |
| T9 | bill the deposit / who owes me | 3.11 | 2.83 | **2.97** |
| T10 | install slipped — what does it hit | 3.22 | 2.75 | **2.99** |
| T11 | put this down, pick up the Byrnes | 4.67 | 4.50 | **4.58** |
| T12 | new inquiry — start them | 3.56 | 4.22 | **3.89** |
| T13 | did Sturdy Oak confirm the PO | 3.00 | 2.56 | **2.78** |
| T14 | console came in damaged — file it | 2.89 | 2.67 | **2.78** |
| T15 | who's on this job | 3.44 | 3.17 | **3.31** |
| T16 | answer the client on the record | 3.67 | 3.67 | **3.67** |

### The five worst tasks

| rank | task | combined | what the nine seats agree on |
|---|---|---|---|
| 1 | **T2** — everything in install | 1.50 | No surface answers a phase-wide question at any width or flag state; ⌘K typed `install` returns `No match — Browse the Help Center` while the Desk behind it prints `ASPEN · INSTALL`. Six seats, blocker (F04). Every seat scored how-to-get-there 1 or 2. |
| 2 | **T5** — pull up the mood board | 2.50 | `Mood boards` exists only as a ≥1440 shelf row on a project-section document; the leaf then opens onto a second `UNFOLD ↓` with no `Start a board`. Below 1440 and on install/care there is no door at all (F01, F14, F15, F30, F62). |
| 3 | **T6** — floor plan / spec book | 2.58 | Same cliff plus two of its own: `Spec book →` renders only in `mode === 'project'` and has no ⌘K row anywhere (F48); `The plan room` vanishes from ⌘K the moment its own name is typed (F50). Lowest how-to-get-there mean after T2. |
| 4 | **T14** — file the damage claim | 2.78 | The Desk folio says it plainly (`AP-012 has an open damage claim / REVIEW THE CLAIM`), but from inside the document the words `claim`, `damage`, `receiving` and `inspect` appear nowhere (F20), and the install spread she is standing on has no FF&E lines to attach one to (F27). |
| 5 | **T13** — did Sturdy Oak confirm the PO | 2.78 | No ack state exists anywhere in the Orders sheet's rows, tabs or filters (F06); the sheet is a cross-project register she must leave the job to read (F67); and its focus-restore silently no-ops on the way in (F11). |

_T13 and T14 tie at 2.78; T14 is ranked ahead on the lower what-to-do mean (2.89 vs 3.00)._

The three healthiest tasks, for contrast: **T11** put down / pick up (4.58), **T1** what today needs (4.28), **T7** did they open it (4.22).

---

## 3. Merge log

One line per canonical finding that absorbed more than one raw finding (47 of 101). The other 54 rows are
single-seat and carry their original id unchanged in `merged_from`.

- **F01** ← U1-05, U3-05, U5-06, U5-07, P1-11, P2-05, P3-02, P4-14 — all eight name the same mechanism — `DocSpineShelvedBlocks` is `hidden min-[1440px]:block`, so index/rooms/shelves are removed rather than narrowed; U5 split it per shelf (plan room vs boards), the rest named the block.
- **F02** ← U1-07, U2-13, U3-03, U4-15, U5-10, P1-07, P2-06 — seven seats describe one artifact — the 1180-1439 rail's marks carry no printed text; U2/U5 filed it low as a recognition gap, U1 as 'no section name', U3/U4/P1/P2 as 'unlabelled icon rail'.
- **F03** ← U1-24, U2-08, U3-08, U4-07, P1-27, P3-07, P4-12 — seven seats quote the same two strings on Birch Hollow — heading `Install`, empty state `No FF&E lines are scheduled for installation.` — with the same root (`mode`, never `sectionKey`).
- **F04** ← U1-01, U2-10, P1-03, P2-01, P3-01, P4-11 — same screen, same query: U1/P2 framed it as 'no phase-wide surface exists', U2/P1/P3/P4 as '⌘K install returns No match'; both cite `w1440-cmdk-typed.png` and the same typed-branch code path.
- **F05** ← U2-14, P1-12, P2-04, P3-12, P4-06 — five seats quote the single group heading `Unsorted` against the index's `0 ROOMS` on Chen Residence.
- **F06** ← U4-21, P1-20, P2-09, P3-10, P4-08 — five seats read the same Ledger tab and report the absence of any acknowledged/confirmed word in rows, tabs or filters.
- **F07** ← U1-13, U2-26, P1-26, P2-19, P4-16 — five seats describe the same 390 centre slot; U1/P1 name the wrong-act defect, U2/P2/P4 the truncation — one control, one label, `MESSAGE THE CLI…`.
- **F08** ← U2-05, U5-11, P1-06, P3-18, P4-04 — five seats count competing money doors — U2 the three at the region head, P1/P4 four across paper/⌘K/Desk, P3 the three underlined acts, U5 the same three as a reach symptom.
- **F09** ← U4-08, P1-04, P2-03, P3-04 — four seats report the region name carrying no money scent; U4 adds the running-index row, P1 the folded seam, P2/P3 first-glance misreads as permissions.
- **F10** ← U1-15, U5-02, P1-25, P3-16 — four seats swept both pages for chord text and found none; only the task unions differ.
- **F11** ← U2-20, U5-04, P2-12, P4-09 — four seats cite the identical guard `if (!focusTarget?.isConnected) return;` and the same detaching `Studio books` disclosure.
- **F12** ← U1-11, U4-09, P1-33, P3-05 — four seats describe the same shelf — U1 as a duplicate door, U4 as a triple-naming, P1 as not-this-project, P3 as opening onto the product library.
- **F13** ← U2-12, U3-12, P2-07, P3-09 — four seats quote the same two `Aspen` rows in ⌘K's `RECENT` group.
- **F14** ← U1-02, U3-07, P1-01 — three seats compare the same two spines (`w1440-doc-install` / `w1440-doc-care`) against `w1440-doc-project-rich`; U3 filed it at 1440 but its own title says 'any width', matching U1/P1's `all`.
- **F15** ← P1-08, P2-20, P3-03 — three seats enumerate the same mobile sheet contents and the same absence of shelf rows.
- **F16** ← U1-23, P1-05, P2-02 — U1 and P1 name the in-document gap, P2 the studio-wide one; all three are 'nothing anywhere reads what is owed', against a page with several doors to billing.
- **F17** ← U1-08, U4-10, P4-05 — three seats name the same three senses of `room`; P4 records taking the wrong door live, which is the same collision walked rather than catalogued.
- **F18** ← U2-01, U4-04, P1-15 — three seats enumerate the same `stageCopy` action labels; U2 counts five shrugs, U4 four, P1 four — one string table.
- **F19** ← U1-30, P1-19, P2-15 — U1/P1 name the missing per-folio sent-age, P2 the missing cross-project roll-up; both are the same send-wall state failing to reach the Desk.
- **F20** ← P1-21, P3-11, P4-07 — three seats report the same absence of PO/receiving/claim vocabulary on the paper and the same fallback out to the Orders book.
- **F21** ← U2-19, U5-03, P2-11 — three seats cite the same single focus line in `command-bar.tsx` and the same probe result.
- **F22** ← U2-29, U5-12, P1-22 — three seats describe the same unmounted-vs-disabled shape; U5 filed flag `both`, U2/P1 `off` — the defect is the flag-off picture, so the row is scoped `off`.
- **F23** ← U1-19, P1-16, P2-14 — three seats quote `NEEDS YOUR HAND  8` against `4 IN REACH · 4 FOLDED BELOW`.
- **F24** ← U2-27, P1-34, P2-08 — three seats report the same two bare header labels and the same sub-labels living only inside ⌘K.
- **F25** ← U2-21, U5-08, P2-13 — three seats describe the same plain-text `In hand · {Room}` line and the same single release path; all three flag it source-only.
- **F26** ← U3-20, U4-06, P2-18 — U4 names the migration sentence, U3/P2 the density break — one paragraph, one region.
- **F27** ← P1-02, P4-13 — P1 and P4 read the same install spread and the same empty-state line.
- **F28** ← U3-02, P4-17 — U3 measured the overlap by pixel crop, P4 described the same collision at the same width.
- **F29** ← U1-14, P3-06 — U1 and P3 enumerate the same three Desk columns and the same absence of `Call sheet` from all of them.
- **F30** ← U1-06, P1-09 — U1 and P1 quote the same leaf and the same second `UNFOLD ↓`.
- **F31** ← U2-18, P1-24 — U2 and P1 both report the ripple derivation existing in code and appearing in no reviewed shot.
- **F32** ← U1-25, P1-28 — U1 and P1 both compare `wt-delivery-*` against its flag-off twin and find them door-for-door identical.
- **F33** ← U4-01, U4-02 — one seat, two touch points of one drift — the ⌘K placeholder and the no-match group both name the Engine.
- **F34** ← U2-04, P1-13 — U2 counts three competing acts at the head, P1 names the leader as the wrong one; the same ledger row.
- **F35** ← U1-09, U2-07 — U1 and U2 quote the same two `Schedule` headings ~120px apart on one page.
- **F36** ← U2-02, U4-16 — U2 names the guide deferring past the live nudge, U4 the same phrase reused across states; one action string in one branch family.
- **F37** ← U1-16, P2-17 — U1 and P2 both report the unfiltered palette ending before `Rooms & ledgers`.
- **F38** ← U1-17, U4-14 — U1 names the missing scent on the ledger rows, U4 the unglossed `LEDGERS` column head — one block, one omission.
- **F39** ← U1-20, P2-16 — U1 names the fold and the emptiness, P2 the undecodable vocabulary; one folded organ.
- **F40** ← U3-17, P1-18 — U3 and P1 describe the same seam ambiguity, both citing the localStorage persistence probe.
- **F41** ← U3-13, P1-14 — U3 names the hue reuse, P1 the register collapse between a setup chore and a dated overdue; one band, one treatment.
- **F42** ← U4-20, P3-14 — U4 and P3 quote the same two vocabularies printed on one paper.
- **F43** ← U2-16, P3-13 — U2 names the checklist-row mismatch, P3 the headline mismatch — the same discovery guide block.
- **F44** ← U2-17, P3-08 — U2 and P3 quote the same two chips verbatim.
- **F45** ← U1-27, P1-32 — U1 and P1 report the same reflow and the same truncated `1 group · 3 li…`.
- **F46** ← U2-23, P1-31 — U2 and P1 quote the same doubled hint.
- **F47** ← U1-29, P4-15 — U1 and P4 report the same count-vs-dot inconsistency across the same two surfaces.

### What was deliberately NOT merged

- **F01 (below 1440) vs F14 (install/care at every width)** — two different gates: a viewport breakpoint and an `active_section` condition. Merging them would hide that the ≥1440 desk loses the shelves too.
- **F09 (the region carries no money scent) vs F61 (the index reports the one empty tier)** — a naming defect and a wrong-value defect on the same region.
- **F16 (nothing reads what is owed) vs F08 (too many doors to bill)** — an absence and a surplus; the seats' fixes point in opposite directions.
- **F53 (reply leaves the document) vs F83 (`The Post` vs `Message {Family}`)** — a structural gap and a lexical one, filed by different lenses on the same task.
- **F60 (room lens has no substitute below 1440) vs F01** — F60 names a capability, not a doorway, and its fix (a filter) is not the shelf fix.
- **F27 (install spread has no FF&E lines) vs F03 (care spread headed `Install`)** — adjacent code, different defects: missing content vs a wrong heading.
- Nothing was merged across width tiers or flag states unless a contributor had already scoped it `all` / `both`; F22's contributors split on flag and the row is scoped to the state the defect occurs in (`off`).
