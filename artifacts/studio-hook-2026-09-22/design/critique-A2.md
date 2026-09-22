# Critique — Proposal A2 "The system does the next step"

**Critic:** adversarial reviewer, other model family. **Date:** 2026-09-22. **Repo:** `main` @ `966d6ca67`.
**Read in full:** `design/proposal-A2.html` (the only A2 file — no `proposal-A2.md` exists; the proposal's own risks section says why) and research reports 01–08. Code claims below were checked by opening the file; every citation is `path:line` on this checkout.

**Legend.** Severity: BLOCKING (the move cannot proceed as written) · MAJOR (a load-bearing premise, cost, or ruling reading is wrong) · MINOR. Confidence: HIGH (read the file/ruling) · MEDIUM (verified parts, inferred whole) · LOW.

---

## 0. Verdict in five sentences

A2 is the most honest of the proposals I would expect to see — it withdraws the dossier's Kody-as-retained-seat inference, refuses to invent Leah's workflow, labels every minute as a hypothesis, and stays inside R94/R97/R133/V11 and the no-automated-sends rule. Its central bet (prepare one source-backed next paper, no migration, no tour) is well-aimed at the switching-cost diagnosis lanes 06 §7–8 support. But two of its seven moves rest on premises the code contradicts: the hours→invoice bridge A2-4 proposes to build already ships (R75 "Bill week → Accounts" → composer → `claim_time_entries`), and the Field Line correction replies A2-3 proposes to draft-with-human-approval already fire automatically inside the consent fence. A third pattern — "system prepares a draft, tells the designer" — is already licensed and shipped for deposit invoices (00274/00280) and the proposal never notices, which inflates A2-4/A2-6/A2-7 from "extend a shipped pattern" to three M/L builds. What survives is the Learn-first block, A2-1 reframed as a new concierge call (not R133), and A2-2 as the one genuinely missing door — with the caveat that the whole month's proof makes Kody the preparer and Leah the reviewer, which bypasses the first hire the vision names as the customer moment.

---

## 1. Findings by move

### A2-1 · Name the handoff, not the setup

| # | Severity | Conf. | Finding |
|---|---|---|---|
| 1.1 | MAJOR | HIGH | **"Change the content of Kody's existing R133 calls" presumes calls that may never have run.** R133 (`docs/design/the-document/DECISIONS.md:10687-10690`) licenses exactly two calls at two moments: a setting-up conversation "in her first two days" and a handoff conversation "on the day she accepts the invite." Leah is 7 weeks in (org created 2026-08-03, 03 §1); her colleague `1a94f78f` accepted 09-04 and has been dormant 18 days (03 §2.1). Both R133 moments have passed, and 08 G6 records no script and no evidence any R133 call happened. What A2-1 actually describes is a **new recurring call** ("what has to leave your studio this week"). That is fine — R133 constrains, it does not forbid other calls — but the proposal's "implements R133" claim is inaccurate and hides that this is a new doctrine needing its own ruling line. |
| 1.2 | MAJOR | MEDIUM | **The continuation bar depends on a seat nobody can name.** "Leah's colleague using the second paper without Kody re-explaining it" requires either `1a94f78f` (unknown, dormant since 09-11 per 03 §2.2) or Kody himself (`19e7ae9b`, the admin/Studio Manager at Middle West — 08 G1). If the colleague is Kody, the bar is self-graded. The proposal lists identifying the designer under Learn-first but does not make the bar conditional on that identity. |
| 1.3 | MINOR | HIGH | Cost S is right (zero code). But the "existing door" cited — `open-project-sheet.tsx` (4 fields: Title, Household, Budget band, Start date; 01 §2) — creates a project, not a paper that "must leave the studio this week." An invoice or agreement leaving the studio still hits the R4/00575 send gate (roster relationship, service terms, rates, ceiling, named fee — 01 §2 row 13). A2-1 should say which paper it expects and whether the five preconditions are already true for Middle West. |
| 1.4 | MINOR | MEDIUM | "Count call preparation and interruptions … report negative operational savings" is good discipline. But the comparison baseline — "the preceding comparable handoff" — does not exist as a record for a studio with one project and a dormant hire. First-opportunity result will be an estimate against an untimed memory; the proposal's own metrics section says to mark such baselines as estimates, so say it here too. |

**Survives:** yes, reframed as "a new weekly what-must-leave call, ruled separately from R133", with the bar made conditional on who the colleague is.

### A2-2 · Receive the reply where she already has it

| # | Severity | Conf. | Finding |
|---|---|---|---|
| 2.1 | — | HIGH | **Schema premise holds.** `vendor_quote_requests` gained `sent_at` (00261:15-16) and configuration-snapshot columns (00403:372-390); still no quoted price, lead time, or attachment column. `quote-request-send/index.ts:201` sets `replyTo: designerEmail`. The vendor's reply really does land in her mail client with nowhere to go. |
| 2.2 | MAJOR | MEDIUM | **The proposal cites the wrong precedent and over-constrains itself.** It imports the *paperwork door* (`paperwork-upload/core.ts`, V10) and says "vendor quote writes require an explicit amendment before building that door." But `trade-rfq-send/index.ts:4-5` already "opens their single-use response form on the client portal" (00424) — a vendor party writing a *quote response* into Patina, built before V10 was ruled on 09-11. Either V10's "first place a vendor gets a write path" is narrower than shipped reality, or trade RFQ responses are the licensed precedent for a furniture-vendor response form. Either way, the nearer precedent is a response *form*, not a compliance *upload*, and the ruling gate A2-2 imposes on itself may not be needed for the studio-submits-one-attachment variant at all. |
| 2.3 | MAJOR | HIGH | **Cost L is, if anything, understated, and the L is infrastructure, not code.** Lane 02 §1.1 verified there is no inbound-email parser anywhere in the tree — the only inbound rail is SMS. A "project-scoped forwarding door" means a receiving domain/MX, an inbound webhook (Resend inbound or equivalent), sender quarantine, attachment storage, and a new edge function. None of that has a precedent in the repo. The proposal correctly defers it to "after the experiment", but the table presents it as one L move beside A2-4's L, and they are not the same size. |
| 2.4 | MINOR | HIGH | The "dormant FF&E PDF extractor is not assumed to parse arbitrary vendor quotes" caveat is correct and welcome — `project-ffe-document-extract/index.ts` is a 70-line shell over a Claude tool call built for a project FF&E PDF. Good. |
| 2.5 | MINOR | MEDIUM | Time claim "12–17 minutes → 4–5 minutes for a ten-line quote" has no derivation. Lane 02 §4 row 3 derived PO reconstruction minutes from field counts; nothing in the dossier times a quote transcription. The proposal labels it a hypothesis, which is honest, but a hypothesis with a specific range reads as a measurement in a leadership table. |
| 2.6 | MINOR | MEDIUM | Middle West has **0 products** and **0 contacts** (03 §2). A furniture-vendor quote reply presupposes a vendor on the roster and an FF&E line to update. The "this week" test is very likely to return zero opportunities for the only real studio, which the proposal concedes but still places second in the table. |

**Survives:** yes — this is the one door in the seven that genuinely does not exist. Fix the precedent (trade-RFQ response form, not paperwork upload), separate the concierge trial (S) from the forwarding infrastructure (L+), and drop the self-imposed V10 amendment gate unless V10's author confirms it applies.

### A2-3 · Finish the field-hours handoff

| # | Severity | Conf. | Finding |
|---|---|---|---|
| 3.1 | BLOCKING | HIGH | **The "receipt-to-studio-review path" is not incomplete; it is complete and flag-gated, and the correction question already exists as an automated reply.** `field-desk.tsx:1-20, 103-109` — reported hours are "its own population … each one a proposal to accept, reject, or book to a teammate," rendered by `TimeReportCard` (`time-report-card.tsx:10-18`: Accept / Not right / Book to a teammate) over `useFieldTimeReportQueue` and `field_time_reports` (00653), behind `field-line-time-reports`. On the inbound side `sms-inbound/pipeline.ts:2833-2915` (`hoursReply`) already replies automatically to an out-of-range number ("That's more hours than a day holds. Reply with a number between 0 and 16 — Ref NN"), routes an ambiguous reference to `ref_clarify`, and — as of `b1297b4c5` (2026-09-22, US-6) — answers off-grammar text ("about 6 and a half") with a templated confirm-by-digit. These are the "project- and date-specific correction request" A2-3 proposes to draft and hold for human send approval. Building that would make the rail *slower* than it is today, and mislabels replies the rail already sends inside its consent/suppression fence as "new external sends." |
| 3.2 | MAJOR | HIGH | **Cost M is wrong; the remaining work is a PostHog flag flip and an observation.** Nothing in A2-3's "what" survives contact with the code except "verify the flag." That is S at most, and it is not engineering. |
| 3.3 | MAJOR | HIGH | **There has never been a trade report to review.** `field_time_reports` = 0 rows; `sms_messages` last row 2026-08-19; Middle West has 0 field parties (03 §6.4, §2). `FIELD_LINE_PHASE=3` was set 2026-09-21 (02 §1.8). The proposal says "with no eligible report, record zero" — correct — but then the move contributes nothing to a September proof and should not sit third in the table with a 4–6 minute claim. |
| 3.4 | MINOR | MEDIUM | **"V11/HT-32 keeps hours review in the drawer"** — but the shipped `TimeReportCard` lives on the Desk (`field-desk.tsx`, the cross-project field rollup), and its own copy says "Nothing is on anyone's hours until you book it" — i.e. it is a triage card, and booking sends the hour to the ledger. The proposal's stated constraint would, if enforced literally, require moving a shipped card. State HT-32 as "booked hours land in the drawer ledger" rather than as a placement rule for the triage card. |

**Survives:** no, as a move. It reduces to one line in Learn-first: "flip `field-line-time-reports` for Middle West if a consenting trade exists; otherwise note the rail has never carried a report."

### A2-4 · Draw the bill from approved work

| # | Severity | Conf. | Finding |
|---|---|---|---|
| 4.1 | BLOCKING | HIGH | **The hours→invoice bridge the move proposes to build already ships.** `hours-ledger.tsx:20-25`: R75 "Bill week → Accounts" (renamed under HT-20/HT-21) "opens the composer with the shown week's unbilled entries pre-ticked (per-entry include/exclude + resolved rates live there; one act, review before draft)"; call sites `:922` and `:1251` (`openInvoiceComposer({ initialTimeEntryIds … })`). `invoice-composer.tsx:12-21` documents the `initialTimeEntryIds` prefill contract; `:433-442` creates the draft with `time_entry_ids` metadata and then calls `claim_time_entries` (00595:136-156), which "stamps invoice_id on the subset of p_entry_ids still unbilled, billable, [authorized]"; the 00177 `guard_invoiced_time_entry` then freezes the rows. `project_unbilled_time` (00596:69-80) already selects "completed, billable, authorized, un-invoiced entries with ONE rate source." The dossier's premise — 02 §1.6 "`grep -n 'time_entr\|hours'` over `use-invoices.ts` returns nothing … the hours ledger and the invoice composer do not meet" — is a wrong-file grep; the hook is `use-time-tracking.ts:843-858` and the composer, not `use-invoices.ts`. The proposal repeats the error verbatim ("the invoice hooks do not consume them"). |
| 4.2 | MAJOR | HIGH | **A2-4's stated invariants contradict the shipped design.** "Draft creation must not mark hours invoiced … reservations must be releasable when a draft is rejected." Shipped behaviour (`invoice-composer.tsx:19-25`): the draft *does* claim the entries immediately; release is by deleting the draft (`fk_time_entries_invoice ON DELETE SET NULL`); the inline error names the draft id if the compensation fails. That was a deliberate HT-20/21 decision. A2-4 would have to either reverse it (a ruling, not a feature) or accept it — the proposal does neither because it does not know it exists. |
| 4.3 | MAJOR | HIGH | **Cost L is wrong.** What remains after 4.1 is: run the existing composer path at a chosen cutoff without Leah opening the ledger, i.e. an agent task that prepares a draft through the same RPCs and lands it `awaiting_review`. The precedent is already shipped for deposit invoices — 00274 (`draft_invoice_from_milestone` auto-drafts on signing, "still draft-only — the designer reviews and sends through the existing Issue & Send flow") and 00280 (deposit draft notification). This is S/M, and mostly a scheduling + notification question. |
| 4.4 | MAJOR | HIGH | **Leah has two time entries in seven weeks** (03 §2: Middle West "Hours 2"; §4: `hours_logged` never fired for `ce3aee90`, day 0 for `19e7ae9b` — Kody). "Ten actual approved entries" this week is not a plausible opportunity. The proposal's fixed-fee escape hatch is correct; the move should have been parked on that evidence before it was written up as L. |
| 4.5 | MINOR | HIGH | "Reuse the existing invoice send/print surfaces and hours CSV export" — correct; `invoices/[invoiceId]/print`, `invoice-send`, `time-export.ts` all exist (02 §1.6). The CSV already carries `Billing State / Invoiced / Invoice #` (`time-export.ts:54-69`), which is itself evidence the linkage exists. |

**Survives:** no, as written. Replace with: "At a cutoff Leah names, an agent task runs the shipped R75 path and parks the draft `awaiting_review`, on the 00274/00280 precedent — only if she bills time (she currently does not)."

### A2-5 · Prepare the approved order, not an automatic purchase

| # | Severity | Conf. | Finding |
|---|---|---|---|
| 5.1 | — | HIGH | No approval→PO auto-draft exists (grep over migrations/functions/hooks: the only auto-draft is the deposit invoice, 00274). `create_purchase_order` (`use-procurement.ts:491-516`) takes vendorId + ffeItemIds + 9 more inputs. The "inspect existing auto-draft coverage first" caveat is satisfied: there is none. |
| 5.2 | MAJOR | HIGH | **Vendor identity is structurally missing on the likely source rows.** `00445:53` (`IF v_item.vendor_id IS NULL THEN …`) — a PO needs a vendor FK on the FF&E item; Library-imported products carry no vendor FK (02 §1.3, `route.ts:112-114`: a mapped vendor *name* is provenance only). So "prepare a PO candidate from verified facts" will, for anything that entered through the one bulk import, fall to the "missing identity" branch every time. The move is really "draft a missing-vendor question," not a PO. |
| 5.3 | MAJOR | HIGH | **Zero opportunities in production, and the proposal knows it.** 0 `purchase_orders`, 31 `project_ffe_items` instance-wide, Middle West 0 products (03 §6.4, §2). "Park it" is the right call; including it as a costed M move with a 6–10 minute claim in the leadership table is scope inflation. |
| 5.4 | MINOR | HIGH | V1 (margin pocket) and V8 handling is correct and explicit. No automated send. Good. |

**Survives:** as a parked hypothesis only. Do not cost it this month.

### A2-6 · Close the paid handoff

| # | Severity | Conf. | Finding |
|---|---|---|---|
| 6.1 | — | HIGH | Hook points exist: `stripe-webhook/index.ts:18-20` (the 00178 AFTER trigger owns the rollup), `:442-560` (designer in_app "INV-x paid — $y"), `:2263` (`enqueueAgentTask … 'fulfillment_intake'`). Internal payable truth is authoritative; the proposal's boundary reading is correct. |
| 6.2 | MAJOR | MEDIUM | **"The next instruction already agreed for that job" has nowhere to live.** No per-job next-obligation object exists (grep `next_action|next_step|next_obligation` over migrations → only automations/onboarding/pipeline-board hits). Recording "the mapping during the real-job call" means a new per-project field or table, which is a lightweight task manager — the exact thing `stop_doing` forbids ("a second inbox/task manager"). The proposal should name where the agreed next action is stored and why that is not a task list. |
| 6.3 | MINOR | MEDIUM | Cost M is plausible only if 6.2 is answered cheaply (e.g. a note on the invoice or the project's existing schedule milestone). Otherwise it grows. |
| 6.4 | MINOR | HIGH | Middle West has `payment_received` day 42 and 10 invoices, paid count unknown per studio (03 §6.2 is instance-wide and dominated by Kody's Middle Studio, 32 of 42 invoices). "One real design invoice paid this week" is plausible for Leah; this is the most likely September opportunity after A2-1. |

**Survives:** yes, narrowly — as "after payment, prepare the one draft that was already named on the invoice/project," provided 6.2 is resolved without a new task object.

### A2-7 · Deliver less review work

| # | Severity | Conf. | Finding |
|---|---|---|---|
| 7.1 | MAJOR | HIGH | **The proposal over-reads "no automated external sends" and thereby turns a feature into Kody's inbox.** Agent OS's rule (CLAUDE.md, `agent-roles-runbook.md`) is that drafts land `awaiting_review` rather than going to clients/vendors. Studio-facing notifications already fire automatically today — 00280 notifies the designer when a deposit invoice auto-drafts; `stripe-webhook` writes the designer's "INV-x paid" in_app row; 123 invoice-chasing notifications reached designers (03 §3.4). A "draft ready" in_app/email to the *studio* is not an external send. By forbidding it ("This includes a 'draft ready' email or text to the studio"), A2-7 becomes "Kody sends one message a day by hand" — a process, not an M-cost build. |
| 7.2 | MINOR | MEDIUM | **"At most one delivery message per reviewer per day"** is a daily cadence on a weekly-intent product (06 §12: "forcing daily engagement on a weekly product feels invasive"). The cap is framed as a ceiling, but a ceiling of one-per-day still designs for daily. Make it one per obligation, full stop. |
| 7.3 | MINOR | HIGH | **Delivery cannot be measured as designed.** `notification_log` has 0 `opened_at` / 0 `clicked_at` across 400 rows (03 §3.4). "Reject delivery that sends the studio hunting through the Desk" can only be learned by asking her; the proposal's metrics section says so generally but A2-7's test reads as if receipt-to-locate can be timed from the product. |
| 7.4 | MINOR | HIGH | The stall rule ("stop generating an obligation's candidates when review stalls, preserve the record") is the one design idea in the proposal that directly answers the 156-unsent-pulse failure (03 §6.3). Keep it, and apply it retroactively to the pulse cron as a separate hygiene item. |

**Survives:** as a *contract* (one live candidate per obligation, invalidate on source change, stop on stall), not as a move. The delivery mechanism should be the shipped 00280 pattern (in_app + optional email to the studio member), which needs no new ruling.

---

## 2. Cross-cutting findings

| # | Severity | Conf. | Finding |
|---|---|---|---|
| X1 | MAJOR | HIGH | **The proposal never notices that "system prepares a draft, tells the designer, designer reviews and sends" is already shipped and licensed** — 00274 (deposit invoice auto-draft on signing, "Still draft-only"), 00280 (deposit draft notification), `draft_invoice_from_milestone` (00206/R34). That precedent collapses A2-4, A2-6 and A2-7 into "extend a shipped pattern to one more trigger," which changes both their cost (L/M/M → S/M) and their ruling exposure (none new). The evidence key claims all eight reports were read in full; none of the eight mentions 00274/00280 either, so this is a dossier gap the proposal inherited rather than caused — but the proposal cites `stripe-webhook/index.ts` as an "existing boundary inspected," and that file's header (`:18-20`) points at the 00178 trigger that 00274 sits beside. |
| X2 | MAJOR | HIGH | **What it makes worse for the owner delegating for the first time: the hire disappears.** Every move routes *preparation* to Kody/system and *review* to "a named reviewer" — in practice Leah. The first hire — VISION's customer moment — neither prepares the paper nor learns the studio's way of preparing it (contrast 05 §8 Gather "teaches someone how to write a spec"; 07 §6 IDCO "the new hire can read the process"). A2 optimises the owner's review minutes and leaves the hire with nothing to do in Patina, which is the exact shape of `1a94f78f` going dark. The proposal's own vision-test line for A2-1 ("owner handing current work to a first colleague") is not what the mechanics deliver. |
| X3 | MAJOR | MEDIUM | **Concierge is the load-bearing resource and has no stop rule.** For 23–29 September Kody is interviewer, preparer, deliverer, reviewer-of-sends, and observer, while also being the admin seat at Middle West. 06 §2 (Superhuman) is cited for concierge onboarding but its lesson — three years to migrate the calls into product, and a deliberate graduation — is absent. The proposal says "this month proves the handoff manually" and never says what happens to Leah's expectation when the manual preparation stops. |
| X4 | MAJOR | HIGH | **The month's proof has a very high chance of zero qualifying opportunities across five of seven moves.** Middle West: 1 project, 2 hours entries, 0 products, 0 contacts, 0 field parties, 0 POs. A2-2/3/4/5 each need a row type Leah has never created. Only A2-1 (a paper leaving the studio) and A2-6 (an invoice being paid) have plausible September triggers. The proposal hedges each one individually but presents a seven-row table to leadership; the honest table has two rows. |
| X5 | MINOR | HIGH | **Time-saved claims are invented ranges, correctly labelled.** Every minute figure is a "test target"; none is derived from a field count or a timing. That is more honest than the dossier's 02 §4 numbers (which at least show their arithmetic). The risk is the leadership table, where "Provisional net studio saving" reads as a column of measurements. Suggest replacing with the trigger condition and "0 until observed." |
| X6 | MINOR | HIGH | **Vocabulary is clean.** No "AI" anywhere in the HTML; "automated/automation" appears only in prohibitions; "dashboard/badge/engagement" only in refusals. "Designer-Taught Intelligence" is not used either, but nothing is described as intelligent, so nothing is mislabelled. |
| X7 | MINOR | HIGH | **Ruling reads are mostly accurate.** R94/R97/R129/R131 read correctly (04 §b). V11's test is read correctly and A2-4 satisfies it (entries beside lines). V10 is quoted correctly as compliance-only — but see 2.2 on whether it is the operative precedent. R125 read correctly. "R133 calls remain personal" — correct, but see 1.1. |
| X8 | MINOR | HIGH | **Learn-first is the strongest section and is fully consistent with 08 G1–G7.** Block 1 (25 min) + Block 3 (15 min) = 40 minutes matches `leah-session-05-one-pager.md:7`. The refusal to run "another simulated Leah panel" directly answers 08 G3. Asking for the studios behind the problem statement answers G1. Verifying flag/gate state answers G7/G10-9. |
| X9 | MINOR | HIGH | **Format.** The task named `proposal-A2.md`; only `proposal-A2.html` exists. The proposal's risks section explains it (session no-Markdown-report instruction). A reviewer comparing four proposals gets two `.md` and two `.html`; the text extracted cleanly, so no content was lost. Note only. |
| X10 | MINOR | MEDIUM | **The Pledge exposure is acknowledged and then left in place for the trial.** "The exposed Pledge needs a separate counsel-led correction" — but Leah will open the Accounts book during a September invoice trial and see "The Pledge, returned to you · $0.00" (08 G5, `accounts-earnings-page.tsx:110-127`). A trial that puts a legal-gated band in front of the one real customer should ask for the band to be flagged off first, not "separately." |
| X11 | MINOR | MEDIUM | **The drip keeps arriving to trial participants.** `19e7ae9b` (Kody) next email 09-25, `1a94f78f` next 09-25 (03 §3.2). A weekly curriculum email landing mid-trial confounds "would you choose this help again." Pause enrollments for Middle West seats for the window, or log the sends as interruptions. |

---

## 3. What is missing

1. **The hire's own arrival.** The cheapest verified gap tied to the exact customer moment — `onboarding-teammate-persona` at 0% for Leah's studio, so her hire got the owner's copy; accept-invite is the best-built arrival in the product (01 §1c, §9 item 9) — is not mentioned. A2 treats the hire as a reviewer target, not a person with a first session.
2. **The shipped auto-draft precedent** (00274/00280/00206) as the template for every "prepare the next paper" move — see X1.
3. **Who `1a94f78f` is**, as an explicit precondition of A2-1's continuation bar rather than a Learn-first aside.
4. **A concierge exit.** When does Kody stop preparing papers, and what does Leah see the week after? (06 §2, §3 both say the manual phase is for learning what to build, with a named stop signal.)
5. **Which paper A2-1 expects to leave the studio**, and whether the 00575 send preconditions are already true at Middle West (they were the blocker in 01 §2 row 13).
6. **A single "eligible opportunity" ledger for the month** that lists, per move, the row Leah would have to have created for the move to fire — it would have shown five of seven at zero before the table was written.
7. **A second studio.** With n=1 the "two natural comparable opportunities" bar may be unmeetable; the proposal says so in metrics but does not ask Kody to name one referred studio as a fallback subject.
8. **The trade-RFQ response form** as the nearer precedent for A2-2 (see 2.2).
9. **Reading the events that already exist** — `document_zone_flight` (new definition, 04 §c) has never been queried since 09-03; it would show whether Leah's document sessions are thrash or work, for free, before any log is built.

---

## 4. Which moves genuinely survive, and why

| Move | Survives? | Why |
|---|---|---|
| Learn-first block | **Yes, unchanged** | Directly closes 08 G1–G7; refuses simulated Leah; 40 minutes is the correct instrument. Run it first. |
| A2-1 | **Yes, reframed** | Zero code, real September trigger (a paper leaving the studio), correct vision test. Rename it as a new weekly concierge call ruled beside R133, and gate the bar on who the colleague is. |
| A2-2 | **Yes, split** | The only door in the seven that does not exist in any form. Concierge trial = S; forwarding door = L+ infrastructure with no repo precedent. Cite trade-RFQ (00424), not paperwork-upload. |
| A2-3 | **No** | Path is built (`field_time_reports`, `TimeReportCard`), replies are automated (`hoursReply`, US-6). Reduces to a flag check. |
| A2-4 | **No, as written** | Bridge ships (R75 → composer → `claim_time_entries`). Replace with "run the shipped path at a cutoff, on the 00274/00280 precedent," and only if Leah bills time. |
| A2-5 | **Parked** | 0 POs, 0 products, vendor FK missing on imported rows. Correctly self-parked; remove from the costed table. |
| A2-6 | **Yes, narrowly** | Hooks exist; likeliest September opportunity after A2-1. Must answer where "the agreed next action" is stored without a task object. |
| A2-7 | **As a contract, not a move** | One-candidate-per-obligation + stop-on-stall is the right answer to the pulse pile. Delivery = the shipped 00280 in_app pattern; drop the studio-facing "no draft-ready message" over-constraint and the daily cap. |

**Net:** the honest A2 is Learn-first + A2-1 + A2-6 this month, A2-2 (concierge) if a quote actually arrives, A2-7's contract applied to whichever draft is produced, and A2-3/A2-4/A2-5 struck from the leadership table with their reasons.
