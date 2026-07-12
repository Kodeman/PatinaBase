-- ═══════════════════════════════════════════════════════════════════════════
-- 00295 — Studio workspace provisioning (RPCs, auto-provision trigger, backfill)
--
-- The Patina Field iOS app gates entry on a "workspace" = an `organizations`
-- row + the caller's `organization_members` row. In prod both tables are empty
-- and no code path writes them, so every designer dead-ends at
-- "No workspace found for your account." The 00021 schema + the 12 React Query
-- hooks in `use-organizations.ts` exist, but three of them are provably broken
-- under RLS (the members-only SELECT policy filters the INSERT ... RETURNING
-- before the membership exists; there is no self-accept UPDATE policy; no
-- self-DELETE policy). This migration delivers the durable fix:
--
--   • generate_unique_org_slug(text) — internal slug helper (loop -2,-3… on EXISTS)
--   • _provision_studio(uuid, text)  — internal: org + owner membership, returns row
--   • create_studio_workspace(text)  — authenticated RPC (fixes the RLS
--       chicken-and-egg for the portal empty state)
--   • accept_workspace_invitation(text)  — authenticated RPC (self-accept)
--   • decline_workspace_invitation(text) — authenticated RPC (self-decline)
--   • fc_provision_studio_on_designer() + trigger provision_studio_on_designer —
--       auto-create "«derived name»" studio when is_designer flips true and the
--       user has NO membership (any status). On `profiles` (not `user_roles`) so
--       it catches both a future role-grant path and any direct profiles upsert;
--       the any-status membership guard is what suppresses a personal studio for
--       invited teammates (their membership row is inserted BEFORE the
--       designer-role grant flips is_designer).
--   • one-time backfill DO-block — a studio for every is_designer=true user with
--       zero memberships (prod: exactly one, kody@kochaver.com; local: no-op at
--       replay since seeds load after migrations).
--   • two RLS policies — invited-visibility on organizations, self-leave on
--       organization_members.
--
-- All new functions are SECURITY DEFINER with a pinned search_path (they run as
-- owner, so RLS is bypassed for the org/membership writes). Internal helpers are
-- REVOKEd from every caller; the three public RPCs are GRANTed to authenticated.
--
-- Depends only on: 00013/00016 (profiles.email/display_name/business_name/
-- full_name), 00030 (profiles.is_designer), 00021 (organizations /
-- organization_members schema + enums), 00068 (is_org_admin_or_owner). It does
-- NOT depend on any 00290+ migration.
--
-- New objects → explicit grants in-file (post-2026-05-30 default flip).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── generate_unique_org_slug (internal) ─────────────────────────────────────
-- Slugify p_name (lowercase, non-alphanumeric runs → '-', trimmed), fall back to
-- 'studio', then append -2,-3… until the slug is free in organizations.slug.
CREATE OR REPLACE FUNCTION public.generate_unique_org_slug(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base text;
  v_slug text;
  v_n    integer := 1;
BEGIN
  v_base := regexp_replace(lower(trim(coalesce(p_name, ''))), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  IF v_base IS NULL OR v_base = '' THEN
    v_base := 'studio';
  END IF;
  -- slug column is VARCHAR(100); keep headroom for the numeric suffix.
  v_base := left(v_base, 80);

  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations o WHERE o.slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  END LOOP;

  RETURN v_slug;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_unique_org_slug(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.generate_unique_org_slug(text) IS
  'Internal helper: deterministic unique slug for a new organization. Not for '
  'direct callers — invoked only by _provision_studio (SECURITY DEFINER).';

-- ── _provision_studio (internal) ────────────────────────────────────────────
-- Insert a design_studio org (unique slug, active) + an active owner membership
-- for p_user_id, and return the org row.
CREATE OR REPLACE FUNCTION public._provision_studio(p_user_id uuid, p_name text)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_org  public.organizations;
BEGIN
  v_slug := public.generate_unique_org_slug(p_name);

  INSERT INTO public.organizations (type, name, slug, status)
  VALUES ('design_studio', left(p_name, 255), v_slug, 'active')
  RETURNING * INTO v_org;

  INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
  VALUES (p_user_id, v_org.id, 'owner', 'active', now());

  RETURN v_org;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._provision_studio(uuid, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._provision_studio(uuid, text) IS
  'Internal helper: create a design_studio organization + active owner '
  'membership for p_user_id, returning the org row. Not for direct callers — '
  'invoked by create_studio_workspace, the provision trigger, and the backfill.';

-- ── create_studio_workspace (public RPC) ────────────────────────────────────
-- Authenticated entry point for the portal empty state. Bypasses the RLS
-- chicken-and-egg (a client-side INSERT ... RETURNING is filtered by the
-- members-only SELECT policy before the membership row exists).
CREATE OR REPLACE FUNCTION public.create_studio_workspace(p_name text)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
  v_org  public.organizations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;

  v_name := NULLIF(trim(coalesce(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'invalid_name' USING DETAIL = 'studio name is required';
  END IF;

  v_org := public._provision_studio(v_uid, v_name);
  RETURN v_org;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_studio_workspace(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_studio_workspace(text) TO authenticated;

COMMENT ON FUNCTION public.create_studio_workspace(text) IS
  'Create a studio workspace (org + active owner membership) for the calling '
  'authenticated user and return the org row.';

-- ── accept_workspace_invitation (public RPC) ────────────────────────────────
-- Validate that the invited membership row is the caller''s, unexpired, and
-- still `invited`; flip it to active and null the token/expiry; return the org.
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_token text)
RETURNS TABLE(organization_id uuid, organization_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_member_id uuid;
  v_org_id    uuid;
  v_org_name  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'invalid_token' USING DETAIL = 'token is required';
  END IF;

  SELECT m.id, m.organization_id
    INTO v_member_id, v_org_id
  FROM public.organization_members m
  WHERE m.invitation_token = p_token
    AND m.status = 'invited'
    AND m.user_id = v_uid
    AND (m.invitation_expires_at IS NULL OR m.invitation_expires_at > now());

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'invitation_invalid_or_expired'
      USING DETAIL = 'token not found, not invited, expired, or not yours';
  END IF;

  UPDATE public.organization_members
  SET status                = 'active',
      joined_at             = COALESCE(joined_at, now()),
      invitation_token      = NULL,
      invitation_expires_at = NULL,
      updated_at            = now()
  WHERE id = v_member_id;

  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id;

  RETURN QUERY SELECT v_org_id, v_org_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_workspace_invitation(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;

COMMENT ON FUNCTION public.accept_workspace_invitation(text) IS
  'Accept a workspace invitation by token: validates ownership/status/expiry, '
  'flips the membership to active, nulls the token/expiry, returns org id+name.';

-- ── decline_workspace_invitation (public RPC) ───────────────────────────────
-- Same validation as accept; deletes the invited membership row.
CREATE OR REPLACE FUNCTION public.decline_workspace_invitation(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_member_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'invalid_token' USING DETAIL = 'token is required';
  END IF;

  SELECT m.id
    INTO v_member_id
  FROM public.organization_members m
  WHERE m.invitation_token = p_token
    AND m.status = 'invited'
    AND m.user_id = v_uid
    AND (m.invitation_expires_at IS NULL OR m.invitation_expires_at > now());

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'invitation_invalid_or_expired'
      USING DETAIL = 'token not found, not invited, expired, or not yours';
  END IF;

  DELETE FROM public.organization_members WHERE id = v_member_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_workspace_invitation(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decline_workspace_invitation(text) TO authenticated;

COMMENT ON FUNCTION public.decline_workspace_invitation(text) IS
  'Decline a workspace invitation by token (same validation as accept): '
  'deletes the invited membership row.';

-- ── fc_provision_studio_on_designer() + trigger ─────────────────────────────
-- Auto-provision a personal studio the moment a profile becomes a designer,
-- UNLESS the user already belongs to any organization (any status). The
-- any-status guard is load-bearing: an invite inserts the membership row BEFORE
-- granting the designer role, so invited teammates never get a spurious studio.
CREATE OR REPLACE FUNCTION public.fc_provision_studio_on_designer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.organization_members m WHERE m.user_id = NEW.id
  ) THEN
    RETURN NEW;  -- already has a workspace (any status) — do nothing
  END IF;

  v_name := COALESCE(
    NULLIF(trim(NEW.business_name), ''),
    NULLIF(trim(NEW.display_name),  ''),
    NULLIF(trim(NEW.full_name),     ''),
    NULLIF(trim(split_part(NEW.email, '@', 1)), ''),
    'My Studio'
  );

  PERFORM public._provision_studio(NEW.id, v_name);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fc_provision_studio_on_designer() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fc_provision_studio_on_designer() IS
  'Trigger fn: on a profile becoming is_designer=true with no membership, '
  'provision a personal studio. Any-status membership guard suppresses this for '
  'invited teammates (membership inserted before the role grant).';

DROP TRIGGER IF EXISTS provision_studio_on_designer ON public.profiles;
CREATE TRIGGER provision_studio_on_designer
  AFTER INSERT OR UPDATE OF is_designer ON public.profiles
  FOR EACH ROW
  WHEN (NEW.is_designer IS TRUE)
  EXECUTE FUNCTION public.fc_provision_studio_on_designer();

-- ── One-time backfill ───────────────────────────────────────────────────────
-- A studio for every existing designer with zero memberships. Idempotent:
-- re-running finds nobody (they now have a membership). No-op on a fresh local
-- reset (profiles is empty until the seeds run, after migrations).
DO $backfill$
DECLARE
  r      RECORD;
  v_name text;
BEGIN
  FOR r IN
    SELECT p.id, p.business_name, p.display_name, p.full_name, p.email
    FROM public.profiles p
    WHERE p.is_designer IS TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_members m WHERE m.user_id = p.id
      )
  LOOP
    v_name := COALESCE(
      NULLIF(trim(r.business_name), ''),
      NULLIF(trim(r.display_name),  ''),
      NULLIF(trim(r.full_name),     ''),
      NULLIF(trim(split_part(r.email, '@', 1)), ''),
      'My Studio'
    );
    PERFORM public._provision_studio(r.id, v_name);
  END LOOP;
END
$backfill$;

-- ── RLS additions ───────────────────────────────────────────────────────────
-- Invited members must be able to see the org they were invited to (the 00021
-- "Org members can view organization" policy requires an *active* membership,
-- so usePendingInvitations can't render the org name). Non-recursive.
DROP POLICY IF EXISTS "Invited members can view their pending org" ON public.organizations;
CREATE POLICY "Invited members can view their pending org" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = auth.uid()
        AND m.status = 'invited'
    )
  );

-- A member can remove their own membership (leave). Last-owner protection is a
-- UI/hook responsibility (no DB constraint).
DROP POLICY IF EXISTS "Members can leave" ON public.organization_members;
CREATE POLICY "Members can leave" ON public.organization_members
  FOR DELETE USING (user_id = auth.uid());
