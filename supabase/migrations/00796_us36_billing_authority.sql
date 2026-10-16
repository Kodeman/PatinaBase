-- ═══════════════════════════════════════════════════════════════════════════
-- 00796 — US-36 R1 billing authority: Link a client (K5), studio at creation
--         (K9); K11 is delivered by creation-time stamping, with no code here
--
-- Number reserved in the US-36 execution contract (00796–00805). Additive: one
-- redefined body, three new functions, no table, policy or trigger change.
--
-- ── K5 (Kody 2026-10-16) — who may link a client to a project ───────────────
-- Lineage (set_document_client): 00225 → 00385 → 00387 → 00796. The 00387 body
-- is carried verbatim (SECURITY DEFINER, search_path, REVOKE/GRANT unchanged)
-- with one delta, on the PROJECT branch only:
--   · authority: the project's lead (projects.designer_id, today's rule) OR an
--     owner/admin of the project's studio (projects.studio_id), asked through
--     public.is_org_admin_or_owner (00484) — the helper the rate RPCs already
--     use. Everyone else keeps today's refusal, word for word. Proposals stay
--     owner-only: K5 names the project's studio and nothing else.
--   · 00385's relationship consistency is kept and asked of the PROJECT LEAD's
--     book. The designer_clients row is the lead's, so the client must be one
--     of the lead's clients whoever links it, and it is the lead's lead/proposal
--     row that becomes active. For the lead this is the same query as before.
--     An owner/admin picking a client who is only on her own book is refused,
--     with a message that names the lead's book.
-- public.can_link_document_client(p_project_id) is the same predicate as a
-- read, so the composer gates on the server's answer instead of guessing.
--   · SQ-1066 repair. set_project_studio_id (00563, NOT redefined, its authority
--     boundary kept) admits the UPDATE only while the lead holds an active
--     non-guest seat in the project's studio. Without that seat an owner/admin
--     passed K5 and then hit studio_id_not_designer_studio (F1). The setter now
--     refuses that case up front as 'set_document_client: lead_not_in_studio',
--     and public.document_client_link_hold(p_project_id) names why a caller may
--     not link: NULL (she may), 'not_permitted', or 'lead_not_in_studio'.
--     can_link_document_client is that function IS NULL. The setter reads
--     owner/admin standing only after it locks the caller's and the lead's
--     seats FOR SHARE (F3), so a demotion committed meanwhile is the one it reads.
--
-- ── K9 (Kody 2026-10-16) — studio picker at creation ───────────────────────
-- open_project_direct(text, uuid, integer, integer, date, uuid, uuid) is a NEW
-- overload: the 00331 body (00237 → 00331) verbatim plus p_studio_id, which is
-- written into the INSERT once the caller is shown to hold an active non-guest
-- seat in that active design_studio. The test is the same one 00563's direct
-- authenticated INSERT arm asks of a named studio, so the overload adds no
-- standing a designer lacks today. Otherwise it refuses with the stable prefix
-- 'open_project_direct: studio_not_member'. A NULL p_studio_id behaves as the
-- old signature. The overload has no parameter defaults on purpose: a call
-- that leaves out p_studio_id resolves only to the 6-argument function, and the
-- old signature is not touched.
-- set_project_studio_id (00563) is NOT redefined. It derives a studio only
-- when NEW.studio_id IS NULL, and a named studio skips that derivation, so a
-- designer with two studios is admitted once she names one. Without a named
-- studio she is still refused (studio_id_not_designer_studio), as today.
-- record_project_studio_id_named (00603) marks the value as named, so
-- set_project_studio_id_owned leaves it alone (HT-3-c arm (a)).
--
-- ── K11 (Kody 2026-10-16; narrowed by the orchestrator, pending Kody) ───────
-- No code. K11(a) "a solo owner may name her own studio" is met by stamping
-- at creation. Her one active non-guest seat is what 00563's discovery
-- stamps, and K9 lets a two-studio designer name one. Naming a studio on an
-- already-NULL legacy project stays closed by HT-3-g(3), because it is the
-- same data as W2-R11-01 form G
-- (time_rate_resolution_test.sql aj5). K11(b) needs no widening: the resolver
-- (00615 → 00618) ignores a self-authored rate only where its subject is not
-- the studio's OWNER, and studio_member_rates_admin_insert (00598) admits an
-- owner writing her own row. supabase/tests/billing/us36_billing_authority_test.sql
-- measures both, plus a two-designer studio whose owner is still refused the
-- self-stamp.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── K5 · set_document_client ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_document_client(
  p_engagement_kind text,
  p_target_id uuid,
  p_client_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer uuid := auth.uid();
  v_target_designer uuid;
  v_target_studio uuid;
  v_authorized boolean := false;
  v_current_designer_client_id uuid;
  v_proposal_status text;
  v_relationship public.designer_clients%ROWTYPE;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'set_document_client requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_engagement_kind NOT IN ('project', 'proposal') THEN
    RAISE EXCEPTION 'unknown engagement kind %', p_engagement_kind
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_engagement_kind = 'project' THEN
    SELECT designer_id, studio_id
    INTO v_target_designer, v_target_studio
    FROM public.projects
    WHERE id = p_target_id
    FOR UPDATE;
  ELSE
    -- Status and both identity legs share this one row lock. No sent/accepted
    -- proposal can be reassigned between the validation and protected update.
    SELECT designer_id, designer_client_id, status
    INTO v_target_designer, v_current_designer_client_id, v_proposal_status
    FROM public.proposals
    WHERE id = p_target_id
    FOR UPDATE;
  END IF;

  -- K5: the project's lead, or an owner/admin of the project's studio.
  IF FOUND THEN
    -- SQ-1066 F3: standing is read after the caller's and the lead's seats are
    -- share-locked, in 00563's membership order. 00563 re-checks only an
    -- active non-guest seat, never owner/admin, so a demotion committed while
    -- this call waits must be the one read below. Seats are taken before the
    -- trigger's role rows, the order a seat change takes them (00713's sync).
    IF p_engagement_kind = 'project' AND v_target_studio IS NOT NULL THEN
      PERFORM membership.id
      FROM public.organization_members AS membership
      WHERE membership.organization_id = v_target_studio
        AND membership.user_id = ANY(ARRAY[v_target_designer, v_designer]::uuid[])
      ORDER BY membership.user_id, membership.id
      FOR SHARE;
    END IF;

    v_authorized := v_target_designer IS NOT DISTINCT FROM v_designer
      OR (
        p_engagement_kind = 'project'
        AND v_target_studio IS NOT NULL
        AND public.is_org_admin_or_owner(v_target_studio)
      );
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'no % owned by you with id %', p_engagement_kind, p_target_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- SQ-1066 F1: 00563 admits this UPDATE only while the lead holds an active
  -- non-guest seat in the project's studio. Refuse here, in
  -- document_client_link_hold's word, before the trigger can.
  IF p_engagement_kind = 'project'
     AND v_target_studio IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.organization_members AS lead_membership
       WHERE lead_membership.organization_id = v_target_studio
         AND lead_membership.user_id = v_target_designer
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'set_document_client: lead_not_in_studio — the lead of project % holds no active seat in its studio', p_target_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF p_engagement_kind = 'proposal' AND v_proposal_status <> 'draft' THEN
    RAISE EXCEPTION 'proposal client identity may only change while draft'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The relationship is the lead's (v_target_designer). For a proposal, and for
  -- a lead linking her own project, that is the caller.
  IF p_client_id IS NOT NULL THEN
    SELECT relationship.*
    INTO v_relationship
    FROM public.designer_clients AS relationship
    WHERE relationship.designer_id = v_target_designer
      AND relationship.client_id = p_client_id
    ORDER BY
      COALESCE(relationship.id = v_current_designer_client_id, false) DESC,
      (relationship.status <> 'lead') DESC,
      relationship.updated_at DESC,
      relationship.created_at DESC,
      relationship.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      IF v_target_designer IS NOT DISTINCT FROM v_designer THEN
        RAISE EXCEPTION 'client % is not one of your clients', p_client_id
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RAISE EXCEPTION 'client % is not one of this project''s lead designer''s clients', p_client_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    v_relationship := NULL;
  END IF;

  IF p_engagement_kind = 'project' THEN
    PERFORM set_config('app.project_identity_id', p_target_id::text, true);
    UPDATE public.projects
    SET client_id = p_client_id, updated_at = now()
    WHERE id = p_target_id;
    PERFORM set_config('app.project_identity_id', '', true);
  ELSE
    PERFORM set_config('app.proposal_identity_id', p_target_id::text, true);
    UPDATE public.proposals
    SET client_id = p_client_id,
        designer_client_id = CASE
          WHEN p_client_id IS NULL THEN NULL
          ELSE v_relationship.id
        END,
        updated_at = now()
    WHERE id = p_target_id;
    PERFORM set_config('app.proposal_identity_id', '', true);
  END IF;

  IF p_client_id IS NOT NULL THEN
    IF p_engagement_kind = 'project'
       AND v_relationship.status IN ('lead', 'proposal')
    THEN
      UPDATE public.designer_clients
      SET status = 'active', updated_at = now()
      WHERE id = v_relationship.id;
    ELSIF p_engagement_kind = 'proposal'
          AND v_relationship.status = 'lead'
          AND NOT EXISTS (
            SELECT 1
            FROM public.designer_clients AS canonical
            WHERE canonical.designer_id = v_target_designer
              AND canonical.client_id = p_client_id
              AND canonical.id <> v_relationship.id
              AND canonical.status <> 'lead'
          )
    THEN
      UPDATE public.designer_clients
      SET status = 'proposal', updated_at = now()
      WHERE id = v_relationship.id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_document_client(text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_document_client(text, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.set_document_client(text, uuid, uuid) IS
  'Document attachment. A project''s client may be set by its lead or by an '
  'owner/admin of its studio (K5, 00796), standing read under a share lock on '
  'the caller''s and the lead''s seats; a proposal''s only by its owner. A '
  'project whose lead holds no active non-guest seat in its studio is refused '
  'up front as ''set_document_client: lead_not_in_studio''. The '
  'client must be on the lead''s designer_clients book. Proposal identity may '
  'change only while draft and only as matching client_id/designer_client_id '
  'legs under the same proposal row lock; exact app.project_identity_id/'
  'app.proposal_identity_id tokens authorize only the chosen document update.';

CREATE OR REPLACE FUNCTION public.document_client_link_hold(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN project.id IS NULL
      OR auth.uid() IS NULL
      OR NOT (
        project.designer_id IS NOT DISTINCT FROM auth.uid()
        OR (
          project.studio_id IS NOT NULL
          AND public.is_org_admin_or_owner(project.studio_id)
        )
      )
      THEN 'not_permitted'
    WHEN project.studio_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS lead_membership
        WHERE lead_membership.organization_id = project.studio_id
          AND lead_membership.user_id = project.designer_id
          AND lead_membership.status = 'active'
          AND lead_membership.role <> 'guest'
      )
      THEN 'lead_not_in_studio'
  END
  FROM (SELECT p_project_id AS id) AS requested
  LEFT JOIN public.projects AS project ON project.id = requested.id;
$$;

REVOKE ALL ON FUNCTION public.document_client_link_hold(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_client_link_hold(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.document_client_link_hold(uuid) IS
  'K5 (00796, SQ-1066): why the caller may not link a client to this project '
  'through set_document_client, or NULL when she may. ''not_permitted'': she is '
  'neither its lead nor an owner/admin of its studio, or the project is '
  'unknown. ''lead_not_in_studio'': she has that standing, but the lead holds '
  'no active non-guest seat in the project''s studio, so the setter refuses.';

CREATE OR REPLACE FUNCTION public.can_link_document_client(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.document_client_link_hold(p_project_id) IS NULL;
$$;

REVOKE ALL ON FUNCTION public.can_link_document_client(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_link_document_client(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.can_link_document_client(uuid) IS
  'K5 (00796): whether the caller may link a client to this project through '
  'set_document_client — document_client_link_hold(p_project_id) IS NULL, so '
  'it is false for an unknown project, for a caller who is neither its lead nor '
  'an owner/admin of its studio, and while its lead holds no active non-guest '
  'seat in that studio. Gating UI asks the server instead of guessing.';

-- ── K9 · open_project_direct with a chosen studio ──────────────────────────

CREATE OR REPLACE FUNCTION public.open_project_direct(
  p_title            text,
  p_client_id        uuid,
  p_budget_min_cents integer,
  p_budget_max_cents integer,
  p_start_date       date,
  p_id               uuid,
  p_studio_id        uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_designer uuid := auth.uid();
  v_id       uuid := coalesce(p_id, gen_random_uuid());
  v_title    text := btrim(coalesce(p_title, ''));
  v_existing projects;
begin
  if v_designer is null then
    raise exception 'open_project_direct requires an authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  if v_title = '' then
    raise exception 'a project title is required'
      using errcode = 'check_violation';
  end if;

  -- Sanity: a band whose floor is above its ceiling is a typo, not a band.
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'budget band minimum exceeds its maximum'
      using errcode = 'check_violation';
  end if;

  -- Retry guard: if the caller-supplied id already exists, this is the same
  -- act arriving twice — return the existing project (ours) instead of
  -- inserting a sibling. A foreign id is a privilege error, not a no-op.
  if p_id is not null then
    select * into v_existing from projects where id = p_id;
    if found then
      if v_existing.designer_id is distinct from v_designer then
        raise exception 'project % belongs to another designer', p_id
          using errcode = 'insufficient_privilege';
      end if;
      return v_existing.id;
    end if;
  end if;

  -- K9: the chosen studio must hold the caller in an active non-guest seat
  -- and be an active design_studio, the same test 00563 asks of a studio a
  -- direct INSERT names.
  if p_studio_id is not null and not exists (
       select 1
       from organization_members as membership
       join organizations as studio
         on studio.id = membership.organization_id
       where membership.organization_id = p_studio_id
         and membership.user_id = v_designer
         and membership.status = 'active'
         and membership.role <> 'guest'
         and studio.type = 'design_studio'
         and studio.status = 'active'
     ) then
    raise exception 'open_project_direct: studio_not_member — you do not hold a seat in studio %', p_studio_id
      using errcode = 'insufficient_privilege';
  end if;

  insert into projects (
    id, name, status, designer_id, client_id, created_by,
    proposal_id, start_date, budget_min, budget_max, studio_id
  )
  values (
    v_id, v_title, 'active', v_designer, p_client_id, v_designer,
    null, p_start_date, p_budget_min_cents, p_budget_max_cents, p_studio_id
  )
  on conflict (id) do nothing;

  -- Ensure + advance the relationship (00331 body, unchanged).
  if p_client_id is not null then
    update designer_clients dc
       set status     = 'active',
           updated_at = now()
     where dc.designer_id = v_designer
       and dc.client_id   = p_client_id
       and dc.status      = 'lead'
       and dc.id = (
             select dc3.id from designer_clients dc3
              where dc3.designer_id = v_designer
                and dc3.client_id   = p_client_id
                and dc3.status      = 'lead'
              order by dc3.created_at
              limit 1)
       and not exists (
             select 1 from designer_clients dc2
              where dc2.designer_id = v_designer
                and dc2.client_id   = p_client_id
                and dc2.id <> dc.id
                and dc2.status <> 'lead');

    if not found then
      insert into designer_clients (designer_id, client_id, source, status)
      values (v_designer, p_client_id, 'direct', 'active')
      on conflict (designer_id, client_id) where client_id is not null and status <> 'lead'
      do update
        set status     = 'active',
            updated_at = now()
        where designer_clients.status in ('proposal', 'prospect');
    end if;
  end if;

  return v_id;
end;
$$;

REVOKE ALL ON FUNCTION public.open_project_direct(text, uuid, integer, integer, date, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_project_direct(text, uuid, integer, integer, date, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.open_project_direct(text, uuid, integer, integer, date, uuid, uuid) IS
  'K9 (00796): open_project_direct with a chosen studio. The 00331 body plus '
  'p_studio_id, written into the INSERT once the caller holds an active non-guest '
  'seat in that active design_studio; otherwise refused with the prefix '
  '''open_project_direct: studio_not_member''. A NULL p_studio_id behaves as the '
  '6-argument signature, which is unchanged. No parameter defaults, so a call '
  'without p_studio_id never resolves here.';

COMMIT;
