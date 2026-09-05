# Adversarial review — `proposal.html` (pricing-mechanics-2026-09-05)

Reviewer did not write this document. Review only. Playwright ran successfully (chromium via `@playwright/test` 1.58.2, launched with sandbox disabled — the bash sandbox denies the mach-port rendezvous a headless launch needs; this is a harness restriction, not a browser problem). Script: `review/render-check.mjs`. Full JSON: `review/render-check-results.json`. Screenshots: `review/shots/` (6 full-page, one per viewport×scheme) and `review/shots/panels/` (14 `.panel` element shots at 1280×light).

## Part A — results table

| scheme | viewport | overflow (px) | mono/DM-Mono elements | mono &lt;12px | contrast fails | nav→id missing | section∉nav | box-shadow≠none | border-radius&gt;3px |
|---|---|---|---|---|---|---|---|---|---|
| light | 390×844 | 0 | 928 | 341 | 0 | 0 | 0 | 0 | 0 |
| light | 1280×900 | 0 | 928 | 341 | 0 | 0 | 0 | 0 | 0 |
| light | 1440×900 | 0 | 928 | 341 | 0 | 0 | 0 | 0 | 0 |
| dark | 390×844 | 0 | 928 | 341 | 0 | 0 | 0 | 0 | 0 |
| dark | 1280×900 | 0 | 928 | 341 | 0 | 0 | 0 | 0 | 0 |
| dark | 1440×900 | 0 | 928 | 341 | 0 | 0 | 0 | 0 | 0 |

Reads the same at all six combinations (numbers are viewport/scheme-invariant, as expected — none of the checked properties are set in `vw` units or media-gated). Panels: all 14 `.panel` elements captured cleanly at 1280×light, filenames from each panel's own `.panel-cap` text.

**Clean:** no horizontal overflow at any viewport (tables/mockups scroll inside their own `.tablewrap`/`.mockscroll` containers, confirmed visually on 390px — see `review/crops/390-light-fixture.png`); zero contrast failures against the WCAG AA thresholds sampled (manually spot-verified independently — see below); zero `box-shadow` and zero `border-radius` over 3px anywhere, including pseudo-elements; every nav anchor resolves and every `section[id]` is listed in the nav, in matching order.

**Not clean:** 341 of 928 DM-Mono-styled elements (37%) render below 12px — see D3.

Contrast sanity check (independent of the Playwright evaluate, since 0 fails on a first run is worth distrusting): computed the WCAG contrast ratio by hand for the document's own token pairs (`--faint`/`--muted`/`--body` on `--paper`/`--ground`, both themes) — all land between 4.71:1 and 13.53:1, comfortably above the 4.5:1 floor for the small type these tokens are mostly used at. The 0-fail result is credible, not a script bug.

## Findings

**D1 · Fresh and unverified price-age states are visually identical, and only one of the two carries a word.**
Location: `proposal.html` CSS lines 327–330 (`.age-fresh{color:var(--faint)}` / `.age-unverified{color:var(--faint)}`); rendered in panel `review/shots/panels/05-m4-proposed-ff-e-schedule-price-age-1180px-today-is-sep-5-20.png` (SO-01/RG-01/ST-01 vs LT-01).
Problem: `.age-fresh` and `.age-unverified` share the exact same ink token. Fresh lines (SO-01, RG-01, ST-01) show no word at all in the meta-line; unverified (LT-01) is the only one of the four states that says its own name. A reader scanning the schedule cannot tell "verified recently" from "never verified" without reading the full sentence on every row — which defeats the stated purpose of P4, the document's own flagship differentiator, and the preflight strip's "1 unverified" warning depends on a state that isn't visually distinct from the safest state in the set.
Evidence: CSS as cited; confirmed against the rendered panel screenshot.
Confidence: high. Severity: major.
Fix: give `.age-unverified` its own ink (or a mark), or give fresh a quiet word too (e.g. a plain "verified" with no color change) so no two states share both an empty word and an identical color.

**D2 · Unlocked lines in the Blend sheet carry no word at all — only "locked" is stated.**
Location: `proposal.html` lines 934–959 (M3 mockup); CSS `.openslot`/`.lock` (368–378).
Problem: locked rows show a lock glyph plus the words "locked · retail ceiling"; unlocked rows show only a small dash glyph (`.openslot`), with no word anywhere on the row. The default state is legible by absence-of-marker rather than by its own label, which is a narrower pass of the "ink and word" bar than the locked state gets.
Evidence: rendered panel `review/shots/panels/03-m3-proposed-blend-sheet-over-a-room-980px.png`.
Confidence: high. Severity: minor (defensible design choice — unmarked-as-default is a common convention — but still fails the letter of the check).
Fix: none needed if this is accepted as intentional; if not, add "unlocked" to the row or to a legend once, not per row.

**D3 · Roughly a third of the document's own mono/citation type renders below the 12px floor the document itself argues for.**
Location: throughout; largest clusters are inline `<code class="mono">` in running prose (131 instances at 11.07px, e.g. "priceTradeCents" in section 03) and `<span class="ref">` file:line citations (60 instances at 9.99px, 8 instances at 8.88px, 3 at 11.37px — e.g. "product-picker-modal.tsx:87,234").
Problem: Section 03 spends a full paragraph (line 628) indicting `financial-lens.tsx` for setting type at "0.55rem" / "0.58rem" (8.8px/9.3px) against a stated 12px metadata floor and 11px stamp convention. The review artifact's own most common inline elements — code identifiers and file:line citations, appearing hundreds of times — sit at 11.07px, 9.99px, and as low as 8.88px, i.e. in the same violation the document is written to call out. (Nav/kicker chrome at 10–11px — `.idxhead`, `.eyebrow`, `.who` bylines — is a separate, smaller-magnitude instance of the same pattern and is more defensible as an editorial-caption convention; the 131+68 code/citation instances are the ones that matter, since they carry load-bearing evidence a reader is meant to actually read.)
Evidence: `review/render-check-results.json` (monoTotal 928, monoBelow12Count 341, all six combinations); breakdown by tag/class/px obtained via a supplementary in-page evaluate (grouped counts: `code.mono@11.07px`×131, `span.ref@9.99px`×60, `span.ref@8.88px`×8, `span.ref@11.37px`×3, plus nav/caption chrome at 10–11px).
Confidence: high. Severity: major.
Fix: raise `.mono`'s relative sizing (currently `.82em` of whatever ancestor, which drops well under 12px inside `.tight` table cells at 13.5px) to a floor-respecting absolute size, or accept it explicitly as a deliberate "citation apparatus is quieter than the 12px floor" convention and say so once, rather than silently repeating the exact defect being reported on.

**D4 · Engineering jargon (RPC, migration) leaks well outside the master table's dependency rows and the appendix — including into the two-minute short version itself.**
Location: line 496 (section 01, "The short version" — "a grep across all 521 migrations"); lines 581, 605 (×2), 608, 626, 627 (section 03 prose); line 667 (section 04); line 827 (section 07 lede); 10 of the 11 proposal "who" bylines (all except P9) at lines 830, 868, 910 (×2), 970, 990, 1065, 1096, 1150–1156, 1167, 1200; lines 1396, 1401 (section 09); line 1484 (section 10, R8).
Problem: the review brief's own exemption is "outside the master table's dependency rows and the appendix" — implying the terms belong there and nowhere else. They appear roughly 24 times outside that zone, including once in the document's very first paragraph (section 01), which is explicitly the part meant to be readable by a busy principal in two minutes.
Evidence: full-text case-insensitive scan for `RPC|jsonb|trigger|migration` across `proposal.html`, cross-referenced against section boundaries.
Confidence: high. Severity: major for the section-01 instance, medium for the systematic byline pattern (the "who" bylines are arguably Kody-facing scoping metadata in a document explicitly addressed to both Kody and Leah's team, which softens but doesn't erase the issue).
Fix: strike "a grep across all 521 migrations" from section 01 (say "nowhere in the schema" instead); move effort/migration-size language in the P0–P10 bylines to the master table only, where it's already exempted and already present.

**D5 · 31 sentences exceed the ~35-word guideline, up to 57 words — including the document's opening sentence.**
Location: the very first sentence of section 01 (line 494, 39 words: "Leah's team asked for two things: to adjust the client price piece by piece — taking the edge off a hero piece and spreading that margin across the room — and to see a verified-pricing date beside every cost."); heaviest concentration in sections 03–04 (e.g. line 620, 57 words, on `studio_billing_settings`; line 654, 52 words, on rounding conventions).
Problem: this is precisely the section that Part B.1 asks whether a busy principal can parse in two minutes, and its lede sentence already runs 4 words over the guideline before the document has said anything else.
Evidence: mechanical sentence-split (naive `.`/`?` boundary + capital-letter heuristic) over all flowing `<p>` content (excluding `.who`/`.panel-cap`/`.summaryline`/`.trace`/`.ref`/`.goodthrough` micro-copy), 31 sentences over 35 words, longest 57.
Confidence: high (mechanical count; a few boundary cases from the heuristic are possible but the top of the list is unambiguous). Severity: medium.
Fix: split the section-01 opening sentence at the first em dash; the long compound sentences in sections 03–04 are a bigger and more defensible editorial choice (documentary register, consistently used throughout) — lower priority than the section-01 instance.

**D6 · Three of the ten questions in section 11 are double-barreled, contradicting the section's own claim that each is answerable in one sentence.**
Location: lines 1538–1541 (Q8), 1546–1547 (Q9), 1548–1549 (Q10).
Problem: Q8 ("Would an ink change on an aging quote change how you price — would you round numbers or hold off entering a quote to avoid it?") asks a yes/no question and then a second, separate either/or question. Q9 ("Does your first hire currently know whether she is allowed to see the margin table, and what happens if she stumbles onto it?") joins two distinct questions with "and." Q10 ("how do you find out why today, and how long does that take?") does the same. None of the three can be honestly answered in one sentence without picking which half to address.
Evidence: direct reading of the ten questions against the section's own lede ("Ten, each answerable in one sentence").
Confidence: high. Severity: medium.
Fix: split each into two numbered questions, or drop the second clause.

**D7 · Question 9 presupposes a fact about Leah's actual studio that the document itself elsewhere disclaims as fictional.**
Location: line 1546 ("Does your first hire currently know whether she is allowed to see the margin table..."); appendix line 1617 ("None of these people exist. Nothing in that lane is a claim about Leah's studio, her first hire...").
Problem: "your first hire" is stated as a given in the question, but the "first hire" is a synthetic persona built for the simulated panel (R5), and the appendix is explicit that this is not a claim about Leah's real studio. The question should establish whether such a hire exists before asking what she knows.
Evidence: cross-reference between section 11 and the appendix's own disclaimer.
Confidence: medium. Severity: minor.
Fix: "Does anyone besides you currently see the margin table, and would they know if they were allowed to?" — establishes the premise instead of assuming it.

**D8 · "F150" is cited in the R1 ruling with no definition anywhere in this document, pointing to an entirely different, external research corpus.**
Location: line 1427 ("F150 from the prior panel is the same finding in different words.").
Problem: this document defines defects F1–F5 only (section 03). "F150" is not one of them, and does not appear anywhere else in `proposal.html`. Tracing it: `research/00-raw/c-vision-docs.md:25` and `research/05-designer-panel-simulated.md:283,357` show F150 originates in an unrelated, unlinked prior program's panel research ("document-lens-proposal"). A reader of this document — including Leah's team, the stated audience — has no way to resolve what F150 is; it reads as a dangling internal reference.
Evidence: grep across the program folder for "F150."
Confidence: high. Severity: minor (doesn't change any conclusion, but it's exactly the kind of unexplained internal shorthand the review brief asks to catch).
Fix: either drop the "F150" label and just state the finding in words (which the sentence already does), or add one clause naming what F150 is.

**D9 · The appendix's "173 citations" claim doesn't reconcile with a mechanical count.**
Location: line 1564 ("One hundred and seventy-three citations sit behind this document").
Problem: counting `<span class="ref">` elements directly yields 155; splitting each ref's middle-dot-separated sub-citations yields 161; adding the 71 external `<a href="http...">` source links yields 226. None of these straightforward countings lands on 173, though the true count may depend on an authoring-time methodology (e.g. counting each comma-separated file:line group within one `<span class="ref">` as a separate citation) that isn't recoverable purely from the rendered HTML.
Evidence: `grep -c` / regex counts as described.
Confidence: low (the discrepancy is real but the correct counting rule is not verifiable from the artifact alone). Severity: nit.
Fix: recount and either correct the figure or drop the specific number in favor of "well over a hundred."

**D10 · "A 35% markup is about a 26% margin" is stated as flat, unhedged fact in body prose, while the appendix's own strength table discloses the figure is unverified.**
Location: section 04, line 642 ("A 35% markup is about a 26% margin. This is the single most important thing for a tool to keep straight..."); appendix line 1600 ("the 35-to-26 phrasing itself is search-engine-sourced from LuAnn Nigara content, not page-verified").
Problem (Part C, honest-number test): checked against `research/01-how-designers-price.md:52`, which states the same figure but explicitly flags it as "via search synthesis... the specific episode page returned a 403 on direct fetch, so this quote is search-engine-sourced rather than page-verified." The body text presents the number with no hedge and calls it "the single most important thing" in the section — a stronger confidence claim than the source, and the document's own appendix, actually supports.
Evidence: `research/01-how-designers-price.md:52` vs. `proposal.html:642` vs. `proposal.html:1600`.
Confidence: medium. Severity: medium.
Fix: add the hedge in the body where the number is first used, not only in the appendix three sections later — a reader of section 04 alone (which is most of them) never sees the caveat.

**D11 · The tariff-surcharge range "3.5% to 9%" doesn't fully trace to a single cited figure.**
Location: section 04, line 661 ("Surcharges arrived mid-cycle... 3.5% to 9% across reported cases").
Problem (Part C, honest-number test): `research/03-price-validity-and-freshness.md:28-29` names specific surcharges of 3.5% (HBF Furniture), 5% (Gabby, Summer Classics), 5% (fuel), and 8% (a China-based factory) — the detailed evidence tops out at 8%, not 9%. The "3.5%–9%" range appears verbatim in the research file's own summary bullet (line 8) but isn't traceable to any single named source at 9% specifically. This is a soft edge one level upstream of the proposal — the proposal faithfully repeats the research's own number — and the appendix already labels this claim's strength as "Mixed... could not be re-verified at a single URL," which is honest about the uncertainty even if not about this specific 1-point gap.
Evidence: `research/03-price-validity-and-freshness.md:8,28-29` vs. `proposal.html:661` vs. appendix line 1606.
Confidence: low. Severity: nit.
Fix: cite the range as "3.5% to 8%" (what's actually named) or keep 9% but note it as a rounded ceiling rather than an observed figure.

**D12 · On mobile, the contents nav is a full, unsticky block above the masthead, adding scroll distance before the short version.**
Location: CSS line 444 (`@media (min-width:1100px){ .shell{display:grid...} .index{position:sticky...} }`); confirmed visually at 390×844.
Problem: below 1100px the twelve-item nav is not converted to a sidebar and is not sticky — it renders as a full-width block at the very top of the page, so a phone reader must scroll past all twelve section links before reaching the title, thesis, or section 01.
Evidence: `review/crops/390-light-top.png`.
Confidence: high. Severity: minor.
Fix: collapse the mobile nav to a single-line "Contents ▾" disclosure, or move it below the masthead in source order below 1100px.

**D13 · P0's second mockup panel omits the pixel width every other panel states.**
Location: line 862 (`M1 · Proposed · the same footer line` — no width given, unlike all 13 other panel-caps which each state a px width).
Problem: minor inconsistency in the mockup-labeling convention the document otherwise holds to strictly (surface + width + today/proposed, verified present on all 14 panels except this one).
Evidence: direct read of all 14 `.panel-cap` strings.
Confidence: high. Severity: nit.
Fix: add "· 1180px" (matching M1 Today) or state explicitly that no new width applies since only the footer line changes.

**D14 · "Bespoke" (a banned word per the review brief) appears once.**
Location: line 614 ("...for exactly one bespoke path, unindexed and unqueryable").
Problem: used in a technical sense (a one-off code path), not as marketing language, so the spirit of the ban (no luxury-adjacent copy) is not really violated — but it is a literal hit on the banned-word list.
Evidence: whole-word case-insensitive scan of `proposal.html` for AI/curated/luxury/elevated/bespoke/disrupt — only this one hit across the entire document (all others: zero).
Confidence: high. Severity: nit.

**Confirmed clean, not findings (stated for completeness since the brief asks for full arithmetic/structural verification, not just problems):** every visible number in every mockup was recomputed from the six trade prices and reconciles exactly across all panels and prose restatements (uniform-35% table, Blend table, M2, M3, M4, M9 price-history, M7 authorization, M10 investment block all agree to the dollar; `source/check-math.mjs` independently passes). Contents nav, section order, section titles, and numbering (One…Twelve / 01…12) all match. All eleven P0–P10 appear exactly once each in the proposals section, the master table, and exactly once across the three waves, with no proposal missing or duplicated. Every R# cited in prose (R1–R9) resolves to a ruling that exists in section 10; R10 and R11 are defined but not cross-referenced elsewhere, which is fine (not a requirement). No stray exclamation marks in prose (all 14 "!" in the file are CSS `!important` or a code-quoted `!==` operator). "AI," "curated," "luxury," "elevated," and "disrupt" do not appear anywhere.

## Verdict

Playwright ran cleanly and the document's structural bones — overflow, nav integrity, numbering, color contrast, box-shadow/radius discipline, and every arithmetic figure across every mockup — are genuinely sound; this is a well-built artifact by the checks that would normally catch a rushed one. The two real product-legibility gaps are self-inflicted ironies: the priced-on states (fresh vs. unverified) that P4 exists to make legible are visually identical to each other, and roughly a third of the document's own citation apparatus sits below the 12px floor it spends a paragraph criticizing Patina's codebase for missing. The short version — the two-minute read this whole document is staked on working — opens with a 39-word sentence and a "521 migrations" grep reference, both of which cut against its own stated job. Three of the ten closing questions are compound rather than single-sentence, undercutting the section's explicit promise. None of this changes the document's underlying arguments or the eleven proposals, which hold up arithmetically and structurally; it is a polish and self-consistency pass, not a rethink.

**Counts by severity:** major — 3 (D1, D3, D4). medium — 3 (D5, D6, D10). minor — 4 (D2, D7, D8, D12). nit — 4 (D9, D11, D13, D14). Total findings: 14.
