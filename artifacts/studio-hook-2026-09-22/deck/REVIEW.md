# Fact-check review — "The Second House" deck

**Role:** adversarial fact-check, separate context from the deck author. **Date:** 2026-09-22.
**Target:** `artifacts/studio-hook-2026-09-22/deck/index.html` (26 slides). `artifact.html` verified byte-identical
in every slide body and in the `<style>` block (26/26 sections match, 0 diffs), so every finding applies to both files.
**Sources of truth read:** `research/01`–`08`, `design/program-final.html` (rendered to text), `design/completeness-critic.md`
(§4 = the 18-item must-NOT-claim list), `design/critique-A1.md`, `design/critique-A2.md`, `design/redteam-fable.md`,
`design/proposal-A1.html`, `design/proposal-A2.html`, `design/proposal-F1.md`, `design/proposal-F2.md`, `deck/BRIEF.md`,
`docs/vision/VISION.md`.

Severity: **blocking / major / minor**. Confidence: **high / medium / low**. Nothing filtered by severity.
No file in the deck was edited.

---

## 0. Verdict

The deck is unusually disciplined. Every headline production number I traced — five organizations, 32 days, 10 invoices,
6 proposals / 1 out, 0/0/0, 26 sign-in days, 156 of 158 pulses, 23 of 45 proposals, 18 queued notices, 0 and 4200%,
42 profiles, 400 notification rows — lands exactly on lane 03's verified rows. Sixteen of the eighteen items on
completeness-critic §4 are honored cleanly, including the hardest ones (no time-saved figure anywhere, no vendor statistic,
no "Hartwell", no standalone "AI", Wave 1's four mutations named, Kody's week totalled, the funnels retired rather than
repaired, "your data exports" marked not-yet-true).

Two things do not hold. First, the deck describes a method it did not run: slide 3's "each proposal read by the other
family" is contradicted by program-final's own closing line, and by the design directory, which holds two critique files
rather than four. Second, the one slide a studio would actually read still contains the sentence the completeness critic
rated **blocking** — "nothing goes to a client unless you decide it's ready" — with the homeowner invitation disclosed only
in a leadership-facing mono footer beneath it.

Beyond those, the recurring soft spot is **cost tags**: §4.11 requires every tag to carry its amendment, and P6 and H1 and
P2a do, while P5 (S), P3 (M), P3f (M) and P2b (M) do not.

---

## 1. Blocking

### BL-1 · Slide 22 — the consent sentence the critic rated blocking is still in the studio's copy, undisclosed
**Severity blocking · confidence high.**

**As written (slide 22, brief body):** "Keep the tools that work. You don't need to tidy a spreadsheet or write instructions
for us. Screen-share is enough, and **nothing goes to a client unless you decide it's ready.**"

**Source:** `completeness-critic.md` B1 (blocking · high) and §0.1: to bill a house outside Patina the studio "must first
send her homeowner a Patina invitation (`client-picker.tsx:125-135`), then the invoice letter. **Two emails to a real
client**, from a product that client has never seen, before the studio has decided anything about Patina." The critic's
prescribed fix is explicit: "**Name it in the brief.**" §6.1 repeats it: "The homeowner invite as a named step in P5,
**with its own consent line in the brief**."

**What the deck does:** it names the send twice in leadership register — slide 17 ("This trial is not quiet") and slide 24
("One homeowner receives an invitation and an invoice") — and, on slide 22 itself, only in the small mono source footer:
"if the bill is on a house outside Patina, the homeowner receives an invitation and an invoice, and that sentence belongs
in this brief before it is sent." That footer is the deck's citation apparatus, not brief copy. program-final says the brief
"can be excerpted after copy approval"; an excerpt of the brief body carries the sentence and drops the correction.

**Why it matters for a Beta Studio reader:** this is the single sentence a studio owner would quote back if her client got
an unexpected Patina invitation. The deck knows the correction and put it everywhere except the place the critic asked for.

**Fix:** add one plain line inside the brief body, in the same voice — e.g. "If the bill is on a house that isn't in Patina
yet, your client gets two things from us: an invitation to their page, and the bill. Nothing else, and nothing before you
say go." Then the existing sentence is true as written.

---

## 2. Major

### MA-1 · Slides 3 and 26 — "each proposal read by the other family" describes a critique pass that only half happened
**Severity major · confidence high.**

**As written (slide 3, SVG diagram box):** `CROSS-FAMILY CRITIQUE` / "each proposal read by the other family".
**As written (slide 26, roster):** "Critics assigned across families, never to their own author."
**As written (slide 1, byline):** "with a team of 29 agents."

**Source value:** `program-final.html` §Evidence and delivery states plainly: "proposal F1/F2 and critique-A1 were checked
at the disputed sections. Origins preserve v1's proposal IDs. **No absent F1/F2 critique files are relied on.**"
The design directory contains exactly two critique files — `critique-A1.md` and `critique-A2.md` — both authored by the
Fable family against Astra proposals ("adversarial critic, other model family"). There is no critique of F1 and none of F2.
`BRIEF.md` line 3 also says "four cross-family critics", which is where the deck inherited it.

**Why it matters:** slide 3 is the deck's claim to method, and the method is the reason a leadership reader is asked to
trust n=1 evidence. "Each proposal read by the other family" reads as a symmetry guarantee. It was not symmetric: Astra's
two lenses were adversarially critiqued, Fable's two were not.

**Fix:** change the diagram sub-line to "Astra's two proposals read by Fable; F1/F2 critiques were not produced" and amend
the roster sentence the same way. Reconcile or drop "29 agents" (see MI-19).

### MA-2 · Slide 16 — P5 is tagged "S" with none of the three preconditions that make S conditional
**Severity major · confidence high.**

**As written (slide 16):** `P5 · S` — "Finish the next invoice, on another house".
**Source value:** `completeness-critic.md` §4.11 forbids "That any move costs what its tag says without the amendments:
**P5 is S only under three named preconditions**…". §1 states them: (a) the household link forces a homeowner invite;
(b) "whoever clicks *Open the project* is stamped `designer_id` (00331:408) and **must hold a designer-domain role**
(00511:3392, 00578:2250) — the dossier does not record Kody's role domain"; (c) "'trial-window record' is a written note,
**no system holds it**."

**What the deck carries:** (a) only, and only on the next slide. (b) and (c) appear nowhere in the deck. Compare the deck's
own handling of P6, where the tag is written `P6 · M–L · conditional` with the refutation spelled out in a sub-line — the
right pattern, applied to the one move that is not applied to P5.

**Fix:** tag it `P5 · S, conditional` and add a one-line sub-note naming all three: the homeowner invite, the
designer-domain role requirement on whoever clicks *Open the project* (Kody's role domain is unrecorded), and that the
trial-window record is a hand-kept note with no system behind it.

### MA-3 · Slide 14 — the eight convergences have no source, and one of them contradicts program-final's own origin tag
**Severity major · confidence medium-high.**

**As written (slide 14):** "Where Fable and Astra agreed" — eight numbered convergences.
**Footer cites:** "program-final §Disagreements for leadership · redteam-fable §2".

**Source value:** program-final's §Disagreements holds exactly the three disagreements the slide's right-hand column
reproduces correctly (attribution / zero products ≠ zero schedules / "zero signed" cannot be certified — all three verified
verbatim against the source). Neither program-final nor `redteam-fable.md` contains a convergence list at all; I grepped
both plus all four proposals. The eight items are the deck author's synthesis presented as a recorded finding.

Most of the eight are individually defensible from program-final's origin tags — P1 is credited to "A1/A2 learn-first +
F1-M7 + F2-L1–L5", which genuinely spans both families. **Item 6 is not.** "Pull the Pledge band now" is tagged in
program-final as **`P2a · F2-M5/M7 + F1 stop-doing + trust critiques`** — both Fable lenses plus the critiques. No Astra
lens is credited with it. Presenting it under "Where Fable and Astra agreed" contradicts the program's own attribution.

**Fix:** retitle the column "Where the four lenses converge, per program-final's origin tags", cite the origin tags rather
than §Disagreements, and either move item 6 out or re-credit it to F1/F2 + the critiques.

### MA-4 · Slide 1 — the deck is addressed to "the Beta Studios", an audience the critic says does not exist
**Severity major · confidence medium.**

**As written (slide 1 eyebrow):** "Patina · for Leadership and the Beta Studios · 22 September 2026".
**Source value:** `completeness-critic.md` §0: "the deck's largest risk is audience: it is addressed to 'Beta Studios
themselves,' **and there are none**." §5.3 makes it one of three decisions leadership must make first: "'Beta Studios
themselves' is an audience of one today; **presenting it otherwise is the presumption a referred owner would notice
first**." §4.1 forbids claiming anyone besides Leah is a beta studio. B7 adds that the brief "has no referred-studio
audience" until P2b's terms exist.

**What the deck does:** it mitigates twice — the cover meta says "This is a program for one studio, and a decision about
whether to earn a second", and slide 24 line 1 says no beta studio besides Leah exists in the data; slide 23 says the brief
"goes to Leah only until those exist". But the eyebrow, the first line of the deck, still addresses a plural cohort.
`BRIEF.md` is the origin, so this is an inherited instruction the deck did not push back on.

**Fix:** "Patina · for Leadership · 22 September 2026", with the existing meta line doing the audience work. Or
"for Leadership, and for the first studio" if Leah is meant.

---

## 3. Minor

| # | Slide | Claim as written | Source value | Fix |
|---|---|---|---|---|
| MI-1 | 5 | Caption: "**Two** empty cells. The program exists to fill them." | The table renders **four** `—` blanks: Houses live today, Where each house lives, and the two halves of "prepared by Leah / by Kody's seat". program-final has the same four. | "Two unanswered questions" (houses + where), or "Four empty cells". **minor · high** |
| MI-2 | 5 | "Days to Leah's first project — 32" | program-final: "Days to first project **credited to** Leah — 32". The qualifier is load-bearing: 00291 credits `NEW.designer_id`, "none uses the acting caller" (program-final P1). The same slide flags attribution as unresolved for invoices but not for the project. | Restore "credited to". **minor · high** |
| MI-3 | 5 | "Products / contacts / field captures — 0 / 0 / 0" | Verified in 03 §2 as table rows. But `completeness-critic.md` §4.6 forbids claiming Leah "captured nothing" because "`first_capture` fired on **day 38**" for `ce3aee90` (03 §4). The deck carries the 0 and never reconciles it. | Footnote the row: "0 `field_captures` rows; the `first_capture` activation event did fire on day 38." **minor · medium** |
| MI-4 | 6 | Checklist rows ("Name and brand the studio; set your title; invite your crew; review an empty rolodex; open one project; have the first hire open a document") and closing line "The marks follow the work." | Both trace to **02 §1.14** (`studio-setup-checklist.tsx:145-234, :239-243`), not to any source cited in the footer ("01 §1–§3, §7–§9 · 03 §3 · program-final §Corrections retained from v1"). | Add `02 §1.14` to the footer. **minor · high** |
| MI-5 | 6 | Path chips `00575:655-690`, `00561` | `BRIEF.md` slide 6: "each item verified in code (**cite file basenames, not line numbers**)". Values are correct; the format deviates from its own instruction. | Drop the line range, or accept the deviation deliberately. **minor · high** |
| MI-6 | 8 | "The Field Line SMS rail … The Desk card that would show them **sits behind an off flag**." | 02 §1.9 states it via the runbook, and **08 G10 row 9** flags it: "The flag claim is a PostHog-side fact **nobody read live**", and the runbook line "is dated to the Phase-3-absent state" while `FIELD_LINE_PHASE=3` was set 09-21. BRIEF: "When a source marks something INFERRED or UNAVAILABLE, the slide says so or omits it." | "…sits behind a flag last recorded off; live flag state was not read." **minor · high** |
| MI-7 | 8 | Footer cites "02 §1.3, §1.4, §1.8, §1.12" | The paperwork door is **§1.10**, not §1.4 (§1.4 is vendor quotes, which is the *other* bullet). The hours-card flag is **§1.9**, not §1.8. | Cite §1.3, §1.8–1.10, §1.12. **minor · high** |
| MI-8 | 9 | Footer cites "03 §5–§6 · 08 G9" | "18 invoice-attention notices … queued" and "400 notification rows, no email open and no click" are both **03 §3.4**, not §5–§6. | Add §3.4. **minor · high** |
| MI-9 | 11 | "It would've been quicker to do it myself… this isn't a hiring problem. It's a systems problem." — Interior Designers Hub | Both halves are VERIFIED, but they are **two separately catalogued quotes** in 07 §4 (#3 and #4), not one utterance. The ellipsis implies elision inside a single passage. Footer cites "§quotes 1, 3, 8, 15" and omits #4. | Split into two quoted fragments joined by a slash, or cite quotes 1, 3, 4, 8, 15. **minor · high** |
| MI-10 | 11 | "My clients can find this confusing." — "Kristen S., Capterra reviewer, **on a client portal**" | 07 quote #15 (VERIFIED): the confusion is about being "directed to designfiles.co website" for questionnaires and presentations. 07 §3 item 5 does group it under "client-facing tools". "Client portal" is an interpretive gloss on a verbatim slide. | "on being sent to her software vendor's site". **minor · medium** |
| MI-11 | 12 | "Leah's **one** recorded departure went back to the old portal seeking completeness" | 08 G3: L2 recorded "**Old-portal flights: 2+ — triggers NOT captured**"; L3 captured the reason for one of them. So: two or more departures on record, one explained. (completeness-critic §3 uses the same singular, so the deck inherited it.) | "Leah's recorded departures — 2+, with one reason captured — went back to the old portal seeking completeness." **minor · high** |
| MI-12 | 13 | A1 survived: "The working-set session; an honest FF&E door at the breadth the field already has; export decoupled and taken first." | `critique-A1.md` §0 verdict matches almost verbatim — except it reads "A1-1 as a *session* **(if a hire is found)**". Critic B8 notes `1a94f78f` is unnamed and dormant 18 days and there are 0 `studio_contacts`, i.e. no hire is established. | Restore the conditional. **minor · high** |
| MI-13 | 3 vs 13 | A2 is titled "**THE NEXT STEP, PREPARED**" in the slide-3 diagram and "**The system does the next step**" on slide 13. | `proposal-A2.html` h1 is "The next paper, already prepared"; its dek is "The system does the next step." Both deck forms are defensible; using two inside one deck is not. | Pick one and use it in both places. **minor · high** |
| MI-14 | 16 | Card title "Remove the false promise, **quiet the trial**"; body "Pause the two active Middle West onboarding enrollments". | §4.4 forbids claiming "the trial is quiet". The deck corrects it on slides 17 and 24, so the net position is honest — but §4.15's second half is missing: "**`86cdd0aa` (tester) keeps running**" (03 §3.2: step 13, active, next step **09-28**, inside the window). A reader of slide 16 alone concludes the window goes quiet. | Title: "Remove the false promise; pause two enrollments." Body: add "A third enrollment (the QA seat) keeps running through the window." **minor · high** |
| MI-15 | 16 vs 23 | Slide 16 P5: "*Open a project* → draw → **issue and send** when she ordinarily would." | Slide 23 decision 02 lists homeowner-in/out as an **open** decision with "end the trial at *issue*" as the live alternative, and critic §5.1 says "Everything about P5's shape follows from this." Slide 16 presents the send as settled. (program-final has the same shape.) | "…→ issue, and send if decision 02 says the homeowner is in." **minor · high** |
| MI-16 | 18, 19 | `P3 · M`, `P2b · M`, `P3f · M · conditional` | §4.11: "P3's M is misallocated". §7: "P2b (split free/paid; **free branch M, paid L/XL**)"; "P3f (split: **spreadsheet S now, originals M later**)". None of the three amendments is on a slide. P6, P2a and H1 all carry theirs correctly, so the pattern is inconsistent rather than absent. | Add the split to each tag, as P6's tag already does. **minor · high** |
| MI-17 | 22 | Ask 2: "Thirty minutes on it together. You choose the work…" | program-final's brief ends that ask with "**Stop at thirty unless you want to continue, up to an hour.**" The deck drops it. It is the only sentence in the brief that caps the studio's own time. | Restore it. **minor · high** |
| MI-18 | 26 | "08 — the seven lanes cross-read against project memory and the code, which is how **every** production seat was finally named." | 08 G1 leaves two unnamed: `1a94f78f` — "**UNAVAILABLE — the only seat nobody can name**" — and `4c106571` ("identity UNAVAILABLE"). The deck's own slide 4 table says "unnamed — the one seat nobody can name", so slide 26 contradicts slide 4. | "…is how most production seats were named; two remain unnamed." **minor · high** |
| MI-19 | 1, 26 | "a team of **29** agents"; "**Eight** researchers … one per lane. **A Fable gap critic** reading all seven." | The only source for "29" is `BRIEF.md`. Counting the artifacts: 8 lanes (01–07 research + 08 gap critique) + 4 proposals + **2** critiques + merge + red team + final + 9 verifiers + completeness critic = 27. Slide 26's roster also counts the gap critic *in addition to* eight lane researchers, double-counting lane 08. With MA-1 (two critics, not four) the headcount is not derivable from any artifact. | Drop the number, or state what is countable: "eight research lanes, four proposals, two critiques, a merge, a red team, nine verification passes and a completeness critic." **minor · medium** |
| MI-20 | 26 | "05 and 07 — … **two named competitor products** do not exist" | 05 §Unavailable: "Foyr Spacecraft" — a product. 07 §1: "**Kaleidoscope** (named in the brief as a design-software **blog/forum**)". One product and one source, not two products. | "one named product and one named source do not exist". **minor · high** |
| MI-21 | 26 | "03 — … PostHog unauthenticated, so **two insights** were not pulled" | 03 §0.2 / §7: insight `8IbnORPW` was not pulled, and "last-90-day designer-portal unique users" were not pulled — one saved insight plus one ad-hoc query. | "one insight and one query". **minor · medium** |
| MI-22 | 4 | Prose: "Production holds five organizations." Directly beside it, a five-row table headed "Seat". | The five seats listed are **not** the five organizations, and `69063af4` is not an organization member at all — it appears in 03 §3.2 (enrollments) and §4, never in the member table. The header says "Seat", so the deck is not lying; the adjacency invites a 1:1 misread on the deck's most-quoted slide. | Add a kicker: "Five seats worth naming — not the five studios." **minor · medium** |

---

## 4. completeness-critic §4 — item-by-item audit

| § | Must NOT claim | Verdict |
|---|---|---|
| 4.1 | Anyone besides Leah is a beta studio | **Honored in content**, slide 24 line 1. Audience label flagged — MA-4. |
| 4.2 | "Delegated designers churn" / "day-0 value retains" | **Honored.** Slide 4 performs the withdrawal ("The 'retained studio-manager seat' … is Kody"). No retention inference anywhere. |
| 4.3 | Invoicing is Leah's habit / ~1.4×/week | **Honored, well.** Slide 15: "an observation about ten records over seven weeks — not a proven habit of Leah's". The 1.4 figure (present in program-final) appears nowhere; grep confirms no `1.4` outside CSS. Slide 24 repeats it. |
| 4.4 | The trial is quiet / internal / sends nothing | **Honored** on slides 17 ("This trial is not quiet") and 24. Card-title wording on 16 flagged — MI-14. |
| 4.5 | "Zero proposals were ever signed" | **Honored.** Slide 24: "Twenty `accepted` rows exist; the status vocabulary proves nothing either way." Slides 5 and 14 both say "real-client acceptance unverified" — the exact phrase the program's own §Disagreements prescribes. |
| 4.6 | Leah "captured nothing" | **Honored in prose.** The phrase is absent. Unreconciled `0` on slide 5 flagged — MI-3. |
| 4.7 | Any vendor statistic | **Honored.** Grepped: no 36%, no 6 tools/6 logins, no 20–40 h/month, no Chameleon/Intercom, no 3.7/5. Slide 10's footer even says "vendor figures omitted", and the checklist claim is softened to "guidance converges on three-to-five items" rather than quoting 19.2%. |
| 4.8 | "8–16 hours of transcription" | **Honored.** Absent. |
| 4.9 | "Leah Hartwell" | **Honored.** Zero occurrences in either file. No surname is used at all. |
| 4.10 | "Your data exports" is currently true | **Honored.** Slide 7: "VISION promises 'your data exports.' **Not yet true.**" Slide 24 repeats it. Verified against VISION.md:54. |
| 4.11 | Cost tags without amendments | **Partly.** P2a (portal deploy) ✓, H1 (six files, one migration, two deploys) ✓, P6 (M–L + dead-batch) ✓. P5, P3, P3f, P2b ✗ — MA-2, MI-16. |
| 4.12 | "The program authorizes no production change" | **Honored, and well.** program-final's own "authorizes no production change" sentence is dropped; slide 17 names four mutations plus the external send, in the same breath as "observe". |
| 4.13 | The trial informs V2 / V6 / V1 | **Honored.** Slide 23: "Untouched by this trial: V1 … V2 … V6. This program produces no pricing evidence." |
| 4.14 | The funnels were "repaired" | **Honored.** Slide 16 H1 says "Retire"; `consumer_funnel` is included per §1; slide 25 lists "Funnel repair as a gate" only as a rejected idea. |
| 4.15 | The drip was paused "for Middle West" | **Partly.** Kody's seat is disclosed ("one of which is Kody's own seat"); the still-running tester enrollment is not — MI-14. |
| 4.16 | Any time-saved number | **Honored.** No minutes, no percentages, no projections. Slide 21 describes the instrument only. |
| 4.17 | Any sentence containing "AI" | **Honored.** Zero `\bAI\b` matches. Slide 24 phrases the ban as "the two-letter label for machine intelligence"; Anthropic is named plainly as a processor on slides 8 and 19. |
| 4.18 | Kody's engineering week is free | **Honored, and this is the deck's best original contribution.** Slide 17: "All of it lands on one engineer, in one week. **The program never totalled it; this slide does.**" Plus "The three-hour cap is a proposed capacity limit, not an observed cost." |

**Score: 16 clean, 2 partial (4.11, 4.15), 0 violated.**

---

## 5. What I checked and found correct

**Production numbers (all against 03, all exact):** 5 organizations, all free tier, no paid tier ever (§1) · zero designer
applications / founding applications / prospects (§1) · Middle West created 2026-08-03, 1 project, 10 invoices, 6 proposals
/ 1 out, 0 products / 0 contacts / 0 field captures (§2) · 32 days to first project (§4) · 26 distinct sign-in days, correctly
labelled "a floor" per §2.2's pruning caveat · 156 draft + 2 sent weekly pulses over 11 weeks, active Friday cron (§6.3) ·
23 of 45 proposals in draft (§6.1) · 18 queued `invoice_attention` (§3.4) · `designer_funnel` at 0 and `conversion_funnel`
at 4200%, with the event-name mismatch and dropped step described correctly (§5.1–5.2) · `last_active_at` /
`total_engagement_score` / `posthog_distinct_id` empty on all 42 profiles (§5.3) · 0 opens and 0 clicks across 400
`notification_log` rows (§3.4) · 17-email drip on a 7-day floor (01 §165, §187; 08 G5) · two seats completed a six-week
curriculum after leaving, one email queued 25 days after a seat went dark (03 §3.2 findings 2–3).

**Seat identifications (slide 4 table):** all five match 08 G1 — `ce3aee90` Leah, `19e7ae9b` Kody, `86cdd0aa` the QA
`tester@patina.cloud` login, `1a94f78f` unnamed, `69063af4` the `+founding-test` drip smoke-test account.

**First-session mechanics (slide 6):** 12–16 inputs / 3 decisions / 4 surfaces (01 line 71, verbatim) · the five send
preconditions and "four of the five are studio setup" (01 §9 item 6, `00575:655-690`) · six coachmarks ending on "Begin
with a lead" (01 §2 row 5) · the `COALESCE` provisioner and the hard-coded `named-and-branded: true` (01 §1a, §9 item 2) ·
`Open a project` (4 fields) and ⌘K "Draft a design agreement" unadvertised (01 §2).

**Import/export map (slide 7):** every one of the eleven bullets traces to 02 §§1.1–1.15 — one Library-only bulk importer,
no contacts/clients/projects/hours/calendar import, zero third-party integrations, clipper `under_review` with no install
URL, Pinterest refused, `vendor_quote_requests` with no response columns and reply-to the designer, the empty
`CaptureShareExtension/`, the 14-column hours CSV, the QBO vendor-bills CSV, the cost-basis-free spec PDF, and
`buildUserDataExport` returning profile/preferences/communications/invitations.

**Outside view (slide 10):** Kim & Kankanhalli 2009 switching costs as central mediator (06 §7) · Polites & Karahanna 2012
inertia "fully mediates" (06 §7, the word "fully" is the source's own) · quiet reversion (06 §8) · Notion's
own-data principle (06 §4) · Superhuman's mandatory 30–60 minute call and graduated exit (06 §2) · NN/g progressive
disclosure beside each step (06 §5) · 3–5 item checklist guidance vs Patina's six (06 §11) · streaks backfiring on
weekly-cadence tools and reading as unsolved activation (06 §12) · Studio Designer's $4,000 desktop migration still drawing
"steep learning curve" reviews (05) · DesignFiles "skip the setup" (05) · Programa's clipper (05) · HoneyBook ingesting
brochures/proposals/questionnaires/contracts (05) · QuickBooks assisted migration free, capacity-gated, one session (05) ·
easy-in/hard-out (05 §178).

**Quotes (slide 11):** all four are tagged **VERIFIED** in 07 §4 — none INFERRED. Wordings match the source. Reddit/LinkedIn
unreachability is disclosed in the footer as 07 §1 requires.

**Lens attributions (slides 13–14):** A1 and A2 correctly credited to GPT-6 Astra, F1 and F2 to Claude Fable, matching the
proposal headers and redteam-fable's "the author (GPT-6 Astra)". A1's bet, F1's "week six to minute forty-five … ending
with a sent artifact", and F2's "subtraction / ask nothing until the job needs it" are faithful to their files. The
"survived" column for A2 matches critique-A2's verdict, including "one candidate per obligation" (critique-A2 §96, §143).
The three code-refuted builds are exactly the three the critiques found: A2-4 hours→invoice ("Bill week"), A2-3 Field Line
correction replies, A1-5 URL capture. The three disagreements on slide 14's right are verbatim-faithful to
program-final §Disagreements.

**Program fidelity (slides 15–21, 23, 25):** the bet sentence is verbatim · Wave 1 dated 23–30 September · P2a correctly
uses the **designer-portal deploy** rather than program-final's `designer-invite` redeploy, applying critic §1's correction ·
P2a names the Accounts band, which §1 says the program omitted · H1 includes `consumer_funnel`, which §1 says the program
omitted · slide 17's four mutations match §4.12 · Kody's week matches §4.18 · slide 21 carries both of the critic's §6
additions (the "where did the invoice go afterwards" duplicate-work row, B4; and the 'told' count, B9) · the continuation
rule matches program-final verbatim in substance · all nine "good ideas" rows match program-final's nine.

**Studio voice (slide 22, against `patina-brand-voice`):** plain-spoken and warm, no "platform", no jargon, no luxury haze,
no banned lexicon (grepped: no disrupt / revolutionize / curated / bespoke / elevated / seamless / platform), technology
silent, no flattery filler, concrete asks, understatement over exclamation, numbers true to program-final. The eyebrow
honestly marks it "draft, pending copy approval". The deck also applies two of the critic's fixes the program lacked: B3's
"a bill is the smallest thing that has to leave a studio **most weeks**" (correctly softened from the critic's "every week",
since cadence is unproven) and B5's "This month we put that packet together by hand". Critic B6 is honored — Kody's
three-hour budget appears on slides 17 and 23 and **not** in anything a studio reads.

**Vision compliance (deck's own language):** no "AI" · no engagement framing (slide 2 states the substitution out loud:
"this is not a hook program") · no dashboard, progress bar, score, streak or red/green visual — every occurrence of those
words is a refusal or a cited literature finding · no lone big number: every count sits in a table with its rows · Leah's
surname is never used, so the Kochaver/Hartwell trap is sidestepped entirely · VISION §4 quotations ("you won't notice
Patina", "your data exports") verified against `docs/vision/VISION.md:50,54`.

**Mechanics:** 26 slides in both files; `artifact.html` body byte-identical to `index.html`'s body and style block;
`artifact.html` correctly carries `<title>` then `<style>` with no doctype/html/head/body wrapper, per BRIEF's artifact
contract; 25 of 26 slides carry a mono source footer (the cover, correctly, does not); file size 74 KB, well under the
600 KB ceiling.

---

## 6. Evidence quality of this review

**Verified by file read this session:** both deck files in full; `completeness-critic.md` in full; `03-prod-evidence.md`
and `08-gap-critique.md` and `07-studio-ethnography.md` in full; `02-manual-workflow-gap.md` §§0–1.15;
`program-final.html` rendered to text in full; the headers and verdict sections of `critique-A1.md`, `critique-A2.md`,
`redteam-fable.md`, `proposal-A1.html`, `proposal-A2.html`, `proposal-F1.md`, `proposal-F2.md`; `BRIEF.md` in full;
`docs/vision/VISION.md` section headings and §4. Targeted greps against `01-first-session-path.md`,
`05-competitor-activation.md`, `06-activation-playbooks.md` for every figure a slide asserts.

**Inferred:** that "29 agents" cannot be reconstructed from the artifacts (I counted 27 from files present; the true roster
may include orchestration agents that left no file). That slide 14's convergence list is the deck author's synthesis —
established by absence across all ten design files, not by a positive statement.

**Rendered evidence:** all five shots `BRIEF.md` §Delivery asks for exist in `deck/shots/` (1440×810 for slides 1, 5, 16,
20 and 390×844 for slide 5). I opened `1440x810-slide-05-middle-west-rows.png`, which confirms MI-1 visually — four em-dash
blanks render beneath a caption reading "Two empty cells" — and `1440x810-slide-16-wave-1.png`, which confirms MA-2: the
card reads `P5 · S` with no conditional marker, while slide 19 tags `P6 · M–L · conditional`. Both shots also confirm the
visual-language constraints: paper/ink palette, Playfair/Inter/DM Mono, hairline rules, no dashboard, meter, score, streak
or red/green status anywhere on the slide.

**Unavailable:** the deck was not rendered live this session, so phone-width reflow beyond the one 390×844 shot, focus
states, keyboard navigation and the print stylesheet are **unreviewed**. No production query was run; every production
number above is lane 03's read.
Live PostHog flag state, Kody's role domain, and the identity of `1a94f78f` remain unknown here as they were to every
upstream lane.

**Not done:** no file in `deck/` was edited; nothing was committed.
