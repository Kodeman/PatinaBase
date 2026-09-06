# The Invoice, Standing Alone — 2026-09-06

Invoices as stand-alone pages: viewable with just a link and no account, with the
payment method chosen on the page and the real total to pay moving live as it
toggles. Asked for by Kody. Design and architecture only — no repo code changed.

## Files
- `proposal.html` — the deliverable deck (design · architecture · delivery waves).
- `mockup/invoice.html` — the full-fidelity interactive invoice page.
- `mockup/shots/` — 21 rendered PNGs: ten states × two viewports, plus the print rendering of the open sheet.
- `brief.md` — the approved plan: facts, rulings K1–K3, team, blueprint.
- `discovery/01-current-rail.md` — invoice data model, RLS, edge functions, surcharge math, hooks, emails as of main 52859acab.
- `discovery/02-old-page.md` — the pre-cutover `/invoices/[invoiceId]` page recovered from git (923c0e935^), its chooser and totals math.
- `discovery/03-guest-link-and-stripe-patterns.md` — the seven token surfaces, anon-grant idiom, Stripe session/webhook contracts, email link conventions, design tokens.
- `discovery/04-blueprint.md` — the first architecture blueprint (Plan agent), verified against code.
- `design/01-directions.md` — three directions + recommendation (design lead).
- `architecture/02-system-design.md` — the verified system design (architect).
- `review/03-adversarial.md` — the adversarial review: 49 findings (7 blocker, 17 major, 21 minor, 4 nit), no severity filter.
- `review/04-rulings.md` — Fable's synthesis: a ruling on all 49, the direction picked, the waves revised.
- `review/07-deck-review.md` — the deck review: every number and citation in the mockup and the deck checked back against the architecture and the code.

## Published

- Deck — https://claude.ai/code/artifact/93cca1c5-65c3-49cb-a70e-1494c860a029
- Mockup — https://claude.ai/code/artifact/e6dfee10-5fff-4b3e-8cb0-244d3e13fe7e

Both are private artifact links.

## How it was made

Eleven subagents across twelve dispatches — three read-only surveys and one
architecture blueprint before the team was assembled; a scribe; the design lead;
the architect, in two passes; the adversarial reviewer; the mockup builder; a
render pass; the deck builder; and the deck reviewer — with an orchestrator that
planned and reviewed between steps and never wrote a deliverable itself. Every
agent was read-only on repo code.

Prepared 6 September 2026.
