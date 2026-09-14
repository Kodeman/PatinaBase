-- ═══════════════════════════════════════════════════════════════════════════
-- 00613 — the classifier, the ledger and the margins all reckon with an hour
--         that has no project (HT-15, plan-v2 §5)
--
-- Lineage: 00412 → 00575 → 00578 → 00601 → HERE.
-- Grafted VERBATIM from 00601:154-519, the grep|sort|tail-1 winner re-measured
-- this session (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*classify_project_time_entry_authority"`
-- returns 00412, 00575, 00578, 00601 and nothing later — 00615 redefines
-- resolve_time_rate_cents, NOT the classifier, so nothing downstream of this file
-- re-plants an older body). Every delta and every invariant 00601 pins is carried
-- across untouched, and 00601's own postconditions are re-asserted at the bottom
-- of this file rather than trusted:
--   · 00578's authority/rate immutability raise and bound-provenance raise
--   · the stable project-row FOR UPDATE lock (a commercial test regexes its shape)
--   · 00575's F-2 nullable-ceiling delta
--   · W1-R1-02 (a bound row's signed rate survives the non-billable branch),
--     W1-R1-03 (the role pick is validated only when NEW), W1-R2-05 / W1-R3-02
--     (delta 5 keeps the snapshot AND its provenance), W1-R5-03 (the project
--     designer's role is fixed above HT-41's pick), W1-R9-01 (only the work's
--     studio owner/admin may write a user_id that is not their own)
-- P-4: no historical row is touched. There is no backfill in this file.
--
-- SECOND LINEAGES, all in this file and all grafted the same way: the ledger
-- view public.time_entry_ledger 00604 → HERE (delta 3); the margin view
-- public.margin_items 00543 → HERE (delta 4); and the HT-23 trace
-- public.audit_time_entry_change 00605 → HERE (delta 5, W4-R1-01). Each is its
-- named file's SOLE definition, re-measured this session, and this file is the
-- only redefinition of any of them.
--
-- THE DELTA — ONE SHORT-CIRCUIT, and four reads that had to learn about it.
--
-- (1) THE CLASSIFIER. `project_id IS NULL` → nonbillable, no rate, amount 0,
--     rate_source 'none', rate_role NULL, no authority — and RETURN. It is placed
--     immediately after 00601's authority-id nulling and BEFORE everything that
--     reads NEW.project_id: the project_commercial_documents lookup (00601:286-290,
--     the placement plan-v2 §5 names), and also delta 1's roster read, delta 1a's
--     projects read and delta 2's resolver call, each of which would otherwise
--     evaluate against a NULL project and answer wrongly rather than not at all:
--       · delta 1 would RAISE 'rate_role … is not a role this member holds' for a
--         caller-supplied rate_role, instead of discarding it the way the rate is
--         discarded.
--       · delta 1a would refuse an owner/admin repointing an internal row's
--         user_id, because its standing leg reads
--         is_org_admin_or_owner(projects.studio_id) through a project that does not
--         exist. Nothing is lost by short-circuiting above it: the INSERT half is
--         carried by 00612's internal_time_own_insert (WITH CHECK user_id =
--         auth.uid()), and the UPDATE half by internal_time_own_update, whose
--         user_id leg sits on BOTH its USING and its WITH CHECK, so the author
--         cannot repoint a row at a colleague and only 00612's owner/admin pair
--         can — which is the authority delta 1a exists to name. An internal row
--         carries no rate, so the confidential number W1-R9-01 was about is not on
--         it either.
--       · delta 2's resolver would be asked to price an hour that is never billed.
--     `rated_amount_cents = 0` is plan-v2 §5's literal, on a running internal row
--     as well as a finished one: an internal hour's billable amount is zero whether
--     or not the clock has stopped (the non-billable project branch writes NULL for
--     a running row because that hour may yet be invoiced; this one may not).
--
--     STATED, NOT DISCOVERED — a member may convert her OWN uninvoiced project
--     hour into internal time, and the rate snapshot goes with the project. The
--     UPDATE passes `Team can update their own time entries`' USING on the old row
--     and internal_time_own_update's WITH CHECK on the new one; aab_ does not
--     watch `billable`, which she must also set false for 00610's CHECK. That is an
--     explicit act on her own unbilled hour, not a silent re-rating (P-4), and the
--     invoiced lock closes the case that matters: guard_invoiced_time_entry
--     (00177:51-84) freezes project_id once invoice_id is set, so an invoiced hour
--     can never become internal time. No machinery is added for it here.
--
-- (2) THE aac_ TRIGGER. studio_id joins the BEFORE INSERT OR UPDATE OF list
--     (plan-v2 §5; §0.8 — a column the classification depends on that is watched
--     in only one of the two places is silently unguarded). 00600's list is
--     carried over column for column; studio_id is appended. Consequence, named:
--     an UPDATE of studio_id on a PROJECT-bearing row now re-fires the classifier,
--     which re-resolves that row's rate under delta 5's preservation rules.
--
-- (3) THE LEDGER VIEW (public.time_entry_ledger, 00604:178-221, re-created here
--     with ONE expression changed). Its studio_id was
--     project_pricing_studio_id(te.project_id), which is NULL for a NULL project
--     (00604:100-102) — so an internal hour would have entered the view (both joins
--     are already LEFT, and 00604's postcondition says the projects join is outer
--     "so that W4's project-less internal time survives this view") and then been
--     invisible to every studio-scoped read of it, including studio_hours_rollup,
--     whose `scoped` CTE filters `ledger.studio_id = p_studio_id`. 00607's own
--     banner hands this edit to W4 by name ("W4 MUST edit this function (and the
--     `scoped` CTE, with an OR leg on the row's own studio_id column) when
--     project_time_entries.studio_id lands"). It is done in the VIEW rather than in
--     the rollup's CTE, as a CASE on project_id rather than a COALESCE, because
--     that way a project-bearing row's studio_id is byte-identical to 00604's
--     answer — no widening at all — and every reader of the view (the rollup, lane
--     B's studio scope, W5's export) gets the internal hour without each one
--     learning a second column. CREATE OR REPLACE, not DROP: 00607's rollup depends
--     on this view.
--     studio_hours_rollup therefore needs no edit: its internal_minutes FILTER
--     already carries the `project_id IS NULL` leg 00607 left as a fail-safe, and
--     its studio filter now admits the row. Postcondition (e) proves that, and the
--     rollup's body is deliberately NOT redefined here.
--
-- (4) THE MARGINS (public.margin_items, 00543:92-454, re-created here with ONE
--     predicate added). plan-v2 §5: the time sub-select gains
--     `WHERE project_id IS NOT NULL` for hygiene. Without it an internal hour
--     joins the Post of whatever project a caller is looking at, as a `time` item
--     with a NULL project_id. The body is 00543's verbatim (00543 is the only
--     definition; it is itself 00282:606-909 with one branch changed) — 11 columns
--     in the same order, so CREATE OR REPLACE stays column-compatible — and the
--     added line is the only difference. The portal already key-filters
--     (use-margin-items.ts), so this is hygiene, not a sweep.
--
-- (5) THE HT-23 TRACE (public.audit_time_entry_change, 00605:216-271, re-created
--     here with ONE expression changed — the same CASE, for the same reason).
--     Its organization_id was project_pricing_studio_id(OLD.project_id), NULL for
--     a NULL project (00604:100-102); 00612's project-less write policies made
--     that reachable, and audit_logs' org read policy (00021:426-435) carries an
--     explicit `organization_id IS NOT NULL` leg — so every edit or delete of an
--     internal hour filed a trace readable by its ACTOR alone, not by the
--     studio's owner, not by a second admin, not by the author whose hour was
--     changed. 00605's own comment states the intent that breaks. W4-R1-01;
--     asserted per role in supabase/tests/rls/internal_time_test.sql case (i).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) the classifier: 00601's body, verbatim, with the short-circuit ──────
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

  -- ── 00613 delta: internal and admin time (HT-15) ──────────────────────────
  -- An hour with no project is never billed and never priced. It is placed above
  -- everything below that reads NEW.project_id; see this file's banner for the
  -- four reads and why each of them must not be reached with a NULL.
  IF NEW.project_id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id    := NULL;
    NEW.billing_state        := 'nonbillable';
    NEW.hourly_rate_cents    := NULL;
    NEW.rated_amount_cents   := 0;
    NEW.rate_source          := 'none';
    NEW.rate_role            := NULL;
    RETURN NEW;
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

  -- ── 00601 delta 1a (W1-R9-01): the hour belongs to the person who worked it ──
  -- Writing somebody else's user_id onto a priced row is the act of an owner or
  -- admin OF THE STUDIO THAT OWNS THE WORK — the same authority ASSERT 2 of the
  -- resolver names. Anyone else may only write their own. Both statements that can
  -- introduce another person's user_id are covered; a correction to a teammate's
  -- existing row (user_id unchanged) is not one of them, so W1-R1-05 stands. See
  -- the round-9 section of the banner for the measurement and for why the gate is
  -- auth.uid() rather than current_user.
  IF auth.uid() IS NOT NULL
     AND NEW.user_id IS DISTINCT FROM auth.uid()
     AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND NOT COALESCE(public.is_org_admin_or_owner(
           (SELECT project.studio_id FROM public.projects AS project
             WHERE project.id = NEW.project_id)), false)
  THEN
    RAISE EXCEPTION 'a time entry is logged by the person who worked the hour'
      USING ERRCODE = 'insufficient_privilege';
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

-- ── (2) the aac_ watched-column list gains studio_id (§0.8) ─────────────────
-- 00600's list, column for column, plus studio_id.
DROP TRIGGER IF EXISTS aac_classify_project_time_entry_authority_trg
  ON public.project_time_entries;
CREATE TRIGGER aac_classify_project_time_entry_authority_trg
BEFORE INSERT OR UPDATE OF project_id, user_id, started_at, duration_minutes,
  billable, billing_authority_id, authority_rate_id, hourly_rate_cents, rate_role,
  studio_id
ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.classify_project_time_entry_authority();

-- ── (3) the ledger view: an internal hour belongs to its own studio ─────────
-- 00604:178-221 verbatim, with the studio_id expression as the only change.
CREATE OR REPLACE VIEW public.time_entry_ledger
WITH (security_invoker = true) AS
SELECT
  te.id,
  te.project_id,
  p.name                                        AS project_name,
  -- 00613 (HT-15): the studio that prices the work for a project hour (00604,
  -- HT-3-a/b), and the hour's OWN studio for an internal one. A CASE, not a
  -- COALESCE: a project-bearing row's answer stays byte-identical to 00604's.
  CASE WHEN te.project_id IS NULL THEN te.studio_id
       ELSE public.project_pricing_studio_id(te.project_id)
  END                                           AS studio_id,
  te.user_id,
  author.full_name                              AS member_name,
  te.phase_key,
  te.task_id,
  te.started_at,
  (te.started_at AT TIME ZONE 'UTC')::date      AS day,
  to_char(te.started_at AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS iso_week,
  to_char(te.started_at AT TIME ZONE 'UTC', 'YYYY-MM')    AS month,
  te.duration_minutes,
  (te.duration_minutes IS NULL)                 AS is_running,
  te.billable,
  te.activity,
  te.source,
  te.billing_state,
  te.rate_source,
  te.rate_role,
  -- One rate source, 00596's rule: the classifier-owned snapshot on the row, and
  -- the amount that the same snapshot produces. The rate printed is the rate
  -- that priced the line.
  COALESCE(te.hourly_rate_cents, 0)             AS resolved_rate_cents,
  COALESCE(
    te.rated_amount_cents,
    round(COALESCE(te.duration_minutes, 0) / 60.0 * COALESCE(te.hourly_rate_cents, 0))::int
  )                                             AS amount_cents,
  te.invoice_id,
  te.billing_authority_id,
  te.authority_rate_id,
  te.created_at,
  te.updated_at
FROM public.project_time_entries te
-- BOTH joins are LEFT, and that is load-bearing under security_invoker: an
-- INNER join applies the CALLER's projects / profiles RLS and drops the whole
-- row when they cannot read the joined side (00555:3024-3026, the defect 00596
-- repaired in project_unbilled_time). A missing name is a NULL column here, not
-- a missing hour.
LEFT JOIN public.projects p      ON p.id = te.project_id
LEFT JOIN public.profiles author ON author.id = te.user_id;

-- The post-flip grants, restated (CREATE OR REPLACE preserves the existing ACL;
-- these are what supabase/seed/00-legacy-grants.sql replays on a fresh stack).
REVOKE ALL ON public.time_entry_ledger FROM anon;
GRANT SELECT ON public.time_entry_ledger TO authenticated;

COMMENT ON VIEW public.time_entry_ledger IS
  'W2 fact view for the Hours sheet''s four scopes (plan-v2 §3). '
  'security_invoker — RLS on project_time_entries is the whole authorization '
  'story (00606, and 00612 for the project-less rows). studio_id is the studio '
  'that PRICES the work for a project hour, by HT-3-a/b through '
  'project_pricing_studio_id, and the hour''s OWN studio_id column for an '
  'internal one (HT-15, 00613); it is NEVER an RLS policy key (§0.13). '
  'Deliberately carries NO notes column: aggregate by default (HT-36), free '
  'text only behind an explicit detail act against the table. Day / iso_week / '
  'month buckets are UTC, matching 00599''s date basis.';

-- ── (4) the margins: an internal hour has none ──────────────────────────────
-- 00543:92-454 verbatim (itself 00282:606-909 with the note branch changed), with
-- `and pte.project_id is not null` added to the time sub-select and nothing else.
create or replace view public.margin_items
  with (security_invoker = true) as

-- ── decision ────────────────────────────────────────────────────────────────
select
  'decision'::text                          as kind,
  cd.id                                     as item_id,
  cd.project_id                             as project_id,
  cd.linked_proposal_id                     as proposal_id,
  case
    when li.line_id is not null then 'line'
    when cd.section_key is not null then 'section'
    else 'letterhead'
  end                                       as anchor_kind,
  li.line_id                                as anchor_id,
  case
    when cd.status = 'pending' and cd.due_date is not null and cd.due_date < now()
      then 'overdue'
    else cd.status
  end                                       as state,
  cd.title                                  as title,
  coalesce(cd.context, '')                  as detail,
  coalesce(cd.due_date, cd.updated_at)      as ts,
  jsonb_build_object(
    'due_date', cd.due_date,
    'blocking_status', cd.blocking_status,
    'reminder_sent_at', cd.reminder_sent_at,
    'responded_at', cd.responded_at,
    'decision_kind', cd.decision_kind,
    'section_key', cd.section_key,
    'coordination_kind', cd.coordination_kind,
    'court', cd.court
  )                                         as payload
from client_decisions cd
left join lateral (
  select i.id as line_id
  from project_ffe_items i
  where i.blocked_by_decision_id = cd.id or i.source_decision_id = cd.id
  order by (i.blocked_by_decision_id = cd.id) desc, i.sort_order
  limit 1
) li on true
where cd.status in ('pending', 'responded', 'expired')

union all

-- ── message (one row per anchored thread) ───────────────────────────────────
select
  'message'::text                           as kind,
  t.id                                      as item_id,
  t.project_id                              as project_id,
  t.proposal_id                             as proposal_id,
  coalesce(t.anchor_kind, 'letterhead')     as anchor_kind,
  t.anchor_id                               as anchor_id,
  case
    when m.own_voice then 'read'
    when exists (
      select 1 from comms_thread_participants tp
      where tp.thread_id = t.id
        and tp.profile_id = auth.uid()
        and (tp.last_read_at is null or tp.last_read_at < t.last_message_at)
    ) then 'unread'
    else 'read'
  end                                       as state,
  coalesce(t.title, 'Conversation')         as title,
  coalesce(m.snippet, '')                   as detail,
  t.last_message_at                         as ts,
  jsonb_build_object(
    'thread_kind', t.kind,
    'sender_name', m.sender_name,
    'own_voice', m.own_voice
  )                                         as payload
from comms_threads t
left join projects  mpj on mpj.id = t.project_id
left join proposals mpp on mpp.id = t.proposal_id
left join lateral (
  select
    left(cm.body, 140) as snippet,
    (cm.sender_id is null or not exists (
      select 1 from comms_thread_participants sp
      where sp.thread_id = t.id
        and sp.profile_id = cm.sender_id
        and sp.role in ('client', 'vendor')
    )) as own_voice,
    case
      when cm.sender_id is null or not exists (
        select 1 from comms_thread_participants sp
        where sp.thread_id = t.id
          and sp.profile_id = cm.sender_id
          and sp.role in ('client', 'vendor')
      )
      then coalesce(nullif(btrim(p.full_name), ''), st.studio_name)
      else nullif(btrim(p.full_name), '')
    end as sender_name
  from comms_messages cm
  left join profiles p on p.id = cm.sender_id
  left join lateral (
    select o.name as studio_name
    from organization_members om
    join organizations o on o.id = om.organization_id
    where om.user_id = coalesce(mpj.designer_id, mpp.designer_id)
      and om.status = 'active'
      and o.type = 'design_studio'
    order by om.created_at
    limit 1
  ) st on true
  where cm.thread_id = t.id and cm.deleted_at is null
  order by cm.created_at desc
  limit 1
) m on true
where t.kind in ('direct', 'project', 'vendor_brief')
  and (t.project_id is not null or t.proposal_id is not null)
  and t.last_message_at is not null

union all

-- ── invoice ─────────────────────────────────────────────────────────────────
select
  'invoice'::text                           as kind,
  inv.id                                    as item_id,
  inv.project_id                            as project_id,
  null::uuid                                as proposal_id,
  case when fl.ffe_item_id is not null then 'line' else 'letterhead' end
                                            as anchor_kind,
  fl.ffe_item_id                            as anchor_id,
  inv.status                                as state,
  case
    when inv.invoice_number is not null then inv.invoice_number
    else 'Draft invoice'
  end                                       as title,
  coalesce(inv.memo, '')                    as detail,
  inv.updated_at                            as ts,
  jsonb_build_object(
    'invoice_number', inv.invoice_number,
    'total_cents', inv.total_cents,
    'due_date', inv.due_date,
    'sent_at', inv.sent_at
  )                                         as payload
from invoices inv
left join lateral (
  select l.ffe_item_id
  from invoice_line_items l
  where l.invoice_id = inv.id and l.ffe_item_id is not null
  order by l.sort_order
  limit 1
) fl on true
where inv.status in ('draft', 'sent', 'partially_paid')

union all

-- ── pulse ───────────────────────────────────────────────────────────────────
select
  'pulse'::text                             as kind,
  wp.id                                     as item_id,
  wp.project_id                             as project_id,
  null::uuid                                as proposal_id,
  wp.anchor_kind                            as anchor_kind,
  wp.anchor_id                              as anchor_id,
  case
    when wp.status = 'draft' and wp.week_of = date_trunc('week', now())::date
      then 'due'
    else wp.status
  end                                       as state,
  coalesce(wp.subject, 'Weekly Pulse')      as title,
  coalesce(wp.body, '')                     as detail,
  coalesce(wp.sent_at, wp.week_of::timestamptz) as ts,
  jsonb_build_object(
    'week_of', wp.week_of,
    'sent_at', wp.sent_at
  )                                         as payload
from weekly_pulses wp

union all

-- ── time (daily summary — a query, not a table; spec §5) ────────────────────
select
  'time'::text                              as kind,
  -- Schema-qualified (unlike the 00219 original): the prod push session's
  -- search_path does not include `extensions`, so the bare name fails there.
  extensions.uuid_generate_v5(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    te.project_id::text || te.day::text
  )                                         as item_id,
  te.project_id                             as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  'logged'::text                            as state,
  'Time · ' || to_char(te.day, 'Mon FMDD')  as title,
  ''::text                                  as detail,
  te.day::timestamptz                       as ts,
  jsonb_build_object(
    'minutes', te.minutes,
    'entry_count', te.entry_count,
    'day', te.day
  )                                         as payload
from (
  select
    pte.project_id,
    date(pte.started_at) as day,
    sum(pte.duration_minutes) as minutes,
    count(*) as entry_count
  from project_time_entries pte
  where pte.duration_minutes is not null
    and pte.project_id is not null   -- 00613 (HT-15): an internal hour has no margin
    and pte.started_at > now() - interval '7 days'
  group by pte.project_id, date(pte.started_at)
) te
union all

-- ── note (R14 — designer-authored marginalia; studio-only via RLS) ──────────
-- ⚠ THIS BRANCH IS THE ONLY CHANGE IN THIS MIGRATION. Every other branch above
--   and below is 00282:606-909 byte-for-byte (00282's own discipline for this
--   view, stated at 00282:600-604). Column count, order and types are
--   unchanged — 11 columns — so CREATE OR REPLACE stays column-compatible.
--
--   What changes, and why:
--   1. `title` STAYS `left(n.body, 80)`. It is the rail's one-line lede and
--      margin-item.tsx:60 renders it in the collapsed row.
--   2. `detail` STAYS ''::text. margin-item.tsx:64 feeds `row.detail` to the
--      collapsed-row preview for EVERY kind, so widening it here would dump a
--      full transcript into the rail. The body travels in the payload instead.
--   3. `payload` GAINS the field-note lane. Package §9.4 requires the full body
--      to reach the Document: a one-minute transcript arriving as its first
--      eighty characters is the failure this migration exists to fix.
--
--   ⚠ SECURITY INVOKER (00282:606-607) means the field_captures join runs under
--   the READER's RLS. A studio co-member can read the note
--   (margin_notes_studio_read, 00316:309-330) but not the capture
--   (owner-only unless status='inbox' AND same organization, 00233:155-188), so
--   the join returns NULL for her. `capture_visible` makes that legible instead
--   of silent: false means "there is a capture and it is not yours to open",
--   and NoteBody renders an honest line rather than a dead play button. This is
--   FC-R8 (per-designer in v1) surfacing in a view rather than a policy, and
--   §3.3 forbids dropping it silently.
select
  'note'::text                              as kind,
  n.id                                      as item_id,
  n.project_id                              as project_id,
  n.proposal_id                             as proposal_id,
  n.anchor_kind                             as anchor_kind,
  n.anchor_id                               as anchor_id,
  case
    when n.escalated_to_decision_id is not null
      or n.escalated_to_scope_change_id is not null      then 'escalated'
    when n.due_date is not null and n.due_date <= now()  then 'due'
    else 'open'
  end                                       as state,
  left(n.body, 80)                          as title,
  ''::text                                  as detail,
  coalesce(n.due_date, n.updated_at)        as ts,
  jsonb_build_object(
    'due_date', n.due_date,
    'escalated_to_decision_id', n.escalated_to_decision_id,
    'escalated_to_scope_change_id', n.escalated_to_scope_change_id,
    'author_name', ap.full_name,
    -- The full note — FIELD NOTES ONLY. W4-C8 explicitly does NOT take a full
    -- body for typed R14 notes this wave: readFieldNotePayload falls back to
    -- row.title (left(body, 80)) when this key is null, which is byte-for-byte
    -- the pre-wave escalation and amendment seed. Emitting n.body
    -- unconditionally would have changed the typed-note escalation silently.
    'body', case when n.field_capture_id is not null then n.body else null end,
    -- The field lane. All NULL/false/[] on a typed R14 note, so nothing about
    -- a field-less project changes shape (FC-R10's browser-verified criterion).
    'field_capture_id', n.field_capture_id,
    'capture_visible', (n.field_capture_id IS NOT NULL AND fc.id IS NOT NULL),
    -- ⚠ F1: neither voice_audio_segments nor photos carries an arrayness
    -- CHECK, and `authenticated` can PATCH either through PostgREST to any
    -- jsonb value. jsonb_array_length()/jsonb_array_elements() on a non-array
    -- raise 22023 — unguarded, that error propagates out of the whole UNION
    -- ALL view, so one malformed capture killed EVERY margin kind for that
    -- designer, not just the note. jsonb_typeof(...) = 'array' guards both:
    -- a malformed value degrades to '[]'/0 instead of raising.
    'has_audio', (
      fc.voice_audio_path IS NOT NULL
      OR (
        jsonb_typeof(coalesce(fc.voice_audio_segments, '[]'::jsonb)) = 'array'
        AND jsonb_array_length(coalesce(fc.voice_audio_segments, '[]'::jsonb)) > 0
      )
    ),
    'audio_path', fc.voice_audio_path,
    'audio_segments', case
      when jsonb_typeof(coalesce(fc.voice_audio_segments, '[]'::jsonb)) = 'array'
        then coalesce(fc.voice_audio_segments, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'voice_duration_seconds', fc.voice_duration_seconds,
    'transcript_source', fc.transcript_source,
    -- Storage keys only, in capture order. The portal signs them with
    -- useCaptureMediaUrls(paths, ttl) (§11.1); the view never mints a URL.
    'photo_paths', case
      when jsonb_typeof(coalesce(fc.photos, '[]'::jsonb)) = 'array' then coalesce(
        (select jsonb_agg(ph->>'path' order by ph_ord)
           from jsonb_array_elements(coalesce(fc.photos, '[]'::jsonb))
                with ordinality as t(ph, ph_ord)
          where ph->>'path' is not null),
        '[]'::jsonb)
      else '[]'::jsonb
    end
  )                                         as payload
from margin_notes n
left join profiles ap on ap.id = n.designer_id
left join field_captures fc on fc.id = n.field_capture_id

union all

-- ── vendor payment due (R18 — the 00189 cron's flips become Money items) ────
select
  'invoice'::text                           as kind,
  pp.id                                     as item_id,
  po.project_id                             as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  'due'::text                               as state,
  'Vendor payment — ' || coalesce(pp.label, replace(pp.kind::text, '_', ' '))
                                            as title,
  coalesce(po.po_number, po.vendor_po_number, po.sidemark, 'PO') || ' · ' || v.name
                                            as detail,
  pp.due_date::timestamptz                  as ts,
  jsonb_build_object(
    'po_payment', true,
    'amount_cents', pp.amount_cents,
    'due_date', pp.due_date,
    'po_label', coalesce(po.po_number, po.vendor_po_number, po.sidemark),
    'vendor_name', v.name,
    'payment_kind', pp.kind
  )                                         as payload
from po_payments pp
join purchase_orders po on po.id = pp.purchase_order_id
join vendors v on v.id = po.vendor_id
where pp.state = 'due'

union all

-- ── field_sms (Field Coordination Wave 1 — inbound texts land in the Post) ──
-- One margin item per inbound field text. needs_review rows read 'needs_review'
-- (the Desk triage state); applied ones read 'logged'. The payload carries the
-- parse/apply provenance + any media so the rail renders the thread inline.
select
  'field_sms'::text                         as kind,
  m.id                                      as item_id,
  m.project_id                              as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  case when m.needs_review and m.reviewed_at is null then 'needs_review' else 'logged' end
                                            as state,
  coalesce(pp.display_name, 'Field text')   as title,
  coalesce(left(m.body, 140), '')           as detail,
  m.created_at                              as ts,
  jsonb_build_object(
    'direction', m.direction,
    'party_id', m.party_id,
    'party_kind', pp.party_kind,
    'trade', pp.trade,
    'confidence', m.confidence,
    'needs_review', m.needs_review,
    'parsed_intent', m.parsed_intent,
    'applied_effect', m.applied_effect,
    'media', m.media
  )                                         as payload
from sms_messages m
left join project_parties pp on pp.id = m.party_id
where m.direction = 'inbound' and m.project_id is not null;

comment on view public.margin_items is
  'The Document margins (spec §5 + R14/R18/R23 + R33 F1/F6 + Track 5 + Field '
  'Coordination): unified index of decision/message/invoice/pulse/time/note/'
  'field_sms items. The field_sms branch (00282) surfaces inbound field texts in '
  'the Post (needs_review → triage state). The time branch excludes project-less '
  'internal hours (HT-15, 00613) — an hour with no project has no margin. '
  'SECURITY INVOKER — base-table RLS applies.';

grant select on public.margin_items to authenticated;
grant select on public.margin_items to service_role;

-- ── (5) the HT-23 trace reckons with the project-less hour (W4-R1-01) ───────
-- public.audit_time_entry_change, 00605:216-271 VERBATIM — the sole definition
-- (`grep -rln "CREATE OR REPLACE FUNCTION public.audit_time_entry_change"
-- supabase/migrations/*.sql` returns 00605 and nothing else) — with ONE
-- expression changed: the same CASE section (3) above ships on the ledger view,
-- for the same reason and in the same shape.
--
-- THE DEFECT, measured. 00605's v_org read
-- project_pricing_studio_id(OLD.project_id), which returns NULL for a NULL
-- project (00604:100-102). 00612's project-less write policies are what make
-- that reachable: every owner/admin — and own-row — edit or delete of an
-- internal hour filed its trace with organization_id = NULL. audit_logs' org
-- read policy "Org admins can view org audit logs" (00021:426-435) carries an
-- explicit `organization_id IS NOT NULL` leg, so such a trace is readable only
-- through "Users can view their audit logs" (00021:422-423, user_id =
-- auth.uid()) — by the ACTOR alone. Not the studio's owner, not a second admin,
-- not the author whose hour was changed. 00605's own comment at :237-241 states
-- the intent this breaks. Measured before the fix: an admin adjusts the author's
-- 60-minute internal hour to 30 → one audit_logs row, action
-- 'time_entry.updated', organization_id NULL, user_id = the admin; the owner
-- reading that resource_id through RLS gets 0 rows. (updated_by / updated_at on
-- the row itself stamp correctly either way; it is the audit_logs ledger that
-- goes dark.)
--
-- 00605 is NOT edited — it is applied on no stack this program can reach and the
-- lineage rule is redefine-forward (§0.4). THE TRIGGER IS NOT RE-CREATED:
-- CREATE OR REPLACE FUNCTION leaves zzzz_audit_time_entry_change_trg
-- (00605:273-276) bound to the same oid, and 00610's backfill block disables and
-- re-enables it BY NAME (00610:108, :123) — so postcondition (h) asserts it is
-- present AND enabled, not merely defined.
CREATE OR REPLACE FUNCTION public.audit_time_entry_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org     uuid;
  v_action  text;
  v_new     jsonb;
BEGIN
  -- NEW is UNASSIGNED in a plpgsql DELETE trigger — reading NEW.anything there
  -- raises, so the two operations are separated rather than COALESCEd.
  IF TG_OP = 'DELETE' THEN
    v_action := 'time_entry.deleted';
    v_new    := NULL;
  ELSE
    v_action := 'time_entry.updated';
    v_new    := to_jsonb(NEW);
  END IF;

  -- The organization on the trace is the studio that PRICES the work (HT-3-a/b,
  -- through 00604's one callable form), so an owner reading
  -- "Org admins can view org audit logs" (00021:423) sees the edits to her own
  -- studio's hours. NULL is permitted by the column and means no studio prices
  -- this project yet ('rate pending').
  -- 00613 delta (W4-R1-01): for an hour with NO project it is the hour's OWN
  -- studio_id. A CASE, not a COALESCE — a project-bearing row's answer stays
  -- byte-identical to 00605's, exactly as the ledger view's studio_id does.
  v_org := CASE WHEN OLD.project_id IS NULL THEN OLD.studio_id
                ELSE public.project_pricing_studio_id(OLD.project_id)
           END;

  INSERT INTO public.audit_logs (
    user_id, organization_id, action, resource_type, resource_id,
    old_values, new_values
  ) VALUES (
    auth.uid(),
    v_org,
    v_action,
    'project_time_entries',
    OLD.id,
    to_jsonb(OLD),
    v_new
  );

  RETURN NULL;  -- AFTER trigger; the return value is ignored
END;
$$;

-- A trigger function needs no EXECUTE at fire time (Postgres checks the
-- privilege at CREATE TRIGGER) — 00597's and 00603's precedent in this program.
REVOKE ALL ON FUNCTION public.audit_time_entry_change()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.audit_time_entry_change() IS
  'HT-23: writes ONE public.audit_logs row per UPDATE or DELETE of a time '
  'entry, carrying old_values and (for an update) new_values, the actor, and the '
  'studio that prices the work — or, for an hour with no project, the hour''s '
  'own studio_id (HT-15, 00613: project_pricing_studio_id(NULL) is NULL and '
  'audit_logs'' org read policy refuses a NULL organization_id, so an internal '
  'hour''s trace would otherwise be readable by its actor alone). SECURITY '
  'DEFINER because audit_logs has RLS enabled with no INSERT policy (00021:261, '
  ':423, :426) — an INVOKER trigger would roll the edit back along with its own '
  'trace (§0.18).';

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_src     text := pg_get_functiondef(
    'public.classify_project_time_entry_authority()'::regprocedure);
  v_aac     text;
  v_def     text;
  v_flat    text;
  v_invoker text;
  v_rollup  text;
  v_audit   text;
BEGIN
  -- (a) THE DELTA IS PRESENT, and above every read of NEW.project_id.
  ASSERT v_src ~ 'IF NEW\.project_id IS NULL THEN',
    '00613: the classifier must short-circuit on a NULL project_id (HT-15) — '
    'without it an internal hour is priced by the project ladder';
  ASSERT position('IF NEW.project_id IS NULL THEN' in v_src)
       < position('project_commercial_documents' in v_src),
    '00613: the short-circuit must sit ABOVE the project_commercial_documents '
    'lookup (plan-v2 §5) — that read answers for a project that does not exist';
  ASSERT position('IF NEW.project_id IS NULL THEN' in v_src)
       < position('resolve_time_rate_cents' in v_src),
    '00613: the short-circuit must sit above the resolver call — an hour that is '
    'never billed is never priced';
  ASSERT position('IF NEW.project_id IS NULL THEN' in v_src)
       < position('is not a role this member holds' in v_src),
    '00613: the short-circuit must sit above delta 1, or a caller-supplied '
    'rate_role RAISES on an internal hour instead of being discarded';
  ASSERT position('IF NEW.project_id IS NULL THEN' in v_src)
       < position('a time entry is logged by the person who worked the hour' in v_src),
    '00613: the short-circuit must sit above delta 1a, whose standing leg reads '
    'the project that does not exist — 00612''s own-row policies carry that '
    'refusal for internal time (see the banner)';

  -- (b) EVERY 00578/00601 INVARIANT, re-asserted rather than trusted. A graft
  --     from a stale body is the failure mode this whole lineage exists to
  --     prevent (00199 reverted 00185; patina-db-migrations step 2).
  ASSERT v_src ~ 'resolve_time_rate_cents',
    '00613: the classifier must still call resolve_time_rate_cents (HT-1)';
  ASSERT v_src ~ 'time-entry authority and rate provenance are immutable',
    '00613: 00578''s authority/rate immutability raise was lost';
  ASSERT v_src ~ 'bound commercial time entry has invalid authority provenance',
    '00613: 00578''s bound-provenance raise was lost';
  ASSERT v_src ~ 'FROM public\.projects project\s+WHERE project.id = NEW.project_id\s+FOR UPDATE',
    '00613: the stable project-row FOR UPDATE lock was lost';
  ASSERT v_src ~ 'COALESCE\(v_project_ceiling_cents, v_authority.billing_ceiling_cents\) IS NULL',
    '00613: 00575''s nullable-ceiling (F-2) delta was lost';
  ASSERT v_src ~ 'NEW\.hourly_rate_cents := OLD\.hourly_rate_cents',
    '00613: the non-billable branch must preserve a bound row''s signed rate (W1-R1-02)';
  ASSERT v_src ~ 'NEW\.rate_role IS DISTINCT FROM OLD\.rate_role',
    '00613: rate_role must be validated only on a NEW pick (W1-R1-03)';
  ASSERT v_src ~ 'v_rate_source := OLD\.rate_source',
    '00613: delta 5 must preserve OLD.rate_source (W1-R2-05)';
  ASSERT v_src ~ 'OLD\.rate_source IS NULL',
    '00613: delta 5 must preserve a pre-00600 snapshot even when the chain '
    'resolves (P-4, W1-R3-02)';
  ASSERT v_src ~ 'IF v_project_designer_id IS NOT DISTINCT FROM NEW\.user_id THEN\s+v_team_role := ''lead_designer'';\s+ELSIF NEW\.rate_role IS NOT NULL THEN',
    '00613: the project designer''s lead_designer role must stay fixed ABOVE '
    'NEW.rate_role in the role ladder (W1-R5-03)';
  ASSERT v_src ~ 'a time entry is logged by the person who worked the hour',
    '00613: W1-R9-01''s non-self user_id refusal was lost';
  ASSERT v_src ~ 'TG_OP = ''INSERT'' OR NEW\.user_id IS DISTINCT FROM OLD\.user_id',
    '00613: W1-R9-01''s refusal must still cover the UPDATE repoint';

  -- (c) the aac_ list: 00600's columns, plus studio_id (§0.8).
  SELECT pg_get_triggerdef(oid) INTO v_aac FROM pg_trigger
   WHERE tgrelid = 'public.project_time_entries'::regclass
     AND tgname = 'aac_classify_project_time_entry_authority_trg';
  ASSERT v_aac IS NOT NULL, '00613: the classifier trigger is missing';
  ASSERT v_aac ~ 'studio_id',
    '00613: studio_id must join the aac_ watched-column list (plan-v2 §5, §0.8)';
  ASSERT v_aac ~ 'project_id' AND v_aac ~ 'user_id' AND v_aac ~ 'started_at'
     AND v_aac ~ 'duration_minutes' AND v_aac ~ 'billable'
     AND v_aac ~ 'billing_authority_id' AND v_aac ~ 'authority_rate_id'
     AND v_aac ~ 'hourly_rate_cents' AND v_aac ~ 'rate_role',
    '00613: the aac_ list must carry every column 00600 watched; got ' || v_aac;

  -- (d) the ledger view still has 00604's shape, and now answers for an
  --     internal hour.
  SELECT pg_get_viewdef('public.time_entry_ledger'::regclass, true) INTO v_def;
  v_flat := lower(regexp_replace(v_def, '\s+', ' ', 'g'));
  ASSERT v_flat LIKE '%left join projects%' OR v_flat LIKE '%left join public.projects%',
    '00613: the projects join must stay an OUTER join — it is what lets a '
    'project-less hour survive the view at all (00604)';
  ASSERT v_flat LIKE '%left join profiles%' OR v_flat LIKE '%left join public.profiles%',
    '00613: the profiles join must stay an OUTER join (00555:3024-3026)';
  ASSERT v_flat LIKE '%te.studio_id%',
    '00613: the ledger must read the row''s OWN studio_id for an internal hour, '
    'or studio_hours_rollup''s `ledger.studio_id = p_studio_id` filter can never '
    'see one (00607''s own handover note)';
  ASSERT v_flat LIKE '%project_pricing_studio_id%',
    '00613: and it must still read project_pricing_studio_id for a project hour '
    '(HT-3-a/b) — the three bodies of that rule stay one rule';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'time_entry_ledger'
      AND column_name = 'notes'
  ), '00613: time_entry_ledger must still carry no notes column (HT-36)';
  SELECT array_to_string(relation.reloptions, ',') INTO v_invoker
  FROM pg_class AS relation WHERE relation.oid = 'public.time_entry_ledger'::regclass;
  ASSERT COALESCE(v_invoker, '') LIKE '%security_invoker=true%',
    '00613: the ledger view must stay security_invoker (HT-38); reloptions = '
    || COALESCE(v_invoker, 'NULL');
  ASSERT has_table_privilege('authenticated', 'public.time_entry_ledger', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.time_entry_ledger', 'SELECT'),
    '00613: the ledger stays authenticated-only';

  -- (e) studio_hours_rollup is NOT redefined here, and does not need to be: the
  --     internal_minutes FILTER already carries 00607's project_id IS NULL leg,
  --     and its studio filter reads the view column (d) just widened.
  SELECT prosrc INTO v_rollup FROM pg_proc
   WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid)');
  ASSERT v_rollup LIKE '%ledger.studio_id = p_studio_id%',
    '00613: the rollup must still scope on ledger.studio_id — the internal hour '
    'reaches it through the view, not through a second filter';
  ASSERT v_rollup LIKE '%keyed.project_id IS NULL%',
    '00613: 00607''s internal_minutes FILTER must still carry the project_id IS '
    'NULL leg — it stops being a fail-safe and starts being the arithmetic';
  ASSERT NOT (SELECT prosecdef FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid)')),
    '00613: studio_hours_rollup must stay SECURITY INVOKER (HT-38, §0.9)';

  -- (f) the margins exclude the project-less hour, and nothing else moved.
  SELECT pg_get_viewdef('public.margin_items'::regclass, true) INTO v_def;
  v_flat := lower(regexp_replace(v_def, '\s+', ' ', 'g'));
  ASSERT v_flat LIKE '%pte.project_id is not null%',
    '00613: the margin_items time sub-select must exclude project-less hours '
    '(plan-v2 §5) — an internal hour has no margin';
  ASSERT 11 = (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'margin_items'
  ), '00613: margin_items must still carry exactly 11 columns — the graft is '
     '00543''s body with one predicate added';
  SELECT array_to_string(relation.reloptions, ',') INTO v_invoker
  FROM pg_class AS relation WHERE relation.oid = 'public.margin_items'::regclass;
  ASSERT COALESCE(v_invoker, '') LIKE '%security_invoker=true%',
    '00613: margin_items must stay security_invoker; reloptions = '
    || COALESCE(v_invoker, 'NULL');

  -- (g) the invoiced lock and the 00484 quartet are untouched (§0.12, §0.17).
  ASSERT 1 = (
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal AND tgname = 'guard_invoiced_time_entry'
  ), '00613: the invoiced-entry lock must still be in place (§0.12)';
  ASSERT 4 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN ('Team can delete their own time entries',
                      'Team can log their own time entries',
                      'Team can update their own time entries',
                      'Team can view their project time entries')
  ), '00613: the four 00484-registered "Team can …" policies must still exist (§0.17)';

  -- (h) the HT-23 trace reckons with the project-less hour (W4-R1-01), and the
  --     trigger that files it is present AND enabled — 00610's backfill block
  --     disables it by name (00610:108) and re-enables it (:123), so "defined"
  --     is not the same claim as "firing".
  SELECT prosrc INTO v_audit FROM pg_proc
   WHERE oid = to_regprocedure('public.audit_time_entry_change()');
  ASSERT v_audit IS NOT NULL,
    '00613: public.audit_time_entry_change() is missing — HT-23''s trace is gone';
  ASSERT v_audit LIKE '%OLD.studio_id%',
    '00613: the trace must read the hour''s OWN studio_id for a project-less row. '
    'project_pricing_studio_id(NULL) is NULL (00604:100-102) and audit_logs'' org '
    'read policy carries an explicit `organization_id IS NOT NULL` leg '
    '(00021:426-435), so every owner/admin edit of an internal hour would file a '
    'trace readable by its actor alone (W4-R1-01)';
  ASSERT v_audit LIKE '%project_pricing_studio_id%',
    '00613: and it must still read project_pricing_studio_id for a project hour — '
    '00605''s stated intent, byte-identical through the CASE''s ELSE leg';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal
      AND tgname = 'zzzz_audit_time_entry_change_trg'
      AND tgenabled = 'O'
  ), '00613: zzzz_audit_time_entry_change_trg must be present and ENABLED (00605); '
     'a trace that never fires is a worse HT-23 failure than one with a NULL '
     'organization_id';

  RAISE NOTICE '00613 postconditions passed.';
END
$postcondition$;

COMMIT;
