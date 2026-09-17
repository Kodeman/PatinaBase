// SMS Dispatch Edge Function
//
// Receives SMS notification jobs, resolves the recipient, enforces consent,
// sends via the Twilio Messages REST API, and records the result.
//
// Two paths:
//   · a `partyId` job — Field Coordination (00284). Everything it decides is in
//     _shared/sms.ts's sendPartySms: suppression, consent, the FIELD_LINE_PHASE
//     gate, quiet hours, the send claim, the provider call, the sms_messages
//     row. Its answer is an HTTP status that means something (contract S5).
//   · a `userId` job — the platform notification path (profiles.sms_opt_in +
//     notification_preferences) with its own notification_log lifecycle.
//
// Real sending is creds-gated. Restricted API keys are preferred; the account
// auth token remains a fallback and is also used for webhook verification.
//
// All request handling lives in handler.ts so it unit-tests without starting a
// server (house style — see sms-status, sms-inbound); this file only wires up
// the service-role client and serves it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleSmsDispatch } from "./handler.ts";

serve((req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return handleSmsDispatch(req, { supabase });
});
