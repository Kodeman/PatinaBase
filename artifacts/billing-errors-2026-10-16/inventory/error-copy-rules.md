# Portal billing error copy — proposal

**Status: proposal for US-35; no design or product source changed.** Grounding: R83 (`docs/design/the-document/DECISIONS.md:2678`), house-sheet SPEC §A5/§A6 (`docs/design/house-sheet/SPEC.md`), `apps/designer-portal/src/lib/document/act-names.ts`, and the `patina-brand-voice` skill.

## 1. Put the reason where the act failed

Use the quiet terracotta inline failure at the act (ActFailLine / `actFailMessage`) for Document money writes and sends. Do not pair it with a toast. Keep the explanation next to its matching act; a global toast should not be the only map back to the broken field. Existing `react-query.ts` behavior makes inline/silent metadata and the mounted Document surface suppress mutation toasts; callers still need to render the rejected mutation themselves.

## 2. Name the thing and the next step

Write in sentence case, plainly and specifically: “This project needs a client before you can draft an invoice. Link a client in the household sheet.” Name the invoice, project, line, payment, email, or link; state the practical fix. Keep it to one or two short sentences. Avoid internal labels, database vocabulary, identifiers, codes, and implementation details. Use act names from `act-names.ts`; keep one consistent name for each act.

## 3. Separate a known blocker from a failed attempt

When current loaded data proves an act cannot run, use §A5: render the act as held (aria-disabled, not native disabled); activating it moves focus to the unmet input and puts the reason in the page’s role=status line. Do not silently disable it. A preflight is only as current as its data; server-side authority and concurrent state still need a failure path. Never imply that a send or money write is safe to retry when its outcome is uncertain.

## 4. Preserve the consequence sentence

Keep the §A6 consequence sentence above the primary act in every state, including unavailable states. It tells the designer what the act will do, not why it is currently held. Error text does not replace that sentence.

## 5. Retry only when retry helps

R83 permits a retry act only when retry can help. Do not show “Try again” for a possibly delivered email or an uncertain money write. For a confirmed transient failure, offer the same named act again; for changed invoice state, direct the designer to refresh/review it; for a missing client or price, direct to the editable destination. No toast for these Document failures.

## 6. Route to the person who can act

A designer may link a client from the household sheet. Only a studio owner/admin can name the studio or set its rate; tell other members to ask the owner instead of presenting an unavailable control. Describe client-side payment failures as a request to contact the studio. Route persistent platform failures to Patina support. Do not invent a fix destination: mark it as needing one if none exists.

## 7. Voice and visual restraint

Use confident, unpretentious, plain-spoken language. Technology stays silent. Do not use luxury-brand haze, blame, unexplained acronyms, raw Postgres text, or invented assurances. Follow D4’s no-shadows rule; do not suggest opacity-based disabled styling. An unavailable act remains understandable and perceivable.
