import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import { deliveryIdempotencyKey, parseSendRequest } from "./lib.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors }); if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization"); if (!auth) return json({ error: "unauthorized" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, "")); if (caller.error || !caller.data.user) return json({ error: "unauthorized" }, 401);
  const body = parseSendRequest(await req.json().catch(() => null)); if (!body) return json({ error: "invalid_body" }, 400);
  // Publication is already durable before delivery. This RPC is retry-safe and
  // returns only a pre-authorized recipient/link, never a working-media path.
  const delivery = await admin.rpc("prepare_project_review_delivery", { p_edition_id: body.editionId, p_actor_id: caller.data.user.id });
  if (delivery.error || !delivery.data) return json({ error: "not_found" }, 404);
  const recipient = delivery.data as { email: string; reviewUrl: string; subject: string };
  try {
    const sent = await sendCompliantEmail(admin, { to: recipient.email, subject: recipient.subject, html: `<p>Your studio has shared a selection review.</p><p><a href="${recipient.reviewUrl}">Open review</a></p>`, category: "transactional", idempotencyKey: deliveryIdempotencyKey(body.editionId) });
    if (!sent.success) return json({ published: true, delivered: false, retryable: true }, 502);
  } catch { return json({ published: true, delivered: false, retryable: true }, 502); }
  const marked = await admin.rpc("mark_project_review_delivery_sent", { p_edition_id: body.editionId, p_actor_id: caller.data.user.id });
  if (marked.error) return json({ published: true, delivered: false, retryable: true }, 502);
  return json({ published: true, delivered: true });
});
