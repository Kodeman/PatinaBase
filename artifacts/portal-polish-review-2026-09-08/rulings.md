# Rulings — Portal Polish Review (Kody, 8 September 2026)

Context: the panel's five principles (deck "Paper, Polished", sheets 10–13; synthesis.md) were put to the product owner as multiple-choice rulings after delivery. Rules were off for the review itself; these rulings bring governance back on.

| No. | Question | Ruling |
|---|---|---|
| PP-1 | Principle 1 — the studio is the author; Patina is the press | **Client pages only, not the Desk.** Letterhead law and colophon law on homeowner surfaces (house page, decision papers, standalone invoice); no Patina wordmark above the colophon on client pages. The designer portal's wordmark and footer stay as they are. |
| PP-2 | Principle 2 — money, dates and names carry the largest true type | **Adopt as proposed.** 15px floor in sentence case for money, dates, party names and consequence sentences in body content; running heads and captions stay 11–12px metadata; one family for money (DM Mono tabular); the owed figure outranks the agreed figure (Playfair 26); one date style "11 September 2026". |
| PP-3 | Principle 3 — every act shows its weight and its consequence | **Adopt as proposed.** Three tiers by consequence: tertiary (scored word, resting rule at ≥3:1), secondary (two-score word), terminal (filled charcoal #2C2926 with the amount in the label, only where money moves or a paper is signed; never olive). One consequence sentence above every terminal act in every state; `aria-disabled` with a named reason, never `disabled`; the hold announced to pointer users; the act replaced by its dated record. |
| PP-4 | Principle 4 — honest imagery at real scale | **Adopt, but allow concept renders when labeled.** Source hierarchy enforced by caption; never stock or gradients; piece plates 96–120px on desktop above a value threshold; empty rooms are a floor line and one sentence. Concept renders are permitted on the client page under PP-7. |
| PP-5 | Principle 5 — one scale, one rhythm; absence is silence | **Adopt as proposed.** The house sheet (specimens/SPEC.md §A as amended by §F) is the type and rhythm contract for both portals, applied surface by surface as each is touched: seven type steps plus the 15px money step, 24px module, three radii, three paper stocks and state pigments only, wrap never truncate, a sentence that names a thing links to it. |
| PP-6 | Reconciliation of the rulings the principles touch (I107, R126, R135, R137, R51, R107, VISION.md:73/:50, D1) | **Amend the rulings now, before any build.** Record V-entries in docs/vision/VISION-DECISIONS.md; amend I107, R126 and R135 in docs/design/the-document/DECISIONS.md and the designer-portal CLAUDE.md to match PP-1..PP-5; the eslint shadow gate stays (no depth was adopted). Build starts on amended rules. |
| PP-7 | Concept renders — provenance and rank | **Studio-uploaded, may lead the room band.** Only a render the studio uploads for that project; carries a ≥14px label on the image itself reading "Concept · not installed"; it may be the first image in a room band when no installed photograph exists. Generated imagery from any other source is not permitted. |
| PP-8 | First build slice | **The whole house page as one program.** Money block, letterhead and colophon, landmark ledger, story-pole links, gates (consequence sentence, visible hold, aria-disabled, filled terminal act), empty rooms, piece plates and captions, "Sign out" — run as a multi-lane program on the Threshold rather than sliced PRs; gates and the Desk follow. |
| PP-9 | Scope of PP-1 on the Desk | The Desk keeps its PATINA wordmark and footer identity; the Desk's other adopted changes (PP-2, PP-3, PP-5; the day's line, facets, resting rules, no dwell timer) are unaffected by this carve-out. |

## What these rulings do not decide

- The build program's lanes and gates (to be planned).
- The exact V-entry numbering: the next free V number after V8 in `docs/vision/VISION-DECISIONS.md` is **V9**.
- Whether the standalone invoice's Playfair total changes under PP-2 — it does; note it as a consequence to confirm during the build.
