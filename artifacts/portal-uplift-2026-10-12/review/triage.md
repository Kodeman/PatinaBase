# US-27 adversarial triage

Orchestrator triage of `review/adversarial.md` (SQ-812), 2026-10-12. Every finding gets a ruling. SQ-813 applies everything marked ACCEPT.

| # | Finding | Severity / confidence | Ruling | Fix SQ-813 applies |
|---|---|---|---|---|
| R1 | The plate perimeter uses `--hairline-strong` (1.48:1 light, below 3:1 dark) as its only edge | medium / high | **ACCEPT** | In `specimens/shared.css`, change `.plate` to `border: 1px solid var(--card-edge)`. Rule 1 of `synthesis/uplift.md` ("Hairlines are separators only") binds every standalone unit. The plate stays a picture mat with no fill change, no padding and no radius change, so it does not become a card. In uplift.md, wherever the plate is described with a hairline edge, change it to `--card-edge`. Then rebuild the deck. |
| R2 | The nine area links in the deck's overview table are text-sized, not 44 px | medium / high | **ACCEPT** | In `deck/src/index.html`, give the overview links (and any other in-deck jump links that are text-sized) `display:inline-flex; align-items:center; min-height:44px`. Keep the wrapping, and introduce no horizontal scroll at 390. Then rebuild. |
| — | The caption links miss 44 px | — | **No finding** | The reviewer withdrew it: `.hit` already gives them 44 px. |

## Note on the review's depth

The review returned two findings from a 10-point brief, and it states that the other eight checks pass, citing `check.mjs` (18/18) and the deck capture from SQ-811. The route fell back from GPT-6.1 Sol to GPT-6 Luna because Sol is unavailable on the gateway. SQ-813's render pass is the visual check that remains: every slide and frame at 1440 and 390, read by eye, not just measured.
