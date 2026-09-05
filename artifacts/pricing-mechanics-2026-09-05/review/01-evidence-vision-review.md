# Adversarial review — `proposal.html` ("The Number That Holds")

Subject: `/Users/kody/Code/patina-merged/artifacts/pricing-mechanics-2026-09-05/proposal.html`
Reviewed against: the current `main` checkout, `source/proposal.md`, `research/01`–`05`, `research/00-raw/d-feasibility-memo.md`, `docs/vision/VISION.md`, `docs/vision/VISION-DECISIONS.md`, `docs/design/the-document/DECISIONS.md`, `.claude/skills/patina-brand-voice/SKILL.md`.
Coverage: every `path:line` and `NNNNN:line` citation in the rendered document (≈150 distinct citations, all opened at the cited lines); every figure in every mockup recomputed by hand and against `source/check-math.mjs`; every external statistic traced to its research lane and to the Sources list.

---

## Code claims

**E1 · P6 dependency row · "pinned by `review-release-sheet.test.tsx:424`"**
Problem: the citation offered as the pin on the four-columns-and-no-fifth docblock points at an unrelated test.
Evidence: line 424 is `screen.getByText(/Prices lock on release\./)`. The test that actually pins the rule ("groups by room and shows four columns, no fifth" — asserts the header array `['Item','Room','Signed qty','Client price']` and `queryByText(/trade cost/i)).not.toBeInTheDocument()`) is at `review-release-sheet.test.tsx:157-170`. The number 424 was carried over from the feasibility memo, where it correctly pins the *"Prices lock"* copy for R10.
Confidence: high · Severity: major
Fix: cite `:157-170` in P6's dependency row; keep `:424` only in R10.

**E2 · §3 "Contracts any change must respect" · "which is 8.8px and 9.3px"**
Problem: the px conversion of the lens's inline type sizes is wrong for this app.
Evidence: `financial-lens.tsx:202` is `fontSize: '0.55rem'` and `:178` is `'0.58rem'` (both verified), but `apps/designer-portal/src/app/globals.css:1283-1285` sets `html { font-size: 18px; }` unscoped in `@layer base`. At an 18px root those are **9.9px and 10.4px**, not 8.8/9.3. The qualitative point (below the 12px metadata floor) survives; the numbers do not.
Confidence: high · Severity: major
Fix: replace with 9.9px / 10.4px and note the 18px root.

**E3 · P10 dependency row · "projected by the client bundle `00390:1622`"**
Problem: wrong line for `valid_until`.
Evidence: inside `get_client_proposal_bundle`, `'valid_until', proposal.valid_until` is at **00390:1605**. Line 1622 opens the unrelated `'items'` tier-gating `CASE`. (The same 1622 was in the relayed feasibility memo and was not re-checked.)
Confidence: high · Severity: minor
Fix: cite `00390:1605`.

**E4 · §3 "How a price is made" · "an unlabelled numeric input `ffe-schedule-builder.tsx:1731`"**
Problem: overstatement — the cited line is the label.
Evidence: line 1731 is `aria-label="Markup percent"`. The input has no *visible* label (only `placeholder="Markup"`), which is the accurate claim.
Confidence: high · Severity: minor
Fix: "an input with no visible label".

**E5 · P8 dependency row · "`financial-lens.tsx:82,178,202` inline sizes"**
Problem: `:82` carries no inline size and does not belong in that list.
Evidence: line 82 is `<span className="type-meta">Financial lens · studio only</span>` — a className, and the sole occurrence of the header string. Only `:178` and `:202` set inline `fontSize`.
Confidence: high · Severity: minor
Fix: split — `:82` for the header rename, `:178,202` for the inline sizes.

**E6 · P3 dependency row · "`useStudioBillingSettings` `use-studio-billing.ts:47-63`"**
Problem: range drift.
Evidence: the hook spans 44-59; 61-63 is the next export's docblock.
Confidence: high · Severity: nit
Fix: `:44-59`.

**E7 · P2 and §3 · `use-proposals.ts:1675-1720`, `use-projects.ts:372-470`**
Problem: two ranges overshoot into the following function's leading comment.
Evidence: `useCreateProposalRevision` spans 1678-1716; the portal `useProjectFinancials` spans 372-468.
Confidence: high · Severity: nit
Fix: tighten both ranges.

**E8 · P9 dependency row · "the server leg that parses dollars to cents and stamps `draft`; `import-sheet.tsx:127`"**
Problem: the cited line is not the server leg and shows neither behaviour.
Evidence: `import-sheet.tsx:127` is `headers: { 'Content-Type': 'application/json' }`. The dollars→cents conversion and `price_retail: price.value` live in `apps/designer-portal/src/app/api/catalog/import/route.ts:9,102`, which is described in prose but never cited.
Confidence: high · Severity: minor
Fix: cite the route file; drop or requalify `:127`.

**E9 · F1 · "`priceTradeCents` … read zero times by the builder"**
Problem: correct as written but easy to read as a global claim, and the document elsewhere says "sits unread on the same object".
Evidence: `build-proposal-item-from-pick.ts` never reads it, but `piece-configuration-model.ts:577` does (`piece.priceTradeCents` feeds `tradePriceCents` on the Piece path).
Confidence: high · Severity: nit
Fix: "read zero times on the proposal-item path (the Piece configuration path does read it)".

**E10 · §1 and §3 · "a grep across all 521 migrations"**
Problem: 520 files sit in `supabase/migrations/`; the 521st is `_pending/00106_drop_client_messages.sql`, which has not been applied.
Evidence: `ls supabase/migrations/*.sql | wc -l` → 520; `find … -name '*.sql' | wc -l` → 521. The grep itself returns zero hits either way — the *claim* is sound, the count is the loose part.
Confidence: high · Severity: nit
Fix: "520 applied migrations (521 counting `_pending/`)".

**E11 · R10 · "'Prices lock when you release' … pinned by two tests and appears on three surfaces"**
Problem: the string quoted in the ruling's title is not the string the two tests pin, and the document does not notice that the copy ships in two different forms.
Evidence: `ffe-section.tsx:1494` = "Prices lock when you release."; `review-release-sheet.tsx:606` and `trade-scope-draft-sheet.tsx:560` = **"Prices lock on release."**; both tests (`review-release-sheet.test.tsx:424`, `trade-scope-draft-sheet.test.tsx:254`) assert the *second* variant. A ruling that says "keep it" is ambiguous about which "it".
Confidence: high · Severity: major
Fix: name both variants, say which one survives, and note the third surface is currently out of step.

**E12 · §3 "The explicit column lists" and P4 dependency row**
Problem: the roster of column lists a new pricing column must be threaded through omits two the feasibility memo names — and this omission is exactly the failure mode the section warns about.
Evidence: the document lists the clone, the two activation inserts (`00279:187-192,225-230`), the authorization builder (`00422:607-612`) and the placement RPCs. The memo also names the **authorization snapshot builders `00412:1958-1970` and `:1985-1995`**. Neither appears anywhere in the HTML.
Confidence: medium-high · Severity: major
Fix: add both 00412 snapshot builders to §3 and to P4's dependency row.

**E13 · §3 opening · "Every claim in this section was re-opened against the checkout on 5 September 2026"**
Problem: the process claim is stronger than the result. E1, E2 and E3 are all cases where a relayed number was reproduced rather than re-opened.
Evidence: `00390:1622` and `review-release-sheet.test.tsx:424` both appear verbatim in `research/00-raw/d-feasibility-memo.md`; the 16px root assumption behind 8.8/9.3px is not in the checkout at all.
Confidence: medium · Severity: minor
Fix: soften to "re-checked, with corrections listed in the appendix", or fix the three and keep the sentence.

**E14 · §12 · "One hundred and seventy-three citations sit behind this document"**
Problem: a precise count offered as a fact with no way for a reader to check it, and no matching count in `research/04`.
Confidence: medium · Severity: nit
Fix: drop the number or say where it is counted.

*Everything else checked out.* All 23 batch-A migration citations, 31 of 32 batch-B migration citations, 34 of 38 package citations and 55 of 58 portal citations landed exactly on the claimed code, including every load-bearing one: `use-proposals.ts:773` (`const sellPrice = unitPrice;`), `:794-795`, `:911-912`, `build-proposal-item-from-pick.ts:119`, `00142:61,89`, `00279:199-200,237-238`, `00185:57-60`/`:62-65`, `00390:218-227`, `00422:1431-1436`/`:1476-1479`/`:1491`/`:2157-2159`, `00435:935-955`/`:939`/`:980`, `00533:54-55`, `00535:28-29`, `00403:827-836`, `proposal-visibility.ts:179`, `proposal-mirror-contract.test.ts:29-38`, `markup.ts:42,46,63-67`, `spec-books/model.ts:326-331` (genuinely unexported). The `default_markup`-read-by-nothing claim and the zero-hit freshness grep both hold. The Rail A / Rail B separation claim holds — no commission or platform-fee column exists on `proposal_items`, `project_ffe_items` or `furnishing_authorization_items`.

---

## Fixture arithmetic

Every figure in every mockup was recomputed independently and agrees: trade total $16,880; uniform-35% units 8,640 / 2,500 / 2,970 / 865 / 3,915 / 700 and total $22,790; margin $5,910 = 35.0% on cost / 25.9% on price; the $740 sofa drop; unlocked trade $7,580; the proportional shares (361.21 / 214.78 / 62.48 / 101.53) and their $5-rounded landings (+360 / +215 / +65 / +100) with the lamp carrying the remainder to hold $22,790 exactly; post-blend markups 23.4 / 44.9 / 44.8 / 45.3 / 35.0 / 44.2; the sofa's 1,500/7,900 = 19.0% on price against the 25% floor; the authorization $20,360 / trade $15,200 / margin $5,160 / 25.3% on price / deposit $10,180 / balance $10,180; CT-01 2,200 → 2,310 (+5%), markup 44.8% → 37.9%, line margin $875, "6.9 points"; the M10 block summing to $22,790. Day counts against 5 Sep 2026 are all correct (24 / 66 / 108 / 8 / 3), the 61–90 aging band puts CH-01 in the right state, and Oct 5 is +30 days. `source/check-math.mjs` passes. **No arithmetic error found.** The findings below are presentation and premise, not sums.

**E15 · M4 (P4) · the Client column carries unit prices with no Qty column**
Problem: the same line reads two different numbers across mockups with nothing on the page to reconcile them.
Evidence: M4 shows CH-01 at Trade $1,850 / Client $2,680 and ST-01 at $520 / $750 — unit figures — while M3, M7 and M10 show the same lines as $3,700 / $5,360 and $1,040 / $1,500. M3 and M7 carry a Qty column; M4 does not. The spine's §6 does not authorise the switch.
Confidence: high · Severity: minor
Fix: add a Qty column to M4, or draw M4 at line totals.

**E16 · §6 The Blend · "RG-01 is locked at $3,915, its published retail"**
Problem: the fixture's own retail figure contradicts the trade multiplier the document cites two sections earlier.
Evidence: $3,915 is exactly $2,900 × 1.35, i.e. retail only 1.35× trade — a 26% trade discount. §4 states "the practical top is around 2.2–2.5× wholesale (Procurist)". At a normal trade discount the rug's retail ceiling would sit near $6,000 and the lock would bind on nothing. Leah's team will notice this before anything else in the fixture.
Confidence: medium-high · Severity: minor
Fix: give RG-01 a retail figure consistent with the cited multiplier (and pick a lock reason that still bites), or say why this maker prices flat.

**E17 · P0 · M1 "Proposed" footer `6 items · $22,790 to the client · $16,880 trade · 35.0% blended`**
Problem: the proposed footer for P0 shows numbers only P3 can produce.
Evidence: P0 is "Effort S, no migration" and fixes F1–F3 plus the margin definition; it does not apply a default markup. With markup still 0 on every line, P0's corrected footer would read `$16,880 to the client · $16,880 trade · 0% blended`. §6 is explicit that the uniform-35% room is "what P3's default produces on its own".
Confidence: medium-high · Severity: minor
Fix: draw M1-Proposed at 0% and add a second footer line labelled "after P3".

**E18 · M3 footer · "Total holds at $22,790 · 4 lines moved"**
Problem: five lines changed price; four received the spread.
Confidence: high · Severity: nit
Fix: "$740 spread over 4 lines".

**E19 · §6 priced-on states · SO-01 `verified Aug 12 · good through Oct 11`**
Problem: a 60-day quote validity in the fixture, against the document's own "thirty days is the modal quote window" and P10's "the trade's own norm is thirty days".
Confidence: medium · Severity: nit
Fix: make it Sep 11, or say the maker holds 60.

**E20 · M7 client panel · "Due to begin $10,180 · Half now, half on delivery"**
Problem: a 50% deposit convention and its client-facing wording are asserted with no code citation and no trade source, on the one panel the document says is the client's.
Confidence: medium · Severity: nit
Fix: cite the deposit rule, or mark it a fixture assumption.

---

## External claims

**E21 · §4 Blending · "MAP is a vendor-enforced ceiling" / R2 "it respects MAP automatically, because retail minus a discount cannot exceed retail"**
Problem: MAP is a *minimum* advertised price — a floor. The document calls it a ceiling, then builds R2's argument for discount-off-retail on the inversion.
Evidence: the document's own next clause is "going below it can cost a studio its trade account", which only makes sense for a floor. Research 02 §12 uses "ceiling" loosely to mean a ceiling *on discounting*. R2's reasoning — that retail-minus can't exceed retail, therefore MAP is respected — is a non-sequitur: discount-off-retail is precisely the mechanic that breaches MAP, because a large enough discount lands below the minimum. Practitioners will read this as the document not knowing what MAP is.
Confidence: high · Severity: major
Fix: "MAP is a vendor-enforced *floor* on advertised price"; strike the MAP sentence from R2's tension and replace it with the retail-ceiling argument the fixture actually uses.

**E22 · §4 Blending · "Freight, receiving and install split roughly evenly between a separately disclosed line and a figure folded into the goods markup"**
Problem: a distributional claim ("roughly evenly") with no source; the research says the opposite kind of thing.
Evidence: `research/01:35` — "Freight/receiving/install cost allocation is inconsistent across the industry… No source gave a single dominant convention… multiple sources describe it as a contract-by-contract decision, not an industry default." The spine (§4) says only "split between a disclosed line and folded-in"; "roughly evenly" was added in the HTML.
Confidence: high · Severity: major
Fix: "handled inconsistently, with no dominant convention".

**E23 · §4 Price validity · "3.5% to 9% across reported cases, plus a 5% fuel surcharge and reports of MDF and solid wood up 15–17% (Home Accents Today)"**
Problem: the body attributes all three figures to one named source; the appendix says two sentences later that they could not be re-verified at a single URL.
Evidence: `research/03:29` sources the 5% fuel surcharge, the 8% and 5% factory adjustments and the 15–17% MDF/solid-wood figure to Home Accents Today, but the "3.5%–9%" band appears only in that lane's own summary (`research/03:8`). The HTML's appendix row reads "Mixed · the named surcharge percentages could not be re-verified at a single URL and are reported as aggregated trade coverage."
Confidence: high · Severity: major
Fix: in the body, attribute the 5% / 15–17% figures to Home Accents Today and mark the 3.5–9% band as aggregated trade coverage.

**E24 · §4 Models · "A 35% markup is about a 26% margin" (inside the Interior Design Community paragraph)**
Problem: the figure is stapled to a source that did not produce it, and its real source is missing from the Sources list.
Evidence: the appendix says "the 35-to-26 phrasing itself is search-engine-sourced from LuAnn Nigara content, not page-verified" (`research/01:52`, with the episode page returning HTTP 403). **LuAnn Nigara appears nowhere in the document's Sources list** — 50 links, none of them hers. The arithmetic is trivially true (0.35/1.35 = 25.9%), so the honest move is to derive it rather than cite it.
Confidence: high · Severity: major
Fix: either derive it in-line ("35% on cost is 25.9% on price") or add the LuAnn Nigara source with the 403 note.

**E25 · §1 "none offers a first-class blend" · matrix line "Blend or spread across a project · no, in all eight"**
Problem: the document's single most load-bearing competitive claim prints a flat "no" for a column its own caveat says is only "not confirmed", and it does so in the summary a reader skims first.
Evidence: the matrix note directly above reads "'Not confirmed' means no evidence was found… and is not a claim the feature is absent", and six of the eight rows are "not confirmed" in every column. `research/02:149` is explicit for Programa: "a genuine gap in what's publicly documented… not a claim that the feature doesn't exist." P2 then rests on it ("the one thing no competitor in the set has"), as does §1's "This is Patina's to do first".
Confidence: high · Severity: major
Fix: render the blend row as "not confirmed in any of the eight" and soften §1 and P2 to match.

**E26 · P10 · "The trade's own norm is thirty days, and every vendor terms page found says so"**
Problem: absolute claim contradicted by one of the three terms pages the document itself quotes.
Evidence: §4 quotes Murdock Manufacturing as "acceptance within 30 days, but prices guaranteed only for materials that can be scheduled and shipped within 150 days" — a different structure, not the same norm.
Confidence: high · Severity: minor
Fix: "the two vendor terms pages fetched say thirty days; a third adds a 150-day materials window".

**E27 · §4 Price validity · "Furniture CPI moved from about 1% year over year in early 2025 to a 9.5% peak that August"**
Problem: the series is narrower than "Furniture CPI".
Evidence: `research/03:27` reads "living/kitchen/dining furniture inflation"; the Statista page is "furniture and bedding".
Confidence: medium · Severity: nit
Fix: name the series.

**E28 · §4 "Two products come closest" — Materio's project-level fee calculation is omitted**
Problem: the research's single closest blend-adjacent finding is left out of the paragraph that exists to name the closest ones.
Evidence: `research/02:174` — Materio's "Project fees, like markup and profit, are calculated for you and are easily adjustable… closer to project-level blending logic than anything found in the other products". The HTML mentions only Materio's visibility ladder and DesignFiles' vendor log.
Confidence: medium · Severity: minor
Fix: add it, with its "mechanism not confirmed" caveat.

**E29 · §4 Models · "Practitioners converge on hybrids"**
Problem: stated flatly; the lane flags it as aggregator/SEO content.
Evidence: `research/01:38` — "Repeated secondary-source claims that 'most' studios in 2026 use a hybrid… appear consistently across aggregator content… but these are marketing/SEO content rather than primary surveys." The HTML hedges only the *model-share breakdown*, not the convergence claim itself.
Confidence: medium · Severity: minor
Fix: "widely asserted across practitioner-adjacent writing, not survey-verified".

*Otherwise the sourcing holds.* The Capella Kincheloe worked example, the IDC $1,000/$1,600 passage, the "40% on the project as a whole" quote, the 30–40%/20–30% split, the ASID clause, the Design Ink Co "'Industry-standard markup' is not sufficient disclosure" line and the Virginia litigation, the LawInsider and Creature Comforts quote windows, the Section 232 timeline (25% effective 14 Oct 2025; the increase delayed to 1 Jan 2027), the three named Business of Home designers, Aisle Planner's Expiration Date, NetSuite Effective Date Pricing, Windmill's badge caution and the Procurist 2.2–2.5× figure all trace to the research files and to the Sources list, with the hedges the lanes asked for carried through. The `runSpecBookPreflight` string is quoted correctly ("pricing or lead time may be aged", with "past ninety days" left outside the quote marks — the 90 lives in the condition, not the message).

---

## Vision compliance

**E30 · Throughout · the feature test is never run**
Problem: `VISION.md` §8 requires a feature to name its surface, its studio moment, its money stream and its promise. The document names none of the four.
Evidence: "surface" appears only in generic senses ("client surface", "any other surface"); "stream" never; the studio moment (the studio adding its first hands while workload doubles) is gestured at through the "first hire" persona but never named as the moment; neither money stream (subscription floor, margin upside) is mentioned. §12's "Vision refusals honored" covers only the four *refusals*.
Confidence: high · Severity: major
Fix: add a four-line feature-test block to §5 or §12 — The Document · the first-hire moment · the subscription floor · "the studio won't notice Patina".

**E31 · R1 tension · "F150 from the prior panel is the same finding in different words"**
Problem: an opaque identifier, unexplained, imported from a *simulated* panel into a ruling's tension without the simulated label — inside the one section of the document that is supposed to be decisive.
Evidence: F150 comes from `artifacts/document-lens-proposal-2026-08-28/research/27-panel-p3.md` ("P3 — Junior designer, week one"), whose proposal labelled its panel simulated 10+ times. `research/31-verified-findings.md:155` records F150 at confidence 0.55, severity low, and its text is about a *different string on a different surface* ("STUDIO EYES ONLY" on the letterhead accounts line, not "Financial lens · studio only"). Nothing in this document tells Leah's team what F150 is.
Confidence: high · Severity: major
Fix: either drop F150 or write it out as "a simulated junior-designer walk of a different screen made the same observation (low confidence)".

**E32 · §3 Price freshness · "for exactly one bespoke path"**
Problem: `bespoke` is on the brand-voice avoid list alongside curated / luxury / elevated / disrupt.
Evidence: `.claude/skills/patina-brand-voice/SKILL.md` lexicon.
Confidence: high · Severity: nit
Fix: "for exactly one custom-commission path".

**E33 · P3 and R9 · the 25% margin floor**
Problem: the document proposes a margin floor that warns terracotta as new, while an identically-numbered, identically-styled one already ships on the other rail — and never says so.
Evidence: `packages/fulfillment/src/money.ts:53,76-77` — `belowFloor = marginPct < config.marginFloorPct` (config key `margin_floor_warning`, 25%), with the header comment "When belowFloor, the strip container + the commission block render terracotta (spec §5.2 'warns terracotta below the margin floor')". A document that catalogues four disagreeing margin computations and every partial precedent for a freshness stamp should not miss this one.
Confidence: medium-high · Severity: minor
Fix: name it as the precedent, and say explicitly that the Rail A floor is a different number on a different rail that happens to share a value.

*Clean on the rest.* No whole-word "AI" anywhere. No engagement metric is proposed for the studio surface, and §12's "Explicitly not measured" names time-in-lens, opens, clicks and Blend usage. The Pledge appears twice, both times as a thing this document is not on — no marketing copy, V6 gate intact. Nothing resolves V1; R11 parks it correctly. No client mockup gains a trade, markup or margin column: M7's client panel is Item · Room · Qty · Price and M10 is line totals only, and both additions are date lines. No fee, charge or percentage is added to what a studio or homeowner pays.

---

## Rulings

**E34 · P7 body and master table vs R8 tension — direct contradiction**
Problem: the same fact is called "exactly backwards" in one section and "defensible" in another, and the recommendation follows the second while the proposal is argued from the first.
Evidence: P7 — "today the trade price on a signed line is editable and the client price is not, which is exactly backwards from what a lock is for"; master table P7 — "Today the client's number is frozen after signature and the studio's own cost is not, which is backwards." R8 tension — "So today a studio can revise its own cost on a signed line and cannot revise the client's, **which is defensible**, and can also do it with no record, which is not." R8's recommendation then *keeps* trade editable after signature. P7's own state table ("Signed → Change order") does not distinguish client price from trade price, so a reader cannot tell which the row governs.
Confidence: high · Severity: major
Fix: pick one reading (R8's is the right one), rewrite P7's "why the studio cares" to say the gap is the missing record, and split the state table's "Signed" row into client price vs trade/markup.

**E35 · §9 Wave one · "Two rulings block copy rather than code: R1 … and R2 fixes which field is the primitive"**
Problem: which field is the primitive is P1's core code decision, not copy.
Evidence: P1's dependency row has `markup.ts:35-48` "gains the inverse computation" and reworks `useUpdateProposalItem` — that is the primitive choice, in code.
Confidence: medium-high · Severity: minor
Fix: say R1 blocks copy and R2 blocks P1's shape.

**E36 · R3 vs M3 · the mode switch**
Problem: R3 recommends holding the total and calls the mode switch "a hedge, and hedges cost more than they look" — and M3 ships the hedge anyway, with P2's "what changes" silent on it.
Evidence: M3's header row renders `Hold the total | Hold the blend %`. The document acknowledges the tension but does not resolve the mockup to the recommendation.
Confidence: high · Severity: nit
Fix: draw M3 with the recommendation and show the second mode as a greyed future affordance.

**E37 · R1 · "Leah rules the practice · Kody rules the default and the gate"**
Problem: the only split ruler in the set, with no tiebreak stated, on the ruling three other proposals are gated on (P3, P8, and P6's gated column group).
Confidence: medium · Severity: nit
Fix: name who decides if practice and default disagree.

*Structure holds otherwise.* All eleven rulings carry a title, a question, a tension, a bolded Recommendation and a named ruler; the recommendations are decisive (each names a value or a rule, not a range); no two duplicate each other. **Both queued rulings from `docs/design/the-document/DECISIONS.md` are absorbed**: "markup-setting-not-owner-gated" (I51's "⚠ markup-SETTING is not owner-gated — confirm the line", L2915's queue) is absorbed into R1's recommendation ("setting and reading move behind the same gate"), and "post-sale money edits" is absorbed into R8, which says so in its ruler line.

---

## Simulated vs verified

**E38 · §12 · "The panel is not evidence and is labelled as such wherever it appears above"**
Problem: false as written. The panel is labelled "simulated" at four of roughly a dozen lean points; elsewhere it appears as "the panel", "the persona", "the first hire", "the bookkeeper" with no marker.
Evidence: labelled — §2 ("the principal in the simulated panel"), P1 ("the principal in the simulated panel"), principle five ("the simulated principal's caution"), §11 ("the simulated panel produced"). Unlabelled — F4 in the **code-cited chapter** ("The panel's first hire named this exactly: she does not know whether a zero is a bug or an unfinished job"), P3 ("The first hire in the panel asked for this without knowing it had a name"), P4 ("This was the one need every persona raised"), P5 ("This is the bookkeeper's whole ask"), M5 caption, P8, R4 ("The principal's own example was $2,450 rather than $2,438.60"), R7 ("The homeowner persona wanted the feeling"), R10 ("the panel's own list of words to avoid"), master table P4 and P5.
Confidence: high · Severity: major
Fix: either say "simulated" at every lean, or replace the appendix sentence with an honest one and add a standing marker (e.g. a superscript) to each.

**E39 · P8 · "The first hire in the panel said she found the tab, does not know whether she is cleared, and has been leaving it alone because it feels like looking at someone's paycheck"**
Problem: reported speech, in a specific and quotable register, seven hundred lines before the disclaimer that says none of these people exist. Read aloud in a meeting this is indistinguishable from a real interview, and it is the emotional core of R1.
Confidence: high · Severity: major
Fix: "a simulated first-hire persona was written to say…" — and keep the sentence, it earns its place once labelled.

**E40 · P8 · "panel" used for two different things in adjacent sentences**
Problem: "The panel's type comes up to the floors it already publishes" (the Financial lens UI panel) sits two sentences from "The first hire in the panel said…" (the simulated designer panel). §4's "the panel already declines to state a margin it cannot fully compute" is the UI again.
Confidence: high · Severity: minor
Fix: call the UI "the lens" throughout and reserve "panel" for the simulated group.

No panel quote is attributed to Leah, to a real first hire, bookkeeper or homeowner, and §12's disclaimer ("None of these people exist. Nothing in that lane is a claim about Leah's studio…") is unambiguous where it stands.

---

## Feasibility honesty

**E41 · P10 · "Effort S · No migration", and R7's "good through only, on the proposal and the authorization"**
Problem: the authorization has no validity date to derive the line from, and none of the 521 migrations gives it one. As costed, P10 cannot ship on the surface M7 draws it on.
Evidence: every `valid_until` in `00412` is `proposals.valid_until` (`:811, :1448, :1531, :1556-1563, :1945-1953, :2063-2064, :2974`). `project_commercial_documents` has no `valid_until` column in its CREATE TABLE and no `ALTER TABLE … ADD COLUMN valid_until` exists anywhere in `supabase/migrations/`. Worse, `create_furnishings_authorization_from_schedule` (`00422:370`) builds an authorization straight off a project schedule — such a document has no parent proposal to inherit a date from at all, so "Prices good through Oct 5, 2026" on M7's client panel has no source. P10's own dependency row already flags the sibling gap ("no `useUpdateProposal` write for `valid_until` on a draft") but not this one.
Confidence: high · Severity: **blocker** (for P10 and R7 as costed)
Fix: either scope P10 to the proposal Investment block only, or move it to Wave two with a small migration adding a validity date to `project_commercial_documents` and a stated rule for schedule-born authorizations.

**E42 · Master table P0 · "Effort S · No migration"**
Problem: contradicted by its own dependency row, and wrong by repo convention.
Evidence: the same row reads "**No migration**, but the SQL leg is a function re-issue and needs its own number." A re-issue of `consume_capture` is a hand-numbered `NNNNN_slug.sql` file — that is a migration, and it carries the whole numbering/collision discipline with it.
Confidence: high · Severity: minor
Fix: "S · one function-re-issue migration".

**E43 · P0 · the effort estimate swallows the margin unification**
Problem: "one shared definition of margin" is the largest thing in P0 and is priced at nothing.
Evidence: P0's dependency row asks for one exported function to replace `markup.ts:78-89`, `use-account-page.ts:110-123`, `use-project-v2.ts:618-697` and `use-projects.ts:372-470` — four call sites across two packages and two apps, which currently disagree on unit (cents vs %), row population (no filter vs `COMMITTED_STATUSES`), client-value derivation (`line_total_cents` vs `unit_price_cents × quantity`) and removed lines. Landing one definition changes the numbers on the account page and the project financials, which is a visible behaviour change, not a refactor.
Confidence: medium-high · Severity: minor
Fix: split it into P0a (the three defects, S) and P0b (one margin definition, M) — or say plainly that P0 changes reported figures.

*Honest where it counts.* The Blend's draft-only constraint is stated twice — in P2's body ("on a proposal that has already been sent the sheet's only act is *Revise*") and in its dependency row, correctly routed through `clone_proposal(p_mode:'revision')` — and `guard_proposal_child_draft_only` at `00390:370-494` backs it. P2's "no migration required; an atomic RPC is optional" matches the memo. P4's explicit-column-list footgun is named and enumerated (subject to E12). P6's "small migration only if the price-age fields are not already on the authorization row from P4" is a fair conditional. The send-fingerprint risk ("a column missed in the fingerprint means a stale send ships") is correctly identified and correctly cited.

---

## Anything else

**E44 · §7 and §9 · three proposals answer neither ask, and the document does not say so**
Problem: the feedback asked for two things. P7 (post-sale money edits), P8 (lens type and header) and P9 (CSV intake) are not either of them, and §9's "What is deliberately not in a wave" lists only exclusions, never the additions.
Evidence: §2 states the ask as control, a held total, and trust in the cost. P8 is a typography and copy fix; P9 is an importer; P7 is a lock-boundary ruling. All three are defensible; none is asked for.
Confidence: medium-high · Severity: minor
Fix: one line in §7 marking which proposals answer the ask and which are adjacent repairs the team would sponsor anyway.

**E45 · §1 · "This is Patina's to do first, not to catch up on"**
Problem: the strongest sentence in the document rests entirely on the absence-of-evidence matrix flagged in E25.
Confidence: medium · Severity: minor
Fix: land it after the corrected matrix line, or say "first, on the evidence we could reach".

**E46 · §11 · "Ten, each answerable in one sentence"**
Problem: at least three are compound and cannot be answered in one sentence.
Evidence: "Would an ink change on an aging quote change how you price — would you round numbers or hold off entering a quote to avoid it?"; "When a maker's invoice comes in at a different number than the signed proposal, how do you find out why today, and how long does that take?"; "When you want to move a client price without touching the bulk markup bar, what do you actually do today — spreadsheet, sticky note, memory?"
Confidence: high · Severity: nit
Fix: split them or drop the claim.

**E47 · §11 · Q4 is filed under "The Blend"**
Problem: "If a new line started at a studio-set default instead of zero, would that save you time or fight the way you price?" is a P3 question, not a Blend question, and it unbalances the stated 3/3/2/2 grouping.
Confidence: high · Severity: nit
Fix: move it into "How you price today" and move one of that group's three across.

---

## Verdict

The arithmetic is exact — every figure in every mockup reproduces from the fixture, and the check script is real — and the code chapter is the strongest thing here: roughly 150 citations, and all but a handful land on the line they claim.
What is not safe to put in front of Leah's team as it stands: P10 is costed at "S · no migration" for a line the schema cannot produce on the authorization at all; MAP is described as a ceiling and R2's argument is built on that inversion; and P7 and R8 say opposite things about whether today's post-sale lock is backwards or defensible.
The evidence discipline slips in one direction only — toward confidence. "Not confirmed" becomes "no, in all eight"; an unverifiable surcharge band gets a single named source; a search-sourced figure is attributed to the wrong page and its real source is missing from the list; and "roughly evenly" is invented where the research says "no dominant convention".
The simulated panel is labelled at four leans out of about a dozen, and the appendix claims it is labelled at all of them — the P8 first-hire passage in particular reads as testimony from a real person.
Fix the blocker, the three major contradictions and the four sourcing overstatements and this is ready; the rest is line-editing.

**Counts:** 1 blocker · 14 major · 18 minor · 14 nit — 47 findings.
