import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import { deliveryIdempotencyKey, parsePreparedDelivery, parseSendRequest, reviewUrl } from "./lib.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (caller.error || !caller.data.user) return json({ error: "unauthorized" }, 401);
  const body = parseSendRequest(await req.json().catch(() => null));
  if (!body) return json({ error: "invalid_body" }, 400);
  const idempotencyKey = deliveryIdempotencyKey(body.editionId);
  const prepared = await admin.rpc("prepare_project_review_delivery", {
    p_edition_id: body.editionId,
    p_actor_id: caller.data.user.id,
    p_idempotency_key: idempotencyKey,
  });
  if (prepared.error || !prepared.data) return json({ error: "not_found" }, 404);
  const delivery = parsePreparedDelivery(prepared.data, body.editionId);
  if (!delivery) return json({ error: "invalid_delivery" }, 502);
  if (delivery.outcome === "already_sent") return json({ published: true, delivered: true, duplicate: true });
  if (delivery.outcome === "in_progress") return json({ published: true, delivered: false, retryable: true, inProgress: true }, 409);
  const url = reviewUrl(delivery.reviewPath, Deno.env.get("CLIENT_PORTAL_URL") ?? "https://client.patina.cloud");
  if (!url || !delivery.email) return json({ error: "invalid_delivery" }, 502);

  let sendError: string | null = null;
  try {
    const sent = await sendCompliantEmail(admin, {
      to: delivery.email,
      subject: delivery.title,
      html: `<p>Your studio has shared a selection review.</p><p><a href="${url}">Open review</a></p>`,
      category: "transactional",
      idempotencyKey,
    });
    if (!sent.success) sendError = "send_failed";
  } catch {
    sendError = "send_failed";
  }
  const marked = await admin.rpc("mark_project_review_delivery_sent", {
    p_attempt_id: delivery.attemptId,
    p_actor_id: caller.data.user.id,
    p_error_code: sendError,
  });
  if (sendError || marked.error) return json({ published: true, delivered: false, retryable: true }, 502);
  return json({ published: true, delivered: true });
});
