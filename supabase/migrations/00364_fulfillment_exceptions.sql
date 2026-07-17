-- ═══════════════════════════════════════════════════════════════════════════
-- 00364 — Back of House: Exception Desk & Settlement (S7)
--
-- S0 (00353) shipped fulfillment_resolve_exception with a PLACEHOLDER preview
-- branch (returns {lines:[], note:'ledger_consequence_deferred_to_S7'}) and a
-- resolve body that ignored ledger consequence entirely. S7's fence (I2): S7
-- MUST replace the placeholder, and the acceptance test compares preview lines
-- to POSTED lines byte-for-byte on account+amount. This migration does that.
--
-- The load-bearing idea: ONE derivation (fulfillment_exception_consequence)
-- computes the exact would-be ledger lines for a (path, params) pair. preview
-- returns them WITHOUT any write; commit posts them through S6's T4/T5 templates
-- (00360) and records the outcome. The SAME derivation feeds both modes, so
-- preview == posted holds by construction and is proven in the assert.
--
-- Playbooks (spec §5.5, v1 real):
--   damage       → three T5 outcomes (vendor claim / client credit / recovery)
--   delay        → ETA re-date via fulfillment_update_shipment_eta, NO ledger
--   backorder    → recommit (new committed date, no ledger) | cancel (line →
--                  cancelled, optional T4 refund consequence)
--   substitution → routes to Leah (leah_reviews, status pending; exception →
--                  pending_leah). NOT resolved until her ruling (rule_leah_review).
--   records-only (loss / client_change / cancellation / return) → record_only
--                  (honest empty consequence) or refund (T4). Thin playbooks.
--
-- Every close records financial_outcome_entry_id (financial paths), cause_code
-- (REQUIRED — raise on null/empty), outcome_memo, resolved_at, status→resolved.
--
-- Also: rule_leah_review gains exception write-back (00353 shipped it as a stub
-- that only flipped leah_reviews and never touched the exception); a tokenized
-- evidence-upload flow (mint / validate / append, token-gated, NOT the admin
-- RPC surface) for the client upload page; and a settlement PREVIEW RPC that
-- mirrors S6's real fulfillment_settle_po (00360) so the composer can show the
-- T3+pledge(+T6) posting in mono before commit (chosen over adding p_preview to
-- the shipped settle_po — a separate read-only fn is lower-risk and gives the
-- same preview==posted guarantee; flagged in the I12 record).
--
-- FIX-FORWARD discipline: 00350–00363 are on origin/main; nothing here edits an
-- applied migration in place. resolve_exception is DROP+CREATE (its signature
-- gains p_params jsonb; the old (uuid,text,text,boolean,text) had no TS caller —
-- grep-confirmed, only the S1 queue's 'x' toast, which this slice makes real).
-- rule_leah_review is CREATE OR REPLACE (same signature).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. outcome_memo — the operator's memo on every close (spec §5.5) ────────
ALTER TABLE public.fulfillment_exceptions
  ADD COLUMN IF NOT EXISTS outcome_memo text;
COMMENT ON COLUMN public.fulfillment_exceptions.outcome_memo IS
  'BOH (00364): free-text outcome memo recorded on close (even "$0 — vendor absorbed"). Distinct from cause_code (the coded reason).';

-- ─── 2. Evidence upload tokens — tokenized client upload (spec §5.5, §9.2) ───
-- The client upload page (client-portal /evidence/[token]) is public; it never
-- touches the admin RPC surface. It validates an opaque, expiring token here and
-- appends R2 keys through fulfillment_append_evidence (token IS the authority).
CREATE TABLE IF NOT EXISTS public.fulfillment_evidence_upload_tokens (
  token        text PRIMARY KEY,
  exception_id uuid NOT NULL REFERENCES public.fulfillment_exceptions(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  revoked      boolean NOT NULL DEFAULT false,
  used_count   integer NOT NULL DEFAULT 0,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_evidence_tokens_exc
  ON public.fulfillment_evidence_upload_tokens(exception_id);
COMMENT ON TABLE public.fulfillment_evidence_upload_tokens IS
  'BOH (00364): opaque, expiring tokens minting a client evidence-upload link for one exception. Writer-guarded; validated + appended via SECURITY DEFINER RPCs only.';

-- writer guard + updated_at, matching every other fulfillment table (00350)
DROP TRIGGER IF EXISTS trg_fulfillment_evidence_upload_tokens_updated_at ON public.fulfillment_evidence_upload_tokens;
CREATE TRIGGER trg_fulfillment_evidence_upload_tokens_updated_at
  BEFORE UPDATE ON public.fulfillment_evidence_upload_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_fulfillment_evidence_upload_tokens_writer_guard ON public.fulfillment_evidence_upload_tokens;
CREATE TRIGGER trg_fulfillment_evidence_upload_tokens_writer_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fulfillment_evidence_upload_tokens
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_writer_guard();

ALTER TABLE public.fulfillment_evidence_upload_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fulfillment_evidence_upload_tokens_select_admin ON public.fulfillment_evidence_upload_tokens;
CREATE POLICY fulfillment_evidence_upload_tokens_select_admin
  ON public.fulfillment_evidence_upload_tokens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 JOIN public.roles r ON ur.role_id = r.id
                 WHERE ur.user_id = auth.uid() AND r.domain = 'admin'));
DROP POLICY IF EXISTS fulfillment_evidence_upload_tokens_select_agent_reader ON public.fulfillment_evidence_upload_tokens;
CREATE POLICY fulfillment_evidence_upload_tokens_select_agent_reader
  ON public.fulfillment_evidence_upload_tokens FOR SELECT TO agent_reader USING (true);
REVOKE ALL ON public.fulfillment_evidence_upload_tokens FROM public, anon;
GRANT SELECT ON public.fulfillment_evidence_upload_tokens TO authenticated, agent_reader;
GRANT ALL ON public.fulfillment_evidence_upload_tokens TO service_role;

-- ─── 3. Line enrichment + zero-filter helper (mirrors ledger_post's skip) ────
-- Takes bare [{account_code, debit_cents?, credit_cents?}], drops all-zero lines
-- (D12 — exactly what public.ledger_post does before insert), attaches the chart
-- account name, preserves order. Both the preview and the settlement-preview
-- reuse this so the returned lines match the posted ledger_lines set exactly.
CREATE OR REPLACE FUNCTION public.fulfillment_enrich_ledger_lines(p_lines jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'account_code', e.l->>'account_code',
      'account_name', a.name,
      'debit_cents',  COALESCE((e.l->>'debit_cents')::int, 0),
      'credit_cents', COALESCE((e.l->>'credit_cents')::int, 0)
    ) ORDER BY e.ord), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY AS e(l, ord)
  LEFT JOIN public.ledger_accounts a ON a.code = e.l->>'account_code'
  WHERE COALESCE((e.l->>'debit_cents')::int, 0) <> 0
     OR COALESCE((e.l->>'credit_cents')::int, 0) <> 0;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_enrich_ledger_lines(jsonb) FROM public, anon, authenticated, service_role;

-- ─── 4. Exception consequence — the single derivation (preview == posted) ────
-- Given an exception + resolution path + params, returns the EXACT would-be
-- outcome: {path, financial, requires_leah, template, outcome, amount_cents,
-- line_action, lines[], summary}. lines[] is the canonical, zero-filtered,
-- name-enriched ledger set the commit path will post. Non-financial paths carry
-- an honest empty lines[] (spec §5.5: even "$0 — vendor absorbed" is a valid
-- outcome). INTERNAL: only the definer RPCs reach it; its jsonb crosses to the
-- portal only as the resolve-preview return.
CREATE OR REPLACE FUNCTION public.fulfillment_exception_consequence(
  p_exception_id uuid, p_path text, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  exc         public.fulfillment_exceptions;
  itm         public.fulfillment_order_items;
  v_amount    int;
  v_tax       int;
  v_lines     jsonb := '[]'::jsonb;
  v_template  text := NULL;
  v_outcome   text := NULL;
  v_financial boolean := false;
  v_leah      boolean := false;
  v_action    text := NULL;
  v_summary   text := NULL;
BEGIN
  SELECT * INTO exc FROM public.fulfillment_exceptions WHERE id = p_exception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfillment_exception_consequence: exception % not found', p_exception_id; END IF;
  IF exc.order_item_id IS NOT NULL THEN
    SELECT * INTO itm FROM public.fulfillment_order_items WHERE id = exc.order_item_id;
  END IF;

  CASE p_path
    -- ── damage: three T5 outcomes ──────────────────────────────────────────
    WHEN 'damage_vendor_claim' THEN
      v_template := 'T5'; v_outcome := 'claim'; v_financial := true;
      -- default claim basis = COGS at risk (qty · unit_cost); operator can override
      v_amount := COALESCE(NULLIF(p_params->>'amount_cents','')::int, itm.qty * COALESCE(itm.unit_cost_cents,0), 0);
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','1100','debit_cents',  v_amount),
        jsonb_build_object('account_code','5200','credit_cents', v_amount));
      v_summary := 'File a carrier/vendor claim for the damage; the receivable lands in Claims Receivable.';

    WHEN 'damage_client_credit' THEN
      v_template := 'T5'; v_outcome := 'client_credit'; v_financial := true;
      -- default credit basis = retail at risk (qty · unit_price)
      v_amount := COALESCE(NULLIF(p_params->>'amount_cents','')::int, itm.qty * COALESCE(itm.unit_price_cents,0), 0);
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','5200','debit_cents',  v_amount),
        jsonb_build_object('account_code','2300','credit_cents', v_amount));
      v_summary := 'Issue the client a credit for the damage; it books to Client Credits Payable.';

    WHEN 'damage_recovery' THEN
      v_template := 'T5'; v_outcome := 'recovery'; v_financial := true;
      v_amount := COALESCE(NULLIF(p_params->>'amount_cents','')::int, 0);
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','1000','debit_cents',  v_amount),
        jsonb_build_object('account_code','1100','credit_cents', v_amount));
      v_summary := 'Record a claim recovery received; it clears against Claims Receivable.';

    -- ── delay: ETA re-date, no ledger ──────────────────────────────────────
    WHEN 'delay_redate' THEN
      v_action := 'redate_eta';
      v_summary := 'Re-date the shipment ETA and draft the client an update. No financial outcome.';

    -- ── backorder: recommit (no ledger) | cancel (line, optional T4 refund) ─
    WHEN 'backorder_recommit' THEN
      v_action := 'recommit_ship';
      v_summary := 'Set a new committed ship date and draft the client an update. No financial outcome.';

    WHEN 'backorder_cancel' THEN
      v_action := 'cancel_line';
      v_amount := COALESCE(NULLIF(p_params->>'refund_cents','')::int, 0);
      v_tax    := COALESCE(NULLIF(p_params->>'tax_reversal_cents','')::int, 0);
      IF v_amount + v_tax > 0 THEN
        v_template := 'T4'; v_outcome := 'refund'; v_financial := true;
        v_lines := jsonb_build_array(
          jsonb_build_object('account_code','4900','debit_cents',  v_amount),
          jsonb_build_object('account_code','2100','debit_cents',  v_tax),
          jsonb_build_object('account_code','1000','credit_cents', v_amount + v_tax));
        v_summary := 'Cancel the back-ordered line and refund the client; the refund books to contra-revenue.';
      ELSE
        v_summary := 'Cancel the back-ordered line with no refund (nothing shipped, nothing captured against it).';
      END IF;

    -- ── generic refund (cancellation / return) ─────────────────────────────
    WHEN 'refund' THEN
      v_template := 'T4'; v_outcome := 'refund'; v_financial := true;
      v_amount := COALESCE(NULLIF(p_params->>'refund_cents','')::int, 0);
      v_tax    := COALESCE(NULLIF(p_params->>'tax_reversal_cents','')::int, 0);
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','4900','debit_cents',  v_amount),
        jsonb_build_object('account_code','2100','debit_cents',  v_tax),
        jsonb_build_object('account_code','1000','credit_cents', v_amount + v_tax));
      v_summary := 'Refund the client; the refund books to contra-revenue (plus any tax reversal).';

    -- ── substitution: route to Leah, no ledger, not resolved here ──────────
    WHEN 'substitution_review' THEN
      v_leah := true;
      v_summary := 'Package the comparison and route it to Leah. Resolves only on her ruling; no financial outcome by default.';

    -- ── records-only close (loss / client_change / cancellation / return) ──
    WHEN 'record_only' THEN
      v_summary := 'Record the outcome and close. No financial posting.';

    ELSE
      RAISE EXCEPTION 'fulfillment_exception_consequence: unknown resolution path %', p_path
        USING ERRCODE = 'invalid_parameter_value';
  END CASE;

  RETURN jsonb_build_object(
    'path',          p_path,
    'exception_id',  p_exception_id,
    'exception_type', exc.type,
    'financial',     v_financial,
    'requires_leah', v_leah,
    'template',      v_template,
    'outcome',       v_outcome,
    'amount_cents',  v_amount,
    'line_action',   v_action,
    'lines',         public.fulfillment_enrich_ledger_lines(v_lines),
    'summary',       v_summary
  );
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_exception_consequence(uuid, text, jsonb) FROM public, anon, authenticated, service_role;

-- ─── 5. fulfillment_resolve_exception — REAL preview + commit (S7 fence) ─────
-- The old (uuid,text,text,boolean,text) had no TS caller (only the S1 queue 'x'
-- toast). Dropped so the signature can gain p_params jsonb (carries amounts,
-- cause_code, memo, new_eta, comparison card, etc.).
DROP FUNCTION IF EXISTS public.fulfillment_resolve_exception(uuid, text, text, boolean, text);
CREATE OR REPLACE FUNCTION public.fulfillment_resolve_exception(
  p_exception_id uuid, p_path text, p_params jsonb, p_preview boolean, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started  timestamptz := clock_timestamp();
  cons       jsonb;
  exc        public.fulfillment_exceptions;
  v_cause    text := btrim(COALESCE(p_params->>'cause_code',''));
  v_memo     text := NULLIF(btrim(COALESCE(p_params->>'outcome_memo','')), '');
  v_evt      bigint;
  v_entry    uuid;
  v_refs     jsonb;
  v_review   uuid;
  v_ship     uuid;
  v_new_eta  date;
BEGIN
  -- Consequence is pure/read-only. Compute it FIRST so preview does zero writes.
  cons := public.fulfillment_exception_consequence(p_exception_id, p_path, p_params);

  IF p_preview THEN
    -- No state change AT ALL: return the would-be consequence, unposted.
    RETURN cons || jsonb_build_object('preview', true);
  END IF;

  -- ── commit ──────────────────────────────────────────────────────────────
  SELECT * INTO exc FROM public.fulfillment_exceptions WHERE id = p_exception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfillment_resolve_exception: exception % not found', p_exception_id; END IF;
  IF exc.status = 'resolved' THEN
    RAISE EXCEPTION 'fulfillment_resolve_exception: exception % is already resolved', p_exception_id;
  END IF;
  -- cause_code is REQUIRED on every non-preview call (spec §5.5: every close
  -- records a cause code; substitution routing stores it now so Leah's approve
  -- closes cleanly).
  IF v_cause = '' THEN
    RAISE EXCEPTION 'fulfillment_resolve_exception: cause_code is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.fulfillment_writer','rpc',true);
  v_refs := jsonb_build_object('exception_id', p_exception_id, 'order_id', exc.order_id,
                               'po_id', exc.po_id, 'shipment_id', exc.shipment_id,
                               'order_item_id', exc.order_item_id);

  -- ── substitution → route to Leah; NOT resolved ─────────────────────────
  IF (cons->>'requires_leah')::boolean THEN
    INSERT INTO public.leah_reviews (exception_id, payload, status)
    VALUES (p_exception_id, COALESCE(p_params->'comparison', '{}'::jsonb), 'pending')
    RETURNING id INTO v_review;
    UPDATE public.fulfillment_exceptions
       SET status = 'pending_leah', resolution_path = p_path,
           cause_code = v_cause, outcome_memo = v_memo
     WHERE id = p_exception_id;
    v_evt := public.fulfillment_log_event('exception.routed_to_leah', p_actor, exc.order_id, exc.po_id,
      exc.order_item_id, exc.shipment_id, p_exception_id,
      jsonb_build_object('leah_review', v_review, 'cause_code', v_cause), NULL, NULL, v_started);
    RETURN jsonb_build_object('routed_to_leah', true, 'review_id', v_review, 'status', 'pending_leah');
  END IF;

  -- ── side effects other than the ledger ─────────────────────────────────
  IF cons->>'line_action' = 'redate_eta' THEN
    v_ship := COALESCE(NULLIF(p_params->>'shipment_id','')::uuid, exc.shipment_id);
    v_new_eta := NULLIF(p_params->>'new_eta','')::date;
    IF v_ship IS NOT NULL AND v_new_eta IS NOT NULL THEN
      PERFORM public.fulfillment_update_shipment_eta(v_ship, v_new_eta,
        COALESCE(v_memo, 'exception: ' || exc.type), p_actor);
    END IF;
  ELSIF cons->>'line_action' = 'recommit_ship' THEN
    IF exc.po_id IS NOT NULL AND NULLIF(p_params->>'committed_ship','') IS NOT NULL THEN
      UPDATE public.fulfillment_vendor_pos
         SET committed_ship = (p_params->>'committed_ship')::date
       WHERE id = exc.po_id;
    END IF;
  ELSIF cons->>'line_action' = 'cancel_line' THEN
    -- cancel the linked line (state machine permits pre-shipped only)
    IF exc.order_item_id IS NOT NULL THEN
      UPDATE public.fulfillment_order_items SET line_state = 'cancelled'
       WHERE id = exc.order_item_id AND line_state NOT IN ('shipped','delivered','settled','cancelled');
    END IF;
  END IF;

  -- ── the resolution event FIRST, so the ledger entry has a source to ref ──
  -- (mirrors intake/settle: the T-templates require a non-null source_event_id).
  v_evt := public.fulfillment_log_event('exception.resolved', p_actor, exc.order_id, exc.po_id,
    exc.order_item_id, exc.shipment_id, p_exception_id,
    jsonb_build_object('resolution_path', p_path, 'cause_code', v_cause,
                       'financial', (cons->>'financial')::boolean,
                       'template', cons->>'template', 'amount_cents', (cons->>'amount_cents')::int),
    NULL, NULL, v_started);

  -- ── ledger posting via S6's T4/T5 templates (00360) ────────────────────
  IF (cons->>'financial')::boolean THEN
    IF cons->>'template' = 'T5' THEN
      v_entry := public.ledger_post_t5_damage(cons->>'outcome', (cons->>'amount_cents')::int, v_refs, v_evt, p_actor);
    ELSIF cons->>'template' = 'T4' THEN
      v_entry := public.ledger_post_t4_refund(exc.order_id, (cons->>'amount_cents')::int,
        COALESCE(NULLIF(p_params->>'tax_reversal_cents','')::int, 0), v_evt, p_actor);
    END IF;
  END IF;

  -- ── close the exception ────────────────────────────────────────────────
  UPDATE public.fulfillment_exceptions
     SET status = 'resolved', resolved_at = now(), resolution_path = p_path,
         cause_code = v_cause, outcome_memo = v_memo,
         financial_outcome_entry_id = v_entry
   WHERE id = p_exception_id;

  IF v_entry IS NOT NULL THEN
    PERFORM public.fulfillment_log_event('ledger.posted', p_actor, exc.order_id, exc.po_id, NULL, NULL, p_exception_id,
      jsonb_build_object('template', cons->>'template', 'entry_id', v_entry, 'source_event_id', v_evt),
      NULL, NULL, v_started);
  END IF;

  RETURN jsonb_build_object('resolved', true, 'status', 'resolved',
    'financial_outcome_entry_id', v_entry, 'cause_code', v_cause,
    'lines', cons->'lines');
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_resolve_exception(uuid, text, jsonb, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_resolve_exception(uuid, text, jsonb, boolean, text) TO service_role;

-- ─── 6. rule_leah_review — write-back to the linked exception (was a stub) ───
-- 00353 shipped a body that flipped leah_reviews.status and logged an event but
-- NEVER touched the exception. S7 completes it: approve → the routed substitution
-- resolves (status resolved, resolved_at; cause_code was stored at routing so the
-- financial-outcome guard passes — substitution is a non-financial path, so
-- financial_outcome_entry_id stays null, which is honest). reject → the exception
-- returns to 'open' with the rejection note appended to outcome_memo, ready for a
-- different resolution path. The client note is drafted by the rule ROUTE after
-- this returns (S4's single template source; keeps the RPC pure).
-- 00353 shipped this RETURNS void; changing the return type needs a DROP first
-- (CREATE OR REPLACE cannot change a function's return type). No caller yet
-- (the deck's rule action is added by this slice), so the drop is safe.
DROP FUNCTION IF EXISTS public.rule_leah_review(uuid, text, text);
CREATE OR REPLACE FUNCTION public.rule_leah_review(p_review_id uuid, p_status text, p_ruled_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  rev       public.leah_reviews;
  exc       public.fulfillment_exceptions;
  v_note    text;
BEGIN
  IF p_status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'rule_leah_review: p_status must be approved or rejected, got %', p_status;
  END IF;
  PERFORM set_config('app.fulfillment_writer','rpc',true);

  SELECT * INTO rev FROM public.leah_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'rule_leah_review: review % not found', p_review_id; END IF;
  IF rev.status <> 'pending' THEN
    RAISE EXCEPTION 'rule_leah_review: review % is already ruled (%)', p_review_id, rev.status;
  END IF;

  UPDATE public.leah_reviews SET status = p_status, ruled_at = now(), ruled_by = p_ruled_by
   WHERE id = p_review_id;

  SELECT * INTO exc FROM public.fulfillment_exceptions WHERE id = rev.exception_id;

  IF p_status = 'approved' THEN
    -- The substitution is accepted → the exception closes. cause_code was set at
    -- routing (resolve_exception's substitution path requires it), so the guard
    -- that every resolved exception carries a cause_code holds.
    UPDATE public.fulfillment_exceptions
       SET status = 'resolved', resolved_at = now(),
           resolution_path = 'substitution_approved',
           cause_code = COALESCE(cause_code, 'vendor_substitution')
     WHERE id = rev.exception_id;
    PERFORM public.fulfillment_log_event('exception.resolved', p_ruled_by, exc.order_id, exc.po_id,
      exc.order_item_id, exc.shipment_id, rev.exception_id,
      jsonb_build_object('leah_review', p_review_id, 'status', 'approved',
                         'resolution_path', 'substitution_approved'), NULL, NULL, v_started);
  ELSE
    -- Rejected → back to open with a note; a different path can now be taken.
    v_note := btrim(COALESCE(exc.outcome_memo || E'\n', '') || 'Leah passed on the substitution ' ||
                    to_char(now(), 'YYYY-MM-DD') || '; requesting the originally specified item.');
    UPDATE public.fulfillment_exceptions
       SET status = 'open', resolution_path = NULL, resolved_at = NULL, outcome_memo = v_note
     WHERE id = rev.exception_id;
    PERFORM public.fulfillment_log_event('exception.reopened', p_ruled_by, exc.order_id, exc.po_id,
      exc.order_item_id, exc.shipment_id, rev.exception_id,
      jsonb_build_object('leah_review', p_review_id, 'status', 'rejected'), NULL, NULL, v_started);
  END IF;

  RETURN jsonb_build_object('review_id', p_review_id, 'status', p_status,
    'exception_id', rev.exception_id,
    'exception_status', (SELECT status FROM public.fulfillment_exceptions WHERE id = rev.exception_id),
    'order_id', exc.order_id);
END;
$$;
REVOKE ALL ON FUNCTION public.rule_leah_review(uuid,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rule_leah_review(uuid,text,text) TO service_role;

-- ─── 7. Tokenized evidence-upload flow (mint / validate / append) ───────────
-- mint: admin-only, returns an opaque expiring token for one exception.
CREATE OR REPLACE FUNCTION public.fulfillment_mint_evidence_token(
  p_exception_id uuid, p_ttl_hours int, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_token   text;
  v_exp     timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fulfillment_exceptions WHERE id = p_exception_id) THEN
    RAISE EXCEPTION 'fulfillment_mint_evidence_token: exception % not found', p_exception_id;
  END IF;
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  -- url-safe opaque token: 64 lowercase-hex chars (two random UUIDs, dashes
  -- stripped) — matches the field-link token shape (/^[0-9a-f]{64}$/) the client
  -- page validates, and needs no pgcrypto (gen_random_uuid is core).
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_exp   := now() + make_interval(hours => GREATEST(COALESCE(p_ttl_hours, 72), 1));
  INSERT INTO public.fulfillment_evidence_upload_tokens (token, exception_id, expires_at, created_by)
  VALUES (v_token, p_exception_id, v_exp, p_actor);
  PERFORM public.fulfillment_log_event('exception.evidence_link_minted', p_actor, NULL, NULL, NULL, NULL,
    p_exception_id, jsonb_build_object('expires_at', v_exp), NULL, NULL, v_started);
  RETURN jsonb_build_object('token', v_token, 'exception_id', p_exception_id, 'expires_at', v_exp);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_mint_evidence_token(uuid,int,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_mint_evidence_token(uuid,int,text) TO service_role;

-- validate: returns client-safe context for a token (or {valid:false}). No PII
-- beyond the order number + item name the client already knows. Called by the
-- client-portal token route (service-role bearer), never the browser directly.
CREATE OR REPLACE FUNCTION public.fulfillment_evidence_token_context(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  tok public.fulfillment_evidence_upload_tokens;
  exc public.fulfillment_exceptions;
  v_order_no bigint;
  v_item text;
BEGIN
  SELECT * INTO tok FROM public.fulfillment_evidence_upload_tokens WHERE token = p_token;
  IF NOT FOUND OR tok.revoked OR tok.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false);
  END IF;
  SELECT * INTO exc FROM public.fulfillment_exceptions WHERE id = tok.exception_id;
  SELECT order_no INTO v_order_no FROM public.fulfillment_orders WHERE id = exc.order_id;
  IF exc.order_item_id IS NOT NULL THEN
    SELECT item_name INTO v_item FROM public.fulfillment_order_items WHERE id = exc.order_item_id;
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'exception_id', exc.id,
    'exception_type', exc.type,
    'order_no', v_order_no,
    'item_name', v_item,
    'already_uploaded', COALESCE(array_length(exc.evidence_r2_keys, 1), 0),
    'expires_at', tok.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_evidence_token_context(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_evidence_token_context(text) TO service_role;

-- append: token-gated write of R2 keys onto the exception. The token IS the
-- authority (NOT the admin RPC surface). Rejects expired/revoked tokens.
CREATE OR REPLACE FUNCTION public.fulfillment_append_evidence(
  p_token text, p_keys text[], p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  tok public.fulfillment_evidence_upload_tokens;
  v_exc uuid;
  v_order uuid;
BEGIN
  IF p_keys IS NULL OR array_length(p_keys, 1) IS NULL THEN
    RAISE EXCEPTION 'fulfillment_append_evidence: no keys provided';
  END IF;
  SELECT * INTO tok FROM public.fulfillment_evidence_upload_tokens WHERE token = p_token;
  IF NOT FOUND OR tok.revoked OR tok.expires_at <= now() THEN
    RAISE EXCEPTION 'fulfillment_append_evidence: invalid or expired token' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  UPDATE public.fulfillment_exceptions
     SET evidence_r2_keys = evidence_r2_keys || p_keys
   WHERE id = tok.exception_id
  RETURNING order_id INTO v_order;
  v_exc := tok.exception_id;
  UPDATE public.fulfillment_evidence_upload_tokens SET used_count = used_count + 1 WHERE token = p_token;
  PERFORM public.fulfillment_log_event('exception.evidence_added', COALESCE(p_actor,'client'), v_order, NULL, NULL, NULL,
    v_exc, jsonb_build_object('keys', to_jsonb(p_keys), 'via', 'token'), NULL, NULL, v_started);
  RETURN jsonb_build_object('exception_id', v_exc, 'added', array_length(p_keys, 1));
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_append_evidence(text, text[], text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_append_evidence(text, text[], text) TO service_role;

-- ─── 8. Settlement preview — mirrors S6's real fulfillment_settle_po (00360) ─
-- Read-only. Computes the three-way match (PO value · vendor invoice · variance
-- vs tolerance) AND the exact T3 + pledge + T6 lines the commit would post, so
-- the composer shows the posting in mono BEFORE commit. preview == posted holds
-- because this replicates ledger_post_t3_settle + ledger_post_t6_freight_trueup
-- line-for-line (both zero-filtered through fulfillment_enrich_ledger_lines).
-- Does NOT gate on the typed reason (the UI reveals that field when out of
-- tolerance; the RAISE lives in the real settle_po commit path).
CREATE OR REPLACE FUNCTION public.fulfillment_settle_po_preview(
  p_po_id uuid, p_vendor_invoice_cents int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  po           public.fulfillment_vendor_pos;
  v_expected   int; v_variance int; v_tol int; v_cfg jsonb;
  v_deposit    int; v_payable int;
  v_retail     int; v_commission int; v_rate numeric; v_pledge int;
  v_t3_lines   jsonb; v_pledge_lines jsonb := '[]'::jsonb; v_t6_lines jsonb := '[]'::jsonb;
  v_accepted   boolean;
  v_invoice    int := COALESCE(p_vendor_invoice_cents, 0);
BEGIN
  SELECT * INTO po FROM public.fulfillment_vendor_pos WHERE id = p_po_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfillment_settle_po_preview: po % not found', p_po_id; END IF;

  v_expected := po.product_cost_cents + po.freight_cost_cents;
  v_variance := v_invoice - v_expected;

  SELECT value INTO v_cfg FROM public.fulfillment_config WHERE key = 'settlement_variance_tolerance';
  v_tol := GREATEST(
    COALESCE((v_cfg->>'abs_cents')::int, 2500),
    round(COALESCE((v_cfg->>'pct_of_po')::numeric, 0.02) * v_expected)::int);
  v_accepted := abs(v_variance) <= v_tol;

  -- T3 (mirror ledger_post_t3_settle): clear the existing T2 deposit first
  SELECT COALESCE(sum(ll.debit_cents), 0) INTO v_deposit
    FROM public.ledger_entries le JOIN public.ledger_lines ll ON ll.entry_id = le.id
   WHERE le.refs->>'po_id' = p_po_id::text AND le.refs->>'template' = 'T2' AND ll.account_code = '1200';
  v_payable := (po.product_cost_cents + po.freight_cost_cents) - v_deposit;
  v_t3_lines := jsonb_build_array(
    jsonb_build_object('account_code','5000','debit_cents',  po.product_cost_cents),
    jsonb_build_object('account_code','5100','debit_cents',  po.freight_cost_cents),
    jsonb_build_object('account_code','1200','credit_cents', v_deposit),
    jsonb_build_object('account_code','2000','credit_cents', v_payable));

  -- pledge (mirror the T3 separate tagged entry)
  SELECT COALESCE(sum(oi.qty * oi.unit_price_cents), 0) INTO v_retail
    FROM public.fulfillment_vendor_po_lines l
    JOIN public.fulfillment_order_items oi ON oi.id = l.order_item_id
   WHERE l.po_id = p_po_id;
  v_commission := v_retail - po.product_cost_cents - v_variance;
  SELECT COALESCE((value->>'rate')::numeric, 0.25) INTO v_rate FROM public.fulfillment_config WHERE key = 'pledge_accrual';
  v_pledge := CASE WHEN v_commission > 0 THEN round(v_rate * v_commission)::int ELSE 0 END;
  IF v_pledge > 0 THEN
    v_pledge_lines := jsonb_build_array(
      jsonb_build_object('account_code','5300','debit_cents',  v_pledge),
      jsonb_build_object('account_code','2200','credit_cents', v_pledge));
  END IF;

  -- T6 freight true-up (mirror ledger_post_t6_freight_trueup)
  IF v_variance > 0 THEN
    v_t6_lines := jsonb_build_array(
      jsonb_build_object('account_code','5100','debit_cents',  abs(v_variance)),
      jsonb_build_object('account_code','2000','credit_cents', abs(v_variance)));
  ELSIF v_variance < 0 THEN
    v_t6_lines := jsonb_build_array(
      jsonb_build_object('account_code','2000','debit_cents',  abs(v_variance)),
      jsonb_build_object('account_code','5100','credit_cents', abs(v_variance)));
  END IF;

  RETURN jsonb_build_object(
    'po_id', p_po_id,
    'vendor_invoice_cents', v_invoice,
    'expected_cents', v_expected,
    'variance_cents', v_variance,
    'tolerance_cents', v_tol,
    'auto_accepted', v_accepted,
    'requires_reason', NOT v_accepted,
    'realized_commission_cents', v_commission,
    'pledge_cents', v_pledge,
    't3_lines',     public.fulfillment_enrich_ledger_lines(v_t3_lines),
    'pledge_lines', public.fulfillment_enrich_ledger_lines(v_pledge_lines),
    't6_lines',     public.fulfillment_enrich_ledger_lines(v_t6_lines),
    'lines',        public.fulfillment_enrich_ledger_lines(v_t3_lines || v_pledge_lines || v_t6_lines),
    'preview', true);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_settle_po_preview(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_settle_po_preview(uuid, int) TO service_role;
