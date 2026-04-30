-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: In-App Messaging — Notification Dispatch Trigger
-- Spec: docs/prds/in-app-messaging-prd.md §11
-- Description:
--   Wires the comms-notification-dispatch edge function to fire on every
--   non-system, non-deleted INSERT into comms_messages. The edge function
--   evaluates eligibility (mute, pref, debounce, coalescing) and enqueues
--   notify() jobs only for recipients that pass.
--
--   We reuse the existing invoke_edge_function() helper from migration 00081,
--   which forwards both `apikey` and `Authorization: Bearer …` headers — the
--   Kong gateway and edge-runtime JWT check both pass.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.comms_dispatch_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip system messages and pre-deleted (extremely rare) inserts.
  IF NEW.system OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget the dispatch. Errors are non-fatal: the user-visible
  -- message insert must always succeed even if the email side has a hiccup.
  BEGIN
    PERFORM invoke_edge_function(
      'comms-notification-dispatch',
      jsonb_build_object('message_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'comms_dispatch_notifications: dispatch failed for message %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comms_messages_notification_dispatch ON public.comms_messages;
CREATE TRIGGER comms_messages_notification_dispatch
AFTER INSERT ON public.comms_messages
FOR EACH ROW
WHEN (NEW.system = FALSE AND NEW.deleted_at IS NULL)
EXECUTE FUNCTION public.comms_dispatch_notifications();

COMMENT ON FUNCTION public.comms_dispatch_notifications IS
  'Fires the comms-notification-dispatch edge function on each new user message. Eligibility (mute, pref, debounce, coalescing) is evaluated edge-side per docs/prds/in-app-messaging-prd.md §11.';
