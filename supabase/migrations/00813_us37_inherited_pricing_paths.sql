-- ═══════════════════════════════════════════════════════════════════════════
-- 00813 — US-37 inherited client / cross-org pricing paths (SQ-1174 + SQ-1199
-- repair of SQ-1195 R1–R3, D6)
--
-- Cost, markup, margin and the retail-vs-client differential never reach a
-- client. A person whose only relation to a job is client/homeowner is
-- denied, whatever unrelated orgs or studios they share with the lead. The
-- lead and the job's legitimate team keep every read and write they had.
-- Closes the three inherited paths Astra's SQ-1170 review of 00811 found
-- (F1, F2, F3-anon) on main ee38e7e82.
--
-- §1 F1. can_buy_for_project (00702) fell back, on a studio-less job
--    (projects.studio_id IS NULL), to is_studio_comember (00556): ANY shared
--    active non-guest organization. A homeowner who sits in some org with the
--    lead read the job's FFE trade cost and markup (00721
--    project_ffe_items_studio_rw), its release snapshots (00811
--    furnishing_authorization_items_studio_read), its pricing settings (00809
--    project_pricing_settings_team_select) and passed every FFE RPC gate
--    (00717 _ffe_require_studio_project).
--    The studio-less team is now the lead plus the lead's DESIGN-STUDIO
--    co-members (is_design_studio_comember, 00399), never the job's client:
--      · project_tenant_org (00624) already answers a studio-less job's
--        access gate with "a design studio the caller and the job's designer
--        both actively belong to"; design_studio is load-bearing there.
--      · a shared manufacturer, contractor or admin_team org is not the
--        lead's design team.
--      · projects.client_id is the only signed-in client relation a job has:
--        client_households hold studio_contacts cards, and project_parties
--        (client_rep included) do not log in (00212: v1 parties have no
--        login).
--    is_design_studio_comember is is_studio_comember plus
--    organization.type = 'design_studio', so this only narrows: nobody gains.
--    The studio branch is unchanged.
--    Two copies of the same predicate now ask can_buy_for_project instead of
--    restating it, so purchase-order money cannot keep the old fallback:
--      can_send_purchase_order (00690): purchase_orders_studio_read (00718)
--        and 12 more PO money policies (po_cost_lines, vendor_payments,
--        po_payments, ...), and 29 PO RPCs.
--      po_release_preview (00726): its inline copy of that predicate.
--    Callers of can_buy_for_project (latest body per object), all of them
--    project-team gates: 29 policies (FFE items/images/rooms/phases/
--    milestones/line groups/placements, pricing settings, release snapshots,
--    install, samples, submittals, vendor quotes, procurement drafts and
--    exceptions, studio purchases, outbound drafts, storage item images) and
--    27 functions (every FFE RPC through _ffe_require_studio_project, the
--    procurement/submittal/sample/install RPCs). The four client readers that
--    call it (get_client_project_selections/threshold 00807,
--    get_client_presentation_identity 00812) test client_id = actor first,
--    so the job's client keeps those curated readers.
--    Left as is: vendor_quote_requests_studio_rw's project-less ELSE (00725)
--    is a studio RFQ with no job and no client.
--
-- §2 F2. proposal_items_design_studio_select (00401) admitted any design-studio
--    co-member of the proposal's designer, so a co-member of an unrelated
--    studio read unit_price (trade), markup_percent and the retail snapshot of
--    another studio's proposal. It now also binds the proposal to its job:
--    the designer, or can_buy_for_project(project_id) for a proposal on a job,
--    or (no job) a seat in the studio the proposal was drafted in, never its
--    client. It keeps the 00401 predicate as a conjunct, so it only narrows.
--    SQ-1199 R2 (SQ-1195): "no job" first meant anyone but the client, which
--    left two ways in. A job-less proposal (design_services agreements drafted
--    from a client relationship, commercial documents bound through
--    project_commercial_documents) showed its lines to the designer's other
--    studios; and clone_proposal (00327) starts every copy with project_id
--    NULL while copying unit_price and markup_percent, so a co-member could
--    clone a job proposal whose lines can_buy_for_project hid from her and
--    read the copy. proposals.studio_id (new) records the studio, and a
--    signed-in caller cannot change it. SQ-1218 (R189, Astra SQ-1213 F2/F3):
--      · recorded authority, first answer wins: the job's studio, the job a
--        project_commercial_documents row binds the proposal to, the parent's
--        stamp. Nothing else.
--      · on insert, a proposal with no recorded authority is being drafted
--        now, so the drafter's present seats are its studio: the client
--        relationship's household studio, else her only design-studio seat,
--        else NULL (designer only).
--      · clone_proposal stamps the copy from its source.
--      · existing rows are backfilled ONCE, in the block that adds the
--        column, by recorded authority alone. A current seat says nothing
--        about whom a past proposal was drafted for, so an unbound historical
--        copy is NULL. A replay changes no stamp, NULL included.
--    Narrowing, measured on the fixture only: a lead in two design studios
--    with no household on the relationship now keeps a job-less proposal's
--    lines to herself (her teammates read its header, not its lines), and so
--    does every historical job-less proposal with no job binding or parent.
--    Parent proposals_design_studio_select (00401) has the same co-member
--    reach but its row carries no cost, markup or margin (subtotal, discount,
--    tax and total are the client-facing figures), so it is reported, not
--    changed. The proposal_items/proposals write policies are draft-only and
--    unchanged.
--
-- §3 F3 (anon). products_catalog_select_anon (00152) with a table-level
--    SELECT let the anon key read price_trade on every catalog row. Anon now
--    holds column SELECT on every products column except price_trade,
--    configuration_summary, pricing_tiers and commission_rate: the two JSON
--    columns carry trade figures inside them (SQ-1199 R3), commission_rate is
--    the designer's commission (SQ-1218, the oracle's SQ-1213 disposition),
--    and no anon reader names any of the four.
--    The public anon readers of products name their columns and none reads
--    a trade column: client-portal piece/[id] (PIECE_SELECT + vendors embed
--    via vendor_id/retailer_id), lib/aesthete/matches.ts, edge-api-worker
--    catalog.ts, iOS ProductAPIClient.productColumns (+ vendors embed), the
--    designer facets (category, brand) and autocomplete (name) routes. The
--    anon catalog RPCs (get_recommendations, get_aesthete_matches,
--    search_products) are SECURITY DEFINER. api/stories/today and
--    catalog-normalizer use the service role; aesthete-ask and the extension
--    require a signed-in caller. A bare anon `select=*` on products is now
--    42501 (column privileges). Six designer-portal GET routes issued one with
--    the cookie client and no auth check, so a cookie-less request ran as
--    anon (and read price_trade before this): catalog/products,
--    catalog/products/[id], catalog/collections/[id] and its /products
--    (product:products(*) embeds), search/search, search/search/similar.
--    Every consumer is a signed-in designer page, and the routes are
--    designer-private (R189): getAuthenticatedDesignerAdmin answers 401
--    without a session and 403 to a signed-in account with no designer or
--    admin role, and a designer keeps the shape.
--    Authenticated keeps its table-level SELECT (designers read trade):
--    splitting it per user needs a view or RPC and is a separate ticket (the
--    00152 policy admits every signed-in account; it predates US-37).
--    price_retail is unchanged (Kody's marketplace-retail ruling).
--    A future products column is not anon-readable until it is granted here.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated
-- (python3 scripts/generate-legacy-grants.py). CREATE OR REPLACE keeps each
-- function's signature and ACL; po_release_preview keeps its 00726 comment.
--
-- Lineage (redefined functions, each from its only/latest body):
--   can_buy_for_project      00702 → 00813 (one delta: the ELSE branch)
--   can_send_purchase_order  00690 → 00813 (body delegates to
--                            can_buy_for_project; studio branch identical)
--   po_release_preview       00726 → 00813 (one delta: the gate)
--   clone_proposal           00399 → 00813 (00399:6738-6913 verbatim; one
--                            delta: the copy's studio stamp)
-- New: proposals.studio_id (added and backfilled once, in one guarded block),
-- _proposal_recorded_studio, _proposal_studio_for, stamp_proposal_studio
-- (zzz_stamp_proposal_studio_trg), guard_proposal_studio_stamp
-- (guard_proposal_studio_stamp_trg). A later clone_proposal must graft from
-- this body.
-- Nothing here locks FFE rows, so R182 does not apply. No 00807/00808/00809
-- function is redefined.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. F1: the studio-less job's team is the lead's design studio ──────────

CREATE OR REPLACE FUNCTION public.can_buy_for_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects project
    WHERE project.id = p_project_id
      AND CASE
            WHEN project.studio_id IS NOT NULL THEN
              project.designer_id = (select auth.uid())
              OR public.is_active_org_member(project.studio_id)
            -- A studio-less job: the lead, or a design-studio co-member of
            -- the lead who is not the job's client (00813).
            ELSE
              project.designer_id = (select auth.uid())
              OR (
                public.is_design_studio_comember(project.designer_id)
                AND project.client_id IS DISTINCT FROM (select auth.uid())
              )
          END
  );
$$;

COMMENT ON FUNCTION public.can_buy_for_project(uuid) IS
  'The project-team authority (00702, 00813): the project owner, or an active non-guest member of '
  'projects.studio_id when set; on a studio-less job, the owner or an active non-guest co-member of one '
  'of the owner''s active design studios (is_design_studio_comember) who is not the job''s client. '
  'False for a missing project. can_send_purchase_order asks it for the PO''s project.';

CREATE OR REPLACE FUNCTION public.can_send_purchase_order(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = p_po_id
      AND public.can_buy_for_project(po.project_id)
  );
$$;

COMMENT ON FUNCTION public.can_send_purchase_order(uuid) IS
  'True when the caller may act on the purchase order''s project: can_buy_for_project(po.project_id) '
  '(00690 predicate, delegated in 00813 so the studio-less rule lives in one place). False for a '
  'missing PO, so callers keep the 404 idiom.';

CREATE OR REPLACE FUNCTION public.po_release_preview(
  p_project_id uuid,
  p_vendor_id uuid,
  p_total_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_studio  uuid;
  v_group   bigint;
  v_applies boolean;
  v_reason  text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  -- po_release_state's rule: can_send_purchase_order's predicate (00690,
  -- can_buy_for_project since 00813), read on the project the paper would
  -- belong to.
  IF NOT FOUND OR (auth.uid() IS NOT NULL
                   AND NOT COALESCE(public.can_buy_for_project(v_project.id), false)) THEN
    RETURN NULL;
  END IF;
  -- purchase_order_studio_id (00700), read on the project.
  v_studio := COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id));
  v_group := COALESCE(p_total_cents, 0) + public._release_gate_siblings_cents(p_project_id, p_vendor_id, NULL);
  v_applies := public._release_gate_applies(v_studio, LEAST(v_group, 2147483647)::integer);

  -- An unsaved paper is an unsent, unreleased draft: cleared only when the
  -- gate does not apply (_po_release_cleared_po).
  IF v_applies AND NOT public._release_gate_applies(v_studio, LEAST(COALESCE(p_total_cents, 0), 2147483647)::integer) THEN
    v_reason := 'group_over';
  END IF;

  RETURN jsonb_build_object(
    'applies', v_applies,
    'released', false,
    'cleared', NOT v_applies,
    'reason', v_reason,
    'group_total_cents', v_group,
    'threshold_cents', (SELECT o.release_threshold_cents FROM public.organizations AS o WHERE o.id = v_studio)
  );
END;
$$;

-- ── 2. F2: a proposal line belongs to its job's team, or its studio's ───────

-- 2a. The studio a proposal was drafted in (SQ-1199 R2). proposals carried no
-- studio, so a job-less proposal's lines fell to every design-studio
-- co-member of its designer: a lead in two studios showed one studio's
-- prices to the other. Two ways in: a pre-existing job-less proposal, and
-- clone_proposal, which starts every copy unlinked (00327 project_id NULL)
-- while copying unit_price and markup_percent, so a co-member could clone a
-- job proposal whose lines can_buy_for_project hid from her and read the copy.

-- The recorded authority (SQ-1218, R189): the studio a proposal's own records
-- name, first answer wins:
--   1. its job's studio (proposals.project_id → projects.studio_id);
--   2. the job a project_commercial_documents row binds it to: 00412's
--      furnishings authorizations (00412:1941–1979) carry project_id NULL and
--      record their job only there (proposal_id is UNIQUE, 00412:114);
--   3. its parent's stamp (parent_proposal_id; a revision points at its
--      chain root, 00327:653).
-- Otherwise NULL. A duplicate records no source (00327:674 and :687 leave
-- project_id and parent_proposal_id NULL) and no other clone lineage exists,
-- so an unbound copy answers NULL. Current membership and the client
-- relationship are never asked: they describe today, not the proposal.
-- plpgsql, not sql: the body names proposals.studio_id, which the guarded
-- block below adds on the first run only.
CREATE OR REPLACE FUNCTION public._proposal_recorded_studio(
  p_proposal_id uuid,
  p_project_id uuid,
  p_parent_proposal_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT project.studio_id
       FROM public.projects AS project
      WHERE project.id = p_project_id),
    (SELECT project.studio_id
       FROM public.project_commercial_documents AS binding
       JOIN public.projects AS project
         ON project.id = binding.project_id
      WHERE binding.proposal_id = p_proposal_id),
    (SELECT parent.studio_id
       FROM public.proposals AS parent
      WHERE parent.id = p_parent_proposal_id)
  );
END;
$$;

-- The insert rule (R189), first answer wins. A new proposal with no recorded
-- authority is being drafted now, so the drafter's present seats are its
-- studio; nothing about the past is inferred. Each answer names a studio the
-- designer is actually in, so a stamp never widens past 00401's co-member
-- reach:
--   1–3. the recorded authority above;
--   4. the studio holding the client relationship (designer_clients →
--      client_households.organization_id), when it is an active design studio
--      the designer holds an active non-guest seat in;
--   5. the designer's only active non-guest design-studio seat.
-- Otherwise NULL. Two seats and no household is not a guess: R178 answers an
-- ambiguous studio with nobody, and designer_tier_pricing_studio's employer
-- tier (an hours-pricing rule) would pick the non-owner seat, which is the
-- unrelated studio in exactly the case this closes.
CREATE OR REPLACE FUNCTION public._proposal_studio_for(
  p_proposal_id uuid,
  p_designer_id uuid,
  p_project_id uuid,
  p_parent_proposal_id uuid,
  p_designer_client_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    public._proposal_recorded_studio(
      p_proposal_id, p_project_id, p_parent_proposal_id
    ),
    (SELECT household.organization_id
       FROM public.designer_clients AS relationship
       JOIN public.client_households AS household
         ON household.id = relationship.household_id
       JOIN public.organizations AS studio
         ON studio.id = household.organization_id
       JOIN public.organization_members AS seat
         ON seat.organization_id = studio.id
      WHERE relationship.id = p_designer_client_id
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
        AND seat.user_id = p_designer_id
        AND seat.status = 'active'
        AND seat.role <> 'guest'
      LIMIT 1),
    (SELECT CASE WHEN count(DISTINCT studio.id) = 1
                 THEN (array_agg(DISTINCT studio.id))[1]
            END
       FROM public.organizations AS studio
       JOIN public.organization_members AS seat
         ON seat.organization_id = studio.id
      WHERE seat.user_id = p_designer_id
        AND seat.status = 'active'
        AND seat.role <> 'guest'
        AND studio.type = 'design_studio'
        AND studio.status = 'active')
  );
$$;

-- Trigger- and migration-only: a GRANT would answer any caller "which studio
-- is this job / this designer in".
REVOKE ALL ON FUNCTION public._proposal_recorded_studio(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._proposal_studio_for(uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Every new proposal is stamped by the insert rule; a value the caller names
-- is ignored. zzz_ runs it after every other BEFORE INSERT trigger, so it sees
-- the final designer, job, parent and relationship. SECURITY DEFINER because
-- an INVOKER read of organization_members returns a partial membership list.
CREATE OR REPLACE FUNCTION public.stamp_proposal_studio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.studio_id := public._proposal_studio_for(
    NEW.id, NEW.designer_id, NEW.project_id, NEW.parent_proposal_id,
    NEW.designer_client_id
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_proposal_studio()
  FROM PUBLIC, anon, authenticated, service_role;

-- A signed-in caller cannot move a proposal to another studio: a co-member
-- who may edit a draft would otherwise re-stamp it to the studio she shares
-- with its designer and read its lines. SECURITY INVOKER, because
-- current_user is how it tells a caller from database code (clone_proposal
-- and this migration run as postgres, and so does ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.guard_proposal_studio_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IS NOT DISTINCT FROM 'postgres' THEN RETURN NEW; END IF;
  IF NEW.studio_id IS DISTINCT FROM OLD.studio_id THEN
    RAISE EXCEPTION 'A proposal stays with the studio it was drafted in.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- SECURITY INVOKER, so nobody holds it (as 00615's rate guards).
REVOKE ALL ON FUNCTION public.guard_proposal_studio_stamp()
  FROM PUBLIC, anon, authenticated, service_role;

-- The column and its one backfill (SQ-1218, R189; Astra SQ-1213 F2/F3). The
-- backfill runs only inside the block that adds the column, so it stamps
-- only rows that predate the column, and by recorded authority alone. A
-- replay finds the column and returns before touching a row. Every stamp
-- stays as it is, NULL included: NULL is a decision (designer only), not a
-- gap. It runs before the triggers exist. A revision reads its parent's
-- stamp, so the pass repeats until the chains settle: roots first, then
-- their revisions. Each pass stamps only rows that are still NULL and have
-- a non-NULL answer, so the loop ends. Stamping is not an edit, so
-- updated_at stays where it was. No other trigger reads or guards studio_id.
DO $introduce$
DECLARE
  v_stamped integer;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
     WHERE attribute.attrelid = 'public.proposals'::regclass
       AND attribute.attname = 'studio_id'
       AND NOT attribute.attisdropped
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.proposals
    ADD COLUMN studio_id uuid
      REFERENCES public.organizations(id) ON DELETE SET NULL;

  ALTER TABLE public.proposals DISABLE TRIGGER update_proposals_updated_at;
  LOOP
    UPDATE public.proposals AS proposal
       SET studio_id = recorded.studio_id
      FROM (
        SELECT unstamped.id,
               public._proposal_recorded_studio(
                 unstamped.id, unstamped.project_id, unstamped.parent_proposal_id
               ) AS studio_id
          FROM public.proposals AS unstamped
         WHERE unstamped.studio_id IS NULL
      ) AS recorded
     WHERE proposal.id = recorded.id
       AND recorded.studio_id IS NOT NULL;
    GET DIAGNOSTICS v_stamped = ROW_COUNT;
    EXIT WHEN v_stamped = 0;
  END LOOP;
  ALTER TABLE public.proposals ENABLE TRIGGER update_proposals_updated_at;
END;
$introduce$;

COMMENT ON COLUMN public.proposals.studio_id IS
  'US-37 D6 (00813, R189): the design studio whose team reads this '
  'proposal''s lines while it has no job. The database writes it: '
  'stamp_proposal_studio on insert, clone_proposal from the source, and a '
  'one-time backfill by recorded authority (job, commercial-document '
  'binding, parent). A caller never sets or changes it. NULL means only the '
  'proposal''s designer reads the lines of a job-less proposal.';

DROP TRIGGER IF EXISTS zzz_stamp_proposal_studio_trg ON public.proposals;
CREATE TRIGGER zzz_stamp_proposal_studio_trg
  BEFORE INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.stamp_proposal_studio();

DROP TRIGGER IF EXISTS guard_proposal_studio_stamp_trg ON public.proposals;
CREATE TRIGGER guard_proposal_studio_stamp_trg
  BEFORE UPDATE OF studio_id ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_studio_stamp();

-- 2b. clone_proposal (00399:6738-6913, its latest body, re-grafted verbatim):
-- one delta after the target-draft check, which stamps the copy with the
-- source's studio: the source job's studio, else the source's own stamp. The
-- copy's lines then read exactly as far as the source's job team, or its
-- studio; a NULL stamp leaves them to the designer.
CREATE OR REPLACE FUNCTION public.clone_proposal(
  p_source_id uuid,
  p_mode text DEFAULT 'revision',
  p_revision_summary text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_source public.proposals%ROWTYPE;
  v_target public.proposals%ROWTYPE;
  v_new_id uuid;
  v_new_phase_id uuid;
  v_phase_map jsonb := '{}'::jsonb;
  v_phase record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'clone_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_mode NOT IN ('revision', 'duplicate') THEN
    RAISE EXCEPTION
      'clone_proposal: invalid mode %, expected revision|duplicate', p_mode
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_source
  FROM public.proposals
  WHERE id = p_source_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_source.designer_id) THEN
    RAISE EXCEPTION
      'clone_proposal: proposal % not found or access denied', p_source_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_source_id
  ORDER BY phase.id
  FOR UPDATE;
  PERFORM public._assert_proposal_phase_topology(
    p_source_id, 'clone_proposal source'
  );

  v_new_id := public._clone_proposal_legacy_00399(
    p_source_id, p_mode, p_revision_summary
  );

  SELECT * INTO STRICT v_target
  FROM public.proposals
  WHERE id = v_new_id
  FOR UPDATE;
  IF v_target.status <> 'draft'
     OR v_target.designer_id IS DISTINCT FROM v_source.designer_id
  THEN
    RAISE EXCEPTION 'clone_proposal produced an invalid target draft'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00813 (US-37 D6): the copy starts with no job (a duplicate with no
  -- parent either), so its insert stamp did not know the source. It stays
  -- with the source's studio: the source job's studio, else the source's
  -- own stamp; NULL leaves the copy's lines to its designer.
  UPDATE public.proposals AS target
     SET studio_id = COALESCE(
           (SELECT project.studio_id
              FROM public.projects AS project
             WHERE project.id = v_source.project_id),
           v_source.studio_id
         )
   WHERE target.id = v_new_id;

  -- The frozen implementation created pre-linkage phase rows and copied their
  -- dependent deliverables/gates/payment milestones. Remove only that target
  -- schedule material, then rebuild it from the locked source with every
  -- current chain field. Other deep-copy children remain exactly as 00327.
  DELETE FROM public.proposal_schedule_milestones AS milestone
  USING public.proposal_phases AS phase
  WHERE milestone.phase_id = phase.id
    AND phase.proposal_id = v_new_id;
  DELETE FROM public.proposal_payment_milestones
  WHERE proposal_id = v_new_id;
  DELETE FROM public.proposal_phases
  WHERE proposal_id = v_new_id;

  FOR v_phase IN
    SELECT *
    FROM public.proposal_phases
    WHERE proposal_id = p_source_id
    ORDER BY sort_order, id
  LOOP
    INSERT INTO public.proposal_phases (
      proposal_id, name, phase_key, duration_weeks, duration_days,
      fee_cents, revision_limit, gate_condition, deliverables,
      sort_order, follows_phase_id, anchor_date, lane
    ) VALUES (
      v_new_id, v_phase.name, v_phase.phase_key, v_phase.duration_weeks,
      v_phase.duration_days, v_phase.fee_cents, v_phase.revision_limit,
      v_phase.gate_condition, v_phase.deliverables, v_phase.sort_order,
      NULL, v_phase.anchor_date, v_phase.lane
    )
    RETURNING id INTO v_new_phase_id;
    v_phase_map := v_phase_map || jsonb_build_object(
      v_phase.id::text, v_new_phase_id::text
    );
  END LOOP;

  FOR v_phase IN
    SELECT id, follows_phase_id
    FROM public.proposal_phases
    WHERE proposal_id = p_source_id
    ORDER BY sort_order, id
  LOOP
    UPDATE public.proposal_phases
    SET follows_phase_id = CASE
      WHEN v_phase.follows_phase_id IS NULL THEN NULL
      ELSE (v_phase_map ->> v_phase.follows_phase_id::text)::uuid
    END
    WHERE id = (v_phase_map ->> v_phase.id::text)::uuid;
  END LOOP;

  INSERT INTO public.proposal_phase_deliverables (
    phase_id, label, description, is_required,
    completed_at, completed_by, sort_order
  )
  SELECT
    (v_phase_map ->> deliverable.phase_id::text)::uuid,
    deliverable.label, deliverable.description, deliverable.is_required,
    NULL, NULL, deliverable.sort_order
  FROM public.proposal_phase_deliverables AS deliverable
  JOIN public.proposal_phases AS phase ON phase.id = deliverable.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? deliverable.phase_id::text;

  INSERT INTO public.proposal_phase_gates (
    phase_id, gate_kind, payload, satisfied_at, satisfied_by,
    override_reason, sort_order
  )
  SELECT
    (v_phase_map ->> gate.phase_id::text)::uuid,
    gate.gate_kind, gate.payload, NULL, NULL, NULL, gate.sort_order
  FROM public.proposal_phase_gates AS gate
  JOIN public.proposal_phases AS phase ON phase.id = gate.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? gate.phase_id::text;

  INSERT INTO public.proposal_payment_milestones (
    proposal_id, phase_id, label, percentage, amount_cents,
    trigger_condition, sort_order
  )
  SELECT
    v_new_id,
    CASE
      WHEN milestone.phase_id IS NULL THEN NULL
      ELSE (v_phase_map ->> milestone.phase_id::text)::uuid
    END,
    milestone.label, milestone.percentage, milestone.amount_cents,
    milestone.trigger_condition, milestone.sort_order
  FROM public.proposal_payment_milestones AS milestone
  WHERE milestone.proposal_id = p_source_id;

  INSERT INTO public.proposal_schedule_milestones (
    phase_id, name, kind, anchor_date, sort_order
  )
  SELECT
    (v_phase_map ->> milestone.phase_id::text)::uuid,
    milestone.name, milestone.kind, milestone.anchor_date,
    milestone.sort_order
  FROM public.proposal_schedule_milestones AS milestone
  JOIN public.proposal_phases AS phase ON phase.id = milestone.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? milestone.phase_id::text;

  PERFORM public._assert_proposal_phase_topology(
    v_new_id, 'clone_proposal target'
  );
  PERFORM public._recompute_proposal_total_locked(v_new_id);
  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_proposal(uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.clone_proposal(uuid, text, text)
  TO authenticated;

-- 2c. The read policy. Keeps 00401's co-member predicate and SQ-1174's job
-- binding as conjuncts; a job-less proposal now also needs a stamp and an
-- active seat in that studio, so this only narrows.
DROP POLICY IF EXISTS proposal_items_design_studio_select ON public.proposal_items;
CREATE POLICY proposal_items_design_studio_select
ON public.proposal_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_items.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
      AND (
        proposal.designer_id = (SELECT auth.uid())
        OR CASE
             WHEN proposal.project_id IS NOT NULL THEN
               public.can_buy_for_project(proposal.project_id)
             ELSE proposal.client_id IS DISTINCT FROM (SELECT auth.uid())
               AND proposal.studio_id IS NOT NULL
               AND public.is_active_org_member(proposal.studio_id)
           END
      )
  )
);

-- ── 3. F3: anon reads the catalog, never its trade price ───────────────────
-- Column privileges only bite once the table-level SELECT is gone; revoking
-- it also revokes every column grant, so the list is the whole anon surface.
-- Withheld: price_trade, and the two JSON columns that carry trade figures
-- inside them (configuration_summary from the 00413 writer, pricing_tiers).
-- No anon reader names either; the 00413 writer is unchanged. Also withheld
-- (SQ-1218): commission_rate, the designer's commission. A repo grep found no
-- anon or public reader naming it. Its readers are the designer portal's
-- catalog product route and piece room (signed in), the admin portal
-- (service role) and the direct-order RPCs (SECURITY DEFINER).
-- v_aesthete_catalog_input (00239) selects it with its owner's rights, so this
-- grant neither feeds nor breaks it.

REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  aesthete_model_version, aesthete_vector, aesthete_vector_at,
  available_colors, brand, capture_provenance, capture_source, captured_at,
  captured_by, catalog_equivalent_id, category, colors,
  configuration_mode, configuration_pricing_strategy, configuration_revision,
  configuration_updated_at, created_at, deleted_at,
  description, dimensions, embedding, embedding_updated_at, field_capture_id,
  finish, finishes, freight_class, id, images, layer, lead_time_weeks,
  material_tags, materials, merged_into_id, name, owner_user_id,
  patina_managed, payment_terms, photo_verified_at, price_retail,
  promoted_at, promoted_by, promoted_from_id, published_at,
  quality_score, retailer_id, search_vector, seo_description, seo_title,
  shipping_flat_cents, short_description, sku, slug, source_url, status,
  studio_id, style_caption, style_tags, subcategory, tags, updated_at,
  usage_notes, vendor_contact, vendor_id, vendor_sku
) ON public.products TO anon;

-- Fail the migration, not a page, if the column list drifts from the table.
DO $assert$
DECLARE
  v_missing text[];
BEGIN
  IF has_table_privilege('anon', 'public.products', 'SELECT') THEN
    RAISE EXCEPTION '00813: anon still holds table-level SELECT on public.products';
  END IF;
  SELECT array_agg(trade_column ORDER BY trade_column)
    INTO v_missing
    FROM unnest(ARRAY['commission_rate', 'configuration_summary', 'price_trade', 'pricing_tiers'])
         AS trade_column
   WHERE has_column_privilege('anon', 'public.products', trade_column, 'SELECT');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '00813: anon can still read trade columns %', v_missing;
  END IF;
  SELECT array_agg(attribute.attname::text ORDER BY attribute.attnum)
    INTO v_missing
    FROM pg_catalog.pg_attribute AS attribute
   WHERE attribute.attrelid = 'public.products'::regclass
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
     AND attribute.attname NOT IN
         ('commission_rate', 'configuration_summary', 'price_trade', 'pricing_tiers')
     AND NOT has_column_privilege('anon', 'public.products', attribute.attnum, 'SELECT');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '00813: anon lost SELECT on public.products columns %', v_missing;
  END IF;
END;
$assert$;
