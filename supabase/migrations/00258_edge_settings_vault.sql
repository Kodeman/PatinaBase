-- =============================================================================
-- 00258 — Edge-call settings move from GUCs to Vault (managed-Postgres compat)
-- =============================================================================
-- Supabase Cloud denies ALTER DATABASE/ROLE ... SET for custom GUCs, so the
-- app.settings.* parameters that invoke_edge_function and the notify_* triggers
-- read can never be set there — every cron->edge and trigger->edge call would
-- silently no-op (the exact failure mode of the old stale-GUC prod bug).
--
-- public.app_setting(name) reads Vault first (secret 'app.settings.<name>',
-- provisioned at deploy time — values never live in git) and falls back to the
-- GUC for local/self-hosted stacks. The five reader functions are re-created
-- verbatim except current_setting('app.settings.X', true) -> app_setting('X').
--
-- SECURITY: app_setting returns the service-role key, so EXECUTE is revoked
-- from PUBLIC/anon/authenticated. All five callers are SECURITY DEFINER (owned
-- by postgres), which retains EXECUTE.

CREATE OR REPLACE FUNCTION public.app_setting(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v
    FROM vault.decrypted_secrets
    WHERE name = 'app.settings.' || p_name
    LIMIT 1;
  EXCEPTION WHEN others THEN
    v := NULL; -- vault absent/unreadable (some self-hosted stacks)
  END;

  IF v IS NULL THEN
    v := current_setting('app.settings.' || p_name, true);
  END IF;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_setting(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_setting(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.app_setting(text) FROM authenticated;


-- invoke_edge_function: identical body, settings now via app_setting()
CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
  v_request_id BIGINT;
BEGIN
  v_url := public.app_setting('supabase_url');
  v_key := public.app_setting('service_role_key');

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: missing app.settings.supabase_url or service_role_key; skipping %', fn_name;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := body,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$
;

-- notify_back_in_stock: identical body, settings now via app_setting()
CREATE OR REPLACE FUNCTION public.notify_back_in_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_product_name TEXT;
  v_request_id BIGINT;
BEGIN
  -- Only fire if quantity went from 0 to >0
  IF OLD.quantity_available != 0 OR NEW.quantity_available <= 0 THEN
    RETURN NEW;
  END IF;

  -- Get product name
  SELECT name INTO v_product_name
  FROM products
  WHERE id = NEW.product_id;

  v_supabase_url := COALESCE(
    public.app_setting('supabase_url'),
    current_setting('supabase.url', true),
    'https://api.patina.cloud'
  );
  v_service_key := public.app_setting('service_role_key');

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/back-in-stock-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'product_id', NEW.product_id,
        'product_name', COALESCE(v_product_name, 'A product'),
        'quantity_available', NEW.quantity_available
      )
    ) INTO v_request_id;
  END IF;

  -- Update timestamp
  NEW.updated_at := NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to dispatch back-in-stock notification for product %: %', NEW.product_id, SQLERRM;
  RETURN NEW;
END;
$function$
;

-- notify_consumer_confirmation: identical body, settings now via app_setting()
CREATE OR REPLACE FUNCTION public.notify_consumer_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    public.app_setting('supabase_url'),
    current_setting('supabase.url', true),
    'https://api.patina.cloud'
  );
  v_service_key := public.app_setting('service_role_key');

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
$function$
;

-- notify_designer_new_lead: identical body, settings now via app_setting()
CREATE OR REPLACE FUNCTION public.notify_designer_new_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  v_supabase_url := public.app_setting('supabase_url');
  v_service_key := public.app_setting('service_role_key');

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
$function$
;

-- notify_price_drop: identical body, settings now via app_setting()
CREATE OR REPLACE FUNCTION public.notify_price_drop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_request_id BIGINT;
BEGIN
  -- Only fire if price decreased
  IF NEW.price_retail IS NULL OR OLD.price_retail IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.price_retail >= OLD.price_retail THEN
    RETURN NEW;
  END IF;

  v_supabase_url := COALESCE(
    public.app_setting('supabase_url'),
    current_setting('supabase.url', true),
    'https://api.patina.cloud'
  );
  v_service_key := public.app_setting('service_role_key');

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/price-drop-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'product_id', NEW.id,
        'product_name', NEW.name,
        'old_price_cents', OLD.price_retail,
        'new_price_cents', NEW.price_retail
      )
    ) INTO v_request_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to dispatch price drop notification for product %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$
;
