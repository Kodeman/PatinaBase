-- ═══════════════════════════════════════════════════════════════════════════
-- 00380 — Spec Books immutable publication foundation
--
-- Adds the project-selection overlay, canonical working-book model, immutable
-- issue snapshots/artifacts, atomic placement, publication/finalization RPCs,
-- and artifact-scoped hashed-token shares.
--
-- document_shares lineage: 00266 → 00380. Existing proposal shares and their
-- RPCs remain valid; a share now targets exactly one proposal OR ready issued
-- spec-book artifact.
--
-- Security posture:
--   • working and revision data is studio-designer only under RLS;
--   • publication snapshots are immutable and artifacts finalize fail closed;
--   • guest resolution returns only audience-bound artifact metadata and an
--     opaque application download route, never live working data/storage paths;
--   • all caller RPCs pin search_path and explicitly validate ownership.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Renderer-owned project documents use a dedicated folio section.
ALTER TABLE public.project_documents
  DROP CONSTRAINT IF EXISTS project_documents_section_key_check;
ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_section_key_check
  CHECK (
    section_key IS NULL
    OR section_key IN (
      'brief', 'discovery', 'direction', 'proposal', 'project', 'install',
      'care', 'spec-book'
    )
  );

-- ── Project-selection overlay ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_ffe_specs (
  id                   uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ffe_item_id          uuid NOT NULL UNIQUE
                         REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  sku                  text,
  finish               text,
  material             text,
  color_fabric         text,
  selected_dimensions  jsonb,
  exact_location       text,
  client_notes         text,
  trade_notes          text,
  install_notes        text,
  care_notes           text,
  warranty_notes       text,
  selected_media       jsonb NOT NULL DEFAULT '[]'::jsonb
                         CHECK (jsonb_typeof(selected_media) = 'array'),
  source_verifications jsonb NOT NULL DEFAULT '{}'::jsonb
                         CHECK (jsonb_typeof(source_verifications) = 'object'),
  na_declarations      jsonb NOT NULL DEFAULT '{}'::jsonb
                         CHECK (jsonb_typeof(na_declarations) = 'object'),
  field_provenance     jsonb NOT NULL DEFAULT '{}'::jsonb
                         CHECK (jsonb_typeof(field_provenance) = 'object'),
  routing_source       jsonb NOT NULL DEFAULT '{}'::jsonb
                         CHECK (jsonb_typeof(routing_source) = 'object'),
  readiness_status     text NOT NULL DEFAULT 'draft'
                         CHECK (readiness_status IN ('draft', 'incomplete', 'ready', 'blocked')),
  row_version          integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_ffe_specs_readiness
  ON public.project_ffe_specs(readiness_status);

-- ── Versioned template + canonical working book ────────────────────────────
CREATE TABLE IF NOT EXISTS public.spec_book_templates (
  id                   uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  template_key         text NOT NULL,
  version              integer NOT NULL CHECK (version > 0),
  studio_id            uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name                 text NOT NULL,
  page_grammar         jsonb NOT NULL CHECK (jsonb_typeof(page_grammar) = 'object'),
  audience_profiles    jsonb NOT NULL CHECK (jsonb_typeof(audience_profiles) = 'object'),
  required_field_rules jsonb NOT NULL CHECK (jsonb_typeof(required_field_rules) = 'object'),
  visibility_rules     jsonb NOT NULL CHECK (jsonb_typeof(visibility_rules) = 'object'),
  branding             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(branding) = 'object'),
  layout_settings      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(layout_settings) = 'object'),
  is_active            boolean NOT NULL DEFAULT true,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_book_templates_version
  ON public.spec_book_templates(template_key, version, COALESCE(studio_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_spec_book_templates_active
  ON public.spec_book_templates(template_key, version DESC) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.spec_books (
  id                uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id        uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  title             text NOT NULL,
  template_id       uuid NOT NULL REFERENCES public.spec_book_templates(id) ON DELETE RESTRICT,
  default_audiences text[] NOT NULL DEFAULT ARRAY['client']::text[],
  settings          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (
    cardinality(default_audiences) > 0
    AND default_audiences <@ ARRAY['client','vendor','installer','internal','care']::text[]
  )
);

CREATE TABLE IF NOT EXISTS public.spec_book_chapters (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  spec_book_id    uuid NOT NULL REFERENCES public.spec_books(id) ON DELETE CASCADE,
  project_room_id uuid REFERENCES public.project_rooms(id) ON DELETE RESTRICT,
  title           text NOT NULL,
  position        integer NOT NULL DEFAULT 0,
  hero_media      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hero_media) = 'array'),
  included        boolean NOT NULL DEFAULT true,
  page_template   text NOT NULL DEFAULT 'room',
  review_state    text NOT NULL DEFAULT 'draft'
                    CHECK (review_state IN ('draft', 'in_review', 'approved')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_book_chapters_room
  ON public.spec_book_chapters(spec_book_id, project_room_id)
  WHERE project_room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spec_book_chapters_order
  ON public.spec_book_chapters(spec_book_id, position, id);

CREATE TABLE IF NOT EXISTS public.spec_book_item_settings (
  id                    uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  spec_book_id          uuid NOT NULL REFERENCES public.spec_books(id) ON DELETE CASCADE,
  ffe_item_id           uuid NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  chapter_id            uuid REFERENCES public.spec_book_chapters(id) ON DELETE SET NULL,
  included              boolean NOT NULL DEFAULT true,
  position              integer NOT NULL DEFAULT 0,
  page_template         text NOT NULL DEFAULT 'item',
  publication_overrides jsonb NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(publication_overrides) = 'object'),
  review_state          text NOT NULL DEFAULT 'draft'
                          CHECK (review_state IN ('draft', 'in_review', 'approved')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (spec_book_id, ffe_item_id)
);

CREATE INDEX IF NOT EXISTS idx_spec_book_item_settings_order
  ON public.spec_book_item_settings(spec_book_id, chapter_id, position, id);

-- ── Immutable issue ledger ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spec_book_revisions (
  id                       uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  spec_book_id             uuid NOT NULL REFERENCES public.spec_books(id) ON DELETE RESTRICT,
  revision_number          integer NOT NULL CHECK (revision_number > 0),
  idempotency_key          text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  issue_type               text NOT NULL CHECK (issue_type IN ('full', 'replacement', 'addendum')),
  prior_revision_id        uuid REFERENCES public.spec_book_revisions(id) ON DELETE RESTRICT,
  base_revision_id         uuid REFERENCES public.spec_book_revisions(id) ON DELETE RESTRICT,
  reason                   text,
  status                   text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued')),
  requested_audiences      text[] NOT NULL,
  warning_acknowledgements jsonb NOT NULL DEFAULT '[]'::jsonb
                             CHECK (jsonb_typeof(warning_acknowledgements) = 'array'),
  template_snapshot        jsonb NOT NULL CHECK (jsonb_typeof(template_snapshot) = 'object'),
  render_snapshot          jsonb NOT NULL CHECK (jsonb_typeof(render_snapshot) = 'object'),
  snapshot_checksum        text NOT NULL CHECK (snapshot_checksum ~ '^[0-9a-f]{64}$'),
  created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  issued_at                timestamptz,
  UNIQUE (spec_book_id, revision_number),
  UNIQUE (spec_book_id, idempotency_key),
  CHECK (
    cardinality(requested_audiences) > 0
    AND requested_audiences <@ ARRAY['client','vendor','installer','internal','care']::text[]
  ),
  CHECK (
    (issue_type = 'full' AND base_revision_id IS NULL)
    OR (issue_type IN ('replacement','addendum') AND base_revision_id IS NOT NULL AND length(btrim(reason)) > 0)
  ),
  CHECK (
    (status = 'pending' AND issued_at IS NULL)
    OR (status = 'issued' AND issued_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_spec_book_revisions_book
  ON public.spec_book_revisions(spec_book_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS public.spec_book_revision_items (
  id               uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  revision_id      uuid NOT NULL REFERENCES public.spec_book_revisions(id) ON DELETE RESTRICT,
  ffe_item_id      uuid NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT,
  item_type        text NOT NULL CHECK (item_type IN ('fixed','allowance','tbd')),
  document_code    text,
  chapter_position integer NOT NULL,
  item_position    integer NOT NULL,
  item_snapshot    jsonb NOT NULL CHECK (jsonb_typeof(item_snapshot) = 'object'),
  content_hash     text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, ffe_item_id)
);

CREATE INDEX IF NOT EXISTS idx_spec_book_revision_items_hash
  ON public.spec_book_revision_items(revision_id, content_hash);

CREATE TABLE IF NOT EXISTS public.spec_book_artifacts (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  revision_id         uuid NOT NULL REFERENCES public.spec_book_revisions(id) ON DELETE RESTRICT,
  audience            text NOT NULL CHECK (audience IN ('client','vendor','installer','internal','care')),
  format              text NOT NULL DEFAULT 'pdf' CHECK (format = 'pdf'),
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','rendering','ready','failed')),
  project_document_id uuid REFERENCES public.project_documents(id) ON DELETE RESTRICT,
  storage_bucket      text NOT NULL DEFAULT 'project-documents'
                        CHECK (storage_bucket = 'project-documents'),
  storage_path        text,
  checksum_sha256     text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes          bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  attempt_count       integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_code          text,
  error_message       text,
  render_started_at   timestamptz,
  rendered_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, audience, format),
  CHECK (
    status <> 'ready'
    OR (
      project_document_id IS NOT NULL
      AND storage_path IS NOT NULL
      AND length(btrim(storage_path)) > 0
      AND checksum_sha256 IS NOT NULL
      AND rendered_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_spec_book_artifacts_status
  ON public.spec_book_artifacts(status, created_at);

-- ── Extend hashed-token shares without changing proposal behavior ─────────
ALTER TABLE public.document_shares
  ALTER COLUMN proposal_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS spec_book_artifact_id uuid
    REFERENCES public.spec_book_artifacts(id) ON DELETE CASCADE;

ALTER TABLE public.document_shares
  DROP CONSTRAINT IF EXISTS document_shares_exactly_one_target;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_exactly_one_target
  CHECK (num_nonnulls(proposal_id, spec_book_artifact_id) = 1);

CREATE INDEX IF NOT EXISTS idx_document_shares_spec_book_artifact
  ON public.document_shares(spec_book_artifact_id, created_at DESC)
  WHERE spec_book_artifact_id IS NOT NULL;

-- ── Structural/immutability guards ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spec_book_validate_na_declarations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry record;
BEGIN
  FOR v_entry IN SELECT key, value FROM jsonb_each(NEW.na_declarations)
  LOOP
    IF jsonb_typeof(v_entry.value) <> 'object'
       OR COALESCE((v_entry.value->>'na')::boolean, false) IS NOT TRUE
       OR length(btrim(COALESCE(v_entry.value->>'reason', ''))) = 0 THEN
      RAISE EXCEPTION 'invalid N/A declaration for field %', v_entry.key
        USING errcode = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.spec_book_bump_spec_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ffe_item_id IS DISTINCT FROM OLD.ffe_item_id THEN
    RAISE EXCEPTION 'ffe_item_id is immutable' USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.row_version IS DISTINCT FROM OLD.row_version THEN
    RAISE EXCEPTION 'row_version is managed by the database'
      USING errcode = 'serialization_failure';
  END IF;
  NEW.row_version := OLD.row_version + 1;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by, OLD.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_ffe_specs_validate_na ON public.project_ffe_specs;
CREATE TRIGGER trg_project_ffe_specs_validate_na
  BEFORE INSERT OR UPDATE OF na_declarations ON public.project_ffe_specs
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_validate_na_declarations();
DROP TRIGGER IF EXISTS trg_project_ffe_specs_version ON public.project_ffe_specs;
CREATE TRIGGER trg_project_ffe_specs_version
  BEFORE UPDATE ON public.project_ffe_specs
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_bump_spec_version();

CREATE OR REPLACE FUNCTION public.spec_book_validate_working_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.spec_books WHERE id = NEW.spec_book_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'spec book not found' USING errcode = 'foreign_key_violation';
  END IF;

  IF TG_TABLE_NAME = 'spec_book_chapters' THEN
    IF NEW.project_room_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.project_rooms
         WHERE id = NEW.project_room_id AND project_id = v_project_id
       ) THEN
      RAISE EXCEPTION 'chapter room does not belong to spec-book project'
        USING errcode = 'check_violation';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.project_ffe_items
      WHERE id = NEW.ffe_item_id AND project_id = v_project_id
    ) THEN
      RAISE EXCEPTION 'item does not belong to spec-book project'
        USING errcode = 'check_violation';
    END IF;
    IF NEW.chapter_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.spec_book_chapters
         WHERE id = NEW.chapter_id AND spec_book_id = NEW.spec_book_id
       ) THEN
      RAISE EXCEPTION 'item chapter does not belong to spec book'
        USING errcode = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spec_book_chapters_links ON public.spec_book_chapters;
CREATE TRIGGER trg_spec_book_chapters_links
  BEFORE INSERT OR UPDATE OF spec_book_id, project_room_id ON public.spec_book_chapters
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_validate_working_links();
DROP TRIGGER IF EXISTS trg_spec_book_item_settings_links ON public.spec_book_item_settings;
CREATE TRIGGER trg_spec_book_item_settings_links
  BEFORE INSERT OR UPDATE OF spec_book_id, ffe_item_id, chapter_id ON public.spec_book_item_settings
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_validate_working_links();

CREATE OR REPLACE FUNCTION public.spec_book_reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME
    USING errcode = 'object_not_in_prerequisite_state';
END;
$$;

CREATE OR REPLACE FUNCTION public.spec_book_guard_revision_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.spec_book_id       IS DISTINCT FROM NEW.spec_book_id
     OR OLD.revision_number IS DISTINCT FROM NEW.revision_number
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.issue_type      IS DISTINCT FROM NEW.issue_type
     OR OLD.prior_revision_id IS DISTINCT FROM NEW.prior_revision_id
     OR OLD.base_revision_id  IS DISTINCT FROM NEW.base_revision_id
     OR OLD.reason            IS DISTINCT FROM NEW.reason
     OR OLD.requested_audiences IS DISTINCT FROM NEW.requested_audiences
     OR OLD.warning_acknowledgements IS DISTINCT FROM NEW.warning_acknowledgements
     OR OLD.template_snapshot IS DISTINCT FROM NEW.template_snapshot
     OR OLD.render_snapshot   IS DISTINCT FROM NEW.render_snapshot
     OR OLD.snapshot_checksum IS DISTINCT FROM NEW.snapshot_checksum
     OR OLD.created_by        IS DISTINCT FROM NEW.created_by
     OR OLD.created_at        IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'revision snapshot/header is immutable'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT (OLD.status = 'pending' AND NEW.status = 'issued')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'invalid revision status transition'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spec_book_templates_immutable ON public.spec_book_templates;
CREATE TRIGGER trg_spec_book_templates_immutable
  BEFORE UPDATE OR DELETE ON public.spec_book_templates
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_reject_immutable_change();
DROP TRIGGER IF EXISTS trg_spec_book_revision_items_immutable ON public.spec_book_revision_items;
CREATE TRIGGER trg_spec_book_revision_items_immutable
  BEFORE UPDATE OR DELETE ON public.spec_book_revision_items
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_reject_immutable_change();
DROP TRIGGER IF EXISTS trg_spec_book_revisions_no_delete ON public.spec_book_revisions;
CREATE TRIGGER trg_spec_book_revisions_no_delete
  BEFORE DELETE ON public.spec_book_revisions
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_reject_immutable_change();
DROP TRIGGER IF EXISTS trg_spec_book_revisions_guard_update ON public.spec_book_revisions;
CREATE TRIGGER trg_spec_book_revisions_guard_update
  BEFORE UPDATE ON public.spec_book_revisions
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_guard_revision_update();

CREATE OR REPLACE FUNCTION public.spec_book_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spec_books_updated_at ON public.spec_books;
CREATE TRIGGER trg_spec_books_updated_at BEFORE UPDATE ON public.spec_books
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_set_updated_at();
DROP TRIGGER IF EXISTS trg_spec_book_chapters_updated_at ON public.spec_book_chapters;
CREATE TRIGGER trg_spec_book_chapters_updated_at BEFORE UPDATE ON public.spec_book_chapters
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_set_updated_at();
DROP TRIGGER IF EXISTS trg_spec_book_item_settings_updated_at ON public.spec_book_item_settings;
CREATE TRIGGER trg_spec_book_item_settings_updated_at BEFORE UPDATE ON public.spec_book_item_settings
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_set_updated_at();
DROP TRIGGER IF EXISTS trg_spec_book_artifacts_updated_at ON public.spec_book_artifacts;
CREATE TRIGGER trg_spec_book_artifacts_updated_at BEFORE UPDATE ON public.spec_book_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_set_updated_at();

-- Every live schedule line gets one project-selection row. If its project has
-- a canonical book, it also gets one working item setting.
CREATE OR REPLACE FUNCTION public.spec_book_attach_ffe_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
  v_chapter_id uuid;
BEGIN
  INSERT INTO public.project_ffe_specs (ffe_item_id, routing_source)
  VALUES (
    NEW.id,
    jsonb_strip_nulls(jsonb_build_object('source', NEW.added_via))
  )
  ON CONFLICT (ffe_item_id) DO NOTHING;

  SELECT id INTO v_book_id FROM public.spec_books WHERE project_id = NEW.project_id;
  IF v_book_id IS NOT NULL THEN
    SELECT id INTO v_chapter_id
    FROM public.spec_book_chapters
    WHERE spec_book_id = v_book_id AND project_room_id = NEW.project_room_id;

    INSERT INTO public.spec_book_item_settings (
      spec_book_id, ffe_item_id, chapter_id, position
    )
    VALUES (v_book_id, NEW.id, v_chapter_id, NEW.sort_order)
    ON CONFLICT (spec_book_id, ffe_item_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spec_book_attach_ffe_line ON public.project_ffe_items;
CREATE TRIGGER trg_spec_book_attach_ffe_line
  AFTER INSERT ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public.spec_book_attach_ffe_line();

-- Backfill selection overlays for the existing live schedule.
INSERT INTO public.project_ffe_specs (ffe_item_id, routing_source)
SELECT i.id, jsonb_strip_nulls(jsonb_build_object('source', i.added_via))
FROM public.project_ffe_items i
ON CONFLICT (ffe_item_id) DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_ffe_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_book_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_book_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_book_item_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_book_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_book_revision_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_book_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_ffe_specs_studio_rw ON public.project_ffe_specs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.project_ffe_items i
    JOIN public.projects p ON p.id = i.project_id
    WHERE i.id = project_ffe_specs.ffe_item_id
      AND public.is_studio_comember(p.designer_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.project_ffe_items i
    JOIN public.projects p ON p.id = i.project_id
    WHERE i.id = project_ffe_specs.ffe_item_id
      AND public.is_studio_comember(p.designer_id)
  ));

CREATE POLICY spec_book_templates_studio_select ON public.spec_book_templates
  FOR SELECT TO authenticated
  USING (
    studio_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = spec_book_templates.studio_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role <> 'guest'
    )
  );

CREATE POLICY spec_books_studio_rw ON public.spec_books
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = spec_books.project_id
      AND public.is_studio_comember(p.designer_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = spec_books.project_id
      AND public.is_studio_comember(p.designer_id)
  ));

CREATE POLICY spec_book_chapters_studio_rw ON public.spec_book_chapters
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_chapters.spec_book_id
      AND public.is_studio_comember(p.designer_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_chapters.spec_book_id
      AND public.is_studio_comember(p.designer_id)
  ));

CREATE POLICY spec_book_item_settings_studio_rw ON public.spec_book_item_settings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_item_settings.spec_book_id
      AND public.is_studio_comember(p.designer_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_item_settings.spec_book_id
      AND public.is_studio_comember(p.designer_id)
  ));

CREATE POLICY spec_book_revisions_studio_select ON public.spec_book_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_revisions.spec_book_id
      AND public.is_studio_comember(p.designer_id)
  ));

CREATE POLICY spec_book_revision_items_studio_select ON public.spec_book_revision_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.spec_book_revisions r
    JOIN public.spec_books b ON b.id = r.spec_book_id
    JOIN public.projects p ON p.id = b.project_id
    WHERE r.id = spec_book_revision_items.revision_id
      AND public.is_studio_comember(p.designer_id)
  ));

CREATE POLICY spec_book_artifacts_studio_select ON public.spec_book_artifacts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.spec_book_revisions r
    JOIN public.spec_books b ON b.id = r.spec_book_id
    JOIN public.projects p ON p.id = b.project_id
    WHERE r.id = spec_book_artifacts.revision_id
      AND public.is_studio_comember(p.designer_id)
  ));

-- Proposal shares retain their policy; artifact shares use the project owner.
DROP POLICY IF EXISTS document_shares_designer_all ON public.document_shares;
CREATE POLICY document_shares_designer_all
  ON public.document_shares FOR ALL TO authenticated
  USING (
    (
      proposal_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = document_shares.proposal_id
          AND public.is_studio_comember(p.designer_id)
      )
    )
    OR (
      spec_book_artifact_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.spec_book_artifacts a
        JOIN public.spec_book_revisions r ON r.id = a.revision_id
        JOIN public.spec_books b ON b.id = r.spec_book_id
        JOIN public.projects p ON p.id = b.project_id
        WHERE a.id = document_shares.spec_book_artifact_id
          AND public.is_studio_comember(p.designer_id)
      )
    )
  )
  WITH CHECK (
    (
      proposal_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = document_shares.proposal_id
          AND public.is_studio_comember(p.designer_id)
      )
    )
    OR (
      spec_book_artifact_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.spec_book_artifacts a
        JOIN public.spec_book_revisions r ON r.id = a.revision_id
        JOIN public.spec_books b ON b.id = r.spec_book_id
        JOIN public.projects p ON p.id = b.project_id
        WHERE a.id = document_shares.spec_book_artifact_id
          AND public.is_studio_comember(p.designer_id)
      )
    )
  );

-- ── Immutable system residential template v1 ──────────────────────────────
INSERT INTO public.spec_book_templates (
  id, template_key, version, name, page_grammar, audience_profiles,
  required_field_rules, visibility_rules, branding, layout_settings
)
VALUES (
  '8f6e2600-6f25-4f20-a63d-d68d49c35a01',
  'residential',
  1,
  'Residential Spec Book',
  '{
    "contractVersion": 1,
    "pages": ["cover","project-information","contents","room-divider","visual-index","item-sheet","project-schedule","allowances-tbd","care","warranty","cut-sheet"]
  }'::jsonb,
  '{
    "client": {"allow": ["identity","selection","dimensions","quantity","selectedMedia","clientPrice","clientNotes","care","warranty"]},
    "vendor": {"allow": ["identity","selection","dimensions","quantity","selectedMedia","vendorNotes"]},
    "installer": {"allow": ["identity","location","selection","dimensions","quantity","selectedMedia","installNotes"]},
    "internal": {"allow": ["*"]},
    "care": {"allow": ["identity","selectedMedia","care","warranty"]}
  }'::jsonb,
  '{
    "fixed": ["name","documentCode","room","quantity","image","selection"],
    "vendor": ["vendor"],
    "installer": ["exactLocation"]
  }'::jsonb,
  '{
    "client": {"deny": ["tradePrice","markup","tradeNotes","privateNotes","vendorContact","procurementNotes","installNotes"]},
    "vendor": {"deny": ["markup","privateNotes","internalContacts"]},
    "installer": {"deny": ["clientPrice","tradePrice","markup","privateNotes","vendorContact","procurementNotes"]},
    "care": {"deny": ["clientPrice","tradePrice","markup","privateNotes","contacts","procurementNotes","installNotes"]}
  }'::jsonb,
  '{"wordmark":"Patina"}'::jsonb,
  '{"paper":"letter","deterministic":true,"marginInches":0.5,"maxItems":500,"maxMedia":1000,"maxPdfBytes":52428800}'::jsonb
)
ON CONFLICT DO NOTHING;

-- ── Canonical-book composition ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_project_spec_book(p_project_id uuid)
RETURNS public.spec_books
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_project public.projects;
  v_template_id uuid;
  v_book public.spec_books;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR SHARE;

  IF NOT FOUND OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_template_id
  FROM public.spec_book_templates
  WHERE template_key = 'residential'
    AND studio_id IS NULL
    AND is_active
  ORDER BY version DESC
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'residential spec-book template is unavailable'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  INSERT INTO public.spec_books (
    project_id, title, template_id, default_audiences, created_by
  )
  VALUES (
    p_project_id, v_project.name || ' — Spec Book', v_template_id,
    ARRAY['client']::text[], auth.uid()
  )
  ON CONFLICT (project_id) DO NOTHING;

  SELECT * INTO v_book FROM public.spec_books WHERE project_id = p_project_id;

  INSERT INTO public.spec_book_chapters (
    spec_book_id, project_room_id, title, position
  )
  SELECT v_book.id, r.id, r.name, r.sort_order
  FROM public.project_rooms r
  WHERE r.project_id = p_project_id
  ON CONFLICT (spec_book_id, project_room_id)
    WHERE project_room_id IS NOT NULL
  DO NOTHING;

  INSERT INTO public.spec_book_item_settings (
    spec_book_id, ffe_item_id, chapter_id, position
  )
  SELECT
    v_book.id,
    i.id,
    c.id,
    i.sort_order
  FROM public.project_ffe_items i
  LEFT JOIN public.spec_book_chapters c
    ON c.spec_book_id = v_book.id
   AND c.project_room_id = i.project_room_id
  WHERE i.project_id = p_project_id
  ON CONFLICT (spec_book_id, ffe_item_id) DO NOTHING;

  RETURN v_book;
END;
$$;

-- p_slot_id addresses an existing project_ffe_items placeholder. Filling an
-- occupied line is rejected under its row lock; p_slot_id NULL creates a new
-- distinct schedule line even when the reusable Product is already selected
-- elsewhere in the project.
CREATE OR REPLACE FUNCTION public.place_product_in_project(
  p_project_id uuid,
  p_product_id uuid,
  p_room_id uuid DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_source jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_project public.projects;
  v_product public.products;
  v_item public.project_ffe_items;
  v_vendor_name text;
  v_accessible boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_source IS NULL OR jsonb_typeof(p_source) <> 'object' THEN
    RAISE EXCEPTION 'source must be a JSON object' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR SHARE;
  IF NOT FOUND OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found' USING errcode = 'no_data_found';
  END IF;

  -- SECURITY DEFINER must reproduce the products SELECT allow-list.
  v_accessible :=
    (v_product.layer = 'catalog')
    OR (v_product.layer = 'personal' AND v_product.owner_user_id = auth.uid())
    OR (
      v_product.layer = 'studio'
      AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = v_product.studio_id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
      )
    );
  IF NOT v_accessible OR v_product.deleted_at IS NOT NULL OR v_product.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'product not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;

  IF p_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms
    WHERE id = p_room_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'room does not belong to project'
      USING errcode = 'check_violation';
  END IF;

  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_product.vendor_id;

  IF p_slot_id IS NOT NULL THEN
    SELECT * INTO v_item
    FROM public.project_ffe_items
    WHERE id = p_slot_id
    FOR UPDATE;

    IF NOT FOUND OR v_item.project_id <> p_project_id THEN
      RAISE EXCEPTION 'slot does not belong to project'
        USING errcode = 'check_violation';
    END IF;
    IF p_room_id IS NOT NULL AND v_item.project_room_id IS DISTINCT FROM p_room_id THEN
      RAISE EXCEPTION 'slot does not belong to room'
        USING errcode = 'check_violation';
    END IF;
    IF v_item.product_id IS NOT NULL THEN
      RAISE EXCEPTION 'slot is already filled'
        USING errcode = 'unique_violation';
    END IF;

    UPDATE public.project_ffe_items
    SET product_id = v_product.id,
        name = v_product.name,
        ffe_category = COALESCE(NULLIF(btrim(p_category), ''), v_product.category, ffe_category),
        project_room_id = COALESCE(p_room_id, project_room_id),
        vendor_id = v_product.vendor_id,
        vendor_name = v_vendor_name,
        trade_price_cents = COALESCE(v_product.price_trade, v_product.price_retail, 0),
        unit_price_cents = COALESCE(v_product.price_retail, v_product.price_trade, 0),
        line_total_cents = quantity * COALESCE(v_product.price_retail, v_product.price_trade, 0),
        added_via = COALESCE(NULLIF(p_source->>'client', ''), NULLIF(p_source->>'source', ''), added_via),
        updated_at = now()
    WHERE id = v_item.id
    RETURNING * INTO v_item;
  ELSE
    INSERT INTO public.project_ffe_items (
      project_id, project_room_id, product_id, name, ffe_category,
      quantity, trade_price_cents, unit_price_cents, line_total_cents,
      vendor_id, vendor_name, added_via, sort_order
    )
    VALUES (
      p_project_id, p_room_id, v_product.id, v_product.name,
      COALESCE(NULLIF(btrim(p_category), ''), v_product.category),
      1,
      COALESCE(v_product.price_trade, v_product.price_retail, 0),
      COALESCE(v_product.price_retail, v_product.price_trade, 0),
      COALESCE(v_product.price_retail, v_product.price_trade, 0),
      v_product.vendor_id, v_vendor_name,
      COALESCE(NULLIF(p_source->>'client', ''), NULLIF(p_source->>'source', ''), 'spec-book'),
      COALESCE((
        SELECT max(sort_order) + 1
        FROM public.project_ffe_items
        WHERE project_id = p_project_id
          AND project_room_id IS NOT DISTINCT FROM p_room_id
      ), 0)
    )
    RETURNING * INTO v_item;
  END IF;

  INSERT INTO public.project_ffe_specs (
    ffe_item_id, routing_source, updated_by
  )
  VALUES (v_item.id, p_source, auth.uid())
  ON CONFLICT (ffe_item_id) DO UPDATE
    SET routing_source = public.project_ffe_specs.routing_source || EXCLUDED.routing_source,
        updated_by = auth.uid();

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'ffeItemId', v_item.id,
    'specId', (SELECT id FROM public.project_ffe_specs WHERE ffe_item_id = v_item.id),
    'productId', p_product_id,
    'roomId', v_item.project_room_id,
    'placement', CASE WHEN p_slot_id IS NULL THEN 'created_line' ELSE 'filled_slot' END
  );
END;
$$;

-- Resolve one field with explicit provenance. JSON null is treated as absent.
CREATE OR REPLACE FUNCTION public._spec_book_resolve_field(
  p_override jsonb,
  p_line jsonb,
  p_master jsonb,
  p_studio jsonb,
  p_na jsonb,
  p_override_at timestamptz,
  p_line_at timestamptz,
  p_master_at timestamptz,
  p_verified_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE((p_na->>'na')::boolean, false) THEN
      jsonb_build_object(
        'value', NULL, 'source', 'declaration', 'sourceUpdatedAt', p_override_at,
        'verifiedAt', p_verified_at, 'na', true, 'naReason', p_na->>'reason'
      )
    WHEN p_override IS NOT NULL AND p_override <> 'null'::jsonb THEN
      jsonb_build_object(
        'value', p_override, 'source', 'project_override', 'sourceUpdatedAt', p_override_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    WHEN p_line IS NOT NULL AND p_line <> 'null'::jsonb THEN
      jsonb_build_object(
        'value', p_line, 'source', 'ffe_line', 'sourceUpdatedAt', p_line_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    WHEN p_master IS NOT NULL AND p_master <> 'null'::jsonb THEN
      jsonb_build_object(
        'value', p_master, 'source', 'product_master', 'sourceUpdatedAt', p_master_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    WHEN p_studio IS NOT NULL AND p_studio <> 'null'::jsonb THEN
      jsonb_build_object(
        'value', p_studio, 'source', 'studio_custom', 'sourceUpdatedAt', p_master_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    ELSE
      jsonb_build_object(
        'value', NULL, 'source', NULL, 'sourceUpdatedAt', NULL,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
  END;
$$;

-- RFC-8259 JSON with recursively sorted object keys, stable array order, and no
-- insignificant whitespace. This exactly matches the renderer's canonical
-- compact JSON serializer; hashes are over these UTF-8 bytes.
CREATE OR REPLACE FUNCTION public._spec_book_canonical_json(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT CASE jsonb_typeof(p_value)
    WHEN 'object' THEN COALESCE((
      SELECT '{' || string_agg(to_jsonb(e.key)::text || ':' || public._spec_book_canonical_json(e.value), ',' ORDER BY e.key) || '}'
      FROM jsonb_each(p_value) AS e
    ), '{}')
    WHEN 'array' THEN COALESCE((
      SELECT '[' || string_agg(public._spec_book_canonical_json(e.value), ',' ORDER BY e.ordinality) || ']'
      FROM jsonb_array_elements(p_value) WITH ORDINALITY AS e(value, ordinality)
    ), '[]')
    WHEN 'number' THEN trim_scale((p_value #>> '{}')::numeric)::text
    ELSE p_value::text
  END;
$$;

-- Canonical normalized live item model. Explicit row ordering + the compact
-- canonical serializer make content hashes stable across SQL and Deno.
CREATE OR REPLACE FUNCTION public._spec_book_current_item_snapshots(p_spec_book_id uuid)
RETURNS TABLE (
  ffe_item_id uuid,
  item_type text,
  document_code text,
  chapter_position integer,
  item_position integer,
  item_snapshot jsonb,
  content_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH source AS (
    SELECT
      i.id AS ffe_item_id,
      i.item_type,
      i.doc_code,
      COALESCE(c.position, 2147483647) AS chapter_position,
      s.position AS item_position,
      jsonb_strip_nulls(jsonb_build_object(
        'ffeItemId', i.id,
        'itemType', i.item_type,
        'documentCode', i.doc_code,
        'name', i.name,
        'projectId', i.project_id,
        'room', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id, 'name', r.name
        ) END,
        'quantity', i.quantity,
        'category', i.ffe_category,
        'selectedMedia', CASE
          WHEN jsonb_array_length(sp.selected_media) > 0 THEN sp.selected_media
          ELSE COALESCE(to_jsonb(p.images), '[]'::jsonb)
        END,
        'selection', jsonb_build_object(
          'sku', public._spec_book_resolve_field(
            to_jsonb(sp.sku), i.custom_fields->'sku', to_jsonb(p.sku),
            p.capture_provenance#>'{studioCustom,sku}', sp.na_declarations->'sku',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'sku', '')::timestamptz
          ),
          'finish', public._spec_book_resolve_field(
            to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
            p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'finish', '')::timestamptz
          ),
          'material', public._spec_book_resolve_field(
            to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
            p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'material', '')::timestamptz
          ),
          'colorFabric', public._spec_book_resolve_field(
            to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
            p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz
          ),
          'dimensions', public._spec_book_resolve_field(
            sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
            p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz
          ),
          'exactLocation', public._spec_book_resolve_field(
            to_jsonb(sp.exact_location), i.custom_fields->'exactLocation', NULL,
            p.capture_provenance#>'{studioCustom,exactLocation}', sp.na_declarations->'exactLocation',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'exactLocation', '')::timestamptz
          )
        ),
        'notes', jsonb_build_object(
          'client', sp.client_notes,
          'trade', sp.trade_notes,
          'install', sp.install_notes,
          'private', i.notes,
          'care', sp.care_notes,
          'warranty', sp.warranty_notes
        ),
        'pricing', jsonb_build_object(
          'clientPriceCents', i.unit_price_cents,
          'tradePriceCents', i.trade_price_cents,
          'markupPercent', i.markup_percent
        ),
        'vendor', jsonb_build_object(
          'id', i.vendor_id,
          'name', i.vendor_name,
          'internalContact', p.vendor_contact
        ),
        'provenance', sp.field_provenance,
        'sourceVerification', sp.source_verifications,
        'naDeclarations', sp.na_declarations,
        'readinessStatus', sp.readiness_status,
        'rowVersion', sp.row_version
      )) AS snapshot
    FROM public.spec_book_item_settings s
    JOIN public.spec_books b ON b.id = s.spec_book_id
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    JOIN public.project_ffe_specs sp ON sp.ffe_item_id = i.id
    LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id
    LEFT JOIN public.project_rooms r ON r.id = i.project_room_id
    LEFT JOIN public.products p ON p.id = i.product_id
    WHERE s.spec_book_id = p_spec_book_id
      AND s.included
      AND (c.id IS NULL OR c.included)
  )
  SELECT
    source.ffe_item_id,
    source.item_type,
    source.doc_code,
    source.chapter_position,
    source.item_position,
    source.snapshot,
    encode(
      extensions.digest(public._spec_book_canonical_json(source.snapshot), 'sha256'),
      'hex'
    )
  FROM source
  ORDER BY source.chapter_position, source.item_position, source.ffe_item_id;
$$;

CREATE OR REPLACE FUNCTION public._spec_book_has_forbidden_keys(
  p_value jsonb,
  p_forbidden text[]
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE
  v_entry record;
  v_value jsonb;
BEGIN
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR v_entry IN SELECT key, value FROM jsonb_each(p_value)
    LOOP
      IF v_entry.key = ANY(p_forbidden)
         OR public._spec_book_has_forbidden_keys(v_entry.value, p_forbidden) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR v_value IN SELECT value FROM jsonb_array_elements(p_value)
    LOOP
      IF public._spec_book_has_forbidden_keys(v_value, p_forbidden) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

-- ── Preflight + immutable issue preparation ────────────────────────────────
CREATE OR REPLACE FUNCTION public.prepare_spec_book_issue(
  p_spec_book_id uuid,
  p_audiences text[],
  p_issue_type text,
  p_reason text,
  p_base_revision_id uuid,
  p_idempotency_key text,
  p_warning_acknowledgements jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_book public.spec_books;
  v_project public.projects;
  v_template public.spec_book_templates;
  v_existing public.spec_book_revisions;
  v_revision public.spec_book_revisions;
  v_prior_revision_id uuid;
  v_revision_number integer;
  v_audiences text[];
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_chapters jsonb := '[]'::jsonb;
  v_fixed jsonb := '[]'::jsonb;
  v_allowances jsonb := '[]'::jsonb;
  v_tbd jsonb := '[]'::jsonb;
  v_render_snapshot jsonb;
  v_template_snapshot jsonb;
  v_item record;
  v_setting record;
  v_warning jsonb;
  v_count integer;
  v_artifacts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = 'check_violation';
  END IF;
  IF p_warning_acknowledgements IS NULL
     OR jsonb_typeof(p_warning_acknowledgements) <> 'array' THEN
    RAISE EXCEPTION 'warning acknowledgements must be an array'
      USING errcode = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_warning_acknowledgements) ack
    WHERE jsonb_typeof(ack) <> 'object'
       OR length(btrim(COALESCE(ack->>'id', ''))) = 0
       OR length(btrim(COALESCE(ack->>'reason', ''))) = 0
  ) THEN
    RAISE EXCEPTION 'every warning acknowledgement requires id and reason'
      USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_book
  FROM public.spec_books
  WHERE id = p_spec_book_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'spec book not found' USING errcode = 'no_data_found';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_book.project_id;
  IF NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'spec book not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_template FROM public.spec_book_templates WHERE id = v_book.template_id;

  SELECT array_agg(a ORDER BY a) INTO v_audiences
  FROM (SELECT DISTINCT unnest(p_audiences) AS a) deduped;
  IF v_audiences IS NULL
     OR cardinality(v_audiences) = 0
     OR NOT (v_audiences <@ ARRAY['client','vendor','installer','internal','care']::text[]) THEN
    RAISE EXCEPTION 'one or more supported audiences are required'
      USING errcode = 'check_violation';
  END IF;
  IF p_issue_type NOT IN ('full','replacement','addendum') THEN
    RAISE EXCEPTION 'unsupported issue type' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_existing
  FROM public.spec_book_revisions
  WHERE spec_book_id = p_spec_book_id
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.issue_type IS DISTINCT FROM p_issue_type
       OR v_existing.base_revision_id IS DISTINCT FROM p_base_revision_id
       OR v_existing.requested_audiences IS DISTINCT FROM v_audiences
       OR v_existing.reason IS DISTINCT FROM NULLIF(btrim(p_reason), '') THEN
      RAISE EXCEPTION 'idempotency key was reused with a different request'
        USING errcode = 'unique_violation';
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.audience), '[]'::jsonb)
      INTO v_artifacts
    FROM public.spec_book_artifacts a
    WHERE a.revision_id = v_existing.id;
    RETURN jsonb_build_object(
      'revision', to_jsonb(v_existing),
      'artifacts', v_artifacts,
      'warnings', '[]'::jsonb,
      'idempotent', true
    );
  END IF;

  SELECT id INTO v_prior_revision_id
  FROM public.spec_book_revisions
  WHERE spec_book_id = p_spec_book_id AND status = 'issued'
  ORDER BY revision_number DESC
  LIMIT 1;

  IF p_issue_type = 'full' AND p_base_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'full issue cannot name a base revision'
      USING errcode = 'check_violation';
  END IF;
  IF p_issue_type IN ('replacement','addendum') THEN
    IF p_base_revision_id IS NULL OR length(btrim(COALESCE(p_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'replacement/addendum requires an issued base and reason'
        USING errcode = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.spec_book_revisions
      WHERE id = p_base_revision_id
        AND spec_book_id = p_spec_book_id
        AND status = 'issued'
    ) THEN
      RAISE EXCEPTION 'base revision is not an issued revision of this book'
        USING errcode = 'check_violation';
    END IF;
  END IF;

  -- Duplicate non-empty document codes.
  FOR v_item IN
    SELECT upper(btrim(document_code)) AS code, count(*) AS n
    FROM public._spec_book_current_item_snapshots(p_spec_book_id)
    WHERE NULLIF(btrim(document_code), '') IS NOT NULL
    GROUP BY upper(btrim(document_code))
    HAVING count(*) > 1
  LOOP
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'duplicate_document_code', 'documentCode', v_item.code, 'count', v_item.n
    ));
  END LOOP;

  SELECT count(*) INTO v_count
  FROM public._spec_book_current_item_snapshots(p_spec_book_id);
  IF v_count > COALESCE((v_template.layout_settings->>'maxItems')::integer, 500) THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'book_item_limit_exceeded',
      'count', v_count,
      'limit', COALESCE((v_template.layout_settings->>'maxItems')::integer, 500)
    ));
  END IF;

  -- Per-line preflight and warnings.
  FOR v_item IN
    SELECT * FROM public._spec_book_current_item_snapshots(p_spec_book_id)
  LOOP
    IF v_item.item_type = 'fixed' THEN
      IF length(btrim(COALESCE(v_item.item_snapshot->>'name', ''))) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_name','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF length(btrim(COALESCE(v_item.document_code, ''))) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_document_code','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF v_item.item_snapshot#>>'{room,id}' IS NULL THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_room','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF COALESCE((v_item.item_snapshot->>'quantity')::integer, 0) <= 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','invalid_quantity','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF jsonb_array_length(COALESCE(v_item.item_snapshot->'selectedMedia', '[]'::jsonb)) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_image','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_each(v_item.item_snapshot->'selection') f
        WHERE f.value->'value' <> 'null'::jsonb
           OR COALESCE((f.value->>'na')::boolean, false)
      ) THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_selection','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF 'vendor' = ANY(v_audiences)
         AND v_item.item_snapshot#>>'{vendor,id}' IS NULL
         AND length(btrim(COALESCE(v_item.item_snapshot#>>'{vendor,name}', ''))) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_vendor_fact','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF 'installer' = ANY(v_audiences)
         AND v_item.item_snapshot#>'{selection,exactLocation,value}' = 'null'::jsonb
         AND NOT COALESCE((v_item.item_snapshot#>>'{selection,exactLocation,na}')::boolean, false) THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_install_location','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
    END IF;

    IF length(btrim(COALESCE(v_item.item_snapshot#>>'{notes,client}', ''))) = 0 THEN
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'id','missing-client-note:' || v_item.ffe_item_id::text,
        'code','missing_optional_note','ffeItemId',v_item.ffe_item_id
      ));
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_each_text(COALESCE(v_item.item_snapshot->'sourceVerification', '{}'::jsonb)) sv
      WHERE sv.value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        AND sv.value::timestamptz < now() - interval '180 days'
    ) THEN
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'id','stale-source:' || v_item.ffe_item_id::text,
        'code','stale_source_verification','ffeItemId',v_item.ffe_item_id
      ));
    END IF;
  END LOOP;

  -- Structural ownership/version checks are repeated here even though write
  -- triggers reject bad links, so preflight fails closed against legacy/manual
  -- rows and optimistic clients.
  FOR v_setting IN
    SELECT s.*, i.project_id, sp.row_version
    FROM public.spec_book_item_settings s
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    JOIN public.project_ffe_specs sp ON sp.ffe_item_id = i.id
    WHERE s.spec_book_id = p_spec_book_id AND s.included
  LOOP
    IF v_setting.project_id <> v_book.project_id THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code','invalid_item_ownership','ffeItemId',v_setting.ffe_item_id
      ));
    END IF;
    IF v_setting.publication_overrides ? 'expectedRowVersion'
       AND (v_setting.publication_overrides->>'expectedRowVersion')::integer <> v_setting.row_version THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code','row_version_conflict','ffeItemId',v_setting.ffe_item_id,
        'expected',v_setting.publication_overrides->>'expectedRowVersion',
        'actual',v_setting.row_version
      ));
    END IF;
    IF (
      ('client' = ANY(v_audiences) OR 'care' = ANY(v_audiences))
      AND public._spec_book_has_forbidden_keys(
        v_setting.publication_overrides,
        ARRAY[
          'tradePrice','tradePriceCents','trade_price_cents','markup','markupPercent',
          'privateNotes','private_notes','tradeNotes','trade_notes','vendorContact',
          'vendor_contact','procurementNotes','procurement_notes','installNotes'
        ]::text[]
      )
    ) THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code','audience_privacy_violation','ffeItemId',v_setting.ffe_item_id
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_blockers) > 0 THEN
    RAISE EXCEPTION 'spec_book_preflight_failed'
      USING errcode = 'check_violation',
            detail = jsonb_build_object('blockers', v_blockers, 'warnings', v_warnings)::text;
  END IF;

  -- Every warning on an issue attempt must be explicitly acknowledged with a
  -- reason; acknowledgement records are frozen on the revision.
  FOR v_warning IN SELECT value FROM jsonb_array_elements(v_warnings)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_warning_acknowledgements) ack
      WHERE ack->>'id' = v_warning->>'id'
        AND length(btrim(COALESCE(ack->>'reason',''))) > 0
    ) THEN
      RAISE EXCEPTION 'spec_book_warnings_unacknowledged'
        USING errcode = 'check_violation',
              detail = jsonb_build_object('warnings', v_warnings)::text;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'projectRoomId', c.project_room_id,
    'title', c.title,
    'position', c.position,
    'heroMedia', c.hero_media,
    'pageTemplate', c.page_template,
    'reviewState', c.review_state
  ) ORDER BY c.position, c.id), '[]'::jsonb)
  INTO v_chapters
  FROM public.spec_book_chapters c
  WHERE c.spec_book_id = p_spec_book_id AND c.included;

  SELECT
    COALESCE(jsonb_agg(item_snapshot || jsonb_build_object('contentHash', content_hash)
      ORDER BY chapter_position, item_position, ffe_item_id)
      FILTER (WHERE item_type = 'fixed'), '[]'::jsonb),
    COALESCE(jsonb_agg(item_snapshot || jsonb_build_object('contentHash', content_hash)
      ORDER BY chapter_position, item_position, ffe_item_id)
      FILTER (WHERE item_type = 'allowance'), '[]'::jsonb),
    COALESCE(jsonb_agg(item_snapshot || jsonb_build_object('contentHash', content_hash)
      ORDER BY chapter_position, item_position, ffe_item_id)
      FILTER (WHERE item_type = 'tbd'), '[]'::jsonb)
  INTO v_fixed, v_allowances, v_tbd
  FROM public._spec_book_current_item_snapshots(p_spec_book_id);

  v_template_snapshot := to_jsonb(v_template);
  v_render_snapshot := jsonb_build_object(
    'contractVersion', 1,
    'book', jsonb_build_object(
      'id', v_book.id, 'projectId', v_book.project_id, 'title', v_book.title,
      'settings', v_book.settings
    ),
    'project', jsonb_build_object(
      'id', v_project.id, 'name', v_project.name, 'siteAddress', v_project.site_address
    ),
    'template', v_template_snapshot,
    'chapters', v_chapters,
    'items', v_fixed,
    'allowances', v_allowances,
    'tbd', v_tbd,
    'audiences', to_jsonb(v_audiences),
    'issue', jsonb_build_object(
      'type', p_issue_type,
      'reason', NULLIF(btrim(p_reason), ''),
      'baseRevisionId', p_base_revision_id
    )
  );

  SELECT COALESCE(max(revision_number), 0) + 1 INTO v_revision_number
  FROM public.spec_book_revisions WHERE spec_book_id = p_spec_book_id;

  INSERT INTO public.spec_book_revisions (
    spec_book_id, revision_number, idempotency_key, issue_type,
    prior_revision_id, base_revision_id, reason, status, requested_audiences,
    warning_acknowledgements, template_snapshot, render_snapshot,
    snapshot_checksum, created_by
  )
  VALUES (
    p_spec_book_id, v_revision_number, p_idempotency_key, p_issue_type,
    v_prior_revision_id, p_base_revision_id, NULLIF(btrim(p_reason), ''),
    'pending', v_audiences, p_warning_acknowledgements,
    v_template_snapshot, v_render_snapshot,
    encode(
      extensions.digest(public._spec_book_canonical_json(v_render_snapshot), 'sha256'),
      'hex'
    ),
    auth.uid()
  )
  RETURNING * INTO v_revision;

  INSERT INTO public.spec_book_revision_items (
    revision_id, ffe_item_id, item_type, document_code, chapter_position,
    item_position, item_snapshot, content_hash
  )
  SELECT
    v_revision.id, cur.ffe_item_id, cur.item_type, cur.document_code,
    cur.chapter_position, cur.item_position, cur.item_snapshot, cur.content_hash
  FROM public._spec_book_current_item_snapshots(p_spec_book_id) cur;

  INSERT INTO public.spec_book_artifacts (revision_id, audience)
  SELECT v_revision.id, unnest(v_audiences);

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.audience), '[]'::jsonb)
    INTO v_artifacts
  FROM public.spec_book_artifacts a
  WHERE a.revision_id = v_revision.id;

  RETURN jsonb_build_object(
    'revision', to_jsonb(v_revision),
    'artifacts', v_artifacts,
    'warnings', v_warnings,
    'idempotent', false
  );
END;
$$;

-- A revision is issued only after all requested audience PDFs are durable and
-- linked to ready project_documents. Retrying a failed artifact never creates
-- a new revision.
CREATE OR REPLACE FUNCTION public.finalize_spec_book_issue(p_revision_id uuid)
RETURNS public.spec_book_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision public.spec_book_revisions;
  v_designer_id uuid;
  v_expected integer;
  v_ready integer;
  v_service boolean;
BEGIN
  v_service := COALESCE(auth.jwt()->>'role', '') = 'service_role'
               OR current_user = 'service_role';

  SELECT r.*
    INTO v_revision
  FROM public.spec_book_revisions r
  JOIN public.spec_books b ON b.id = r.spec_book_id
  JOIN public.projects p ON p.id = b.project_id
  WHERE r.id = p_revision_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found' USING errcode = 'no_data_found';
  END IF;
  SELECT p.designer_id INTO v_designer_id
  FROM public.spec_books b
  JOIN public.projects p ON p.id = b.project_id
  WHERE b.id = v_revision.spec_book_id;
  IF NOT v_service
     AND (auth.uid() IS NULL OR NOT public.is_studio_comember(v_designer_id)) THEN
    RAISE EXCEPTION 'revision not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_revision.status = 'issued' THEN
    RETURN v_revision;
  END IF;

  v_expected := cardinality(v_revision.requested_audiences);
  SELECT count(*) INTO v_ready
  FROM public.spec_book_artifacts a
  JOIN public.project_documents d ON d.id = a.project_document_id
  WHERE a.revision_id = p_revision_id
    AND a.status = 'ready'
    AND a.audience = ANY(v_revision.requested_audiences)
    AND a.format = 'pdf'
    AND a.checksum_sha256 IS NOT NULL
    AND a.storage_path IS NOT NULL
    AND d.status = 'ready'
    AND d.storage_path = a.storage_path;

  IF v_ready <> v_expected OR (
    SELECT count(*) FROM public.spec_book_artifacts WHERE revision_id = p_revision_id
  ) <> v_expected THEN
    RAISE EXCEPTION 'all requested artifacts must be durable before finalization'
      USING errcode = 'object_not_in_prerequisite_state',
            detail = jsonb_build_object('expected', v_expected, 'ready', v_ready)::text;
  END IF;

  UPDATE public.spec_book_revisions
  SET status = 'issued', issued_at = now()
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  RETURN v_revision;
END;
$$;

-- ── Artifact share lifecycle ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_spec_book_share(
  p_artifact_id uuid,
  p_label text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_artifact public.spec_book_artifacts;
  v_revision public.spec_book_revisions;
  v_designer_id uuid;
  v_token text;
  v_hash text;
  v_share_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expiry must be in the future' USING errcode = 'check_violation';
  END IF;

  SELECT a.*
    INTO v_artifact
  FROM public.spec_book_artifacts a
  JOIN public.spec_book_revisions r ON r.id = a.revision_id
  JOIN public.spec_books b ON b.id = r.spec_book_id
  JOIN public.projects p ON p.id = b.project_id
  JOIN public.project_documents d ON d.id = a.project_document_id
  WHERE a.id = p_artifact_id
    AND a.status = 'ready'
    AND r.status = 'issued'
    AND d.status = 'ready';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ready issued artifact not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  SELECT r.* INTO v_revision
  FROM public.spec_book_revisions r
  WHERE r.id = v_artifact.revision_id;
  SELECT p.designer_id INTO v_designer_id
  FROM public.spec_books b
  JOIN public.projects p ON p.id = b.project_id
  WHERE b.id = v_revision.spec_book_id;
  IF NOT public.is_studio_comember(v_designer_id) THEN
    RAISE EXCEPTION 'ready issued artifact not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.document_shares (
    proposal_id, spec_book_artifact_id, token_hash, label, visibility,
    status, expires_at, created_by
  )
  VALUES (
    NULL, p_artifact_id, v_hash, NULLIF(btrim(p_label), ''),
    jsonb_build_object('audience', v_artifact.audience, 'format', v_artifact.format),
    'active', p_expires_at, auth.uid()
  )
  RETURNING id INTO v_share_id;

  RETURN jsonb_build_object(
    'id', v_share_id,
    'token', v_token,
    'artifactId', p_artifact_id,
    'audience', v_artifact.audience,
    'expiresAt', p_expires_at
  );
END;
$$;

-- 00266 body rebased to support either target while preserving proposal shares.
CREATE OR REPLACE FUNCTION public.revoke_document_share(p_share_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  UPDATE public.document_shares s
  SET status = 'revoked'
  WHERE s.id = p_share_id
    AND (
      (
        s.proposal_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.proposals p
          WHERE p.id = s.proposal_id
            AND public.is_studio_comember(p.designer_id)
        )
      )
      OR (
        s.spec_book_artifact_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.spec_book_artifacts a
          JOIN public.spec_book_revisions r ON r.id = a.revision_id
          JOIN public.spec_books b ON b.id = r.spec_book_id
          JOIN public.projects p ON p.id = b.project_id
          WHERE a.id = s.spec_book_artifact_id
            AND public.is_studio_comember(p.designer_id)
        )
      )
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'share not found or not owned' USING errcode = 'no_data_found';
  END IF;
  RETURN true;
END;
$$;

-- Rebase the proposal resolver so artifact tokens cannot increment proposal
-- share stats before returning empty.
CREATE OR REPLACE FUNCTION public.resolve_document_share(p_token text)
RETURNS TABLE (proposal_id uuid, visibility jsonb, label text, studio_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_share public.document_shares;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN;
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT * INTO v_share
  FROM public.document_shares s
  WHERE s.token_hash = v_hash
    AND s.proposal_id IS NOT NULL
    AND s.status = 'active'
    AND (s.expires_at IS NULL OR s.expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.document_shares
  SET view_count = view_count + 1, last_viewed_at = now()
  WHERE id = v_share.id;

  RETURN QUERY
  SELECT
    v_share.proposal_id,
    v_share.visibility,
    v_share.label,
    COALESCE(pr.full_name, pr.email, 'the studio')::text
  FROM public.proposals p
  LEFT JOIN public.profiles pr ON pr.id = p.designer_id
  WHERE p.id = v_share.proposal_id;
END;
$$;

-- Guest/server resolver. Unknown, malformed, expired, revoked, audience-mismatched,
-- non-ready, or non-issued shares all return NULL. No working-book row or raw
-- storage path is serialized. The opaque download route revalidates this token
-- server-side and signs the private storage object at the HTTP boundary.
CREATE OR REPLACE FUNCTION public.resolve_spec_book_share(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_share public.document_shares;
  v_result jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RETURN NULL;
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT * INTO v_share
  FROM public.document_shares s
  WHERE s.token_hash = v_hash
    AND s.spec_book_artifact_id IS NOT NULL
    AND s.status = 'active'
    AND (s.expires_at IS NULL OR s.expires_at > now())
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'shareId', v_share.id,
    'artifactId', a.id,
    'audience', a.audience,
    'format', a.format,
    'label', v_share.label,
    'title', d.title,
    'sizeBytes', a.size_bytes,
    'checksumSha256', a.checksum_sha256,
    'issuedAt', r.issued_at,
    'shareExpiresAt', v_share.expires_at,
    'downloadUrl', '/field/spec-book/' || p_token || '/download'
  )
  INTO v_result
  FROM public.spec_book_artifacts a
  JOIN public.spec_book_revisions r ON r.id = a.revision_id
  JOIN public.project_documents d ON d.id = a.project_document_id
  WHERE a.id = v_share.spec_book_artifact_id
    AND a.status = 'ready'
    AND r.status = 'issued'
    AND d.status = 'ready'
    AND a.checksum_sha256 IS NOT NULL
    AND a.storage_path IS NOT NULL
    AND v_share.visibility->>'audience' = a.audience
    AND v_share.visibility->>'format' = a.format;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.document_shares
  SET view_count = view_count + 1, last_viewed_at = now()
  WHERE id = v_share.id;
  RETURN v_result;
END;
$$;

-- ── Explicit ACLs (Supabase post-2026 grant defaults) ──────────────────────
REVOKE ALL ON public.project_ffe_specs FROM PUBLIC, anon;
REVOKE ALL ON public.spec_book_templates FROM PUBLIC, anon;
REVOKE ALL ON public.spec_books FROM PUBLIC, anon;
REVOKE ALL ON public.spec_book_chapters FROM PUBLIC, anon;
REVOKE ALL ON public.spec_book_item_settings FROM PUBLIC, anon;
REVOKE ALL ON public.spec_book_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.spec_book_revision_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.spec_book_artifacts FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ffe_specs TO authenticated;
GRANT SELECT ON public.spec_book_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spec_books TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spec_book_chapters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spec_book_item_settings TO authenticated;
GRANT SELECT ON public.spec_book_revisions TO authenticated;
GRANT SELECT ON public.spec_book_revision_items TO authenticated;
GRANT SELECT ON public.spec_book_artifacts TO authenticated;

GRANT ALL ON public.project_ffe_specs TO service_role;
GRANT ALL ON public.spec_book_templates TO service_role;
GRANT ALL ON public.spec_books TO service_role;
GRANT ALL ON public.spec_book_chapters TO service_role;
GRANT ALL ON public.spec_book_item_settings TO service_role;
GRANT ALL ON public.spec_book_revisions TO service_role;
GRANT ALL ON public.spec_book_revision_items TO service_role;
GRANT ALL ON public.spec_book_artifacts TO service_role;

REVOKE ALL ON FUNCTION public.ensure_project_spec_book(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.place_product_in_project(uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_spec_book_issue(uuid, text[], text, text, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_spec_book_issue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_spec_book_share(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_document_share(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_document_share(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_spec_book_share(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_project_spec_book(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_product_in_project(uuid, uuid, uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_spec_book_issue(uuid, text[], text, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_spec_book_issue(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_spec_book_share(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_document_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_document_share(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_spec_book_share(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._spec_book_resolve_field(jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz,timestamptz,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._spec_book_canonical_json(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._spec_book_current_item_snapshots(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._spec_book_has_forbidden_keys(jsonb,text[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._spec_book_resolve_field(jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz,timestamptz,timestamptz,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public._spec_book_canonical_json(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._spec_book_current_item_snapshots(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._spec_book_has_forbidden_keys(jsonb,text[]) TO service_role;

COMMENT ON TABLE public.project_ffe_specs IS
  'One-to-one project-selection overlay for a live project_ffe_items schedule line. Product master rows are never overwritten.';
COMMENT ON TABLE public.spec_book_revisions IS
  'Immutable issued-content ledger. Frozen template/render snapshots may only transition pending→issued after every artifact is durable.';
COMMENT ON TABLE public.spec_book_artifacts IS
  'One independently retryable immutable-edition artifact per revision/audience/PDF.';
COMMENT ON FUNCTION public.place_product_in_project(uuid, uuid, uuid, uuid, text, jsonb) IS
  'Atomic shared capture-placement path: fill an empty FF&E line or create a distinct line plus project selection overlay.';
COMMENT ON FUNCTION public.prepare_spec_book_issue(uuid, text[], text, text, uuid, text, jsonb) IS
  'Locks the canonical book, fails closed on preflight, freezes canonical snapshots/hashes, and creates pending audience artifacts idempotently.';
COMMENT ON FUNCTION public.resolve_spec_book_share(text) IS
  'Hash/status/expiry/audience-bound artifact resolver. Returns ready immutable artifact metadata and an opaque download route; never working rows or storage paths.';
