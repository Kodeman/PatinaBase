# 03 — adversarial re-review of `proposal.html` after fix passes 01b + 02b

Scope: the 11 checklist items given for this pass only. Method: raw HTML sectioned by `id=`, tags
stripped per-section with a small Python script, cross-checked against `01b-fix-log.md`,
`02b-fix-log.md`, `source/proposal.md`, `docs/vision/VISION.md`, and `source/check-math.mjs`
(re-run: `math ok`). HTML also passed a stack-based open/close tag check (0 errors) and a
duplicate-paragraph scan (0 hits).

---

## Findings

**Z1 · Master-table P7 cell drops the trade/markup exception that P7's own body and state table establish, and that R8 requires — Confidence: high — Severity: medium-high**

Location: master table, P7 row, "why the studio cares" cell (`proposal.html:1368`).

Problem: the cell reads "One guarded write path and one stated boundary: editable while unplaced,
locked on a sent authorization, **change order once signed**, revise the configuration when
configured." Read on its own, "change order once signed" says every kind of post-signature edit
requires a change order. But P7's own state table (`:1190`) splits "Signed" into two rows —
"Signed · client price" → *Change order* and "Signed · trade price and markup" → *Editable, through
that write path and into the record* — and R8's recommendation (`:1516`) is explicit: "signed means
a change order. Trade price and markup stay editable after signature, but through a guarded write
path and into the record." The master cell is the one place in the document that compresses this to
a single undifferentiated "change order once signed," which a reader who only skims the master
table (a normal reading path — it's the summary table) would take as contradicting the fuller
treatment. Checklist item 3 asked whether "P7 body + master-table cell + state table vs R8 ... now
agree" — the body and state table agree with R8; the master cell does not carry the same
qualification.

Evidence: `proposal.html:1190` (state table, two Signed rows) vs `:1368` (master cell, one
undifferentiated phrase) vs `:1516` (R8 recommendation, explicit trade/markup carve-out).

Fix: append the trade/markup carve-out to the master cell, e.g. "...change order on the client
price once signed (trade and markup stay editable, into the record), revise the configuration when
configured."

---

**Z2 · Master-table P1 cell attributes a claim to "the principal" with no simulated marker, unlike the parallel prose — Confidence: high — Severity: medium**

Location: master table, P1 row, "why the studio cares" cell (`proposal.html:1291`).

Problem: "Deletes the translation step **the principal described**: decide the client number, then
key markup percentages backwards until the tool agrees." No word "simulated" and no `.sim` span.
Compare the proposal-body version of the identical claim (`:898`): "**The principal in the simulated
panel** described her actual workflow as translation..." — which does carry the word. Checklist
item 7 asks that every "the principal" mention outside §12 carry a marker (word or span); this is
the one instance in the whole document (across all six terms searched) that does not. Fix pass 1's
E38 list of marked locations names "P3 (both the first hire and the principal's condition)... F4,
P2's bookkeeper caution... master-table P4 and P5" but never names P1's master cell, so this reads
as an omission rather than a deliberate exemption — the appendix's own rule ("every place this
document leans on it above either says *simulated* in the sentence or carries a `[simulated]`
mark") is violated here.

Evidence: `proposal.html:1291` (unmarked) vs `:898` (marked, same claim).

Fix: add "simulated" to the master cell, e.g. "Deletes the translation step the principal in the
simulated panel described: ..." or append the word "simulated" before "principal."

---

**Z3 · A flat claim of product absence sits one sentence after the disclaimer that forbids it — Confidence: high — Severity: medium**

Location: §04 "The eight tools, condensed" closing paragraph (`proposal.html:711`).

Problem: the section states its own rule immediately above the competitor table (`:64`, sec-trade.txt
line ~57): "Not confirmed means no evidence was found in reachable public documentation... **and is
not a claim the feature is absent**." Two paragraphs later, discussing JobTread: "margin as a
first-class editable field, **which none of the eight furniture tools has**." That is exactly the
claim the document just said it would not make — "has" (not "documents," not "not confirmed") is an
assertion about the products themselves, not about reachable documentation. This is the same fault
E25/D-family fixes corrected everywhere else (the "not confirmed in any of the eight" / "none of the
eight ... documents" phrasing pattern); this one sentence was missed. Checklist item 6 asks whether
"prose does not claim absence" — this sentence does.

Evidence: `proposal.html:711`, contradicting the disclaimer at the same section's table intro.

Fix: reword to "...margin as a first-class editable field, which none of the eight furniture tools
documents" (or "is not confirmed in any of the eight furniture tools"), matching the pattern used
everywhere else in the document.

---

**Z4 · §05 "studio moment" narrows vision's "workload doubles" to "the schedule doubles" — Confidence: medium — Severity: low-medium**

Location: §05 Principles, feature-test block (`proposal.html:721`).

Problem: `docs/vision/VISION.md` §2 defines the studio moment as "the moment it adds its first hands
while **its workload doubles**." The proposal's feature-test block reads "the studio adding its
first hands while **the schedule doubles**." "The schedule" (the FF&E schedule) is a specific
project artifact, not identical to "workload" (the studio's overall business volume) — the
substitution narrows a company-wide claim to a single document growing longer, which is not quite
what §2 says triggers the customer moment. It is a plausible restatement in context (this document
is specifically about the FF&E schedule), but it is not verbatim-accurate to §2, and the checklist
explicitly asks for accuracy to VISION.md §1–§4.

Evidence: `docs/vision/VISION.md` §2 ("its workload doubles") vs `proposal.html:721` ("the schedule
doubles").

Fix: either restore "workload" or make the narrowing explicit, e.g. "the studio adding its first
hands while its workload doubles — here, the FF&E schedule."

---

**Z5 · "hiding the panel" uses "panel" for a UI element, overlapping the word reserved for the simulated persona group — Confidence: low — Severity: low**

Location: P3's M6 mockup trace (`proposal.html:1017`).

Problem: E40 (fix pass 1) states "'panel' is now reserved for the simulated group," and every other
occurrence of the bare word "panel" in the document (12 of 13 instances found) pairs with "simulated
panel." This one instance — "...and says so in words rather than by **hiding the panel**" — refers
to the M6 settings mockup/panel (a `<div class="panel">` in markup terms), not the persona group.
Context makes the meaning clear on a careful read, so this is not likely to actually mislead, but it
is the one place the "reserved word" rule set by E40 is not actually followed, and a reader
scanning for "panel = the simulated construct" could misread it as "don't hide the [simulated
group's] panel," which makes no sense in context and would cause a stumble.

Evidence: `proposal.html:1017` vs the consistent "simulated panel" pairing everywhere else.

Fix: reword to "...rather than by hiding this control" or "...by hiding this setting," avoiding the
bare word "panel" in prose outside the persona references.

---

**Z6 · Generic "bookkeeper" / "homeowner" mentions outside the simulated markers (informational, not a fix pass regression) — Confidence: high (as to their existence) / low (as to whether they need a fix) — Severity: low**

Location: `proposal.html:738, 745, 1190, 1195, 1369, 1516` (six instances of "a/the bookkeeper" or
"a homeowner" with no "simulated" word and no `.sim` span nearby).

Problem: checklist item 7 asks to list every mention of "the bookkeeper" and "the homeowner" outside
§12 that doesn't carry a marker. These six do not. On inspection, all six are generic role
statements describing what *any* bookkeeper or homeowner would experience under the proposed design
("...so a bookkeeper reading the job in month four cannot tell a maker's requote from someone's
edit"; "Nothing in this document widens what a homeowner sees about money") — none of them attribute
a specific claim, want, or behavior to the simulated persona construct. This matches the appendix's
own scoping language: "Every place this document **leans on it** [the panel]..." — leaning on
the panel means citing what a simulated persona said or wanted, which these sentences do not do.
Every instance where the document *does* attribute something to the simulated bookkeeper or
homeowner persona specifically (5 instances: `:940, 1098, 1343, 1348, 1507`) does carry the word
"simulated" or a `.sim` span. Reporting per the letter of the instruction; no fix recommended unless
the standard is meant to be "every occurrence of the word," in which case flag for a ruling.

Evidence: full grep of both terms, cross-referenced against `.sim` span positions.

---

## Items checked clean (no findings)

- **§01 The short version** — two asks, diagnosis, three waves, "nothing resolves V1" all present;
  no sentence exceeds 35 words (longest is 34); reads as a coherent ~500-word summary.
- **§05 feature-test block** — surface / studio moment / stream / promise block present before the
  eight numbered principles; does not claim Patina takes any studio margin (explicitly the
  opposite — "which this document leaves entirely to the studio").
- **P10 / R7 / M7** — P10 scoped to the proposal Investment block, Effort S, No database change; the
  authorization variant explicitly named "a small Wave-two addition"; master table P10 row confirms
  Effort S, Wave 2; M7's client panel caption reads "a good-through line follows once the
  authorization carries a date (P10, Wave two)" and no good-through line appears in that mockup.
- **R2 / §04 MAP-vs-ceiling** — R2's tension is built entirely on "the maker's own published
  retail... the ceiling the fixture's locked rug is already up against"; MAP does not appear in R2 at
  all. §04 and the fixture both describe MAP as a floor and retail as the ceiling, consistently.
- **Competitor matrix blend row** — reads "Blend or spread across a project · not confirmed in any
  of the eight," exactly as required; §01's and P2's prose use the hedged "documents" framing
  correctly (see Z3 for the one exception found elsewhere in §04).
- **§04 tariff/freight figures** — 35%/25.9% is derived in-line ("0.35 ÷ 1.35, derived here rather
  than cited"); Home Accents Today is cited only for the 5% fuel surcharge and the 15–17%
  MDF/solid-wood figure; freight reads "handled inconsistently, with no dominant convention."
- **§11 Questions** — exactly ten, grouped 2/3/2/3 with correct `<ol start>` continuity; each is a
  single question; none presupposes a fact about Leah's real studio (Q9's "Would they know whether
  they were allowed to?" reads naturally even if Q8's answer is "no one").
- **Price-age states (M4/M5/§06)** — four states, each distinct: fresh (faint ink, date, no extra
  word), aging (golden-hour ink + word "aging"), stale (terracotta ink + word "stale"), unverified
  (same faint ink as fresh, but hollow-circle glyph + dotted underline + no date). No red anywhere in
  the palette (terracotta is `#9C5340`/`#D08A72`, not red).
- **Structural regressions** — 0 `F150` occurrences, 0 "173 citations" claims, no orphaned Q about
  category granularity, `review-release-sheet.test.tsx:424` now cited only in R10 (the lock-copy
  finding), not miscited for the four-columns rule (P6's dependency row correctly cites `:157-170`
  for that). No broken/unclosed tags, no duplicated paragraphs. `check-math.mjs` → `math ok`.

---

## Verdict

Needs one more pass. Two of the six findings (Z1, Z2) are direct, checklist-targeted
consistency failures — a master-table cell that contradicts its own body/state-table/ruling, and
the one unmarked simulated-persona attribution in the whole document — both cheap, surgical fixes.
Z3 is a one-sentence overclaim contradicting the section's own stated rule two paragraphs above it.
Z4–Z6 are lower-stakes wording/scope questions worth a ruling but not blocking.

**Counts by severity:** medium-high: 1 (Z1) · medium: 2 (Z2, Z3) · low-medium: 1 (Z4) · low: 2 (Z5,
Z6). Total: 6 findings, 0 at high/critical.

Path: `/Users/kody/Code/patina-merged/artifacts/pricing-mechanics-2026-09-05/review/03-rereview.md`
