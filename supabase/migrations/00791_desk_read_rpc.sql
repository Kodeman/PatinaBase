-- ═══════════════════════════════════════════════════════════════════════════
-- 00791 — desk_read: every Desk feed in one SECURITY INVOKER read (US-34 N8)
--
-- Plan row N8 (portal-responsiveness 2026-10-14, review E2-8 + E2-4). Before
-- this, useDeskEngagements made 24 PostgREST reads per run, one
-- is_org_admin_or_owner call per studio inside the held-PO read, and then one
-- procurement_claim_deadline call per live PO after the batch (the N+1). The
-- Desk re-runs all of it every 60 s. desk_read answers the same feeds in one
-- request.
--
-- RLS PARITY. SECURITY INVOKER: every select below runs under the caller's
-- RLS, exactly as the PostgREST reads did. Each embed is a correlated
-- subquery under the same RLS, so a row the caller cannot read embeds as
-- NULL (to-one) or drops out (to-many), as PostgREST does; the `!inner`
-- embeds are inner joins. The only definers it calls are the two the client
-- already called, with their own predicates: procurement_claim_deadline
-- (00700, purchase_orders_studio_read's predicate) and
-- is_org_admin_or_owner (00484, the caller's own seat). Nothing widens.
-- supabase/tests/desk_read_test.sql proves parity for an owner, a co-member
-- and an outsider.
--
-- SHAPE. One jsonb object, one key per feed. A feed is an array of rows in
-- the shape PostgREST returned (same columns, same embed aliases, same
-- order), so the client's buildDesk* folds are unchanged. Two feeds are new:
--   claim_deadlines  [{purchase_order_id, vendor_deadline}] for every PO in
--                    claim_notices with a drafted claim (the client keeps the
--                    rest of the live-window rule);
--   held             the HeldPurchaseOrder shape (camelCase) with the
--                    viewer's release seat per row.
-- Each feed runs in its own exception block: a failing feed answers
-- {"error": ..., "code": ...} and the rest still answer ("The Desk never dies
-- on a side feed"). The client reads a non-array as "not checked".
--
-- SCOPE. p_engagement_id NULL reads the whole Desk. A value scopes the read
-- to that engagement: engagements to its document_state row, project feeds
-- to its project_id, flagged lines to its proposal_id, ceremonies to its
-- lead or relationship, leads to its lead_id. delivery_events stays
-- desk-wide in both modes, because an install collision is cross-project.
--
-- CONSTANTS mirror apps/designer-portal/src/hooks/use-desk-engagements.ts
-- (DESK_*_LIMIT, CONFLICT_WINDOW_DAYS, DESK_CLAIM_NOTICE_DAYS) and
-- desk-derivation.ts (RETURN_BY_LEAD_DAYS 3, LANDED_PAYMENT_DAYS 7). The
-- client still applies its truncation checks with the same numbers;
-- use-desk-engagements.test.tsx fails if the two drift. Dates are UTC days,
-- as the client's toISOString().slice(0, 10) was.
--
-- Grants: authenticated only (an anon or service-role call has no Desk).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.desk_read(p_engagement_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now          timestamptz := now();
  v_today        date := (now() AT TIME ZONE 'UTC')::date;
  v_all          boolean := p_engagement_id IS NULL;
  v_project_id   uuid;
  v_proposal_id  uuid;
  v_lead_id      uuid;
  v_claims       jsonb;
  v_out          jsonb := '{}'::jsonb;
BEGIN
  -- ── engagements: document_state, newest first ───────────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('engagements', (
      SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.updated_at DESC), '[]'::jsonb)
      FROM public.document_state AS d
      WHERE v_all OR d.engagement_id = p_engagement_id
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('engagements',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  IF NOT v_all AND jsonb_typeof(v_out->'engagements') = 'array' THEN
    v_project_id  := (v_out->'engagements'->0->>'project_id')::uuid;
    v_proposal_id := (v_out->'engagements'->0->>'proposal_id')::uuid;
    v_lead_id     := (v_out->'engagements'->0->>'lead_id')::uuid;
  END IF;

  -- ── delivery_events in the conflict window (desk-wide: collisions are
  --    cross-project) ───────────────────────────────────────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('delivery_events', (
      SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
      FROM public.delivery_events AS e
      WHERE e.event_date >= v_today
        AND e.event_date <= v_today + 120
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('delivery_events',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── receivables: open invoices (R36) ────────────────────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('receivables', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'project_id', i.project_id, 'status', i.status,
               'due_date', i.due_date, 'total_cents', i.total_cents,
               'amount_paid_cents', i.amount_paid_cents,
               'invoice_number', i.invoice_number,
               'ar_last_chased_at', i.ar_last_chased_at)), '[]'::jsonb)
      FROM public.invoices AS i
      WHERE i.status IN ('sent', 'partially_paid')
        AND (v_all OR i.project_id = v_project_id)
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('receivables',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── flagged_lines: unresolved per-line rejections (C4) ──────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('flagged_lines', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'proposal_items', jsonb_build_object(
                 'proposal_id', pi.proposal_id,
                 'proposals', jsonb_build_object('title', pr.title)))), '[]'::jsonb)
      FROM public.item_feedback AS f
      JOIN public.proposal_items AS pi ON pi.id = f.proposal_item_id
      JOIN public.proposals AS pr ON pr.id = pi.proposal_id
      WHERE f.verdict = 'rejected'
        AND f.resolved_at IS NULL
        AND (v_all OR pi.proposal_id = v_proposal_id)
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('flagged_lines',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── flagged_board_pins: unresolved board-pin rejections (B4) ────────────
  BEGIN
    v_out := v_out || jsonb_build_object('flagged_board_pins', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'proposal_board_items', jsonb_build_object(
                 'proposal_boards', jsonb_build_object(
                   'proposal_id', b.proposal_id,
                   'proposals', jsonb_build_object('title', pr.title))))), '[]'::jsonb)
      FROM public.item_feedback AS f
      JOIN public.proposal_board_items AS bi ON bi.id = f.board_item_id
      JOIN public.proposal_boards AS b ON b.id = bi.board_id
      JOIN public.proposals AS pr ON pr.id = b.proposal_id
      WHERE f.verdict = 'rejected'
        AND f.resolved_at IS NULL
        AND (v_all OR b.proposal_id = v_proposal_id)
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('flagged_board_pins',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── ceremonies: the designer's match_ceremonies (R106) ──────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('ceremonies', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', mc.id, 'lead_id', mc.lead_id,
               'designer_client_id', mc.designer_client_id, 'state', mc.state,
               'intro_text', mc.intro_text, 'offered_slots', mc.offered_slots,
               'offered_at', mc.offered_at,
               'picked_slot_starts_at', mc.picked_slot_starts_at,
               'timezone', mc.timezone, 'thread_id', mc.thread_id,
               'created_at', mc.created_at)), '[]'::jsonb)
      FROM public.match_ceremonies AS mc
      WHERE v_all
         OR mc.lead_id = v_lead_id
         OR mc.designer_client_id = p_engagement_id
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('ceremonies',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── phases (R108), capped at DESK_PHASE_LIMIT ───────────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('phases', (
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT ph.id, ph.project_id, ph.name, ph.phase_key, ph.status,
               ph.sort_order, ph.lane, ph.duration_days, ph.duration_weeks,
               ph.follows_phase_id, ph.anchor_date, ph.start_date,
               ph.target_end_date
        FROM public.project_phases AS ph
        WHERE v_all OR ph.project_id = v_project_id
        ORDER BY ph.project_id
        LIMIT 2000
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('phases',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── milestones, capped at DESK_MILESTONE_LIMIT ──────────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('milestones', (
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT m.id, m.phase_id, m.name, m.kind, m.offset_days, m.anchor_date,
               m.status, m.sort_order
        FROM public.schedule_milestones AS m
        WHERE v_all
           OR m.phase_id IN (SELECT ph.id FROM public.project_phases AS ph
                             WHERE ph.project_id = v_project_id)
        ORDER BY m.phase_id
        LIMIT 500
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('milestones',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── project_starts: the forward-compute origin (R100) ───────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('project_starts', (
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT p.id, p.start_date
        FROM public.projects AS p
        WHERE v_all OR p.id = v_project_id
        LIMIT 2000
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('project_starts',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── schedule_proposals: live, newest first (R109/R110) ──────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('schedule_proposals', (
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT sp.id, sp.project_id, sp.source_event,
               sp.conflicts_with_committed, sp.created_at
        FROM public.schedule_proposals AS sp
        WHERE sp.state = 'proposed'
          AND (v_all OR sp.project_id = v_project_id)
        ORDER BY sp.created_at DESC
        LIMIT 500
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('schedule_proposals',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── claim_notices: claim_window_closing in the last 60 days (C-20) ──────
  BEGIN
    v_claims := (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object('purchase_order', (
                 SELECT jsonb_build_object(
                   'id', po.id, 'project_id', po.project_id,
                   'po_number', po.po_number,
                   'vendor_po_number', po.vendor_po_number,
                   'sidemark', po.sidemark,
                   'vendor', (SELECT jsonb_build_object('name', v.name)
                              FROM public.vendors AS v WHERE v.id = po.vendor_id),
                   'inspections', (
                     SELECT coalesce(jsonb_agg(jsonb_build_object(
                              'outcome', ri.outcome,
                              'inspected_at', ri.inspected_at,
                              'claims', (
                                SELECT coalesce(jsonb_agg(jsonb_build_object('state', dc.state)), '[]'::jsonb)
                                FROM public.damage_claims AS dc
                                WHERE dc.receiving_inspection_id = ri.id))), '[]'::jsonb)
                     FROM public.receiving_inspections AS ri
                     WHERE ri.purchase_order_id = po.id))
                 FROM public.purchase_orders AS po
                 WHERE po.id = n.subject_purchase_order_id)) AS j
        FROM public.procurement_notifications AS n
        WHERE n.kind = 'claim_window_closing'
          AND n.created_at >= v_now - interval '60 days'
          AND (v_all OR EXISTS (
                SELECT 1 FROM public.purchase_orders AS po
                WHERE po.id = n.subject_purchase_order_id
                  AND po.project_id = v_project_id))
        ORDER BY n.created_at DESC
        LIMIT 200
      ) AS x
    );
    v_out := v_out || jsonb_build_object('claim_notices', v_claims);
  EXCEPTION WHEN others THEN
    v_claims := NULL;
    v_out := v_out || jsonb_build_object('claim_notices',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── claim_deadlines: the old per-PO N+1, as one set (E2-4) ──────────────
  BEGIN
    v_out := v_out || jsonb_build_object('claim_deadlines', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'purchase_order_id', c.po_id,
               'vendor_deadline', dl.vendor_deadline)), '[]'::jsonb)
      FROM (
        SELECT DISTINCT (n->'purchase_order'->>'id')::uuid AS po_id
        FROM jsonb_array_elements(coalesce(v_claims, '[]'::jsonb)) AS n
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce(n->'purchase_order'->'inspections', '[]'::jsonb)) AS i,
               jsonb_array_elements(coalesce(i->'claims', '[]'::jsonb)) AS cl
          WHERE cl->>'state' = 'drafted')
      ) AS c
      LEFT JOIN LATERAL public.procurement_claim_deadline(c.po_id) AS dl ON true
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('claim_deadlines',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── payment_notices: due/failed notices on an open payment (C-22) ───────
  BEGIN
    v_out := v_out || jsonb_build_object('payment_notices', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'kind', n.kind,
                 'payment', jsonb_build_object(
                   'id', pay.id, 'kind', pay.kind, 'state', pay.state,
                   'due_date', pay.due_date, 'amount_cents', pay.amount_cents,
                   'stripe_checkout_session_id', pay.stripe_checkout_session_id,
                   'stripe_payment_intent_id', pay.stripe_payment_intent_id),
                 'purchase_order', (
                   SELECT jsonb_build_object(
                     'id', po.id, 'project_id', po.project_id,
                     'po_number', po.po_number,
                     'vendor_po_number', po.vendor_po_number,
                     'sidemark', po.sidemark,
                     'is_patina_catalog', po.is_patina_catalog,
                     'vendor', (SELECT jsonb_build_object('name', v.name)
                                FROM public.vendors AS v WHERE v.id = po.vendor_id))
                   FROM public.purchase_orders AS po
                   WHERE po.id = n.subject_purchase_order_id)) AS j
        FROM public.procurement_notifications AS n
        JOIN public.po_payments AS pay
          ON pay.id = n.subject_payment_id
         AND pay.state IN ('pending', 'due')
        WHERE n.kind IN ('deposit_due', 'balance_due', 'milestone_due', 'payment_failed')
          AND (v_all OR EXISTS (
                SELECT 1 FROM public.purchase_orders AS po
                WHERE po.id = n.subject_purchase_order_id
                  AND po.project_id = v_project_id))
        ORDER BY n.created_at DESC
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('payment_notices',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── returns: live returnable purchases near return-by (C-25) ────────────
  BEGIN
    v_out := v_out || jsonb_build_object('returns', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'id', sp.id, 'project_id', sp.project_id,
                 'description', sp.description, 'payee_name', sp.payee_name,
                 'return_by', sp.return_by,
                 'ffe_item', (SELECT jsonb_build_object(
                                'status', fi.status,
                                'received_quantity', fi.received_quantity)
                              FROM public.project_ffe_items AS fi
                              WHERE fi.id = sp.ffe_item_id)) AS j
        FROM public.studio_purchases AS sp
        WHERE sp.status IN ('recorded', 'billed')
          AND sp.returnable = true
          AND sp.returned_on IS NULL
          AND sp.return_by >= v_today - 1
          AND sp.return_by <= v_today + 4   -- RETURN_BY_LEAD_DAYS + 1
          AND (v_all OR sp.project_id = v_project_id)
        ORDER BY sp.return_by
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('returns',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── drafts: procurement letters awaiting review or sending (C-28) ───────
  BEGIN
    v_out := v_out || jsonb_build_object('drafts', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'id', d.id, 'project_id', d.project_id,
                 'purchase_order_id', d.purchase_order_id, 'kind', d.kind,
                 'status', d.status, 'to_email', d.to_email,
                 'subject', d.subject, 'body', d.body,
                 'created_at', d.created_at, 'updated_at', d.updated_at,
                 'ffe_item', (
                   SELECT jsonb_build_object(
                     'id', fi.id, 'vendor_id', fi.vendor_id,
                     'vendor_name', fi.vendor_name,
                     'product', (SELECT jsonb_build_object('brand', pr.brand)
                                 FROM public.products AS pr
                                 WHERE pr.id = fi.product_id),
                     'purchase_order', (
                       SELECT jsonb_build_object(
                         'vendor_id', po.vendor_id, 'po_number', po.po_number,
                         'vendor_po_number', po.vendor_po_number,
                         'vendor', (SELECT jsonb_build_object('name', v.name)
                                    FROM public.vendors AS v
                                    WHERE v.id = po.vendor_id))
                       FROM public.purchase_orders AS po
                       WHERE po.id = fi.purchase_order_id))
                   FROM public.project_ffe_items AS fi
                   WHERE fi.id = d.ffe_item_id)) AS j
        FROM public.procurement_drafts AS d
        WHERE d.status IN ('awaiting_review', 'sending')
          AND (v_all OR d.project_id = v_project_id)
        ORDER BY d.created_at
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('drafts',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── outbound_drafts: staged outbound letters (US-31 B5a) ────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('outbound_drafts', (
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT od.id, od.organization_id, od.project_id, od.kind, od.channel,
               od.recipient_kind, od.status, od.to_address, od.subject,
               od.body, od.created_at, od.updated_at, od.claimed_at
        FROM public.outbound_drafts AS od
        WHERE od.status IN ('awaiting_review', 'sending')
          AND (v_all OR od.project_id = v_project_id)
        ORDER BY od.created_at
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('outbound_drafts',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── quotes: live quotes near valid-until (C-29) ─────────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('quotes', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'id', q.id, 'project_id', q.project_id,
                 'quote_ref', q.quote_ref, 'valid_until', q.valid_until,
                 'vendor', (SELECT jsonb_build_object('name', v.name)
                            FROM public.vendors AS v WHERE v.id = q.vendor_id),
                 'lines', (
                   SELECT coalesce(jsonb_agg(jsonb_build_object(
                            'ffe_item', (SELECT jsonb_build_object(
                                           'purchase_order_id', fi.purchase_order_id,
                                           'removed_at', fi.removed_at)
                                         FROM public.project_ffe_items AS fi
                                         WHERE fi.id = ql.ffe_item_id))), '[]'::jsonb)
                   FROM public.vendor_quote_lines AS ql
                   WHERE ql.quote_id = q.id)) AS j
        FROM public.vendor_quotes AS q
        WHERE q.superseded_by IS NULL
          AND q.valid_until >= v_today - 1
          AND q.valid_until <= v_today + 2
          AND (v_all OR q.project_id = v_project_id)
        ORDER BY q.valid_until
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('quotes',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── exceptions: open, waiting for a path (C-30) ─────────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('exceptions', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'id', ex.id, 'project_id', ex.project_id, 'type', ex.type,
                 'status', ex.status, 'clock_due_on', ex.clock_due_on,
                 'purchase_order', (
                   SELECT jsonb_build_object(
                     'po_number', po.po_number,
                     'vendor_po_number', po.vendor_po_number,
                     'sidemark', po.sidemark,
                     'is_patina_catalog', po.is_patina_catalog)
                   FROM public.purchase_orders AS po
                   WHERE po.id = ex.purchase_order_id),
                 'ffe_item', (SELECT jsonb_build_object('name', fi.name)
                              FROM public.project_ffe_items AS fi
                              WHERE fi.id = ex.ffe_item_id)) AS j
        FROM public.procurement_exceptions AS ex
        WHERE ex.status = 'open'
          AND ex.type <> 'ack_discrepancy'
          AND (v_all OR ex.project_id = v_project_id)
        ORDER BY ex.opened_at
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('exceptions',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── held: POs held for release, with the viewer's seat (C-32) ───────────
  BEGIN
    v_out := v_out || jsonb_build_object('held', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'id', h.id,
                 'projectId', h.project_id,
                 'projectName', h.project->>'name',
                 'studioId', (h.project->>'studio_id')::uuid,
                 'vendorName', (SELECT v.name FROM public.vendors AS v
                                WHERE v.id = h.vendor_id),
                 'totalCents', coalesce(h.total_cents, 0),
                 'heldAt', h.held_at,
                 'heldByName', (SELECT pf.full_name FROM public.profiles AS pf
                                WHERE pf.id = h.held_by),
                 'holdNote', h.hold_note,
                 'viewerCanRelease', coalesce(
                   h.project->>'studio_id' IS NOT NULL
                   AND public.is_org_admin_or_owner((h.project->>'studio_id')::uuid),
                   false)) AS j
        FROM (
          SELECT po.id, po.project_id, po.vendor_id, po.total_cents,
                 po.held_at, po.held_by, po.hold_note,
                 (SELECT jsonb_build_object('name', p.name, 'studio_id', p.studio_id)
                  FROM public.projects AS p WHERE p.id = po.project_id) AS project
          FROM public.purchase_orders AS po
          WHERE po.status = 'held_for_release'
            AND (v_all OR po.project_id = v_project_id)
          ORDER BY po.held_at
          LIMIT 200
        ) AS h
        WHERE h.project_id IS NOT NULL
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('held',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── samples: still out with a return-by date (C-35) ─────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('samples', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'id', s.id, 'project_id', s.project_id, 'kind', s.kind,
                 'return_by', s.return_by,
                 'vendor', (SELECT jsonb_build_object('name', v.name)
                            FROM public.vendors AS v WHERE v.id = s.vendor_id)) AS j
        FROM public.sample_requests AS s
        WHERE s.status IN ('requested', 'received')
          AND s.return_by IS NOT NULL
          AND (v_all OR s.project_id = v_project_id)
        ORDER BY s.return_by
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('samples',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── live_proposals: every status on a live job, newest first (N3) ───────
  BEGIN
    v_out := v_out || jsonb_build_object('live_proposals', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'id', pr.id, 'project_id', pr.project_id, 'status', pr.status,
                 'title', pr.title, 'version', pr.version,
                 'parent_proposal_id', pr.parent_proposal_id,
                 'created_at', pr.created_at, 'signed_at', pr.signed_at,
                 'accepted_at', pr.accepted_at, 'declined_at', pr.declined_at,
                 'decline_reason', pr.decline_reason,
                 'client_feedback', pr.client_feedback,
                 'superseded_at', pr.superseded_at,
                 'replacement_proposal_id', pr.replacement_proposal_id,
                 'items', (
                   SELECT coalesce(jsonb_agg(jsonb_build_object(
                            'ffe', (
                              SELECT coalesce(jsonb_agg(jsonb_build_object(
                                       'purchase_order_id', fi.purchase_order_id,
                                       'removed_at', fi.removed_at)), '[]'::jsonb)
                              FROM public.project_ffe_items AS fi
                              WHERE fi.source_proposal_item_id = pi.id))), '[]'::jsonb)
                   FROM public.proposal_items AS pi
                   WHERE pi.proposal_id = pr.id)) AS j
        FROM public.proposals AS pr
        WHERE pr.project_id IS NOT NULL
          AND (v_all OR pr.project_id = v_project_id)
        ORDER BY pr.created_at DESC
        LIMIT 500
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('live_proposals',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── paid_invoices: landed in LANDED_PAYMENT_DAYS + 1 (N3) ───────────────
  BEGIN
    v_out := v_out || jsonb_build_object('paid_invoices', (
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT i.id, i.project_id, i.invoice_number, i.title, i.total_cents,
               i.amount_paid_cents, i.paid_at
        FROM public.invoices AS i
        WHERE i.status = 'paid'
          AND i.paid_at >= v_now - interval '8 days'
          AND (v_all OR i.project_id = v_project_id)
        ORDER BY i.paid_at DESC
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('paid_invoices',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── paid_po_payments: maker payments in the same window (N3) ────────────
  BEGIN
    v_out := v_out || jsonb_build_object('paid_po_payments', (
      SELECT coalesce(jsonb_agg(x.j), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'id', pay.id, 'kind', pay.kind,
                 'amount_cents', pay.amount_cents, 'paid_date', pay.paid_date,
                 'purchase_order', (
                   SELECT jsonb_build_object(
                     'project_id', po.project_id, 'po_number', po.po_number,
                     'vendor_po_number', po.vendor_po_number,
                     'sidemark', po.sidemark,
                     'vendor', (SELECT jsonb_build_object('name', v.name)
                                FROM public.vendors AS v WHERE v.id = po.vendor_id))
                   FROM public.purchase_orders AS po
                   WHERE po.id = pay.purchase_order_id)) AS j
        FROM public.po_payments AS pay
        WHERE pay.state = 'paid'
          AND pay.paid_date >= v_today - 8
          AND (v_all OR EXISTS (
                SELECT 1 FROM public.purchase_orders AS po
                WHERE po.id = pay.purchase_order_id
                  AND po.project_id = v_project_id))
        ORDER BY pay.paid_date DESC
        LIMIT 200
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('paid_po_payments',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── sent_purchase_orders: sent and still in play (N3) ───────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('sent_purchase_orders', (
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT po.id, po.project_id, po.po_number, po.vendor_po_number,
               po.sidemark, po.sent_at, po.acknowledged_at
        FROM public.purchase_orders AS po
        WHERE po.sent_at IS NOT NULL
          AND NOT (po.status IN ('delivered', 'cancelled'))
          AND (v_all OR po.project_id = v_project_id)
        ORDER BY po.sent_at
        LIMIT 500
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('sent_purchase_orders',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  -- ── leads: open leads' arrival and contact name (N6) ────────────────────
  BEGIN
    v_out := v_out || jsonb_build_object('leads', (
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT l.id, l.created_at, l.contact_name
        FROM public.leads AS l
        WHERE l.status IN ('new', 'viewed', 'contacted')
          AND (v_all OR l.id = v_lead_id)
        ORDER BY l.created_at
        LIMIT 500
      ) AS x
    ));
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('leads',
      jsonb_build_object('error', SQLERRM, 'code', SQLSTATE));
  END;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.desk_read(uuid) IS
  'Every Desk feed in one read (00791, US-34 N8): one jsonb key per feed, each an array of '
  'rows in the PostgREST shape useDeskEngagements read before, or {error, code} when that feed '
  'failed. SECURITY INVOKER: every row is one the caller''s RLS already admits. '
  'p_engagement_id NULL reads the whole Desk; a value scopes each feed to that engagement '
  '(delivery_events stays desk-wide: install collisions are cross-project).';

REVOKE ALL ON FUNCTION public.desk_read(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.desk_read(uuid) TO authenticated;

COMMIT;
