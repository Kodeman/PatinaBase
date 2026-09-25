-- =====================================================================================
-- 00670 — Shared-direction editions: typed decision-review RPCs and immutable edition
--         copies (NI-05, SQ-219, story US-11)
--
-- Contract of record: CONTRACT-C revision 4
-- (artifacts/ios27-delivery-plan-2026-09-23/execute/contracts/CONTRACT-C-shared-direction.md),
-- §C.3.1, §C.3.3, §C.4, §C.5 and the NI-05 line of §C.9.
--
-- What this adds, all new objects; nothing installed is redefined:
--   1. Bucket `project-approval-editions`: private, 50 MiB, PDF/PNG/JPEG, and NO
--      storage.objects policy for any role, so only service_role reaches it (as
--      `project-review-media`, 00433).
--   2. `public.project_approval_edition_objects`: one verified, service-role-only copy
--      per (decision, attachment). Path CHECK pins
--      `<decisionId>/<attachmentId>/<sha256>/<UUIDv4 attemptId>`. Rows refuse UPDATE and
--      DELETE. REVOKE ALL from every role.
--   3. `app_private.project_approval_edition_attachment_rows` / `..._manifest`: the
--      manifest serializer (§C.3) and the plan-set assert (§C.3.3): for a plan_issue the
--      canonical set checksum is recomputed from the plan_issue_prints rows served, and a
--      set that does not reproduce `artifact_hash` serves `attachments: null`.
--   4. `public.get_project_decision_editions(p_held jsonb)` (1..200 items) and the
--      single-item wrapper `public.get_project_decision_edition(...)`, granted to
--      authenticated only. Answers: ok | revoked | not_found | unauthorized (§C.5).
--      The `ok` path calls the installed projection `get_project_decision_reviews` once
--      per kept project, under the same per-decision reader predicate
--      `list_my_project_decision_reviews` uses (00467). The reader rule is not restated
--      anywhere else (§C.4).
--   5. `app_private.record_project_approval_edition_object(...)` (the writer: the
--      attachment must be in the served manifest, frozen checksum match, storage object
--      must exist with matching size and mimetype, INSERT ... ON CONFLICT DO NOTHING,
--      returns whether this call's path is the recorded one) and its reachable
--      `public` wrapper, service_role only (§C.3.1 N1, the 00546 grant shape).
--   6. `public.project_approval_attachment_objects(p_decision_id)`, service_role only:
--      the manifest joined to recorded copies, with a source pointer only for rows not
--      yet recorded. The signer (NI-06) signs recorded object paths and nothing else.
--   7. Hourly pg_cron job `project-approval-editions-sweep-hourly` →
--      public.invoke_edge_function('project-approval-attachments', {"mode":"sweep"}).
--      NI-06 owns the function and records run history in job_runs; until it is
--      deployed the call is a harmless 404.
--
-- Left untouched: public.get_project_decision_review, the 00467 private resolver,
-- list_my_project_decision_reviews, get_project_decision_reviews (head 00573), the
-- project-documents bucket and its policies.
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   SELECT cron.unschedule('project-approval-editions-sweep-hourly');
--   DROP FUNCTION public.project_approval_attachment_objects(uuid),
--     public.record_project_approval_edition_object(uuid, uuid, text, bigint, text, text),
--     app_private.record_project_approval_edition_object(uuid, uuid, text, bigint, text, text),
--     public.get_project_decision_edition(uuid, integer, text),
--     public.get_project_decision_editions(jsonb),
--     app_private.project_approval_edition_manifest(uuid, boolean),
--     app_private.project_approval_edition_attachment_rows(uuid);
--   DROP TABLE public.project_approval_edition_objects;
--   DROP FUNCTION public.guard_project_approval_edition_object_immutable();
--   and the bucket once it holds no objects.
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS app_private;

-- ── 1. The bucket ───────────────────────────────────────────────────────────────────
-- No storage.objects policy is created for it, for any role (a SQL test asserts none
-- references it). Only service_role, which bypasses storage RLS, reads or writes it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-approval-editions',
  'project-approval-editions',
  false,
  52428800,
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Recorded edition copies ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_approval_edition_objects (
  decision_id   uuid NOT NULL
    REFERENCES public.client_decisions(id) ON DELETE RESTRICT,
  attachment_id uuid NOT NULL,
  bucket        text NOT NULL DEFAULT 'project-approval-editions'
    CHECK (bucket = 'project-approval-editions'),
  object_path   text NOT NULL UNIQUE,
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  content_type  text NOT NULL
    CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  verified_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_id, attachment_id),
  -- Exactly one UUIDv4 attempt segment after <decisionId>/<attachmentId>/<sha256>/
  -- (revision 4): each attempt publishes to a path only it can own.
  CONSTRAINT project_approval_edition_objects_path_check CHECK (
    object_path ~ (
      '^' || decision_id::text || '/' || attachment_id::text || '/' || sha256
      || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  )
);

COMMENT ON TABLE public.project_approval_edition_objects IS
  'CONTRACT-C §C.3.1. One verified, service-role-only copy of an approval edition '
  'attachment in the project-approval-editions bucket. Written only by '
  'record_project_approval_edition_object (first writer wins). Immutable: a recorded '
  'object is never replaced or removed.';

CREATE OR REPLACE FUNCTION public.guard_project_approval_edition_object_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'project approval edition objects are immutable'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_approval_edition_object_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_immutable_project_approval_edition_objects
  ON public.project_approval_edition_objects;
CREATE TRIGGER a_immutable_project_approval_edition_objects
BEFORE UPDATE OR DELETE ON public.project_approval_edition_objects
FOR EACH ROW EXECUTE FUNCTION public.guard_project_approval_edition_object_immutable();

ALTER TABLE public.project_approval_edition_objects ENABLE ROW LEVEL SECURITY;
-- No policies: every read and write goes through the definer functions below.
REVOKE ALL ON TABLE public.project_approval_edition_objects
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. The manifest serializer and the plan-set assert ──────────────────────────────
-- One row per attachment of a Stage-2 edition. Plan sheets are ordered by
-- upper(btrim(sheet_number)), the order set_checksum uses (00429). A spec book has
-- exactly one attachment whose checksum is the frozen artifact_hash. A budget has none.
-- source_* are internal pointers; object_path is the recorded copy, if any.
CREATE OR REPLACE FUNCTION app_private.project_approval_edition_attachment_rows(
  p_decision_id uuid
)
RETURNS TABLE (
  attachment_id uuid,
  kind text,
  attachment_position integer,
  label text,
  sha256 text,
  sheet_number text,
  rev_letter text,
  size_bytes bigint,
  content_type text,
  source_bucket text,
  source_path text,
  object_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    issue_print.id,
    'plan_sheet',
    (row_number() OVER (
      ORDER BY upper(btrim(issue_print.sheet_number)), issue_print.id
    ))::integer,
    btrim(issue_print.sheet_number) || ' · ' || issue_print.sheet_title
      || ' · rev ' || issue_print.rev_letter,
    issue_print.sha256,
    btrim(issue_print.sheet_number),
    issue_print.rev_letter,
    COALESCE(edition.size_bytes, document.size_bytes),
    COALESCE(
      edition.content_type,
      CASE lower(btrim(COALESCE(document.doc_type, '')))
        WHEN 'pdf' THEN 'application/pdf'
        WHEN 'png' THEN 'image/png'
        WHEN 'jpg' THEN 'image/jpeg'
        WHEN 'jpeg' THEN 'image/jpeg'
      END
    ),
    'project-documents',
    document.storage_path,
    edition.object_path
  FROM public.client_decisions AS decision
  JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = decision.id
   AND artifact.project_id = decision.project_id
   AND artifact.source_kind = 'plan_issue'
  JOIN public.plan_issue_prints AS issue_print
    ON issue_print.issue_id = artifact.source_id
  JOIN public.plan_prints AS plan_print
    ON plan_print.id = issue_print.print_id
  JOIN public.project_documents AS document
    ON document.id = plan_print.project_document_id
  LEFT JOIN public.project_approval_edition_objects AS edition
    ON edition.decision_id = decision.id
   AND edition.attachment_id = issue_print.id
  WHERE decision.id = p_decision_id
    AND decision.approval_contract = 'project_artifact_v1'
  UNION ALL
  SELECT
    spec.id,
    'spec_book_pdf',
    1,
    artifact.artifact_title,
    artifact.artifact_hash,
    NULL,
    NULL,
    COALESCE(edition.size_bytes, document.size_bytes),
    COALESCE(edition.content_type, 'application/pdf'),
    'project-documents',
    document.storage_path,
    edition.object_path
  FROM public.client_decisions AS decision
  JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = decision.id
   AND artifact.project_id = decision.project_id
   AND artifact.source_kind = 'spec_book_artifact'
  JOIN public.spec_book_artifacts AS spec
    ON spec.id = artifact.source_id
  LEFT JOIN public.project_documents AS document
    ON document.id = spec.project_document_id
  LEFT JOIN public.project_approval_edition_objects AS edition
    ON edition.decision_id = decision.id
   AND edition.attachment_id = spec.id
  WHERE decision.id = p_decision_id
    AND decision.approval_contract = 'project_artifact_v1';
$$;

REVOKE ALL ON FUNCTION app_private.project_approval_edition_attachment_rows(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The `attachments` value (§C.3). `[]` for a budget; NULL for a non-Stage-2 id, an
-- empty or miscounted set, or a plan set whose recomputed canonical checksum is not
-- artifact_hash (§C.3.3: the device never reimplements _plan_room_canonical_json).
-- p_with_objects adds recorded/objectPath/source for the service-role resolver; the
-- authenticated RPC never receives a storage path.
CREATE OR REPLACE FUNCTION app_private.project_approval_edition_manifest(
  p_decision_id uuid,
  p_with_objects boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_artifact public.project_approval_artifacts%ROWTYPE;
  v_count integer;
  v_checksum text;
  v_expected_count integer;
  v_entries jsonb;
BEGIN
  SELECT artifact.* INTO v_artifact
  FROM public.client_decisions AS decision
  JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = decision.id
   AND artifact.project_id = decision.project_id
  WHERE decision.id = p_decision_id
    AND decision.approval_contract = 'project_artifact_v1';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_artifact.source_kind = 'budget_version' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT
    count(*)::integer,
    encode(extensions.digest(public._plan_room_canonical_json(
      COALESCE(jsonb_agg(jsonb_build_object(
        'sheetNumber', entry.sheet_number,
        'revLetter', entry.rev_letter,
        'sha256', entry.sha256
      ) ORDER BY entry.attachment_position), '[]'::jsonb)), 'sha256'), 'hex'),
    jsonb_agg(
      jsonb_build_object(
        'attachmentId', entry.attachment_id,
        'kind', entry.kind,
        'position', entry.attachment_position,
        'label', entry.label,
        'sha256', entry.sha256,
        'sizeBytes', entry.size_bytes,
        'contentType', entry.content_type
      ) || CASE WHEN p_with_objects THEN jsonb_build_object(
        'recorded', entry.object_path IS NOT NULL,
        'objectPath', entry.object_path,
        'source', CASE WHEN entry.object_path IS NULL THEN jsonb_build_object(
          'bucket', entry.source_bucket,
          'path', entry.source_path
        ) END
      ) ELSE '{}'::jsonb END
      ORDER BY entry.attachment_position
    )
  INTO v_count, v_checksum, v_entries
  FROM app_private.project_approval_edition_attachment_rows(p_decision_id) AS entry;

  IF v_artifact.source_kind = 'plan_issue' THEN
    SELECT issue.sheet_count INTO v_expected_count
    FROM public.plan_issues AS issue
    WHERE issue.id = v_artifact.source_id;
    IF v_count = 0
       OR v_count IS DISTINCT FROM v_expected_count
       OR v_checksum IS DISTINCT FROM v_artifact.artifact_hash
    THEN
      RETURN NULL;
    END IF;
  ELSIF v_count <> 1 THEN
    RETURN NULL;
  END IF;

  RETURN v_entries;
END;
$$;

REVOKE ALL ON FUNCTION app_private.project_approval_edition_manifest(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 4. The typed edition RPCs (§C.5) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_project_decision_editions(p_held jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_count integer;
  v_project_id uuid;
  v_items jsonb := '{}'::jsonb;
  v_editions jsonb;
  -- Checked before any cast: one malformed item answers not_found on its own and
  -- never fails the batch.
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_held IS NULL OR jsonb_typeof(p_held) <> 'array' THEN
    RAISE EXCEPTION 'p_held must be a JSON array of 1 to 200 held editions'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_count := jsonb_array_length(p_held);
  IF v_count < 1 OR v_count > 200 THEN
    RAISE EXCEPTION 'p_held must carry 1 to 200 held editions, got %', v_count
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_held) AS held(value)
    WHERE jsonb_typeof(held.value) <> 'object'
       OR jsonb_typeof(held.value->'decisionId') IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'every held edition must be an object with a decisionId'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Step 1. Projection once per project: the distinct projects of the requested
  -- Stage-2 decisions the caller reads under the 00467 predicate
  -- (list_my_project_decision_reviews), each serialized exactly once. With no
  -- authenticated subject nothing is projected.
  IF v_actor IS NOT NULL THEN
    FOR v_project_id IN
      SELECT DISTINCT decision.project_id
      FROM jsonb_array_elements(p_held) AS held(value)
      JOIN public.client_decisions AS decision
        ON decision.id = CASE
             WHEN held.value->>'decisionId' ~* v_uuid_pattern
             THEN (held.value->>'decisionId')::uuid
           END
      LEFT JOIN public.project_decision_authority_snapshots AS snapshot
        ON snapshot.decision_id = decision.id
       AND snapshot.project_id = decision.project_id
      WHERE decision.approval_contract = 'project_artifact_v1'
        AND decision.project_id IS NOT NULL
        AND (
          snapshot.decision_lead_id = v_actor
          OR public.is_design_studio_comember(decision.designer_id)
        )
    LOOP
      SELECT v_items || COALESCE(
        jsonb_object_agg(item.value->>'decisionId', item.value),
        '{}'::jsonb
      )
      INTO v_items
      FROM jsonb_array_elements(
        public.get_project_decision_reviews(v_project_id)
      ) AS item(value);
    END LOOP;
  END IF;

  -- Step 2. A malformed item (decisionId not a UUID, heldAuthorityRevision present but
  -- not an integer) → not_found, echoing the decisionId as sent. No subject →
  -- unauthorized. Present in the projection → ok. Every other id takes the one
  -- negative path, identical whether or not the row exists: one LEFT JOIN lookup, the
  -- reader predicate on the (possibly NULL) designer, then the possession proof.
  SELECT jsonb_agg(
    CASE
      WHEN held.decision_id IS NULL THEN jsonb_build_object(
        'decisionId', held.held_decision_id,
        'status', 'not_found',
        'review', NULL,
        'attachments', NULL,
        'editionFigures', NULL
      )
      WHEN v_actor IS NULL THEN jsonb_build_object(
        'decisionId', held.decision_id,
        'status', 'unauthorized',
        'review', NULL,
        'attachments', NULL,
        'editionFigures', NULL
      )
      WHEN v_items ? held.decision_id::text THEN jsonb_build_object(
        'decisionId', held.decision_id,
        'status', 'ok',
        'review', v_items->(held.decision_id::text),
        'attachments',
          app_private.project_approval_edition_manifest(held.decision_id, false),
        'editionFigures', CASE
          WHEN artifact.source_kind = 'budget_version' THEN jsonb_build_object(
            'checkpointCode', artifact.source_snapshot->'checkpointCode',
            'publishedAt', artifact.source_snapshot->'publishedAt',
            'lowTotalCents', artifact.source_snapshot->'lowTotalCents',
            'targetTotalCents', artifact.source_snapshot->'targetTotalCents',
            'highTotalCents', artifact.source_snapshot->'highTotalCents'
          )
        END
      )
      ELSE jsonb_build_object(
        'decisionId', held.decision_id,
        'status', CASE
          WHEN NOT COALESCE(
                 snapshot.decision_lead_id = v_actor
                 OR public.is_design_studio_comember(decision.designer_id),
                 false
               )
           AND held.held_authority_revision IS NOT NULL
           AND held.held_artifact_checksum IS NOT NULL
           AND held.held_artifact_checksum
                 IS NOT DISTINCT FROM artifact.artifact_hash
           AND held.held_authority_revision
                 IS NOT DISTINCT FROM snapshot.authority_revision
          THEN 'revoked'
          ELSE 'not_found'
        END,
        'review', NULL,
        'attachments', NULL,
        'editionFigures', NULL
      )
    END
    ORDER BY held.ordinality
  )
  INTO v_editions
  FROM (
    SELECT
      element.ordinality,
      element.value->'decisionId' AS held_decision_id,
      CASE
        WHEN element.value->>'decisionId' ~* v_uuid_pattern
         AND (element.value->>'heldAuthorityRevision' IS NULL
              OR revision.value IS NOT NULL)
        THEN (element.value->>'decisionId')::uuid
      END AS decision_id,
      revision.value AS held_authority_revision,
      element.value->>'heldArtifactChecksum' AS held_artifact_checksum
    FROM jsonb_array_elements(p_held) WITH ORDINALITY AS element(value, ordinality)
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN element.value->>'heldAuthorityRevision' ~ '^-?[0-9]{1,10}$'
        THEN CASE
          WHEN (element.value->>'heldAuthorityRevision')::bigint
               BETWEEN -2147483648 AND 2147483647
          THEN (element.value->>'heldAuthorityRevision')::integer
        END
      END AS value
    ) AS revision
  ) AS held
  LEFT JOIN public.client_decisions AS decision
    ON decision.id = held.decision_id
   AND decision.approval_contract = 'project_artifact_v1'
  LEFT JOIN public.project_decision_authority_snapshots AS snapshot
    ON snapshot.decision_id = decision.id
   AND snapshot.project_id = decision.project_id
  LEFT JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = decision.id
   AND artifact.project_id = decision.project_id;

  RETURN jsonb_build_object(
    'contract', 'shared_direction_v1',
    'servedAt', now(),
    'editions', v_editions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_decision_editions(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_decision_editions(jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_decision_editions(jsonb) IS
  'CONTRACT-C §C.5 (shared_direction_v1). p_held: 1..200 of {decisionId, '
  'heldAuthorityRevision, heldArtifactChecksum}. Returns {contract, servedAt, '
  'editions: [{decisionId, status: ok|revoked|not_found|unauthorized, review, '
  'attachments, editionFigures}]} in request order. review is the '
  'get_project_decision_reviews item as served; it and attachments/editionFigures '
  'are non-null only on ok. revoked = the row exists, the caller is no longer a '
  'reader, and the held (authorityRevision, artifactChecksum) pair matches. An item '
  'whose decisionId is not a UUID or whose heldAuthorityRevision is not an integer '
  'answers not_found on its own. The projection runs once per project. '
  'get_project_decision_review is unchanged.';

CREATE OR REPLACE FUNCTION public.get_project_decision_edition(
  p_decision_id uuid,
  p_held_authority_revision integer DEFAULT NULL,
  p_held_artifact_checksum text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_envelope jsonb;
BEGIN
  IF p_decision_id IS NULL THEN
    RAISE EXCEPTION 'p_decision_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_envelope := public.get_project_decision_editions(jsonb_build_array(
    jsonb_build_object(
      'decisionId', p_decision_id,
      'heldAuthorityRevision', p_held_authority_revision,
      'heldArtifactChecksum', p_held_artifact_checksum
    )
  ));

  RETURN (v_envelope->'editions'->0) || jsonb_build_object(
    'contract', v_envelope->'contract',
    'servedAt', v_envelope->'servedAt'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_decision_edition(uuid, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_decision_edition(uuid, integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_decision_edition(uuid, integer, text) IS
  'CONTRACT-C §C.5 single-item wrapper over get_project_decision_editions: one '
  'edition object with contract and servedAt copied onto it. Used by NI-06 and the '
  'pre-act check (§C.8).';

-- ── 5. The recorder and its reachable wrapper (§C.3.1, N1) ─────────────────────────
-- Recorded rows are immutable, so everything a row asserts is checked before the
-- insert: the attachment is in the edition's served manifest (a set that fails the
-- plan-set assert has none, so nothing unservable is recorded), the checksum is the
-- frozen one, and size and content type are the stored object's own metadata. A spec
-- book is recorded only as application/pdf.
CREATE OR REPLACE FUNCTION app_private.record_project_approval_edition_object(
  p_decision_id uuid,
  p_attachment_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_content_type text,
  p_object_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_manifest jsonb;
  v_entry jsonb;
  v_metadata jsonb;
  v_recorded text;
BEGIN
  IF p_decision_id IS NULL OR p_attachment_id IS NULL OR p_object_path IS NULL THEN
    RAISE EXCEPTION 'decision, attachment and object path are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_manifest := app_private.project_approval_edition_manifest(p_decision_id, false);
  IF v_manifest IS NULL THEN
    RAISE EXCEPTION 'edition % has no servable attachment set', p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT entry.value INTO v_entry
  FROM jsonb_array_elements(v_manifest) AS entry(value)
  WHERE entry.value->>'attachmentId' = p_attachment_id::text;
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'attachment % is not part of edition %', p_attachment_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_sha256 IS DISTINCT FROM v_entry->>'sha256' THEN
    RAISE EXCEPTION 'edition object checksum does not match the frozen source checksum'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_entry->>'kind' = 'spec_book_pdf'
     AND p_content_type IS DISTINCT FROM 'application/pdf'
  THEN
    RAISE EXCEPTION 'a spec book edition object must be application/pdf'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT object.metadata INTO v_metadata
  FROM storage.objects AS object
  WHERE object.bucket_id = 'project-approval-editions'
    AND object.name = p_object_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no stored edition object at %', p_object_path
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_size_bytes IS DISTINCT FROM (
       CASE WHEN v_metadata->>'size' ~ '^[0-9]{1,18}$'
            THEN (v_metadata->>'size')::bigint
       END)
     OR p_content_type IS DISTINCT FROM v_metadata->>'mimetype'
  THEN
    RAISE EXCEPTION 'edition object size or content type does not match the stored object at %',
      p_object_path
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.project_approval_edition_objects (
    decision_id, attachment_id, object_path, sha256, size_bytes, content_type
  ) VALUES (
    p_decision_id, p_attachment_id, p_object_path, p_sha256, p_size_bytes,
    p_content_type
  )
  ON CONFLICT (decision_id, attachment_id) DO NOTHING;

  SELECT edition.object_path INTO v_recorded
  FROM public.project_approval_edition_objects AS edition
  WHERE edition.decision_id = p_decision_id
    AND edition.attachment_id = p_attachment_id;

  RETURN v_recorded = p_object_path;
END;
$$;

REVOKE ALL ON FUNCTION app_private.record_project_approval_edition_object(
  uuid, uuid, text, bigint, text, text
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.record_project_approval_edition_object(
  uuid, uuid, text, bigint, text, text
) IS
  'CONTRACT-C §C.3.1 writer. Refuses an edition whose manifest is NULL (the plan-set '
  'assert failed), an attachment outside that manifest, a sha256 other than the frozen '
  'source checksum (plan_issue_prints.sha256, or the spec-book artifact_hash), a spec '
  'book that is not application/pdf, a path with no storage.objects row in '
  'project-approval-editions, and a size or content type other than that object''s '
  'metadata size and mimetype; inserts ON CONFLICT (decision_id, attachment_id) DO '
  'NOTHING and returns whether p_object_path is the recorded one.';

CREATE OR REPLACE FUNCTION public.record_project_approval_edition_object(
  p_decision_id uuid,
  p_attachment_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_content_type text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app_private.record_project_approval_edition_object(
    p_decision_id, p_attachment_id, p_sha256, p_size_bytes, p_content_type,
    p_object_path
  );
$$;

REVOKE ALL ON FUNCTION public.record_project_approval_edition_object(
  uuid, uuid, text, bigint, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_project_approval_edition_object(
  uuid, uuid, text, bigint, text, text
) TO service_role;

COMMENT ON FUNCTION public.record_project_approval_edition_object(
  uuid, uuid, text, bigint, text, text
) IS
  'Service-role-only PostgREST entry to app_private.record_project_approval_edition_object '
  '(app_private is not exposed and service_role has no USAGE on it).';

-- ── 6. The signer's resolver (service role only) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_approval_attachment_objects(
  p_decision_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app_private.project_approval_edition_manifest(p_decision_id, true);
$$;

REVOKE ALL ON FUNCTION public.project_approval_attachment_objects(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_approval_attachment_objects(uuid)
  TO service_role;

COMMENT ON FUNCTION public.project_approval_attachment_objects(uuid) IS
  'CONTRACT-C §C.3.1, service role only. The edition manifest (same entries and '
  'order as get_project_decision_editions attachments) plus recorded (boolean), '
  'objectPath (recorded rows only, bucket project-approval-editions) and source '
  '{bucket, path} (unrecorded rows only). NULL when the set fails the plan-set '
  'assert or the id is not a Stage-2 decision; [] for a budget. Performs no '
  'authority check: callers establish ok through get_project_decision_edition first.';

-- ── 7. Hourly sweep of staging and unrecorded finals (NI-06 sweep mode) ────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'project-approval-editions-sweep-hourly'
  ) THEN
    PERFORM cron.unschedule('project-approval-editions-sweep-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'project-approval-editions-sweep-hourly',
  '41 * * * *',
  $$SELECT public.invoke_edge_function('project-approval-attachments', '{"mode": "sweep"}'::jsonb);$$
);
