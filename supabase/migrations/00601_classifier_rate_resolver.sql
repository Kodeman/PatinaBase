-- ═══════════════════════════════════════════════════════════════════════════
-- 00601 — The classifier calls the resolver: the server owns the rate on EVERY
--         branch (HT-1, HT-41, HT-12)
--
-- Lineage: 00412 → 00575 → 00578 → 00601.
-- Grafted VERBATIM from 00578:2599-2820 (the grep|sort|tail-1 winner, re-read
-- this session), delta below. Every 00578 invariant is kept untouched:
--   · the authority/rate immutability raise (00578:2620-2627)
--   · the bound-provenance raise (00578:2679-2682)
--   · the stable project-row FOR UPDATE lock (00578:2659-2662) — a commercial
--     test asserts its exact shape with a regex, so it is byte-identical here
--   · the superseded-authority ceiling read, retainer gating, and the 00575
--     F-2 nullable-ceiling delta
-- P-4: no historical row is touched by this file. There is no backfill.
--
-- THE DELTA, five parts:
--  1. NEW.rate_role (HT-41) is validated against the member's LIVE roster rows
--     — a role the member does not hold RAISES. The project's own designer may
--     pick 'lead_designer' without a roster row: 00578:2708-2710 already
--     hard-codes that role for her and 00597 never seats her.
--  2. resolve_time_rate_cents (00599) is called ONCE, up front, and its answer
--     stamps hourly_rate_cents + rate_source on the three branches 00578 left
--     client-owned:
--       · the non-services early branch (00578:2648-2654) — HT-1's headline
--         case: the browser's rate used to survive here untouched.
--       · the no-authority-covering-started_at branch (00578:2694-2700) — the
--         caller's rate used to survive here too.
--       · the no-rate branch (00578:2765-2772) — which NULLED rate and amount
--         and stranded the row for ever, because the addendum promotion filter
--         (00577:2493-2496) requires both non-NULL. It now carries the studio
--         rate and stays pending_authorization, so a later signed addendum can
--         promote it.
--     On the authority branch the classifier's own bound/selected rate still
--     wins and rate_source is stamped 'authority'.
--  3. rated_amount_cents is owned on every branch — it was nullable-and-
--     caller-supplied on the non-services branch whenever duration or rate was
--     NULL, which is why 00600's INSERT branch rejects a supplied value.
--  4. rate_role records the role that priced the hour (HT-41), derived when the
--     member did not pick, and only ever one of the four roster roles the
--     00600 CHECK admits ('client' is excluded, so it is never stamped).
--  5. P-4 PRESERVATION, stated rather than silent: when the resolver answers
--     'none' on an UPDATE of a row that already carries a rate snapshot, the
--     snapshot is KEPT and rate_source is left NULL (its legacy, unknown-
--     provenance value) instead of nulling money on an unbilled row. P-4 says
--     "invoiced and unbilled history keep their amounts"; HT-1 is about who
--     owns the rate on a NEW entry. A new row with no resolvable rate is
--     NULL + 'none' — "rate pending" (HT-26), never a blank.
--
-- `billable` stays CLIENT-set (HT-12 + HT-11 as reconciled in plan-v2 §2): the
-- classifier never upgrades it and does not downgrade it here either — the
-- reason an hour is not yet billable is recorded through billing_state
-- ('pending_authorization') plus rate_source ('none'), which is what the row
-- prints. Downgrading billable to false would make the row NON-promotable by a
-- later addendum, defeating delta 2's own repair.
--
-- Reconciles: nothing reverted — the body is 00578's, verbatim, this session.
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- 00601 delta
  v_rate_cents integer;
  v_rate_source text;
  v_rate_role text;
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

  -- ── 00601 delta 1: HT-41's role pick is validated, never trusted ─────────
  IF NEW.rate_role IS NOT NULL THEN
    IF NOT (
      (
        NEW.rate_role = 'lead_designer'
        AND EXISTS (
          SELECT 1 FROM public.projects project
          WHERE project.id = NEW.project_id
            AND project.designer_id IS NOT DISTINCT FROM NEW.user_id
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.project_team_members member
        WHERE member.project_id = NEW.project_id
          AND member.user_id = NEW.user_id
          AND member.removed_at IS NULL
          AND member.role = NEW.rate_role
      )
    ) THEN
      RAISE EXCEPTION 'rate_role % is not a role this member holds on the project', NEW.rate_role
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── 00601 delta 2: the ONE rate chain, resolved once ────────────────────
  SELECT resolved.cents, resolved.source, resolved.role
    INTO v_rate_cents, v_rate_source, v_rate_role
  FROM public.resolve_time_rate_cents(
    NEW.project_id, NEW.user_id, NEW.started_at, NEW.rate_role
  ) AS resolved;

  -- delta 4: the row records the role that priced it.
  IF NEW.rate_role IS NULL
     AND v_rate_role IN ('lead_designer', 'support_designer', 'bookkeeper', 'vendor')
  THEN
    NEW.rate_role := v_rate_role;
  END IF;

  -- delta 5: P-4 preservation. An existing snapshot is not destroyed because the
  -- chain has no answer; its provenance stays NULL (legacy, unknown), not 'none'.
  IF TG_OP = 'UPDATE'
     AND v_rate_source = 'none'
     AND OLD.hourly_rate_cents IS NOT NULL
  THEN
    v_rate_cents  := OLD.hourly_rate_cents;
    v_rate_source := NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build')
  ) INTO v_is_services_project;

  IF NOT NEW.billable THEN
    NEW.billing_state := 'nonbillable';
    NEW.hourly_rate_cents := v_rate_cents;   -- 00601: discarded, not kept
    NEW.rate_source := v_rate_source;
    NEW.rated_amount_cents := CASE WHEN NEW.duration_minutes IS NULL THEN NULL ELSE 0 END;
    RETURN NEW;
  END IF;
  IF NOT v_is_services_project THEN
    NEW.billing_state := 'authorized';
    -- HT-1's headline branch: 00578:2650-2652 priced the hour from whatever the
    -- browser sent. The resolver owns it now, on this project kind too.
    NEW.hourly_rate_cents := v_rate_cents;
    NEW.rate_source := v_rate_source;
    NEW.rated_amount_cents := CASE
      WHEN NEW.duration_minutes IS NOT NULL AND v_rate_cents IS NOT NULL
      THEN round(NEW.duration_minutes / 60.0 * v_rate_cents)::integer
    END;
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
    -- 00601: server-owned here too (00578 left the caller's rate standing and
    -- nulled only the amount).
    NEW.hourly_rate_cents := v_rate_cents;
    NEW.rate_source := v_rate_source;
    NEW.rated_amount_cents := CASE
      WHEN NEW.duration_minutes IS NOT NULL AND v_rate_cents IS NOT NULL
      THEN round(NEW.duration_minutes / 60.0 * v_rate_cents)::integer
    END;
    RETURN NEW;
  END IF;

  IF NOT v_is_bound THEN
    SELECT max(rate.version) INTO v_current_version
    FROM public.project_billing_authority_rates rate
    JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
    WHERE rate.billing_authority_id = v_authority.id
      AND source.effective_at <= NEW.started_at;

    -- 00601 (HT-41): the member's validated pick decides which card prices the
    -- hour when she holds more than one role. With no pick, 00578's
    -- count(DISTINCT role) = 1 collapse is unchanged.
    IF NEW.rate_role IS NOT NULL THEN
      v_team_role := NEW.rate_role;
    ELSIF v_project_designer_id IS NOT DISTINCT FROM NEW.user_id THEN
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
    NEW.billing_state := 'pending_authorization';
    -- 00601: 00578 nulled rate AND amount here, which stranded the row for ever
    -- (00577:2493-2496 promotes only rows carrying both). The studio rate stands
    -- in until an addendum names a card for this role.
    NEW.hourly_rate_cents := v_rate_cents;
    NEW.rate_source := v_rate_source;
    NEW.rated_amount_cents := CASE
      WHEN NEW.duration_minutes IS NOT NULL AND v_rate_cents IS NOT NULL
      THEN round(NEW.duration_minutes / 60.0 * v_rate_cents)::integer
    END;
    RETURN NEW;
  END IF;
  IF NOT v_is_bound THEN
    NEW.billing_authority_id := v_authority.id;
    NEW.authority_rate_id := v_rate.id;
    NEW.hourly_rate_cents := v_rate.hourly_rate_cents;
  END IF;
  -- 00601: reached only with a signed authority rate in hand, bound or selected.
  NEW.rate_source := 'authority';

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

-- The trigger keeps 00600's column list (00578 redefined the function only).

DO $postcondition$
DECLARE
  v_src text := pg_get_functiondef(
    'public.classify_project_time_entry_authority()'::regprocedure);
BEGIN
  IF v_src !~ 'resolve_time_rate_cents' THEN
    RAISE EXCEPTION '00601: the classifier must call resolve_time_rate_cents (HT-1)';
  END IF;

  -- The three 00578 invariants a future graft must not drop.
  IF v_src !~ 'time-entry authority and rate provenance are immutable' THEN
    RAISE EXCEPTION '00601: 00578''s authority/rate immutability raise was lost';
  END IF;
  IF v_src !~ 'bound commercial time entry has invalid authority provenance' THEN
    RAISE EXCEPTION '00601: 00578''s bound-provenance raise was lost';
  END IF;
  IF v_src !~ 'FROM public\.projects project\s+WHERE project.id = NEW.project_id\s+FOR UPDATE' THEN
    RAISE EXCEPTION '00601: the stable project-row FOR UPDATE lock was lost';
  END IF;
  IF v_src !~ 'COALESCE\(v_project_ceiling_cents, v_authority.billing_ceiling_cents\) IS NULL' THEN
    RAISE EXCEPTION '00601: 00575''s nullable-ceiling (F-2) delta was lost';
  END IF;
END
$postcondition$;
