-- Migration: 00173_decision_notifications.sql
-- Decision Framework Wave 1 (Spine) · PT-D-1-3
--
-- Closes the notify gap (delivery plan cluster B). The decision_required /
-- decision_overdue notification *types* were declared in
-- packages/shared/src/types/notifications.ts but were never fired from
-- anywhere — there is no DB-level decision notification mechanism, and the
-- decision-reminders edge function (00092) talks straight to Resend, bypassing
-- the notification center.
--
-- There is no existing public notifications table this can write to: the
-- generic `notifications` table (00054, svc_projects) is the realtime
-- WebSocket queue (user_id TEXT, channels JSONB NOT NULL) and is not the
-- in-app notification-center store. So — per the PT-D-1-3 fallback instruction
-- — this migration creates a minimal `decision_notifications` log table modeled
-- exactly on procurement_notifications (00151): an in-app-only log with
-- SECURITY DEFINER insert functions and per-user RLS.
--
-- ⚠️  REPORT NOTE: `decision_notifications` is a NEW minimal log table. It is
--     the delivery plan's documented fallback. Wave-2 Territory T2 (Notifications
--     & Delivery) is expected to fan these rows out to email / push via the
--     notification center; v1 here is in-app only.
--
-- Provides three idempotent RPCs the Wave-1 hooks (and the Wave-2 edge
-- functions) call:
--   • notify_decision_required(p_decision_id)  — fired when a decision is sent
--                                                 (status reaches 'pending'),
--                                                 addressed to the CLIENT.
--   • notify_decision_overdue(p_decision_id)   — fired when a pending decision
--                                                 passes its due_date,
--                                                 addressed to the CLIENT.
--   • notify_decision_resolved(p_decision_id)  — fired when a decision is
--                                                 resolved (status 'responded'),
--                                                 addressed to the DESIGNER.
--
-- Idempotency: a partial unique index on (decision_id, kind) means re-calling
-- an RPC for the same decision is a no-op (ON CONFLICT DO NOTHING).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. KIND ENUM
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE decision_notification_kind AS ENUM (
    'decision_required',
    'decision_overdue',
    'decision_resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE decision_notification_kind IS
  'In-app notification kinds for the decision framework. '
  'decision_required: a decision was sent and needs the client''s response. '
  'decision_overdue: a pending decision passed its due_date. '
  'decision_resolved: a decision was resolved — designer is notified.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. decision_notifications TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.decision_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_id UUID        NOT NULL REFERENCES public.client_decisions(id) ON DELETE CASCADE,
  kind        decision_notification_kind NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.decision_notifications IS
  'In-app-only notification rows for the decision framework. One row per '
  '(decision, kind) — see the partial unique index. read_at = NULL means '
  'unread. Rows are created by SECURITY DEFINER RPCs, never by clients directly. '
  'v2: fan out to email/push via the notification center (Wave-2 Territory T2).';

-- Idempotency guard: at most one notification per (decision, kind).
CREATE UNIQUE INDEX IF NOT EXISTS uq_decision_notifications_decision_kind
  ON public.decision_notifications(decision_id, kind);

-- Read path: unread-count badge + feed for a user.
CREATE INDEX IF NOT EXISTS idx_decision_notifications_user_unread
  ON public.decision_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Full feed (read + unread) ordered by recency.
CREATE INDEX IF NOT EXISTS idx_decision_notifications_user_all
  ON public.decision_notifications(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS — per-user (parallels procurement_notifications, 00151)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.decision_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY decision_notifications_user_select
  ON public.decision_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY decision_notifications_user_update
  ON public.decision_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT / DELETE are RPC-only (SECURITY DEFINER). No authenticated INSERT policy.

-- updated_at touch trigger (reuse the project-wide helper from 00062 / 00066).
DROP TRIGGER IF EXISTS set_updated_at_decision_notifications ON public.decision_notifications;
CREATE TRIGGER set_updated_at_decision_notifications
  BEFORE UPDATE ON public.decision_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. NOTIFY RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- 4a. notify_decision_required — addressed to the CLIENT on the relationship.
CREATE OR REPLACE FUNCTION public.notify_decision_required(p_decision_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_id        UUID;
BEGIN
  SELECT dc.client_id
    INTO v_client_id
    FROM public.client_decisions cd
    JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
   WHERE cd.id = p_decision_id;

  -- No recipient (decision missing or unlinked client) → silent no-op.
  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.decision_notifications (user_id, decision_id, kind)
  VALUES (v_client_id, p_decision_id, 'decision_required')
  ON CONFLICT (decision_id, kind) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.notify_decision_required(UUID) IS
  'Fires a decision_required in-app notification to the client when a decision '
  'is sent. Idempotent (one row per decision via ON CONFLICT DO NOTHING).';

-- 4b. notify_decision_overdue — addressed to the CLIENT.
CREATE OR REPLACE FUNCTION public.notify_decision_overdue(p_decision_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_id        UUID;
BEGIN
  SELECT dc.client_id
    INTO v_client_id
    FROM public.client_decisions cd
    JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
   WHERE cd.id = p_decision_id;

  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.decision_notifications (user_id, decision_id, kind)
  VALUES (v_client_id, p_decision_id, 'decision_overdue')
  ON CONFLICT (decision_id, kind) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.notify_decision_overdue(UUID) IS
  'Fires a decision_overdue in-app notification to the client when a pending '
  'decision passes its due_date. Idempotent (one row per decision).';

-- 4c. notify_decision_resolved — addressed to the DESIGNER who owns it.
CREATE OR REPLACE FUNCTION public.notify_decision_resolved(p_decision_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id UUID;
  v_id          UUID;
BEGIN
  -- Prefer the denormalized designer_id (00064); fall back to the join.
  SELECT COALESCE(cd.designer_id, dc.designer_id)
    INTO v_designer_id
    FROM public.client_decisions cd
    JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
   WHERE cd.id = p_decision_id;

  IF v_designer_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.decision_notifications (user_id, decision_id, kind)
  VALUES (v_designer_id, p_decision_id, 'decision_resolved')
  ON CONFLICT (decision_id, kind) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.notify_decision_resolved(UUID) IS
  'Fires a decision_resolved in-app notification to the owning designer when a '
  'decision is resolved. Idempotent (one row per decision).';

-- Authenticated callers (the Wave-1 hooks) and the service role (Wave-2 edge
-- functions / cron) may invoke these. The functions are SECURITY DEFINER, so
-- the actual INSERT runs as the function owner regardless of caller.
GRANT EXECUTE ON FUNCTION public.notify_decision_required(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_decision_overdue(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_decision_resolved(UUID) TO authenticated;
