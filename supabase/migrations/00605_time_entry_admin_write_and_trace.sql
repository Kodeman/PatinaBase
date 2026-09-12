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
-- ONE INTERACTION, STATED: the policy predicate below is the plan's — an
-- owner/admin of ANY studio the project's lead designer actively belongs to —
-- because §0.13 forbids keying a policy on projects.studio_id. 00601's own
-- refusal and 00599's caller assert key on the PROJECT's studio (HT-3-a). Where
-- those differ (an admin of a studio the designer belongs to that is not the
-- project's pricing studio), an adjust that re-fires the classifier — any UPDATE
-- of duration_minutes, billable, started_at, project_id, user_id or rate_role —
-- raises insufficient_privilege from the resolver rather than being denied by
-- RLS. That is a loud refusal, not a silent one, and narrowing the policy to the
-- pricing studio would breach §0.13.
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
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.organization_members om
        ON om.user_id = p.designer_id
       AND om.status = 'active'
      WHERE p.id = project_time_entries.project_id
        AND public.is_org_admin_or_owner(om.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.organization_members om
        ON om.user_id = p.designer_id
       AND om.status = 'active'
      WHERE p.id = project_time_entries.project_id
        AND public.is_org_admin_or_owner(om.organization_id)
    )
  );

DROP POLICY IF EXISTS time_entries_owner_admin_delete ON public.project_time_entries;
CREATE POLICY time_entries_owner_admin_delete ON public.project_time_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.organization_members om
        ON om.user_id = p.designer_id
       AND om.status = 'active'
      WHERE p.id = project_time_entries.project_id
        AND public.is_org_admin_or_owner(om.organization_id)
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
  LOOP
    ASSERT v_qual LIKE '%is_org_admin_or_owner%',
      '00605: the write widening must go through is_org_admin_or_owner (§0.14)';
    ASSERT v_qual NOT LIKE '%studio_id%',
      '00605: never key an RLS policy on projects.studio_id (§0.13, 00317:15-18)';
  END LOOP;

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
