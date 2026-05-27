# Procurement Workspace Pilot — PostHog Setup & Metrics

**Status:** Spec only — Sprint 3 W3.4 deliverable.
**Owner:** Kody (pilot turn-on, dashboard creation, cohort management).
**Wired by:** Wave 3.4 Analytics Engineer.
**Source spec:** `docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md` §6.

This document covers what Kody needs to do in the PostHog UI to turn on the
procurement-workspace pilot, plus the dashboard tile specs for the five
success metrics tracked in PRD §12.

---

## 1. Feature flag setup (Kody manual step)

The `useFeatureFlag('procurement-workspace-pilot')` hook in the designer
portal gates both the top-nav zone (`apps/designer-portal/src/components/portal/top-bar.tsx`)
and the route group (`apps/designer-portal/src/app/(portal)/portal/procurement/layout.tsx`).
Until the flag exists in PostHog, every user sees the "Coming soon" placeholder
on `/portal/procurement/*` deep-links and the Procurement nav tab is hidden —
this is the intended default state.

**Steps in the PostHog UI:**

1. Open https://us.posthog.com → Feature Flags → New feature flag.
2. **Key:** `procurement-workspace-pilot` (exact match — case-sensitive).
3. **Description:** "Gates the Procurement Workspace pilot. Hides the
   /portal/procurement zone for non-pilot designers."
4. **Release type:** Boolean.
5. **Release conditions:** add condition group "Pilot users". For each pilot
   user, add a "Person is" filter on `email` or `distinct_id` (the portal
   identifies users by their Supabase user UUID — see
   `apps/designer-portal/src/lib/analytics/PostHogProvider.tsx`).
6. **Initial cohort:**
   - `kody@kochaver.com` (prod UUID `e01db20f-87c6-45a6-bc18-84c68e0e7452`)
   - Two designers to be named by Kody at pilot turn-on (add via the same
     person filter UI — no code change needed).
7. **Rollout percentage:** 100% for the matched cohort. Leave the
   "Release condition" rollout at 100 since the matching itself does the
   targeting.
8. **Default value:** `false` (everyone else sees the Coming Soon placeholder).
9. Save and toggle the flag ON.

**Verification after turn-on:**

- Open `/portal` as a pilot user → "Procurement" tab is visible in the top nav.
- Open `/portal/procurement/by-vendor` → the by-vendor view renders (not the
  Coming Soon card).
- Open `/portal` as any other user → "Procurement" tab is hidden; deep-linking
  to `/portal/procurement/calendar` shows the placeholder.

**To revoke a pilot user:** remove their email/UUID from the flag's condition
group in PostHog. No deploy needed.

---

## 2. Exposure events wired in this sprint

All events fire from the designer portal only. The `@patina/supabase` hooks
stay framework-free; tracking helpers live in
`apps/designer-portal/src/lib/analytics/procurement-events.ts`.

| Event | Fired from | Properties |
|---|---|---|
| `procurement_zone_visited` | Layout `useEffect` on every `/portal/procurement/*` route change. Calendar page re-fires with `conflicts_shown`. | `sub_view` (by-vendor / by-status / calendar / receiving), `conflicts_shown?` (calendar only) |
| `procurement_po_created` | Order Assistant `mutateAsync.then`. Order via Patina `onSuccess`. | `payment_pattern`, `total_cents`, `is_patina_catalog`, `vendor_id`, `project_id` |
| `procurement_inspection_logged` | Log Inspection Drawer `mutateAsync.then`. | `outcome` (clean/damaged/partial), `has_photos` |
| `procurement_damage_claim_created` | Same `mutateAsync.then` as inspection_logged, fired only when `outcome !== 'clean'` (matches auto-draft behavior in useCreateReceivingInspection step 4). | `outcome` |
| `procurement_qbo_exported` | QBO Export Modal `onSuccess`. | `date_start`, `date_end`, `include_paid`, `include_outstanding`, `row_count` |

**Future events** (documented but NOT wired in this sprint — defer to v1.1):
- `procurement_status_advanced` — fire when a PO transitions through statuses
  (drafted → ordered → confirmed → in_production → shipped → delivered).
  Requires either threading a callback into the existing `useUpdatePurchaseOrder`-
  style hooks, or wiring a portal-side wrapper around each call site.
- `procurement_conflict_acknowledged` — fire when a designer dismisses or
  resolves a calendar conflict card. Requires a "dismiss" / "resolve" UI
  affordance that doesn't exist yet in `ConflictCard`. Add when the UI lands.

---

## 3. Success metrics dashboard

Per PRD §12. Create one PostHog dashboard titled **"Procurement Pilot"** and
add the five tiles below. All filters should be scoped to the
`procurement-workspace-pilot` flag's enabled cohort (set a global dashboard
filter: `Properties → $feature/procurement-workspace-pilot = true` — or use
the cohort directly).

### Metric 1 — Order-day duration

**Goal:** 60% reduction vs Sprint 1 baseline.
**Baseline:** First two weeks of pilot (Sprint 1 had no event tracking).
**Insight type:** Trends — weekly median time-to-event.
**Source:** PO header `created_at` vs first status transition out of `drafted`.
**HogQL approximation (until status events ship):**

```sql
SELECT
  toStartOfWeek(events.timestamp) AS week,
  avg(events.properties.total_cents) AS avg_po_value,
  count() AS po_count
FROM events
WHERE event = 'procurement_po_created'
  AND person.properties.$feature/procurement-workspace-pilot = 'true'
GROUP BY week
ORDER BY week DESC
```

For the true order-day duration (PO drafted → first status change), pull
directly from `purchase_orders` + (eventually) status-history once the
`procurement_status_advanced` event ships in v1.1.

### Metric 2 — Damage discovery lag

**Goal:** Under 48 hours from delivery to first damage report.
**Insight type:** Trends — average duration in hours.
**Source:** `purchase_orders.delivered_date` (set by useCreateReceivingInspection
step 3) vs the timestamp of the first inspection with outcome != clean.

**HogQL via warehouse join** (assumes the Postgres source `purchase_orders`
and `receiving_inspections` are connected to PostHog warehouse):

```sql
SELECT
  ri.purchase_order_id,
  date_diff('hour', po.delivered_date::timestamp, ri.inspected_at::timestamp)
    AS lag_hours
FROM postgres.receiving_inspections ri
JOIN postgres.purchase_orders po ON po.id = ri.purchase_order_id
WHERE ri.outcome != 'clean'
  AND po.delivered_date IS NOT NULL
ORDER BY ri.inspected_at DESC
LIMIT 100
```

**Event-only fallback:** count `procurement_damage_claim_created` events per
week. Doesn't give a duration, but confirms damage claims are being filed.

### Metric 3 — Payment status accuracy

**Goal:** 100% of POs have at least one matching `po_payments` row.
**Insight type:** Trends — ratio metric.
**Source:** `purchase_orders` vs `po_payments` — best computed in-database.

**HogQL warehouse query:**

```sql
SELECT
  count(po.id) AS total_pos,
  count(po.id) FILTER (WHERE EXISTS (
    SELECT 1 FROM postgres.po_payments p WHERE p.purchase_order_id = po.id
  )) AS pos_with_payments,
  (count(po.id) FILTER (WHERE EXISTS (
    SELECT 1 FROM postgres.po_payments p WHERE p.purchase_order_id = po.id
  )))::float / count(po.id) AS coverage_pct
FROM postgres.purchase_orders po
WHERE po.created_at >= now() - INTERVAL 30 day
```

**Secondary check:** POs with `payment_pattern = 'fifty_fifty'` should have
exactly 2 `po_payments` rows. POs with `payment_pattern = 'thirty_seventy'`
should have exactly 2. POs with `payment_pattern = 'full_upfront'` should
have exactly 1.

### Metric 4 — Bookkeeper handoff time

**Goal:** Subjective — report frequency, target weekly cadence.
**Insight type:** Trends — count per user per week.
**Source:** `procurement_qbo_exported` event.

```sql
SELECT
  toStartOfWeek(timestamp) AS week,
  count(DISTINCT person_id) AS active_exporters,
  count() AS total_exports,
  avg(properties.row_count) AS avg_rows_per_export
FROM events
WHERE event = 'procurement_qbo_exported'
GROUP BY week
ORDER BY week DESC
```

### Metric 5 — Calendar conflicts prevented

**Goal:** Increase over the pilot period (signals the designer is using the
calendar enough to surface conflicts before they happen).
**Insight type:** Trends — sum of `conflicts_shown` property.
**Source:** `procurement_zone_visited` events where `sub_view = 'calendar'`.

```sql
SELECT
  toStartOfWeek(timestamp) AS week,
  sum(properties.conflicts_shown) AS total_conflicts_seen,
  count() AS calendar_views
FROM events
WHERE event = 'procurement_zone_visited'
  AND properties.sub_view = 'calendar'
GROUP BY week
ORDER BY week DESC
```

**Note:** This counts conflicts *seen*, not conflicts *resolved*. A true
"prevented" metric requires the `procurement_conflict_acknowledged` event
deferred to v1.1.

---

## 4. CSP requirement (already shipped)

PostHog ingestion runs against `https://us.i.posthog.com` and assets at
`https://us-assets.i.posthog.com`. Both are now whitelisted in the
`connect-src` directive in `apps/designer-portal/next.config.js` (this sprint).
No further CSP work needed.

---

## 5. Local development gotcha

Per `apps/designer-portal/src/lib/analytics/posthog.ts`, PostHog is **disabled
in development by default** to avoid polluting Next.js's dev error overlay.
To preview the procurement workspace locally with a real flag value:

```bash
# In apps/designer-portal/.env.local
NEXT_PUBLIC_POSTHOG_KEY=<dev or prod key>
NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true
```

Without those env vars, `useFeatureFlag('procurement-workspace-pilot')` returns
`false` and the zone stays hidden. That's the correct default — most local
dev sessions don't need procurement work. Set the env vars only when you're
actively testing the gating.

---

## 6. Rollback

If the pilot needs to roll back:

1. **Flip the flag off in PostHog** (single click, no deploy).
2. The Procurement nav tab disappears for everyone, deep-links redirect to
   the Coming Soon placeholder.
3. Underlying data (`purchase_orders`, `receiving_inspections`, etc.) is
   unaffected — only the UI surface is gated.
4. Re-enable by flipping the flag back on. No state migration needed.
