-- ═══════════════════════════════════════════════════════════════════════════
-- 00580 — the room concept render (Portal Polish · PP-7)
--
-- One image source the client page did not have. A studio may upload ONE
-- concept render per project room; the client page prints it above the room's
-- drawing under the on-image label "Concept · not installed" (R142, the client
-- imagery doctrine). Nothing here invents an installed photograph, and nothing
-- here is a second media rail: four nullable columns on the room the studio
-- already owns, and one PRIVATE bucket keyed by the room's own address.
--
-- Additive and inert until Wave 2 renders it. Every column is nullable with no
-- default and no backfill; a room with no render says nothing.
--
-- Lineage of the one function redefined here — RE-ANCHORED at branch time with
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*get_client_project_threshold" \
--     supabase/migrations/*.sql | sort | tail -1
-- and the body copied VERBATIM from that winner (00578:3451-3618) before the
-- delta was grafted:
--   get_client_project_threshold ............... 00565:447 → 00578:3451 → 00580
--
-- The delta is FOUR KEYS and nothing else. The payload carries room facts on
-- each selection already (roomId, roomName, both off the LEFT JOIN to
-- public.project_rooms that both branches already make); conceptRenderUrl,
-- conceptRenderCaption, conceptRenderUploadedAt and conceptRenderUploadedBy are
-- four more of them, read off that same join. No new join, no new branch, no
-- key removed or renamed. Trade cost, vendor cost, markup and bids stay out, as
-- 00565's comment on the function requires.
--
-- NOT in this file — verified against this database rather than assumed:
--   * No column-level grant. public.project_rooms carries three policies —
--     "Designers manage their project rooms" (FOR ALL, 00066:243),
--     "Clients can view their project rooms" (FOR SELECT, 00066:249) and
--     "project_rooms_studio_rw" (FOR ALL, 00316:148) — none of them column-
--     scoped, and `authenticated` already holds table-wide
--     SELECT/INSERT/UPDATE/DELETE. Four new columns ride all of it unchanged.
--   * No new RLS predicate. The storage policies below reuse
--     app_private.is_project_studio_member and app_private.is_project_client
--     (00565:146, 00565:173) exactly as written.
--
-- This file DOES add GRANT/REVOKE (the RPC's, restated), so
-- seed/00-legacy-grants.sql is regenerated in the same commit
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. the four columns ────────────────────────────────────────────────────

ALTER TABLE public.project_rooms
  ADD COLUMN IF NOT EXISTS concept_render_url         text,
  ADD COLUMN IF NOT EXISTS concept_render_caption     text,
  ADD COLUMN IF NOT EXISTS concept_render_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS concept_render_uploaded_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.project_rooms.concept_render_url IS
  'The OBJECT PATH of this room''s concept render inside the PRIVATE room-renders bucket — <project_id>/<room_id>/<filename> — never a public URL, because the bucket has none. A reader signs it. NULL until a studio uploads one, and then the room band prints no plate at all rather than a placeholder (R142).';

COMMENT ON COLUMN public.project_rooms.concept_render_caption IS
  'What the studio wants said under the render, in its own words. The on-image label "Concept · not installed" is NOT this column — the page prints that itself and it is not the studio''s to edit (R142). NULL when the studio said nothing.';

COMMENT ON COLUMN public.project_rooms.concept_render_uploaded_at IS
  'When the render landed. The client page dates the caption from this; NULL means the caption carries no date rather than today''s.';

COMMENT ON COLUMN public.project_rooms.concept_render_uploaded_by IS
  'Who uploaded it. auth.users because the uploader is whoever was signed in, and the client page names the STUDIO, not this person.';

-- ─── 2. the private bucket ──────────────────────────────────────────────────
--
-- The 00234_capture_media_bucket.sql / 00116_comms_attachments_bucket.sql
-- idiom: INSERT ... ON CONFLICT DO NOTHING, private, size-capped, mime-listed.
-- 8 MB is the ceiling the designer-side upload control states to the studio.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'room-renders',
  'room-renders',
  false,
  8388608, -- 8 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Layout, enforced by every policy below:
--   room-renders/<project_id>/<room_id>/<filename>
--
-- Both leading segments must be uuid-shaped before either is cast. The CASE is
-- what makes that safe: AND does not guarantee left-to-right evaluation, so a
-- guard written as a separate conjunct would still let a malformed prefix reach
-- ::uuid and raise 22P02 out of a policy. CASE does guarantee it, and
-- is_project_studio_member(NULL) / is_project_client(NULL) are both false, so a
-- path that does not match this shape is simply refused.
--
-- The second segment is shape-checked but deliberately NOT joined back to
-- public.project_rooms: that subquery would run under the caller's own RLS and
-- would silently narrow the studio predicate (project_rooms' studio policy
-- keys on projects.designer_id alone, while is_project_studio_member also
-- admits lead_designer_id and created_by). Only project members can write
-- under the prefix at all, so a stray room segment reaches nobody else.

DROP POLICY IF EXISTS "Room renders studio insert" ON storage.objects;
CREATE POLICY "Room renders studio insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'room-renders'
    AND app_private.is_project_studio_member(
      CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
           THEN ((storage.foldername(name))[1])::uuid END
    )
  );

DROP POLICY IF EXISTS "Room renders studio update" ON storage.objects;
CREATE POLICY "Room renders studio update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'room-renders'
    AND app_private.is_project_studio_member(
      CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
           THEN ((storage.foldername(name))[1])::uuid END
    )
  )
  WITH CHECK (
    bucket_id = 'room-renders'
    AND app_private.is_project_studio_member(
      CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
           THEN ((storage.foldername(name))[1])::uuid END
    )
  );

DROP POLICY IF EXISTS "Room renders studio delete" ON storage.objects;
CREATE POLICY "Room renders studio delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'room-renders'
    AND app_private.is_project_studio_member(
      CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
           THEN ((storage.foldername(name))[1])::uuid END
    )
  );

-- The client reads her own house's renders; so does the studio that made them.
DROP POLICY IF EXISTS "Room renders household read" ON storage.objects;
CREATE POLICY "Room renders household read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'room-renders'
    AND (
      app_private.is_project_studio_member(
        CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
             THEN ((storage.foldername(name))[1])::uuid END
      )
      OR app_private.is_project_client(
        CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
             THEN ((storage.foldername(name))[1])::uuid END
      )
    )
  );

-- ─── 3. the reader carries the four keys ────────────────────────────────────
--
-- Grafted VERBATIM from 00578_design_build_kind.sql:3451-3618 (itself grafted
-- from 00565:447-614), then the four keys below and nothing else.

CREATE OR REPLACE FUNCTION public.get_client_project_threshold(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  -- 00441's preamble, verbatim.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT (
    v_project.client_id = v_actor
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_project.id,
    'projectName', v_project.name,
    -- 00423's origin test: the project stands on a signed design-services
    -- instrument, or it is a legacy project the commercial rail never touched.
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents AS doc
      WHERE doc.project_id = p_project_id
        AND doc.is_origin
        AND doc.document_kind IN ('design_services', 'design_build')
    ) THEN 'commercial' ELSE 'legacy' END,

    -- ── furnishings: the FROZEN authorization snapshot the client signed ──
    -- Money comes from furnishing_authorization_items.client_* — the columns
    -- the client put her name to — never from the live working row.
    'selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'furnishings',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, authorization_item.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', authorization_item.quantity,
        'clientUnitPriceCents', authorization_item.client_unit_price_cents,
        'clientLineTotalCents', authorization_item.client_line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', NULL,
        -- The block exists because the CLIENT signed an allowance — that is the
        -- frozen snapshot's business (authorization_item.item_type), and it
        -- never changes.
        --
        -- 00423 resolved it off the LIVE schedule line (item.item_type = 'fixed'
        -- → item.line_total_cents). That is the one path on which the restored
        -- payload would still have handed the client an unsigned working-row
        -- figure the studio can move under her, and it is withdrawn here: an
        -- allowance is RESOLVED when a later EXECUTED authorization snapshots the
        -- same live line as 'fixed', and the resolved figure is that snapshot's
        -- own client_line_total_cents. Until such an instrument exists the
        -- allowance is unresolved and this is null.
        'allowance', CASE WHEN authorization_item.item_type = 'allowance' THEN jsonb_build_object(
          'ceilingCents', authorization_item.client_line_total_cents,
          'resolvedCents', (
            SELECT resolution.client_line_total_cents
            FROM public.furnishing_authorization_items AS resolution
            JOIN public.project_commercial_documents AS resolution_doc
              ON resolution_doc.id = resolution.commercial_document_id
             AND resolution_doc.executed_at IS NOT NULL
            JOIN public.proposals AS resolution_proposal
              ON resolution_proposal.id = resolution_doc.proposal_id
             AND resolution_proposal.commercial_state = 'executed'
            WHERE resolution.source_ffe_item_id = item.id
              AND resolution.item_type = 'fixed'
            ORDER BY resolution_doc.executed_at DESC, resolution.id
            LIMIT 1
          )
        ) ELSE NULL END,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', doc.wave_name,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        'imageUrl', product.images[1],
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.furnishing_authorization_items AS authorization_item
        ON authorization_item.id = item.source_authorization_item_id
      JOIN public.project_commercial_documents AS doc
        ON doc.id = authorization_item.commercial_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)

    -- ── trade: the presence line under an executed trade scope ────────────
    -- clientLineTotalCents reads the live row on purpose: 00423's
    -- guard_trade_presence_line_lock freezes exactly that money once the scope
    -- is executed, which is why this branch has no snapshot table of its own.
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'trade',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, section.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', item.quantity,
        'clientUnitPriceCents', NULL,
        'clientLineTotalCents', item.line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', terms.progress_state,
        'allowance', NULL,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', proposal.title,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        'imageUrl', product.images[1],
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.project_commercial_documents AS doc
        ON doc.id = item.trade_scope_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      LEFT JOIN LATERAL (
        SELECT scope_section.room_name
        FROM public.trade_scope_sections AS scope_section
        WHERE scope_section.proposal_id = proposal.id
          AND scope_section.project_room_id IS NOT DISTINCT FROM item.project_room_id
        ORDER BY scope_section.sort_order, scope_section.id
        LIMIT 1
      ) AS section ON true
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)
  );
END;
$$;

-- The grants 00565:616-619 set. CREATE OR REPLACE preserves an existing ACL, so
-- these are a restatement rather than a repair — stated anyway because the
-- post-2026-05-30 rule is that a migration names what its callers may do
-- instead of inheriting it, and because seed/00-legacy-grants.sql replays this
-- file to rebuild local ACLs.
REVOKE ALL ON FUNCTION public.get_client_project_threshold(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_threshold(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_project_threshold(uuid) IS
  'The Client Page''s reader: what a client authorized on a project — furnishings snapshot lines (kind furnishings, money from the signed furnishing_authorization_items snapshot) and trade scope presence lines (kind trade, with tradeJourney). Trade cost, vendor cost, markup, purchase-order fields and bids never appear, and no live unsigned project_ffe_items money on any path. 00580 adds four room facts to each line — conceptRenderUrl, conceptRenderCaption, conceptRenderUploadedAt, conceptRenderUploadedBy — off the project_rooms join both branches already make; conceptRenderUrl is an object path inside the PRIVATE room-renders bucket, not a URL. Carries 00423''s client-facing payload over 00441''s authorization preamble, key names and ordering. public.get_client_project_selections is deliberately NOT redefined — the iOS Patina app reads it and must not narrow.';

COMMIT;
