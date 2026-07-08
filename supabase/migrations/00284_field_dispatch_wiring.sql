-- ═══════════════════════════════════════════════════════════════════════════
-- 00284 — Field dispatch wiring (Field Coordination · Wave 2)
--
-- The schema (00281–00283) can hold field parties, SMS conversations, and links.
-- This migration makes the DB *reach out*: three triggers and one cron invoke the
-- `sms-dispatch` / `field-daily` edge functions (via the 00081 invoke_edge_function
-- helper, the exact 00105 comms pattern), a redefinition of create_field_link so
-- the edge functions' service client can mint links, and the SMS template bodies
-- the shared renderer (email_templates, 00045/00051/00078) reads.
--
--   1. create_field_link — allow service-role callers (auth.uid() IS NULL) so
--      field-daily / sms-dispatch can mint a link. ONLY the auth guard changes;
--      the authenticated-owner path and the non-owner RAISE are byte-preserved.
--   2. client_decisions AFTER UPDATE/INSERT OF court_party_id → sms_court_assignment
--      when the new court party is a consented field party.
--   3. project_tasks AFTER UPDATE/INSERT OF owner_party_id → same, on task owner.
--   4. project_parties AFTER INSERT/UPDATE → sms_optin_invite when consent
--      transitions to 'pending' with a phone (this is how the designer UI fires
--      the double-opt-in invite: it just writes the row — Track D depends on this).
--   5. pg_cron 'field-daily' at 13:00 UTC → field-daily edge fn.
--   6. Seed the six field SMS templates into email_templates (idempotent).
--
-- Additive / idempotent (D7): CREATE OR REPLACE, DROP TRIGGER IF EXISTS + CREATE,
-- unschedule-if-exists, ON CONFLICT (slug) DO UPDATE. Every new/redefined function
-- is REVOKEd from PUBLIC, anon.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. create_field_link — service-role callers may mint (auth.uid() IS NULL)
-- ═══════════════════════════════════════════════════════════════════════════
-- Reproduces the 00283 body verbatim EXCEPT the authorization guard: 00283
-- rejected any caller with auth.uid() IS NULL. The field-daily cron and
-- sms-dispatch call this with the service client (auth.uid() IS NULL), so we now
-- let a NULL-uid (trusted, internal) caller through — created_by is left NULL —
-- while an *authenticated* caller must still own the party's project (the
-- field_links_test Case-8a non-owner RAISE is preserved). Nothing else changes.
CREATE OR REPLACE FUNCTION public.create_field_link(p_party_id UUID)
RETURNS TABLE (id UUID, token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_token      TEXT;
  v_hash       TEXT;
  v_id         UUID;
BEGIN
  SELECT pp.project_id INTO v_project_id
    FROM public.project_parties pp WHERE pp.id = p_party_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'party % not found', p_party_id USING errcode = 'no_data_found';
  END IF;

  -- Authenticated callers must own the party's project. Service-role / internal
  -- callers (auth.uid() IS NULL — triggers, cron, edge fns) are already trusted
  -- and bypass the ownership check; created_by is left NULL for them.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = v_project_id AND p.designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to mint a field link for party %', p_party_id
      USING errcode = 'insufficient_privilege';
  END IF;

  -- Supersede prior active tokens (regenerate — hash-at-rest precludes reuse).
  UPDATE public.field_link_tokens
     SET status = 'revoked'
   WHERE party_id = p_party_id AND project_id = v_project_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, created_by)
  VALUES (p_party_id, v_project_id, v_hash, auth.uid())
  RETURNING field_link_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_field_link(UUID) IS
  'Mint a no-auth field link for a party. Returns the raw token once; only '
  'sha256(token) is stored. Supersedes the prior active token. Authenticated '
  'callers must own the party''s project; service-role/internal callers '
  '(auth.uid() IS NULL) bypass the ownership check (created_by NULL) so the '
  'field-daily cron + sms-dispatch can mint links (00284).';

REVOKE ALL ON FUNCTION public.create_field_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_field_link(UUID) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Dispatch triggers — court assignment, task owner, opt-in invite
-- ═══════════════════════════════════════════════════════════════════════════
-- All three are SECURITY DEFINER, fire-and-forget (invoke wrapped in a BEGIN/
-- EXCEPTION so a dispatch hiccup never fails the underlying row write — the 00105
-- posture). The 'granted' consent gate lives here so a non-consented party is
-- never texted; the opt-in invite is the sole exception (it goes to 'pending').

-- ── 2a. client_decisions.court_party_id → sms_court_assignment ──────────────
CREATE OR REPLACE FUNCTION public.fc_dispatch_court_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party public.project_parties;
BEGIN
  -- Only when a court party is actually (re)assigned and the item is live.
  IF NEW.court_party_id IS NULL OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.court_party_id IS NOT DISTINCT FROM OLD.court_party_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_party FROM public.project_parties WHERE id = NEW.court_party_id;
  IF NOT FOUND
     OR v_party.party_kind NOT IN ('gc', 'sub', 'installer', 'receiver')
     OR v_party.sms_consent_status <> 'granted' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',     NEW.court_party_id,
        'projectId',   NEW.project_id,
        'templateKey', 'sms_court_assignment',
        'type',        'field_court_assignment',
        'vars', jsonb_build_object(
          'item_title', NEW.title,
          'kind',       NEW.coordination_kind
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fc_dispatch_court_assignment: dispatch failed for item %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fc_dispatch_court_assignment() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS fc_court_assignment_dispatch ON public.client_decisions;
CREATE TRIGGER fc_court_assignment_dispatch
  AFTER INSERT OR UPDATE OF court_party_id ON public.client_decisions
  FOR EACH ROW EXECUTE FUNCTION public.fc_dispatch_court_assignment();

COMMENT ON FUNCTION public.fc_dispatch_court_assignment() IS
  'Field Coordination (00284): on a court_party_id (re)assignment to a consented '
  'field party (gc/sub/installer/receiver), fire sms-dispatch with the '
  'sms_court_assignment template. Fire-and-forget (00105 pattern).';

-- ── 2b. project_tasks.owner_party_id → sms_court_assignment ─────────────────
CREATE OR REPLACE FUNCTION public.fc_dispatch_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party public.project_parties;
BEGIN
  IF NEW.owner_party_id IS NULL OR NEW.status = 'done' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_party_id IS NOT DISTINCT FROM OLD.owner_party_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_party FROM public.project_parties WHERE id = NEW.owner_party_id;
  IF NOT FOUND
     OR v_party.party_kind NOT IN ('gc', 'sub', 'installer', 'receiver')
     OR v_party.sms_consent_status <> 'granted' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',     NEW.owner_party_id,
        'projectId',   NEW.project_id,
        'templateKey', 'sms_court_assignment',
        'type',        'field_task_assignment',
        'vars', jsonb_build_object(
          'item_title', NEW.title,
          'kind',       'task'
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fc_dispatch_task_assignment: dispatch failed for task %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fc_dispatch_task_assignment() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS fc_task_assignment_dispatch ON public.project_tasks;
CREATE TRIGGER fc_task_assignment_dispatch
  AFTER INSERT OR UPDATE OF owner_party_id ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fc_dispatch_task_assignment();

COMMENT ON FUNCTION public.fc_dispatch_task_assignment() IS
  'Field Coordination (00284): on an owner_party_id (re)assignment to a consented '
  'field party, fire sms-dispatch with the sms_court_assignment template.';

-- ── 2c. project_parties consent → 'pending' → sms_optin_invite ──────────────
-- The designer UI (Track D) fires the double-opt-in invite by simply flipping a
-- party to sms_consent_status='pending' with a phone. This trigger turns that row
-- write into the invite SMS — the only send allowed to a non-granted party.
CREATE OR REPLACE FUNCTION public.fc_dispatch_optin_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sms_consent_status <> 'pending' OR NEW.phone_e164 IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sms_consent_status IS NOT DISTINCT FROM 'pending' THEN
    RETURN NEW;  -- already pending — not a fresh transition
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',     NEW.id,
        'projectId',   NEW.project_id,
        'templateKey', 'sms_optin_invite',
        'type',        'field_optin_invite'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fc_dispatch_optin_invite: dispatch failed for party %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fc_dispatch_optin_invite() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS fc_optin_invite_dispatch ON public.project_parties;
CREATE TRIGGER fc_optin_invite_dispatch
  AFTER INSERT OR UPDATE ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.fc_dispatch_optin_invite();

COMMENT ON FUNCTION public.fc_dispatch_optin_invite() IS
  'Field Coordination (00284): when a party''s sms_consent_status transitions to '
  '''pending'' with a phone_e164, fire the sms_optin_invite (the double-opt-in '
  'invite — the only send allowed to a non-granted party). Track D fires it by '
  'writing the row.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. pg_cron — field-daily digest at 13:00 UTC
-- ═══════════════════════════════════════════════════════════════════════════
-- Single predictable daily message (A2P-friendly). Unschedule-if-exists first
-- (idempotent re-install), matching the 00079 convention.
DO $$
BEGIN
  PERFORM cron.unschedule('field-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not scheduled yet on first install
END;
$$;

SELECT cron.schedule(
  'field-daily',
  '0 13 * * *',
  $$SELECT public.invoke_edge_function('field-daily', '{}'::jsonb);$$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Seed the field SMS templates (email_templates — the renderer's table)
-- ═══════════════════════════════════════════════════════════════════════════
-- render-template.ts reads email_templates by slug and interpolates {{var}} from
-- html_content (00051 column). SMS bodies live in html_content as plain text.
-- category is the NOT NULL email_template_category enum → 'transactional' (the
-- closest operational bucket). Idempotent: ON CONFLICT (slug) refreshes the body
-- so template edits ship via migration. Bodies mirror the runbook §2 samples.
INSERT INTO public.email_templates (slug, name, description, category, subject_default, html_content, variables)
VALUES
  ('sms_optin_invite', 'Field SMS — Opt-in invite',
   'Double-opt-in invitation sent when a field party is set to consent=pending.',
   'transactional', NULL,
   'Hi {{party_first_name}} — {{studio_name}} coordinates {{project_name}} through Patina. Reply YES for job updates by text (~1 msg/day). Msg&data rates may apply. Reply HELP for help, STOP to opt out.',
   '["party_first_name","studio_name","project_name"]'::jsonb),

  ('sms_optin_confirm', 'Field SMS — Opt-in confirmation',
   'Confirmation sent after a party replies YES.',
   'transactional', NULL,
   'You''re all set, {{party_first_name}} — you''ll get {{project_name}} updates from {{studio_name}} here. ~1 msg/day. Reply STOP anytime to opt out, HELP for help.',
   '["party_first_name","studio_name","project_name"]'::jsonb),

  ('sms_court_assignment', 'Field SMS — Court/task assignment',
   'Sent when a task or coordination item is assigned to a consented field party.',
   'transactional', NULL,
   'New from {{studio_name}} on {{project_name}}: "{{item_title}}" is on you. Reply here or tap: {{link}}',
   '["studio_name","project_name","item_title","link"]'::jsonb),

  ('sms_daily_digest', 'Field SMS — Daily digest',
   'The once-daily open-item digest with a numbered menu.',
   'transactional', NULL,
   'Morning {{party_first_name}} — on you at {{project_name}}: {{menu}} Reply DONE 1, or text a photo/note. Full list: {{link}}',
   '["party_first_name","project_name","menu","link"]'::jsonb),

  ('sms_delivery_confirm', 'Field SMS — Delivery confirm',
   'Delivery-window confirmation to a receiver/gc party.',
   'transactional', NULL,
   'Delivery {{delivery_window}} at {{project_name}}: {{delivery_summary}}. Reply OK to confirm, or reply with a problem.',
   '["delivery_window","project_name","delivery_summary"]'::jsonb),

  ('sms_help', 'Field SMS — HELP reply',
   'Static HELP keyword reply.',
   'transactional', NULL,
   'Patina relays project updates for {{studio_name}}. ~1 msg/day. Reply STOP to opt out. Questions: hello@patina.cloud',
   '["studio_name"]'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET html_content    = EXCLUDED.html_content,
      subject_default = EXCLUDED.subject_default,
      description     = EXCLUDED.description,
      variables       = EXCLUDED.variables,
      is_active       = true,
      updated_at      = now();
