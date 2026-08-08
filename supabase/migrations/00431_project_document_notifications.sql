-- Notify authorized project participants when a Folio file or revision lands.
-- Delivery is in-app only: notification_log remains the canonical read-state
-- and realtime feed, while the Document margin adapts these same rows locally.

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_project_file_event
  ON public.notification_log (user_id, ((metadata ->> 'event_key')))
  WHERE type = 'project_file_changed'
    AND channel = 'in_app';

CREATE OR REPLACE FUNCTION public.notify_project_document_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := COALESCE(auth.uid(), NEW.uploaded_by);
  v_actor_name text;
  v_client_id uuid;
  v_designer_id uuid;
  v_event_key text;
  v_is_revision boolean := NEW.version_of IS NOT NULL;
  v_message text;
  v_project_name text;
  v_recipient_id uuid;
  v_subject text;
BEGIN
  -- Discovery/proposal Folio rows have no project audience yet.
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project.name, project.designer_id, project.client_id
    INTO v_project_name, v_designer_id, v_client_id
  FROM public.projects AS project
  WHERE project.id = NEW.project_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    NULLIF(btrim(profile.display_name), ''),
    NULLIF(btrim(profile.full_name), ''),
    NULLIF(btrim(split_part(profile.email, '@', 1)), '')
  )
    INTO v_actor_name
  FROM public.profiles AS profile
  WHERE profile.id = v_actor_id;

  v_actor_name := COALESCE(v_actor_name, 'A project collaborator');
  v_event_key := format('project-document:%s:%s', NEW.id, NEW.created_at);
  v_subject := CASE
    WHEN v_is_revision THEN format('New version: %s', NEW.title)
    ELSE format('New file: %s', NEW.title)
  END;
  v_message := CASE
    WHEN v_is_revision THEN format(
      '%s added a new version of %s to %s.',
      v_actor_name,
      NEW.title,
      v_project_name
    )
    ELSE format('%s added %s to %s.', v_actor_name, NEW.title, v_project_name)
  END;

  FOR v_recipient_id IN
    SELECT DISTINCT recipient.user_id
    FROM (
      SELECT v_designer_id AS user_id
      UNION ALL
      SELECT member.user_id
      FROM public.project_team_members AS member
      WHERE member.project_id = NEW.project_id
        AND member.removed_at IS NULL
        -- A client added to the team still observes the file's explicit share
        -- boundary; internal collaborators retain their existing project read.
        AND (NEW.client_visible OR member.user_id IS DISTINCT FROM v_client_id)
      UNION ALL
      SELECT v_client_id
      WHERE NEW.client_visible
    ) AS recipient
    WHERE recipient.user_id IS NOT NULL
      AND recipient.user_id IS DISTINCT FROM v_actor_id
  LOOP
    INSERT INTO public.notification_log (
      user_id,
      type,
      channel,
      status,
      metadata,
      sent_at
    ) VALUES (
      v_recipient_id,
      'project_file_changed',
      'in_app',
      'delivered',
      jsonb_build_object(
        'event_key', v_event_key,
        'project_id', NEW.project_id,
        'project_name', v_project_name,
        'file_id', NEW.id,
        'file_name', NEW.title,
        'actor_id', v_actor_id,
        'actor_name', v_actor_name,
        'occurred_at', NEW.created_at,
        'read_at', NULL,
        'subject', v_subject,
        'message', v_message,
        'deep_link', format('/doc/%s', NEW.project_id)
      ),
      NEW.created_at
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_project_document_change()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.notify_project_document_change() IS
  '00431: emits one deduplicated in-app project_file_changed row per authorized non-actor when a project Folio file or revision is inserted.';

DROP TRIGGER IF EXISTS notify_project_document_change_trg
  ON public.project_documents;
CREATE TRIGGER notify_project_document_change_trg
AFTER INSERT ON public.project_documents
FOR EACH ROW
EXECUTE FUNCTION public.notify_project_document_change();
