-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Admin outbox monitor RPC
-- Description: Single SECURITY DEFINER function unioning outbox_events from
--              svc_media and svc_orders. Used by admin portal /system/jobs
--              page to monitor unpublished events across services.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_outbox_events(
  p_limit integer DEFAULT 100,
  p_unpublished_only boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  source text,
  event_type text,
  published boolean,
  retry_count integer,
  last_error text,
  created_at timestamptz,
  published_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, svc_media, svc_orders
AS $$
  WITH combined AS (
    SELECT
      m.id,
      'media'::text AS source,
      m.type AS event_type,
      m.published,
      m.retry_count,
      m.last_error,
      m.created_at,
      m.published_at
    FROM svc_media.outbox_events m
    WHERE NOT p_unpublished_only OR m.published = false
    UNION ALL
    SELECT
      o.id,
      'orders'::text AS source,
      o.type AS event_type,
      o.published,
      o.retry_count,
      o.last_error,
      o.created_at,
      o.published_at
    FROM svc_orders.outbox_events o
    WHERE NOT p_unpublished_only OR o.published = false
  )
  SELECT * FROM combined
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(1000, p_limit));
$$;

-- Counts by source / publication state — used for KPI tiles.
CREATE OR REPLACE FUNCTION public.get_outbox_counts()
RETURNS TABLE (
  source text,
  unpublished bigint,
  published bigint,
  oldest_unpublished timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, svc_media, svc_orders
AS $$
  SELECT
    'media'::text AS source,
    COUNT(*) FILTER (WHERE NOT published) AS unpublished,
    COUNT(*) FILTER (WHERE published) AS published,
    MIN(created_at) FILTER (WHERE NOT published) AS oldest_unpublished
  FROM svc_media.outbox_events
  UNION ALL
  SELECT
    'orders'::text AS source,
    COUNT(*) FILTER (WHERE NOT published) AS unpublished,
    COUNT(*) FILTER (WHERE published) AS published,
    MIN(created_at) FILTER (WHERE NOT published) AS oldest_unpublished
  FROM svc_orders.outbox_events;
$$;

-- These RPCs read sensitive cross-service state. Restrict to admin domain
-- via the admin portal's getAuthenticatedAdmin gate at the API-route boundary
-- AND require explicit grant. The functions live in `public` so PostgREST
-- exposes them via the standard /rest/v1/rpc path; the admin client uses
-- the service role which is implicitly granted, but we also grant to
-- authenticated for symmetry with how the admin portal calls Supabase.
REVOKE EXECUTE ON FUNCTION public.get_outbox_events(integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_outbox_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outbox_events(integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_outbox_counts() TO service_role;
