import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  MAX_PREPARE_SOURCE_BYTES,
  parseAuthorizedMedia,
  parseMediaRequest,
  preparedResponse,
  PrepareMediaError,
  prepareReviewMedia,
  sha256Hex,
} from "./lib.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const caller = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (caller.error || !caller.data.user) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = parseMediaRequest(await req.json().catch(() => null));
  if (!body) return json({ error: "invalid_body" }, 400);
  if (body.action === "prepare") {
    try {
      const prepared = await prepareReviewMedia(body, caller.data.user.id, {
        registerSource: async (args) => {
          const result = await admin.rpc(
            "register_project_ffe_working_media_source",
            args,
          );
          if (result.error || !result.data) {
            throw new PrepareMediaError("source_registration_failed", 404);
          }
          return result.data;
        },
        authorize: async (args) => {
          const result = await admin.rpc(
            "authorize_project_review_media_source",
            args,
          );
          if (result.error || !result.data) {
            throw new PrepareMediaError("not_found", 404);
          }
          return result.data;
        },
        download: async (bucket, path) => {
          const object = await admin.storage.from(bucket).download(path);
          return object.error || !object.data ||
              object.data.size > MAX_PREPARE_SOURCE_BYTES
            ? null
            : await object.data.arrayBuffer();
        },
        uploadIfAbsent: async (bucket, path, bytes, contentType) => {
          const result = await admin.storage.from(bucket).upload(
            path,
            new Uint8Array(bytes),
            {
              contentType,
              upsert: false,
            },
          );
          // A deterministic retry may find the exact object already present;
          // the mandatory download/hash verification below decides whether it
          // is safe to reuse, regardless of the provider's conflict shape.
          return !result.error;
        },
        register: async (args) => {
          const result = await admin.rpc(
            "prepare_project_review_media_asset",
            args,
          );
          if (result.error || !result.data) {
            throw new PrepareMediaError("registration_failed", 500);
          }
          return result.data;
        },
      });
      return json(preparedResponse(prepared));
    } catch (error) {
      if (error instanceof PrepareMediaError) {
        return json({ error: error.code }, error.status);
      }
      return json({ error: "prepare_failed" }, 500);
    }
  }
  const authorized = await admin.rpc("authorize_project_review_media", {
    p_edition_id: body.editionId,
    p_actor_id: caller.data.user.id,
  });
  if (authorized.error || !authorized.data) {
    return json({ error: "not_found" }, 404);
  }
  const manifest = parseAuthorizedMedia(
    authorized.data,
    body.editionId,
    caller.data.user.id,
  );
  if (!manifest) return json({ error: "invalid_media_manifest" }, 422);

  for (const asset of manifest.assets) {
    const object = await admin.storage.from(asset.bucket).download(asset.path);
    if (object.error || !object.data) {
      return json({ error: "media_unavailable" }, 503);
    }
    const bytes = await object.data.arrayBuffer();
    if (
      bytes.byteLength !== asset.sizeBytes ||
      await sha256Hex(bytes) !== asset.sha256
    ) {
      return json({ error: "media_integrity_failed" }, 409);
    }
  }
  if (manifest.assets.length === 0) {
    return json({ urls: [], expiresInSeconds: 300 });
  }
  const signed = await admin.storage.from("project-review-media")
    .createSignedUrls(manifest.assets.map((asset) => asset.path), 300);
  if (signed.error || signed.data?.length !== manifest.assets.length) {
    return json({ error: "media_unavailable" }, 503);
  }
  return json({
    urls: manifest.assets.map((asset, index) => ({
      assetId: asset.assetId,
      signedUrl: signed.data![index].signedUrl,
    })),
    expiresInSeconds: 300,
  });
});
