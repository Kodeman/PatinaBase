# Workflow Privacy and Authority Audit

**Audit base:** `e7fd3244`, 2026-08-10  
**Scope:** Working boards, board media and shares, project FF&E, product configurations, and furnishing authorization snapshots.  
**Disposition:** Findings 1–7 block project-native workflow release.

## Findings

| ID | Severity | Finding | Evidence owner | Required correction |
|---|---|---|---|---|
| P01 | Critical | Signed `project_boards` rows remain mutable by the exact client, active project-team members, same-studio members, and `service_role`. | Policies originating in `00179_proposal_boards.sql` and `00316_studio_shared_workspace_rls.sql`; no unconditional immutable trigger. | Make participant access SELECT-only, revoke authenticated DML, add an immutable trigger, and permit canonical INSERT only inside the activation/release transaction. |
| P02 | Critical | Released board media uses a public bucket and stable mutable aliases, so a shared URL can change after release. | `00406_mood_board_storage_and_shares.sql`; the board cover uploader overwrites a stable object path. | Make working media private; copy releases to an immutable versioned prefix with a digest; use row-authorized signed URLs; reject overwrite/delete on released objects. |
| P03 | Critical | `service_role` can directly INSERT furnishing authorization lines or commercial signatures outside their canonical RPCs. | UPDATE/DELETE guards in `00412_design_services_commercial_authority.sql` do not guard INSERT. | Add transaction-capability INSERT guards; reject new authorization lines after draft; require signing/release RPC context. |
| P04 | High | A board-share token points to a live working board and rereads current items on each view. | `create_board_share` and `resolve_board_share` in `00406_mood_board_storage_and_shares.sql`. | Mint an immutable review edition and asset manifest; point the token to the edition and use a server allowlist. |
| P05 | High | The primary client can read unpublished project-owned boards and items directly through surviving raw-table policies. | Client policies from `00272_project_owned_boards.sql`. | Drop raw client policies; expose only released review editions. |
| P06 | High | Raw proposal-board policies bypass the curated proposal bundle's board, field, and archive redaction. | Raw policies in `00179_proposal_boards.sql`; curated bundle in `00407_project_board_sections_and_lineage.sql`. | Drop raw client board/item policies and retain the immutable client bundle as the only read path. |
| P07 | High | Legacy project clients can read raw working FF&E, including internal notes, vendor/PO linkage, trade cost, and markup. | Legacy client policy retained in `00412_design_services_commercial_authority.sql`. | Remove raw client access universally; supply an explicitly released, client-safe legacy projection. |
| P08 | Medium | Clients can enumerate draft commercial-document metadata via a raw table policy. | Client policy in `00412_design_services_commercial_authority.sql`; draft addenda in `00422_authorized_schedule_phase1.sql`. | Remove raw client access or require an issued document; prefer the existing curated RPC path. |
| P09 | Medium | Board placements cannot prove lineage to the project selection later reviewed or authorized. | `proposal_board_items` identifies a product plus free-form data, not the project selection/configuration snapshot. | Link placements and edition lines to one project selection and freeze configuration hash, quantity, price, and room in the edition. |
| P10 | Medium | Approved product-configuration child rows remain mutable through `service_role` even while the parent snapshot is locked. | Child grants in `00403_product_configuration_foundation.sql`. | Guard child DML by the parent lifecycle/canonical RPC context or rebuild children from the verified parent snapshot. |

## Required direct-access matrix

Fixtures must include Studio A owner and co-member, Studio B designer, unrelated authenticated user, primary project client, linked household member who is not `projects.client_id`, opted-in project party, active project-team member, and `service_role`.

| Test | Operation | Required result |
|---|---|---|
| T01 | Unrelated user or Studio B reads working rows | Zero rows. |
| T02 | Unauthenticated user fetches a working-media URL | `403`/`404`; only an expiring authorized URL may succeed. |
| T03 | Primary client selects project-owned raw boards/items | Zero rows. |
| T04 | Primary client selects sent proposal raw boards/items | Zero raw rows; curated bundle remains available. |
| T05 | Primary client inserts, updates, or deletes `project_boards` | RLS or immutable-trigger rejection. |
| T06 | Active project-team member mutates `project_boards` | Rejected; any read must be separately authorized. |
| T07 | Non-lead household member reads protected working rows | Zero rows. |
| T08 | Opted-in project party reads board, FF&E, configuration, or authorization working rows | Zero rows unless an edition grants a separate explicit read. |
| T09 | Share draft board, edit working board, resolve token again | Edition payload remains byte-identical. |
| T10 | Legacy primary client reads raw `project_ffe_items` | Zero rows; released client-safe projection only. |
| T11 | Commercial-project client reads raw project FF&E | Zero rows. |
| T12 | Client reads draft `project_commercial_documents` | Zero rows. |
| T13 | `service_role` updates a frozen project board | Immutable-trigger rejection. |
| T14 | `service_role` overwrites/deletes a released asset | Immutable-prefix rejection. |
| T15 | `service_role` inserts authorization line/signature outside canonical RPC | Transaction-capability rejection. |
| T16 | Client or Studio B reads product configuration and children | Zero rows. |
| T17 | Authorized Studio A co-member reads project configuration | Rows returned. |
| T18 | `service_role` rewrites approved configuration parent snapshot | Rejected. |
| T19 | `service_role` mutates approved configuration child | Rejected. |
| T20 | Client-selection RPC runs before execution | Empty or denied. |
| T21 | Client-selection RPC runs after execution | Client-safe signed values only; no trade or PO fields. |
| T22 | Authenticated user or `service_role` directly mutates sent proposal boards/items | Existing immutability rejection remains intact. |

Portal-only tests are insufficient. The matrix must exercise direct PostgREST/table, Storage, authenticated JWT, and `service_role` paths.

## Safe cutover order

1. Create the immutable review-edition owner and immutable asset manifest/copy path.
2. Retarget board shares and client project-board reads to editions.
3. In the same cutover, remove raw client board/item, legacy FF&E, and draft commercial-document policies and make working media private.
4. Add immutable/canonical-insert guards for project boards, released media, authorization lines, and signatures.
5. Add project-selection/configuration-hash lineage to placements and editions.
6. Add lifecycle guards to configuration child tables.
7. Run T01–T22 before enabling project-native review.

## Existing controls to preserve

- Sent proposal-authored rows already reject content mutation.
- Product configurations are hidden from clients, project parties, and different studios through `_can_access_product_configuration` and SELECT-only authenticated grants.
- Approved configuration parents and locked FF&E configuration snapshots reject rewrites.
- Commercial snapshot UPDATE/DELETE and commercial-ledger writes are guarded.
- The client-selection RPC reads executed immutable authorization lines and omits trade and PO fields.
- The client proposal page uses the curated database bundle rather than assembling raw tables in the browser.
