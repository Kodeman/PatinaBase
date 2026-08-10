import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { uniquePaths } from "./lib.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization"); if (!auth) return json({ error: "unauthorized" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, "")); if (caller.error || !caller.data.user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null) as { editionId?: string; paths?: unknown } | null;
  if (!body?.editionId) return json({ error: "invalid_body" }, 400);
  const authorized = await admin.rpc("authorize_project_review_media", { p_edition_id: body.editionId, p_actor_id: caller.data.user.id });
  if (authorized.error || !authorized.data) return json({ error: "not_found" }, 404);
  const paths = uniquePaths(body.paths ?? authorized.data);
  const signed = await admin.storage.from("project-review-media").createSignedUrls(paths, 300);
  if (signed.error) return json({ error: "media_unavailable" }, 503);
  return json({ urls: signed.data?.map((entry) => ({ path: entry.path, signedUrl: entry.signedUrl })) ?? [], expiresInSeconds: 300 });
});
