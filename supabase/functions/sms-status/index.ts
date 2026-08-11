// sms-status — the PUBLIC Twilio delivery status-callback webhook.
//
// config.toml sets verify_jwt = false: Twilio cannot carry a Supabase JWT, so
// authenticity comes from X-Twilio-Signature (verified in handler.ts) instead
// (house style — see sms-inbound / stripe-webhook / resend-webhook).
//
// All request handling lives in handler.ts so it unit-tests without starting
// a server; this file only wires up the service-role client and serves it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleStatusCallback } from "./handler.ts";

Deno.serve((req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return handleStatusCallback(req, { supabase });
});
