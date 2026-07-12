-- ═══════════════════════════════════════════════════════════════════════════
-- 00308 — Agent OS WP-2.3: Transaction Tracker (concierge order lifecycle)
--
-- Mission Control gets a third operational surface — /mission-control/orders —
-- alongside the Approval Inbox (WP-1.1), Run Log (WP-1.4) and Pipeline boards
-- (WP-2.2). A concierge_order is a Rail-A furniture order Patina coordinates
-- end-to-end through a checklist-gated lifecycle:
--
--   po_draft -> po_sent -> freight_booked -> in_transit -> delivered
--            -> reconciled                     (+ cancelled, from any non-terminal)
--
-- Per-stage checklists are transcribed from the concierge-order-playbook skill.
-- The SQL immutable fn concierge_checklist_template(stage) is the SINGLE source
-- of truth for those checklists — a BEFORE INSERT trigger seeds the initial
-- stage's list, and advance_concierge_order() seeds the next stage's list on
-- each hop; the client renders labels straight from the stored jsonb (no
-- duplicated client-side template).
--
-- ── Single stage-move write path (invariant) ────────────────────────────────
-- move_pipeline_stage (00305) DELIBERATELY still RAISEs for concierge_order —
-- concierge orders move ONLY via advance_concierge_order() here, which carries
-- checklist-gating logic move_pipeline_stage lacks. advance_concierge_order
-- writes pipeline_stage_events rows itself (entity_type='concierge_order'), so
-- the append-only stage ledger stays unified across all three board types while
-- concierge orders keep a single, gated write path. Do NOT teach
-- move_pipeline_stage concierge_order; that would create a second, ungated path.
--
-- ── Payment-discrepancy detector (ledger-first, Guardrail 5) ─────────────────
-- check_concierge_payment_discrepancies() (daily cron) reconciles each order
-- against internal truth — po_payments(paid) sum vs purchase_orders.total_cents,
-- invoice paid-state vs invoice_payments(succeeded) sum, direct_orders.status —
-- and on a mismatch sets payment_flag='mismatch' + payment_flag_detail and
-- enqueues a payment_discrepancy agent_task (NO event_type in payload → the
-- merged stripe-event-processor's generic passthrough escalates it straight to
-- awaiting_review). The same pass escalates unresolved damage claims whose
-- carrier_deadline is <7 days out (damage_claim_escalation task). Idempotency
-- keys make both exactly-once. Money-touching discrepancies NEVER auto-resolve.
--
-- ── Substrate reconciled against (VERIFIED against the migrations + columns) ──
--   purchase_orders (00148): total_cents int; status draft/confirmed/
--     in_production/shipped/delivered/cancelled.
--   po_payments (00148/00275): amount_cents int; state enum po_payment_state =
--     pending/due/paid  (NB: NO 'refunded' — the WP-2.3 brief was wrong;
--     the enum is only these three); paid_date date.
--   direct_orders (00276): status pending_payment/paid/canceled; amount_cents.
--   invoices (00178): status draft/sent/partially_paid/paid/void;
--     total_cents, amount_paid_cents.
--   invoice_payments (00178): amount_cents; status pending/succeeded/failed/
--     refunded; stripe_payment_intent_id.
--   damage_claims (00150): column is `state` (enum drafted/vendor_notified/
--     resolved), NOT `status`; requires receiving_inspection_id NOT NULL; the
--     clean/damaged/partial `outcome` lives on receiving_inspections, not here.
--     Because a real damage_claims row needs a receiving_inspection (which needs
--     a PO + an inspected_by auth user), the concierge damage subflow is
--     SELF-CONTAINED in concierge_orders.damage jsonb (photo_checklist,
--     carrier_deadline, window_started_at, state), OPTIONALLY linking an
--     existing damage_claims row by id. The escalation scan reads carrier_deadline
--     from the jsonb (damage_claims has no such column).
--
-- ── Grants / integration ─────────────────────────────────────────────────────
-- RLS: admin-domain SELECT (00297/00300/00305 idiom), zero client write
-- policies; every write is SECURITY DEFINER (service_role) — called from
-- admin-portal route handlers on the service-role client, never the browser.
-- This migration adds function GRANT/REVOKEs and one table GRANT → regenerate
-- seed/00-legacy-grants.sql (python3 scripts/generate-legacy-grants.py) at
-- integration, per patina-db-migrations. Adds a daily cron
-- (concierge-discrepancy-daily) → registry comment appended below.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. moddatetime (idempotent; already enabled by 00044) ──────────────────
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

-- ─── 1. concierge_orders — the order lifecycle row ──────────────────────────
CREATE TABLE IF NOT EXISTS public.concierge_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,

  -- Linked source documents (all optional; ledger checks key off whichever are set).
  purchase_order_id  uuid UNIQUE REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  direct_order_id    uuid REFERENCES public.direct_orders(id) ON DELETE SET NULL,
  client_invoice_id  uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  vendor_id          uuid REFERENCES public.vendors(id),
  project_id         uuid REFERENCES public.projects(id),

  stage              text NOT NULL DEFAULT 'po_draft'
                       CHECK (stage IN ('po_draft','po_sent','freight_booked','in_transit','delivered','reconciled','cancelled')),
  stage_entered_at   timestamptz NOT NULL DEFAULT now(),

  -- { "<stage>": [ {key,label,required,done,done_at,by} ] }
  checklists         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Freight research/booking payload (2-3 options + chosen); free-form.
  freight            jsonb,
  -- Damage subflow: { damage_claim_id, linked, photo_checklist[], carrier_deadline, window_started_at, state }
  damage             jsonb,

  -- agent_tasks ids this order has spawned (discrepancy / damage escalations);
  -- the UI resolves their artifacts for the "linked docs" panel.
  linked_task_ids    uuid[] NOT NULL DEFAULT '{}',

  payment_flag       text NOT NULL DEFAULT 'unchecked'
                       CHECK (payment_flag IN ('unchecked','ok','mismatch')),
  payment_flag_detail jsonb,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concierge_orders_stage        ON public.concierge_orders(stage);
CREATE INDEX IF NOT EXISTS idx_concierge_orders_payment_flag ON public.concierge_orders(payment_flag);
CREATE INDEX IF NOT EXISTS idx_concierge_orders_vendor       ON public.concierge_orders(vendor_id);

COMMENT ON TABLE public.concierge_orders IS
  'Agent OS WP-2.3: Rail-A concierge order lifecycle (po_draft -> po_sent -> freight_booked -> in_transit -> delivered -> reconciled, or cancelled). Per-stage checklists seeded from concierge_checklist_template(). Moves ONLY through advance_concierge_order() (checklist-gated) which writes pipeline_stage_events(entity_type=concierge_order); move_pipeline_stage still RAISEs for concierge_order by design. payment_flag set by the daily check_concierge_payment_discrepancies() reconciler.';

DROP TRIGGER IF EXISTS trg_concierge_orders_updated_at ON public.concierge_orders;
CREATE TRIGGER trg_concierge_orders_updated_at
  BEFORE UPDATE ON public.concierge_orders
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ─── 2. concierge_checklist_template — single source of truth (immutable) ────
-- Transcribed from .claude/skills/concierge-order-playbook/SKILL.md stages.
CREATE OR REPLACE FUNCTION public.concierge_checklist_template(p_stage text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_stage
    WHEN 'po_draft' THEN $j$[
      {"key":"confirm_maker","label":"Confirm maker / vendor identity + contact","required":true,"done":false,"done_at":null,"by":null},
      {"key":"confirm_items","label":"Confirm items: SKU, finish, dimensions","required":true,"done":false,"done_at":null,"by":null},
      {"key":"confirm_trade_price","label":"Confirm trade price per line","required":true,"done":false,"done_at":null,"by":null},
      {"key":"confirm_markup_basis","label":"Confirm designer markup basis","required":true,"done":false,"done_at":null,"by":null},
      {"key":"confirm_client_price","label":"Confirm client-facing price","required":true,"done":false,"done_at":null,"by":null},
      {"key":"confirm_lead_time","label":"Confirm lead time","required":true,"done":false,"done_at":null,"by":null},
      {"key":"confirm_ship_from","label":"Confirm ship-from location","required":true,"done":false,"done_at":null,"by":null},
      {"key":"check_take_band","label":"Verify take within the 15-18% band (flag if broken)","required":true,"done":false,"done_at":null,"by":null},
      {"key":"draft_po","label":"Draft the PO document","required":true,"done":false,"done_at":null,"by":null}
    ]$j$::jsonb
    WHEN 'po_sent' THEN $j$[
      {"key":"po_sent_by_human","label":"PO sent by a human (never automated)","required":true,"done":false,"done_at":null,"by":null},
      {"key":"log_ack_date","label":"Log expected acknowledgment date","required":true,"done":false,"done_at":null,"by":null},
      {"key":"draft_followup","label":"Draft +3 business-day follow-up","required":false,"done":false,"done_at":null,"by":null}
    ]$j$::jsonb
    WHEN 'freight_booked' THEN $j$[
      {"key":"research_options","label":"Research 2-3 freight options (LTL vs white-glove)","required":true,"done":false,"done_at":null,"by":null},
      {"key":"compare_cost_transit_liability","label":"Compare cost, transit time, liability coverage","required":true,"done":false,"done_at":null,"by":null},
      {"key":"note_service_level","label":"Note threshold / room-of-choice / full-service level","required":true,"done":false,"done_at":null,"by":null},
      {"key":"recommend_option","label":"Recommend one option (show the table)","required":true,"done":false,"done_at":null,"by":null},
      {"key":"book_freight","label":"Book freight with the selected carrier","required":true,"done":false,"done_at":null,"by":null}
    ]$j$::jsonb
    WHEN 'in_transit' THEN $j$[
      {"key":"capture_tracking","label":"Capture tracking number + carrier","required":true,"done":false,"done_at":null,"by":null},
      {"key":"monitor_transit","label":"Monitor transit milestones","required":false,"done":false,"done_at":null,"by":null},
      {"key":"draft_delivery_prep","label":"Draft delivery-day client prep note (inspect before signing)","required":true,"done":false,"done_at":null,"by":null}
    ]$j$::jsonb
    WHEN 'delivered' THEN $j$[
      {"key":"photos_all_sides","label":"Photograph all sides of each item","required":true,"done":false,"done_at":null,"by":null},
      {"key":"photos_packaging","label":"Photograph packaging BEFORE discard","required":true,"done":false,"done_at":null,"by":null},
      {"key":"inspection_signoff","label":"Complete receiving inspection sign-off","required":true,"done":false,"done_at":null,"by":null},
      {"key":"note_concealed_window","label":"Note the 48-hour concealed-damage window","required":true,"done":false,"done_at":null,"by":null}
    ]$j$::jsonb
    WHEN 'reconciled' THEN $j$[
      {"key":"payments_vs_ledger","label":"Reconcile payment states vs the internal ledger","required":true,"done":false,"done_at":null,"by":null},
      {"key":"resolve_flags","label":"Resolve or escalate any payment-flag mismatch","required":true,"done":false,"done_at":null,"by":null},
      {"key":"close_order","label":"Close the order","required":true,"done":false,"done_at":null,"by":null}
    ]$j$::jsonb
    ELSE '[]'::jsonb          -- cancelled (and any unknown stage): no checklist
  END;
$$;

COMMENT ON FUNCTION public.concierge_checklist_template(text) IS
  'Agent OS WP-2.3: the single source of truth for concierge per-stage checklists (transcribed from the concierge-order-playbook skill). Seeded into concierge_orders.checklists by the BEFORE INSERT trigger and by advance_concierge_order(); the client renders labels from the stored jsonb.';

-- ─── 3. damage photo checklist template (immutable) ─────────────────────────
CREATE OR REPLACE FUNCTION public.concierge_damage_photo_checklist()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT $j$[
    {"key":"all_sides","label":"Photograph all sides of each item","done":false,"done_at":null,"by":null},
    {"key":"top_underside","label":"Photograph top and underside","done":false,"done_at":null,"by":null},
    {"key":"damage_closeup","label":"Close-up photos of the damage (multiple angles)","done":false,"done_at":null,"by":null},
    {"key":"shipping_label","label":"Photograph the shipping label / carrier tag","done":false,"done_at":null,"by":null},
    {"key":"outer_packaging","label":"Photograph outer packaging/carton BEFORE discard","done":false,"done_at":null,"by":null},
    {"key":"inner_packaging","label":"Photograph inner packaging/padding","done":false,"done_at":null,"by":null},
    {"key":"pallet_crate","label":"Photograph pallet/crate condition","done":false,"done_at":null,"by":null}
  ]$j$::jsonb;
$$;

-- ─── 4. seed initial checklist on insert ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_concierge_initial_checklist()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.checklists IS NULL OR NEW.checklists = '{}'::jsonb THEN
    NEW.checklists := jsonb_build_object(NEW.stage, public.concierge_checklist_template(NEW.stage));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_orders_seed_checklist ON public.concierge_orders;
CREATE TRIGGER trg_concierge_orders_seed_checklist
  BEFORE INSERT ON public.concierge_orders
  FOR EACH ROW EXECUTE FUNCTION public.seed_concierge_initial_checklist();

-- ─── 5. RLS — admin-domain SELECT; writes via DEFINER RPCs / service_role ────
ALTER TABLE public.concierge_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_orders_select_admin ON public.concierge_orders;
CREATE POLICY concierge_orders_select_admin
  ON public.concierge_orders FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

GRANT SELECT ON public.concierge_orders TO authenticated;

-- ─── 6. advance_concierge_order — the single checklist-gated stage-move path ──
CREATE OR REPLACE FUNCTION public.advance_concierge_order(
  p_id       uuid,
  p_to_stage text,
  p_actor    text,
  p_force    boolean DEFAULT false,
  p_note     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order        public.concierge_orders;
  v_from_idx     int;
  v_to_idx       int;
  v_incomplete   int;
  v_now          timestamptz := now();
  -- Forward-only lifecycle order. cancelled is special-cased (any non-terminal).
  v_order_stages text[] := ARRAY['po_draft','po_sent','freight_booked','in_transit','delivered','reconciled'];
BEGIN
  PERFORM set_config('app.actor', coalesce(p_actor, auth.uid()::text, session_user::text), true);

  SELECT * INTO v_order FROM public.concierge_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_concierge_order: order % not found', p_id;
  END IF;

  IF v_order.stage IN ('reconciled','cancelled') THEN
    RAISE EXCEPTION 'advance_concierge_order: order % is terminal (%), cannot advance', p_id, v_order.stage;
  END IF;

  -- p_force requires a non-empty note (an override must be justified).
  IF p_force AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'advance_concierge_order: p_force requires a non-empty p_note';
  END IF;

  -- Cancel: allowed from any non-terminal stage, bypasses ordering + gate.
  IF p_to_stage = 'cancelled' THEN
    UPDATE public.concierge_orders
       SET stage = 'cancelled', stage_entered_at = v_now
     WHERE id = p_id;

    INSERT INTO public.pipeline_stage_events (entity_type, entity_id, from_stage, to_stage, actor, note)
    VALUES ('concierge_order', p_id, v_order.stage, 'cancelled', p_actor, p_note);

    RETURN jsonb_build_object('id', p_id, 'from_stage', v_order.stage, 'to_stage', 'cancelled');
  END IF;

  v_from_idx := array_position(v_order_stages, v_order.stage);
  v_to_idx   := array_position(v_order_stages, p_to_stage);

  IF v_to_idx IS NULL THEN
    RAISE EXCEPTION 'advance_concierge_order: invalid target stage %', p_to_stage;
  END IF;

  -- Forward-only, immediate next stage only (keeps each stage's gate meaningful).
  IF v_to_idx <> v_from_idx + 1 THEN
    RAISE EXCEPTION 'advance_concierge_order: % -> % is not a forward step (advance to the immediate next stage, or cancel)', v_order.stage, p_to_stage;
  END IF;

  -- Checklist gate: the CURRENT stage's required, undone items block the hop
  -- unless p_force (with a note). NULL/absent checklist = no required items.
  IF NOT p_force THEN
    SELECT count(*) INTO v_incomplete
      FROM jsonb_array_elements(coalesce(v_order.checklists -> v_order.stage, '[]'::jsonb)) item
     WHERE coalesce((item ->> 'required')::boolean, false)
       AND NOT coalesce((item ->> 'done')::boolean, false);

    IF v_incomplete > 0 THEN
      RAISE EXCEPTION 'advance_concierge_order: checklist incomplete — % required item(s) undone in stage %', v_incomplete, v_order.stage;
    END IF;
  END IF;

  UPDATE public.concierge_orders
     SET stage = p_to_stage,
         stage_entered_at = v_now,
         -- Seed the next stage's checklist from the template if not present yet.
         checklists = CASE
                        WHEN checklists ? p_to_stage THEN checklists
                        ELSE checklists || jsonb_build_object(p_to_stage, public.concierge_checklist_template(p_to_stage))
                      END
   WHERE id = p_id;

  INSERT INTO public.pipeline_stage_events (entity_type, entity_id, from_stage, to_stage, actor, note)
  VALUES ('concierge_order', p_id, v_order.stage, p_to_stage, p_actor, p_note);

  RETURN jsonb_build_object('id', p_id, 'from_stage', v_order.stage, 'to_stage', p_to_stage);
END;
$$;

COMMENT ON FUNCTION public.advance_concierge_order(uuid, text, text, boolean, text) IS
  'Agent OS WP-2.3: the ONLY concierge_order stage-move path. Forward-only (immediate next stage) or cancel-from-any-non-terminal. Gates on the current stage''s required checklist items unless p_force (which needs a non-empty p_note). Stamps stage_entered_at, seeds the next stage''s checklist, appends a pipeline_stage_events(entity_type=concierge_order) row. SECURITY DEFINER, service_role only. move_pipeline_stage still RAISEs for concierge_order — single write path.';

-- ─── 7. toggle_concierge_checklist_item — atomic jsonb item toggle ──────────
CREATE OR REPLACE FUNCTION public.toggle_concierge_checklist_item(
  p_id    uuid,
  p_stage text,
  p_key   text,
  p_done  boolean,
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order    public.concierge_orders;
  v_items    jsonb;
  v_new      jsonb := '[]'::jsonb;
  v_item     jsonb;
  v_found    boolean := false;
BEGIN
  PERFORM set_config('app.actor', coalesce(p_actor, auth.uid()::text, session_user::text), true);

  SELECT * INTO v_order FROM public.concierge_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'toggle_concierge_checklist_item: order % not found', p_id;
  END IF;

  v_items := v_order.checklists -> p_stage;
  IF v_items IS NULL THEN
    RAISE EXCEPTION 'toggle_concierge_checklist_item: no checklist for stage % on order %', p_stage, p_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    IF v_item ->> 'key' = p_key THEN
      v_found := true;
      v_item := v_item
        || jsonb_build_object(
             'done', p_done,
             'done_at', CASE WHEN p_done THEN to_jsonb(now()) ELSE 'null'::jsonb END,
             'by', CASE WHEN p_done THEN to_jsonb(p_actor) ELSE 'null'::jsonb END
           );
    END IF;
    v_new := v_new || v_item;
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'toggle_concierge_checklist_item: item % not found in stage %', p_key, p_stage;
  END IF;

  UPDATE public.concierge_orders
     SET checklists = jsonb_set(checklists, ARRAY[p_stage], v_new)
   WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'stage', p_stage, 'key', p_key, 'done', p_done);
END;
$$;

COMMENT ON FUNCTION public.toggle_concierge_checklist_item(uuid, text, text, boolean, text) IS
  'Agent OS WP-2.3: atomically toggle one checklist item''s done/done_at/by inside concierge_orders.checklists[stage]. SECURITY DEFINER, service_role only — called by the checklist PATCH route.';

-- ─── 8. enter_concierge_damage_mode — seed the damage subflow ───────────────
CREATE OR REPLACE FUNCTION public.enter_concierge_damage_mode(
  p_id              uuid,
  p_actor           text,
  p_carrier_deadline date DEFAULT NULL,
  p_damage_claim_id uuid DEFAULT NULL,
  p_note            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order    public.concierge_orders;
  v_claim_id uuid;
  v_linked   boolean := false;
  v_deadline date;
  v_damage   jsonb;
BEGIN
  PERFORM set_config('app.actor', coalesce(p_actor, auth.uid()::text, session_user::text), true);

  SELECT * INTO v_order FROM public.concierge_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enter_concierge_damage_mode: order % not found', p_id;
  END IF;

  -- Link an existing damage_claims row if one was supplied, else synthesise a
  -- stable claim id for the self-contained subflow (see migration header for
  -- why we don't auto-create a damage_claims row here).
  IF p_damage_claim_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.damage_claims WHERE id = p_damage_claim_id) THEN
      RAISE EXCEPTION 'enter_concierge_damage_mode: damage_claim % not found', p_damage_claim_id;
    END IF;
    v_claim_id := p_damage_claim_id;
    v_linked   := true;
  ELSIF v_order.damage IS NOT NULL AND (v_order.damage ->> 'damage_claim_id') IS NOT NULL THEN
    -- already in damage mode: keep the same claim id (idempotent re-entry)
    v_claim_id := (v_order.damage ->> 'damage_claim_id')::uuid;
    v_linked   := coalesce((v_order.damage ->> 'linked')::boolean, false);
  ELSE
    v_claim_id := gen_random_uuid();
  END IF;

  -- Carrier claim deadline: caller-supplied, else keep an existing one, else a
  -- 15-day default window from today (concealed-damage/freight-claim window).
  v_deadline := coalesce(
    p_carrier_deadline,
    (v_order.damage ->> 'carrier_deadline')::date,
    (current_date + 15)
  );

  v_damage := jsonb_build_object(
    'damage_claim_id',  v_claim_id,
    'linked',           v_linked,
    'photo_checklist',  coalesce(v_order.damage -> 'photo_checklist', public.concierge_damage_photo_checklist()),
    'carrier_deadline', to_jsonb(v_deadline),
    'window_started_at', coalesce(v_order.damage -> 'window_started_at', to_jsonb(now())),
    'state',            'open',
    'note',             p_note
  );

  UPDATE public.concierge_orders
     SET damage = v_damage
   WHERE id = p_id;

  RETURN v_damage;
END;
$$;

COMMENT ON FUNCTION public.enter_concierge_damage_mode(uuid, text, date, uuid, text) IS
  'Agent OS WP-2.3: seed the concierge damage subflow into concierge_orders.damage (photo_checklist from the playbook, carrier_deadline countdown, window_started_at, state=open). Optionally links an existing damage_claims row; otherwise self-contained (see migration header). Idempotent re-entry keeps the same claim id. SECURITY DEFINER, service_role only.';

-- ─── 9. check_concierge_payment_discrepancies — the daily reconciler ────────
CREATE OR REPLACE FUNCTION public.check_concierge_payment_discrepancies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id       bigint;
  v_o            record;
  v_checks       jsonb;
  v_mismatch     boolean;
  v_verdict      text;
  v_detail       jsonb;
  v_task         public.agent_tasks;
  v_po_paid      bigint;
  v_po_total     bigint;
  v_inv          record;
  v_inv_succ     bigint;
  v_do_status    text;
  v_scanned      int := 0;
  v_flagged      int := 0;
  v_ok           int := 0;
  v_pay_tasks    int := 0;
  v_dmg_tasks    int := 0;
  v_claim_id     text;
  v_deadline     date;
BEGIN
  PERFORM set_config('app.actor', 'job:concierge-discrepancy', true);

  INSERT INTO public.job_runs (job_name, status)
  VALUES ('concierge-discrepancy', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    -- ── (A) payment discrepancy scan ──────────────────────────────────────
    FOR v_o IN
      SELECT * FROM public.concierge_orders WHERE stage <> 'cancelled'
    LOOP
      v_scanned := v_scanned + 1;
      v_checks := '[]'::jsonb;
      v_mismatch := false;

      -- PO: paid payments vs PO total, only once delivered/reconciled.
      IF v_o.purchase_order_id IS NOT NULL AND v_o.stage IN ('delivered','reconciled') THEN
        SELECT coalesce(sum(amount_cents),0) INTO v_po_paid
          FROM public.po_payments
         WHERE purchase_order_id = v_o.purchase_order_id AND state = 'paid';
        SELECT total_cents INTO v_po_total
          FROM public.purchase_orders WHERE id = v_o.purchase_order_id;
        IF v_po_paid <> coalesce(v_po_total,0) THEN
          v_mismatch := true;
          v_checks := v_checks || jsonb_build_object(
            'name', 'po_paid_vs_total',
            'expected', v_po_total,
            'actual', v_po_paid);
        END IF;
      END IF;

      -- Invoice: a 'paid' invoice must have succeeded payments >= its total.
      IF v_o.client_invoice_id IS NOT NULL THEN
        SELECT status, total_cents, amount_paid_cents INTO v_inv
          FROM public.invoices WHERE id = v_o.client_invoice_id;
        IF v_inv.status IS NOT NULL THEN
          SELECT coalesce(sum(amount_cents),0) INTO v_inv_succ
            FROM public.invoice_payments
           WHERE invoice_id = v_o.client_invoice_id AND status = 'succeeded';
          IF v_inv.status = 'paid' AND v_inv_succ < v_inv.total_cents THEN
            v_mismatch := true;
            v_checks := v_checks || jsonb_build_object(
              'name', 'invoice_paid_vs_succeeded_payments',
              'expected', v_inv.total_cents,
              'actual', v_inv_succ);
          END IF;
        END IF;
      END IF;

      -- Direct order: once delivered/reconciled it must be 'paid'.
      IF v_o.direct_order_id IS NOT NULL AND v_o.stage IN ('delivered','reconciled') THEN
        SELECT status INTO v_do_status
          FROM public.direct_orders WHERE id = v_o.direct_order_id;
        IF v_do_status IS DISTINCT FROM 'paid' THEN
          v_mismatch := true;
          v_checks := v_checks || jsonb_build_object(
            'name', 'direct_order_paid',
            'expected', 'paid',
            'actual', v_do_status);
        END IF;
      END IF;

      IF v_mismatch THEN
        v_flagged := v_flagged + 1;
        v_verdict := 'Concierge order "' || v_o.title || '" failed ' ||
                     jsonb_array_length(v_checks) || ' ledger check(s) — human reconciliation required.';
        v_detail := jsonb_build_object('checks', v_checks, 'verdict', v_verdict);

        UPDATE public.concierge_orders
           SET payment_flag = 'mismatch', payment_flag_detail = v_detail
         WHERE id = v_o.id;

        -- Enqueue exactly-once per distinct detail (md5). No event_type in the
        -- payload → the stripe-event-processor passthrough escalates to review.
        v_task := public.enqueue_agent_task(
          p_task_type      => 'payment_discrepancy',
          p_payload        => jsonb_build_object(
                                'order_id', v_o.id,
                                'title',    v_o.title,
                                'checks',   v_checks,
                                'verdict',  v_verdict),
          p_source         => 'concierge-tracker',
          p_priority       => 2,
          p_entity_type    => 'concierge_order',
          p_entity_id      => v_o.id,
          p_idempotency_key=> 'paydisc:' || v_o.id::text || ':' || md5(v_detail::text),
          p_summary        => 'Payment discrepancy: ' || v_o.title,
          p_actor          => 'job:concierge-discrepancy'
        );
        IF v_task.id IS NOT NULL AND NOT (v_task.id = ANY(v_o.linked_task_ids)) THEN
          UPDATE public.concierge_orders
             SET linked_task_ids = array_append(linked_task_ids, v_task.id)
           WHERE id = v_o.id;
        END IF;
        v_pay_tasks := v_pay_tasks + 1;
      ELSE
        UPDATE public.concierge_orders
           SET payment_flag = 'ok', payment_flag_detail = NULL
         WHERE id = v_o.id;
        v_ok := v_ok + 1;
      END IF;
    END LOOP;

    -- ── (B) damage-claim escalation scan (carrier_deadline < 7 days out) ────
    FOR v_o IN
      SELECT * FROM public.concierge_orders
       WHERE stage <> 'cancelled'
         AND damage IS NOT NULL
         AND (damage ->> 'carrier_deadline') IS NOT NULL
         AND coalesce(damage ->> 'state','open') <> 'resolved'
         AND (damage ->> 'carrier_deadline')::date <= (current_date + 7)
    LOOP
      v_claim_id := v_o.damage ->> 'damage_claim_id';
      v_deadline := (v_o.damage ->> 'carrier_deadline')::date;

      -- If a real damage_claims row is linked and already resolved, skip.
      IF coalesce((v_o.damage ->> 'linked')::boolean, false)
         AND EXISTS (SELECT 1 FROM public.damage_claims
                      WHERE id = v_claim_id::uuid AND state = 'resolved') THEN
        CONTINUE;
      END IF;

      v_verdict := 'Damage claim on "' || v_o.title || '" — carrier deadline ' ||
                   v_deadline::text || ' is within 7 days. Escalate.';
      v_task := public.enqueue_agent_task(
        p_task_type      => 'damage_claim_escalation',
        p_payload        => jsonb_build_object(
                              'order_id',  v_o.id,
                              'claim_id',  v_claim_id,
                              'deadline',  v_deadline,
                              'checks',    jsonb_build_array(jsonb_build_object(
                                             'name','carrier_deadline_approaching',
                                             'expected','>7 days',
                                             'actual', v_deadline)),
                              'verdict',   v_verdict),
        p_source         => 'concierge-tracker',
        p_priority       => 2,
        p_entity_type    => 'concierge_order',
        p_entity_id      => v_o.id,
        p_idempotency_key=> 'dmg:' || v_claim_id || ':escalation',
        p_summary        => 'Damage claim escalation: ' || v_o.title,
        p_actor          => 'job:concierge-discrepancy'
      );
      IF v_task.id IS NOT NULL AND NOT (v_task.id = ANY(v_o.linked_task_ids)) THEN
        UPDATE public.concierge_orders
           SET linked_task_ids = array_append(linked_task_ids, v_task.id)
         WHERE id = v_o.id;
      END IF;
      v_dmg_tasks := v_dmg_tasks + 1;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    -- 00300 lesson: RETURN (don't RAISE) so the failed job_runs row persists
    -- instead of rolling back with the transaction and leaving no trace.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object('scanned', v_scanned, 'flagged', v_flagged,
                                       'ok', v_ok, 'payment_tasks', v_pay_tasks,
                                       'damage_tasks', v_dmg_tasks)
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM, 'scanned', v_scanned);
  END;

  v_detail := jsonb_build_object(
    'scanned', v_scanned, 'flagged', v_flagged, 'ok', v_ok,
    'payment_tasks', v_pay_tasks, 'damage_tasks', v_dmg_tasks);

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

COMMENT ON FUNCTION public.check_concierge_payment_discrepancies() IS
  'Agent OS WP-2.3: daily ledger-first reconciler over concierge_orders. Sets payment_flag ok/mismatch (+payment_flag_detail) and enqueues exactly-once payment_discrepancy tasks (no event_type → processor passthrough → awaiting_review). Same pass escalates unresolved damage claims whose carrier_deadline is <7 days out (damage_claim_escalation). Writes one job_runs row; failure RETURNs (00300 lesson), never RAISEs.';

-- ─── 10. Grants — service_role executes the write RPCs; nobody else ─────────
REVOKE ALL ON FUNCTION public.advance_concierge_order(uuid, text, text, boolean, text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_concierge_checklist_item(uuid, text, text, boolean, text)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enter_concierge_damage_mode(uuid, text, date, uuid, text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_concierge_payment_discrepancies()                              FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.advance_concierge_order(uuid, text, text, boolean, text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_concierge_checklist_item(uuid, text, text, boolean, text)    TO service_role;
GRANT EXECUTE ON FUNCTION public.enter_concierge_damage_mode(uuid, text, date, uuid, text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.check_concierge_payment_discrepancies()                             TO service_role;

-- Template/pure helpers: readable by service_role (used by DEFINER fns; owner
-- executes regardless, these grants are for completeness/clarity).
REVOKE ALL ON FUNCTION public.concierge_checklist_template(text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concierge_damage_photo_checklist()      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concierge_checklist_template(text)   TO service_role;
GRANT EXECUTE ON FUNCTION public.concierge_damage_photo_checklist()   TO service_role;

-- ─── 11. Daily cron — concierge-discrepancy-daily (10:15 UTC) ───────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'concierge-discrepancy-daily') THEN
    PERFORM cron.unschedule('concierge-discrepancy-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'concierge-discrepancy-daily',
  '15 10 * * *',
  $$
  SELECT public.check_concierge_payment_discrepancies();
  $$
);

-- Registry comment append (best-effort; 00300 idiom — pg_cron may be owned by
-- supabase_admin on self-hosted).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Agent OS: agent-queue-groom (every 6h at :23, 00300), stripe-event-processor (every 5m, 00304), catalog-normalizer (00307), concierge-discrepancy-daily (10:15 UTC, 00308 -> check_concierge_payment_discrepancies: flags concierge payment mismatches + enqueues payment_discrepancy/damage_claim_escalation tasks; history in job_runs). Aesthete engine + earlier crons unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
