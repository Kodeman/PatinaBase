# C5 — External fabrication and fulfilment

Status: proposed contract (WP-00.5b, SQ-1813). Owner: **build domain** (WP-08), the single C5 owner. Commerce (WP-06) consumes it for client-bought furnishings. Decision: P05. Acceptance: A12, A16, A17, A18, A21 (external work visible, non-blocking), X02, X03, X09. Fixtures: F03, F05, F08.
Source inspected at `0fabcadf2`. Names without a file:line are **proposed**.

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
| `scope_edition_id`, `package_key` | The C2 join. Inclusion and responsibility come from the agreed edition and are never typed here |
| `kind` | `gc_cabinetry`, `client_furnishing` or `other_external` |
| `buyer_party_kind`, `payer_party_kind`, `contracting_party_kind` | Copied from the edition's package responsibilities when the row is created. A mismatch with the edition is refused |
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
  - `affected_units` (jsonb, for a partial hold);
  - `recorded_by`, `recorded_at`, `verified_by`, `verified_at`;
  - `client_request_id`.
- `UNIQUE (fulfilment_id, client_request_id)`.
- An UPDATE trigger allows only setting `verified_by` and `verified_at` once. Everything else is immutable, following `00835:20-30`.

**Who may record each fact:**

| Fact | May record | Notes |
|---|---|---|
| Quote, contract, receipt, install | A studio member, as `reported` | `verified` requires a different studio owner or admin, or C3's `field verifier` role with attached evidence |
| `package_issued` | Only the existing plan-issue owner path | It must reference an immutable issue (C1). This preserves A09 and A18 exact-issue invariance |
| `fabrication_instruction` | Holders of C3's `fabrication` authority scope only | Today the scope check allows `money`, `change_order`, `selections`, `schedule`, `site_access`, `key` and `draw_certify` (`supabase/migrations/00624_project_party_window_and_authority.sql:860-864`). Fabrication is absent, and `selections` must not be read as sufficient. Until C3 lands the scope, this event is refused |

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
- The conversion is refused once the line has any of:
  - a `purchase_order_id`;
  - a live `studio_purchases` row;
  - an `invoice_line_items.ffe_item_id` reference on a non-void invoice;
  - furnishings-authorization provenance (`source_commercial_document_id`).
- These are exactly the states in which studio money has already attached.
- The reverse conversion is allowed only before any `contract_reported` event. It re-enters pricing through the existing pricing writer (`app.ffe_pricing_writer`, `00809:877`).

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
| Studio payables | POs and `studio_purchases` (payment method / reimburse, `00703:75-77`) | Studio pays | None | No PO or purchase row |
| Procurement readiness | `get_project_ffe_readiness` `supabase/migrations/00834_purchasing_authorization_image_readiness.sql:11`, which keys on `design_disposition` (`:60`) | Readiness for ordering | Returns `responsibility: external`, with no ordering checklist | New field. Old callers ignore it |
| Receiving | `validate_receipt_linkage` `00862:131-143` (PO or qualifying studio purchase) | Studio receiving inspection | External receipt is a `received` fulfilment event, not a `receiving_inspections` row | Separate record |
| Custom milestones | `00403:3316-3325` | PO-gated | Not used. External package progress comes from fulfilment events | Separate record |
| Installed check (closure) | `00399:7473-7481`; `closure-derivation.ts:205-214` | Must be `installed` | Must be `installed`, set only from a verified external install | Status writer restricted |
| Paid check (closure) | `00399:7484-7518`; `closure-derivation.ts:216-235` | Positive value must be paid | Zero value, so not counted | Unpriced by CHECK |
| Studio service completion | C6 derivation | n/a | Visible and **non-blocking** when the package is `excluded` or externally fulfilled | Edition package inclusion |
| Client edition / client page | The 26 migrations that already special-case `trade_scope_document_id` (listed below) | Presence-aware | Each must add `external_fulfilment_id` parity. Each is audited, not assumed | Grep audit is part of the slice gate |

**Readers to audit for presence-line parity.** These are the migrations referencing `trade_scope_document_id`. The latest definition of each function they touch must be rechecked:
00423, 00435, 00475, 00510, 00565, 00578, 00580, 00661, 00703, 00731, 00732, 00733, 00737, 00744, 00745, 00755, 00757, 00758, 00807, 00808, 00809, 00835, 00840, 00842, 00845, 00852.

### 3.4 RPCs

**`create_external_fulfilment(p_project_id, p_scope_edition_id, p_package_key, p_kind, p_party_engagement_id, p_configuration_id, p_client_request_id) → jsonb`**
- Response:
  ```
  {"fulfilmentId", "status", "replayed"}
  ```
- It is refused when:
  - the package is not in the **active** edition;
  - the edition's `purchasing` responsibility for the package is `studio`;
  - the caller fails the studio predicate.

**`record_external_fulfilment_event(p_fulfilment_id, p_event_kind, p_evidence jsonb, p_affected_units jsonb, p_client_request_id) → jsonb`**
- Response:
  ```
  {"eventId", "status", "evidenceLevel", "replayed"}
  ```

**`verify_external_fulfilment_event(p_event_id, p_client_request_id)`**

**`set_ffe_item_external_fulfilment(...)`** (§3.2).

**Read RPC:** `get_project_external_fulfilments(p_project_id)` returns a studio projection. The client sees only a curated `client_visible` subset through the client bundle (C7). Bids and contract amounts are studio-only unless `price_visibility` says otherwise.

### 3.5 Lock order, idempotency and concurrency

- Lock order:
  1. `projects` (FOR UPDATE, for creation and conversion), which keeps closure's "parent first" rule (`00399:7339-7346`);
  2. `project_external_fulfilments`;
  3. `project_ffe_items` (FOR UPDATE, on conversion);
  4. events.
- The job label lock (`_ffe_lock_job_labels`, `00808:1376-1379`) comes before the FF&E row lock whenever an FF&E line is touched, matching placement.
- Every mutation takes `p_client_request_id`. A replay returns the first effect. A different payload under the same key raises `serialization_failure`.
- **Partial hold (A18):**
  - A `hold` event carries `affected_units`.
  - `fabrication_instruction` for an affected unit is refused while the hold is open.
  - Unaffected units can still be instructed.
  - `release_hold` requires the decision or approval evidence the hold names. C4 and C3 supply those authorities.

### 3.6 RLS, grants and activation

- **RLS:** tables have RLS enabled. `REVOKE ALL FROM PUBLIC, anon, authenticated`. Reads go only through definer RPCs gated by `is_studio_comember` plus the tenant leg.
- **Grants:** mutation RPCs ship with `EXECUTE` revoked from `authenticated` (deny-by-default). A reviewed activation migration grants them.
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
- **Conversion denial** after a PO, a studio purchase, an invoice line or authorization provenance.
- **Priced external line refused** by CHECK.
- **Closure:** the presence line blocks `close_project` until a verified install. Once it is installed, the paid gate ignores it.
- **Partial hold:** affected units are refused, and unaffected units proceed.
- **Actor matrix:** member, owner/admin verifier, GC party (no access), client (curated read only) and a second studio.
- **Reader parity:** every audited presence reader returns the same answer for a trade presence line and an external presence line.

## 4. Open items

- **Fabrication authority scope.** This is C3 and WP-08: the scope check at `00624:860-864`, and its relationship to the submittal resolver that already approves, clears holds and unblocks tasks (DOMAIN-CONTRACTS correction 6). Until it lands, `fabrication_instruction` is refused.
- **Who verifies external receipt and install** (the studio owner/admin only, or also a C3 field verifier). Recommended: the studio owner/admin, or a C3 verifier with evidence. This is an ordinary engineering default, not a Kody ruling.
