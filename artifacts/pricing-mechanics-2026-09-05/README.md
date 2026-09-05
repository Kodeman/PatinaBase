# Pricing mechanics — 5 September 2026

Leah's team asked for two things: to adjust the client price piece by piece, taking the edge off a hero piece and spreading that margin across the room, and to see a verified-pricing date beside every cost. Patina can do neither today. This program went and found out why — five research lanes across the trade, the eight competing design-business tools, the price-validity literature, Patina's own checkout, and a simulated designer panel — and turned the answer into one document: eleven proposals in three waves, eleven open rulings, and five floor defects that make every margin figure in the product wrong until they are fixed. The document is the deliverable. It exists to earn reactions and a set of rulings, not to authorize a build.

## Nothing was built

No migration was written or applied. No component, route, hook, edge function, or feature flag was created or changed. Nothing was deployed. The only files this program produced are the research notes, the document, and its review artifacts, all inside this folder.

## Folder map

| Path | What it is |
|---|---|
| `research/00-raw/` | Four raw inputs: data model, portal UI, vision docs, feasibility memo |
| `research/01…05` | The five lanes: how designers price · blending and the eight tools · price validity and freshness · the codebase today · the simulated panel |
| `source/proposal.md` | The document's spine in Markdown |
| `source/check-math.mjs` | Recomputes every fixture figure; fails loudly on drift |
| `proposal.html` | The document itself — the thing to read |
| `review/` | Two adversarial reviews, their fix logs, the Playwright render check, results JSON and screenshots |

Full-page render screenshots are not committed (7–9 MB each); regenerate with review/render-check.mjs (run from apps/designer-portal so @playwright/test resolves).

## The eleven proposals

| # | Name | Wave | Effort |
|---|---|---|---|
| P0 | Fix the floor | 1 | S |
| P1 | The client price is a first-class field | 1 | S |
| P3 | Studio pricing defaults | 1 | S–M |
| P8 | The lens, for the whole studio | 1 | S |
| P2 | The Blend | 2 | M |
| P4 | Priced on | 2 | M |
| P6 | Purchase approval, priced honestly | 2 | M |
| P10 | Good through | 2 | S |
| P5 | Price history | 3 | S–M |
| P7 | Post-sale money edits | 3 | M |
| P9 | Library intake | 3 | S + M |

## The eleven rulings

- **R1 · who sees margin** — Leah rules the practice; Kody rules the default and the gate
- **R2 · the entry frame** — Kody · **R3 · what the Blend holds** — Leah
- **R4 · rounding** — Leah · **R5 · a client price below trade** — Kody
- **R6 · price-age thresholds** — Leah · **R7 · the client and dates** — Leah, counsel on the wording
- **R8 · post-sale edits** — Kody · **R9 · the floor** — Leah
- **R10 · the lock copy, in its two forms** — Kody · **R11 · what stays out** — Kody

Artifact: https://claude.ai/code/artifact/307353e9-8ba7-4b2a-bcf5-c898a9b1fd53 — "The Number That Holds", published 2026-09-05.

## How Leah's team can respond

Comments on the published Artifact reach us directly — leave them on the line they are about. Or take a thirty-minute walk through the Lindqvist fixture in the portal, which will get further than either of us reading. Nothing here is built, so nothing here is expensive to change.
