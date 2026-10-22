# Current portal → Room Proof, round three

Source baseline: `ad9c064057a4460a17b15dcfaf0be81fb25e0f0a`, 22 October 2026. Codex inspected the authenticated current project page and all five FF&E views in Chrome, read-only. No live records were edited. All prototype data is fictional. Claude Code separately read bounded slices of the six principal editor components; its findings and limitations are preserved under `review/`.

The actual portal remains the functional reference. This artifact is an interaction proposal, not a replacement implementation or a parity claim.

| Current capability | Source in designer-portal | Home and depth in this round |
| --- | --- | --- |
| Continuous project: approvals, schedule, pieces, money, closeout, record | `src/app/(document)/doc/[id]/page.tsx`; `src/lib/document/document-index.ts` | Same-page chapters and running right-margin index. Non-FF&E chapters are collapsible layout studies. |
| Open FF&E, select lens/room, return to room | `components/document/pieces/build-room-shell.tsx`; `lib/document/pieces/build-room-url.ts` | In-place wide unfold; query state carries lens/room/line; close/Escape/back return to room context. |
| Preliminary selections, quantity, unit, rough estimate, keyboard entry | `pieces/rough-in-lens.tsx`, `rough-in-table.tsx` | Working local table, Enter to add, Tab between fields, slash library, next-room shortcut. 80 starting lines; 36 living-room lines. |
| Paste preview; catalog reference | `pieces/paste-preview.tsx`, `library-inline-search.tsx` | Working tab-separated preview with invalid-row feedback; a clearly bounded three-record sample library. No live catalog or uploads. |
| Groups, labor, move, removed/restore | `pieces/line-group-row.tsx`, `move-to-room-menu.tsx`, `labor-act.tsx`, `undo-toast.tsx` | Named groups, related labor lines, move with stable IDs, remove/undo/restore. Batch selection is a proposed convenience. Drag ordering and Tab-to-indent grouping remain deferred. |
| Maker/product, finish/material/color, dimensions, exact location, notes, units, lead time | `pieces/spec-lens.tsx`, `spec-fields-pane.tsx` | Inline row unfold, fitted specification form on phone; ordinary fields save on change/Enter. Images/drawing placement remain explicit studies. |
| COM and material/labor relationship | `pieces/com-toggle.tsx`, `labor-act.tsx` | COM flag, yardage, destination and status; separate fabric and labor lines. Real vendor obligations, fabric orders and work-order linkage remain integration work. |
| Shared placements and placement quantities | `pieces/placement-chips.tsx` | Not implemented. Each mock line has one room, Throughout or Unassigned. Keep this as an explicit next design/integration requirement. |
| Unit cost, markup, margin, client price, total, retail, rough reference | `pieces/price-table.tsx`, `price-summary.tsx`, `price-lens.tsx` | Working cents arithmetic, two-way markup/client price, target/tax summary, above-retail signal, allowance ceiling. Price changes do not rewrite trade cost. |
| Changed trade-cost resolution | `price-table.tsx` cost-conflict row | Full-width row with two priced outcomes: keep client price or keep markup. Unresolved lines cannot enter the local client draft. |
| Released and ordered restrictions | `price-table.tsx`; current UI refusal text | Released quantity/selection/client price protected; trade cost editable until ordered. Recorded change creates a separate local draft. Some prototype specification locks are deliberately conservative; this is not field-by-field permission parity. |
| Purchasing review and exclusions | `pieces/release-lens.tsx`, furnishing authorization preview | Whole-job view, selected/candidate/alternate classification, eligible/excluded reasons, saved local client snapshot, draft-exists/void/stale states, unlinked-client fixture. No sending, signing, authority grant, funding allocation or order release. |
| Painter’s finish schedule | `pieces/finishes-lens.tsx`; `doc/[id]/pieces/finishes/print/page.tsx` | Separate surface records per room, product/color, sheen, swatch, local print preview. Does not edit furniture-item finishes. |
| Restricted-money seats, role gates, budgets/checkpoints, trade scopes | `build-room-shell.tsx`, `price-lens.tsx`, `release-lens.tsx`, commercial components | Explicitly deferred. Client-copy filtering is demonstrated; portal permissions and financial visibility are not reproduced. |
| Drawing sets, boards, specification publication | Sibling `doc/[id]/plans`, `/boards`, `/spec-book` routes | Filed-document placement shown; editors/publishing remain in previous work or future rounds. |
| Earlier commercial workflows | Previous Room Proof functional mockups | Prior round remains linked. Invoices/receipts, contacts, procurement/receiving, schedules and time were not reimplemented in this FF&E-focused round. |

Paths in the table are relative to `apps/designer-portal/src/` unless already beginning with `src/`. No external live-source screenshots or real client data are bundled.

## Important distinctions

- Preliminary selections, Specifications and Pricing share line records but have distinct editable fields.
- Purchasing authorization considers the whole job, including exclusions; a room filter must not hide part of that set.
- Finish schedule edits room surfaces, a different object from an item’s finish.
- The mockup preserves separate design, purchasing and money facts. An estimate or draft never grants buying authority.
- A local draft is a frozen client-facing snapshot. Changing the working schedule does not rewrite it. Void the local draft before preparing another; the voided snapshot stays in local history.
- An allowance is a line-total ceiling. It is excluded from the priced subtotal and carries no markup.
