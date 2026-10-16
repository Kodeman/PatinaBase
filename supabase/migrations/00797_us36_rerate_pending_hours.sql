-- ═══════════════════════════════════════════════════════════════════════════
-- 00797 — US-36 R1: re-rate pending hours on set (K8, amends P-4)
--
-- Number reserved in the US-36 execution contract (00796–00805). Two new
-- functions, one redefined trigger body; no table, policy, column or trigger
-- attachment changes.
--
-- ── K8 (Kody 2026-10-16) ───────────────────────────────────────────────────
-- "An owner/admin act prices only still-pending, never-invoiced hours at the
-- newly set rate. This amends P-4." P-4 (hour-tracking charter: no historical
-- backfill; invoiced and unbilled history keep their amounts) is not amended
-- for any hour that HAS an amount: K8 never moves one. A pending hour has none:
-- rate_source = 'none', hourly_rate_cents NULL, refused by claim_time_entries
-- (00617), and printed as "rate pending" in the composer. K8 lets the studio
-- price exactly those hours after the fact, by an explicit act, and no other
-- hour. (Not claimed here: a rate later backdated over a priced hour re-prices
-- it on that hour's next watched edit. That is 00618's delta 5, inherited and
-- unchanged, and open in DECISIONS R177.)
--
-- WHY THE CLASSIFIER, NOT THE GUARD: aab_guard_commercial_time_entry_derived_
-- fields (00605) refuses caller-supplied rate columns but returns early for a
-- DEFINER write (current_user = postgres). What actually holds a pending hour at
-- 'none' is aac_classify_project_time_entry_authority. It re-resolves at
-- NEW.started_at on every UPDATE of its watched columns, and tier 2
-- (studio_member_rates) is effective-dated, so a rate set today does not cover
-- last week's hours. A rate written directly would be written back to 'none' in
-- the same statement. So the exception is carved inside the classifier, at the
-- one point where it resolves, and nowhere else:
--
--   public._k8_rate_row_refusal(p_rate_id, p_actor) → text
--     The one statement of whether a studio_member_rates row may price pending
--     hours for p_actor. Both callers below ask it, and nothing else
--     re-implements it: the RPC and the classifier each carried their own copy,
--     and the copies drifted apart twice (SQ-1079 F3: the classifier's copy
--     had no superseded test, so an owner who set the GUCs herself priced at a
--     row the RPC refuses). NULL means the row may price. Otherwise the answer
--     names the first rule it fails, in this order:
--       'not_permitted' — no such row, or p_actor holds no active owner/admin
--                         seat in the row's studio (is_org_admin_or_owner's
--                         test, 00484). K11's solo owner holds the owner role,
--                         so she is covered; 00796 added no K11 predicate (R173).
--       'superseded'    — the member has a later-dated row in that studio,
--                         whatever its date (SQ-1079 F1). A row that a
--                         tomorrow-dated save closed at today is superseded,
--                         though today is still inside it.
--       'self_rate'     — the member wrote the row for herself and holds no
--                         active owner seat there: tier 2 ignores it (00615
--                         HT-3-e(2)).
--     It share-locks the rate row, then the actor's and the member's seats in
--     one ordered statement (00796's pattern, SQ-1073 R2), and reads standing
--     from the rows as locked. SECURITY DEFINER; EXECUTE revoked from every
--     role, so only the two DEFINER bodies below reach it.
--
--   public.rerate_pending_time_entries(p_rate_id, p_expected_rate_cents)
--     → integer. SECURITY DEFINER. p_rate_id is the studio_member_rates row
--     just saved (the row useSetStudioMemberRate's upsert returns), and
--     p_expected_rate_cents is the hourly_rate_cents that save returned. The
--     studio and the member come from that row, never from the caller. It asks
--     _k8_rate_row_refusal and words the answer: 'not_permitted' and an
--     unknown id share one 42501, so the id grants nothing by itself;
--     'superseded' is 23514; 'self_rate' is 42501. The row and both seats stay
--     share-locked until the walk ends. A same-day correction keeps the row's
--     id (the upsert's conflict key is studio, member and date), so the RPC
--     then compares the row's rate with p_expected_rate_cents. A different
--     rate is refused with 40001 (SQ-1079 F2): the act prices the rate its
--     caller saved, or nothing. It walks the rows where projects.studio_id is
--     the row's studio (the pricing studio, 00615's project_pricing_studio_id),
--     user_id is the row's member, rate_source = 'none' and invoice_id IS NULL
--     (00617's un-invoiced predicate). For each one it names the entry in the
--     transaction-local GUC app.rerate_time_entry_id, and the rate row in
--     app.rerate_rate_id (00412/00414's app.budget_publish_id precedent:
--     restored on exit and on error). Then it issues a touch UPDATE of
--     hourly_rate_cents, a watched column, so the classifier re-derives the
--     row. It returns how many rows that UPDATE moved off 'none' in this call,
--     read back from the row it wrote (SQ-1079 F5), not how many it touched.
--
--   classify_project_time_entry_authority — the 00618 body VERBATIM plus one
--     block after delta 2's resolution. That block applies when the entry GUC
--     names THIS row, OLD is still pending and un-invoiced, and the started_at
--     answer is still 'none'. If _k8_rate_row_refusal(app.rerate_rate_id,
--     auth.uid()) is NULL and the rate row is this member's, in the studio that
--     prices the project, the row takes that rate row's hourly_rate_cents,
--     stamped 'studio_member'. It asks for every hour, so a row whose
--     eligibility is lost during the walk stays pending and is not counted.
--     Nothing is re-resolved at now() (SQ-1075). There, a signed card that
--     postdates the hour wins tier 1 and masks the member rate (F1), and the
--     UTC day can still be the previous rate's while the browser dated the new
--     row by the studio's local day (F2). A row that fails any of this takes
--     the ordinary path unchanged and stays pending; the edit itself still
--     lands. Setting the GUCs outside the RPC therefore gets an owner/admin
--     only what the RPC would price for her. A row that already resolves at
--     started_at (a rate backdated over it, or a studio stamped since it was
--     logged) is priced by the classifier's ordinary path, which is the same
--     answer any later edit would give it.
--
-- WHAT IS NOT TOUCHED: aab_ (00605) still refuses every caller-supplied rate,
-- amount, billing state and provenance, for an owner as for anyone. Delta 5's
-- P-4 preservation, the bound-row immutability check, guard_invoiced_time_entry
-- (00177) and claim_time_entries (00617) are unchanged. A priced or invoiced row
-- never meets the carve-out: its OLD.rate_source is not 'none' or its invoice_id
-- is set.
--
-- TRACE: zzzz_audit_time_entry_change_trg (00605 → 00613) already writes one
-- public.audit_logs row per UPDATE, with user_id = auth.uid(), the old and new
-- rate, and the pricing studio. zzz_stamp_time_entry_updated_by_trg stamps
-- updated_by. A re-priced entry therefore leaves exactly one trace row, and a
-- refused re-rate writes nothing. No second writer is added.
--
-- Lineage:
--   classify_project_time_entry_authority ... 00412 → 00575 → 00578 → 00601
--                                             → 00613:126 → 00618:1451 → 00797
--   _k8_rate_row_refusal ..................... NEW
--   rerate_pending_time_entries .............. NEW
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) _k8_rate_row_refusal — the one K8 eligibility predicate (SQ-1079)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._k8_rate_row_refusal(
  p_rate_id uuid,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rate           public.studio_member_rates%ROWTYPE;
  v_seat           record;
  v_actor_runs_it  boolean := false;
  v_member_owns_it boolean := false;
BEGIN
  SELECT * INTO v_rate
  FROM public.studio_member_rates
  WHERE id = p_rate_id
  FOR SHARE;
  IF v_rate.id IS NULL OR p_actor IS NULL THEN
    RETURN 'not_permitted';
  END IF;

  -- Standing is read from the seats as this statement locks them: a demotion
  -- committed while it waits is the version read, and a seat that appears
  -- after its snapshot grants nothing.
  FOR v_seat IN
    SELECT membership.user_id, membership.role, membership.status
    FROM public.organization_members AS membership
    WHERE membership.organization_id = v_rate.studio_id
      AND membership.user_id = ANY(ARRAY[p_actor, v_rate.user_id]::uuid[])
    ORDER BY membership.user_id, membership.id
    FOR SHARE
  LOOP
    IF v_seat.status = 'active' THEN
      v_actor_runs_it := v_actor_runs_it
        OR (v_seat.user_id = p_actor AND v_seat.role IN ('owner', 'admin'));
      v_member_owns_it := v_member_owns_it
        OR (v_seat.user_id = v_rate.user_id AND v_seat.role = 'owner');
    END IF;
  END LOOP;

  IF NOT v_actor_runs_it THEN
    RETURN 'not_permitted';
  END IF;
  -- Any later-dated row supersedes this one, whatever its date (SQ-1079 F1).
  IF EXISTS (
    SELECT 1
    FROM public.studio_member_rates AS later
    WHERE later.studio_id = v_rate.studio_id
      AND later.user_id = v_rate.user_id
      AND later.effective_from > v_rate.effective_from
  ) THEN
    RETURN 'superseded';
  END IF;
  -- Tier 2's self-authored test (00615 HT-3-e(2); 00618:1399-1409).
  IF v_rate.created_by IS NOT DISTINCT FROM v_rate.user_id
     AND NOT v_member_owns_it THEN
    RETURN 'self_rate';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._k8_rate_row_refusal(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._k8_rate_row_refusal(uuid, uuid) IS
  'K8 (00797, SQ-1079): the one rate-row eligibility predicate that '
  'rerate_pending_time_entries and the classifier''s app.rerate_rate_id path '
  'both ask. NULL = the row may price pending hours for p_actor; otherwise '
  '''not_permitted'' (no such row, or p_actor holds no active owner/admin seat '
  'in its studio), ''superseded'' (the member has a later-dated row there, '
  'whatever its date) or ''self_rate'' (a row the member wrote for herself '
  'where she is not an active owner; tier 2 ignores it). Share-locks the rate '
  'row and both seats. Internal: EXECUTE revoked from every role.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) classify_project_time_entry_authority — head 00618:1451, verbatim, with
--     the K8 block after delta 2 and its three variables. The aac_ trigger is
--     not re-created; CREATE OR REPLACE FUNCTION leaves it attached.
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
  -- 00797 delta (K8)
  v_rerate_rate_id uuid;
  v_rerate_cents integer;
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

  -- ── 00797 delta (K8, amends P-4): re-rate on set ─────────────────────────
  -- The one statement that may price an hour its started_at left pending is
  -- rerate_pending_time_entries. For its own UPDATE it names this row in
  -- app.rerate_time_entry_id and the rate row just saved in app.rerate_rate_id.
  -- The hour takes THAT row's rate, stamped 'studio_member'. Nothing is resolved
  -- at now(): a signed card that postdates the hour would mask the member rate,
  -- and the UTC day can still belong to the previous rate (SQ-1075 F1, F2).
  -- Whether that rate row may price at all is _k8_rate_row_refusal's answer,
  -- the same function the RPC asks, so the GUCs grant nothing the RPC does not
  -- (SQ-1079 F3). It is asked again for every hour, so a row whose eligibility
  -- is lost during the walk stays pending. The rate row must also be this
  -- member's, in the studio that prices the project. A row that fails any of
  -- this takes the ordinary path below unchanged and stays pending. A priced or
  -- invoiced row never reaches this block, and aab_ still refuses
  -- caller-supplied rates.
  IF TG_OP = 'UPDATE'
     AND v_rate_source = 'none'
     AND OLD.rate_source = 'none'
     AND OLD.invoice_id IS NULL
     AND current_setting('app.rerate_time_entry_id', true) IS NOT DISTINCT FROM NEW.id::text
  THEN
    v_rerate_rate_id := NULLIF(current_setting('app.rerate_rate_id', true), '')::uuid;
    IF public._k8_rate_row_refusal(v_rerate_rate_id, auth.uid()) IS NULL THEN
      SELECT rate.hourly_rate_cents INTO v_rerate_cents
      FROM public.studio_member_rates AS rate
      JOIN public.projects AS project
        ON project.id = NEW.project_id AND project.studio_id = rate.studio_id
      WHERE rate.id = v_rerate_rate_id
        AND rate.user_id = NEW.user_id;
    END IF;
    IF v_rerate_cents IS NOT NULL THEN
      v_rate_cents  := v_rerate_cents;
      v_rate_source := 'studio_member';
    END IF;
  END IF;

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

    -- ── 00618 delta (HT-4): THE CLASSIFIER ASKS THE ENUM FIRST TOO ─────────
    -- This pick and resolve_time_rate_cents' tier 1 answer the same question
    -- about the same card, and they must not be allowed to disagree: the
    -- resolver hands the cents and the provenance, this pick hands the
    -- authority_rate_id the row is bound to and the rate actually stored. A
    -- roster_role leg in only one of the two would price at card A and bind to
    -- card B — or, the shape that shipped, resolve 'authority' here and still
    -- land pending_authorization with a NULL authority_rate_id, which is
    -- defect #2 arriving under a new name. The legs below are 00613's, kept
    -- whole for cards materialized before this migration.
    IF v_current_version IS NOT NULL AND v_team_role IS NOT NULL THEN
      SELECT count(*) INTO v_role_match_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at
        AND rate.roster_role = v_team_role;
      IF v_role_match_count = 1 THEN
        SELECT rate.* INTO v_rate
        FROM public.project_billing_authority_rates rate
        JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
        WHERE rate.billing_authority_id = v_authority.id
          AND rate.version = v_current_version
          AND source.effective_at <= NEW.started_at
          AND rate.roster_role = v_team_role;
      END IF;
    END IF;

    IF v_rate.id IS NULL
       AND v_current_version IS NOT NULL AND v_normalized_role <> '' THEN
      SELECT count(*) INTO v_role_match_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at
        AND rate.roster_role IS NULL
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
          AND rate.roster_role IS NULL
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

COMMENT ON FUNCTION public.classify_project_time_entry_authority() IS
  'Server-owned classifier for project_time_entries (00412 → 00618): resolves the '
  'one rate chain at started_at and derives authority, rate, amount, billing '
  'state and provenance. 00797 (K8): inside rerate_pending_time_entries only '
  '(app.rerate_time_entry_id names the row, app.rerate_rate_id the member''s '
  'rate row in the project''s studio, and _k8_rate_row_refusal admits that row '
  'for the actor), a still-pending, un-invoiced hour that started_at leaves '
  '''none'' takes that rate row''s rate as studio_member. Nothing is resolved '
  'at now().';

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) rerate_pending_time_entries — the K8 act
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rerate_pending_time_entries(
  p_rate_id uuid,
  p_expected_rate_cents integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_entry text := current_setting('app.rerate_time_entry_id', true);
  v_previous_rate  text := current_setting('app.rerate_rate_id', true);
  v_refusal  text;
  v_rate     public.studio_member_rates%ROWTYPE;
  v_entry_id uuid;
  v_source   text;
  v_count    integer := 0;
BEGIN
  -- Share-locks the rate row and both seats until this transaction ends.
  v_refusal := public._k8_rate_row_refusal(p_rate_id, auth.uid());
  IF v_refusal = 'superseded' THEN
    RAISE EXCEPTION 'rerate_pending_time_entries: rate % has been superseded and is not this member''s current rate', p_rate_id
      USING ERRCODE = 'check_violation';
  ELSIF v_refusal = 'self_rate' THEN
    RAISE EXCEPTION 'rerate_pending_time_entries: a rate members set for themselves prices their hours only in a studio they own'
      USING ERRCODE = 'insufficient_privilege';
  ELSIF v_refusal IS NOT NULL THEN
    -- An unknown id and another studio's row get the same refusal: the id says
    -- nothing to anyone who does not run the studio it belongs to.
    RAISE EXCEPTION 'rerate_pending_time_entries: only an owner or admin of the studio may price its pending hours'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_rate
  FROM public.studio_member_rates
  WHERE id = p_rate_id;
  -- SQ-1079 F2: a same-day correction keeps the row's id, so the id alone does
  -- not say which rate the caller saved.
  IF v_rate.hourly_rate_cents IS DISTINCT FROM p_expected_rate_cents THEN
    RAISE EXCEPTION 'rerate_pending_time_entries: the rate changed since you saved it; save it again to price these hours'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('app.rerate_rate_id', v_rate.id::text, true);
  FOR v_entry_id IN
    SELECT entry.id
    FROM public.project_time_entries AS entry
    JOIN public.projects AS project ON project.id = entry.project_id
    WHERE project.studio_id = v_rate.studio_id
      AND entry.user_id     = v_rate.user_id
      AND entry.rate_source = 'none'
      AND entry.invoice_id IS NULL
    ORDER BY entry.started_at, entry.id
    FOR UPDATE OF entry
  LOOP
    PERFORM set_config('app.rerate_time_entry_id', v_entry_id::text, true);
    -- Supplies nothing: hourly_rate_cents is a watched column, so the
    -- classifier re-derives the row under the GUCs above.
    UPDATE public.project_time_entries AS entry
       SET hourly_rate_cents = entry.hourly_rate_cents
     WHERE entry.id = v_entry_id
       AND entry.rate_source = 'none'
       AND entry.invoice_id IS NULL
    RETURNING entry.rate_source INTO v_source;
    -- SQ-1079 F5: counted only if it moved off 'none'. A row the classifier
    -- declined is written unchanged and is not counted.
    IF v_source <> 'none' THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM set_config('app.rerate_time_entry_id', COALESCE(v_previous_entry, ''), true);
  PERFORM set_config('app.rerate_rate_id', COALESCE(v_previous_rate, ''), true);
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.rerate_time_entry_id', COALESCE(v_previous_entry, ''), true);
  PERFORM set_config('app.rerate_rate_id', COALESCE(v_previous_rate, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.rerate_pending_time_entries(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rerate_pending_time_entries(uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.rerate_pending_time_entries(uuid, integer) IS
  'K8 (00797, amends P-4): p_rate_id is the studio_member_rates row just saved '
  'and p_expected_rate_cents the hourly_rate_cents that save returned. An '
  'owner/admin of that row''s studio prices that member''s still-pending '
  '(rate_source = ''none''), never-invoiced hours on projects the studio prices: '
  'the started_at answer if the chain has one, else that row''s rate as '
  'studio_member. Eligibility is _k8_rate_row_refusal''s. Refused: an unknown '
  'id or another studio''s row (42501), a row with any later-dated successor '
  '(23514), a self-written row tier 2 ignores (42501), and a row whose rate is '
  'no longer p_expected_rate_cents (40001). Priced and invoiced hours are never '
  'changed. Each re-priced hour leaves one audit_logs trace (00605) with the '
  'caller as actor. Returns the number of hours this call moved off ''none''.';

-- ─── postconditions ────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_classifier text := pg_get_functiondef(
    'public.classify_project_time_entry_authority()'::regprocedure);
  v_rpc text := pg_get_functiondef(
    'public.rerate_pending_time_entries(uuid, integer)'::regprocedure);
  v_guard text := pg_get_functiondef(
    'public.guard_commercial_time_entry_derived_fields()'::regprocedure);
BEGIN
  ASSERT v_classifier ~ 'app\.rerate_time_entry_id'
     AND v_classifier ~ 'app\.rerate_rate_id'
     AND v_classifier ~ 'v_rate_source := ''studio_member''',
    '00797: the K8 carve-out is missing from the classifier';
  -- SQ-1079: one eligibility predicate, asked by both, copied by neither
  ASSERT v_classifier ~ '_k8_rate_row_refusal\(v_rerate_rate_id, auth\.uid\(\)\)'
     AND v_rpc ~ '_k8_rate_row_refusal\(p_rate_id, auth\.uid\(\)\)',
    '00797: the RPC and the classifier must both ask _k8_rate_row_refusal';
  ASSERT v_classifier !~ 'owner_seat' AND v_rpc !~ 'owner_seat'
     AND v_rpc !~ 'is_org_admin_or_owner' AND v_rpc !~ 'effective_to'
     AND v_classifier !~ 'is_org_admin_or_owner\(rate\.',
    '00797: a second copy of the K8 eligibility rules is back in the RPC or the classifier';
  ASSERT NOT has_function_privilege('authenticated',
    'public._k8_rate_row_refusal(uuid, uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon',
    'public._k8_rate_row_refusal(uuid, uuid)', 'EXECUTE'),
    '00797: _k8_rate_row_refusal is internal';
  -- SQ-1075: the carve-out prices at the saved row, never at a now() answer
  ASSERT v_classifier !~ 'resolve_time_rate_cents\([^)]*now\(\)',
    '00797: the K8 carve-out must not re-resolve the rate chain at now()';
  -- the 00618 properties the carve-out sits beside
  ASSERT v_classifier ~ 'time-entry authority and rate provenance are immutable'
     AND v_classifier ~ 'v_rate_source = ''none'' OR OLD\.rate_source IS NULL'
     AND v_classifier ~ 'a time entry is logged by the person who worked the hour',
    '00797: a 00618 classifier property was lost in the regraft';
  -- P-4's caller-facing refusal is untouched
  ASSERT v_guard ~ 'NEW\.rate_source IS DISTINCT FROM OLD\.rate_source'
     AND v_guard ~ 'NEW\.hourly_rate_cents IS DISTINCT FROM OLD\.hourly_rate_cents',
    '00797: aab_ no longer refuses caller-supplied rates';
  ASSERT NOT has_function_privilege('authenticated',
    'public.classify_project_time_entry_authority()', 'EXECUTE'),
    '00797: the classifier stays revoked from authenticated';
  ASSERT has_function_privilege('authenticated',
    'public.rerate_pending_time_entries(uuid, integer)', 'EXECUTE')
     AND NOT has_function_privilege('anon',
    'public.rerate_pending_time_entries(uuid, integer)', 'EXECUTE'),
    '00797: rerate_pending_time_entries must be granted to authenticated and not to anon';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND tgname = 'aac_classify_project_time_entry_authority_trg'),
    '00797: the classifier trigger is missing';
END
$postcondition$;

COMMIT;
