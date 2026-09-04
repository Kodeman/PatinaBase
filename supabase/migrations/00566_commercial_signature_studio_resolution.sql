-- ═══════════════════════════════════════════════════════════════════════════
-- 00566 — A commercial signature resolves a studio, it does not count them
--
-- Lineage:
--   guard_commercial_signature_insert ............... 00462 → 00511 → 00566
--   _countersign_design_services_agreement_impl ..... 00425 → 00475 → 00511
--                                                     → 00566
--   The rule being followed .......................... 00563
--
-- THE DEFECT (confirmed on Strata, read-only).
-- A designer who is an active non-guest member of TWO design_studio orgs has a
-- client who cannot have a paper signature recorded on an ORIGIN (project_id
-- NULL) design-services agreement. guard_commercial_signature_insert's
-- v_unique_origin_actor leg asks `1 = count(DISTINCT studio.id)` over the
-- studios the lead designer and the recording actor share. Two studios makes
-- that false, v_exact_project_actor is also false (an origin agreement has no
-- project_commercial_documents row yet), and the guard raises
--   'commercial signature does not match canonical signer/state/evidence'
--   ERRCODE check_violation
-- from record_paper_client_signature. The same predicate sits on the guard's
-- party_role='studio' leg, so the countersign is refused for the same reason,
-- and _countersign_design_services_agreement_impl repeats it twice more in its
-- own origin branch.
--
-- THE FIX. 00563 already settled the rule for the sibling defect (L07-01, the
-- project studio stamp): resolve the studio from the proposal's own
-- designer-client relationship rather than refusing plurality. This migration
-- applies that rule to the signature rail.
--
--   · The two authority legs — the guard's v_unique_origin_actor and the
--     countersign's access check — become EXISTS over the identical join.
--     They were never selecting a studio; they were asking whether the actor
--     shares a live studio with the lead. Cardinality was never the question.
--   · The countersign's origin branch, which DOES select a studio, adopts
--     00563's resolution WHOLE — candidate set and order both. It resolves
--     over the LEAD designer's own active studios, not the lead-and-actor
--     intersection, ordered: a studio already hosting a project for this
--     exact (designer_id, client_id) pair first, then owner-role, earliest
--     joined, organization id last. Anything narrower binds a studio the
--     project insert's set_project_studio_id — which sees only the lead's
--     studios — would not stamp, and a lead in studios A+B countersigned by a
--     co-member of B alone died in the trigger's opaque
--     'studio_id_not_designer_studio'. The countersigner's own standing in
--     the resolved studio is then asserted in this function's own
--     access-denied words.
--   · The countersign's late `1 <> count(...)` over the LEAD's own studios
--     becomes NOT EXISTS: the lead must still hold a live studio; holding two
--     is not a refusal.
--
-- BLAST RADIUS. No predicate is relaxed beyond plurality. Zero shared studios
-- still fails closed in both functions. Every membership/status/role/domain
-- test, the fingerprint and capability checks, the via/document_kind matrix,
-- the paper-metadata requirements, the FOR SHARE/FOR UPDATE lock order and
-- every downstream effect are byte-identical to the 00511 bodies grafted here.
--
-- GRANTS. None added. CREATE OR REPLACE preserves both ACLs; the DO block at
-- the foot ASSERTS the locked-down state 00462/00511 left rather than
-- re-granting it, so supabase/seed/00-legacy-grants.sql needs no regeneration.
--
-- No schema change. Trigger functions and private impls are not emitted into
-- packages/supabase/src/database.types.ts, so generated types do not move.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('public.guard_commercial_signature_insert()') IS NULL THEN
    RAISE EXCEPTION '00566 requires public.guard_commercial_signature_insert() (00462/00511)';
  END IF;
  IF to_regprocedure(
       'public._countersign_design_services_agreement_impl(uuid,text,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION '00566 requires public._countersign_design_services_agreement_impl(uuid,text,jsonb) (00475/00511)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.commercial_document_signatures'::regclass
      AND tgname = 'a_guard_commercial_signature_insert_trg'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '00566 requires the a_guard_commercial_signature_insert_trg trigger';
  END IF;
END
$preflight$;

-- ── (1) The insert guard ────────────────────────────────────────────────────
-- Grafted verbatim from 00511:2037-2244, one predicate changed.
CREATE OR REPLACE FUNCTION public.guard_commercial_signature_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_via text := COALESCE(NEW.metadata->>'via', '');
  v_expected_capability text;
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_exact_project_actor boolean := false;
  v_unique_origin_actor boolean := false;
  v_postgres_migration boolean :=
    session_user = 'postgres' AND v_active_role IN ('none', 'postgres');
BEGIN
  -- An invoker trigger sees postgres only while a reviewed owner core is active.
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      'commercial signatures are inserted only by canonical signing RPCs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_postgres_migration THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = NEW.proposal_id;

  IF FOUND AND v_active_role = 'authenticated' AND auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.project_commercial_documents AS document
      JOIN public.projects AS project ON project.id = document.project_id
      JOIN public.organizations AS studio ON studio.id = project.studio_id
      JOIN public.organization_members AS actor_membership
        ON actor_membership.organization_id = project.studio_id
       AND actor_membership.user_id = auth.uid()
      JOIN public.organization_members AS lead_membership
        ON lead_membership.organization_id = project.studio_id
       AND lead_membership.user_id = project.designer_id
      JOIN public.user_roles AS user_role
        ON user_role.user_id = project.designer_id
      JOIN public.roles AS role ON role.id = user_role.role_id
      WHERE document.proposal_id = v_proposal.id
        AND document.document_kind = v_proposal.document_kind
        AND (
          v_proposal.project_id IS NULL
          OR v_proposal.project_id = project.id
        )
        AND project.client_id = v_proposal.client_id
        AND project.status = 'active'
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
        AND lead_membership.status = 'active'
        AND lead_membership.role <> 'guest'
        AND role.domain = 'designer'
    ) INTO v_exact_project_actor;

    SELECT v_proposal.document_kind = 'design_services'
       AND v_proposal.project_id IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.project_commercial_documents AS document
         WHERE document.proposal_id = v_proposal.id
       )
       AND EXISTS (
         SELECT 1
         FROM public.user_roles AS user_role
         JOIN public.roles AS role ON role.id = user_role.role_id
         WHERE user_role.user_id = v_proposal.designer_id
           AND role.domain = 'designer'
       )
       -- 00566. Was `1 = count(DISTINCT studio.id)`: a lead designer and an
       -- actor who shared TWO active studios failed this leg, and a paper
       -- client signature on an origin agreement was refused outright. The
       -- authority question here is shared membership, not its cardinality.
       AND EXISTS (
         SELECT 1
         FROM public.organizations AS studio
         JOIN public.organization_members AS lead_membership
           ON lead_membership.organization_id = studio.id
          AND lead_membership.user_id = v_proposal.designer_id
         JOIN public.organization_members AS actor_membership
           ON actor_membership.organization_id = studio.id
          AND actor_membership.user_id = auth.uid()
         WHERE studio.type = 'design_studio'
           AND studio.status = 'active'
           AND lead_membership.status = 'active'
           AND lead_membership.role <> 'guest'
           AND actor_membership.status = 'active'
           AND actor_membership.role <> 'guest'
       )
    INTO v_unique_origin_actor;
  END IF;
  v_expected_capability := format(
    'commercial_signature:%s:%s:%s',
    NEW.proposal_id, v_via, pg_catalog.txid_current()
  );

  IF NOT FOUND
     OR NEW.party_role NOT IN ('client', 'studio')
     OR current_setting('app.commercial_signature_capability', true)
          IS DISTINCT FROM v_expected_capability
     OR NEW.evidence_fingerprint IS DISTINCT FROM
          public._commercial_document_fingerprint(NEW.proposal_id)
     OR (
       NEW.party_role = 'client'
       AND (
         v_proposal.client_id IS NULL
         OR NEW.signer_user_id IS DISTINCT FROM v_proposal.client_id
         OR v_proposal.commercial_state <> 'sent'
         OR v_via NOT IN (
           'sign_design_services_agreement',
           'record_paper_client_signature',
           'execute_furnishings_authorization',
           'execute_furnishings_authorization_on_paper',
           'execute_trade_scope',
           'execute_trade_scope_on_paper'
         )
         OR NOT (
           (
             v_via IN (
               'sign_design_services_agreement',
               'record_paper_client_signature'
             )
             AND v_proposal.document_kind IN (
               'design_services', 'service_addendum'
             )
           )
           OR (
             v_via IN (
               'execute_furnishings_authorization',
               'execute_furnishings_authorization_on_paper'
             )
             AND v_proposal.document_kind = 'furnishings_authorization'
           )
           OR (
             v_via IN (
               'execute_trade_scope', 'execute_trade_scope_on_paper'
             )
             AND v_proposal.document_kind = 'trade_scope'
           )
         )
         OR (
           v_via IN (
             'sign_design_services_agreement',
             'execute_furnishings_authorization',
             'execute_trade_scope'
           )
           AND NOT (
             (
               v_active_role = 'authenticated'
               AND auth.uid() IS NOT NULL
               AND auth.uid() IS NOT DISTINCT FROM NEW.signer_user_id
             )
             OR (
               v_active_role = 'service_role'
               AND NEW.signer_user_id IS NOT DISTINCT FROM
                     v_proposal.client_id
             )
           )
         )
         OR (
           v_via IN (
             'record_paper_client_signature',
             'execute_furnishings_authorization_on_paper',
             'execute_trade_scope_on_paper'
           )
           AND (
             v_active_role <> 'authenticated'
             OR auth.uid() IS NULL
             OR NOT (
               v_exact_project_actor
               OR (
                 v_via = 'record_paper_client_signature'
                 AND v_unique_origin_actor
               )
             )
             OR NEW.signed_ip IS NOT NULL
             OR COALESCE(
                  (NEW.metadata->>'executedOnPaper')::boolean, false
                ) IS NOT TRUE
             OR NEW.metadata->>'recordedBy'
                  IS DISTINCT FROM auth.uid()::text
             OR NULLIF(NEW.metadata->>'paperSignedOn', '') IS NULL
           )
         )
       )
     )
     OR (
       NEW.party_role = 'studio'
       AND (
         v_active_role <> 'authenticated'
         OR v_proposal.commercial_state <> 'client_signed'
         OR NOT (v_exact_project_actor OR v_unique_origin_actor)
         OR NEW.signer_user_id IS DISTINCT FROM auth.uid()
         OR v_via <> 'countersign_design_services_agreement'
       )
     )
  THEN
    RAISE EXCEPTION
      'commercial signature does not match canonical signer/state/evidence'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ── (2) The countersign core ───────────────────────────────────────────────
-- Grafted verbatim from 00511:4106-4627, three predicates changed.
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
        IF v_authorized_cents + v_pending_entry.rated_amount_cents
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

COMMENT ON FUNCTION public._countersign_design_services_agreement_impl(
  uuid, text, jsonb
) IS
  'Owner-only countersign core. It preserves immutable proposal authorship, binds addenda to their exact active project/studio/current live designer lead, and resolves an unbound origin agreement over the LEAD designer''s own active studios in set_project_studio_id''s order — a studio already hosting a project for that designer-client pair, then owner-role, earliest joined, organization id (00566, following 00563) — so the studio bound here is the studio the project insert stamps; the countersigner must actively, non-guest hold that resolved studio or the countersign is refused, and zero shared studios still fails closed. Any retainer is issued through the explicit-actor relational core using the locked current project lead without rewriting JWT claims.';

-- Grant hygiene, asserted rather than re-granted, so this migration adds no
-- GRANT/REVOKE and supabase/seed/00-legacy-grants.sql needs no regen. 00462
-- revoked the trigger function from everyone (a trigger function needs no
-- EXECUTE at fire time) and 00511 did the same for the countersign impl, whose
-- only door is the public countersign_design_services_agreement wrapper.
DO $acl$
DECLARE
  v_holders text;
BEGIN
  SELECT string_agg(format('%s on %s', h.role_name, h.fn), ', ' ORDER BY h.fn, h.role_name)
  INTO v_holders
  FROM (
    SELECT r AS role_name, f AS fn
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r
    CROSS JOIN unnest(ARRAY[
      'public.guard_commercial_signature_insert()',
      'public._countersign_design_services_agreement_impl(uuid,text,jsonb)'
    ]) AS f
    WHERE to_regrole(r) IS NOT NULL
      AND has_function_privilege(r, f, 'EXECUTE')
  ) AS h;

  IF v_holders IS NOT NULL THEN
    RAISE EXCEPTION
      '00566: these functions must hold no EXECUTE for app roles (00462/00511 revoked it); found: %',
      v_holders;
  END IF;
END
$acl$;

COMMIT;
