-- ═══════════════════════════════════════════════════════════════════════════
-- 00605 — the owner/admin may fix a member's hour, and every edit leaves a
--         trace
--
-- HT-22 (RULED recommendation, plan-v2 §3): exactly ONE write widening on
-- project_time_entries — an owner/admin UPDATE + DELETE through
-- `is_org_admin_or_owner`, audited. HT-23: edits leave a trace (`updated_by`
-- plus one audit row). No approval column, no state machine, no second lock.
--
-- WHY THE TRIGGER IS SECURITY DEFINER (§0.18, and risk 4 of plan-v2 §12):
-- public.audit_logs has RLS ENABLED (00021:261) and carries only two SELECT
-- policies (00021:423, :426) — there is NO INSERT policy, and the one existing
-- writer in the product is inside a SECURITY DEFINER RPC (00399:468-476). An
-- INVOKER trigger would therefore fail the audit insert and roll back the
-- admin's adjust with it: the trace would take the correction down. The test
-- asserts the adjust and the audit row TOGETHER, so a DEFINER regression fails a
-- gate instead of a user.
--
-- WHAT IS NOT TOUCHED:
--   · `guard_invoiced_time_entry` (00177:51-84) — the invoiced-entry lock. It
--     still refuses a DELETE of an invoiced row and still freezes the eight
--     columns once invoice_id is set, for the owner/admin as for anyone else
--     (§0.12). No second lock is built.
--   · the four 00484-registered "Team can …" policy names (§0.17). This file
--     adds two NEW names and a column.
--   · `Designers manage their project time entries` (00177:136-137).
--
-- THE KEY IS THE STUDIO THAT OWNS THE WORK, NOT THE DESIGNER'S MEMBERSHIP SET
-- (amended in W2 review round 1, finding B1 — measured, not argued):
-- plan-v2 §3 wrote these policies as "an owner/admin of ANY studio the project's
-- designer actively belongs to". That predicate is SELF-GRANTABLE. The attacker
-- controls its set: `Org owners can insert members` (00484-registered) has
-- WITH CHECK (is_org_admin_or_owner(organization_id) AND role <> 'owner'), no
-- consent gate, and organization_members.status DEFAULTs to 'active' — so any
-- authenticated person who owns any organization, which is the ordinary state of
-- every Patina designer, seats a victim project's designer in her own studio with
-- ONE INSERT and thereby reads, adjusts and DELETEs that project's hours. That
-- reopens W1-R10-03 (a colleague's notes and per-person studio rate, the leak
-- 00606 exists to close) and makes HT-10/HT-10-a's narrowing reversible at will.
-- Measured on this program's stack before the amendment: attacker reads 0 rows,
-- writes one organization_members row, reads the teammate's notes + 22500 /
-- studio_member, and deletes the hour.
--
-- So all three new policies (the two here and 00606's read) key on
-- `is_org_admin_or_owner(project_pricing_studio_id(project_id))` — 00604's one
-- callable form of HT-3-a/b. Three consequences, stated here rather than
-- discovered later:
--   (i) §0.13 is honoured, and deliberately read rather than recited. §0.13
--       forbids the projects.studio_id COLUMN as a policy key because a legacy
--       NULL WIDENS visibility (00317:15-18). Here a NULL resolves to
--       is_org_admin_or_owner(NULL), which is FALSE (00484:604-623 — the EXISTS
--       finds no membership for a NULL organization_id), so the same legacy row
--       fails CLOSED. That is the safe direction, and §0.13 already admits a
--       policy key whose guard replicates 00317:31-47's anti-aiming assert.
--  (ii) The trade: the owner of a legacy project whose studio_id is NULL and
--       whose designer's tier is ambiguous loses her studio read until she stamps
--       the project — which is exactly the repair HT-3-a step 3 already asks of
--       her ('rate pending', fixed by naming the studio).
-- (iii) RLS and the resolver now key on the SAME studio, so the divergence this
--       banner previously described (an adjust the policy allowed and 00601's
--       resolver then refused with insufficient_privilege) no longer exists.
--
-- Residue, flagged rather than implied: on a legacy studio_id IS NULL project
-- whose designer holds NO employer seat anywhere (a sole proprietor), the seat an
-- attacker writes becomes that designer's single EMPLOYER-tier candidate and
-- therefore the pricing studio — the same W1 pricing residue already pinned in
-- 00599's banner and in time_rate_resolution_test.sql cases (ad-i)/(ad-ii)/(af).
-- After this amendment the read/write half is no longer a SECOND surface: it is
-- coextensive with that one W1 residue, which the orchestrator owns. Closing it
-- outright means keying on step 1 alone, which costs every legacy NULL-studio
-- owner her studio read — a ruling, not a fix.
--
-- An admin INSERT on a member's behalf is deliberately NOT granted here (the
-- widening is UPDATE + DELETE only). plan-v2 §3's closing note is the reason:
-- 00597's auto-roster seat gates on `NEW.user_id = auth.uid()`, so a row an
-- admin inserted FOR a member seats nobody and resolves no role rate at all.
-- Such a path must seat the member deliberately, in the same statement.
--
-- Lineage: NEW column, NEW policies, NEW functions and triggers. Nothing is
-- redefined. P-4: no existing row is rewritten; `updated_by` lands NULL on
-- every row that exists and is stamped from the first edit onward.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) the trace column ───────────────────────────────────────────────────
ALTER TABLE public.project_time_entries
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.project_time_entries.updated_by IS
  'HT-23: the actor of the most recent UPDATE (auth.uid()), stamped by '
  'zzz_stamp_time_entry_updated_by_trg. NULL means no edit since 00605 — a '
  'server-side write (cron, migration, service_role) leaves the previous value '
  'standing rather than blanking it.';

CREATE OR REPLACE FUNCTION public.stamp_time_entry_updated_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only a real actor stamps. A NULL auth.uid() is a migration / cron /
  -- service_role write: it must not overwrite the last human with a NULL.
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_time_entry_updated_by() IS
  'HT-23: stamps project_time_entries.updated_by with auth.uid() on every '
  'UPDATE by a real actor. INVOKER — it writes only NEW and reads only '
  'auth.uid(). Named to fire LAST among the BEFORE UPDATE triggers, after '
  '00412/00601''s guard and classifier family have had their say.';

DROP TRIGGER IF EXISTS zzz_stamp_time_entry_updated_by_trg ON public.project_time_entries;
CREATE TRIGGER zzz_stamp_time_entry_updated_by_trg
BEFORE UPDATE ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.stamp_time_entry_updated_by();

-- ── (2) the audit row ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_time_entry_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org     uuid;
  v_action  text;
  v_new     jsonb;
BEGIN
  -- NEW is UNASSIGNED in a plpgsql DELETE trigger — reading NEW.anything there
  -- raises, so the two operations are separated rather than COALESCEd.
  IF TG_OP = 'DELETE' THEN
    v_action := 'time_entry.deleted';
    v_new    := NULL;
  ELSE
    v_action := 'time_entry.updated';
    v_new    := to_jsonb(NEW);
  END IF;

  -- The organization on the trace is the studio that PRICES the work (HT-3-a/b,
  -- through 00604's one callable form), so an owner reading
  -- "Org admins can view org audit logs" (00021:423) sees the edits to her own
  -- studio's hours. NULL is permitted by the column and means no studio prices
  -- this project yet ('rate pending').
  v_org := public.project_pricing_studio_id(OLD.project_id);

  INSERT INTO public.audit_logs (
    user_id, organization_id, action, resource_type, resource_id,
    old_values, new_values
  ) VALUES (
    auth.uid(),
    v_org,
    v_action,
    'project_time_entries',
    OLD.id,
    to_jsonb(OLD),
    v_new
  );

  RETURN NULL;  -- AFTER trigger; the return value is ignored
END;
$$;

-- A trigger function needs no EXECUTE at fire time (Postgres checks the
-- privilege at CREATE TRIGGER) — 00597's and 00603's precedent in this program.
REVOKE ALL ON FUNCTION public.audit_time_entry_change()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.audit_time_entry_change() IS
  'HT-23: writes ONE public.audit_logs row per UPDATE or DELETE of a time '
  'entry, carrying old_values and (for an update) new_values, the actor, and the '
  'studio that prices the work. SECURITY DEFINER because audit_logs has RLS '
  'enabled with no INSERT policy (00021:261, :423, :426) — an INVOKER trigger '
  'would roll the edit back along with its own trace (§0.18).';

DROP TRIGGER IF EXISTS zzzz_audit_time_entry_change_trg ON public.project_time_entries;
CREATE TRIGGER zzzz_audit_time_entry_change_trg
AFTER UPDATE OR DELETE ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.audit_time_entry_change();

-- ── (3) the one write widening (HT-22) ─────────────────────────────────────
DROP POLICY IF EXISTS time_entries_owner_admin_update ON public.project_time_entries;
CREATE POLICY time_entries_owner_admin_update ON public.project_time_entries
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_owner(
      public.project_pricing_studio_id(project_time_entries.project_id)
    )
  )
  WITH CHECK (
    public.is_org_admin_or_owner(
      public.project_pricing_studio_id(project_time_entries.project_id)
    )
  );

DROP POLICY IF EXISTS time_entries_owner_admin_delete ON public.project_time_entries;
CREATE POLICY time_entries_owner_admin_delete ON public.project_time_entries
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin_or_owner(
      public.project_pricing_studio_id(project_time_entries.project_id)
    )
  );

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_qual text;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_time_entries'
      AND column_name = 'updated_by'
  ), '00605: project_time_entries.updated_by is missing';

  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.audit_time_entry_change()')),
    '00605: audit_time_entry_change MUST be SECURITY DEFINER — audit_logs has '
    'RLS with no INSERT policy, so an INVOKER trigger rolls back the admin''s '
    'adjust along with the trace (§0.18, risk 4)';

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.audit_logs'::regclass
      AND polcmd IN ('a', '*')
  ), '00605: audit_logs grew an INSERT policy — the DEFINER trigger''s whole '
     'justification has changed and §0.18 must be re-read before this file is '
     'trusted';

  ASSERT 1 = (
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal
      AND tgname = 'zzzz_audit_time_entry_change_trg'
  ), '00605: the audit trigger is missing';

  ASSERT 1 = (
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal
      AND tgname = 'zzz_stamp_time_entry_updated_by_trg'
  ), '00605: the updated_by stamp trigger is missing';

  -- The stamp must be the LAST before-update trigger: triggers on one event fire
  -- in tgname order, and the guards must refuse before the trace is written.
  ASSERT 'zzz_stamp_time_entry_updated_by_trg' = (
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal
      AND (tgtype & 2) = 2          -- BEFORE
      AND (tgtype & 16) = 16        -- UPDATE
    ORDER BY tgname DESC
    LIMIT 1
  ), '00605: the updated_by stamp must fire last among the BEFORE UPDATE '
     'triggers, after 00412/00601''s guard and classifier family';

  -- The two new policy names exist, are permissive, and are scoped to
  -- authenticated. Their qual is is_org_admin_or_owner-bearing, never
  -- projects.studio_id (§0.13).
  FOR v_qual IN
    SELECT pg_get_expr(polqual, polrelid, false)
    FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN ('time_entries_owner_admin_update', 'time_entries_owner_admin_delete')
    UNION ALL
    SELECT pg_get_expr(polwithcheck, polrelid, false)
    FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname = 'time_entries_owner_admin_update'
  LOOP
    ASSERT v_qual LIKE '%is_org_admin_or_owner%',
      '00605: the write widening must go through is_org_admin_or_owner (§0.14)';
    ASSERT v_qual LIKE '%project_pricing_studio_id%',
      '00605: the write widening keys on the studio that PRICES the work '
      '(HT-3-a, through 00604''s callable form), never on the designer''s '
      'membership set — keyed the other way one organization_members INSERT buys '
      'an outsider the studio''s hours (review round 1, finding B1); qual = '
      || v_qual;
    ASSERT regexp_replace(v_qual, 'project_pricing_studio_id', '', 'g')
             NOT LIKE '%studio_id%',
      '00605: never key an RLS policy on the projects.studio_id COLUMN (§0.13, '
      '00317:15-18) — a legacy NULL there WIDENS visibility, whereas '
      'is_org_admin_or_owner(project_pricing_studio_id(...)) = false on NULL and '
      'so fails closed; qual = ' || v_qual;
  END LOOP;

  -- The fail-closed direction is the whole reason §0.13 permits this key, so it
  -- is measured rather than asserted-about: no studio, no studio-wide access.
  -- A real actor is impersonated for the duration (auth.uid() must be NOT NULL or
  -- is_org_admin_or_owner's first conjunct answers and the EXISTS half — the half
  -- that could regress — is never reached). set_config is LOCAL and reverts at
  -- this migration's COMMIT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', pg_catalog.gen_random_uuid()::text,
                      'role', 'authenticated')::text, true);
  ASSERT auth.uid() IS NOT NULL, '00605: the impersonation above did not take';
  ASSERT NOT COALESCE(public.is_org_admin_or_owner(NULL), false),
    '00605: is_org_admin_or_owner(NULL) must be FALSE for a real actor — that is '
    'what makes a NULL pricing studio (a legacy unstamped project, or an '
    'ambiguous designer tier) fail CLOSED instead of widening the way the '
    'projects.studio_id column would (§0.13)';
  PERFORM set_config('request.jwt.claims', NULL, true);

  ASSERT 2 = (
    SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.project_time_entries'::regclass
      AND polname IN ('time_entries_owner_admin_update', 'time_entries_owner_admin_delete')
      AND polpermissive
      AND polroles = ARRAY[to_regrole('authenticated')::oid]
  ), '00605: both new write policies must exist, permissive, TO authenticated';

  -- The invoiced lock is untouched (§0.12).
  ASSERT 1 = (
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.project_time_entries'::regclass
      AND NOT tgisinternal
      AND tgname = 'guard_invoiced_time_entry'
  ), '00605: the invoiced-entry lock must still be in place (§0.12)';

  RAISE NOTICE '00605 postconditions passed.';
END
$postcondition$;

COMMIT;
