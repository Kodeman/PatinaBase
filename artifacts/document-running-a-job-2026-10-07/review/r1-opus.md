# R1: interaction and information architecture review of running a job in The Document

**Seat:** R1, senior interaction designer and information architect (Opus 5.5).
**Date:** 7 October 2026.
**Read against:** `main@5a9e78c28`, the briefing (`briefing/current-state.md`, `briefing/prior-art-delta.md`), the walk (`walk/WALK.md` and all 34 JPEGs), and the code under `apps/designer-portal/src/`. Paths below start there unless they begin with `walk/`, `docs/` or `artifacts/`.

---

## 1. Verdict

Designers get lost because the Document has no single answer to "what should I do next". Six devices each answer part of it in their own words: lens band, spine, letterhead, region heads, margin and ⌘K. The band, built to give the answer, has room for one sentence. When anything on the job is late, that sentence goes to the late thing, and the stage's next step is printed nowhere. On a live project something is almost always late. At the top of the page the stage is never written in words: each device defers to another that only draws a mark.

Weight makes it worse. The heaviest mark on most pages is a region chore, not the suggested act. A common act, recording a client's change, sits behind a fold near the foot. Leah fills the gaps from memory. A first hire can't.

---

## 2. Why the August work didn't land

Each August program fixed a device. None of them fixed the contract between devices: one source for the next act, read by every surface that prints it. The code says so itself. `lib/document/document-guide.ts:596-602` documents that the guide's verbs deliberately diverge from the Desk's `NEED_ACTION_LABELS`, and the briefing counts 13 places where two devices name different next steps for the same state (`current-state.md` §2).

| Ruling | Helped? | Why |
|---|---|---|
| **R124**, the wayfinding rulings | **Partly.** | It ratified Direction A's work on strings and doors. That work gave better act labels (F18), the ⌘K "Where the work stands" group, and a printed ⌘K doorway. All three still help. But three of its choices are now costs. **Item 3** ruled that "install stays a label on project mode, not a mode". Install week therefore has no install view of its own, and scenario 4 breaks on this. **Item 7** left the stage vocabulary (I114) unruled. That is why the same stage is still called PROJECT, ACTIVE, *In procurement* and *Procurement & Orders* (R1-03). **Items 4–6** ratified B's job ticket only on condition, and it lived four days. |
| **R125**, no flags and full scope | **Neutral.** | This was process. It shipped A and B quickly. GA with no flag also meant the ticket and the band were never tried side by side with a real designer before one replaced the other. |
| **R126**, the Life Review (Ink on Paper) | **Didn't help orientation, and hurt act weight.** | It made the paper calmer. It also put almost every act into the same 12px mono caps with an underline score, so the tiers differ only by score count and ink value (`app/globals.css` Scored Ink block, about lines 830–960). A primary, a secondary and a tertiary act look nearly alike at reading distance (`walk/brief-1440.jpg`: RESPOND TO THE INQUIRY next to ADD A SUBJECT LINE). The one flooded variant (`inked`) went to region leaders, not to the suggested act (R1-06). |
| **R127**, the Smart Lens | **Helped the instrument but not the errand.** | **Gains:** one sticky 56px band. Scrolling surfaces the worst standing thing with its act, `+N MORE` holds the rest, and the job ticket's clutter is gone. **Losses:** (a) Line 2 is one slot shared by exceptions and the guide, so the guide loses whenever an exception exists (`lib/document/lens-band-derivation.ts:732-743,766-768`). (b) W3-R1 ranks standing items by deadline distance, "never by kind", so a setup chore and a damage claim compete on the same scale. (c) L-6 and D-B38 make the band, the spine and the letterhead all yield the stage word at the top of the page, so nothing prints it (R1-02). (d) OD-11/DL-05 made the band the guide act's only printing, so the phone's dock lost it (R1-11). (e) **Every acceptance gate was geometric.** The gates were 56px band height, CLS 0, first region head at no more than 405px, and 0 blank frames, measured on three seeded papers, and the ruling says "No Kody session before ship". No gate asked a person to find the next act, record a change or find a PO. The band passed all its gates. Nobody tested whether a designer could finish a task with it. |

**Short version:** August measured whether the devices printed correctly. Nobody tested whether a designer could finish a task with them. The one structural answer, B's ticket, was deleted before anyone could compare it with the band.

---

## 3. Findings

Severity: S1 blocks the job, S2 costs real time or causes errors, S3 friction, S4 polish. Confidence: H, M or L. Every finding is reported, at every severity.

| id | sev | conf | evidence | observation | interpretation |
|---|---|---|---|---|---|
| R1-01 | S1 | H | `lib/document/lens-band-derivation.ts:732-743,766-768`; `components/document/document-guide.tsx:11-14`; `app/(document)/doc/[id]/page.tsx:2337-2380`; `walk/project-1440.jpg` | When any standing exception exists, line 2 prints that exception, and the guide's act is not printed. The guide's act appears only in the band (OD-11), and the standing sheet lists exceptions and inputs but not the guide. On Chen Residence, "Balance to Woodward & Sons" takes the slot, and the Project guide "Open the FF&E schedule" (`document-guide.ts:187`) prints nowhere. | Blocking items and the suggested next step share one slot. On any live job, the next step disappears exactly when the job is busiest. This is the core reason designers can't tell what they *should* do. |
| R1-02 | S1 | H | `components/document/lens-band.tsx:233-250` (identity and stage are null while `open`); `components/document/doc-spine.tsx:224-231` (stage phrase `opacity-0` while the letterhead is in frame); `components/document/doc-letterhead.tsx:74` (the mark's label is "Document progress"); `walk/s5-step1-olsen-opened.jpg` | At the top of the page, the band yields the stage to the letterhead and the spine yields it to "the letterhead's own arc". The letterhead now prints only an unlabelled strata mark, because W7-R1 removed the arc row. The stage word appears only after scrolling (`walk/s2-step2-schedule-area.jpg`: "CLIENT · PROJECT"). | Each device yields to another, and the device at the end prints no word. Scenario 5's first question, "what stage is this?", has no answer on first view. |
| R1-03 | S2 | H | Desk chip PROJECT (`walk/s1-step1-desk-landing.jpg`); rail ACTIVE / ONGOING / INSTALLATION (`walk/project-1440.jpg`, `walk/care-1440.jpg`, `walk/install-1440.jpg`); ⌘K "In procurement" and "Out for signature" (`components/document/command-bar.tsx:147-155`); `stagePhrase` "PROCUREMENT & ORDERS 4 OF 6" (`lens-band-derivation.ts:671-679`); gate eyebrows (`lib/document/workflow-gate.ts:64-87`) | One stage, five words, depending on the device. Care prints ONGOING in the rail and "Project completed." in the body. | The stage vocabulary has no owner (R124 item 7 left I114 open). Each device chose its own words, so a first hire can't match the Desk's PROJECT to the paper's ACTIVE. |
| R1-04 | S1 | H | `components/document/account-band.tsx:206` (`open` defaults to false), `:456-464` ("Amendment" in Project, "Add a change" only in Install and Care); `command-bar.tsx:706-717` (⌘K "Add a change" only when `active_section` is install or care); `line-unfold/change-order.tsx`; `walk/s2-step1-chen-opened.jpg`, `walk/s2-step2-schedule-area.jpg` | In the Project stage, the stage a signed job is in, there are three ways to record a change: a secondary "Amendment" act inside the folded *The accounts · this project* band near the foot, a per-line change order three levels into a line unfold, and a margin escalation. ⌘K offers no change verb in this stage. Neither the band nor the guide mentions any of them. | A frequent post-signing act is hidden behind a fold labelled with an accounting word, in a band the designer has no reason to open. Its name depends on the stage. |
| R1-05 | S1 | H | `walk/s3-step1-cmdk-no-match.jpg`; `command-bar.tsx:1178` (placeholder "Find a document or a ledger…"), `:980-1006` | Typing "sectional" in ⌘K from inside the document that lists "Custom Walnut Sectional — 3 pc" returns *No match*, plus an ask row. ⌘K doesn't search the open paper's pieces, POs or makers. | ⌘K is the one tool that works at every width, and it can't answer the most common question, "where is X on this job". The ask row then reads like the product's only next step. |
| R1-06 | S2 | H | `components/document/region/region-head.tsx:8-12,231-232` (ledger entry 0 is always `inked`); `app/globals.css` `.da-inked` (about :901, charcoal pool open at rest); `lens-band.tsx:297` (the band's act is `primary`, scored only); `walk/project-1440.jpg` (SPEC THE 3 UNSPECIFIED), `walk/direction-1440.jpg` (OPEN THE RECORD), `walk/install-1440.jpg` (ASSIGN PROJECT CLIENT) | Every region elects one flooded charcoal leader, whatever its consequence. The page's suggested next act, in the band, is a lighter underlined word. To an untrained eye, `inked` and `terminal` look the same: flat charcoal with light text. | Weight is assigned by position (index 0 of a region), not by consequence. The heaviest marks on the page point at chores such as "Open the record". V9's "act weight follows consequence" holds for `terminal` and fails for `inked`. |
| R1-07 | S2 | H | `lib/document/desk-derivation.ts:1503-1522` (`schedule_unconfigured`, commented "this is setup, not obstruction", `urgent: false`, clay stamp); `lens-band-derivation.ts:413` (it is in the standing set as `decision-due`); `lens-band.tsx:267-271` (any standing line prints terracotta); `walk/install-1440.jpg`, `walk/s4-step1-install-opened.jpg` | "Name the phases for this project" takes line 2 in terracotta during install week and displaces the Install guide, "Complete the installation" with its act "Check what's arriving" (`document-guide.ts:190-194`). | The Desk calls this setup; the Document paints it as an exception. A first hire takes on a configuration chore when she opened the job to see what's arriving. |
| R1-08 | S2 | H | `lens-band-derivation.ts:56-72` ("EYEBROW WORDS, not a ranking"), `:540-668`; `walk/s5-step1-olsen-opened.jpg` | Standing items sort only by distance to their deadline. Nothing records whether an item blocks money, a signature or an install, or is merely a gap. "AP-012 has an open damage claim" and "No client linked" print in the same terracotta. | The paper can't tell "blocking" from "worth fixing". The designer has to triage by hand on every job, which is the task the band exists to do. |
| R1-09 | S2 | H | `components/document/household-chip.tsx:57`; `components/document/approvals/project-approval-document.tsx:547`; `walk/project-1440.jpg`, `walk/care-1440.jpg`, `walk/install-1440.jpg` | "No client linked — attach one" prints in the same italic on a live overdue job and on a completed one. On Install, the letterhead says "attach one" while the approvals region's inked leader says "ASSIGN PROJECT CLIENT". These are two verbs for one fix, on one screen. | The warning ignores whether it matters now, and the same fix has two names, so the designer can't tell they are one act. |
| R1-10 | S2 | H | `current-state.md` §2, contradictions 1–13 (for example `document-guide.ts:169,226` with `proposal-instruments.tsx:373,397`; `document-guide.ts:228` with `ffe-section.tsx:1409`) | The guide's labels differ from the label of the control they lead to in 13 places. Direction shows four labels for one door on one screen (`walk/direction-1440.jpg`). | After pressing a guide act, the designer can't confirm she has arrived, because the control she lands on has a different name. Every mismatch is a small doubt, and they add up. |
| R1-11 | S2 | H | `components/document/letterhead-instruments.tsx:296-308` (registers "Message {family}" as the mobile primary); `document-guide.tsx:11-14` (the guide no longer registers); `walk/project-390.jpg` | At 390 the centre of the dock, the most persistent and reachable act, is "MESSAGE THE CLIENT" at every stage. On Chen it shows although no client is linked (F52 is unchanged). | On the phone the suggested act has been replaced by a messaging act. The device a designer carries to site always offers to message the client. |
| R1-12 | S3 | H | `lens-band-derivation.ts:286-290` (`shortenAct` keeps only the verb); `walk/install-390.jpg` ("SET UP · NAME  OPEN  +1 MORE"); `walk/project-390.jpg` ("OVERDUE 148D · WS-188  RECORD  +2 MORE") | At 390 the band's act becomes a bare verb, and the sentence is compressed to a state and a code. | "OPEN" what? "RECORD" what? On the phone the one instruction loses its object. |
| R1-13 | S2 | M | `components/document/studio-drawer.tsx:282,452`; `doc-spine.tsx:140`; `lib/document/shelves.ts:49-136`; `components/document/margin-rail.tsx:144-145` | From 1180 to 1439px, the shelves and room rungs are gone, "Find anything" loses its text label and the margin becomes an overlay. Below 1180 the drawer and the spine disappear. | Many studio laptops run at a logical width in this tier, so the full desk layout is the exception rather than the rule. Confidence is M because it depends on the studio's hardware, which I haven't seen. |
| R1-14 | S2 | H | `app/(document)/doc/[id]/page.tsx:171` (only the `RedLetterRow` type is imported); there is no JSX mount of `RedLetterZone` anywhere (grep); `components/document/red-letter-zone.tsx:95` | The red-letter zone, "Needs attention · in one place", is not rendered. Its rows feed the band's ranking. BRIEF.md and older docs still describe it as a device on the page. | The "one place" for what's blocking has become one line plus a door. The team's own map of the surface is out of date, which is a sign of how hard the devices are to keep in view. |
| R1-15 | S3 | H | `lens-band.tsx:311-331`; `lens-band-derivation.ts:758-764` | `+N MORE` is the only route to everything else that stands. It counts exceptions and inputs together and is coloured terracotta or clay by what it contains. Its label gives a number and no kind. | "+2 MORE" doesn't say whether it holds two fires or two blanks. The door's colour carries the meaning, and on the warm paper the clay is hard to read (F56). |
| R1-16 | S3 | H | `components/document/phase-advance-control.tsx:367-373`; `walk/project-1440.jpg`, `walk/s5-step1-olsen-opened.jpg` | "No active phase handoffs need attention." prints on every Project, Install and Care paper. | This breaks "absence is silence" (V9 §5). It is the only place the phase machinery speaks, and all it says is that nothing is happening. |
| R1-17 | S3 | H | `walk/s5-step1-olsen-opened.jpg`, `walk/install-1440.jpg`, `walk/project-1440.jpg`, `walk/direction-1440.jpg`; `desk-derivation.ts:1518` (stamp label `'BAND'`) | The page shows machinery: the eyebrow "EXACT ARTIFACT · NAMED AUTHORITY", the sentence "Bind each request to one issued plan, client-ready specification, or published budget checkpoint…", a lone "BAND" label (probably the schedule need's stamp; M), and a seeded engineering note shown verbatim (Worst Moment 1). | T6 from August, "the Document leaks its own machinery", is still true. Each leak is a phrase a first hire has to decode before she can act. |
| R1-18 | S2 | M | `walk/install-1440.jpg`, `walk/s4-step2-install-section.jpg` | On Install the order is: Client approvals ("Nothing yet"), Schedule dates, phase handoffs, BAND, and only then Install. The rail lists Client approvals, Pieces, Closing the book and The record, and has no "Install" stop. | The current stage's own work is fifth on the paper and absent from the paper's table of contents. An empty approvals region comes first on every project-family paper (T5, "empty modules"). |
| R1-19 | S3 | H | `components/document/schedule/schedule-rule-region.tsx:9-12` (the comment acknowledges both); `walk/project-1440.jpg` | There are two regions called schedule: "Schedule dates", folded, and "Schedule", the ledger inside Project. | F35 is still open. "Open the schedule" can mean either one. |
| R1-20 | S3 | M | `walk/s2-step2-schedule-area.jpg`, `walk/s4-step2-install-section.jpg` | There are three places to add tasks: the Schedule's "THE WORK · ADD TASK", "Plan the project work · ADD THE FIRST TASK" and "Plan the install work · ADD THE FIRST TASK". | It's not clear which one is canonical, so the work gets recorded in several places. |
| R1-21 | S2 | M | `walk/s4-step2-install-section.jpg` | The Install head reads "0 OF 2 INSTALLED". The manifest below reads "1 OF 1 PLACED · Built-in shelving — installed". The shelving's piece row shows no state. | In install week, two counts in one region disagree. The designer can't trust either one. |
| R1-22 | S2 | H | `components/document/doc-colophon.tsx:124-140` (Hold/Resume in the colophon only); a grep for `on_hold` in `lib/document/`, `components/document/` and `app/(document)/doc/` finds only the colophon | A held job looks the same as an active one above the foot of the paper. The band, the guide and the letterhead don't read `on_hold`. | Recovery is broken for a paused job. A first hire opening it sees live standing items and acts on a job the studio has stopped. |
| R1-23 | S3 | H | `components/document/care-band.tsx:322-346`; `current-state.md` contradiction 12 | The Care guide directs a non-owner toward "Close the book". The band then shows that non-owner text only, with no control and no explanation of why. | A suggested act the reader isn't allowed to take is worse than no suggestion. V9 asks for a named reason. |
| R1-24 | S3 | H | `walk/s1-step1-desk-landing.jpg` | The Desk's prose lists three lines and then "and 7 more below". New leads below the cut can't be seen from the opening read. | The sentence reads as the whole list. A first hire won't know to expand it (WALK scenario 1). |
| R1-25 | S3 | H | `walk/s1-step1-desk-landing.jpg`, `walk/s1-step3-cmdk-open.jpg` | Brief documents are titled by project type, so several cards read "Full Room" and ⌘K shows "In brief · 5 — FULL ROOM · FULL ROOM · +3 MORE". | The titles say nothing about which lead is which, so similar jobs can't be told apart by name. |
| R1-26 | S2 | H | `walk/s1-step3-cmdk-open.jpg` (behind the modal: ACCEPT · BEGIN / NURTURE / PASS far below the band); `document-guide.ts:614` (`needVerb('new_lead')` has no `focusId`); `components/document/triage-bar.tsx:220-248` | The band says "RESPOND TO THE INQUIRY" and lands generically. The actual choice is a three-way triage far down the brief, and the guide names none of the three verbs. | The first decision on a job is split across two places with different words, and "Nurture" and "Pass" carry no consequence sentence. |
| R1-27 | S3 | H | `walk/discovery-1440.jpg`; `lib/document/document-guide-inputs.ts:22-28` against `components/document/discovery/discovery-section.tsx:331-364` | Five calls to action of equal weight sit above the fold, plus "+4 MORE". The guide says "Add project type and named rooms" while the facet is "Scope & rooms". | Everything is available and nothing is ranked. The guide's words don't match the checklist it points at. |
| R1-28 | S3 | H | `walk/direction-1440.jpg` | One screen shows OPEN THE CONTRACT ROOM, CONTINUE DRAFTING, "open the Contract Room to write it" and the inked OPEN THE RECORD. "$0 proposed" is the first figure on the page. | There are four words for one door, the heaviest mark belongs to the Record, and the first fact read is a zero. |
| R1-29 | S3 | H | `walk/proposal-1440.jpg`; `lens-band.tsx:267-271` | "5 unspecified" prints in the band in terracotta during normal drafting. | Terracotta means "exception" in the band's own grammar. Here it means "in progress", so the colour no longer means one thing. |
| R1-30 | S3 | H | `walk/s1-step4-keys-sheet.jpg`; `prior-art-delta.md` F10; `components/document/studio-drawer.tsx` (no `?` hint) | The `g` chords and the bare `?` key are printed nowhere on the chrome. | Seven room jumps exist only for people who already know them. |
| R1-31 | S3 | M | `studio-drawer.tsx:108-116` | The breadcrumb reads "PATINA / DOCUMENT", with no job name and no stage. | The one piece of persistent chrome that could say where you are says only what kind of page it is. |
| R1-32 | S3 | M | `walk/s2-step2-schedule-area.jpg` | Pressing "Pieces" in the rail landed on the Schedule's "Start blank" prompt above Pieces. | The press passed the target, or the target moved as regions mounted. L-10 promises a landing within 4px, so this is either capture timing or a real gap. Confidence M. |
| R1-33 | S3 | H | `current-state.md` §3 (Buying has no route and no registry entry) | "Buying" names readings inside the Orders ledger's line unfolds. There is no Buying page. | The studio just shipped a feature called buying, so designers will look for a place with that name and won't find one. |
| R1-34 | S3 | M | `current-state.md` §3: the leave link in `components/document/room-shell.tsx:124-148` defaults to `/desk`; the global Boards page returns "← Desk" (`studio-boards-view.tsx:142-147`) | Outbound links are labelled by destination. Return links are labelled generically or go to the Desk instead of the job. | Moving between rooms works in the outbound direction. Coming back from the Contract Room or the global Boards can leave the designer one step further from the job than she expects. |
| R1-35 | S4 | M | `walk/care-1440.jpg` | The heading "Care" appears twice, once with ONGOING and "Project completed." and once with a Spec book door. | It reads as a glitch on the one stage meant to confirm that the job is closed. |
| R1-36 | S4 | L | `walk/project-1440.jpg`, `walk/install-1440.jpg` (the band sentence is faint while its act is in full ink) | In two of seven 1440 captures, the band's sentence was still fading in after the rest of the paper had printed. | It may be capture timing during the Arrival. If it isn't, the one sentence the paper keeps is the last thing to appear. |
| R1-37 | S3 | M | `walk/project-1440.jpg` (timekeeping banner plus the margin note "One client, one paper…"); `components/document/margin-note.tsx` ("Appears once · Recedes on use"); `lib/teaching/` (Workshop Notes render nothing while unpublished) | The only teaching on the paper is a one-time note. Dismissing it removes it for good, and the Workshop Notes slots are empty. | A first hire who dismisses it on day one has no on-paper way back, only ⌘K → Help…, which is itself hidden behind a key. |
| R1-38 | S3 | H | `components/document/help/desk-walkthrough.tsx:131-229`; R129 | Five of the six tour steps describe nouns: Desk, document, rooms, drawer, Find. | The tour explains what things are called, not how to run a job. |
| R1-39 | S2 | M | `components/document/overlays/send-sheet.tsx:1059`; `current-state.md` (Proposal: "no single surfaced reason") | "Send to {family}" can be disabled for any of five conditions, and no single reason is shown. | A blocked terminal act with no named reason breaks V9. The designer can't tell what to fix. |
| R1-40 | S3 | M | `components/document/mobile/mobile-bar.tsx:145`; `walk/project-390.jpg` against `walk/project-1440.jpg` | At 1440, vendor payments due sit in the margin, visible without a press. At 390 they are behind More → "Margin · N". | Money that is due is one glance away on the desk and two presses away on the phone. |
| R1-41 | S3 | M | `walk/s4-step2-install-section.jpg`; `current-state.md` contradiction 11 | "OPEN THE SCHEDULE" on Install scrolls to the Install region, not to a schedule. "Hold the window" points at the movement anchor, while the real ceremony lives in the schedule spine. | The label promises one place and the press goes to another. |
| R1-42 | S4 | M | Desk card "OPEN THE JOB" (`walk/s1-step1-desk-landing.jpg`); breadcrumb "DOCUMENT"; band `aria-label="The job"` (`lens-band.tsx:210`); ladder `aria-label="This paper"` (`components/document/spine/lens-ladder.tsx:310`) | One object has three names: job, Document and paper. | This is minor, but it's the same pattern as R1-03 at a smaller scale. |

---

## 4. Scenario scorecard

| # | Scenario | Steps needed today | Where it breaks | Persona most hurt |
|---|---|---|---|---|
| 1 | **A new inquiry arrives** | 4–6: Desk, then possibly "and 7 more below", then open the brief, then the band's RESPOND TO THE INQUIRY (lands generically), then scroll to the TriageBar, then choose ACCEPT · BEGIN, NURTURE or PASS. | **Step 2 and step 4.** A lead below the Desk's cut can't be seen (R1-24, R1-25). The band's verb isn't the triage's verb, and the real three-way choice has no consequence sentence (R1-26). | **First hire.** Leah knows that Nurture and Pass are the choice. A first hire takes "Respond" to mean "write an email" and may never reach the triage. |
| 2 | **The client asks for a change after signing** | 6+ when known: open the doc, scroll to the foot, unfold *The accounts · this project*, press "Amendment". Or Pieces, then the line, then the unfold, then the change order. If not known, it fails: the band, ⌘K and the section heads offer nothing in Project. | **Step 1.** No surface in the Project stage names a change (R1-04). ⌘K's "Add a change" exists only in Install and Care. | **First hire**, who stops and messages Leah. **Leah** is also hurt: her instinct is the piece, and the per-line change order is three levels deep. |
| 3 | **"Where is the PO for the sofa?"** | 4–5: ⌘K (no match), then rail Pieces, then find the line, then unfold it, then scroll to the Order cell. What's blocking it means reading the buying cells inside the unfold. The band shows only the job's worst item, which may be a different piece. | **Step 1.** ⌘K doesn't search the open paper (R1-05). | **Leah**: the failed search reads to her as the product failing. A first hire who doesn't know the piece's name has no browse path suggested. |
| 4 | **It's install week** | 3+ with no clear answer: open the doc, see a setup chore in terracotta (R1-07), press OPEN THE SCHEDULE, which scrolls to Install, then infer lateness from IN PRODUCTION labels, then HOLD A WINDOW or PUNCH. "Late" and "arriving" never appear in words with dates. | **Step 1.** The Install guide, "Check what's arriving", is displaced by "Name the phases". Counts disagree (R1-21). | **First hire**, who does the chore first. Leah dismisses it but still has to work out lateness herself. |
| 5 | **A new hire opens someone else's job cold** | 0 presses to see two terracotta needs. The stage name and which of the two to do first can't be found on first view. | **Step 0.** The stage isn't printed (R1-02, R1-03). Priority can't be read (R1-08). A held job would look live (R1-22). | **First hire.** This scenario exists for her, and it fails on every one of its three questions: stage, what's waiting on her, and what to do next. |

---

## 5. Opportunities

Each one names its surface and studio moment, what changes on screen, and the findings it resolves. Sketches are in words and ASCII; there is no code.

### O1. The band gets a second line: "Next" and "Standing" stop sharing one slot
**Surface:** The Document, the lens band at every width. **Moment:** every open of a live job.
The band keeps its declared height and gives line 2 two fixed positions. The left position always holds the stage's next act. The right holds the worst standing item, with `+N` beside it.

```
 PROJECT · 5 OF 7 · CHEN RESIDENCE                      INSTALL 14 NOV · $16,330
 Next ─ Open the FF&E schedule [OPEN THE SCHEDULE]   │  Balance due WS-188 · RECORD  +2
```

At 390 the two halves stack inside the same 56px box and each keeps its object ("RECORD PAYMENT", not "RECORD"). When nothing is standing, the right half is silent. When nothing is next, the left half says who holds the pen ("With the Ashfords: budget and 3 more").
**Resolves:** R1-01, R1-07 (the Install guide survives a setup chore), R1-12, R1-26, R1-29.

### O2. The stage is written in words at the top of the page
**Surface:** the letterhead. **Moment:** a cold open (scenario 5) and every arrival.
Above the title, in the eyebrow position that today holds only the strata mark, print the stage word and the pen:

```
 PROJECT · 5 of 7 · in Leah's pen · held since 2 Oct
 Chen Residence
```

The vocabulary is the seven document stages and nothing else. ⌘K, the rail and the Desk chip read the same table. "Held since…" prints only when the job is held.
**Resolves:** R1-02, R1-03, R1-22, R1-31, R1-35, R1-42.

### O3. One act, one name, one landing
**Surface:** every device that prints a next act: band, Desk folio, ⌘K, guide, mobile dock. **Moment:** pressing any suggested act.
On screen, the guide's label becomes exactly the label of the control it lands on, and the press lands with focus on that control and its own rule turned clay for a moment (L-8's pen colour, reused). "Respond to the inquiry" becomes "Accept, nurture or pass" and lands on the TriageBar. "Release the next room" becomes "Release for authorization". "Hold the window" lands on the real ceremony. The 13 pairs in `current-state.md` §2 collapse to one word each.
**Resolves:** R1-10, R1-26, R1-27, R1-28, R1-41, R1-09 (attach and assign become one verb).

### O4. Weight by role, not by region
**Surface:** the Scored Ink tiers across the Document. **Moment:** scanning the page for what to do.
Three registers you can tell apart at reading distance:
- **Next.** Only the act in O1's "Next" slot, and its twin at the head of the active stage's region, are `primary`, with a leading `→`.
- **Available.** Everything else is `secondary` or `tertiary`. Region leaders drop the flooded `inked` pool unless the region is the active stage's own.
- **Blocked.** `aria-disabled`, with the reason printed in a full sentence directly under the act, not in a `title`.

`terminal` stays the one filled act, for money or signature only. On Chen, "SPEC THE 3 UNSPECIFIED" becomes a plain scored word, and OPEN THE SCHEDULE becomes the heaviest mark that isn't money.
**Resolves:** R1-06, R1-23, R1-28, R1-39, and the act-weight half of R1-29.

### O5. ⌘K answers questions about the open job
**Surface:** ⌘K, the one register available at every width. **Moment:** "where is X", "how do I Y".
With a document open, a typed query first searches that paper's pieces, makers, PO numbers and rooms, then its verbs with synonyms. "sofa", "sectional" and "WS-188" land on the unfolded line with its Order cell open. "change", "amend" and "client wants" offer "Record a change" in Project, Install and Care alike. "late" and "arriving" open the install read from O6.

```
 sectional▌
 ON THIS PAPER
   Custom Walnut Sectional — 3 pc · Woodward & Sons · RECEIVED · PO WS-188   ↵
 DO
   Record a change on this line
```

**Resolves:** R1-05, R1-04 (with O7), R1-33 ("buying" finds the Orders lines), R1-30 (each verb row prints its `g` chord).

### O6. Install week gets an install guide, without becoming a mode
**Surface:** the band's "Next" slot and the Install region head, Install stage only. **Moment:** scenario 4.
R124's "install stays a label" can hold. The guide's job changes: in Install, "Next" is computed from the pieces and their dates.

```
 INSTALL · 6 OF 7 · Cedar Lane Study
 Next ─ 1 late · Reading chair, due 3 Oct (Fixture Metalworks)  [CHASE THE MAKER]
 Install       arriving this week 1 · late 1 · installed 1 of 2       [HOLD THE WINDOW]
```

Setup chores such as "Name the phases" move into the inputs, painted clay, behind `+N`. They never take the terracotta slot. The two counts in one region (R1-21) become one.
**Resolves:** R1-07, R1-18, R1-21, R1-41.

### O7. Folded regions print their verbs on the seam
**Surface:** every folded region seam, and the accounts band first. **Moment:** looking for an act that exists but is folded away.
A fold hides the body, not the verbs. The seam line prints its acts in tertiary ink:

```
 The accounts · this project   $14,500 budget · $9,200 committed   STUDIO EYES ONLY   unfold ↓
   Record a change · Hours · Export
```

"Amendment" is renamed to the studio's word ("Record a change") at every stage. In the Project stage, the head of the Pieces region also carries "Record a change" as an available act.
**Resolves:** R1-04, R1-19 (the "Schedule dates" seam says "Edit dates", not a second "Schedule"), R1-20.

### O8. The phone carries the band's act
**Surface:** the mobile dock at 390. **Moment:** on site, between rooms.
The dock's centre is the "Next" act from O1. "Message {family}" moves into More, with the client's name, and is withheld when no client is linked. The margin count prints in the dock's left cell when it is above zero ("Margin · 2"), so money that is due is one glance away, as on the desk.
**Resolves:** R1-11, R1-40, R1-12.

---

## 6. Canon tensions

Each entry is offered as a **named founder question**.

1. **R127 W3-R1, "rank by deadline distance, never by kind".**
   - **Cost:** a setup chore, a missing client link and a damage claim compete on one scale. The paper can't say "this blocks money or signature" (R1-07, R1-08).
   - **Narrowest relaxation:** keep deadline order *within* a class, but add one class split ahead of it: *blocks a money or signature act* > *everything else*. Setup needs (`schedule_unconfigured`) move to inputs. That is one boolean per need kind, not a ranking scheme.

2. **R127 OD-11 / DL-05, "line 2 is the one printing of the guide act at every width".**
   - **Cost:** whenever an exception stands, the suggested next act is printed nowhere (R1-01), and the phone dock fell back to Message (R1-11).
   - **Narrowest relaxation:** allow the guide act two printings, the band's "Next" position (O1) and the active stage region's head. Let the mobile dock read the same act. One source, at most two printings.

3. **R127 L-6 / D-B38, "the rail head yields at s0" (with W7-R1 replacing the arc with a single wordless mark).**
   - **Cost:** at the top of every paper the stage isn't written in words anywhere (R1-02).
   - **Narrowest relaxation:** the letterhead eyebrow prints the stage word and its ordinal in 11px mono (O2). The rail and band may keep yielding, because the fact is then printed once, in words, in frame. This keeps Kody's single mark; it only adds its caption.

4. **V9 §3 as implemented through the region-head rule "entry 0 is always inked" (`region-head.tsx:8-12`).**
   - **Cost:** flooded charcoal appears once per region, regardless of consequence, and outweighs the suggested act (R1-06). V9 itself is sound; the region rule works against it.
   - **Narrowest relaxation:** `inked` is allowed only on the active stage's region. Every other region's leader is `primary`. This needs no change to V9.

5. **V9 §5, "absence is silence".**
   - **Cost:** I mostly agree with it, and the page breaks it in the wrong places (R1-16, "No active phase handoffs…"). Where it is honored, it hides useful information. A folded band with nothing to say also hides its verbs (R1-04). A non-owner sees no control and no reason (R1-23). A held job is silent (R1-22).
   - **Narrowest relaxation:** absence of *state* is silence, but absence of an *act the reader would expect* is one named sentence: "Only the owner can close the book", "Held since 2 Oct — Resume at the foot". Folded seams print their verbs (O7).

6. **R124 item 3, "install stays a label on project mode, not a mode".**
   - **Cost:** install week has no view of what's late or arriving (scenario 4).
   - **Narrowest relaxation:** none needed to the ruling. Only the Install guide's computation changes (O6). I'm naming it because the cost is real and was accepted as open-by-choice.

7. **R124 item 7, I114 left unruled (the stage vocabulary).**
   - **Cost:** five vocabularies for one stage (R1-03).
   - **Narrowest relaxation:** rule I114 now, for display only. The seven document stage words are the only words printed for stage on any studio surface. The 11-stage workflow vocabulary stays in data and gates and never prints.

8. **VISION §6, "no badges", against the Desk's filled stage chips.**
   - **Cost:** the Desk's PROJECT / BRIEF / INSTALL chips are filled pills, which arguably are badges, yet they are the only place the stage is written clearly. The canon forbids the one device that works.
   - **Narrowest relaxation:** either rule that a stage word in a pill on the Desk is permitted wayfinding, or move it to ink, not a pill, on both the Desk and the letterhead (O2). I prefer ink on both. Either way, the founders should decide it, not leave it to drift.

9. **NG1, "one document at a time, no persistent global nav".**
   - **I don't think NG1 causes the lostness.** The lostness is inside one document. Moving between jobs works through the Desk and ⌘K. What hurts is that ⌘K's label disappears below 1440 and its scope stops at document titles (R1-05, R1-13). Keep NG1, and print "Find anything ⌘K" at every width.

10. **VISION §4, "you won't notice Patina", as applied by R126 (Ink on Paper).**
    - **Cost:** "quiet" was applied to the acts as well as the chrome, so primary and tertiary look the same (R1-06 and the R126 row in §2).
    - **Narrowest relaxation:** quiet chrome and loud *next*. Exactly one act per screen may be visibly heavier than the rest (O4). That doesn't optimize for engagement. It tells the designer which act to take so she can get on with her day.
