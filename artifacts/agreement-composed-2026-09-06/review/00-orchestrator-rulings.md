# Orchestrator rulings on review round 1 (Fable, 2026-09-06)

Filtered at synthesis from `01-evidence-vision-review.md` (70 findings) and `02-document-review.md`. Every finding is dispositioned in the builder's fix logs (`01b`, `02b`); this file records the rulings that change the *design*, not just the document.

## Design rulings

**D-1 · The turnkey shape (EV-40, blocker).** The existing `trade_scope` is the client's per-trade authorization (client-executed, client-consented, priced as `client_price_cents`) — not a studio↔sub contract. Rewrite §8 on the true shape:
- `design_build` is the **prime**: client ↔ studio, two signatures, `commercial_document_signatures` unchanged.
- The **subcontract** is a new object — name it *Trade Agreement* (`studio_trade_agreements`), parties studio ↔ sub, carrying lane 02 §7's eight essentials (scope, price, schedule, flow-down, retainage, pay-when-paid, insurance certificates, lien waivers). The sub is not a Patina user: they sign by token link (reuse the `trade_rfq_tokens` pattern, 00424), identity from `studio_contacts`. Its signature rows live on their own table, not on `commercial_document_signatures` (constraint 7 stays true for the prime).
- The existing trade scope survives only as an optional client-visible per-trade authorization; under a prime with a schedule of values it is not used.
- New proposal **P14 · The subcontract** (Wave 3, L; waits on new ruling R16). New ruling **R16 · Do subs sign inside Patina?** — recommendation: yes, by token link, no login; counsel on the flow-down wording; owner Kody + counsel. Counts become **fifteen proposals, sixteen rulings** — update index, §0, §10, §12, README.
- D2 redrawn: prime above; Trade Agreements beneath (studio ↔ sub); the old trade scope shown dotted as "optional, client-visible, existing".

**D-2 · The projection table (EV-41, EV-42).** Drop "countersign and authority are unchanged". Add a table in §4 "What each money variant writes" with columns: variant → terms column(s) → authority column(s) → CHECKs widened → RPC that reads it → proposal. Rows:
- `rate_card` → `proposal_service_rates` → `project_billing_authority_rates` → none → 00414 time authorization → today.
- `ceiling` → `billing_ceiling_cents` → same → **column becomes nullable; NULL = uncapped** only when no `rate_card` part is present → 00414:911-913 learns NULL; send/sign refusals 00423:1608-1614, 00477:306-309, 00412:815-820 relax to "required only when time is billed" → P1/P2.
- R4 amended: a class that bills time keeps a ceiling part (required); ceiling is removable only when no rate card is present.
- `retainer` (+ credit rule) → `retainer_amount_cents` + new `retainer_credit_rule` → same + new column → new CHECK → countersign's retainer invoice (00566:765-784) reads the rule; *replenishing* is record-only until R9 → P5.
- `cadence` → `billing_cadence` → same → CHECK widened to add `per_draw` on both rows (00412:77-78, :148) → P9 (Wave 3 only).
- `flat`, `per_phase` → new terms columns `fee_basis`, `fee_amount_cents`, `fee_schedule jsonb` → new authority columns of the same names → new CHECK on `fee_basis` → countersign snapshots them; invoicing reads them (P5) → P5.
- `percent_of_cost`, `percent_of_spend`, `cost_plus`, `day_rate`, `package`, `procurement`, `pricing_basis`, `draws`, `allowances` → record-only (payload jsonb on the part) until R9 rules; nothing projects.
- `deposit` (procurement variant, deposit %) → `furnishings_deposit_percent` → read by `create_furnishings_authorization_from_schedule` → today (00422).

**D-3 · Class and `document_kind` (EV-43, EV-11).** Class ⊂ kind. `design_services`, `consultation`, `furnishings_services` (renamed from `furnishings`) all keep `document_kind = 'design_services'`; class is a column on the parts snapshot (`template_class`) and dispatch stays on kind — no edge function changes in Waves 1–2. `design_build` is a **new `document_kind` value** in Wave 3: P9 lists what it touches — `proposals` CHECK (00423:94-101), `project_commercial_documents` CHECK (00412:115-117), the sign route's fail-closed dispatch (route.ts:273), proposal-send's five ternaries (handler.ts:240-259), notify policy `SERVICES_KINDS` (policy.ts:69), the consent drift test. Add an "edge functions touched" line to P6 (none) and P9 (proposal-send, commercial-document-notify).

**D-4 · The consent sentence (EV-44).** Not keyed by class. Composed from the money parts present, rendered once at send, hashed with the document, stored on the signature row (`metadata`, 00412:107). The drift test pins the composer, not the strings. Update §7 table, M5 consent line, and the "record keeps" table.

**D-5 · The standard template (EV-27, EV-28, EV-26).** "Design services (Patina standard)" = the seven facets as **nine parts**: Services · Deliverables · Exclusions · Role rates · Ceiling · Deposit (procurement variant, deposit %) · Retainer · Cadence · Terms. Never "verbatim". M5 renders the deposit as a typed line, not Terms prose. P1 seeds `proposal_agreement_parts` from a code-resident list (`packages/types`, the `studio-config.ts` vocabulary pattern) — the template object arrives in P4; Wave 1 stays one migration. P1 waits on R1, R4, R5, **R6**.

**D-6 · Vision honesty (EV-52, EV-53, EV-60, EV-65).** Stream = subscription floor only; "procurement parts are where V1's answer will land; construction cost-plus is the studio's margin, not Patina's." Under Wave 3: "a studio shape not yet on record; Leah's studio holds no subs; waits for a real one." Add question 11: "Does Middle West hold trades under its own name, or plan to?" (→ eleven questions). Never assert ESIGN/UETA compliance: "meets the elements lane 03 lists, except a client-held reproducible copy (R12); counsel to confirm." Appendix D loses `no-prose`; appendix cap → 60; §3's e-sign note joins the budget.

**D-7 · Research fidelity (EV-12, EV-13, EV-14, EV-15, EV-16, EV-17).** Apply as the reviewer wrote: ASID labels not published; subscription row → No; "two outright, a third in part"; Mydoma = feature toggles; MA 142A flagged unconfirmed in the table and P11; Ledger B states that the fee is pro-rated into each SOV line and that lane 02 keeps it as one separate line (both shown).

## Document rulings
- Every minor and nit in `01-evidence-vision-review.md` is applied unless it conflicts with D-1…D-7; each decline is logged with a reason in `01b-fix-log.md`.
- Render gate: add `figcaption` to the `.ref` wrap-reset selector (the single root cause of the six 390px failures).
- `02-document-review.md` findings: apply all majors and minors; nits applied unless they fight the house register; declines logged in `02b-fix-log.md`.
- Prose stays under every cap; the total may rise toward 900 — headroom is for honesty, not decoration.
