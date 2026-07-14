-- ═══════════════════════════════════════════════════════════════════════════
-- 00313 — handle_new_user honors a client role hint from signup metadata
--
-- Lineage: 00013 → 00023 → 00028 → 00039 → 00040 → 00126 → (this)
--   (grep -rln "CREATE OR REPLACE FUNCTION[^(]*handle_new_user" | sort | tail -1
--    == 00126_backfill_user_roles.sql; body grafted verbatim from there.)
--
-- Why: organic client (iOS) signups landed with profiles.role = 'designer' —
-- the legacy table default from 00013 — because the trigger never set a role.
-- That mis-classifies clients for flows that branch on profiles.role:
-- designer-onboarding automation (00050 "account_created where role='designer'"),
-- comms participant-role derivation (00103/00104), and funnel views (00038).
-- The Patina client app now stamps raw_user_meta_data.role = 'homeowner' on its
-- email/OTP/password signups; this trigger reads that hint and sets
-- profiles.role accordingly. When NO hint is present — the Field/designer app,
-- and OAuth (Apple/Google) signups that cannot pass creation metadata — the
-- previous default 'designer' is preserved, so NO existing designer flow
-- changes. (OAuth-client role correction is a separate client-side follow-on.)
--
-- Also: restores display_name capture (dropped in 00126) and pins search_path
-- (SECURITY DEFINER hygiene). Trigger-function only — no new GRANT/REVOKE, so
-- the legacy-grants seed does not need regeneration.
--
-- NOTE: numbered 00313 to skip 00312_reseed_remaining_email_templates_branded
-- which lives on the unmerged fix/client-portal-nav branch; renumber whichever
-- side merges second (per patina-db-migrations step 8).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_default_role_id UUID;
  v_role         TEXT;
  v_display_name TEXT;
BEGIN
  -- Role hint from signup metadata. SECURITY: raw_user_meta_data is
  -- CLIENT-CONTROLLED (set via signUp(data:) / signInWithOTP(data:)), so we
  -- must NOT trust an arbitrary value — a caller could otherwise self-assign
  -- 'admin'/'super_admin'. Only the single safe client value 'homeowner' is
  -- honored; anything else is ignored and falls through to the default below.
  -- (Elevated roles are granted exclusively server-side via user_roles / admin
  -- action, never from signup metadata.)
  v_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'homeowner' THEN 'homeowner'
    ELSE NULL
  END;

  -- Display name from metadata (email/password path sends display_name; other
  -- providers may send full_name). Nullable — never blocks signup.
  v_display_name := NULLIF(NEW.raw_user_meta_data->>'display_name', '');
  IF v_display_name IS NULL THEN
    v_display_name := NULLIF(NEW.raw_user_meta_data->>'full_name', '');
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    COALESCE(v_role, 'designer')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Default new signups to 'app_user' (consumer) in the authoritative
  -- user_roles table. Role can be elevated later by an admin or org flow.
  SELECT id INTO v_default_role_id FROM public.roles WHERE name = 'app_user' LIMIT 1;
  IF v_default_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_default_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
