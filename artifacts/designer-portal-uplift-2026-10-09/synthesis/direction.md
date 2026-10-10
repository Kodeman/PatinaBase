# Designer portal uplift: synthesis and direction

**9 October 2026 · Synthesis (Opus 5.5, SQ-727) of the US-24 panel, R1–R5**

**Inputs:**
- the US-24 BRIEF (story contract, revision 1) and its decision log #1–#3
- `briefing/current-state.md` (code map at `48de7545a`)
- `walk/WALK.md` and its screenshots (the measured baseline; local Supabase, Leah's studio carrying 43 live jobs)
- `review/r1-visual.md` (R1, visual craft, Opus), `review/r2-ia-actionable.md` (R2, information architecture, Opus), `review/r3-heuristics.md` (R3, heuristics and cognitive walkthrough), `review/r4-patterns.md` (R4, outside patterns, web research), `review/r5-studio-seats.md` (R5, studio seats)

**Weighting.** R1 and R2 read the code behind the walk. R3 works from the walk and the briefing and cites code through them. R4 is web research about other products, so it is evidence about patterns, never about Patina. **R5's seats are simulated personas.** Their reactions are a reviewer's reading of the screenshots. Nothing they "say" is a quote from Leah or anyone in Leah's studio, and this document never presents it as one. The only real first-person words are the transcript lines R5 §0 quotes verbatim. Design canon is waived (BRIEF §2). Each departure is named, with the ruling it needs, in §3 and §6. Not waived: the studio promise (VISION §4: "you won't notice Patina", never optimised for engagement), "Designer-Taught Intelligence" and never "AI", accessibility, and honesty.

**Notation.** Finding ids: R1-01…R1-26, R2-01…R2-23, R3-01…R3-09 (plus R3 "H10" and R3 "fix 1–5" for its fix-now list), R4 P-01…P-20, R5 §n.n. **S1–S8** are always the BRIEF's scenarios. Finding severity is written "Sev S1–S4" where it appears. Click and second figures for the directions are **estimates** set against the walk's measured baseline (WALK §3). They are illustrated by the specimens and verified by nothing yet.

## 1. The thesis

> **The portal is calm because it is uniform, not because it chooses, and because it never chooses, the moments that need the studio sink into the same quiet as everything else.**

What keeps it calm today is real and worth protecting: the paper ground and the single measure, no navigation rail, no counts or dots on the way to the work, sentences that name people ("Six things are overdue — Chen, Holloway, Halloran and 3 more"), the NEXT band that names one step per job, and acts that open a sheet for review instead of sending (R1 §5, R2 §1 "worth keeping", R5 §1.3 and §2.3, simulated). Actionable moments get lost for two reasons, one underneath the other. Underneath, **the need model drops and mis-ranks what it already knows.** Five places answer "what needs me", each by its own rule (R2 §1). The Desk keeps one need per job (R2-01), ranks by whose hand rather than by consequence (R2-02), never turns a signature, a decline or a landed payment on a live job into a need (R2-04), has no idea which person "mine" means (R2-03, R2-09), and remembers nothing as handled except an invoice chase (R2-11). On top of that, **the surface spends its few strong marks on orientation rather than action**: the saturated stage plates are the loudest thing on the Desk (R1-01), terracotta prints on every overdue line from 1 day to 150 (R1-02), every control is the same underlined mono caps (R1-04), and the heaviest buttons on a job sit below the fold under the act the band elected (R1-05). The walk shows the result: S6 is the only scenario found (WALK §3). S2 on a live job, the landed deposit and S8 are not found at all.

So the uplift is not "add signals". The data is mostly there. It is **one need model, read truthfully, with one reserved way of saying "this is yours, now"**, and an honest end to the day. The three directions below differ in where that model is read and how much of the portal moves to read it.

## 2. Where the panel agrees, and where it splits

### Where it agrees

Each row was raised by at least three seats. Severity is the highest any seat gave it.

| # | Finding | R1 | R2 | R3 | R4 | R5 (simulated) | Sev |
|---|---|---|---|---|---|---|---|
| A1 | **The Desk never states today's three to five.** An overdue sentence and a three-line day line chosen by two different rules, then 32 equal cards. | R1-03 | R2-13 | R3-01, S1 walkthrough | P-01, P-06 | §1.2 S1 | S1 |
| A2 | **"Only what needs me" changes nothing.** Its predicate is the one that built the cards (`desk-roster-derivation.ts:842`). | — | R2-03 | R3-01 | — | §1.2 S1 | S2 |
| A3 | **One need per job hides the second.** Holloway's 9-day PO-HD-0412 is not on the Desk because the invoice took the card (`need-class.ts:143`, `deskLeadNeed`). | R1-02 (no gradient) | R2-01 | R3-03 | §3.1 lesson | §1.2 S3 | S1 |
| A4 | **The Desk ranks by custody band, so maker silences always sort last** (`claimBand`, `desk-roster-derivation.ts:811-868`), while the Document ranks by the US-19 D2 class table (`need-class.ts:23-55`). | R1-02 | R2-02 | R3-03 | P-05 | §1.2 S3 | S1 |
| A5 | **A client's move or a landed payment on a live job is never a Desk need.** `needProposal` fires only before the project exists; the payment read takes due and failed kinds only (`use-desk-engagements.ts:149`). | R1-09 | R2-04, R2-05 | R3-02 | §3.2 lesson | §1.2 S2, S4 | S1 |
| A6 | **Money and status disagree with themselves.** Pell Court's paid deposit reads "$9,200 OUT" beside RECORD THE PAYMENT; Holloway is 11 days overdue on the band and 12 in Accounts; the rail says "Pieces · NOTHING YET" over "1 PO unanswered". | R1-06, R1-07 | R2-08 | R3-04 | P-12 | §1.2 S4, §5 | S1 |
| A7 | **"Your pen" means the studio, not the person**, so the hire's Desk claims all 43 jobs as Jordan's and carries the studio's count. | R1-11 | R2-03, R2-22 | R3-05 | P-07 | §2.2 S1, S5 | S1 |
| A8 | **The hand-off is recorded and invisible.** `project_team_members` holds lead, previous lead and `assigned_at`; `organization_members.handoff_note` exists; neither reaches the Desk or the job. | — | R2-09, R2-10 | R3-05 | P-03 | §2.2 S5 | S2 |
| A9 | **Leads are nameless and sorted by deadline**, so a two-hour-old inquiry is the second of five "Full Room" cards (`desk-derivation.ts:1150-1179`). | R1-10 | R2-14 | R3-06 | P-03, P-04 | §1.2 S7 | S2 |
| A10 | **The day has no honest end.** "AT REST" sits under 32 open cards and over a signed, paid job; nothing is remembered as handled, waiting or deferred. | R1-03 | R2-11 | R3-07 | P-11, P-17 | §1.5 | S1 |
| A11 | **Controls have no hierarchy, and a job has three leaders.** The band's SEND REMINDER is a link; the filled FOLLOW UP WITH THE MAKER and RECORD THE PAYMENT sit below the fold. | R1-04, R1-05, R1-08 | R2-06 | R3-08 | — | §2.2 S6 | S2 |
| A12 | **Coaching copy and scoreboard counters hold prime space at rest** ("The band says…" + UNDERSTOOD, the setup whisper, "0 TAUGHT TODAY · YOUR ACCURACY", "10 PEOPLE DRIFTING"). | R1-13, R1-14 | R2-19, R2-21 | H10 | P-17 risk | §1.4, §4 item 4 | S2 |
| A13 | **A weekly ritual floods the grid**: 10 of 32 cards are "Friday Pulse drafted" (`needPulseDue`, `desk-derivation.ts:1664`). | R1-03 | R2-12 | — | P-12 (bundling) | §1.4, §1.5 item 5 | S2 |
| A14 | **A private vocabulary stands between the hire and the map** (PUT DOWN, HANDS FREE, The Scans, Ledgers, The Post, Standing, Filed with this job). | R1-18 | R2-18 | R3-08 | §3.3 lesson | §2.4 | S3 |
| A15 | **Protect:** the NEXT band, sentences that name people, acts that open a sheet rather than send, no counts or dots on navigation, stillness. | §5 | §1 | S6 walkthrough | P-18 | §1.3, §2.3, §4 | — |

### Where it splits, and the ruling

| Split | The positions | Ruling and reason |
|---|---|---|
| **Fix the marks, or fix the model?** | R1 re-spends marks on today's surfaces (V1–V3, V6) but also proposes a Desk "Today" list (V4). R2 says the marks cannot be fixed while five engines disagree, and picks one keyed need list read at three depths (Model A). R3 declines to pick a layout. R4's strongest steal is a default Priority cut plus groups that appear only when they apply (P-01, P-05). | **Both, in order.** The need model (§3.4) is underneath every direction, because no mark can be true over a model that drops the second need and ignores live-project events. The directions then differ in how the model is read. R1's V4 and R2's Model A are the same idea from two seats, and that is Direction B. |
| **Events: a freshness mark, or a need?** | R1 V5: a solid ink dot plus a relative time, cleared on open. R2: events become needs, with no separate inbox. R4 P-12: a receipt is not a prompt. R5 (simulated): "paid has to read as paid". | **An event that asks for an act becomes a need** (signed → order the pieces; declined → follow up; deposit landed → release the order). **The time word** ("2 hours ago") prints with it. **No dot**, because V9 refuses status dots and the word carries the same information (Q5). A pure receipt with no act reads as a fact on the job, never as a need. |
| **Deferral** | R2: one quiet "Not today" with no counter. R4 P-02, P-13: snooze works, but piles become a graveyard. R5 (simulated): Leah wants "waiting on others" listed apart; Jordan wants the waiting to read as the maker's silence, not Jordan's failure. | **Two kinds of memory, both automatic or explicit, neither counted.** After an act, the item moves to *waiting on <who>, since <date>* by itself (generalising `ar_last_chased_at`). "Not today" is explicit and lasts one working day. Nothing is snoozed indefinitely (Q6). |
| **Whose "mine"** | R2, R3 and R5 want a person; US-19 D8 ruled "Yours is the studio's pen, never a named person". | **A person**, from `project_team_members`, with the studio's view one press away (Q2). D8 was ruled before the studio had a second person. |
| **Where acting happens** | R2-15 and R5 (simulated Jordan): an act on one PO should not open every project's ledger. R5 (simulated Leah): protect "it opens the book rather than firing an email". | **Scope the sheet to the record; keep "open, then you send".** No act sends without a person pressing a second, named control. |
| **Stage plates** | R1-01: demote them. Nobody defends them. | Demote to ink words wherever a direction redraws the Desk (Q7). |
| **Closing the day** | R2 Model C: an evening Round that walks each flagged job. R4 P-11, P-17: a list that can be finished. R5 (simulated): a stated end plus waiting-on. | **A finishable list** (B). The Round is kept as Direction C's form. It is stronger as ritual but costs minutes and reads as a chore (R2 §4 C, "calm risk"). |
| **Push and email** | R4 P-14, P-15: a scheduled summary with a short never-batch list. R2: the sheet is never pushed. | **No push in this uplift** (Q14). The promise is not being summoned. |

**Unique catches worth carrying:** `deriveNeeds` stops at a sealing rule, so live-project event rules must sit above any seal (R2-23). The Standing sheet lists PO-HD-0412 twice because `NeedLine` has no record key (R2-07). The Accounts sheet shows studio revenue, A/R and margin to a sheet a hire can reach (R5 §5, a question, not a finding; Q10). `.t-head` is 11px under a declared 12px floor (R1-19). The dock covers the first card's act at 1440 (R1-15). "Standing · 6" does unfold, which corrects WALK §5 (R5 §5). RESPOND TO THE INQUIRY scrolls the brief to its choices and drafts nothing (R5 §5).

## 3. Three directions

All three ride on one need-model delta (§3.4), because the panel's S1-severity findings are gaps in the model, not in the surface. They differ **in kind**:
- **A** keeps every surface and changes what the marks on it mean.
- **B** adds one new reading of the model, a bounded daily sheet at the top of the Desk.
- **C** moves acting into the job: it re-architects the Document around the job's current step and turns the Desk into who-holds-the-ball lanes.

Today's baseline, from WALK §3, is used in every scoring table:

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| **Today, clicks** | 0–1 | 1–2 pre-project; live: none | 3 + 2 scrolls | 2 (reminder); deposit: none | 1 + scrolls | 0 (1 to act) | 1–2 | 0 |
| **Today, seconds (notice / done)** | 5 to read; the 3–5 never stated, 60+ to triage | 25–40 / 5; live: never | 45–60 / 5 | 20–30 / 5; deposit: never | Desk 30–60 / doc 3 | 3 / 5 | 10–20 / 5 | no end state |
| **Today, verdict** | hard | hard / not found | hard | hard / not found | hard | found | hard | not found |

Marks at rest today, counted by WALK's method (buttons plus links plus colour accents and numbers in the first viewport): **Desk 1440 ≈ 36** (≈ 10 actionable, R1 §3), **Desk 390 ≈ 17**, **Document 1440 ≈ 47** (≈ 3 actionable; R1 counts ≈ 54), **Document 390 ≈ 15**, **hire's Desk 1440 ≈ 38**. The fix-now track (§5) alone takes the Desk to ≈ 33 and the Document to ≈ 44. The direction counts below include it. They are estimates and are recounted on the specimens at render check.

### Direction A: Quiet marks

**In one line.** Keep every surface; make the marks on it tell the truth, and reserve one quiet mark for "this is yours, now".

**The idea.** The portal's calm is uniformity. A turns it into restraint without moving anything. The Desk stays a roster of job cards, re-ranked by consequence (the D2 class table) instead of by custody. A card can carry a second need, so Holloway's silent PO prints under its invoice. Colour is withdrawn from orientation (the six stage plates become ink words) and spent in one place: a 3px terracotta-ink rule beside a need line that is class 1 or at least seven days old. Newer needs get weight only, so 150 days and 1 day stop looking alike. Events print with a time word. Lead cards are titled by the person. Custody prints only when the ball is not yours. On the Document, the NEXT band's act becomes the only filled control, and region heads drop to text acts. The rail's status lines read from the same need list, so they stop contradicting the regions. Acts move to sentence case at 14px. This is R1's V1–V3, V5 (as a word) and V6, laid over the repaired model.

**What changes.**

| Surface | Change |
|---|---|
| **Desk** | Cards ranked by D2 class, then deadline, then age. A second need line per card when the job has one. Stage plates → DM Mono ink-faint words in the card's meta row. One need rule, graded by age. Time word on events. Custody tag only when the move is someone else's ("With Fenmoor Joinery", "With Leah" on the hire's Desk). Lead cards titled by person, with arrival time. The day line names the first three cards, so it agrees with the grid. On the hire's Desk the By person facet defaults to the signed-in person, with "Everyone's jobs" one press away. |
| **Document** | The NEXT act is the only filled control. Region-head filled acts (Pieces, Money) become text. FOLD and UNFOLD become chevrons with labels for screen readers. The rail status reads from the need list, with the need rule where owed and ↓ received / ↑ owed on Money, never colour alone. At 390 the act sits beside its reason in the sticky head (R1-17). |
| **Elsewhere** | A Desk act that opens a ledger opens it filtered to its record (PO-HD-0412, INV-2026-0721), with the full ledger one press away. Nothing else moves. |

**Data it needs.**
- **Existing:** `deriveNeeds` (`desk-derivation.ts:1714`), `NEED_CLASS` and `selectNext` (`need-class.ts:23,115`), `useDeskEngagements`, `DeskRoster` and `deriveDeskRoster`, `ar_last_chased_at`, `proposals.status`, payment rows, `leads` (name, `created_at`), `project_team_members`.
- **New:** §3.4 N1, N2, N3, N4 (read only), N6, N7, N8. **Not** N5: A has no handled or deferred memory, which is why its S8 stays partial.

**S1–S8 (estimates).**

| # | Path | Clicks | Notice / done (s) | Verdict vs today |
|---|---|---|---|---|
| S1 | Day line names the top three cards; the cards below agree | 0 (1 to act) | 10–15 / 5 | **partly**: ranked and truthful, still unbounded; a stale item (Chen, 153 days) still leads because nothing is deferred |
| S2 | Linden's card rises (class 2, "declined yesterday") → Follow up opens Client approvals with the reason | 1 | 10–15 / 5 | **found** (was not found on a live job) |
| S3 | Holloway's card prints the PO as its second line → Chase the maker opens Orders filtered to PO-HD-0412 | 1 | 10–15 / 5 | **found** (was 3 clicks + 2 scrolls, 45–60 s) |
| S4 | Pell Court's card: "Deposit in · 2 hours ago" → the job's band says Release the order; Money reads ↓ received | 1–2 (often a scroll: Pell Court is the fourth card) | 15–20 / 5 | **found** (deposit was never noticed) |
| S5 | Hire's Desk opens on Jordan's jobs; Marsh card says "Handed to you by Leah · Wed 7 Oct"; because Leah's note asks to see anything in writing, the PO act is "Draft the chase for Leah", which opens a draft for Leah to look at before it goes | 0 | 5–10 / 3 | **found** (was 30–60 s) |
| S6 | NEXT is the one filled act; the rail agrees | 0 (1 to act) | 2 / 5 | **found**, and no longer contested by two filled region acts |
| S7 | Third card: "Ines Calder · wrote 2 hours ago" | 1 | 5 / 5 | **found** (was 10–20 s) |
| S8 | The roster ends with honest custody groups; the owed cards remain | 0 | 20–30 to scan / — | **partly**: no stated end, no waiting-on dates, no defer |

**Marks at rest.** Desk 1440 ≈ 30 (≈ 12 actionable): −3 plates, −3 custody tags, −2 setup whisper, +2 for Holloway's second line, +1 time word. Desk 390 ≈ 15. Document 1440 ≈ 44 (re-weighted rather than reduced: the filled act moves to the top). Hire's Desk ≈ 22.

**Risks.**
- The grid stays a catalogue at 16–43 jobs, so S1's "under 10 seconds" is not met, only approached.
- With no defer memory, the same stale item leads every morning (R2-11), and "partly" on S8 is structural.
- Graded urgency is a rule someone has to tune; the seven-day threshold is a guess to test.
- A reserved colour drifts toward meaning "everything" again if a later feature borrows it.

**Canon rulings it needs.**
- R126, the six saturated stage plates (Q7).
- V9, "no status dots" (satisfied by the time word, Q5) and the type system's caps-mono convention for controls (Q9).
- The A5 "held" leading-rule idiom (`globals.css:2174-2185`) repurposed as a need signal (Q7).
- US-19 D8, "Yours is the studio's pen" (Q2).
- R143's custody-band ordering (Q3).
- The one-voice region-head leader election (Q8).

**Build size.** **3 slices, small.** (1) The need model N1–N3, N6–N8. (2) The mark grammar: plates, rule, time word, one filled act, sentence-case acts, the rail. (3) Person grain read-only (N4), the hire's money view (Q10) and filtered ledgers.

### Direction B: The Day Sheet — RECOMMENDED

**In one line.** One need list for the whole studio, read at three depths: five lines at the top of the Desk, the job's Next on its paper, and everything open one press away.

**The idea.** This is R2's Model A and R1's V4, which are the same proposal from two seats. Every job keeps one de-duplicated, keyed, ranked list of standing needs, under the comparator US-19 already ratified. The top of the Desk becomes a **Day Sheet**: at most five sentences across all the signed-in person's jobs. Each sentence starts with a person or job and states the fact and its age, with its act beside it ("Holloway Den — Fenmoor Joinery has not answered PO-HD-0412 in 12 days. · Chase the maker"). Beside the act is one quiet "Not today". There is no overflow count; under the five it says "The rest are on their jobs." Events enter as needs. Doing the act moves the line to *waiting on <who>, since <date>*. When the sheet is empty it says so once, plainly, then lists what waits on others with dates. That is the close of the day. Below the sheet, the card grid becomes a dense **line roster**, one line per job printing that job's own Next, grouped *owed by you · waiting on others · at rest* (R2 Model B, kept as the full roster R5's simulated Leah wants reachable). The Document keeps its look: its band reads the same list's head, so the Desk's line and the band can never disagree, and Standing is de-duplicated and renamed. The look is **typeset and monochrome**: no colour at all on the sheet; order and words carry urgency.

**What changes.**

| Surface | Change |
|---|---|
| **Desk** | The Day Sheet replaces the overdue sentence, the day line and the setup whisper. A scope switch, "Mine · The studio's" (Mine by default). The card grid becomes the line roster in three groups, with the six plates gone and phase as an ink word. One batched line for the week's Pulses. Lead lines named by person. |
| **Document** | The band is the head of the same list. Standing is de-duplicated and renamed "Everything open on this job" (Q9). The hand-off note shows on the job it is about until read; where it sets a rule for an act, the rule rides on that act's own line (Q11). Otherwise as today plus fix-now. |
| **Elsewhere** | Each act opens a sheet scoped to its record (this PO, this invoice, this proposal) with a draft to review and a named send control. The full Orders and Accounts ledgers stay where they are, but a hire's view of them hides studio-wide revenue and A/R the way margin is hidden today (Q10, slice 2): `components/document/accounts/accounts-book.tsx:87-88` prints revenue and A/R to every viewer, and only margin waits on `useCanSeeMargin` (`:66`, `:90`). The Post keeps letters and receipts; notices that became needs leave it (Q4). |

**Data it needs.**
- **Existing:** `deriveNeeds` (every need per job, `desk-derivation.ts:1714`), `NEED_CLASS` / `selectNext` (`need-class.ts`), `ar_last_chased_at` (proof that "the act clears the line", `desk-derivation.ts:964-969`), `proposals.status`, payment rows and the payment-notice read (`use-desk-engagements.ts:149`), `notification_log` and `procurement_notifications` (with read state), `project_team_members` (lead, previous_lead, `assigned_at`; `reassign_project_lead`), `organization_members.handoff_note` (00560), `leads` name and `created_at`, `useDeskLineState` (the slot the sheet replaces), `useProjectInvoices`, `useProposalFeedback`.
- **New:** all of §3.4, N1–N8. The genuinely new storage is N1's key and N5's per-person need-state row; the rest is rules over existing reads.

**S1–S8 (estimates).**

| # | Path | Clicks | Notice / done (s) | Verdict vs today |
|---|---|---|---|---|
| S1 | Read five sentences | 0 (1 to act) | ≤ 8 / 5 | **found** (the 3–5 were never stated) |
| S2 | Line 5: "Linden Place declined … yesterday: 'The sofa is over budget.'" → Follow up opens Client approvals with the reason and an empty note to the client | 1 | 5 / 5 | **found** (was not found on a live job) |
| S3 | Line 4 → a sheet scoped to PO-HD-0412 with the maker's contact and a follow-up to review | 1 | 5 / 5 | **found** (was 3 clicks + 2 scrolls, 45–60 s) |
| S4 | Line 1, the overdue invoice; line 3, "Pell Court Dining paid the $9,200 deposit this morning" → Release the order | 1 | 5 / 5 | **found** (deposit was never noticed) |
| S5 | Jordan's sheet: "Leah handed you Marsh Street Kitchen on Wednesday 7 October · Read Leah's note", then the PO chase, whose own line carries the note's rule and whose act is "Draft the chase for Leah" | 0 (1 to act) | 5 / 2 | **found** (was 30–60 s) |
| S6 | The band, unchanged in concept; "Everything open on this job · 2", not "Standing · 6" | 0 (1 to act) | 3 / 5 | **found**, now agreeing with the Desk |
| S7 | Line 2: "Ines Calder wrote two hours ago about a living room · Reply" | 0 (1 to act) | 5 / 5 | **found** (was 10–20 s) |
| S8 | The empty sheet: "Nothing needs you tonight", what comes back and when, and who holds the rest, with dates | 0 | 5–10 / — | **found** (was not found) |

**Marks at rest.** Desk 1440 ≈ 30 (≈ 15 actionable: five acts and five "Not today" are owed acts or their defer). Desk 390 ≈ 14 (≈ 6 actionable). Document 1440 ≈ 44. Hire's Desk ≈ 20. The total barely falls; the actionable share goes from about a quarter to about a half, and every coloured mark on the Desk is gone.

**Risks.**
- **It is a cross-job ranked list**, which is the shape VISION §5 refuses ("no task manager") and the one most likely to drift into an engagement inbox (R2 §4 A, "calm risk"). Its guards must be structural and binding (Q1): a hard cap of five, no overflow count, no dots or badges, no "cleared today", a "Not today" with no counter and no nag, never pushed.
- **Its value is the ranking's truth every morning.** One false "nothing needs you" costs more trust than the card grid ever did (R5 §1.5 item 3, simulated). The fix-now honesty items (§5) must ship first.
- A third reading of the list in the studio's head (sheet, band, Standing) if the copy ever diverges. One list, three depths, one sentence per need, is the rule.
- "Not today" can become snooze anxiety (R4 P-02 risk). It lasts one working day and is never counted.

**Canon rulings it needs.**
- VISION §5 "no task manager", V11, and US-19 Q6/Q9 "a task list: cut" (Q1).
- US-19 D8 (Q2).
- R143 D3, D5, D6, D7: the claim-card grid, custody words and the three-line day line are replaced (Q3, Q7).
- R82, The Post as the home of events (Q4).
- V9 "no status dots" (satisfied, Q5).
- The lexicon, for the renames (Q9).

**Build size.** **6 slices, medium** (§4 has the order). Most of it reuses machinery that exists; the new surface is one sheet and one roster.

### Direction C: The job workspace

**In one line.** Act inside the job, not from the Desk: the Document opens on the job's current step with that step's work in place, and the Desk becomes who holds the ball.

**The idea.** This direction takes the real transcript's other half seriously: "this project sheet should be more of an overview and there are specific screens you go into" and "Here I'm looking at the job with this lens on. This is all I see." (`pieces-building-room-2026-10-08/TRANSCRIPT.md:57,59`, quoted in R5 §0). The Document is re-architected into three columns:
- A **stage lens** replaces the rail (Brief · Proposal · Buying · Money · Closing, the current stage in ink). It shows only that stage's regions and folds the rest to a line each.
- The **reading paper** in the centre.
- A **Now panel** on the right, on white working stock. It holds the elected need's whole function in place: the facts, the maker's or client's contact, a draft to review, the act, and what happens next. Under it sits "also open on this job".

No studio-wide ledger opens from a job's act. The Desk becomes two lanes on the same white stock. **Your move** is ranked by consequence and uncapped. **Their move** is everything waiting on a client or maker, oldest first (R4 P-08, P-09: stillness is the signal). Above the lanes is a **door** line for a new inquiry (R4 P-03, P-04). For S8, an **evening round** walks each job with a move of yours left, one at a time, and ends at "The round is done" (R2 Model C). The look is **"beige is reading, white is working"**, the rule the Build room work (US-20) set for working sheets.

**What changes.**

| Surface | Change |
|---|---|
| **Desk** | Door line; Your move and Their move lanes as tables (job · what · since · act), with no cards and no plates; set-aside items in one line; "Begin the evening round". |
| **Document** | Stage lens instead of the region rail. Regions outside the current stage fold. The Now panel replaces the margin rail and the NEXT band. Need flags inline on their records (the PO row, the invoice line, the proposal). |
| **Elsewhere** | The Round, a full-width working sheet. Orders and Accounts stay as studio ledgers, but no job act opens them. Build room, Boards, Library, People, Rooms, Compose and Drafting are unchanged except that their acts are reachable from the Now panel. |

**Data it needs.**
- **Existing:** as B, plus `deepLink` and `ledger.context` on needs (`desk-derivation.ts:558-571`) for row anchors, and the Pieces, Money and Client approvals region data already read on `/doc/[id]` (`doc/[id]/page.tsx:630-638,1077-1145`).
- **New:** all of §3.4 N1–N8, plus **N9**, a region-and-row anchor on every need, and **N10**, a Now panel per need kind (PO chase, invoice reminder, proposal follow-up, release the order, lead reply, hand-off note; at least six).

**S1–S8 (estimates).**

| # | Path | Clicks | Notice / done (s) | Verdict vs today |
|---|---|---|---|---|
| S1 | Read the top of Your move (ranked, uncapped) | 0 (1 to act) | 10–15 / 5 | **partial, misses the under-10 s target** (10–15 s, unbounded lane): seven rows at the fold, the five that matter first, but nothing caps them |
| S2 | Your move: Linden → its workspace opens at Proposal, the Now panel quoting the reason, with an empty note to Ellery | 1 | 10 / 5 | **found** |
| S3 | Their move: "Fenmoor Joinery · PO-HD-0412 · 12 days" at the top, and a Chase row in Your move → Holloway's Now panel is the chase | 1 | 10 / 5 | **found**, done in place, no ledger |
| S4 | Your move: Pell Court → Now panel "Deposit received · $9,200 · Release 2 orders" | 1 | 10 / 5 | **found** |
| S5 | Jordan's lanes hold Marsh only; the job opens with Leah's note at the top of the Now panel, above "Draft the chase for Leah" | 1 | 5 / 2 | **found** |
| S6 | The workspace opens at Buying, Now panel first | 0 (act in place) | 2 / 3 | **found**, strongest of the three |
| S7 | The door line above the lanes | 1 | 5 / 5 | **found** |
| S8 | Begin the evening round → three jobs in turn → "The round is done" | 1 to start | 60–180 to walk | **found**, at the cost of minutes |

**Marks at rest.** Desk 1440 ≈ 34 (≈ 16 actionable: every Your move row has an act). Desk 390 ≈ 14. Document 1440 ≈ 30 (≈ 5 actionable: three stages folded, the Now panel carrying two acts). Hire's Desk ≈ 20.

**Risks.**
- **It asks the studio to learn a new system now**, which R5's simulated seats name as a line not to cross (R5 §4 item 9). VISION §2 says the studio "cannot afford … a new system to learn".
- It rewrites the Document that US-19 and US-21 shipped in the last ten days, and moves the NEXT band, which every seat protects, into a panel.
- The stage lens is tabs in all but name on the reading paper: the hardest canon break of the three.
- Your move is uncapped, so S1's bound depends on discipline, not structure, and the 10–15 s estimate misses S1's under-10-second target.
- The Round can read as surveillance of the day or as a chore (R2 §4 C).
- Largest build; six or more Now panels each need their own review path, so the least of it is reusable elsewhere.

**Canon rulings it needs.**
- VISION §5 and §6, "no tab bars" and V7·D1 "no tab bars anywhere in The Document" (the stage lens; Q13).
- "Never a lens on the paper" (waived for the review, but it needs a ruling).
- US-19 D2, the band as the single door (moved into the panel).
- V9 P5, three stocks, for the white working stock (US-20's open drafting-stock question).
- VISION §6 "badges" (inline flags).
- V11 (the Round's position words must not become a progress bar).
- US-19 D8 (Q2) and R143 (the Desk grid and custody words replaced; Q3).

**Build size.** **9 slices, large.** B's slices 1–3 (the model), then the workspace frame and stage lens, two slices of Now panels, the Desk lanes and door, the Round, and the 390 rendering of a three-column job.

### 3.4 The need-model delta, shared

| # | Change | Fixes | Directions | Risk | Size |
|---|---|---|---|---|---|
| N1 | A stable **need key** on `NeedLine` (kind + record id: PO, invoice, proposal, lead); de-duplicate across rules | R2-07 (PO-HD-0412 twice), enables N5 | A B C | Low | S |
| N2 | **One comparator.** The Desk ranks by `NEED_CLASS` / `selectNext` (class, then deadline, then age) instead of `claimBand`; a job can contribute more than one need | R2-01, R2-02, R3-03 | A B C | Low; ordering changes for everyone (Q3) | S |
| N3 | **Live-project event rules**: proposal signed or declined on a live project, payment landed, PO acknowledged (clears its chase); placed **above** any sealing rule (`desk-derivation.ts:1748-1757`) | R2-04, R2-23, R3-02 | A B C | Medium: a rule above a seal changes what later rules see | M |
| N4 | **Person grain**: "mine" from `project_team_members` (lead, previous_lead, `assigned_at`); the hand-off line "Leah handed you … on …" from the reassignment record and `organization_members.handoff_note`; need-level assignee deferred | R2-03, R2-09, R2-10, R2-22, R3-05 | A (read-only), B, C | Low; reverses US-19 D8 for scope (Q2) | S–M |
| N5 | **Need-state row per person**, e.g. `studio_need_states(need_key, member_id, handled_at, deferred_until, chased_at)`: "Not today" (one working day), and *waiting on <who> since <date>* after an act, generalising `ar_last_chased_at`; RLS to the member and the studio owner | R2-11, R3-07 | B C | Medium: a new table; it must never feed a count (Q6) | M |
| N6 | **Lead arrival**: name and `created_at` from `leads` on the Desk and the brief; sort leads by arrival within their deadline | R2-14, R3-06 | A B C | Low | S |
| N7 | **One money reading**: diagnose why a paid deposit reads "$9,200 OUT" beside RECORD THE PAYMENT (WALK §5); one overdue-days function for card, band and Accounts; the rail reads its status from the need list | R1-06, R1-07, R2-08, R3-04 | A B C | Medium until diagnosed; may be a data bug | S–M |
| N8 | **Batched ritual needs**: one weekly need per person for unsent Pulses, not one per job (`needPulseDue`) | R2-12, R1-03 | A B C | Low | S |
| N9 | A region-and-row anchor on every need (extends `deepLink` / `ledger.context`) | R2 §4 C | C | Low | S |
| N10 | A Now panel per need kind (at least six) | R2-15 | C | Medium: six review paths | L |

## 4. The recommendation: Direction B, the Day Sheet

**B, built from the model up**, in this order. Each slice pays off alone.

| Slice | What ships | Needs | Why here |
|---|---|---|---|
| **0: Fix-now** (days) | §5 group (a) | none | Honesty first: nothing in B is trustworthy over a lying "at rest" or a paid deposit that reads unpaid |
| **1: The model** | N1 key and de-dup, N2 comparator, N3 event rules above the seals, N6 lead arrival, N7 money reading, N8 Pulse batch | Q3, Q4 | Every later reading depends on it; it also improves today's Desk before any new surface |
| **2: Person grain** | N4: Mine / The studio's; the hand-off line on the job and the Desk; the hire's counts scoped to the hire; the hire's money view: a hire's Accounts and Orders hide studio-wide revenue and A/R, extending the `useCanSeeMargin` gate (`accounts-book.tsx:66,87-90`), and the same slice gives Leah the grant to show more | Q2, Q10 | The hire is the studio's moment (VISION §2) |
| **3: Memory** | N5: "Not today", automatic waiting-on, the empty-state sentence that is true | Q6 | Without it S8 cannot pass and stale items lead every morning |
| **4: The Day Sheet** | The five lines, the line roster below in three groups, the plates gone, the renames | Q1, Q5, Q7, Q9 | The surface, once the model under it can be trusted |
| **5: Scoped act sheets** | Chase this PO, remind this invoice, follow up this proposal, release this order: each with a draft and a named send; the hire's draft-for-Leah path | Q8, Q11 | S3 and S4 from five seconds to done; Jordan acts without fear |

**Why it beats A.** A is the cheapest and keeps everything familiar, but it cannot answer S1 or S8. A ranked, truthful grid is still a grid. Leah still reads cards to find the morning's work, and with no memory the 153-day item leads every day (R2-11). The panel's two S1-severity "not found" verdicts that are about the *day* (S1's unstated three to five, S8's missing end) need a bounded list and a remembered "handled". A has neither by design. A's mark grammar is not lost: Q7 and Q8 can be adopted under B on the roster and the Document.

**Why it beats C.** C is the strongest answer to S6 and acts in place, but it spends the studio's scarcest thing, attention to a new system, at exactly the moment VISION §2 says the studio cannot afford it. It also rewrites the Document that US-19 and US-21 just shipped, takes the most canon-sensitive step (a stage lens on the paper), and leaves S1 uncapped and over its 10-second target. B reaches the same S2–S5 and S7 numbers with the Document's look unchanged, and costs about two-thirds as many slices. C's best idea, acting on the record in place, is B's slice 5 in a narrower form.

**The strongest argument against B.** It is the only direction that builds a cross-job ranked list: the "task manager" VISION §5 refuses, and the shape every engagement inbox started as. Its whole value rests on the ranking being right every single morning. The day it says "Nothing needs you tonight" over a signed proposal, it has done more damage than 32 equal cards ever did (R5 §1.5 item 3, simulated). The answer is not to deny the risk. It is to make the guards structural and binding (Q1), to ship the honesty fixes first (slice 0), and to test the ranking against Leah's own five before the sheet ships (§7).

## 5. Fix-now track

These ship under any direction. Group **(a)** needs no ruling and no migration beyond a read change. Group **(b)** waits on the ruling named.

| # | Defect | Where | Fix | Source |
|---|---|---|---|---|
| 1 | "Only what needs me" changes nothing, then announces "SHOWING WHAT NEEDS YOU" | `components/document/desk-roster.tsx:235-253,275-289`; predicate `lib/document/desk-roster-derivation.ts:842` | Retire the facet until N4 can make it mean the person; never print a mode that did not happen | R3-01, R2-03, R3 fix 1 |
| 2 | A paid deposit reads "$9,200 OUT" beside RECORD THE PAYMENT; the margin says "MONEY · SENT" | Pell Court, `walk/s2-step6-pell-court-doc-1440.jpg`; invoice lead read `app/(document)/doc/[id]/page.tsx:673-729`; cause undiagnosed (WALK §5) | Diagnose first; never offer Record the payment on a paid invoice; ↓ received / ↑ owed in words | R3-04, R1-07, R2-08, R3 fix 5 |
| 3 | One invoice is 11 days overdue on the card and band, 12 in Accounts | `walk/s6-step1-holloway-next-band-1440.jpg` vs `walk/s4-step2-send-reminder-1440.jpg` | One overdue-days function for every surface | R2-08, R5 §5 |
| 4 | The rail says "Pieces · NOTHING YET" over "1 PO unanswered" | `walk/doc-holloway-fold-1440.jpg` vs `walk/s3-step2-holloway-pieces-po-1440.jpg` | Rail status reads from the job's need list | R1-06, R2-08, R5 §5 |
| 5 | Standing lists PO-HD-0412 twice and mixes setup with $3,800 owed | `walk/s6-step2-standing-six-1440.jpg`; `NeedLine` fields `lib/document/desk-derivation.ts:543-575` | N1's key and de-dup; setup folds under its own heading | R2-07, R3-08 |
| 6 | "AT REST · Nothing needs your hand" over a signed, paid job | `components/document/desk-roster.tsx:422-429`; `walk/s2-step4-pell-court-at-rest-1440.jpg` | Print "at rest" only for jobs whose modelled needs were all read and none is open; say what was not checked | R3-07, R3 fix 4, R5 §4 item 1 |
| 7 | Leads titled "Full Room", sorted by respond-by date, with no arrival time on the card or the brief | `lib/document/desk-derivation.ts:1150-1179`; `walk/s7-step1-desk-new-lead-1440.jpg`, `walk/s7-step2-lead-brief-1440.jpg` | Title by the person; print "wrote 2 hours ago" on the card and the brief (N6) | R1-10, R2-14, R3-06 |
| 8 | Coaching left at rest: "The band says…" + UNDERSTOOD on every Document, the setup whisper on the Desk, a time-keeping notice on the hire's first Document | `useDeskLineState`, `app/(document)/desk/page.tsx:231-254`; `walk/doc-holloway-fold-1440.jpg`, `walk/s5-step3-hire-marsh-doc-1440.jpg` | Once per person, then gone; setup moves to Account | R1-14, R2-19, R3 H10, R5 §1.4 |
| 9 | Scoreboard counters on studio surfaces: "0 TAUGHT TODAY · YOUR ACCURACY · 0 MATCHES SHARPENED", "10 PEOPLE DRIFTING", "TEACHING 0 TAUGHT" | `walk/library-fold-1440.jpg`, `walk/people-fold-1440.jpg`, `walk/s4-step2-send-reminder-1440.jpg` | Remove. The studio surface is never optimised for engagement (not waived, BRIEF §2) | R2-21, R1-13, R5 §4 item 4 |
| 10 | Ten Friday Pulse cards for one weekly task | `lib/document/desk-derivation.ts:1664-1677` | N8: one line per week, "Review and send 6 Pulses" | R2-12, R1-03, R5 §1.5 item 5 |
| 11 | `.t-head`, the caps label behind most controls, is 11px under the declared 12px floor | `app/globals.css:2045` vs `:100` | 12px | R1-19 |
| 12 | The dock covers the first card's act, wraps "Keys ?", truncates "LEAH HARTW…" at 1440 | `app/globals.css:241-262`; `walk/desk-fold-1440.jpg` | Reserve the dock's height under the roster; drop the duplicate "Find anything" | R1-15 |
| 13 | At 390 the NEXT reason is in the sticky head and its act ~750px away in the bottom bar | `walk/doc-holloway-fold-390.jpg`, `walk/s6-step1-holloway-next-band-390.jpg` | The act sits beside its reason | R1-17 |
| 14 | Garnet Hill's FOLLOW UP showed no change; RESPOND TO THE INQUIRY scrolls to the choices and drafts nothing | `walk/s2-step3-garnet-follow-up-1440.jpg`, `walk/s7-step3-respond-to-inquiry-1440.jpg`; WALK §5 | First verify what each opens; then every act shows what opened or changed | R3-09, R3 fix 5, R5 §5 |
| 15 | Client approvals says "No decision lead named yet · ASSIGN PROJECT CLIENT" on jobs with a client and a decision; "Closing the book · 1 CLOSED OUT" on unstarted jobs | `walk/s2-step5-linden-doc-1440.jpg`, `walk/s2-step6-pell-court-doc-1440.jpg`; WALK §4 | Read the proposal's outcome; say nothing on an unstarted job | R2-20 |
| 16 | The hire's hand-off note never showed, and only ever lives once on the Desk | `app/(document)/desk/page.tsx:231-254`; `00560_invite_handoff_note.sql` (own row only); WALK §5 | Trace the suppressing condition; show the note on the job it is about until read | R2-10, R5 §2.5 item 4 |
| 17 (b: Q3) | The Desk ranks by custody band, so maker silences sort last | `lib/document/desk-roster-derivation.ts:811-868` | N2: rank by `NEED_CLASS` / `selectNext` | R2-02, R3 fix 2 |
| 18 (b: Q4) | Signed, declined and paid on a live job never reach the Desk | `lib/document/desk-derivation.ts:1004-1030`; `hooks/use-desk-engagements.ts:149` | N3, above the seals | R2-04, R2-23, R3-02, R3 fix 2 |
| 19 (b: Q2) | "YOUR PEN" on every card of the hire's Desk; the studio's 43 as the hire's count | `lib/document/desk-roster-derivation.ts:210-241` (`custodyWord`); `walk/s5-step1-hire-desk-1440.jpg` | Custody names the holder; counts follow the scope | R1-11, R2-03, R2-22, R3-05, R3 fix 3 |

Items 17–19 are the model's first slice in all but name. They are listed here because every direction needs them and each is small once ruled.

## 6. Founder questions

Decide Q1–Q4 first: they gate slice 1 under any direction. The rest can follow the fix-now track.

| # | Question | Recommended answer | If declined |
|---|---|---|---|
| Q1 | **Is a five-line cross-job Day Sheet a "task manager"?** VISION §5 refuses one; V11 sets the dashboard test; US-19 cut "a task list". | **No, under five binding guards:** at most five lines, no overflow count, no dots or badges, no "cleared today" or streak, never pushed. Its rows are the jobs' own Next, so it is a reading of the jobs, not a second list to keep. Log it as a V-entry with the guards as the ruling's text. | Ship A, plus B's line roster as the Desk (R2 Model B). S1 and S8 stay "partly". |
| Q2 | **May "mine" name a person?** US-19 D8: "Yours is the studio's pen, never a named person." | **Yes.** Scope is the signed-in person's jobs, from `project_team_members`. "The studio's" is one press away for anyone. For a job someone else holds, custody names them ("With Leah", "With Fenmoor Joinery"). Need-level assignment waits. | The hire's Desk stays studio-wide; S5 stays hard on the Desk in every direction. |
| Q3 | **Rank the Desk by consequence (the D2 class table), not by whose hand?** This replaces R143's custody-band order. | **Yes.** The Document already ranks this way. The Desk and the paper must agree, or neither is trusted (`desk-roster-derivation.ts:677-690`, the code's own principle). | Maker silences keep sorting last; S3 stays hard everywhere. |
| Q4 | **Events become needs; The Post keeps letters and receipts only** (R82). | **Yes.** A signature, decline, landed payment or acknowledgment that asks for an act becomes a need on its job and leaves The Post. A receipt with no act stays a fact on the job. | Live-project moves arrive only as a dot on The Post; S2 and the deposit in S4 stay not found. |
| Q5 | **Freshness as a time word ("2 hours ago"), with no dot?** R1 V5 asked for a dot; V9 refuses status dots. | **The word only**, printed with the need, gone once the job is opened. | With a dot: one more mark per event, and a V9 exception. With nothing: S7 leans on the person's name alone. |
| Q6 | **May the studio say "Not today", and may an act move a line to "waiting on"?** | **Yes, both, never counted.** "Not today" lasts one working day and returns without comment. After an act, the line moves by itself to *waiting on <who>, since <date>*. No snooze beyond a day; a held item takes a dated "set aside until" with its reason. | No end state for S8; the oldest item leads every morning (R2-11). |
| Q7 | **Spend colour on need, not phase?** Demote the six stage plates (R126) to ink words; under A, one need rule graded by age (class 1 or ≥ 7 days). | **Yes** to demoting the plates in every direction. The graded rule is A's; B carries urgency in order and words alone. | The plates stay the loudest marks on the Desk (R1-01). |
| Q8 | **One filled act per view.** On the Document, the NEXT act is the only filled control; region heads drop to text acts. | **Yes**, in every direction. It overrides region-head leader election where the band has elected another region. | Three leaders per job remain (R2-06); S6 depends on reading order. |
| Q9 | **Plain words.** Put down → Back to the Desk; Hands free → No timer; The Scans → Rooms; Ledgers → Orders and accounts; Standing → Everything open on this job; Your pen / With the maker → Yours / With <name>; acts in sentence case. | **Yes, with Leah's own words** (§7) where Leah has better ones; caps mono kept for metadata only. | The hire learns the map by asking Leah, which is what S5 is meant to stop. |
| Q10 | **Should a non-owner seat see studio revenue, A/R and margin?** Accounts shows "$7,555 REVENUE · $38,810 A/R · 22% MARGIN" in a sheet the hire's acts can open (R5 §5). | **Not by default, and it takes a rule, not only a Desk that leaves the totals out.** Today Accounts prints studio-wide revenue and A/R to every viewer (`apps/designer-portal/src/components/document/accounts/accounts-book.tsx:87-88`); only margin is gated, by `useCanSeeMargin` (`:66`, `:90`). Slice 2 extends that gate: a hire's Accounts and Orders show receivables and orders on the jobs they lead and hide studio-wide revenue and A/R. The same slice gives Leah the grant to show a hire more. Neither the rule nor the grant exists yet. | The hire sees studio-wide revenue and A/R from the first day, as today. |
| Q11 | **A hire's act on a client- or maker-facing step of a job they do not lead.** | **It produces a draft for Leah**, marked "Leah sees this first"; it never sends. On their own jobs they send as Leah does, unless the job's hand-off note asks otherwise: on Marsh Street, Leah's note (an illustrative fixture line, "ask me before anything goes out in writing") makes the PO chase "Draft the chase for Leah" in every direction. | Simulated Jordan's reaction is to avoid acting at all (R5 §2.2 S3, S4, S7). |
| Q12 | **The hire's end-of-day hand-back** (R5 §3.2 item 5, simulated): a note the hire sends Leah, built from what the hire moved. | **Park it.** Log it as a side journey. B's waiting-on list covers most of it, and anything built later is a draft the hire sends, never a report about the hire. | Build now: +1 slice, under the same "never an automatic report" rule (R5 §4 item 10). |
| Q13 | **C's structural moves**: a stage lens on the Document and acting in a Now panel. | **Not now.** Revisit after B ships, with the Build room as the precedent for "a working sheet opened from the paper". | Accepting C replaces B's slices 4–5 with C's nine and needs Q13's tab ruling (V7·D1). |
| Q14 | **Does anything push?** A Monday summary email or a phone notice (R4 P-14, P-15). | **No push in this uplift.** The sheet is read when Leah opens the portal. Revisit only with a capped, reviewed interrupt list. | An interrupt list is needed, capped and reviewed, and every studio-facing push becomes a calm risk to rule on one by one. |

## 7. Asks for real studio validation

These are for Leah and the studio in person. Nothing in the specimens is evidence of time or trust; they are static illustrations.

- **Leah's five, before ours.** On a real Monday, before Patina is open, ask Leah to write the five things to do first. Then show the Day Sheet the model ranked from Leah's real jobs. Every disagreement is a ranking rule to fix before slice 4.
- **Time S1 by hand.** Today's Desk vs a working Day Sheet prototype, on Leah's real 16 jobs, between two appointments. The walk's 43 jobs are an artefact of accumulated seeds.
- **The false all-clear test.** Seed one signed proposal Leah has not acted on, show "Nothing needs you tonight" with it hidden, and ask what Leah would do. If the answer is "stop trusting it", fix-now items 2, 3 and 6 are the release gate, not polish.
- **Leah's words** for: *mine* or *yours*; *not today*; *waiting on*; the Desk's top ("Today"? "This morning"?); the job's step; *Put down*; *The Scans*; *Ledgers*. The specimens print the panel's guesses.
- **The hire.** Who sits closest to the first-hire seat today? Give them a job they did not build and time S5 and S6 on today's portal and on the prototype. Ask whether "Leah sees this first" makes them more willing to act, or less.
- **Money visibility.** Does Leah want the hire to see studio revenue and margin (Q10)? Can the hire send a payment reminder on one of Leah's clients?
- **"Two hours ago".** Does a time word read as calm information or as a nudge? Would Leah rather see nothing until the job is open?
- **The ten Pulses.** Is one batched weekly line right, or does each Pulse belong to its job's own morning?
- **The Round (C).** Would Leah walk the jobs one at a time at the end of the day, or close the laptop? This is the test that decides whether C's S8 is a feature or a chore.
- **The deposit.** What does Leah expect to happen next when a deposit lands: release the orders, or wait for a call with the client? This sets N3's act word.
