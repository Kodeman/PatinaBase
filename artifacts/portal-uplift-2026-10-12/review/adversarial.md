<!-- SQ-812 adversarial review (GPT-6 Luna, readonly, other provider; GPT-6.1 Sol unavailable so the route fell back to Luna). Saved verbatim from the ticket comments by the orchestrator, 2026-10-12. -->

## Final adversarial review — US-27 synthesis, specimens, and founder deck

**Findings**
- **Medium · high confidence — Plate perimeter misses the 3:1 boundary contrast floor.** `artifacts/portal-uplift-2026-10-12/specimens/shared.css:155-160` assigns standalone plates a 1px `--hairline-strong` border. `review/d1-system.md:49-52` measures the light edge at 1.48:1; the dark token is also below 3:1. This conflicts with `synthesis/uplift.md:50` (hairlines separate sections, not component boundaries) and the stated edge contrast requirement. **Fix:** keep the plate visually unboxed, but use a perimeter edge that reaches 3:1 in both themes.
- **Medium · high confidence — Deck area navigation misses 44px target sizing.** The nine overview links in `deck/src/index.html:630-638` are inline anchors; the global anchor rule `:101` does not size targets, and table cells `:173-176` provide only 9px vertical padding. The 390px render shows text-sized links, contrary to `deck/DECK.md:26` (“every target is 44 px”). **Fix:** provide each link a minimum 44px clickable box while preserving wrapping and no overflow.

**Other contract checks:** The synthesis, nine-area before/after specimens (1440/390), and deck align with the brief and V18/V19 rulings; Q1–Q4 are treated as settled and Q5–Q15 remain founder dependencies. Founder questions include “if declined” consequences; draft/local-storage disclosure and clipboard fallback are present. The proposed area designs preserve the no-shadow constraint and use the stated component/tokens and implementation slices. The rendered 390 deck fits without horizontal overflow; SQ-811 capture reports 49 settled frames, all 41 images loaded, zero shadows, and no console/foreign-request errors. `specimens/check.mjs` passed for all 18 specimen files (0 missing). No other confirmed findings. The earlier caption-link target finding was withdrawn after confirming the specimen `.hit` rule provides 44px minimum height; it is not a finding.

No repository changes.

## Withdrawn during the review

- *Image-result caption links miss the 44 px hit target* (`shared.css:155-164`). Withdrawn by the reviewer: `specimens/library-390.html:292` defines `.hit { display:inline-flex; min-height:44px }`, and the caption links carry `class="hit"`.
