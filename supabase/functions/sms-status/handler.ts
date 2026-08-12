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
//   (d) flip the LINKED notification_log row (matched by provider_id =
//       MessageSid, channel = sms) from its acceptance-time 'sending' to
//       'delivered'/'failed' — only sms-dispatch and site-request-dispatch
//       write that link; other channels (email/APNs/Stripe) are untouched.

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

  // (d) Flip the linked notification_log row, if one exists, from its
  // acceptance-time 'sending' to a terminal status. Only 'delivered' and
  // 'failed'/'undelivered' are terminal here — intermediate callbacks
  // (queued/sending/sent/accepted/...) leave notification_log alone; it's
  // already 'sending'. Best-effort: a missing/failed update here must not
  // fail the webhook — Twilio already got its 204 for the sms_messages write.
  const notifStatus = messageStatus === "delivered"
    ? "delivered"
    : (messageStatus === "failed" || messageStatus === "undelivered")
    ? "failed"
    : null;
  if (notifStatus) {
    const notifUpdate: Record<string, unknown> = { status: notifStatus };
    if (notifStatus === "delivered") notifUpdate.sent_at = new Date().toISOString();
    if (update.error_message !== undefined) notifUpdate.error = update.error_message;
    const { error: notifError } = await deps.supabase
      .from("notification_log")
      .update(notifUpdate)
      .eq("provider_id", messageSid)
      .eq("channel", "sms");
    if (notifError) {
      console.error("sms-status notification_log flip failed", {
        messageSid,
        messageStatus,
        error: (notifError as { message?: string }).message,
      });
    }
  }

  return response(204);
}
