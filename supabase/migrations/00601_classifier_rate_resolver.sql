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
--         and stranded the row for ever. It now carries the studio rate and stays
--         pending_authorization, so the row PRINTS HONESTLY instead of reading
--         NULL. **It is NOT promotable** — see the W1-R1-04 correction below.
--     On the authority branch the classifier's own bound/selected rate still
--     wins and rate_source is stamped 'authority'.
--
--  W1-R1-04 CORRECTION (review round 1). An earlier revision of this banner, and
--  plan-v2 §2's Done-when #4, claimed the repaired row "stays
--  pending_authorization, so a later signed addendum can promote it". IT CANNOT.
--  Every promotion loop in the lineage (00412:1138 → 00414:913 → 00475:892 →
--  00511:4596 → 00566:843 → 00575:1845 → 00578:6610) JOINs
--  project_billing_authorities ON prior_authority.id = entry.billing_authority_id
--  and requires entry.authority_rate_id IS NOT NULL; this branch sets BOTH to
--  NULL. Measured: the repaired row reads rate=15000 amount=30000
--  state=pending_authorization src=studio_member billing_authority_id=NULL, and
--  the real promotion predicate selects 0 rows. What the repair delivers is the
--  money printing honestly on the ledger and in the composer, NOT promotability.
--  Making such a row promotable means a new promotion arm inside the signed
--  countersign ceremony — governance, not a fix-round code change. Recorded as
--  OWED RULING HT-6-b beside HT-6-a, and pinned as a deliberate assert in
--  supabase/tests/billing/time_rate_resolution_test.sql case (c).
--  3. rated_amount_cents is owned on every branch — it was nullable-and-
--     caller-supplied on the non-services branch whenever duration or rate was
--     NULL, which is why 00600's INSERT branch rejects a supplied value.
--  4. rate_role records the role that priced the hour (HT-41), derived when the
--     member did not pick, and only ever one of the four roster roles the
--     00600 CHECK admits ('client' is excluded, so it is never stamped).
--  5. P-4 PRESERVATION, stated rather than silent: when the resolver answers
--     'none' on an UPDATE of a row that already carries a rate snapshot, the
--     snapshot is KEPT — and so is the provenance that describes it. P-4 says
--     "invoiced and unbilled history keep their amounts"; HT-1 is about who
--     owns the rate on a NEW entry. A new row with no resolvable rate is
--     NULL + 'none' — "rate pending" (HT-26), never a blank.
--     EXTENDED in review round 3 (W1-R3-02): the preservation also covers a
--     PRE-00600 row (OLD.rate_source IS NULL) even when the chain DOES have an
--     answer. Gated on 'none' alone it fired only where no money moved: measured,
--     a legacy unbilled entry carrying its own 17500 snapshot, whose author holds
--     a 15000 studio rate, was re-priced to 15000 / 'studio_member' by a plain
--     duration correction — the $175 rate became $150 and the row stopped reading
--     as legacy. Invoiced rows were never exposed (guard_invoiced_time_entry
--     refuses a duration change once invoice_id is set), so the exposure was
--     exactly the unbilled history P-4 names. Case (i) could not catch it: its
--     member holds no studio rate, so it exercised only the 'none' arm. If HT-1 is
--     ever ruled to beat P-4 on an edit, flip the assert in case (q) and record
--     the ruling beside HT-6-a — it must not become the silent default again.
--     CORRECTED in review round 2 (W1-R2-05): this branch used to force
--     rate_source to NULL, which erased provenance from a row W1 itself wrote.
--     HT-13 makes backdating a first-class act, and a W1-era entry backdated
--     before its rate's effective_from read `20000 / (NULL)` — while both
--     rate_source's COMMENT (00600) and TimeRateSource's doc comment define NULL
--     as "a row written before 00600", so lane B would render a current row as
--     legacy. It now keeps OLD.rate_source with the snapshot it describes; a
--     genuinely legacy row already has OLD.rate_source NULL.
--
-- `billable` stays CLIENT-set (HT-12 + HT-11 as reconciled in plan-v2 §2): the
-- classifier never upgrades it and does not downgrade it here either — the
-- reason an hour is not yet billable is recorded through billing_state
-- ('pending_authorization') plus rate_source ('none'), which is what the row
-- prints. Downgrading billable to false would make the row NON-promotable by a
-- later addendum, defeating delta 2's own repair.
--
-- REVIEW ROUND 1, the other two repairs in this file:
--  · W1-R1-02 — the NOT NEW.billable branch must never overwrite a BOUND row's
--    signed rate. See the comment on that branch.
--  · W1-R1-03 — delta 1 validates only a NEW role pick, not every fire. See the
--    comment on delta 1.
--
-- REVIEW ROUND 5 (W1-R5-03) — HT-41's pick does not reach the project's designer:
--   The first revision put `IF NEW.rate_role IS NOT NULL` ABOVE 00578's
--   `v_project_designer_id IS NOT DISTINCT FROM NEW.user_id` branch. 00578 fixed the
--   project designer's role at 'lead_designer' BEFORE any roster read, so her roster
--   rows were never consulted; delta 1 validates a pick against
--   project_team_members, a table she WRITES (`Lead designers manage team members`
--   is an ALL policy on projects.designer_id = auth.uid() with no with_check), so
--   the one actor whose role the server used to own could mint any roster role and
--   name it. Measured on a services project with signed cards of 10000 (Lead
--   designer) and 40000 (Vendor), as a designer who is a plain studio member: a
--   self-seat as vendor then a named pick billed the client 40000 with
--   rate_source 'authority' — $800.00 where her own signed card says $200.00, and
--   claim_time_entries would invoice-lock it. With the pick omitted, 10000.
--   The designer branch regains precedence in the ladder below and in 00599's
--   mirror, and delta 4 now records the resolver's role rather than the pick, so the
--   row cannot print a role that did not price it. Nothing is lost against 00578.
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
  -- W1-R1-03: only a NEW pick. The first revision validated on EVERY fire, so the
  -- moment the owner removed the roster seat a recorded role came from, every
  -- guarded edit to that entry raised — and rate_role itself cannot be changed
  -- (aab_ refuses it for any non-postgres caller), so the row was frozen with no
  -- escape but DELETE. HT-25-a's cross-role re-seat makes exactly that churn the
  -- expected case. Measured before the fix: a member's own duration correction
  -- raised 'rate_role vendor is not a role this member holds on the project' and
  -- the stored duration stayed 60.
  IF NEW.rate_role IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.rate_role IS DISTINCT FROM OLD.rate_role) THEN
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
  -- W1-R5-03: the resolver's answer, not the caller's pick, because those are the
  -- same value EXCEPT where the server owns the role — the project's own designer,
  -- whose 'lead_designer' is fixed above p_rate_role in 00599. Keeping the old
  -- `NEW.rate_role IS NULL` guard would have left her row printing the 'vendor' she
  -- asked for while the Lead designer card priced it: a row that lies about the
  -- number on it. For every other member v_rate_role IS her validated pick.
  IF v_rate_role IN ('lead_designer', 'support_designer', 'bookkeeper', 'vendor') THEN
    NEW.rate_role := v_rate_role;
  END IF;

  -- delta 5: P-4 preservation. An existing snapshot is not destroyed because the
  -- chain has no answer — and W1-R2-05: the provenance stays with the snapshot it
  -- describes. Forcing NULL here relabelled a W1-era row as pre-00600 legacy the
  -- moment HT-13's backdating moved it outside its rate's span.
  -- W1-R3-02: the preservation also fires when the chain HAS an answer but the row
  -- is PRE-00600 (rate_source NULL). Gated on 'none' alone, P-4 was honoured
  -- exactly where it cost nothing and dropped where it moved money: a legacy
  -- unbilled row carrying its own $175.00 snapshot, whose author holds a $150.00
  -- studio rate, was silently re-priced to 15000 by the only edit
  -- useUpdateTimeEntry offers (a duration correction) — and stopped being
  -- identifiable as legacy. A billable off/on round trip did the same through the
  -- non-billable branch below.
  IF TG_OP = 'UPDATE'
     AND OLD.hourly_rate_cents IS NOT NULL
     AND (v_rate_source = 'none' OR OLD.rate_source IS NULL)
  THEN
    v_rate_cents  := OLD.hourly_rate_cents;
    v_rate_source := OLD.rate_source;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build')
  ) INTO v_is_services_project;

  IF NOT NEW.billable THEN
    NEW.billing_state := 'nonbillable';
    -- W1-R1-02: a BOUND row's signed rate is never overwritten here. The first
    -- revision stamped the resolver's answer on this branch before the bound-row
    -- handling below could keep OLD.hourly_rate_cents, and `billable` is not in
    -- aab_'s watched list so nothing could catch it. Measured: a $300/h hour bound
    -- to a one-card authority came back from a plain billable off/on round trip
    -- priced at the $150/h studio rate with rate_source still claiming
    -- 'authority' — and claim_time_entries would then invoice-lock that number.
    -- 00578 never touched hourly_rate_cents on this branch at all.
    IF TG_OP = 'INSERT' OR OLD.billing_authority_id IS NULL THEN
      NEW.hourly_rate_cents := v_rate_cents;   -- 00601: discarded, not kept
      NEW.rate_source := v_rate_source;
    ELSE
      NEW.hourly_rate_cents := OLD.hourly_rate_cents;
      NEW.rate_source := OLD.rate_source;
    END IF;
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
    --
    -- W1-R5-03: the project's own DESIGNER is not one of those members. 00578's
    -- branch fixed her role at 'lead_designer' before any roster read; putting the
    -- pick above it let her seat herself as 'vendor' (`Lead designers manage team
    -- members` is an ALL policy on projects.designer_id = auth.uid()) and bill the
    -- client at whichever signed card pays best — measured 40000 where her own card
    -- said 10000, rate_source still 'authority'. The designer branch therefore
    -- regains precedence; nothing is lost against 00578, which never read her
    -- roster at all.
    IF v_project_designer_id IS NOT DISTINCT FROM NEW.user_id THEN
      v_team_role := 'lead_designer';
    ELSIF NEW.rate_role IS NOT NULL THEN
      v_team_role := NEW.rate_role;
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

  -- ── review round 1 ───────────────────────────────────────────────────────
  -- W1-R1-02: the non-billable branch must not re-price a bound row.
  IF v_src !~ 'NEW\.hourly_rate_cents := OLD\.hourly_rate_cents' THEN
    RAISE EXCEPTION '00601: the non-billable branch must preserve a bound row''s signed rate (W1-R1-02)';
  END IF;
  -- W1-R1-03: the role pick is validated only when it is NEW.
  IF v_src !~ 'NEW\.rate_role IS DISTINCT FROM OLD\.rate_role' THEN
    RAISE EXCEPTION '00601: rate_role must be validated only on a NEW pick, or a removed roster seat freezes the entry (W1-R1-03)';
  END IF;

  -- ── review round 2 ───────────────────────────────────────────────────────
  -- W1-R2-05: delta 5 keeps the provenance with the snapshot. Forcing NULL here
  -- relabels a W1-era row as pre-00600 legacy (00600's own COMMENT defines NULL
  -- that way), which is a lie about money the studio can read.
  IF v_src !~ 'v_rate_source := OLD\.rate_source' THEN
    RAISE EXCEPTION '00601: delta 5 must preserve OLD.rate_source, not NULL it — NULL means "written before 00600" (W1-R2-05)';
  END IF;

  -- ── review round 3 ───────────────────────────────────────────────────────
  -- W1-R3-02: delta 5 must also preserve a PRE-00600 snapshot when the chain has
  -- an answer, or an ordinary duration edit writes a legacy rate down to the
  -- author's current studio rate (P-4).
  IF v_src !~ 'OLD\.rate_source IS NULL' THEN
    RAISE EXCEPTION '00601: delta 5 must preserve a pre-00600 rate snapshot even when the chain resolves (P-4, W1-R3-02)';
  END IF;

  -- ── review round 5 ───────────────────────────────────────────────────────
  -- W1-R5-03: the designer branch must stand ABOVE HT-41's pick in the role
  -- ladder. `Lead designers manage team members` is an ALL policy on
  -- projects.designer_id = auth.uid(), so a pick the server honours above its own
  -- fixed role lets the project's designer choose her client-billed card.
  IF v_src !~ 'IF v_project_designer_id IS NOT DISTINCT FROM NEW\.user_id THEN\s+v_team_role := ''lead_designer'';\s+ELSIF NEW\.rate_role IS NOT NULL THEN'
  THEN
    RAISE EXCEPTION '00601: the project designer''s lead_designer role must be fixed ABOVE NEW.rate_role in the role ladder (W1-R5-03)';
  END IF;
END
$postcondition$;
