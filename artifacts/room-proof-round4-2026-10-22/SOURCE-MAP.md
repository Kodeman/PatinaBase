# Current portal → Room Proof / 04

Source inspected read-only on 22 October 2026 at baseline `9e36bfb5560901699ab76bb0b377b70fadb92f62`. No live business records were edited. Round three included authenticated browser inspection of the project and all five FF&E views; this round examined the additional source below. All mockup data remains fictional.

Paths below are relative to `apps/designer-portal/src/components/document/` except where specified. The per-item review layout is a new interface proposal informed by current decision and frozen-edition semantics, not a claim that the production client phase review already has this exact UI.

| Source reference | What it establishes | Round-four mapping |
| --- | --- | --- |
| `client-note-composer.tsx` | A note left on the client page differs from a client message thread; enclosures and drafts exist. | Explicit private studio note vs unsent client or maker draft. Contextual entries plus a whole-job record. Enclosures and actual sends remain integration work. |
| `people/ops/thread-conversation.tsx` | Shared thread presentation can appear in the document margin, People and client context. | One subject-linked record shown at the job, line or order. No realtime or delivery simulation. |
| `margin-bodies.tsx` | Explicit decision acts, client evidence and coordination are distinct from ordinary notes. | Conversation does not change approval. A client records approve, request changes or pause per item. |
| `apps/client-portal/src/components/threshold/approval-ask.tsx` | Review of an edition, explicit decisions, reasons for changes, and separate signature behavior. | Frozen item review editions, independent responses, required change note, stale-item notice. Real phase review and signing are not reproduced. |
| `pieces/price-approval.tsx` | Approved figures remain alongside changed working figures; internal cost/markup records are separate. | A changed specification/client price invalidates coverage of that working selection; the prior client snapshot remains. Trade cost and private notes are absent from client paper. |
| `schedule/review-release-sheet.tsx` | Purchasing authority includes quantities/client prices, budget/deposit facts and an issue gate. | Existing authorization view retained. Signed authority and funding are explicit fictional fixtures for downstream purchasing; saving a draft or approving a design does not grant authority. |
| `line-unfold/order-cell.tsx` | Order state, acknowledgment, ship-to, readiness reasons, change orders, discrepancy correspondence and outside-PO purchases. | Readiness sheet, maker-grouped order drafts, maker copy, sample dispatch, acknowledgment differences, retained acknowledgment history and order-linked drafts. Order changes after dispatch and full rider handling remain future work. |
| `purchases/purchase-record.ts` | Store buys, finds, antiques/auctions, expenses and sample fees have paid-with, receipt, tax/shipping/premium and reimbursement facts. | A separate already-paid purchase record tied to a line. Receipt reference only; upload, allocation and reimbursement processing are deferred. |
| `line-unfold.tsx` | Billing, next-release inclusion and notes are reachable from the working line. | Client decision and purchasing links adjacent to specification details; notes unfold within the item. |
| `account/studio-release-gate.tsx` (located, not fully audited) | Owner/admin release thresholds are a distinct concern. | Explicit integration limit. No role/threshold authorization engine is claimed. |

## Retained from round three

The five-view FF&E editor and its source mapping remain documented in `../room-proof-round3-2026-10-22/SOURCE-MAP.md`: preliminary entry/paste/library, groups and labor, move/remove/undo, full specification/COM fields, two-way client pricing and markup, changed-cost resolution, protected released values, whole-job authorization and a separate surface finish schedule.

The same six job chapters remain: Client approvals, Project schedule, FF&E selections, Project financials, Closeout and The record. Purchasing opens as another FF&E working view, not a new portal destination. Closing the sheet returns to room context. Notes use inline folds and a whole-job record.

## Explicit limits

- There is no backend, real send, signing, payment, authority grant, funding allocation or real order.
- Sample funding and maker terms are assumed records, not validated against bank/contract systems.
- Receiving demonstrates partial quantities, damaged deliveries and unresolved exceptions. Claims settlement, replacements and installation workflows remain future work.
- Static client/maker previews demonstrate content filtering; they are not security boundaries or substitutes for production permissions.
- Financials, schedules and closeout remain placement studies except for the new local purchasing/receiving records. Earlier functional workflow studies remain linked through round three.
