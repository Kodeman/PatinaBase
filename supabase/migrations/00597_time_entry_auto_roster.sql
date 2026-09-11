-- ═══════════════════════════════════════════════════════════════════════════
-- 00597 — Auto-roster the logger: a seat on first log
--
-- HT-25 (RULED): a studio member who logs an hour on a project they are not
-- rostered to is seated as support_designer on first log; the seat is visible
-- on the roster and removable by the owner (project_team_members.removed_at).
--
-- Why this is a server-side trigger and not portal code:
--   · project_team_members is 00484-protected and its only registered policy is
--     a SELECT — no INSERT policy lets a member seat themselves.
--   · the roster role is a RATE-RESOLUTION input, not only an RLS gate: the
--     classifier reads project_team_members.role (00578:2709-2717) and an
--     un-rostered member collapses to v_team_role = NULL, skipping the role
--     branch entirely. The seat must exist before the classifier runs, so this
--     BEFORE INSERT trigger is named aaa0_ to sort ahead of 00412's aaa_/aab_/
--     aac_ family.
--
-- It never MANUFACTURES authorization. RLS WITH CHECK on project_time_entries
-- is evaluated after BEFORE-row triggers, and `Team can log their own time
-- entries` (00484) keys on is_project_team_member(project_id) — so a seat
-- written unconditionally would let a caller no policy admits insert by
-- virtue of the seat this trigger just gave them. The seat is therefore gated
-- on the same studio co-membership `time_entries_studio_insert_own`
-- (00316:242-246) already requires: own row + a studio co-member's project.
-- A NULL auth.uid() (migration / service-role context) bypasses the gate,
-- matching 00317:38-39's precedent.
--
-- The project's OWN designer is excluded outright — see the comment on the early
-- exit in the body. She is not the person HT-25 was written about.
--
-- Non-downgrade: a member who already holds ANY live seat (lead_designer,
-- bookkeeper, vendor …) is left alone. Re-seat after removal is DELIBERATE and
-- asserted in supabase/tests/rls/time_entry_auto_roster_test.sql: the owner's
-- removed_at is cleared on the member's next log (the UNIQUE
-- (project_id, user_id, role) triple forbids a second row, so the ON CONFLICT
-- arm is the only way to express a re-seat at all). That the owner's removal
-- does NOT stick is recorded as an owed ruling, HT-25-a, in
-- artifacts/hour-tracking-2026-09-11/rulings.md — not only in a test comment.
-- If it is ruled the other way, the fix is to delete the ON CONFLICT re-seat arm
-- and let the insert fail `Team can log their own time entries`.
--
-- Lineage: new function. REVOKE shape follows 00412:2385-2386 (trigger-only
-- functions are reachable from no caller).
--
-- Renumbered 00594 -> 00597 before merge: 00592-00594 were taken by the
-- people-room CRM program (branch build/people-room-crm-2026-09-11, commit
-- 1970075c2), cut from the same head 00591 on the same day. This program is
-- the undeployed side and so it moved (patina-db-migrations step 8).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.time_entry_auto_roster()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF NEW.project_id IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- The project's OWN designer is never seated. is_studio_comember's first branch
  -- is `p_owner = auth.uid()` (00556:59), so a solo designer logging on her own
  -- project passes the gate below, holds no roster row, and would be seated as
  -- `support_designer` on her own house — visible on v_project_roster (00419) and
  -- the Call Sheet. The seat buys nothing: the classifier already hard-codes
  -- lead_designer for the project designer (00578:2708-2710) and her RLS comes
  -- from `Designers manage their project time entries` (00177:136-137), not from
  -- is_project_team_member. HT-25 is about a studio member on a COLLEAGUE's
  -- project. Seating the designer at all would be a ruling, not a code choice,
  -- and it would have to be lead_designer.
  IF EXISTS (
    SELECT 1 FROM public.projects p
     WHERE p.id = NEW.project_id
       AND p.designer_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NOT NULL THEN
    IF NEW.user_id IS DISTINCT FROM v_actor THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = NEW.project_id
         AND public.is_studio_comember(p.designer_id)
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.project_team_members tm
     WHERE tm.project_id = NEW.project_id
       AND tm.user_id    = NEW.user_id
       AND tm.removed_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.project_team_members (project_id, user_id, role, assigned_by)
  VALUES (NEW.project_id, NEW.user_id, 'support_designer', NEW.user_id)
  ON CONFLICT (project_id, user_id, role) DO UPDATE
    SET removed_at  = NULL,
        assigned_at = now(),
        assigned_by = NEW.user_id,
        updated_at  = now();

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.time_entry_auto_roster()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.time_entry_auto_roster() IS
  'HT-25: seats the logger as support_designer on first log when they hold no '
  'live project_team_members row. Gated on the same studio co-membership the '
  'INSERT policies require, so the seat can never be the thing that authorizes '
  'the insert. The project''s own designer is never seated — she is already '
  'lead_designer to the classifier (00578:2708-2710) and her RLS does not come '
  'from the roster. A seat the owner removed IS re-seated on the next log '
  '(owed ruling HT-25-a).';

DROP TRIGGER IF EXISTS aaa0_time_entry_auto_roster_trg
  ON public.project_time_entries;
CREATE TRIGGER aaa0_time_entry_auto_roster_trg
BEFORE INSERT ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entry_auto_roster();

-- Postcondition: the trigger exists and fires before 00412's classifier
-- (PostgreSQL fires BEFORE-row triggers in name order).
DO $postcondition$
DECLARE
  v_first text;
BEGIN
  SELECT tgname INTO v_first
  FROM pg_trigger
  WHERE tgrelid = 'public.project_time_entries'::regclass
    AND NOT tgisinternal
    AND (tgtype & 4) <> 0   -- bit 2 = INSERT
    AND (tgtype & 2) <> 0   -- bit 1 = BEFORE
  ORDER BY tgname
  LIMIT 1;

  IF v_first IS DISTINCT FROM 'aaa0_time_entry_auto_roster_trg' THEN
    RAISE EXCEPTION
      'time-entry migration: the auto-roster trigger must fire first on INSERT, got %', v_first;
  END IF;
END
$postcondition$;

COMMIT;
