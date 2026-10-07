# R2 · Product and vision review — running a job in The Document

**Seat:** R2, product strategist and design director (studios). **Model:** Fable 5.1. **Date:** 7 October 2026.
**Read:** BRIEF.md · VISION.md · VISION-DECISIONS.md (V7–V14) · briefing/current-state.md · briefing/prior-art-delta.md · walk/WALK.md and the walk images · DECISIONS.md R124, R125, R127 · code under `apps/designer-portal/src/` where cited. Paths below are relative to that root unless they start with `walk/` or `docs/`.

---

## 1. Verdict

Designers get lost because the Document says *one thing at a time*, and the one thing is often the wrong thing. The band's single sentence suits Leah, who holds the job in her head and needs only the exception. The first hire holds nothing. She needs the stage, whose move it is, and the whole list once — and the paper withholds all three on purpose: the stage word yields at the top, nothing says whose pen it is, and the rest sits behind `+8 MORE`.

Around that one voice, others keep talking. The letterhead shouts "No client linked" over the band. Empty regions print "Nothing yet." Eyebrows print the machine's words. The Desk teaches one verb; the paper prints another. "Find anything" cannot find the sofa on the open page.

August made the Document quieter. It did not make it legible to someone who was not there yesterday.

---

## 2. Why the August work didn't land

| Ruling | What it set out to do | Did it help? | Why / why not |
|---|---|---|---|
| **R124** (ten questions, 2026-08-25) | Settle the wayfinding review: Direction A "Everything Prints" first, then B "The Shop Ticket"; log T2/T4 as open-by-choice; schedule four defects | **Partly.** A's planks landed (stage sentences, ⌘K stage group, money ladder). The *rulings* that hurt most are still in force: item 3 ("install stays a label on project mode, not a mode") is why install week's loudest line is a setup chore (`walk/install-1440.jpg`). F52 and F10, both named in the review, are unchanged in code (`letterhead-instruments.tsx:296`; no printed `?`). | R124 solved what the nine reviewers *saw* — clutter and contradiction — and explicitly chose not to solve what they *asked for* (a phase-wide answer, a real install mode). The answer to "what's late this week" was parked as T4 and never picked up. |
| **R125** (build rulings) | One program, no flags, two deploys, full scope | **Yes, as process.** The no-flag law meant the work actually shipped and is what designers use today. | Process rulings cannot land a design; they only make sure a design lands. It did. Then R127 deleted half of it four days later. |
| **R126** (The Life Review) | Ink on Paper register, three grafts, shadow budget | **Yes, for calm. No, for wayfinding.** The paper looks like paper. Calm is not orientation. | R126 fixed the *register*. Nothing in it addresses stage, pen, or the list. It also set the tone — terracotta for every standing item — that now makes "5 unspecified" look like "overdue 148 days" (`walk/proposal-1440.jpg`). |
| **R127** (The Smart Lens) | Replace the job ticket with one 56px band printing "the worst standing thing" + `+N MORE`; the ladder; one-direction density; L-6 the rail head yields at s0 | **Helped Leah. Hurt the hire.** The band is the best thing on the page when it is right (Brief, Care). But three of R127's own mechanics are the lostness: **L-6** hides the stage word exactly where a cold reader lands (`doc-spine.tsx:220-231`); **L-11** puts every other open thing behind one mono door (`+8 MORE`, `walk/direction-1440.jpg`); **W3-R1** ranks by deadline distance, so an undated setup chore can be the only thing standing during install week. | The ticket (Direction B) was eight rows a new person could read in one look. R127 ratified Kody's ask for "uncluttered and peaceful" and traded the eight rows for one sentence. That trade is correct for the author of the job and wrong for the person inheriting it. Nobody in the lens program sat in the hire's seat — the brief's persona was a designer "moving through the document," not one opening it cold. |

**The through-line.** Each program was briefed by the complaint of the moment — clutter, contradiction, calm — and each answered that complaint. None was briefed on the studio moment in VISION §2: the first hands arriving while the workload doubles. The Document was tuned for its author. The person who is lost is not its author.

---

## 3. Findings

Severity: S1 blocks the job · S2 costs real time or causes errors · S3 friction · S4 polish. Confidence: high / medium / low.

| id | sev | conf | evidence | observation | interpretation |
|---|---|---|---|---|---|
| R2-01 | S1 | high | `doc-spine.tsx:119-131,220-231` (L-6); `walk/s5-step1-olsen-opened.jpg` | At the top of any Document the rail's stage phrase is `opacity-0` while the letterhead is in frame; the only stage cue is the unlabeled three-bar arc. The rail's status word is `ACTIVE`, `INSTALLATION`, `ONGOING` (`section-derivation.ts:120-130`), not a stage name. | The one word a cold reader needs is withheld at the exact scroll position she arrives at. R127 says the arc "is printing the same fact 60px away"; the arc prints no words. A new hire cannot tell Project from Install from Care without scrolling or going back to the Desk chip. |
| R2-02 | S1 | high | `command-bar.tsx:919-994`; `walk/s3-step1-cmdk-no-match.jpg`; `desk-walkthrough.tsx:176-178` | A typed ⌘K query filters boards, documents, registry surfaces, people and utility rows. FF&E lines, POs and invoices are not in the list. "sectional" from inside Chen Residence returns "No match · Try the Help Center." The tour promises "⌘K reaches any folder, person, or book by name." | The drawer says "Find anything." It finds some things. For "where is the PO for the sofa" the product's fastest tool fails on the first move and recovers to the wrong door (Help, not Pieces). |
| R2-03 | S1 | medium | `command-bar.tsx:706-715` ("Add a change · this project · amendment workflow"); `account-band.tsx:208-223` (`AmendmentSheet`); `line-unfold/order-cell.tsx:119` + `change-order.tsx:31-35`; `walk/s2-step1-chen-opened.jpg`, `walk/s2-step2-schedule-area.jpg` | "The client asked for a change after signing" has two homes, neither on the paper where a designer looks: a Money-region **amendment** (reached from ⌘K or the Accounts band) and a per-line, maker-facing **change order** inside a piece's Order cell (Cancel / Credit / Claim / Change the maker / Remedy). Nothing above the fold, in the Pieces head, or in the Schedule head names either. | The studio's word is "change." The product's words are "amendment" (money) and "change order" (maker). V14 R8 says "once signed, any change is a change order" — the hire reads that rule and looks for the thing the rule names. She finds a form about the maker owing money back. |
| R2-04 | S2 | high | `document-guide.ts:595-635` vs `desk-derivation.ts:160-189`; code comment at `document-guide.ts:599-602` | Two authoritative verb tables for the same 27 need kinds. Six differ: "File the claim" / "Review the claim"; "Chase the approval" / "Review decisions"; "Send the purchase order" / "Review the purchase order"; "Open the flagged lines" / "Review flagged lines"; "Open the proposed date" / "Review the proposed date"; "Send the pulse" / "Review and send." The code says this is deliberate. | The Desk card teaches one verb; the paper prints another. The hire learns the Desk first. This is the 2026-08-13 T1 finding ("orienting devices contradict each other"), unclosed by any ruling. |
| R2-05 | S2 | high | `walk/direction-1440.jpg`; `proposal-instruments.tsx:373-397`; `document-guide.ts:169,226` | One card reads "DRAFTING THE PROPOSAL — Not started yet — open the Contract Room to write it" with the act "CONTINUE DRAFTING →". The band above offers "OPEN THE CONTRACT ROOM" for the same destination. The guide's rest copy calls it "Send the agreement." | "Not started" and "Continue" in one box. Four labels for one door on one screen. Leah shrugs; the hire wonders which is the real one. |
| R2-06 | S2 | high | `lens-band-derivation.ts:758-764`; `walk/direction-1440.jpg` (`+8 MORE`); R127 L-11, W3-R1 | Line 2 prints one item; every other standing exception and open input goes behind `+N MORE`. On a Direction paper reading "$0 proposed" and "Nothing yet," the door says there are eight more things. | One-at-a-time is the right rhythm for Leah mid-job. For someone opening cold it hides the list she came for behind a mono count. The standing sheet is good; it is one press further than a first-time reader will go. |
| R2-07 | S2 | high | `household-chip.tsx:35,55-61`; `walk/project-1440.jpg`, `walk/care-1440.jpg`, `walk/s5-step1-olsen-opened.jpg` | "No client linked — attach one" prints in the letterhead's 1.15rem italic clay ink whenever no household is attached — on an overdue live job, a job the database marks completed, and a cold-opened job alike. It sits *above* the lens band. | The band is meant to be the one voice naming the worst thing. The letterhead speaks over it, at the same weight, regardless of consequence. On Lindqvist (completed) it is noise; on Olsen it competes with an open damage claim and the reader cannot rank them. |
| R2-08 | S2 | high | `letterhead-instruments.tsx:296` (`canSendNote = Boolean(projectId \|\| clientProfileId)`); `walk/project-390.jpg` | On the phone the bar's one filled act is "MESSAGE THE CLIENT" on a document whose letterhead says no client is linked. | F52 from August, byte-unchanged. The strongest act on mobile points at nobody. |
| R2-09 | S2 | high | `desk-derivation.ts:1504-1522` (`schedule_unconfigured`); `walk/install-1440.jpg`, `walk/s4-step2-install-section.jpg` | Install week's band: "Name the phases for this project · OPEN THE SCHEDULE," under a `NEEDS SETUP · 1` chip. Below the fold: Reading chair `IN PRODUCTION`, $7,800, install `START 11 June`; today is 7 October. No word says late. | W3-R1 ranks by deadline distance — correct. But "a piece is behind the install start" is not a need kind, so lateness has no row to rank, and an undated chore wins by default. The ranking is right; the inputs are missing the one fact install week is about. |
| R2-10 | S2 | high | `walk/s4-step2-install-section.jpg`; `walk/care-1440.jpg`; `section-derivation.ts:129-130` | Install head: "0 OF 2 INSTALLED." Manifest two inches lower: "1 OF 1 PLACED — Built-in shelving · installed." Care rail: `ONGOING` (unconditional for the care section) while the body says "Project completed." | Two counts of the same thing on one screen; the rail and the body disagreeing on whether the job is over. A reader who notices stops trusting the counts. |
| R2-11 | S2 | medium | `section-derivation.ts:46` / `desk-schedule.ts:107` (`'Band'` is a schedule-position literal) printed as an eyebrow in `walk/project-1440.jpg`, `walk/s4-step2-install-section.jpg`; `project-approval-document.tsx:691,989`; `walk/discovery-1440.jpg` ("THE ESSENTIALS — STRUCTURED · THEY OPEN & SEED THE AGREEMENT"); `walk/proposal-1440.jpg` ("CORE · STAGE 03", `workflow-gate.ts:83-86`; "V1 · AWAITING SIGNATURE") | The paper prints its own internals as running heads. | The 2026-08-13 T6 finding ("the document leaks its own machinery"), unclosed. Every one of these is a word the studio would never say. The hire assumes they are terms she should know and feels behind. |
| R2-12 | S2 | medium | `project-approval-document.tsx:708-712`; `walk/s5-step1-olsen-opened.jpg` | Every Project paper with no approvals prints: "Bind each request to one issued plan, client-ready specification, or published budget checkpoint. Discussion stays in the project thread; only the recorded outcome settles an approval." | A paragraph of system vocabulary where an act should be. It teaches the model, not the move. |
| R2-13 | S2 | medium | `ffe-section.tsx:1494-1517` (spec entry is `variant: 'tertiary'`; index 0 of the ledger is "the elected leader"); `walk/project-1440.jpg` ("SPEC THE 3 UNSPECIFIED" filled charcoal); `walk/install-1440.jpg` ("ASSIGN PROJECT CLIENT" filled); `walk/direction-1440.jpg` ("OPEN THE RECORD" filled) | Filled charcoal acts are spent on housekeeping. V9 P3: the filled terminal act is "spent only where money moves or a paper is signed." | When the strongest tier is spent on "open the record," it stops meaning anything, and the hire reads "SPEC THE 3 UNSPECIFIED" as the job's most important act. Meanwhile "BILL 2 UNINVOICED" is a tertiary link in a region head (R2-32). |
| R2-14 | S2 | medium | `work-block.tsx:251-259`; `walk/s4-step2-install-section.jpg` | "Plan the install work — List the concrete work here so the next action and due date stay visible… START WITH · TASK · OPTIONAL DUE DATE · OPTIONAL ESTIMATE · ADD THE FIRST TASK." | A task manager, empty, printed above the install manifest. VISION §5: "no task manager." On install week it is the first body copy after the head. |
| R2-15 | S3 | high | `walk/project-1440.jpg`, `walk/install-1440.jpg`: "Client approvals · Nothing yet," "Schedule · Nothing yet," "Schedule dates · UNFOLD," "No active phase handoffs need attention." | Regions with nothing to say print a head and a sentence saying so, stacked, before any real content. | V9 P5: "a region with nothing to say renders nothing." The 2026-08-13 T5 finding ("empty modules erode the document"). The hire scrolls past four nothings to reach the Pieces. |
| R2-16 | S3 | high | `walk/s1-step1-desk-landing.jpg` | The Desk's line reads "Two things are overdue — Chen and Aspen." Three cards show; "and 7 more below." Three new leads with respond-by dates are among the 7. | For Leah the prose is a complete picture because she knows the rest. For the hire it reads as the whole worklist, and a new inquiry due in two days is below the fold with no "respond" verb above it. |
| R2-17 | S3 | high | `walk/brief-1440.jpg`; `document-guide.ts:614` (no `focusId`) | The Brief paper: title "Full Room," "ADD A SUBJECT LINE," "The brief · NOTHING YET," "The record · Nothing yet." The one act "RESPOND TO THE INQUIRY" lands generically. The client's name appears only in the rail. | The inquiry itself — what Lily asked for — is not on the paper. The act says respond; the paper does not say to what. |
| R2-18 | S3 | high | `walk/discovery-1440.jpg`; `document-guide-inputs.ts:22-28` vs `discovery-section.tsx:331-364` | Five link-acts of equal weight above the fold plus "+4 MORE." The band's "ADD PROJECT TYPE AND NAMED ROOMS" points at a facet the page calls "Scope & rooms." | Five calls, none weighted, two vocabularies. The one good thing here — "Yours to add: scope. Waiting on the Ashfords: budget and 3 more." — is also the only ownership sentence anywhere in the product (see R2-31). |
| R2-19 | S3 | high | `walk/s1-step4-keys-sheet.jpg`; `registry-shortcuts.tsx`; `studio-drawer.tsx:452` | `?` and the `g`-chords are printed nowhere in the chrome. Only "Find anything ⌘K" is printed. | F10 from August, unchanged. A reference sheet nobody is told exists is not teaching. |
| R2-20 | S3 | medium | `walk/project-1440.jpg`, `walk/install-1440.jpg` (margin note "One client, one paper. The rail on the left says… MORE · APPEARS ONCE · RECEDES ON USE") | The one-time teaching note truncates its own sentence to an ellipsis and a MORE link, and captions itself. | A note that teaches by making you click is a note about itself. The caption describes the mechanism, not the lesson. |
| R2-21 | S3 | medium | `walk/proposal-1440.jpg` ("for Client User," "NUDGE CLIENT USER," "PREVIEW AS CLIENT USER") | A placeholder name propagates into three acts. | Seed data — but it shows no guard on a name a designer would never write. A real studio will have a "Client (TBD)" one day. |
| R2-22 | S3 | medium | `lens-band.tsx:267-271` (`standing ? terracotta-ink : text-primary`); `walk/proposal-1440.jpg` ("5 unspecified"); `walk/project-1440.jpg` ("Balance … due 12 May") | Every standing item prints in terracotta regardless of kind. Unpriced lines mid-drafting wear the same ink as an overdue vendor balance. | V9 P3: weight follows consequence. Here it follows category. The reader learns to ignore terracotta, which is the one colour that should never be ignored. |
| R2-23 | S3 | medium | `walk/proposal-1440.jpg`; `lens-band-derivation.ts:738-743,766-769` | The Proposal band's line 2 reads "5 unspecified · +1 MORE" and prints no act at the long measure. "NUDGE CLIENT USER" sits in the section below. | A noun phrase with no verb wins the one line that is supposed to name the act. |
| R2-24 | S3 | medium | `desk-walkthrough.tsx:131-190` (six steps: Desk, folder, rooms, drawer, ⌘K, lead); teammate copy `:226` ("Start where you're asked; the rest keeps.") | Five steps describe nouns; only step 6 acts (R129). The teammate variant tells the hire to wait to be told. | Teaching nouns up front, as the onboarding synthesis found. The hire's tour tells her the one thing that produces the lostness — wait for Leah — as advice. |
| R2-25 | S3 | medium | current-state §4; `teaching-anchor-note.tsx:55`, `teaching-act-note.tsx:25` (`return null`); Sanity drafts unpublished (unverified live) | Workshop Notes render nothing; the ⌘K Help panel resolves to Sanity-keyed articles that are mostly stubs. | The teaching layer exists in code and is silent in production. Not a design finding — a publishing one — but the designer experiences it as "there is no help." |
| R2-26 | S3 | medium | `walk/direction-1440.jpg` ("Draft fixture for a no-login household: proposals.designer_client_id links…") | A free-text field renders verbatim as body copy, unlabelled. | Seed, almost certainly — but the paper has no register for "a note someone typed" versus "the Document speaking." |
| R2-27 | S3 | low | `walk/care-1440.jpg` (rail "READING…", skeleton bars in body) | The Care paper's first frame is placeholders across rail and body. | Likely the arrival hold (V12 §4h) caught mid-wait, or a slow readiness mark on a closed job. Either way the first frame of a closed job is "READING…". Low confidence on cause. |
| R2-28 | S4 | medium | `walk/s4-step2-install-section.jpg` ("IN PRODUCTION" bordered pill) | The only status word on a piece row is a 1px-bordered pill. | V9/V11 allow a bordered text pill as a table's state column (HT-40). Fine. But it is the *only* place the row says anything, and it says a maker state, not a date. |
| R2-29 | S4 | low | WALK.md worst-moment 8 | Identity badge flashed "DE designer@patin…" once before "LH Leah Hartwell." | A race on cold cache. Not reproduced. |
| R2-30 | S4 | medium | `walk/proposal-1440.jpg` rail "Scope & engagement · CORE · STAGE 03"; DECISIONS.md:10176 item (5) | R127's own prod walk accepted this line as correct. | Canon-approved leakage of the eleven-stage vocabulary. Named here so it can be ruled, not assumed. |
| R2-31 | S2 | medium | `walk/s1-step1-desk-landing.jpg` ("YOUR PEN" on cards); `walk/discovery-1440.jpg` (the only ownership sentence); every other stage image | The Desk card says whose pen. The paper never does. Six of seven stages print no sentence of the form "yours: X · waiting on Y." | Delegation is the studio moment (VISION §2). When Leah hands Olsen to the hire, the paper does not say "this is yours now," "this is waiting on the client," or "Leah already agreed X." Discovery's sentence is the model; it was never generalised. |
| R2-32 | S2 | medium | `walk/s4-step2-install-section.jpg` ("BILL 2 UNINVOICED" tertiary, in a head); `ffe-section.tsx:1408-1419` ("No lines are currently eligible for release"); `send-sheet.tsx:1059` (`canSend`, no single surfaced reason) | The acts that move money — bill, release for authorization, send the agreement — are the quietest things on the page, and their refusals do not say why. | The upside stream (VISION §3) is margin on pieces sold through the job. A hire who cannot find "bill the two uninvoiced pieces" or cannot tell why "Release" is grey is a deposit that waits a week. |

---

## 4. Scenario scorecard

| # | Scenario | Steps needed today | Where it breaks | Persona most hurt |
|---|---|---|---|---|
| 1 | **A new inquiry arrives.** | Desk → read the prose line → expand "7 more" or ⌘K → open the Brief → read the band → "RESPOND TO THE INQUIRY" lands generically → find what was asked (not on the paper). 3–4 moves. | The Desk's prose reads as complete (R2-16); the Brief paper is empty of the inquiry (R2-17). | **The hire.** Leah knows Lily wrote; the hire does not know Lily exists. |
| 2 | **The client asks for a change after signing.** | Open the paper → top (nothing) → Pieces (nothing) → Schedule (a "Start blank" prompt) → unfold a line → Order tab → "change order" (maker-side, wrong one) — or know to press ⌘K and type "change" → "Add a change · amendment workflow" → Money. 5+ moves, or 1 with secret knowledge. | Two homes, two words, none on the paper (R2-03). | **Both.** Leah knows it is per-piece but still meets the maker form first; the hire stops and asks Leah. |
| 3 | **"Where is the PO for the sofa?"** | ⌘K "sectional" → No match (R2-02) → abandon → rail "Pieces" → find the line → unfold → scroll to "The buy / Quote / Order" → PO. 1 failed search + 3 moves. "What is blocking it" is not stated anywhere; the reader infers from a state word. | ⌘K scope; blocker never named in words (R2-02, R2-28). | **The hire.** She does not know the piece's name or room; search was her only tool. |
| 4 | **It's install week.** | Open → band says "Name the phases" (R2-09) → ignore it → scroll past four empty regions (R2-15) and an empty task planner (R2-14) → Pieces → infer lateness from "IN PRODUCTION" vs an 11 June start → manifest (counts disagree, R2-10) → "HOLD A WINDOW" / "PUNCH." 4–5 moves, no word "late" anywhere. | The ranking has no row for lateness; the loudest line is a setup chore. | **The hire** — she takes the setup chore as the task and names phases instead of calling the maker. Leah is annoyed, not lost. |
| 5 | **A new hire opens someone else's job cold.** | Open → no stage word (R2-01) → "No client linked" and "AP-012 has an open damage claim" at equal weight (R2-07) → no sentence saying whose move (R2-31) → "+2 MORE" → guess. | Stage withheld; pen unstated; list behind a door. | **The hire, by design.** Every mechanic that makes this fail was ruled for the author's benefit. |

---

## 5. Opportunities

Each passes VISION §8's test (surface · studio moment · stream · promise), names what changes on screen, and names the findings it resolves. Sketches are words or ASCII. No code.

### O1 · Whose move — the ownership sentence on every stage

**Test.** Surface: the Document. Moment: Leah hands a job to the first hire. Stream: subscription (the Document is what she pays for); indirectly margin (a job that moves sells pieces). Promise: prompts when and where needed, then gets out of the way.

**What changes.** The band's line 1 always prints the stage word (never yields — see C1). Line 2's *guide* form, on every stage, takes Discovery's shape: *yours* · *waiting on them*. The standing exception still outranks it when one exists; when it does, the ownership sentence is the first row of the standing sheet, not dropped.

```
OLSEN LAKE HOUSE · PROJECT · WEEK 9                              $12,700 undrawn
Yours: file the claim on AP-012.  Waiting on the Harpers: nothing.  FILE THE CLAIM  +2 MORE
```

On a handoff (pen changes hands) the sentence names it once: *"Leah put this down Tuesday. Yours now."*

**Resolves.** R2-31, R2-01 (with C1), R2-16 (the Desk prose adopts the same shape: "Yours today: respond to Lily by Sunday. Overdue: Chen, Aspen."), R2-23 (a guide line always carries a verb).

### O2 · The paper says its stage at the top — relax L-6

**Test.** Surface: Document. Moment: anyone arriving by link, notification or ⌘K, which skips the Desk chip. Stream: subscription. Promise: no system to learn — the page says where it is.

**What changes.** The rail head's stage word stays printed at s0; only the count (`4 OF 6`) mutes while the letterhead's arc is in frame. The arc gains the stage word as its label. The rail's status word (`ACTIVE`/`ONGOING`) is replaced by the stage name plus the honest state: *Project · week 9*, *Install · 118 days past start*, *Care · closed 3 June*.

**Resolves.** R2-01, R2-10 (care's rail stops saying ONGOING on a completed job). **Canon:** C1 below.

### O3 · Find anything finds the pieces

**Test.** Surface: Document. Moment: the hire covering a job she did not build. Stream: **margin** — the PO question is the sofa question. Promise: prompts where needed.

**What changes.** With a document in hand, ⌘K indexes the paper's own nouns under one eyebrow: pieces by name and room, POs and invoices by number, the client, the makers. A row reads *"Custom Walnut Sectional — 3 pc · Study · RECEIVED · PO WS-188"* and lands on the unfolded line. The dry-query recovery becomes *"Not on this paper — look in the Pieces"* with that act, and the Help Center row drops to second. The drawer prints `?` beside `⌘K` (two characters).

```
sectional
 IN THIS DOCUMENT
   Custom Walnut Sectional — 3 pc     Living · RECEIVED · WS-188     →
   Woodward & Sons                    maker · 2 pieces              →
 ASK ABOUT "SECTIONAL"                                     ASK & PLACE
```

**Resolves.** R2-02, R2-19 (partly), and the second half of scenario 3 if the row prints the blocking state in words ("awaiting deposit", "unacknowledged 9d").

### O4 · One verb per need, everywhere

**Test.** Surface: Document + Desk. Moment: the hire learns a verb on one surface and looks for it on the other. Stream: subscription. Promise: no system to learn.

**What changes.** One label table. The Desk card, the band, the region head, the ⌘K row and the standing sheet print the same words for the same need. The Direction card loses "Not started yet / Continue drafting"; it reads *"The agreement — not drafted yet · DRAFT THE AGREEMENT"* and after a save *"The agreement — draft, last touched Tuesday · CONTINUE THE DRAFT."* Discovery's band act names the facet by the page's own word (*"Add scope & rooms"*).

**Resolves.** R2-04, R2-05, R2-18, R2-21 (the table refuses placeholder names: a client without a real name prints "the client").

### O5 · "The client changed their mind" — one named act on the paper

**Test.** Surface: Document. Moment: post-signature change, the commonest reason a hire messages Leah. Stream: **margin** — a recorded change is a re-priced piece and often a new PO. Promise: collects information when and where you need it.

**What changes.** A tertiary act *"Record a change"* in the Pieces head and in the Money head. It asks one question first — *"On a piece, or on the agreement?"* — then opens the right sheet (the line's change order, or the amendment). The band's standing sheet gains a row when a change is half-recorded. ⌘K's row drops "amendment workflow" from its subtitle.

```
Pieces · 3 lines                    RECORD A CHANGE   SPEC THE 3 UNSPECIFIED →   FOLD ↑
```

**Resolves.** R2-03, and most of scenario 2.

### O6 · Install week reads as install week

**Test.** Surface: Document. Moment: the hire runs the install while Leah is on site elsewhere. Stream: **margin** — a late piece is a piece not yet paid in full. Promise: prompts when needed.

**What changes.** A need kind *"behind the install start"* (piece not received, install start passed or inside 14 days) so lateness has a row and W3-R1 can rank it where it belongs. The band reads *"Reading chair is 118 days behind the 11 June start · CHASE FIXTURE METALWORKS."* Setup chores (`schedule_unconfigured`) drop below any dated row. The install manifest and the Pieces list become one list with one count. The "Plan the install work" block is deleted from Install (R2-14); the manifest *is* the plan.

**Resolves.** R2-09, R2-10, R2-14, and scenario 4. **Canon:** no relaxation of R124 item 3 needed — install stays a label; only the leader rule changes.

### O7 · Spend the strong tier only where money moves

**Test.** Surface: Document. Moment: any. Stream: **margin** — the acts that bill, release and send are the stream. Promise: act weight follows consequence (V9 P3).

**What changes.** A tier audit with one rule: filled charcoal only for *Record payment, Send the agreement, Release for authorization, Countersign, Bill, Close the book* — each with its consequence sentence and its amount. Everything else is scored ink. "SPEC THE 3 UNSPECIFIED," "ASSIGN PROJECT CLIENT," "OPEN THE RECORD" become tertiary. Terracotta is reserved for consequence (money owed, a window closing, a claim clock); inputs needed print in the primary ink. Every gated money act names its reason in a sentence (*"Release needs a signed agreement — the Harpers have not signed."*).

**Resolves.** R2-13, R2-22, R2-32, R2-28 (the pill may stay; it is no longer the only word).

### O8 · Say it in the studio's words, or say nothing

**Test.** Surface: Document. Moment: the hire reading a page full of words she thinks she should know. Stream: subscription. Promise: you won't notice Patina.

**What changes.** Three sweeps. (a) *Eyebrows:* delete `BAND` (print the schedule position only when it is a week), `EXACT ARTIFACT · NAMED AUTHORITY`, `THE ESSENTIALS — STRUCTURED…`, `V1 ·`; render the eleven-stage vocabulary nowhere a designer reads (C4). (b) *Empty regions:* a region with nothing prints only its ladder segment and its one leader act in the standing sheet — no head, no "Nothing yet," no "No active phase handoffs need attention." (c) *The client chip:* "No client linked" leaves the letterhead and becomes a ranked standing item (*"No client on this paper · ATTACH THE HARPERS"*), suppressed on completed jobs. The approvals paragraph becomes one act: *"Ask the Harpers to approve the plan set · SEND FOR APPROVAL."*

**Resolves.** R2-07, R2-11, R2-12, R2-15, R2-26 (a typed note gets a register: italic, with the author's initials).

### O9 · Teach the act, at the moment, to the person it is for

**Test.** Surface: Document + Desk. Moment: the hire's first day. Stream: subscription. Promise: prompts when and where you need it.

**What changes.** The teammate tour stops describing rooms and walks one real job: *"Here is a job Leah put down for you. The band says what is yours. Press it."* Step 6's line "Start where you're asked; the rest keeps" is cut. Margin notes never truncate; a note is one sentence or it is not shown. Workshop Notes publish (the eleven drafts) or the slot is removed from the layout until they do. The `?` key is printed (O3).

**Resolves.** R2-24, R2-20, R2-25, R2-19.

---

## 6. Canon tensions

Where a ruling itself produces the lostness, the ruling, the cost, and the narrowest relaxation. Where the canon is right, I say so.

| # | Ruling | Cost today | Verdict | Narrowest relaxation (founder question) |
|---|---|---|---|---|
| **C1** | **R127 L-6 / RF-02** — the rail head's stage phrase yields while the letterhead is in frame, because the arc "prints the same fact." | Scenario 5 fails at step one: no stage word at the top of any paper (R2-01). | **The ruling causes it.** The arc is a wordless mark; it prints no fact a new reader can read. | *Yield the count, never the word.* The stage name stays printed at s0; `4 OF 6` mutes. One class change; the box is already reserved. |
| **C2** | **V11** — no progress bars. The lens ladder's letterhead arc (three bars filling by stage) is a progress bar without a label. | The one orienting device at the top of the page is the one §6 refuses, and because it is refused it was never allowed words. | **Tension inside the canon.** Either it is a progress bar and goes, or it is a table of contents and gets its stage word (V9 calls the ledger "a table of contents, not nav" — a table of contents has words). | Rule that the arc is the ladder's own front matter and must print its stage word. No new element. |
| **C3** | **R127 L-11 / W3-R1** — one line, the rest behind `+N MORE`, ranked by deadline distance. | For the author, right. For the hire opening cold, the list she came for is one press away and the door is a mono count (R2-06). | **Canon right for Leah; relax once for the hire.** | *First open prints the standing sheet open.* A paper a person has never had in hand opens with the sheet unfolded beneath the band, once; thereafter the band alone. No new chrome; one existing sheet, one new condition. |
| **C4** | **R127 prod-walk item (5)** accepted "Scope & engagement · Core · stage 03" in the rail; `workflow-gate.ts:64-87` swaps the paper's stage names for the eleven-stage vocabulary when a gate is open. | The paper has three vocabularies for stage (the Document's seven, the gate's eleven, the Desk chip's seven) and the hire meets all three (R2-11, R2-30). | **The ruling causes it; R124 item 7 parked the mapping for an I114 session that never happened.** | Hold the I114 session. Until then the gate prints the Document's stage name and keeps the eleven-stage key as a `data-` attribute. |
| **C5** | **R124 item 3** — "install stays a label on project mode, not a mode." | Install week's band is a setup chore (R2-09). | **Canon right; fix lies elsewhere.** No mode is needed. A need kind for lateness and a leader rule inside the install window (O6) does the work without a mode. | None. |
| **C6** | **V9 P5 "absence is silence."** | Misapplied, not wrong: empty regions *speak* ("Nothing yet," "No active phase handoffs need attention"), while the one thing that should speak — stage and pen — is silent (R2-15, R2-31). | **Canon right; the product violates it in both directions.** | None. Apply it: delete the empty heads; print the ownership sentence. |
| **C7** | **V9 P3** — filled terminal act only for money or signature; `aria-disabled` with a named reason. | Violated on three screens (R2-13); gated money acts give no reason (R2-32). | **Canon right; fix lies elsewhere (O7).** | None. |
| **C8** | **NG1** — one document at a time, no persistent global nav. | The hire has no studio-wide "whose move" view beyond the Desk. | **Canon right.** The Desk's `BY PERSON` filter already exists (`walk/s1-step1-desk-landing.jpg`); it needs a verb line (O1), not a nav. | None. |
| **C9** | **VISION §5 "no task manager."** | `work-block.tsx` is one, empty, inside Install (R2-14). | **Canon right; the block should go from Install.** | None. |
| **C10** | **R125 / R127 no-flag law.** | None for wayfinding. | **Canon right.** It is why anything here can ship and be judged. | None. |
| **C11** | **VISION §4 "you won't notice Patina" vs. VISION §2 "the thing she cannot afford is a new system to learn."** | Every August program read §4 as *quiet* and built for the author. §2's hire needs the paper to be *legible*, which is louder than quiet for about one screen. | **Not a contradiction; a reading error.** "Won't notice" is about the author's steady state. The hire's first open is not a steady state. | Name it in VISION §4 as one sentence: *"To the first hire: the paper says where it is and whose move it is before she asks."* No ruling changes; a reading does. |

**Where the canon is simply right and nothing in this review asks to move it:** V7/D1 (no tabs in the Document), NG2 (shadow budget), V11's ledger test, R126's register, V12's arrival. The lostness is not caused by calm. It is caused by a calm surface that never says the two things a stranger needs — *where am I* and *whose move is it* — and by a dozen smaller voices that talk over the one voice that should.

---

*R2 · Fable 5.1 · written only to this file.*
