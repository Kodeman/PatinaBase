-- ═══════════════════════════════════════════════════════════════════════════
-- 00361 — Back of House: Stripe balance-transaction reconciliation (R2.3, §8)
--
-- R2.3 ruled a REAL Stripe balance-transaction API pull in v1 (against the
-- recommendation, deliberately — same as R1.3): a daily sync (edge fn + pg_cron,
-- 00362) writes an APPEND-ONLY mirror of Stripe balance transactions; a daily
-- view reconciles ledger account 1000 (Cash — Stripe Clearing) against the
-- ACTUAL balance transactions — not webhook payloads — and nonzero deltas
-- surface in the Queue's Needs Action Now band.
--
-- What reconciles: only the 1000 movements that correspond to real Stripe money
-- flows — T1 capture DEBITS and T4 refund CREDITS (§8). T2 vendor-deposit and
-- T5 recovery 1000 movements are ACH/bank/claim flows, NOT Stripe, and are
-- excluded from the comparison. Stripe FEES are notated, never folded into 1000
-- (we Dr 1000 at gross capture; the reconciled figure is the gross `amount`).
--
-- The queue surfacing is a BAND PIN on affected orders, NOT a synthetic row:
-- a synthetic non-order row would break the zero-invisibility audit
-- (fulfillment_queue_bands.assert.sql Q1 — every non-settled order maps to
-- EXACTLY one queue row). A pin only changes an existing order's band, so Q1
-- holds by construction. Only orders that HAVE ≥1 matching balance tx are
-- reconciled — an order with no Stripe activity yet is "pending", not a delta,
-- so the standard seed set (no balance txs) produces ZERO pins and leaves
-- Q1–Q7 exactly as they were.
--
-- FIX-FORWARD (00358 is on origin/main): fulfillment_queue_v is redefined by
-- CREATE OR REPLACE VIEW grafted from its verbatim 00358 body + the recon CTE
-- and the two appended columns (Postgres view-replace: leading columns
-- unchanged, new columns appended only).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. stripe_balance_transactions — append-only mirror ────────────────────
-- payment_intent_id is the resolved PI (from the balance tx's source charge's
-- `payment_intent`), added beyond the task's minimum column list because a
-- balance tx's `source` is a CHARGE id, and pure-SQL charge→PI mapping is
-- impossible without a charges table — the sync fn / fixtures resolve it so the
-- recon view can join straight to fulfillment_orders.stripe_payment_intent_id.
CREATE TABLE IF NOT EXISTS public.stripe_balance_transactions (
  id                text PRIMARY KEY,                         -- Stripe balance txn id (txn_…), UNIQUE
  type              text NOT NULL,                            -- charge | refund | payout | adjustment | …
  amount_cents      integer NOT NULL,                         -- gross, signed (charge +, refund −)
  fee_cents         integer NOT NULL DEFAULT 0,
  net_cents         integer NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'usd',
  created           timestamptz NOT NULL,                     -- Stripe unix `created`, as timestamptz
  source_id         text,                                     -- source object id (ch_…, py_…, re_…)
  payment_intent_id text,                                     -- resolved PI — join key to BOH orders
  payout_id         text,
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stripe_balance_txns_pi      ON public.stripe_balance_transactions(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_balance_txns_created ON public.stripe_balance_transactions(created);
COMMENT ON TABLE public.stripe_balance_transactions IS
  'BOH (00361, R2.3): append-only mirror of Stripe balance transactions. INSERT via stripe_balance_tx_ingest (writer-guarded); UPDATE/DELETE raise. payment_intent_id is the resolved PI join key to fulfillment_orders.';

-- append-only: UPDATE/DELETE raise unconditionally (reuse the ledger idiom)
DROP TRIGGER IF EXISTS trg_stripe_balance_txns_append_only ON public.stripe_balance_transactions;
CREATE TRIGGER trg_stripe_balance_txns_append_only
  BEFORE UPDATE OR DELETE ON public.stripe_balance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.ledger_append_only();

-- INSERT gated by the writer guard (GUC='rpc' from stripe_balance_tx_ingest)
DROP TRIGGER IF EXISTS trg_stripe_balance_txns_writer_guard ON public.stripe_balance_transactions;
CREATE TRIGGER trg_stripe_balance_txns_writer_guard
  BEFORE INSERT ON public.stripe_balance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_writer_guard();

-- ─── 2. stripe_recon_cursor — 1-row sync cursor ────────────────────────────
-- Advanced by the ingest RPC to the newest balance-tx `created` seen (the
-- Stripe list endpoint pages by `created`/`starting_after`). NOT writer-guarded
-- — same posture as fulfillment_event_mirror_cursor (00351): written only by the
-- definer ingest RPC.
CREATE TABLE IF NOT EXISTS public.stripe_recon_cursor (
  id             boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_txn_id    text,
  last_created   timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.stripe_recon_cursor (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- cursor read helper — the edge fn pulls balance txns created after this epoch
CREATE OR REPLACE FUNCTION public.stripe_recon_cursor_epoch()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT extract(epoch FROM last_created)::bigint FROM public.stripe_recon_cursor WHERE id = true; $$;
REVOKE ALL ON FUNCTION public.stripe_recon_cursor_epoch() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_recon_cursor_epoch() TO service_role;

-- ─── 3. stripe_balance_tx_ingest — the append-only upsert RPC ───────────────
-- The edge fn (00362) calls this via service_role with a batch of normalized
-- balance transactions. Sets the writer GUC, inserts ON CONFLICT (id) DO NOTHING
-- (append-only — a re-sync of the same window is a pure no-op), advances the
-- cursor to the newest `created` seen. p_txns: [{id,type,amount_cents,fee_cents,
-- net_cents,currency,created(ISO or epoch),source_id,payment_intent_id,payout_id,raw}].
CREATE OR REPLACE FUNCTION public.stripe_balance_tx_ingest(p_txns jsonb, p_cursor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t          jsonb;
  v_ingested int := 0;
  v_created  timestamptz;
  v_max      timestamptz;
  v_last_id  text;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  FOR t IN SELECT * FROM jsonb_array_elements(COALESCE(p_txns,'[]'::jsonb)) LOOP
    -- `created` accepts an ISO timestamptz string or a Stripe unix epoch (number/string)
    v_created := CASE
      WHEN (t->>'created') ~ '^[0-9]+$' THEN to_timestamp((t->>'created')::bigint)
      ELSE (t->>'created')::timestamptz
    END;
    INSERT INTO public.stripe_balance_transactions
      (id, type, amount_cents, fee_cents, net_cents, currency, created,
       source_id, payment_intent_id, payout_id, raw)
    VALUES (
      t->>'id', COALESCE(t->>'type','unknown'),
      COALESCE((t->>'amount_cents')::int, 0),
      COALESCE((t->>'fee_cents')::int, 0),
      COALESCE((t->>'net_cents')::int, 0),
      COALESCE(t->>'currency','usd'),
      v_created,
      t->>'source_id', t->>'payment_intent_id', t->>'payout_id',
      COALESCE(t->'raw','{}'::jsonb)
    )
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN v_ingested := v_ingested + 1; END IF;
    IF v_max IS NULL OR v_created > v_max THEN v_max := v_created; v_last_id := t->>'id'; END IF;
  END LOOP;

  UPDATE public.stripe_recon_cursor
     SET last_txn_id    = COALESCE(NULLIF(p_cursor,''), v_last_id, last_txn_id),
         last_created   = GREATEST(last_created, v_max),
         last_synced_at = now()
   WHERE id = true;

  RETURN jsonb_build_object('ingested', v_ingested, 'cursor', COALESCE(NULLIF(p_cursor,''), v_last_id));
END;
$$;
REVOKE ALL ON FUNCTION public.stripe_balance_tx_ingest(jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_balance_tx_ingest(jsonb, text) TO service_role;

-- ─── 4. ledger_stripe_recon_v — day-bucketed reconciliation (§8) ────────────
-- Compares account 1000 activity (T1 debits + T4 credits, tied to BOH orders)
-- against balance transactions tied to those orders' PIs, per day. delta_cents =
-- ledger 1000 net − Stripe gross amount. Fees are notated (stripe_fee_cents),
-- never reconciled into 1000.
CREATE OR REPLACE VIEW public.ledger_stripe_recon_v AS
WITH ledger_1000 AS (
  SELECT (le.posted_at)::date        AS day,
         sum(ll.debit_cents)         AS ledger_debit_cents,
         sum(ll.credit_cents)        AS ledger_credit_cents,
         sum(ll.debit_cents - ll.credit_cents) AS ledger_net_cents
  FROM public.ledger_entries le
  JOIN public.ledger_lines   ll ON ll.entry_id = le.id
  WHERE ll.account_code = '1000' AND le.refs->>'template' IN ('T1','T4')
  GROUP BY (le.posted_at)::date
),
stripe AS (
  SELECT (bt.created)::date  AS day,
         sum(bt.amount_cents) AS stripe_amount_cents,
         sum(bt.fee_cents)    AS stripe_fee_cents,
         sum(bt.net_cents)    AS stripe_net_cents,
         count(*)             AS stripe_txn_count
  FROM public.stripe_balance_transactions bt
  JOIN public.fulfillment_orders o ON o.stripe_payment_intent_id = bt.payment_intent_id
  GROUP BY (bt.created)::date
)
SELECT
  COALESCE(l.day, s.day)                     AS day,
  COALESCE(l.ledger_net_cents, 0)            AS ledger_1000_cents,
  COALESCE(l.ledger_debit_cents, 0)          AS ledger_debit_cents,
  COALESCE(l.ledger_credit_cents, 0)         AS ledger_credit_cents,
  COALESCE(s.stripe_amount_cents, 0)         AS stripe_amount_cents,
  COALESCE(s.stripe_fee_cents, 0)            AS stripe_fee_cents,        -- notated, not reconciled
  COALESCE(s.stripe_net_cents, 0)            AS stripe_net_cents,
  COALESCE(s.stripe_txn_count, 0)            AS stripe_txn_count,
  COALESCE(l.ledger_net_cents, 0) - COALESCE(s.stripe_amount_cents, 0) AS delta_cents
FROM ledger_1000 l
FULL OUTER JOIN stripe s ON s.day = l.day
ORDER BY 1;
COMMENT ON VIEW public.ledger_stripe_recon_v IS
  'BOH (00361, R2.3): daily Stripe reconciliation — ledger account 1000 (T1 debits + T4 credits) vs Stripe balance-transaction gross amount, per day. delta_cents nonzero → a real cash/Stripe mismatch; the queue pins the affected orders to needs_action_now. Fees notated, not reconciled.';

-- ─── 5. fulfillment_queue_v — add the recon band pin (graft of 00358 body) ──
-- Everything here is the verbatim 00358 queue_v body EXCEPT: (a) the `recon` CTE;
-- (b) a top-priority 'reconcile_stripe' branch in next_action_kind + the band
-- CASE; (c) recon_delta_cents threaded into next_action_params; (d) the two
-- appended columns recon_delta_cents / has_recon_delta. Leading column list is
-- byte-identical to 00358 (view-replace rule).
CREATE OR REPLACE VIEW public.fulfillment_queue_v
WITH (security_invoker = true) AS
WITH sent_po AS (
  SELECT order_id, MIN(transmitted_at) AS oldest_sent_at
  FROM public.fulfillment_vendor_pos
  WHERE status = 'sent'
  GROUP BY order_id
),
chase AS (
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
),
recon AS (
  -- per-order Stripe reconciliation delta (00361): ledger 1000 net (T1 Dr + T4
  -- Cr) − Σ balance-tx amount for the order's PI. Only orders WITH ≥1 matching
  -- balance tx are reconciled (no tx yet = pending, not a delta). Nonzero → pin.
  SELECT os.order_id,
         (COALESCE(ol.ledger_net, 0) - os.stripe_amount) AS recon_delta_cents
  FROM (
    SELECT o.id AS order_id, sum(bt.amount_cents) AS stripe_amount
    FROM public.stripe_balance_transactions bt
    JOIN public.fulfillment_orders o ON o.stripe_payment_intent_id = bt.payment_intent_id
    GROUP BY o.id
  ) os
  LEFT JOIN (
    SELECT (le.refs->>'order_id')::uuid AS order_id,
           sum(ll.debit_cents - ll.credit_cents) AS ledger_net
    FROM public.ledger_entries le
    JOIN public.ledger_lines   ll ON ll.entry_id = le.id
    WHERE ll.account_code = '1000' AND le.refs->>'template' IN ('T1','T4')
    GROUP BY (le.refs->>'order_id')::uuid
  ) ol ON ol.order_id = os.order_id
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
    WHEN rc.recon_delta_cents IS NOT NULL AND rc.recon_delta_cents <> 0 THEN 'reconcile_stripe'
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
    'client_surname', CASE
      WHEN array_length(regexp_split_to_array(btrim(s.client_name), '\s+'), 1) > 1
        THEN (regexp_split_to_array(btrim(s.client_name), '\s+'))[array_length(regexp_split_to_array(btrim(s.client_name), '\s+'), 1)]
      ELSE btrim(s.client_name)
    END,
    'recon_delta_cents', rc.recon_delta_cents
  ) AS next_action_params,
  CASE
    WHEN rc.recon_delta_cents IS NOT NULL AND rc.recon_delta_cents <> 0 THEN 'needs_action_now'
    WHEN s.has_unmapped OR s.open_exceptions > 0 THEN 'needs_action_now'
    WHEN s.derived_status IN ('intake','split') THEN 'needs_action_now'
    WHEN s.derived_status = 'transmitted' AND ch.chase_days IS NOT NULL
         AND ch.chase_days >= (SELECT ack_chase_days FROM sla)
      THEN 'needs_action_now'
    WHEN s.derived_status IN ('transmitted','acknowledged','in_production','shipped') THEN 'watching'
    ELSE 'quiet'
  END AS band,
  COALESCE(rc.recon_delta_cents, 0) AS recon_delta_cents,
  (rc.recon_delta_cents IS NOT NULL AND rc.recon_delta_cents <> 0) AS has_recon_delta
FROM public.fulfillment_order_status_v s
LEFT JOIN chase ch ON ch.order_id = s.order_id
LEFT JOIN po_agg pa ON pa.order_id = s.order_id
LEFT JOIN recon rc ON rc.order_id = s.order_id
WHERE s.derived_status IS DISTINCT FROM 'settled';

GRANT SELECT ON public.fulfillment_queue_v TO authenticated, agent_reader, service_role;

-- ─── 6. RLS + grants for the two new tables (00335 idiom) ───────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stripe_balance_transactions','stripe_recon_cursor'] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select_admin ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_select_admin ON public.%1$s FOR SELECT TO authenticated
         USING (EXISTS (SELECT 1 FROM public.user_roles ur
                        JOIN public.roles r ON ur.role_id = r.id
                        WHERE ur.user_id = auth.uid() AND r.domain = ''admin''));', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select_agent_reader ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_select_agent_reader ON public.%1$s FOR SELECT TO agent_reader USING (true);', t);
    EXECUTE format('REVOKE ALL ON public.%1$s FROM public, anon;', t);
    EXECUTE format('GRANT SELECT ON public.%1$s TO authenticated, agent_reader;', t);
    EXECUTE format('GRANT ALL ON public.%1$s TO service_role;', t);
  END LOOP;
END $$;

-- recon view visibility: admin/agent_reader via base-RLS is not enough for a
-- plain (invoker) view over ledger + orders — grant SELECT explicitly.
GRANT SELECT ON public.ledger_stripe_recon_v TO authenticated, agent_reader, service_role;
