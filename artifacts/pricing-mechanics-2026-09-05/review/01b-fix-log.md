# 01b — fix log for `01-evidence-vision-review.md`

Subject: `artifacts/pricing-mechanics-2026-09-05/proposal.html`. Every finding E1–E47 below.
`source/proposal.md` was **not** edited: no finding instructed a spine change (E22 names the spine only to show where "roughly evenly" was introduced).

## Code claims

- **E1** — applied. P6's dependency row now cites `review-release-sheet.test.tsx:157-170` (verified: the header-array + "no trade cost" assertions), with a clause saying what it asserts. `:424` is now cited only in R10.
- **E2** — applied. §3 reads "which at this app's 18px root `globals.css:1283-1285` is 9.9px and 10.4px" (root confirmed at `globals.css:1284`).
- **E3** — applied. P10 dependency row: `00390:1622` → `00390:1605` (verified: `'valid_until', proposal.valid_until`).
- **E4** — applied. "an unlabelled numeric input" → "an input with no visible label — only a placeholder, with the accessible name set at `ffe-schedule-builder.tsx:1731`".
- **E5** — applied. P8 dependency row split: header string at `:82`; inline sizes at `:178,202`.
- **E6** — applied. `use-studio-billing.ts:47-63` → `:44-59` (verified: hook spans 44–59).
- **E7** — applied. `use-proposals.ts:1675-1720` → `:1678-1716`; `use-projects.ts:372-470` → `:372-468` in both the P0 dependency row and the appendix table (both ends verified by brace-matching).
- **E8** — applied. P9 dependency row now cites `api/catalog/import/route.ts:9,102` (the dollars→cents parse and `price_retail: price.value`); `import-sheet.tsx:127` dropped.
- **E9** — applied. F1 now reads "read zero times on the proposal-item path (the Piece configuration path does read it `piece-configuration-model.ts:577`)".
- **E10** — applied. All three occurrences (§1, §3, appendix) now say 520 applied migrations, 521 counting the one under `_pending/`.
- **E11** — applied. R10 retitled "the lock copy, in its two forms"; both strings named with their surfaces, the pinned form identified as "Prices lock on release." with both test citations, and the recommendation now says which one survives and that `ffe-section.tsx:1494` is the surface out of step.
- **E12** — applied. The two authorization snapshot builders `00412:1958-1970,1985-1995` added to §3's explicit-column-list roster and to P4's dependency row (line numbers verified: `INSERT INTO public.proposal_items` at 1958, `INSERT INTO public.furnishing_authorization_items` at 1982).
- **E13** — applied. §3's opener now says "re-checked", and names the three carried-over citations as corrections listed in the appendix.
- **E14** — applied. The "one hundred and seventy-three citations" count dropped; the sentence now reads "These are the load-bearing ones."

## Fixture arithmetic

- **E15** — applied. M4 gains a Qty column and its money headers are now "Trade each" / "Client each", so the unit figures reconcile against M3/M7/M10 line totals.
- **E16** — applied with change: kept $3,915 (it is an input to `check-math.mjs`) and took the reviewer's second option — the fixture now says Prairie Loom is a small workshop publishing one price at a flat 26% trade discount, so its retail sits at 1.35× trade rather than 2.2–2.5×, which is why the ceiling bites on this line and no other.
- **E17** — applied. M1-Proposed now carries two footer lines: "After P0 … $16,880 to the client … 0% blended on cost" and "After P3 … $22,790 … 35.0%", with the trace explaining why the first reads 0%.
- **E18** — applied. M3 footer: "4 lines moved" → "$740 spread over 4 lines".
- **E19** — applied with change: rather than moving the date to Sep 11 (which would collide with R6's Oct 11 worked example and three other Oct 11 mentions), the priced-on section now states that Halvorsen holds its own quotes sixty days and that a stated validity date always wins over the thresholds.
- **E20** — applied. M7's client trace now says the 50% deposit and its wording are a fixture assumption, with no code rule and no trade source behind them.

## External claims

- **E21** — applied per ruling. §4: "MAP is a vendor-enforced *floor* on advertised price"; the ceiling named as the maker's own published retail. R2's tension rebuilt on the retail-ceiling argument the fixture uses; the MAP sentence is gone from R2.
- **E22** — applied per ruling: "handled inconsistently, with no dominant convention".
- **E23** — applied per ruling. The 3.5–9% band is marked aggregated trade coverage, not re-verifiable at a single URL; the 5% fuel surcharge and the 15–17% MDF/solid-wood figure are attributed to Home Accents Today.
- **E24** — applied per ruling. Body derives it in line: "35% on cost is 25.9% on price — 0.35 ÷ 1.35, derived here rather than cited." The appendix row's LuAnn Nigara attribution is replaced by a statement that the figure is derived, not attributed. No source added.
- **E25** — applied per ruling. Matrix line reads "not confirmed in any of the eight". §1 reads "none of the eight documents a first-class blend … an absence in reachable public documentation, not a demonstrated absence in the products. This is Patina's to do first, on the evidence we could reach." P2's body and master cell now say "none of the eight products documents".
- **E26** — applied: "the two vendor terms pages fetched say so, and a third adds a 150-day materials window on top of it."
- **E27** — applied. "Furniture CPI" → "Living, kitchen and dining furniture inflation … on the furniture-and-bedding series".
- **E28** — applied. Materio's project-level fee calculation added with its "mechanism not confirmed" caveat.
- **E29** — applied: "Hybrids are widely asserted across practitioner-adjacent writing rather than survey-verified".

## Vision compliance

- **E30** — applied per ruling. A four-line feature-test block sits in §5 before the principles: surface (The Document — Drafting Room FF&E facet, project FF&E schedule, release sheet) · studio moment (first hands while the schedule doubles) · stream (the upside stream, left entirely to the studio; Patina paid on the subscription floor) · promise ("the studio won't notice Patina").
- **E31** — applied per ruling. F150 is written out as a low-confidence observation from a simulated junior-designer walk of a different screen, with the standing `[simulated]` mark. The identifier is gone.
- **E32** — applied. "bespoke path" → "custom-commission path".
- **E33** — applied. R9 now names `packages/fulfillment/src/money.ts:53,76-77` (`margin_floor_warning`, 25%, terracotta) as the precedent and states explicitly that it is a different number on a different rail that happens to share a value. P3 carries a one-clause pointer to R9.

## Rulings

- **E34** — applied per ruling (R8's reading wins). P7's "why the studio cares" rewritten: today's boundary is defensible, the missing record is the gap. The master-table P7 cell says the same. The state table's "Signed" row is split into "Signed · client price → change order" and "Signed · trade price and markup → editable through the RPC and into the record".
- **E35** — applied: "One ruling blocks copy and one blocks a shape … R2 fixes which field is the primitive — which is P1's core code decision, not a wording choice."
- **E36** — applied. M3's second mode is drawn greyed (`switch span.future`, "Hold the blend % · later") and a note above the constraints says the sheet is drawn to R3's recommendation rather than shipping the hedge.
- **E37** — applied. R1's ruler line now ends "if the two disagree, the practice wins and the default is changed to follow it".

## Simulated vs verified

- **E38** — applied per ruling. A standing `[simulated]` mark (small mono, `.sim`) now sits at every lean the finding lists: F4, P2's bookkeeper caution, P3 (both the first hire and the principal's condition), P4, M5's trace, P5, P8, master-table P4 and P5 and P5's dependency row, §9's "the one the panel wanted most", R4, R7, R10, and §11's lede. The appendix sentence is rewritten to an honest one: "The panel is not evidence. Every place this document leans on it above either says *simulated* in the sentence or carries a `[simulated]` mark."
- **E39** — applied per ruling: "A simulated first-hire persona `[simulated]` was written to say she found the tab, does not know whether she is cleared, and has been leaving it alone…" — the sentence is kept, now reported as from a simulated persona.
- **E40** — applied. The UI is called "the lens" throughout (§1, §3's gate sentence, P8's "what changes", M8's trace, R1's opener); "panel" is now reserved for the simulated group.

## Feasibility honesty

- **E41** — applied per ruling (blocker). P10 is scoped to the proposal's Investment block only — S, no migration — and its body, master surface cell and master "what changes" cell say so. A sentence in P10 and a named Wave-two addition in its dependency row record that the authorization has no validity date (`project_commercial_documents` has no `valid_until`; `create_furnishings_authorization_from_schedule` `00422:370` builds one straight off a schedule with no parent proposal) and needs a small migration plus a stated rule. M7's client panel drops the "Prices good through" line (four columns, total and deposit kept) and its caption now reads "a good-through line follows once the authorization carries a date (P10, Wave two)". §6's P6 case and P6's "what the client sees" match. R7's recommendation is now "Good through only — on the proposal now, and on the authorization once that document carries a validity date of its own — never a per-line date on a client surface."
- **E42** — applied with change: rather than widening the narrow Effort column, P0's who-line reads "Effort S · One function-re-issue migration" and the master dependency row now opens "**One migration** — the SQL leg is a function re-issue, which is a hand-numbered file and carries the whole numbering discipline with it".
- **E43** — applied with change: took the reviewer's second option rather than splitting P0 into P0a/P0b (a split would break the eleven-row master table). P0's "why the studio cares" and the master dependency row both say plainly that the one margin definition changes reported figures on the account page and the project financials, and that this is a behaviour change, not a refactor.

## Anything else

- **E44** — applied. A note under §7's lede marks which proposals answer the ask (P1/P2/P3 → control and a held total; P4/P5/P6/P10 → trust in the cost; P0 the floor) and names P7, P8 and P9 as adjacent repairs that answer neither.
- **E45** — applied per ruling: "This is Patina's to do first, on the evidence we could reach", landing after the corrected absence wording.
- **E46** — applied. Claim dropped: "Ten, trimmed from the twelve the simulated panel produced. Most take a sentence; three are compound and will take two."
- **E47** — applied. Q1 and Q4 swapped in place, so "How you price today" carries the studio-default question and "The Blend" carries the room-total-vs-line-price question; numbering and the 3/3/2/2 grouping are unchanged.

**Counts:** 47 findings — 43 applied as written, 4 applied with a stated change (E16, E19, E42, E43), 0 left.

---

## Gate output

```
== check-math ==
math ok
== grep -c '<img' ==
0
== grep -ciw 'AI' ==
0
== grep -c 'box-shadow' ==
0
== figures still present ==
$22,790 : 11
$5,910 : 4
$20,360 : 3
$10,180 : 5
37.9% : 2
$7,900 : 7
$930 : 4
== anchors ==
12 nav anchors, 12 ids, unresolved: none
== size ==
  167842 proposal.html
== structural counts ==
div.ruling: 11
master P0-P10 rows: 11
defects F1-F5: 5
```
