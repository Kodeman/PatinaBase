// Site Requests intentionally use a distinguishable namespace so universal
// links can claim /field/sr_* without hijacking legacy 64-hex Field links.
export const SITE_REQUEST_TOKEN_PATTERN = /^sr_[A-Za-z0-9_-]{43}$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export interface UploadBindingInput {
  itemVersionId: string;
  clientAttemptId: string;
  filename: string;
  mimeType: string;
  checksumSha256: string;
  sizeBytes: number;
}

export interface UploadBinding {
  request_id: string;
  item_id: string;
  item_version_id: string;
  deliverable_id: string;
  media_id: string;
  attempt_number: number;
  bucket_id: string;
  object_path: string;
  upload_state: string;
}

export interface SignedUpload {
  signedUrl: string;
  token: string;
  path: string;
}

export interface SiteRequestGuestDeps {
  sha256Hex(rawToken: string): Promise<string>;
  bootstrap(tokenHash: string): Promise<Record<string, unknown> | null>;
  createUpload(
    tokenHash: string,
    input: UploadBindingInput,
  ): Promise<UploadBinding | null>;
  signUpload(bucketId: string, objectPath: string): Promise<SignedUpload>;
  verifyUpload(
    bucketId: string,
    objectPath: string,
    expectedChecksumSha256: string,
    expectedSizeBytes: number,
  ): Promise<{ exists: boolean; verified: boolean; sizeBytes: number }>;
  acknowledgeUpload(
    tokenHash: string,
    input: { mediaId: string; storageEtag?: string; sizeBytes: number },
  ): Promise<Record<string, unknown> | null>;
  deliver(
    tokenHash: string,
    input: {
      itemVersionId: string;
      clientAttemptId: string;
      payload: Record<string, unknown>;
      dimensions: Array<Record<string, unknown>>;
      capturedByName?: string;
      capturedAt: string;
    },
  ): Promise<Record<string, unknown> | null>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim() ?? "";
  return SITE_REQUEST_TOKEN_PATTERN.test(token) ? token : null;
}

function actionFrom(req: Request, body: Record<string, unknown>): string {
  if (typeof body.action === "string") return body.action;
  const last = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ??
    "";
  return last === "site-request-guest" ? "" : last;
}

function stringField(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uploadInput(body: Record<string, unknown>): UploadBindingInput | null {
  const itemVersionId = stringField(body, "itemVersionId");
  const clientAttemptId = stringField(body, "clientAttemptId");
  const filename = stringField(body, "filename");
  const mimeType = stringField(body, "mimeType")?.toLowerCase() ?? null;
  const checksumSha256 = stringField(body, "checksumSha256")?.toLowerCase() ??
    null;
  const sizeBytes = body.sizeBytes;
  if (
    !itemVersionId ||
    !UUID_PATTERN.test(itemVersionId) ||
    !clientAttemptId ||
    !UUID_PATTERN.test(clientAttemptId) ||
    !filename ||
    !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}$/.test(filename) ||
    !mimeType ||
    !ALLOWED_IMAGE_TYPES.has(mimeType) ||
    !checksumSha256 ||
    !SHA256_PATTERN.test(checksumSha256) ||
    !Number.isSafeInteger(sizeBytes) ||
    (sizeBytes as number) <= 0 ||
    (sizeBytes as number) > MAX_IMAGE_BYTES
  ) {
    return null;
  }
  return {
    itemVersionId,
    clientAttemptId,
    filename,
    mimeType,
    checksumSha256,
    sizeBytes: sizeBytes as number,
  };
}

function validImmutablePath(binding: UploadBinding): boolean {
  if (
    !UUID_PATTERN.test(binding.request_id) ||
    !UUID_PATTERN.test(binding.item_id) ||
    !UUID_PATTERN.test(binding.item_version_id) ||
    !UUID_PATTERN.test(binding.deliverable_id) ||
    !UUID_PATTERN.test(binding.media_id) ||
    !Number.isSafeInteger(binding.attempt_number) ||
    binding.attempt_number < 1 ||
    binding.attempt_number > 10_000 ||
    binding.bucket_id !== "site-requests" ||
    binding.object_path.includes("..")
  ) {
    return false;
  }
  const prefix =
    `${binding.request_id}/${binding.item_version_id}/${binding.attempt_number}/`;
  return (
    binding.object_path.startsWith(prefix) &&
    binding.object_path.length > prefix.length
  );
}

function validDimensions(
  value: unknown,
): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 50) return false;
  return value.every((dimension) => {
    if (
      !dimension || typeof dimension !== "object" || Array.isArray(dimension)
    ) {
      return false;
    }
    const row = dimension as Record<string, unknown>;
    return (
      typeof row.label === "string" &&
      row.label.trim().length > 0 &&
      row.label.length <= 120 &&
      Number.isInteger(row.value_mm) &&
      (row.value_mm as number) > 0 &&
      (row.proof_media_id === undefined ||
        (typeof row.proof_media_id === "string" &&
          UUID_PATTERN.test(row.proof_media_id)))
    );
  });
}

export async function handleSiteRequestGuest(
  req: Request,
  deps: SiteRequestGuestDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rawToken = bearerToken(req);
  if (!rawToken) return json({ error: "invalid_or_expired_link" }, 401);
  let body: Record<string, unknown>;
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 64 * 1024) {
      return json({ error: "payload_too_large" }, 413);
    }
    const parsed = JSON.parse(rawBody);
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = actionFrom(req, body);
  const tokenHash = await deps.sha256Hex(rawToken);
  if (!SHA256_PATTERN.test(tokenHash)) {
    return json({ error: "request_failed" }, 500);
  }

  try {
    if (action === "bootstrap") {
      const data = await deps.bootstrap(tokenHash);
      return data
        ? json({ request: data })
        : json({ error: "invalid_or_expired_link" }, 404);
    }

    if (action === "upload-intent") {
      const input = uploadInput(body);
      if (!input) return json({ error: "invalid_upload" }, 422);
      const binding = await deps.createUpload(tokenHash, input);
      if (!binding) return json({ error: "invalid_or_expired_link" }, 404);
      if (!validImmutablePath(binding)) {
        return json({ error: "invalid_upload_path" }, 502);
      }
      const signed = await deps.signUpload(
        binding.bucket_id,
        binding.object_path,
      );
      if (
        signed.path !== binding.object_path ||
        !signed.signedUrl ||
        !signed.token
      ) {
        return json({ error: "upload_intent_failed" }, 502);
      }
      return json({
        mediaId: binding.media_id,
        deliverableId: binding.deliverable_id,
        bucketId: binding.bucket_id,
        objectPath: binding.object_path,
        uploadUrl: signed.signedUrl,
        uploadToken: signed.token,
      });
    }

    if (action === "receipt") {
      const input = uploadInput(body);
      const mediaId = stringField(body, "mediaId");
      const storageEtag = stringField(body, "storageEtag") ?? undefined;
      if (!input || !mediaId || !UUID_PATTERN.test(mediaId)) {
        return json({ error: "invalid_receipt" }, 422);
      }

      // Replaying begin-upload binds this receipt to the original immutable
      // filename + checksum. A changed checksum is rejected by the RPC rather
      // than being allowed to acknowledge somebody else's media row.
      const binding = await deps.createUpload(tokenHash, input);
      if (!binding || binding.media_id !== mediaId) {
        return json({ error: "invalid_or_expired_link" }, 404);
      }
      if (!validImmutablePath(binding)) {
        return json({ error: "invalid_upload_path" }, 502);
      }
      const verified = await deps.verifyUpload(
        binding.bucket_id,
        binding.object_path,
        input.checksumSha256,
        input.sizeBytes,
      );
      if (!verified.exists) return json({ error: "receipt_not_ready" }, 409);
      if (!verified.verified || verified.sizeBytes !== input.sizeBytes) {
        return json({ error: "receipt_checksum_mismatch" }, 409);
      }
      const receipt = await deps.acknowledgeUpload(tokenHash, {
        mediaId,
        storageEtag,
        sizeBytes: verified.sizeBytes,
      });
      return receipt
        ? json({ receipt })
        : json({ error: "receipt_not_ready" }, 409);
    }

    if (action === "deliver") {
      const itemVersionId = stringField(body, "itemVersionId");
      const clientAttemptId = stringField(body, "clientAttemptId");
      const capturedByName = stringField(body, "capturedByName") ?? undefined;
      const capturedAt = stringField(body, "capturedAt") ??
        new Date().toISOString();
      const payload = body.payload ?? {};
      const dimensions = body.dimensions ?? [];
      if (
        !itemVersionId ||
        !UUID_PATTERN.test(itemVersionId) ||
        !clientAttemptId ||
        !UUID_PATTERN.test(clientAttemptId) ||
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        !validDimensions(dimensions) ||
        (capturedByName && capturedByName.length > 160) ||
        Number.isNaN(Date.parse(capturedAt))
      ) {
        return json({ error: "invalid_delivery" }, 422);
      }
      const delivery = await deps.deliver(tokenHash, {
        itemVersionId,
        clientAttemptId,
        payload: payload as Record<string, unknown>,
        dimensions,
        capturedByName,
        capturedAt,
      });
      return delivery
        ? json({ delivery })
        : json({ error: "invalid_or_expired_link" }, 404);
    }

    return json({ error: "unknown_action" }, 404);
  } catch {
    // Fail closed and keep Postgres/storage implementation details out of the
    // public token-authenticated response.
    return json({ error: "request_conflict" }, 409);
  }
}
