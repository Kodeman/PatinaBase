# Procurement Payment-Data Gating — v2 Follow-up

Status: deferred to v2.
Origin: Sprint 3 / Wave 3.3 audit (W3.3 CB1 lane).
Owner on trigger: whoever picks up multi-designer studio support.
Related dossier: `docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md`
  §4 "Studio-Owner Permission Gating".

---

## What's gated today (v1)

Only the QuickBooks export. Defense-in-depth at two layers:

1. **Client-side CTA**: `useIsStudioOwner()` (now in `@patina/supabase`) hides
   the "Export to QuickBooks" button in the procurement subnav for non-owners.
   Implementation: `apps/designer-portal/src/app/(portal)/portal/procurement/by-vendor/page.tsx`
   imports the hook and renders the CTA conditionally.
2. **Server-side check**: the `qbo-export` Deno edge function
   (`supabase/functions/qbo-export/index.ts`) calls
   `user_has_role(auth.uid(), 'studio_owner')` before executing the query and
   returns `403 { error: "Forbidden: studio_owner role required" }` otherwise.

No payment-data visibility elsewhere is gated. Everything else is read by
the owning designer (PO `designer_id = auth.uid()` via RLS).

---

## Payment-data surfaces visible to ALL designers in v1

This is the full audit list from W3.3. All these surfaces ship payment data
to any authenticated designer who can see the underlying PO, regardless of
whether they're the studio owner:

| # | Surface | File | Payment data shown |
|---|---------|------|--------------------|
| 1 | By Vendor view | `apps/designer-portal/src/app/(portal)/portal/procurement/by-vendor/page.tsx` + `vendor-section-card.tsx` | Per-PO `PaymentPill` (pending / due / paid / patina_handled); vendor default payment terms |
| 2 | By Status view | `apps/designer-portal/src/app/(portal)/portal/procurement/by-status/page.tsx` | Per-row `PaymentPill`; payment state column |
| 3 | Project Detail "FFE summary tile" | `apps/designer-portal/src/components/portal/project-detail/ffe-summary-tile.tsx` | "Committed" + "Balance due" dollar amounts (Sprint 1 W1.4) |
| 4 | Project Detail "Financials panel" | `apps/designer-portal/src/components/portal/project-detail/financials-panel.tsx` | Full payment breakdown |
| 5 | Project Detail "Key metrics row" | `apps/designer-portal/src/components/portal/project-detail/key-metrics-row.tsx` | Committed / Balance due |
| 6 | OrderAssistant (write surface) | `apps/designer-portal/src/components/portal/procurement/order-assistant.tsx` | Captures payment terms + deposit cents (write, not read) |
| 7 | Procurement notifications (W3.2) | `useProcurementNotifications`, `useProcurementUnreadCount` (`@patina/supabase`) backed by `procurement_notifications` (migration 00151) | `deposit_due` + `balance_due` notification kinds surface payment state in inbox + bell |
| 8 | Order via Patina dialog | `order-via-patina.tsx` | PaymentPill on item rows |
| 9 | Receiving tabs | `receiving-tabs.tsx` | PaymentPill in attached PO context |

Surfaces with **no payment data** (no gating needed):
- Receiving dashboard KPI row (`receiving-kpi-row.tsx`) — "Damage claims open" + "Inspections to do" only.
- Calendar (`calendar/page.tsx`) — ETA dates + delivery counts only.
- Today procurement card (`today` page) — arriving / inspections / damage counts only.
- ETA quick-edit drawer (`eta-quick-edit-drawer.tsx`) — ETA date only.

---

## Why v1 leaves payment data visible

PRD §11 says "Studio owner role only" specifically for the **export**, not
for the underlying payment data. Leah Walker (the v1 design partner) is
both designer and studio owner — single solo case. The implicit assumption
is that the person looking at the procurement workspace also signs the
checks, so showing payment state to anyone in the project team isn't a
problem yet.

W3.1 architect dossier §4 made this explicit:

> In v1, payment data (`po_payments`) is readable by the owning designer.
> No additional gating needed for viewing. The studio_owner read policy on
> `po_payments` is present in migration 00148 (INERT v1 pattern — scopes to
> `proj.designer_id = auth.uid()`). This remains inert and is not changed.

---

## v2 trigger

Pick this up when **any** of these happen:

1. A studio onboards a second designer who is not the owner (the multi-
   designer studio case explicitly carved out as v2 in W3.1 dossier §4).
2. A studio onboards a junior designer or assistant who should see
   procurement state (what's arriving, what's stuck) without seeing what
   the studio paid the vendor.
3. A bookkeeper user role is added separately and needs read-only access
   to payment data without the full designer surface.

Until one of those happens, gating payment-data visibility is over-
engineering against an audience of one.

---

## Implementation sketch for v2

When a non-owner designer joins a studio:

### Schema (v2, not now)

Per W3.1 dossier §4, introduce `studio_members`:

```sql
CREATE TABLE studio_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner','designer','bookkeeper')),
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (studio_id, user_id)
);
```

Then re-point `useIsStudioOwner()` (or add `useStudioMembership(studioId)`)
to read from `studio_members` instead of `user_roles.name`.

### UI gating

The hook already lives in `@patina/supabase` (post-W3.3). Surfaces 1–9 from
the audit table become guarded:

```tsx
const { isStudioOwner, isLoading } = useIsStudioOwner();

// Option A: render a "hidden" pill state that occupies the same width
//   so the layout doesn't shift between owner and non-owner views.
<PaymentPill
  state={isStudioOwner ? po.payment_state : 'hidden'}
  // …
/>

// Option B: omit the column entirely for non-owners.
{isStudioOwner && <PaymentPill state={po.payment_state} />}
```

Recommend Option A for the row/table layouts (less layout shift, the empty
space still communicates "there's data here you can't see"), and Option B
for the FFE summary tile / financials panel / metrics row (no value in
showing an empty $0 placeholder).

The OrderAssistant (#6 — write surface) stays open to any designer who
can create POs; the payment terms are an input, not a privileged view of
existing state.

### Notifications (#7)

`procurement_notifications` is the trickier one — `deposit_due` and
`balance_due` rows already exist in the table per migration 00151. Two
options:

1. Filter at the query layer in `useProcurementNotifications()` for
   non-owners — exclude `deposit_due` and `balance_due` kinds. Cleanest
   from a UI perspective but cross-references the role inside the hook.
2. Add a `payment_only` boolean on `procurement_notifications` and
   filter in the existing RLS policy. More invasive but keeps the gate
   server-side.

Recommend option 1 for v2 launch (lower migration risk) with a TODO for
option 2 if the gate is ever bypassed by SQL access (admin tooling, etc).

### Server-side defense-in-depth

When `studio_members` lands, the QBO edge function scope check changes
from `user_has_role(auth.uid(), 'studio_owner')` to a `studio_members.role
= 'owner'` lookup for the requested studio. The 403 response stays the
same so the client doesn't need to change error handling.

---

## v2 acceptance criteria

When a non-owner designer (role `studio_members.role = 'designer'`) opens
the procurement workspace:

- [ ] By Vendor + By Status views render without payment pills (or with
      hidden-state pills, depending on the layout decision).
- [ ] Project Detail FFE summary tile + financials panel + metrics row
      omit Committed / Balance due rows.
- [ ] OrderAssistant still works (write path).
- [ ] Procurement notifications inbox shows arrival / inspection /
      damage-claim notifications but not deposit_due / balance_due.
- [ ] QBO export CTA stays hidden + edge function still returns 403.

---

## Cross-references

- `useIsStudioOwner` lives at `packages/supabase/src/hooks/use-permissions.ts`
  (promoted from designer-portal-local in W3.3 CB1).
- `isStudioOwnerFromRoles` pure helper exported from same file for
  testability and for direct use in non-React contexts (server actions, etc).
- QBO export server-side gate: `supabase/functions/qbo-export/index.ts`
  + migration `00021_user_management_foundation.sql` (`user_has_role` fn).
- `procurement_notifications` schema: `supabase/migrations/00151_procurement_notifications.sql`.
- Architect dossier: `docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md`
  §4 "Studio-Owner Permission Gating" + §3 "Notifications Model".
