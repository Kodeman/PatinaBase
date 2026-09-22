# Red team — program-v1 "One Job Less Work"

**Reviewer:** Claude Fable, adversarial, separate context from the author (GPT-6 Astra). **Date:** 2026-09-22. **Repo:** `main` @ `966d6ca67`.
**Read in full:** `design/program-v1.html` (extracted text), research 01/02/03/04/08, `critique-A1.md`, `critique-A2.md`, `proposal-F1.md`, `proposal-F2.md`; research 05 §10, 06 §§2–3, 6–8, 07 §§3, 6–7 by cited section; opening sections of `proposal-A1.html` / `proposal-A2.html` for origin tracing.
**Code re-read this session (to check the program's own "factual premises"):** `designer-invite/index.ts:19-23,182-235`; `packages/email/src/templates/designer-invite.tsx:35`; `accounts-earnings-page.tsx:100-130` + `accounts-book.tsx:34,190`; `00295:255-300`; `00559`; `invoice-composer.tsx:1-40,240-442`; `hours-ledger.tsx:20,63,922,934,1251`; `00618` header; `draft-proposal-opener.tsx` header; `open-project-sheet.tsx` header; `project_ffe_items` Row in `packages/supabase/src/database.types.ts`; `spec-pdf/index.ts:1-24`; `time-export.ts:1-30`; `project-ffe-document-extract/lib.ts:1-30,73` + `index.ts:43-47`; `00437:14,141,336`; `00435/00439/00448` (grep); `00274` header; `desk/page.tsx:165,295,359-374`; `invoice-send/index.ts:1-40`; `VISION.md` §§1–7; `VISION-DECISIONS.md` V11; `DECISIONS.md` R133; `leah-session-05-one-pager.md`.

Severity: **blocking / major / minor**. Confidence: **high / medium / low**. Nothing filtered by severity.

---

## 0. Verdict

The program is the most evidence-disciplined document in the folder. Every one of its twenty-seven "checkable premises" that I could reach in code holds (§6 below). It withdraws the dossier's bad inferences, respects R94/R97/R133/V11, invents no tour, sample, dashboard, or send, and refuses to claim minutes it has not timed.

Its failure is aim, not honesty. Four things:

1. **It trials the loop Leah already completes.** P5 prefers "a genuinely due, not-yet-issued invoice." Middle West already invoices in Patina (10 invoices). An invoice on her one Patina house measures nothing about "manual ways"; the phenomenon in the brief is only observable on a house that is *not* in Patina. The program conflates the foothold (evidence she is willing) with the test task (must currently live elsewhere).
2. **It sequences an FF&E export the only real studio cannot use (P3, M) ahead of the one S move that touches her work (P5).** Middle West has 0 products; the 31 FF&E items are instance-wide and mostly Kody's. Leah's data in Patina is 13 clients, 10 invoices, payments, 1 project, 6 proposals. "Return the working slice" picked the wrong slice for the only case.
3. **It gates Leah's intake on commercial rulings (V1/V2/V6, pilot terms, cancellation) that have been open since 09-01 and only matter for strangers.** P2's metric is unconditional: "Approved terms precede intake." For a co-founder that gate is a stall, not a safeguard.
4. **It names Kody's live admin seat at Middle West (`19e7ae9b`) in the diagnosis and then never designs around it.** The continuation rule — "the later [opportunity] without founder preparation" — is unverifiable while the founder holds a working seat in the subject studio with no write-audit rule for the trial window.

Fix those four and the program is approvable. The deck's one persuasive slide is the Middle West row with an empty column (§8).

---

## 1. Diagnosis — is it honest about the evidence?

**Mostly, yes.** It correctly says: no third-party studio in prod (03 §1); the retained studio-manager is Kody (08 G1); "manual ways" is unobserved (08 G4); L5 never ran (08 G3); nothing can measure a fix (03 §5, 08 G9); Leah's older observed flight was completeness-seeking (L3, 08 G3). The "zero proposals ever signed" withdrawal is fair — 03 §6.1 shows 20 `accepted`, and `proposal_signed` fired once; the status vocabulary does not prove no signature ever occurred.

**Three things it leaves out that change the program:**

| # | Gap | Severity · conf. | Why it matters |
|---|---|---|---|
| D1 | **The 10 Middle West invoices are not attributed.** 03 §4 shows `invoice_sent` fired for both `ce3aee90` (Leah, day 37) and `19e7ae9b` (Kody, day 12). The diagnosis says "records include founder assistance" and then treats "invoicing is the loop she completes" as Leah's habit. One read-only query (`invoices` by `designer_id`/creator for Middle West) decides whether the foothold is hers or Kody's. Lane 03 proved the Management-API read path works. | major · high | If most of the 10 were drawn by Kody's seat, the program's only foothold is the founder doing her billing — the exact inference it withdrew for retention. |
| D2 | **It never says the obvious sentence: the co-founder has not moved her second house in.** Middle West, 7 weeks, 1 project, 26 sign-in days (03 §2.2). If the voice of the company will not move house #2 into The Document, no referred studio will. The program cuts "second-house activation target" (cut list item 8) as "optimizing the experiment." For Leah the second house is not a target with a number; it is the only adoption event that exists. | major · high | The program's readout has no row for the one thing leadership actually needs to know. |
| D3 | **"Billing is the strongest lead" and then two of six moves (P3, P6) are furniture-schedule moves.** The upside stream has no production footprint (0 POs, 0 concierge orders, 03 §6.4); Middle West has 0 products. The diagnosis and the move list disagree about which job. | major · high | Wave 2/3 engineering effort points at a job the only studio does not do. |

Minor: the diagnosis's "QA accounts cannot substantiate customer churn" is right; it could also say plainly that `86cdd0aa` is `tester@patina.cloud` and `69063af4` was hand-neutralized (08 G1) so a reader does not re-derive the churn story from 03 §2.1.

---

## 2. Verdicts by move

### P1 · Watch the actual job — **KEEP** (with three additions)

Right first move; S; zero code; closes 08 G1–G4, G6. Vision/ruling reads are correct (R133 preserved as personal calls; Leah's late session named as separate research). The restricted case record is the right instrument given V11 and the dead analytics.

| # | Finding | Sev · conf | Fix |
|---|---|---|---|
| P1-a | Does not ask the one 20-minute question 08 G2 names: **how many houses are live at Middle West today, and where does each one live (tool/file)?** Learn-first bullet 1 asks Kody to identify referral cases; the asks section never asks Leah for her house count. It is the single datum that sizes the problem and picks the trial house. | major · high | Make it the first line of the Leah session and the first row of the case record. |
| P1-b | Does not ask for the **invoice attribution split** (D1). | major · high | Add one read-only query to learn-first before the session, so Kody walks in knowing whose habit invoicing is. |
| P1-c | "If authorized access becomes available, existing help/wayfinding events" — the access is one owed action: Kody completes the PostHog MCP OAuth (memory lists it as owed since 09-08). `document_zone_flight` (new definition) and `help.tour.*` have never been read since 09-03 (04 §c). Free diagnostic context, blocked on a browser click. | minor · high | Name the OAuth as a learn-first item with an owner, not a conditional. |
| P1-d | Premise "the activation bridge … can credit a record owner rather than the acting colleague" — plausible from 03 §4's `activation:<event>:<user_id>` key, but which `user_id` each of the ten 00291 triggers stamps (row owner vs `auth.uid()`) was not read by any lane or by me. | minor · medium | Read the ten trigger bodies once before relying on the per-actor caveat. |

### P2 · Tell the truth before the invitation — **MODIFY** (split; one premise wrong)

The trust finding is real and overdue: `designer-invite.tsx:35` — *"a quarter of our commission goes back to the designers who teach"* — is in the DB-seeded template (00293/00310/00404) that `designer-invite` renders (index.ts:23), and the Accounts band renders "the 25% Pledge" unflagged (`accounts-earnings-page.tsx:113-127`, mounted at `accounts-book.tsx:190` with no flag). VISION §3: no Pledge language public before counsel. Correct call.

| # | Finding | Sev · conf | Fix |
|---|---|---|---|
| P2-a | **Two different things share one gate.** (i) Removing legal-gated language is S and needs no ruling — VISION §3 already rules it; counsel gates *adding* Pledge language, not removing it. (ii) Inventing beta participation terms needs V2/V1/V6 and counsel. The program costs the pair M and writes "Approved terms precede intake" unconditionally, so Leah's 09-30 trial waits on rulings that have sat open since 09-01. | major · high | Ship (i) this week: edit the band, reseed the three templates that carry the line (`designer-invite.tsx`, `milestone-first-payment.tsx`, `onboarding-aesthete.tsx` — grep this session), redeploy `designer-invite`. Gate (ii) on *non-Leah* intake only. |
| P2-b | **Premise "changing shared steps is not a participant-specific pause" is true and irrelevant.** The per-enrollment mechanism exists: `sequence_enrollments.status` — `69063af4` was set `unsubscribed` by hand on 07-12 (03 §3.2, memory). Middle West's two active enrollments (`19e7ae9b`, `1a94f78f`, both next-step 09-25) can be paused with one audited row update each, on Kody's explicit ask. The program instead says "record participant sends as interruptions," which leaves a weekly curriculum email landing mid-trial (A2 critique X11). | major · high | Replace "needs an audited per-enrollment mechanism verified before use" with "pause the two Middle West enrollments by status for the trial window; resume after." |
| P2-c | Inventory scope names "invitation, welcome, help, and deployed email copy" but not the three templates by name; my grep found the commission line in exactly three. | minor · high | Name them so the disposition list is finite. |
| P2-d | Vision test lists the invitation as a surface. The invitation is not one of the three ranked surfaces; the test still passes via "before entrusting a live job / subscription trust." Fine, but say it is a pre-surface. | minor · low | Wording. |

### P3 · Return the working slice — **MODIFY** (wrong object; wrong wave)

The VISION §4 argument ("your data exports" is unmet — 02 §1.3, §6.3) is right and the money-boundary reads are right (spec-pdf excludes trade cost; `project_ffe_items` carries `trade_price_cents / unit_price_cents / markup_percent / line_total_cents / vendor_name / doc_code / eta` — verified). But:

| # | Finding | Sev · conf | Fix |
|---|---|---|---|
| P3-a | **The only real studio has nothing to export through this door.** Middle West: 0 products, 0 contacts; 31 FF&E items instance-wide, dominated by Kody's Middle Studio (26 projects). Leah's Patina data is clients (13), invoices (10), payments, 1 project, 6 proposals. A bounded FF&E export returns her an empty file. The program's own stated principle — "no evidence establishes that Leah needs …" — applies to P3 exactly as it applies to P6. | major · high | Re-scope Wave 2's portability move to the objects she has: verify what `invoices/[id]/print`, the hours CSV, and the per-user GDPR JSON (02 §1.1) actually return; if they do not give her invoices + payments + clients in a spreadsheet, that is the S–M export. Move the FF&E export to Wave 3, conditional on P1 observing a schedule she wants in Patina. |
| P3-b | Sequenced before P5 ("Portability precedes reliance on transferred schedule data") — but the trial transfers no schedule data. The program admits "invoice-only trials … need not wait for this exporter" and still lists P3 first in the wave. | major · high | Put P5 first; P3 (re-scoped) beside it, not ahead. |
| P3-c | Vision-test stream "prospective furniture integrity" is a stretch for a studio with no furniture in Patina. The honest stream is the subscription floor (no lock-in makes a fee honest — F2 M6 said this better). | minor · high | Wording. |
| P3-d | Unchanged and good: keep private costs out of client PDFs; authorization via the real ownership path, not the browser-side hours serializer; manifest of exclusions. | — | Keep. |

### P4 · Let the right person arrive — **KEEP as hygiene; demote from the wave**

Premises verified: `designer-invite` writes `display_name`, never `business_name` (index.ts:234-235); the provisioner COALESCEs `business_name` first and no-ops on any existing membership (00295:265-277); Desk shows *Open a project* (`desk/page.tsx:295`) and the first-touch note says *try "invoice"* (`:374`); teammate copy exists behind `onboarding-teammate-persona`.

| # | Finding | Sev · conf | Fix |
|---|---|---|---|
| P4-a | **Zero effect on Leah.** Middle West is already correctly named (03 §1). No new studio owner is scheduled before October. P4 is a correct S fix for the next invite, presented inside "Earn one handoff" as if it earns one. | minor · high | Move to a "before the next invite" hygiene list; keep out of the hook narrative. |
| P4-b | **Over-ceremonial teammate rollout.** The program requires a live flag read, then "request only the needed rollout" for "identified participants," and warns "domain targeting is not assumed to represent studio membership." Middle West's three seats are all `@middlewest.studio` (03 §2.1). Adding that domain to the existing flag condition is the participant-specific rollout, and it is the exact "0% → Leah's studio" step owed since 09-03 (04 §c). | minor · high | Say: add `@middlewest.studio` to the flag's existing domain condition after a live read; no new mechanism. |
| P4-c | The copy audit of the existing *Open a project* door ("observe existing-job discoverability first") is right and belongs in P1's session, not P4. | minor · medium | Fold into P1's observation script. |

### P5 · Finish the job with its next keeper — **MODIFY** (the core move; currently aimed at the wrong house)

This is the program. S, zero code, real trigger. Rulings read correctly (R133 untouched; designer's own Send is the human authorization; agent work via `enqueue_agent_task`; no practice project; claim-at-draft semantics of `claim_time_entries` respected — verified `invoice-composer.tsx:15-25`). The 00274/00280 auto-draft precedent is real (headers read).

| # | Finding | Sev · conf | Fix |
|---|---|---|---|
| P5-a | **The obligation must belong to a house that is not in Patina.** "Prefer a genuinely due, not-yet-issued invoice" on her one Patina project is business as usual — she has done it ten times. The brief's phenomenon ("pop back out into their manual ways to drive jobs") is only observable when the trial forces house #2 across the door: *Open a project* (4 fields, `open-project-sheet.tsx`) → draw the invoice → issue → send. That is F2-L5's stopwatch pass, and it is the only version of P5 that produces a "second house" row. | **blocking** · high | Add one sentence: the selected obligation is on a house currently outside Patina; if none is due by 09-30, record the missing opportunity — do not substitute the existing house. |
| P5-b | **Kody's live admin seat at Middle West makes "without founder preparation" unverifiable.** `19e7ae9b` is Kody, admin/Studio Manager, day-0 client + project + hours, `invoice_sent` on 09-14 (03 §2.1, §4; 08 G1). The program's access rule ("exceptional preparation needs provisioned … access and verified revocation") describes a seat that does not yet exist; it says nothing about the seat that already does. | major · high | Add a seat rule for the trial window: every row Middle West gains with `19e7ae9b` as actor/creator between session and readout is listed in the case record; the "no founder preparation" claim is made only if that list is empty for the second opportunity. (One read-only query per business table; the path lane 03 used.) |
| P5-c | **Wrong wave.** P5 waits behind P2's terms gate and P3's build. Its own text says it can run "on verified existing outputs." For Leah it should run in the same visit as P1 — 40 minutes of watching, then up to 60 on the one obligation — or the following week when the obligation is due. | major · high | Move P5 into Wave 1 beside P1. Wave 2 becomes the second natural occurrence. |
| P5-d | **"An owner-authored completion standard" is homework the ethnography says does not exist.** 07 §3 item 2: "the process only exists in the owner's head"; 07 §6: the SOP is what the fix *produced*, not what it started from. Asking the owner to write one before the session is asking for the deliverable. | major · medium | Replace with: the owner says out loud what "done" looks like while the colleague works; Kody writes it down. That written line *is* the studio's first SOP and a P5 output. |
| P5-e | **Say why invoicing can meet the two-opportunity bar and nothing else can.** Middle West's 10 invoices in 7 weeks ≈ 1.4/week; two natural occurrences inside the two-week budget is plausible only for this object. Proposals (1 out in 7 weeks), FF&E (0), hours (2 entries), quotes (0 vendors) cannot. The program chooses invoicing by "foothold" when the stronger argument is cadence. | minor · high | Add the cadence sentence; it also tells leadership why the readout will have two rows and not seven. |
| P5-f | Premise "seeded hourly parts, retainers, and required Terms invalidate a relationship-plus-flat-fee shortcut" contradicts F1 §2's read of 00575 (flat fee collapses to relationship + fee part). Neither side ran it; the program cites F1/F2 critiques that are not on disk. I did not read `materialize_standard_parts`. | minor · medium | The program's answer ("rehearse in isolated fixtures first") is right either way; mark the premise as contested rather than checkable. |

### P6 · Open one source door — **KEEP as conditional; state it cannot fire for Leah**

Premises verified: `ROW_KEYS = {pageNumber, provenance, name, quantity, roomName, category}` (lib.ts:5); prompt forbids pricing (lib.ts:73); 25 MB cap (lib.ts:1); bytes go to `api.anthropic.com` (index.ts:45); no quota in the extractor; `stage_project_ffe_import` exists (00435/00439/00448); `_ffe_is_studio_actor` gates (00437:14). The corrections from critique-A1 §§1–5 are all absorbed. The Anthropic disclosure requirement is right, and "Designer-Taught Intelligence is not permission to conceal a processor" is the correct reading of VISION §6.

| # | Finding | Sev · conf | Fix |
|---|---|---|---|
| P6-a | **The trigger ("two real examples of repeated schedule transcription") cannot fire at Middle West in October.** 0 products, no FF&E in her project, no stated PDF. P6 is a referred-studio move wearing a Leah wave label. | minor · high | Label it: fires only on a second studio's observed source. That is fine; say it so the readout does not report "P6: no opportunity" as a finding about Leah. |
| P6-b | The disclosure copy without the word "AI" is a naming ruling; the program names it as a release requirement but not as a leadership decision. | minor · medium | Add to the decisions list as a copy ruling under decision 7. |
| P6-c | Good and keep: one format not both; commit is whole-batch not per-row; correction/exclusion semantics before coding; P3 must reconstruct adopted rows; spend cap per studio. | — | Keep. |

---

## 3. Sequencing

Current: W1 {P1, P2} → W2 {P3, P4, P5} → W3 {P6}.

Problems: P5 (S, the test) sits behind P2 (terms rulings) and P3 (M build the trial will not exercise). P4 is hygiene with no Leah effect. P3's object is wrong for the case.

Proposed: **W1 {P1 + P5 same visit; P2(i) band + templates; pause two enrollments}** → **W2 {second natural occurrence of P5 with the seat rule; P3 re-scoped to invoices/payments/clients; P4 before the next invite; P2(ii) terms only if a referred studio is booked}** → **W3 {P6, referred studio only; FF&E export if P1 observed a schedule}**.

The program's own stop rules, three-hour cap, and readout-choice survive unchanged.

---

## 4. Beta-studio asks — answerable in 30 minutes by a busy designer?

| Ask | Verdict | Why |
|---|---|---|
| 1 · Show the last real task you did outside Patina (screen-share, redacted) | **Yes** | 30 minutes; "redact anything unrelated" is small prep. Add the house-count question (P1-a) to this slot — it costs two minutes and sizes everything. |
| 2 · Owner and colleague, choose a delegated task, provide source and completion standard, let us watch | **No** | Two people's 30 minutes plus a written "completion standard" — see P5-d. Also presumes a colleague; for Middle West that is `1a94f78f`, unnamed and dormant 18 days. Rewrite as: owner picks the task, says "done" aloud, colleague works, Kody writes. |
| 3 · At the next natural occurrence, try it without Kody preparing it | **Yes, but it is a follow-up, not an ask** | Fine as written once P5-b's seat rule exists; otherwise "without Kody" cannot be shown. |
| 4 · Ten minutes: open the returned files; separately, what fees/cancellation/data assurances before paying? | **Half** | The file check is ten minutes if the file is hers (P3-a). The pricing half asks a studio that has never been shown a price to name its terms — the evasive shape F2 §7 warned about. Either show a candidate number (V2) or drop the money question from the beta brief and keep it in Leah's 15-minute money block. |

**Register.** The beta brief reads like an intake form ("participation terms," "authoritative," "completion standard," "data assurances"). The audience is a studio owner Leah introduced. `patina-brand-voice` would not pass it. One rewrite in Leah's voice, under decision 7, before it leaves the building. minor · high.

---

## 5. Can the metrics be computed?

| Metric | Computable? | Note |
|---|---|---|
| Task-specific baseline (P1) | Yes, once, by stopwatch; the program marks remembered timings as estimates. Honest. | n=1 per task. |
| Business-object transitions (P1/P5) | **Yes** — `invoices.status`, `created_at`, `sent_at`, `issued` are Postgres rows; lane 03's read-only Management-API path works today without MCP. | Per-actor attribution needs the D1 query and the P5-b seat list. |
| Issue / dispatch / delivery / failure / suppression (P5) | **Yes, except opens.** `notification_log.status` distinguishes `delivered` (57) from `sent` (11) via the Resend webhook (03 §3.3); `opened_at`/`clicked_at` are null across 400 rows and must not be chased. | Program already says so. |
| "Two natural comparable opportunities … the later without founder preparation" | **Only for invoices, and only with the seat rule.** See P5-e, P5-b. | Otherwise unfalsifiable. |
| Delegation claim | Not this month — no named hire. Program says so. | Wave title "Earn one handoff" overpromises against its own metric. Rename: "Earn the second house." |
| Second-house row | **Missing** — restore as a row in the readout (D2). | `projects` at Middle West `studio_id` vs stated live-house count. V11-compliant: rows, no target. |
| Funnel views | Correctly *not* used. But `designer_funnel` = 0 and `conversion_funnel` = 4200% stay live in prod while leadership reads a readout. | Retire or fix as a same-week S hygiene item; still not a gate. minor · high. |

---

## 6. Premise audit (what I could verify)

Verified true this session: P1 premises 1, 2, 4, 5 (3 plausible, not read — P1-d). P2 premises 1–5 (2 and 3 read directly; 4 true but moot — P2-b). P3 premises 1–5. P4 premises 1–5. P5 premises 1, 3, 4, 5, 6 (2 contested — P5-f). P6 premises 1–6.

Verified additionally: the commission line lives in three email templates, not one; `sequence_enrollments.status` is a per-enrollment pause; Middle West's three seats share one domain.

No premise was found false. Two were found irrelevant to the decision they support (P2-b, P4-b).

---

## 7. Vision and rulings — anything violated?

None. Checked: no tour/coachmark/re-arm (R94/R97/R129/R131); no practice project (decision 3); no dashboard/tile/target/streak (V11 — every metric is a row list Kody reads); no "AI" (P6 names Anthropic as a processor, which VISION §6 does not forbid); no automated external send (drafts stay `awaiting_review`; the designer's Send is the authorization; in-app studio notices reuse 00280); R133 preserved and not retroactively claimed; R125 default kept (no new flag; one existing flag widened); R5 money boundary kept; V1/V2/V6 left open. The feature test is applied per move; P3's stream answer is weak (P3-c) but not a violation.

One thing the program does that VISION §3 *requires* and the shipped product violates: pulling Pledge language. That is compliance, not a proposal, and should not wait on a decision (P2-a).

---

## 8. The deck's single most persuasive slide

**"Middle West Studio, in rows"** — for leadership.

| | |
|---|---|
| Studio created | 2026-08-03 |
| Days to first project | 32 |
| Projects in The Document | **1** |
| Houses live at Middle West today | **— (asked 09-2x)** |
| Where the other houses live | **— (asked 09-2x)** |
| Invoices drawn · by Leah / by Kody's seat | 10 · **— / —** |
| Proposals · out · accepted by a homeowner | 6 · 1 · 0 |
| Products · contacts · field captures | 0 · 0 · 0 |
| Distinct sign-in days | 26 (most in prod) |

It is V11-compliant (a total above its rows), it is the brief's sentence observed on the co-founder's own studio, it names the two empty cells the program exists to fill, and it makes the readout question one line: *did house #2 come in, and what did it cost her?* The beta-brief variant is the program's own "Bring one piece of work" opener, with the D2 sentence Leah can say in the first person: "I haven't moved my second house in either. Let's see why."

---

## 9. Cut list — disagreements

- **Item 8, "second-house activation target"** — restore as a readout *row*, not a target with a number (D2). The program's reason ("optimizes the experiment") is right for a target and wrong for a row.
- **Item 9, "global pulse/drip shutdown"** — keep cut; but the per-enrollment pause is not a shutdown and should be used (P2-b).
- **Item 10, funnel repair as prerequisite** — agree; add "retire or fix the two lying views as S hygiene this week" so they are not live during the readout.
- All others: agree, including the reasons.

## 10. Decisions for leadership — too many, in the wrong order

Seven decisions, three of which (3, 4, 5) are V-series rulings open since 09-01 or October-only hygiene. Presenting them as prerequisites is the stall risk. This week: decisions 1 (approve discovery + one bounded trial; name Leah's house #2), 2 (pull Pledge language — compliance, not a choice), 6 (the three-hour cap and halt conditions), plus two the program lacks: **pause Middle West's two enrollments for the window**, and **the seat rule for `19e7ae9b`**. Decisions 3–5 and 7 only before a non-Leah studio is booked or at the readout.

---

## 11. What is missing (add)

1. The invoice-attribution query (D1). One line, read-only, before the session.
2. The house-count / where-does-each-live question as the first ask (P1-a).
3. The second-house row in the readout (D2).
4. The seat rule for Kody's Middle West membership during the trial (P5-b).
5. "The obligation is on a house not yet in Patina" (P5-a).
6. Per-enrollment drip pause for the two Middle West seats (P2-b).
7. The PostHog OAuth as an owed, owned learn-first item so `document_zone_flight` / `help.tour.*` can be read once (P1-c).
8. Named email templates carrying the commission line: `designer-invite.tsx`, `milestone-first-payment.tsx`, `onboarding-aesthete.tsx` (P2-c).
9. A brand-voice rewrite of the beta brief under decision 7 (§4).
10. Rename Wave 2 to match its metric: "Earn the second house," not "Earn one handoff."

## 12. Evidence quality of this review

**Verified by file read this session:** every code citation in the header list; the program's text in full; research 01/02/03/04/08 in full; 05 §10, 06 §§2–3, 6–8, 07 §§3, 6–7; both on-disk critiques and both F proposals in full; A1/A2 proposal openings. **Inferred:** that Middle West's FF&E item count is ~0 (from 0 products and the instance-wide 31 dominated by Middle Studio's 26 projects — 03 §2, §6.4; not queried per studio); that the ten 00291 triggers stamp the row owner (P1-d, not read). **Unavailable:** the F1/F2 critiques the program cites (not on disk); `materialize_standard_parts` body (P5-f); identity of `1a94f78f`; any live flag or prod row — no production query was run and nothing was mutated. The program was rendered from HTML to text for review; no content loss observed.
