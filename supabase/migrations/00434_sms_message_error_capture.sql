-- SMS message error capture: Twilio status-callback ErrorCode/ErrorMessage
-- (or a send/flush-time failure detail) recorded alongside twilio_status so a
-- 'failed'/'undelivered' row carries WHY, not just the terminal state.
ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMENT ON COLUMN public.sms_messages.error_code IS
  'Twilio ErrorCode from a status callback (e.g. 30034), or a short code for a send/flush-time failure.';
COMMENT ON COLUMN public.sms_messages.error_message IS
  'Twilio ErrorMessage from a status callback, or the send/flush-time failure detail.';
