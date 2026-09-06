SIMULATED PANEL — synthetic personas, not evidence. Nothing below is a real designer, a real transcript, or real user research; it exists to pressure-test the modular-agreement concept before it goes near Leah's team.

# Agreement / Contract Room panel — five studio shapes, one flexible system

Program: Agreement, composed (Patina). Lane: research/05. Five synthetic personas are built from the codebase map (`00-raw/a-codebase-map.md`), the one real feedback record on file (`00-raw/b-recorded-feedback.md`), and the industry brief (`00-raw/c-industry-brief.md`). Where a persona echoes something actually recorded — a tester note, a prod walk, a schema fact — it is marked **REAL** with its citation. Everything else, including all five personas themselves, is marked **SIMULATED**.

---

## Persona 1 — Marta, the Madison hire-maker

Full-service residential studio of three in Madison, WI (SIMULATED — not the real Leah). Bills hourly for design time, keeps a procurement margin on furnishings. Just hired her first coordinator and is handing off drafting work for the first time.

**Walk of today's seven facets** (`a-codebase-map.md:62-69`)

| Facet | Keep/Drop/Rename/Can't-express | Reason |
|---|---|---|
| Services & deliverables | Keep | Matches how she scopes every job |
| Exclusions | Keep, but wants ordering | "Construction labor" default (`:71`) is right for her but buried in a flat textarea |
| Role rates | Keep — only repeatable part today (`:176`) | Now needs a rate row per new hire, which works |
| Rates & ceiling | Keep, add a field | Ceiling works; wants a separate procurement-margin % beside the furnishings deposit chip |
| Retainer | Keep | Matches her deposit-against-hours practice |
| Billing cadence | Keep | Monthly fits |
| Terms | Can't-express | One free-text box has to carry IP ownership, cancellation, and dispute resolution all at once |

**Parts she'd add** (from `c-industry-brief.md:11,64`): change orders (studio default), client responsibilities (studio default), ownership-of-drawings/IP (studio default), cancellation/termination (studio default), a procurement-margin schedule (per-client — varies by vendor category).

**Template shape**: 2 templates — "Full-Service Residential (Hourly)" and "Consult-Only Room Refresh." Per-client: role rates (who's staffed), ceiling, retainer amount.

**Fee model**: hourly + procurement margin. Today's hourly-rate-card + ceiling: **partly** — the rate card and ceiling exist, but nothing captures the procurement margin distinct from `furnishings_deposit_percent` (`a-codebase-map.md:19`).

**Turnkey needs**: n/a — no subs under her roof.

**Moments of friction**: "4 of 7 facets silently pre-filled" when Direction hands off to the Drafting/Contract Room — **REAL** (`b-recorded-feedback.md:31`). No designer-side mark-as-signed to let her coordinator dry-run a draft before it goes to a client — **REAL** (`b-recorded-feedback.md:33`). Whether her coordinator should be able to touch role rates unsupervised — **SIMULATED**, no permission model exists to test either way (`a-codebase-map.md:45` — RLS is studio-comember-wide, not role-scoped).

**Her voice on "flexible"**: "Flexible means my new hire can build the first draft from a template I trust, and I still get final say on the number before it goes out."

---

## Persona 2 — Dana, the solo e-design packager

Solo consult/e-design practice, flat packages, no procurement, remote-first (SIMULATED).

**Walk of the seven facets**

| Facet | Keep/Drop/Rename/Can't-express | Reason |
|---|---|---|
| Services & deliverables | Keep | Deliverables ARE the package |
| Exclusions | Drop | Nothing to exclude — no construction, no procurement |
| Role rates | Drop | She's solo; one flat number, not a rate card |
| Rates & ceiling | Can't-express | `billing_ceiling_cents` presumes hourly-against-a-cap; her price is fixed regardless of hours (`a-codebase-map.md:171`, ceiling>0 is a hard blocker even for a studio that doesn't bill hourly) |
| Retainer | Rename | Her "retainer" is really a non-refundable deposit against the flat fee |
| Billing cadence | Can't-express | `monthly\|biweekly\|milestone` has no "one-time on booking" (`:172`) |
| Terms | Keep | Fine as free text for a short package agreement |

**Parts she'd add**: change orders (studio default, for scope creep out of a flat package), scope-by-phase checklist toggle (studio default — `c-industry-brief.md:60`), cancellation/termination with non-refundable-deposit language (studio default), photography/portfolio rights (studio default, opt-out per client).

**Template shape**: 2 templates — "Discovery Package" and "Full E-Design Package." Per-client: which rooms are in scope, price.

**Fee model**: flat/fixed package. Today's hourly-rate-card + ceiling: **no** — there is no flat-fee representation at all (`c-industry-brief.md:59` lists flat/fixed as a baseline fee model the library must support); she'd have to fake a $0/hr rate row and a ceiling equal to the flat price just to get past the readiness gate.

**Turnkey needs**: n/a.

**Moments of friction**: DB refusal "design services agreement requires terms and at least one role rate" (`00477:306`) — **SIMULATED** source, `b-recorded-feedback.md:40`, but forces exactly the fake-rate-row workaround above. "Presenting one total figure without itemization increases rejection risk" — **SIMULATED**, `b-recorded-feedback.md:41`.

**Her voice on "flexible"**: "Flexible means I send the same three packages to everyone and only ever change the price and the room list, never the wording."

---

## Persona 3 — Marcus, the Minneapolis design-build principal

Turnkey design-build shop holding cabinet, electrical, and plumbing subs under one roof; cost-plus (SIMULATED).

**Walk of the seven facets**

| Facet | Keep/Drop/Rename/Can't-express | Reason |
|---|---|---|
| Services & deliverables | Keep, but incomplete | Design side only; construction admin has no home in this facet set |
| Exclusions | Keep | Still useful for what's not covered |
| Role rates | Can't-express for construction | Rates cover design labor; nothing represents sub markup vs. supervisory labor (`c-industry-brief.md:25`) |
| Rates & ceiling | Can't-express | A cost-plus-with-GMP job has no ceiling in the design-services sense — the cap is on total project cost, not design hours |
| Retainer | Keep | Design retainer still applies before construction starts |
| Billing cadence | Can't-express | No milestone/draw cadence tied to construction percent-complete |
| Terms | Can't-express | Licensing, retainage, and lien-waiver language don't belong in one prose box |

**Parts he'd add** (`c-industry-brief.md:21-27,62`): allowances schedule (per-client), retainage % (studio default 5%, per-client override), schedule of values (per-client), lien waivers (studio default), sub disclosure list (per-client), licensing attestation (studio-level default, gates turnkey mode on), jurisdiction cancellation notice (studio default, generic — specific state text not confirmed for Minnesota in the industry brief and not asserted here).

**Template shape**: 3 templates — "Kitchen Remodel Design-Build," "Whole-Home Renovation," "Design-Only (no construction)" for clients who want his design eye without his GC hat. Per-client: which subs are disclosed, GMP number, allowance line items.

**Fee model**: cost-plus with a GMP cap. Today's hourly-rate-card + ceiling: **no** — `trade_scope_terms` already exists as a separate instrument with a lump-sum client price (`a-codebase-map.md:159`), but it has no cost-plus, markup, or GMP-conversion representation, and it's disconnected from the design-services rate card entirely.

**Turnkey needs (in depth)**

| Need | Today's instrument | Gap |
|---|---|---|
| Draws | `trade_scope_draws` exists (`a-codebase-map.md:26,159`) | No schedule-of-values line-item basis for percent-complete billing |
| Retainage | None | No withheld-percentage field or closeout release event |
| Allowances | None | No placeholder-line-converts-to-change-order pattern |
| Sub disclosure | `trade_scope_bids` is studio-only, "never client-visible" (`:159`) | Tension: bookkeeper/ops needs to see it; some jurisdictions expect client-visible sub identity even if not price |
| Licensing | None | No attestation gate before a studio can turn on draws/retainage/allowances |
| Cancellation notices | None | Industry brief only confirms CA/NY/MA/IL statutes (`c-industry-brief.md:49-52`) — Minnesota's rule is **not confirmed** here and must not be assumed |

**Moments of friction**: "No design-build / turnkey model exists in the repo" — **REAL**, and stated as an absence, not a bug (`b-recorded-feedback.md:9`). Everything else in his row is inferred, not recorded — **SIMULATED**.

**His voice on "flexible"**: "Flexible means I can put a GMP number in front of a client and mean it, with the subs behind it disclosed exactly as far as the law and the client both need."

---

## Persona 4 — Elise, the furnishings-only studio

Sources and sells FF&E; never touches construction, never bills hourly for site time (SIMULATED).

**Walk of the seven facets**

| Facet | Keep/Drop/Rename/Can't-express | Reason |
|---|---|---|
| Services & deliverables | Rename | Her "deliverables" are procurement milestones, not design documents |
| Exclusions | Drop | Default exclusion "Construction labor" (`a-codebase-map.md:71`) is irrelevant to a studio that has never once done construction |
| Role rates | Drop | She doesn't bill design hours at all |
| Rates & ceiling | Can't-express | Her fee is a percentage of purchase price, not an hourly ceiling |
| Retainer | Rename | Hers is a purchase deposit, not a design retainer |
| Billing cadence | Keep, rename | "Milestone" fits (deposit → order → delivery) if relabeled |
| Terms | Keep | Fine as-is for a short procurement agreement |

**Parts she'd add**: purchasing terms sub-schedule as its own unit — deposits, trade-pricing disclosure, freight/receiving/warehousing/installation pass-through (studio default, `c-industry-brief.md:9,65`); insurance/liability (studio default); ownership-of-drawings/IP (optional — she rarely produces drawings).

**Template shape**: 1 template — "Furnishings Procurement Agreement." Per-client: rooms, deposit %.

**Fee model**: percentage-of-purchase / procurement-only. Today's hourly-rate-card + ceiling: **no** — no percentage-of-cost fee model exists (`c-industry-brief.md:59` names it as a required minimum); she'd be forced through the same fake-hourly-row path as Dana.

**Turnkey needs**: n/a.

**Moments of friction**: forced through "at least one role rate" (`b-recorded-feedback.md:40`, **SIMULATED** source) despite never billing an hour. The hard-coded default exclusion list assumes construction exists to exclude — **REAL** as a codebase fact (`a-codebase-map.md:71`), her reaction to it is **SIMULATED**.

**Her voice on "flexible"**: "Flexible means the agreement talks about furniture, freight, and a deposit — not exclusions and clauses for construction I've never once done."

---

## Persona 5 — Renee, the studio bookkeeper/ops manager

Part-time, administers agreements and templates across two studios; reconciles what was promised against what was signed (SIMULATED).

**Walk of the seven facets** (from an administrator's seat, not an author's)

| Facet | Keep/Drop/Rename/Can't-express | Reason |
|---|---|---|
| Services & deliverables | n/a to edit | She reads it, doesn't write it |
| Exclusions | n/a to edit | Same |
| Role rates | Keep, wants history | Needs to see a rate change and who made it, not just the current number |
| Rates & ceiling | Keep | Ties directly to the billing authority snapshot she reconciles against (`a-codebase-map.md:23`) |
| Retainer | Keep | Same reconciliation need |
| Billing cadence | Keep | Drives her invoicing calendar |
| Terms | Can't-express | Nothing in free text is structured enough to pull into a reconciliation view |

**Parts she'd add**: audit trail / change-reason on any term edit (studio default — not one of the industry brief's named clauses, but implied by its audit-trail requirement, `c-industry-brief.md:68`); dispute resolution clause (studio default); insurance clause with a current-COI attachment point (studio default).

**Template shape**: not her call to name templates, but she wants one shared shelf across both studios she serves, version-pinned, not the per-designer scoping `phase_templates` has today (`a-codebase-map.md:149`).

**Fee model**: n/a — she administers others' fee models, whatever they are; her one requirement is that whichever model is chosen leaves a paper trail when it changes.

**Turnkey needs**: n/a directly, but she is the one who would have to reconcile Marcus's draws and retainage releases if his studio joined — flags that any turnkey money movement needs the same paper trail she wants everywhere else.

**Moments of friction**: the doc URL breaking permanently once Direction starts — **REAL** (`b-recorded-feedback.md:34`); a proposal that was only ever saved getting mislabeled as sent in nurture — **REAL** (`b-recorded-feedback.md:35`); a designer in two studios being unable to get a signature recorded until 00566 shipped — **REAL** (`b-recorded-feedback.md:27`), directly relevant to her cross-studio role.

**Her voice on "flexible"**: "Flexible means every studio I work with pulls from the same shelf of clauses, so I'm not relearning a new contract's plumbing every time I sit down."

---

## Synthesis

### Part-frequency table

Rows are candidate parts (existing facets plus industry-brief candidates); cells are **default** (studio would turn it on for every agreement), **optional** (situational), or **never**.

| Part | Marta (P1) | Dana (P2) | Marcus (P3) | Elise (P4) | Renee (P5) |
|---|---|---|---|---|---|
| Services & deliverables | default | default | default | default | n/a |
| Exclusions | default | never | default | never | n/a |
| Role rates | default | never | optional | never | default |
| Rates & ceiling | default | never | never | never | default |
| Retainer | default | default (renamed) | default | default (renamed) | default |
| Billing cadence | default | optional | never | optional (renamed) | default |
| Terms | default | default | default | default | default |
| Change orders | default | default | default | default | default |
| Client responsibilities | default | default | default | default | optional |
| Ownership of drawings / IP | default | default | default | optional | n/a |
| Photography / portfolio rights | optional | default | never | optional | n/a |
| Cancellation / termination | default | default | default | default | default |
| Dispute resolution | default | optional | default | optional | default |
| Insurance / liability | default | optional | default | default | default |
| Procurement margin / % of purchase | default | never | optional | default | n/a |
| Purchasing terms sub-schedule | optional | never | optional | default | n/a |
| Allowances / retainage / draws / lien waivers / sub disclosure | never | never | default | never | optional (reconciles) |
| Licensing attestation | never | never | default | never | n/a |
| Audit trail / change-reason on edits | optional | never | optional | never | default |

### Top ten asks, ranked by how many personas share them

1. **Studio-level, saveable templates** — not the retired per-user `proposal_templates` (`a-codebase-map.md:150`) — 5/5.
2. **Standard optional clauses as a pick-list** (IP ownership, photography, insurance, dispute resolution), not hand-typed into one Terms box — 5/5.
3. **Change orders / amendment path that isn't "start a whole new agreement"** — today's forward path is `create_service_addendum` or supersede only (`a-codebase-map.md:173`) — 4/5 (Marta, Dana, Marcus, Renee).
4. **A fee-model library beyond hourly + ceiling**: flat/fixed, percentage-of-purchase, cost-plus + GMP — 4/5 (Marta, Dana, Marcus, Elise).
5. **Ability to add/remove/reorder facets**, so an irrelevant one (Exclusions for Elise, Role rates for Dana) can be dropped — 3/5 (Dana, Marcus partial, Elise).
6. **A procurement-margin or percentage-of-purchase field distinct from the furnishings deposit chip** — 3/5 (Marta, Marcus, Elise).
7. **Cancellation/termination as a first-class, studio-default part** — 5/5, but tied with #2 on breadth; ranked lower because it's already partially expressible via free-text Terms today, unlike #2's structural gap.
8. **A visible reason/history when a term changes** — 2/5 in this panel (Renee directly, Marta for her new hire's edits), but flagged as a cross-cutting system requirement rather than a single clause.
9. **Role-based editing permission inside the drafting room** (who may touch rates vs. deliverables) — 2/5 (Marta for her hire, Renee for cross-studio administration); no permission model exists today beyond studio-comembership (`a-codebase-map.md:45`).
10. **Turnkey-specific parts as one bundle** — draws, retainage, allowances, lien waivers, sub disclosure, licensing gate — 1/5 in depth (Marcus), but named because the industry brief treats it as a distinct contract class, not a stray request (`c-industry-brief.md:62`).

### Five disagreements the proposal must rule on

1. **Can Exclusions be removed, or only reordered?** Marta wants it kept as a protective default; Dana and Elise want it droppable entirely. A blanket "always required" facet fails two of five personas outright.
2. **Does sub/bid visibility stay studio-only, or does some of it need to reach the client?** `trade_scope_bids` is "never client-visible" by design (`a-codebase-map.md:159`); Marcus wants that preserved for price, but sub *identity* disclosure is a common construction-contract norm the industry brief assumes (`c-industry-brief.md:23-27`) that this system doesn't yet distinguish from bid price.
3. **Can a studio delete/rename the seven canonical facets, or only add alongside them?** Renaming already happened once in response to real feedback (Drafting Room → Contract Room, `b-recorded-feedback.md:24-25`), but deletion collides with the fingerprint's closed field list (`a-codebase-map.md:180`) — a removed facet still needs a defined "not present" state for signature evidence to stay valid.
4. **Should role-based permissions gate who can edit rates within a studio?** Marta and Renee want it; today every studio comember has equal edit rights (`a-codebase-map.md:45`), and adding tiers cuts against the platform's own "no lock-in, no hidden complexity" posture for a studio the size of Marta's (three people, one of them brand new).
5. **Does turnkey mode require a licensing attestation gate, and who administers it?** Marcus wants access to draws/retainage/allowances; the industry brief treats unlicensed GC-adjacent work as a real legal exposure (`c-industry-brief.md:27`), but Patina has no precedent for a studio-level compliance attestation anywhere in the schema today.

---

*Word count target: 2,000–2,800. This document is a synthetic panel built to sharpen the questions the real proposal must answer — it is not a substitute for asking Leah's team, Marcus's real-world counterpart, or anyone else.*
