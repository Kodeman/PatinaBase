# Proposal F2 — Nothing to Learn

**Lens:** F2, subtraction. The studio pops out because Patina asks for setup and ceremony before it gives anything back. This proposal designs what to remove or defer, not what to add.
**Author:** Claude Fable proposer, 2026-09-22. **Evidence:** the eight lane reports under `artifacts/studio-hook-2026-09-22/research/`, cited by file and section. Repo `main` @ `966d6ca67`.
**Audience:** Patina leadership (Kody, Leah) and the beta studios.

---

## 0. Thesis

Studios pop out because the first hour of Patina is spent on Patina, not on the job. The invited designer lands on a Desk that auto-opens a six-stop tour, is handed a lead sheet that leads to a five-block Discovery, and cannot send her first agreement until five studio-level preconditions she was never asked about are true (01 §2 rows 4–13; 01 §9 item 6). Behind that sits a six-row setup checklist with no row for the work she already has (02 §1.14) and a ten-email curriculum that keeps arriving weekly after she has gone dark (03 §3.2). Every one is an ask before a give. The literature the dossier gathered says the reversion mechanism is switching cost plus habit, not misunderstanding (06 §7, §8), and the counter-lever it validates is reducing transition and uncertainty cost — not more teaching.

**The one bet:** if Patina asks nothing until the moment the job needs it, the studio drives a real job through it in the first session, because the shortest path — `Open a project` in four fields, then draw the invoice or draft the agreement — already exists and is merely hidden behind ceremony (01 §2, "the fast lane exists but is unadvertised"). Subtraction is cheaper than any import path, and it is the only move that makes every future import land on a quieter surface.

**Honesty clause.** Production holds one real studio. Leah's Middle West has one project after seven weeks, six proposals (one sent, none signed), ten invoices, no products, no contacts (03 §2; 08 G2). Nobody has recorded what "manual ways" means for any studio (08 G4). Leah Session 05, the instrument that would tell us, was prepared 2026-08-18 and never run (08 G3). Every time-saved claim below is therefore about Leah's next house, checkable by one stopwatch and one conversation; §5 says what must be learned before any of it is built.

---

## 1. The asks-before-gives ledger

| # | Step in the first session today | Ask / Give | Source |
|---|---|---|---|
| 1 | WelcomeModal auto-opens; one decision, three buttons | Ask | 01 §2 row 4; `desk-walkthrough.tsx:551-570` |
| 2 | Six coachmarks, Next ×5 | Ask | 01 §2 row 5; R97 (04 §b 1) |
| 3 | CaptureLeadSheet, 2 required + 3 optional | Ask | 01 §2 row 7 |
| 4–6 | Triage decision; Discovery 5 essentials; Direction decision | Ask ×3 | 01 §2 rows 9–11 |
| 7 | Agreement composition to R4's floor | Ask | 01 §2 row 12 |
| 8 | `send` refuses without client relationship, service terms, role rates if rate card, ceiling if time-billed, a named fee — four of five are studio setup nobody pointed at | Ask | 01 §2 row 13; `00575:655-690` |
| 9 | Six-row checklist, none "bring your work in"; row 1 hardcoded true so the person-named studio counts as branded | Ask disguised as a give | 02 §1.14; 01 §6; `studio-setup.ts:90-91` |
| 10 | Ten spine emails on a 7-day floor regardless of activity; E3 promises a clipper and an app that are both shut | Ask (attention) | 01 §7; 03 §3.2; 08 G7 |
| 11 | The Pledge band says she will be paid; nothing says what she pays | A give VISION §3 says is not yet ours | 08 G5 |

The one give is the Desk, and its fast acts — `Open a project` (4 fields, `open-project-sheet.tsx:7`) and ⌘K `Draft a design agreement` (`draft-proposal-opener.tsx:1-22`) — are never named by the tour (01 §9 item 5). The loop Leah completes is invoicing (03 §6.2; 08 G2), and `Draw an invoice · {project}` is a ⌘K verb she must know to type (`command-bar.tsx:823`; 02 §1.6). Every move below removes or defers a row in this ledger. None adds one.

---

## 2. Moves

"This week" means Leah's next house at Middle West — the only real job in the data (08 G2).

### M1 · The walkthrough stops pushing; it waits to be pulled

**What.** The WelcomeModal no longer auto-opens on first `/desk`. The six-step tour stays as built, reachable from the help panel and ⌘K ("Show me the desk"), and is offered once by the existing `desk-walkthrough-offer` margin note — already the path every sub-980px and pre-2026-07-10 designer gets (01 §5). Content, step-6 act, and persistence are unchanged.

**Evidence.** 01 §2 rows 4–6; 01 §5 (gate clauses; <980px gets no modal and writes no state); 04 §a 1b–1c, §b 1–3; 06 §1 (users decide in the first ten minutes by poking, not by reading a tour); 04 §c (`help.tour.*` built, never read back — nothing says the push helped).

**Cost.** S. `shouldAutoOpenDeskWalkthrough` → false; `shouldOfferDeskWalkthrough` loses its `isDesktop` clause; R130's "Show me later" state deleted.

**Vision test.** The Document / first Desk paint / subscription floor / "it gets out of the way."

**Rulings.** Narrows R97 (pull, never push) — inside R94's default physics since no tour is added; retires R130; R129 untouched. One line in DECISIONS.md; V1–V5 untouched.

**Time saved.** For Leah's next hire: one decision and about a minute before touching the Desk — small, stated at its size. The real change is the frame: the first thing Patina does is not "learn this." We would know from the day-0 write list (§6, from `engagement_events`, 00291) read per seat. `help.tour.started` falling is expected and is not success (VISION §6; 04 §b 10).

### M2 · The front door is the job in flight

**What.** Desk acts reorder to **Open a project** (primary), **Capture a lead**, **Find anything ⌘K**. The empty-roster line under the greeting, which today says nothing, names the two verbs a studio with work in flight cannot discover: "A job already running? Open a project. A paper to get out today? ⌘K, then 'agreement' or 'invoice'." Nothing new is built.

**Evidence.** 01 §2 (`open-project-sheet.tsx:7,45-49,121-165` — "essentials only, then compose"); 01 §9 item 5; 03 §6.2 and 08 G2 (invoicing is Leah's loop; she has never sent a proposal); 06 §11 (the empty state is the product for a new account); 03 §4 (32 days to first project — the lead arc was not her door).

**Cost.** S. Reorder in `desk/page.tsx:240-317`; one blurb through `registry.tsx` (04 §b 13), Leah's voice under decision 7.

**Vision test.** The Document / first Desk with eight houses live / floor plus upside (a project on paper is the only thing that can carry FF&E) / "prompts and collects when and where she needs it."

**Rulings.** R79 kept (⌘K and the Desk act share a contract). R129's step-6 anchor still resolves. The lead → Discovery arc remains the path for a stranger; it stops being the only path.

**Time saved.** Leah's second house into Patina: four fields, under two minutes by field count (01 §3), against 12–16 inputs and three decisions across four surfaces (01 §2) — roughly ten minutes and three screens per house, times a house count nobody has asked her (§5 L1). We would know by counting `projects` rows at Middle West's `studio_id` weekly against her stated live-house count, and by the stopwatch pass (§5 L5).

### M3 · Setup is asked at the door, in the room, one thing at a time

**What.** Every studio-level precondition moves to the moment it blocks a real act and is satisfied in the same sheet:

1. **Studio name at the first paper out.** The first send of an invoice or agreement asks: "This goes out under *Leah Kochaver*. Is that the studio's name?" with an inline rename writing `organizations.name`. Today the provisioner names the studio after the person (`00295:269-277`), the checklist hardcodes the row done, and the only rename is behind `studio-workspaces` in the Account sheet (01 §3, §4, §6).
2. **The send gate names the missing thing and offers it there.** `readiness.ts` already derives readiness; `00575:655-690` raises `check_violation` with a sentence. Each unmet precondition becomes one inline act in the drafting room — set terms, set the ceiling, name a role rate — written to studio defaults so the second agreement never asks.
3. **Her own title is never asked** (checklist row 2 goes with M4).

**Evidence.** 01 §2 row 13; 01 §9 items 2, 6; 01 §6; 03 §6.1 (23 of 45 proposals in draft, 0 signed — how many died at the gate is unknown, itself a finding); 06 §5 (NN/g: deferring secondary setup improves learnability, efficiency, error rate).

**Cost.** M. Instance 1 is S. Instance 2 rehosts existing editors as inline acts; no migration if writes reuse `studio_agreement_defaults` and `proposal_service_terms`.

**Vision test.** The Document / the first sendable paper / floor (the paper is what the floor buys) / "prompts and collects when and where she needs it, then gets out of the way."

**Rulings.** R96/R134 — every act is a sheet over the room, never a page in the document. R5 (prose never carries money) and R22 (the fee sentence) kept. R125 — unflagged; moving the rename out from behind `studio-workspaces` shrinks the single-flag blast radius 01 §4 names. The Account tab stays for the ongoing studio.

**Time saved.** Leah's first agreement from Patina — never sent (03 §4). Today: compose, send, read a refusal, drawer → Account → Studio, set terms, set a rate, return, send — four surfaces and one "no." After M3: one sheet, no refusal — about ten minutes, and the first paper she ever tries to send is not refused. We would know from Middle West proposals moving draft → sent, and from logging every send-RPC `check_violation` into `engagement_events` (two lines in the RPC).

### M4 · The checklist and the whisper go

**What.** Delete `studio-setup-checklist.tsx` (six rows) and `studio-setup-whisper.tsx`. Nothing replaces them. Name the studio → M3; invite the crew → the People room's invite act plus the R133 handoff call; open a project → M2.

**Evidence.** 02 §1.14 ("right for month two and wrong for hour one"); 01 §6 (row 1 hardcoded; whisper at `openCount >= 2`, owners only); 03 §2 (Kody's two solo studios are fully set up with zero jobs — setup completion does not predict a job even on n=2); 06 §11 (median checklist completion 10.1% — vendor-tier, cited only as "no evidence it works"); 04 §b 8 (V11: six ticks with no rows beneath them are a progress bar with words).

**Cost.** S to delete. The honest cost: decision 1g and rosters U3/U7 were shipped work, and the checklist is the only in-product "invite your crew" nudge — VISION §2's customer moment. I am relying on the human call to carry it; if R133 calls are not happening (08 G6) this is a real loss, which is why §5 L4 comes first.

**Vision test.** The Document / Account sheet, second open / floor / "never optimize the studio surface for engagement."

**Rulings.** Reverses decision 1g and rosters U3/U7 (04 §a 1g, 2a); consistent with V9/PP and V11; leans on R133.

**Time saved.** None, honestly — it costs her nothing to ignore. It removes the message that there is setup to do before the work. We would know only negatively: day-0 writes do not worsen.

### M5 · The drip stops teaching and asks one question

**What.** Spine E2–E10 and their ten in-app Post notes are retired. What remains: W0 "Your desk is ready," then **one** email at day 7, plain text, no button, reply-only, in N2's register (`copy-deck.md:118`): *"One question. Which job would you move onto the Desk this week if it took ten minutes — and what is it living in right now?"* Reply-to Kody. Milestone emails M1–M4 stay; they answer her acts. `Re-Engagement` stays draft.

**Evidence.** 03 §3.2 (two seats walked through 25 steps after leaving; a seat dark since 09-03 has E5 queued for 09-28); 03 §3.4 (0 opens, 0 clicks across 400 rows); 01 §7, §9 item 10 (copy written to a day-2/4 rhythm, live cadence weekly); 08 G7 (E3 promises shut on-ramps); 08 G4 (the question is L5 Q1.4, asked by mail because L5 never ran); 05 §9 (sales-motion-as-onboarding is the survey's clearest anti-pattern; a ten-email curriculum is its polite cousin).

**Cost.** M. A migration in the 00561 pattern rewriting `steps_json` (remap in-flight enrollments by step id), one template, ten retired. Fix or drop the dead `is_active` column (03 §3.1) in the same migration.

**Vision test.** The inbox is not a Patina surface, so the test is strict: day 7, when excitement has faded / floor / "you won't notice Patina" — nine fewer things from Patina in her inbox.

**Rulings.** The Agent OS no-automated-sends rule governs agent drafts; the drip is a sequence already automated, and this reduces it. R133 — the question is not a substitute for the setting-up call; a reply is the call's agenda. Decision 7 for the one template.

**Time saved.** For her: nine unread emails, trivial. For Kody: one reply per studio answers what tool holds the houses — today a 40-minute session that has not happened in five weeks (08 G3). We would know by counting replies by hand and by `welcome_series` rows in `notification_log` dropping from 68 to about one per seat.

### M6 · Honest exports, so she is never trapped

**What.** One act in the studio drawer: **Export the studio** — a zip of CSVs: projects, FF&E lines *with cost basis* (trade, markup, client price), contacts, invoices and payments, POs, and the existing 14-column hours CSV, RFC-4180 with the formula-injection guard `time-export.ts:71-82` already carries. Owner-only, RLS-scoped; no client-facing money invariant because nothing here is a share. One edge function; hours export is the template. No import is proposed — that is another lens — but an export is the precondition for trusting any import.

**Evidence.** 02 §1.3 (no FF&E export carries cost basis; `spec-pdf`'s invariant is correct for client PDFs and is the only schedule export), §1.7, §1.13, §6 item 3 (VISION §4 "your data exports" unmet); 06 §7 (uncertainty cost drives resistance even at zero real switching cost); 05 §10 HoneyBook (easy in, hard out, named by a user planning to leave).

**Cost.** M. Six queries and a zip; the FF&E columns follow `ffe-schedule-builder.tsx:235-400` plus the money triple.

**Vision test.** The Document (drawer) / the moment she wonders whether the second house is a one-way door / floor — no lock-in is what makes a monthly fee honest / "No lock-in. Your data exports."

**Rulings.** None. V11 — a CSV is rows. `spec-pdf` untouched.

**Time saved.** This week's real job: the bookkeeper handoff. The one Middle West project's FF&E lines (31 `project_ffe_items` in all of prod, 03 §6.4) leave Patina by retyping — about fifteen minutes, to zero. Modest, stated at its size; the larger effect is the one 06 §7 names and no stopwatch sees. We would know by a `studio_export_taken` row in `engagement_events` and by the bookkeeper no longer asking.

### M7 · Pricing on one page; the Pledge band pulled until counsel

**What.** (a) Remove the "What teaching returns · the 25% Pledge" band from `accounts-earnings-page.tsx:110-127`; `pledge.ts` stays unrendered. (b) Publish `patina.cloud/pricing`: one tier line, what it includes, cancel any time, your data exports (M6 makes that true). The number is V2 — Kody's ruling, not this proposal's — and the page ships the day V2 is ruled, not before. (c) The setting-up call names the price aloud (§5 L4), because today no surface answers "what does this cost" (08 G5).

**Evidence.** 08 G5 in full (no pricing route, no subscription Stripe path, every org `free`, the band renders unflagged, VISION §3's counsel gate, V6 "does it survive Leah's ear" — already shipped to her ear); 03 §1; 05 §2 (Houzz Pro's fast migration undone by coercive terms).

**Cost.** S for the band; S for the page once V2 is ruled; zero for the call.

**Vision test.** Accounts book and the public site / before she commits the second house / floor, explicitly / "pricing is one page, public, and stable."

**Rulings.** V2 open, and this move is blocked on it and says so. V6 open — pulling the band is the reading VISION §3 already requires and does not resolve V6. Shipped code currently violates §3's counsel gate; this restores it.

**Time saved.** None for a job; this is the trust precondition. A studio that does not know the price is evaluating, not adopting. We would know by L5 Block 3 and by the band's absence in a prod walk.

### M8 · The zero-ask arrival reaches real studios

**What.** Widen `onboarding-teammate-persona` to 100%, then delete the flag. For Leah's hires this turns on "You're in — {studio}." on accept-invite, the owner's `hire-handoff` note, and the teammate walkthrough copy (pull-only after M1). Accept-invite already asks nothing — one click, no form (01 §1c).

**Evidence.** 01 §1c, §5, §9 item 9 (every real hire gets the owner's copy; "Anything you begin here belongs to the studio, not to you" is never seen by its audience); 04 §a 1i (the owed step "0% → Leah's studio → all" never progressed); 08 G1 (`1a94f78f`, the only unnamed real seat, is a Middle West designer invited 09-04 and dormant since — the customer moment, with the wrong copy).

**Cost.** S. Verify the flag live before enabling; then a flag-removal commit under R125.

**Vision test.** The Document / the first hire's first minute — VISION §2's moment / floor / "you won't notice Patina."

**Rulings.** Completes decision 9; retires the one R125 exception.

**Time saved.** None in minutes — the arrival was already zero-ask. The studio's name and the ownership sentence reach the person they were written for. We would know from `organization_members.first_document_opened_at` for the next Middle West hire, and whether `1a94f78f` returns (§5 L3).

---

## 3. Moves table

| ID | Move | Cost | Surface / moment / stream / promise | Rulings | Time saved (this week) | How we would know |
|---|---|---|---|---|---|---|
| M1 | Walkthrough push → pull | S | Document / first Desk paint / floor / gets out of the way | Narrows R97; retires R130; R94 default | ~1 min + 1 decision per seat; "learn first" frame gone | Day-0 write list per seat |
| M2 | Front door = job in flight | S | Document / first Desk with work in flight / floor + upside / prompts where needed | R79 kept; R129 anchor intact | ~10 min, 3 screens per house vs the ceremonial arc | Middle West `projects` vs stated houses; stopwatch |
| M3 | Setup at the door: studio name at first paper; send-gate fixes inline | M | Document / first sendable paper / floor / prompts and collects when needed | R96/R134, R5, R22 kept; R125; shrinks `studio-workspaces` blast radius | ~10 min and one refusal off Leah's first agreement | Proposals draft→sent; `check_violation` logged |
| M4 | Checklist + whisper deleted | S | Document / Account sheet / floor / never optimize for engagement | Reverses 1g, U3/U7; V9, V11; leans on R133 | None; removes "setup to do" | Day-0 writes do not worsen |
| M5 | Drip → W0 + one reply-only question | M | Inbox (not a surface) / day 7 / floor / you won't notice Patina | Reduces sends; R133 trigger; decision 7 | 9 emails removed; one reply = L5 Q1.4 per studio | Replies by hand; `welcome_series` ≈ 1/seat |
| M6 | Export the studio (CSV zip incl. cost basis) | M | Drawer / before the second house / floor / no lock-in, your data exports | None; V11 rows | ~15 min bookkeeper retype → 0 | `studio_export_taken`; bookkeeper stops asking |
| M7 | Pledge band pulled; `/pricing` (blocked on V2) | S | Accounts + public site / before the second house / floor / pricing one page | Restores VISION §3 gate; V2, V6 stay open | None; trust precondition | Band absent; L5 Block 3 |
| M8 | Teammate flag → 100% → deleted | S | Document / first hire's first minute / floor / you won't notice Patina | Completes decision 9; retires R125 exception | None; right copy reaches right person | `first_document_opened_at`; does `1a94f78f` return |

Order if approved: M7(a), M8 (hours); M1, M4 (a day); M2 (a day); M5 (two days); M3, M6 (a week each). M7(b) waits on V2. Nothing flagged, per R125.

---

## 4. Stop-doing list, with the honest cost of each removal

1. **Auto-opening the WelcomeModal.** Cost: a designer with no setting-up call who never pulls the tour is taught nothing. §5 L5 tests the bet before we rely on it.
2. **The setup checklist and Desk whisper.** Cost: the only in-product invite nudge at the customer moment; carried by the People room and the R133 call. If those calls are not happening (08 G6), a real loss.
3. **The ten-email spine and ten Post notes.** Cost: ten pieces of Leah-voice copy; E10's `{{firsts_summary}}` was a good idea sent to seats that left (03 §3.2); its on-ramps are shut (08 G7). The E7/E8 `?sheet=` alias chain (01 §7) becomes dead code.
4. **Rendering the Pledge band.** Cost: the product's most hopeful line. VISION §3 says it is not ours to say yet.
5. **`weekly-pulse-drafts-friday`.** 156 drafts, 2 sent, 11 weeks (03 §6.3). Off until a studio asks. Cost: Leah's three drafts stay unsent; this is Patina generating work (03 §8 item 6).
6. **The `/auth/signup` link and `/api/auth/register`.** Six fields, studio name discarded, lands on `/unauthorized` (01 §1b). Replace with "Patina is by invitation." Cost: none — never used (03 §1; 08 G12: hygiene, not a hook).
7. **Teaching the ceremonial path as the path.** Lead → Discovery stays right for a stranger; it stops being what the product assumes about a studio with eight houses. Cost: none to R4 (`Open a project` never lies to the timer).
8. **Citing simulated-Leah panels as evidence** (08 G3). A process rule, not code: nothing in a panel folder speaks for her until L5 is logged.
9. **Copy promising what the product cannot do** — "two minutes to set up" (E3), "your first ten minutes" (T0). Retired with M5; surviving copy is checked against a live install path before it sends.

Deliberately kept: `Capture a lead`, Discovery for a new client, R4's floor at the send gate (only *where* it is satisfied moves), milestone emails, the People room, the Hours ledger, the R133 calls. Those are the gives.

---

## 5. Learn first — runnable this month, in the order it unblocks moves

- **L1 — Run Leah Session 05, Blocks 1 and 3, this week (40 minutes).** The one-pager and blank template exist (`docs/design/the-document/leah-session-05-*`). Block 1 gives "manual ways" its referent (08 G3, G4) and decides whether `Open a project` is the right door; Block 3 gates M7. Log it as the L5 DECISIONS entry. Unblocks M2, M5, M7.
- **L2 — One screenshot from Leah: how she tracks the houses not in Patina.** A text, five minutes (08 G4). A spreadsheet means M6's columns mirror its headers; an inbox means M3 matters more than M6.
- **L3 — Kody names the studios behind the sentence, and names `1a94f78f`** (08 G1; §3 Q1–Q2). If a real hire, a 20-minute call with them is the most valuable interview available and sets M8's urgency.
- **L4 — Kody writes the setting-up call as run, or records that it has not been run** (R133; 08 G6). M4 assumes the call carries the invite nudge; M7(c) puts the price in it. If "the invite went out and the drip took over" is the answer, that is the finding and M4 waits.
- **L5 — A stopwatch pass:** Leah, or Kody at her desk, moves one existing house in via `Open a project` on a bare Desk and draws its next invoice. Thirty minutes. Replaces 02 §4's field-count estimate with a measured number for exactly the job M2/M3 claim to shorten, and tests M1's bet on a real person.
- **L6 — The measurement precondition.** `designer_funnel` and `conversion_funnel` filter on names the triggers never write (`project_create` vs `project_created`; 03 §5.1–5.2); `automation-processor` writes no `job_runs` (03 §6.5). One S migration and one processor change. Without it nothing in §6 reads before and after (08 G9). Prerequisite, not follow-up.

M3 and M6 wait on L1 and L2. M1, M4, M7(a), M8 and the stop-doing items are cheap and reversible enough to land alongside.

---

## 6. Metrics — no dashboard for the studio; internal row lists only

Nothing is shown to the studio. Every number is a row list Kody reads (V11: a total is front matter for its rows; VISION §6: sessions, tour completion, drip opens are never success).

1. **The second-house count.** `projects` at Middle West's `studio_id`, weekly, against Leah's stated live houses from L1. The one metric the proposal is for.
2. **Day-0 write, per seat.** For each new member: did `client_added`, `project_created`, `invoice_sent`, or `hours_logged` fire in `engagement_events` (00291, trigger-written) within 24h of `auth.users.created_at`? A yes/no list, never a percentage — n is single digits (03 §1).
3. **Papers out.** Middle West `proposals` by status and `invoices` sent, weekly. The first `proposal_sent` for `ce3aee90` is M3's test.
4. **Refusals at the door.** Every send-RPC `check_violation` logged to `engagement_events` (`send_refused`, reason text). Unknowable today; a shrinking list after M3.
5. **Exports taken.** `studio_export_taken` per studio. A studio that exports and stays is the promise working.
6. **Replies to the one question.** Counted by hand.
7. **Read once.** `help.tour.started` and the 2026-09-03 `document_zone_flight` — read once after M1/M2, then retired from attention. Falling is expected; rising is a signal to fix something (04 §b 10).
8. **Precondition.** L6, or none of this is trustworthy. `notification_log.opened_at` stays null (03 §3.4); do not chase it.

---

## 7. Risks

- **Right for Leah, wrong for the next studio.** n=1. A studio with no work in flight and no call gets a bare Desk with no tour and no checklist. L5 tests one person; the second studio is the real test. M1 and M4 are one-line reverts.
- **Subtraction reads as "nothing shipped."** The second-house count is the answer, and it is slow.
- **M4 removes the invite nudge at the customer moment.** L4 gates it.
- **M3 can become a wizard in a sheet.** R96/R134's line: one sheet, one precondition, never a step counter.
- **M5 loads Kody.** Replies need a human. Minutes at three seats a month; a job at ten studios. The Superhuman shape (06 §2) — right for now, but a person, not a product.
- **M6 is a new surface carrying cost basis.** Owner-only RLS, formula guard, no share path. Review as a security change.
- **M7 without a number looks evasive.** It does not ship without V2.
- **The measurement precondition gets skipped again** (04 §c). L6 is a migration, not a promise.
- **Leah's numbers are seven-week-old row counts** (last write 09-14, 03 §2). Re-read before citing to her.

## 8. Parked as side journeys under this lens

Any import path (the FF&E PDF extractor door, contacts CSV, Pinterest) — real, another lens's, and "bring your book" needs its own ruling first (04 §a 1n). Calendar/ICS — the most-cited gap (02 §1.8), a new integration, not subtraction. Patina Field or the client app in month one — unproven on the only customer (08 G7, G8; 06 §6). Video walkthroughs — zero recorded (04 §a 1o), and more teaching.
