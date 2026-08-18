-- ═══════════════════════════════════════════════════════════════════════════
-- Anti-vacuity proof for the PUBLIC ACL conformance predicate.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 \
--     -f supabase/tests/edge_api/catalog_roles_remote_conformance_negative_test.sql
--
-- WHY THIS FILE EXISTS. Earlier in this same programme, the mood-board security
-- test passed, the vulnerable policy was then reinstalled, and the test passed
-- again: its deny probes had been measuring an unrelated "permission denied for
-- function is_project_team_member" error rather than the policy under test. A
-- gate rewritten from always-red to always-green looks identical to a gate that
-- was fixed. The only difference an auditor can see is whether the gate still
-- fails against a state that is deliberately broken.
--
-- A specific trap this file is built around: 00483 revokes USAGE on schema
-- `public` from PUBLIC. A denied call therefore reports "permission denied for
-- schema public", not "permission denied for function ...". Any assertion that
-- matched on message text would pass for the wrong reason. Nothing here reads
-- an error message; every phase counts rows out of the shared predicate views.
--
-- SHAPE. Four phases inside one transaction that is UNCONDITIONALLY rolled
-- back, plus a post-rollback re-assert.
--
--   0  green baseline  — the predicate reports nothing on the real database
--   1  invariant A     — a PUBLIC-executable SECURITY DEFINER routine is caught
--   2  invariant B     — a PUBLIC-writable relation is caught
--   3  no over-firing  — the same two objects, created without a PUBLIC grant
--                        and in a schema PUBLIC cannot enter, are NOT caught
--   4  rollback proof  — the predicate is green again
--
-- Phase 3 matters as much as 1 and 2. A predicate that flags everything is as
-- useless as one that flags nothing, and it is the failure mode that a
-- "does it go red?" check cannot distinguish.
--
-- Exit 0 means the predicate SUCCESSFULLY DETECTED the broken state.
--
-- Local-only: this file creates real objects before rolling them back, so it
-- carries the same hard target guard as catalog_roles_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

SELECT (
  :'HOST' IN ('127.0.0.1', 'localhost', '::1')
  AND :'PORT' = '54322'
  AND current_database() = 'postgres'
) AS cf_negative_local_target
\gset

\if :cf_negative_local_target
\else
  \warn 'catalog_roles_remote_conformance_negative_test.sql refused: it creates objects, so it is local-only'
  SELECT 1 / 0 AS cf_negative_local_target_required;
\endif

\ir public_acl_exception_registry.sql

-- ── Phase 0 — the predicate is green before anything is broken ──────────────
DO $phase0$
DECLARE
  capability_findings integer;
  effective_findings  integer;
BEGIN
  SELECT count(*) INTO capability_findings FROM public_acl_capability_findings;
  SELECT count(*) INTO effective_findings FROM public_acl_role_effective_finding;

  IF capability_findings <> 0 OR effective_findings <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'NEGATIVE TEST CANNOT RUN: the database is already failing the predicate (capability=%s, effective=%s). Fix the real gate first; a negative proof means nothing from a red baseline',
      capability_findings, effective_findings
    );
  END IF;
END
$phase0$;

\echo 'negative test phase 0: baseline predicate is green'

BEGIN;

-- ── The deliberately broken state ───────────────────────────────────────────
-- A schema PUBLIC can enter, holding one routine that acts with the owner's
-- rights and one relation PUBLIC can write. This is precisely the shape 00483
-- exists to prevent.
--
-- The explicit GRANTs are not padding. 00483's ALTER DEFAULT PRIVILEGES already
-- strips PUBLIC EXECUTE from every future postgres-owned routine, so a routine
-- created without a grant would not be reachable and would prove nothing about
-- the gate. Phase 3 relies on exactly that.

CREATE SCHEMA cf_acl_negative_reachable;
GRANT USAGE ON SCHEMA cf_acl_negative_reachable TO PUBLIC;

CREATE FUNCTION cf_acl_negative_reachable.escalating_definer(target text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $definer$
  SELECT target
$definer$;
GRANT EXECUTE ON FUNCTION cf_acl_negative_reachable.escalating_definer(text)
  TO PUBLIC;

CREATE TABLE cf_acl_negative_reachable.public_writable (
  id   integer PRIMARY KEY,
  body text
);
GRANT INSERT, UPDATE, DELETE ON cf_acl_negative_reachable.public_writable
  TO PUBLIC;

-- The control set: same two object shapes, but not PUBLIC-reachable. One pair
-- sits in a schema that withholds USAGE from PUBLIC; the other sits in the
-- reachable schema with no PUBLIC object grant.

CREATE SCHEMA cf_acl_negative_unreachable;

CREATE FUNCTION cf_acl_negative_unreachable.hidden_definer(target text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $definer$
  SELECT target
$definer$;
GRANT EXECUTE ON FUNCTION cf_acl_negative_unreachable.hidden_definer(text)
  TO PUBLIC;

CREATE TABLE cf_acl_negative_unreachable.public_writable (
  id integer PRIMARY KEY
);
GRANT INSERT ON cf_acl_negative_unreachable.public_writable TO PUBLIC;

CREATE FUNCTION cf_acl_negative_reachable.ungranted_definer(target text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $definer$
  SELECT target
$definer$;

CREATE TABLE cf_acl_negative_reachable.ungranted_relation (
  id integer PRIMARY KEY
);

-- Invariant B is scoped to writability. A PUBLIC-readable relation in a
-- reachable schema is real exposure but a different question, and the ruling
-- named writability; this object pins that boundary so a later widening is a
-- deliberate edit rather than a silent one.
CREATE TABLE cf_acl_negative_reachable.select_only (
  id integer PRIMARY KEY
);
GRANT SELECT ON cf_acl_negative_reachable.select_only TO PUBLIC;

DO $phases_1_to_3$
DECLARE
  definer_caught      integer;
  relation_caught     integer;
  effective_caught    integer;
  unreachable_caught  integer;
  ungranted_caught    integer;
  select_only_caught  integer;
BEGIN
  -- ── Phase 1 — invariant A catches the SECURITY DEFINER routine ────────────
  SELECT count(*)
    INTO definer_caught
    FROM public_acl_capability_findings
   WHERE invariant = 'A'
     AND schema_name = 'cf_acl_negative_reachable'
     AND object_signature = 'cf_acl_negative_reachable.escalating_definer(text)'
     AND detail = 'PUBLIC-reachable SECURITY DEFINER routine';

  IF definer_caught <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'ANTI-VACUITY FAILURE (invariant A): a PUBLIC-executable SECURITY DEFINER routine in a PUBLIC-reachable schema produced %s findings, expected exactly 1. The gate would pass a database that is broken',
      definer_caught
    );
  END IF;

  -- ── Phase 2 — invariant B catches the PUBLIC-writable relation ────────────
  SELECT count(*)
    INTO relation_caught
    FROM public_acl_capability_findings
   WHERE invariant = 'B'
     AND schema_name = 'cf_acl_negative_reachable'
     AND object_signature = 'cf_acl_negative_reachable.public_writable';

  IF relation_caught <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'ANTI-VACUITY FAILURE (invariant B): a PUBLIC-writable relation in a PUBLIC-reachable schema produced %s findings, expected exactly 1. The gate would pass a database that is broken',
      relation_caught
    );
  END IF;

  -- The effective-ACL family must move too. edge_catalog_reader reaches both
  -- objects through PUBLIC, so a gate whose *_effective counters had been
  -- quietly neutered by the reachability filter would stay at zero here.
  SELECT count(*)
    INTO effective_caught
    FROM public_acl_role_effective_finding
   WHERE schema_name = 'cf_acl_negative_reachable';

  IF effective_caught = 0 THEN
    RAISE EXCEPTION
      'ANTI-VACUITY FAILURE (effective ACL): edge_catalog_reader reaches the broken schema through PUBLIC, but the effective-ACL predicate reported nothing. The reachability filter has been over-applied and the counters are vacuous';
  END IF;

  -- ── Phase 3 — the predicate does not fire on unreachable or ungranted ─────
  SELECT count(*)
    INTO unreachable_caught
    FROM public_acl_capability_findings
   WHERE schema_name = 'cf_acl_negative_unreachable';

  IF unreachable_caught <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'OVER-FIRING (reachability): %s finding(s) against a schema that withholds USAGE from PUBLIC. Those privileges are inert; a gate that reports them cannot be kept green and will be ignored',
      unreachable_caught
    );
  END IF;

  SELECT count(*)
    INTO ungranted_caught
    FROM public_acl_capability_findings
   WHERE object_signature IN (
     'cf_acl_negative_reachable.ungranted_definer(text)',
     'cf_acl_negative_reachable.ungranted_relation'
   );

  IF ungranted_caught <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'OVER-FIRING (object grant): %s finding(s) against objects with no PUBLIC privilege at all. 00483 already strips PUBLIC EXECUTE from future postgres-owned routines; the gate must respect that',
      ungranted_caught
    );
  END IF;

  -- Invariant B is about writability, not readability.
  SELECT count(*)
    INTO select_only_caught
    FROM public_acl_capability_findings
   WHERE invariant = 'B'
     AND object_signature = 'cf_acl_negative_reachable.select_only';

  IF select_only_caught <> 0 THEN
    RAISE EXCEPTION
      'OVER-FIRING (invariant B): a SELECT-only PUBLIC grant was reported as writable';
  END IF;
END
$phases_1_to_3$;

\echo 'negative test phases 1-3: predicate detected the broken state and did not over-fire'

ROLLBACK;

-- ── Phase 4 — the rollback really happened and the gate is green again ──────
DO $phase4$
DECLARE
  leftovers           integer;
  capability_findings integer;
BEGIN
  SELECT count(*)
    INTO leftovers
    FROM pg_catalog.pg_namespace
   WHERE nspname IN (
     'cf_acl_negative_reachable', 'cf_acl_negative_unreachable'
   );

  IF leftovers <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'NEGATIVE TEST LEAKED: %s probe schema(s) survived the rollback',
      leftovers
    );
  END IF;

  SELECT count(*) INTO capability_findings FROM public_acl_capability_findings;

  IF capability_findings <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'NEGATIVE TEST LEFT THE DATABASE RED: %s finding(s) after rollback',
      capability_findings
    );
  END IF;
END
$phase4$;

\echo 'edge_api/catalog_roles_remote_conformance_negative_test.sql: the conformance predicate FAILED against a deliberately broken state and recovered — the gate is not vacuous'
