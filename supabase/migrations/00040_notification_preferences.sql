-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Notification Preferences
-- Description: Dedicated notification preferences table with channel toggles,
--              type toggles, digest frequency, quiet hours, and timezone.
--              Migrates existing user_settings notification data.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- DIGEST FREQUENCY ENUM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE digest_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'never');

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATION PREFERENCES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,

  -- Channel toggles
  channels_email BOOLEAN NOT NULL DEFAULT true,
  channels_push BOOLEAN NOT NULL DEFAULT true,
  channels_in_app BOOLEAN NOT NULL DEFAULT true,
  channels_sms BOOLEAN NOT NULL DEFAULT false,

  -- Lead management (designer)
  type_new_lead BOOLEAN NOT NULL DEFAULT true,
  type_lead_expiring BOOLEAN NOT NULL DEFAULT true,
  type_lead_response BOOLEAN NOT NULL DEFAULT true,

  -- Client communication
  type_client_message BOOLEAN NOT NULL DEFAULT true,
  type_project_milestone BOOLEAN NOT NULL DEFAULT true,
  type_commission_earned BOOLEAN NOT NULL DEFAULT true,

  -- Catalog intelligence
  type_new_products BOOLEAN NOT NULL DEFAULT true,
  type_teaching_reminder BOOLEAN NOT NULL DEFAULT true,

  -- Consumer notifications
  type_price_drop BOOLEAN NOT NULL DEFAULT true,
  type_back_in_stock BOOLEAN NOT NULL DEFAULT true,
  type_wishlist_update BOOLEAN NOT NULL DEFAULT true,

  -- Account & transactional (always on — enforced in app, not DB)
  type_account_security BOOLEAN NOT NULL DEFAULT true,
  type_order_confirmation BOOLEAN NOT NULL DEFAULT true,
  type_payment_receipt BOOLEAN NOT NULL DEFAULT true,

  -- Engagement & marketing
  type_weekly_inspiration BOOLEAN NOT NULL DEFAULT true,
  type_founding_circle BOOLEAN NOT NULL DEFAULT true,
  type_product_launch BOOLEAN NOT NULL DEFAULT true,
  type_seasonal_campaign BOOLEAN NOT NULL DEFAULT true,
  type_reengagement BOOLEAN NOT NULL DEFAULT true,

  -- Digest settings
  digest_frequency digest_frequency NOT NULL DEFAULT 'weekly',

  -- Quiet hours
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- AUTO-UPDATE TIMESTAMP
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read and write their own preferences
CREATE POLICY "Users can read own notification preferences" ON notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences" ON notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences" ON notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role has full access (for triggers and Edge Functions)
CREATE POLICY "Service role full access to notification preferences" ON notification_preferences
  FOR ALL USING (auth.uid() IS NULL);

-- Admins can read all preferences
CREATE POLICY "Admins can read all notification preferences" ON notification_preferences
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATE EXISTING USER SETTINGS
-- Map user_settings notification fields → notification_preferences
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO notification_preferences (user_id, channels_email, channels_push)
SELECT
  us.user_id,
  COALESCE(us.email_notifications, true),
  COALESCE(us.push_notifications, true)
FROM user_settings us
ON CONFLICT (user_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE handle_new_user TO AUTO-CREATE NOTIFICATION PREFERENCES
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

  -- Auto-create notification preferences with defaults
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail user creation
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
