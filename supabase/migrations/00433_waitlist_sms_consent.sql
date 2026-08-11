-- SMS consent capture for the marketing-site /signup form (Twilio A2P 10DLC).
-- waitlist.phone already exists (00145); these columns record the consent
-- itself plus a verbatim snapshot of the consent language shown at signup.
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS sms_consent      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_text text;
