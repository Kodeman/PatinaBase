# US-27 · The portal uplift: Direction A on the Desk, card separation and depth across the portal

**Founders' deck:** https://claude.ai/artifact/F32gpb94VeHeDNGuuExxMY (private until Kody shares it)

Kody's ask (2026-10-12): the team unanimously agrees with US-26 Direction A ("Restored and tightened"). Implement it on the Desk, carry its card separation and depth to the rest of the designer portal, and propose the changes as an HTML presentation with mockups for every area. The founders weigh in before the work goes to the deployment team.

This is design and review only. No product code, migrations, flags or prod data changed. V19 (`docs/vision/VISION-DECISIONS.md`) records the founders adopting Direction A and rules US-26 Q1–Q4.

## The proposal in one paragraph

Depth comes from paper stock and edges, never from shadows (zero `box-shadow`, and the one ruled shadow is proposed for retirement, U-Q12). A **Card** (`--paper-doc` on a 1 px `--card-edge`, at least 3.13:1) is used only for a bounded, ranked set of things that need opening. Everything else is a **Section** that closes on `--rule-mid`, or a **Ledger row**. Hairlines only separate; they are never a component's boundary. Colour orients and never grades; state is an ink word. Everything wraps and nothing truncates, and every target is 44 px. The Desk becomes Direction A: one header line, today's job cards, a closing rule, then the ledger by person. The other eight areas take the same seven components. The Document stays paper, not cards, and Money stays ledger rows, never cards.

## Team

| Wave | Seat | Ticket | Route | Output |
|---|---|---|---|---|
| 1 | Inventory of every area, route and component | SQ-799 | codebase-exploration (GPT-6 Luna) | `review/e1-inventory.md` |
| 1 | Walk: every area today at 1440 and 390, with marks at rest | SQ-800 | visual-evaluation (Opus) | `walk/WALK.md` + 96 JPGs |
| 2 | D1 design system: card, section, depth (no shadows) | SQ-801 | interaction-design-implementation (Opus) | `review/d1-system.md` + sketches |
| 2 | D2 UX/IA: how each area takes card separation | SQ-802 | general (Opus) | `review/d2-areas.md` |
| 2 | D3 Desk build spec mapped to today's code | SQ-803 | general (Opus) | `review/d3-desk-build.md` |
| 2 | D4 heuristic and accessibility audit (other provider) | SQ-804 | review-audit (GPT-6 Luna) | `review/d4-audit.md` |
| 3 | Synthesis: system, nine areas, Desk, slices, questions; specimen SPEC and gate | SQ-805 | general (Opus) | `synthesis/uplift.md`, `specimens/SPEC.md`, `shared.css`, `check.mjs` |
| 4 | Specimens: Desk + shared chrome | SQ-806 | interaction-design-implementation (Opus) | `specimens/desk-*`, `chrome-*` |
| 4 | Specimens: the Document | SQ-807 | 〃 | `specimens/document-*` |
| 4 | Specimens: Rooms + People | SQ-808 | 〃 | `specimens/rooms-*`, `people-*` |
| 4 | Specimens: Library + Boards | SQ-809 | 〃 | `specimens/library-*`, `boards-*` |
| 4 | Specimens: Making papers + Money | SQ-810 | 〃 | `specimens/papers-*`, `money-*` |
| 5 | Founders' deck | SQ-811 | general (Opus) | `deck/` |
| 6a | Adversarial review (other provider) | SQ-812 | review-audit (GPT-6 Luna; 6.1 Sol unavailable) | `review/adversarial.md`, `review/triage.md` |
| 6b | Fix pass + render check | SQ-813 | general (Opus) | `deck/RENDER-CHECK.md`, `deck/_renders/` |

## Files

```
BRIEF.md                      the contract every seat worked to
walk/                         WALK.md + today's portal at 1440 and 390 (96 JPGs)
review/                       e1 inventory · d1 system · d2 areas · d3 Desk build · d4 audit · adversarial · triage
synthesis/uplift.md           THE spec: (a) thesis (b) system (c) nine areas (d) Desk (e) house-sheet amendments (f) slices (g) questions
specimens/                    18 self-contained mockups (9 areas × 1440/390), today vs proposed per frame; SPEC.md, shared.css, check.mjs
deck/                         DECK.md script · src/index.html · build.mjs → index.html (published) · RENDER-CHECK.md · _renders/ (120 JPGs)
tools/                        the US-26 check/build scripts this was adapted from
```

## Founder questions (rule these; the design assumes every recommended answer)

The deck has a ruling field for each question. Drafts stay in the viewer's own browser, so the founders send their rulings to Kody using "Copy my rulings".

- **A · Depth and edges (rule first: S1 waits on these).** U-Q1, card edges on every card and sheet frame; U-Q12, retire the ruled shadow; U-Q9, dark mode documented but not shipped; U-Q20, the card test and plate/caption for image collections.
- **B · Colour.** U-Q13, "colour orients, never grades" portal-wide; U-Q10, the 3 px rule means stage only; U-Q14, the stage once as a title rule on the job's paper; U-Q15, avatars as ink initials; U-Q8, no per-project colour (Direction C stays parked).
- **C · The Desk.** U-Q2, settled lines stay in place with Undo; U-Q3, both creates in the header; U-Q4, the studio scope sees a teammate's acted state (a migration and RLS change; S5); U-Q5, Set aside gets its own sheet; U-Q6, record a payment as a scoped sheet; U-Q7, an inquiry closes back onto the Desk; U-Q11, today's moves survive a reload.
- **D · Areas.** U-Q16, the invoice folio replaces Accounts inside one sheet; U-Q17, the board room's chrome joins the house and the canvas doesn't; U-Q18, a token pass on the spec book now; U-Q19, the Document's NEXT band wraps at 390.

## Slices for the deployment team (after rulings)

S0 Desk fix-now F1–F8 (no rulings needed) → S1 System (U-Q1, U-Q12) → S2 Desk model → S3 Desk cards and ledger → S4 Desk acting → S5 studio scope (migration, needs its own frontier review) → S6 Chrome → S7 Document → S8 Money → S9 Making papers → S10 Rooms/People/Library → S11 Boards list → S12 Board room. Files, tests and dependencies are in `synthesis/uplift.md` §(f).

## Gates

- `node specimens/check.mjs`: 18/18 pass. Each file is self-contained, every frame anchor is present, there's no horizontal scroll at 390 and no `box-shadow`.
- `node deck/build.mjs` reproduces `deck/index.html` byte for byte: 6.58 MB, with Google Fonts the only external host.
- Render check: 30 slides × 1440/390 × light/dark, no open defects (`deck/RENDER-CHECK.md`).
- Adversarial review: 2 findings, both accepted and fixed (`review/triage.md`).

## Owed

- The founders' rulings on U-Q1–U-Q20, with group A first.
- Kody shares the deck with the founders, since it's private.
- Proposed-frame marks-at-rest counts were not measured in the render pass. The deck hides those lines rather than show a placeholder.
