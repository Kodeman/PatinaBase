-- ═══════════════════════════════════════════════════════════════════════════
-- 00611 — the hour may not be aimed at a studio the writer does not belong to
--         (HT-15, plan-v2 §5, §0.13)
--
-- 00610 made project_id nullable and gave the row its own studio_id. Without
-- this guard that column is a cross-studio WRITE hole: 00612's policies key on
-- it, so a member who can write her own row could point it at any organization
-- in the product and put an hour inside a studio she has nothing to do with —
-- and an owner/admin of that studio would then read it through
-- internal_time_owner_admin_read.
--
-- The guard REPLICATES 00317:31-47 in shape, deliberately, statement for
-- statement: the value is validated only when it is supplied; a NULL auth.uid()
-- (migration, cron, seed) and a service_role JWT bypass (00317:38-39); the
-- membership test is `status = 'active'` on organization_members, written INLINE
-- as 00317 writes it rather than through a helper. §0.13 admits
-- project_time_entries.studio_id as a policy key on exactly this condition, so
-- the shape is the thing being replicated and not only the effect.
--
-- ONE DELIBERATE DIFFERENCE from 00317, named here so a later hand does not
-- "fix" it: 00317 validates the membership of the PROJECT'S LEAD DESIGNER
-- (NEW.designer_id), because a project is aimed at a studio on her behalf. An
-- hour is aimed by whoever is writing it, so the seat tested here is the
-- ACTOR's — auth.uid(). The narrower leg (role <> 'guest') is not duplicated
-- here either: it lives in 00612's policies, through
-- is_active_studio_member(studio_id), which is what a guest is actually refused
-- by. This trigger's job is the anti-aiming assert, not the authorization.
--
-- Trigger name: aaa1_time_entry_studio_id_guard_trg. BEFORE-row triggers fire in
-- name order, and two orderings are already asserted on this table — 00597's
-- postcondition requires aaa0_time_entry_auto_roster_trg to be FIRST on INSERT,
-- and 00605's requires zzz_stamp_time_entry_updated_by_trg to be LAST among the
-- BEFORE UPDATE triggers. `aaa1_` sits between aaa0_ and aaa_guard_, so both
-- hold; the postcondition below re-measures them rather than reasoning about
-- collation.
--
-- Lineage: NEW function, NEW trigger. Nothing is redefined.
-- P-4: no row is touched.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_time_entry_studio_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.studio_id IS NOT NULL
     AND (select auth.uid()) IS NOT NULL
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.organization_members om
       WHERE om.organization_id = NEW.studio_id
         AND om.user_id         = (select auth.uid())
         AND om.status          = 'active'
     ) THEN
    RAISE EXCEPTION 'time_entry_studio_id_not_member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function needs no EXECUTE at fire time (Postgres checks the
-- privilege at CREATE TRIGGER) — 00597's, 00603's and 00605's precedent.
REVOKE ALL ON FUNCTION public.guard_time_entry_studio_id()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_time_entry_studio_id() IS
  'HT-15 / §0.13: refuses a project_time_entries.studio_id aimed at an '
  'organization the WRITER holds no active seat in — the anti-aiming assert '
  '00317:31-47 makes for projects.studio_id, replicated in shape so that '
  '00612''s policies may key on this column. Supplied values only; a NULL '
  'auth.uid() (migration, cron, seed) and a service_role JWT bypass, as '
  '00317:38-39 does. The guest refusal is 00612''s, through '
  'is_active_studio_member.';

DROP TRIGGER IF EXISTS aaa1_time_entry_studio_id_guard_trg
  ON public.project_time_entries;
CREATE TRIGGER aaa1_time_entry_studio_id_guard_trg
BEFORE INSERT OR UPDATE OF studio_id ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_studio_id();

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_first text;
  v_last  text;
BEGIN
  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.guard_time_entry_studio_id()')),
    '00611: the guard must be SECURITY DEFINER — it reads organization_members, '
    'which an INVOKER read would return a PARTIAL set of, turning "not a member" '
    'into a refusal for a member whose own seat row RLS hides from her';

  ASSERT (
    SELECT prosrc LIKE '%service_role%' AND prosrc LIKE '%auth.uid()%'
    FROM pg_proc WHERE oid = to_regprocedure('public.guard_time_entry_studio_id()')
  ), '00611: 00317:38-39''s two bypasses (NULL auth.uid(), service_role) must be '
     'present, or every migration and cron write of studio_id raises';

  ASSERT 1 = (
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal
      AND tgname = 'aaa1_time_entry_studio_id_guard_trg'
      AND tgenabled = 'O'
  ), '00611: the studio_id guard trigger is missing or disabled';

  -- The trigger must watch studio_id on UPDATE, or a repoint is unguarded
  -- (§0.8's lesson, applied to a one-column list).
  ASSERT (
    SELECT pg_get_triggerdef(oid) LIKE '%UPDATE OF studio_id%'
    FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND tgname = 'aaa1_time_entry_studio_id_guard_trg'
  ), '00611: the guard must fire on UPDATE OF studio_id as well as INSERT — an '
     'INSERT-only guard leaves the repoint primitive open';

  -- The two orderings other migrations already assert, re-measured here.
  SELECT tgname INTO v_first FROM pg_trigger
  WHERE tgrelid = 'public.project_time_entries'::regclass
    AND NOT tgisinternal
    AND (tgtype & 4) <> 0 AND (tgtype & 2) <> 0   -- BEFORE INSERT
  ORDER BY tgname LIMIT 1;
  ASSERT v_first = 'aaa0_time_entry_auto_roster_trg',
    '00611: the auto-roster trigger must still fire first on INSERT (00597''s '
    'postcondition); got ' || COALESCE(v_first, 'NULL');

  SELECT tgname INTO v_last FROM pg_trigger
  WHERE tgrelid = 'public.project_time_entries'::regclass
    AND NOT tgisinternal
    AND (tgtype & 2) = 2 AND (tgtype & 16) = 16   -- BEFORE UPDATE
  ORDER BY tgname DESC LIMIT 1;
  ASSERT v_last = 'zzz_stamp_time_entry_updated_by_trg',
    '00611: the updated_by stamp must still fire last among the BEFORE UPDATE '
    'triggers (00605''s postcondition); got ' || COALESCE(v_last, 'NULL');

  RAISE NOTICE '00611 postconditions passed.';
END
$postcondition$;

COMMIT;
