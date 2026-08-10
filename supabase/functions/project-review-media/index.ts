import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizedDerivatives, sha256Hex } from "./lib.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization"); if (!auth) return json({ error: "unauthorized" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, "")); if (caller.error || !caller.data.user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null) as { editionId?: string } | null;
  if (!body?.editionId) return json({ error: "invalid_body" }, 400);
  const authorized = await admin.rpc("authorize_project_review_media", { p_edition_id: body.editionId, p_actor_id: caller.data.user.id });
  if (authorized.error || !authorized.data) return json({ error: "not_found" }, 404);
  const derivatives = authorizedDerivatives(authorized.data);
  if (derivatives.length === 0) return json({ error: "media_unavailable" }, 422);
  // Only the frozen edition records select paths. Verify each object against
  // its frozen hash before minting a signed URL; callers never supply paths.
  for (const derivative of derivatives) {
    const object = await admin.storage.from("project-review-media").download(derivative.path);
    if (object.error || !object.data || await sha256Hex(await object.data.arrayBuffer()) !== derivative.sha256) return json({ error: "media_integrity_failed" }, 409);
  }
  const paths = derivatives.map((derivative) => derivative.path);
  const signed = await admin.storage.from("project-review-media").createSignedUrls(paths, 300);
  if (signed.error) return json({ error: "media_unavailable" }, 503);
  return json({ urls: signed.data?.map((entry) => ({ path: entry.path, signedUrl: entry.signedUrl })) ?? [], expiresInSeconds: 300 });
});
