# Verification — research version 2

October 13, 2026. Scope: 35-slide standalone HTML, customer/market research, and reproducible financial scenarios. No product deployment or external customer outreach.

## Independent research and review

Three research agents separately investigated competitor pricing/incentives, seven real furniture trade channels, and customer/operating economics. Two independent-context reviewers audited the synthesized source claims and numerical model.

Corrections incorporated before delivery:

- Fee eligibility is separate from causal incrementality. Maker value deducts fees on all eligible orders, including sales that would have occurred anyway.
- Cancellation/completion leakage, failed activation, accepted-order coordination, billing costs, delivery lag and fee collection timing are explicit.
- Account churn does not erase pending accepted orders.
- Model starts from zero on both sides and caps orders by designer demand and maker capacity.
- Maker setup effort, upkeep and documented cash realization are separate from capacity value.
- Variable service staffing is separate from fixed core budgets.
- Existing V14 trade-margin policy, proposed merchant readiness and unvalidated combined adoption remain visible.
- Linked research synthesis, pilot cohort expansion and qualification denominators were reconciled.

The other-provider reviewer was unavailable: the earlier Claude CLI attempt in this session returned `Not logged in`. This revision used independent same-provider contexts; no cross-provider review is claimed.

## Numerical checks

Executed `node /private/tmp/patina-marketplace-v2-check.cjs`, using the checked-in `model.cjs` and installed Playwright 1.58.2 / Chromium.

Validated:

- Three scenarios × 36 monthly rows.
- Accepted orders never exceed aggregate modeled demand or supply.
- Eligible merchandise never exceeds completed merchandise.
- Revenue components reconcile; cumulative cash is finite.
- Base year-three revenue $512,810.17 and modeled peak cash deficit $732,016.56.
- Upside sustained monthly operating break-even month 16; cumulative modeled cash recovery month 28.
- Maker default surplus −$69.9167.
- Zero cost realization has no finite labor-only break-even.
- Zero causal incrementality still incurs attributed fees; negative order contribution is retained.

The independent commercial reviewer also reproduced annual outputs, staffing, account counts and cash timing. Scenario assumptions remain unvalidated.

## Browser and print checks

Final output:

```json
{
  "model": "passed",
  "slides": 35,
  "interactionChecks": "passed",
  "errors": [],
  "layoutIssues": []
}
```

All 35 slides checked at 1920×1080, 1440×900, 1280×720 and 390×844. No horizontal page overflow; no vertical overflow at the three desktop sizes. Mobile intentionally scrolls vertically.

Verified navigation, deep links, notes, overview, keyboard focus transfer, maker-value controls, zero-realization/zero-incrementality cases, three cash scenarios, discussion persistence, complete text export with scenario inputs, and full print notes. No browser page errors. Screenshots captured for 12 representative slides; seller value, real-maker evidence, annual scenarios and cash chart were visually inspected.

Chromium print produced 35 pages, confirmed by `pdfinfo`. The interactive values print as currently selected; decision text prints in full. The source packet is linked rather than embedded in the PDF.

## Reproduction and limits

Run `export-model.cjs`, then `build-deck.py` from the repository to regenerate results and deck. The HTML embeds the same model, fonts and controls. Local server serves the entire supporting packet.

Chromium only; Safari, Firefox and screen-reader use were not tested. No real customer purchases, time savings, retention, contribution, conversion or funding needs were observed. The conditional cash schedule excludes tax, bad debt, capex, deposit custody, inventory financing and an additional contingency. Primary source pages may change after the research date. Existing Patina production capabilities were not exercised or claimed complete.
