-- ═══════════════════════════════════════════════════════════════════════════
-- 00350 — Back of House: fulfillment core (S0)
--
-- Lifecycle tables for Rail A fulfillment (spec §2/§4, R1/R2): vendor_profiles
-- (1:1 vendors), fulfillment_orders/_order_items/_vendor_pos/_vendor_po_lines/
-- _shipments/_exceptions, leah_reviews. Line/PO state machines enforced by
-- triggers that mirror @patina/fulfillment/state-machine.ts. Every write is
-- gated by the app.fulfillment_writer GUC (fulfillment_writer_guard): the
-- fulfillment_* RPCs set 'rpc'; migrations/seeds set 'migration'. Any other
-- direct write — raw service_role included — raises (this is a review gate, §11).
--
-- Reuses existing objects (I1.2 / R2.1): public.vendors (00001),
-- public.profiles (00013), public.designer_clients (00014), public.products
-- (00001, mapped = vendor_id + price_trade both present), update_updated_at_
-- column() (00014), agent_reader role (00299). Zero DDL for those.
--
-- RLS idiom (00335): ENABLE RLS → admin-domain SELECT (authenticated) →
-- agent_reader SELECT USING(true) → REVOKE public/anon → GRANT SELECT to
-- authenticated + agent_reader → GRANT ALL to service_role. ZERO write
-- policies/grants for authenticated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The writer guard (defined once; attached per table below) ───────────
CREATE OR REPLACE FUNCTION public.fulfillment_writer_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- COALESCE is load-bearing: an UNSET GUC makes current_setting(..., true)
  -- return NULL, and `NULL NOT IN (...)` is NULL (not TRUE), so a bare
  -- `IF … THEN RAISE` would silently ALLOW a guardless write. Map NULL → '' so
  -- the unset case is a real deny.
  IF COALESCE(current_setting('app.fulfillment_writer', true), '') NOT IN ('rpc','migration') THEN
    RAISE EXCEPTION 'fulfillment: direct writes to % are not permitted; use a fulfillment_* RPC', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_writer_guard() FROM public, anon;

-- ─── 2. vendor_profiles — operator protocol sheet, 1:1 with vendors ─────────
CREATE TABLE IF NOT EXISTS public.vendor_profiles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id              uuid NOT NULL UNIQUE REFERENCES public.vendors(id) ON DELETE CASCADE,
  transmission_type      text NOT NULL CHECK (transmission_type IN ('email','portal','csv')),
  contacts               jsonb NOT NULL DEFAULT '[]'::jsonb,
  po_email               text,
  portal_url             text,
  csv_column_spec        jsonb,
  payment_terms          text NOT NULL DEFAULT 'net_30' CHECK (payment_terms IN ('prepay','fifty_fifty','net_30')),
  deposit_pct            numeric(5,2),
  lead_time_days         int,
  change_window_days     int,
  blind_ship             boolean NOT NULL DEFAULT false,
  claims_window_days     int,
  inspection_window_days jsonb,          -- {parcel, ltl, white_glove}
  freight_arrangement    text,
  commission_rate        numeric(5,4),   -- NULL → falls back to fulfillment_config default
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.vendor_profiles IS
  'BOH (00350): operator-editable protocol sheet, 1:1 with public.vendors. transmission_type is the only coded fact (R1.6); everything else is data. minimal · ownership migrates later.';

-- ─── 3. fulfillment_orders — client truth (status is ALWAYS derived, §2) ────
CREATE TABLE IF NOT EXISTS public.fulfillment_orders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no                 bigint GENERATED ALWAYS AS IDENTITY,
  stripe_payment_intent_id text UNIQUE,
  client_name              text NOT NULL,
  client_email             text,
  ship_to                  jsonb,
  client_profile_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  designer_client_id       uuid REFERENCES public.designer_clients(id) ON DELETE SET NULL,
  designer_profile_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  designer_attribution     jsonb,
  captured_total_cents     integer NOT NULL,
  product_subtotal_cents   integer NOT NULL,
  freight_charged_cents    integer NOT NULL,
  tax_cents                integer NOT NULL,
  intake_at                timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fulfillment_orders_order_no ON public.fulfillment_orders(order_no);
COMMENT ON TABLE public.fulfillment_orders IS
  'BOH (00350): client-truth order. Status is ALWAYS derived (min line stage + exception overlay, §2) — no status column. client/designer snapshots + nullable FKs (R2.1).';

-- ─── 4. fulfillment_order_items — the line-level state machine ──────────────
CREATE TABLE IF NOT EXISTS public.fulfillment_order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.fulfillment_orders(id) ON DELETE CASCADE,
  product_id            uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_name             text NOT NULL,
  vendor_sku            text,
  qty                   integer NOT NULL CHECK (qty > 0),
  unit_price_cents      integer NOT NULL,     -- retail snapshot (what the client was charged)
  unit_cost_cents       integer,              -- price_trade snapshot; NULL while unmapped
  vendor_id             uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  mapping_state         text NOT NULL DEFAULT 'unmapped' CHECK (mapping_state IN ('mapped','unmapped')),
  line_state            text NOT NULL DEFAULT 'intake'
                          CHECK (line_state IN ('intake','split','transmitted','acknowledged',
                                                'in_production','shipped','delivered','settled','cancelled')),
  line_state_entered_at timestamptz NOT NULL DEFAULT now(),
  po_line_id            uuid,                 -- back-ref; FK added below once vendor_po_lines exists
  line_index            integer NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_order_items_order ON public.fulfillment_order_items(order_id, line_index);
CREATE INDEX IF NOT EXISTS idx_fulfillment_order_items_state ON public.fulfillment_order_items(line_state);

-- ─── 5. fulfillment_vendor_pos — operator PO unit ──────────────────────────
CREATE TABLE IF NOT EXISTS public.fulfillment_vendor_pos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES public.fulfillment_orders(id) ON DELETE CASCADE,
  vendor_id          uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  po_number          text UNIQUE,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','sent','acknowledged','in_production',
                                         'shipped','delivered','settled','cancelled')),
  terms              text CHECK (terms IS NULL OR terms IN ('prepay','fifty_fifty','net_30')),
  side_mark          text,
  requested_ship     date,
  committed_ship     date,
  ack_method         text,
  ack_ref            text,
  pdf_r2_key         text,
  transmitted_at     timestamptz,
  acked_at           timestamptz,
  product_cost_cents integer NOT NULL DEFAULT 0,
  freight_cost_cents integer NOT NULL DEFAULT 0,
  status_entered_at  timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_vendor_pos_order ON public.fulfillment_vendor_pos(order_id);

-- ─── 6. fulfillment_vendor_po_lines ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fulfillment_vendor_po_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           uuid NOT NULL REFERENCES public.fulfillment_vendor_pos(id) ON DELETE CASCADE,
  order_item_id   uuid NOT NULL UNIQUE REFERENCES public.fulfillment_order_items(id) ON DELETE CASCADE,
  qty             integer NOT NULL,
  unit_cost_cents integer NOT NULL,
  shipment_id     uuid,                 -- FK added below once shipments exists
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- wire order_items.po_line_id back-ref now that vendor_po_lines exists
ALTER TABLE public.fulfillment_order_items DROP CONSTRAINT IF EXISTS fk_order_items_po_line;
ALTER TABLE public.fulfillment_order_items
  ADD CONSTRAINT fk_order_items_po_line
  FOREIGN KEY (po_line_id) REFERENCES public.fulfillment_vendor_po_lines(id) ON DELETE SET NULL;

-- ─── 7. fulfillment_shipments — physical movement ──────────────────────────
CREATE TABLE IF NOT EXISTS public.fulfillment_shipments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                    uuid NOT NULL REFERENCES public.fulfillment_vendor_pos(id) ON DELETE CASCADE,
  mode                     text NOT NULL CHECK (mode IN ('parcel','ltl','white_glove')),
  carrier                  text,
  tracking                 text,
  appointment_confirmed_at timestamptz,
  shipped_at               timestamptz,
  delivered_at             timestamptz,
  pod_r2_key               text,
  inspection_window_days   integer,
  inspection_closes_at     timestamptz,
  current_eta              date,
  eta_history              jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- wire po_lines.shipment_id FK now that shipments exists
ALTER TABLE public.fulfillment_vendor_po_lines DROP CONSTRAINT IF EXISTS fk_po_lines_shipment;
ALTER TABLE public.fulfillment_vendor_po_lines
  ADD CONSTRAINT fk_po_lines_shipment
  FOREIGN KEY (shipment_id) REFERENCES public.fulfillment_shipments(id) ON DELETE SET NULL;

-- ─── 8. fulfillment_exceptions — overlay with clock/evidence/outcome ────────
-- financial_outcome_entry_id is a bare uuid here; its FK to ledger_entries is
-- added in 00352 (ledger tables land later).
CREATE TABLE IF NOT EXISTS public.fulfillment_exceptions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                       text NOT NULL CHECK (type IN ('damage','delay','backorder','substitution',
                                                           'loss','client_change','cancellation','return')),
  order_id                   uuid REFERENCES public.fulfillment_orders(id) ON DELETE CASCADE,
  order_item_id              uuid REFERENCES public.fulfillment_order_items(id) ON DELETE CASCADE,
  po_id                      uuid REFERENCES public.fulfillment_vendor_pos(id) ON DELETE CASCADE,
  shipment_id                uuid REFERENCES public.fulfillment_shipments(id) ON DELETE CASCADE,
  status                     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_leah','resolved')),
  opened_at                  timestamptz NOT NULL DEFAULT now(),
  resolved_at                timestamptz,
  evidence_r2_keys           text[] NOT NULL DEFAULT '{}',
  resolution_path            text,
  financial_outcome_entry_id uuid,     -- FK → ledger_entries added in 00352
  cause_code                 text,
  clock_due_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_exceptions_order ON public.fulfillment_exceptions(order_id) WHERE status <> 'resolved';

-- ─── 9. leah_reviews — R1.4 cross-track contract (bare name) ───────────────
CREATE TABLE IF NOT EXISTS public.leah_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id uuid NOT NULL REFERENCES public.fulfillment_exceptions(id) ON DELETE CASCADE,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- comparison card
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  ruled_at     timestamptz,
  ruled_by     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.leah_reviews IS
  'BOH (00350, R1.4): substitution-review contract. Mission Control adopts this table + /mission-control?assignee=leah as a second card source. Bare name is the cross-track contract.';

-- ─── 10. State-machine triggers (mirror @patina/fulfillment/state-machine) ──
CREATE OR REPLACE FUNCTION public.enforce_fulfillment_line_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  chain text[] := ARRAY['intake','split','transmitted','acknowledged',
                        'in_production','shipped','delivered','settled'];
  i_from int; i_to int; i_ship int;
BEGIN
  IF NEW.line_state = OLD.line_state THEN RETURN NEW; END IF;
  i_ship := array_position(chain, 'shipped');
  IF NEW.line_state = 'cancelled' THEN
    i_from := array_position(chain, OLD.line_state);
    IF i_from IS NULL OR i_from >= i_ship THEN
      RAISE EXCEPTION 'fulfillment line: cancel only allowed from pre-shipped states (was %)', OLD.line_state;
    END IF;
    NEW.line_state_entered_at := now();
    RETURN NEW;
  END IF;
  i_from := array_position(chain, OLD.line_state);
  i_to   := array_position(chain, NEW.line_state);
  IF i_from IS NULL OR i_to IS NULL OR i_to <> i_from + 1 THEN
    RAISE EXCEPTION 'fulfillment line: illegal transition % -> %', OLD.line_state, NEW.line_state;
  END IF;
  NEW.line_state_entered_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fulfillment_line_transition ON public.fulfillment_order_items;
CREATE TRIGGER trg_fulfillment_line_transition
  BEFORE UPDATE OF line_state ON public.fulfillment_order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fulfillment_line_transition();

CREATE OR REPLACE FUNCTION public.enforce_fulfillment_po_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  chain text[] := ARRAY['draft','sent','acknowledged','in_production',
                        'shipped','delivered','settled'];
  i_from int; i_to int; i_ship int;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  i_ship := array_position(chain, 'shipped');
  IF NEW.status = 'cancelled' THEN
    i_from := array_position(chain, OLD.status);
    IF i_from IS NULL OR i_from >= i_ship THEN
      RAISE EXCEPTION 'fulfillment PO: cancel only allowed from pre-shipped states (was %)', OLD.status;
    END IF;
    NEW.status_entered_at := now();
    RETURN NEW;
  END IF;
  i_from := array_position(chain, OLD.status);
  i_to   := array_position(chain, NEW.status);
  IF i_from IS NULL OR i_to IS NULL OR i_to <> i_from + 1 THEN
    RAISE EXCEPTION 'fulfillment PO: illegal transition % -> %', OLD.status, NEW.status;
  END IF;
  NEW.status_entered_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fulfillment_po_transition ON public.fulfillment_vendor_pos;
CREATE TRIGGER trg_fulfillment_po_transition
  BEFORE UPDATE OF status ON public.fulfillment_vendor_pos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fulfillment_po_transition();

-- ─── 11. updated_at + writer-guard triggers (per table) ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vendor_profiles','fulfillment_orders','fulfillment_order_items',
    'fulfillment_vendor_pos','fulfillment_vendor_po_lines','fulfillment_shipments',
    'fulfillment_exceptions','leah_reviews'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_writer_guard ON public.%1$s;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_writer_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.fulfillment_writer_guard();', t);
  END LOOP;
END $$;

-- ─── 12. RLS + grants (00335 idiom, per table) ─────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vendor_profiles','fulfillment_orders','fulfillment_order_items',
    'fulfillment_vendor_pos','fulfillment_vendor_po_lines','fulfillment_shipments',
    'fulfillment_exceptions','leah_reviews'
  ] LOOP
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
