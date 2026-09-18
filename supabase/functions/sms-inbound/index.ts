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
import { processInbound, parseForm, twimlBody, ownedReview, bindInboundSelection, inboundCompletion, completedInbound, type InboundDeps, type InboundResult, type InboundParams } from "./pipeline.ts";

import { sendPartySms, resolveStudioName } from "../_shared/sms.ts";

const GSM7_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

/** 24 studio + ': ' + 216 message + space + 63 closing = 306 septets. */
export function replyParam(value: string, maxSeptets: number): string {
  const text = value.replace(/[‘’]/g, "'").replace(/[“”]/g, '\"').replace(/[—–]/g, "-").replace(/…/g, "...");
  // Never turn an inbound credential or URL into durable recipe params.
  if (/(?:https?:|www\.|\/field\/|[a-f0-9]{64}|\bBearer\s+|\beyJ[a-zA-Z0-9_-]+\.)/i.test(text)) throw new Error("unsafe_reply_params");
  let size = 0;
  for (const ch of text) {
    if (GSM7_EXTENDED.includes(ch)) size += 2;
    else if (GSM7_BASIC.includes(ch)) size++;
    else throw new Error("reply_not_gsm7");
  }
  if (size > maxSeptets) throw new Error("reply_over_budget");
  return text;
}

function specializedReplyParams(template: string, vars: Record<string, unknown> = {}): Record<string, string> {
  if (template !== "sms_optin_invite" && template !== "sms_optin_confirm") throw new Error("unsupported_reply_template");
  const keys = template === "sms_optin_invite" ? ["studio_name", "project_name", "code"] : ["studio_name", "project_name"];
  return Object.fromEntries(keys.map((key) => {
    const value = vars[key];
    if (typeof value !== "string" || !value.trim()) throw new Error("missing_reply_parameter");
    if (key === "code" && !/^\d{2,3}$/.test(value)) throw new Error("invalid_reply_code");
    return [key, replyParam(value, key === "code" ? 3 : 24)];
  }));
}

/** Only compliance is TwiML. The shared sender owns ordinary logging and deferral. */
export async function dispatchInboundReplies(params: InboundParams, result: InboundResult,
  deps: InboundDeps): Promise<InboundResult> {
  if (result.selection && result.messageId) {
    try {
      const completion = await inboundCompletion(deps.supabase, result.selection.inboundMessageId, params.To, params.From);
      if (completion.status === "unknown") return { status: 503, twiml: twimlBody(), disposition: "completion_unknown", retainSid: true, messageId: result.messageId };
      if (completion.status !== "unresolved") return completedInbound(result.messageId);
      const sent = await sendPartySms(deps.supabase, { kind: "selection", phone: params.From, selection: result.selection }, deps);
      if (!["sent", "queued", "deferred"].includes(sent.status ?? "failed") || !sent.selection || !sent.messageId ||
        !await bindInboundSelection(deps.supabase, result.messageId, sent.selection, sent.messageId)) {
        return { ...result, status: 503, disposition: "selection_recovery_needed", retainSid: true };
      }
      return { ...result, disposition: sent.selection.usable ? result.disposition : "selection_pending" };
    } catch {
      return { ...result, status: 503, disposition: "selection_recovery_needed", retainSid: true };
    }
  }
  if (!result.replies?.length) return result;
  for (const [index, outgoing] of result.replies.entries()) {
    try {
      const vars = outgoing.templateKey ? specializedReplyParams(outgoing.templateKey, outgoing.vars) : {
        studio_name: replyParam((outgoing.projectId ? await resolveStudioName(deps.supabase, outgoing.projectId) : null) ?? "Your design studio", 24),
        message: replyParam(outgoing.message, 216),
      };
      const sent = await sendPartySms(deps.supabase, {
        partyId: outgoing.partyId ?? undefined, projectId: outgoing.projectId ?? undefined,
        phone: params.From, templateKey: outgoing.templateKey ?? "sms_inbound_reply", vars,
        dedupeKey: `inbound:${params.MessageSid}:${index}`,
      }, deps);
      if (sent.status === "failed") throw new Error(sent.reason ?? "reply_send_failed");
    } catch (error) {
      const owned = result.messageId && await ownedReview(deps.supabase, result.messageId, outgoing.projectId,
        outgoing.partyId, { path: "reply_failed", error: String(error) }, deps);
      // Never replay a business effect to recover a failed receipt. A missing
      // handoff is an operational failure, not a successful acknowledgement.
      if (!owned) return { ...result, status: 503, twiml: twimlBody(), disposition: "reply_handoff_failed" };
    }
  }
  return { ...result, twiml: twimlBody() };
}

function xml(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}

if (import.meta.main) serve(async (req) => {
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
    const dispatched = await dispatchInboundReplies(params, result, { supabase });
    return xml(dispatched.twiml, dispatched.status);
  } catch (err) {
    console.error("sms-inbound failed:", err);
    // An exception is not a successful handoff. Preserve the SID for reconciliation.
    return xml(twimlBody(), 503);
  }
});
