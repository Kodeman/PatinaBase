-- ═══════════════════════════════════════════════════════════════════════════
-- 00352 — Back of House: the minimal double-entry ledger (R1.3, §8)
--
-- Real double-entry, deliberately small: fixed 15-account chart, balanced
-- journal entries enforced AT THE DATABASE (deferred constraint trigger: per
-- entry Σdebit=Σcredit AND ≥2 lines), append-only (UPDATE/DELETE raise
-- unconditionally; corrections are reversing entries). ONLY template T1 (capture)
-- exists in S0 — T2–T6 are S6's scope (do NOT build them here). ledger_post* are
-- internal: EXECUTE revoked from every portal-facing role incl. service_role;
-- the SECURITY DEFINER fulfillment_* RPCs (owned by postgres) retain execute.
--
-- Every ledger table is writer-guarded, ledger_accounts INCLUDED (a raw
-- service-role edit to an account code must fail like any other side door) — the
-- in-migration chart seed uses the 'migration' GUC escape.
-- Adds the deferred FK fulfillment_exceptions.financial_outcome_entry_id →
-- ledger_entries (00350 left it a bare uuid until this table existed).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  code   text PRIMARY KEY,
  name   text NOT NULL,
  type   text NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memo            text NOT NULL,
  source_event_id bigint NOT NULL REFERENCES public.fulfillment_events(id),
  reversal_of     uuid REFERENCES public.ledger_entries(id),
  refs            jsonb NOT NULL DEFAULT '{}'::jsonb,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  posted_by       text
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_source ON public.ledger_entries(source_event_id);

CREATE TABLE IF NOT EXISTS public.ledger_lines (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id     uuid NOT NULL REFERENCES public.ledger_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL REFERENCES public.ledger_accounts(code),
  debit_cents  integer NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents integer NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  CHECK ((debit_cents > 0) <> (credit_cents > 0))   -- exactly one side > 0
);
CREATE INDEX IF NOT EXISTS idx_ledger_lines_entry   ON public.ledger_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_ledger_lines_account ON public.ledger_lines(account_code);

-- deferred FK: exceptions.financial_outcome_entry_id → ledger_entries (00350 bare)
ALTER TABLE public.fulfillment_exceptions DROP CONSTRAINT IF EXISTS fk_exception_ledger_entry;
ALTER TABLE public.fulfillment_exceptions
  ADD CONSTRAINT fk_exception_ledger_entry
  FOREIGN KEY (financial_outcome_entry_id) REFERENCES public.ledger_entries(id) ON DELETE SET NULL;

-- ─── 2. Append-only + writer-guard triggers ────────────────────────────────
CREATE OR REPLACE FUNCTION public.ledger_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only (% on %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_entries_append_only ON public.ledger_entries;
CREATE TRIGGER trg_ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_append_only();
DROP TRIGGER IF EXISTS trg_ledger_lines_append_only ON public.ledger_lines;
CREATE TRIGGER trg_ledger_lines_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_lines
  FOR EACH ROW EXECUTE FUNCTION public.ledger_append_only();

-- INSERT gated by the writer guard (GUC='rpc' from ledger_post)
DROP TRIGGER IF EXISTS trg_ledger_entries_writer_guard ON public.ledger_entries;
CREATE TRIGGER trg_ledger_entries_writer_guard BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_writer_guard();
DROP TRIGGER IF EXISTS trg_ledger_lines_writer_guard ON public.ledger_lines;
CREATE TRIGGER trg_ledger_lines_writer_guard BEFORE INSERT ON public.ledger_lines
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_writer_guard();

-- ledger_accounts is writer-guarded on ALL ops (D3 — reference data, no side doors)
DROP TRIGGER IF EXISTS trg_ledger_accounts_writer_guard ON public.ledger_accounts;
CREATE TRIGGER trg_ledger_accounts_writer_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_writer_guard();

-- ─── 3. Balance enforcement — deferred constraint trigger ──────────────────
CREATE OR REPLACE FUNCTION public.ledger_entry_balanced()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_deb bigint; v_cred bigint; v_n int;
BEGIN
  SELECT COALESCE(sum(debit_cents),0), COALESCE(sum(credit_cents),0), count(*)
    INTO v_deb, v_cred, v_n
  FROM public.ledger_lines WHERE entry_id = NEW.id;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'ledger entry % must have >= 2 lines (has %)', NEW.id, v_n;
  END IF;
  IF v_deb <> v_cred THEN
    RAISE EXCEPTION 'ledger entry % unbalanced: debit % <> credit %', NEW.id, v_deb, v_cred;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ledger_entry_balanced ON public.ledger_entries;
CREATE CONSTRAINT TRIGGER trg_ledger_entry_balanced
  AFTER INSERT OR UPDATE ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entry_balanced();

-- ─── 4. Chart of accounts (guarded → 'migration' GUC) ──────────────────────
SELECT set_config('app.fulfillment_writer','migration',true);
INSERT INTO public.ledger_accounts (code, name, type) VALUES
  ('1000','Cash — Stripe Clearing','asset'),
  ('1100','Claims Receivable','asset'),
  ('1200','Vendor Deposits','asset'),
  ('2000','Vendor Payables','liability'),
  ('2100','Sales Tax Payable','liability'),
  ('2200','Pledge Liability — Teaching Royalties','liability'),
  ('2300','Client Credits Payable','liability'),
  ('3000','Retained Earnings','equity'),
  ('4000','Product Revenue','revenue'),
  ('4100','Freight Revenue','revenue'),
  ('4900','Refunds','revenue'),
  ('5000','COGS','expense'),
  ('5100','Freight Expense','expense'),
  ('5200','Damage & Claims','expense'),
  ('5300','Pledge Expense — Teaching Royalties','expense')
ON CONFLICT (code) DO NOTHING;

-- ─── 5. ledger_post + ledger_post_t1_capture (internal) ────────────────────
CREATE OR REPLACE FUNCTION public.ledger_post(
  p_memo text, p_source_event_id bigint, p_posted_by text,
  p_refs jsonb, p_lines jsonb   -- [{account_code, debit_cents?, credit_cents?}, …]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_entry uuid; v_line jsonb;
BEGIN
  -- The writer GUC must already be 'rpc' (set by the calling fulfillment_* RPC).
  INSERT INTO public.ledger_entries (memo, source_event_id, refs, posted_by)
  VALUES (p_memo, p_source_event_id, COALESCE(p_refs,'{}'::jsonb), p_posted_by)
  RETURNING id INTO v_entry;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    -- Skip zero-amount lines: they violate the ledger_lines XOR CHECK
    -- (exactly one side > 0) and carry no accounting meaning. A T1 capture with
    -- freight=0 or tax=0 legitimately produces such a line; omitting it keeps the
    -- entry balanced (Dr 1000 still equals the remaining nonzero credits).
    IF COALESCE((v_line->>'debit_cents')::int, 0) = 0
       AND COALESCE((v_line->>'credit_cents')::int, 0) = 0 THEN
      CONTINUE;
    END IF;
    INSERT INTO public.ledger_lines (entry_id, account_code, debit_cents, credit_cents)
    VALUES (v_entry, v_line->>'account_code',
            COALESCE((v_line->>'debit_cents')::int, 0),
            COALESCE((v_line->>'credit_cents')::int, 0));
  END LOOP;
  RETURN v_entry;   -- balance verified at COMMIT by the deferred constraint trigger
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_post(text, bigint, text, jsonb, jsonb) FROM public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ledger_post_t1_capture(
  p_order_id uuid, p_source_event_id bigint, p_posted_by text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o public.fulfillment_orders;
BEGIN
  SELECT * INTO o FROM public.fulfillment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_post_t1_capture: order % not found', p_order_id; END IF;
  RETURN public.ledger_post(
    'T1 capture — order ' || o.order_no,
    p_source_event_id, p_posted_by,
    jsonb_build_object('order_id', o.id, 'template', 'T1'),
    jsonb_build_array(
      jsonb_build_object('account_code','1000','debit_cents',  o.captured_total_cents),
      jsonb_build_object('account_code','4000','credit_cents', o.product_subtotal_cents),
      jsonb_build_object('account_code','4100','credit_cents', o.freight_charged_cents),
      jsonb_build_object('account_code','2100','credit_cents', o.tax_cents)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_post_t1_capture(uuid, bigint, text) FROM public, anon, authenticated, service_role;

-- ─── 6. RLS + grants (financial truth — same 00335 idiom) ──────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ledger_accounts','ledger_entries','ledger_lines'] LOOP
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
