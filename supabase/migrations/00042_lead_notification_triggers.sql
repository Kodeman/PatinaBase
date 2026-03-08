-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Lead Notification Triggers
-- Description: Database triggers for lead notifications:
--   - New lead INSERT → notify assigned designer
--   - Consultation request INSERT → notify consumer with confirmation
--   Uses pg_net to invoke the notification-dispatch Edge Function.
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure pg_net is available for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY DESIGNER ON NEW LEAD
-- Fires when a new lead is inserted with a designer_id assigned
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_designer_new_lead()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_homeowner_name TEXT;
  v_request_id BIGINT;
BEGIN
  -- Only fire if designer is assigned
  IF NEW.designer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get homeowner display name
  SELECT COALESCE(display_name, email, 'A client')
  INTO v_homeowner_name
  FROM profiles
  WHERE id = NEW.homeowner_id;

  -- Get Supabase URL for Edge Function invocation
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- If settings not available, try env vars
  IF v_supabase_url IS NULL THEN
    v_supabase_url := COALESCE(
      current_setting('supabase.url', true),
      'https://api.patina.cloud'
    );
  END IF;

  -- Invoke notification-dispatch Edge Function via pg_net
  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/notification-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'user_id', NEW.designer_id,
        'type', 'new_lead_designer',
        'channel', 'email',
        'template_id', 'new-lead-designer',
        'data', jsonb_build_object(
          'clientName', v_homeowner_name,
          'projectType', NEW.project_type,
          'budgetRange', NEW.budget_range,
          'timeline', NEW.timeline,
          'locationCity', NEW.location_city,
          'locationState', NEW.location_state,
          'matchScore', NEW.match_score,
          'matchReasons', NEW.match_reasons,
          'leadId', NEW.id,
          'responseDeadline', NEW.response_deadline
        ),
        'priority', 'high'
      )
    ) INTO v_request_id;
  ELSE
    -- Log warning if we can't dispatch
    RAISE WARNING 'Cannot dispatch new lead notification: missing supabase_url or service_role_key';
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail lead creation if notification fails
  RAISE WARNING 'Failed to dispatch new lead notification for lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_lead_created_notify_designer
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION notify_designer_new_lead();

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY CONSUMER ON CONSULTATION REQUEST
-- Fires when a lead is created with a homeowner_id (consumer initiated)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_consumer_confirmation()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_designer_name TEXT;
  v_consumer_name TEXT;
  v_request_id BIGINT;
BEGIN
  -- Only fire if consumer is assigned
  IF NEW.homeowner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get names
  SELECT COALESCE(display_name, 'Your designer')
  INTO v_designer_name
  FROM profiles
  WHERE id = NEW.designer_id;

  SELECT COALESCE(display_name, 'there')
  INTO v_consumer_name
  FROM profiles
  WHERE id = NEW.homeowner_id;

  v_supabase_url := COALESCE(
    current_setting('app.settings.supabase_url', true),
    current_setting('supabase.url', true),
    'https://api.patina.cloud'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/notification-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'user_id', NEW.homeowner_id,
        'type', 'client_confirmation',
        'channel', 'email',
        'template_id', 'client-confirmation',
        'data', jsonb_build_object(
          'clientName', v_consumer_name,
          'designerName', v_designer_name,
          'projectType', NEW.project_type
        ),
        'priority', 'normal'
      )
    ) INTO v_request_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to dispatch consumer confirmation for lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_lead_created_notify_consumer
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION notify_consumer_confirmation();
