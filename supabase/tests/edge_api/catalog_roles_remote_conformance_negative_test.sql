-- ═══════════════════════════════════════════════════════════════════════════
-- Anti-vacuity proof for the PUBLIC ACL conformance predicate.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 \
--     -f supabase/tests/edge_api/catalog_roles_remote_conformance_negative_test.sql
--
-- WHY THIS FILE EXISTS. Earlier in this same programme, the mood-board security
-- test passed, the vulnerable policy was then reinstalled, and it passed again:
-- its deny probes had been measuring an unrelated "permission denied for
-- function is_project_team_member" error rather than the policy under test. A
-- gate rewritten from always-red to always-green looks identical to a gate that
-- was fixed. The only difference an auditor can see is whether the gate still
-- fails against a state that is deliberately broken.
--
-- ⚠ AND THIS FILE ALREADY FAILED ONCE AT EXACTLY THAT JOB. Its first revision
-- planted its probes in a schema it created itself and granted PUBLIC USAGE to
-- — a shape no migration produces. The invariants passed against it while being
-- structurally unable to fire on `public`, where every application object
-- lives. The probes now go in `public`. Do not move them back: a probe schema
-- you build to suit the predicate tests the predicate against itself.
--
-- Two traps this file is built around:
--
--   • 00483 revokes USAGE on schema `public` from PUBLIC, so a denied call
--     reports "permission denied for schema public", not "permission denied for
--     function ...". Nothing here reads an error message; every phase counts
--     rows out of the shared predicate views. The one place a message IS read
--     (phase 6's trigger-function probe) asserts on SQLSTATE, not text.
--
--   • The real database is NOT expected to be clean. Every phase measures a
--     DELTA against a baseline captured before anything is planted, so this
--     file proves discrimination even while the live gate is red for unrelated,
--     already-reported reasons. An absolute "must be zero" baseline would make
--     this proof unavailable exactly when it is most needed.
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

-- ── Baseline, captured outside the transaction so it survives the ROLLBACK ──
CREATE TEMP TABLE cf_acl_negative_baseline AS
SELECT
  (SELECT count(*) FROM public_acl_capability_findings
    WHERE invariant = 'A') AS invariant_a,
  (SELECT count(*) FROM public_acl_capability_findings
    WHERE invariant = 'B') AS invariant_b,
  (SELECT count(*) FROM public_acl_capability_findings
    WHERE invariant = 'C') AS invariant_c,
  (SELECT count(*) FROM public_acl_role_effective_finding) AS effective,
  (SELECT count(*) FROM public_acl_public_grant_finding) AS public_grants;

DO $baseline$
DECLARE
  b record;
BEGIN
  SELECT * INTO b FROM cf_acl_negative_baseline;

  -- `public` must be in the reachable set, or nothing below proves anything.
  -- This is the exact condition whose absence made the first revision vacuous.
  IF NOT EXISTS (
    SELECT 1 FROM public_acl_untrusted_reachable_schema WHERE nspname = 'public'
  ) THEN
    RAISE EXCEPTION
      'NEGATIVE TEST CANNOT RUN: schema `public` is not in public_acl_untrusted_reachable_schema, so invariants A and B cannot fire where the application lives. This is the exact defect the reachability fix addressed';
  END IF;

  RAISE NOTICE
    'negative test baseline: A=% B=% C=% effective=% public_grants=%',
    b.invariant_a, b.invariant_b, b.invariant_c, b.effective, b.public_grants;
END
$baseline$;

BEGIN;

-- ── The deliberately broken state, planted in `public` ──────────────────────
-- The explicit GRANTs are not padding: 00483's ALTER DEFAULT PRIVILEGES already
-- strips PUBLIC EXECUTE from every future postgres-owned routine, so a routine
-- created without one would not be reachable and would prove nothing. Phase 6
-- relies on exactly that.

CREATE FUNCTION public.cf_acl_negative_definer(target text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $definer$
  SELECT target
$definer$;
GRANT EXECUTE ON FUNCTION public.cf_acl_negative_definer(text) TO PUBLIC;

CREATE TABLE public.cf_acl_negative_writable (id integer PRIMARY KEY);
GRANT INSERT, UPDATE, DELETE ON public.cf_acl_negative_writable TO PUBLIC;

CREATE POLICY cf_acl_negative_policy
  ON storage.objects FOR SELECT TO PUBLIC
  USING (false);

-- Controls. None of these may be flagged.
CREATE SCHEMA cf_acl_negative_unreachable;   -- no grant to anon/authenticated
CREATE FUNCTION cf_acl_negative_unreachable.hidden_definer(target text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $definer$ SELECT target $definer$;
GRANT EXECUTE ON FUNCTION cf_acl_negative_unreachable.hidden_definer(text)
  TO PUBLIC;
CREATE TABLE cf_acl_negative_unreachable.writable (id integer PRIMARY KEY);
GRANT INSERT ON cf_acl_negative_unreachable.writable TO PUBLIC;

CREATE FUNCTION public.cf_acl_negative_ungranted(target text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $definer$ SELECT target $definer$;

CREATE TABLE public.cf_acl_negative_ungranted_rel (id integer PRIMARY KEY);

CREATE TABLE public.cf_acl_negative_select_only (id integer PRIMARY KEY);
GRANT SELECT ON public.cf_acl_negative_select_only TO PUBLIC;

CREATE FUNCTION public.cf_acl_negative_trigger_definer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $trg$ BEGIN RETURN NEW; END $trg$;
GRANT EXECUTE ON FUNCTION public.cf_acl_negative_trigger_definer() TO PUBLIC;

DO $probe$
DECLARE
  b               record;
  caught          integer;
  hidden_from     integer;
  trigger_state   text;
  registered_qual text;
  body_mismatch   integer;
BEGIN
  SELECT * INTO b FROM cf_acl_negative_baseline;

  -- ── Phase 1 — invariant A catches a SECURITY DEFINER routine in `public` ──
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings
   WHERE invariant = 'A'
     AND schema_name = 'public'
     AND object_signature = 'public.cf_acl_negative_definer(text)'
     AND detail = 'PUBLIC-reachable SECURITY DEFINER routine';
  IF caught <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'ANTI-VACUITY FAILURE (invariant A): a PUBLIC-executable SECURITY DEFINER routine in schema `public` produced %s findings, expected exactly 1. `anon` can execute it; the gate cannot see it',
      caught
    );
  END IF;

  -- ── Phase 2 — invariant B catches a PUBLIC-writable relation in `public` ──
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings
   WHERE invariant = 'B'
     AND schema_name = 'public'
     AND object_signature = 'public.cf_acl_negative_writable';
  IF caught <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'ANTI-VACUITY FAILURE (invariant B): a PUBLIC-writable relation in schema `public` produced %s findings, expected exactly 1',
      caught
    );
  END IF;

  -- ── Phase 3 — invariant C catches an unregistered {public} storage policy ──
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings
   WHERE invariant = 'C'
     AND object_signature = 'storage.objects."cf_acl_negative_policy"';
  IF caught <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'ANTI-VACUITY FAILURE (invariant C): a new {public} policy on storage.objects produced %s findings, expected exactly 1. The 28 storage_policy registry rows would be decorative',
      caught
    );
  END IF;

  -- ── Phase 3b — invariant C catches a REGISTERED policy whose body widened ──
  -- The mood-board false-pass class, exactly: keep a registered {public}
  -- policy's NAME, widen its predicate. The name still matches a registry row;
  -- the pinned body hash does not. A name-only exemption (the hole this closes)
  -- would score green; the content pin must score red. The policy is restored
  -- immediately so the Phase 7 deltas still hold — and on any failure here
  -- ON_ERROR_STOP rolls the whole transaction back regardless.
  SELECT qual INTO registered_qual
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'Product images are publicly accessible';

  EXECUTE format(
    'ALTER POLICY %I ON storage.objects USING (%s OR true)',
    'Product images are publicly accessible', registered_qual
  );

  SELECT count(*) INTO body_mismatch
    FROM public_acl_capability_findings
   WHERE invariant = 'C'
     AND object_signature
         = 'storage.objects."Product images are publicly accessible"'
     AND detail LIKE '%body hash no longer matches%';
  IF body_mismatch <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'ANTI-VACUITY FAILURE (invariant C body pin): widening a REGISTERED {public} storage policy produced %s body-mismatch finding(s), expected exactly 1. A name-only exemption would have hidden the widened body — the exact mood-board false pass',
      body_mismatch
    );
  END IF;

  -- Total invariant C is now baseline + 2 (the unregistered cf policy AND this
  -- widened registered one); confirm, then restore.
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings WHERE invariant = 'C';
  IF caught <> b.invariant_c + 2 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'invariant C did not rise to baseline+2 under a widened registered policy (delta %s)',
      caught - b.invariant_c
    );
  END IF;

  EXECUTE format(
    'ALTER POLICY %I ON storage.objects USING (%s)',
    'Product images are publicly accessible', registered_qual
  );

  -- Restored: the registered policy hashes to its pinned value again, so
  -- invariant C returns to baseline + 1 (only the unregistered cf policy). This
  -- proves the pin is content-addressed, not a one-way tripwire.
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings WHERE invariant = 'C';
  IF caught <> b.invariant_c + 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'invariant C did not return to baseline+1 after restoring the registered policy body (delta %s); the pin is not content-addressed',
      caught - b.invariant_c
    );
  END IF;

  -- ── Phase 3c — invariant C catches a SELECT→ALL command widening (F-h1-1) ──
  -- Drop a registered SELECT {public} policy and recreate it as ALL {public}
  -- with the IDENTICAL USING and no WITH CHECK. qual is unchanged and with_check
  -- stays NULL, so the pre-cmd hash was byte-identical and this widening — which
  -- silently grants {public} INSERT/UPDATE/DELETE — rode the exemption (proven:
  -- the cmd-less gate returned 0 findings for exactly this mutation). Folding cmd
  -- into the pinned identity must now score it red. Restored to the exact SELECT
  -- policy afterwards so the Phase 7 deltas still hold.
  SELECT qual INTO registered_qual
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'Studio logos are publicly readable';

  EXECUTE 'DROP POLICY "Studio logos are publicly readable" ON storage.objects';
  EXECUTE format(
    'CREATE POLICY "Studio logos are publicly readable" ON storage.objects FOR ALL TO public USING (%s)',
    registered_qual
  );

  SELECT count(*) INTO body_mismatch
    FROM public_acl_capability_findings
   WHERE invariant = 'C'
     AND object_signature = 'storage.objects."Studio logos are publicly readable"'
     AND detail LIKE '%body hash no longer matches%';
  IF body_mismatch <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'ANTI-VACUITY FAILURE (invariant C cmd pin): a SELECT {public} policy recreated as ALL {public} with the same USING produced %s body-mismatch finding(s), expected exactly 1. The cmd-less hash returned 0 and let the {public} write widening through',
      body_mismatch
    );
  END IF;

  SELECT count(*) INTO caught
    FROM public_acl_capability_findings WHERE invariant = 'C';
  IF caught <> b.invariant_c + 2 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'invariant C did not rise to baseline+2 under a command-widened registered policy (delta %s)',
      caught - b.invariant_c
    );
  END IF;

  EXECUTE 'DROP POLICY "Studio logos are publicly readable" ON storage.objects';
  EXECUTE format(
    'CREATE POLICY "Studio logos are publicly readable" ON storage.objects FOR SELECT TO public USING (%s)',
    registered_qual
  );

  SELECT count(*) INTO caught
    FROM public_acl_capability_findings WHERE invariant = 'C';
  IF caught <> b.invariant_c + 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'invariant C did not return to baseline+1 after restoring the SELECT command (delta %s); the cmd pin is not reversible',
      caught - b.invariant_c
    );
  END IF;

  -- ── Phase 4 — a routine_invoker row must NOT excuse a SECURITY DEFINER ────
  -- This is the regression probe for the specific hole a10 found: 151 of the
  -- 193 registry rows are routine_invoker, and if invariant A honoured that
  -- kind, 77% of the registry would be a bypass. Kind-scoping is the only thing
  -- stopping it, so kind-scoping gets tested rather than asserted in a comment.
  INSERT INTO public_acl_exception_registry
    (schema_name, object_signature, owner_name, kind, reason,
     accepted_by, accepted_on)
  VALUES
    ('public', 'public.cf_acl_negative_definer(text)', 'postgres',
     'routine_invoker', 'negative-test probe row', 'negative-test',
     DATE '2026-08-17');

  SELECT count(*) INTO caught
    FROM public_acl_capability_findings
   WHERE invariant = 'A'
     AND object_signature = 'public.cf_acl_negative_definer(text)';
  IF caught <> 1 THEN
    RAISE EXCEPTION
      'ANTI-VACUITY FAILURE (kind scoping): a routine_invoker registry row suppressed a SECURITY DEFINER routine from invariant A. Any of the 151 invoker rows would then be a bypass';
  END IF;

  DELETE FROM public_acl_exception_registry
   WHERE accepted_by = 'negative-test';

  -- ── Phase 5 — the effective-ACL family must move too ──────────────────────
  -- edge_catalog_reader holds USAGE on `public` and reaches both planted
  -- objects through PUBLIC. A reachability filter that had been over-applied
  -- would leave this at the baseline.
  SELECT count(*) INTO caught
    FROM public_acl_role_effective_finding
   WHERE object_signature IN (
     'public.cf_acl_negative_definer(text)',
     'public.cf_acl_negative_writable'
   );
  IF caught = 0 THEN
    RAISE EXCEPTION
      'ANTI-VACUITY FAILURE (effective ACL): edge_catalog_reader reaches the planted objects through PUBLIC, but the effective-ACL predicate reported nothing';
  END IF;

  -- ── Phase 6 — no over-firing ──────────────────────────────────────────────
  -- A predicate that flags everything is as useless as one that flags nothing,
  -- and it is the failure mode a "does it go red?" check cannot distinguish.

  -- 6a. A schema neither `anon` nor `authenticated` can enter. Note this is a
  --     stronger, different test from the one the first revision made: it
  --     withholds USAGE from the UNTRUSTED ROLES, not merely from PUBLIC.
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings
   WHERE schema_name = 'cf_acl_negative_unreachable';
  IF caught <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'OVER-FIRING (reachability): %s finding(s) in a schema no untrusted role can enter. Those privileges are genuinely inert',
      caught
    );
  END IF;

  -- 6b. Objects in `public` with no PUBLIC privilege at all.
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings
   WHERE object_signature IN (
     'public.cf_acl_negative_ungranted(text)',
     'public.cf_acl_negative_ungranted_rel'
   );
  IF caught <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'OVER-FIRING (object grant): %s finding(s) against objects with no PUBLIC privilege. 00483 already strips PUBLIC EXECUTE from future postgres-owned routines and the gate must respect that',
      caught
    );
  END IF;

  -- 6c. Invariant B is about writability, not readability.
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings
   WHERE invariant = 'B'
     AND object_signature = 'public.cf_acl_negative_select_only';
  IF caught <> 0 THEN
    RAISE EXCEPTION
      'OVER-FIRING (invariant B): a SELECT-only PUBLIC grant was reported as writable';
  END IF;

  -- ── Phase 7 — a trigger-returning definer IS flagged, and here is why ─────
  -- It is tempting to exclude `RETURNS trigger` routines from invariant A on
  -- the grounds that PostgreSQL refuses to invoke them directly. That refusal
  -- is real — asserted below on SQLSTATE 0A000 rather than on message text —
  -- but the exclusion is NOT taken. Reason: EXECUTE on a trigger function is
  -- checked when a trigger is CREATED, not when it fires, so PUBLIC EXECUTE on
  -- one is still a grant of something, and this programme has already been
  -- burned once by a carve-out that looked obviously safe. The routine is
  -- flagged; if it should not be, that is a ruling to make explicitly.
  BEGIN
    PERFORM public.cf_acl_negative_trigger_definer();
    trigger_state := 'invoked';
  EXCEPTION WHEN feature_not_supported THEN
    trigger_state := 'refused';
  END;
  IF trigger_state <> 'refused' THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'ASSUMPTION BROKEN: a RETURNS trigger routine was directly invocable (state=%s). The comment in invariant A about trigger functions no longer holds',
      trigger_state
    );
  END IF;

  SELECT count(*) INTO hidden_from
    FROM public_acl_capability_findings
   WHERE invariant = 'A'
     AND object_signature = 'public.cf_acl_negative_trigger_definer()';
  IF hidden_from <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'invariant A stopped flagging PUBLIC-executable trigger functions (%s findings). That is a scope reduction and needs a ruling, not a silent change',
      hidden_from
    );
  END IF;

  -- ── Deltas, so the proof does not depend on a clean database ──────────────
  SELECT count(*) INTO caught
    FROM public_acl_capability_findings WHERE invariant = 'A';
  IF caught <> b.invariant_a + 2 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'invariant A delta is %s, expected exactly +2 (one definer, one trigger definer)',
      caught - b.invariant_a
    );
  END IF;

  SELECT count(*) INTO caught
    FROM public_acl_capability_findings WHERE invariant = 'B';
  IF caught <> b.invariant_b + 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'invariant B delta is %s, expected exactly +1', caught - b.invariant_b
    );
  END IF;

  SELECT count(*) INTO caught
    FROM public_acl_capability_findings WHERE invariant = 'C';
  IF caught <> b.invariant_c + 1 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'invariant C delta is %s, expected exactly +1', caught - b.invariant_c
    );
  END IF;
END
$probe$;

\echo 'negative test phases 1-7: predicate detected the broken state in `public` and did not over-fire'

ROLLBACK;

-- ── Phase 8 — the rollback really happened and the predicate is back ────────
DO $recovery$
DECLARE
  b         record;
  leftovers integer;
  now_a     integer;
  now_b     integer;
  now_c     integer;
BEGIN
  SELECT * INTO b FROM cf_acl_negative_baseline;

  SELECT count(*) INTO leftovers
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
   WHERE (
           c.relname LIKE 'cf\_acl\_negative\_%'
           -- the baseline snapshot is this file's own bookkeeping, created
           -- before the transaction and expected to outlive it
           AND c.relname <> 'cf_acl_negative_baseline'
         )
      OR n.nspname = 'cf_acl_negative_unreachable';
  IF leftovers <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'NEGATIVE TEST LEAKED: %s probe object(s) survived the rollback', leftovers
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public_acl_exception_registry WHERE accepted_by = 'negative-test'
  ) THEN
    RAISE EXCEPTION
      'NEGATIVE TEST LEAKED: the phase 4 probe row is still in the registry';
  END IF;

  SELECT count(*) FILTER (WHERE invariant = 'A'),
         count(*) FILTER (WHERE invariant = 'B'),
         count(*) FILTER (WHERE invariant = 'C')
    INTO now_a, now_b, now_c
    FROM public_acl_capability_findings;

  IF (now_a, now_b, now_c) IS DISTINCT FROM
     (b.invariant_a, b.invariant_b, b.invariant_c) THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'NEGATIVE TEST MOVED THE BASELINE: A %s->%s, B %s->%s, C %s->%s',
      b.invariant_a, now_a, b.invariant_b, now_b, b.invariant_c, now_c
    );
  END IF;

  IF now_a + now_b + now_c > 0 THEN
    RAISE NOTICE
      'NOTE: the live database is at A=% B=% C=% — the negative test proves the predicate discriminates, NOT that the database is clean. The conformance gates are the ones that must reach zero',
      now_a, now_b, now_c;
  END IF;
END
$recovery$;

\echo 'edge_api/catalog_roles_remote_conformance_negative_test.sql: the conformance predicate FAILED against a deliberately broken `public` and recovered — the gate is not vacuous'
