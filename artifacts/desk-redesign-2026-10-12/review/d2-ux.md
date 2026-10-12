# D2 · UX and information architecture: the Desk as the place to run the day

SQ-789, US-26. This is the UX/IA seat, and it contains no product code. Today's click counts come from WALK §3.

## 0. Four facts in the code that shape everything below

1. **A Not today line leaves no trace.** `deriveDaySheet` drops a deferred need with a bare `continue` (`lib/document/day-sheet.ts:149`). The "Coming back" and "Awaiting" blocks render only when the sheet is empty (`components/document/day-sheet.tsx:250`, `:264`). That is why WALK §1c never saw "Coming back".
2. **Set aside has no door.** The RPC branch exists (`00765_studio_need_states.sql:160`), but no component writes `set_aside`.
3. **Need state is per person.** The table's key is `(user_id, need_key)` (00765:37), and each person can select only their own rows (:45–47). In the studio view Leah cannot see that Jordan already chased PO-MS-0388, so she may chase it twice.
4. **"Waiting on others" means two things.** In the workload it means the need's owner is not the designer (`desk-roster-derivation.ts:719-722`). On the sheet it means someone has acted (`day-sheet.ts:141-142`). As a result, Jordan's Marsh PO is an act on his sheet and also sits under WAITING ON OTHERS (WALK M3).

**What survives:** the ranked need list (`desk-need-list.ts:94`, `need-class.ts:90`), the five-line cap (`day-sheet.ts:25`), Not today, the 1 s scoped act sheets, the hand-off need, and Mine against the studio's.

## (a) The Desk's job across one working day

| Moment | Leah's question | Visible at rest | One tap away |
|---|---|---|---|
| **Morning open** | What needs me, and what can wait? | Up to five need lines, grouped onto their jobs, each job with a stage tag. Below them, every other live job exactly once, grouped by whose move it is | Each line's act; each job, through its name |
| **Between visits** (phone, two minutes) | Did anything change? Can I clear one thing? | The same Today cards. Lines she has acted on show their new state. Fresh events carry a time word (`timeWord`, `day-sheet.ts:176`) | The act sheet, in place |
| **Midday** | What's next on this job? | The job name is a link, on its card and on its row | The job's NEXT band. Back returns to the same scroll position |
| **Close** | What moved? What is with others? What comes back tomorrow? | "Nothing more needs you today." above **With others** (who, and since when) and **Coming back** (which day). Both are always shown | The job behind any waiting row |

**Rules:** at rest the Desk answers only "what is mine now, and what is not", with no counts, no "cleared" and no feed. Creating belongs to the header and ⌘K. At 390, the same objects in the same order, with acts beside the sentence (WALK §1b-5).

## (b) The information architecture

**Three populations:**
- **Needs** (`deriveDeskNeedList`) are the authority for *order*.
- **Jobs** (`DeskRosterInput.live`, `desk-roster-derivation.ts:204`) are the authority for *presence*. A job appears on the Desk exactly once.
- **People** are the authority for *scope and custody*. That is the lead (`DeskLeads`), or the designer where no one leads (`desk-scope.ts:27-34`).

Today the needs and the jobs print as two independent lists, so five jobs appear twice (WALK finding 1).

| Unit | Gets right | Gets wrong |
|---|---|---|
| **One card per need** | It mirrors the ranked list. Each act has its own territory | Holloway's invoice and PO become two cards with one name. Leah recognises jobs, not needs. Forty needs as cards is an inbox |
| **One card per job** (the old grid) | One name and one place, scannable by colour (WALK §4) | No rank and no cap: 32 equal cards, 4,000+ px. The second need is hidden (US-24 A3) |
| **Both, as two lists** | Nothing | It is today's duplication with boxes added |
| **Both, as one object** (recommended) | Today's five lines **bound onto their jobs' cards**. Every other job appears once below, as a tagged row | It needs one new pure fold, `groupSheetByJob`, over `DaySheet.lines` keyed on `projectId`, plus a roster that excludes those ids |

**The decision.** **Today** holds at most five need lines, so the V18 Q1 guard stands literally. The lines sit on at most five **job cards**. Each card has:
- a stage tag: a small square chip in `--tab-*`, with the stage word in ink;
- the job name in Playfair, as a link;
- the person and phase line;
- its need sentences, each with an act and Not today.

Holloway's invoice and PO-HD-0412 share one card. A hand-off prints first on its card ("From Leah, Saturday 10 October · Read her note"). That fixes M5, where the hand-off line sat *below* the PO line it explains and had no job name.

**Below Today**, every other live job is one row: tag, name as a link, one sentence and a date. In Mine the rows are grouped:
- **Also yours.** Owed by you, but outside the five, in ranked order.
- **With others.** Either you acted ("Waiting on Fenmoor Joinery since 9 October"), or the head need is the client's or the maker's and owes you no act. A silent PO with a chase owed stays *yours*. This gives "waiting" one meaning, which closes fact 4.
- **Coming back.** Not today and set aside, each with its day. This closes fact 1.
- **At rest.** Folded, behind "At rest — show". No count chip.

Today is boxed, with `--card-edge` and a 2 px radius. The rows sit under a full ink rule and a section head. Kody's "bleeds together" gets two hard edges.

**Mine, the studio's, and Jordan.**
- **One switch scopes the whole page,** placed at the Today head: "Today · Mine · The studio's". It defaults to Mine and is held per person (`desk/page.tsx:105-125`).
- **The studio's.**
  - Cards and rows name their holder in words ("Leah's", "Jordan's"), never as an avatar chip.
  - The rows regroup by person, each with its own *yours / with others* split.
  - The "By team member" toggle is retired, because in the studio view the person *is* the question.
- **Jordan.**
  - Mine is his jobs.
  - A job he took over opens with its hand-off line.
  - Where the note says Leah sees outward acts first, his acts read "Draft for Leah" (Q11).
  - He sees Leah's work only when he switches scope.
- **Founder question (fact 3).** Should the studio view read teammates' acted states ("Jordan chased this, 9 October")? That needs a select policy wider than `select_own` (00765:45). It is an RLS ruling, not a layout one.

## (c) Operating from the Desk

| Act | Where | Why |
|---|---|---|
| Send a reminder | **In place**: `invoice-reminder` (`acts/act-sheet-kind.ts:45`) | It exists, about 1 s, prefilled (WALK M4) |
| Chase a PO | **In place**: `po-chase` (`:43`) | It exists. Jordan saves a draft for Leah (Q11) |
| Proposal follow-up | **In place**: `proposal-follow-up` (`:47-50`) | It exists |
| Release a held order | **In place**: `release-order` (`:51-52`) | It exists, for releasing seats only |
| Not today | **In place**, one press | Writes `not_today` until the next working day |
| Set aside (date and reason) | **In place**, as a second choice on Not today ("Not today · Until…") | Q6 allows it, but there is no door (fact 2) |
| Record a payment | **In place**, through a new `record-payment` sheet scoped to the invoice | Today it calls `openLedger` (`day-sheet.tsx:109-112`), which opens the whole Accounts ledger. The first-dollar stream deserves a one-record sheet |
| Hand off a job | **Not on the card.** From ⌘K ("Hand off a project…") and the job's people sheet, as an overlay | It happens a few times a month. One more control on every card at rest costs too much for an act that rare |
| Read the hand-off note | **Opens the job** at `#hand-off` | The note is about the job. Today is right (`day-sheet.tsx:97-103`) |
| Respond to an inquiry, open the project, any stage act | **Opens the job** at the act's landing (`actLanding`, `day-sheet.tsx:83-91`) | The work is on the paper |

**Rule:** an act opens in place when it is scoped to one record and finishes in one sheet. Everything else opens the job. No act sends without a second, named control.

**Feedback.** Nothing animates, counts or celebrates, and there is no ✓ (house sheet `SPEC.md:1011`). After an act, **the line stays where it was for the rest of the visit, rewritten in muted ink as its new state, and its slot does not refill.** On the next open it moves to its group.

| After | The line reads | Control |
|---|---|---|
| Reminder, chase or follow-up sent | "Reminder sent · waiting on the Hollaways since today" | The name stays a link |
| Jordan's draft saved | "Drafted for Leah · she sees this first" | none |
| Not today | "Back Tuesday 13 October" | **Undo**, which calls the existing `clear` (00765:132) |
| Set aside | "Set aside until 20 October · client travelling" | **Undo** |
| Payment recorded | "$3,400 recorded · Chen Residence paid" | none. The data clears the need |
| Failure | The existing inline sentence (`day-sheet.tsx:172-175`) | none |

**Why the slot must not refill.** Today `deriveDaySheet` promotes the sixth need into a deferred line's gap at once (`day-sheet.ts:158`). Each defer deals a fresh card: the engagement loop VISION refuses. Holding the five for the visit makes the sheet finishable.

## (d) The header

One line at 1440:

> **Good morning, *Leah*** · MONDAY 12 OCTOBER ……… **＋ Record an inquiry** · Find anything ⌘K

**Keep: Record an inquiry.** It is the one create act for a moment that arrives unannounced (M7), the front of the first-dollar stream, and the tour anchor (`desk/page.tsx:488`).

**Keep: Find anything ⌘K.** It is the door to every other verb.

**Move to ⌘K: Create a project file.**
- R79 made it the quiet act for repeat and handshake clients (`desk/page.tsx:499-500`), which is rare.
- It is already a registered verb (`registry.tsx:274-277`).
- It duplicates Desk Contents' Begin column.

**Drop the tips.**
- Delete the two sub-label spans (`desk/page.tsx:493-497`, `:510-514`) and their constants (`:71-76`).
- The words stay in `STUDIO_VERBS` (`registry.tsx:264`, `:277`), where ⌘K and Desk Contents print them as row descriptions. A list is where a description belongs.
- Do not use hover tooltips: there is no hover on Leah's phone.
- "Record an inquiry" needs no gloss. "Direct project setup", the one tip that added a fact (WALK §1a), moves to ⌘K with its act.
- One act weight and one quiet link replace the three underline weights.

**At 390.** "Morning, *Leah*", then "＋ Inquiry", then a Find glyph button with an accessible name. The date moves to the Today head. The header is about 56 px tall instead of 203 px, inside the 16 px gutter.

## (e) M1–M8 under this model

Clicks count from the Desk at rest to the act's sheet or page being open. Scrolling is not a click. "Real" means the moment without the seed's legacy rows crowding the five (WALK §2).

| # | Steps under the proposed model |
|---|---|
| M1 | Read the Today head, "Today · Mine". The stage tags and Playfair names give the shape (two Project jobs, a Proposal, a Brief), then up to five sentences. "What can wait" sits directly under the cards' edge: Also yours, With others, Coming back. |
| M2 | `proposal_declined` is class 1 (`need-class.ts:30`), so Linden ranks into Today. The card reads "Declined yesterday: 'The sofa is over budget.'" with **Follow up**. That opens `proposal-follow-up` in place. |
| M3 | **Leah:** the Holloway card carries both lines, and the PO line reads "Fenmoor Joinery has not answered PO-HD-0412 in 12 days" with **Chase the maker**, which opens `po-chase`. **Jordan:** the Marsh card opens with its hand-off line, then the PO line with **Draft for Leah**. |
| M4 | Holloway's **Send reminder**, or Chen's **Record the payment**, which opens the new scoped sheet. Either way the line settles in place ((c)). |
| M5 | Whose is what is on the card itself: the hand-off line, and in the studio view the holder word on every card. **Read the note** opens the job at `#hand-off`. |
| M6 | Press the job name on the card, then Back. The Desk must keep its scroll offset; today Back lands at 96 px. A "Desk" link on the job page is a Document dependency, named here but not designed. |
| M7 | ＋ Record an inquiry, the two fields, Create. The overlay closes **onto the Desk**, not into the brief, and leaves a muted line for the visit: "Ainsley Moore recorded · just now · Open the brief". The lead is named by the person, not "Consultation" (WALK finding 5). It lands in Today or at the head of Also yours (`leadsByArrival`, `desk-roster-derivation.ts:732-744`). |
| M8 | The acted lines read in their settled state. On the next open: "Nothing more needs you today.", with **With others** ("Waiting on Fenmoor since today") and **Coming back** ("Wren Row Bath · Back Tuesday 13 October"). Both are always shown. They are facts, not a score, so the Q1 guards hold. |

### M1–M8 clicks table

| # | Moment | Today: clicks (scroll 1440 / 390) | Proposed: clicks (scroll) | Today: est. s 1440 / 390 | Proposed: est. s 1440 / 390 |
|---|---|---|---|---|---|
| M1 | Monday 8:00 | 0 (0 / 1 screen) | 0 (0 / under 1 screen) | 8 / 14 | 5 / 8 |
| M2 | Linden declined | 1 (529 / 1,522 px) as walked; 1 (0) real | 1 (0) | 12 / 20; real 4 | 4 / 5 |
| M3 | PO ack overdue | Leah: no Desk path (20+ s through the job). Jordan: 1 (0) | Leah 1 (0) · Jordan 1 (0) | Leah 20+; Jordan 4 / 5 | 4 / 5 |
| M4 | Remind, or record a payment | Remind 1 (0). Record 1 + a ledger search | Remind 1 (0) · Record 1 (0), scoped | 5 / 6 | 4 / 5 |
| M5 | Jordan's hand-off | Read 1. Whose: a toggle 900 px down | Whose 0 · Read 1 | 4 / 5 | 2 / 3 |
| M6 | Into the job and back | 1 (1,873 / 4,624 px) + Back to 96 px | 1 (0) + Back to the same place | 8 / 15 | 2 / 3 |
| M7 | Record an inquiry, see it land | 3, then Back + 1,344 px | 3 + 0 | 25 + about 10 | 25 + 0 |
| M8 | Close of day | 3 to clear; "comes back" not shown | 3 to clear; 0 to read the close | about 10 / not readable | about 10 / 5 to read |

**Marks at rest at 1440 (estimates; recount on the specimens).** Today: 45 text, 18 controls, 9 colour, 12 edges. Proposed (Leah, four cards, five lines): about 34 text, 14 controls, 9 colour (eight stage tags and the clay ＋), and 4 card edges plus 2 section rules. The colour count holds, but every mark now orients; today none do (WALK §3).

## (f) Three structurally distinct Desk models

All three bring back cards with a colour tag. They differ in what a card stands for and in what the colour means. In all three: zero shadows, wrap and never truncate, and no new hex.

### Model 1 · Today's cards over the roster (recommended)

**Unit:** today's five need lines on up to five job cards. Every other job appears once, as a row.

**Tag:** stage, as a small `--tab-*` chip. Urgency stays in order and words.

**For:** it ends the duplication, keeps the five-line guard literally, and is the smallest build. The old cards' scan-by-colour returns without their seven registers.

**Against:**
- A 150-day overdue looks as calm as a 2-day one; only the words say which is which.
- At 43 jobs the rows are still long, with At rest folded.

**Reverses:**
- V18 Q1 "monochrome": the chip is colour, though not a dot or a badge.
- Q7, in part: stage colour returns, as a chip rather than a plate.
- R143 D3, in part: claim cards return, bounded to five.
- House sheet :54 (`--card-edge` is for claim cards only) is arguably kept, because these are claim cards. The founders should rule.
- :592 and :1011 are kept only if the chip stays a square tag, never a pill or a dot.

### Model 2 · The job wall

**Unit:** one card per live job, with no separate sheet. Cards are ranked by each job's head need. The first five are full size, above "The rest are on their projects". The rest are half-height cards: name, tag, one line.

**Tag:** whose move, as a 3 px top edge in a state pigment:
- terracotta-ink: yours;
- sage-ink: with others;
- golden-ink: coming back;
- no edge: at rest.

**For:**
- It is closest to Kody's words.
- Whose move is the real question in a two-person studio.

**Against:**
- At 43 jobs it is a catalogue (US-24 Direction A's unanswered S1).
- A job's second need hides again (A3).
- With terracotta on most cards, it drifts toward alarm (R1-02).

**Reverses:**
- V18 Q1: monochrome, and the five becomes a soft rule.
- Q3, in part: custody becomes the visual grouping.
- R143 D3 and D6, in full.
- House sheet :54: every job gets an edge.
- House sheet :1011 is at risk: a coloured edge across the whole face is close to a tinted band.

### Model 3 · The day column beside the studio board

**Unit:**
- On the left, one card per need, five at most.
- On the right, small job cards in **person columns** (Leah, Jordan).
- At 390 they stack: the day first, then the board by person.

**Tag:**
- On need cards, consequence, read from `NEED_CLASS` (`need-class.ts:23`): class 1 terracotta-ink, class 2 clay-ink.
- On board cards, stage.

**For:**
- "Whose is what" is the page's structure (M5, and Leah's "what is Jordan carrying").
- Urgency shows without reading.

**Against:** two colour grammars on one page; a job appears twice again (finding 1, made explicit); the largest build. The 1,120 px measure (`desk/page.tsx:446`) already broke one rail: IA-17's 260 px column squeezed the ledger's sentence track to 0 px (`:575-579`).

**Reverses:**
- V18 Q1.
- Q7: colour grades urgency.
- Q13: C's structural moves were deferred.
- House sheet :54, :592 (a class chip edges toward a status mark) and :1011.
- The IA-17 rail removal.

### Side by side

| | Model 1 | Model 2 | Model 3 |
|---|---|---|---|
| Card unit | A job, holding today's lines | Every job | A need (day) plus a job (board) |
| Tag means | Stage | Whose move | Class (day), stage (board) |
| Five-line guard | Kept literally | Softened | Kept on the day column |
| Each job once | Yes | Yes | No |
| Studio view | Rows regroup by person | Holder word on the card | It is the layout |
| Build | Small to medium | Medium | Large |
| Reversals | Q1 colour, Q7 part · :54 arguable | Q1, Q3 part, R143 D3/D6 · :54, :1011 risk | Q1, Q7, Q13 · :54, :592, :1011 |

**Recommendation: Model 1.** It answers all three of Kody's objections: a one-line header, two hard edges, and cards with tags. It keeps the guards that Leah's trust rests on, spends colour only on orientation, and closes three of the four code facts in §0. The fourth, per-person state, is a founder ruling, as is Record the payment's scoped sheet. Neither is a layout choice.
