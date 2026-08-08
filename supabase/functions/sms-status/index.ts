import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioSignature } from "../_shared/twilio-verify.ts";

const KNOWN_STATUSES = new Set([
  "accepted",
  "scheduled",
  "canceled",
  "queued",
  "sending",
  "sent",
  "failed",
  "delivered",
  "undelivered",
  "receiving",
  "received",
  "read",
]);

function parseForm(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;
  return params;
}

function response(status: number): Response {
  return new Response(null, { status });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response(405);

  const raw = await req.text();
  const params = parseForm(raw);
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const publicUrl = Deno.env.get("SMS_STATUS_CALLBACK_URL") ?? "";
  const signature = req.headers.get("X-Twilio-Signature");
  const verified = await verifyTwilioSignature(
    authToken,
    publicUrl,
    params,
    signature,
  );
  if (!verified) return response(403);

  const messageSid = params.MessageSid?.trim();
  const messageStatus = params.MessageStatus?.trim().toLowerCase();
  if (!messageSid || !messageStatus || !KNOWN_STATUSES.has(messageStatus)) {
    return response(400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await supabase
    .from("sms_messages")
    .update({ twilio_status: messageStatus })
    .eq("twilio_sid", messageSid);
  if (error) {
    console.error("sms-status update failed", {
      messageSid,
      messageStatus,
      error: error.message,
    });
    return response(500);
  }

  return response(204);
});
