// sms-inbound — the PUBLIC Twilio inbound webhook for Field Coordination.
//
// config.toml sets verify_jwt = false: Twilio cannot carry a Supabase JWT, so
// authenticity comes from the X-Twilio-Signature (verified in-function) instead
// (house style — see stripe-webhook / resend-webhook).
//
// This entry does the two steps that must precede everything (raw body + Twilio
// signature) and hands the parsed params to the pipeline (pipeline.ts). Keeping
// the pipeline in its own module lets it unit-test without starting a server.
//   (a) read the RAW body first — the signature covers the exact wire bytes
//   (b) verify X-Twilio-Signature over SMS_INBOUND_PUBLIC_URL + sorted params → 403
//   (c…k) → processInbound

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioSignature } from "../_shared/twilio-verify.ts";
import { processInbound, parseForm, twimlBody, type InboundParams } from "./pipeline.ts";

function xml(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}

serve(async (req) => {
  if (req.method !== "POST") return xml(twimlBody(), 405);

  // (a) RAW body first — the signature covers the exact wire bytes.
  const raw = await req.text();
  const params = parseForm(raw) as InboundParams;

  // (b) X-Twilio-Signature over SMS_INBOUND_PUBLIC_URL + sorted params.
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const publicUrl = Deno.env.get("SMS_INBOUND_PUBLIC_URL") ?? "";
  const signature = req.headers.get("X-Twilio-Signature");
  const ok = await verifyTwilioSignature(authToken, publicUrl, params as Record<string, string>, signature);
  if (!ok) return xml(twimlBody("Forbidden"), 403);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    const result = await processInbound(params, { supabase });
    return xml(result.twiml, result.status);
  } catch (err) {
    console.error("sms-inbound failed:", err);
    // 200 with empty TwiML: never make Twilio retry-storm on a bug.
    return xml(twimlBody(), 200);
  }
});
