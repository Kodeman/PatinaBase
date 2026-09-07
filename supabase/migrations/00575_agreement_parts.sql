-- ═══════════════════════════════════════════════════════════════════════════
-- 00575 — The Agreement, composed: parts on today's agreement
--
-- Wave 1 of "The Agreement, Composed". An agreement stops being seven fixed
-- facets on one wide row and becomes an ORDERED LIST OF PARTS that projects
-- into the terms row the guards already enforce. Nothing about the money rail
-- changes shape: proposal_service_terms is still the projection countersign
-- snapshots (00566:788-797), and only typed schedule variants ever write it
-- (R5). Prose is prose.
--
-- Lineage of every function redefined here (grep|sort|tail-1 winners,
-- re-verified against supabase/migrations at authoring time):
--   guard_commercial_authored_child             00412:604 → 00423:440
--   _commercial_document_fingerprint            00412:704 → 00422:251 → 00423:1214
--   upsert_design_services_draft                00412 → 00422:1707
--   send_commercial_document                    00412 → 00423:1546
--   _sign_design_services_agreement_authorized  00412:767
--   _issue_design_services_agreement_on_paper   00477:252
--   _countersign_design_services_agreement_impl 00475 → 00511 → 00566:304
--   get_project_authority_summary               00422:2381
--   classify_project_time_entry_authority       00412:2400
--   get_client_commercial_document_bundle       00412 → 00414 → 00422 → 00423
--                                                → 00425:1214
--
-- Reconciles:
--   (F-1) The fingerprint's `parts` key is CONDITIONAL on the proposal having
--         parts, exactly as `tradeScope` is conditional at 00423:1247. An
--         unconditional key would change the hash of EVERY existing proposal,
--         and _countersign_design_services_agreement_impl refuses when the
--         stored client signature disagrees (00566:628-631) — every document
--         sitting in 'client_signed' at apply time would become permanently
--         un-countersignable. A document with no parts hashes byte-for-byte
--         what it hashed before this file.
--   (F-2) billing_ceiling_cents drops NOT NULL on BOTH proposal_service_terms
--         (00412:73) and project_billing_authorities (00412:145). NULL means
--         uncapped, and it is legal ONLY when the agreement carries no
--         rate_card part. FOUR readers become NULL-safe: the addendum
--         promotion loop (00566:841-842), the exhaustion test and the
--         remaining-headroom arithmetic (00422:2449, :2467), and — the one
--         that decides whether a logged hour is billable at all —
--         classify_project_time_entry_authority (00412:2607-2613), whose
--         `v_prior_cents + NEW.rated_amount_cents <= COALESCE(project,
--         authority)` comparison is NULL on an uncapped authority and so
--         parked EVERY billable hour in 'pending_authorization' forever.
--   (F-3) ALL parts are hashed, not only client-visible ones; the parts alias
--         inside the fingerprint is `ap`, because the outer alias is `p`.
--   (F-4) upsert_design_services_draft refuses an empty rates array
--         (00422:1722-1728) and a flat-fee agreement has none, so the
--         projection is EXTRACTED into _project_agreement_terms and called by
--         both writers rather than that guard being weakened.
--
-- Every new SECURITY DEFINER here pins `search_path = public, pg_temp` — the
-- posture of the surrounding commercial family (00412 / 00422 / 00423), and
-- stricter than a bare `TO 'public'`, which leaves pg_temp implicitly first.
-- Extension functions are schema-qualified (`extensions.gen_random_uuid`) —
-- the prod push session's search_path lacks `extensions` (the 00282 incident).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — The parts of an agreement
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.proposal_agreement_parts (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id         uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  position            integer NOT NULL CHECK (position > 0),
  kind                text NOT NULL CHECK (char_length(btrim(kind)) > 0),
  variant             text NULL CHECK (variant IS NULL OR char_length(btrim(variant)) > 0),
  part_key            text NOT NULL CHECK (char_length(btrim(part_key)) > 0),
  title               text NOT NULL CHECK (char_length(btrim(title)) > 0),
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb
                        CHECK (jsonb_typeof(payload) = 'object'),
  required            boolean NOT NULL DEFAULT false,
  client_visible      boolean NOT NULL DEFAULT true,
  source_template_key text NULL,
  source_part_id      uuid NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_agreement_part_key UNIQUE (proposal_id, part_key)
);

-- Position uniqueness is DEFERRABLE so one statement can renumber a reordered
-- set without tripping over its own intermediate states.
ALTER TABLE public.proposal_agreement_parts
  DROP CONSTRAINT IF EXISTS uniq_agreement_part_position;
ALTER TABLE public.proposal_agreement_parts
  ADD CONSTRAINT uniq_agreement_part_position
  UNIQUE (proposal_id, position) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_agreement_parts_proposal_position
  ON public.proposal_agreement_parts (proposal_id, position);

DROP TRIGGER IF EXISTS set_proposal_agreement_parts_updated_at
  ON public.proposal_agreement_parts;
CREATE TRIGGER set_proposal_agreement_parts_updated_at
  BEFORE UPDATE ON public.proposal_agreement_parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.proposal_agreement_parts ENABLE ROW LEVEL SECURITY;

-- Same predicate as proposal_service_terms_studio_rw (00412:318-321): a part
-- belongs to the studio that authors the proposal, and to nobody else.
DROP POLICY IF EXISTS proposal_agreement_parts_studio_rw ON public.proposal_agreement_parts;
CREATE POLICY proposal_agreement_parts_studio_rw ON public.proposal_agreement_parts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p
                 WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                      WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)));

-- There is deliberately NO client policy. A client reads parts only through
-- get_client_commercial_document_bundle, the same discipline the terms and
-- rates tables keep (00412:332-335).
REVOKE ALL ON TABLE public.proposal_agreement_parts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proposal_agreement_parts TO authenticated;
GRANT ALL ON TABLE public.proposal_agreement_parts TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — The send guard learns the parts table
--
-- 00423:440 body VERBATIM except one added CASE arm. Everything else — the
-- draft test keying on proposals.status, the check_violation errcode, the
-- DELETE-returns-OLD tail, SECURITY INVOKER, the pinned search_path and the
-- full REVOKE — is unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_commercial_authored_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_id uuid := CASE TG_TABLE_NAME
    WHEN 'proposal_service_terms' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'proposal_service_rates' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'trade_scope_sections' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    -- 00575: an agreement's parts are authored content. Once the client
    -- has the document, the parts they were sent are the parts that bind.
    WHEN 'proposal_agreement_parts' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
  END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = v_proposal_id AND p.status = 'draft'
  ) THEN
    RAISE EXCEPTION '% is immutable after its proposal leaves draft', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_authored_child()
  FROM PUBLIC, anon, authenticated, service_role;

-- R6: parts freeze at SEND, not at signature — exactly like the terms row.
DROP TRIGGER IF EXISTS guard_proposal_agreement_parts_authored ON public.proposal_agreement_parts;
CREATE TRIGGER guard_proposal_agreement_parts_authored
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_agreement_parts
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_authored_child();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — The ceiling stops being mandatory
--
-- A flat-fee or retainer-only agreement has no hourly rate to cap, so a
-- ceiling on it is a number with nothing to mean. NULL is uncapped. It is
-- legal only when the agreement carries no rate_card part (R4), and the
-- CHECK (… >= 0) on both columns stays exactly as written — a CHECK is
-- satisfied by NULL, so nothing needs dropping.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.proposal_service_terms
  ALTER COLUMN billing_ceiling_cents DROP NOT NULL;
ALTER TABLE public.project_billing_authorities
  ALTER COLUMN billing_ceiling_cents DROP NOT NULL;

-- TRUE when this proposal still owes a role rate before it can be sent or
-- signed: either it has no parts at all (every document authored before
-- 00575, and every flag-off document — the legacy contract, unchanged), or it
-- has a rate_card part and therefore bills time (R4).
--
-- "A rate_card part" means the ONE part the rate projection reads: part_key
-- 'patina.role_rates', in the schedule/rate_card shape. Keying this on the
-- variant alone would demand role rates that nothing will ever project — a
-- rate card under any other key projects nothing (R5), so the document would
-- become permanently unsendable with a refusal naming a part that is right
-- there on the page. Predicate, projection and the R4 floor below all read
-- the same one part.
CREATE OR REPLACE FUNCTION public._agreement_requires_rate_card(p_proposal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.proposal_agreement_parts ap
           WHERE ap.proposal_id = p_proposal_id
         )
      OR EXISTS (
           SELECT 1 FROM public.proposal_agreement_parts ap
           WHERE ap.proposal_id = p_proposal_id
             AND ap.part_key = 'patina.role_rates'
             AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
         );
$$;
REVOKE ALL ON FUNCTION public._agreement_requires_rate_card(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3b — The fingerprint folds the parts in, conditionally (F-1)
--
-- 00423:1214 body VERBATIM; the delta is one conditional block appended to
-- the existing `|| CASE WHEN p.document_kind = 'trade_scope' … END` chain.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._commercial_document_fingerprint(p_proposal_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to((jsonb_build_object(
    'proposal', public._proposal_review_fingerprint(p_proposal_id),
    'documentKind', p.document_kind,
    'serviceTerms', (
      SELECT to_jsonb(t) - 'created_at' - 'updated_at'
      FROM public.proposal_service_terms t WHERE t.proposal_id = p.id
    ),
    'serviceRates', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) - 'id' - 'created_at' ORDER BY r.version, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p.id
    ), '[]'::jsonb),
    'furnishings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceProposalItemId', i.source_proposal_item_id,
        'sourceFfeItemId', i.source_ffe_item_id,
        'projectRoomId', i.project_room_id,
        'productId', i.product_id, 'name', i.name, 'roomName', i.room_name,
        'category', i.category, 'itemType', i.item_type, 'quantity', i.quantity,
        'clientUnitPriceCents', i.client_unit_price_cents,
        'clientLineTotalCents', i.client_line_total_cents,
        'snapshot', i.snapshot, 'sortOrder', i.sort_order
      ) ORDER BY i.sort_order, i.id)
      FROM public.furnishing_authorization_items i
      JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
      WHERE d.proposal_id = p.id
    ), '[]'::jsonb)
  ) || CASE WHEN p.document_kind = 'trade_scope' THEN jsonb_build_object(
    'tradeScope', jsonb_build_object(
      'partyId', (SELECT t.party_id FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyDisplayName', (SELECT t.party_display_name FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyCompanyName', (SELECT t.party_company_name FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyTrade', (SELECT t.party_trade FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'clientPriceCents', (SELECT t.client_price_cents FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'currency', (SELECT t.currency FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'terms', (SELECT t.terms FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'sections', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roomName', s.room_name, 'projectRoomId', s.project_room_id,
          'prose', s.prose, 'allocationCents', s.allocation_cents,
          'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.id)
        FROM public.trade_scope_sections s WHERE s.proposal_id = p.id
      ), '[]'::jsonb),
      'draws', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'label', w.label, 'percentage', w.percentage,
          'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
          'gatesOnAcceptance', w.gates_on_acceptance
        ) ORDER BY w.sort_order, w.id)
        FROM public.trade_scope_draws w WHERE w.proposal_id = p.id
      ), '[]'::jsonb)
    )
  ) ELSE '{}'::jsonb END
    -- 00575: parts join the hash the moment a document HAS parts, and not
    -- one moment sooner. CONDITIONAL, not unconditional: an unconditional
    -- key changes the digest of every legacy document, and countersign
    -- refuses when the stored client signature's evidence_fingerprint
    -- disagrees (00566:628-631). A parts-less document must hash exactly
    -- what it hashed before this migration, or every in-flight
    -- client_signed agreement dies. ALL parts are hashed, not only
    -- client-visible ones: the send guard freezes the whole set, and a
    -- studio-only part is still part of the instrument the two parties are
    -- bound by. to_jsonb(ap) minus the timestamps means a new column on
    -- that table is covered automatically, the same property serviceTerms
    -- has. The alias is `ap`, because the outer alias is already `p`.
    || CASE WHEN EXISTS (
         SELECT 1 FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p.id
       ) THEN jsonb_build_object(
    'parts', (
      SELECT jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at'
                       ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p.id
    )
  ) ELSE '{}'::jsonb END)::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.proposals p
  WHERE p.id = p_proposal_id;
$$;
REVOKE ALL ON FUNCTION public._commercial_document_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — The three refusals that relax (A: send, B: sign, C: on paper)
--
-- Each function is redefined from its head body VERBATIM with only the
-- role-rate predicate swapped for _agreement_requires_rate_card.
-- ═══════════════════════════════════════════════════════════════════════════

-- A · send_commercial_document, head 00423:1546.
CREATE OR REPLACE FUNCTION public.send_commercial_document(
  p_proposal_id uuid,
  p_expected_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_current_fingerprint text;
  v_dispatch_id uuid := extensions.gen_random_uuid();
  v_client_email text;
  v_client_name text;
  v_designer_name text;
  v_identity_name text;
  v_identity_logo text;
  v_identity_source text;
  v_sender_name text;
  v_studio_name text;
  v_studio_logo text;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw_total bigint;
  v_allocation_total bigint;
  v_allocation_count integer;
  v_section_count integer;
  v_draw_count integer;
  v_gate_count integer;
  v_gate_sort integer;
  v_max_sort integer;
  v_first_gates boolean;
  v_percentage_count integer;
  v_percentage_total numeric;
  v_previous_send text := current_setting('app.proposal_send_id', true);
  v_previous_dispatch text := current_setting('app.proposal_send_dispatch_link', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft' OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial draft % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_current_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed after review; refresh before sending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_proposal.client_id IS NULL OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.designer_clients dc
       WHERE dc.id = v_proposal.designer_client_id
         AND dc.designer_id = v_proposal.designer_id
         AND dc.client_id = v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'commercial document requires an exact client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: role rates are required only when the agreement bills time — a
  -- document with no parts (every pre-00575 and every flag-off document)
  -- still owes them, and so does one carrying a rate_card part. A composed
  -- flat-fee or retainer-only agreement owes none.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum') AND (
    NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
    OR (public._agreement_requires_rate_card(p_proposal_id)
        AND NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id))
  ) THEN
    RAISE EXCEPTION 'design-services send requires terms, and role rates whenever a rate card is present'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' AND NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.furnishing_authorization_items i ON i.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id
      AND EXISTS (SELECT 1 FROM public.project_budget_checkpoints c
        WHERE c.id = d.budget_checkpoint_id AND c.status IN ('acknowledged', 'overridden'))
  ) THEN
    RAISE EXCEPTION 'furnishings send requires a valid checkpoint and item snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00423: the trade arm. A scope is only a document when it says WHO does the
  -- work, WHAT the work is, WHAT it costs, and WHEN the client pays — and when
  -- the last two agree to the cent.
  IF v_proposal.document_kind = 'trade_scope' THEN
    SELECT * INTO v_terms FROM public.trade_scope_terms
    WHERE proposal_id = p_proposal_id;
    IF v_terms.proposal_id IS NULL OR v_terms.party_id IS NULL
       OR COALESCE(v_terms.client_price_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'trade scope send requires a named party and a client price'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_section_count FROM public.trade_scope_sections
    WHERE proposal_id = p_proposal_id;
    IF v_section_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one scope section'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), COALESCE(sum(amount_cents), 0),
           count(*) FILTER (WHERE gates_on_acceptance),
           max(sort_order),
           max(sort_order) FILTER (WHERE gates_on_acceptance)
    INTO v_draw_count, v_draw_total, v_gate_count, v_max_sort, v_gate_sort
    FROM public.trade_scope_draws WHERE proposal_id = p_proposal_id;
    IF v_draw_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_draw_total IS DISTINCT FROM v_terms.client_price_cents::bigint THEN
      RAISE EXCEPTION 'trade scope draw schedule must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_count <> 1 THEN
      RAISE EXCEPTION 'trade scope draw schedule must have exactly one acceptance-gated draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_sort IS DISTINCT FROM v_max_sort THEN
      RAISE EXCEPTION 'the acceptance-gated draw must be the last draw in the schedule'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The one-gate and gate-is-last rules hold TRIVIALLY on a single-draw
    -- schedule: with one row, min sort_order = max sort_order, so a lone 100%
    -- "Final · on acceptance" draw satisfies every check above. Execution then
    -- bills the lowest-sort draw at signature — which would invoice the client
    -- the whole scope price the moment they sign, on the strength of a document
    -- that says the money is due on acceptance. The first draw is the deposit by
    -- construction, so it is the one draw that cannot gate. Same selector the
    -- execute rail uses (sort_order, id), so the two can never disagree about
    -- which draw is first.
    SELECT w.gates_on_acceptance INTO v_first_gates
    FROM public.trade_scope_draws w
    WHERE w.proposal_id = p_proposal_id
    ORDER BY w.sort_order, w.id LIMIT 1;
    IF COALESCE(v_first_gates, false) THEN
      RAISE EXCEPTION 'the first draw is billed at signature, so it must not be the acceptance-gated one'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Percentage is display and amount_cents is the money, but a display figure
    -- that contradicts the money beside it is a second payment plan on the same
    -- page — and the client's document renders both. So when the studio states
    -- percentages at all, they must total 100 and each must describe its own
    -- amount. The tolerances are the honest ones: half a point for the total (a
    -- 33.3/33.3/33.4 schedule is a real schedule), and a dollar per line for the
    -- rounding an exact-cents split of an odd price forces.
    SELECT count(*) FILTER (WHERE w.percentage IS NOT NULL),
           COALESCE(sum(w.percentage), 0)
    INTO v_percentage_count, v_percentage_total
    FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id;
    IF v_percentage_count > 0 THEN
      IF abs(v_percentage_total - 100) > 0.5 THEN
        RAISE EXCEPTION 'trade scope draw percentages must total 100'
          USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.trade_scope_draws w
        WHERE w.proposal_id = p_proposal_id AND w.percentage IS NOT NULL
          AND abs(round(v_terms.client_price_cents * w.percentage / 100.0)
                  - w.amount_cents) > 100
      ) THEN
        RAISE EXCEPTION 'each trade scope draw percentage must match the amount beside it'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Allocations are optional as a SET. Once the studio starts apportioning the
    -- price across rooms, the apportionment must be complete and exact — a
    -- half-allocated scope tells the client a room costs $X and leaves the rest
    -- of the money unaccounted for.
    SELECT count(*) FILTER (WHERE allocation_cents IS NOT NULL),
           COALESCE(sum(allocation_cents), 0)
    INTO v_allocation_count, v_allocation_total
    FROM public.trade_scope_sections WHERE proposal_id = p_proposal_id;
    IF v_allocation_count > 0
       AND (v_allocation_count <> v_section_count
            OR v_allocation_total IS DISTINCT FROM v_terms.client_price_cents::bigint) THEN
      RAISE EXCEPTION 'trade scope section allocations must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM 1 FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.proposal_service_rates
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM i.id FROM public.furnishing_authorization_items i
  JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
  WHERE d.proposal_id = p_proposal_id ORDER BY i.id FOR UPDATE OF i;
  PERFORM 1 FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_sections
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_draws
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  IF public._commercial_document_fingerprint(p_proposal_id)
     IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed while sending; refresh before sending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent', sent_at = now(),
    total_amount = CASE
      WHEN v_proposal.document_kind = 'trade_scope'
        THEN COALESCE(v_terms.client_price_cents, total_amount)
      ELSE total_amount END,
    personal_message = COALESCE(p_personal_message, personal_message),
    valid_until = COALESCE(p_valid_until, valid_until), updated_at = now()
  WHERE id = p_proposal_id RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);

  -- The UPDATE above writes hashed fields — total_amount for a trade scope, and
  -- valid_until / personal_message on every rail — so the fingerprint verified
  -- twice before the write is no longer the hash of the document that just left.
  -- Recompute, so what the caller is handed is what
  -- _commercial_document_fingerprint answers about this document now. (Nothing
  -- after this point touches a hashed column: proposal_send_dispatch_id, status,
  -- sent_at and updated_at are all outside _proposal_review_fingerprint.)
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);

  SELECT profile.email, profile.full_name INTO v_client_email, v_client_name
  FROM public.profiles profile WHERE profile.id = v_proposal.client_id;
  IF NULLIF(btrim(COALESCE(v_client_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'commercial document client must have an email before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(profile.full_name, profile.display_name) INTO v_designer_name
  FROM public.profiles profile WHERE profile.id = v_proposal.designer_id;
  SELECT identity.name, identity.logo_url, identity.source
  INTO v_identity_name, v_identity_logo, v_identity_source
  FROM public.resolve_studio_identity(v_proposal.project_id, v_proposal.designer_id) identity;
  v_designer_name := COALESCE(NULLIF(btrim(v_designer_name), ''),
    NULLIF(btrim(v_identity_name), ''), 'Your designer');
  v_sender_name := COALESCE(NULLIF(btrim(v_identity_name), ''), v_designer_name);
  IF v_identity_source IN ('studio', 'business_name') THEN
    v_studio_name := NULLIF(btrim(v_identity_name), '');
    v_studio_logo := NULLIF(btrim(v_identity_logo), '');
  END IF;

  INSERT INTO public.proposal_send_dispatches (
    id, proposal_id, sent_at, designer_id, client_id, project_id,
    proposal_title, personal_message, valid_until, total_amount,
    recipient_email, recipient_name, designer_name, sender_name,
    studio_name, studio_logo_url, client_portal_path,
    provider_idempotency_key, email_log_id, in_app_log_id
  ) VALUES (
    v_dispatch_id, v_proposal.id, v_proposal.sent_at, v_proposal.designer_id,
    v_proposal.client_id, v_proposal.project_id, v_proposal.title,
    v_proposal.personal_message, v_proposal.valid_until, v_proposal.total_amount,
    v_client_email, v_client_name, v_designer_name, v_sender_name,
    v_studio_name, v_studio_logo, '/proposals/' || v_proposal.id::text,
    'proposal-send/' || v_dispatch_id::text,
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/email/' || v_dispatch_id::text),
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/in-app/' || v_dispatch_id::text)
  );
  PERFORM set_config('app.proposal_send_dispatch_link',
    v_proposal.id::text || ':' || v_dispatch_id::text, true);
  UPDATE public.proposals SET proposal_send_dispatch_id = v_dispatch_id
  WHERE id = v_proposal.id AND proposal_send_dispatch_id IS NULL
  RETURNING * INTO v_proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial document send dispatch link already exists'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'documentKind', v_proposal.document_kind,
    'commercialState', 'sent',
    'status', v_proposal.status,
    'sentAt', v_proposal.sent_at,
    'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
    'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', v_current_fingerprint
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.send_commercial_document(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_commercial_document(uuid, text, text, timestamptz)
  TO authenticated;

-- B · _sign_design_services_agreement_authorized, head 00412:767.
CREATE OR REPLACE FUNCTION public._sign_design_services_agreement_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_ip text := NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), '');
  v_fingerprint text;
  v_newly_signed boolean := false;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'sign_design_services_agreement requires an authenticated client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design services agreement or addendum', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state NOT IN ('sent', 'client_signed') THEN
    RAISE EXCEPTION 'design services agreement % is not client-signable (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.valid_until IS NOT NULL AND v_proposal.valid_until < now() THEN
    RAISE EXCEPTION 'design services agreement % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: same relaxation as send (A). Terms always; role rates only when
  -- the agreement carries a rate_card part, or carries no parts at all.
  IF NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
     OR (public._agreement_requires_rate_card(p_proposal_id)
         AND NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id))
  THEN
    RAISE EXCEPTION 'design services agreement requires terms, and at least one role rate whenever a rate card is present'
      USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_fingerprint IS NULL THEN
    RAISE EXCEPTION 'could not fingerprint design services agreement %', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client'
  FOR UPDATE;

  IF FOUND THEN
    IF v_signature.signer_user_id IS DISTINCT FROM p_client_id
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'client signature evidence conflicts with the current agreement fingerprint'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', p_client_id, v_name, v_ip, v_fingerprint,
      jsonb_build_object('via', 'sign_design_services_agreement')
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals
    SET commercial_state = 'client_signed', updated_at = now()
    WHERE id = p_proposal_id;
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_signed := true;
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'client_signed',
    'projectId', NULL,
    'signatureId', v_signature.id,
    'evidenceFingerprint', v_signature.evidence_fingerprint,
    'newlyClientSigned', v_newly_signed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._sign_design_services_agreement_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- C · _issue_design_services_agreement_on_paper, head 00477:252.
CREATE OR REPLACE FUNCTION public._issue_design_services_agreement_on_paper(
  p_proposal_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_issuer uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_send text := current_setting('app.proposal_send_id', true);
BEGIN
  IF v_issuer IS NULL THEN
    RAISE EXCEPTION 'issuing a design services agreement on paper requires an authenticated studio author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id)
     OR v_proposal.client_id IS NULL
     OR v_proposal.document_kind NOT IN ('design_services', 'service_addendum')
  THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Says what it found. The caller asked to issue a document still in the
  -- studio's hands; if it is not one, that is the answer, not a silent
  -- fall-through into a different act.
  IF COALESCE(v_proposal.commercial_state, 'draft') IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'design services agreement % is not issuable on paper (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  -- send's exact-client-relationship bar (00423:1598-1608), in send's words.
  -- The emailed rail refuses a document whose designer_client_id names a
  -- different household than client_id; the paper door is the same issuance by
  -- another route, so it refuses it too.
  IF v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.designer_clients dc
       WHERE dc.id = v_proposal.designer_client_id
         AND dc.designer_id = v_proposal.designer_id
         AND dc.client_id = v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'commercial document requires an exact client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00575: same relaxation as send (A) and sign (B). The paper door is the
  -- same issuance by another route, so it relaxes by the same predicate.
  IF NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
     OR (public._agreement_requires_rate_card(p_proposal_id)
         AND NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id))
  THEN
    RAISE EXCEPTION 'design services agreement requires terms, and at least one role rate whenever a rate card is present'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Both GUCs, one UPDATE: app.proposal_send_id is what 00387's
  -- guard_proposal_authority requires before status may enter 'sent', and
  -- app.commercial_document_id is what 00412's guard requires before
  -- commercial_state or either stamp may move. sent_at is deliberately absent —
  -- nothing was sent.
  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent',
    commercial_state = 'sent',
    issued_on_paper = true,
    paper_issued_by = v_issuer,
    updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._issue_design_services_agreement_on_paper(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4c — The four NULL-unsafe ceiling readers (F-2)
--
-- Head bodies VERBATIM; only the ceiling arithmetic learns NULL. The older
-- bodies at 00414:911-913, 00475:891 and 00511:4595 are SUPERSEDED by
-- 00566:841-842 and are deliberately not touched — redefining a superseded
-- body is exactly the 00199-reverts-00185 failure mode.
-- ═══════════════════════════════════════════════════════════════════════════

-- _countersign_design_services_agreement_impl, head 00566:304.
-- Its body_sha256 is pinned in
-- supabase/tests/edge_api/public_sd_hardening_contract_test.sql and is
-- re-pinned in the same change. Everything else that file pins is
-- unchanged: same signature, same arguments string, same result type, same
-- proconfig, still SECURITY DEFINER, no new lock, no nonowner ACL (CREATE
-- OR REPLACE preserves the ACL 00511 emptied).
CREATE OR REPLACE FUNCTION public._countersign_design_services_agreement_impl(
  p_proposal_id uuid,
  p_signer_name text,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_authority_studio_id uuid;
  v_client_signature public.commercial_document_signatures%ROWTYPE;
  v_studio_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_fingerprint text;
  v_project_id uuid;
  v_document_id uuid;
  v_authority_id uuid;
  v_retainer_invoice_id uuid;
  v_authorized_cents bigint := 0;
  v_pending_entry record;
  v_newly_executed boolean := false;
  v_name text := btrim(COALESCE(p_signer_name, ''));
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;   -- 00475
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_4180 record;
  v_row_4359 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'studio countersign requires an authenticated signer and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind IN ('design_services', 'service_addendum')
    AND (
      EXISTS (
        SELECT 1
        FROM public.project_commercial_documents AS document
        JOIN public.projects AS project ON project.id = document.project_id
        JOIN public.organizations AS studio ON studio.id = project.studio_id
        JOIN public.organization_members AS actor_membership
          ON actor_membership.organization_id = project.studio_id
         AND actor_membership.user_id = v_actor
        JOIN public.organization_members AS lead_membership
          ON lead_membership.organization_id = project.studio_id
         AND lead_membership.user_id = project.designer_id
        JOIN public.user_roles AS user_role
          ON user_role.user_id = project.designer_id
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE document.proposal_id = proposal.id
          AND document.document_kind = proposal.document_kind
          AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
          AND project.client_id = proposal.client_id
          AND project.status = 'active'
          AND studio.type = 'design_studio'
          AND studio.status = 'active'
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
          AND lead_membership.status = 'active'
          AND lead_membership.role <> 'guest'
          AND role.domain = 'designer'
      )
      OR (
        proposal.document_kind = 'design_services'
        AND proposal.project_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.project_commercial_documents AS bound_document
          WHERE bound_document.proposal_id = proposal.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_roles AS user_role
          JOIN public.roles AS role ON role.id = user_role.role_id
          WHERE user_role.user_id = proposal.designer_id
            AND role.domain = 'designer'
        )
        -- 00566. Same count-to-membership correction as the signature guard.
        AND EXISTS (
          SELECT 1
          FROM public.organizations AS studio
          JOIN public.organization_members AS lead_membership
            ON lead_membership.organization_id = studio.id
           AND lead_membership.user_id = proposal.designer_id
          JOIN public.organization_members AS actor_membership
            ON actor_membership.organization_id = studio.id
           AND actor_membership.user_id = v_actor
          WHERE studio.type = 'design_studio'
            AND studio.status = 'active'
            AND lead_membership.status = 'active'
            AND lead_membership.role <> 'guest'
            AND actor_membership.status = 'active'
            AND actor_membership.role <> 'guest'
        )
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document.id, document.project_id, project
  INTO v_row_4180
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS actor_membership
    ON actor_membership.organization_id = project.studio_id
   AND actor_membership.user_id = v_actor
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = v_proposal.document_kind
    AND (v_proposal.project_id IS NULL OR v_proposal.project_id = project.id)
    AND project.client_id = v_proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND actor_membership.status = 'active'
    AND actor_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';

  v_document_id := v_row_4180.id;
  v_project_id := v_row_4180.project_id;
  v_project := v_row_4180.project;

  IF FOUND THEN
    SELECT project.* INTO v_project
    FROM public.projects AS project
    WHERE project.id = v_project_id
      AND project.client_id = v_proposal.client_id
      AND project.designer_id = v_project.designer_id
      AND project.studio_id = v_project.studio_id
      AND project.status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_authority_studio_id := v_project.studio_id;
  ELSE
    -- 00566. The candidate set is EXACTLY 00563's (00563:255-278): the LEAD
    -- designer's own active non-guest memberships in active design studios,
    -- in 00563's order — a studio already hosting a project for this exact
    -- designer-client pair first, then 00317's owner-first, earliest-joined
    -- rule, organization id last for a total order. 00563 also carries
    -- has_designer_domain_role(designer_id) in that set; it is a per-designer
    -- predicate, already required of this lead by the access leg above, so
    -- the two sets are the same rows.
    --
    -- Resolving over the lead-AND-actor intersection instead (as the lowest-
    -- uuid body did) would let this function bind one studio while the
    -- project insert below runs set_project_studio_id, which sees only the
    -- LEAD's studios, and stamps another: a lead in studios A+B countersigned
    -- by a co-member of B alone bound B here and A there, and the trigger
    -- refused in its own opaque words. Both sides now answer the same
    -- question, and the countersigner's standing in the answer is stated
    -- immediately below. No row lock is taken, so the canonical
    -- roles -> user_roles -> memberships -> organization acquisition order
    -- below is unchanged.
    SELECT studio.id
    INTO v_authority_studio_id
    FROM public.organizations AS studio
    JOIN public.organization_members AS lead_membership
      ON lead_membership.organization_id = studio.id
     AND lead_membership.user_id = v_proposal.designer_id
    WHERE studio.type = 'design_studio'
      AND studio.status = 'active'
      AND lead_membership.status = 'active'
      AND lead_membership.role <> 'guest'
    ORDER BY
      EXISTS (
        SELECT 1
        FROM public.projects AS sibling
        WHERE sibling.studio_id = studio.id
          AND sibling.designer_id = v_proposal.designer_id
          AND sibling.client_id = v_proposal.client_id
      ) DESC,
      (lead_membership.role = 'owner') DESC,
      lead_membership.joined_at NULLS LAST,
      lead_membership.created_at,
      studio.id
    LIMIT 1;

    -- The studio above is the LEAD's answer, so the countersigner's own
    -- standing in it is asserted rather than assumed — the same check 00563
    -- makes of set_project_studio_id's actor before it returns. Refusing here
    -- names the failure at the point it happens; the authority legs further
    -- down re-check it under lock. Zero shared studios still fails closed.
    IF v_authority_studio_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      WHERE actor_membership.organization_id = v_authority_studio_id
        AND actor_membership.user_id = v_actor
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
    ) THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind IN ('design_services', 'service_addendum')
    AND (
      v_project_id IS NULL
      OR proposal.project_id IS NULL
      OR proposal.project_id = v_project_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_document_id IS NOT NULL THEN
    PERFORM document.id
    FROM public.project_commercial_documents AS document
    WHERE document.id = v_document_id
      AND document.proposal_id = v_proposal.id
      AND document.project_id = v_project_id
      AND document.document_kind = v_proposal.document_kind
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = COALESCE(v_project.designer_id, v_proposal.designer_id)
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF v_authority_studio_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_authority_studio_id
    AND membership.user_id = ANY(ARRAY[
      COALESCE(v_project.designer_id, v_proposal.designer_id), v_actor
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_authority_studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_authority_studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_authority_studio_id
         AND membership.user_id = COALESCE(
           v_project.designer_id, v_proposal.designer_id
         )
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_authority_studio_id
         AND membership.user_id = v_actor
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR (
       v_project_id IS NULL
       -- 00566. Was `1 <> count(...)`. The lead designer must still hold a
       -- live studio, but plural studios are no longer a refusal: the exact
       -- studio this countersign binds to was resolved above and its lead and
       -- actor memberships are re-checked immediately before this leg.
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_members AS membership
         JOIN public.organizations AS studio
           ON studio.id = membership.organization_id
         WHERE membership.user_id = v_proposal.designer_id
           AND membership.status = 'active'
           AND membership.role <> 'guest'
           AND studio.type = 'design_studio'
           AND studio.status = 'active'
       )
     )
  THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_client_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR SHARE;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_client_signature.id IS NULL
     OR v_client_signature.signer_user_id IS DISTINCT FROM v_proposal.client_id
     OR v_client_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
  THEN
    RAISE EXCEPTION 'studio countersign requires the exact current client consent fingerprint'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.commercial_state = 'executed' THEN
    SELECT document.id AS document_id, document.project_id AS project_id,
           authority.id AS authority_id,
           authority.retainer_invoice_id AS retainer_invoice_id,
           project AS project_row
    INTO v_row_4359
    FROM public.project_commercial_documents AS document
    JOIN public.projects AS project ON project.id = document.project_id
    JOIN public.project_billing_authorities AS authority
      ON authority.commercial_document_id = document.id
    WHERE document.proposal_id = p_proposal_id;

    v_document_id := v_row_4359.document_id;
    v_project_id := v_row_4359.project_id;
    v_authority_id := v_row_4359.authority_id;
    v_retainer_invoice_id := v_row_4359.retainer_invoice_id;
    v_project := v_row_4359.project_row;

    SELECT * INTO v_studio_signature FROM public.commercial_document_signatures
    WHERE proposal_id = p_proposal_id AND party_role = 'studio';
    IF v_document_id IS NULL OR v_studio_signature.id IS NULL
       OR v_studio_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'executed agreement has incomplete authority topology'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'client_signed' THEN
    IF EXISTS (SELECT 1 FROM public.proposal_items i WHERE i.proposal_id = p_proposal_id) THEN
      RAISE EXCEPTION 'design services agreement must not carry furnishing items'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO STRICT v_terms FROM public.proposal_service_terms
    WHERE proposal_id = p_proposal_id;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'studio', v_actor, v_name, v_fingerprint,
      jsonb_build_object('via', 'countersign_design_services_agreement')
    ) RETURNING * INTO v_studio_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_client_signature.signed_at,
      signed_by_name = v_client_signature.signed_name,
      -- 00414: signed_ip is NOT mirrored onto proposals (see the execution
      -- rail above and the column grant at the foot of this file). The
      -- client signature row keeps the IP; public.proposals does not.
      accepted_at = v_studio_signature.signed_at,
      updated_at = now()
    WHERE id = p_proposal_id;

    IF v_proposal.document_kind = 'design_services' THEN
      -- Current private bridge is the 00398 wrapper around the long-lived
      -- 00331 implementation. It preserves every project/proposal guard.
      v_project_id := public._activate_proposal_as_project_authorized(
        p_proposal_id, current_date
      );
      SELECT project.* INTO STRICT v_project
      FROM public.projects AS project
      WHERE project.id = v_project_id
      FOR SHARE;
      INSERT INTO public.project_commercial_documents (
        project_id, proposal_id, document_kind, is_origin, executed_at, created_by
      ) VALUES (
        v_project_id, p_proposal_id, 'design_services', true,
        v_studio_signature.signed_at, v_actor
      ) RETURNING id INTO v_document_id;

      -- 00475 (R109 ceremony class): execution IS the engagement start.
      -- Anchors the first main-lane phase to the day authority took effect.
      -- Only the origin agreement anchors — an addendum re-executes billing
      -- authority, not the engagement.
      v_anchor_phase_id := public._schedule_engagement_start_phase(v_project_id);
      IF v_anchor_phase_id IS NOT NULL THEN
        PERFORM public._commit_schedule_edit_authorized(
          v_project_id,
          jsonb_build_array(jsonb_build_object(
            'kind', 'phase-anchor',
            'phase_id', v_anchor_phase_id,
            'anchor_date', to_char(current_date, 'YYYY-MM-DD'),
            'source_ref', p_proposal_id
          )),
          'Design services agreement executed',
          p_disclosed_impact,
          'ceremony:design-services-executed'
        );
      END IF;
    ELSE
      SELECT document.id, document.project_id
      INTO v_document_id, v_project_id
      FROM public.project_commercial_documents AS document
      WHERE document.proposal_id = p_proposal_id
        AND document.document_kind = 'service_addendum';
      SELECT project.* INTO v_project
      FROM public.projects AS project
      WHERE project.id = v_project_id
      FOR UPDATE;
      PERFORM document.id
      FROM public.project_commercial_documents AS document
      WHERE document.id = v_document_id
        AND document.project_id = v_project_id
      FOR UPDATE;
      IF v_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.project_commercial_documents origin
        JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
        WHERE origin.project_id = v_project_id AND origin.is_origin
          AND origin_proposal.commercial_state = 'executed'
      ) THEN
        RAISE EXCEPTION 'service addendum has no executed project origin'
          USING ERRCODE = 'check_violation';
      END IF;
      -- Different addenda lock different proposal rows. Serialize their
      -- authority replacement on the shared project before ending/inserting
      -- the one active authority enforced by the partial unique index.
      PERFORM 1 FROM public.projects
      WHERE id = v_project_id
      FOR UPDATE;
      UPDATE public.project_commercial_documents
      SET executed_at = v_studio_signature.signed_at
      WHERE id = v_document_id;
      UPDATE public.project_billing_authorities
      SET status = 'superseded', ended_at = v_studio_signature.signed_at
      WHERE project_id = v_project_id AND status = 'active';
    END IF;

    IF v_terms.retainer_amount_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_project_id, v_project.designer_id, v_proposal.client_id, 'draft', 'USD',
        v_terms.retainer_amount_cents, 0, 0, v_terms.retainer_amount_cents,
        'Design services retainer · ' || v_proposal.title
      ) RETURNING id INTO v_retainer_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_retainer_invoice_id, 'adhoc', 'Design services retainer', 1,
        v_terms.retainer_amount_cents, v_terms.retainer_amount_cents,
        jsonb_build_object('commercialDocumentId', v_document_id, 'kind', 'design_services_retainer')
      );
      PERFORM app_private.issue_invoice_for_actor(
        v_retainer_invoice_id, current_date, v_actor
      );
    END IF;

    INSERT INTO public.project_billing_authorities (
      project_id, commercial_document_id, source_proposal_id,
      billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy,
      billing_cadence, retainer_invoice_id, effective_at
    ) VALUES (
      v_project_id, v_document_id, p_proposal_id,
      v_terms.billing_ceiling_cents, v_terms.retainer_amount_cents,
      v_terms.retainer_activation_policy, v_terms.billing_cadence, v_retainer_invoice_id,
      v_studio_signature.signed_at
    ) RETURNING id INTO v_authority_id;

    INSERT INTO public.project_billing_authority_rates (
      billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents
    ) SELECT v_authority_id, r.id, r.version, r.role_name, r.hourly_rate_cents
      FROM public.proposal_service_rates r
      WHERE r.proposal_id = p_proposal_id
      ORDER BY r.version, r.sort_order, r.role_name;

    IF v_proposal.document_kind = 'service_addendum' THEN
      SELECT COALESCE(sum(entry.rated_amount_cents), 0)
      INTO v_authorized_cents
      FROM public.project_time_entries entry
      WHERE entry.project_id = v_project_id
        AND entry.billing_state = 'authorized'
        AND entry.billable AND entry.duration_minutes IS NOT NULL;

      -- A replacement ceiling is cumulative across the project. Promote only
      -- the oldest already-rated pending work that now fits; its historical
      -- authority/rate/amount snapshots never change.
      FOR v_pending_entry IN
        SELECT entry.id, entry.rated_amount_cents
        FROM public.project_time_entries entry
        JOIN public.project_billing_authorities prior_authority
          ON prior_authority.id = entry.billing_authority_id
        WHERE entry.project_id = v_project_id
          AND entry.billing_state = 'pending_authorization'
          AND entry.billable AND entry.duration_minutes IS NOT NULL
          AND entry.rated_amount_cents IS NOT NULL
          AND entry.authority_rate_id IS NOT NULL
          AND entry.billing_authority_id <> v_authority_id
          AND (
            prior_authority.retainer_activation_policy = 'immediate'
            OR prior_authority.retainer_amount_cents = 0
            OR EXISTS (
              SELECT 1 FROM public.invoices paid_retainer
              WHERE paid_retainer.id = prior_authority.retainer_invoice_id
                AND paid_retainer.status = 'paid'
                AND paid_retainer.amount_paid_cents >= paid_retainer.total_cents
            )
          )
        ORDER BY entry.started_at, entry.id
        FOR UPDATE OF entry
      LOOP
        -- 00575 (F-2): a NULL ceiling is UNCAPPED. Left as written, the
        -- comparison evaluates NULL, the IF takes the false branch, and
        -- nothing is ever authorized on an uncapped agreement.
        IF v_terms.billing_ceiling_cents IS NULL
           OR v_authorized_cents + v_pending_entry.rated_amount_cents
              <= v_terms.billing_ceiling_cents THEN
          UPDATE public.project_time_entries
          SET billing_state = 'authorized', updated_at = now()
          WHERE id = v_pending_entry.id;
          v_authorized_cents := v_authorized_cents + v_pending_entry.rated_amount_cents;
        END IF;
      END LOOP;
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_executed := true;
  ELSE
    RAISE EXCEPTION 'design services agreement % is not ready to countersign (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'executed',
    'projectId', v_project_id,
    'billingAuthorityId', v_authority_id,
    'retainerInvoiceId', v_retainer_invoice_id,
    'newlyExecuted', v_newly_executed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- get_project_authority_summary, head 00422:2381.
CREATE OR REPLACE FUNCTION public.get_project_authority_summary(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_currency text := 'USD';
  v_accrued bigint := 0;
  v_invoiced bigint := 0;
  v_pending bigint := 0;
  v_retainer_paid_cents bigint := 0;
  v_active_rate_version integer := 1;
  v_furnishings_deposit numeric;
  v_billing_through timestamptz;
  v_state text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_authority FROM public.project_billing_authorities
  WHERE project_id = p_project_id
  ORDER BY (status = 'active') DESC, effective_at DESC, id DESC LIMIT 1;
  IF v_authority.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(t.currency, 'USD'), COALESCE(t.current_rate_version, 1),
         t.furnishings_deposit_percent
  INTO v_currency, v_active_rate_version, v_furnishings_deposit
  FROM public.proposal_service_terms t
  WHERE t.proposal_id = v_authority.source_proposal_id;

  SELECT
    COALESCE(sum(rated_amount_cents) FILTER (WHERE billing_state = 'authorized'), 0),
    COALESCE(sum(rated_amount_cents) FILTER (WHERE billing_state = 'pending_authorization'), 0),
    COALESCE(sum(rated_amount_cents) FILTER (
      WHERE billing_state = 'authorized' AND invoice_id IS NOT NULL
        AND invoice_status IS DISTINCT FROM 'void'
    ), 0),
    max(started_at) FILTER (
      WHERE billing_state = 'authorized' AND invoice_id IS NOT NULL
        AND invoice_status IS DISTINCT FROM 'void'
    )
  INTO v_accrued, v_pending, v_invoiced, v_billing_through
  FROM (
    SELECT te.*, invoice.status AS invoice_status
    FROM public.project_time_entries te
    LEFT JOIN public.invoices invoice ON invoice.id = te.invoice_id
    WHERE te.project_id = p_project_id AND te.billable
      AND te.duration_minutes IS NOT NULL
  ) rated;

  IF v_authority.retainer_invoice_id IS NOT NULL THEN
    SELECT least(COALESCE(i.amount_paid_cents, 0), v_authority.retainer_amount_cents)
    INTO v_retainer_paid_cents
    FROM public.invoices i WHERE i.id = v_authority.retainer_invoice_id;
  END IF;
  v_retainer_paid_cents := COALESCE(v_retainer_paid_cents, 0);
  v_state := CASE
    WHEN v_authority.status = 'superseded' THEN 'superseded'
    -- 00575 (F-2): an uncapped authority is never exhausted by accrual.
    WHEN v_authority.status = 'exhausted'
      OR (v_authority.billing_ceiling_cents IS NOT NULL
          AND v_accrued >= v_authority.billing_ceiling_cents) THEN 'exhausted'
    WHEN v_authority.retainer_activation_policy = 'retainer_paid'
      AND v_retainer_paid_cents < v_authority.retainer_amount_cents
      THEN 'retainer_pending'
    ELSE 'active'
  END;

  RETURN jsonb_build_object(
    'id', v_authority.id,
    'projectId', v_authority.project_id,
    'agreementId', v_authority.source_proposal_id,
    'state', v_state,
    'currency', v_currency,
    'ceilingCents', v_authority.billing_ceiling_cents,
    'authorizedCents', v_authority.billing_ceiling_cents,
    'accruedCents', v_accrued,
    'invoicedCents', v_invoiced,
    'pendingAuthorizationCents', v_pending,
    -- 00575 (F-2): greatest() SKIPS NULLs, so an uncapped ceiling used to
    -- read as 0 remaining — the opposite of uncapped. NULL means "no
    -- ceiling"; every TypeScript reader of remainingCents accepts null.
    'remainingCents', CASE WHEN v_authority.billing_ceiling_cents IS NULL THEN NULL
      ELSE greatest(v_authority.billing_ceiling_cents - v_accrued, 0) END,
    'retainerAmountCents', v_authority.retainer_amount_cents,
    'retainerPaidCents', v_retainer_paid_cents,
    'retainerActivationPolicy', v_authority.retainer_activation_policy,
    'activeRateVersion', v_active_rate_version,
    'furnishingsDepositPercent', v_furnishings_deposit,
    'billingThrough', v_billing_through,
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'proposalId', v_authority.source_proposal_id,
      'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents,
      'effectiveAt', source.effective_at
    ) ORDER BY r.version DESC, r.role_name) FROM public.project_billing_authority_rates r
      JOIN public.proposal_service_rates source ON source.id = r.source_rate_id
      WHERE r.billing_authority_id = v_authority.id), '[]'::jsonb),
    'includesRawEntries', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_authority_summary(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_authority_summary(uuid)
  TO authenticated;

-- classify_project_time_entry_authority, head 00412:2400 — the reader that
-- decides, on every logged hour, whether that hour is authorized. Body
-- VERBATIM; the only delta is the ceiling comparison. The trigger
-- aac_classify_project_time_entry_authority_trg is untouched: CREATE OR
-- REPLACE swaps the body under it, and the stable-project-row lock
-- design_services_authority_test.sql:191 pins is still exactly where 00412
-- put it.
CREATE OR REPLACE FUNCTION public.classify_project_time_entry_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_services_project boolean;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_rate public.project_billing_authority_rates%ROWTYPE;
  v_prior_cents bigint;
  v_current_version integer;
  v_project_designer_id uuid;
  v_team_role text;
  v_normalized_role text;
  v_role_match_count integer := 0;
  v_current_rate_count integer := 0;
  v_retainer_ready boolean := false;
  v_is_bound boolean := false;
  v_project_ceiling_cents bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.billing_authority_id IS NOT NULL AND (
    NEW.billing_authority_id IS DISTINCT FROM OLD.billing_authority_id
    OR NEW.authority_rate_id IS DISTINCT FROM OLD.authority_rate_id
    OR NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents
  ) THEN
    RAISE EXCEPTION 'time-entry authority and rate provenance are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Browser-supplied rate/authority ids are never selection authority. New
  -- rows and previously-unclassified rows are resolved exclusively from the
  -- signed project authority and server-owned team role below.
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.authority_rate_id IS NULL) THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind = 'design_services'
  ) INTO v_is_services_project;

  IF NOT NEW.billable THEN
    NEW.billing_state := 'nonbillable';
    NEW.rated_amount_cents := CASE WHEN NEW.duration_minutes IS NULL THEN NULL ELSE 0 END;
    RETURN NEW;
  END IF;
  IF NOT v_is_services_project THEN
    NEW.billing_state := 'authorized';
    IF NEW.duration_minutes IS NOT NULL AND NEW.hourly_rate_cents IS NOT NULL THEN
      NEW.rated_amount_cents := round(NEW.duration_minutes / 60.0 * NEW.hourly_rate_cents)::integer;
    END IF;
    RETURN NEW;
  END IF;

  -- Every commercial classifier takes the same stable project lock used by an
  -- addendum countersign. It serializes project-wide accrued-ceiling reads even
  -- when the entry binds a superseded authority while another entry binds the
  -- active replacement authority.
  SELECT project.designer_id INTO v_project_designer_id
  FROM public.projects project
  WHERE project.id = NEW.project_id
  FOR UPDATE;

  SELECT authority.billing_ceiling_cents INTO v_project_ceiling_cents
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = NEW.project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC, authority.id DESC
  LIMIT 1;

  IF TG_OP = 'UPDATE' AND OLD.billing_authority_id IS NOT NULL THEN
    v_is_bound := true;
    SELECT * INTO v_authority FROM public.project_billing_authorities
    WHERE id = OLD.billing_authority_id AND project_id = NEW.project_id
    FOR UPDATE;
    SELECT * INTO v_rate FROM public.project_billing_authority_rates
    WHERE id = OLD.authority_rate_id
      AND billing_authority_id = OLD.billing_authority_id;
    IF v_authority.id IS NULL OR v_rate.id IS NULL THEN
      RAISE EXCEPTION 'bound commercial time entry has invalid authority provenance'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.billing_authority_id := OLD.billing_authority_id;
    NEW.authority_rate_id := OLD.authority_rate_id;
    NEW.hourly_rate_cents := OLD.hourly_rate_cents;
  ELSE
    SELECT * INTO v_authority FROM public.project_billing_authorities
    WHERE project_id = NEW.project_id
      AND effective_at <= NEW.started_at
      AND (ended_at IS NULL OR ended_at > NEW.started_at)
    ORDER BY effective_at DESC, id DESC LIMIT 1
    FOR UPDATE;
  END IF;
  IF v_authority.id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
    NEW.billing_state := 'pending_authorization';
    NEW.rated_amount_cents := NULL;
    RETURN NEW;
  END IF;

  IF NOT v_is_bound THEN
    SELECT max(rate.version) INTO v_current_version
    FROM public.project_billing_authority_rates rate
    JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
    WHERE rate.billing_authority_id = v_authority.id
      AND source.effective_at <= NEW.started_at;

    IF v_project_designer_id IS NOT DISTINCT FROM NEW.user_id THEN
      v_team_role := 'lead_designer';
    ELSE
      SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END
      INTO v_team_role
      FROM public.project_team_members member
      WHERE member.project_id = NEW.project_id
        AND member.user_id = NEW.user_id
        AND member.removed_at IS NULL;
    END IF;
    v_normalized_role := regexp_replace(
      replace(lower(btrim(COALESCE(v_team_role, ''))), '_', ' '),
      '\s+', ' ', 'g'
    );

    IF v_current_version IS NOT NULL AND v_normalized_role <> '' THEN
      SELECT count(*) INTO v_role_match_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at
        AND regexp_replace(
          replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g'
        ) = v_normalized_role;
      IF v_role_match_count = 1 THEN
        SELECT rate.* INTO v_rate
        FROM public.project_billing_authority_rates rate
        JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
        WHERE rate.billing_authority_id = v_authority.id
          AND rate.version = v_current_version
          AND source.effective_at <= NEW.started_at
          AND regexp_replace(
            replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g'
          ) = v_normalized_role;
      END IF;
    END IF;

    IF v_rate.id IS NULL AND v_current_version IS NOT NULL THEN
      SELECT count(*) INTO v_current_rate_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at;
      IF v_current_rate_count = 1 THEN
        SELECT rate.* INTO v_rate
        FROM public.project_billing_authority_rates rate
        JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
        WHERE rate.billing_authority_id = v_authority.id
          AND rate.version = v_current_version
          AND source.effective_at <= NEW.started_at;
      END IF;
    END IF;
  END IF;

  IF v_rate.id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
    NEW.hourly_rate_cents := NULL;
    NEW.rated_amount_cents := NULL;
    NEW.billing_state := 'pending_authorization';
    RETURN NEW;
  END IF;
  IF NOT v_is_bound THEN
    NEW.billing_authority_id := v_authority.id;
    NEW.authority_rate_id := v_rate.id;
    NEW.hourly_rate_cents := v_rate.hourly_rate_cents;
  END IF;

  v_retainer_ready := v_authority.retainer_activation_policy = 'immediate'
    OR v_authority.retainer_amount_cents = 0
    OR EXISTS (
      SELECT 1 FROM public.invoices invoice
      WHERE invoice.id = v_authority.retainer_invoice_id
        AND invoice.status = 'paid'
        AND invoice.amount_paid_cents >= invoice.total_cents
    );

  IF NEW.duration_minutes IS NULL THEN
    NEW.rated_amount_cents := NULL;
    NEW.billing_state := CASE WHEN v_retainer_ready
      THEN 'authorized' ELSE 'pending_authorization' END;
    RETURN NEW;
  END IF;
  NEW.rated_amount_cents := round(
    NEW.duration_minutes / 60.0 * CASE WHEN v_is_bound
      THEN OLD.hourly_rate_cents ELSE v_rate.hourly_rate_cents END
  )::integer;
  IF NOT v_retainer_ready THEN
    NEW.billing_state := 'pending_authorization';
    RETURN NEW;
  END IF;
  SELECT COALESCE(sum(t.rated_amount_cents), 0) INTO v_prior_cents
  FROM public.project_time_entries t
  WHERE t.project_id = NEW.project_id
    AND t.billing_state = 'authorized'
    AND t.billable AND t.duration_minutes IS NOT NULL
    AND t.id IS DISTINCT FROM NEW.id;
  -- 00575 (F-2): the ONE delta from 00412:2607-2613. billing_ceiling_cents is
  -- nullable now and NULL means uncapped, so the comparison has to answer
  -- "authorized" instead of evaluating to NULL and falling to the ELSE.
  IF COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents) IS NULL
     OR v_prior_cents + NEW.rated_amount_cents
        <= COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents) THEN
    NEW.billing_state := 'authorized';
  ELSE
    NEW.billing_state := 'pending_authorization';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.classify_project_time_entry_authority()
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — The projection: one implementation, two callers
--
-- Lifted VERBATIM out of upsert_design_services_draft (00422:1749-1793) so
-- the seven-facet room and a composed part list write the terms row through
-- ONE body. The flag-off caller's behavior is byte-identical to 00422 —
-- including COALESCE(billingCeilingCents, 0), which a JSON null or an omitted
-- key still lands as 0. Only the parts door may write NULL, and it says so
-- explicitly: p_allow_null_ceiling. The guarantee lives in the FUNCTION, not
-- in the discipline of one TypeScript caller (both RPCs are GRANTed to
-- authenticated, and Math.round(undefined) serializes as JSON null).
--
-- upsert_design_services_draft keeps its own empty-rates refusal
-- (00422:1722-1728); this helper does not re-assert it, because a flat-fee
-- agreement composed from parts legitimately carries zero rates (F-4).
-- ═══════════════════════════════════════════════════════════════════════════

-- The 3-argument shape never shipped anywhere; dropping it keeps a re-run of
-- this file from leaving two overloads that an unqualified 3-arg call cannot
-- choose between.
DROP FUNCTION IF EXISTS public._project_agreement_terms(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public._project_agreement_terms(
  p_proposal_id uuid,
  p_terms jsonb,
  p_rates jsonb,
  p_allow_null_ceiling boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rate jsonb;
  v_current_version integer := COALESCE((p_terms->>'currentRateVersion')::integer, 1);
BEGIN
  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version, furnishings_deposit_percent
  ) VALUES (
    p_proposal_id,
    COALESCE(p_terms->>'scope', ''),
    COALESCE(p_terms->'deliverables', '[]'::jsonb),
    COALESCE(p_terms->'exclusions', '[]'::jsonb),
    -- The ONE delta from 00422:1756, and it is opt-in: only a caller that
    -- passes p_allow_null_ceiling may write NULL (uncapped). The false branch
    -- is 00422:1756 character for character, so the flag-off door still turns
    -- an omitted or JSON-null ceiling into 0.
    CASE WHEN p_allow_null_ceiling
      THEN (NULLIF(p_terms->>'billingCeilingCents', ''))::integer
      ELSE COALESCE((p_terms->>'billingCeilingCents')::integer, 0)
    END,
    COALESCE((p_terms->>'retainerAmountCents')::integer, 0),
    COALESCE(NULLIF(p_terms->>'retainerActivationPolicy', ''), 'immediate'),
    COALESCE(NULLIF(p_terms->>'billingCadence', ''), 'monthly'),
    upper(COALESCE(NULLIF(p_terms->>'currency', ''), 'USD')),
    NULLIF(p_terms->>'terms', ''),
    v_current_version,
    NULLIF(p_terms->>'furnishingsDepositPercent', '')::numeric
  ) ON CONFLICT (proposal_id) DO UPDATE SET
    scope = EXCLUDED.scope,
    deliverables = EXCLUDED.deliverables,
    exclusions = EXCLUDED.exclusions,
    billing_ceiling_cents = EXCLUDED.billing_ceiling_cents,
    retainer_amount_cents = EXCLUDED.retainer_amount_cents,
    retainer_activation_policy = EXCLUDED.retainer_activation_policy,
    billing_cadence = EXCLUDED.billing_cadence,
    currency = EXCLUDED.currency,
    terms = EXCLUDED.terms,
    current_rate_version = EXCLUDED.current_rate_version,
    furnishings_deposit_percent = EXCLUDED.furnishings_deposit_percent,
    updated_at = now();

  DELETE FROM public.proposal_service_rates WHERE proposal_id = p_proposal_id;
  FOR v_rate IN SELECT value FROM jsonb_array_elements(COALESCE(p_rates, '[]'::jsonb))
  LOOP
    INSERT INTO public.proposal_service_rates (
      proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at
    ) VALUES (
      p_proposal_id,
      COALESCE((v_rate->>'version')::integer, v_current_version),
      btrim(v_rate->>'roleName'),
      (v_rate->>'hourlyRateCents')::integer,
      COALESCE((v_rate->>'sortOrder')::integer, 0),
      COALESCE((v_rate->>'effectiveAt')::timestamptz, now())
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._project_agreement_terms(uuid, jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- upsert_design_services_draft, head 00422:1707 — body VERBATIM with
-- 00422:1749-1793 replaced by a call to the extracted projection. Its
-- empty-rates refusal (00422:1722-1728) is deliberately untouched: the
-- seven-facet room still owes at least one rate.
CREATE OR REPLACE FUNCTION public.upsert_design_services_draft(
  p_proposal_id uuid,
  p_terms jsonb,
  p_rates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_rate jsonb;
  v_current_version integer := COALESCE((p_terms->>'currentRateVersion')::integer, 1);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(COALESCE(p_terms, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_rates, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_rates) = 0
  THEN
    RAISE EXCEPTION 'design-services draft requires an authenticated author, terms, and rates'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END,
      commercial_state = 'draft', updated_at = now()
  WHERE id = p_proposal_id;

  -- 00575: the projection moved to _project_agreement_terms, verbatim.
  -- Every refusal above, the kind widen, both set_config calls, the return
  -- object and the EXCEPTION restore below are unchanged. false = this door
  -- may not write an uncapped ceiling; 00422's COALESCE(..., 0) still stands
  -- for it.
  PERFORM public._project_agreement_terms(p_proposal_id, p_terms, p_rates, false);

  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentKind', CASE WHEN v_proposal.document_kind = 'legacy' THEN 'design_services' ELSE v_proposal.document_kind END,
    'commercialState', 'draft',
    'currentRateVersion', v_current_version,
    'rateCount', jsonb_array_length(p_rates),
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_design_services_draft(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_design_services_draft(uuid, jsonb, jsonb)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4b — Studio agreement defaults (P3)
--
-- Shape, RLS and grants copied from studio_billing_settings (00428:42-90) with
-- no deviation in the policy predicates: every predicate is a SECURITY DEFINER
-- helper and every policy is TO authenticated, because a policy that reaches
-- organization_members directly re-enters that table's own RLS and 42501s.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_agreement_defaults (
  studio_id            uuid PRIMARY KEY
                         REFERENCES public.organizations(id) ON DELETE CASCADE,
  rate_card            jsonb NOT NULL DEFAULT '[]'::jsonb
                         CHECK (jsonb_typeof(rate_card) = 'array'),
  deposit_percent      numeric NULL
                         CHECK (deposit_percent IS NULL
                                OR (deposit_percent >= 0 AND deposit_percent <= 100)),
  cadence              text NOT NULL DEFAULT 'monthly'
                         CHECK (cadence IN ('monthly', 'biweekly', 'milestone')),
  retainer_credit_rule text NOT NULL DEFAULT 'credited'
                         CHECK (retainer_credit_rule IN ('credited', 'non_refundable', 'replenishing')),
  default_exclusions   jsonb NOT NULL DEFAULT '[]'::jsonb
                         CHECK (jsonb_typeof(default_exclusions) = 'array'),
  updated_by           uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_studio_agreement_defaults_updated_at
  ON public.studio_agreement_defaults;
CREATE TRIGGER set_studio_agreement_defaults_updated_at
  BEFORE UPDATE ON public.studio_agreement_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_agreement_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_agreement_defaults_member_select ON public.studio_agreement_defaults;
CREATE POLICY studio_agreement_defaults_member_select
  ON public.studio_agreement_defaults FOR SELECT TO authenticated
  USING (public.is_active_studio_member(studio_id));

DROP POLICY IF EXISTS studio_agreement_defaults_admin_insert ON public.studio_agreement_defaults;
CREATE POLICY studio_agreement_defaults_admin_insert
  ON public.studio_agreement_defaults FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_owner(studio_id));

DROP POLICY IF EXISTS studio_agreement_defaults_admin_update ON public.studio_agreement_defaults;
CREATE POLICY studio_agreement_defaults_admin_update
  ON public.studio_agreement_defaults FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_owner(studio_id))
  WITH CHECK (public.is_org_admin_or_owner(studio_id));

-- No DELETE policy: defaults are edited, never removed (the row dies with the org).

REVOKE ALL ON TABLE public.studio_agreement_defaults FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.studio_agreement_defaults TO authenticated;
GRANT ALL ON TABLE public.studio_agreement_defaults TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — Writing the parts, and projecting the money ones
-- ═══════════════════════════════════════════════════════════════════════════

-- upsert_agreement_parts replaces the WHOLE ordered set in one act — the same
-- discipline proposal_service_rates keeps (00422:1780), so a part the studio
-- removed is ABSENT, not blank. The projection is derived by part_key, never
-- by variant: UNIQUE (proposal_id, part_key) guarantees at most one of each,
-- and a custom or duplicate schedule part must never silently rewrite the
-- money row (R5).
CREATE OR REPLACE FUNCTION public.upsert_agreement_parts(
  p_proposal_id uuid,
  p_parts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_existing public.proposal_service_terms%ROWTYPE;
  v_terms jsonb;
  v_rates jsonb;
  v_version integer;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF auth.uid() IS NULL
     OR jsonb_typeof(COALESCE(p_parts, 'null'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'agreement parts require an authenticated author and an ordered array'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END,
      commercial_state = 'draft', updated_at = now()
  WHERE id = p_proposal_id;

  SET CONSTRAINTS uniq_agreement_part_position DEFERRED;
  DELETE FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id;
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload,
    required, client_visible, source_template_key, source_part_id
  )
  SELECT
    p_proposal_id,
    e.ord::integer,
    e.part->>'kind',
    NULLIF(e.part->>'variant', ''),
    e.part->>'partKey',
    btrim(e.part->>'title'),
    COALESCE(e.part->'payload', '{}'::jsonb),
    COALESCE((e.part->>'required')::boolean, false),
    COALESCE((e.part->>'clientVisible')::boolean, true),
    NULLIF(e.part->>'sourceTemplateKey', ''),
    NULLIF(e.part->>'sourcePartId', '')::uuid
  FROM jsonb_array_elements(p_parts) WITH ORDINALITY AS e(part, ord);

  -- R4, as a DB floor and not only a UI one: an agreement that bills time is
  -- an agreement with a cap. The readiness panel says the same thing first;
  -- this is the sentence that holds when the panel is bypassed.
  --
  -- Both halves read the same parts the projection above reads — by part_key
  -- AND shape. A rate card under a studio or custom key projects no rates, so
  -- it bills no time and owes no cap; refusing it here would be a refusal
  -- about money that no part carries (R5), and it would disagree with
  -- _agreement_requires_rate_card.
  IF EXISTS (
       SELECT 1 FROM public.proposal_agreement_parts ap
       WHERE ap.proposal_id = p_proposal_id
         AND ap.part_key = 'patina.role_rates'
         AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
         AND jsonb_typeof(ap.payload->'roles') = 'array'
         AND jsonb_array_length(ap.payload->'roles') > 0
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.proposal_agreement_parts ap
       WHERE ap.proposal_id = p_proposal_id
         AND ap.part_key = 'patina.ceiling'
         AND ap.kind = 'schedule' AND ap.variant = 'ceiling'
         AND ap.payload->>'cents' IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'an agreement that bills time needs a ceiling'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_existing FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id;
  v_version := COALESCE(v_existing.current_rate_version, 1);

  -- Only the nine standard keys project, and only when the part actually HAS
  -- the shape its key promises: every subquery below asserts the kind, and
  -- every schedule subquery also asserts the variant. Without that, a clause
  -- part keyed patina.ceiling would write billing_ceiling_cents — prose
  -- carrying money, which R5 forbids. Everything else — a custom clause, a
  -- second ceiling under a studio key, a percent_of_cost schedule, a part
  -- posted under a standard key in the wrong shape — is recorded and hashed
  -- but writes nothing to the money row.
  --
  -- patina.retainer's payload->>'creditRule' is READ AND DISCARDED in Wave 1:
  -- the column arrives on proposal_service_terms in Wave 2 (D-2). It is not a
  -- dropped field, it is a field with nowhere to land yet.
  v_terms := jsonb_build_object(
    'scope', COALESCE((
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.services'
        AND ap.kind = 'clause'
    ), ''),
    'deliverables', COALESCE((
      SELECT jsonb_agg(e.item->>'text' ORDER BY e.ord)
             FILTER (WHERE e.item->>'text' IS NOT NULL)
      FROM public.proposal_agreement_parts ap
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ap.payload->'items') = 'array'
             THEN ap.payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(item, ord)
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.deliverables'
        AND ap.kind = 'list'
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(e.item->>'text' ORDER BY e.ord)
             FILTER (WHERE e.item->>'text' IS NOT NULL)
      FROM public.proposal_agreement_parts ap
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ap.payload->'items') = 'array'
             THEN ap.payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(item, ord)
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.exclusions'
        AND ap.kind = 'list'
    ), '[]'::jsonb),
    'terms', (
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.terms'
        AND ap.kind = 'clause'
    ),
    'billingCeilingCents', (
      SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.ceiling'
        AND ap.kind = 'schedule' AND ap.variant = 'ceiling'
    ),
    'retainerAmountCents', COALESCE((
      SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.retainer'
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 0),
    'retainerActivationPolicy', COALESCE((
      SELECT NULLIF(ap.payload->>'activationPolicy', '')
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.retainer'
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 'immediate'),
    'billingCadence', COALESCE((
      SELECT NULLIF(ap.payload->>'cadence', '') FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.cadence'
        AND ap.kind = 'schedule' AND ap.variant = 'cadence'
    ), 'monthly'),
    'furnishingsDepositPercent', (
      SELECT (ap.payload->>'depositPercent')::numeric FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.deposit'
        AND ap.kind = 'schedule' AND ap.variant = 'procurement'
    ),
    'currency', COALESCE(v_existing.currency, 'USD'),
    'currentRateVersion', v_version
  );

  v_rates := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'version', v_version,
      'roleName', e.rate->>'roleName',
      'hourlyRateCents', (e.rate->>'hourlyRateCents')::integer,
      'sortOrder', COALESCE((e.rate->>'sortOrder')::integer, 0)
    ) ORDER BY e.ord)
    FROM public.proposal_agreement_parts ap
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ap.payload->'roles') = 'array'
           THEN ap.payload->'roles' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(rate, ord)
    WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.role_rates'
      AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
  ), '[]'::jsonb);

  -- true = the parts door, and only the parts door, may leave the ceiling
  -- NULL: a removed ceiling part is uncapped, not zero-capped.
  PERFORM public._project_agreement_terms(p_proposal_id, v_terms, v_rates, true);

  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentKind', CASE WHEN v_proposal.document_kind = 'legacy'
                         THEN 'design_services' ELSE v_proposal.document_kind END,
    'commercialState', 'draft',
    'partCount', jsonb_array_length(p_parts),
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_agreement_parts(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_agreement_parts(uuid, jsonb)
  TO authenticated;

-- materialize_standard_parts seeds the nine standard parts from what the
-- document ALREADY says — the terms row is the projection, so it is read
-- first — then from the studio's agreement defaults, then from the literals
-- the seven-facet room has always shown. It never re-projects: writing the
-- terms row back would be a no-op that only touches updated_at.
CREATE OR REPLACE FUNCTION public.materialize_standard_parts(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_defaults public.studio_agreement_defaults%ROWTYPE;
  v_studio_id uuid;
  v_existing integer;
  v_deliverables jsonb;
  v_exclusions jsonb;
  v_rate_card jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'materializing the standard parts requires an authenticated author'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotent: two tabs opening the room do not double-seed.
  SELECT count(*) INTO v_existing FROM public.proposal_agreement_parts
  WHERE proposal_id = p_proposal_id;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object(
      'proposalId', p_proposal_id,
      'materialized', false,
      'partCount', v_existing,
      'parts', COALESCE((
        SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.position, ap.id)
        FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id
      ), '[]'::jsonb)
    );
  END IF;

  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id;

  -- Read-only studio resolution. The project's studio when the document is
  -- bound; otherwise the lead designer's own studio in set_project_studio_id's
  -- order (00563:266-277), minus the sibling-project leg, which needs a client
  -- this read does not have. A missing defaults row is not an error.
  SELECT pr.studio_id INTO v_studio_id
  FROM public.projects pr WHERE pr.id = v_proposal.project_id;
  IF v_studio_id IS NULL THEN
    SELECT membership.organization_id INTO v_studio_id
    FROM public.organization_members AS membership
    JOIN public.organizations AS studio
      ON studio.id = membership.organization_id
    WHERE membership.user_id = v_proposal.designer_id
      AND membership.status = 'active'
      AND membership.role <> 'guest'
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
    ORDER BY
      (membership.role = 'owner') DESC,
      membership.joined_at NULLS LAST,
      membership.created_at,
      membership.organization_id
    LIMIT 1;
  END IF;
  IF v_studio_id IS NOT NULL THEN
    SELECT * INTO v_defaults FROM public.studio_agreement_defaults
    WHERE studio_id = v_studio_id;
  END IF;

  v_deliverables := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', extensions.gen_random_uuid()::text, 'text', d.value #>> '{}'
    ) ORDER BY d.ord)
    FROM jsonb_array_elements(COALESCE(v_terms.deliverables, '[]'::jsonb))
      WITH ORDINALITY AS d(value, ord)
  ), '[]'::jsonb);
  IF jsonb_array_length(v_deliverables) = 0 THEN
    v_deliverables := (
      SELECT jsonb_agg(jsonb_build_object(
        'id', extensions.gen_random_uuid()::text, 'text', d.value
      ) ORDER BY d.ord)
      FROM unnest(ARRAY[
        'Concept presentation', 'Design documentation', 'Selection schedules'
      ]) WITH ORDINALITY AS d(value, ord)
    );
  END IF;

  v_exclusions := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', extensions.gen_random_uuid()::text, 'text', x.value #>> '{}'
    ) ORDER BY x.ord)
    FROM jsonb_array_elements(COALESCE(v_terms.exclusions, '[]'::jsonb))
      WITH ORDINALITY AS x(value, ord)
  ), '[]'::jsonb);
  IF jsonb_array_length(v_exclusions) = 0 THEN
    v_exclusions := COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', extensions.gen_random_uuid()::text, 'text', x.value #>> '{}'
      ) ORDER BY x.ord)
      FROM jsonb_array_elements(COALESCE(v_defaults.default_exclusions, '[]'::jsonb))
        WITH ORDINALITY AS x(value, ord)
    ), '[]'::jsonb);
  END IF;
  IF jsonb_array_length(v_exclusions) = 0 THEN
    v_exclusions := (
      SELECT jsonb_agg(jsonb_build_object(
        'id', extensions.gen_random_uuid()::text, 'text', x.value
      ) ORDER BY x.ord)
      FROM unnest(ARRAY[
        'Construction labor', 'Furnishings, freight, tax, and installation'
      ]) WITH ORDINALITY AS x(value, ord)
    );
  END IF;

  v_rate_card := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents,
      'sortOrder', r.sort_order
    ) ORDER BY r.sort_order, r.role_name)
    FROM public.proposal_service_rates r
    WHERE r.proposal_id = p_proposal_id
      AND r.version = COALESCE(v_terms.current_rate_version, 1)
  ), '[]'::jsonb);
  IF jsonb_array_length(v_rate_card) = 0 THEN
    v_rate_card := COALESCE(v_defaults.rate_card, '[]'::jsonb);
  END IF;

  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload,
    required, client_visible
  ) VALUES
    (p_proposal_id, 1, 'clause', NULL, 'patina.services', 'Services',
     jsonb_build_object('body', COALESCE(NULLIF(v_terms.scope, ''),
       'Interior design services, including concept development, design documentation, and selections.')),
     true, true),
    (p_proposal_id, 2, 'list', NULL, 'patina.deliverables', 'Deliverables',
     jsonb_build_object('items', v_deliverables), false, true),
    (p_proposal_id, 3, 'list', NULL, 'patina.exclusions', 'Exclusions',
     jsonb_build_object('items', v_exclusions), false, true),
    (p_proposal_id, 4, 'schedule', 'rate_card', 'patina.role_rates', 'Role rates',
     jsonb_build_object('roles', v_rate_card), false, true),
    (p_proposal_id, 5, 'schedule', 'ceiling', 'patina.ceiling', 'Ceiling',
     jsonb_build_object('cents', v_terms.billing_ceiling_cents), false, true),
    (p_proposal_id, 6, 'schedule', 'procurement', 'patina.deposit', 'Furnishings deposit',
     jsonb_build_object('depositPercent',
       COALESCE(v_terms.furnishings_deposit_percent, v_defaults.deposit_percent, 50)),
     false, true),
    (p_proposal_id, 7, 'schedule', 'retainer', 'patina.retainer', 'Retainer',
     jsonb_build_object(
       'cents', COALESCE(v_terms.retainer_amount_cents, 0),
       'creditRule', COALESCE(v_defaults.retainer_credit_rule, 'credited'),
       'activationPolicy', COALESCE(v_terms.retainer_activation_policy, 'immediate')),
     false, true),
    (p_proposal_id, 8, 'schedule', 'cadence', 'patina.cadence', 'Billing cadence',
     jsonb_build_object('cadence',
       COALESCE(v_terms.billing_cadence, v_defaults.cadence, 'monthly')),
     false, true),
    (p_proposal_id, 9, 'clause', NULL, 'patina.terms', 'Terms',
     jsonb_build_object('body', COALESCE(v_terms.terms, '')), true, true);

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'materialized', true,
    'partCount', 9,
    'parts', COALESCE((
      SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.materialize_standard_parts(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.materialize_standard_parts(uuid)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — The client's copy carries the parts
--
-- Head is 00425:1214. Body VERBATIM plus one key. The 'legacy' early-return
-- is untouched — a retired document has no parts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_commercial_document_bundle(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_proposal.designer_id)
  ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- A client never sees an unsent document. Legacy editions carry no
  -- commercial_state, so their draft-ness lives in status.
  --
  -- 00422: nor does a client see a document that was never ISSUED. Voiding
  -- writes commercial_state 'superseded' and deliberately leaves status alone,
  -- so a never-sent draft that the studio priced and thought better of used to
  -- pass the `= 'draft'` test the moment it was retired — the void itself
  -- published it. A terminal edition is client-visible only if it was sent.
  IF v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
     AND (
       (v_proposal.document_kind = 'legacy' AND v_proposal.status = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined')
           AND v_proposal.sent_at IS NULL)
     ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00414: a legacy edition is not an error, it is a retired document.
  IF v_proposal.document_kind = 'legacy' THEN
    RETURN jsonb_build_object(
      'document', jsonb_build_object(
        'id', v_proposal.id,
        'documentKind', 'legacy',
        'kind', 'legacy',
        'retired', true,
        'title', v_proposal.title,
        'status', v_proposal.status,
        'commercialState', v_proposal.commercial_state,
        'supersededAt', v_proposal.superseded_at,
        'replacementProposalId', v_proposal.replacement_proposal_id,
        'validUntil', v_proposal.valid_until,
        'sentAt', v_proposal.sent_at
      )
    );
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id;

  RETURN jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_proposal.id, 'projectId', COALESCE(v_document.project_id, v_proposal.project_id),
      'title', v_proposal.title, 'description', v_proposal.description,
      'documentKind', v_proposal.document_kind,
      'commercialState', v_proposal.commercial_state,
      'status', v_proposal.status, 'totalAmountCents', v_proposal.total_amount,
      'depositPercent', v_proposal.deposit_percent,
      'validUntil', v_proposal.valid_until, 'sentAt', v_proposal.sent_at,
      'sent_at', v_proposal.sent_at,
      'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
      'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
      'executedAt', v_document.executed_at,
      'supersededAt', v_proposal.superseded_at,
      'replacementProposalId', v_proposal.replacement_proposal_id,
      'createdAt', v_proposal.created_at, 'updatedAt', v_proposal.updated_at
    ),
    'serviceTerms', (SELECT jsonb_build_object(
      'scope', t.scope, 'deliverables', t.deliverables, 'exclusions', t.exclusions,
      'billingCeilingCents', t.billing_ceiling_cents,
      'retainerAmountCents', t.retainer_amount_cents,
      'retainerActivationPolicy', t.retainer_activation_policy,
      'billingCadence', t.billing_cadence, 'currency', t.currency,
      'terms', t.terms, 'currentRateVersion', t.current_rate_version,
      'furnishingsDepositPercent', t.furnishings_deposit_percent
    ) FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id),
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents, 'sortOrder', r.sort_order,
      'effectiveAt', r.effective_at
    ) ORDER BY r.version DESC, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id), '[]'::jsonb),
    -- 00575: the client's edge onto the parts. ENUMERATED keys, not
    -- to_jsonb — the same discipline the signature projection keeps below:
    -- source_template_key, source_part_id, client_visible and the
    -- timestamps stay behind. Only client_visible rows appear (R8), and
    -- the key is present and [] on every document, so the client adapter
    -- never branches on absence.
    'parts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', ap.id, 'position', ap.position,
      'kind', ap.kind, 'variant', ap.variant,
      'partKey', ap.part_key, 'title', ap.title,
      'payload', ap.payload, 'required', ap.required
    ) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.client_visible), '[]'::jsonb),
    'signatures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'partyRole', s.party_role,
      'signedName', s.signed_name, 'signedAt', s.signed_at,
      'evidenceFingerprint', s.evidence_fingerprint,
      -- 00425: the paper tell, projected as a BOOLEAN and nothing more. Raw
      -- metadata never crosses this edge — it carries recordedBy, which is a
      -- studio member's uuid, and the client has no business with it.
      'signedOnPaper', COALESCE((s.metadata->>'executedOnPaper')::boolean, false),
      -- 00425: THE DATE ON THE PAPER, and it is the one the client's copy must
      -- print as the signing date. signed_at is when the STUDIO wrote the act
      -- down, which on this rail is a different day — often weeks later — so a
      -- copy that renders signed_at as "SIGNED <date>" tells the client they
      -- signed on a day they did not. Projected as the bare yyyy-mm-dd text the
      -- studio typed (no timestamp, no zone: a calendar date has neither), and
      -- NULL on portal rows, which carry no such key because there the record
      -- moment IS the signing moment.
      'paperSignedOn', s.metadata->>'paperSignedOn',
      -- The scan pointer is projected ONLY when the folio row is flagged
      -- client_visible AND still anchored to THIS document. This body is
      -- SECURITY DEFINER, so project_documents RLS is not in force here; both
      -- facts have to be read explicitly or an unshared scan of the client's own
      -- signature page leaks its id, or a pointer at somebody else's folio row
      -- is handed to this client as if it were their signature page. The record
      -- rails validate the anchor at write time and the folio guard freezes it
      -- afterwards; this is the read edge saying so on its own authority rather
      -- than trusting two other seams to have held.
      'paperScanDocumentId', (
        SELECT scan.id FROM public.project_documents scan
        WHERE scan.id = (s.metadata->>'paperScanDocumentId')::uuid
          AND scan.proposal_id = p_proposal_id
          AND scan.client_visible
      )
    ) ORDER BY s.signed_at, s.id) FROM public.commercial_document_signatures s
      WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
    'furnishings', CASE WHEN v_document.document_kind = 'furnishings_authorization'
      THEN jsonb_build_object(
        'documentId', v_document.id, 'waveName', v_document.wave_name,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'checkpointId', v_document.budget_checkpoint_id,
        'budgetCheckpointId', v_document.budget_checkpoint_id,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'depositRequiredCents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'deposit_required_cents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'roomName', a.room_name,
          'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
          'clientUnitPriceCents', a.client_unit_price_cents,
          'clientLineTotalCents', a.client_line_total_cents,
          'sourceFfeItemId', a.source_ffe_item_id, 'sortOrder', a.sort_order
        ) ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          WHERE a.commercial_document_id = v_document.id), '[]'::jsonb)
      ) ELSE NULL END,
    'replacement', (SELECT jsonb_build_object(
      'id', replacement.id, 'title', replacement.title,
      'documentKind', replacement.document_kind,
      'commercialState', replacement.commercial_state
    ) FROM public.proposals replacement WHERE replacement.id = v_proposal.replacement_proposal_id)
  ) || CASE WHEN v_document.document_kind = 'trade_scope'
      -- COALESCE, not a bare subquery: `object || NULL` is NULL in jsonb, so a
      -- scope somehow missing its terms row would blank the WHOLE bundle rather
      -- than one key. create_trade_scope always writes one; this is the belt.
      THEN COALESCE((SELECT jsonb_build_object('tradeScope', jsonb_build_object(
        'documentId', v_document.id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'partyDisplayName', t.party_display_name,
        'partyCompanyName', t.party_company_name,
        'partyTrade', t.party_trade,
        'clientPriceCents', t.client_price_cents,
        'currency', t.currency,
        'terms', t.terms,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'roomId', s.project_room_id, 'roomName', s.room_name,
          'prose', s.prose, 'allocationCents', s.allocation_cents,
          'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.id)
          FROM public.trade_scope_sections s WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
        'draws', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', w.id, 'label', w.label, 'percentage', w.percentage,
          'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
          'gatesOnAcceptance', w.gates_on_acceptance,
          'invoiceId', w.invoice_id,
          'invoiceStatus', (SELECT i.status FROM public.invoices i WHERE i.id = w.invoice_id),
          'invoicePaidCents', (SELECT i.amount_paid_cents FROM public.invoices i WHERE i.id = w.invoice_id)
        ) ORDER BY w.sort_order, w.id)
          FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id), '[]'::jsonb),
        'progress', jsonb_build_object(
          'state', t.progress_state,
          'engagedAt', t.engaged_at,
          'substantialCompletionAt', t.substantial_completion_at,
          -- 00425: on a PAPER acceptance this IS the date on the paper —
          -- record_paper_trade_acceptance writes `accepted_at =
          -- p_paper_signed_on::timestamptz`, i.e. midnight UTC on the day the
          -- client signed, not the moment of typing. So the acceptance leg
          -- needs no paper-date twin the way signatures do; it needs its
          -- readers to format the DATE COMPONENT and not shift it west.
          'acceptedAt', t.accepted_at,
          'acceptedSignedName', t.accepted_signed_name,
          -- 00425: acceptance recorded from a printed copy says so, and carries
          -- the page — scoped exactly like the signature scan above: shared, and
          -- still anchored to this document.
          'acceptedOnPaper', t.accepted_on_paper,
          'acceptanceScanDocumentId', (
            SELECT scan.id FROM public.project_documents scan
            WHERE scan.id = t.acceptance_scan_document_id
              AND scan.proposal_id = p_proposal_id
              AND scan.client_visible
          )
        )
      )) FROM public.trade_scope_terms t WHERE t.proposal_id = p_proposal_id),
      '{}'::jsonb)
      ELSE '{}'::jsonb END;
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 9 — What the objects are for
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.proposal_agreement_parts IS
  'The ordered parts of one agreement. A part is a titled, typed section — a '
  'clause, a list, a phase set, a money schedule, an attachment, an '
  'attestation — and the agreement IS its parts, in the designer''s order. '
  'Parts freeze at SEND through guard_commercial_authored_child, exactly like '
  'proposal_service_terms; unsend is supersede. A client never reads this '
  'table: their edge is get_client_commercial_document_bundle, which projects '
  'only client_visible rows and only enumerated keys. The typed money parts '
  'project into proposal_service_terms / proposal_service_rates through '
  'upsert_agreement_parts; prose never carries money.';

COMMENT ON COLUMN public.proposal_agreement_parts.kind IS
  'What this part IS (clause, list, phases, schedule, attachment, '
  'attestation). Free TEXT, no CHECK beyond non-empty — the vocab is '
  'code-resident in packages/types/src/agreement.ts (AGREEMENT_PART_KINDS), '
  'so it grows without a migration. Same posture as '
  'studio_contacts.contact_kind (00417) and project_parties.trade (00281).';

COMMENT ON COLUMN public.proposal_agreement_parts.variant IS
  'For a schedule part, which schedule it is (rate_card, ceiling, retainer, '
  'cadence, flat, per_phase, procurement, …). NULL on every other kind. Free '
  'TEXT, no CHECK beyond non-empty — the vocab is code-resident in '
  'packages/types/src/agreement.ts (AGREEMENT_SCHEDULE_VARIANTS).';

COMMENT ON COLUMN public.proposal_agreement_parts.part_key IS
  'Stable identity of this part within its agreement: patina.<name> for a '
  'standard part, studio.<slug> for one the studio owns, custom.<uuid> for a '
  'one-off. UNIQUE per proposal, and the key the money projection reads — only '
  'the nine patina.* keys write the terms row (R5).';

COMMENT ON COLUMN public.proposal_agreement_parts.source_part_id IS
  'The Library part this one was materialized from. Deliberately carries NO '
  'foreign key: its target, studio_agreement_parts, does not exist until Wave '
  '2, which adds the constraint. Nullable and unwritten in Wave 1.';

COMMENT ON COLUMN public.proposal_agreement_parts.source_template_key IS
  'The Library template this part arrived with. Nullable and unwritten in '
  'Wave 1; Wave 2 populates it.';

COMMENT ON COLUMN public.proposal_service_terms.billing_ceiling_cents IS
  'NULL means UNCAPPED, and it is legal only when the agreement carries no '
  'rate_card part (public._agreement_requires_rate_card). An agreement that '
  'bills time needs a cap; a flat fee or a retainer has nothing to cap.';

COMMENT ON COLUMN public.project_billing_authorities.billing_ceiling_cents IS
  'NULL means UNCAPPED, snapshotted from proposal_service_terms at '
  'countersign. Legal only when the source agreement carries no rate_card '
  'part (public._agreement_requires_rate_card). Every reader treats NULL as '
  '"no ceiling", never as zero.';

COMMENT ON TABLE public.studio_agreement_defaults IS
  'Per-studio agreement defaults. One row per organization; absence means the '
  'Patina standard. Read by materialize_standard_parts when it seeds a new '
  'agreement''s nine standard parts.';

COMMENT ON COLUMN public.studio_agreement_defaults.retainer_credit_rule IS
  'Stored in Wave 1, projected in Wave 2 (D-2). materialize_standard_parts '
  'writes it into the retainer part''s payload; nothing reads it into the '
  'terms row yet.';

COMMENT ON FUNCTION public.upsert_agreement_parts(uuid, jsonb) IS
  '00575: replaces an agreement''s whole ordered part list and projects the '
  'nine standard money keys into proposal_service_terms / '
  'proposal_service_rates through _project_agreement_terms — the same body '
  'upsert_design_services_draft uses, never a fork. Draft-only, author-only. '
  'Refuses a rate card with no ceiling (R4).';

COMMENT ON FUNCTION public.materialize_standard_parts(uuid) IS
  '00575: seeds the nine standard parts of a design-services agreement from '
  'its existing terms row, then the studio''s agreement defaults, then the '
  'Patina literals. Idempotent — an agreement that already has parts is '
  'returned unchanged with materialized = false. Does not re-project: the '
  'terms row it read is already the projection.';

COMMENT ON FUNCTION public._project_agreement_terms(uuid, jsonb, jsonb, boolean) IS
  '00575: the terms/rates projection, lifted verbatim out of '
  'upsert_design_services_draft (00422:1749-1793) so the seven-facet room and '
  'a composed part list write through one body. p_allow_null_ceiling is the '
  'ONLY behavioral difference between the two doors: false (the flag-off '
  'draft) keeps 00422''s COALESCE(billingCeilingCents, 0); true (the parts '
  'door) lets a missing ceiling part land as SQL NULL — uncapped.';

COMMENT ON FUNCTION public._agreement_requires_rate_card(uuid) IS
  '00575: TRUE when this agreement must carry at least one role rate before '
  'it can be sent or signed — it has no parts at all (every pre-00575 and '
  'every flag-off document, the legacy contract unchanged), or it carries the '
  'patina.role_rates part in schedule/rate_card shape and therefore bills '
  'time (R4). Keyed on the one part the rate projection reads, so the '
  'refusal and the projection can never disagree.';

COMMIT;
