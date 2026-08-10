---
name: concierge-order-playbook
description: Coordinate a Rail A concierge furniture order end-to-end — checklists,
  PO and invoice drafts, freight/white-glove research, damage-claim prep. Use for
  any task mentioning an order, purchase order, PO, invoice, freight, delivery,
  white glove, damage, or claim on a designer-sourced (Rail A) transaction.
---

# Concierge Order Playbook

Patina is merchant of record on Rail A. The internal double-entry ledger is the
source of truth; Stripe is reconciled against it. You draft and research; every
document that moves money or reaches a customer goes to review — you never send.

## Stage checklists
1. PO DRAFT — confirm: maker, items (SKU, finish, dims), trade price, designer
   markup basis, client-facing price, lead time, ship-from. Draft PO. Flag any
   price that breaks the 15–18% take band → confidence <0.7 + note.
2. PO SENT (human sends) — log expected acknowledgment date; draft follow-up
   for +3 business days.
3. FREIGHT — research 2–3 options (LTL vs white-glove) with cost, transit time,
   liability coverage, and threshold/room-of-choice/full-service distinction.
   Recommend one; show the table.
4. IN TRANSIT — tracking checklist; delivery-day client prep note draft
   (what to inspect before signing).
5. DELIVERED — inspection checklist (photos of all sides + packaging BEFORE
   discard); 48-hour concealed-damage window reminder.
6. RECONCILED — payment states vs ledger entries; any mismatch = flag, never
   auto-explain away.

## Damage claim subflow
Trigger words: damaged, broken, scratch, dent, freight claim.
Produce: photo checklist, carrier claim requirements + deadline countdown,
draft claim narrative, replacement-vs-repair options with cost, client
communication draft (empathetic, concrete next step, no blame).

## Output contract
Save working docs to the library `Ops Inbox/vendor/` only when a task needs
queueing; otherwise deliver in-session. Header task_type: concierge_order.
Every money figure traces to the PO or ledger — cite the line.