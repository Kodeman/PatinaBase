// sms-status/handler.ts — the request-handling core of the Twilio delivery
// status-callback webhook (the signature-verified core of sms-status). Split
// out of index.ts, mirroring sms-inbound's index.ts/pipeline.ts split, so it
// imports without starting a server and unit-tests with an injected supabase
// (_tests/fake-supabase.ts) instead of a live stack.
//
//   (a) verify X-Twilio-Signature over SMS_STATUS_CALLBACK_URL + sorted params
//   (b) MessageSid + a MessageStatus in the known allowlist, else 400
//   (c) update the matching sms_messages row: twilio_status always; error_code
//       / error_message only when Twilio's callback included them — an absent
//       param must never null out a previously recorded error.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
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

export interface StatusCallbackDeps {
  supabase: SupabaseClient;
  /** Injectable env reader (defaults to Deno.env.get). */
  getEnv?: (key: string) => string | undefined;
}

function parseForm(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;
  return params;
}

function response(status: number): Response {
  return new Response(null, { status });
}

export async function handleStatusCallback(
  req: Request,
  deps: StatusCallbackDeps,
): Promise<Response> {
  if (req.method !== "POST") return response(405);

  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const raw = await req.text();
  const params = parseForm(raw);
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const publicUrl = getEnv("SMS_STATUS_CALLBACK_URL") ?? "";
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

  const update: Record<string, unknown> = { twilio_status: messageStatus };
  // Only set when the callback included them AND they're non-empty — an
  // absent (or blank) param must not overwrite a previously recorded error.
  if (params.ErrorCode !== undefined && params.ErrorCode !== "") {
    update.error_code = params.ErrorCode;
  }
  if (params.ErrorMessage !== undefined && params.ErrorMessage !== "") {
    update.error_message = params.ErrorMessage;
  }

  const { error } = await deps.supabase
    .from("sms_messages")
    .update(update)
    .eq("twilio_sid", messageSid);
  if (error) {
    console.error("sms-status update failed", {
      messageSid,
      messageStatus,
      error: (error as { message?: string }).message,
    });
    return response(500);
  }

  return response(204);
}
