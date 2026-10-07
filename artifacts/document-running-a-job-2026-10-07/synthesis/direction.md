# Running a Job: synthesis and direction

**7 October 2026 · the orchestrator's synthesis of R1 (Opus 5.5), R2 (Fable 5.1) and R3 (GPT-6 Sol)**

**Inputs:**
- `briefing/current-state.md` and `briefing/prior-art-delta.md`
- `walk/WALK.md` (7 stages, 5 scenarios, 34 frames)
- `review/r1-opus.md`, `review/r2-fable.md` and `review/r3-sol.md`

## 1. The thesis

**August made the Document quiet for the person who wrote the job. The studio is now adding people who didn't write it.**

The Document can calculate the next step at every stage. It just doesn't say it in one voice, in words, where a designer looks. Six devices each answer part of "what now?" in their own vocabulary:
- the lens band
- the spine
- the letterhead
- the region heads
- the margin
- ⌘K

The one device built to answer it, the band, has room for one sentence. On a busy job a standing item takes that sentence, and the stage's next step then prints nowhere. Chen Residence and Cedar Lane Study both show this in the walk. Leah fills the gaps from memory. A first hire, opening someone else's job, can't.

The three reviewers framed the root cause three ways, and all three framings hold:
- **R1 (Opus): no contract between devices.** No single source feeds every surface that prints a next act. The code says so itself (`document-guide.ts:596-602`), and the briefing counts 13 cross-device contradictions, places where two surfaces disagree about the same state.
- **R2 (Fable): tuned for the author, not the inheritor.** Each August program answered the complaint of the moment (clutter, contradiction, calm). None was briefed on VISION §2's moment, a studio adding its first hands.
- **R3 (Sol): good at naming one thing.** The Document is poor at "what else can I do, where does it live, and why this before that?"

**Why August didn't land.** R1 reads R127's acceptance gates as geometric: band height, CLS, first-head position, blank frames. None of the gates R1 found asks a person to finish a task: find the next act, record a change, find a PO. We found no record of a task test after release, though one may exist outside the repo. The one structural answer, Direction B's job ticket, was deleted four days after it shipped, before anyone compared it with the band (R1 §2). **Process ask:** the five scenarios in this review become the acceptance test for whatever ships next, performed by someone who didn't build the job.

## 2. Where the three models agree (high confidence)

Each row's **bold claim** is the observation all three reviewers made. Sub-details that only some reviewers reported carry their names in brackets. Severity is the highest any reviewer gave to the shared claim.

| # | Finding | R1 | R2 | R3 | Sev |
|---|---|---|---|---|---|
| A1 | **The stage is not written in words at the top of the page.** Band, spine and letterhead each yield to another. The last one prints an unlabelled mark. The rail says ACTIVE, ONGOING or INSTALLATION, never the stage. | R1-02, R1-03 | R2-01 | R3-04 | S1 |
| A2 | **⌘K can't find what's on the open paper.** "sectional" returns No match from inside the Document listing "Custom Walnut Sectional", then recovers to Help, not to Pieces. | R1-05 | R2-02 | R3-01, R3-07 | S1 |
| A3 | **Recording a client's change after signing has no visible door.** It's an "Amendment" in a folded accounts band near the foot, or a maker-side change order three levels into a line. ⌘K offers "Add a change" only in Install and Care. | R1-04 | R2-03 | R3-02 | S1 |
| A4 | **Install week leads with a setup chore, and nothing says what's late or arriving.** "Name the phases" takes the band in terracotta. [The two counts in the Install region disagree: R1, R2.] | R1-07, R1-21 | R2-09, R2-10 | R3-03 | S2 |
| A5 | **The guide's words differ from the control they land on.** Direction shows four labels for one door on one screen. The briefing lists 13 cross-device contradictions, which include these. [The Desk's and the paper's verbs differ for six need kinds, by design: R1, R2.] | R1-10 | R2-04, R2-05 | R3-12, R3-13 | S2 |
| A6 | **Weight and colour follow category, not consequence.** "No client linked" prints the same on a live overdue job and a closed one. "5 unspecified" in drafting uses the overdue-money terracotta. | R1-08, R1-09, R1-29 | R2-07, R2-22 | R3-06, R3-19 | S2 |
| A7 | **Care contradicts itself.** The rail says ONGOING; the body says "Project completed." [The heading "Care" prints twice: R1, R3.] | R1-03, R1-35 | R2-10 | R3-05, R3-20 | S2 |
| A8 | **The paper prints its own machinery as copy.** A seeded engineering note renders as body text on Direction. [Further leaks — `BAND`, "EXACT ARTIFACT · NAMED AUTHORITY", "No active phase handoffs need attention.", four "Nothing yet" heads before the Pieces: R1, R2.] | R1-16, R1-17, R1-18 | R2-11, R2-12, R2-15, R2-26 | R3-10 | S2 |
| A9 | **The `?` key is printed nowhere, so the Keys sheet can't be found.** [The `g` keys are unprinted too; the tour teaches nouns; Workshop Notes render nothing until published: R1, R2.] | R1-30, R1-37, R1-38 | R2-19, R2-24, R2-25 | R3-17 | S3 |
| A10 | **One line, then a door.** Every other open item sits behind `+N MORE`, a count with no kind and no order explained. | R1-15 | R2-06 | R3-14 | S2 |

## 3. Where they split, and what we take from each

- **The next act's slot.** R1 rates it S1: blocking items and the next step share line 2, so the next step disappears on busy jobs (R1-01). R2 sees the same slot as the right rhythm for Leah and the wrong one for a cold reader. R3 asks for a reason line rather than another slot.
  *Taken:* split the band into **Next** and **Standing** (Direction A). The cold-reader fix sits on top of that (Direction B).
- **R126 (Ink on Paper).** R1 argues it flattened act weight: primary and tertiary look alike, and the flooded `inked` tier goes to region leaders. R2 keeps R126's register as "simply right". R3 says flatness isn't the cause, so fix wording first.
  *Taken:* keep the register and change who gets the weight. Only the next act is heavy, and the filled tier is for money or signature. This is V9 applied, not R126 reversed.
- **Install.** R1 and R2 say R124 item 3 ("install stays a label") can stand: the fix is a lateness need kind plus the leader rule. R3 frames it as a founder question.
  *Taken:* no mode. The Install region leads with a dated reading of what hasn't arrived against the install start. The local seed records no arrival dates, so the reading says so in words; it never invents lateness. R3's question is kept, but the answer is "no ruling needed".
- **Whose move.** Only R2 names it. Discovery's "Yours to add: scope. Waiting on the Ashfords: budget and 3 more" is the only ownership sentence in the product, and the Desk card's YOUR PEN never reaches the paper. *Taken:* this becomes Direction B. It is the clearest link between this review and the studio moment.
- **Unique catches worth carrying:**
  - The red-letter zone is no longer mounted at all (R1-14, so BRIEF.md's map was stale).
  - A held job looks live (R1-22).
  - The phone dock's centre is "Message the client" on every stage, even with no client linked (R1-11, R2-08, F52 unchanged).
  - The money acts (bill, release, send) are the quietest on the page, and their refusals don't say why (R2-32, R1-39).
  - "$0 proposed" should read "Not priced yet" (R3-21).

## 4. Three directions

All three keep the canon that holds: one Document (V7 D1, no tabs), NG1 (no persistent global nav), NG2 (shadow budget), V11's ledger test, R126's register, and V12's arrival. None adds a dashboard, a task manager or a badge. Each passes the VISION feature test.

### Direction A: One Voice (the next-act contract)
- **Surface:** the Document. **Moment:** every open of a live job. **Stream:** subscription. **Promise:** prompts where needed, then gets out of the way.
- **What changes:**
  - **One label table.** Every device that prints a next act reads it: band, Desk card, ⌘K, region head, dock. The act's name is the name of the control it lands on, and the press lands with focus on that control. Each of the 13 contradictions collapses to one word.
  - **What Next means.** Next is the highest-consequence act open on the paper: money or a signature first, then anything that blocks another person, then the stage's own step. Whatever Next is, the stage's own step always prints as the leading act on its region head, so it can never disappear.
  - **The band gets two fixed positions.** `Next ─ <act>` on the left, `Standing · <worst> +N` on the right. Silence on the right when nothing stands.
  - **The stage in words in the letterhead eyebrow:** `PROJECT · 5 OF 7`, using the seven document words only.
  - **Weight by role.** Only the Next act and its twin at the head of the active region are the heavy act. The filled tier stays for money or signature, with its consequence sentence. Region leaders become scored words. A gated act prints its reason in a sentence under it.
  - **The phone dock's centre is the Next act.** Message moves into More and is withheld when no client is linked.
- **Resolves:** A1, A5, A6, A10, R1-01, R1-06, R1-11, R2-13, R2-32.
- **Canon asks:** R127 OD-11 (the guide act gets two printings), R127 L-6 (yield the count, never the word), and R124 item 7 / I114 (rule the stage vocabulary).

### Direction B: Whose Move (the paper a first hire can pick up)
- **Surface:** the Document and the Desk. **Moment:** Leah hands a job to her first hire. **Stream:** subscription, and margin (a job that moves sells pieces). **Promise:** no new system to learn.
- **What changes:**
  - **An ownership sentence on every stage**, in Discovery's shape: `Yours: file the claim on AP-012 · Waiting on the Harpers: nothing`.
  - **On a handoff, said once:** "Leah put this down Tuesday. Yours now."
  - **The first open of a paper by a person shows the standing sheet unfolded once**, grouped by kind: *blocks money or a signature* / *needs you* / *setup*. After that, the band alone. *This is close to a task list; whether it stays inside canon is founder question Q9.*
  - **The Desk prose takes the same shape:** "Yours today: respond to Lily by Sunday. Overdue: Chen, Aspen."
  - **The teammate tour becomes one dismissible note on one real job**, instead of naming rooms: "Here's a job Leah put down for you. The band says what's yours. Press it." No step count, no "next note".
- **Illustrative in the mockups:** the handoff line, the assignment, "Waiting on: no one", the *blocks money* class on AP-012, and the Standing counts. The seed has no handoff or assignment records.
- **Resolves:** A1, A10, R2-31, R2-16, R2-24, R1-24, R3-16, and scenario 5.
- **Canon asks:** R127 L-11 (a one-time first-open relaxation), and one reading sentence in VISION §4: "To the first hire, the paper says where it is and whose move it is before she asks."

### Direction C: Ask the Paper (the acts live where a designer looks)
- **Surface:** the Document and ⌘K. **Moment:** "where is the sofa's PO?", "the client changed their mind", install week. **Stream:** margin, since every one of these is a piece being sold, changed or delivered. **Promise:** collects information when and where you need it.
- **What changes:**
  - **⌘K searches the open paper:** pieces, makers, PO numbers, rooms, and verbs with synonyms. "sectional" and "WS-188" are meant to land on the unfolded line with its Order cell open (proposed and untested; the walk's order trail stopped at the line). "change" offers *Record a change*. "late" opens the install reading. A dry query suggests Pieces, not Help. `?` is printed beside ⌘K.
  - **"Record a change" on the Pieces head and the Money head.** It asks one question, *on a piece or on the agreement?*, and opens the right sheet. The same name appears in ⌘K at every stage after signing.
  - **Install reads as install week.** A dated reading sits under the band: `Behind the install start · Reading chair isn't here, and the install began 11 June. No arrival date recorded · ASK THE MAKER FOR A DATE`. The act drafts a note to the maker that is held for review, never sent. Placement shows as a state on each row, never as a ratio. Setup chores drop to *setup* and never take the terracotta line. The two counts in the region become one.
  - **Folded regions print their verbs on the seam.**
- **Resolves:** A2, A3, A4, R1-04, R1-05, R2-02, R2-03, R2-09, R3-01, R3-02, R3-03, and scenarios 2, 3 and 4.
- **Canon ask:** V9 "absence is silence" gets one gloss. Absence of *state* is silence; absence of an *expected act* is one named sentence.

## 5. Recommendation

**These three directions are layers of one move, not rivals. Build them in this order: repairs, then C's task fixes, then A as the foundation, then B.**

C ships before A because it fixes the failed tasks with the least canon. C's mockups borrow A's band only to show the end state. Slice 1 ships C's devices without A's band.

| Slice | What ships | Canon needed | Why in this order |
|---|---|---|---|
| **0a: Pure repairs** (no design debate) | Care ONGOING versus "Project completed." and the double Care heading. The disagreeing Install counts. F52 (Message offered with no client linked). Machinery eyebrows and the leaked engineering note removed. "No active phase handoffs…" deleted. "Not priced yet" replaces $0. Placeholder-name guard. A named reason on Send and Release. | None | Each is a defect against canon already in force (V9, VISION §6). |
| **0b: Repairs that wait on a ruling** | "No client linked" suppressed on closed jobs and moved into the standing list (Q3, Q5). Setup phases no longer painted terracotta (Q3). | Q3, Q5 | Small, but each one changes what the paper treats as an exception. |
| **1: Ask the Paper** (C) | ⌘K on the open paper. Record a change. The install reading. `?` printed. | The V9 gloss | Fixes the two S1 task failures (A2, A3) and the S2 install failure (A4) that all three reviewers found. It has the highest yield and touches the least canon. |
| **2: One Voice** (A) | The label table, the Next/Standing band, the stage word, weight by role, the dock. | OD-11, L-6, I114 | Ends the contradictions at the source, so later work doesn't drift. |
| **3: Whose Move** (B) | The ownership sentence, the handoff line, first-open standing, Desk prose, the one-note tour. | L-11, Q9, VISION §4 reading | Needs A's single source to print "yours" truthfully. This is the studio-moment payoff. |

**Acceptance for every slice:** the five scenarios, performed by a person who did not build the job, at 1440 and 390. For each scenario, record:
- whether the task succeeded, and the step count
- whether the answer was accurate (the right PO, the right piece, the right date)
- one named refusal met along the way, and whether its reason was read
- the return path to the paper afterwards

Two fixtures are added to the seed for this: a blocked PO, and a change after signature. This replaces geometry-only gates.

## 6. Founder questions

**The short list, decided first:** Q1 (the stage word), Q2 (Next and Standing), Q8 (the acceptance gate). The rest can follow the first slice.

1. **The stage word (R127 L-6).** Should the stage print in words at the top of every paper? Yield the count, never the word. *All three reviewers identify the missing stage; printing it as a word at the top is this synthesis's choice.*
2. **Next and Standing (R127 OD-11 / L-11).** May the band carry the next act and the worst standing item side by side, instead of making them share one slot?
3. **Ranking by kind (R127 W3-R1).** Keep deadline order within a class, but put *blocks money or a signature* ahead of everything else. Setup is never painted as an exception.
4. **The stage vocabulary (R124 item 7 / I114).** Should only the seven document words ever print as stage on a studio surface, with the eleven-stage workflow names kept in data?
5. **"Absence is silence" (V9 §5).** Is a missing *expected act* a named sentence rather than silence (for example "Only the owner can close the book", "Held since 2 Oct")?
6. **The first open (R127 L-11).** May a paper show its full standing list once, the first time a person opens it?
7. **VISION §4, read for the first hire.** Would a sentence like "the paper says where it is and whose move it is before she asks" belong in VISION §4? This is offered for discussion, not as a drafted edit.
8. **Process.** Make the five scenarios, performed by someone who didn't build the job, the acceptance gate for wayfinding work.
9. **Is B's first-open list a task list?** Grouped and unfolded once, it reads close to one. Does it stay inside VISION's "no task manager", or does B need a lighter first open?
10. **Is the stage mark a progress bar?** `PROJECT · 5 OF 7` and the strata mark show position in a sequence. Does V11's "no progress bars" rule them out, or does a count of words pass where a filled bar would not?

## 7. What we need from Leah

- Her first hire, or whoever is closest to that, walking the five scenarios on a real job. That's 30 minutes, and it is the kind of test we found no record of after August.
- The studio's own words for these four things:
  - a client's change after signing (*change*, *revision*, *amendment*?)
  - the seven stages
  - "late"
  - "whose move"
- Which of the five scenarios happen weekly, and which yearly.
- How often a job is held or paused, and how she'd want a held job to look.
