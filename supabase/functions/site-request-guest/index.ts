// Public Site Request guest API. The request-scoped opaque Bearer token is
// the credential; verify_jwt is deliberately disabled in config.toml and this
// handler hashes the token before creating any service-role client/calling any
// RPC. Guests never receive a Supabase JWT, service key, or table access.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleSiteRequestGuest,
  type SiteRequestGuestDeps,
  type UploadBinding,
} from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_SUPABASE_URL = Deno.env.get("PUBLIC_SUPABASE_URL") ?? SUPABASE_URL;

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const { data, error } = await admin().rpc(name, args);
  if (error) throw new Error(`${name}_failed`);
  return (Array.isArray(data) ? data[0] : data) as T | null;
}

const deps: SiteRequestGuestDeps = {
  sha256Hex: async (rawToken) => {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(rawToken),
    );
    return Array.from(
      new Uint8Array(bytes),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  },
  bootstrap: (tokenHash) =>
    rpc("site_request_guest_bootstrap", { p_token_hash: tokenHash }),
  createUpload: (tokenHash, input) =>
    rpc<UploadBinding>("site_request_guest_create_upload", {
      p_token_hash: tokenHash,
      p_item_version_id: input.itemVersionId,
      p_client_attempt_id: input.clientAttemptId,
      p_filename: input.filename,
      p_mime_type: input.mimeType,
      p_checksum_sha256: input.checksumSha256,
      p_size_bytes: input.sizeBytes,
    }),
  signUpload: async (bucketId, objectPath) => {
    const { data, error } = await admin()
      .storage.from(bucketId)
      .createSignedUploadUrl(objectPath, { upsert: false });
    if (error || !data) throw new Error("sign_upload_failed");
    return {
      ...data,
      signedUrl: data.signedUrl.replace(SUPABASE_URL, PUBLIC_SUPABASE_URL),
    };
  },
  verifyUpload: async (
    bucketId,
    objectPath,
    expectedChecksumSha256,
    expectedSizeBytes,
  ) => {
    const { data, error } = await admin()
      .storage.from(bucketId)
      .download(objectPath);
    if (error || !data || data.size !== expectedSizeBytes) {
      return { exists: !!data, verified: false, sizeBytes: data?.size ?? 0 };
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await data.arrayBuffer(),
    );
    const actual = Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    return {
      exists: true,
      verified: actual === expectedChecksumSha256,
      sizeBytes: data.size,
    };
  },
  acknowledgeUpload: (tokenHash, input) =>
    rpc("site_request_guest_ack_upload", {
      p_token_hash: tokenHash,
      p_media_id: input.mediaId,
      p_storage_etag: input.storageEtag ?? null,
      p_size_bytes: input.sizeBytes,
    }),
  deliver: (tokenHash, input) =>
    rpc("site_request_guest_deliver", {
      p_token_hash: tokenHash,
      p_item_version_id: input.itemVersionId,
      p_client_attempt_id: input.clientAttemptId,
      p_payload: input.payload,
      p_dimensions: input.dimensions,
      p_captured_by_name: input.capturedByName ?? null,
      p_captured_at: input.capturedAt,
    }),
};

Deno.serve((req) => handleSiteRequestGuest(req, deps));
