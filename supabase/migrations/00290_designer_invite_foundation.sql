-- ═══════════════════════════════════════════════════════════════════════════
-- 00290 — Designer invite foundation (Designer Onboarding · Wave 1)
--
-- The admin onboarding flow (apps/admin-portal .../onboard/route.ts) has
-- never set profiles.is_designer — only 00030's one-time backfill ever wrote
-- that column, keyed off the now-defunct profiles.role text field. Since
-- 00286 gates the open design-request pool on profiles.is_designer, every
-- admin-onboarded designer since has been invisible to it. This migration:
--
--   1. fc_sync_is_designer_from_role() + trigger — AFTER INSERT ON
--      user_roles: when the granted role's domain (role_domain enum, 00021)
--      is 'designer' (independent_designer, studio_owner, studio_admin,
--      studio_designer — the four designer-domain roles per 00022's seed),
--      flip profiles.is_designer = true for that user. Keeps is_designer in
--      lockstep with role grants going forward, including the new
--      designer-invite edge function's user_roles insert.
--   2. Backfill: any user CURRENTLY holding a designer-domain role but with
--      is_designer IS NOT true gets it set now (covers every admin-onboarded
--      designer from before this migration, plus any other historic gap).
--   3. notification_preferences.type_onboarding — new toggle column for the
--      onboarding-lifecycle notifications the designer-invite edge function
--      and its Founding Invite sequence enrollment (rollout-gated — the
--      sequence row itself is seeded by a later wave) will drive.
--
-- New/redefined function is REVOKEd from PUBLIC, anon (trigger-only; nothing
-- calls it directly). search_path pinned per the 00286 convention
-- (public, pg_temp).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Trigger: user_roles insert → sync profiles.is_designer ──────────────
CREATE OR REPLACE FUNCTION public.fc_sync_is_designer_from_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_domain public.role_domain;
BEGIN
  SELECT r.domain INTO v_domain FROM public.roles r WHERE r.id = NEW.role_id;

  IF v_domain = 'designer' THEN
    UPDATE public.profiles
       SET is_designer = true
     WHERE id = NEW.user_id
       AND is_designer IS DISTINCT FROM true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fc_sync_is_designer_from_role() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS sync_is_designer_from_role ON public.user_roles;
CREATE TRIGGER sync_is_designer_from_role
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fc_sync_is_designer_from_role();

COMMENT ON FUNCTION public.fc_sync_is_designer_from_role() IS
  'Designer invite foundation (00290): on a user_roles grant whose role sits '
  'in the designer domain (role_domain enum — independent_designer, '
  'studio_owner, studio_admin, studio_designer per the 00022 seed), flips '
  'profiles.is_designer = true. Keeps the 00286 open design-request pool '
  'gate in sync with role grants, including admin onboarding.';

-- ── 2. Backfill existing designer-domain grantees ───────────────────────────
UPDATE public.profiles p
   SET is_designer = true
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
 WHERE ur.user_id = p.id
   AND r.domain = 'designer'
   AND p.is_designer IS DISTINCT FROM true;

-- ── 3. notification_preferences.type_onboarding ─────────────────────────────
-- Table (00040) already carries explicit RLS + grants from its creation
-- migration; a new column on an already-granted table needs no additional
-- GRANT (Postgres privileges are per-table, not per-column).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS type_onboarding BOOLEAN NOT NULL DEFAULT true;
