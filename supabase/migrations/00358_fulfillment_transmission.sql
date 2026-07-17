-- ═══════════════════════════════════════════════════════════════════════════
-- 00358 — Back of House: transmission slice (S3) — queue chase-verb correction
--
-- ADDITIVE (patina-parallel-work Wave-E policy): the S3 PO Composer &
-- Transmission Log slice needs ZERO new tables/RPCs — 00350–00353 already carry
-- fulfillment_vendor_pos (pdf_r2_key, transmitted_at, committed_ship, ack_*),
-- fulfillment_record_transmission / _record_ack / _record_client_note, and the
-- append-only fulfillment_events log the composer reads as its transmission log.
-- The ONE database change S3 needs is a correction to fulfillment_queue_v's
-- ack-chase math, done here rather than in-place on 00353 (that pack is now on
-- main; an in-place edit would cost every other program a local reset).
--
-- WHY the chase math was wrong (S1's 00353 cut): breach fired at
--   business_hours_between(oldest_sent_at, now()) > ack_chase_days * 8   (> 16h)
-- and the surfaced day used ceil(bh/8). At the SLA boundary (exactly 2 business
-- days = 16 business hours) `> 16` is false, and the first instant it *is* true
-- (16h+ε) yields ceil(16.0001/8) = 3. So "Chase — day 2" — the exact verb the
-- presentation names ("Chase at day 2", spec §5.3 / §2 "ack chase at 2 bus.
-- days after send") — was STRUCTURALLY UNREACHABLE: the queue could only ever
-- render day 3+. This redefinition switches to floor()+>= so the day number is
-- the count of business days elapsed since the send and the chase surfaces the
-- moment the 2-business-day SLA is crossed:
--   chase_days := floor(business_hours_between(oldest_sent_at, now()) / 8)
--   breach     := chase_days >= ack_chase_days           (>= 2 → day 2)
-- Business-hours-aware by construction (the weekend between a Friday send and a
-- Tuesday chase never counts — fulfillment_business_hours_between skips it).
--
-- Also ADDITIVELY threads next_action_params.client_surname so the Queue verb
-- reads "Chase {surname} — day N" (presentation's "Chase Vandermeer — day 3"),
-- surname = the last whitespace token of client_name (else the full single-token
-- name) — the same rule @patina/fulfillment/format.ts#formatSideMark uses, minus
-- the uppercasing (the verb is title-case, the carton mark is upper).
--
-- Output contract UNCHANGED: same columns, names, types, order — a pure
-- CREATE OR REPLACE VIEW (grants preserved). fulfillment_order_status_v and every
-- RPC are untouched. fulfillment_record_ack already sets committed_ship (the
-- client-ETA basis, spec §5.3) — verified, no amendment needed.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.fulfillment_queue_v
WITH (security_invoker = true) AS
WITH sent_po AS (
  -- earliest still-unacked PO send per order — the ack-chase clock reference
  SELECT order_id, MIN(transmitted_at) AS oldest_sent_at
  FROM public.fulfillment_vendor_pos
  WHERE status = 'sent'
  GROUP BY order_id
),
chase AS (
  -- business days elapsed since the oldest unacked send (floor → whole days).
  -- NULL when no PO is in 'sent' (nothing to chase). Computed once per order.
  SELECT
    order_id,
    oldest_sent_at,
    floor(public.fulfillment_business_hours_between(oldest_sent_at, now()) / 8.0)::int AS chase_days
  FROM sent_po
),
po_agg AS (
  SELECT p.order_id,
         jsonb_agg(jsonb_build_object(
           'po_id', p.id, 'po_number', p.po_number, 'vendor_id', p.vendor_id,
           'vendor_name', v.name, 'status', p.status
         ) ORDER BY p.created_at) AS po_stages,
         count(*) AS po_count
  FROM public.fulfillment_vendor_pos p
  JOIN public.vendors v ON v.id = p.vendor_id
  GROUP BY p.order_id
),
sla AS (
  SELECT
    (SELECT (value->>'split_confirm_business_hours')::numeric FROM public.fulfillment_config WHERE key='sla_hours') AS split_confirm_hours,
    (SELECT (value->>'ack_chase_business_days')::numeric FROM public.fulfillment_config WHERE key='sla_hours') AS ack_chase_days
)
SELECT
  s.order_id, s.order_no, s.client_name, s.intake_at, s.designer_attribution,
  s.min_stage_idx, s.has_unmapped, s.unmapped_count, s.vendor_count, s.open_exceptions,
  s.derived_status, s.stage_entered_at,
  COALESCE(pa.po_count, 0) AS po_count,
  COALESCE(pa.po_stages, '[]'::jsonb) AS po_stages,
  CASE
    WHEN s.derived_status = 'intake' THEN
      public.fulfillment_business_hours_between(s.intake_at, now()) > (SELECT split_confirm_hours FROM sla)
    WHEN s.derived_status = 'transmitted' AND ch.chase_days IS NOT NULL THEN
      ch.chase_days >= (SELECT ack_chase_days FROM sla)
    ELSE false
  END AS breached,
  GREATEST(public.fulfillment_business_hours_between(s.stage_entered_at, now()), 0) AS stage_age_business_hours,
  CASE
    WHEN s.has_unmapped THEN 'assign_vendor'
    WHEN s.open_exceptions > 0 THEN 'resolve_exception'
    WHEN s.derived_status = 'intake' THEN 'confirm_split'
    WHEN s.derived_status = 'split' THEN 'transmit_pos'
    WHEN s.derived_status = 'transmitted' AND ch.chase_days IS NOT NULL
         AND ch.chase_days >= (SELECT ack_chase_days FROM sla)
      THEN 'chase_ack'
    WHEN s.derived_status = 'transmitted' THEN 'awaiting_ack'
    WHEN s.derived_status IN ('acknowledged','in_production') THEN 'in_production'
    WHEN s.derived_status = 'shipped' THEN 'in_transit'
    WHEN s.derived_status = 'delivered' THEN 'awaiting_settlement'
    ELSE 'review'
  END AS next_action_kind,
  jsonb_build_object(
    'unmapped_count', s.unmapped_count,
    'exception_count', s.open_exceptions,
    'po_count', COALESCE(pa.po_count, 0),
    'days_overdue', CASE
      WHEN s.derived_status = 'transmitted' AND ch.chase_days IS NOT NULL
           AND ch.chase_days >= (SELECT ack_chase_days FROM sla)
        THEN ch.chase_days
      ELSE NULL
    END,
    -- surname for the "Chase {surname} — day N" verb (spec §5.3 / presentation).
    -- Last whitespace token, else the full single-token name; original case.
    'client_surname', CASE
      WHEN array_length(regexp_split_to_array(btrim(s.client_name), '\s+'), 1) > 1
        THEN (regexp_split_to_array(btrim(s.client_name), '\s+'))[array_length(regexp_split_to_array(btrim(s.client_name), '\s+'), 1)]
      ELSE btrim(s.client_name)
    END
  ) AS next_action_params,
  CASE
    WHEN s.has_unmapped OR s.open_exceptions > 0 THEN 'needs_action_now'
    WHEN s.derived_status IN ('intake','split') THEN 'needs_action_now'
    WHEN s.derived_status = 'transmitted' AND ch.chase_days IS NOT NULL
         AND ch.chase_days >= (SELECT ack_chase_days FROM sla)
      THEN 'needs_action_now'
    WHEN s.derived_status IN ('transmitted','acknowledged','in_production','shipped') THEN 'watching'
    ELSE 'quiet'
  END AS band
FROM public.fulfillment_order_status_v s
LEFT JOIN chase ch ON ch.order_id = s.order_id
LEFT JOIN po_agg pa ON pa.order_id = s.order_id
WHERE s.derived_status IS DISTINCT FROM 'settled';

GRANT SELECT ON public.fulfillment_queue_v TO authenticated, agent_reader, service_role;

-- ─── client_order_status_v — enrich for the iOS derived-status API (S4 gap) ──
-- S4 (notifications + derived-status API) flagged that the S0 cut exposed only
-- {order_id, order_no, intake_at, client_status} — so the iOS status endpoint
-- returned eta=null and a timeline with null stage times. Additively append
-- CLIENT-SAFE columns (S3 is the sole Wave-E migration writer; S4 correctly did
-- not touch schema): an order-level ETA (the date the ack re-dating maintains,
-- derived from the latest committed ship / shipment ETA across the order) and
-- per-stage timestamps in the client vocabulary. Still a DEFINER view scoped to
-- own rows (auth.uid()); NO vendor / PO / cost columns cross it (§6 boundary) —
-- only order-level dates. CREATE OR REPLACE keeps the first four columns in place
-- and appends the new ones (Postgres view-replace rule).
CREATE OR REPLACE VIEW public.client_order_status_v
WITH (security_invoker = false) AS
WITH po_agg AS (
  SELECT order_id,
         min(created_at)     AS confirmed_at,     -- split-confirm (POs created)
         min(acked_at)       AS in_production_at, -- first vendor ack → production
         max(committed_ship) AS max_committed_ship
  FROM public.fulfillment_vendor_pos
  GROUP BY order_id
),
ship_agg AS (
  SELECT p.order_id,
         min(sh.shipped_at)   AS shipped_at,
         max(sh.delivered_at) AS delivered_at,
         max(sh.current_eta)  AS max_current_eta
  FROM public.fulfillment_shipments sh
  JOIN public.fulfillment_vendor_pos p ON p.id = sh.po_id
  GROUP BY p.order_id
)
SELECT
  o.id AS order_id, o.order_no, o.intake_at,
  CASE s.derived_status
    WHEN 'intake' THEN 'confirmed' WHEN 'split' THEN 'confirmed'
    WHEN 'transmitted' THEN 'confirmed' WHEN 'acknowledged' THEN 'in_production'
    WHEN 'in_production' THEN 'in_production' WHEN 'shipped' THEN 'shipped'
    WHEN 'delivered' THEN 'delivered' WHEN 'exception' THEN 'delayed'
    ELSE 'confirmed'
  END AS client_status,
  -- Order-level client ETA: the latest expected arrival across the order (the
  -- order is complete when the last vendor's item lands). GREATEST skips NULLs.
  GREATEST(pa.max_committed_ship, sa.max_current_eta) AS eta,
  pa.confirmed_at,
  pa.in_production_at,
  sa.shipped_at,
  sa.delivered_at
FROM public.fulfillment_orders o
JOIN public.fulfillment_order_status_v s ON s.order_id = o.id
LEFT JOIN po_agg pa ON pa.order_id = o.id
LEFT JOIN ship_agg sa ON sa.order_id = o.id
WHERE o.client_profile_id = auth.uid();
COMMENT ON VIEW public.client_order_status_v IS
  'BOH (00353→00358): client-safe order status + timeline. DEFINER view (owner '
  'postgres) by design (D4) — bypasses admin-only base RLS; the own-row auth.uid() '
  'scope is the boundary. Do NOT switch to security_invoker. Client-safe columns '
  'only — order-level status/eta/stage timestamps, NEVER vendor/po/cost.';
REVOKE ALL ON public.client_order_status_v FROM public, anon;
GRANT SELECT ON public.client_order_status_v TO authenticated, service_role;
