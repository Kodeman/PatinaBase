# C5 — External fabrication and fulfilment

Status: proposed contract (WP-00.5b, SQ-1813). Owner: **build domain** (WP-08), the single C5 owner. Commerce (WP-06) consumes it for client-bought furnishings. Decision: P05. Acceptance: A12, A16, A17, A18, A21 (external work visible, non-blocking), X02, X03, X09. Fixtures: F03, F05, F08.
Source inspected at `0fabcadf2`. Names without a file:line are **proposed**.

**Revision 2026-10-23 (SQ-1850).** Answers the SQ-1817 frontier review at `4952624a16d1` for findings F16 (§3.2 conversion: reuse the protected-commitment check, including draft and sent authorizations), F17 (§3.1, §3.4: validate the whole responsibility combination, not only the buyer) and F20 (§3.1, §3.4: `fabrication_instruction` calls the shared C3 gate `public.assert_fabrication_instruction_authority`, C3 §3.2 at `33d2d5666`; §3.6: all-role revokes). It also applies the C2 F8 suspension rule (§3.6).

**Revision 2026-10-23 (SQ-1856).** Answers the SQ-1851 re-review at `6ac0c5acc47c`, marked inline with `SQ-1851 R#`:
- **R1** (§3.1, §3.4): `package_key` is the C2 §2.2a canonical key, and it resolves to C1 by that key only.
- **R3 / F4** (§3.4, §3.5): every C5 mutation takes one lock order, and the fabrication gate locks the fulfilment before it reads the amount or holds.
- **R4 / F17** (§3.4): the external-only rule is one helper, `_external_rail_refusal`, which C5's mutations and the C3 gate both call.
- **R5** (§3.1, §3.4, §3.5): fulfilments declare their units; holds and instructions name validated unit sets, and the instructed set is frozen.
- **R8** (§3.2, §3.3, §3.4): studio installation on client-bought goods is a C6 blocker, independent of the buyer.
- **R9 / F17** (§3.4): the promised "move to commerce" after a liability amendment is withdrawn; C2 §2.5a holds such an amendment instead.
- **R14** (§3.1): `reported → verified` is one permitted, atomic, one-way transition.
- **R18** (§3.1): actor columns on the immutable event ledger use `ON DELETE RESTRICT`.

## 1. Inventory: what is studio commerce and what is external

| Model | Who pays, who owns it | Evidence | Is it external fulfilment? |
|---|---|---|---|
| `purchase_orders` and `project_ffe_items.purchase_order_id` | Studio-placed maker order. It is a studio payable | Receipt linkage `supabase/migrations/00862_receiving_review_repairs.sql:131-143` | No |
| `studio_purchases` | Studio-paid store, card, auction, expense and sample purchases. They are paid by a studio payment method or reimbursed to a member. They are `billable_to_client` by default, under a studio billing rule | Kinds and money columns at `supabase/migrations/00703_studio_purchases.sql:56-97`. A line already on a PO is refused at `00703:309-311`, and a trade-scope line at `00703:305-307` | **No.** It is studio commerce. Reusing it for a client or GC purchase would turn the purchase into a studio payable or reimbursement |
| Trade-scope presence line (`project_ffe_items.trade_scope_document_id`) | Trade work billed by draws on an executed trade scope. The row only marks presence in the room | `supabase/migrations/00423_trade_scope_instrument.sql:28-32`, `:290-313` | No, because it is still a studio-sold instrument. It is, however, the closest **structural** prior art: an FF&E row that is present but never orderable |
| Custom commission milestones | Studio PO-gated fabrication | `supabase/migrations/00403_product_configuration_foundation.sql:3262`; fulfilment refused without an issued snapshot on a PO at `00403:3316-3325` | No. GC-bought cabinetry cannot use it unchanged |
| External signed agreement evidence | Private PDF evidence for the design-agreement prerequisite only | `supabase/migrations/00835_external_signed_agreements.sql:1-13` | No. It is useful prior art for immutable attested evidence |

No inspected table records "the client or the GC buys this". C5 is new. It is not an extension of `studio_purchases` and not a fake PO.

## 2. Why a priced FF&E row is the hazard

- **Placement creates priced lines.** `place_product_configuration_in_project` (wrapper `supabase/migrations/00808_us37_item_labels.sql:1360`, impl `supabase/migrations/00809_us37_trade_pricing_core.sql:720`) writes the configuration's price onto the FF&E line as a client price (`00809:877-890`).
- **`close_project` counts every row.**
  - It counts every `project_ffe_items` row with `status <> 'installed'`, with no removed, disposition or provenance filter (`supabase/migrations/00399_journey_authority_integrity.sql:7473-7481`).
  - It counts every positively priced row whose sell value is not covered by fully paid studio invoice lines (`00399:7484-7518`).
- **The designer-side derivation mirrors both predicates** (`apps/designer-portal/src/lib/document/closure-derivation.ts:205-235`).
- **Consequence:** a positively priced external line makes `close_project` impossible unless the studio invoices and collects it. That fabricates a studio receivable for a purchase the studio never made.
- **What presence lines already escape:**
  - the working budget (`supabase/migrations/00661_ffe_extract_commercial_confirmation.sql:497-504`);
  - the furnishings-authorization schedule (`00835:1398-1413`);
  - purchase orders (`00835:1561`, `00423:682`);
  - studio purchases (`00703:305-307`).
- **What they do not escape:** the closure installed census.

## 3. Contract

### 3.1 Record

**Proposed `project_external_fulfilments`.** There is one row per externally fulfilled package or item group.

| Column | Meaning |
|---|---|
| `id`, `project_id` | |
| `scope_edition_id`, `package_key` | The C2 join. Inclusion and responsibility come from the agreed edition and are never typed here. `package_key` carries the C2 §2.2a format CHECK and resolves to C1 `project_packages` only by `(project_id, package_key)` (SQ-1851 R1) |
| `units` | `text[] NOT NULL`, the units of this external package, for example cabinet runs `k-1`, `k-2` (SQ-1851 R5). Non-empty, no duplicates, each matching `^[a-z0-9][a-z0-9-]{0,31}$`. Fixed at creation. A package whose units change gets a successor fulfilment (`cancelled` on this one, then create); this contract adds no unit-editing act |
| `kind` | `gc_cabinetry`, `client_furnishing` or `other_external` |
| `buyer_party_kind`, `payer_party_kind`, `contracting_party_kind` | Copied from the edition's package responsibilities (`purchasing`, `payer`, `fabrication_contract`, C2 §2.2) when the row is created. A mismatch with the edition is refused. The full combination must pass the external-only rule (§3.4, F17) |
| `party_engagement_id` | Optional `project_parties` row (the GC or supplier). It is a reference only and confers no access (C3) |
| `configuration_id` | Optional custom configuration for the cabinet package, used as a reference. The milestone rail is not used |
| `reported_price_cents`, `price_visibility` | An informational external price (`client_visible` or `studio_only`). It is never a studio sell price and never summed into studio totals |
| `status` | Derived from events: `planned`, `contracted`, `issued`, `instructed`, `received`, `installed`, `cancelled` |
| `created_by`, `created_at` | |

**Proposed append-only `project_external_fulfilment_events`.**
- Columns:
  - `fulfilment_id`;
  - `event_kind`: `quote_reported`, `contract_reported`, `package_issued`, `fabrication_instruction`, `hold`, `release_hold`, `received`, `installed`, `cancelled`;
  - `evidence_level`: `reported` or `verified`;
  - the evidence: a storage object, a `plan_issues` id or a site request id;
  - `affected_units text[]` (SQ-1851 R5): for `hold`, the held units; for `fabrication_instruction`, the instructed units the C3 gate returned. Every entry must be one of the fulfilment's `units`. NULL for other kinds;
  - `releases_event_id`: for `release_hold` only, the `hold` event it releases (same fulfilment). A hold is open until a `release_hold` names it;
  - for `fabrication_instruction` only: `authority_id`, `manifest_id`, `manifest_hash`, `amount_cents` and `actor_id`, copied from the gate's result (C3 §3.2);
  - `recorded_by`, `recorded_at`, `verified_by`, `verified_at`;
  - `client_request_id` and `request_hash`.
- `UNIQUE (fulfilment_id, client_request_id)`. This one key covers both fabrication routes (C3 §3.2).
- **Evidence level (SQ-1851 R14).** The first revision let an UPDATE set only `verified_by` and `verified_at`, so a `reported` event could never become `verified`, although installation and the committed amount both require verified events. Now:
  - CHECK `(evidence_level = 'verified') = (verified_by IS NOT NULL AND verified_at IS NOT NULL)`;
  - the UPDATE trigger permits exactly one transition, under the GUC that only `verify_external_fulfilment_event` sets: `(evidence_level, verified_by, verified_at)` from `('reported', NULL, NULL)` to `('verified', <verifier>, now())` in one statement, with every other column unchanged. It is one-way and happens at most once. Everything else is immutable, following `00835:20-30`;
  - an event that is verified at insert (a `fabrication_instruction` on the gate's `verified` branch) is inserted with `verified_by = actor_id` and `verified_at = recorded_at`, and is never updated.
- **Actor retention (SQ-1851 R18).** `recorded_by`, `verified_by` and `actor_id` are `REFERENCES public.profiles(id) ON DELETE RESTRICT` (00835:12 pattern). The ledger is immutable, so a `SET NULL` action could never run.

**Who may record each fact:**

| Fact | May record | Notes |
|---|---|---|
| Quote, contract, receipt, install | A studio member, as `reported` | `verified` requires a different studio owner or admin, or C3's `field verifier` role with attached evidence, through the one `reported → verified` transition above. `verify_external_fulfilment_event` refuses a `fabrication_instruction` event (`fabrication_instruction_not_verifiable`): an instruction is `verified` only when the authorizing party acts authenticated (C3 §3.2), never by a studio stamp |
| `package_issued` | Only the existing plan-issue owner path | It must reference an immutable issue (C1). This preserves A09 and A18 exact-issue invariance |
| `fabrication_instruction` | **Only** a caller that passes the shared C3 gate `public.assert_fabrication_instruction_authority(p_fulfilment_id, p_manifest_id, p_authorizing_party_id, p_units)` (C3 §3.2, signature revised for SQ-1851 R3/R5). Two routes call it: C3's `record_fabrication_instruction` and this contract's `record_external_fulfilment_event` (§3.4, F20) | The gate enforces authority, the server-derived amount, the one-job/one-tenant binding, the open seat, approved evidence and the C5 hold. It writes nothing; the caller writes the event in the same transaction from its result. No route writes this event without the gate. Today the scope check allows `money`, `change_order`, `selections`, `schedule`, `site_access`, `key` and `draw_certify` (`supabase/migrations/00624_project_party_window_and_authority.sql:860-864`). Fabrication is absent, and `selections` must not be read as sufficient. Until C3 lands the gate, no `fabrication_instruction` event can exist |

- Readiness is never the same as instruction, and receipt is never the same as acceptance (A18).

### 3.2 FF&E representation (P05 recommendation)

**GC cabinetry:**
- There is **no priced FF&E row by default.**
- If the room or plan needs presence, it gets an *external presence line*. This is a new nullable `project_ffe_items.external_fulfilment_id` with:
  - a single-provenance CHECK alongside `trade_scope_document_id` and the furnishings provenance, extending `00423:297-306`;
  - a CHECK that `COALESCE(unit_price_cents, 0) = 0 AND COALESCE(line_total_cents, 0) = 0`;
  - a refusal of `purchase_order_id`, added to `guard_project_ffe_purchase_authority` next to `00835:1561`;
  - a refusal by `record_studio_purchase`, next to `00703:305`.

**Client-bought furnishings (design-only or client-buy):**
- The line keeps its selection identity, room and spec. Its responsibility is external through `external_fulfilment_id`, and its price is moved to `reported_price_cents` on the fulfilment, so the line itself is unpriced.
- Conversion RPC: `set_ffe_item_external_fulfilment(p_item_id, p_fulfilment_id, p_row_version, p_client_request_id)`.
- **Protected-commitment check (SQ-1817 F16).** The earlier list keyed authorization on reverse provenance (`source_commercial_document_id`) only. That stamp lands at *execution* (`00835:817-831`), but a draft or sent furnishings authorization already holds the line through `furnishing_authorization_items.source_ffe_item_id`. Converting then would zero or reclassify a line a live studio authorization still prices. Conversion therefore reuses the existing check rather than a new list. It is refused when either of these holds:
  - `_ffe_pricing_lock_reason(item) IS NOT NULL` (`00809_us37_trade_pricing_core.sql:364-403`). That function already covers:
    - a PO;
    - a forward *or* reverse authorization link on a `sent`, `client_signed` or `executed` document;
    - a forward link on a `draft` document;
    - any invoice line;
    - removed, superseded, labor, trade-scope and locked configured lines.
    It is stricter than the old "non-void invoice" rule, which is the safe direction;
  - a live `studio_purchases` row (not covered by that function).
- **Locking against draft, send and execute.**
  - Conversion takes `_ffe_lock_job_labels(project)` and then the item row FOR UPDATE, as every item writer does (`00808:99-100`). Only then does it evaluate the check.
  - Drafting an authorization already locks its schedule lines FOR UPDATE (`00835:344-345`), and execution updates them (`00835:817-831`). So a conversion and a draft or execute on the same line serialize, and whichever commits second sees the other's effect.
  - Sending changes only the proposal's state, and a line on a draft is already refused, so send needs no item lock.
  - In the other direction, the authorization draft, send and execute paths each re-check `external_fulfilment_id IS NULL` on their locked lines and refuse an external line. The schedule filter (§3.3) alone is not relied on.
- These are exactly the states in which studio money has attached or is about to.
- **Package membership (SQ-1851 R8).** Conversion sets the line's `scope_package_key` to the fulfilment's `package_key` in the same statement, and the line keeps it while external. C2's assignment RPC refuses external lines (C2 §2.4a), so an external line's package is always its fulfilment's. C6 uses that membership for the studio installation blocker.
- The reverse conversion is allowed only before any `contract_reported` event. It re-enters pricing through the existing pricing writer (`app.ffe_pricing_writer`, `00809:877`). After a `contract_reported` event there is no route back into studio commerce; C2 §2.5a holds any amendment that would need one (SQ-1851 R9).

**Why this rule and not a label.**
- "Do not rely on a label or a hidden subtotal" (DOMAIN-CONTRACTS C5). An unpriced line drops out of every money reader *by construction*, because the existing predicates already ignore zero-value lines (`00399:7486-7497`; `closure-derivation.ts:219-226`).
- The external price stays visible through the fulfilment record, which every reader can label explicitly.

**Installed census.**
- Presence lines remain rows, so `close_project` still requires them installed (`00399:7473-7481`).
- The line's `status` advances to `installed` only from a **verified** `installed` fulfilment event, through a definer function. A designer dropdown cannot do it.
- Project closure therefore waits for real external installation. Studio service completion (C6) does not.

### 3.3 Reader matrix

"Current" is the behaviour for a plain priced row today. "External" is the required behaviour for an `external_fulfilment_id` line or its fulfilment record.

| Reader | Source | Current | External (required) | How it distinguishes |
|---|---|---|---|---|
| Working budget / estimate | `derive_working_budget_draft` `00661:518`; USD guard `00661:500-511` | Sums fixed lines | Excluded from the studio subtotal. Shown as a separate "bought by client/GC (not billed by studio)" group from `reported_price_cents` | `external_fulfilment_id IS NULL` filter added beside `trade_scope_document_id IS NULL` |
| Furnishings authorization schedule | `00835:1398-1413` | Schedules live selected lines | Excluded | Same filter |
| Purchasing release / PO | `guard_project_ffe_purchase_authority` `00835:1534` | PO allowed after authority | Refused | Guard branch |
| Studio purchase | `record_studio_purchase` `00703:295-320` | Allowed on a selected line | Refused | Guard branch |
| Studio invoices | `invoice_line_items.ffe_item_id` | Billable line | A line cannot reference an external item (new check in the invoice line writer) | `external_fulfilment_id` lookup |
| Receivables / balances | Invoice truth `00399:7534-7591` | From invoices | Unaffected. No invoice exists | No invoice rows |
| Studio payables | POs and `studio_purchases` (payment method / reimburse, `00703:75-77`) | Studio pays | None. This holds because the external-only rule refuses any package where the studio is payer or contracting party (§3.4, F17) | No PO or purchase row |
| Procurement readiness | `get_project_ffe_readiness` `supabase/migrations/00834_purchasing_authorization_image_readiness.sql:11`, which keys on `design_disposition` (`:60`) | Readiness for ordering | Returns `responsibility: external`, with no ordering checklist | New field. Old callers ignore it |
| Receiving | `validate_receipt_linkage` `00862:131-143` (PO or qualifying studio purchase) | Studio receiving inspection | External receipt is a `received` fulfilment event, not a `receiving_inspections` row | Separate record |
| Custom milestones | `00403:3316-3325` | PO-gated | Not used. External package progress comes from fulfilment events | Separate record |
| Installed check (closure) | `00399:7473-7481`; `closure-derivation.ts:205-214` | Must be `installed` | Must be `installed`, set only from a verified external install | Status writer restricted |
| Paid check (closure) | `00399:7484-7518`; `closure-derivation.ts:216-235` | Positive value must be paid | Zero value, so not counted | Unpriced by CHECK |
| Studio service completion | C6 derivation | n/a | Purchase, receipt and contract progress are visible and **non-blocking**. **Exception (SQ-1851 R8):** in an included package whose `installation` is `studio`, an external line or fulfilment not yet verified `installed` blocks studio service completion, whoever bought the goods | Edition package inclusion and `installation` responsibility |
| Client edition / client page | The 26 migrations that already special-case `trade_scope_document_id` (listed below) | Presence-aware | Each must add `external_fulfilment_id` parity. Each is audited, not assumed | Grep audit is part of the slice gate |

**Readers to audit for presence-line parity.** These are the migrations referencing `trade_scope_document_id`. The latest definition of each function they touch must be rechecked:
00423, 00435, 00475, 00510, 00565, 00578, 00580, 00661, 00703, 00731, 00732, 00733, 00737, 00744, 00745, 00755, 00757, 00758, 00807, 00808, 00809, 00835, 00840, 00842, 00845, 00852.

### 3.4 RPCs

**`create_external_fulfilment(p_project_id, p_scope_edition_id, p_package_key, p_kind, p_units text[], p_party_engagement_id, p_configuration_id, p_client_request_id) → jsonb`**
- Response:
  ```
  {"fulfilmentId", "status", "units", "replayed"}
  ```
- It is refused when:
  - the package is not in the **active** edition, or `scope_editions` is inactive (C2 §2.8);
  - the package's responsibilities fail the **external-only rule** below;
  - `p_units` is empty, has a duplicate or an invalid key (`fulfilment_units_invalid`, SQ-1851 R5);
  - the caller fails the studio predicate.

**External-only rule (SQ-1817 F17).** The earlier check was only `purchasing <> 'studio'`. A package with buyer = client and payer = studio passed it, yet the studio owes real money, and the reader matrix (§3.3) would still have asserted "no invoice, no payable". Who clicks Buy is not who owes. The rule now validates the whole combination from the edition (C2 §2.2):

| Slot | Allowed on this rail | Refusal |
|---|---|---|
| `purchasing` | `client`, `gc`, `other` | `studio` → `external_rail_studio_buyer` |
| `payer` | `client`, `gc`, `other` | `studio` → `external_rail_studio_liability`; `none` → `external_rail_payer_unknown` (an external purchase always has a payer) |
| `fabrication_contract` | `client`, `gc`, `other`, `none` | `studio` → `external_rail_studio_liability` |

- A refused combination is not an error to work around. It means the obligation is studio commerce and must go through the existing rails: a PO (`purchase_orders`), a studio purchase (`studio_purchases`, `00703`) or a trade scope (`00423`). The refusal message names the rail.
- **One body (SQ-1851 R4).** The rule is the internal helper `public._external_rail_refusal(p_edition_id uuid, p_package_key text) RETURNS text`: SECURITY DEFINER, revoked from every role, returning the refusal code from the table above or NULL. Every C5 mutation and the C3 fabrication gate call it against the **active** edition. Nothing re-implements the table.
- `installation` and `design` are not checked here. Installing or designing is a service, not a purchase liability. **SQ-1851 R8:** a studio install on client-bought goods is a studio obligation that C6 counts as a blocker until the external line or fulfilment is verified `installed` (C6 §2.3), and design work is bound by the edition's agreed phases, which block whoever buys. Neither is inferred from the buyer.
- The rule is re-checked against the **active** edition on every later mutation (`record_external_fulfilment_event`, `verify_external_fulfilment_event`, `set_ffe_item_external_fulfilment`) and by the C3 gate.
- **Revision 2026-10-23 (SQ-1851 R9): no promised transfer.** The earlier text said an amendment making the studio payer or contracting party would freeze the fulfilment "until the studio moves the obligation to an existing commerce rail". No such move exists after `contract_reported` (§3.2), so that promise is withdrawn. Instead, C2 §2.5a refuses such an amendment at send and at countersign, and refuses it again at reconciliation, while a fulfilment on the package has a `contract_reported` event. A fulfilment can therefore only meet a studio-liable active edition through a fixture. If it does, every mutation refuses `external_rail_studio_liability`, which is a fail-closed hold, not a transfer. The audited transfer is OPEN for a later contract.

**`record_external_fulfilment_event(p_fulfilment_id, p_event_kind, p_evidence jsonb, p_affected_units text[], p_client_request_id) → jsonb`**
- Response:
  ```
  {"eventId", "status", "evidenceLevel", "replayed"}
  ```
- **Units (SQ-1851 R5).** For `hold`, `p_affected_units` is required, non-empty, without duplicates and a subset of the fulfilment's `units` (`fulfilment_units_invalid`). For `release_hold`, `p_evidence.releasesEventId` must name an open `hold` on the same fulfilment. For `fabrication_instruction`, `p_affected_units` is the requested instruction set and goes to the gate (below). Other kinds take NULL.
- **Idempotency first.** The `(fulfilment_id, client_request_id)` receipt is checked before any lifecycle or gate check. A replay with the same request hash returns the first event with `replayed: true`; a different payload raises `serialization_failure`.
- **`fabrication_instruction` calls the shared C3 gate (SQ-1817 F20; revised for SQ-1851 R3, R5).** For this event kind only:
  1. `p_evidence` must carry `manifestId` and `authorizingPartyId`. Any other figure in it, including `amountCents`, is stored as reported evidence and never compared with a threshold.
  2. It calls `public.assert_fabrication_instruction_authority(p_fulfilment_id, manifestId, authorizingPartyId, p_affected_units)` **before taking any C5 row lock**. The gate takes the C5 locks itself, in C3 §3.2's order, including this fulfilment FOR UPDATE, and resolves the C1 package through `(project_id, package_key)` (C2 §2.4a). If no C1 package carries the key, the gate refuses (`fabrication_instruction_binding`).
  3. It inserts the event while the gate's locks are held. `evidence_level` comes from the gate's `evidenceStatus`, never from the caller. `affected_units` is the gate's returned `units`, never the raw argument. The row also stores the gate's `authorityId`, `manifestId`, `manifestHash`, `amountCents` and `actorId`.
  - Any gate refusal propagates unchanged, so this route and `record_fabrication_instruction` refuse the same cases with the same codes. The gate is the single shared root: capability, active edition, responsibilities, authority, amount, units, package/manifest/seat/job binding and the hold check are not duplicated here.
- **`_fabrication_instructed_amount_cents(p_fulfilment_id)` body (C5 owns it; C3 §3.2 calls it after locking the fulfilment, SQ-1851 R3).** It returns the `contractAmountCents` on the fulfilment's latest **verified** `contract_reported` event, ordered by `verified_at` then event id, as a non-negative integer. It returns NULL when there is none. A reported-only contract figure is not a committed amount, so it fails closed through C3's `fabrication_amount_unknown`. The function is SECURITY DEFINER, revoked from every role, and reads no caller input except the fulfilment id. Because every verifier and event writer takes the same fulfilment lock, the value cannot change between this read and the instruction insert.
- Refuses `package_issued` unless it comes from the plan-issue owner path (§3.1).

**`verify_external_fulfilment_event(p_event_id, p_client_request_id)`**

**`set_ffe_item_external_fulfilment(...)`** (§3.2).

**Read RPC:** `get_project_external_fulfilments(p_project_id)` returns a studio projection. The client sees only a curated `client_visible` subset through the client bundle (C7). Bids and contract amounts are studio-only unless `price_visibility` says otherwise.

### 3.5 Lock order, idempotency and concurrency

- **One lock order for every C5 mutation (SQ-1851 R3).** The first revision locked only the fulfilment and events, while the C3 gate locked the job labels and the package, so a contract verification or a hold could commit between the gate's read and the instruction insert. Every C5 mutation (create, conversion, every event kind, verification) and the C3 gate now take the same prefix:
  1. `projects` FOR UPDATE, for creation and conversion only, which keeps closure's "parent first" rule (`00399:7339-7346`);
  2. `_ffe_lock_job_labels(project_id)` (`00808:85-100`): `projects` FOR KEY SHARE and the job label advisory lock, taken by **every** C5 mutation, whether or not it touches an FF&E line;
  3. the active `project_scope_editions` row FOR SHARE, for the external-only re-check;
  4. `project_external_fulfilments` FOR UPDATE. This row is the source-state lock for its amount and holds;
  5. `project_ffe_items` FOR UPDATE in id order, on conversion and on a verified `installed` that advances line status;
  6. events: the target event FOR UPDATE for verification, then the insert.
  The C3 gate takes steps 2–4, then the C1 package, seat, grant and manifest, which no C5 writer locks (C3 §3.2). No C5 path locks a fulfilment before the job label lock, so the gate and the event writers cannot invert.
- Every mutation takes `p_client_request_id`. A replay returns the first effect. A different payload under the same key raises `serialization_failure`.
- **Partial hold (A18; units per SQ-1851 R5):**
  - A `hold` event carries `affected_units`, a validated subset of the fulfilment's `units`.
  - A hold is open until a `release_hold` event names it in `releases_event_id`. A unit is held while any open hold lists it.
  - `public.assert_fabrication_instruction_authority` receives the instruction's unit set, refuses it if any unit is held (`fabrication_hold_open`), and returns the validated set, which the instruction event stores. It reads this record under the fulfilment lock; C5 owns the hold, and C3 owns the check.
  - Unaffected units can still be instructed, by an instruction that names only them.
  - `release_hold` requires the decision or approval evidence the hold names. C4 and C3 supply those authorities.

### 3.6 RLS, grants and activation

- **RLS:** tables have RLS enabled. `REVOKE ALL FROM PUBLIC, anon, authenticated`. Reads go only through definer RPCs gated by `is_studio_comember` plus the tenant leg.
- **Grants:** mutation RPCs and internal helpers ship with `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated` (deny-by-default). Revoking `authenticated` alone leaves the stack's default `anon` grant in place (`00654:209-214`; SQ-1817 F20). A reviewed activation migration grants the mutations to `authenticated` only. Each mutation also refuses while `scope_editions` is inactive (C2 §2.8, F8).
- **Deactivation:**
  - Revoke the mutation grants.
  - Read RPCs and the CHECK and guard branches stay in force, so existing external lines can never become orderable or priced while the capability is off.

### 3.7 Old-reader compatibility

| Consumer | Behaviour |
|---|---|
| Designer portal | Existing FF&E sheets show external lines as ordinary unpriced lines until the round-8 UI adds the responsibility label. That is truthful, because nothing is billed. Must not: offer "order" (the server refuses it) |
| Client portal / editions | Presence-aware readers must include the parity filter before activation. Otherwise an external line may show as a zero-price studio item. Gate: client-edition reader tests over a mixed fixture |
| iOS Patina | No FF&E pricing reader was inspected for this contract. It must be confirmed at implementation, or the issue named as a blocker |
| Field (Capture) | Received and installed facts come through site requests and evidence. Field cannot verify unless C3 grants it |

### 3.8 Backfill rule

- No existing line is converted to external, and no fulfilment is inferred from labels, categories, notes or vendor names.
- Existing lines keep their current money behaviour.
- A studio converts a line deliberately through the RPC, and only from the permitted states.

### 3.9 Required tests

- **GC-without-PO (A17):** create a fulfilment, issue, instruct (once C3 lands), receive and install. The following are unchanged throughout:
  - studio budget;
  - authorization schedule;
  - payables;
  - invoices.
- **Conversion denial (F16)** after a PO, a studio purchase, an invoice line or executed authorization provenance, **and** while the line is on a `draft` or `sent` furnishings authorization (forward `source_ffe_item_id` link, no reverse stamp yet). Race: conversion against authorization draft creation on the same line, in both orders; the second committer refuses. An authorization draft naming an already-external line is refused.
- **Responsibility combination (F17):** buyer = client with payer = studio is refused (`external_rail_studio_liability`), as are fabrication contract = studio and payer = none. Buyer = client, payer = client, fabrication contract = none is accepted. An amendment that changes the payer to studio on a contracted fulfilment is refused at send and countersign (C2 §2.5a, SQ-1851 R9); a fixture that forces a studio-liable active edition sees every later mutation refused.
- **Fabrication route (F20):** `record_external_fulfilment_event(…, 'fabrication_instruction', …)` returns the same refusal codes as `record_fabrication_instruction` for every C3 §3.2 case (binding, closed seat, unknown or negative amount, insufficient authority, unapproved evidence, open hold). A caller-supplied `evidence_level` or `amountCents` changes nothing. A fulfilment whose package key has no C1 package is refused. A grep shows that every writer of a `fabrication_instruction` event calls `public.assert_fabrication_instruction_authority`. `has_function_privilege` is false for `PUBLIC`, `anon` and `authenticated` on every mutation, and on `_fabrication_instructed_amount_cents` and `_external_rail_refusal` always.
- **Priced external line refused** by CHECK.
- **Closure:** the presence line blocks `close_project` until a verified install. Once it is installed, the paid gate ignores it.
- **Partial hold (SQ-1851 R5):** fulfilment units `{k-1, k-2}`, hold on `{k-2}`. Instructing `{k-1}` succeeds and the event stores `{k-1}`; `{k-2}` and `{k-1, k-2}` are refused; after `release_hold` naming the hold, `{k-2}` succeeds. A hold or instruction naming an undeclared unit is refused. Both fabrication routes give identical answers.
- **Locked source state (SQ-1851 R3):** the C3 §3.2 race tests (contract verification and hold against instruction, both orders, no `40P01`).
- **Evidence level (SQ-1851 R14):** a reported `installed` event becomes `verified` through `verify_external_fulfilment_event`, and only then does the line become `installed`. A second verification, a `verified → reported` update, or changing any other column is refused. Verifying a `fabrication_instruction` event is refused.
- **Responsibilities in one helper (SQ-1851 R4):** each refusal code of the external-only table comes from `_external_rail_refusal`, through both C5 mutations and the C3 gate.
- **Studio install on client goods (SQ-1851 R8):** see C6 §2.11.
- **Actor retention (SQ-1851 R18):** deleting a profile that recorded or verified an event fails on the FK.
- **Actor matrix:** member, owner/admin verifier, GC party (no access), client (curated read only) and a second studio.
- **Reader parity:** every audited presence reader returns the same answer for a trade presence line and an external presence line.

## 4. Open items

- **Fabrication authority scope.** This is C3 and WP-08: the scope check at `00624:860-864`, and the shared gate `public.assert_fabrication_instruction_authority` (C3 §3.2) that every `fabrication_instruction` writer calls. A grant ends through C3's `revoke_fabrication_authority(p_authority_id, p_reason)`, which replaces `end_fabrication_authority`. Adjudicated by SQ-1817: the legacy submittal resolver stays unchanged for current callers, and fabrication holds live on the C5/C3 records, separate from the resolver's hold column. Until the gate lands, no `fabrication_instruction` event can exist.
- **Who verifies external receipt and install** (the studio owner/admin only, or also a C3 field verifier). Recommended: the studio owner/admin, or a C3 verifier with evidence. This is an ordinary engineering default, not a Kody ruling.
