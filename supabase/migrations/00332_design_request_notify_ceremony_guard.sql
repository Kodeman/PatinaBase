-- ═══════════════════════════════════════════════════════════════════════════
-- 00332 — notify_design_request_status_change: the ceremony guard
--
-- Program: Arrival Arc (Wave 2, R106). ceremony_complete (00331) accepts the
-- lead AFTER freezing the ceremony at state='sent' and letters the homeowner
-- with the NAMED introduction moment ("{Studio} introduced themselves — pick a
-- time."). Without a guard, the 00289 status trigger would ALSO write the
-- generic "Designer matched … You're all set." row — two letters for one act,
-- and the generic one is exactly what the arc replaces (I65 find: the 00289
-- trigger row is the one to suppress).
--
-- Redefined WHOLE-BODY from the live head:
--   Lineage: 00289 → 00332 (00289 verified head via
--     grep "CREATE OR REPLACE FUNCTION[^(]*notify_design_request_status_change").
--   Delta ONLY: on 'accepted', skip when a match_ceremony for this lead is
--     already 'sent'/'picked'. ceremony_complete freezes state='sent' BEFORE
--     updating leads.status, so the guard sees it in-transaction.
--
-- Flag-off parity: a TriageBar accept (no ceremony row, or a still-draft stub)
-- keeps today's behavior byte-identical — the guard only bites when the
-- ceremony actually delivered the introduction.
--
-- The trigger itself (on_lead_status_change_notify_homeowner) is untouched;
-- only the function body changes.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_design_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_name text;
  v_title         text;
  v_message       text;
BEGIN
  -- App-originated leads only. client_request_id is the iOS discriminator
  -- (00285); its absence marks legacy/portal/bulk-reconcile rows (00288) that
  -- must stay silent. homeowner_id is the notification recipient.
  IF NEW.client_request_id IS NULL OR NEW.homeowner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Real transitions into a terminal client-facing state only.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('accepted', 'declined', 'expired') THEN
    RETURN NEW;
  END IF;

  -- 00332 delta (Arrival Arc): when the Match Ceremony already delivered the
  -- named introduction for this lead, the generic accepted letter would be a
  -- duplicate, and a worse one. ceremony_complete freezes state='sent' before
  -- flipping leads.status, so this EXISTS sees it within the same transaction.
  IF NEW.status = 'accepted' AND EXISTS (
    SELECT 1 FROM match_ceremonies mc
    WHERE mc.lead_id = NEW.id AND mc.state IN ('sent', 'picked')
  ) THEN
    RETURN NEW;
  END IF;

  -- Resolve the designer's name cheaply (scalar subquery) when one is assigned.
  IF NEW.designer_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.full_name), ''))
      INTO v_designer_name
    FROM public.profiles p
    WHERE p.id = NEW.designer_id;
  END IF;
  v_designer_name := COALESCE(v_designer_name, 'Your designer');

  IF NEW.status = 'accepted' THEN
    v_title   := 'Designer matched';
    v_message := v_designer_name
                 || ' accepted your design request. You''re all set.';
  ELSIF NEW.status = 'declined' THEN
    v_title   := 'About your design request';
    v_message := 'Your request wasn''t accepted this time. '
                 || 'You can send a new one anytime.';
  ELSE  -- 'expired'
    v_title   := 'Your design request expired';
    v_message := 'No designer picked it up in time. '
                 || 'Send a new request anytime.';
  END IF;

  -- Best-effort in-app inbox row (bell polls). A notification failure must never
  -- unwind the status update the designer just made (00285 pattern).
  BEGIN
    INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
    VALUES (
      NEW.homeowner_id,
      'design_request_' || NEW.status,
      'in_app',
      'delivered',
      'design-request-' || NEW.status,
      jsonb_build_object(
        'lead_id',     NEW.id,
        'entity_type', 'design_request',
        'entity_id',   NEW.id::text,
        'title',       v_title,
        'message',     v_message,
        'deep_link',   '/doc/' || NEW.id::text,
        'url',         '/doc/' || NEW.id::text
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_design_request_status_change: notification insert failed for lead %: %',
      NEW.id, sqlerrm;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_design_request_status_change() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_design_request_status_change() IS
  'Homeowner-facing lead status letters (lineage 00289 → 00332). 00332 adds the '
  'Arrival Arc ceremony guard: an ''accepted'' transition writes NO generic row '
  'when the lead''s match_ceremony is sent/picked — ceremony_complete already '
  'lettered the named introduction moment. Flag-off accepts (no ceremony, or a '
  'draft stub) behave exactly as 00289.';
