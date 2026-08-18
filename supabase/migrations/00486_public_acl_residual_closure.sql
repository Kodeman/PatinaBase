-- ═══════════════════════════════════════════════════════════════════════════
-- 00486 — Close the PUBLIC residuals this principal actually owns
--
-- WHY THIS EXISTS. 00483 withdrew PUBLIC EXECUTE from every postgres-owned
-- ROUTINE and revoked PUBLIC's USAGE on schema `public`. It did not sweep
-- PUBLIC privileges on postgres-owned RELATIONS, because the conformance gate
-- of the day could not see them: it tested reachability as "does the pseudo-role
-- PUBLIC hold schema USAGE", and 00483 had just moved `public`'s USAGE off
-- PUBLIC and onto named roles. Anything PUBLIC still held inside a schema
-- `anon` could enter was therefore invisible.
--
-- Corrected, the rule is: a PUBLIC privilege is exposure when an UNTRUSTED role
-- can enter the schema — `anon` or `authenticated`, the two roles handed to
-- anyone with the publishable key or an account. A PUBLIC grant flows to every
-- role, so PUBLIC's own schema USAGE was never the right question.
--
-- WHAT THAT SURFACED, and what this migration closes. On staging
-- `vuesoyhfrjabfxbrzekd`, measured read-only 2026-08-18:
--
--   extensions.pg_stat_statements       owner postgres, PUBLIC SELECT
--   extensions.pg_stat_statements_info  owner postgres, PUBLIC SELECT
--
-- `anon` can read them. pg_stat_statements normalises literals to $1, but it
-- does not normalise table names, column names, or query shape, so an
-- unauthenticated caller can enumerate the schema and the application's access
-- patterns. `postgres` owns both, so this is ours to shut, and fix beats accept
-- wherever ownership allows it.
--
-- ⚠ PLATFORM SPLIT, verified rather than assumed. The grantor of the PUBLIC
-- SELECT differs by environment:
--
--   staging / production   `=r/postgres`         → postgres is the grantor,
--                                                   the REVOKE takes effect
--   local Supabase CLI     `=r/supabase_admin`   → a reserved owner is the
--                                                   grantor; the REVOKE is a
--                                                   SILENT NO-OP
--
-- PostgreSQL lets a non-owner revoke only grants it made itself, and it does so
-- without raising. That is precisely the "warning-only no-op REVOKE" 00483's
-- header refuses to count as closure, so this migration does not count it
-- either: it re-reads the ACL after every revoke and reports what actually
-- happened. It RAISES when it should have been able to close something and did
-- not, and emits a NOTICE when the object belongs to a reserved owner and never
-- could be closed from here. The residual then stays visible to the conformance
-- gate rather than being quietly absorbed.
--
-- SCOPE. Relations, sequences and columns only, owned by the migration
-- principal, in schemas an untrusted role can enter. Routines are already
-- covered by 00483's $owned_routines$ loop and are not re-swept here.
-- Nothing owned by supabase_admin, supabase_auth_admin or
-- supabase_storage_admin is touched — those REVOKEs would be the same silent
-- no-op, and issuing them would manufacture false evidence of closure.
--
-- Idempotent: re-running finds nothing left to revoke and asserts the same
-- postconditions.
--
-- Adds REVOKE → regenerate seed/00-legacy-grants.sql if this changes anything
-- locally. On the current local image it does not: both relations are
-- supabase_admin-owned there.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
DECLARE
  role_name text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '00486 must run as postgres; got %', current_user;
  END IF;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF to_regrole(role_name) IS NULL THEN
      RAISE EXCEPTION
        '00486 required role % is missing; the untrusted-reachability rule cannot be evaluated',
        role_name;
    END IF;
  END LOOP;
END
$preflight$;

-- ── The sweep ───────────────────────────────────────────────────────────────
DO $residual_closure$
DECLARE
  target record;
  still_public boolean;
  blocking_grantor text;
  closed_count integer := 0;
  blocked_count integer := 0;
BEGIN
  FOR target IN
    SELECT DISTINCT
      c.oid,
      n.nspname,
      c.relname,
      c.relkind,
      pg_catalog.format('%I.%I', n.nspname, c.relname) AS qualified
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        c.relacl,
        pg_catalog.acldefault(
          CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END::"char", c.relowner
        )
      )
    ) AS acl
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND pg_catalog.pg_get_userbyid(c.relowner) = current_user
      AND acl.grantee = 0
      AND n.nspname !~ '^pg_'
      AND n.nspname <> 'information_schema'
      AND (
        pg_catalog.has_schema_privilege('anon', n.oid, 'USAGE')
        OR pg_catalog.has_schema_privilege('authenticated', n.oid, 'USAGE')
      )
    ORDER BY 2, 3
  LOOP
    IF target.relkind = 'S' THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated',
        target.qualified
      );
    ELSE
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon, authenticated',
        target.qualified
      );
    END IF;

    -- Never trust the REVOKE. Re-read the catalog.
    SELECT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_class AS c
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            c.relacl,
            pg_catalog.acldefault(
              CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END::"char", c.relowner
            )
          )
        ) AS acl
       WHERE c.oid = target.oid
         AND acl.grantee = 0
    ) INTO still_public;

    IF NOT still_public THEN
      closed_count := closed_count + 1;
      RAISE NOTICE '00486 closed PUBLIC privileges on %.%',
        target.nspname, target.relname;
      CONTINUE;
    END IF;

    SELECT pg_catalog.pg_get_userbyid(acl.grantor)
      INTO blocking_grantor
      FROM pg_catalog.pg_class AS c
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(
          c.relacl,
          pg_catalog.acldefault(
            CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END::"char", c.relowner
          )
        )
      ) AS acl
     WHERE c.oid = target.oid
       AND acl.grantee = 0
     LIMIT 1;

    IF blocking_grantor = current_user THEN
      -- We were the grantor and the revoke still did not take. That is not a
      -- platform limitation, it is a broken assumption, and it must stop here.
      RAISE EXCEPTION
        '00486 could not revoke its own PUBLIC grant on %.% (grantor %)',
        target.nspname, target.relname, blocking_grantor;
    END IF;

    blocked_count := blocked_count + 1;
    RAISE NOTICE
      '00486 CANNOT close PUBLIC privileges on %.%: granted by reserved owner %, and postgres may revoke only its own grants. This residual stays visible to the conformance gate',
      target.nspname, target.relname, blocking_grantor;
  END LOOP;

  RAISE NOTICE '00486 relation sweep: % closed, % blocked by a reserved grantor',
    closed_count, blocked_count;
END
$residual_closure$;

-- ── Column-level PUBLIC grants on principal-owned relations ─────────────────
DO $column_closure$
DECLARE
  target record;
  closed_count integer := 0;
BEGIN
  FOR target IN
    SELECT DISTINCT
      n.nspname,
      c.relname,
      a.attname,
      pg_catalog.format('%I.%I', n.nspname, c.relname) AS qualified
    FROM pg_catalog.pg_attribute AS a
    JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
    WHERE a.attnum > 0
      AND NOT a.attisdropped
      AND a.attacl IS NOT NULL
      AND acl.grantee = 0
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND pg_catalog.pg_get_userbyid(c.relowner) = current_user
      AND n.nspname !~ '^pg_'
      AND n.nspname <> 'information_schema'
      AND (
        pg_catalog.has_schema_privilege('anon', n.oid, 'USAGE')
        OR pg_catalog.has_schema_privilege('authenticated', n.oid, 'USAGE')
      )
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE %s FROM PUBLIC, anon, authenticated',
      target.attname, target.qualified
    );
    closed_count := closed_count + 1;
    RAISE NOTICE '00486 closed PUBLIC column privileges on %.%.%',
      target.nspname, target.relname, target.attname;
  END LOOP;

  IF closed_count > 0 THEN
    RAISE NOTICE '00486 column sweep: % closed', closed_count;
  END IF;
END
$column_closure$;

-- ── Named postcondition for the two relations this migration was written for ─
-- The sweep above is general so a future postgres-owned object cannot slip
-- through, but pg_stat_statements is the measured case and gets its own check
-- so a silent behaviour change is loud instead.
DO $named_postcondition$
DECLARE
  target text;
  target_oid oid;
  owner_name text;
  anon_reads boolean;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'extensions.pg_stat_statements',
    'extensions.pg_stat_statements_info'
  ]
  LOOP
    target_oid := to_regclass(target);

    IF target_oid IS NULL THEN
      RAISE NOTICE
        '00486 %: not present in this database; nothing to close', target;
      CONTINUE;
    END IF;

    SELECT pg_catalog.pg_get_userbyid(relowner) INTO owner_name
      FROM pg_catalog.pg_class WHERE oid = target_oid;

    anon_reads := pg_catalog.has_table_privilege('anon', target_oid, 'SELECT');

    IF NOT anon_reads THEN
      RAISE NOTICE '00486 %: anon can no longer read it', target;
      CONTINUE;
    END IF;

    IF owner_name = current_user THEN
      RAISE EXCEPTION
        '00486 % is owned by % and anon can still SELECT it after the sweep',
        target, owner_name;
    END IF;

    RAISE NOTICE
      '00486 %: still readable by anon. Owner is %, not %, so this principal cannot revoke the grant. Recorded as an open residual, NOT as closure',
      target, owner_name, current_user;
  END LOOP;
END
$named_postcondition$;

COMMIT;
