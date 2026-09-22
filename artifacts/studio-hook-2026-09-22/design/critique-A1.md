# Critique of Proposal A1 — "Bring the job in"

**Role:** adversarial critic, other model family. **Date:** 2026-09-22. **Repo:** `main` @ `966d6ca67`.
**Read in full:** `design/proposal-A1.html`; research reports 01–08. **Opened for load-bearing claims:** `supabase/functions/project-ffe-document-extract/{index,lib}.ts`, migrations 00433/00434/00435/00437/00439/00444/00448/00455, `open-project-sheet.tsx`, `product-picker-modal.tsx`, `schedule/add-to-project-sheet.tsx`, `ffe-section.tsx`, `board-add-rail.tsx`, `use-capture-from-url.ts`, `quote-request-send/index.ts`, 00162 (`vendor_quote_requests`), 00637 (`mint_paperwork_link`), `DECISIONS.md` R4/R133, `VISION-DECISIONS.md` V9/V11, `VISION.md` §3–4, `leah-session-05-one-pager.md`, `docs/design/studio-rosters/README.md`.

Every finding carries severity (blocking / major / minor) and confidence (high / medium / low). Nothing is filtered by severity.

---

## 0. Verdict

A1 is the most honest of the lenses I would expect to see: it refuses the dossier's withdrawn retention inference, gates every build on observation, keeps the original system authoritative, and pairs import with export. Its *posture* survives. Its *moves* do not survive contact with the code. The dormant FF&E pipeline it builds on is both more complete than the proposal says (staging, per-row commit decisions, duplicate mode, idempotency, upload registration and a **project-level spreadsheet staging RPC** all exist server-side) and far narrower than the proposal assumes (the extractor and the staging row carry only *name, quantity, room, category* — the prompt forbids pricing, and nothing carries vendor, unit, lead time, doc code or money). So A1-2's promised "price meaning" and "money reconciliation" describe fields that do not exist, A1-3's cost is in the wrong place, and A1-5's headline deliverable already ships. The time-saved hypotheses inherit those errors: A1-2's baseline is ~2× the dossier's own per-line rate, and the "sixty minutes" metric is met by construction because Kody's hands are on the keyboard for twenty of them. The delegation test (A1-1) has no hire to run on. What survives is A1-1 as a *session* (if a hire is found), A1-2 as an honest M door at the field breadth that exists, and A1-7 decoupled and shipped first.

---

## 1. Factual premises the dossier does not support or the code contradicts

### F1 · A1-2 — The extractor does not extract what the move promises to preserve — **blocking · high**

**Claim (proposal §A1-2):** "Preserve quantity, units, item identity, and price meaning; unknowns stay blank. An observed number is not automatically trade cost, client price, tax, or markup." Proof clause: "source and critical money fields fully reconciled." Metric 4: "Every adopted critical identity, quantity, unit, and monetary field reconciles with its source."

**Code:** `project-ffe-document-extract/lib.ts:5-27` — `ROW_KEYS = {pageNumber, provenance, name, quantity, roomName, category}`; the tool schema (`lib.ts:80-115`) has `additionalProperties:false` and exactly those six keys; `validateExtraction` rejects any row with a different key set. The system prompt (`lib.ts:74`): *"Never infer approval, authority, pricing, trade cost, markup, or a client verdict."* The staging RPC normalizes only `name, category, productId, quantity, pageNumber, confidence` (00437:267-283). `commit_project_ffe_import` (00439:530-575) forwards only `name, category, quantity, roomId, assignmentScope, duplicateMode` into `place_product_in_project_v2` with `disposition:'candidate'`.

**Consequence:** there is no unit, no price, no vendor, no lead time, no doc code anywhere in the pipeline, by design (00437 is titled "service boundaries"; the tool description says "this never creates live project selections"). Every "money" sentence in A1-2 is about a field the door will not produce. After adoption, each of the twenty rows still needs unit price, vendor, lead time and doc code typed by hand in `ffe-schedule-builder.tsx`.

**Fix:** re-scope A1-2 to what the pipeline carries (name / qty / room / category) and re-derive the saving from that; or cost the schema widening as a separate decision (extraction tool + `normalized_row` + `place_product_in_project_v2` args + the 00437 boundary itself) and get a ruling on whether machine extraction may touch money at all. Do not present the current asset as a money-bearing import.

### F2 · A1-2 — The server side is more finished than the proposal says; the gap is the portal door and the field set, not "adoption transactions" — **major · high**

**Claim:** "upload authorization, supported fields, room mapping, acceptance, retry behavior, and provenance still need an implementation pass"; risks: "Provenance, authorization, source fidelity, adoption transactions, duplicate prevention, and portable output still need engineering."

**Code:** `register_project_ffe_working_media_source` (00455:5) registers the upload; `get_project_ffe_extract_upload` (00437:112) authorizes it via `_ffe_is_studio_actor` (any active non-guest member); `stage_project_ffe_document_extraction` writes `project_ffe_import_batches`/`_rows` with page + confidence provenance; `commit_project_ffe_import(p_batch_id, p_decisions)` (00439:530) takes per-row `roomId / assignmentScope / duplicateMode`, refuses until every row has a valid room and a duplicate decision, is idempotent on `'import:'||batch||':'||ordinal`, and stamps `committed_ffe_item_id`. Retry-safety and duplicate mode exist. The proposal's own dossier citation (02 §1.3) says "validates and commits rows" and "zero callers" — i.e. the missing piece is a door, which the proposal then contradicts in its risk list.

**Consequence:** the M estimate is defensible, but the risk paragraph overstates unbuilt server work and hides the real gap (F1).

**Fix:** restate A1-2's scope as "portal door over an existing staged→committed pipeline at name/qty/room/category breadth"; move "adoption transactions, duplicate prevention" out of the risks.

### F3 · A1-3 — A project-level spreadsheet staging RPC already exists; lane 02 §1.3's "NOTHING at the project level" is UI-true and server-false — **major · high**

**Code:** `stage_project_ffe_import(p_request jsonb)` (00435:600, restated 00439:495-527, granted 00448:35) stages spreadsheet rows into the same batches/rows tables with `source_kind` distinguishing `'spreadsheet-import'` from `'document-extraction'` at commit (00439:562). Zero portal or package callers (grep `stage_project_ffe_import|project_ffe_import` over `packages/supabase/src`, `apps/designer-portal/src` → only `database.types.ts`).

**Consequence:** wiring `import-parse.ts` + the existing `import-sheet.tsx` mapping UI onto `stage_project_ffe_import` is M, not L. The L the proposal fears is the *same* field-breadth widening as F1 (the normalized row holds only name/category/productId/quantity/roomName). The proposal costs the wrong thing and separates two moves that share one blocker.

**Fix:** split A1-3 into (a) M wiring at existing breadth, gated on A1-2 showing use, and (b) one shared schema-widening decision for both file types.

### F4 · A1-5 — The move's core deliverable already ships — **major · high**

**Claim:** "Make the existing paste-URL capture reachable at the project's sourcing moment, retaining the project/room destination through confirmation." Evidence cited: 02 §1.12 ("surfaced only as a fallback when the extension is shut").

**Code:** `product-picker-modal.tsx:10,617-659` unfurls a pasted URL through `useCaptureFromUrl` (`mode:'capture'`); `schedule/add-to-project-sheet.tsx:16,356` mounts `ProductPickerModal`; `ffe-section.tsx` mounts that sheet inside the Document. Board items already carry `source_url` beside an image (`board-add-rail.tsx:178-185`) and boards accept bulk image upload (02 §1.2). So a URL is capturable at the project's sourcing moment today, and a Pinterest "reference + screenshot" is an uploaded board image whose `data.source_url` can be set.

**Consequence:** the 5–10 minute saving is measured against a workaround that is not the current state. What is genuinely missing is small: a URL field on a manually uploaded board image, and a CWS status check.

**Fix:** demote A1-5 to S (URL-on-reference-image + CWS check) or drop it; re-baseline against current behavior.

### F5 · A1-1 — There is no hire to hand off to — **major · high**

**Claim:** "have the hire complete an actual handoff during the existing R133 call"; sequence: Sept 24–25 "one real output, and the existing handoff call."

**Dossier:** Middle West's only non-founder seat is `1a94f78f`, unnamed, dormant since 09-04 (03 §2.1; 08 G1: "the only seat nobody can name"). `19e7ae9b` is Kody (08 G1). The R133 handoff call for `1a94f78f` was due the day she accepted (09-04) and whether it happened is UNAVAILABLE (08 G6). The proposal lists "identify the unnamed designer" under learn-first but still schedules the handoff test two days later.

**Consequence:** the delegation half of A1-1 either runs with Kody as the hire (the founder-as-studio inference the proposal itself forbids) or does not run this week. There is no "existing" call to piggyback on; it would be a new call.

**Fix:** make "a named, willing hire exists" a hard precondition of A1-1's handoff leg; otherwise A1-1 is a setting-up session and Metric 3 is untestable in this pilot.

### F6 · A1-3 — The "bring your book" ruling is about the rolodex, not schedules — **major · medium**

**Claim:** "Requires an explicit scope ruling on the previously cut 'bring your book' promise; project-only import or paste is not a loophole."

**Source:** `docs/design/studio-rosters/README.md:93` — follow-up #3 is "**CSV rolodex import.** Cut from day-1 seeding in favour of the 00418 backfill. Needs a ruling before it's built." 04 (a)1n reads it the same way: "a studio's existing roster/contacts." A1-3 explicitly creates no contacts ("without silently creating contacts or orders").

**Consequence:** the proposal blocks A1-3 on a ruling whose subject it does not touch, and inconsistently — A1-2 is the same promise in PDF form and is not held to it. Either both project-working-set imports need a ruling or neither does.

**Fix:** drop the dependency, or ask for one ruling on "project working-set import" that covers PDF and spreadsheet alike.

### F7 · Thesis vs the only observed flight — acknowledged, but no move hedges it — **minor · high**

08 G3: Leah's recorded reason for leaving the new UI (L3) was completeness-seeking, not transcription; L2's flights were to the *old Patina portal*, not a spreadsheet (08 G4). The proposal names this as risk 1 and says "reject this lens if the new observation confirms that." Good. But all seven moves are import doors; nothing says what the first move is on the completeness branch, so the Sept 23 session has no fork to land on.

**Fix:** name the completeness-branch first move (one sentence) so the observation can route.

---

## 2. Vision violations

### V-a · Three moves manufacture review queues for the owner — **major · high**

A1-2 (candidate rows "with unresolved fields visible"), A1-3 (mapping preview), A1-4 (unverified quote beside verified) each produce work the owner must adjudicate before the hire can act. The proposal warns against exactly this (156 unsent pulses, "reject unsolicited batch extraction that produces rows nobody asked to review") and then builds three. Concretely: `commit_project_ffe_import` raises `'every import row requires valid room and duplicate decisions'` (00439:551-556) — twenty rows means at least twenty owner decisions before a single line lands, plus the per-row price/vendor/lead-time entry F1 leaves behind. Against "you won't notice Patina" this is Patina noticing her.

**Fix:** per move, say who reviews (owner vs hire), auto-default rows with no errors, surface only rows with `validation_errors`, and count review minutes in the saving.

### V-b · Third-party model processing of the studio's client document is undisclosed — **major · medium**

`project-ffe-document-extract/index.ts:44-56` posts the whole PDF (client names, addresses, rooms) to `api.anthropic.com`. No studio-facing disclosure exists in the portal (grep `anthropic` over `apps/designer-portal/src` → only `(legal)/privacy/page.tsx`). The proposal's consent step covers Leah's permission for the assisted week, not the product door. VISION §6 forbids the "AI" label, which makes the disclosure a copy problem the proposal has not planned: how does "Read a schedule" say where the file goes without the word and without hiding it?

**Fix:** release requirement — one disclosure line in the sheet plus a help entry; a naming ruling before the door ships.

### V-c · "Sixty elapsed minutes" measures the concierge, not the product — **major · high**

The first-hour agenda is "ten minutes of source inspection, twenty of assisted preparation, fifteen of review and one real output, and fifteen of handoff." The headline metric ("First usable working set within sixty elapsed minutes, including one real output") is therefore satisfied by Kody typing for twenty minutes. It cannot distinguish "Patina made this fast" from "Kody did it." The proposal records founder minutes separately, but the headline is still founder-inclusive.

**Fix:** headline the product-only variant (Kody's hands off the keyboard); report founder minutes as a cost line, not inside the metric.

### V-d · The Pledge band stays exposed to the studios this proposal recruits — **minor · medium**

08 G5: `accounts-earnings-page.tsx:110-127` renders Pledge language to every studio, unflagged, against VISION §3 ("No Pledge language becomes public or contractual before counsel reviews"). The proposal parks it as "separate." It is a gate on showing any non-Leah studio the Accounts book, and the learn-first plan invites two network studios in the same window.

**Fix:** state it as a precondition for any non-Leah walkthrough that reaches the drawer.

No engagement bait, dashboards, streaks, badges or "AI" wording were found in the proposal itself; the metrics are internal case logs with rows beneath them (V11 passes). A1-6 clears the side-journey test via V11's companion entry ("Patina Field is The Document off-desk").

---

## 3. Ruling conflicts

### R-a · A1-1 repurposes R133's "setting-up conversation" into concierge data entry, seven weeks late for Leah — **minor · medium**

R133 (DECISIONS.md:10687): a *conversation* with the owner "in her first two days." Leah's window closed 2026-08-05; the proposed session has Kody preparing a job with his hands. Not a conflict, but calling it "the existing setting-up call" conflates it with the R133 script that G6 says has never been written.

**Fix:** name it a "working-set session," distinct from R133, so the pilot runbook does not overwrite an unrun doctrine.

### R-b · R125 "no flags" + an unmetered Claude door — **minor · medium**

A1-2 ships unflagged by R125 default. `capture-from-url` has `quota.ts`; `project-ffe-document-extract` has no quota, accepts ≤25 MB, and any active non-guest member can invoke it (`_ffe_is_studio_actor`, 00437:14-44). Unflagged means every studio in prod, which today is Kody plus Middle West — fine — but it is a cost line with no ceiling.

**Fix:** per-studio daily cap before release; flag decision stays R125-default.

### R-c · A1-4 over-applies "no automated external sends" to a human act — **minor · medium**

`quote-request-send` is one user act with `'preview'` and `'send'` modes (index.ts:10-30), reply-to the designer. The Agent OS rule targets agent-generated drafts. Saying "link messages remain drafts awaiting human review" adds an awaiting_review queue to an email the designer wrote and clicked — friction the proposal elsewhere warns against.

**Fix:** state that the designer's own send *is* the human review.

R94/R97 (no tours), the rejected sample project, V11, the no-automated-sends rule (as applied to agents) and the Pledge legal gate are respected by the proposal's text. R4 is cited correctly in both of its senses (time-entry canon at DECISIONS.md:131; the agreement floor quoted in `readiness.ts:8-10`).

---

## 4. Time-saved claims

### T-a · A1-2 baseline is ~2× the dossier's own rate, and the review does not replace the entry — **major · high**

Lane 02 §4 row 1: 170–360 minutes for 240 lines = 0.7–1.5 min/line → **14–30 minutes for 20 lines**, not "30–50." Against that, the proposal's "10–15 minutes of review" excludes the per-row room decision the commit RPC demands (V-a) and the per-row price/vendor/lead-time/doc-code entry the extractor never produces (F1). Net saving on the dossier's own numbers is plausibly zero or negative.

**Fix:** re-derive from lane 02's rate and the real field set; pre-register the null hypothesis.

### T-b · A1-1's "15–25 studio minutes" is mostly not entry — **major · medium**

`Open a project` is four fields (`open-project-sheet.tsx:121-165`); the household is one picker row. That is ≤5 minutes of duplicate entry. The rest is "one explanatory handoff," which the product does not remove — the hire still learns where things are, and the teammate-persona copy that would help is dark for Leah's studio (01 §5; 04 (c)).

**Fix:** split the claim into entry minutes (≤5, measurable) and explanation minutes (attributable to Kody's call, not Patina).

### T-c · A1-6: 1–3 minutes per transfer for an L build with hard failure modes — **minor · high**

Even at the proposal's own trigger (two observed repetitions) that is under ten minutes a month. The gating is honest; the ratio says it should not occupy one of seven slots.

**Fix:** parking lot.

### T-d · A1-7's bookkeeper handoff is unobserved — **minor · medium**

The only bookkeeper seat in prod never joined and was removed (`4c106571`, 03 §2.1). "10–20 minutes of spreadsheet reconstruction" is against a workflow nobody has seen.

**Fix:** label as untested need; keep the export for VISION §4 reasons, not for this saving.

### T-e · A1-5's 5–10 minutes is against a workaround that is not current — see F4.

---

## 5. Cost estimates against the code

| Move | Proposal | Code says | Note |
|---|---|---|---|
| A1-1 | S | S | Correct, but recurring founder hours (~2–3 h per studio: session + prep + handoff) hide behind "S"; the 45-minute stop rule is the right guard. |
| A1-2 | M | **M at existing breadth; L for what is promised** | Pipeline is staged→committed with decisions, dedupe, idempotency, upload registration (F2). Widening to money/vendor/lead-time is the L (F1). |
| A1-3 | L | **M wiring; L only for field widening** | `stage_project_ffe_import` exists (F3). Shares A1-2's blocker. |
| A1-4 | L | L | Correct. Hidden scope: `vendor_quote_requests.vendor_id → vendors` while `mint_paperwork_link` requires a `studio_contacts` row with `entity_kind='company'` (00637:232,614) — a second link kind or a vendor↔contact bridge is in scope. |
| A1-5 | M | **S or nothing** | Core deliverable ships (F4). |
| A1-6 | L | L | Correct; `CaptureShareExtension/` empty, 0 pbxproj refs. |
| A1-7 | M | **S–M, independent of import** | `project_ffe_items` already holds `trade_price_cents, unit_price_cents, markup_percent, line_total_cents, vendor_name, doc_code, eta`; a studio-private CSV mirroring `time-export.ts` needs no import. Coupling it to "whichever import is approved" delays a cheap VISION §4 fix. |

---

## 6. What A1 would make worse for an owner delegating for the first time

1. **She becomes the reviewer of machine output about her own job.** Twenty candidate rows, each needing a room and a duplicate decision, none carrying a price — and the tool's word is "candidate." That is a new job for the owner, on the week her workload doubled (V-a, F1).
2. **Two live copies, no sync.** The original stays authoritative (rightly), so the hire is acting on a Patina copy that lacks prices and drifts the moment either side edits. The proposal's only reconciliation mechanism ("changed source versions require a comparison") is unbuilt and PDF-only.
3. **The hire learns that Kody does it.** Founder-assisted preparation moves the process from the owner's head into Kody's hands, not into the studio (07 §3 item 2: "process only exists in the owner's head"). The IKEA/endowed-progress evidence the dossier cites (06 §9–10) requires *her* completed labor and an honest reason for the head start.
4. **The hire still arrives on the owner's copy.** `onboarding-teammate-persona` is 0% outside kochaver/patina domains (01 §5), so the person A1-1 hands off to never sees "Anything you begin here belongs to the studio, not to you."
5. **~2–3 hours of the owner's week** (60-minute session, consent + redaction, a second call, a re-check after the next obligation) for a hypothesized 15–25 minutes saved.
6. **Her client's document goes to a third-party model with nothing on screen saying so** (V-b).

---

## 7. What is missing

1. **The money-in door.** Invoicing is the only loop Leah completes (03 §6.2; 08 G2); the hours→invoice bridge is absent (02 §1.6: `time_entr|hours` in `use-invoices.ts` → nothing). The proposal names "use existing invoicing" as a fallback and builds nothing there, while leading with FF&E on a studio with 31 FF&E items and 0 POs in all of prod (03 §6.4). **major · medium**
2. **Widen `onboarding-teammate-persona`.** Zero code, lands exactly on the delegation moment A1-1 tests. Not mentioned. **minor · high**
3. **Calendar / ICS.** The one stage with nothing in either direction and where popping out costs nothing (02 §1.8, §6.7). Deferred wholesale, while phone-share (A1-6, L) gets a slot — inconsistent. **minor · high**
4. **Measurement as wave 0.** The proposal says "repair the event-name mismatch before using activation views" but does not sequence or cost it (03 §5; 08 G9). Either it is a precondition or the pilot is scored by case log only — say which. **minor · medium**
5. **The vendor entity split** for A1-4 (`vendors` vs `studio_contacts`). **minor · high**
6. **Rate limit / cost ceiling** on an unflagged extraction door. **minor · medium**
7. **A named hire.** F5.
8. **The completeness-branch first move.** F7.
9. **Realistic dates.** L5 on Sept 23, consent + redaction + prep + assisted transfer Sept 24–25, two recruited network studios Sept 24–30 with no lead time. **minor · medium**

---

## 8. What survives, and why

- **A1-1 as a working-set *session*** — S, no code, correct posture (real job, real paperwork, existing door, no demo document). Survives **only** with a named hire; otherwise it is a setting-up session and the delegation metric is dropped from this pilot.
- **A1-2 as an M door at existing breadth** — the server pipeline is real and unused; a review sheet over staged→committed rows with room decisions is honest work. Survives with F1's re-scope (name/qty/room/category), T-a's re-baseline, V-b's disclosure, and R-b's cap. It is a way to *see whether she has the PDF at all*, not a money import.
- **A1-7 decoupled and first** — a studio-private FF&E CSV with cost basis closes a VISION §4 contradiction (02 §1.3, §6.3) for S–M, needs no pilot, and de-risks the pilot by making leaving possible before asking her to rely on anything.
- **A1-3 as M wiring, later** — only after A1-2 shows a real spreadsheet exists; shares the field-breadth decision.
- **The learn-first block, the case-log design, the stop rules, and the "what did this remove from your day?" question** — all survive unchanged.

**Park:** A1-5 (already ships), A1-6 (ratio), A1-4 (right shape, wrong week; needs the entity bridge and an observed forwarding habit).

---

## 9. Evidence quality of this critique

**VERIFIED by file read this session:** every code citation above (extractor schema and prompt; 00435/00437/00439/00444/00448/00455 function bodies and grants; `open-project-sheet.tsx`; `product-picker-modal.tsx` ↔ `add-to-project-sheet.tsx` ↔ `ffe-section.tsx` chain; `board-add-rail.tsx` `source_url`; `quote-request-send` modes; 00162 and 00637 FK targets; `project_ffe_items` columns from `database.types.ts`; empty `CaptureShareExtension/`; R4, R133, V9, V11, VISION §3–4; L5 one-pager blocks; studio-rosters README #3). Zero-caller greps re-run here for all FF&E import RPCs. **INFERRED:** that Kody's twenty assisted minutes would dominate the sixty-minute metric (from the proposal's own agenda); that owner review minutes exceed entry minutes at the extractor's field breadth (from lane 02's per-line rate, not measured). **UNAVAILABLE:** identity of `1a94f78f`; whether any R133 call has occurred; whether `ANTHROPIC_API_KEY` is set on Strata; live PostHog flag state. No production data was queried and nothing was mutated.
