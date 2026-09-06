# The Agreement, Composed — spine

> **Amended after review round 1 (2026-09-06).** The orchestrator's rulings D-1…D-7
> (`review/00-orchestrator-rulings.md`) supersede this spine where they differ. The passages
> below carry the amendments: counts (fifteen proposals, sixteen rulings), §8's true shape
> (`trade_scope` is the client's per-trade authorization, not a studio↔sub contract; the
> subcontract is a new Trade Agreement object), §4's "What each money variant writes" table,
> the standard template as nine parts, and an eleventh question.

Fable-authored synthesis of research lanes 01–05. This is the document's skeleton: section order, the argument each section carries, every table, every mockup, every proposal and ruling. The HTML builder renders this; it does not re-derive it. Prose is a budget, not a medium — each section's running prose (`<p>` text) is capped by `data-prose-cap`; tables, labels, mockups, captions and bullets carry the argument.

Citations: codebase facts cite `research/04-codebase-today.md` (`path:line` reproduced in the appendix); industry facts cite lanes 01–03 by URL; panel findings are labeled SIMULATED. Fixture figures come only from `source/fixtures.json` and must match `check-fixture.mjs` output byte for byte.

Document `<title>`: **The Agreement, Composed**. Eyebrow: `Patina · The Document · proposal for the Patina and Middle West team · 6 September 2026`. Sub-line under the title: "A studio's agreement is built from parts it owns. This document proposes the parts, the library that keeps them, and the turnkey class that holds the trades."

Body prose total cap: 900 words. Section caps below (Appendix raised 40 → 60 by D-6). Every section is a top-level `<section id="…" data-prose-cap="N">`.

---

## §0 · In short — `id="short"` cap 80

Six lines, rendered as a numbered ledger (not paragraphs):

1. Today the agreement is one fixed form: seven facets in code, one wide row, thirteen literal readiness checks, three hand-built renders.
2. The brief asked for four things: add and remove parts, keep studio templates, work in more shapes, and hold trades under one roof.
3. The trade already has the answer's shape: ASID sells a core agreement plus swappable schedules with nine numbered fee options.
4. Proposed: **Agreement = Core + ordered Parts**; a studio **Library** of parts and templates; a **turnkey class** built from the same parts, with a new studio↔sub **Trade Agreement** beneath it.
5. Fifteen proposals in three waves. Wave 1 loosens today's room: one migration, and the client's copy does not change. Wave 3 is turnkey.
6. Sixteen rulings, each with a recommendation and an owner. Nothing is built.

Stamp (mono, boxed): `NOTHING WAS BUILT · document is the deliverable`.

---

## §1 · What was asked — `id="asked"` cap 60

Table "The brief, and what the record holds":

| Ask | Source | Status |
|---|---|---|
| Add and remove parts of the agreement | Kody's brief, 2026-09-06 | Not possible — facets are JSX literals (04 §4) |
| Build and save template agreements for the studio | Kody's brief | Not possible — templates retired by R85; the retired table was per-user, not per-studio (04 §8, §9) |
| Operate in a more flexible way | Kody's brief | Only hourly + ceiling + retainer + cadence exist; flat, per-phase, %-of-cost, cost-plus have no representation (04 §1, 01 §2) |
| Turnkey shops holding subcontractors | Kody's brief | No design-build class; the trade-scope instrument covers one trade at a time (04 §8) |
| "The Drafting room from direction is really the design agreement" | Tester note #43 | Renamed to Contract Room 2026-09-04; help copy still says Drafting Room |
| "Concept / Schematic · Core · Stage section is confusing" | Tester note #44 | Open |
| Facets pre-filled at $0; "Not yet set" shown on a document to sign; no dry-run before a real send | Prod walk 2026-08-13; approvals program | Open; §10 P0 |

Caption: real feedback on record is thin (two tester notes and one walked journey). The simulated panel in lane 05 sharpened the questions; it is not evidence.

---

## §2 · Today — the floor — `id="today"` cap 60

**M0 · mockup — "The Contract Room today"** (1180px designer register). A paper column titled `THE CONTRACT ROOM · Design Agreement`, counter `4 of 7 facets written`, seven numbered facet cards in fixed order: 01 Services & deliverables (textarea, prefilled "Concept presentation / Design documentation / Selection schedules") · 02 Exclusions ("Construction labor / Furnishings, freight, tax, and installation") · 03 Role rates (rows + `+ Add a role`) · 04 Rates & ceiling (ceiling `$0`, deposit chips `0 25 50 100 other`) · 05 Retainer (`$0`, select `immediate | retainer_paid`) · 06 Billing cadence (select `monthly | biweekly | milestone`) · 07 Terms (empty textarea). Right rail: `Review & send` (disabled), readiness list with 13 blockers, three shown red-ink: `Ceiling must be above $0`, `At least one role rate`, `Terms are empty`. Annotation callouts (mono, numbered) pointing at: the fixed order; the `$0` defaults; the ceiling blocker; the single Terms box.

Table "The rigidity ledger" (12 rows from 04 §10; rendered with a fourth `#` column so Appendix A's back-references resolve **[DR-42]**: # · Rigidity · Where · What a composed agreement changes). Use the ledger faithfully, shortened wording.

Table "Three renders of one agreement" — designer preview (`service-agreement-preview.tsx:91-244`, 7 sections) · client shell (`commercial-document-shell.tsx:179-262`, headings already diverge: "What you will receive" vs "Deliverables") · consent copy (`consent-copy.ts:26-60`, drift-tested). One line: a part list must drive all three or the drift guard becomes unmaintainable.

Small diagram "Where the money truth lives" (SVG, inline): `proposal_agreement …` boxes: `proposals (kind, state)` → `proposal_service_terms (one row)` → at countersign → `project_billing_authorities (ceiling · retainer · cadence · rates)`. Label: "only these four columns become authority (00566:788-797)". This diagram is reused in §4 with the parts layer added.

---

## §3 · How the trade contracts — `id="trade"` cap 60

Table "ASID's core + schedules, mapped to Patina today" (from 01 §1): 12 rows, columns ASID schedule · Patina part today · Coverage (Present / Partial / Absent). Caption: nine numbered compensation options in the residential package, eight in the commercial; option labels are paywalled — not confirmed beyond the count.

Table "Fee models in practice" (from 01 §2, 13 rows condensed): Model · Inputs · Yields a ceiling? · Expressible in Patina today (yes / partly / no). Mark yes only for hourly, hourly with NTE (via ceiling), retainer; partly for design fee + procurement margin (deposit % exists, margin does not); no for the rest.

Table "Engagement variants × parts" — reproduce 01 §4's matrix (7 variants × 18 parts, ●/◐/—) inside a `.mockscroll`. Caption: cell-level ◐ placements are the lane's inference, not sourced per cell.

Table "Patterns worth taking, and not" (03 §2): three steal, three avoid, one line each, source name.

Line: the trade's e-sign floor is typed name + consent to transact + identity/IP/time + a tamper-evident record tied to the version — Patina already meets it for the fixed form (04 §1 signatures, fingerprint); a composed form must keep meeting it per part.

---

## §4 · The model — Agreement = Core + Parts — `id="model"` cap 60

**Diagram D1 (SVG)** "One agreement, from parts": left column CORE (Parties · House / project · Class · Signature block · Evidence: fingerprint + record) · centre ORDERED PARTS (six kinds, stacked cards with a drag handle glyph) · right PROJECTIONS (`proposal_service_terms` ← money parts → `project_billing_authorities`; Client copy; Record of decision). Arrow labels: "materialize" (Library → Parts), "project" (money parts → terms row), "hash every part" (Parts → Evidence).

Table "Six kinds of part":

| Kind | Holds | Typed money? | Examples |
|---|---|---|---|
| `clause` | Prose with merge fields | No | Terms, change orders, IP, photography, termination, disputes, insurance, liability cap |
| `list` | Ordered items, each with note + optional flag | No | Deliverables, exclusions, client responsibilities |
| `phases` | Checklist of phases, on/off, optional per-phase fee | Only when a fee is set | Programming · schematic · design development · documentation · procurement · construction administration |
| `schedule` | One typed money shape, chosen by `variant` | **Yes** | See the fifteen variants below |
| `attachment` | A standalone leaf rendered as its own page | No | State cancellation notice, lien-waiver form, license certificate |
| `attestation` | A studio statement with fields, gating a template | No | Contractor licensing attestation |

Table "Schedule variants" (the typed money — 15): `rate_card` (today's role rates) · `ceiling` (not-to-exceed) · `retainer` (amount + credit rule: credited / non-refundable / replenishing + activation policy) · `cadence` (monthly · biweekly · milestone · per draw) · `flat` · `per_phase` · `percent_of_cost` · `percent_of_spend` · `cost_plus` (markup on net, with disclosure) · `day_rate` · `package` · `procurement` (deposit %, markup basis, freight/receiving/storage/install handling, terms of sale) · `pricing_basis` (fixed · cost-plus · cost-plus with GMP · T&M with NTE) · `schedule_of_values` · `draws` · `retainage` · `allowances`. (That is 17 listed — trim to the first 15 by merging `schedule_of_values` into `pricing_basis` and `retainage` into `draws`; the table must show exactly the kept 15 with a "creates billing authority?" column: yes for `rate_card`, `ceiling`, `retainer`, `cadence`, `flat`, `per_phase`; record-only for the rest until ruling R9.)

Table **"What each money variant writes"** (columns: variant → terms column(s) → authority column(s) → CHECKs widened → RPC that reads it → proposal), then table "The projection rule": three rows **[D-2 — "countersign and authority are unchanged" is dropped; `ceiling` becomes nullable, `flat`/`per_phase` need new columns, `cadence` needs `per_draw` on both CHECKs, `retainer` needs a credit-rule column]** — Prose never becomes money · Money parts project into `proposal_service_terms` at every save, and countersign still snapshots that row (00566:788-797), **but five of the fifteen variants need columns or CHECKs that do not exist yet** — the projection table names each · Parts freeze with the terms row at send (`guard_commercial_authored_child` dispatch, 00423:447-451) and every **client-visible** part is hashed (extends 00423:1214-1275 in the same migration).

Table "Readiness, derived": columns Condition · Today · Proposed. Rows: ceiling > 0 (hard check `:211`, column `NOT NULL` at `00412:73` → **required whenever a `rate_card` part is present**; removable only when no time is billed, and then the column is NULL, not zero, per amended R4 **[D-2]**); at least one role rate (`00477:306-309` → required only if the class bills time); terms non-empty (→ each `required` clause non-empty); deliverables/exclusions (→ each `required` list ≥ 1 item); parties + signature block (unchanged); "Not yet set" (never renders on a sendable document).

**M1 · mockup — "The Contract Room, composed"** (1180px). Same paper as M0 but the left rail is a PARTS list with drag handles, kind glyph, and `required` dots: Services · Deliverables · Exclusions · Role rates · Ceiling · Retainer · Cadence · Change orders · Termination · Terms. Hover state on "Exclusions" shows `⋯ Remove · Rename · Move`. Footer of the rail: `+ Add a part` and `Save as template…`. Centre: the selected part "Retainer" open, with credit rule chips `Credited · Non-refundable · Replenishing`. Right rail: readiness now `3 of 10 parts need attention` listing only the required ones. Annotations: "order is the document order", "a removed part is absent, not blank", "required is per part".

**M2 · mockup — "Add a part"** (720px sheet). Header `From your Library`, two columns: `Parts` (Cancellation · Photography rights · Ownership of drawings · Insurance · Dispute resolution · Client responsibilities · Procurement terms · Flat fee · Per-phase fee · Percent of spend) each with kind glyph and "studio" or "Patina" chip; `Blank` (Clause · List · Schedule ▾ · Attachment). Footer: `Add to this agreement`.

---

## §5 · The Library — `id="library"` cap 60

Table "Two objects, one shape" (modeled on `board_templates`, 00408):

| Object | Table | Scope | Namespaced key | Who reads | Who writes | RPCs |
|---|---|---|---|---|---|---|
| Part | `studio_agreement_parts` | studio | `studio.*` / `patina.*` | `is_active_studio_member` | `is_org_admin_or_owner` (R3) | `save_agreement_part`, `materialize_agreement_part` |
| Template | `agreement_templates` | seeded or studio (`kind`) | `patina.*` seeded, `studio.*` studio | same | same | `save_agreement_as_template`, `materialize_agreement_template` |

Column sketch (mono block, no prose): `agreement_templates(id, kind seeded|studio, studio_id, template_key, class, title, parts jsonb[ordered: {part_key | inline, required, client_visible}], consent_key, created_by, updated_at)`; `studio_agreement_parts(id, studio_id, kind, variant, part_key, title, payload jsonb, required_default, client_visible_default, created_by, updated_at)`; `proposal_agreement_parts(proposal_id, position, kind, variant, part_key, title, payload jsonb, required, client_visible, source_template_key, source_part_id)` — snapshot at materialize, owner refs stripped (00408 `save_board_as_template` pattern).

Table "Four seeded templates" — columns Template · Class · Parts in order · Money that becomes authority:

- **Design services (Patina standard)** · `design_services` · Services · Deliverables · Exclusions · Role rates · Ceiling · Furnishings deposit · Retainer · Billing cadence · Terms — *today's seven facets as **nine parts**, never "verbatim"; the furnishings deposit is lifted out of "Rates & ceiling" into a typed part* · rate_card, ceiling, retainer, cadence, deposit **[D-5]**
- **Consultation / hourly** · `consultation` · Services · Role rates · Ceiling (optional) · Terms · Termination · rate_card, ceiling
- **Furnishings only** · `furnishings_services` **[D-3]** · Services · Deliverables · Procurement terms · Deposit · Change orders · Terms of sale · Termination · procurement (deposit %), retainer optional
- **Design-build turnkey** · `design_build` · see §8 · pricing_basis, draws (+retainage), allowances — all three **record-only until R9**, so the column is headed "Money parts it carries", not "Money that becomes authority" **[RR-04]**; **selectable only after the licensing attestation is on file (the gate)**

Line: R85 retired *per-user* proposal templates because Discovery seeds the draft. A studio Library is a different object: studio-scoped, namespaced, seeded by Patina, and it feeds the same Discovery-seeded draft.

**M4 · mockup — "Account → Studio → Agreement Library"** (980px). Sits beside the existing Billing card in the deployed account register (do not restyle it). Two panels: `TEMPLATES` list (Design services — Patina standard `patina` · Full-service residential `studio` · Kitchen consult `studio`) with `Duplicate · Edit · Set as default`; `PARTS` list grouped by kind with counts (Clauses 9 · Lists 3 · Schedules 5 · Attachments 1). A third strip `DEFAULTS` (rate card · deposit 50% · cadence monthly · retainer rule Credited) — P3. Right: `Save current agreement as template` appears only when opened from a draft. Annotation: "Owners and admins edit here; every member composes from it (R3)".

---

## §6 · Composing an agreement — `id="compose"` cap 60

Flow strip (five stations, mono labels, arrows): `Discovery seeds the draft` → `Template materializes parts` → `Compose: add · remove · reorder · rename` → `Send: parts freeze, every part hashed` → `Countersign: money parts → authority; record keeps the part set`.

Table "What each act may touch": columns Act · Draft · Sent · Executed. Rows: add/remove/reorder part (yes · no · no); edit a clause (yes · no · addendum); edit a money part (yes · no · addendum re-projects); save as template (yes · yes (snapshot) · yes); supersede (— · yes · yes).

**M3 · mockup — "One part, three variants"** (3 cards, 360px each): the `schedule` part rendered as `Rate card` (three roles from the Okonkwo fixture: Principal $225/h · Designer $165/h · Design associate $110/h, planning hours 40 / 60 / 30, estimate $22,200 under a $24,000 ceiling) · `Flat fee per phase` (Concept $3,500 · Design development $4,500 · Documentation $3,000 — these three figures are illustrative and must NOT appear as fixture claims; label the card "illustrative") · `Cost-plus on purchases` (markup 30% on net; disclosure line "shown to the client as cost-plus"). Each card carries the chip `creates authority` or `record only (R9)`.

**M8 · mockup — "An addendum from parts"** (720px). Header `Addendum 01 · the Okonkwo house`, a single part "Ceiling" shown as `was $24,000 → now $28,000`, a `why` line ("Added the study to the scope"), signature line, `Send addendum`. Annotation: "an addendum is a part set with a why, signed on its own — never a silent edit (03 §4)".

---

## §7 · The client's copy — `id="client"` cap 60

Table "One part list, three surfaces": designer preview · client door · consent sentence — each row: today (hand-built) → proposed (rendered from `proposal_agreement_parts`, consent keyed by template class, drift test learns four classes).

**M5 · mockup — "The door, rendered from parts"** (620px, client register: Playfair title, Newsreader body, mono rules). Paper: `Middle West Studio · Design agreement · the Okonkwo house, Madison`; parts in the designer's order with small mono eyebrows (SERVICES · WHAT YOU WILL RECEIVE · NOT INCLUDED · HOW DESIGN TIME IS BILLED → rate table · RETAINER $5,000, credited · CEILING $24,000 · CANCELLATION · TERMS); a separate leaf below the paper titled `ATTACHMENT A · Notice of cancellation (Wisconsin)` with its own rule and an `I received this` line; then the signature line (typed name + press-and-hold, per the approvals program R1); consent sentence under it. Annotations: "attachments are leaves, not paragraphs"; "the record keeps the exact part set and its hash".

Table "The record keeps": part set (keys + titles + order) · per-part hash + document hash · signer name, IP, time · consent sentence version · attachments acknowledged. Line: this is the ESIGN/UETA floor (03 §3) applied per part.

---

## §8 · Turnkey — the design-build class — `id="turnkey"` cap 70

**Diagram D2** "One prime above, Trade Agreements beneath" **[D-1 — rewritten]**: CLIENT ↔ STUDIO (prime: `design_build` agreement, two signatures, `commercial_document_signatures` unchanged); beneath the studio: three **Trade Agreements** (`studio_trade_agreements`, new — P14), parties studio ↔ sub, each carrying lane 02 §7's eight essentials and signed by token link on its own signature table; and, dotted and separate, the existing `trade_scope` shown as what it actually is — the *client's* optional per-trade authorization (client-executed `route.ts:178-187`, client consent `consent-copy.ts:31`, `client_price_cents` 00423:185), not used under a prime with a schedule of values. Label: "the signature table admits exactly two parties (00412:101, :108) — the prime keeps that constraint; a sub signs on the Trade Agreement's own table".

Table "Contract structures" (02 §1, condensed to 4 rows): Single prime · Split (design + construction, same firm) · Design + owner-held GC · CM at-risk — columns: who the client pays · who holds subs · construction risk · licensing exposure · Patina class.

Table "The turnkey template, part by part":

| Part | Kind / variant | Required | Client sees | Note |
|---|---|---|---|---|
| Pricing basis | schedule / `pricing_basis` | yes | yes | fixed · cost-plus · cost-plus with GMP · T&M with NTE; carries the schedule of values |
| Draws | schedule / `draws` | yes | yes | milestone or percent-complete; retainage % and release rule live here; each draw issues an invoice (reuses `issue_trade_draw_invoice` shape) |
| Allowances | schedule / `allowances` | optional | yes | overage / underage rule |
| Sub disclosure | clause (open-book / closed-book, one per contract) | yes | yes | identities always; awarded prices per the open/closed-book clause; the bid ledger never (R13) **[D-1]** |
| Supervision fee vs markup | clause + `pricing_basis` field | yes | yes | no-double-count rule enforced by the template, not by drafting |
| Change orders | clause | yes | yes | first-class addendum that patches the schedule of values |
| Lien waivers | attachment per draw | optional | yes | conditional / unconditional × progress / final (P12) |
| Licensing attestation | attestation | **gate** — the design-build template is not selectable without it | no | credential type · number · state · expiry; self-attested (R10). Same wording in §5, M7, P10 and the Wave 3 flag **[RR-06]** |
| Notice of cancellation | attachment | jurisdiction-triggered | yes | WI ATCP 110 · MN 325G · IL · CA BPC §7159 · NY · MA 142A — seeded, disabled until counsel reviews (R11) |
| Mandated contents | template checklist | jurisdiction-triggered | — | CA §7159 items, WI ATCP 110 written-contract items |

**M6 · mockup — "The Halvorsen kitchen and mudroom, composed"** (1180px). Parts rail (**ten**): Pricing basis (carries the schedule of values — no separate part, per §4's merge) · Draws · Allowances · Sub disclosure · **Supervision fee** · Change orders · Termination · Terms · Attachment A (notice) · Attachment B (lien waiver form). **[DR-03, RR-14]** Centre: the Draws part open as a table — reproduce the fixture exactly:

| Draw | % | Gross | Retainage held | Net paid |
|---|---|---|---|---|
| Deposit at signing | 10% | $8,413.40 | $0 | $8,413.40 |
| Rough-in | 30% | $25,240.20 | $1,262.01 | $23,978.19 |
| Cabinets set | 40% | $33,653.60 | $1,682.68 | $31,970.92 |
| Substantial completion | 20% | $16,826.80 | $841.34 | $15,985.46 |
| Final · retainage release | — | — | ($3,786.03) | $3,786.03 |

Header chips: `Cost basis $71,300` · `Fee 18% · $12,834` · `GMP $84,134` · `Retainage 5%` · `Design fee (flat, separate) $11,000`. Right rail: `Licensing attestation · on file · WI Dwelling Contractor · expires 2027-03`; three sub cards (Cabinetry & millwork $38,000 · Electrical $9,500 · Plumbing $7,200) marked `studio only`.

**M7 · mockup — "The licensing attestation — the gate on the design-build template"** (620px sheet). `Before this studio can use the design-build template` — fields: Credential type (WI Dwelling Contractor · MN Residential Building Contractor · CA CSLB · other) · Number · State · Expiry · checkbox "I attest this credential is current and covers the work in this agreement" · disclaimer line (the standing disclaimer recommended in 03 §5 — 34 words; do not state a count) · `Save attestation`. Annotation: "Patina stores, never verifies (R10)".

Table "Licensing in **six** states" (02 §5, one line each: WI · IL · MN · CA · NY · **MA**, with the threshold and "not confirmed" where the lane said so — MA is `not confirmed`, mass.gov 403 on re-fetch. Rule cells state the rule; thresholds sit in the third column). **[DR-27, EV-68]**

---

## §9 · The fixtures — `id="fixture"` cap 60

Two ledgers, every figure from `fixtures.json` (the check script asserts each formatted figure appears in the HTML — the builder must include all 65, including "40 hours", "Middle West Studio", "design services", "turnkey design-build", "monthly").

Ledger A "the Okonkwo house, Madison" — Studio Middle West Studio · Engagement design services · rate card (Principal $225/h × 40 hours = $9,000 · Designer $165/h × 60 hours = $9,900 · Design associate $110/h × 30 hours = $3,300) · Fee estimate total $22,200 · Retainer $5,000 · Design authorization ceiling $24,000 · Headroom under ceiling $1,800 · Furnishings deposit 50% · Billing cadence monthly · Month one billed $6,150 → First invoice due (after retainer credit) $1,150 · Furnishings wave $31,400 → Furnishings deposit due $15,700.

Ledger B "the Halvorsen kitchen and mudroom, Middleton" — Engagement turnkey design-build · subs (Cabinetry & millwork $38,000 · Electrical $9,500 · Plumbing $7,200) · General conditions / site $6,300 · allowances (Tile allowance $4,000 · Plumbing fixtures allowance $3,500 · Lighting allowance $2,800) · Design fee (flat, separate) $11,000 · Cost-plus fee 18% · Retainage 5% · Cost basis $71,300 · Fee $12,834 · GMP $84,134 · schedule of values (Cabinetry & millwork $44,840 · Electrical $11,210 · Plumbing $8,496 · General conditions / site $7,434 · Tile allowance $4,720 · Plumbing fixtures allowance $4,130 · Lighting allowance $3,304 · Schedule of values total $84,134) · draws as in M6, with cumulative retainage $1,262.01 → $2,944.69 → $3,786.03 · Total retainage withheld $3,786.03 · Final retainage release $3,786.03 · Total paid (all draws + final release) $84,134.

Caption: figures recomputed by `source/check-fixture.mjs`; the design fee sits outside the cost-plus basis by construction. State the pro-ration as a design choice: this document spreads the 18% fee across every schedule-of-values line, where lane 02 §8 keeps them at cost with the fee separate; show both, and rule it with R13 **[D-7]**. Label every drawn-not-derived figure illustrative: M3's three per-phase fees, M3's 30% markup, M8's $28,000 ceiling.

---

## §10 · Proposals — `id="proposals"` cap 60

Fifteen cards (P0–P14), each: number · name · wave · effort (S/M/L) · what changes (≤ 3 bullets) · what it reuses (paths) · ruling it waits on.

- **P0 · Fix the floor** · W1 · S–M — collapse the duplicated DTOs to `packages/types/src/commercial.ts`; the ceiling blocker becomes conditional; "Not yet set" never renders on a sendable document; help copy "Drafting Room" → "Contract Room" (four Sanity loader inputs); one renderer for the three surfaces. Reuses: `commercial-documents.ts:180-250`, `consent-copy.ts`. No ruling.
- **P1 · Parts on today's agreement** · W1 · M — `proposal_agreement_parts` + guard dispatch + fingerprint fold in one migration; the room renders from the part list; add / remove / reorder / rename while draft; the seven facets become seeded parts of "Design services (Patina standard)"; `proposal_service_terms` becomes the projection of the money parts. Reuses: `guard_commercial_authored_child` (00423:447-461), `_commercial_document_fingerprint` (00423:1214-1275), `upsert_design_services_draft` (00422). Waits on R1, R4, R5.
- **P2 · Readiness from composition** · W1 · S — required per part; class-level floor. Reuses `assessServiceAgreementReadiness`. Waits on R4.
- **P3 · Studio agreement defaults** · W1 · S–M — a Defaults strip in Account → Studio (rate card, deposit %, cadence, retainer rule, default exclusions); Discovery seeding reads it. Reuses `studio_billing_settings` (00428) RLS shape, `account-studio-page.tsx` Billing card. Waits on R3.
- **P4 · The Library** · W2 · M — `studio_agreement_parts`, `agreement_templates`, save-as-template, materialize, picker (M2), Library page (M4), four seeded templates. Reuses `board_templates` (00408) shape and RPC pair. Waits on R1, R2, R3, R7.
- **P5 · Fee schedules** · W2 · M–L — the fifteen variants; flat and per-phase project into authority; percent and cost-plus record only. Reuses `proposal_service_rates` shape for rate cards. Waits on R9.
- **P6 · The client's copy from parts** · W2 · M — door render from parts; the consent sentence **composed from the money parts present**, rendered once at send, hashed with the document and stored on the signature row (metadata, 00412:107) — never keyed by class **[D-4]**; attachments as leaves; record keeps the part set + hashes; a frozen HTML snapshot at execution. Reuses `door-gate.tsx`, `consent-copy.ts` + drift test, `get_client_commercial_document_bundle`. Waits on R8, R12.
- **P7 · Addenda from parts** · W2 · M — `create_service_addendum` composes a part set with a why; money parts re-project. Reuses 00422 addendum, the approvals program's `why` column (00569). Waits on R6.
- **P8 · Change history on parts** · W2 · S — who / when / why on each part edit; visible in the room. Reuses `why` pattern. No ruling.
- **P9 · The turnkey class** · W3 · L — `design_build` template; `pricing_basis`, `draws` (+retainage), `allowances`; sub disclosure; supervision-vs-markup rule; schedule of values; each draw issues an invoice. Reuses `trade_scope_draws` (00423), `issue_trade_draw_invoice`, `studio_contacts` (00417), `project_parties` (00212/00419). Waits on R13.
- **P10 · Licensing attestation** · W3 · S — `attestation` part + studio setting; the design-build template is selectable only once the attestation is on file — the gate, worded identically in §5, §8, M7, P10 and the Wave 3 flag **[RR-06]**. Waits on R10.
- **P11 · Jurisdiction attachments** · W3 · M — seeded notices (WI, MN, IL, CA, NY, MA) and mandated-contents checklists, disabled until counsel reviews each. Waits on R11.
- **P12 · Lien waivers per draw** · W3 · M — attachment per draw, tracked. No ruling.
- **P13 · Sign and pay in one step** · W3 · M — retainer or deposit offered on the door after signature, never gating it. Reuses the studio-invoice rail (00571) and Stripe Checkout. Waits on R15.
- **P14 · The subcontract** · W3 · L — `studio_trade_agreements`, a new studio↔sub object carrying lane 02 §7's eight essentials (scope, price, schedule, flow-down, retainage, pay-when-paid, insurance certificates, lien waivers). The sub signs by token link, no login (`trade_rfq_tokens` pattern, 00424; identity from `studio_contacts`, 00417) on the Trade Agreement's own signature table — `commercial_document_signatures` keeps its two-party constraint. Waits on R16, and on R13 for what the client sees. **[D-1]**

Effort key line: S = days · M = a sprint · L = more than one.

---

## §11 · Waves — `id="waves"` cap 50

Three columns:
- **Wave 1 · Loosen the room** — P0 P1 P2 P3. Ships as the same seven-facet agreement for anyone who changes nothing; the client sees no difference. Migrations: one (parts + guard + fingerprint). Flag: `agreement-parts`, fail-closed.
- **Wave 2 · The Library** — P4 P5 P6 P7 P8. The four seeded templates; the picker; the door from parts. Flag: `agreement-library`.
- **Wave 3 · Turnkey** — P9 P10 P11 P12 P13 P14. A studio shape not yet on record: Leah's studio holds no subs, so this wave waits for a real one. Counsel review sits inside it, not before it. **[D-1, D-6]**

Line under: no wave reopens the prime's signature table; no wave writes to business tables outside definer RPCs. (The word itself stays out of the document — the prohibition lives in §13 only. **[EV-56]**)

---

## §12 · Rulings — `id="rulings"` cap 60

Table: # · Ruling · Recommendation · Owner · Blocks.

- R1 · Does R85 bind agreement templates? · No — a studio Library is a different object from the retired per-user table · Kody · P1 P4
- R2 · Template scope · Studio, never person; "mine" is a filter, not a scope · Kody · P4
- R3 · Who edits the Library · Owners and admins edit; every active member composes from it · Leah (practice) · P3 P4
- R4 · The floor — what can never be removed · Parties and the signature block. A class that bills time keeps a ceiling part, required; the ceiling is removable only when no rate card is present, and then the column is NULL, not zero. Everything else removable, Exclusions included · Kody · P1 P2 **[D-2]**
- R5 · Prose never carries money · Yes; only `schedule` variants project into terms and authority · Kody · P1
- R6 · When parts freeze · At send (today's rule); unsend is supersede · Kody · P1 P7
- R7 · Names · Agreement · Part · Library · Template · Addendum — never "clause library" or "contract builder" in the studio's face · Leah (ear) · P4
- R8 · Client copy order and visibility · Designer's order; per-part `client_visible` for studio-only notes; `client_visibility_tier` unchanged · Kody · P6
- R9 · Which fee variants create billing authority in Wave 2 · rate_card, ceiling, retainer, cadence, flat, per_phase; percent and cost-plus are record-only until invoicing reads them · Kody · P5
- R10 · Licensing attestation · Self-attested with credential fields; Patina stores, never verifies; wording by counsel · Counsel · P10
- R11 · Jurisdiction notices · Seeded and disabled until counsel reviews each state · Counsel · P11
- R12 · What the client can keep · A frozen HTML snapshot at execution in Wave 2; a PDF when a client asks, not before · Kody · P6
- R13 · What the client sees of subs · Identities yes; bid ledger never · Leah · P9
- R14 · Permissions inside the room · Not now; a studio of three does not need tiers (SIMULATED panel disagreement 4) · Kody · —
- R15 · Sign and pay in one step · Offer after signature; never gate the signature on payment · Kody · P13
- R16 · Do subs sign inside Patina? · Yes, by token link, no login — on the Trade Agreement's own signature table, never the prime's; counsel writes the flow-down wording · Kody + counsel · P14 **[D-1]**

---

## §13 · What stays out — `id="out"` cap 50

Bullets: drawn signatures (closed, approvals R2) · a co-signer login (deferred twelve months, approvals P-29) · amend-in-place after send (recommended out; R6 owns it) · **Pledge / covenant / royalty language of any kind (V6)** — this is the one place the prohibition is named, and the document renders it as "covenant or royalty language" · a general contract builder for documents that are not agreements (R7 owns the phrase) · verifying licenses (R10 owns it) · legal advice — every template carries the standing disclaimer.

---

## §14 · How to respond — `id="respond"` cap 60

Three lines: comment on the Artifact on the line it concerns · rule R1–R16 — Kody owns ten, Leah R3 R7 R13, counsel R10 R11, R16 Kody with counsel on the wording **[EV-33, D-1]** · walk the Okonkwo fixture in the portal against M1 — thirty minutes gets further than reading.

Eleven questions for the Middle West team (numbered, one line each) **[D-6 adds the eleventh]**: Which of the seven facets have you wanted to delete? · How many templates would your studio keep, and what are they called? · Which fee model do you actually quote? · Does a retainer get credited, or is it non-refundable? · Should exclusions be removable? · What should the client see of a sub? · Who in the studio may edit the Library? · Would you sign an attestation about licensing inside Patina? · Do you want a PDF, or is the frozen copy enough? · What would make you notice Patina in this room — and should we remove it? · Does Middle West hold trades under its own name, or plan to?

---

## Appendix — `id="appendix"` cap 60 **[D-6]**

A. Codebase citations (the rigidity ledger's twelve rows plus the eight constraints from 04, each with `path:line`). B. Sources by lane (01, 02, 03 URLs, deduplicated). C. SIMULATED panel — five personas, one line each, and the five disagreements. D. Vision test: surface = The Document; moment = the studio's first hands drafting an agreement; stream = subscription floor (the agreement) + upside (procurement and cost-plus parts); promise = the studio won't notice Patina — this room gets faster, not louder.

---

## Build notes for the HTML

- Register: paper ground, tokens and fonts as `artifacts/pricing-mechanics-2026-09-05/proposal.html` (read its first 500 lines; reuse `.index`, `.masthead`, `.eyebrow`, `.mockscroll`, `.mocktable`, stamp, callout patterns). Google Fonts stylesheet allowed; all other assets inline. Theme-aware exactly as that file. No images.
- Mockups are CSS-drawn `<figure class="mock …">` with `<figcaption>`; annotation callouts are numbered mono labels. The client-register mockups (M5) mirror the deployed Threshold typography; the account mockup (M4) sits beside a faithful Billing card and does not restyle it.
- Every `<section>` carries `data-prose-cap`; `<body data-prose-total="900">`. Running prose lives only in `<p>`; everything else is tables, lists, figures, captions.
- Diagrams D1, D2 and the small money diagram are inline SVG using the tokens (`currentColor`, `var(--rule)`), legible at 390px (stack vertically under 760px via a second SVG or CSS grid of boxes — a CSS box diagram is acceptable).
- Wide tables go inside `.mockscroll`; the body never scrolls horizontally.
- Gate before hand-back: `node source/check-fixture.mjs` exit 0 (all 65 figures present) and `node source/check-prose.mjs` exit 0.
