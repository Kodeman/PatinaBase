-- ═══════════════════════════════════════════════════════════════════════════
-- 00292 — Designer Onboarding enrollment (Designer Onboarding · Wave 2)
--
-- Nothing ever enrolls anyone into an automated_sequences row. This migration
-- adds the enrollment path and wires it to a designer's first sign-in, plus a
-- milestone-notification dispatch off the activation events 00291 now writes.
--
--   1. public.enroll_designer_onboarding(p_user_id) — looks up the seeded
--      'Designer Onboarding' sequence (00050_seed_automation_sequences.sql)
--      by name AND status='active'; RETURNs silently if it isn't found or
--      isn't active yet — this is the rollout arming gate (the sequence seeds
--      as status='draft', so enrollment is a no-op until someone flips it
--      live). Inserts sequence_enrollments with the UNIQUE(sequence_id,
--      user_id) guard from 00044_campaigns.sql; increments
--      automated_sequences.total_enrolled (00048_automations_extended.sql)
--      only when the INSERT actually happened (plpgsql FOUND after an
--      INSERT/ON CONFLICT DO NOTHING is true iff a row was inserted).
--
--   2. A first-sign-in trigger on auth.users — `AFTER UPDATE ... WHEN
--      (OLD.last_sign_in_at IS NULL AND NEW.last_sign_in_at IS NOT NULL)`,
--      the handle_new_user (00013/00040) precedent for auth.users triggers
--      (SECURITY DEFINER, search_path pinned, exception-swallowing so a
--      dispatch failure never blocks sign-in). Gated on profiles.is_designer
--      (00030_add_is_designer_to_profiles.sql).
--
--   3. A milestone-notification dispatch trigger on engagement_events —
--      fires notification-dispatch (the exact 00105/00284
--      invoke_edge_function pattern) for the four externally-visible
--      milestones. Dedupe is inherent: record_activation_event's ON CONFLICT
--      DO NOTHING means this only ever fires on a genuinely-first event per
--      user per event name.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. enroll_designer_onboarding
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enroll_designer_onboarding(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sequence_id uuid;
BEGIN
  SELECT id INTO v_sequence_id
  FROM public.automated_sequences
  WHERE name = 'Designer Onboarding' AND status = 'active';

  -- Rollout arming gate: the sequence seeds as status='draft' (00050); until
  -- someone flips it to 'active', enrollment is silently a no-op.
  IF v_sequence_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.sequence_enrollments (
    sequence_id, user_id, current_step, status, next_step_at, enrolled_at
  ) VALUES (
    v_sequence_id, p_user_id, 0, 'active', now() + interval '2 hours', now()
  )
  ON CONFLICT (sequence_id, user_id) DO NOTHING;

  -- FOUND reflects the INSERT above: true iff a row was actually inserted
  -- (false when ON CONFLICT DO NOTHING skipped it) — so a re-enrollment
  -- attempt (e.g. a second first-sign-in-shaped event, or a retried trigger)
  -- never double-counts total_enrolled.
  IF FOUND THEN
    UPDATE public.automated_sequences
    SET total_enrolled = total_enrolled + 1,
        updated_at = now()
    WHERE id = v_sequence_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.enroll_designer_onboarding(uuid) IS
  'Enrolls p_user_id in the seeded ''Designer Onboarding'' automated_sequences '
  'row (00050) iff it is status=''active'' (the rollout arming gate). '
  'ON CONFLICT (sequence_id, user_id) DO NOTHING (00044 UNIQUE constraint); '
  'increments total_enrolled only on a genuine first enrollment. Service-only '
  '— called by the first-sign-in trigger below, never directly.';

REVOKE ALL ON FUNCTION public.enroll_designer_onboarding(uuid) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. First-sign-in trigger on auth.users
-- ═══════════════════════════════════════════════════════════════════════════
-- Precedent: 00013_profiles_table.sql's on_auth_user_created is the only
-- prior trigger on auth.users in this codebase (`AFTER INSERT ON auth.users
-- FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`, SECURITY DEFINER).
-- This is a novel AFTER UPDATE trigger on the same table, following the same
-- SECURITY DEFINER + search_path-pinned + exception-swallowing shape as
-- handle_new_user's latest body (00040_notification_preferences.sql: `...
-- EXCEPTION WHEN OTHERS THEN RAISE WARNING ...; RETURN NEW; END; $$ LANGUAGE
-- plpgsql SECURITY DEFINER SET search_path = public`).
--
-- profiles.is_designer: `ADD COLUMN IF NOT EXISTS is_designer BOOLEAN
-- DEFAULT false` (00030_add_is_designer_to_profiles.sql).
--
-- Prod-ops note (see project memory): migrations apply to Strata as
-- supabase_admin, matching the owner posture used for prior auth.users
-- triggers in this codebase.
CREATE OR REPLACE FUNCTION public.ae_dispatch_designer_first_signin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_designer boolean;
BEGIN
  SELECT is_designer INTO v_is_designer
  FROM public.profiles
  WHERE id = NEW.id;

  IF COALESCE(v_is_designer, false) THEN
    BEGIN
      PERFORM public.record_activation_event(
        NEW.id,
        'designer_first_signin',
        jsonb_build_object('email', NEW.email)
      );
      PERFORM public.enroll_designer_onboarding(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ae_dispatch_designer_first_signin: failed for user %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_designer_first_signin() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_designer_first_signin_dispatch ON auth.users;
CREATE TRIGGER ae_designer_first_signin_dispatch
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS NULL AND NEW.last_sign_in_at IS NOT NULL)
  EXECUTE FUNCTION public.ae_dispatch_designer_first_signin();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Milestone-notification dispatch on engagement_events
-- ═══════════════════════════════════════════════════════════════════════════
-- notification-dispatch's contract (supabase/functions/notification-dispatch/
-- index.ts, interface NotificationJob) requires user_id, type, channel,
-- template_id as TOP-LEVEL fields — `if (!job.user_id || !job.type ||
-- !job.channel || !job.template_id) return 400`. This is a DEVIATION from the
-- spec's literal "data.template_id" wording: the live contract puts
-- template_id at the top level (matching every existing caller —
-- notify_consumer_confirmation and notify_designer_new_lead in 00258, and
-- claim_design_request in 00286, all send `'template_id', ...` as a sibling
-- of `'data', ...`, never nested inside data). Following the verified
-- contract, not the spec's literal shape.
--
-- profiles has no first_name column (verified: 00013_profiles_table.sql only
-- defines display_name; no later migration adds first_name/last_name to
-- profiles). DEVIATION: data.first_name is sourced from profiles.display_name
-- (the closest available field), not a dedicated first_name column.
CREATE OR REPLACE FUNCTION public.ae_dispatch_milestone_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template_id text;
  v_first_name  text;
BEGIN
  v_template_id := CASE NEW.event_name
    WHEN 'proposal_sent'          THEN 'milestone-proposal-sent'
    WHEN 'proposal_signed'        THEN 'milestone-proposal-signed'
    WHEN 'design_request_claimed' THEN 'milestone-request-claimed'
    WHEN 'payment_received'       THEN 'milestone-first-payment'
    ELSE NULL
  END;

  IF v_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_first_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  BEGIN
    PERFORM public.invoke_edge_function(
      'notification-dispatch',
      jsonb_build_object(
        'user_id',     NEW.user_id,
        'type',        'welcome_series',
        'channel',     'email',
        'template_id', v_template_id,
        'data', jsonb_build_object(
          'milestone',  true,
          'first_name', v_first_name,
          'event_name', NEW.event_name
        ),
        'priority', 'normal'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ae_dispatch_milestone_notification: dispatch failed for engagement_events %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ae_dispatch_milestone_notification() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ae_milestone_notification_dispatch ON public.engagement_events;
CREATE TRIGGER ae_milestone_notification_dispatch
  AFTER INSERT ON public.engagement_events
  FOR EACH ROW WHEN (
    NEW.event_name IN ('proposal_sent', 'proposal_signed', 'design_request_claimed', 'payment_received')
    AND NEW.posthog_event_id LIKE 'activation:%'
  )
  EXECUTE FUNCTION public.ae_dispatch_milestone_notification();

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants note: this migration adds GRANT/REVOKE statements (the REVOKEs
-- above). scripts/generate-legacy-grants.py must be re-run to refresh
-- seed/00-legacy-grants.sql — left to the verification wave per Wave 2 scope
-- (no supabase db/reset commands run from this migration-authoring pass).
-- ═══════════════════════════════════════════════════════════════════════════
