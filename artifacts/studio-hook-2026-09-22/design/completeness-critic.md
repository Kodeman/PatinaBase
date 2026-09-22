# Completeness critic — "The second house" (program-final), before the deck

**Role:** completeness critic, separate context from the author and from the premise verifiers. **Date:** 2026-09-22. **Repo:** `main` @ `966d6ca67`.
**Read in full:** `design/program-final.html` (rendered to text); research 08, 07; `design/redteam-fable.md`; the nine premise-verification verdicts handed to this lane. **Read at cited sections:** research 01 §§2–3, 02 §§1.6, 1.14, 3, 03 §§2, 3.3, 4; `critique-A1.md` §§0–1; `proposal-F2.md` M6–M8; `critique-A2.md` §§0–1; `VISION.md` §§1–8; `DECISIONS.md` R133, R135.
**Code opened this pass (to check what the verifiers said changes P5):** `apps/designer-portal/src/components/document/overlays/open-project-sheet.tsx:1-60, 100-210`; `apps/designer-portal/src/components/portal/client-picker.tsx:1-90` + grep of `:90-230`; `packages/supabase/src/hooks/use-invoices.ts:750-790`; `packages/supabase/src/hooks/use-clients.ts:740-800`; `supabase/functions/invoice-send/index.ts:230-300`; `supabase/migrations/00331_ceremony_complete.sql:395-460`; `supabase/migrations/00237_open_project_direct.sql` header.

Severity: **blocking / major / minor**. Confidence: **high / medium / low**. Nothing filtered by severity.

---

## 0. Verdict

No move is undermined by a refuted *factual* premise — the nine verification passes upheld every factual claim, marked two "partly" (P2a-5, P3-5) and refuted exactly one thing, P6's cost tag. The program's honesty holds. What does not hold is its *silence* in three places that a beta-studio reader, or Leah, would find first:

1. **P5 cannot happen on a house outside Patina without emailing that house's homeowner.** `use-invoices.ts:766-773` refuses any project lacking `client_id`; `client-picker.tsx:44,125-135` only yields a `client_id` for a household that already holds a profile, and a captured household with an email has to be *invited* ("a real send", J2) before it can be linked. So the "quiet trial" on an outside house is also Patina's first email to a real client of Leah's, whose accept leg 08 G8 records as unverified in prod. The program names neither the send nor the homeowner. **blocking · high.**
2. **The bet says "without making the studio keep two books," and P5 as written creates two books.** Lane 02 §1.6: no invoice import exists and the QBO export is *vendor bills*, not invoices. The house-2 invoice lives in Patina while every other receivable lives wherever she keeps them; the readout has no row for where that invoice went afterward. **major · high.**
3. **The program answers "does Patina remove one task for Leah," not Kody's literal ask.** The ask has two halves — *feel like saving time* and *not learning a new system*. The first is measured (minutes, and the closing question "What did this remove from your day?"). The second is not: the case record counts "founder help" but never counts *what she had to be told* to finish, which is the only observable form of "learning a new system." **major · high.**

Beyond those, the deck's largest risk is audience: it is addressed to "Beta Studios themselves," and there are none. The beta brief is for referred studios who cannot be taken in before P2b's terms exist; Leah is a co-founder, not a beta studio. The deck must say it is a program for one studio and a decision about whether to earn a second.

---

## 1. Which moves are undermined by a refuted premise

| Move | Premise state (per verification) | Does the move stand? | What actually changed |
|---|---|---|---|
| P1 | 4/4 verified | Yes | Query misses `studio_id IS NULL` rows (00318/00513); DB has no authorship column at all, so "ask who prepared each" is the only method; 03 §4 already shows `invoice_sent` on Kody's seat (day 12 ≈ 09-14) — start from that, not cold; 08 G2's "captured nothing" is false (`first_capture` day 38 for `ce3aee90`). |
| P5 | 6/6 verified | Yes, **but S is conditional** | Household link forces a homeowner invite (see §0.1); whoever clicks *Open the project* is stamped `designer_id` (00331:408) and must hold a designer-domain role (00511:3392, 00578:2250) — the dossier does not record Kody's role domain; "trial-window record" is a written note, no system holds it. |
| P2a | 4 verified, 1 partly | Yes | Redeploying `designer-invite` is a no-op for copy (renders from `email_templates`); the deploy that matters is `./infra/deploy-portal.sh designer-portal` for the band; `accounts-book.tsx:169` renders a second Pledge figure the move does not name; resume must push `next_step_at` forward or one email goes out within one 5-minute tick; only one of the two paused enrollments is a third party (`19e7ae9b` is Kody). |
| H1 | 3/3 verified | Yes | `consumer_funnel` has the identical defect and is omitted; `supabase/tests/rls/00555_ios_round_one_security.test.sql:368-373, 2057-2062` cast the views to `::regclass` unguarded and will abort on drop; `FunnelStepRow` is imported by `funnel-chart.tsx`, and admin-portal's build enforces types, so the deletions are not independently landable. |
| P3 | 4 verified, 1 **partly (the cost-bearing one)** | Yes, re-premised | Co-member RLS on invoices/lines/payments/clients already exists (00316, 00584); what is missing is a *tenant* leg (`is_studio_comember(designer_id)` with no org check — the hole 00632:30-37 describes), fixed by `.eq('studio_id', …)` plus a disclosed NULL-studio count; payer-name must reuse the 00588 derivation or the Client cell blanks on exactly the projectless invoices the move exists for; "manual return" = Kody runs SQL. |
| P4 | 4/4 verified; cost partly | Yes, hygiene | No studio-name input exists anywhere on the invite chain (dialog, service, route, function); re-invite of a registered email would overwrite `profiles.business_name` (letterhead); the flag may never have been created (`w2-prod/README.md:10` vs memory). |
| P2b | 3/3 verified | Yes, split | The "wait for V1/V6" clause is coherent only if P2a ships first (the Pledge is already shipped to every studio); the referral path (`designer-invite` → `/auth/callback?next=/desk`) shows no terms and stores no acceptance; `/terms` says Minnesota, VISION §1 says Madison, WI; the paid branch is L/XL (all three Stripe builders are `mode:'payment'`), not M. |
| P3f | 3/3 verified | Yes, split | The spreadsheet is S (columns exist, three shipped surfaces already read `trade_price_cents` studio-side, `_ffe_is_studio_actor` gates); M is buying "selected originals," which has no bundling precedent in the repo; `trade_price_cents` is null on most user-created rows (`use-project-v2.ts:605-612`). |
| P6 | 6/6 verified; **cost refuted** | Yes, relabelled M–L | A row stamped `formula_like_value` / `missing_name` / `invalid_product_id` / `invalid_quantity` can never be cleared, the batch can never commit, and re-upload returns the same dead batch on `(project_id, file_hash)`; `authenticated` is SELECT-only on the staging tables; effective PDF ceiling is ~24 MB (base64 of 25 MB exceeds the 32 MB request cap); `max_tokens: 6000` against a 5,000-row schema truncates to a 502 with nothing staged. |

**Deck line:** "Every factual premise survived verification" is true. "Every premise verified" is not — say the first, not the second.

---

## 2. What a beta-studio reviewer would find missing or presumptuous

Reading the brief as the owner of a 1–5 person studio Leah introduced:

| # | Finding | Sev · conf | Where | Fix |
|---|---|---|---|---|
| B1 | **"Nothing goes to a client unless you decide it is ready" is not true of the trial as designed.** To bill a house outside Patina she must first send her homeowner a Patina invitation (`client-picker.tsx:125-135`), then the invoice letter. Two emails to a real client, from a product that client has never seen, before the studio has decided anything about Patina. | blocking · high | Beta brief para 1; P5 "What" | Name it in the brief. Either the trial ends at *issue* (no send; the program already admits print refuses drafts, so define the return record) or leadership decides the homeowner is in — VISION §2 does say the first homeowner cohort is Middle West's clients, but that is a decision, not a default. |
| B2 | **"Why is this the first time you're asking how I run my houses?"** Seven weeks in, an R133 setting-up call is doctrine and none is on record (08 G6). The brief opens with the census question as if it were routine. | major · medium | Brief ask 1 | One honest sentence owning it, in Leah's voice: the program's own §D2 ("I haven't moved my second house in either") is the right register. |
| B3 | **The invoice is not where her pain is.** Ethnography 07 §3 ranks the recurring complaints: scattered product info (#1), process only in the owner's head (#2), procurement state (#3), informal approvals (#4), client login friction (#5); billing appears only as hours-tracking burden (#6). Lane 02 §1.6 says the likeliest reason she keeps QuickBooks open is receivables Patina cannot hold. A studio owner reads "show us your next bill" as "you picked the part my accounting tool already does." The program's reason (cadence — P5-e) is a Patina reason, not hers. | major · high | P5 "Why"; brief ask 1 | Say the reason plainly in the brief ("a bill is the smallest thing that has to leave your studio every week") and add the two-books row (B4) so she sees the cost counted. |
| B4 | **Two books.** After the Patina invoice issues, where does it go — retyped into QuickBooks/Wave, PDF filed, or nowhere? No QBO invoice export exists (only vendor bills). The bet promises no second book; the readout does not measure it. | major · high | Bet; "Measure a removed task" | Add a row: "where the invoice went after Patina, and the minutes that took" — counted as duplicate work in the net. |
| B5 | **"Open the files we return without Patina" — there is nothing to open yet.** P3 is Wave 2 (M). For the first trial the return is Kody running a read-only query and emailing a spreadsheet. The brief presents a product capability. | major · high | Brief ask 4 | Word it to the manual reality ("we will send you a spreadsheet of what Patina holds — by hand, this month"). |
| B6 | **A studio sees itself budgeted.** "Cap Kody's initial two-week work at three hours per studio" is right for leadership and wrong in anything a studio reads. | minor · high | Continuation and stop rules | Keep out of the excerptable brief. |
| B7 | **No price, and no promise of one.** The brief says "we will state the approved cost" — for referred studios only. A referred owner reading this has been shown no number and told there is none yet. That is P2b's job; until it is done the brief has no referred-studio audience. | major · high | Brief last para; P2b | Do not distribute the brief beyond Leah until P2b's free-tier terms exist. |
| B8 | **"Bring a colleague only if they would normally do this job" presumes there is one** — `1a94f78f` is unnamed and dormant 18 days; 0 `studio_contacts`. Fine as a conditional; the deck must not describe the trial as a delegation test. | minor · high | Brief ask 2 | Already conditional in the program; keep the "solo result is called solo" sentence next to it in the deck. |
| B9 | **What she has to learn is uncounted.** To finish the invoice she meets: *Open a project*, the household link (and its invite), the folio, draft vs issue vs send, the studio-invoice vs project-invoice fork, and ⌘K. Each explanation Kody gives is the literal "learning a new system" cost. The case record logs "founder help" as assistance, not as learning. | major · high | P1 case record; "Measure a removed task" | Add a "told" column: every thing Kody had to say for her to proceed, with the surface it concerned. The readout's honest sentence is "she had to be told N things to finish one bill." |
| B10 | **The iOS surfaces are absent without being excluded.** VISION §1 ranks the iOS app second; 08 G7 shows Field is TestFlight-only, Leah's access unconfirmed, share sheet empty. The program correctly touches none of it and never says so. | minor · high | Program scope | One sentence: no phone surface is in this program; the SMS rail is the only field surface today. |
| B11 | **Money is deliberately deferred and the deck should say so.** The program tests the subscription *floor* as "the stream under test" but contains no move that asks Leah what she would pay (L5 Block 3 dropped; P2b explicitly "no vague willingness-to-pay question"). Correct — but a leadership reader will assume the trial informs V2. It does not. | major · medium | Diagnosis; decisions | State: this program produces no pricing evidence; V2 waits on a separate conversation. |

---

## 3. Does the program answer Kody's ask, or drift?

**Kody's sentence:** studios need to *feel* they are saving time by coming to Patina, *not learning a whole new system*; goal: get studio designers hooked.

**What the program is:** a one-studio observation of one invoice on one outside house, with compliance and hygiene alongside, and a readout that chooses continue / one fix / conditional build / stop.

- **Saving time — answered, honestly and narrowly.** "Measure a removed task" is the right instrument (normal-method minutes vs all Patina minutes, first-use separated from repeat, Kody's time separate, no stopwatch on collectible work). The closing question ("What did this remove from your day?") is the *feel* half. n=1, one object. Keep.
- **Not learning a new system — not answered.** Lane 01 §3's headline — the only bulk import is a product spreadsheet; clients, vendors, projects, rates and history are retyped; "that is the precise shape of having to learn a whole new system" — is the dossier's most direct hit on the ask, and the program (rightly) cuts every import until observed. But it replaces them with nothing that *measures* learning. See B9. The fix is a column, not a build.
- **Hooked — reframed, and the reframe is correct but must be named.** The program refuses "hook" as an engagement target (V11, VISION §4) and substitutes "voluntary repeat choice on a second natural occurrence." That is the right doctrine reading. The deck must say the substitution out loud: *this is not a hook program; it is the program that finds out whether a hook is possible for the only studio we have.*
- **Drift risk, real but bounded:** three of nine moves (P2a, H1, P4) are Patina-hygiene with zero effect on any studio's time; two (P3f, P6) are furniture-schedule moves for a studio with 0 products. They are correctly labelled and correctly gated. The deck should present them as "what we fix while we watch," not as the answer.

**One thing the ask says that the program quietly disagrees with:** "studios ... pop back out into their manual ways." L3 (08 G3) recorded Leah's own flight as completeness-seeking, not friction. The program's diagnosis names this in one clause ("Leah's earlier recorded departure sought complete functionality"). The deck should carry it as a competing explanation with equal weight, because if it is the operative one, P5's finding will be "she finished the bill and still keeps the book elsewhere because the rest of the house is not in Patina" — which is a completeness finding, not a switching-cost one.

---

## 4. What the deck must NOT claim

1. That anyone besides Leah is a beta studio. Prod holds zero third-party studios; every other seat is Kody, a QA login, or unnamed (08 G1).
2. That "delegated designers churn while principals stay" or "day-0 value retains." Both rest on Kody's own seat (08 G1/G10-3). Withdrawn.
3. That invoicing is Leah's habit, or that Middle West bills ~1.4×/week. Ten invoices is a union across three members including Kody; `invoice_sent` fired on Kody's seat on ~09-14; the DB has no authorship column.
4. That the trial is quiet, internal, or sends nothing. An outside-house invoice sends at least one email to a real homeowner (§0.1).
5. That "zero proposals were ever signed." Twenty `accepted` rows exist; the status vocabulary does not prove no signature (program §Disagreements 3).
6. That Leah "captured nothing" (08 G2). `first_capture` fired on day 38.
7. Any vendor statistic: 36% admin time, 6 tools/6 logins, 20–40 h/month reconciliation, Chameleon/Intercom lifts, Studio Designer ratings (08 G10 rows 10–12; 07 open question 5).
8. "8–16 hours of transcription" — an inferred figure on an imagined 8-house studio (08 G10-5).
9. "Leah Hartwell." Surname is Kochaver per VISION §1; Hartwell is a seed (08 G10-6).
10. That "your data exports" or "no lock-in" is currently true. No invoice/payment/client register export exists; the GDPR export never populates `download_url`; the FF&E export does not exist.
11. That any move costs what its tag says without the amendments: P5 is S only under three named preconditions; P6 is M–L; P3's M is misallocated; P2a needs a portal deploy; H1 is six files, one migration, two deploys.
12. That the program "authorizes no production change." Wave 1 asks for four: a template migration + portal deploy (P2a), two enrollment row updates (P2a), and a view drop + admin-portal deploy (H1). Say which mutations are being authorized in the same breath as "observe."
13. That the trial informs pricing (V2), the Pledge (V6), or the margin pocket (V1). It does not.
14. That the funnel views were "repaired." They are retired; renaming would leave `designer_funnel` step 4 and `consumer_funnel` step 4 structurally at zero and `conversion_funnel` step 5 plausibly wrong.
15. That the drip was paused "for Middle West." One paused enrollment is Kody's; `86cdd0aa` (tester) keeps running.
16. Any time-saved number, projected or measured. Nothing has been timed.
17. Any sentence containing "AI." Anthropic may be named as a processor (VISION §6 forbids the label, not the vendor).
18. That Kody's engineering week is free. P2a (S+), H1 (S, two deploys), P4 (S+, strictest-typed portal) and the 3-hour observation cap all land on the one engineer in the same week; the program never totals them.

---

## 5. Three decisions leadership must make first

1. **Is the homeowner in the trial?** An outside-house invoice requires inviting Leah's client to Patina before the project can be linked, then emailing them the invoice. Options: (a) yes — read the `client-invite-letter` flag live, accept that P5 is also the first real First-Letter test, and disclose it to Leah in the brief; (b) no — the trial ends at *issue*, and the return record for a draft/issued-unsent invoice is defined before the visit. Everything about P5's shape follows from this.
2. **Whose hand opens the project, and what counts as "independent."** Leah clicks *Open the project* (she becomes `designer_id` and the stamped lead; Kody may still draft/issue as a co-member). Approve the founder-seat rule and, explicitly, that "independence unverified" is an acceptable readout outcome — otherwise the second-occurrence claim will be graded by the person it is about.
3. **Who this deck is for.** Decide now that the deck and brief go to Leah only until P2b's free-tier terms exist and a referred studio is actually booked. "Beta Studios themselves" is an audience of one today; presenting it otherwise is the presumption a referred owner would notice first.

(P2a's Pledge removal and H1's retirement are authorizations of existing doctrine — VISION §3 already rules the first — not decisions; put them on the same slide as "what we fix while we watch.")

---

## 6. What is missing (add before the deck)

1. The homeowner invite as a named step in P5, with its own consent line in the brief (§0.1, B1).
2. A "where did the invoice go afterward" row in the readout — the two-books cost (B4).
3. A "told" column in the case record — the learning-a-new-system count (B9).
4. Where the restricted case record lives and who can delete it. `artifacts/` is permanent public git history; client material cannot go there.
5. Kody's total week: engineering moves + observation, on one calendar.
6. A live read of `client-invite-letter` and `studio-invoice` flag state before the visit (both gate the P5 path).
7. The L5 DECISIONS entry: the program folds Session 05 Blocks 1 and 3 into P1 but never says the findings are logged as L5 (08 G3 reserves the entry).
8. One sentence excluding the phone surfaces (B10).
9. One sentence saying the program produces no pricing evidence (B11).
10. The completeness-seeking explanation (L3) carried as a peer of switching cost in the diagnosis slide (§3).
11. `consumer_funnel` in H1, and the SQL-test edit as a named step.
12. `accounts-book.tsx:169` in P2a's scope, and the portal deploy in place of the function redeploy.

---

## 7. Keep

P1 · P5 (with the homeowner decision and the Leah-opens rule) · P2a (with the deploy and scope corrections) · H1 (with `consumer_funnel` and the test edit) · P3 (re-premised as tenant filter + payer derivation, not "authorization design") · P4 (as pre-invite hygiene, with a name input) · P2b (split free/paid; free branch M, paid L/XL) · P3f (split: spreadsheet S now, originals M later) · P6 (M–L, referred-studio only, with the dead-batch fix in scope). The cut list stands as written; redteam's restoration of the second-house *row* (not target) is already in the program.

## 8. Evidence quality of this critique

**Verified by file read this session:** the program text in full; research 08 and 07 in full; redteam in full; 01 §§2–3, 02 §§1.6, 1.14, 3, 03 §§2, 3.3, 4; critique-A1 §§0–1, critique-A2 §§0–1, F2 M6–M8; VISION §§1–8; R133/R135; the six code files listed in the header (the household→invite→invoice chain). **Taken from the nine verification verdicts, not re-run here:** every `path:line` in §1 that is not in the header list. **Inferred:** that the `/api/clients/invite` route sends an email when `invite: true` (from `use-clients.ts:757-783` and the picker's "a real send" comment; the route body was not opened). **Unavailable:** live flag state; Kody's role domain; identity of `1a94f78f`; any prod row — no production query was run and nothing was mutated.
