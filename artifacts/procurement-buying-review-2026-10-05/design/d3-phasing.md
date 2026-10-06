# D3 — Phasing and feasibility: from today's code to a studio that can buy anything

**Role:** staff engineer, phasing and feasibility. **Date:** 2026-10-05. **Repo:** main @ `4207b8e2d`, main checkout only.
**Evidence:** code only, no portal walk. I read the five research memos (r1–r5) and both briefing files, then spot-checked every claim this memo builds on.
**Confidence:** **[H]** I read the code line this pass. **[M]** I read nearby code, or relied on a research memo I partly re-checked. **[L]** Inferred, or memo-only.
**Open rulings, not resolved here:** V1 (margin pocket) and pricing-mechanics R1–R11. Where a proposal touches one, it is tagged **ruling needed**. I also raise three new buying rulings (B1–B3, §7). None of them is answered in code.

Paths are repo-relative. `DP/` = `apps/designer-portal/src/`. `M/` = `supabase/migrations/`. `F/` = `supabase/functions/`.

---

## 0. The short version

1. **Next free migration number: `00690`.** The highest on main is `00689_board_cover_inner_guard_content_match.sql`. `M/_pending/` holds only an unrelated `00106_drop_client_messages.sql`. Parallel sessions mint numbers too, so reserve numbers when work is dispatched (patina-parallel-work).
2. **Three of the seams are worse than the briefs say.** I found them in this spot-check:
   - **The web ETA edit is probably broken.** The line unfold's ETA cell and the Ledger's "Align ETA" both write `purchase_orders` directly. Since 00447 that table is RPC-only (`M/00447:15` revokes the writes, and the trigger at `:17-36` raises). See §2.1.
   - **A first hire can create a PO but cannot send it.** `create_purchase_order` stamps the project owner as `designer_id` (`M/00449:131-136`). `po-send` then returns 404 to anyone else (`F/po-send/index.ts:236`). See §2.2.
   - **The PO PDF prints SKU, finish and dimensions from an empty row.** `po-send` reads them only from `project_ffe_specs` (`F/po-send/index.ts:250-262`). Placement inserts that row empty (r2 §2). Unlike the Spec Book, `po-send` never falls back to the product. See §2.3.
3. **"Order before approval" is structural, not a stray constant.** Nothing in the database ever moves a residential line to `quoted` or `approved`:
   - Activation inserts lines as `specified` (`M/00331:665,703`).
   - Only the commercial authorization RPCs write `approved` (`M/00578:3896-3902,4645-4647`).
   - So the line unfold has to allow `specified` or residential jobs could never order anything. And the Vendors page's "Order all" (`status === 'approved'`) can never fire on a residential job.
4. **Phase 0 is eleven seams.** All eleven are verified in code below. Together they take about three to four weeks of work across 4 small migrations, 2 edge-function changes and portal edits. None needs a flag, because each is a bug fix (the deck-import Wave 1 precedent). Two ruling questions ride along: B1 (does a residential order require client approval?) and R-DI4 (retail-as-trade).
5. **Phase 1 (updates)** uses tables, hooks and RPCs that already exist but have no UI, or are one column short:
   - recording vendor payments
   - status and install controls
   - attaching a vendor to an off-catalog line
   - turning on schedule import
   - receiving photos on the web
   - an ack chase
   - studio-scoped vendor terms
   - change orders
6. **Phase 2 (overhauls)** needs new models: one buying spine with lanes (PO, card, one-off, work order), quote and ack reconciliation and CFA, workroom/COM chains, receivers and freight as costs, and exceptions and substitutions. These are where V1/R1/R5/R8 bite hardest. Several must wait for rulings.

---

## 1. Ground rules every change here inherits

These are code facts. Each one changes the size and risk of a proposal.

| Rule | Evidence | What it means for every proposal |
|---|---|---|
| `project_ffe_items` accepts no direct writes from `authenticated` | `M/00435:958-960` trigger `a_ffe_rpc_mutation_only_trg`; `M/00438:371-380` guard body raises unless the caller is postgres/service_role; `M/00438:442` revokes all writes **[H]** | Any new line field a designer edits (vendor, trade cost, lead time, installed, ship-to, purchaser) needs a `SECURITY DEFINER` RPC. The RPC calls `_ffe_require_studio_project` and `set_config('app.ffe_mutation_rpc','on',true)`, then REVOKEs from PUBLIC/anon and GRANTs to authenticated. Column grants won't work. |
| `purchase_orders` is RPC-only too | `M/00447:15` (REVOKE), `:17-36` (`guard_purchase_order_rpc_mutation`); 00510's audit comment `authenticated=rDxtm` (no `w`) at `M/00510:185` **[H]** | Same rule for PO header fields (ship-to, ETA, carrier, tracking, freight). |
| `project_ffe_specs` spec columns **are** directly writable | `M/00435:984-985` column GRANT (sku, finish, material, color_fabric, dims, notes…) **[H]** (r2 §1.6) | Spec carry-through can use the existing Spec Book hook `useUpdateProjectFfeSpec`. It needs no new RPC. |
| `po_payments` is directly writable by co-members | `M/00584:244-259` policy `po_payments_studio_rw FOR ALL` **[H]** | `useLogPaymentPaid` works today without a migration. But a money table writable from the browser, with no audit trail and no guard on Stripe-rail rows, is weak. Phase 1 should move it behind an RPC (§4.5). |
| `vendors` is global; UPDATE is admin-only | `M/00058:22-43`; `M/00555:2029` grants authenticated SELECT; `packages/supabase/src/lib/vendors.ts:128-131` client insert **[H]** | `useUpdateVendorPaymentTerms` (`use-procurement.ts:449-462`) writes `vendors` and would fail RLS for a designer. Studio-specific terms need a studio-scoped table (§4.13). |
| Redefinitions follow the rename-to-`_impl` pattern | e.g. `M/00450:5-13` renames `create_purchase_order` → `_create_purchase_order_00449_impl`, then re-wraps **[H]** | Changing a signature (e.g. adding `p_ship_to`) costs a full wrapper migration and a type regeneration. Where possible, add a sibling RPC instead. |
| Two role systems disagree | r5 §3 **[H, r5's read]**: PO create/send = any non-guest co-member; Financial lens = only the `studio_owner` role, which no path can grant to a second person | Any proposal that shows trade cost or margin to a buyer runs into **R1**. This memo keeps every new money display at "trade cost the vendor charges", which is what the PO already prints (`step-review.tsx:45-46`). It never shows margin. |
| Deploy chain | AGENTS.md "Deploying" | Migration → `supabase db push` (`--include-all` per memory). `po-send` edit → `supabase functions deploy po-send`. A `_shared/*` edit means redeploying every importer. Media service → container deploy. Portal → `./infra/deploy-portal.sh designer-portal`. Regenerate `database.types.ts` after each migration. |
| Flags fail closed and are verified before enabling | memory: feature-flags reference, "verify PostHog flags before enabling" | Phase 1/2 features get one flag per surface. Phase 0 bug fixes get no flag. |

---

## 2. New findings from the spot-check

These change the phasing, so they come first.

### 2.1 The ETA edit writes to a table the browser can't write [H code, runtime unverified]
- `useUpdatePurchaseOrderETA` runs `.from('purchase_orders').update({ confirmed_eta, notes })` (`packages/supabase/src/hooks/use-procurement.ts:663-708`).
- Its callers:
  - the line unfold's Movement cell (`DP/components/document/line-unfold.tsx:85`)
  - the Ledger's "Align ETA" (`DP/components/document/orders-ledger.tsx:139,262-283`)
- Since 00447, `authenticated` has no UPDATE on `purchase_orders`, and the guard trigger raises for any non-RPC write (`M/00447:15,17-36`). No later migration grants it back: I grepped every `purchase_orders` grant after 00447 and found only the 00510 audit comment and an anon revoke.
- **Expected behavior:** a 42501 error, shown inline as "couldn't save". r1 describes the cell as working **[S]**. Memory warns that "mock fallback masks broken API". **Step 0 of Phase 0 is a 5-minute local probe** to confirm this before anyone builds on the ETA cell.
- **Fix:** a `set_purchase_order_eta(p_po_id, p_eta, p_note)` RPC. It must not stamp `acknowledged_at`, so R16's "a batch ETA is not a vendor act" holds. `log_po_acknowledgment` already writes `confirmed_eta` safely, with a co-member check (`M/00451:6,13`), and is the template.

### 2.2 A co-member can't send the PO they made [H]
- `create_purchase_order` swaps the JWT `sub` to the project owner before inserting (`M/00449:121-136`), so `purchase_orders.designer_id` is always the project owner.
- `po-send` rejects anyone else: `if (!po || po.designer_id !== caller.id) return 404` (`F/po-send/index.ts:236`). `quote-request-send` has the same check (`F/quote-request-send/index.ts:131`).
- This is exactly "the studio adds its first hands" (VISION.md:29). The hire can build the PO, then gets "not found" on Send.
- **Fix:** replace the equality check with an `is_studio_comember` check, run through a user-scoped client or a small `can_send_purchase_order(p_po_id)` SQL helper. This is a security-relevant change, so it gets a separate-context review.

### 2.3 The PO prints buy specs from the always-empty spec row [H]
- `po-send` selects `spec:project_ffe_specs(... sku, material, finish, color_fabric, selected_dimensions)` and nothing from `products` (`F/po-send/index.ts:250-262`).
- Placement inserts the spec row with only `(ffe_item_id, routing_source)` (`M/00380:565-570`, per r2 §2 **[H, r2]**).
- The Spec Book shows values through a project → line → product-master fallback (`DP/lib/spec-books/model.ts:203-253`, r2 **[H, r2]**). `po-send` has no fallback.
- **Result:** a library product with a SKU on its `products` row goes to the vendor with a blank SKU, unless someone opened the Spec Book and typed it in. That is failure moment #1 in r3 §6 (wrong finish built), delivered by our own PDF.
- **Fix, P0:** apply the same fallback in `po-send`, joining `product:products(sku, finish, materials, colors, dimensions)`. **P1:** snapshot the resolved values onto the line or PO at creation (§4.4).

### 2.4 Retail is written as trade when a product has no trade price [H]
- `place_product_in_project_v2`'s inner body still sets `trade_price_cents = COALESCE(product.price_trade, product.price_retail, 0)` (`M/00435:203,234`). The 00439/00442/00445/00447 wrappers don't touch price (checked).
- Quick-create drafts null the trade price on purpose (`DP/components/portal/proposals/product-picker-modal.tsx:710`, r2). Extension clips carry no trade price at all (r2 §1.3).
- **Result:** most off-catalog product lines land with trade = retail, and the PO's server-computed **trade** total (`M/00186:8-9,51-55`) is the retail price.
- The proposal-board path was fixed to "trade stays 0" (`DP/lib/scope/board-schedule.ts:42-45,88-110`). The project path was not.
- **Ruling needed (R-DI4, assumed default "trade stays empty until confirmed", r5 §4).** P0 does not change the COALESCE on its own. P0 ships the trade-cost entry RPC (§3, S5). The Order Assistant then warns when trade equals retail on a non-catalog line. Kody confirms R-DI4 before the COALESCE flips to NULL.

### 2.5 "Order all" never fires on a residential job [M-H]
- `isOrderable` requires `status === 'approved'` (`DP/components/document/orders-book-vendors.tsx:80-84`).
- `approved` is written only by the commercial authorization executors (`M/00578:3896-3902,4645-4647`).
- Activation writes `specified` (`M/00331:665,703`).
- No post-00435 RPC writes `quoted` or `approved` to `project_ffe_items`. I grepped every `UPDATE public.project_ffe_items` with a status write.
- [M-H] because I grepped rather than tracing every dynamic status expression.

### 2.6 The UI's "orderable" and the DB's "orderable" are three different tests [H]
| Where | Test |
|---|---|
| Line unfold, residential | `status ∈ {specified, quoted, approved} && !blocked` (`DP/components/document/line-unfold.tsx:75,355-358`; same set in `DP/lib/document/authorization-derivation.ts:147,370-377`) |
| Line unfold, commercial | `poGate`: authorized + deposit clear (`authorization-derivation.ts:379-395`) |
| Vendors "Order all" | `status === 'approved' && vendor_id && !purchase_order_id` (`orders-book-vendors.tsx:80-84`) |
| **The database** | `design_disposition = 'selected'`, `vendor_id` matches, not removed (`M/00449:125-133`), plus client price > 0 (`M/00445:60`) |

The UI never checks disposition or price, so it can offer "Order" on a line the RPC will refuse. Whether the unfold ever renders for candidate lines is [M], not traced.

---

## 3. Phase 0: broken seams to fix first

Each seam is verified in code. "No flag" means it ships as a bug fix. The migration numbers are provisional, so reserve them when work is dispatched.

| # | Seam | Verified at | Fix | Reuse | Migration | Size | Risk |
|---|---|---|---|---|---|---|---|
| **S0** | Probe first: confirm §2.1 (ETA) and §2.2 (co-member send) on the local stack, signed in as a non-owner member | — | Read-only local probe | patina-local-dev; seeded two-member studio | — | XS | none |
| **S1** | **ETA edit and Align ETA write an RPC-only table** | `use-procurement.ts:663-708`; `M/00447:15,17-36` | New RPC `set_purchase_order_eta(p_po_id uuid, p_eta date, p_note text)`. Point `useUpdatePurchaseOrderETA` at it, with the same signature, so callers don't change | `log_po_acknowledgment` body (`M/00451`) as template; `trg_po_status_cascade_to_items` untouched | **00690** `purchase_order_header_rpcs.sql` (with S2, S3) | S | Low. One additive RPC. Probe ack/ETA semantics so R16 holds |
| **S2** | **Ship-to hardcoded in the UI; PDF defaults to the client's house** | `DP/components/portal/procurement/order-assistant/step-review.tsx:30-31,44`; `F/po-send/index.ts:380-384` | Same migration: `set_purchase_order_ship_to(p_po_id, p_ship_to text)`, refused once `sent_at` is set (a revision is §4.12's job). Order Assistant Details gets a Ship-to field defaulted from `organizations.address` (exists, `M/00021:112`), with the project site address as an explicit choice. Remove `SHIP_TO_PLACEHOLDER`. `po-send` stops silently defaulting to `site_address` and refuses `send` with no ship-to (preview still renders, marked "ship-to not set") | `purchase_orders.ship_to` (`M/00188:37`); `organizations.address` JSONB | 00690 | M | Medium. Changing `po-send`'s default changes the vendor-facing paper. Reviewer must check old POs still re-send |
| **S3** | **Nothing advances a PO to production or shipped** | `useUpdatePurchaseOrderStatus` direct update (`use-procurement.ts:770-781`) on an RPC-only table, zero callers (r1) | Same migration: `advance_purchase_order_status(p_po_id, p_to text, p_note text)`, allowing only `confirmed→in_production→shipped` (delivered stays receipt-driven). Movement cell gets two quiet acts: "In production" and "Shipped". The existing cascade moves the items (`M/00184:57-61,175-248`), and `flip_pending_balance_to_due` (`M/00184:80`) finally fires on ship | 00184 cascade, ratchet, balance flip; the hook is rewired, not rewritten | 00690 | S–M | Low-medium. The balance-flip side effect starts firing for real, which is correct but new. Notices go to The Post |
| **S4** | **No web control (and no RPC) sets `installed`** | No writer: grep across migrations, portal and hooks finds `'installed'` only in guards (`M/00435:860`, `M/00439:347,426`) and tests. The close-out blocker counts every non-installed line (`DP/lib/document/closure-derivation.ts:191-199`) | `record_project_ffe_installed(p_item_ids uuid[], p_installed_on date)`. Only from `delivered`. Ratchet-safe (rank 7, `M/00184:42-46`). A "Mark installed" act in the line unfold, plus a multi-select on the FF&E section | `ffe_status_rank`; the close-out derivation already reads it | **00691** `ffe_mark_installed.sql` | S | Low. Note r1/brief's `StageSelect`/`ffe-schedule-builder.tsx:507` is the **proposal** builder (`DP/components/portal/scope-builder/`), not the project line, so it doesn't matter here |
| **S5** | **No designer RPC for vendor or trade cost on a project line**; hooks throw "RPC-only" | `packages/supabase/src/hooks/use-project-v2.ts:287-298,329-336` (r2 **[H]**). The only post-placement pricing writers are approval/activation/repricing (`M/00464:1811-1817`, `M/00456:114`, `M/00666:804`). The bulk markup at `ffe-schedule-builder.tsx:963` writes **proposal** items (`useUpdateProposalItem`, `:903-990`) | `set_project_ffe_line_commercials(p_item_id, p_request jsonb)` takes **`vendorId`** and **`tradePriceCents`** only, on lines with `purchase_order_id IS NULL`. It records `markup_percent` with the derivation 00456 uses. **Client price and markup editing stay out (R8, R5, R1: ruling needed).** Rewire the two throwing hooks to this RPC for the vendor and trade halves | 00456 markup derivation; `vendors` lookup; the People "maker" add sheet for creating a vendor | **00692** `ffe_line_commercials.sql` | M | Medium. Pricing-adjacent. Separate-context review on "does this change anything a client sees" (answer must be no: `unit_price_cents` untouched) |
| **S6** | **The PO PDF prints SKU, finish and dims from the empty spec row** | `F/po-send/index.ts:250-262`; `M/00380:565-570` | `po-send` resolves each field as spec → product, mirroring `resolveSpecValue`. Optionally lift the resolver into `F/_shared/` (which means redeploying every importer) | `DP/lib/spec-books/model.ts:203-253` logic | — | S | Low. The vendor PDF gains facts it should always have had. Reviewer checks that the configuration snapshot still wins |
| **S7** | **A co-member gets 404 sending a PO** (and an RFQ) | `F/po-send/index.ts:236`; `F/quote-request-send/index.ts:131`; `M/00449:131-136` | Co-member check instead of owner equality | `is_studio_comember` (00556) | — (or a tiny helper RPC in 00690) | S | Medium (auth). Separate-context security review. The 404-not-403 idiom stays |
| **S8** | **The Orders book drops project context** | `DP/components/document/orders-ledger.tsx:158` (`projectLens` starts `null` even though `initialContext.projectId` is passed, `:118-121,325-326`); Week and Receiving ignore it (r1 **[V]**) | Seed `projectLens` from `initialContext.projectId`. Pass it to Week and Receiving as a lens with an "all projects" link | Existing lens UI (`:365-376`) | — | S | Low |
| **S9** | **Two PO send UIs; one is orphaned; the personal message is a TODO** | `<PoSendActions>` at `DP/components/portal/procurement/order-assistant/index.tsx:1057`; `<PoPreview>` at `line-unfold.tsx:599`, `orders-ledger.tsx:644`; `PoSendPopover` used only inside its own file (`po-send-actions.tsx:326`); `TODO(W4 follow-up)` at `po-send-actions.tsx:26` | Mount `PoPreview` on the Assistant's Created step and delete `PoSendActions`/`PoSendPopover`. Add the personal-message field to `PoPreview` (the hook already accepts it, per the TODO's own comment) | `PoPreview`; `useSendPurchaseOrder` | — | S | Low |
| **S10** | **Ack logging isn't on the line** | `LogAckInline` is mounted only at `po-preview.tsx:329` and `orders-ledger.tsx:627` | Mount `LogAckInline` in the line unfold's Purchase-order cell when the PO is sent and not acked | `LogAckInline`; `log_po_acknowledgment` (co-member-safe, `M/00451:13`) | — | XS | Low |
| **S11** | **Three "orderable" tests (§2.5, §2.6)** | see §2.6 | One shared predicate in `authorization-derivation.ts` (`poGate`) that mirrors the DB: `selected` + vendor + client price > 0 + not blocked + the commercial gate. "Order all" uses it, which fixes residential. Whether residential needs client approval on top of that is **B1, ruling needed**. Until it's ruled, show a warning sentence on residential lines with no recorded client approval (approval evidence exists as review-edition feedback, `M/00435:778`), and never block. That matches R9's "warn, never block" posture | `poGate`; `get_ffe_invoice_coverage` (the coverage step) | — | S–M | Medium. Behavior change on residential "Order" visibility. Lines that are `candidate` stop showing an Order button the DB would refuse anyway |

**Board → order (named in the brief): mostly already fixed, one residue.**
- Deck-import Wave 1 landed. Proposal-board send now carries vendor, `source_url` and a `retail` price basis (`DP/lib/scope/board-schedule.ts:42-50,88-110`). Project-board promote sends `name`, `productId` and `sourceMetadata` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:196-215`). Bulk promote defaults to `selected` (`DP/components/mood-board/board-promote-all-panel.tsx:94`) **[H]**.
- **Residue:** a promoted line still has no trade cost (or has retail-as-trade, §2.4). S5 plus the R-DI4 confirmation close it.

**Also seen, not P0:**
- Mixed-currency PO totals show 0 (brief §2.3, not re-verified).
- The Assistant's "Create client invoice →" abandons the queue (r1, `step-coverage.tsx:245-251`). It belongs in P1 polish.

**Phase 0 totals.**
- 3 migrations (00690–00692). Each has one concern and one wrapper-free sibling RPC, so no `_impl` renames.
- 2 edge-function deploys (`po-send`, `quote-request-send`).
- About 9 portal files.
- Roughly 3–4 engineer-weeks, including tests: a pgTAP or SQL probe per RPC, jest per UI change, and one Playwright run of "member creates, sends, advances, receives, installs".

**Gate:**
- `pnpm --filter designer-portal type-check && pnpm --filter designer-portal test`
- `supabase db reset` with the new SQL tests
- Deno tests for `po-send`
- a signed-in local walk as a **non-owner member** (patina-verification)

---

## 4. The proposal map (anticipating D1/D2)

For each likely proposal:
- **Reuse:** what exists
- **Migrations:** what it needs
- **RLS/guard:** implications
- **Flag**
- **Size / risk**
- **Feature test:** surface · studio moment · stream · promise (VISION.md:93)
- **Rulings**

### 4.1 One buying spine (lanes on one record)
- **Reuse:**
  - `purchase_orders` + `po_payments` + `create_purchase_order` (`M/00148`, `M/00186`, `M/00450:15-89`)
  - Order Assistant step machine
  - maker lane `is_patina_catalog` → Stripe (`M/00186:85`, r5 §1.4)
  - lifecycle trail (`DP/lib/document/procurement-lifecycle.ts`)
- **Migrations:**
  - `purchase_orders.kind` (`vendor_po | card_purchase | one_off | work_order | maker_checkout`, default `vendor_po`)
  - relax `vendor_id NOT NULL` (`M/00148:54`) to a CHECK: vendor required unless `kind='one_off'`, which carries `seller_name`/`seller_contact` text
  - `create_purchase_order` grows a request-jsonb sibling, `create_purchase(p_request jsonb)`, rather than a 13th positional arg
  - L-sized migration plus the house wrapper for the PO guard
- **RLS/guard:** the PO guard trigger already admits RPC writes. The new kinds inherit `purchase_orders_studio_read` (`M/00447:7-13`). The line→PO link check (`M/00449:125-133`) must accept a `one_off` with no vendor.
- **Flag:** `buying-lanes`. **Size:** XL. **Risk:** high: every reader of `purchase_orders` (Ledger, Week, Receiving, `po-send`, QBO export, crons) must handle the new kinds. A one-off has no email to send.
- **Feature test:** The Document (line unfold + Orders book) · the first hire buying everything for a job in one place · subscription floor; upside only for the maker lane · "studio won't notice Patina" (one record, not five tools).
- **Rulings:** **V1** for how the maker lane's money shows beside studio lanes; **R1** for whether trade totals show to members.

### 4.2 Add-anything parity (every intake path can reach a PO)
- **Reuse:**
  - `place_product_in_project_v2` and `create_named_project_need` (`M/00435:86-334`)
  - **schedule import backend with no UI:** `stage_project_ffe_document_extraction`, `commit_project_ffe_import`, fn `project-ffe-document-extract`, through `M/00666`. No portal or hook reference found (grep) **[H]**. The dead button is `DP/components/document/schedule/add-to-project-sheet.tsx:272-274`.
  - S5's vendor/trade RPC
  - the People maker add-sheet
- **Migrations:**
  - none for the import UI
  - **00693** `field_capture_mint_carry.sql`: redefine `commit_field_capture` so the library mint carries sku/finish/materials/colors/dimensions/trade (dropped at `M/00530:666-674`, r2 **[H, r2]**). The only definition is 00530 (checked).
  - Named need gets optional vendor and price, through S5's RPC after creation (no migration).
- **RLS/guard:** import commits already set the guard flag (`M/00435`, `M/00666`). `products` insert grants are unchanged.
- **Flag:** `ffe-schedule-import` for the import sheet. The mint fix is a bug fix. **Size:** M (import UI) + M (mint) + S (named-need fields).
- **Risk:** medium. The import has commercial-confirmation rules (`M/00661`). The UI must honor the per-row confirm (ruling D7/D7b, `M/00664` header).
- **Feature test:** Document · first hire bringing in an existing vendor schedule or a field find · subscription · one place for everything.
- **Rulings:** **R-DI4** (trade basis on imported/clipped lines); **R6** (price age on imported prices).

### 4.3 Off-catalog vendors (vendor-less line → orderable)
- **Reuse:**
  - `resolveVendor` (`packages/supabase/src/lib/vendors.ts:85-148`; SQL twin `_board_deck_import_resolve_vendor`, `M/00676:251-301`)
  - S5 RPC (vendor attach)
  - People maker sheet
- **Migrations:** none beyond S5 for attach. A designer-facing **create** goes through `resolveVendor` (client insert into global `vendors`, open by design per `M/00058` comment) and is then studio-carded via 4.13.
- **RLS/guard:** global `vendors` pollution is the known cost (r2 §4). It is accepted for now and fixed structurally by 4.13.
- **Flag:** none (the S5 follow-on). **Size:** S on top of S5. **Risk:** low.
- **Feature test:** Document line unfold · "the antique dealer we found Saturday" · subscription · buy everything in one place.
- **Rulings:** none, unless routed to the marketplace (V1).

### 4.4 Spec-field carry-through (buy spec rides onto the line and the PO)
- **Reuse:**
  - `project_ffe_specs` writable columns (`M/00435:984-985`)
  - Spec Book editor `useUpdateProjectFfeSpec` (`packages/supabase/src/hooks/use-spec-books.ts:334-373`, r2 **[H, r2]**)
  - `field_provenance` column (same grant)
  - S6 fallback
- **Migrations, P1:** **00694** `spec_seed_from_product.sql`. Change `trg_spec_book_attach_ffe_line` (`M/00380:565-570`) to seed sku/finish/material/color/dims from the product, with `field_provenance = 'product_master'`, so the spec row stops being empty. Keep the "override" meaning by having `resolveSpecValue` treat a `product_master`-provenance value as a fallback, not an override.
- **Migrations, P2:** freeze resolved specs onto the PO at send (`purchase_order_lines` snapshot table, or a jsonb on `purchase_orders`). Today the stored PDF (`po_document_path`, `M/00188`) is the only frozen record.
- **UI:** the line unfold shows SKU · finish · dims as one quiet line, with an "edit in spec book" link, so there's one editor.
- **RLS/guard:** spec columns are already open to co-members. The seed trigger runs as definer.
- **Flag:** none (data fix). **Size:** S (P0 S6) → M (P1 seed) → M (P2 snapshot).
- **Risk:** the seed changes what the client-portal spec view shows if it reads raw spec columns. Verify the client mirror reads through the same resolver [L].
- **Feature test:** Document · "which finish did we spec?" before the PO goes out · subscription · fewer wrong builds.
- **Rulings:** none.

### 4.5 Payments made (vendor deposit and balance recorded)
- **Reuse:**
  - `po_payments` with states pending/due/paid (`M/00148:16-35`)
  - `useLogPaymentPaid` (`use-procurement.ts:602-635`), `useAdvancePaymentToDue` (`:849-868`), zero callers
  - `deposit_paid_flips_balance` trigger (`M/00184:333-374`)
  - payments-due cron (`M/00189:59`)
  - The Post reads `procurement_notifications` (`DP/components/document/overlays/post-sheet.tsx`, `DP/lib/document/post-derivation.ts`)
- **Migrations, P1:** **00695** `po_payment_record.sql`
  - columns `paid_method` (`card|ach|check|wire|other`), `paid_reference` (last 4 or check #), `paid_amount_cents`
  - RPC `record_po_payment(p_payment_id, p_request jsonb)`, which refuses rows with `stripe_checkout_session_id` / `stripe_payment_intent_id` set (`M/00275:39-61`), so the maker rail stays Stripe-reconciled
  - then revoke direct writes on `po_payments` from `authenticated` and replace the `FOR ALL` policy with SELECT (`M/00584:244-259`)
- **UI:** the Ledger's payment lens (`orders-ledger.tsx` "payment · due") gets an inline "Paid — date · method · ref" act per row. The Vendors page "Terms" uses 4.13, not global `vendors`.
- **RLS/guard:** revoking direct writes after the RPC lands matches the 00447 posture. Check `useAdvancePaymentToDue` callers before revoking (zero today).
- **Flag:** `buying-payments-made`. **Size:** M. **Risk:** medium. A money table. The Stripe-row guard is the key test. Agent-OS rule: internal payable tables are the truth, so reconcile Stripe toward them.
- **Feature test:** Orders book (Desk) · the weekly bill run · subscription · "no hidden fees" studio-side, and clearing "balance due" notices the studio can't clear today.
- **Rulings:** **V1** if a maker-lane payment ever shows a Patina cut. Studio lanes are the studio's own money (r5 §5.9).

### 4.6 Quote / ack / CFA
- **Reuse:**
  - `vendor_quote_requests` (`M/00162:31-49`: free text, no project/line)
  - `quote-request-send`
  - `log_po_acknowledgment` (vendor # + ETA only, `M/00190:29-32`, r3)
  - custom-commission "Submittal" milestone (`DP/components/document/rooms/piece/custom-commission-fulfillment.tsx:33-57`; table `M/00403:285`)
  - `com_details` (`M/00413:45-71`)
  - The 00424 `trade_rfq_rail` and 00631 `project_party_bids` exist for **trade scope** RFQs. Read them before minting a new RFQ table [L, not read this pass].
- **Migrations, P1 (ack chase):** add an `ack_overdue` value to `procurement_notification_kind` (`M/00151:14`) and a pg_cron job (sent > N business days, no ack). S.
- **Migrations, P2 (ack reconciliation):** `purchase_order_acks` (po_id, document media id, per-line `{price, finish, qty, dims, ship_date}` as acked, `discrepancy` flags, resolved_by/at) plus RPCs. L.
- **Migrations, P2 (RFQ):** add `project_id`, `ffe_item_ids[]`, quote-back fields (price, freight, lead, valid_until, media) to `vendor_quote_requests`, or reuse the trade RFQ rail. M–L.
- **Migrations, P2 (CFA):** `fabric_approvals` (cfa/strike_off, line or configuration id, dye lot, status, approved_by). It gates the fabric PO in 4.9. M.
- **RLS:** studio co-member read/write via RPC. The ack document goes through the media service.
- **Vendor writes:** none. A vendor-side ack link is capped by **V10**'s ceiling (tokened, unverified until a studio member confirms). Do not build vendor writes without a ruling.
- **Flags:** `buying-ack-check`, `buying-rfq`, `buying-cfa`. **Size:** S (chase) / L / M–L / M. **Risk:** the reconciliation UX must not become a nagging checklist. It is one panel on the PO.
- **Feature test:** Document (line unfold + Ledger) · first hire checking a vendor ack while Leah designs · subscription; protects upside · catches the #1 loss quietly.
- **Rulings:** **R6** (quote validity and price age); a **V10** extension, if vendors write. Ack-reply drafts land `awaiting_review` (Agent-OS rule).

### 4.7 Ship / install controls
- **Reuse:** S3 and S4 RPCs; lifecycle trail; Week grid (`DP/components/document/orders-book-week.tsx`); `delivery_events`.
- **Migrations, P1:** **00696** `purchase_order_tracking.sql`
  - `carrier`, `tracking_number`, `bol_media_id`, `shipped_at` on `purchase_orders`
  - extend S1's header RPC, or add `set_purchase_order_tracking`
  - optionally insert a `delivery_events` row so the Week grid learns the ship date
- **P2:** an install manifest per project (what's at the receiver vs on site, per room). It reads existing facts. Punch tied to a line is K2 in r3 (`coordination_kind='punch'`, `M/00213:37`; line link unverified [L]).
- **Flag:** none for P0 controls; `buying-tracking` for P1. **Size:** S (P0) / S–M (P1) / M (P2). **Risk:** low.
- **Feature test:** Document · install day · subscription · close-out without paperwork (the close-out derivation needs `installed`).
- **Rulings:** **R7** if a delay note goes to the client (drafted, never auto-sent).

### 4.8 Receiving photos on the web
- **Reuse:**
  - `receiving_inspections.photo_asset_ids` (`M/00150:43`)
  - `record_project_ffe_receipt_batch`
  - `LogInspectionDrawer` with its desktop placeholder (`DP/components/portal/procurement/log-inspection-drawer.tsx:456-467`)
  - media service presigned **upload** (`services/media/src/modules/storage/oci-storage.service.ts:115`)
  - signed GET helper `CdnManager.getSignedUrl` (`services/media/src/modules/storage/cdn/cdn-manager.service.ts:107`)
- **The one bug:** `getDownloadUrl` returns `downloadUrl: asset.rawKey` (`services/media/src/modules/media/media.service.ts:197`) **[H]**.
- **Migrations:** none.
- **Service change:** sign the key via `CdnManager` (keep the asset-scope check at `:189-190`), then deploy the container. Proxy through `@patina/api-routes` (no ad-hoc fetch, per AGENTS.md).
- **Portal:** replace "N photos logged on the phone" (`DP/components/document/orders-book-receiving.tsx:34-49`) with thumbnails, and enable desktop upload in the drawer.
- **Flag:** `receiving-web-photos`. **Size:** M. **Risk:** medium. The service deploy path (Containers), and the signed-URL TTL and scope must not leak across studios. Separate-context security review.
- **Feature test:** Document (Receiving) + iOS Field · delivery day; claim review at a desk · subscription · fits the "open ground" from r4 §4.2, as a record, never a photo feed.
- **Rulings:** none.

### 4.9 Workroom / COM
- **Reuse:**
  - `product_option_values.allows_com`, `product_configurations.com_details {mill, pattern, yardage, railroaded, shipTo, sidemark, …}` (`M/00413:45-71`)
  - `po-send` COM lines (`F/po-send/lib.ts:498`, r3)
  - `studio_contacts.specialties` (workroom as a rolodex label, `M/00417:98`)
  - S2's ship-to
- **Migrations, P2:**
  - `work_orders`, or `purchase_orders.kind='work_order'` from 4.1
  - `purchase_order_links (from_po, to_po, relation 'com_fabric_for')` so a fabric PO points at the workroom PO, with the fabric PO's `ship_to` defaulting to the workroom's address
  - line-level COM fields for **non-configured** lines (a `com_details` jsonb on `project_ffe_specs`, so it is directly writable like the other spec columns)
  - CFA from 4.6 gates the fabric PO
  - yardage helper: client-side calculator only, no table
- **Flag:** `buying-com-chain`. **Size:** XL. **Risk:** high. The genuinely open ground in r4 §4.1. Real data will be thin at first (VISION.md:76, "empty room").
- **Feature test:** Document line unfold · specifying upholstery or drapery · subscription (upside if fabric is marked up) · fewer reorders.
- **Rulings:** **V1 / R1** on whether COM fabric is marked up or passed through.

### 4.10 Freight / receiver
- **Reuse:**
  - `project_parties.party_kind='receiver'` (`M/00281:48-53`)
  - maker-lane shipment and freight shape as a model to copy (`M/00350:54-59,81,134,163`)
  - S2's ship-to
  - ad-hoc invoice lines (`M/00187:74`)
- **Migrations, P2:**
  - `studio_receivers` (org_id, name, address jsonb, contact, receiving hours, storage terms, free-days), or a `studio_contacts` row of kind `receiver` plus an address column. Prefer the rolodex extension: one place for people, and the People room already renders it.
  - ship-to becomes `ship_to_receiver_id` alongside the text
  - `purchase_order_charges` (po_id, kind `freight|crating|liftgate|residential|storage|receiving`, estimate_cents, actual_cents, billable bool)
  - reimbursables: `studio_reimbursables` (project, kind, amount, receipt media, paid_by, billable) feeding the invoice composer
- **Flag:** `buying-freight`, `buying-reimbursables`. **Size:** L. **Risk:** medium. Billing pass-through touches client invoices.
- **Feature test:** Document (PO + invoice composer) · month-end billing · both streams · "no hidden fees", studio to client too.
- **Rulings:** **R1** (what the client sees); **V1** (maker lane); tax per line (r3 §3.12, CPA, not code).

### 4.11 Exceptions (backorder, discontinued, substitution, claims windows)
- **Reuse:**
  - `is_blocked` + reason on the line
  - `start_purchase_order_change` with kinds `vendor_change|cancellation|credit|claim|remedy|new_scope`, prior snapshot, immutable evidence (`M/00435:849-869`, `M/00447:38-57,59+`), **no caller** (r3 **[H]**)
  - `reprice_replacement_purchase_order` (`M/00456`)
  - `design_disposition` alternate/superseded
  - claim lifecycle (`M/00150:61-75`)
  - `vendor_profiles.claims_window_days` (maker lane, `M/00350:57-58`)
- **P1 (change orders UI):** surface `start_purchase_order_change` from the line unfold. No migration. M.
- **P1 (claim clock):** `claims_window_days` on 4.13's studio vendor account, plus a quiet deadline on each inspection, plus a `claim_window_closing` notification kind. S–M.
- **P2 (backorder state):** a `backorder|discontinued` flag + new date on the line through an RPC. The substitution chain is alternate → client re-approval (review edition) → PO change → new order. L.
- **Flag:** `buying-change-orders`, `buying-claim-clock`, `buying-substitutions`. **Risk:** medium-high on substitution (client-facing).
- **Feature test:** Document · backorder or damage · both streams · the client agrees to one direction.
- **Rulings:** **R5** (substitute below trade), **R8** (post-sale edits), **R7** (client dates).

### 4.12 PO revisions after send
- **Reuse:** same change backend (4.11).
- **Migrations:** P2 `purchase_order_revisions` (version, diff, re-sent_at). Or lean on `prior_snapshot` and re-render through `po-send`, which persists `po_document_path` per send.
- **Size:** M. **Rulings:** **R8**.

### 4.13 Studio-scoped vendors and trade accounts
- **Reuse:**
  - `studio_contacts` (org-scoped company card with `vendor_id` back-link, `M/00417:70-121`)
  - `designer_vendor_accounts` (per designer, no portal reader, r3 **[H, r3]**)
  - `vendor_profiles` shape (`M/00350`) to copy
- **Migrations, P1:** **00697** `studio_vendor_accounts.sql`
  - (organization_id, vendor_id, account_number, rep, default_payment_terms, deposit_pct, net_days, claims_window_days, orders_email override, trade_portal_url, resale_cert_on_file bool, notes)
  - RLS: co-member read/write (`is_studio_comember` pattern from 00584)
  - `create_purchase_order` / Assistant defaults read it before global `vendors`
  - the Vendors page Terms panel edits it (`DP/components/document/orders-book-vendors.tsx:561-570`)
  - `po-send` uses its orders email if set
  - leave `designer_vendor_accounts` alone, with a one-time backfill into the studio row
- **Flag:** `studio-vendor-accounts`. **Size:** M–L. **Risk:** medium. `po-send` address resolution changes, so the vendor email must still resolve for old POs.
- **Feature test:** Document (Orders book Vendors + People) · the new hire needs the account # without asking Leah · subscription · no lock-in (the studio's own data).
- **Rulings:** none. A resale-certificate vault stays a side journey (legal-gated, r3 §7).

### 4.14 Notifications feed (quiet procurement notices)
- **Reuse:**
  - `procurement_notifications` + kind enum (`M/00151:14-34`), `notify_payment_due`, `notify_damage_claim_drafted` (`:142,208`)
  - delivery-this-week cron (`M/00189:82-86`)
  - The Post renders them (`post-sheet.tsx`, `post-derivation.ts`)
- **Migrations, P1:** **00698** `procurement_notification_kinds.sql`. Add `ack_overdue`, `balance_due_before_ship`, `claim_window_closing`, `eta_slipped` plus their cron or trigger writers. `ALTER TYPE … ADD VALUE` can't run inside a transaction block alongside its use. Split the enum add from the writers or use the repo's established pattern (patina-db-migrations).
- **Flag:** rides with each feature's flag. **Size:** S–M. **Risk:** **engagement.** One notice per fact, cleared by the act, no badges or streaks. **V11** refuses a "studio week at a glance" total (r5 §4).
- **Feature test:** Desk/The Post · the hire's morning · subscription · the studio surface is never optimized for engagement. This passes only if every notice is a fact with one act that clears it.

### 4.15 Owner approval for spend (the role split)
- **Reuse:** `is_studio_comember` (00556); `organization_members.role` (`M/00021:22-24`); the `studio_owner` role (`M/00022:17`).
- **Migrations:** P2 at the earliest, after rulings.
- **Feature test:** Document · the day Leah isn't the only one committing money · subscription · must not become a paywalled tier (one-page pricing).
- **Rulings:** **R1** (who sees margin), plus new **B2** (is any buying act owner-approved, and above what?). r5 §3 shows the role systems disagree. A proposal must name which "owner" it means.

---

## 5. Phase 1 and Phase 2

### Phase 1: updates (existing models, missing UI or one column), about 8–10 engineer-weeks
1. **Payments made** (4.5): 00695 + Ledger act + revoke direct writes.
2. **Studio vendor accounts** (4.13): 00697. It feeds payment terms, the claim clock and `po-send` email.
3. **Tracking on POs** (4.7): 00696 + Movement cell.
4. **Receiving photos on web** (4.8): media service fix + drawer.
5. **Schedule import UI** (4.2): flag `ffe-schedule-import`.
6. **Field capture mint carry** (4.2): 00693.
7. **Spec seed from product** (4.4): 00694.
8. **Change orders UI** (4.11) on `start_purchase_order_change`. **R8** must be ruled first for post-sale edits. Cancellation and claim kinds can ship ahead of it.
9. **Ack chase + notification kinds** (4.6 chase, 4.14): 00698.
10. **Claim clock** (4.11): needs 4.13's `claims_window_days`.
11. **Polish:** the Assistant's "Create client invoice" keeps the queue; mixed-currency totals.

### Phase 2: overhauls (new models), about 5–7 months if all are built
1. **One buying spine with lanes** (4.1). Do it first in Phase 2: every other overhaul hangs off `kind`.
2. **Receivers + freight/charges + reimbursables** (4.10).
3. **Ack reconciliation + RFQ with quote-back** (4.6).
4. **Workroom/COM chain + CFA** (4.9, 4.6). Depends on 1 (`work_order` kind) and 2 (receiver/workroom address).
5. **Exceptions: backorder + substitution chain** (4.11). Depends on R5/R8.
6. **PO revisions + spec snapshot at send** (4.12, 4.4).
7. **Install manifest + punch-to-line** (4.7).
8. **Owner approval for spend** (4.15). Only after R1 and B2.

**Side journeys (log in VISION-DECISIONS, don't build):** samples/memos (r3 M1), job P&L dashboard (blocked on R1/V1 and refused in "dashboard" form by V11), resale-certificate vault (legal-gated), vendor-side self-service ack (V10 ceiling).

---

## 6. Roadmap table

Size: S ≤ 1 wk · M 1–3 wks · L 3–6 wks · XL 6+ wks (one engineer, tests included). Migration numbers are provisional, so reserve them when work is dispatched.

| Phase | Item | Surface | Reuses | Migration | Edge fn / service | Flag | Size | Risk | Ruling | Feature test (moment · stream · promise) |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | S0 probe ETA + co-member send | — | local stack | — | — | — | XS | — | — | — |
| 0 | S1 ETA RPC | Line unfold, Ledger | `log_po_acknowledgment` template | 00690 | — | — | S | L | — | chasing a vendor · sub · no second system |
| 0 | S2 real ship-to | Order Assistant, `po-send` | `ship_to` col, `organizations.address` | 00690 | po-send | — | M | M | — | every PO · sub · removes the placeholder |
| 0 | S3 production/shipped | Movement cell | 00184 cascade + balance flip | 00690 | — | — | S–M | L–M | — | order underway · sub · truth on the line |
| 0 | S4 mark installed | Line unfold, FF&E section | `ffe_status_rank`, close-out derivation | 00691 | — | — | S | L | — | install day · sub · close-out clears |
| 0 | S5 vendor + trade cost on a line | Line unfold | 00456 markup derivation | 00692 | — | — | M | M | R8/R5/R1 for client price (excluded); R-DI4 | off-catalog buy · sub · buy anything |
| 0 | S6 PDF spec fallback | `po-send` | `resolveSpecValue` logic | — | po-send | — | S | L | — | PO out · sub · right finish built |
| 0 | S7 co-member send | `po-send`, `quote-request-send` | `is_studio_comember` | — (opt. helper) | both fns | — | S | M (auth) | — | first hands · sub · hire can finish the job |
| 0 | S8 project lens kept | Orders book | lens UI | — | — | — | S | L | — | chase from a project · sub · no hunting |
| 0 | S9 one send UI + message | Assistant, line, Ledger | `PoPreview` | — | — | — | S | L | — | every send · sub · one way to do it |
| 0 | S10 ack on the line | Line unfold | `LogAckInline` | — | — | — | XS | L | — | vendor phoned · sub · act where you look |
| 0 | S11 one orderable predicate | Line unfold, Vendors | `poGate` | — | — | — | S–M | M | **B1** | ready to order · sub · UI never offers a refused act |
| 1 | Payments made | Ledger | `po_payments`, hooks, triggers | 00695 | — | buying-payments-made | M | M | V1 (maker lane only) | bill run · sub · clear "balance due" |
| 1 | Studio vendor accounts | Vendors, People | `studio_contacts`, `vendor_profiles` shape | 00697 | po-send | studio-vendor-accounts | M–L | M | — | hire needs acct # · sub · own data |
| 1 | Tracking on POs | Movement cell, Week | S1/S3 RPCs, `delivery_events` | 00696 | — | buying-tracking | S–M | L | R7 (client notes) | where's the sofa · sub · truth |
| 1 | Receiving photos on web | Receiving, drawer | media upload + `getSignedUrl` | — | media svc | receiving-web-photos | M | M (scope) | — | claim review at a desk · sub · record not feed |
| 1 | Schedule import UI | Add-a-line sheet | 00434–00666 backend | — | — | ffe-schedule-import | M | M | R-DI4, R6 | bring in a schedule · sub · one place |
| 1 | Field capture mint carry | iOS Field → line | `commit_field_capture` | 00693 | — | — | M | M | — | field find · sub · nothing retyped |
| 1 | Spec seed from product | Spec Book, line | spec trigger, `field_provenance` | 00694 | — | — | M | M (client mirror) | — | which finish · sub · fewer wrong builds |
| 1 | Change orders UI | Line unfold | `start_purchase_order_change`, 00456 | — | po-send (re-send) | buying-change-orders | M | M | **R8**, R5 | backorder / cancel · both · client agrees |
| 1 | Ack chase + notice kinds | The Post | `procurement_notifications`, crons | 00698 | — | rides features | S–M | M (engagement) | V11 binding | hire's morning · sub · never engagement |
| 1 | Claim clock | Receiving | studio accounts, inspections | (in 00697/00698) | — | buying-claim-clock | S–M | L | — | delivery day · sub · one reminder |
| 2 | One buying spine (lanes) | Document + Orders book | `purchase_orders`, Assistant, maker lane | L migration (`kind`, vendor CHECK, `create_purchase`) | po-send, qbo-export | buying-lanes | XL | H | V1, R1 | buy everything for a job · sub (+upside maker) · one record |
| 2 | Receivers, charges, reimbursables | PO, invoice composer | `party_kind=receiver`, 00350 shape | M–L migrations | — | buying-freight / -reimbursables | L | M | R1, V1 | month-end billing · both · no hidden fees |
| 2 | Ack reconciliation + RFQ | Line unfold, Ledger | 00162, 00424/00631 (read first) | L | quote-request-send | buying-ack-check / -rfq | L | M | R6; V10 if vendor writes | checking an ack · sub (protects upside) · quiet catch |
| 2 | Workroom/COM chain + CFA | Line unfold | 00413 `com_details`, po-send COM lines | L | po-send | buying-com-chain / -cfa | XL | H | V1/R1 (fabric markup) | specifying upholstery · sub · fewer reorders |
| 2 | Backorder + substitution chain | Line unfold, review editions | dispositions, change backend | M | — | buying-substitutions | L | M–H | R5, R8, R7 | backorder · both · one agreed direction |
| 2 | PO revisions + spec snapshot | PO | `prior_snapshot`, `po_document_path` | M | po-send | — | M | M | R8 | vendor change · sub · paper trail |
| 2 | Install manifest + punch-to-line | Document | facts from S4, 00213 punch | S–M | — | — | M | L | — | install day · sub · close-out |
| 2 | Owner approval for spend | Document | role systems A/B | TBD | — | — | L | H | **R1, B2** | Leah not sole spender · sub · not a paywalled tier |

---

## 7. Rulings this phasing needs

**Existing, open, never resolved here:**
- **V1:** margin pocket. Touches the maker lane beside studio lanes (4.1), maker-lane payments (4.5), COM markup (4.9) and freight billing (4.10).
- **R1:** who sees margin. Every phase keeps buyer screens at vendor trade cost only. It gates 4.15 and 4.10's client view.
- **R5 / R8:** substitution below trade and post-sale edits. They gate the client-price half of S5, change orders (4.11) and revisions (4.12).
- **R6:** price age and quote validity (4.2, 4.6). **R7:** client-facing dates (4.7, 4.11).
- **R-DI4** (assumed default, V13): imported prices are retail and trade stays empty. Needed before the 00435 COALESCE (§2.4) flips to NULL.

**New, raised by this memo:**
- **B1 · Residential order gate.** Today a residential line is orderable without any recorded client approval, and nothing writes `approved` on residential jobs (§2.5). Options:
  - (a) warn-only, the R9 posture, which is what S11 ships meanwhile
  - (b) require a client approval record (review-edition feedback or decision) before "Order" is offered
  - (c) require a paid client invoice (coverage) on residential, as commercial requires deposit-clear

  Leah rules the practice. Kody rules the gate.
- **B2 · Internal spend approval.** Should any buying act by a non-owner need the owner's approval, and above what amount? Which "owner" counts: the System A role or the System B seat (r5 §3)?
- **B3 · `po-send` with no ship-to.** Refuse the send (what S2 proposes), or keep defaulting to the project site address with a visible "shipping to the client's house" line?

---

## 8. What I did not verify

- **Runtime** behavior of §2.1 (ETA) and §2.2 (co-member send). The code says they fail, but no walk or probe was run (S0 exists for this).
- Whether the FF&E section renders the line unfold for `candidate` lines (§2.6) [M].
- Whether any SQL writes `project_ffe_items.status` through a dynamic expression I didn't catch (§2.5) [M-H]. I checked every `UPDATE public.project_ffe_items` that writes status.
- The client mirror's read path for spec values (risk on 4.4's seed) [L].
- The `00424_trade_rfq_rail` / `00631_project_party_bids` shape, which might host the RFQ in 4.6 [L].
- Whether iOS Field writes `installed` through a path other than `project_ffe_items`. None exists in SQL, so iOS cannot write it either [H by SQL absence].
- Mixed-currency zero totals (brief only).
- Effort sizes are engineering judgment, not measured.
