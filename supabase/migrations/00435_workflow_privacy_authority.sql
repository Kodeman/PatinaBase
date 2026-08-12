-- ═══════════════════════════════════════════════════════════════════════════
-- 00435 — Workflow privacy and immutable release authority
--
-- Working board rows/media are studio-private. Client and guest surfaces read
-- only released projections: issued proposal compositions, frozen project
-- snapshots, or a board payload captured when its share token is minted.
-- Snapshot/ledger tables are protected at the table edge because service_role
-- bypasses RLS. Privileged INSERTs additionally prove their canonical source
-- and lifecycle state; a postgres-owned function is not sufficient by itself.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Added before the Storage helper definitions because released-object
-- detection includes frozen share payloads in the same migration.
ALTER TABLE public.document_shares
  ADD COLUMN IF NOT EXISTS board_payload jsonb,
  ADD COLUMN IF NOT EXISTS board_payload_hash text;

ALTER TABLE public.board_templates
  ADD COLUMN IF NOT EXISTS media_references_validated_at timestamptz;

-- ── 1. Canonical proposal-board Storage references ───────────────────────

CREATE OR REPLACE FUNCTION public.board_storage_reference_path(p_reference text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_value text := btrim(COALESCE(p_reference, ''));
  v_marker text;
  v_position integer;
BEGIN
  IF v_value = '' THEN
    RETURN NULL;
  END IF;

  v_value := split_part(v_value, '?', 1);
  FOREACH v_marker IN ARRAY ARRAY[
    '/storage/v1/object/public/proposal-mood-boards/',
    '/storage/v1/object/authenticated/proposal-mood-boards/',
    '/storage/v1/object/sign/proposal-mood-boards/',
    '/storage/v1/render/image/public/proposal-mood-boards/',
    '/storage/v1/render/image/authenticated/proposal-mood-boards/',
    '/storage/v1/render/image/sign/proposal-mood-boards/'
  ]
  LOOP
    v_position := strpos(v_value, v_marker);
    IF v_position > 0 THEN
      RETURN substring(v_value FROM v_position + char_length(v_marker));
    END IF;
  END LOOP;

  IF v_value ~* '^https?://' THEN
    RETURN NULL;
  END IF;

  v_value := ltrim(v_value, '/');
  IF v_value LIKE 'proposal-mood-boards/%' THEN
    v_value := substring(v_value FROM char_length('proposal-mood-boards/') + 1);
  END IF;
  IF v_value = '' OR v_value ~ '(^|/)\.\.(/|$)' THEN
    RETURN NULL;
  END IF;
  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.board_media_owners_share_studio(
  p_source_designer uuid,
  p_target_designer uuid,
  p_target_studio uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_source_designer IS NOT NULL AND (
    (p_target_studio IS NULL AND p_source_designer = p_target_designer)
    OR EXISTS (
      SELECT 1
      FROM public.organizations AS studio
      JOIN public.organization_members AS source_member
        ON source_member.organization_id = studio.id
       AND source_member.user_id = p_source_designer
       AND source_member.status = 'active'
       AND source_member.role <> 'guest'
      JOIN public.organization_members AS target_member
        ON target_member.organization_id = studio.id
       AND target_member.status = 'active'
       AND target_member.role <> 'guest'
      WHERE studio.type = 'design_studio'
        AND studio.status = 'active'
        AND (
          (p_target_studio IS NOT NULL
            AND studio.id = p_target_studio
            AND target_member.user_id = p_source_designer)
          OR (p_target_studio IS NULL
            AND target_member.user_id = p_target_designer)
        )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.board_json_has_explicit_media_reference(
  p_value jsonb,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE nodes(field_name, value) AS (
    SELECT NULL::text, COALESCE(p_value, 'null'::jsonb)
    UNION ALL
    SELECT child.field_name, child.value
    FROM nodes AS parent
    CROSS JOIN LATERAL (
      SELECT NULL::text AS field_name, element AS value
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(parent.value) = 'array'
          THEN parent.value ELSE '[]'::jsonb END
      ) AS element
      UNION ALL
      SELECT entry.key, entry.value
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(parent.value) = 'object'
          THEN parent.value ELSE '{}'::jsonb END
      ) AS entry
    ) AS child
  )
  SELECT EXISTS (
    SELECT 1
    FROM nodes
    WHERE field_name IN (
      'cover_image_url', 'cover_url', 'image_url', 'thumbnail_url',
      'original_image_url', 'source_image_url', 'coverImageUrl', 'imageUrl',
      'thumbnailUrl', 'originalImageUrl', 'sourceImageUrl'
    )
      AND jsonb_typeof(value) = 'string'
      AND public.board_storage_reference_path(value #>> '{}') = p_object_name
  );
$$;

CREATE OR REPLACE FUNCTION public.board_media_reference_has_live_source(
  p_reference text,
  p_target_designer uuid DEFAULT NULL,
  p_target_studio uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_path text := public.board_storage_reference_path(p_reference);
  v_parts text[];
BEGIN
  -- Empty and external HTTPS media never crosses this private bucket boundary.
  IF v_path IS NULL THEN
    RETURN true;
  END IF;
  IF num_nonnulls(p_target_designer, p_target_studio) <> 1 THEN
    RETURN false;
  END IF;

  v_parts := storage.foldername(v_path);
  IF array_length(v_parts, 1) < 3 THEN
    RETURN false;
  END IF;

  IF v_parts[2] = 'boards' AND EXISTS (
    SELECT 1
    FROM public.proposal_boards AS source_board
    LEFT JOIN public.proposals AS source_proposal
      ON source_proposal.id = source_board.proposal_id
    LEFT JOIN public.projects AS source_project
      ON source_project.id = source_board.project_id
    LEFT JOIN public.profiles AS media_owner
      ON media_owner.id::text = v_parts[1]
    WHERE source_board.id::text = v_parts[3]
      AND (
        v_parts[1] = COALESCE(
          source_board.proposal_id, source_board.project_id
        )::text
        OR public.board_media_owners_share_studio(
          media_owner.id,
          COALESCE(source_proposal.designer_id, source_project.designer_id),
          NULL
        )
      )
      AND public.board_media_owners_share_studio(
        COALESCE(source_proposal.designer_id, source_project.designer_id),
        p_target_designer,
        p_target_studio
      )
  ) THEN
    RETURN true;
  END IF;

  IF v_parts[2] = 'palettes' AND EXISTS (
    SELECT 1
    FROM public.proposals AS source_proposal
    WHERE source_proposal.id::text = v_parts[1]
      AND public.board_media_owners_share_studio(
        source_proposal.designer_id, p_target_designer, p_target_studio
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.board_media_reference_is_allowed(
  p_reference text,
  p_target_designer uuid DEFAULT NULL,
  p_target_studio uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path text := public.board_storage_reference_path(p_reference);
BEGIN
  IF v_path IS NULL THEN
    RETURN true;
  END IF;
  IF public.board_media_reference_has_live_source(
    p_reference, p_target_designer, p_target_studio
  ) THEN
    RETURN true;
  END IF;

  -- Only a server-validated template can preserve authority after its live
  -- source board is deleted. Unverified pre-00435 templates fail closed.
  RETURN EXISTS (
    SELECT 1
    FROM public.board_templates AS template
    WHERE template.kind = 'studio'
      AND template.media_references_validated_at IS NOT NULL
      AND (
        (p_target_studio IS NOT NULL AND template.studio_id = p_target_studio)
        OR (p_target_studio IS NULL AND EXISTS (
          SELECT 1
          FROM public.organization_members AS target_member
          WHERE target_member.organization_id = template.studio_id
            AND target_member.user_id = p_target_designer
            AND target_member.status = 'active'
            AND target_member.role <> 'guest'
        ))
      )
      AND (
        public.board_storage_reference_path(template.cover_url) = v_path
        OR public.board_json_has_explicit_media_reference(template.items, v_path)
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.board_json_media_references_have_live_source(
  p_value jsonb,
  p_target_designer uuid DEFAULT NULL,
  p_target_studio uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE nodes(field_name, value) AS (
    SELECT NULL::text, COALESCE(p_value, 'null'::jsonb)
    UNION ALL
    SELECT child.field_name, child.value
    FROM nodes AS parent
    CROSS JOIN LATERAL (
      SELECT NULL::text AS field_name, element AS value
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(parent.value) = 'array'
          THEN parent.value ELSE '[]'::jsonb END
      ) AS element
      UNION ALL
      SELECT entry.key, entry.value
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(parent.value) = 'object'
          THEN parent.value ELSE '{}'::jsonb END
      ) AS entry
    ) AS child
  )
  SELECT NOT EXISTS (
    SELECT 1
    FROM nodes
    WHERE field_name IN (
      'cover_image_url', 'cover_url', 'image_url', 'thumbnail_url',
      'original_image_url', 'source_image_url', 'coverImageUrl', 'imageUrl',
      'thumbnailUrl', 'originalImageUrl', 'sourceImageUrl'
    )
      AND jsonb_typeof(value) = 'string'
      AND NOT public.board_media_reference_has_live_source(
        value #>> '{}', p_target_designer, p_target_studio
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.board_json_media_references_are_allowed(
  p_value jsonb,
  p_target_designer uuid DEFAULT NULL,
  p_target_studio uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE nodes(field_name, value) AS (
    SELECT NULL::text, COALESCE(p_value, 'null'::jsonb)
    UNION ALL
    SELECT child.field_name, child.value
    FROM nodes AS parent
    CROSS JOIN LATERAL (
      SELECT NULL::text AS field_name, element AS value
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(parent.value) = 'array'
          THEN parent.value ELSE '[]'::jsonb END
      ) AS element
      UNION ALL
      SELECT entry.key, entry.value
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(parent.value) = 'object'
          THEN parent.value ELSE '{}'::jsonb END
      ) AS entry
    ) AS child
  )
  SELECT NOT EXISTS (
    SELECT 1
    FROM nodes
    WHERE field_name IN (
      'cover_image_url', 'cover_url', 'image_url', 'thumbnail_url',
      'original_image_url', 'source_image_url', 'coverImageUrl', 'imageUrl',
      'thumbnailUrl', 'originalImageUrl', 'sourceImageUrl'
    )
      AND jsonb_typeof(value) = 'string'
      AND NOT public.board_media_reference_is_allowed(
        value #>> '{}', p_target_designer, p_target_studio
      )
  );
$$;

UPDATE public.board_templates AS template
SET media_references_validated_at = statement_timestamp()
WHERE template.kind = 'studio'
  AND public.board_media_reference_has_live_source(
    template.cover_url, NULL, template.studio_id
  )
  AND public.board_json_media_references_have_live_source(
    template.items, NULL, template.studio_id
  );

CREATE OR REPLACE FUNCTION public.guard_proposal_board_media_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_target_designer uuid;
  v_owner_id uuid;
  v_path text;
  v_parts text[];
BEGIN
  SELECT COALESCE(proposal.designer_id, project.designer_id),
         COALESCE(NEW.proposal_id, NEW.project_id)
  INTO v_target_designer, v_owner_id
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.proposals AS proposal ON proposal.id = NEW.proposal_id
  LEFT JOIN public.projects AS project ON project.id = NEW.project_id;

  IF v_target_designer IS NULL OR v_owner_id IS NULL THEN
    RAISE EXCEPTION 'board media owner is not authoritative'
      USING ERRCODE = 'check_violation';
  END IF;

  v_path := public.board_storage_reference_path(NEW.cover_image_url);
  IF v_path IS NULL THEN
    RETURN NEW;
  END IF;
  v_parts := storage.foldername(v_path);
  IF array_length(v_parts, 1) >= 3
     AND v_parts[1] = v_owner_id::text
     AND v_parts[2] = 'boards'
     AND v_parts[3] = NEW.id::text
  THEN
    RETURN NEW;
  END IF;
  IF NOT public.board_media_reference_is_allowed(
    NEW.cover_image_url, v_target_designer
  ) THEN
    RAISE EXCEPTION 'board cover references private media outside its design studio'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_proposal_board_item_media_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_designer uuid;
BEGIN
  SELECT COALESCE(proposal.designer_id, project.designer_id)
  INTO v_target_designer
  FROM public.proposal_boards AS board
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = board.project_id
  WHERE board.id = NEW.board_id;

  IF v_target_designer IS NULL
     OR NOT public.board_media_reference_is_allowed(
       NEW.image_url, v_target_designer
     )
     OR NOT public.board_json_media_references_are_allowed(
       NEW.data, v_target_designer
     )
  THEN
    RAISE EXCEPTION 'board item references private media outside its design studio'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_proposal_palette_media_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_designer uuid;
BEGIN
  SELECT proposal.designer_id INTO v_target_designer
  FROM public.proposals AS proposal
  WHERE proposal.id = NEW.proposal_id;
  IF v_target_designer IS NULL
     OR NOT public.board_media_reference_is_allowed(
       NEW.source_image_url, v_target_designer
     )
  THEN
    RAISE EXCEPTION 'palette references private media outside its design studio'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_board_template_media_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.kind = 'seeded' THEN
    IF public.board_storage_reference_path(NEW.cover_url) IS NOT NULL
       OR NOT public.board_json_media_references_are_allowed(
         NEW.items, NULL, NULL
       )
    THEN
      RAISE EXCEPTION 'seeded templates cannot carry private studio media'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.media_references_validated_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.studio_id IS NULL
     OR NOT public.board_media_reference_is_allowed(
       NEW.cover_url, NULL, NEW.studio_id
     )
     OR NOT public.board_json_media_references_are_allowed(
       NEW.items, NULL, NEW.studio_id
     )
  THEN
    RAISE EXCEPTION 'board template references private media outside its design studio'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.media_references_validated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_proposal_board_media_reference_trg
  ON public.proposal_boards;
CREATE TRIGGER a_guard_proposal_board_media_reference_trg
BEFORE INSERT OR UPDATE ON public.proposal_boards
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_board_media_reference();

DROP TRIGGER IF EXISTS a_guard_proposal_board_item_media_reference_trg
  ON public.proposal_board_items;
CREATE TRIGGER a_guard_proposal_board_item_media_reference_trg
BEFORE INSERT OR UPDATE ON public.proposal_board_items
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_board_item_media_reference();

DROP TRIGGER IF EXISTS a_guard_proposal_palette_media_reference_trg
  ON public.proposal_palettes;
CREATE TRIGGER a_guard_proposal_palette_media_reference_trg
BEFORE INSERT OR UPDATE ON public.proposal_palettes
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_palette_media_reference();

DROP TRIGGER IF EXISTS a_guard_board_template_media_reference_trg
  ON public.board_templates;
CREATE TRIGGER a_guard_board_template_media_reference_trg
BEFORE INSERT OR UPDATE ON public.board_templates
FOR EACH ROW EXECUTE FUNCTION public.guard_board_template_media_reference();

CREATE OR REPLACE FUNCTION public.board_media_projection_is_allowed(p_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
    LEFT JOIN public.projects AS project ON project.id = board.project_id
    WHERE board.id = p_board_id
      AND public.board_media_reference_is_allowed(
        board.cover_image_url,
        COALESCE(proposal.designer_id, project.designer_id)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.proposal_board_items AS item
        WHERE item.board_id = board.id
          AND (
            NOT public.board_media_reference_is_allowed(
              item.image_url,
              COALESCE(proposal.designer_id, project.designer_id)
            )
            OR NOT public.board_json_media_references_are_allowed(
              item.data,
              COALESCE(proposal.designer_id, project.designer_id)
            )
          )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_process_board_item_media(
  p_board_id uuid,
  p_item_id uuid,
  p_reference text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.proposal_board_items AS item
    JOIN public.proposal_boards AS board ON board.id = item.board_id
    LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
    LEFT JOIN public.projects AS project ON project.id = board.project_id
    WHERE item.id = p_item_id
      AND board.id = p_board_id
      AND public.is_design_studio_comember(
        COALESCE(proposal.designer_id, project.designer_id)
      )
      AND p_reference IN (
        item.image_url,
        item.data->>'image_url',
        item.data->>'original_image_url',
        item.data->>'thumbnail_url'
      )
      AND public.board_media_reference_is_allowed(
        p_reference,
        COALESCE(proposal.designer_id, project.designer_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.board_json_references_storage_object(
  p_value jsonb,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE values_to_scan(value) AS (
    SELECT COALESCE(p_value, 'null'::jsonb)
    UNION ALL
    SELECT child.value
    FROM values_to_scan AS parent
    CROSS JOIN LATERAL (
      SELECT element AS value
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(parent.value) = 'array'
          THEN parent.value ELSE '[]'::jsonb END
      ) AS element
      UNION ALL
      SELECT entry.value
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(parent.value) = 'object'
          THEN parent.value ELSE '{}'::jsonb END
      ) AS entry
    ) AS child
  )
  SELECT EXISTS (
    SELECT 1
    FROM values_to_scan
    WHERE jsonb_typeof(value) = 'string'
      AND public.board_storage_reference_path(value #>> '{}') = p_object_name
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_board_storage_object(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    -- Working-media author leg: exact active design-studio co-members only.
    EXISTS (
      SELECT 1
      FROM public.proposal_boards AS board
      LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
      LEFT JOIN public.projects AS project ON project.id = board.project_id
      LEFT JOIN public.profiles AS media_owner
        ON media_owner.id::text = (storage.foldername(p_object_name))[1]
      WHERE (storage.foldername(p_object_name))[2] = 'boards'
        AND board.id::text = (storage.foldername(p_object_name))[3]
        AND (
          (storage.foldername(p_object_name))[1] = COALESCE(
            board.proposal_id, board.project_id
          )::text
          OR public.board_media_owners_share_studio(
            media_owner.id,
            COALESCE(proposal.designer_id, project.designer_id),
            NULL
          )
        )
        AND (
          (board.proposal_id IS NOT NULL
            AND public.is_design_studio_comember(proposal.designer_id))
          OR (board.project_id IS NOT NULL
            AND public.is_design_studio_comember(project.designer_id))
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.proposal_palettes AS palette
      JOIN public.proposals AS proposal ON proposal.id = palette.proposal_id
      WHERE public.board_storage_reference_path(palette.source_image_url) = p_object_name
        AND public.is_design_studio_comember(proposal.designer_id)
        AND public.board_media_reference_is_allowed(
          palette.source_image_url, proposal.designer_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE (storage.foldername(p_object_name))[2] = 'palettes'
        AND proposal.id::text = (storage.foldername(p_object_name))[1]
        AND public.is_design_studio_comember(proposal.designer_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.board_templates AS template
      WHERE template.kind = 'studio'
        AND template.media_references_validated_at IS NOT NULL
        AND public.is_active_org_member(template.studio_id)
        AND (
          public.board_storage_reference_path(template.cover_url) = p_object_name
          OR public.board_json_has_explicit_media_reference(
            template.items, p_object_name
          )
        )
    )
    OR
    -- Issued proposal media: the client may sign only an exact reference on
    -- the immutable issued composition, never another key in the same folder.
    EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      JOIN public.proposal_boards AS board ON board.proposal_id = proposal.id
      WHERE proposal.client_id = auth.uid()
        AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
        AND board.status = 'active'
        AND public.board_media_projection_is_allowed(board.id)
        AND (
          public.board_storage_reference_path(board.cover_image_url) = p_object_name
          OR EXISTS (
            SELECT 1 FROM public.proposal_board_items AS item
            WHERE item.board_id = board.id
              AND (
                public.board_storage_reference_path(item.image_url) = p_object_name
                OR public.board_json_has_explicit_media_reference(
                  item.data, p_object_name
                )
              )
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      JOIN public.proposal_palettes AS palette ON palette.proposal_id = proposal.id
      WHERE proposal.client_id = auth.uid()
        AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
        AND public.board_storage_reference_path(palette.source_image_url) = p_object_name
        AND public.board_media_reference_is_allowed(
          palette.source_image_url, proposal.designer_id
        )
    )
    OR
    -- Activated/signed project snapshots are the project client's release.
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      JOIN public.project_boards AS snapshot ON snapshot.project_id = project.id
      WHERE project.client_id = auth.uid()
        AND public.board_media_reference_is_allowed(
          snapshot.cover_image_url, project.designer_id
        )
        AND public.board_json_media_references_are_allowed(
          snapshot.items, project.designer_id
        )
        AND (
          public.board_storage_reference_path(snapshot.cover_image_url) = p_object_name
          OR public.board_json_has_explicit_media_reference(
            snapshot.items, p_object_name
          )
        )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_released_board_storage_object(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      JOIN public.proposal_boards AS board ON board.proposal_id = proposal.id
      WHERE proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
        AND board.status = 'active'
        AND public.board_media_projection_is_allowed(board.id)
        AND (
          public.board_storage_reference_path(board.cover_image_url) = p_object_name
          OR EXISTS (
            SELECT 1 FROM public.proposal_board_items AS item
            WHERE item.board_id = board.id
              AND (
                public.board_storage_reference_path(item.image_url) = p_object_name
                OR public.board_json_has_explicit_media_reference(
                  item.data, p_object_name
                )
              )
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_boards AS snapshot
      JOIN public.projects AS project ON project.id = snapshot.project_id
      WHERE public.board_media_reference_is_allowed(
          snapshot.cover_image_url, project.designer_id
        )
        AND public.board_json_media_references_are_allowed(
          snapshot.items, project.designer_id
        )
        AND (
          public.board_storage_reference_path(snapshot.cover_image_url) = p_object_name
          OR public.board_json_has_explicit_media_reference(
            snapshot.items, p_object_name
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.document_shares AS share
      JOIN public.proposal_boards AS board ON board.id = share.board_id
      LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
      LEFT JOIN public.projects AS project ON project.id = board.project_id
      WHERE share.board_id IS NOT NULL
        AND share.board_payload IS NOT NULL
        AND public.board_json_media_references_are_allowed(
          share.board_payload,
          COALESCE(proposal.designer_id, project.designer_id)
        )
        AND public.board_json_has_explicit_media_reference(
          share.board_payload, p_object_name
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      JOIN public.proposal_palettes AS palette ON palette.proposal_id = proposal.id
      WHERE proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
        AND public.board_storage_reference_path(palette.source_image_url) = p_object_name
        AND public.board_media_reference_is_allowed(
          palette.source_image_url, proposal.designer_id
        )
    );
$$;

REVOKE ALL ON FUNCTION public.board_storage_reference_path(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_storage_reference_path(text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_json_references_storage_object(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_media_owners_share_studio(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_json_has_explicit_media_reference(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_media_reference_is_allowed(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_media_reference_has_live_source(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_json_media_references_are_allowed(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_json_media_references_have_live_source(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_media_projection_is_allowed(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_media_projection_is_allowed(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.can_process_board_item_media(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_process_board_item_media(uuid, uuid, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_proposal_board_media_reference()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_proposal_board_item_media_reference()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_proposal_palette_media_reference()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_board_template_media_reference()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_read_board_storage_object(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_board_storage_object(text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_released_board_storage_object(text)
  FROM PUBLIC, anon, authenticated, service_role;

UPDATE storage.buckets
SET public = false
WHERE id = 'proposal-mood-boards';

DROP POLICY IF EXISTS "Proposal mood boards are publicly readable"
  ON storage.objects;
DROP POLICY IF EXISTS "Authorized actors can read proposal mood board media"
  ON storage.objects;
CREATE POLICY "Authorized actors can read proposal mood board media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND public.can_read_board_storage_object(storage.objects.name)
  );

-- Correct the historical inner-table `name` shadowing while reasserting the
-- author policies. Released keys cannot be replaced or removed.
DROP POLICY IF EXISTS "Designers can replace their proposal mood boards"
  ON storage.objects;
CREATE POLICY "Designers can replace their proposal mood boards"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND NOT public.is_released_board_storage_object(storage.objects.name)
    AND (
      EXISTS (
        SELECT 1
        FROM public.proposal_boards AS board
        JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
        LEFT JOIN public.profiles AS media_owner
          ON media_owner.id::text = (storage.foldername(storage.objects.name))[1]
        WHERE (storage.foldername(storage.objects.name))[2] = 'boards'
          AND board.id::text = (storage.foldername(storage.objects.name))[3]
          AND public.is_design_studio_comember(proposal.designer_id)
          AND (
            (storage.foldername(storage.objects.name))[1] = proposal.id::text
            OR public.board_media_owners_share_studio(
              media_owner.id, proposal.designer_id, NULL
            )
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.proposals AS proposal
        WHERE (storage.foldername(storage.objects.name))[2] = 'palettes'
          AND proposal.id::text = (storage.foldername(storage.objects.name))[1]
          AND public.is_design_studio_comember(proposal.designer_id)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'proposal-mood-boards'
    AND NOT public.is_released_board_storage_object(storage.objects.name)
    AND (
      EXISTS (
        SELECT 1
        FROM public.proposal_boards AS board
        JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
        LEFT JOIN public.profiles AS media_owner
          ON media_owner.id::text = (storage.foldername(storage.objects.name))[1]
        WHERE (storage.foldername(storage.objects.name))[2] = 'boards'
          AND board.id::text = (storage.foldername(storage.objects.name))[3]
          AND public.is_design_studio_comember(proposal.designer_id)
          AND (
            (storage.foldername(storage.objects.name))[1] = proposal.id::text
            OR public.board_media_owners_share_studio(
              media_owner.id, proposal.designer_id, NULL
            )
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.proposals AS proposal
        WHERE (storage.foldername(storage.objects.name))[2] = 'palettes'
          AND proposal.id::text = (storage.foldername(storage.objects.name))[1]
          AND public.is_design_studio_comember(proposal.designer_id)
      )
    )
  );

DROP POLICY IF EXISTS "Designers can delete their proposal mood boards"
  ON storage.objects;
CREATE POLICY "Designers can delete their proposal mood boards"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND NOT public.is_released_board_storage_object(storage.objects.name)
    AND (
      EXISTS (
        SELECT 1
        FROM public.proposal_boards AS board
        JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
        LEFT JOIN public.profiles AS media_owner
          ON media_owner.id::text = (storage.foldername(storage.objects.name))[1]
        WHERE (storage.foldername(storage.objects.name))[2] = 'boards'
          AND board.id::text = (storage.foldername(storage.objects.name))[3]
          AND public.is_design_studio_comember(proposal.designer_id)
          AND (
            (storage.foldername(storage.objects.name))[1] = proposal.id::text
            OR public.board_media_owners_share_studio(
              media_owner.id, proposal.designer_id, NULL
            )
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.proposals AS proposal
        WHERE (storage.foldername(storage.objects.name))[2] = 'palettes'
          AND proposal.id::text = (storage.foldername(storage.objects.name))[1]
          AND public.is_design_studio_comember(proposal.designer_id)
      )
    )
  );

DROP POLICY IF EXISTS "Designers can replace project board images"
  ON storage.objects;
CREATE POLICY "Designers can replace project board images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND NOT public.is_released_board_storage_object(storage.objects.name)
    AND EXISTS (
      SELECT 1
      FROM public.proposal_boards AS board
      JOIN public.projects AS project ON project.id = board.project_id
      LEFT JOIN public.profiles AS media_owner
        ON media_owner.id::text = (storage.foldername(storage.objects.name))[1]
      WHERE (storage.foldername(storage.objects.name))[2] = 'boards'
        AND board.id::text = (storage.foldername(storage.objects.name))[3]
        AND public.is_design_studio_comember(project.designer_id)
        AND (
          (storage.foldername(storage.objects.name))[1] = project.id::text
          OR public.board_media_owners_share_studio(
            media_owner.id, project.designer_id, NULL
          )
        )
    )
  )
  WITH CHECK (
    bucket_id = 'proposal-mood-boards'
    AND NOT public.is_released_board_storage_object(storage.objects.name)
    AND EXISTS (
      SELECT 1
      FROM public.proposal_boards AS board
      JOIN public.projects AS project ON project.id = board.project_id
      LEFT JOIN public.profiles AS media_owner
        ON media_owner.id::text = (storage.foldername(storage.objects.name))[1]
      WHERE (storage.foldername(storage.objects.name))[2] = 'boards'
        AND board.id::text = (storage.foldername(storage.objects.name))[3]
        AND public.is_design_studio_comember(project.designer_id)
        AND (
          (storage.foldername(storage.objects.name))[1] = project.id::text
          OR public.board_media_owners_share_studio(
            media_owner.id, project.designer_id, NULL
          )
        )
    )
  );

DROP POLICY IF EXISTS "Designers can delete project board images"
  ON storage.objects;
CREATE POLICY "Designers can delete project board images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND NOT public.is_released_board_storage_object(storage.objects.name)
    AND EXISTS (
      SELECT 1
      FROM public.proposal_boards AS board
      JOIN public.projects AS project ON project.id = board.project_id
      LEFT JOIN public.profiles AS media_owner
        ON media_owner.id::text = (storage.foldername(storage.objects.name))[1]
      WHERE (storage.foldername(storage.objects.name))[2] = 'boards'
        AND board.id::text = (storage.foldername(storage.objects.name))[3]
        AND public.is_design_studio_comember(project.designer_id)
        AND (
          (storage.foldername(storage.objects.name))[1] = project.id::text
          OR public.board_media_owners_share_studio(
            media_owner.id, project.designer_id, NULL
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_released_board_storage_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
BEGIN
  IF OLD.bucket_id = 'proposal-mood-boards'
     AND public.is_released_board_storage_object(OLD.name)
  THEN
    RAISE EXCEPTION 'released board media is immutable: %', OLD.name
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_released_board_storage_object()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS a_guard_released_board_storage_object_trg
  ON storage.objects;
CREATE TRIGGER a_guard_released_board_storage_object_trg
BEFORE UPDATE OR DELETE ON storage.objects
FOR EACH ROW
WHEN (OLD.bucket_id = 'proposal-mood-boards')
EXECUTE FUNCTION public.guard_released_board_storage_object();

-- ── 2. Working rows are never raw client surfaces ─────────────────────────

DROP POLICY IF EXISTS "Clients can view non-draft proposal boards"
  ON public.proposal_boards;
DROP POLICY IF EXISTS proposal_boards_legacy_ios_client_select
  ON public.proposal_boards;
DROP POLICY IF EXISTS "Clients view their project boards"
  ON public.proposal_boards;

DROP POLICY IF EXISTS "Clients can view items on non-draft proposal boards"
  ON public.proposal_board_items;
DROP POLICY IF EXISTS proposal_board_items_legacy_ios_client_select
  ON public.proposal_board_items;
DROP POLICY IF EXISTS "Clients view items on their project boards"
  ON public.proposal_board_items;

DROP POLICY IF EXISTS "Clients can view their project FFE items"
  ON public.project_ffe_items;

DROP POLICY IF EXISTS project_commercial_documents_client_read
  ON public.project_commercial_documents;
CREATE POLICY project_commercial_documents_client_read
  ON public.project_commercial_documents FOR SELECT TO authenticated
  USING (
    executed_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = project_commercial_documents.project_id
        AND project.client_id = auth.uid()
    )
  );

-- ── 3. Frozen project boards: coherent canonical INSERT, no rewrites ─────

CREATE OR REPLACE FUNCTION public.guard_project_board_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_id uuid;
  v_expected_items jsonb;
  v_expected_room_id uuid;
  v_source public.proposal_boards%ROWTYPE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'project board snapshots are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'project boards are inserted only by canonical activation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Migration/test fixtures may load exact historical truth only from an
  -- unassumed owner session. An auth-null call through any SECURITY DEFINER
  -- still has an assumed role and must prove the activation capability/source.
  IF current_user = 'postgres'
     AND session_user = 'postgres'
     AND COALESCE(current_setting('role', true), 'none') = 'none'
  THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'project board activation requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal_id := NULLIF(
    current_setting('app.proposal_activation_id', true), ''
  )::uuid;
  IF v_proposal_id IS NULL THEN
    RAISE EXCEPTION 'project board activation capability is missing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT board.* INTO v_source
  FROM public.proposal_boards AS board
  JOIN public.projects AS project
    ON project.id = NEW.project_id
   AND project.proposal_id = v_proposal_id
  JOIN public.proposals AS proposal
    ON proposal.id = v_proposal_id
   AND proposal.status = 'accepted'
  WHERE board.id = NEW.source_board_id
    AND board.proposal_id = v_proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project board source does not match the activated proposal'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', item.type,
    'x', item.x,
    'y', item.y,
    'width', item.width,
    'height', item.height,
    'z_index', item.z_index,
    'rotation', item.rotation,
    'product_id', item.product_id,
    'image_url', item.image_url,
    'content', item.content,
    'data', item.data
  ) ORDER BY item.z_index, item.created_at), '[]'::jsonb)
  INTO v_expected_items
  FROM public.proposal_board_items AS item
  WHERE item.board_id = v_source.id;

  SELECT room.id INTO v_expected_room_id
  FROM public.project_rooms AS room
  WHERE room.project_id = NEW.project_id
    AND room.source_scope_room_id = v_source.scope_room_id;

  IF NEW.name IS DISTINCT FROM v_source.name
     OR NEW.cover_image_url IS DISTINCT FROM v_source.cover_image_url
     OR NEW.canvas_width IS DISTINCT FROM v_source.canvas_width
     OR NEW.canvas_height IS DISTINCT FROM v_source.canvas_height
     OR NEW.background_color IS DISTINCT FROM v_source.background_color
     OR NEW.sort_order IS DISTINCT FROM v_source.sort_order
     OR NEW.items IS DISTINCT FROM v_expected_items
     OR NEW.project_room_id IS DISTINCT FROM v_expected_room_id
  THEN
    RAISE EXCEPTION 'project board snapshot does not match its activation source'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_board_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS a_guard_project_board_snapshot_trg
  ON public.project_boards;
CREATE TRIGGER a_guard_project_board_snapshot_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.project_boards
FOR EACH ROW EXECUTE FUNCTION public.guard_project_board_snapshot();

DROP POLICY IF EXISTS "Inherit project access for boards"
  ON public.project_boards;
DROP POLICY IF EXISTS project_boards_studio_rw
  ON public.project_boards;
CREATE POLICY project_boards_participant_select
  ON public.project_boards FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = project_boards.project_id
        AND public.is_design_studio_comember(project.designer_id)
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.project_boards
  FROM anon, authenticated;
GRANT SELECT ON public.project_boards TO authenticated;

-- ── 4. Board shares own one immutable payload edition ─────────────────────

ALTER TABLE public.document_shares
  ADD COLUMN IF NOT EXISTS board_payload jsonb,
  ADD COLUMN IF NOT EXISTS board_payload_hash text;

ALTER TABLE public.document_shares
  DROP CONSTRAINT IF EXISTS document_shares_board_payload_shape;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_board_payload_shape CHECK (
    (board_id IS NULL AND board_payload IS NULL AND board_payload_hash IS NULL)
    OR (
      board_id IS NOT NULL
      AND jsonb_typeof(board_payload) = 'object'
      AND char_length(board_payload_hash) = 64
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.build_board_share_payload(
  p_board_id uuid,
  p_share_id uuid,
  p_label text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'shareId', p_share_id,
    'label', p_label,
    'shareExpiresAt', p_expires_at,
    'studioName', COALESCE(profile.full_name, profile.email, 'the studio'),
    'board', jsonb_build_object(
      'id', board.id,
      'name', board.name,
      'cover_image_url', board.cover_image_url,
      'canvas_width', board.canvas_width,
      'canvas_height', board.canvas_height,
      'background_color', board.background_color,
      'sections', CASE WHEN jsonb_typeof(board.sections) = 'array'
        THEN board.sections ELSE '[]'::jsonb END,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', item.id,
          'type', item.type,
          'x', item.x,
          'y', item.y,
          'width', item.width,
          'height', item.height,
          'z_index', item.z_index,
          'rotation', item.rotation,
          'locked', item.locked,
          'image_url', item.image_url,
          'content', item.content,
          'data', jsonb_strip_nulls(jsonb_build_object(
            'name', item.data->'name',
            'text', item.data->'text',
            'image_url', item.data->'image_url',
            'thumbnail_url', item.data->'thumbnail_url',
            'original_image_url', item.data->'original_image_url',
            'room_type', item.data->'room_type',
            'swatches', item.data->'swatches',
            'section_id', item.data->'section_id'
          ))
        )) ORDER BY item.z_index, item.created_at, item.id)
        FROM public.proposal_board_items AS item
        WHERE item.board_id = board.id
      ), '[]'::jsonb)
    )
  )
  FROM public.proposal_boards AS board
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = board.project_id
  LEFT JOIN public.profiles AS profile
    ON profile.id = COALESCE(proposal.designer_id, project.designer_id)
  WHERE board.id = p_board_id;
$$;
REVOKE ALL ON FUNCTION public.build_board_share_payload(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

WITH payloads AS (
  SELECT share.id, public.build_board_share_payload(
    share.board_id, share.id, share.label, share.expires_at
  ) AS value
  FROM public.document_shares AS share
  WHERE share.board_id IS NOT NULL
    AND share.board_payload IS NULL
)
UPDATE public.document_shares AS share
SET board_payload = payload.value,
    board_payload_hash = encode(
      extensions.digest(convert_to(payload.value::text, 'UTF8'), 'sha256'),
      'hex'
    )
FROM payloads AS payload
WHERE share.id = payload.id
  AND payload.value IS NOT NULL;

ALTER TABLE public.document_shares
  VALIDATE CONSTRAINT document_shares_board_payload_shape;

CREATE OR REPLACE FUNCTION public.guard_document_share_board_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected_payload jsonb;
  v_expected_capability text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.board_id IS DISTINCT FROM OLD.board_id
       OR NEW.board_payload IS DISTINCT FROM OLD.board_payload
       OR NEW.board_payload_hash IS DISTINCT FROM OLD.board_payload_hash
       OR (
         OLD.board_id IS NOT NULL
         AND NEW.token_hash IS DISTINCT FROM OLD.token_hash
       )
    THEN
      RAISE EXCEPTION 'board share editions are immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;

  -- Generic document shares retain their existing writers. Only board shares
  -- are an edition-minting authority and therefore require this ceremony.
  IF NEW.board_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_user = 'postgres'
     AND session_user = 'postgres'
     AND COALESCE(current_setting('role', true), 'none') = 'none'
  THEN
    RETURN NEW;
  END IF;

  v_expected_capability := format(
    'board_share:%s:%s', NEW.id, pg_catalog.txid_current()
  );
  v_expected_payload := public.build_board_share_payload(
    NEW.board_id, NEW.id, NEW.label, NEW.expires_at
  );
  IF current_user IS DISTINCT FROM 'postgres'
     OR auth.uid() IS NULL
     OR NEW.created_by IS DISTINCT FROM auth.uid()
     OR current_setting('app.board_share_capability', true)
          IS DISTINCT FROM v_expected_capability
     OR v_expected_payload IS NULL
     OR NEW.board_payload IS DISTINCT FROM v_expected_payload
     OR NEW.board_payload_hash IS DISTINCT FROM encode(
       extensions.digest(convert_to(v_expected_payload::text, 'UTF8'), 'sha256'),
       'hex'
     )
     OR NEW.proposal_id IS NOT NULL
     OR NEW.spec_book_artifact_id IS NOT NULL
     OR NEW.status IS DISTINCT FROM 'active'
     OR NOT EXISTS (
       SELECT 1
       FROM public.proposal_boards AS board
       LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
       LEFT JOIN public.projects AS project ON project.id = board.project_id
       WHERE board.id = NEW.board_id
         AND board.status = 'active'
         AND public.board_media_projection_is_allowed(board.id)
         AND (
           (board.proposal_id IS NOT NULL
             AND public.is_design_studio_comember(proposal.designer_id))
           OR (board.project_id IS NOT NULL
             AND public.is_design_studio_comember(project.designer_id))
         )
     )
  THEN
    RAISE EXCEPTION 'board shares are inserted only by the canonical edition mint'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_document_share_board_payload()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS a_guard_document_share_board_payload_trg
  ON public.document_shares;
CREATE TRIGGER a_guard_document_share_board_payload_trg
BEFORE INSERT OR UPDATE ON public.document_shares
FOR EACH ROW EXECUTE FUNCTION public.guard_document_share_board_payload();

CREATE OR REPLACE FUNCTION public.create_board_share(
  p_board_id uuid,
  p_label text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_id uuid := extensions.gen_random_uuid();
  v_label text := NULLIF(btrim(p_label), '');
  v_payload jsonb;
  v_previous_capability text := current_setting(
    'app.board_share_capability', true
  );
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expiry must be in the future'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
    LEFT JOIN public.projects AS project ON project.id = board.project_id
    WHERE board.id = p_board_id
      AND board.status = 'active'
      AND (
        (board.proposal_id IS NOT NULL
          AND proposal.status IN ('draft','sent','viewed','accepted','declined','expired')
          AND public.is_design_studio_comember(proposal.designer_id))
        OR (board.project_id IS NOT NULL
          AND public.is_design_studio_comember(project.designer_id))
      )
  ) THEN
    RAISE EXCEPTION 'board not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_payload := public.build_board_share_payload(
    p_board_id, v_id, v_label, p_expires_at
  );
  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'board payload could not be captured'
      USING ERRCODE = 'check_violation';
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  PERFORM set_config(
    'app.board_share_capability',
    format('board_share:%s:%s', v_id, pg_catalog.txid_current()),
    true
  );

  INSERT INTO public.document_shares (
    id, proposal_id, spec_book_artifact_id, board_id,
    token_hash, label, visibility, status, expires_at, created_by,
    board_payload, board_payload_hash
  ) VALUES (
    v_id, NULL, NULL, p_board_id,
    v_hash, v_label, jsonb_build_object('feedbackEnabled', false),
    'active', p_expires_at, auth.uid(),
    v_payload,
    encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex')
  );
  PERFORM set_config(
    'app.board_share_capability', COALESCE(v_previous_capability, ''), true
  );
  RETURN QUERY SELECT v_id, v_token;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.board_share_capability', COALESCE(v_previous_capability, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_board_share(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_share_id uuid;
  v_payload jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RETURN NULL;
  END IF;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT share.id, share.board_payload
  INTO v_share_id, v_payload
  FROM public.document_shares AS share
  JOIN public.proposal_boards AS board ON board.id = share.board_id
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = board.project_id
  WHERE share.token_hash = v_hash
    AND share.board_id IS NOT NULL
    AND share.status = 'active'
    AND (share.expires_at IS NULL OR share.expires_at > now())
    AND share.board_payload IS NOT NULL
    AND share.board_payload_hash = encode(
      extensions.digest(convert_to(share.board_payload::text, 'UTF8'), 'sha256'),
      'hex'
    )
    AND public.board_json_media_references_are_allowed(
      share.board_payload,
      COALESCE(proposal.designer_id, project.designer_id)
    )
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE public.document_shares
  SET view_count = view_count + 1,
      last_viewed_at = now()
  WHERE id = v_share_id;
  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.create_board_share(uuid, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_board_share(uuid, text, timestamptz)
  TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_board_share(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_board_share(text)
  TO authenticated, service_role;

-- ── 5. Immutable commercial inserts prove source and signing state ───────

ALTER FUNCTION public.create_furnishings_authorization_from_schedule(
  uuid, text, uuid[], numeric
) RENAME TO _create_furnishings_authorization_from_schedule_impl;
REVOKE ALL ON FUNCTION public._create_furnishings_authorization_from_schedule_impl(
  uuid, text, uuid[], numeric
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_furnishings_authorization_from_schedule(
  p_project_id uuid,
  p_name text,
  p_ffe_item_ids uuid[],
  p_deposit_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting(
    'app.furnishing_authorization_project_id', true
  );
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.furnishing_authorization_project_id', p_project_id::text, true
  );
  v_result := public._create_furnishings_authorization_from_schedule_impl(
    p_project_id, p_name, p_ffe_item_ids, p_deposit_percent
  );
  PERFORM set_config(
    'app.furnishing_authorization_project_id', COALESCE(v_previous, ''), true
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.furnishing_authorization_project_id', COALESCE(v_previous, ''), true
  );
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.create_furnishings_authorization_from_schedule(
  uuid, text, uuid[], numeric
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_furnishings_authorization_from_schedule(
  uuid, text, uuid[], numeric
) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_furnishing_authorization_item_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_source public.project_ffe_items%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_room_name text;
  v_expected_total integer;
  v_expected_unit integer;
  v_expected_snapshot jsonb;
BEGIN
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'authorization items are inserted only by the canonical release RPC'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF current_user = 'postgres'
     AND session_user = 'postgres'
     AND COALESCE(current_setting('role', true), 'none') = 'none'
  THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'furnishings release requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_project_id := NULLIF(current_setting(
    'app.furnishing_authorization_project_id', true
  ), '')::uuid;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = NEW.commercial_document_id;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = v_document.proposal_id;
  SELECT * INTO v_source FROM public.project_ffe_items
  WHERE id = NEW.source_ffe_item_id;
  SELECT room.name INTO v_room_name FROM public.project_rooms AS room
  WHERE room.id = v_source.project_room_id;
  v_expected_total := CASE WHEN v_source.item_type = 'fixed'
    THEN v_source.line_total_cents ELSE v_source.budget_max_cents END;
  v_expected_unit := CASE WHEN v_source.item_type = 'fixed'
    THEN v_source.unit_price_cents
    ELSE (v_source.budget_max_cents / v_source.quantity)::integer END;
  v_expected_snapshot := jsonb_build_object(
    'budgetMinCents', v_source.budget_min_cents,
    'budgetMaxCents', v_source.budget_max_cents,
    'docCode', v_source.doc_code,
    'customFields', v_source.custom_fields,
    'notes', v_source.notes,
    'productImageUrl', (
      SELECT product.images[1] FROM public.products AS product
      WHERE product.id = v_source.product_id
    )
  );

  IF v_project_id IS NULL
     OR v_document.project_id IS DISTINCT FROM v_project_id
     OR v_document.document_kind <> 'furnishings_authorization'
     OR v_document.executed_at IS NOT NULL
     OR v_proposal.document_kind <> 'furnishings_authorization'
     OR v_proposal.status <> 'draft'
     OR v_proposal.commercial_state <> 'draft'
     OR v_source.project_id IS DISTINCT FROM v_project_id
     OR v_source.source_commercial_document_id IS NOT NULL
     OR NEW.source_proposal_item_id IS NOT NULL
     OR NEW.project_room_id IS DISTINCT FROM v_source.project_room_id
     OR NEW.product_id IS DISTINCT FROM v_source.product_id
     OR NEW.name IS DISTINCT FROM v_source.name
     OR NEW.room_name IS DISTINCT FROM v_room_name
     OR NEW.category IS DISTINCT FROM COALESCE(v_source.ffe_category, 'Uncategorized')
     OR NEW.item_type IS DISTINCT FROM v_source.item_type
     OR NEW.quantity IS DISTINCT FROM v_source.quantity
     OR NEW.client_unit_price_cents IS DISTINCT FROM v_expected_unit
     OR NEW.client_line_total_cents IS DISTINCT FROM v_expected_total
     OR NEW.trade_unit_cost_cents IS DISTINCT FROM v_source.trade_price_cents
     OR NEW.markup_percent IS DISTINCT FROM v_source.markup_percent
     OR NEW.vendor_id IS DISTINCT FROM v_source.vendor_id
     OR NEW.vendor_name IS DISTINCT FROM v_source.vendor_name
     OR NEW.snapshot IS DISTINCT FROM v_expected_snapshot
     OR NEW.sort_order IS DISTINCT FROM v_source.sort_order
  THEN
    RAISE EXCEPTION 'authorization item does not match its canonical draft/source'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_furnishing_authorization_item_insert()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS a_guard_furnishing_authorization_item_insert_trg
  ON public.furnishing_authorization_items;
CREATE TRIGGER a_guard_furnishing_authorization_item_insert_trg
BEFORE INSERT ON public.furnishing_authorization_items
FOR EACH ROW EXECUTE FUNCTION public.guard_furnishing_authorization_item_insert();

-- Every still-live signature writer is placed behind a small public ceremony
-- that mints a transaction-local, proposal/via-bound capability. Private
-- bodies remain ungranted. The table trigger below also re-proves signer,
-- lifecycle and fingerprint, so the setting is necessary but never sufficient.

CREATE OR REPLACE FUNCTION public.sign_design_services_agreement(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'sign_design_services_agreement', pg_catalog.txid_current()), true
  );
  v_result := public._sign_design_services_agreement_authorized(
    p_proposal_id, p_signed_name, auth.uid(), NULL
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_design_services_agreement_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_previous_capability text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP design-services signing requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_client_id, 'role', 'authenticated'
  )::text, true);
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'sign_design_services_agreement', pg_catalog.txid_current()), true
  );
  v_result := public._sign_design_services_agreement_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous_capability, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous_capability, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;

ALTER FUNCTION public.countersign_design_services_agreement(uuid, text)
  RENAME TO _countersign_design_services_agreement_impl;
REVOKE ALL ON FUNCTION public._countersign_design_services_agreement_impl(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
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
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'countersign_design_services_agreement', pg_catalog.txid_current()), true
  );
  v_result := public._countersign_design_services_agreement_impl(
    p_proposal_id, p_signer_name
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_furnishings_authorization(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_furnishings_authorization', pg_catalog.txid_current()), true
  );
  v_result := public._execute_furnishings_authorization_authorized(
    p_proposal_id, p_signed_name, auth.uid(), NULL
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_furnishings_authorization_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_previous_capability text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP furnishings execution requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_client_id, 'role', 'authenticated'
  )::text, true);
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_furnishings_authorization', pg_catalog.txid_current()), true
  );
  v_result := public._execute_furnishings_authorization_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous_capability, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous_capability, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_trade_scope(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_trade_scope', pg_catalog.txid_current()), true
  );
  v_result := public._execute_trade_scope_authorized(
    p_proposal_id, p_signed_name, auth.uid(), NULL
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_trade_scope_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_previous_capability text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP trade scope execution requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_client_id, 'role', 'authenticated'
  )::text, true);
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_trade_scope', pg_catalog.txid_current()), true
  );
  v_result := public._execute_trade_scope_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous_capability, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous_capability, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;

ALTER FUNCTION public.record_paper_client_signature(uuid, text, date, uuid)
  RENAME TO _record_paper_client_signature_impl;
REVOKE ALL ON FUNCTION public._record_paper_client_signature_impl(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.record_paper_client_signature(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'record_paper_client_signature', pg_catalog.txid_current()), true
  );
  v_result := public._record_paper_client_signature_impl(
    p_proposal_id, p_signed_name, p_paper_signed_on, p_scan_document_id
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_furnishings_authorization_on_paper(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_furnishings_authorization_on_paper', pg_catalog.txid_current()), true
  );
  v_result := public._execute_furnishings_authorization_on_paper_authorized(
    p_proposal_id, p_signed_name, p_paper_signed_on, auth.uid(), p_scan_document_id
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_trade_scope_on_paper(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_trade_scope_on_paper', pg_catalog.txid_current()), true
  );
  v_result := public._execute_trade_scope_on_paper_authorized(
    p_proposal_id, p_signed_name, p_paper_signed_on, auth.uid(), p_scan_document_id
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_design_services_agreement(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_design_services_agreement(uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.countersign_design_services_agreement(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.countersign_design_services_agreement(uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.execute_furnishings_authorization(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_furnishings_authorization(uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.execute_furnishings_authorization_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_furnishings_authorization_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.execute_trade_scope(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_trade_scope(uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.execute_trade_scope_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_trade_scope_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.record_paper_client_signature(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_paper_client_signature(uuid, text, date, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.execute_trade_scope_on_paper(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_trade_scope_on_paper(uuid, text, date, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_commercial_signature_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_via text := COALESCE(NEW.metadata->>'via', '');
  v_expected_capability text;
BEGIN
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'commercial signatures are inserted only by canonical signing RPCs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF current_user = 'postgres'
     AND session_user = 'postgres'
     AND COALESCE(current_setting('role', true), 'none') = 'none'
  THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = NEW.proposal_id;
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
         NEW.signer_user_id IS DISTINCT FROM v_proposal.client_id
         OR v_proposal.commercial_state <> 'sent'
         OR v_via NOT IN (
           'sign_design_services_agreement',
           'record_paper_client_signature',
           'execute_furnishings_authorization',
           'execute_furnishings_authorization_on_paper',
           'execute_trade_scope',
           'execute_trade_scope_on_paper'
         )
         OR (
           v_via IN (
             'sign_design_services_agreement',
             'execute_furnishings_authorization',
             'execute_trade_scope'
           )
           AND auth.uid() IS DISTINCT FROM NEW.signer_user_id
         )
         OR (
           v_via IN (
             'record_paper_client_signature',
             'execute_furnishings_authorization_on_paper',
             'execute_trade_scope_on_paper'
           )
           AND (
             auth.uid() IS NULL
             OR NOT public._can_author_proposal(v_proposal.designer_id)
             OR NEW.signed_ip IS NOT NULL
             OR COALESCE((NEW.metadata->>'executedOnPaper')::boolean, false) IS NOT TRUE
             OR NEW.metadata->>'recordedBy' IS DISTINCT FROM auth.uid()::text
             OR NULLIF(NEW.metadata->>'paperSignedOn', '') IS NULL
           )
         )
       )
     )
     OR (
       NEW.party_role = 'studio'
       AND (
         v_proposal.commercial_state <> 'client_signed'
         OR NOT public._can_author_proposal(v_proposal.designer_id)
         OR NEW.signer_user_id IS DISTINCT FROM auth.uid()
         OR v_via <> 'countersign_design_services_agreement'
       )
     )
  THEN
    RAISE EXCEPTION 'commercial signature does not match canonical signer/state/evidence'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_signature_insert()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS a_guard_commercial_signature_insert_trg
  ON public.commercial_document_signatures;
CREATE TRIGGER a_guard_commercial_signature_insert_trg
BEFORE INSERT ON public.commercial_document_signatures
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_signature_insert();

-- ── 6. Approved configuration children share parent immutability ──────────

ALTER FUNCTION public.instantiate_product_configuration_template(uuid, uuid, text)
  RENAME TO _instantiate_product_configuration_template_impl;
ALTER FUNCTION public.place_product_configuration_in_project(uuid, uuid, uuid, uuid, text, jsonb)
  RENAME TO _place_product_configuration_in_project_impl;
ALTER FUNCTION public.promote_configuration_to_library(uuid, text)
  RENAME TO _promote_configuration_to_library_impl;
ALTER FUNCTION public.save_product_configuration(jsonb)
  RENAME TO _save_product_configuration_impl;

REVOKE ALL ON FUNCTION public._instantiate_product_configuration_template_impl(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._place_product_configuration_in_project_impl(uuid, uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._promote_configuration_to_library_impl(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._save_product_configuration_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.instantiate_product_configuration_template(
  p_template_configuration_id uuid,
  p_project_id uuid,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.configuration_child_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config('app.configuration_child_capability',
    format('configuration_children:%s', pg_catalog.txid_current()), true);
  v_result := public._instantiate_product_configuration_template_impl(
    p_template_configuration_id, p_project_id, p_name
  );
  PERFORM set_config('app.configuration_child_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.configuration_child_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_product_configuration_in_project(
  p_project_id uuid,
  p_configuration_id uuid,
  p_room_id uuid DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_source jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.configuration_child_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config('app.configuration_child_capability',
    format('configuration_children:%s', pg_catalog.txid_current()), true);
  v_result := public._place_product_configuration_in_project_impl(
    p_project_id, p_configuration_id, p_room_id, p_slot_id, p_category, p_source
  );
  PERFORM set_config('app.configuration_child_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.configuration_child_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_configuration_to_library(
  p_configuration_id uuid,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.configuration_child_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config('app.configuration_child_capability',
    format('configuration_children:%s', pg_catalog.txid_current()), true);
  v_result := public._promote_configuration_to_library_impl(p_configuration_id, p_name);
  PERFORM set_config('app.configuration_child_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.configuration_child_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_product_configuration(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.configuration_child_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config('app.configuration_child_capability',
    format('configuration_children:%s', pg_catalog.txid_current()), true);
  v_result := public._save_product_configuration_impl(p_input);
  PERFORM set_config('app.configuration_child_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.configuration_child_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.instantiate_product_configuration_template(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.instantiate_product_configuration_template(uuid, uuid, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.place_product_configuration_in_project(uuid, uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_product_configuration_in_project(uuid, uuid, uuid, uuid, text, jsonb)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.promote_configuration_to_library(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_configuration_to_library(uuid, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_product_configuration(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_product_configuration(jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_product_configuration_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_configuration public.product_configurations%ROWTYPE;
  v_child_product_id uuid;
BEGIN
  SELECT * INTO v_configuration
  FROM public.product_configurations
  WHERE id = (v_row->>'configuration_id')::uuid;
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF current_user = 'postgres'
       AND session_user = 'postgres'
       AND COALESCE(current_setting('role', true), 'none') = 'none'
    THEN
      RETURN NEW;
    END IF;
    IF current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.configuration_child_capability', true)
            IS DISTINCT FROM format(
              'configuration_children:%s', pg_catalog.txid_current()
            )
    THEN
      RAISE EXCEPTION 'configuration children are inserted only by canonical configuration RPCs'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_TABLE_NAME = 'product_configuration_selections' THEN
      SELECT group_row.product_id INTO v_child_product_id
      FROM public.product_option_values AS value_row
      JOIN public.product_option_groups AS group_row
        ON group_row.id = value_row.option_group_id
      WHERE value_row.id = NEW.option_value_id
        AND group_row.id = NEW.option_group_id;
    ELSE
      SELECT component.product_id INTO v_child_product_id
      FROM public.product_components AS component
      WHERE component.id = NEW.component_id;
    END IF;
    IF v_child_product_id IS DISTINCT FROM v_configuration.product_id THEN
      RAISE EXCEPTION 'configuration child does not belong to its parent product'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_configuration.status IN ('approved', 'issued', 'superseded', 'archived') THEN
    RAISE EXCEPTION 'children of % configuration % are immutable',
      v_configuration.status, v_configuration.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_product_configuration_child()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS a_guard_product_configuration_selection_trg
  ON public.product_configuration_selections;
CREATE TRIGGER a_guard_product_configuration_selection_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.product_configuration_selections
FOR EACH ROW EXECUTE FUNCTION public.guard_product_configuration_child();
DROP TRIGGER IF EXISTS a_guard_product_configuration_component_trg
  ON public.product_configuration_components;
CREATE TRIGGER a_guard_product_configuration_component_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.product_configuration_components
FOR EACH ROW EXECUTE FUNCTION public.guard_product_configuration_child();

COMMENT ON COLUMN public.document_shares.board_payload IS
  'Immutable explicit client-safe board edition captured when a board share is minted.';
COMMENT ON COLUMN public.document_shares.board_payload_hash IS
  'SHA-256 of board_payload::text, verified on every token resolution.';
