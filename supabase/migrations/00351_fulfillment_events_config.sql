-- ═══════════════════════════════════════════════════════════════════════════
-- 00351 — Back of House: telemetry (fulfillment_events) + config + client notes
--
-- fulfillment_events is the Run Log (§11): every mutation flows through one RPC
-- helper that writes here. Append-only — UPDATE/DELETE raise UNCONDITIONALLY (no
-- GUC exemption); INSERT flows through the writer guard (00350). Mirrored to
-- PostHog by the fulfillment-events-mirror edge fn (cursor below), and added to
-- the supabase_realtime publication for the S1 queue live-refresh.
--
-- fulfillment_config holds the R1.12 tunables + SLA hours + inspection windows +
-- business-hours calendar (§10), seeded here (GUC='migration' escape — the table
-- is writer-guarded). fulfillment_client_notifications is the drafted→sent note
-- corpus (§6). fulfillment_business_hours_between() powers SLA math (§2).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. fulfillment_events — the append-only Run Log ────────────────────────
CREATE TABLE IF NOT EXISTS public.fulfillment_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type    text NOT NULL,   -- dotted grammar: order.intake, line.state_changed, po.transmitted,
                                  -- po.acknowledged, shipment.pod_recorded, exception.opened/resolved,
                                  -- ledger.posted, notification.drafted (D5), notification.sent,
                                  -- notification.push_skipped, config.updated
  actor         text NOT NULL,
  order_id      uuid,
  po_id         uuid,
  order_item_id uuid,
  shipment_id   uuid,
  exception_id  uuid,
  refs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {before, after}
  duration_ms   integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_order ON public.fulfillment_events(order_id, id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_type  ON public.fulfillment_events(event_type, created_at DESC);
COMMENT ON TABLE public.fulfillment_events IS
  'BOH (00351): append-only telemetry (§11). One RPC helper writes here; UPDATE/DELETE raise unconditionally. PostHog-mirrored + in supabase_realtime.';

-- append-only (unconditional) — no GUC exemption
CREATE OR REPLACE FUNCTION public.fulfillment_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fulfillment_events is append-only (% attempted)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
DROP TRIGGER IF EXISTS trg_fulfillment_events_append_only ON public.fulfillment_events;
CREATE TRIGGER trg_fulfillment_events_append_only
  BEFORE UPDATE OR DELETE ON public.fulfillment_events
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_events_append_only();

-- INSERT still gated by the writer guard (GUC='rpc' from the logging helper)
DROP TRIGGER IF EXISTS trg_fulfillment_events_writer_guard ON public.fulfillment_events;
CREATE TRIGGER trg_fulfillment_events_writer_guard
  BEFORE INSERT ON public.fulfillment_events
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_writer_guard();

-- ─── 2. fulfillment_client_notifications — drafted→sent corpus (§6) ─────────
CREATE TABLE IF NOT EXISTS public.fulfillment_client_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.fulfillment_orders(id) ON DELETE CASCADE,
  transition        text NOT NULL,
  channel           text NOT NULL CHECK (channel IN ('email','push')),
  template_key      text NOT NULL,
  drafted_body      text,
  sent_body         text,
  edit_diff         jsonb,
  sent_at           timestamptz,
  resend_message_id text,
  skipped_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_client_notifications_order ON public.fulfillment_client_notifications(order_id);

-- ─── 3. fulfillment_config — R1.12 tunables + SLA + calendar (§10) ──────────
CREATE TABLE IF NOT EXISTS public.fulfillment_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. updated_at + writer-guard triggers for the two mutable tables ───────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fulfillment_client_notifications','fulfillment_config'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_writer_guard ON public.%1$s;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_writer_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.fulfillment_writer_guard();', t);
  END LOOP;
END $$;

-- ─── 5. Seed config defaults (fulfillment_config is guarded → 'migration' GUC) ─
SELECT set_config('app.fulfillment_writer','migration',true);
INSERT INTO public.fulfillment_config (key, value, description) VALUES
  ('commission_rate_default',        '{"rate":0.16}'::jsonb, 'Per-vendor default commission (R1.12)'),
  ('settlement_variance_tolerance',  '{"rule":"greater_of","abs_cents":2500,"pct_of_po":0.02}'::jsonb, 'Settlement 3-way match tolerance (R1.12)'),
  ('margin_floor_warning',           '{"pct":0.25}'::jsonb, 'Workbench margin floor (R1.12)'),
  ('pledge_accrual',                 '{"rate":0.25,"tagged_only":true}'::jsonb, 'Teaching-royalties accrual (O2 tagged, not characterized)'),
  ('sla_hours',                      '{"intake_visible_minutes":1,"split_confirm_business_hours":4,"ack_chase_business_days":2,"tracking_after_ship_hours":24}'::jsonb, 'SLA clocks (§2)'),
  ('inspection_window_days_default', '{"parcel":5,"ltl":3,"white_glove":3}'::jsonb, 'Default inspection windows (§5.4)'),
  ('business_hours',                 '{"timezone":"America/Chicago","week":{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","17:00"],"fri":["09:00","17:00"]},"holidays":[]}'::jsonb, 'Business-hours calendar (§10)')
ON CONFLICT (key) DO NOTHING;

-- ─── 6. fulfillment_business_hours_between — SLA math (§2), STABLE ───────────
CREATE OR REPLACE FUNCTION public.fulfillment_business_hours_between(p_from timestamptz, p_to timestamptz)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  cfg        jsonb;
  tz         text;
  cur        timestamptz;
  day_key    text;
  win        jsonb;
  day_start  timestamptz;
  day_end    timestamptz;
  seg_start  timestamptz;
  seg_end    timestamptz;
  total_secs numeric := 0;
  holidays   jsonb;
BEGIN
  IF p_to <= p_from THEN RETURN 0; END IF;
  SELECT value INTO cfg FROM public.fulfillment_config WHERE key = 'business_hours';
  IF cfg IS NULL THEN
    RETURN round(EXTRACT(EPOCH FROM (p_to - p_from)) / 3600.0, 4);   -- fallback: wall-clock hours
  END IF;
  tz       := COALESCE(cfg->>'timezone','America/Chicago');
  holidays := COALESCE(cfg->'holidays','[]'::jsonb);
  cur := p_from;
  WHILE cur < p_to LOOP
    day_key := lower(to_char((cur AT TIME ZONE tz), 'dy'));   -- mon,tue,…
    win := cfg->'week'->day_key;
    IF win IS NOT NULL
       AND NOT (holidays ? to_char((cur AT TIME ZONE tz),'YYYY-MM-DD')) THEN
      day_start := ((date_trunc('day', cur AT TIME ZONE tz) + (win->>0)::time) AT TIME ZONE tz);
      day_end   := ((date_trunc('day', cur AT TIME ZONE tz) + (win->>1)::time) AT TIME ZONE tz);
      seg_start := GREATEST(cur, day_start);
      seg_end   := LEAST(p_to, day_end);
      IF seg_end > seg_start THEN
        total_secs := total_secs + EXTRACT(EPOCH FROM (seg_end - seg_start));
      END IF;
    END IF;
    cur := (date_trunc('day', cur AT TIME ZONE tz) + interval '1 day') AT TIME ZONE tz;   -- next local midnight
  END LOOP;
  RETURN round(total_secs / 3600.0, 4);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_business_hours_between(timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fulfillment_business_hours_between(timestamptz, timestamptz)
  TO authenticated, agent_reader, service_role;

-- ─── 7. fulfillment_event_mirror_cursor — 1-row PostHog cursor ──────────────
-- Written by the events-mirror edge fn via service_role (bypasses RLS); NOT a
-- guarded lifecycle table, so no writer guard.
CREATE TABLE IF NOT EXISTS public.fulfillment_event_mirror_cursor (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_event_id bigint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.fulfillment_event_mirror_cursor (id, last_event_id) VALUES (true, 0)
  ON CONFLICT (id) DO NOTHING;

-- ─── 8. RLS + grants (00335 idiom) ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fulfillment_events','fulfillment_client_notifications',
    'fulfillment_config','fulfillment_event_mirror_cursor'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select_admin ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_select_admin ON public.%1$s FOR SELECT TO authenticated
         USING (EXISTS (SELECT 1 FROM public.user_roles ur
                        JOIN public.roles r ON ur.role_id = r.id
                        WHERE ur.user_id = auth.uid() AND r.domain = ''admin''));', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select_agent_reader ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_select_agent_reader ON public.%1$s FOR SELECT TO agent_reader USING (true);', t);
    EXECUTE format('REVOKE ALL ON public.%1$s FROM public, anon;', t);
    EXECUTE format('GRANT SELECT ON public.%1$s TO authenticated, agent_reader;', t);
    EXECUTE format('GRANT ALL ON public.%1$s TO service_role;', t);
  END LOOP;
END $$;

-- ─── 9. Realtime publication membership (S1 queue live-refresh) ─────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'fulfillment_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.fulfillment_events';
  END IF;
END $$;
