-- ═══════════════════════════════════════════════════════════════════════════
-- 00576 — The Agreement Library: studio parts, studio and seeded templates
--
-- Wave 2, P4. A studio stops re-typing the same agreement. Its own parts and
-- its own templates live beside Patina's, and a draft is composed FROM them
-- rather than from memory.
--
-- Modeled on 00408 board_templates: kind seeded|studio, an owner-shape CHECK,
-- patina.* / studio.* key namespaces, seeded rows immutable except under
-- app.allow_patina_template_mutation, INSERT is RPC-only so no authenticated
-- caller can forge an unsanitized part.
--
-- DELIBERATE DIVERGENCE FROM 00408: write policies use
-- public.is_org_admin_or_owner(studio_id, auth.uid()) rather than
-- is_active_org_member — R3 says owners and admins edit the Library and every
-- active member composes from it. 00408's UPDATE/DELETE policies use
-- is_active_org_member; this file does not, on purpose.
--
-- TWO DIFFERENT `kind` COLUMNS, and they are not the same word.
-- agreement_templates.kind ∈ {'seeded','studio'} is OWNERSHIP.
-- studio_agreement_parts.kind is the PART KIND from AGREEMENT_PART_KINDS and
-- carries no CHECK beyond non-empty — the code-resident-vocabulary doctrine
-- 00417 keeps for studio_contacts.contact_kind, and the same posture 00575
-- gave proposal_agreement_parts.kind.
--
-- Reverses nothing in 00063 proposal_templates (per-user, retired by R85).
-- A studio Library is a different object — DECISIONS R138, same merge (R1).
--
-- NOT DONE HERE, and why:
--   · No FOREIGN KEY from proposal_agreement_parts.source_part_id to
--     studio_agreement_parts(id), although 00575's column comment anticipated
--     one. proposal_agreement_parts carries guard_commercial_authored_child,
--     which refuses every UPDATE once the proposal leaves draft — so an
--     ON DELETE SET NULL would make deleting a Library part raise on any
--     studio that has ever SENT an agreement composed from it, and
--     ON DELETE CASCADE would silently remove a part from an executed
--     instrument. The column stays a soft pointer, exactly as
--     proposal_boards.source_board_id is (00408 house rule).
--   · No composition editor for a studio template. W2 gives rename + delete +
--     re-save; the immutability guard freezes `parts` for that reason.
--   · No patina.design_build template. Wave 3 (R10 gates it on an attestation
--     this file does not create).
--
-- materialize_agreement_template calls public.upsert_agreement_parts with its
-- THREE-argument shape, which 00577 creates. plpgsql binds a function at first
-- execution, not at CREATE, so this file applies on its own; the pair always
-- pushes together and nothing calls the RPC between them.
--
-- Every SECURITY DEFINER here pins `search_path = public, pg_temp` (or
-- `public, extensions, pg_temp` where it mints a uuid), the posture of the
-- surrounding commercial family. Extension functions are schema-qualified
-- (`extensions.gen_random_uuid`) — the prod push session's search_path lacks
-- `extensions` (the 00282 incident).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — The two tables
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agreement_templates (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  kind         text NOT NULL CHECK (kind IN ('seeded', 'studio')),
  studio_id    uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  class        text NOT NULL CHECK (char_length(btrim(class)) > 0),
  title        text NOT NULL CHECK (char_length(btrim(title)) > 0),
  parts        jsonb NOT NULL DEFAULT '[]'::jsonb
                 CHECK (jsonb_typeof(parts) = 'array'),
  consent_key  text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agreement_templates_owner_shape CHECK (
    (
      kind = 'seeded'
      AND studio_id IS NULL
      AND created_by IS NULL
      AND template_key LIKE 'patina.%'
    )
    OR (
      kind = 'studio'
      AND studio_id IS NOT NULL
      AND template_key LIKE 'studio.%'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.studio_agreement_parts (
  id                     uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  studio_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind                   text NOT NULL CHECK (char_length(btrim(kind)) > 0),
  variant                text CHECK (variant IS NULL OR char_length(btrim(variant)) > 0),
  part_key               text NOT NULL CHECK (part_key LIKE 'studio.%'),
  title                  text NOT NULL CHECK (char_length(btrim(title)) > 0),
  payload                jsonb NOT NULL DEFAULT '{}'::jsonb
                           CHECK (jsonb_typeof(payload) = 'object'),
  required_default       boolean NOT NULL DEFAULT false,
  client_visible_default boolean NOT NULL DEFAULT true,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_studio_agreement_part_key UNIQUE (studio_id, part_key)
);

CREATE INDEX IF NOT EXISTS idx_agreement_templates_studio_updated
  ON public.agreement_templates (studio_id, updated_at DESC)
  WHERE studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agreement_templates_seeded_key
  ON public.agreement_templates (template_key)
  WHERE kind = 'seeded';

CREATE INDEX IF NOT EXISTS idx_studio_agreement_parts_studio_kind
  ON public.studio_agreement_parts (studio_id, kind, title);

DROP TRIGGER IF EXISTS set_updated_at_agreement_templates ON public.agreement_templates;
CREATE TRIGGER set_updated_at_agreement_templates
  BEFORE UPDATE ON public.agreement_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_studio_agreement_parts ON public.studio_agreement_parts;
CREATE TRIGGER set_updated_at_studio_agreement_parts
  BEFORE UPDATE ON public.studio_agreement_parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — Immutability (00408:71-121, transposed)
--
-- Seeded rows are Patina's and refuse UPDATE/DELETE to every caller,
-- service_role included, unless a migration sets the maintenance GUC. Studio
-- rows freeze their composition and their ownership; `title` and
-- `consent_key` stay editable, and that pair IS the rename affordance W2
-- offers instead of a composition editor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_agreement_template_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.kind = 'seeded'
     AND COALESCE(
       current_setting('app.allow_patina_template_mutation', true),
       'off'
     ) <> 'on'
  THEN
    RAISE EXCEPTION 'Patina agreement templates are immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.kind = 'studio' THEN
    IF NEW.template_key IS DISTINCT FROM OLD.template_key
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.studio_id IS DISTINCT FROM OLD.studio_id
       OR NEW.class IS DISTINCT FROM OLD.class
       OR NEW.parts IS DISTINCT FROM OLD.parts
       OR (
         NEW.created_by IS DISTINCT FROM OLD.created_by
         AND NOT (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL)
       )
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'a template''s composition and ownership are immutable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_agreement_template_immutability()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_agreement_template_immutability_trg
  ON public.agreement_templates;
CREATE TRIGGER a_guard_agreement_template_immutability_trg
  BEFORE UPDATE OR DELETE ON public.agreement_templates
  FOR EACH ROW EXECUTE FUNCTION public.guard_agreement_template_immutability();

-- studio_agreement_parts needs no sibling guard: every write goes through
-- save_agreement_part, and the table grants authenticated no INSERT and no
-- UPDATE at all (see the grants below). Only DELETE, and that is the studio
-- removing its own part.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — RLS (R3: read is every active member, write is owners and admins)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agreement_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_agreement_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agreement_templates_select ON public.agreement_templates;
CREATE POLICY agreement_templates_select
ON public.agreement_templates FOR SELECT TO authenticated
USING (
  kind = 'seeded'
  OR (
    kind = 'studio'
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS studio
      WHERE studio.id = agreement_templates.studio_id
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
        AND public.is_active_org_member(studio.id)
    )
  )
);

DROP POLICY IF EXISTS agreement_templates_studio_update ON public.agreement_templates;
CREATE POLICY agreement_templates_studio_update
ON public.agreement_templates FOR UPDATE TO authenticated
USING (
  kind = 'studio'
  AND public.is_org_admin_or_owner(agreement_templates.studio_id, auth.uid())
)
WITH CHECK (
  kind = 'studio'
  AND public.is_org_admin_or_owner(agreement_templates.studio_id, auth.uid())
);

DROP POLICY IF EXISTS agreement_templates_studio_delete ON public.agreement_templates;
CREATE POLICY agreement_templates_studio_delete
ON public.agreement_templates FOR DELETE TO authenticated
USING (
  kind = 'studio'
  AND public.is_org_admin_or_owner(agreement_templates.studio_id, auth.uid())
);

DROP POLICY IF EXISTS studio_agreement_parts_select ON public.studio_agreement_parts;
CREATE POLICY studio_agreement_parts_select
ON public.studio_agreement_parts FOR SELECT TO authenticated
USING (public.is_active_studio_member(studio_agreement_parts.studio_id));

DROP POLICY IF EXISTS studio_agreement_parts_delete ON public.studio_agreement_parts;
CREATE POLICY studio_agreement_parts_delete
ON public.studio_agreement_parts FOR DELETE TO authenticated
USING (public.is_org_admin_or_owner(studio_agreement_parts.studio_id, auth.uid()));

-- No INSERT policy on either table, and no UPDATE policy on
-- studio_agreement_parts: those doors are save_agreement_part and
-- save_agreement_as_template, which sanitize before they write.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — Grants (post-flip: grant explicitly, revoke explicitly)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON TABLE public.agreement_templates    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.studio_agreement_parts FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (title, consent_key), DELETE
  ON TABLE public.agreement_templates TO authenticated;
GRANT SELECT, DELETE
  ON TABLE public.studio_agreement_parts TO authenticated;
GRANT ALL ON TABLE public.agreement_templates    TO service_role;
GRANT ALL ON TABLE public.studio_agreement_parts TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — The owner-reference scrubber (00408:199-257, transposed)
--
-- A Library part is DETACHED. Whatever a payload picked up while it was one
-- proposal's part — the proposal, the studio, the person who wrote it, a row
-- id — is stripped at every depth on the way in and again on the way out, so
-- a template materialized into a second draft cannot carry the first draft's
-- identity with it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sanitize_agreement_part_payload(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT COALESCE(
        jsonb_object_agg(entry.key, public.sanitize_agreement_part_payload(entry.value)),
        '{}'::jsonb
      )
      INTO v_result
      FROM jsonb_each(p_value) AS entry
      WHERE entry.key <> ALL (ARRAY[
        'id',
        'proposal_id', 'proposalId',
        'project_id', 'projectId',
        'client_id', 'clientId',
        'designer_id', 'designerId',
        'studio_id', 'studioId',
        'organization_id', 'organizationId',
        'created_by', 'createdBy',
        'owner_user_id', 'ownerUserId',
        'user_id', 'userId',
        'invoice_id', 'invoiceId',
        'part_id', 'partId',
        'source_part_id', 'sourcePartId',
        'source_template_key', 'sourceTemplateKey',
        'created_at', 'createdAt',
        'updated_at', 'updatedAt'
      ]::text[]);
      RETURN v_result;

    WHEN 'array' THEN
      SELECT COALESCE(
        jsonb_agg(
          public.sanitize_agreement_part_payload(entry.value)
          ORDER BY entry.ordinality
        ),
        '[]'::jsonb
      )
      INTO v_result
      FROM jsonb_array_elements(p_value)
        WITH ORDINALITY AS entry(value, ordinality);
      RETURN v_result;

    ELSE
      RETURN p_value;
  END CASE;
END;
$$;
REVOKE ALL ON FUNCTION public.sanitize_agreement_part_payload(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- A list part's items are identified by `id`, and the scrubber strips `id` at
-- every depth — it has to, because a row id is exactly the kind of thing a
-- detached payload must not carry. W1's materialize_standard_parts mints an id
-- for every seeded list item, so the room's list editor has always been handed
-- items that carry one. This restores that invariant after a scrub: a fresh
-- uuid per item, minted at materialize time, belonging to nothing.
CREATE OR REPLACE FUNCTION public._agreement_restore_list_item_ids(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object' THEN p_payload
    WHEN jsonb_typeof(p_payload->'items') <> 'array' THEN p_payload
    ELSE jsonb_set(p_payload, '{items}', COALESCE((
      SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(e.item) = 'object'
             THEN e.item || jsonb_build_object(
                    'id', COALESCE(NULLIF(e.item->>'id', ''),
                                   extensions.gen_random_uuid()::text))
             ELSE e.item END
        ORDER BY e.ord)
      FROM jsonb_array_elements(p_payload->'items') WITH ORDINALITY AS e(item, ord)
    ), '[]'::jsonb))
  END;
$$;
REVOKE ALL ON FUNCTION public._agreement_restore_list_item_ids(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — save_agreement_part
--
-- One part, saved to the studio's Library under its own key. R3: only an
-- owner or an admin may write it, and the refusal says so in the designer's
-- words rather than in the words of a policy.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_agreement_part(
  p_studio_id uuid,
  p_part jsonb
)
RETURNS public.studio_agreement_parts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_key text;
  v_kind text;
  v_variant text;
  v_title text;
  v_payload jsonb;
  v_row public.studio_agreement_parts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'saving to the Library requires an authenticated author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_org_admin_or_owner(p_studio_id, auth.uid()) THEN
    RAISE EXCEPTION 'only a studio owner or admin may edit the Library'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(COALESCE(p_part, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'this part could not be read'
      USING ERRCODE = 'check_violation';
  END IF;

  v_kind    := btrim(COALESCE(p_part->>'kind', ''));
  v_variant := NULLIF(btrim(COALESCE(p_part->>'variant', '')), '');
  v_title   := btrim(COALESCE(p_part->>'title', ''));
  v_payload := COALESCE(p_part->'payload', '{}'::jsonb);

  IF v_kind = '' THEN
    RAISE EXCEPTION 'every part needs a type'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_title = '' THEN
    RAISE EXCEPTION 'every part needs a title'
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'the part titled "%" could not be read', v_title
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind = 'schedule' AND v_variant IS NULL THEN
    RAISE EXCEPTION 'a schedule part needs to say which schedule it is'
      USING ERRCODE = 'check_violation';
  END IF;

  v_key := COALESCE(
    NULLIF(btrim(COALESCE(p_part->>'partKey', '')), ''),
    'studio.' || extensions.gen_random_uuid()::text
  );
  -- R7: the refusal names the act, never the namespace. A designer never types
  -- a key — the room mints one — so the only caller that can reach this is a
  -- hand-made request, and it still gets a sentence rather than a CHECK.
  IF v_key NOT LIKE 'studio.%' THEN
    RAISE EXCEPTION 'this part cannot be saved to the Library under that name'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.studio_agreement_parts (
    studio_id, kind, variant, part_key, title, payload,
    required_default, client_visible_default, created_by
  ) VALUES (
    p_studio_id, v_kind, v_variant, v_key, v_title,
    public.sanitize_agreement_part_payload(v_payload),
    COALESCE((p_part->>'requiredDefault')::boolean, false),
    COALESCE((p_part->>'clientVisibleDefault')::boolean, true),
    auth.uid()
  )
  ON CONFLICT (studio_id, part_key) DO UPDATE SET
    kind = EXCLUDED.kind,
    variant = EXCLUDED.variant,
    title = EXCLUDED.title,
    payload = EXCLUDED.payload,
    required_default = EXCLUDED.required_default,
    client_visible_default = EXCLUDED.client_visible_default,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.save_agreement_part(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_agreement_part(uuid, jsonb)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — save_agreement_as_template
--
-- The whole composition, detached. The studio it lands in is the studio the
-- AGREEMENT sits in (R32, _agreement_studio_id below) — 00408:315-341's
-- argument-plus-EXISTS shape, with the argument resolved rather than passed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- R32 — THE STUDIO AN AGREEMENT SITS IN, resolved once, the way 00566 resolves
-- the authority studio at countersign.
--
-- The first body of this file counted the studios the actor and the lead
-- designer share and refused anything but exactly one. That arithmetic breaks
-- on the ordinary designer: 00295 auto-provisions a personal design studio the
-- moment `profiles.is_designer` flips true, so a designer who signed up alone
-- and later joined a studio has two — and when she is herself the lead, both
-- studios answer for both people, the count is two, and EVERY studio Template
-- is refused, her own studio's included.
--
-- A count was never the question. 00566 asks it properly and this is the same
-- question: the studio a bound agreement sits in is its PROJECT's studio, and
-- an origin agreement — project_id NULL until countersign — sits in the
-- LEAD's studio, taken in 00563's order (a studio already hosting a project
-- for this designer-client pair first, then owner-first, earliest-joined,
-- organization id last for a total order). The actor's own standing in that
-- answer is then asserted with an EXISTS rather than folded into the search,
-- exactly as 00566 asserts the countersigner's — the same shape
-- save_board_as_template has carried since 00408.
--
-- NULL means "no studio this actor may act in", which every caller turns into
-- its own refusal.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._agreement_studio_id(
  p_proposal_id uuid,
  p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_studio_id uuid;
BEGIN
  IF p_actor IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_proposal.project_id IS NOT NULL THEN
    SELECT project.studio_id INTO v_studio_id
    FROM public.projects AS project
    WHERE project.id = v_proposal.project_id;
  END IF;

  IF v_studio_id IS NULL THEN
    SELECT studio.id
    INTO v_studio_id
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
  END IF;

  IF v_studio_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS actor_membership
    WHERE actor_membership.organization_id = v_studio_id
      AND actor_membership.user_id = p_actor
      AND actor_membership.status = 'active'
      AND actor_membership.role <> 'guest'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v_studio_id;
END;
$$;
REVOKE ALL ON FUNCTION public._agreement_studio_id(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The same answer, for the room. The Contract Room has to ask which Library to
-- open BEFORE the designer clicks anything, and the client bundle carries no
-- studio id — so it asks here rather than guessing from the actor's own
-- organizations, which for a two-studio designer is an arbitrary one of them
-- and has nothing to do with the studio the agreement sits in.
CREATE OR REPLACE FUNCTION public.agreement_studio_context(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_studio_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'reading an agreement requires an authenticated member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR NOT public.is_studio_comember(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_studio_id := public._agreement_studio_id(p_proposal_id, auth.uid());

  RETURN jsonb_build_object(
    'studioId', v_studio_id,
    'canManage', v_studio_id IS NOT NULL
                 AND public.is_org_admin_or_owner(v_studio_id, auth.uid())
  );
END;
$$;
REVOKE ALL ON FUNCTION public.agreement_studio_context(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.agreement_studio_context(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.save_agreement_as_template(
  p_proposal_id uuid,
  p_title text
)
RETURNS public.agreement_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_studio_id uuid;
  v_parts jsonb;
  v_class text;
  v_template public.agreement_templates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'saving a template requires an authenticated author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(btrim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'a template needs a name'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR NOT public.is_studio_comember(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- R32 — the studio the AGREEMENT sits in, not a count of the author's.
  v_studio_id := public._agreement_studio_id(p_proposal_id, auth.uid());
  IF v_studio_id IS NULL THEN
    RAISE EXCEPTION 'template studio is not an authorized design workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_org_admin_or_owner(v_studio_id, auth.uid()) THEN
    RAISE EXCEPTION 'only a studio owner or admin may edit the Library'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'partKey', ap.part_key,
           'kind', ap.kind,
           'variant', ap.variant,
           'title', ap.title,
           'payload', public.sanitize_agreement_part_payload(ap.payload),
           'required', ap.required,
           'clientVisible', ap.client_visible
         ) ORDER BY ap.position, ap.id)
  INTO v_parts
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id;

  IF v_parts IS NULL OR jsonb_array_length(v_parts) = 0 THEN
    RAISE EXCEPTION 'this agreement has no parts to save'
      USING ERRCODE = 'check_violation';
  END IF;

  -- An addendum is a design-services instrument; it saves as one, so the
  -- template picker offers it beside every other services template.
  v_class := CASE WHEN v_proposal.document_kind = 'service_addendum'
                  THEN 'design_services'
                  ELSE COALESCE(NULLIF(btrim(COALESCE(v_proposal.document_kind, '')), ''),
                                'design_services') END;

  INSERT INTO public.agreement_templates (
    template_key, kind, studio_id, class, title, parts, created_by
  ) VALUES (
    'studio.' || extensions.gen_random_uuid()::text,
    'studio', v_studio_id, v_class, btrim(p_title), v_parts, auth.uid()
  )
  RETURNING * INTO v_template;

  RETURN v_template;
END;
$$;
REVOKE ALL ON FUNCTION public.save_agreement_as_template(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_agreement_as_template(uuid, text)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — materialize_agreement_template
--
-- Composing is not editing (R3): every ACTIVE member may materialize a
-- template into a draft they can author, and only owners and admins may have
-- put it in the Library in the first place.
--
-- The write itself is ONE call into upsert_agreement_parts, not a second
-- implementation of it. That RPC owns the money projection, the duplicate
-- refusals, the fingerprint and — from 00577 — the change history, and the
-- one thing this file must never do is fork any of them.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.materialize_agreement_template(
  p_proposal_id uuid,
  p_template_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_template public.agreement_templates%ROWTYPE;
  v_entry jsonb;
  v_library public.studio_agreement_parts%ROWTYPE;
  v_parts jsonb := '[]'::jsonb;
  v_key text;
  v_payload jsonb;
  v_studio_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'composing from a template requires an authenticated author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The same visibility predicate agreement_templates_select states, asked
  -- here because this body is SECURITY DEFINER and that policy is not in
  -- force inside it.
  SELECT * INTO v_template FROM public.agreement_templates
  WHERE template_key = p_template_key
    AND (
      kind = 'seeded'
      OR (
        kind = 'studio'
        AND EXISTS (
          SELECT 1 FROM public.organizations AS studio
          WHERE studio.id = agreement_templates.studio_id
            AND studio.type = 'design_studio'
            AND studio.status = 'active'
            AND public.is_active_org_member(studio.id)
        )
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- R2 — a Template belongs to ONE studio, and so does the agreement it lands
  -- in. The visibility predicate above answers "may this member see it", which
  -- for a designer who belongs to two studios is a different question from
  -- "does it belong to THIS agreement's studio": without this block she could
  -- materialize studio B's private Template into studio A's paper, and the
  -- part rows would carry B's template key into A's Library forever.
  --
  -- R32 — the studio is resolved EXACTLY the way save_agreement_as_template
  -- resolves it, through _agreement_studio_id: the project's studio once the
  -- agreement is bound, else the lead designer's studios in 00563's order,
  -- with the actor's own standing asserted afterwards. Counting the studios
  -- the actor and the lead SHARE is what broke — a designer in two studios who
  -- is herself the lead answers "two" for both people and was refused every
  -- studio Template, her own included — and accepting any one of them is what
  -- leaked studio B's private paper onto studio A's agreement before that.
  IF v_template.studio_id IS NOT NULL THEN
    v_studio_id := public._agreement_studio_id(p_proposal_id, auth.uid());

    IF v_studio_id IS NULL THEN
      RAISE EXCEPTION 'this agreement does not sit in a studio you compose in, so a studio Template cannot be composed into it'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_template.studio_id <> v_studio_id THEN
      RAISE EXCEPTION 'template belongs to another studio'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_entry IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_template.parts) = 'array'
           THEN v_template.parts ELSE '[]'::jsonb END)
  LOOP
    IF jsonb_typeof(v_entry) <> 'object' THEN
      CONTINUE;
    END IF;
    v_key := NULLIF(btrim(COALESCE(v_entry->>'partKey', '')), '');

    IF v_key IS NOT NULL AND v_key LIKE 'studio.%' THEN
      -- A Library part the studio may since have deleted. A template that
      -- names one must not brick: the entry is skipped and the rest lands.
      v_library := NULL;
      SELECT * INTO v_library FROM public.studio_agreement_parts
      WHERE studio_id = v_template.studio_id AND part_key = v_key;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      v_payload := public._agreement_restore_list_item_ids(
        public.sanitize_agreement_part_payload(
          COALESCE(v_entry->'payload', v_library.payload)));

      v_parts := v_parts || jsonb_build_array(jsonb_build_object(
        'kind', v_library.kind,
        'variant', v_library.variant,
        'partKey', v_library.part_key,
        'title', COALESCE(NULLIF(btrim(COALESCE(v_entry->>'title', '')), ''),
                          v_library.title),
        'payload', v_payload,
        'required', COALESCE((v_entry->>'required')::boolean,
                             v_library.required_default),
        'clientVisible', COALESCE((v_entry->>'clientVisible')::boolean,
                                  v_library.client_visible_default),
        'sourceTemplateKey', v_template.template_key,
        'sourcePartId', v_library.id::text
      ));
    ELSE
      -- An inline body. This is how the seeded templates carry their parts.
      IF v_key IS NULL THEN
        CONTINUE;
      END IF;
      v_payload := public._agreement_restore_list_item_ids(
        public.sanitize_agreement_part_payload(
          COALESCE(v_entry->'payload', '{}'::jsonb)));

      v_parts := v_parts || jsonb_build_array(jsonb_build_object(
        'kind', btrim(COALESCE(v_entry->>'kind', '')),
        'variant', NULLIF(btrim(COALESCE(v_entry->>'variant', '')), ''),
        'partKey', v_key,
        'title', btrim(COALESCE(v_entry->>'title', '')),
        'payload', v_payload,
        'required', COALESCE((v_entry->>'required')::boolean, false),
        'clientVisible', COALESCE((v_entry->>'clientVisible')::boolean, true),
        'sourceTemplateKey', v_template.template_key,
        'sourcePartId', NULL
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_parts) = 0 THEN
    RAISE EXCEPTION 'this template has no parts left to compose from'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Replaces the draft's part set wholesale — that is what the room's
  -- confirmation warns about — and does it through the ONE writer, so the
  -- money projection, the fingerprint and the change history all run.
  PERFORM public.upsert_agreement_parts(
    p_proposal_id, v_parts, 'Materialized from ' || v_template.title);

  RETURN jsonb_array_length(v_parts);
END;
$$;
REVOKE ALL ON FUNCTION public.materialize_agreement_template(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.materialize_agreement_template(uuid, text)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 9 — The three seeded templates
--
-- patina.design_services reproduces PATINA_STANDARD_AGREEMENT_PARTS exactly —
-- the same nine keys, in the same order, with the same titles
-- materialize_standard_parts seeds (00575:3230-3283). A key that drifts here
-- makes the two doors into a composed agreement produce different part sets
-- for the same nine parts.
--
-- Inline bodies are today's literals from
-- service-agreement-drafting-room.tsx, byte for byte.
--
-- TWO MONEY FIGURES DEPART FROM THE BUILD SHEET, ON A RULING THAT OUTRANKS IT.
-- The sheet's inline bodies state a 50% furnishings deposit and a retainer of
-- 0. R28 (and R3-5 before it) rules that NOTHING THE DESIGNER DID NOT TYPE
-- PRINTS AS A TERM, and says so of EVERY seeded money part: the 50 is the
-- furnishings authorization's house fallback, not a term of this agreement,
-- and a retainer of 0 is an amount nobody wrote. W1 removed both from
-- materialize_standard_parts for exactly that reason (00575:3244-3262). A
-- template is the other door into the same nine parts, so both are seeded
-- UNSET here and the composed page prints "Not yet set" (R21) until the
-- designer states them. The billing cadence stays 'monthly' — R28 as amended
-- calls a cadence chosen, because its editor shows Monthly preselected on
-- every road in.
--
-- patina.design_build is NOT seeded. Wave 3.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.agreement_templates (
  template_key, kind, studio_id, class, title, parts, created_by
) VALUES (
  'patina.design_services', 'seeded', NULL, 'design_services',
  'Design services (Patina standard)',
  jsonb_build_array(
    jsonb_build_object(
      'partKey', 'patina.services', 'kind', 'clause', 'variant', NULL,
      'title', 'Services', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body',
        'Interior design services, including concept development, design documentation, and selections.')),
    jsonb_build_object(
      'partKey', 'patina.deliverables', 'kind', 'list', 'variant', NULL,
      'title', 'Deliverables', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('items', jsonb_build_array(
        jsonb_build_object('text', 'Concept presentation'),
        jsonb_build_object('text', 'Design documentation'),
        jsonb_build_object('text', 'Selection schedules')))),
    jsonb_build_object(
      'partKey', 'patina.exclusions', 'kind', 'list', 'variant', NULL,
      'title', 'Exclusions', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('items', jsonb_build_array(
        jsonb_build_object('text', 'Construction labor'),
        jsonb_build_object('text', 'Furnishings, freight, tax, and installation')))),
    jsonb_build_object(
      'partKey', 'patina.role_rates', 'kind', 'schedule', 'variant', 'rate_card',
      'title', 'Role rates', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('roles', '[]'::jsonb)),
    jsonb_build_object(
      'partKey', 'patina.ceiling', 'kind', 'schedule', 'variant', 'ceiling',
      'title', 'Ceiling', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('cents', NULL)),
    jsonb_build_object(
      'partKey', 'patina.deposit', 'kind', 'schedule', 'variant', 'procurement',
      'title', 'Furnishings deposit', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('depositPercent', NULL)),
    jsonb_build_object(
      'partKey', 'patina.retainer', 'kind', 'schedule', 'variant', 'retainer',
      'title', 'Retainer', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object(
        'cents', NULL, 'creditRule', 'credited', 'activationPolicy', 'immediate')),
    jsonb_build_object(
      'partKey', 'patina.cadence', 'kind', 'schedule', 'variant', 'cadence',
      'title', 'Billing cadence', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('cadence', 'monthly')),
    jsonb_build_object(
      'partKey', 'patina.terms', 'kind', 'clause', 'variant', NULL,
      'title', 'Terms', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body', ''))
  ),
  NULL
) ON CONFLICT (template_key) DO NOTHING;

INSERT INTO public.agreement_templates (
  template_key, kind, studio_id, class, title, parts, created_by
) VALUES (
  'patina.consultation', 'seeded', NULL, 'consultation',
  'Consultation / hourly',
  jsonb_build_array(
    jsonb_build_object(
      'partKey', 'patina.services', 'kind', 'clause', 'variant', NULL,
      'title', 'Services', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body',
        'Design consultation, billed hourly against the rates below.')),
    jsonb_build_object(
      'partKey', 'patina.role_rates', 'kind', 'schedule', 'variant', 'rate_card',
      'title', 'Role rates', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('roles', '[]'::jsonb)),
    jsonb_build_object(
      'partKey', 'patina.ceiling', 'kind', 'schedule', 'variant', 'ceiling',
      'title', 'Ceiling', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('cents', NULL)),
    jsonb_build_object(
      'partKey', 'patina.terms', 'kind', 'clause', 'variant', NULL,
      'title', 'Terms', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body', '')),
    jsonb_build_object(
      'partKey', 'patina.termination', 'kind', 'clause', 'variant', NULL,
      'title', 'Termination', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('body',
        'Either party may end this engagement in writing. Work performed to that date remains payable.'))
  ),
  NULL
) ON CONFLICT (template_key) DO NOTHING;

INSERT INTO public.agreement_templates (
  template_key, kind, studio_id, class, title, parts, created_by
) VALUES (
  'patina.furnishings_services', 'seeded', NULL, 'furnishings_services',
  'Furnishings only',
  jsonb_build_array(
    jsonb_build_object(
      'partKey', 'patina.services', 'kind', 'clause', 'variant', NULL,
      'title', 'Services', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body',
        'Furnishings selection, specification, and procurement management.')),
    jsonb_build_object(
      'partKey', 'patina.deliverables', 'kind', 'list', 'variant', NULL,
      'title', 'Deliverables', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('items', jsonb_build_array(
        jsonb_build_object('text', 'Selection schedules'),
        jsonb_build_object('text', 'Purchase orders and tracking')))),
    jsonb_build_object(
      'partKey', 'patina.procurement_terms', 'kind', 'schedule', 'variant', 'procurement',
      'title', 'Procurement terms', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('depositPercent', NULL)),
    jsonb_build_object(
      'partKey', 'patina.deposit', 'kind', 'clause', 'variant', NULL,
      'title', 'Deposit', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('body',
        'Each furnishings authorization names its own deposit and is signed separately.')),
    jsonb_build_object(
      'partKey', 'patina.change_orders', 'kind', 'clause', 'variant', NULL,
      'title', 'Change orders', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('body',
        'A change to an authorized line is a new authorization, priced and signed before it is ordered.')),
    jsonb_build_object(
      'partKey', 'patina.terms_of_sale', 'kind', 'clause', 'variant', NULL,
      'title', 'Terms of sale', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('body', '')),
    jsonb_build_object(
      'partKey', 'patina.termination', 'kind', 'clause', 'variant', NULL,
      'title', 'Termination', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('body',
        'Either party may end this engagement in writing. Orders already placed stand.'))
  ),
  NULL
) ON CONFLICT (template_key) DO NOTHING;

-- Only ONE procurement part may sit on an agreement (00575's duplicate
-- refusal reads kind + variant), so 'Furnishings only' carries exactly one
-- schedule/procurement and states its deposit as prose beside it.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 10 — What the objects are for
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.agreement_templates IS
  'The Library''s templates. kind=seeded rows are migration-owned Patina '
  'starters, immutable except under app.allow_patina_template_mutation; '
  'kind=studio rows belong to one active design studio. A template is an '
  'ordered list of part entries — an inline body, or a reference to a '
  'studio_agreement_parts row by its studio.* key. Composition is frozen '
  'after creation: W2 offers rename, delete and re-save, not an editor. '
  'Owners and admins write; every active member composes from it (R3).';

COMMENT ON COLUMN public.agreement_templates.kind IS
  'OWNERSHIP, not part kind: seeded (Patina) or studio. The part kind lives '
  'on each entry of `parts` and on studio_agreement_parts.kind.';

COMMENT ON COLUMN public.agreement_templates.class IS
  'Which agreement this template composes — design_services, consultation, '
  'furnishings_services, design_build. Free TEXT, no value CHECK: the vocab '
  'is code-resident in packages/types/src/agreement.ts '
  '(AGREEMENT_TEMPLATE_CLASSES), so it grows without a migration.';

COMMENT ON TABLE public.studio_agreement_parts IS
  'The Library''s parts: a studio''s own clauses, lists and schedules, keyed '
  'studio.*, written only through save_agreement_part so a payload can never '
  'reach the table unsanitized. Read by every active member; written and '
  'deleted by owners and admins (R3).';

COMMENT ON FUNCTION public.sanitize_agreement_part_payload(jsonb) IS
  'Recursively strips owner references — row ids, proposal/project/client/'
  'designer/studio/organization ids, authorship and timestamps, in both '
  'snake_case and camelCase — from a part payload, so a Library part and a '
  'template are detached from the agreement they came off.';

COMMIT;
