-- ═══════════════════════════════════════════════════════════════════════════
-- 00414 — Design-services rail completion: origin authority, send seams,
--          ledger write guards, and client read hygiene
--
-- 00412 built the commercial rail beside the legacy proposal lifecycle. This
-- migration closes the gaps that rail left open:
--   · Discovery seeds a design-services edition, not a legacy draft, and a
--     superseded seed no longer traps the engagement.
--   · A furnishing wave gets a first-class authoring vehicle instead of a
--     hand-made project-bound legacy draft; send_proposal refuses both
--     commercial editions and those internal vehicles.
--   · Executed design-services origin is re-asserted at every authority act
--     (wave execution, checkpoint publication), not only at wave creation.
--   · The commercial ledgers (project_commercial_documents,
--     project_billing_authorities) become RPC-write-only at the table edge.
--   · Client reads stop raising on legacy editions (retired marker instead),
--     stop carrying identity/rationale columns, and lose signed_ip entirely.
--   · The client signing IP stops being mirrored onto public.proposals by the
--     COMMERCIAL rails. commercial_document_signatures is the evidence of
--     record and its signed_ip column is un-granted below; proposals is fully
--     SELECT-granted and studio-row-visible, so the mirror defeated the grant.
--     The legacy sign rail (00400/00254) is grandfathered and untouched.
--   · commercial_state loses the never-written 'expired' value; expiry stays
--     lazily evaluated at sign/execute time.
--
-- Current-body lineage grafted here (grep-verified heads, bodies verbatim
-- except the stated delta):
--   begin_direction_from_discovery: 00224 → 00327
--   send_proposal (7-arg public wrapper): 00176 → 00384 → 00387 → 00388 → 00390
--     (the private _send_proposal_with_dispatch body is NOT touched)
--   list_client_proposals: 00390 (sole definition)
--   publish_budget_checkpoint, _execute_furnishings_authorization_authorized,
--     get_client_commercial_document_bundle, get_project_working_budget,
--     countersign_design_services_agreement, guard_budget_immutability: 00412
--     (sole definitions)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Vocabulary: 'expired' was never written; expiry is evaluated lazily ────
-- sign/execute already reject a past valid_until. Keeping a state nothing can
-- reach invites a second, drifting notion of expiry.

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_commercial_state_check,
  ADD CONSTRAINT proposals_commercial_state_check CHECK (
    commercial_state IS NULL OR commercial_state IN (
      'draft', 'sent', 'client_signed', 'executed', 'declined', 'superseded'
    )
  );

-- ── Discovery seeds a design-services edition ─────────────────────────────
-- 00327 body VERBATIM except: (a) the proposals INSERT stamps
-- document_kind/commercial_state, and (b) a seeded draft retired by the
-- commercial cutover is no longer returned — the act mints a fresh draft and
-- re-stamps the discovery row onto it. Every other side effect (five-essentials
-- gate, scope-room loop, vision section, discovery stamp) is unchanged.

create or replace function public.begin_direction_from_discovery(p_designer_client_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_disc client_discovery%rowtype;
  v_dc   designer_clients%rowtype;
  v_prop uuid;
  v_room jsonb;
  v_sort int := 0;
  v_seeded_state text;
  v_seeded_found boolean := false;
begin
  -- RLS-filtered read: a designer can only touch their own engagement.
  select * into v_disc from client_discovery where designer_client_id = p_designer_client_id;
  if not found then
    raise exception 'discovery not found or access denied for %', p_designer_client_id;
  end if;

  -- Idempotency: already seeded → return the existing draft. 00414: unless the
  -- commercial cutover retired it. A superseded edition is terminal — nothing
  -- can send, sign, or activate it — so returning it would strand the
  -- engagement on a dead document. Fall through and mint a fresh one instead.
  -- (The read is RLS-filtered like every other read here; an invisible seed
  --  keeps the pre-00414 answer.)
  if v_disc.seeded_proposal_id is not null then
    select seed.commercial_state into v_seeded_state
    from proposals as seed where seed.id = v_disc.seeded_proposal_id;
    v_seeded_found := found;
    if not v_seeded_found or v_seeded_state is distinct from 'superseded' then
      return v_disc.seeded_proposal_id;
    end if;
  end if;

  -- The soft gate, server-enforced for the seed: the five essentials must be filled.
  if v_disc.project_type is null
     or jsonb_array_length(coalesce(v_disc.rooms, '[]'::jsonb)) = 0
     or v_disc.budget_max_cents is null
     or (v_disc.target_date is null and v_disc.hard_date is null)
     or (coalesce(array_length(v_disc.style_tag_ids, 1), 0) = 0
         and coalesce(array_length(v_disc.style_keywords, 1), 0) = 0)
     or jsonb_array_length(coalesce(v_disc.lifestyle, '[]'::jsonb)) = 0
  then
    raise exception 'discovery not ready: the five essentials must be captured';
  end if;

  select * into v_dc from designer_clients where id = p_designer_client_id;

  -- 1) The DRAFT proposal (the Shape D→B flip). Mirrors useCreateProposal's
  --    minimal insert (use-proposals.ts). version/total_amount take defaults.
  --    Arrival Arc (I62): also stamp the household link so Shape B can rescue a
  --    no-login household's name post-flip. 00414: the seed is a design-services
  --    edition from birth, so the whole engagement rides the commercial rail
  --    (send_commercial_document, the two-act signature, billing authority)
  --    instead of the legacy accept-then-activate path.
  insert into proposals (
    designer_id, client_id, designer_client_id, title, status, description,
    document_kind, commercial_state
  )
  values (
    v_dc.designer_id,
    v_dc.client_id,
    p_designer_client_id,
    coalesce(nullif(v_dc.client_name, ''), 'New proposal'),
    'draft',
    'Seeded from Discovery · budget '
      || coalesce(to_char(v_disc.budget_min_cents / 100, 'FM999,999,999'), '?')
      || '–'
      || coalesce(to_char(v_disc.budget_max_cents / 100, 'FM999,999,999'), '?'),
    'design_services',
    'draft'
  )
  returning id into v_prop;

  -- 2) Scope rooms, field→field from the discovery rooms[].
  for v_room in select * from jsonb_array_elements(v_disc.rooms) loop
    insert into proposal_scope_rooms
      (proposal_id, name, room_type, floor_area_sqft, budget_cents, notes, sort_order)
    values (
      v_prop,
      coalesce(nullif(v_room->>'name', ''), 'Room'),
      nullif(v_room->>'room_type', ''),
      nullif(v_room->>'floor_area_sqft', '')::numeric,
      0,  -- per-room budget is allocated in the Drafting Room
      nullif(
        concat_ws(' · ',
          case when coalesce((v_room->>'keep_as_is')::boolean, false) then 'Keep as-is' end,
          nullif(v_room->>'notes', '')),
        ''),
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  -- 3) Style read → a 'vision' narrative section (the Drafting Room Vision facet
  --    reads this; the designer fleshes it into palette/boards). metadata carries
  --    the structured tag ids for a future palette auto-build.
  insert into proposal_sections (proposal_id, type, title, body, metadata, sort_order)
  values (
    v_prop,
    'vision',
    'Style direction',
    nullif(array_to_string(v_disc.style_keywords, ' · '), ''),
    jsonb_build_object('style_tag_ids', to_jsonb(v_disc.style_tag_ids)),
    0
  );

  -- 4) Stamp the discovery row seeded (idempotency + provenance).
  update client_discovery
     set seeded_proposal_id = v_prop,
         seeded_at = now(),
         ready_at = coalesce(ready_at, now()),
         updated_at = now()
   where id = v_disc.id;

  return v_prop;
end;
$$;

-- Schema-qualified and upper-cased on purpose: scripts/generate-legacy-grants.py
-- matches GRANT/REVOKE case-sensitively, so the 00224/00327 lowercase form was
-- never replayed into supabase/seed/00-legacy-grants.sql. This posture now is.
REVOKE ALL ON FUNCTION public.begin_direction_from_discovery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_direction_from_discovery(uuid) TO authenticated;

comment on function public.begin_direction_from_discovery(uuid) is
  'R66 readiness act: validates the five Discovery essentials, creates a seeded DRAFT proposal (scope rooms + style vision + budget), stamps the discovery row. Re-derives the engagement Discovery→Direction (document_state Shape D→B). Arrival Arc (I62): stamps proposals.designer_client_id so Shape B rescues no-login households. 00414: the seed is a design_services/draft commercial edition, and a superseded seed is re-minted rather than returned. Idempotent.';

-- ── A first-class authoring vehicle for furnishing waves ──────────────────
-- create_furnishings_authorization demands a project-bound legacy draft as its
-- source. Before 00414 that draft had to be hand-made through the raw table
-- edge, which is exactly the shape send_proposal must now refuse. This RPC
-- mints it under the same executed-origin authority the wave itself requires.

CREATE OR REPLACE FUNCTION public.create_furnishing_wave_draft(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_title text := btrim(COALESCE(p_title, ''));
BEGIN
  IF v_actor IS NULL OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'furnishing wave draft requires an authenticated author and title'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  -- Authoring a proposal row is narrower than shared-workspace visibility.
  -- is_studio_comember accepts co-membership in ANY organization (contractor,
  -- manufacturer, suspended studios included), while the proposals INSERT
  -- policy (00401 proposals_design_studio_insert) requires
  -- is_design_studio_comember. This body is SECURITY DEFINER, so RLS never
  -- runs — use the canonical author helper, exactly like create_service_addendum
  -- (00412) and create_furnishings_authorization do.
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind = 'design_services'
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;

  -- document_kind is left at its 'legacy' default and commercial_state NULL:
  -- this is an internal authoring vehicle, never a client-facing edition. The
  -- bound project_id is what create_furnishings_authorization matches on, and
  -- what now makes the draft unsendable through the legacy rail.
  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, project_id, title,
    status, version
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, p_project_id, v_title, 'draft', 1
  );

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'projectId', p_project_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_furnishing_wave_draft(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_furnishing_wave_draft(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_furnishing_wave_draft(uuid, text) IS
  'Mints the project-bound draft that create_furnishings_authorization snapshots. Requires the same executed design-services origin as the wave itself.';

-- ── send_proposal refuses commercial editions and wave vehicles ───────────
-- 00390 body VERBATIM except: the ownership SELECT also fetches document_kind
-- and project_id, and two guards fire immediately after the ownership check.
-- Plain legacy sends (project_id NULL) are untouched.

CREATE OR REPLACE FUNCTION public.send_proposal(
  p_proposal_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_total_amount integer,
  p_expected_schedule_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_cc_email text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
  v_document_kind text;
  v_project_id uuid;
  v_status text;
  v_result public.proposals;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'send_proposal requires an authenticated studio author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.designer_id, proposal.document_kind, proposal.project_id,
         proposal.status
  INTO v_designer_id, v_document_kind, v_project_id, v_status
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_designer_id) THEN
    RAISE EXCEPTION 'send_proposal: proposal % not found or access denied',
      p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00414: two send seams, one per rail. A commercial edition carries terms,
  -- rates, checkpoint, or snapshot preconditions this body never evaluates.
  IF v_document_kind <> 'legacy' THEN
    RAISE EXCEPTION 'commercial documents send through send_commercial_document'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A legacy DRAFT already bound to a project is the internal authoring
  -- vehicle create_furnishings_authorization snapshots. It is never the thing
  -- a client receives — the wave edition minted from it is. The refusal is
  -- scoped to exactly that shape: an activated legacy proposal also carries a
  -- project back-link (activate_proposal_as_project writes it), and refusing
  -- on project_id alone would answer for a population this seam never meant to
  -- name. Non-draft rows keep the base body's own answer
  -- ('proposal must be in draft status before sending', _commit_proposal_send),
  -- which is the only status send_proposal has ever processed.
  IF v_document_kind = 'legacy' AND v_project_id IS NOT NULL
     AND v_status = 'draft' THEN
    RAISE EXCEPTION 'project-bound furnishing drafts are internal authoring vehicles; send their wave'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM deliverable.id
  FROM public.proposal_phase_deliverables AS deliverable
  JOIN public.proposal_phases AS phase ON phase.id = deliverable.phase_id
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY deliverable.id
  FOR UPDATE OF deliverable;

  PERFORM gate.id
  FROM public.proposal_phase_gates AS gate
  JOIN public.proposal_phases AS phase ON phase.id = gate.phase_id
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY gate.id
  FOR UPDATE OF gate;

  PERFORM milestone.id
  FROM public.proposal_schedule_milestones AS milestone
  JOIN public.proposal_phases AS phase ON phase.id = milestone.phase_id
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY milestone.id
  FOR UPDATE OF milestone;

  SELECT sent.* INTO v_result
  FROM public._send_proposal_with_dispatch(
    p_proposal_id,
    p_expected_updated_at,
    p_expected_total_amount,
    p_expected_schedule_fingerprint,
    p_personal_message,
    p_cc_email,
    p_valid_until
  ) AS sent;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) TO authenticated;

COMMENT ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) IS
  'Canonical 00388 send plus proposal→phase-leaf row locks. Serializes '
  'deliverables, gates, and schedule milestones before fingerprint/transition. '
  '00414: the legacy rail only. Commercial editions and project-bound legacy '
  'furnishing authoring DRAFTS are refused here; every other status keeps the '
  'base body''s own answer.';

-- ── Executed design-services origin, re-asserted at every authority act ───
-- 00412 checked the origin only where a wave is created. A wave already in
-- flight, or a checkpoint published on a legacy project, could still reach
-- authority state. Both acts now re-assert it. 00412 bodies VERBATIM except
-- the added EXISTS precondition.

CREATE OR REPLACE FUNCTION public.publish_budget_checkpoint(
  p_project_id uuid,
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_low bigint;
  v_target bigint;
  v_high bigint;
  v_fingerprint text;
  v_previous_publish text := current_setting('app.budget_publish_id', true);
BEGIN
  SELECT v.* INTO v_version
  FROM public.project_budget_versions v
  JOIN public.projects p ON p.id = v.project_id
  WHERE v.id = p_version_id AND v.project_id = p_project_id
    AND public.is_studio_comember(p.designer_id)
  FOR UPDATE OF v;
  IF NOT FOUND OR v_actor IS NULL OR v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'draft budget version % not found or access denied', p_version_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00414: a checkpoint is an act of signed commercial authority — it is what a
  -- furnishing wave is built on. A legacy project has no such authority, so it
  -- can no longer publish one.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_budget_lines l WHERE l.budget_version_id = p_version_id) THEN
    RAISE EXCEPTION 'budget version % has no lines', p_version_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT sum(low_cents), sum(target_cents), sum(high_cents)
  INTO v_low, v_target, v_high
  FROM public.project_budget_lines WHERE budget_version_id = p_version_id;

  PERFORM set_config('app.budget_publish_id', p_version_id::text, true);
  UPDATE public.project_budget_versions SET
    low_total_cents = v_low::integer,
    target_total_cents = v_target::integer,
    high_total_cents = v_high::integer,
    status = 'published', published_at = now()
  WHERE id = p_version_id RETURNING * INTO v_version;
  v_fingerprint := public._budget_version_fingerprint(p_version_id);

  INSERT INTO public.project_budget_checkpoints (
    project_id, budget_version_id, checkpoint_code, snapshot_fingerprint,
    published_by, published_at
  ) VALUES (
    p_project_id, p_version_id, 'B-' || lpad(v_version.version::text, 3, '0'),
    v_fingerprint, v_actor, v_version.published_at
  ) RETURNING * INTO v_checkpoint;
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);

  RETURN jsonb_build_object(
    'checkpointId', v_checkpoint.id,
    'projectId', p_project_id,
    'versionId', p_version_id,
    'checkpointCode', v_checkpoint.checkpoint_code,
    'status', v_checkpoint.status,
    'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
    'publishedAt', v_checkpoint.published_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_budget_checkpoint(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_budget_checkpoint(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_authorized(
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
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM v_actor
     OR v_proposal.document_kind <> 'furnishings_authorization'
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'furnishings authorization has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'furnishings authorization % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_furnishings_authorization')
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant below
    -- takes the signing IP away from studio readers of
    -- commercial_document_signatures; mirroring it onto public.proposals —
    -- which stays fully SELECT-granted to authenticated and row-visible to
    -- every design-studio co-member (00401 proposals_design_studio_select) —
    -- would hand the same value back one table over. The signature row is the
    -- evidence of record. Nothing reads proposals.signed_ip on this rail.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      -- The client executes the authorization, but invoice issuance remains a
      -- studio act. Adopt the owning designer only for the existing issuance
      -- RPC, then restore the caller's claims before returning.
      PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_proposal.designer_id, 'role', 'authenticated'
      )::text, true);
      PERFORM public.issue_invoice(v_deposit_invoice_id, current_date);
      PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;
    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._execute_furnishings_authorization_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;


-- ── Countersign stops mirroring the client signing IP ─────────────────────
-- 00412 body VERBATIM except one deletion: the executed UPDATE no longer
-- copies v_client_signature.signed_ip onto public.proposals. Same reason as
-- the furnishings rail — the column grant at the foot of this file takes
-- signed_ip away from studio readers of commercial_document_signatures, and
-- proposals is fully SELECT-granted to authenticated and row-visible to every
-- design-studio co-member, so the mirror handed the value straight back. No
-- reader of proposals.signed_ip exists on the commercial rails (portal reads
-- project it explicitly; the designer signature select already omits it).
-- The legacy rail (00400 sign_proposal / 00254 record_offline_signature) is
-- deliberately untouched: its own consistency check compares
-- proposal_engagement metadata against proposals.signed_ip.
-- Current-body lineage: countersign_design_services_agreement: 00412 (sole
-- definition, re-grepped).
CREATE OR REPLACE FUNCTION public.countersign_design_services_agreement(
  p_proposal_id uuid,
  p_signer_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
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
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'studio countersign requires an authenticated signer and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind NOT IN ('design_services', 'service_addendum')
     OR NOT public._can_author_proposal(v_proposal.designer_id)
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
    SELECT d.id, d.project_id, a.id, a.retainer_invoice_id
    INTO v_document_id, v_project_id, v_authority_id, v_retainer_invoice_id
    FROM public.project_commercial_documents d
    JOIN public.project_billing_authorities a ON a.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id;
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
      INSERT INTO public.project_commercial_documents (
        project_id, proposal_id, document_kind, is_origin, executed_at, created_by
      ) VALUES (
        v_project_id, p_proposal_id, 'design_services', true,
        v_studio_signature.signed_at, v_actor
      ) RETURNING id INTO v_document_id;
    ELSE
      SELECT id, project_id INTO v_document_id, v_project_id
      FROM public.project_commercial_documents
      WHERE proposal_id = p_proposal_id AND document_kind = 'service_addendum'
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
        v_project_id, v_proposal.designer_id, v_proposal.client_id, 'draft', 'USD',
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
      PERFORM public.issue_invoice(v_retainer_invoice_id, current_date);
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
REVOKE ALL ON FUNCTION public.countersign_design_services_agreement(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.countersign_design_services_agreement(uuid, text)
  TO authenticated;

-- ── Budget-line authoring works again ────────────────────────────────────
-- 00412's guard reached OLD.status/NEW.status directly. plpgsql resolves a
-- record field against the triggering relation's tuple descriptor before the
-- boolean can short-circuit, so EVERY update or delete on project_budget_lines
-- — draft versions included — raised 42703 'record "old" has no field
-- "status"'. Budget lines could be written once and never edited or removed.
-- 00412 body VERBATIM except the two field reads, which now go through the
-- jsonb row images the function already builds. Published rows still raise
-- check_violation; the publish transition still passes on its exact-row GUC.

CREATE OR REPLACE FUNCTION public.guard_budget_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old jsonb := to_jsonb(OLD);
  v_version_id uuid := CASE TG_TABLE_NAME
    WHEN 'project_budget_versions' THEN (v_row->>'id')::uuid
    WHEN 'project_budget_lines' THEN (v_row->>'budget_version_id')::uuid
  END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_budget_versions v
    WHERE v.id = v_version_id AND v.status = 'published'
  ) AND NOT (
    TG_TABLE_NAME = 'project_budget_versions'
    AND TG_OP = 'UPDATE'
    AND v_old->>'status' = 'draft'
    AND v_row->>'status' = 'published'
    AND current_user IS NOT DISTINCT FROM 'postgres'
    AND current_setting('app.budget_publish_id', true) IS NOT DISTINCT FROM (v_row->>'id')
  ) THEN
    RAISE EXCEPTION 'published budget versions and lines are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_budget_immutability()
  FROM PUBLIC, anon, authenticated, service_role;

-- ── The commercial ledgers are RPC-write-only at the table edge ───────────
-- project_commercial_documents and project_billing_authorities carry signed
-- authority. Every canonical writer is a SECURITY DEFINER function owned by
-- postgres, so current_user is 'postgres' inside them; nothing else may write.
-- Same shape as 00412's guard_purchase_order_direct_insert.

CREATE OR REPLACE FUNCTION public.guard_commercial_ledger_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (current_user IS NOT DISTINCT FROM 'postgres') THEN
    RAISE EXCEPTION '% is written only by its canonical commercial RPCs', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_ledger_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS aab_guard_project_commercial_documents_write_trg
  ON public.project_commercial_documents;
CREATE TRIGGER aab_guard_project_commercial_documents_write_trg
BEFORE INSERT OR UPDATE ON public.project_commercial_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_ledger_write();

DROP TRIGGER IF EXISTS aab_guard_project_billing_authorities_write_trg
  ON public.project_billing_authorities;
CREATE TRIGGER aab_guard_project_billing_authorities_write_trg
BEFORE INSERT OR UPDATE ON public.project_billing_authorities
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_ledger_write();

-- 00412 gave every other commercial ledger a delete guard and missed this one.
DROP TRIGGER IF EXISTS guard_project_billing_authorities_immutable
  ON public.project_billing_authorities;
CREATE TRIGGER guard_project_billing_authorities_immutable
BEFORE DELETE ON public.project_billing_authorities
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_row();

-- ── Client document reads: retired legacy marker, no identity columns ─────
-- 00412 raised for legacy editions, so a client following an old link got an
-- access error instead of an answer. Legacy now returns a minimal retired
-- marker — no totals, identities, terms, rates, or signatures. Commercial
-- documents drop designerId/clientId/supersededReason; dispatch ids stay
-- (tested contract). 00412 body otherwise VERBATIM.

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
  -- (plpgsql reads an IF condition up to the first THEN, so this stays
  --  boolean algebra rather than a CASE expression.)
  -- 00414: the CHECK above permits commercial_state NULL for EVERY kind, so a
  -- non-legacy row with no commercial state must read as draft, not fall
  -- through into the full bundle. guard_commercial_proposal_authority (00412)
  -- should make that shape unreachable; the guard is written closed anyway.
  IF v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
     AND (
       (v_proposal.document_kind = 'legacy' AND v_proposal.status = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') = 'draft')
     ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00414: a legacy edition is not an error, it is a retired document. Answer
  -- with a marker the client portal can render as history — enough to name it
  -- and point at its replacement, and nothing else. No totals, identities,
  -- terms, rates, or signatures: the commercial rail is where those live now.
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

  -- 00414: designerId/clientId/supersededReason left the client payload. The
  -- portal addresses parties through its own identity reads, and the internal
  -- reason a document was retired is studio rationale, not client-facing copy.
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
      'terms', t.terms, 'currentRateVersion', t.current_rate_version
    ) FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id),
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents, 'sortOrder', r.sort_order,
      'effectiveAt', r.effective_at
    ) ORDER BY r.version DESC, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id), '[]'::jsonb),
    'signatures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'partyRole', s.party_role,
      'signedName', s.signed_name, 'signedAt', s.signed_at,
      'evidenceFingerprint', s.evidence_fingerprint
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
          'clientLineTotalCents', a.client_line_total_cents, 'sortOrder', a.sort_order
        ) ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          WHERE a.commercial_document_id = v_document.id), '[]'::jsonb)
      ) ELSE NULL END,
    'replacement', (SELECT jsonb_build_object(
      'id', replacement.id, 'title', replacement.title,
      'documentKind', replacement.document_kind,
      'commercialState', replacement.commercial_state
    ) FROM public.proposals replacement WHERE replacement.id = v_proposal.replacement_proposal_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;

-- ── Client proposal list carries the commercial vocabulary ────────────────
-- 00390 body VERBATIM except two added projection keys. jsonb_strip_nulls
-- drops commercial_state for legacy rows, which is the intended shape.

CREATE OR REPLACE FUNCTION public.list_client_proposals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'list_client_proposals requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', proposal.id,
        'project_id', proposal.project_id,
        'project', CASE
          WHEN project.id IS NULL THEN NULL
          ELSE jsonb_build_object('id', project.id, 'name', project.name)
        END,
        'designer_id', proposal.designer_id,
        'title', proposal.title,
        'description', proposal.description,
        'total_amount', proposal.total_amount,
        'payment_terms', proposal.payment_terms,
        'payment_notes', proposal.payment_notes,
        'status', proposal.status,
        'valid_until', proposal.valid_until,
        'sent_at', proposal.sent_at,
        'signed_at', proposal.signed_at,
        'signed_by_name', proposal.signed_by_name,
        'declined_at', proposal.declined_at,
        'decline_reason', proposal.decline_reason,
        'created_at', proposal.created_at,
        'updated_at', proposal.updated_at,
        'version', proposal.version,
        'document_kind', proposal.document_kind,
        'commercial_state', proposal.commercial_state,
        'client_visibility_tier', proposal.client_visibility_tier,
        'feedback_enabled', proposal.feedback_enabled,
        'payment_milestones', CASE
          WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
          ELSE COALESCE((
            SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', milestone.id,
              'proposal_id', milestone.proposal_id,
              'phase_id', milestone.phase_id,
              'label', milestone.label,
              'percentage', milestone.percentage,
              'amount_cents', CASE
                WHEN proposal.client_visibility_tier IS DISTINCT FROM 'curated'
                  THEN milestone.amount_cents
                ELSE NULL
              END,
              'trigger_condition', milestone.trigger_condition,
              'sort_order', milestone.sort_order
            )) ORDER BY milestone.sort_order, milestone.id)
            FROM public.proposal_payment_milestones AS milestone
            WHERE milestone.proposal_id = proposal.id
          ), '[]'::jsonb)
        END
      )) ORDER BY proposal.updated_at DESC, proposal.id), '[]'::jsonb)
  INTO v_payload
  FROM public.proposals AS proposal
  LEFT JOIN public.projects AS project ON project.id = proposal.project_id
  WHERE proposal.client_id = auth.uid()
    AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired');

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.list_client_proposals()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_client_proposals()
  TO authenticated;

-- ── Working budget: studio-only narrative and override rationale ──────────
-- 00412 body VERBATIM except: the caller's studio membership is computed once,
-- and a client read omits the internal version note and the override actor and
-- reason. acknowledgedBy/acknowledgedAt stay — that is the client's own act.

CREATE OR REPLACE FUNCTION public.get_project_working_budget(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_is_studio boolean;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_is_studio := public.is_studio_comember(v_project.designer_id);
  SELECT * INTO v_version FROM public.project_budget_versions
  WHERE project_id = p_project_id
    AND (status = 'published' OR public.is_studio_comember(v_project.designer_id))
  ORDER BY version DESC LIMIT 1;
  IF v_version.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_checkpoint FROM public.project_budget_checkpoints
  WHERE budget_version_id = v_version.id;
  -- 00414: the version note is the studio's internal working commentary, and
  -- the override actor/reason is the studio's audited rationale for proceeding
  -- past an unacknowledged checkpoint. Neither is client copy. The client's own
  -- acknowledgement (acknowledgedBy/acknowledgedAt) stays — that is their act.
  RETURN jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id, 'projectId', v_version.project_id,
      'version', v_version.version, 'status', v_version.status,
      'lowTotalCents', v_version.low_total_cents,
      'targetTotalCents', v_version.target_total_cents,
      'highTotalCents', v_version.high_total_cents,
      'currency', 'USD', 'note', v_version.note,
      'createdAt', v_version.created_at, 'publishedAt', v_version.published_at
    ) - CASE WHEN v_is_studio THEN '{}'::text[] ELSE ARRAY['note'] END,
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'projectRoomId', l.project_room_id, 'roomName', l.room_name,
      'category', l.category, 'lowCents', l.low_cents,
      'targetCents', l.target_cents, 'highCents', l.high_cents,
      'sortOrder', l.sort_order
    ) ORDER BY l.sort_order, l.id) FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_version.id), '[]'::jsonb),
    'checkpoint', CASE WHEN v_checkpoint.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_checkpoint.id, 'projectId', v_checkpoint.project_id,
      'versionId', v_checkpoint.budget_version_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'status', v_checkpoint.status, 'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
      'publishedAt', v_checkpoint.published_at,
      'acknowledgedBy', v_checkpoint.acknowledged_by,
      'acknowledgedAt', v_checkpoint.acknowledged_at,
      'overrideBy', v_checkpoint.override_by,
      'overrideReason', v_checkpoint.override_reason,
      'overriddenAt', v_checkpoint.overridden_at
    ) - CASE WHEN v_is_studio THEN '{}'::text[]
             ELSE ARRAY['overrideBy', 'overrideReason'] END
    END,
    'isPurchaseAuthority', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_working_budget(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_working_budget(uuid)
  TO authenticated;

-- ── Signature evidence: signed_ip never crosses to a studio reader ────────
-- RLS filters rows, not columns. The studio read policy on
-- commercial_document_signatures exposed the client's signing IP to every
-- co-member. Column grants remove it; the curated RPCs never projected it.

REVOKE SELECT ON public.commercial_document_signatures FROM authenticated;
GRANT SELECT (
  id, proposal_id, party_role, signer_user_id, signed_name,
  evidence_fingerprint, signed_at, metadata
) ON public.commercial_document_signatures TO authenticated;
