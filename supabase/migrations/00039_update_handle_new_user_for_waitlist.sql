-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Update handle_new_user for Waitlist Integration
-- Description: Merges all previous handle_new_user behaviors:
--   - 00013: Basic profile creation (id, email)
--   - 00023: Role assignment (user_roles with app_user default)
--   - 00028: Error handling, display_name from metadata, ON CONFLICT UPDATE
--   + NEW: Waitlist → profile data sync, mark waitlist as converted
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_default_role_id UUID;
  v_waitlist_record RECORD;
BEGIN
  -- Look up waitlist entry for this email
  SELECT
    source,
    posthog_distinct_id,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    created_at AS waitlist_created_at
  INTO v_waitlist_record
  FROM waitlist
  WHERE email = NEW.email
  LIMIT 1;

  -- Insert or update profile (from 00028: ON CONFLICT UPDATE + display_name)
  -- Enhanced with waitlist attribution data
  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    original_source,
    original_utm,
    posthog_distinct_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name'
    ),
    COALESCE(v_waitlist_record.source, 'direct'),
    CASE
      WHEN v_waitlist_record.utm_source IS NOT NULL THEN
        jsonb_build_object(
          'utm_source', v_waitlist_record.utm_source,
          'utm_medium', v_waitlist_record.utm_medium,
          'utm_campaign', v_waitlist_record.utm_campaign,
          'utm_content', v_waitlist_record.utm_content,
          'utm_term', v_waitlist_record.utm_term
        )
      ELSE NULL
    END,
    v_waitlist_record.posthog_distinct_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    original_source = COALESCE(EXCLUDED.original_source, profiles.original_source),
    original_utm = COALESCE(EXCLUDED.original_utm, profiles.original_utm),
    posthog_distinct_id = COALESCE(EXCLUDED.posthog_distinct_id, profiles.posthog_distinct_id),
    updated_at = NOW();

  -- Assign default role (from 00023: app_user role assignment)
  SELECT id INTO v_default_role_id FROM roles WHERE name = 'app_user';

  IF v_default_role_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id)
    VALUES (NEW.id, v_default_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  -- Mark waitlist entry as converted
  IF v_waitlist_record.source IS NOT NULL THEN
    UPDATE waitlist
    SET
      auth_user_id = NEW.id,
      converted_at = NOW(),
      updated_at = NOW()
    WHERE email = NEW.email;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- From 00028: Log error but don't fail user creation
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
