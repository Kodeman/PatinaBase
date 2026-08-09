-- Twilio activation hardening: auditable prior consent, compliant confirmation
-- dispatch, and a daily schedule that stays outside Chicago quiet hours.

ALTER TABLE public.project_parties
  ADD COLUMN IF NOT EXISTS sms_consent_source TEXT
    CHECK (sms_consent_source IN ('verbal', 'written', 'web_form', 'inbound_sms', 'other')),
  ADD COLUMN IF NOT EXISTS sms_consent_evidence TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_recorded_by UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS sms_consent_disclosure_version TEXT;

COMMENT ON COLUMN public.project_parties.sms_consent_source IS
  'How prior express SMS consent was obtained before Patina sent any message.';
COMMENT ON COLUMN public.project_parties.sms_consent_evidence IS
  'Auditable note identifying where/when the recipient gave SMS consent.';
COMMENT ON COLUMN public.project_parties.sms_consent_recorded_at IS
  'When Patina recorded the recipient''s prior express SMS consent.';
COMMENT ON COLUMN public.project_parties.sms_consent_recorded_by IS
  'Studio member who attested to the recipient''s prior express SMS consent.';
COMMENT ON COLUMN public.project_parties.sms_consent_disclosure_version IS
  'Version of the SMS disclosure presented when consent was obtained.';

-- A pending row is only dispatchable after prior consent evidence exists.
-- Adding evidence to an already-pending legacy row counts as a fresh eligible
-- transition; repeated writes to an already-evidenced row do not resend.
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
  IF NEW.sms_consent_source IS NULL
     OR NEW.sms_consent_recorded_at IS NULL
     OR NEW.sms_consent_disclosure_version IS NULL
     OR btrim(COALESCE(NEW.sms_consent_evidence, '')) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.sms_consent_status IS NOT DISTINCT FROM 'pending'
     AND OLD.sms_consent_source IS NOT NULL
     AND OLD.sms_consent_recorded_at IS NOT NULL
     AND OLD.sms_consent_disclosure_version IS NOT NULL
     AND btrim(COALESCE(OLD.sms_consent_evidence, '')) <> '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',     NEW.id,
        'projectId',   NEW.project_id,
        'templateKey', 'sms_optin_invite',
        'type',        'field_optin_confirmation'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fc_dispatch_optin_invite: dispatch failed for party %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fc_dispatch_optin_invite() IS
  'Dispatches the SMS double-confirmation only after auditable prior express consent is recorded.';

UPDATE public.email_templates
SET name = 'Field SMS - Opt-in confirmation',
    description = 'Double-confirmation sent after prior express consent is recorded off-SMS.',
    html_content = 'Hi {{party_first_name}} - you asked {{studio_name}} to send {{project_name}} updates through Patina. Reply YES to confirm (~1 msg/day). Msg&data rates may apply. Reply HELP for help, STOP to opt out.'
WHERE slug = 'sms_optin_invite';

-- 14:00 UTC is 08:00 CST / 09:00 CDT, always inside the 08:00-20:00
-- America/Chicago delivery window enforced by sendPartySms.
DO $$
BEGIN
  PERFORM cron.unschedule('field-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'field-daily',
  '0 14 * * *',
  $$SELECT public.invoke_edge_function('field-daily', '{}'::jsonb);$$
);
