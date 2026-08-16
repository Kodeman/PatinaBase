-- ═══════════════════════════════════════════════════════════════════════════
-- 00488 — Canonical studio authority: storage platform-admin handoff
--
-- This transaction is intentionally outside ordinary migration replay.
-- storage.objects and its policies are reserved-owner objects on Supabase.
-- The adjacent manifest and the catalog gates below pin the exact nine-row
-- source/final policy tuples; this file is idempotent in either final state.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL standard_conforming_strings = on;
SET LOCAL quote_all_identifiers = off;

-- The platform artifact is standalone, so it carries the same checked lexical
-- catalog scanner as the ordinary migration rather than relying on raw prosrc
-- regexes that can be satisfied by comments or dynamic SQL text.

DO $c00488_policy_fingerprint_environment$
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR current_setting('server_encoding') IS DISTINCT FROM 'UTF8'
     OR current_setting('standard_conforming_strings') IS DISTINCT FROM 'on'
     OR current_setting('quote_all_identifiers') IS DISTINCT FROM 'off'
  THEN
    RAISE EXCEPTION
      '00488 policy fingerprint environment must be PostgreSQL 17/UTF8 with pinned deparse settings';
  END IF;
END;
$c00488_policy_fingerprint_environment$;

CREATE OR REPLACE FUNCTION pg_temp._00488_mask_sql(
  p_source text,
  p_preserve_quoted_identifiers boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $c00488_mask_sql$
DECLARE
  cursor_position integer := 1;
  source_length integer := pg_catalog.char_length(COALESCE(p_source, ''));
  block_depth integer;
  dollar_tag text;
  dollar_candidate text;
  dollar_character text;
  dollar_position integer;
  dollar_valid boolean;
  close_offset integer;
  result text := '';
  character text;
  escape_string boolean;
  string_closed boolean;
BEGIN
  WHILE cursor_position <= source_length LOOP
    IF pg_catalog.substr(p_source, cursor_position, 2) = '--' THEN
      cursor_position := cursor_position + 2;
      WHILE cursor_position <= source_length
        AND pg_catalog.substr(p_source, cursor_position, 1) <> pg_catalog.chr(10)
      LOOP
        cursor_position := cursor_position + 1;
      END LOOP;
      result := result || ' ';
      CONTINUE;
    END IF;

    IF pg_catalog.substr(p_source, cursor_position, 2) = '/*' THEN
      block_depth := 1;
      cursor_position := cursor_position + 2;
      WHILE cursor_position <= source_length AND block_depth > 0 LOOP
        IF pg_catalog.substr(p_source, cursor_position, 2) = '/*' THEN
          block_depth := block_depth + 1;
          cursor_position := cursor_position + 2;
        ELSIF pg_catalog.substr(p_source, cursor_position, 2) = '*/' THEN
          block_depth := block_depth - 1;
          cursor_position := cursor_position + 2;
        ELSE
          cursor_position := cursor_position + 1;
        END IF;
      END LOOP;
      IF block_depth <> 0 THEN
        RAISE EXCEPTION '00488 catalog lexer found an unterminated block comment';
      END IF;
      result := result || ' ';
      CONTINUE;
    END IF;

    character := pg_catalog.substr(p_source, cursor_position, 1);
    IF character = '''' THEN
      escape_string := cursor_position > 1
        AND pg_catalog.lower(
          pg_catalog.substr(p_source, cursor_position - 1, 1)
        ) = 'e'
        AND (
          cursor_position = 2
          OR (
            pg_catalog.substr(p_source, cursor_position - 2, 1)
              !~ '[[:alnum:]_$]'
            AND COALESCE(pg_catalog.ascii(NULLIF(
                  pg_catalog.substr(p_source, cursor_position - 2, 1), ''
                )), 0) < 128
          )
        );
      string_closed := false;
      cursor_position := cursor_position + 1;
      WHILE cursor_position <= source_length LOOP
        character := pg_catalog.substr(p_source, cursor_position, 1);
        IF character = '''' THEN
          IF pg_catalog.substr(p_source, cursor_position + 1, 1) = '''' THEN
            cursor_position := cursor_position + 2;
          ELSE
            cursor_position := cursor_position + 1;
            string_closed := true;
            EXIT;
          END IF;
        ELSIF escape_string AND character = E'\\' THEN
          cursor_position := cursor_position + 2;
        ELSE
          cursor_position := cursor_position + 1;
        END IF;
      END LOOP;
      IF NOT string_closed THEN
        RAISE EXCEPTION '00488 catalog lexer found an unterminated string literal';
      END IF;
      result := result || ' ';
      CONTINUE;
    END IF;

    IF character = '$'
       AND (
         cursor_position = 1
         OR (
           pg_catalog.substr(p_source, cursor_position - 1, 1)
             !~ '[[:alnum:]_$]'
           AND COALESCE(pg_catalog.ascii(NULLIF(
                 pg_catalog.substr(p_source, cursor_position - 1, 1), ''
               )), 0) < 128
         )
       )
    THEN
      dollar_tag := NULL;
      close_offset := pg_catalog.strpos(
        pg_catalog.substr(p_source, cursor_position + 1), '$'
      );
      IF close_offset > 0 THEN
        dollar_candidate := pg_catalog.substr(
          p_source, cursor_position + 1, close_offset - 1
        );
        dollar_valid := dollar_candidate = '';
        IF dollar_candidate <> '' THEN
          dollar_character := pg_catalog.substr(dollar_candidate, 1, 1);
          dollar_valid := dollar_character ~ '[A-Za-z_]'
            OR pg_catalog.ascii(dollar_character) >= 128;
          dollar_position := 2;
          WHILE dollar_valid
            AND dollar_position <= pg_catalog.char_length(dollar_candidate)
          LOOP
            dollar_character := pg_catalog.substr(
              dollar_candidate, dollar_position, 1
            );
            dollar_valid := dollar_character ~ '[A-Za-z0-9_]'
              OR pg_catalog.ascii(dollar_character) >= 128;
            dollar_position := dollar_position + 1;
          END LOOP;
        END IF;
        IF dollar_valid THEN
          dollar_tag := '$' || dollar_candidate || '$';
        END IF;
      END IF;
      IF dollar_tag IS NOT NULL THEN
        close_offset := pg_catalog.strpos(
          pg_catalog.substr(
            p_source, cursor_position + pg_catalog.char_length(dollar_tag)
          ),
          dollar_tag
        );
        IF close_offset = 0 THEN
          RAISE EXCEPTION '00488 catalog lexer found an unterminated dollar literal';
        END IF;
        cursor_position := cursor_position
          + pg_catalog.char_length(dollar_tag)
          + close_offset - 1
          + pg_catalog.char_length(dollar_tag);
        result := result || ' ';
        CONTINUE;
      END IF;
    END IF;

    -- Unicode-escaped identifiers can encode a protected name without its
    -- literal spelling. No reviewed catalog object needs them, so fail closed.
    IF character = '"'
       AND cursor_position >= 3
       AND pg_catalog.lower(
             pg_catalog.substr(p_source, cursor_position - 2, 2)
           ) = 'u&'
       AND (
         cursor_position = 3
         OR pg_catalog.substr(p_source, cursor_position - 3, 1)
              !~ '[[:alnum:]_$]'
       )
    THEN
      RAISE EXCEPTION
        '00488 catalog lexer rejects Unicode-escaped quoted identifiers';
    END IF;

    -- Quoted identifiers are executable code for call/table attribution but
    -- are blanked for keyword recognition. This distinguishes a quoted
    -- "EXECUTE" identifier from the EXECUTE keyword in EXECUTE"sql".
    IF character = '"' THEN
      IF p_preserve_quoted_identifiers THEN
        result := result || '"';
      END IF;
      cursor_position := cursor_position + 1;
      string_closed := false;
      WHILE cursor_position <= source_length LOOP
        character := pg_catalog.substr(p_source, cursor_position, 1);
        IF character = '"' THEN
          IF pg_catalog.substr(p_source, cursor_position + 1, 1) = '"' THEN
            IF p_preserve_quoted_identifiers THEN
              result := result || '""';
            END IF;
            cursor_position := cursor_position + 2;
          ELSE
            IF p_preserve_quoted_identifiers THEN
              result := result || '"';
            END IF;
            cursor_position := cursor_position + 1;
            string_closed := true;
            EXIT;
          END IF;
        ELSE
          IF p_preserve_quoted_identifiers THEN
            result := result || character;
          END IF;
          cursor_position := cursor_position + 1;
        END IF;
      END LOOP;
      IF NOT string_closed THEN
        RAISE EXCEPTION '00488 catalog lexer found an unterminated quoted identifier';
      END IF;
      IF NOT p_preserve_quoted_identifiers THEN
        result := result || ' ';
      END IF;
      CONTINUE;
    END IF;

    result := result || character;
    cursor_position := cursor_position + 1;
  END LOOP;
  RETURN result;
END;
$c00488_mask_sql$;

CREATE OR REPLACE FUNCTION pg_temp._00488_policy_clause_frame(
  p_value text
)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $c00488_policy_clause_frame$
  SELECT pg_catalog.decode('01', 'hex')
    || pg_catalog.int8send(pg_catalog.octet_length(p_value)::bigint)
    || pg_catalog.convert_to(p_value, 'UTF8')
$c00488_policy_clause_frame$;

CREATE OR REPLACE FUNCTION pg_temp._00488_policy_fingerprint(
  p_relation text,
  p_qual_sql text,
  p_check_sql text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, pg_temp
AS $c00488_policy_fingerprint$
DECLARE
  relation_oid pg_catalog.regclass := pg_catalog.to_regclass(p_relation);
  relation_name text;
  probe_relation pg_catalog.regclass;
  probe_sql text;
  result text;
BEGIN
  IF relation_oid IS NULL THEN
    RAISE EXCEPTION '00488 policy probe relation is missing: %', p_relation;
  END IF;
  SELECT relation.relname INTO STRICT relation_name
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = relation_oid;
  IF pg_catalog.to_regclass(
       'pg_temp.' || pg_catalog.quote_ident(relation_name)
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION
      '00488 policy probe temp relation already exists: %', relation_name;
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE TEMP TABLE pg_temp.%I (LIKE %s)', relation_name, relation_oid
  );
  probe_sql := pg_catalog.format(
    'CREATE POLICY c00488_catalog_probe ON pg_temp.%I', relation_name
  );
  IF p_qual_sql IS NOT NULL THEN
    probe_sql := probe_sql || ' USING ' || p_qual_sql;
  END IF;
  IF p_check_sql IS NOT NULL THEN
    probe_sql := probe_sql || ' WITH CHECK ' || p_check_sql;
  END IF;
  EXECUTE probe_sql;
  probe_relation := pg_catalog.to_regclass(
    'pg_temp.' || pg_catalog.quote_ident(relation_name)
  );

  SELECT pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to('patina-csa-policy-v1', 'UTF8')
    || pg_catalog.decode('00', 'hex')
    || COALESCE(
      pg_temp._00488_policy_clause_frame(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
      ),
      pg_catalog.decode('00', 'hex')
    )
    || COALESCE(
      pg_temp._00488_policy_clause_frame(
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
      ),
      pg_catalog.decode('00', 'hex')
    ),
    'sha256'
  ), 'hex') INTO STRICT result
  FROM pg_catalog.pg_policy AS policy
  WHERE policy.polrelid = probe_relation
    AND policy.polname = 'c00488_catalog_probe';

  EXECUTE pg_catalog.format('DROP TABLE pg_temp.%I', relation_name);
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  IF relation_name IS NOT NULL THEN
    EXECUTE pg_catalog.format(
      'DROP TABLE IF EXISTS pg_temp.%I', relation_name
    );
  END IF;
  RAISE;
END;
$c00488_policy_fingerprint$;

CREATE OR REPLACE FUNCTION pg_temp._00488_catalog_policy_fingerprint(
  p_policy oid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $c00488_catalog_policy_fingerprint$
  SELECT pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to('patina-csa-policy-v1', 'UTF8')
    || pg_catalog.decode('00', 'hex')
    || COALESCE(
      pg_temp._00488_policy_clause_frame(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
      ),
      pg_catalog.decode('00', 'hex')
    )
    || COALESCE(
      pg_temp._00488_policy_clause_frame(
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
      ),
      pg_catalog.decode('00', 'hex')
    ),
    'sha256'
  ), 'hex')
  FROM pg_catalog.pg_policy AS policy
  WHERE policy.oid = p_policy
$c00488_catalog_policy_fingerprint$;

CREATE OR REPLACE FUNCTION pg_temp._00488_call_count(
  p_source text,
  p_helper text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $c00488_call_count$
  SELECT count(*)::integer
  FROM pg_catalog.regexp_matches(
    pg_temp._00488_mask_sql(p_source),
    '(^|[^a-z0-9_$])(?:"?public"?[[:space:]]*\.[[:space:]]*)?"?'
      || p_helper || '"?[[:space:]]*\(',
    'gi'
  )
$c00488_call_count$;

CREATE OR REPLACE FUNCTION pg_temp._00488_insert_count(
  p_source text,
  p_table text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $c00488_insert_count$
  SELECT count(*)::integer
  FROM pg_catalog.regexp_matches(
    pg_temp._00488_mask_sql(p_source),
    '(^|[^a-z0-9_$])insert[[:space:]]+into[[:space:]]+'
      || '(?:"?public"?[[:space:]]*\.[[:space:]]*)?"?'
      || p_table || '"?([^a-z0-9_$]|$)',
    'gi'
  )
$c00488_insert_count$;

CREATE OR REPLACE FUNCTION pg_temp._00488_dynamic_mentions(
  p_source text,
  p_token text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $c00488_dynamic_mentions$
  -- A dynamic statement can construct the target without spelling it in a
  -- literal. Unknown dynamic bodies therefore fail closed for every target.
  -- Five exact source hashes were independently reviewed; the global
  -- source/final dynamic-routine anti-join proves those hashes are attached
  -- only to their exact signatures before this exemption is useful.
  SELECT p_token IS NOT NULL
     AND pg_temp._00488_mask_sql(COALESCE(p_source, ''), false)
           ~* '(^|[^a-z0-9_$])execute([^a-z0-9_$]|$)'
     AND pg_catalog.encode(extensions.digest(
           pg_catalog.convert_to(COALESCE(p_source, ''), 'UTF8'), 'sha256'
         ), 'hex') NOT IN ('05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732','0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6','20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66','9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142','c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455')
$c00488_dynamic_mentions$;

-- pg_proc.prosrc is not a complete representation for SQL-standard
-- BEGIN ATOMIC bodies. The reviewed source/final universe contains none, so
-- reject any such routine before relying on the prosrc lexical contracts.
DO $c00488_sql_body_universe$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname IN ('public', 'app_private')
      AND pg_catalog.pg_get_function_sqlbody(routine.oid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      '00488 found an unreviewed SQL-standard routine body outside prosrc';
  END IF;
END;
$c00488_sql_body_universe$;


DO $storage_source_or_final_sentinel$
DECLARE
  source_state boolean;
  final_state boolean;
BEGIN
  IF NOT COALESCE((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION '00488 storage phase requires a platform administrator';
  END IF;

  IF EXISTS (
    WITH expected(
      relation_name, row_security_enabled, force_row_security
    ) AS (VALUES
      ('storage.objects',true,false)
    ), actual AS (
      SELECT expected.*, relation.oid, relation.relrowsecurity,
             relation.relforcerowsecurity
      FROM expected
      LEFT JOIN pg_catalog.pg_class AS relation
        ON relation.oid = pg_catalog.to_regclass(expected.relation_name)
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL
       OR relrowsecurity IS DISTINCT FROM row_security_enabled
       OR relforcerowsecurity IS DISTINCT FROM force_row_security
  ) THEN
    RAISE EXCEPTION '00488 storage forward reviewed relation RLS profile drifted';
  END IF;

  IF EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','source',true,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66',ARRAY[]::text[]),
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','final',false,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'fabd3623a46f00576f6a4f4738fc4a98c0d49c253e99ec786217df5838f2dd99',ARRAY[]::text[]),
      ('public.evaluate_collection_rules(uuid)','source',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.evaluate_collection_rules(uuid)','final',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','source',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','final',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','source',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','final',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','source',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','final',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[])
    ), expected AS (
      SELECT * FROM states WHERE state_name = 'final'
    ), actual AS (
      SELECT expected.*, routine.oid, owner.rolname AS actual_owner,
             language.lanname AS actual_language,
             pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
             pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex') AS actual_body_sha256,
             routine.prokind, routine.prosecdef, routine.proleakproof,
             routine.proisstrict, routine.proparallel, routine.provolatile,
             routine.proretset, routine.proconfig
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
      LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL
       OR actual_owner IS DISTINCT FROM owner_name
       OR actual_language IS DISTINCT FROM language_name
       OR prokind IS DISTINCT FROM kind::"char"
       OR prosecdef IS DISTINCT FROM security_definer
       OR proleakproof IS DISTINCT FROM leakproof
       OR proisstrict IS DISTINCT FROM strict
       OR proparallel IS DISTINCT FROM parallel::"char"
       OR provolatile IS DISTINCT FROM volatility::"char"
       OR proretset IS DISTINCT FROM returns_set
       OR actual_result IS DISTINCT FROM result_type
       OR actual_arguments IS DISTINCT FROM arguments
       OR proconfig IS DISTINCT FROM config
       OR actual_body_sha256 IS DISTINCT FROM body_sha256
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','source',true,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66',ARRAY[]::text[]),
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','final',false,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'fabd3623a46f00576f6a4f4738fc4a98c0d49c253e99ec786217df5838f2dd99',ARRAY[]::text[]),
      ('public.evaluate_collection_rules(uuid)','source',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.evaluate_collection_rules(uuid)','final',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','source',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','final',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','source',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','final',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','source',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','final',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[])
    ), expected AS (
      SELECT signature, role_name AS grantee, owner_name AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
      FROM states
      CROSS JOIN LATERAL pg_catalog.unnest(allowed_roles) AS role_name
      WHERE state_name = 'final'
    ), chosen AS (
      SELECT * FROM states WHERE state_name = 'final'
    ), actual AS (
      SELECT chosen.signature,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
             grantor.rolname, acl.privilege_type, acl.is_grantable
      FROM chosen
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(chosen.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','source',true,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66',ARRAY[]::text[]),
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','final',false,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'fabd3623a46f00576f6a4f4738fc4a98c0d49c253e99ec786217df5838f2dd99',ARRAY[]::text[]),
      ('public.evaluate_collection_rules(uuid)','source',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.evaluate_collection_rules(uuid)','final',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','source',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','final',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','source',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','final',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','source',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','final',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[])
    ), expected AS (
      SELECT pg_catalog.to_regprocedure(signature) AS oid, body_sha256
      FROM states
      WHERE state_name = 'final' AND is_dynamic
    ), actual AS (
      SELECT routine.oid,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex')
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname IN ('public','app_private')
        AND pg_temp._00488_mask_sql(routine.prosrc, false)
          ~* '(^|[^a-z0-9_$])execute([^a-z0-9_$]|$)'
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','source',true,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66',ARRAY[]::text[]),
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','final',false,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'fabd3623a46f00576f6a4f4738fc4a98c0d49c253e99ec786217df5838f2dd99',ARRAY[]::text[]),
      ('public.evaluate_collection_rules(uuid)','source',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.evaluate_collection_rules(uuid)','final',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','source',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','final',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','source',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','final',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','source',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','final',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[])
    ), expected AS (
      SELECT signature FROM states WHERE state_name = 'final'
    )
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN ('_void_invoice_authorized_legacy_00397','evaluate_collection_rules','get_aesthete_matches','increment_campaign_counter','increment_sequence_counter')
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE pg_catalog.to_regprocedure(expected.signature) = routine.oid
      )
  ) THEN
    RAISE EXCEPTION
      '00488 reviewed dynamic routine profile/ACL/universe drifted';
  END IF;

  IF EXISTS (
    WITH expected(caller_signature, call_count) AS (VALUES
      ('public.void_invoice(uuid,text)', 1)
    ), actual AS (
      SELECT caller.oid,
             pg_temp._00488_call_count(
               caller.prosrc, '_void_invoice_authorized_legacy_00397'
             ) AS call_count,
             pg_temp._00488_dynamic_mentions(
               caller.prosrc, '_void_invoice_authorized_legacy_00397'
             ) AS dynamic_call
      FROM pg_catalog.pg_proc AS caller
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = caller.pronamespace
      WHERE namespace.nspname IN ('public','app_private')
    )
    (SELECT pg_catalog.to_regprocedure(caller_signature), call_count FROM expected
     EXCEPT SELECT oid, call_count FROM actual
            WHERE call_count > 0 AND NOT dynamic_call)
    UNION ALL
    (SELECT oid, call_count FROM actual
     WHERE call_count > 0 OR dynamic_call
     EXCEPT SELECT pg_catalog.to_regprocedure(caller_signature), call_count FROM expected)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    WHERE pg_temp._00488_call_count(
      COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ' ' || COALESCE(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
        ), '_void_invoice_authorized_legacy_00397'
    ) > 0
  ) OR pg_temp._00488_call_count(
    pg_catalog.pg_get_viewdef(
      'public.people_directory'::pg_catalog.regclass, true
    ), '_void_invoice_authorized_legacy_00397'
  ) > 0 THEN
    RAISE EXCEPTION '00488 dynamic invoice core caller universe drifted';
  END IF;

  WITH expected(
    relation_name, policy_name, command, permissive, roles,
    source_fingerprint, final_fingerprint, platform_handoff
  ) AS (VALUES
    ('storage.objects','Designers manage proposal folio objects','*',true,ARRAY['authenticated']::text[],'5ede429cc5709eab29a2c257ac4953327802a1327b81327098e5a1535acbaf71','bee7ae78bc8f07a2310c744285e2a119f0d70cfc414bd1a219d90ecc13859f9d',true),
      ('storage.objects','Site request designers read immutable media','r',true,ARRAY['authenticated']::text[],'b1f30dc540826435b6f6e877f4793df4de60711ed72b3b5ed317170e9e57e942','fe35034e3a0496db75a9475801830fb54fb79d7e975c372af82db588a84ce467',true),
      ('storage.objects','project_ffe_working_studio_delete','d',true,ARRAY['authenticated']::text[],'2fc3e22c995c8503ca6c28b8238a8d360ac01a5f2bcee8e9ef9ca566094ae5c1','4e5e0e407ce7593d83e07ac26c8fbcdf4a3e5a873861673a4d32286b84a8bb69',true),
      ('storage.objects','project_ffe_working_studio_insert','a',true,ARRAY['authenticated']::text[],'a06aecbab06a9a9d275189e37cdce755061ed7c2f7b62d437d604383bc94fe7d','1b4ac00fcefd7c36b2c7408cc4e743c34cb8a72fba347f138e46169b64431019',true),
      ('storage.objects','project_ffe_working_studio_select','r',true,ARRAY['authenticated']::text[],'2fc3e22c995c8503ca6c28b8238a8d360ac01a5f2bcee8e9ef9ca566094ae5c1','61a4b177f97ed6e89a3554768f74af2e2b562a127782fb53851dbba8d3f68c5d',true),
      ('storage.objects','project_ffe_working_studio_update','w',true,ARRAY['authenticated']::text[],'7730555c5c5a0a7e5b465c9a37675ef8c6f56602c571fbf4f3b3e08fe6b7085e','a3d01dc8e5938bdc0ced2f923d5945b93fb0fc2f48ea3b908496b499db52b1df',true),
      ('storage.objects','proposal_mood_boards_proposal_delete','d',true,ARRAY['authenticated']::text[],'3c773dfb461ba298aad09caa33d76b13814777e6cf9698770c1d64a133c27b83','c1296eb2d205742e87c93fc2aa7c7ed62153a94ec1f6e86f149c29dbb6c4156b',true),
      ('storage.objects','proposal_mood_boards_proposal_insert','a',true,ARRAY['authenticated']::text[],'aa0b1f92c406cc783233f736f3070f18a7a490f7757849ff93eb417c8eededbe','9d241e9c66e363ec9ee79da0269fe155a6964b69c8287f5db5a7faa1b1ca0cdc',true),
      ('storage.objects','proposal_mood_boards_proposal_update','w',true,ARRAY['authenticated']::text[],'4ed278068ed7594fb5849516f391b81d9a20b2e33913bb1f2ddd9611143d83e3','9e095779ecf7eaa98bad4208d6986a354031115443e41aef04fcc911c98929e2',true)
  ), actual AS (
    SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
      ARRAY(
        SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                    ELSE role_row.rolname::text END
        FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
        LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
        ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
      ) AS actual_roles,
      pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
    FROM expected
    LEFT JOIN pg_catalog.pg_policy AS policy
      ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
     AND policy.polname = expected.policy_name
  )
  SELECT
    COALESCE(bool_and(
      oid IS NOT NULL AND polcmd = command::"char"
      AND polpermissive IS NOT DISTINCT FROM permissive
      AND actual_roles IS NOT DISTINCT FROM roles
      AND fingerprint = source_fingerprint
    ), false),
    COALESCE(bool_and(
      oid IS NOT NULL AND polcmd = command::"char"
      AND polpermissive IS NOT DISTINCT FROM permissive
      AND actual_roles IS NOT DISTINCT FROM roles
      AND fingerprint = final_fingerprint
    ), false)
  INTO source_state, final_state
  FROM actual;

  IF NOT source_state AND NOT final_state THEN
    RAISE EXCEPTION '00488 storage policies are neither the exact reviewed source nor exact final tuple set';
  END IF;
END;
$storage_source_or_final_sentinel$;

DROP POLICY IF EXISTS "Designers manage proposal folio objects" ON storage.objects;
CREATE POLICY "Designers manage proposal folio objects"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = ((storage.foldername(name))[1])::uuid
        AND public._can_author_studio_snapshot(pr.studio_id, pr.designer_id)
    )
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = ((storage.foldername(name))[1])::uuid
        AND public._can_author_studio_snapshot(pr.studio_id, pr.designer_id)
    )
  );

DROP POLICY IF EXISTS "Site request designers read immutable media" ON storage.objects;
CREATE POLICY "Site request designers read immutable media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'site-requests'
    AND EXISTS (
      SELECT 1
      FROM public.site_requests sr
      JOIN public.projects p ON p.id = sr.project_id
      WHERE sr.id::text = (storage.foldername(storage.objects.name))[1]
        AND public._can_read_studio_snapshot(p.studio_id, p.designer_id)
    )
  );

DROP POLICY IF EXISTS "project_ffe_working_studio_delete" ON storage.objects;
CREATE POLICY project_ffe_working_studio_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public._can_author_studio_snapshot(project.studio_id, project.designer_id)
  )
);

DROP POLICY IF EXISTS "project_ffe_working_studio_insert" ON storage.objects;
CREATE POLICY project_ffe_working_studio_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public._can_author_studio_snapshot(project.studio_id, project.designer_id)
  )
);

DROP POLICY IF EXISTS "project_ffe_working_studio_select" ON storage.objects;
CREATE POLICY project_ffe_working_studio_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public._can_read_studio_snapshot(project.studio_id, project.designer_id)
  )
);

DROP POLICY IF EXISTS "project_ffe_working_studio_update" ON storage.objects;
CREATE POLICY project_ffe_working_studio_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public._can_author_studio_snapshot(project.studio_id, project.designer_id)
  )
)
WITH CHECK (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public._can_author_studio_snapshot(project.studio_id, project.designer_id)
  )
);

DROP POLICY IF EXISTS "proposal_mood_boards_proposal_delete" ON storage.objects;
CREATE POLICY proposal_mood_boards_proposal_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
      AND public._can_author_studio_snapshot(proposal.studio_id, proposal.designer_id)
  )
);

DROP POLICY IF EXISTS "proposal_mood_boards_proposal_insert" ON storage.objects;
CREATE POLICY proposal_mood_boards_proposal_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
      AND public._can_author_studio_snapshot(proposal.studio_id, proposal.designer_id)
  )
);

DROP POLICY IF EXISTS "proposal_mood_boards_proposal_update" ON storage.objects;
CREATE POLICY proposal_mood_boards_proposal_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
      AND public._can_author_studio_snapshot(proposal.studio_id, proposal.designer_id)
  )
)
WITH CHECK (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
      AND public._can_author_studio_snapshot(proposal.studio_id, proposal.designer_id)
  )
);

DO $storage_final_sentinel$
BEGIN
  IF EXISTS (
    WITH expected(
      relation_name, row_security_enabled, force_row_security
    ) AS (VALUES
      ('storage.objects',true,false)
    ), actual AS (
      SELECT expected.*, relation.oid, relation.relrowsecurity,
             relation.relforcerowsecurity
      FROM expected
      LEFT JOIN pg_catalog.pg_class AS relation
        ON relation.oid = pg_catalog.to_regclass(expected.relation_name)
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL
       OR relrowsecurity IS DISTINCT FROM row_security_enabled
       OR relforcerowsecurity IS DISTINCT FROM force_row_security
  ) THEN
    RAISE EXCEPTION '00488 storage forward reviewed relation RLS profile drifted';
  END IF;

  IF EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','source',true,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66',ARRAY[]::text[]),
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','final',false,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'fabd3623a46f00576f6a4f4738fc4a98c0d49c253e99ec786217df5838f2dd99',ARRAY[]::text[]),
      ('public.evaluate_collection_rules(uuid)','source',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.evaluate_collection_rules(uuid)','final',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','source',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','final',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','source',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','final',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','source',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','final',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[])
    ), expected AS (
      SELECT * FROM states WHERE state_name = 'final'
    ), actual AS (
      SELECT expected.*, routine.oid, owner.rolname AS actual_owner,
             language.lanname AS actual_language,
             pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
             pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex') AS actual_body_sha256,
             routine.prokind, routine.prosecdef, routine.proleakproof,
             routine.proisstrict, routine.proparallel, routine.provolatile,
             routine.proretset, routine.proconfig
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
      LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL
       OR actual_owner IS DISTINCT FROM owner_name
       OR actual_language IS DISTINCT FROM language_name
       OR prokind IS DISTINCT FROM kind::"char"
       OR prosecdef IS DISTINCT FROM security_definer
       OR proleakproof IS DISTINCT FROM leakproof
       OR proisstrict IS DISTINCT FROM strict
       OR proparallel IS DISTINCT FROM parallel::"char"
       OR provolatile IS DISTINCT FROM volatility::"char"
       OR proretset IS DISTINCT FROM returns_set
       OR actual_result IS DISTINCT FROM result_type
       OR actual_arguments IS DISTINCT FROM arguments
       OR proconfig IS DISTINCT FROM config
       OR actual_body_sha256 IS DISTINCT FROM body_sha256
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','source',true,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66',ARRAY[]::text[]),
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','final',false,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'fabd3623a46f00576f6a4f4738fc4a98c0d49c253e99ec786217df5838f2dd99',ARRAY[]::text[]),
      ('public.evaluate_collection_rules(uuid)','source',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.evaluate_collection_rules(uuid)','final',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','source',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','final',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','source',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','final',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','source',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','final',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[])
    ), expected AS (
      SELECT signature, role_name AS grantee, owner_name AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
      FROM states
      CROSS JOIN LATERAL pg_catalog.unnest(allowed_roles) AS role_name
      WHERE state_name = 'final'
    ), chosen AS (
      SELECT * FROM states WHERE state_name = 'final'
    ), actual AS (
      SELECT chosen.signature,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
             grantor.rolname, acl.privilege_type, acl.is_grantable
      FROM chosen
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(chosen.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','source',true,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66',ARRAY[]::text[]),
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','final',false,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'fabd3623a46f00576f6a4f4738fc4a98c0d49c253e99ec786217df5838f2dd99',ARRAY[]::text[]),
      ('public.evaluate_collection_rules(uuid)','source',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.evaluate_collection_rules(uuid)','final',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','source',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','final',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','source',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','final',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','source',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','final',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[])
    ), expected AS (
      SELECT pg_catalog.to_regprocedure(signature) AS oid, body_sha256
      FROM states
      WHERE state_name = 'final' AND is_dynamic
    ), actual AS (
      SELECT routine.oid,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex')
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname IN ('public','app_private')
        AND pg_temp._00488_mask_sql(routine.prosrc, false)
          ~* '(^|[^a-z0-9_$])execute([^a-z0-9_$]|$)'
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','source',true,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66',ARRAY[]::text[]),
      ('public._void_invoice_authorized_legacy_00397(uuid,text)','final',false,'p_invoice_id uuid, p_reason text','postgres','plpgsql','f',true,false,false,'u','v',false,'public.invoices',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'fabd3623a46f00576f6a4f4738fc4a98c0d49c253e99ec786217df5838f2dd99',ARRAY[]::text[]),
      ('public.evaluate_collection_rules(uuid)','source',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.evaluate_collection_rules(uuid)','final',true,'p_collection_id uuid','postgres','plpgsql','f',true,false,false,'u','v',false,'jsonb',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455',ARRAY['service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','source',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)','final',true,'p_session_key uuid, p_designer_id uuid DEFAULT NULL::uuid, p_w real DEFAULT NULL::real, p_category text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_layer text DEFAULT ''catalog''::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_explore_ratio real DEFAULT 0.2, p_weights_profile text DEFAULT ''default''::text','postgres','plpgsql','f',true,false,false,'u','v',true,'TABLE(product_id uuid, rank integer, score real, confidence real, is_exploration boolean, why jsonb)',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732',ARRAY['anon','authenticated','service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','source',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_campaign_counter(uuid,text)','final',true,'p_campaign_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','source',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[]),
      ('public.increment_sequence_counter(uuid,text)','final',true,'p_sequence_id uuid, p_column text','postgres','plpgsql','f',true,false,false,'u','v',false,'void',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142',ARRAY['service_role']::text[])
    ), expected AS (
      SELECT signature FROM states WHERE state_name = 'final'
    )
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN ('_void_invoice_authorized_legacy_00397','evaluate_collection_rules','get_aesthete_matches','increment_campaign_counter','increment_sequence_counter')
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE pg_catalog.to_regprocedure(expected.signature) = routine.oid
      )
  ) THEN
    RAISE EXCEPTION
      '00488 reviewed dynamic routine profile/ACL/universe drifted';
  END IF;

  IF EXISTS (
    WITH expected(caller_signature, call_count) AS (VALUES
      ('public.void_invoice(uuid,text)', 1)
    ), actual AS (
      SELECT caller.oid,
             pg_temp._00488_call_count(
               caller.prosrc, '_void_invoice_authorized_legacy_00397'
             ) AS call_count,
             pg_temp._00488_dynamic_mentions(
               caller.prosrc, '_void_invoice_authorized_legacy_00397'
             ) AS dynamic_call
      FROM pg_catalog.pg_proc AS caller
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = caller.pronamespace
      WHERE namespace.nspname IN ('public','app_private')
    )
    (SELECT pg_catalog.to_regprocedure(caller_signature), call_count FROM expected
     EXCEPT SELECT oid, call_count FROM actual
            WHERE call_count > 0 AND NOT dynamic_call)
    UNION ALL
    (SELECT oid, call_count FROM actual
     WHERE call_count > 0 OR dynamic_call
     EXCEPT SELECT pg_catalog.to_regprocedure(caller_signature), call_count FROM expected)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    WHERE pg_temp._00488_call_count(
      COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ' ' || COALESCE(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
        ), '_void_invoice_authorized_legacy_00397'
    ) > 0
  ) OR pg_temp._00488_call_count(
    pg_catalog.pg_get_viewdef(
      'public.people_directory'::pg_catalog.regclass, true
    ), '_void_invoice_authorized_legacy_00397'
  ) > 0 THEN
    RAISE EXCEPTION '00488 dynamic invoice core caller universe drifted';
  END IF;

  IF EXISTS (
    WITH expected(
      relation_name, policy_name, command, permissive, roles,
      source_fingerprint, final_fingerprint, platform_handoff
    ) AS (VALUES
      ('storage.objects','Designers manage proposal folio objects','*',true,ARRAY['authenticated']::text[],'5ede429cc5709eab29a2c257ac4953327802a1327b81327098e5a1535acbaf71','bee7ae78bc8f07a2310c744285e2a119f0d70cfc414bd1a219d90ecc13859f9d',true),
      ('storage.objects','Site request designers read immutable media','r',true,ARRAY['authenticated']::text[],'b1f30dc540826435b6f6e877f4793df4de60711ed72b3b5ed317170e9e57e942','fe35034e3a0496db75a9475801830fb54fb79d7e975c372af82db588a84ce467',true),
      ('storage.objects','project_ffe_working_studio_delete','d',true,ARRAY['authenticated']::text[],'2fc3e22c995c8503ca6c28b8238a8d360ac01a5f2bcee8e9ef9ca566094ae5c1','4e5e0e407ce7593d83e07ac26c8fbcdf4a3e5a873861673a4d32286b84a8bb69',true),
      ('storage.objects','project_ffe_working_studio_insert','a',true,ARRAY['authenticated']::text[],'a06aecbab06a9a9d275189e37cdce755061ed7c2f7b62d437d604383bc94fe7d','1b4ac00fcefd7c36b2c7408cc4e743c34cb8a72fba347f138e46169b64431019',true),
      ('storage.objects','project_ffe_working_studio_select','r',true,ARRAY['authenticated']::text[],'2fc3e22c995c8503ca6c28b8238a8d360ac01a5f2bcee8e9ef9ca566094ae5c1','61a4b177f97ed6e89a3554768f74af2e2b562a127782fb53851dbba8d3f68c5d',true),
      ('storage.objects','project_ffe_working_studio_update','w',true,ARRAY['authenticated']::text[],'7730555c5c5a0a7e5b465c9a37675ef8c6f56602c571fbf4f3b3e08fe6b7085e','a3d01dc8e5938bdc0ced2f923d5945b93fb0fc2f48ea3b908496b499db52b1df',true),
      ('storage.objects','proposal_mood_boards_proposal_delete','d',true,ARRAY['authenticated']::text[],'3c773dfb461ba298aad09caa33d76b13814777e6cf9698770c1d64a133c27b83','c1296eb2d205742e87c93fc2aa7c7ed62153a94ec1f6e86f149c29dbb6c4156b',true),
      ('storage.objects','proposal_mood_boards_proposal_insert','a',true,ARRAY['authenticated']::text[],'aa0b1f92c406cc783233f736f3070f18a7a490f7757849ff93eb417c8eededbe','9d241e9c66e363ec9ee79da0269fe155a6964b69c8287f5db5a7faa1b1ca0cdc',true),
      ('storage.objects','proposal_mood_boards_proposal_update','w',true,ARRAY['authenticated']::text[],'4ed278068ed7594fb5849516f391b81d9a20b2e33913bb1f2ddd9611143d83e3','9e095779ecf7eaa98bad4208d6986a354031115443e41aef04fcc911c98929e2',true)
    ), actual AS (
      SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.policy_name
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL OR polcmd <> command::"char"
       OR polpermissive IS DISTINCT FROM permissive
       OR actual_roles IS DISTINCT FROM roles
       OR fingerprint <> final_fingerprint
  ) OR EXISTS (
    WITH expected(policy_name) AS (VALUES
      ('Designers manage proposal folio objects'),
      ('Site request designers read immutable media'),
      ('project_ffe_working_studio_delete'),
      ('project_ffe_working_studio_insert'),
      ('project_ffe_working_studio_select'),
      ('project_ffe_working_studio_update'),
      ('proposal_mood_boards_proposal_delete'),
      ('proposal_mood_boards_proposal_insert'),
      ('proposal_mood_boards_proposal_update')
    )
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::pg_catalog.regclass
      AND (COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ' ' || COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''))
        ~* '(^|[^a-z0-9_])_can_(read|author)_studio_snapshot[[:space:]]*\('
      AND NOT EXISTS (
        SELECT 1 FROM expected WHERE expected.policy_name = policy.polname
      )
  ) THEN
    RAISE EXCEPTION '00488 storage exact final policy/reverse-caller sentinel failed';
  END IF;
END;
$storage_final_sentinel$;

-- The platform phase is the last caller of the four compatibility helpers.
-- Revoke every named application role before dropping each identity.
DO $retire_storage_compatibility_helpers$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public._can_author_proposal(uuid)',
    'public.is_active_studio_member(uuid)',
    'public.is_design_studio_comember(uuid)',
    'public.is_studio_comember(uuid)'
  ]
  LOOP
    IF pg_catalog.to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, dashboard_user, agent_reader, agent_writer, edge_catalog_reader, edge_rls_user',
        signature
      );
      EXECUTE pg_catalog.format('DROP FUNCTION %s', signature);
    END IF;
  END LOOP;
END;
$retire_storage_compatibility_helpers$;

DO $storage_global_final_sentinel$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
        '_can_author_proposal','is_active_studio_member',
        'is_design_studio_comember','is_studio_comember'
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    CROSS JOIN pg_catalog.unnest(ARRAY[
      '_can_author_proposal','is_active_studio_member',
      'is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE namespace.nspname IN ('public','app_private')
      AND (
        pg_temp._00488_call_count(routine.prosrc, forbidden.helper_name) > 0
        OR pg_temp._00488_dynamic_mentions(
          routine.prosrc, forbidden.helper_name
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    CROSS JOIN pg_catalog.unnest(ARRAY[
      '_can_author_proposal','is_active_studio_member',
      'is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE pg_temp._00488_call_count(
      COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ' ' || COALESCE(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
        ), forbidden.helper_name
    ) > 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      '_can_author_proposal','is_active_studio_member',
      'is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE pg_temp._00488_call_count(
      pg_catalog.pg_get_viewdef(
        'public.people_directory'::pg_catalog.regclass, true
      ), forbidden.helper_name
    ) > 0
  )
  THEN
    RAISE EXCEPTION '00488 storage final global legacy-helper closure failed';
  END IF;
END;
$storage_global_final_sentinel$;

COMMIT;
