import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAuthorizedMedia, parseMediaRequest, sha256Hex } from "./lib.ts";

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
  const body = parseMediaRequest(await req.json().catch(() => null));
  if (!body) return json({ error: "invalid_body" }, 400);
  const authorized = await admin.rpc("authorize_project_review_media", {
    p_edition_id: body.editionId,
    p_actor_id: caller.data.user.id,
  });
  if (authorized.error || !authorized.data) return json({ error: "not_found" }, 404);
  const manifest = parseAuthorizedMedia(authorized.data, body.editionId, caller.data.user.id);
  if (!manifest) return json({ error: "invalid_media_manifest" }, 422);

  for (const asset of manifest.assets) {
    const object = await admin.storage.from(asset.bucket).download(asset.path);
    if (object.error || !object.data) return json({ error: "media_unavailable" }, 503);
    const bytes = await object.data.arrayBuffer();
    if (bytes.byteLength !== asset.sizeBytes || await sha256Hex(bytes) !== asset.sha256) {
      return json({ error: "media_integrity_failed" }, 409);
    }
  }
  if (manifest.assets.length === 0) return json({ urls: [], expiresInSeconds: 300 });
  const signed = await admin.storage.from("project-review-media").createSignedUrls(manifest.assets.map((asset) => asset.path), 300);
  if (signed.error || signed.data?.length !== manifest.assets.length) return json({ error: "media_unavailable" }, 503);
  return json({
    urls: manifest.assets.map((asset, index) => ({ assetId: asset.assetId, signedUrl: signed.data![index].signedUrl })),
    expiresInSeconds: 300,
  });
});
