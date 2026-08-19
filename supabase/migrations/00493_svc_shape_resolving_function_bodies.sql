-- ═══════════════════════════════════════════════════════════════════════════
-- 00493 — Resolve svc_* references inside applied plpgsql/sql bodies against
--         whichever physical shape the target database actually carries.
--
-- Lineage:
--   svc_orders / svc_media / svc_projects SQL shapes   00052 / 00053 / 00054
--   admin outbox monitor RPCs                          00109
--   FF&E atomic batch receiving                        00446
--   FF&E adversarial hardening (receipt-batch wrapper) 00447
--   catalog-resolving DDL precedent                    00482
--
-- WHY
-- ---
-- 00052/00053/00054 are recorded in Strata's migration ledger but never shaped
-- Strata's svc_* schemas: those schemas were provisioned by Prisma, and the
-- Prisma revision that provisioned them predates the @@map()/@@@map directives
-- that would have produced snake_case physical names. 00482 already discovered
-- and documented this for DDL. Prod therefore carries:
--
--   svc_media."MediaAsset"        (no svc_media.media_assets at all)
--   svc_media.outbox_events       with "createdAt"/"publishedAt"/"retryCount"/"lastError"
--   svc_orders.outbox_events      with the same camelCase timestamp/scalar columns
--
-- while local, CI and staging all carry the snake_case 00052/00053/00054 shapes.
--
-- A function body is not name-resolved at CREATE time the way DDL is (and for
-- LANGUAGE sql bodies the check is skipped outright whenever check_function_bodies
-- is off, which is how `supabase db push` replays). So these definitions install
-- clean everywhere and then fail at call time on prod only:
--
--   public.record_project_ffe_receipt_batch  42P01  relation svc_media.media_assets
--                                                   does not exist — thrown on any
--                                                   receiving batch carrying photos
--   public.get_outbox_events                 42703  column "retry_count" does not exist
--   public.get_outbox_counts                 42703  column "created_at" does not exist
--
-- The latter two are reachable today from the admin portal /system/jobs page
-- (apps/admin-portal/src/app/api/admin/outbox-events/route.ts) and were verified
-- failing on Strata by a read-only call before this migration was written.
--
-- APPROACH — and why not the alternatives
-- ---------------------------------------
-- Rewriting the bodies to the camelCase spelling would just invert the defect:
-- local/CI/staging would break instead. Renaming prod's physical objects to the
-- SQL shape is a mutation of Prisma-owned tables that the retained services would
-- then fail against. Dropping the svc_* read entirely is only tenable for the
-- receipt-batch join if the public schema could answer the same question, and it
-- cannot: the six predicates below (existence, READY, CLEAN, uploader identity,
-- permissions->>'projectId', the 'receiving' tag) live exclusively on the media
-- service's asset row — public.receiving_inspections.photo_asset_ids is a soft
-- reference with no FK, exactly as 00150 documents.
--
-- So each body resolves its own relation and column identifiers from the catalog
-- at execution time and runs the query through EXECUTE format(). This is 00482's
-- pattern moved from DDL time to call time, which is where a function body's names
-- are bound anyway. Both shapes then work from one definition, and a future Prisma
-- migration that finally applies the @@map directives needs no follow-up here.
--
-- Identifier matching is casing/underscore-insensitive (lower(replace(attname,'_','')))
-- so 'scan_status' and 'scanStatus' collapse to one logical name. Enum and id
-- columns are compared as ::text because the two shapes disagree on physical type
-- (prod's "MediaAsset".id is text, the SQL shape's media_assets.id is uuid) while
-- agreeing on every value; svc_media."AssetStatus"/"ScanStatus" were confirmed to
-- carry label-identical values to svc_media.asset_status/scan_status. Prisma's
-- timestamp columns are `timestamp(3) without time zone` holding UTC, so they are
-- normalised with AT TIME ZONE 'UTC' to satisfy the declared timestamptz results;
-- the SQL shape's timestamptz columns pass through untouched.
--
-- No new public routine is introduced: the resolution is inlined so this migration
-- adds nothing to the 00483/00484 public ACL surface, and no signature changes.
-- CREATE OR REPLACE preserves every existing grant, which is exactly the problem
-- for the two outbox RPCs — see section 4, which narrows them to service_role
-- before the repaired bodies can serve anon.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. public.record_project_ffe_receipt_batch — 00447's validation wrapper.
--    Body is 00447's verbatim, with only the svc_media EXISTS( ) probe made
--    shape-resolving. Semantics of all six predicates are unchanged.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_project_ffe_receipt_batch(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_outcome public.receiving_inspection_outcome,
  p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_project_id  uuid;
  v_asset_rel   regclass;
  v_col_id      text;
  v_col_status  text;
  v_col_scan    text;
  v_col_upload  text;
  v_col_perms   text;
  v_col_tags    text;
  v_ambiguous   text;
  v_invalid     boolean;
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry
    WHERE entry->>'receivedQuantity' !~ '^[0-9]{1,10}$'
       OR (entry->>'receivedQuantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'receivedQuantity must be a nonnegative 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT project_id INTO v_project_id
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id;

  IF cardinality(COALESCE(p_photo_asset_ids, '{}')) > 0 THEN
    v_asset_rel := COALESCE(
      to_regclass('svc_media."MediaAsset"'),
      to_regclass('svc_media.media_assets')
    );
    IF v_asset_rel IS NULL THEN
      RAISE EXCEPTION 'receiving photos cannot be validated: the svc_media asset table is absent'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- A key that two physical columns collapse onto (a half-finished @@map
    -- rollout leaving scan_status beside "scanStatus") must abort rather than
    -- silently bind whichever spelling sorts higher.
    SELECT
      max(col.ident) FILTER (WHERE col.key = 'id'),
      max(col.ident) FILTER (WHERE col.key = 'status'),
      max(col.ident) FILTER (WHERE col.key = 'scanstatus'),
      max(col.ident) FILTER (WHERE col.key = 'uploadedby'),
      max(col.ident) FILTER (WHERE col.key = 'permissions'),
      max(col.ident) FILTER (WHERE col.key = 'tags'),
      string_agg(DISTINCT col.key, ', ') FILTER (WHERE col.collisions > 1)
    INTO v_col_id, v_col_status, v_col_scan, v_col_upload, v_col_perms,
         v_col_tags, v_ambiguous
    FROM (
      SELECT lower(replace(attribute.attname, '_', '')) AS key,
             quote_ident(attribute.attname) AS ident,
             count(*) OVER (
               PARTITION BY lower(replace(attribute.attname, '_', ''))
             ) AS collisions
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = v_asset_rel
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) AS col
    WHERE col.key IN (
      'id', 'status', 'scanstatus', 'uploadedby', 'permissions', 'tags'
    );

    IF v_ambiguous IS NOT NULL THEN
      RAISE EXCEPTION
        'receiving photos cannot be validated: % carries more than one column for: %',
        v_asset_rel::text, v_ambiguous
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_col_id IS NULL OR v_col_status IS NULL OR v_col_scan IS NULL
       OR v_col_upload IS NULL OR v_col_perms IS NULL OR v_col_tags IS NULL THEN
      RAISE EXCEPTION 'receiving photos cannot be validated: % is missing a required asset column',
        v_asset_rel::text
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    EXECUTE format(
      'SELECT EXISTS ('
      ||   'SELECT 1 '
      ||     'FROM unnest($1::uuid[]) AS requested(asset_id) '
      ||     'LEFT JOIN %s AS asset ON asset.%s::text = requested.asset_id::text '
      ||    'WHERE asset.%s IS NULL '
      ||       'OR asset.%s::text <> ''READY'' '
      ||       'OR asset.%s::text <> ''CLEAN'' '
      ||       'OR asset.%s::text IS DISTINCT FROM $2::text '
      ||       'OR asset.%s->>''projectId'' IS DISTINCT FROM $3::text '
      ||       'OR NOT (''receiving'' = ANY(COALESCE(asset.%s, ''{}''::text[])))'
      || ')',
      v_asset_rel::text,
      v_col_id,
      v_col_id,
      v_col_status,
      v_col_scan,
      v_col_upload,
      v_col_perms,
      v_col_tags
    )
    USING p_photo_asset_ids, auth.uid()::text, v_project_id::text
    INTO v_invalid;

    IF v_invalid THEN
      RAISE EXCEPTION 'receiving photos must be clean project receiving assets owned by the actor'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN public._record_project_ffe_receipt_batch_00446_impl(
    p_purchase_order_id, p_lines, p_outcome, p_notes, p_photo_asset_ids
  );
END;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. public.get_outbox_events — 00109's admin monitor. LANGUAGE sql cannot
--    resolve identifiers at call time, so the body becomes plpgsql over the
--    same result columns. CREATE OR REPLACE accepts the language change because
--    the argument list and the RETURNS TABLE column list are byte-identical.
--    A svc_* schema whose outbox table is absent contributes no branch instead
--    of failing the whole call.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_outbox_events(
  p_limit integer DEFAULT 100,
  p_unpublished_only boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  source text,
  event_type text,
  published boolean,
  retry_count integer,
  last_error text,
  created_at timestamptz,
  published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_source    text;
  v_rel       regclass;
  v_id        text;
  v_type      text;
  v_published text;
  v_retry     text;
  v_error     text;
  v_created   text;
  v_pubat     text;
  v_ambiguous text;
  v_branches  text[] := '{}';
BEGIN
  FOREACH v_source IN ARRAY ARRAY['media', 'orders'] LOOP
    v_rel := to_regclass(format('svc_%s.outbox_events', v_source));
    IF v_rel IS NULL THEN
      RAISE WARNING 'outbox source % table missing', v_source;
      CONTINUE;
    END IF;

    SELECT
      max(col.ident) FILTER (WHERE col.key = 'id'),
      max(col.ident) FILTER (WHERE col.key = 'type'),
      max(col.ident) FILTER (WHERE col.key = 'published'),
      max(col.ident) FILTER (WHERE col.key = 'retrycount'),
      max(col.ident) FILTER (WHERE col.key = 'lasterror'),
      max(col.utc_expr) FILTER (WHERE col.key = 'createdat'),
      max(col.utc_expr) FILTER (WHERE col.key = 'publishedat'),
      string_agg(DISTINCT col.key, ', ') FILTER (WHERE col.collisions > 1)
    INTO v_id, v_type, v_published, v_retry, v_error, v_created, v_pubat,
         v_ambiguous
    FROM (
      SELECT lower(replace(attribute.attname, '_', '')) AS key,
             quote_ident(attribute.attname) AS ident,
             CASE WHEN attribute.atttypid = 'timestamp'::regtype
                  THEN '(' || quote_ident(attribute.attname) || ' AT TIME ZONE ''UTC'')'
                  ELSE quote_ident(attribute.attname)
             END AS utc_expr,
             count(*) OVER (
               PARTITION BY lower(replace(attribute.attname, '_', ''))
             ) AS collisions
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = v_rel
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) AS col
    WHERE col.key IN (
      'id', 'type', 'published', 'retrycount', 'lasterror',
      'createdat', 'publishedat'
    );

    IF v_ambiguous IS NOT NULL THEN
      RAISE EXCEPTION '% carries more than one column for: %', v_rel::text, v_ambiguous
        USING ERRCODE = 'ambiguous_column';
    END IF;

    IF v_id IS NULL OR v_type IS NULL OR v_published IS NULL OR v_retry IS NULL
       OR v_error IS NULL OR v_created IS NULL OR v_pubat IS NULL THEN
      RAISE EXCEPTION '% is missing a required outbox column', v_rel::text
        USING ERRCODE = 'undefined_column';
    END IF;

    v_branches := v_branches || format(
      'SELECT %s::uuid, %L::text, %s::text, %s, %s::integer, %s::text, %s, %s '
      || 'FROM %s WHERE NOT $1 OR %s = false',
      v_id, v_source, v_type, v_published, v_retry, v_error, v_created, v_pubat,
      v_rel::text, v_published
    );
  END LOOP;

  IF cardinality(v_branches) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    'WITH combined(id, source, event_type, published, retry_count, last_error, created_at, published_at) AS (%s) '
    || 'SELECT * FROM combined ORDER BY created_at DESC LIMIT GREATEST(1, LEAST(1000, $2))',
    array_to_string(v_branches, ' UNION ALL ')
  )
  USING p_unpublished_only, p_limit;
END;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. public.get_outbox_counts — same treatment, same result columns.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_outbox_counts()
RETURNS TABLE (
  source text,
  unpublished bigint,
  published bigint,
  oldest_unpublished timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_source    text;
  v_rel       regclass;
  v_published text;
  v_created   text;
  v_ambiguous text;
  v_branches  text[] := '{}';
BEGIN
  FOREACH v_source IN ARRAY ARRAY['media', 'orders'] LOOP
    v_rel := to_regclass(format('svc_%s.outbox_events', v_source));
    IF v_rel IS NULL THEN
      RAISE WARNING 'outbox source % table missing', v_source;
      CONTINUE;
    END IF;

    SELECT
      max(col.ident) FILTER (WHERE col.key = 'published'),
      max(col.utc_expr) FILTER (WHERE col.key = 'createdat'),
      string_agg(DISTINCT col.key, ', ') FILTER (WHERE col.collisions > 1)
    INTO v_published, v_created, v_ambiguous
    FROM (
      SELECT lower(replace(attribute.attname, '_', '')) AS key,
             quote_ident(attribute.attname) AS ident,
             CASE WHEN attribute.atttypid = 'timestamp'::regtype
                  THEN '(' || quote_ident(attribute.attname) || ' AT TIME ZONE ''UTC'')'
                  ELSE quote_ident(attribute.attname)
             END AS utc_expr,
             count(*) OVER (
               PARTITION BY lower(replace(attribute.attname, '_', ''))
             ) AS collisions
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = v_rel
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) AS col
    WHERE col.key IN ('published', 'createdat');

    IF v_ambiguous IS NOT NULL THEN
      RAISE EXCEPTION '% carries more than one column for: %', v_rel::text, v_ambiguous
        USING ERRCODE = 'ambiguous_column';
    END IF;

    IF v_published IS NULL OR v_created IS NULL THEN
      RAISE EXCEPTION '% is missing a required outbox column', v_rel::text
        USING ERRCODE = 'undefined_column';
    END IF;

    v_branches := v_branches || format(
      'SELECT %L::text, '
      || 'count(*) FILTER (WHERE NOT %s)::bigint, '
      || 'count(*) FILTER (WHERE %s)::bigint, '
      || 'min(%s) FILTER (WHERE NOT %s) '
      || 'FROM %s',
      v_source, v_published, v_published, v_created, v_published, v_rel::text
    );
  END LOOP;

  IF cardinality(v_branches) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE array_to_string(v_branches, ' UNION ALL ');
END;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Close the outbox RPCs to the API roles.
--
-- 00109 intended service_role only ("grant to authenticated for symmetry" had
-- no caller then and has none now — the admin route goes through
-- getAuthenticatedAdmin and calls with service_role). But this database's
-- default privileges auto-granted EXECUTE to anon and authenticated at CREATE
-- time, so both routines really carry {postgres,anon,authenticated,service_role}
-- — the same trap 00485 documented. Until now anon's grant was inert because
-- the body threw 42703 for everyone. Repairing the body would turn that dead
-- grant into unauthenticated reads of unfiltered cross-service outbox state,
-- raw last_error text included, over /rest/v1/rpc/. Revoke before that lands.
-- ───────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.get_outbox_events(integer, boolean),
  public.get_outbox_counts()
FROM PUBLIC, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Post-conditions, proven against this database's actual shapes rather than
-- against the migration text. Both outbox RPCs are read-only, so they are
-- exercised for real here; the receipt-batch wrapper needs FF&E fixtures to
-- call, so its resolution step is replayed instead.
-- ───────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_rel      regclass;
  v_resolved integer;
  v_rows     integer;
  v_spelling text;
  v_role     text;
  v_fn       text;
BEGIN
  PERFORM * FROM public.get_outbox_counts();
  PERFORM * FROM public.get_outbox_events(1, false);

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_fn IN ARRAY ARRAY[
      'public.get_outbox_events(integer,boolean)',
      'public.get_outbox_counts()'
    ] LOOP
      IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION '00493 left % with EXECUTE on %', v_role, v_fn;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_function_privilege(
       'service_role', 'public.get_outbox_events(integer,boolean)', 'EXECUTE')
     OR NOT has_function_privilege(
       'service_role', 'public.get_outbox_counts()', 'EXECUTE') THEN
    RAISE EXCEPTION '00493 revoked service_role off the outbox RPCs; the admin route needs it';
  END IF;

  v_rel := COALESCE(
    to_regclass('svc_media."MediaAsset"'),
    to_regclass('svc_media.media_assets')
  );
  IF v_rel IS NULL THEN
    RAISE EXCEPTION '00493 found no svc_media asset table under either shape';
  END IF;

  SELECT count(DISTINCT lower(replace(attribute.attname, '_', ''))),
         string_agg(attribute.attname, ', ' ORDER BY attribute.attname)
  INTO v_resolved, v_spelling
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = v_rel
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND lower(replace(attribute.attname, '_', '')) IN (
      'id', 'status', 'scanstatus', 'uploadedby', 'permissions', 'tags'
    );

  IF v_resolved <> 6 THEN
    RAISE EXCEPTION
      '00493 resolved only %/6 receiving-photo predicate columns on %',
      v_resolved, v_rel::text;
  END IF;

  RAISE NOTICE '00493 receiving-photo asset table: % [%]', v_rel::text, v_spelling;

  FOREACH v_role IN ARRAY ARRAY['media', 'orders'] LOOP
    SELECT string_agg(attribute.attname, ', ' ORDER BY attribute.attname)
    INTO v_spelling
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = to_regclass(format('svc_%s.outbox_events', v_role))
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND lower(replace(attribute.attname, '_', '')) IN (
        'id', 'type', 'published', 'retrycount', 'lasterror',
        'createdat', 'publishedat'
      );
    RAISE NOTICE '00493 svc_%.outbox_events: [%]', v_role, COALESCE(v_spelling, 'ABSENT');
  END LOOP;

  SELECT count(*) INTO v_rows
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    AND p.oid IN (
      to_regprocedure('public.record_project_ffe_receipt_batch(uuid,jsonb,public.receiving_inspection_outcome,text,uuid[])'),
      to_regprocedure('public.get_outbox_events(integer,boolean)'),
      to_regprocedure('public.get_outbox_counts()')
    );

  IF v_rows <> 3 THEN
    RAISE EXCEPTION '00493 expected 3 repaired plpgsql routines, found %', v_rows;
  END IF;
END
$verify$;

COMMENT ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) IS
  'Validates receiving photo assets against whichever svc_media asset shape this '
  'database carries (00053 snake_case or Prisma "MediaAsset"), then delegates to '
  'the 00446 implementation. See 00493.';

COMMENT ON FUNCTION public.get_outbox_events(integer, boolean) IS
  'Admin outbox monitor. Resolves each svc_*.outbox_events column at call time so '
  'the snake_case (00053/00052) and Prisma camelCase shapes both work. See 00493.';

COMMENT ON FUNCTION public.get_outbox_counts() IS
  'Admin outbox KPI counts. Shape-resolving companion to get_outbox_events. See 00493.';

COMMIT;
