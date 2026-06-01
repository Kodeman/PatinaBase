-- Migration: 00174_decision_resolved_email_and_overdue_cron.sql
-- Decision Framework Wave 2 follow-up · Notifications micro-PRs (T2 flags)
--
-- Three small, related notification fixes on top of the Wave-1 spine (00173)
-- and Wave-2 delivery (decision-notify.ts / expire-decisions / decision-reminders):
--
--   (a) RESOLVED-EMAIL ON CLIENT RESPONSE — an AFTER UPDATE trigger on
--       client_decisions that, when status transitions INTO 'responded'
--       (the client picks an option, or the designer overrides), fires the
--       decision-resolved-notify edge function. The in-app resolved row already
--       lands synchronously from notify_decision_resolved() (called by the
--       useSelectDecisionOption / useApplyDecisionOverride hooks); this adds the
--       EMAIL leg to the owning designer via the notification center. Modeled on
--       00105's comms_dispatch_notifications (SECURITY DEFINER, fire-and-forget,
--       non-fatal) and reuses public.invoke_edge_function() from 00081.
--
--   (b) OVERDUE CRON RE-POINT — the expire-decisions-daily cron (00092) ran an
--       INLINE `UPDATE … SET status='expired'`, which silently bypassed the
--       decision_overdue notification. Re-point it at the expire-decisions edge
--       function so the function's two-phase behaviour runs: fire decision_overdue
--       (in-app + email, idempotent) for every lapsed-but-pending decision, THEN
--       expire those past the 7-day grace. The unschedule is guarded so the reset
--       is idempotent (a fresh DB has no job to unschedule).
--
--   (c) RE-NOTIFY ON EDIT — notify_decision_updated(p_decision_id) RPC plus a new
--       'updated' notification kind. Unlike the other three kinds, 'updated' is
--       NOT idempotency-blocked: editing a pending decision should re-notify the
--       client each material edit. We achieve this by making the (decision_id, kind)
--       unique index PARTIAL — it now covers only the idempotent kinds and excludes
--       'updated', so multiple 'updated' rows per decision are allowed.

-- ═══════════════════════════════════════════════════════════════════════════
-- (a) RESOLVED → EMAIL EDGE FUNCTION TRIGGER (AFTER UPDATE)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fires only on the pending → responded edge (OLD.status != 'responded' AND
-- NEW.status = 'responded'). The WHEN clause keeps the function body off the
-- hot path for every other UPDATE (option selects, reminder stamps, viewed_at).

CREATE OR REPLACE FUNCTION public.decision_dispatch_resolved_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Defensive re-check of the transition (the trigger WHEN already gates this).
  IF OLD.status = 'responded' OR NEW.status <> 'responded' THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget the resolved-email dispatch. Errors are non-fatal: the
  -- status flip (apply_decision) must always succeed even if the email side
  -- has a hiccup. The in-app resolved row is written separately by the hooks
  -- via notify_decision_resolved(), so a failure here loses only the email.
  BEGIN
    PERFORM invoke_edge_function(
      'decision-resolved-notify',
      jsonb_build_object('decision_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'decision_dispatch_resolved_email: dispatch failed for decision %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS decision_resolved_email_dispatch ON public.client_decisions;
CREATE TRIGGER decision_resolved_email_dispatch
AFTER UPDATE ON public.client_decisions
FOR EACH ROW
WHEN (OLD.status <> 'responded' AND NEW.status = 'responded')
EXECUTE FUNCTION public.decision_dispatch_resolved_email();

COMMENT ON FUNCTION public.decision_dispatch_resolved_email IS
  'Fires the decision-resolved-notify edge function when a decision transitions '
  'into ''responded'', adding the resolved EMAIL leg to the owning designer. '
  'The in-app resolved row is written by notify_decision_resolved() from the '
  'hooks; this is the email half. Non-fatal — modeled on 00105.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (b) RE-POINT expire-decisions-daily CRON AT THE EDGE FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 00092 scheduled this job to run an inline UPDATE that expires decisions but
-- never announces them overdue. The expire-decisions edge function does both
-- (overdue notify, then expire). Re-point at the same time (02:00 UTC).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Guarded unschedule: only if the job currently exists (idempotent on a fresh
-- DB where 00092 just scheduled it, and on a re-run of this migration).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-decisions-daily') THEN
    PERFORM cron.unschedule('expire-decisions-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-decisions-daily',
  '0 2 * * *',
  $$
  SELECT public.invoke_edge_function('expire-decisions', '{}'::jsonb);
  $$
);

-- Best-effort comment refresh (pg_cron is owned by supabase_admin on self-hosted,
-- so a postgres-run migration may lack privilege — same guard as 00092).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: decision-reminders-daily (09:00 UTC), expire-decisions-daily (02:00 UTC, now via the expire-decisions edge fn so decision_overdue fires before expiry), review-requests cron, proposal cron.'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (c) 'decision_updated' NOTIFICATION KIND + notify_decision_updated RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Transaction note: the Supabase CLI wraps each migration file in a single
-- transaction. Postgres forbids USING a freshly-added enum label in the same
-- transaction that added it (SQLSTATE 55P04). Since the index predicate and the
-- RPC literal below reference 'decision_updated', we must COMMIT the enum-add
-- first. The explicit COMMIT flushes the CLI's wrapping transaction; the
-- statements after it run in a fresh implicit transaction where the new label
-- is safe to use. (The COMMIT emits a harmless 25P01 "no transaction in
-- progress" notice on contexts that apply statements in autocommit.)

-- Add the 'decision_updated' member to the decision_notification_kind enum (00173).
DO $$ BEGIN
  ALTER TYPE decision_notification_kind ADD VALUE IF NOT EXISTS 'decision_updated';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Re-shape the idempotency guard so 'decision_updated' is NOT blocked.
--
-- 00173 created a FULL unique index on (decision_id, kind), which would collapse
-- every re-edit into a single row. Replace it with a PARTIAL unique index that
-- covers only the three idempotent kinds and excludes 'decision_updated', so a
-- pending decision can be re-announced to the client on each material edit while
-- required / overdue / resolved stay one-row-per-decision.
DROP INDEX IF EXISTS public.uq_decision_notifications_decision_kind;

CREATE UNIQUE INDEX IF NOT EXISTS uq_decision_notifications_decision_kind
  ON public.decision_notifications(decision_id, kind)
  WHERE kind <> 'decision_updated';

-- Read path for the 'updated' feed (multiple rows per decision, by recency).
CREATE INDEX IF NOT EXISTS idx_decision_notifications_decision_updated
  ON public.decision_notifications(decision_id, created_at DESC)
  WHERE kind = 'decision_updated';

-- The three frozen idempotent RPCs (00173) used `ON CONFLICT (decision_id, kind)
-- DO NOTHING`, which arbitrates against a FULL unique index. Now that the index
-- is PARTIAL (predicate `kind <> 'decision_updated'`), Postgres requires the
-- conflict clause to carry the same predicate to select that index as the
-- arbiter. We therefore re-declare the three functions IDENTICALLY to 00173
-- except for adding `WHERE kind <> 'decision_updated'` to the ON CONFLICT — the
-- behaviour (one row per (decision, kind), DO NOTHING) is unchanged. Bodies are
-- otherwise byte-for-byte the 00173 shape.

-- notify_decision_required — addressed to the CLIENT.
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

  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.decision_notifications (user_id, decision_id, kind)
  VALUES (v_client_id, p_decision_id, 'decision_required')
  ON CONFLICT (decision_id, kind) WHERE kind <> 'decision_updated' DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- notify_decision_overdue — addressed to the CLIENT.
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
  ON CONFLICT (decision_id, kind) WHERE kind <> 'decision_updated' DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- notify_decision_resolved — addressed to the DESIGNER who owns it.
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
  ON CONFLICT (decision_id, kind) WHERE kind <> 'decision_updated' DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- notify_decision_updated — addressed to the CLIENT, fired when a pending
-- decision is materially edited. Mirrors notify_decision_required (00173) but
-- writes the non-idempotent 'decision_updated' kind: NO ON CONFLICT clause, so
-- every call inserts a fresh row (the partial unique index excludes this kind).
CREATE OR REPLACE FUNCTION public.notify_decision_updated(p_decision_id UUID)
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
  VALUES (v_client_id, p_decision_id, 'decision_updated')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.notify_decision_updated(UUID) IS
  'Fires a decision_updated in-app notification to the client when a pending '
  'decision is materially edited. NOT idempotent — each call inserts a fresh '
  'row (the partial unique (decision_id, kind) index excludes decision_updated) '
  'so a client is re-notified on every edit.';

-- Authenticated callers (the Wave-1 hooks) and the service role may invoke this.
GRANT EXECUTE ON FUNCTION public.notify_decision_updated(UUID) TO authenticated;
