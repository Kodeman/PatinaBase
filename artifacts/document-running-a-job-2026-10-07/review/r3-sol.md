<!-- provenance: single-shot via local model gateway; response model=claude-gpt-6-sol[1m]; stop_reason=end_turn; usage={"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"input_tokens":116402,"output_tokens":6742}; images=26; generated 2026-10-07T16:04:45.027Z -->

# R3 (GPT-6 Sol): heuristic evaluation and cognitive walkthrough

## 1. Verdict

The Document is good at naming **one** outstanding thing. It is less good at answering “what else can I do, where does it live, and why this before that?” The lens band promotes a single act, while other useful acts sit in a piece’s unfold, a sheet, the margin, or farther down the paper. Its verbs sometimes describe a destination rather than the work there. A cold reader must remember that a change belongs to a piece, a purchase order is under Order, and an install window is below the Pieces list. Search does not reliably bridge those gaps. Leah can supply that map from memory; the first hire cannot. The remedy is not another place to manage work. It is clearer labels, landings, and explanations at the moment a designer is looking for an act.

## 2. Why the August work didn’t land

- **R124/R125, Direction A, helped.** The Desk exposes live work and the Document can put a need and its verb near the top: the inquiry’s “RESPOND TO THE INQUIRY” is an unusually clear example (walk/s1-step1-desk-landing.jpg; walk/s1-step2-brief-opened.jpg). The populated ⌘K stage roll-up also helps once opened (walk/s1-step3-cmdk-open.jpg). The prior-art delta records these waves as largely live, not as work to repeat.
- **R124/R125, Direction B, cannot be credited with today’s result.** The Shop Ticket shipped, then R127 removed it four days later. The question is whether its replacement answers the same *where and why* questions; its presence alone does not.
- **R126 helped the paper read as one surface.** The restrained rail, drawer, and sheets avoid making every doorway compete visually. But visual calm cannot repair an absent change entry point or a search result that says “No match” for a piece on the open Document (walk/s2-step1-chen-opened.jpg; walk/s3-step1-cmdk-no-match.jpg).
- **R127 helped with a persistent next sentence, but narrowed the answer too far.** The band deliberately prints the worst standing item ahead of the guide and puts the rest behind `+N MORE` (`lens-band-derivation.ts:729-769`). That works for an inquiry. During install, a setup need displaces the arrival-oriented guide; during a cold project open, a damage claim competes with an equally conspicuous missing-client line (walk/s4-step1-install-opened.jpg; walk/s5-step1-olsen-opened.jpg). The August diagnosis that orienting devices can disagree remains visible in guide/control wording (`document-guide.ts:164-169,223-230`; walk/direction-1440.jpg).

These are assessments of the supplied local walk and code, not a claim that the earlier directions were tested with designers after release.

## 3. Heuristic evaluation

**1. Visibility of system status.** Proposal activity has a useful visible Sent/Opened strip (walk/proposal-1440.jpg). By contrast, the Care rail says “ONGOING” beside body copy saying “Project completed”; install’s leading setup message does not answer what is late or arriving (walk/care-1440.jpg; walk/s4-step1-install-opened.jpg). The status shown is not always the status sought.

**2. Match with the real world.** “Respond to the inquiry” and “File the claim” are recognizable acts (walk/brief-1440.jpg; walk/s5-step1-olsen-opened.jpg). “Open the schedule” lands on an Install section, while “Hold the window” can point to FF&E movement rather than the window control (`document-guide.ts:880-890,925-985`; walk/s4-step2-install-section.jpg). “Add project type and named rooms” does not repeat the checklist’s “Scope & rooms” (walk/discovery-1440.jpg).

**3. User control and freedom.** Put down, Esc, and returning from overlays provide exits (`doc-spine.tsx:147-156`; `command-bar.tsx:302-314`). Finding a route back is not the principal problem. Changing the work is: an active Project has no visible “Add a change” at its top or Pieces heading, and ⌘K offers that verb only in Install or Care (`command-bar.tsx:706-717`; walk/s2-step2-schedule-area.jpg).

**4. Consistency and standards.** Direction prints “OPEN THE CONTRACT ROOM” and “CONTINUE DRAFTING” for the same doorway; its quiet-state guide may instead say “Send the agreement” (`document-guide.ts:164-169,223-226`; walk/direction-1440.jpg). The Desk and Document intentionally keep different verbs for some needs (`document-guide.ts:595-635`). Those distinctions require interpretation precisely when a reader needs recognition.

**5. Error prevention.** A completed Care job carries the same “No client linked — attach one” warning as an active Project (walk/care-1440.jpg; walk/project-1440.jpg). This invites work of uncertain consequence. The Direction fixture also shows internal implementation notes verbatim in the Document; the walk establishes exposure, not whether ordinary studio data can produce it (walk/direction-1440.jpg).

**6. Recognition rather than recall.** “Find anything” is printed in the desktop drawer (`studio-drawer.tsx:434-455`), but the keys reference has no comparably visible `?` doorway on the walked Document (walk/s1-step4-keys-sheet.jpg). More importantly, recognizing “sectional” is insufficient: ⌘K matches documents, surfaces, people, and stage text, not the open Document’s piece names (`command-bar.tsx:914-983`; walk/s3-step1-cmdk-no-match.jpg).

**7. Flexibility and efficiency.** Keyboard users get a populated palette and shortcuts (`command-bar.tsx:837-913,1123-1139`). Leah can also browse Pieces from experience. Neither route makes the sofa’s PO a quick, named destination for a new hire: the piece must first be found and unfolded, then its Order area reached (walk/s3-step2-pieces-rail.jpg; walk/s3-step3-line-unfolded.jpg).

**8. Aesthetic and minimalist design.** The short Brief keeps the need unmistakable (walk/brief-1440.jpg). Discovery offers several equal-looking links above five essential rows, while Install leads with setup, dates, budget, and document controls before its manifest (walk/discovery-1440.jpg; walk/install-1440.jpg). Minimizing chrome has not minimized competing choices.

**9. Help users recognize, diagnose, and recover from errors.** ⌘K’s “No match” sends a piece-name search to the Help Center or “Ask about…” rather than suggesting “Browse Pieces in this Document” (`command-bar.tsx:984-1009`; walk/s3-step1-cmdk-no-match.jpg). An unsuccessful search thus conceals a valid recovery path.

**10. Help and documentation.** ⌘K contains Help…, the Help Center, a walkthrough, and The keys (`command-bar.tsx:578-641`); these are genuine doorways. The supplied briefing says the tour largely teaches nouns and published Workshop Notes do not render locally. None supplies an in-place explanation of where to record a signed-job change (walk/s2-step1-chen-opened.jpg). Help should meet that question at Pieces, not require a separate vocabulary hunt.

## 4. Cognitive walkthrough

**Reading key:** Y = yes; **N = no**; — = the local walk did not perform the act or establish its result. Q1: try the right effect? Q2: notice the action? Q3: connect action to effect? Q4: see progress after acting? Each table follows the observed route; persona differences are judgments about that route, not separate recorded sessions. An N records the particular failure, not failure of the entire job.

### Scenario 1 — New inquiry · Leah

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Look on the Desk for new work | Y | Y | Y | Y | Two named new-lead rows are visible; walk/s1-step1-desk-landing.jpg |
| Find Lily beyond the first three | Y | Y | Y | — | “and 7 more below” signals expansion; Lily was opened directly in this walk, not selected from the expanded roster; walk/s1-step1-desk-landing.jpg; walk/WALK.md §3 |
| Read Lily’s next act | Y | Y | Y | — | “Respond by 12 October” and its verb are together; no response was submitted; walk/s1-step2-brief-opened.jpg |
| Open ⌘K / find the keys | Y | Y | Y | Y | Drawer prints ⌘K; the stage roll-up appears. The `?` reference itself was found only by key; walk/s1-step3-cmdk-open.jpg; walk/s1-step4-keys-sheet.jpg |

### Scenario 1 — New inquiry · first hire

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Look on the Desk | Y | Y | Y | Y | Two leads and an overdue summary are immediately legible; walk/s1-step1-desk-landing.jpg |
| Determine whether Lily is among other leads | Y | Y | Y | — | “and 7 more below” is visible, but the initial summary does not identify Lily; expansion was not exercised; walk/s1-step1-desk-landing.jpg; walk/WALK.md §3 |
| Read Lily’s next act once open | Y | Y | Y | — | Clear need and verb; the act was not pressed; walk/s1-step2-brief-opened.jpg |
| Seek a reference for available actions | Y | **N** | **N** | — | Nothing on the visible Document says `?` opens The keys; walk/s1-step4-keys-sheet.jpg |

### Scenario 2 — Change after signing · Leah

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Look for a change act near the signed Project’s controls | Y | **N** | — | — | Top controls concern payment, dates, and budget; walk/s2-step1-chen-opened.jpg |
| Go to Pieces, expecting a piece-specific change | Y | Y | Y | **N** | The first landing presents Schedule setup before the Pieces heading; walk/s2-step2-schedule-area.jpg |
| Find the change mechanism in a line | Y | **N** | — | — | No change control is apparent at the heading or top of the unfolded line; the deeper path was not completed; walk/s2-step2-schedule-area.jpg; walk/s3-step3-line-unfolded.jpg |

### Scenario 2 — Change after signing · first hire

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Seek a way to record what the client changed | Y | **N** | — | — | No change entry point at the top; walk/s2-step1-chen-opened.jpg |
| Try Pieces or Schedule | **N** | Y | **N** | **N** | Without the studio’s per-piece convention, neither label promises an amendment; the Pieces jump first exposes Schedule; walk/s2-step2-schedule-area.jpg |
| Recover through ⌘K | Y | **N** | — | — | “Add a change” is offered there only for Install/Care, not this active Project; `command-bar.tsx:706-717` |

### Scenario 3 — Sofa PO and blocker · Leah

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Search “sectional” in ⌘K | Y | Y | Y | **N** | The piece is on the open Document, but the result says “No match”; walk/s3-step1-cmdk-no-match.jpg; walk/s3-step3-line-unfolded.jpg |
| Browse Pieces instead | Y | Y | Y | Y | Sectional appears, marked RECEIVED; walk/s3-step2-pieces-rail.jpg; walk/s3-step3-line-unfolded.jpg |
| Unfold it and seek its PO | Y | Y | Y | — | “The buy / Quote / Order” is at the bottom of the captured unfold; the PO itself was not opened; walk/s3-step3-line-unfolded.jpg |
| Identify what blocks this PO | Y | — | — | — | This fixture’s sectional is RECEIVED; a blocked PO was not tested; walk/WALK.md §4 |

### Scenario 3 — Sofa PO and blocker · first hire

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Search the known piece word | Y | Y | Y | **N** | “No match” despite the exact piece name on the paper; walk/s3-step1-cmdk-no-match.jpg |
| Choose the offered recovery | **N** | **N** | **N** | — | Help Center/“Ask about…” do not suggest browsing this Document’s Pieces; `command-bar.tsx:984-1009`; walk/s3-step1-cmdk-no-match.jpg |
| If browsing, open Pieces then the line | Y | Y | Y | Y | The sectional and its received state become visible; walk/s3-step2-pieces-rail.jpg; walk/s3-step3-line-unfolded.jpg |
| Find a blocker | Y | — | — | — | No blocked-sofa state was available in this walk; walk/WALK.md §4 |

### Scenario 4 — Install week · Leah

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Check top for late and arriving pieces | Y | **N** | — | — | Setup outranks logistics; walk/s4-step1-install-opened.jpg |
| Press “Open the schedule” | Y | Y | **N** | Y | It scrolls to Install work and Pieces, rather than a dated late/arriving schedule; walk/s4-step2-install-section.jpg |
| Interpret piece and manifest status | Y | Y | **N** | — | “IN PRODUCTION,” “installed,” and “1 of 1 placed” are shown, but no visible late/arrival comparison was established; walk/s4-step2-install-section.jpg |
| Act on the window or punch work | Y | Y | Y | — | PUNCH and HOLD A WINDOW are present; neither was pressed; walk/s4-step2-install-section.jpg |

### Scenario 4 — Install week · first hire

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Decide what to do on opening | **N** | Y | **N** | — | “Name the phases” can be mistaken for the prerequisite to install work; walk/s4-step1-install-opened.jpg |
| Press “Open the schedule” | Y | Y | **N** | Y | Landing reveals Pieces and Install controls, not a plainly named arrivals view; walk/s4-step2-install-section.jpg |
| Decide what is late or arriving | Y | **N** | **N** | — | Production state is not a dated arrival or lateness statement; walk/s4-step2-install-section.jpg |
| Choose an appropriate follow-up | **N** | Y | **N** | — | PUNCH and HOLD A WINDOW are visible, but neither is identified as the response to the chair’s status; walk/s4-step2-install-section.jpg |

### Scenario 5 — Cold open · Leah

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Establish stage | Y | **N** | — | — | “ACTIVE” is visible, but “Project” is not spelled out above the fold; walk/s5-step1-olsen-opened.jpg |
| Read what is waiting | Y | Y | Y | Y | AP-012’s open damage claim and FILE THE CLAIM are prominent; walk/s5-step1-olsen-opened.jpg |
| Choose between claim and client link | Y | Y | **N** | — | Both receive conspicuous ink without an explanation of their relative consequence; walk/s5-step1-olsen-opened.jpg |
| Press FILE THE CLAIM | Y | Y | Y | — | The act is available; it was not pressed in this walk; walk/s5-step1-olsen-opened.jpg |

### Scenario 5 — Cold open · first hire

| step | Q1 | Q2 | Q3 | Q4 | evidence |
|---|---|---|---|---|---|
| Establish stage without visiting the Desk | Y | **N** | — | — | Rail says “ACTIVE”; the Document does not name Project above the fold; walk/s5-step1-olsen-opened.jpg |
| Identify whose work is waiting | Y | Y | **N** | — | A claim and “attach one” are visible, but no ownership or priority sentence joins them; walk/s5-step1-olsen-opened.jpg |
| Choose FILE THE CLAIM | Y | Y | Y | — | Clear verb, but its result and any permissions were not exercised; walk/s5-step1-olsen-opened.jpg |
| Look for other acts | Y | Y | **N** | Y | `+2 MORE` opens a list, but does not say what kinds of work it holds before opening; `lens-band.tsx:311-346`; walk/s5-step1-olsen-opened.jpg |

**Foraging read:** Scent is strongest when a need and verb name the same object—the new inquiry and AP-012 claim. It goes cold at “No match” for a visible piece, at the Pieces jump’s Schedule landing, and where “Open the schedule” promises more specific logistics than its landing supplies.

## 5. Findings

| id | severity | confidence | evidence | observation | interpretation |
|---|---|---|---|---|---|
| R3-01 | S1 | high | walk/s3-step1-cmdk-no-match.jpg; `command-bar.tsx:914-983` | Searching “sectional” from its Document returns no match although the piece is printed there. | The obvious lookup route fails at the start of the PO task. |
| R3-02 | S1 | medium | walk/s2-step1-chen-opened.jpg; walk/s2-step2-schedule-area.jpg; `command-bar.tsx:706-717` | No change entry point is visible at the Project top or Pieces heading; ⌘K’s “Add a change” excludes Project. | Recording a post-signing change depends on knowing a deeper convention. The full change path was not exercised. |
| R3-03 | S2 | high | walk/s4-step1-install-opened.jpg; walk/s4-step2-install-section.jpg | Install’s lead need is to name phases; the destination shows piece states, not an explicit late/arriving list. | A time-sensitive logistics question is displaced by setup. |
| R3-04 | S2 | high | walk/s5-step1-olsen-opened.jpg; `doc-spine.tsx:119-124,210-251` | The cold-open Project shows “ACTIVE,” a mark, and region names, but no clear Project-stage word above the fold in this capture. | A direct-link reader must infer the stage or return to the Desk. |
| R3-05 | S2 | high | walk/care-1440.jpg | The Care rail says “ONGOING” while the body says “Project completed.” | Contradictory status prevents confident closeout. |
| R3-06 | S2 | high | walk/project-1440.jpg; walk/care-1440.jpg | “No client linked — attach one” appears with similar prominence on active and completed work. | Consequence is not reflected in the warning’s weight. |
| R3-07 | S2 | high | walk/s3-step1-cmdk-no-match.jpg; `command-bar.tsx:984-1009` | A zero-result piece search offers Help Center or “Ask about…,” not the open Document’s Pieces. | Search provides no useful recovery route to the known local answer. |
| R3-08 | S2 | medium | walk/s2-step2-schedule-area.jpg; walk/s3-step2-pieces-rail.jpg | A Pieces rail jump can leave Schedule content filling the first viewport. | The landing weakens confidence that the right destination was reached. |
| R3-09 | S2 | medium | `document-guide.ts:223-230,880-890,954-972`; walk/s4-step2-install-section.jpg | The guide’s “Hold the window” rest act retains the FF&E movement landing; the visible window control is elsewhere. | The same words can lead to the wrong object. This rest-state branch was not exercised in the walk. |
| R3-10 | S2 | high | walk/direction-1440.jpg | Internal fixture wording appears as ordinary Document body text. | The reader cannot distinguish studio content from implementation debris. Its source beyond the rendered field is unverified. |
| R3-11 | S3 | high | walk/discovery-1440.jpg; walk/discovery-390.jpg | The suggested “project type and named rooms” action differs from “Scope & rooms,” and several adjacent links share weight. | A first-time reader has to translate the suggested act into a checklist row. |
| R3-12 | S3 | high | walk/direction-1440.jpg; `document-guide.ts:164-169,223-226` | “Open the Contract Room,” “Continue drafting,” and, in a quiet state, “Send the agreement” describe different apparent effects around the same drafting route. | Wording does not consistently distinguish opening, editing, and sending. |
| R3-13 | S3 | high | `document-guide.ts:595-635` | The Document’s need verbs intentionally differ from the Desk’s labels for some needs. | Crossing from Desk to Document can require re-identifying the same work. |
| R3-14 | S3 | high | walk/s5-step1-olsen-opened.jpg; `lens-band-derivation.ts:729-769` | The leading claim and missing-client warning have no stated relationship; other work is behind `+2 MORE`. | Ranking chooses what prints first without explaining why it should be done first. |
| R3-15 | S3 | high | walk/s3-step3-line-unfolded.jpg | The unfolded piece’s Order doorway sits below its identity, specification, and install act. | Finding a PO requires further browsing after finding the correct piece. PO and blocker details were not opened. |
| R3-16 | S3 | high | walk/s1-step1-desk-landing.jpg | The Desk shows three prominent jobs and “and 7 more below”; Lily is not among the first three. | A hire may read the opening summary before understanding the extent of the roster. The expansion link itself is visible. |
| R3-17 | S3 | medium | walk/s1-step4-keys-sheet.jpg; `command-bar.tsx:602-610` | The keys reference is comprehensive once opened, but `?` is not advertised on the walked Document; it is reachable through ⌘K. | A shortcut cannot teach itself to a new reader. |
| R3-18 | S3 | high | walk/install-1440.jpg; walk/install-390.jpg | Install opens with setup, target, budget, messaging, preview, and sharing controls before the manifest. | Available acts are plentiful, but their relative relevance to install week is unclear. |
| R3-19 | S3 | medium | walk/proposal-1440.jpg; walk/project-1440.jpg | “5 unspecified” uses attention-colored ink also used for overdue work. | Normal drafting incompleteness can look like an exception. |
| R3-20 | S3 | medium | walk/care-1440.jpg | “Care” appears as two adjacent headings with different surrounding material. | Readers may mistake distinct regions for a duplicated section. |
| R3-21 | S3 | medium | walk/direction-1440.jpg | “$0 proposed” appears before pricing has been written. | Zero can be read as a price rather than “not priced yet.” |
| R3-22 | S4 | low | walk/WALK.md §4, worst moment 8 | The local walk briefly saw a raw account email before the nameplate resolved; it was not reproduced. | A transient identity flash merits checking, not a conclusion about steady-state display. |

## 6. Opportunities

1. **Desk, when a new inquiry is not in the first three:** keep the compact opening, but label the extent and destination: “New inquiries · 5 — show all,” with household names in the expanded list. Do not make the greeting sound like the whole worklist. Resolves **R3-16**.

2. **Project Document, at the Pieces heading after a client requests a change:** print a quiet “Record a change to a piece” doorway beside “Add a line.” Its next view asks which piece and states whether the change will amend an agreed scope; it does not mutate anything on opening. Use the same name in ⌘K for Project. Resolves **R3-02, R3-08**.

3. **⌘K, on a piece-name query with no destination match:** include matching piece names from the Document in hand, with “Open piece · Order” as a named landing. Until that lookup exists, say “No destination match — browse Pieces in this Document” rather than offering only general help. Resolves **R3-01, R3-07, R3-15**.

4. **Lens band and landing, when the act names a specific control:** make the destination and its label agree. For example, “Hold the window” lands with the Install window heading and HOLD A WINDOW control in view; “Open the schedule” says “Go to Install work” if it merely scrolls there. After a rail jump, place the named region heading below the sticky band, not a preceding region’s body. Resolves **R3-03, R3-08, R3-09**.

5. **Install Document, on arrival during install week:** put a small, dated reading immediately under the lens band—“Arriving: none recorded · Late: none confirmed” if those are the actual facts—with the underlying piece rows and dates one press away. Keep “Name the phases” as setup within Schedule, not a substitute for arrival status. Do not infer lateness from “in production.” Resolves **R3-03, R3-18**.

6. **Project letterhead, on a cold open:** print the existing stage in words beside the document name—“Project · active work”—and give the leading need a short reason if another conspicuous warning remains: “Claim first: its window is open. Client link: needed before assigning decision authority.” Only state that ordering when the underlying facts support it. Resolves **R3-04, R3-14**.

7. **Guide and in-body acts, as drafting and discovery progress:** use one verb for one effect. “Continue drafting” opens an existing Contract Room draft; “Send the agreement” appears only at a send control. In Discovery, use “Add scope & rooms” in both guide and row. Show “Not priced yet” in place of a premature $0. Resolves **R3-11, R3-12, R3-13, R3-21**.

8. **Care and shared status copy, when a job is completed:** reconcile rail and body status from the same fact; demote an unlinked client when it no longer blocks work, or say exactly what remains blocked. Give the two Care regions distinct headings. Review free-text exposure separately before treating implementation notes as studio prose. Resolves **R3-05, R3-06, R3-10, R3-20**.

## 7. Canon tensions

- **VISION §4 and §2 — prompt where needed; no new system to learn.** The cost of a quiet surface is paid by the first hire when “where needed” means inside an undiscovered line unfold. **Narrow relaxation:** allow a contextual doorway at Pieces for a change or PO, without a standing task list or another place to visit.

- **VISION §5/§6 and R127 NG1 — one Document, no persistent global nav.** This rightly discourages another navigation layer. Its cost is that the Document’s own stage and local destinations must carry more explanatory weight than they currently do. **Narrow relaxation:** strengthen the *existing* letterhead, lens band, and region headings; do not add global navigation.

- **V9 — “absence is silence”; the landmark ledger is a table of contents, not nav.** On an active Project, silence about where changes live leaves a real act effectively unavailable. **Founder question:** does V9’s “absence is silence” need relaxing for a non-terminal, contextual “Record a change to a piece” doorway, because a signed-job change is otherwise hard to discover? Keep it at Pieces, not in a permanent menu. The proposed PO landing likewise uses a named piece destination, not a second landmark navigation system.

- **V9 — act weight follows consequence.** Its cost today is inconsistency when an unlinked client is emphasized equally on completed and live jobs, or setup displaces install logistics. **Narrow relaxation:** none required; apply the ruling more strictly to the facts and priority already shown (walk/care-1440.jpg; walk/s4-step1-install-opened.jpg).

- **V11 — no total without rows; no progress bars or streaks.** A stage mark or “0 of 2 installed” cannot by itself answer “what is arriving?” **Narrow relaxation:** none required. Name the dated rows or explicitly say that no arrival dates are recorded; keep totals attached to their underlying pieces (walk/s4-step2-install-section.jpg).

- **R124 item 3 — Install remains a label on Project mode.** That avoids an extra mode to learn, but an install-week reader still needs an install-specific reading. **Founder question:** may the existing Install section lead with dated arrivals and exceptions while remaining part of the one Document, rather than promoting Install into a separate mode?

- **R127 NG2 and R126’s shadow budget.** Flat presentation is not the cause of the failed PO search or missing change doorway. **Narrow relaxation:** none. Improve wording and landings before adding visual weight.