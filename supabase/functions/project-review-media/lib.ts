export const MAX_REVIEW_MEDIA = 50;
export const MAX_REVIEW_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_REVIEW_MEDIA_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_PREPARE_SOURCE_BYTES = 10 * 1024 * 1024;
const REVIEW_BUCKET = "project-review-media";
const WORKING_BUCKET = "project-ffe-working";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DERIVATIVE_KINDS = new Set(["thumbnail", "display", "print"]);
const MAX_RASTER_DIMENSION = 100_000;

export type ResolveMediaRequest = { action: "resolve"; editionId: string };
export type PrepareMediaRequest = {
  action: "prepare";
  projectId: string;
  sourceBucket: typeof WORKING_BUCKET;
  sourcePath: string;
  derivativeKind: "thumbnail" | "display" | "print";
};
export type MediaRequest = ResolveMediaRequest | PrepareMediaRequest;
export type AuthorizedDerivative = {
  assetId: string;
  bucket: typeof REVIEW_BUCKET;
  path: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
};

export type AuthorizedSource = {
  sourceAssetId: string;
  projectId: string;
  actorId: string;
  bucket: typeof WORKING_BUCKET;
  path: string;
  checksumSha256: string;
  sizeBytes: number;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export type RegisteredSource = AuthorizedSource & {
  ffeItemId: null;
  mediaKind: "board_reference";
  reused: boolean;
};

export type PreparedDerivative = {
  assetId: string;
  sourceAssetId: string;
  projectId: string;
  bucket: typeof REVIEW_BUCKET;
  path: string;
  checksumSha256: string;
  sizeBytes: number;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  derivativeKind: "thumbnail" | "display" | "print";
  width: number;
  height: number;
  reused: boolean;
};

export const preparedResponse = (prepared: PreparedDerivative) => ({
  assetId: prepared.assetId,
  checksumSha256: prepared.checksumSha256,
  path: prepared.path,
  derivativeKind: prepared.derivativeKind,
  reused: prepared.reused,
});

export function parseMediaRequest(value: unknown): MediaRequest | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.action === "prepare") {
    const projectId = typeof row.projectId === "string"
      ? row.projectId.trim().toLowerCase()
      : "";
    const path = typeof row.sourcePath === "string" ? row.sourcePath : "";
    if (
      !UUID.test(projectId) || row.sourceBucket !== WORKING_BUCKET ||
      !isSafeDerivativePath(path, projectId) ||
      !DERIVATIVE_KINDS.has(String(row.derivativeKind))
    ) return null;
    return {
      action: "prepare",
      projectId,
      sourceBucket: WORKING_BUCKET,
      sourcePath: path,
      derivativeKind: row
        .derivativeKind as PrepareMediaRequest["derivativeKind"],
    };
  }
  const editionId = row.editionId;
  return (row.action === undefined || row.action === "resolve") &&
      typeof editionId === "string" && UUID.test(editionId.trim())
    ? { action: "resolve", editionId: editionId.trim().toLowerCase() }
    : null;
}

export function isSafeDerivativePath(path: string, projectId: string): boolean {
  if (
    path.length === 0 || path.length > 1024 || !path.startsWith(`${projectId}/`)
  ) return false;
  if (path.includes("://") || /[\\?#\u0000-\u001f\u007f]/.test(path)) {
    return false;
  }
  const segments = path.split("/");
  return segments.every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".."
  );
}

export function parseAuthorizedMedia(
  value: unknown,
  editionId: string,
  actorId: string,
): { assets: AuthorizedDerivative[] } | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const projectId = typeof root.projectId === "string"
    ? root.projectId.toLowerCase()
    : "";
  if (
    root.editionId !== editionId || root.actorId !== actorId ||
    !UUID.test(projectId) ||
    !Array.isArray(root.media) || root.media.length > MAX_REVIEW_MEDIA
  ) return null;
  const seenAssets = new Set<string>();
  const seenPaths = new Set<string>();
  let totalBytes = 0;
  const assets: AuthorizedDerivative[] = [];

  for (const entry of root.media) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    const assetId = typeof row.assetId === "string"
      ? row.assetId.toLowerCase()
      : "";
    const bucket = row.bucket;
    const path = typeof row.path === "string" ? row.path : "";
    const sha256 = typeof row.checksumSha256 === "string"
      ? row.checksumSha256.toLowerCase()
      : "";
    const sizeBytes = row.sizeBytes;
    const contentType = typeof row.contentType === "string"
      ? row.contentType.toLowerCase()
      : "";
    if (
      !UUID.test(assetId) || bucket !== REVIEW_BUCKET ||
      !isSafeDerivativePath(path, projectId) ||
      !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(sizeBytes) ||
      (sizeBytes as number) <= 0 ||
      (sizeBytes as number) > MAX_REVIEW_MEDIA_BYTES ||
      !CONTENT_TYPES.has(contentType) ||
      seenAssets.has(assetId) || seenPaths.has(path)
    ) return null;
    totalBytes += sizeBytes as number;
    if (totalBytes > MAX_REVIEW_MEDIA_TOTAL_BYTES) return null;
    seenAssets.add(assetId);
    seenPaths.add(path);
    assets.push({
      assetId,
      bucket: REVIEW_BUCKET,
      path,
      sha256,
      sizeBytes: sizeBytes as number,
      contentType,
    });
  }
  return { assets };
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function authorizeSourceArgs(
  request: PrepareMediaRequest,
  actorId: string,
) {
  return {
    p_project_id: request.projectId,
    p_actor_id: actorId,
    p_source_bucket: request.sourceBucket,
    p_source_path: request.sourcePath,
  };
}

export function registerSourceArgs(
  request: PrepareMediaRequest,
  actorId: string,
  checksumSha256: string,
  sizeBytes: number,
  contentType: AuthorizedSource["contentType"],
) {
  return {
    p_project_id: request.projectId,
    p_actor_id: actorId,
    p_bucket: request.sourceBucket,
    p_path: request.sourcePath,
    p_checksum_sha256: checksumSha256,
    p_size_bytes: sizeBytes,
    p_content_type: contentType,
    p_media_kind: "board_reference",
    p_ffe_item_id: null,
  };
}

export function parseRegisteredSource(
  value: unknown,
  request: PrepareMediaRequest,
  actorId: string,
  checksumSha256: string,
  sizeBytes: number,
  contentType: AuthorizedSource["contentType"],
): RegisteredSource | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const sourceAssetId = typeof row.sourceAssetId === "string"
    ? row.sourceAssetId.toLowerCase()
    : "";
  if (
    !UUID.test(sourceAssetId) || row.projectId !== request.projectId ||
    row.actorId !== actorId || row.ffeItemId !== null ||
    row.bucket !== request.sourceBucket || row.path !== request.sourcePath ||
    row.checksumSha256 !== checksumSha256 ||
    row.sizeBytes !== sizeBytes || row.contentType !== contentType ||
    row.mediaKind !== "board_reference" || typeof row.reused !== "boolean"
  ) return null;
  return {
    sourceAssetId,
    projectId: request.projectId,
    actorId,
    ffeItemId: null,
    bucket: WORKING_BUCKET,
    path: request.sourcePath,
    checksumSha256,
    sizeBytes,
    contentType,
    mediaKind: "board_reference",
    reused: row.reused,
  };
}

export function parseAuthorizedSource(
  value: unknown,
  request: PrepareMediaRequest,
  actorId: string,
): AuthorizedSource | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const sourceAssetId = typeof row.sourceAssetId === "string"
    ? row.sourceAssetId.toLowerCase()
    : "";
  const checksumSha256 = typeof row.checksumSha256 === "string"
    ? row.checksumSha256.toLowerCase()
    : "";
  const sizeBytes = row.sizeBytes;
  const contentType = typeof row.contentType === "string"
    ? row.contentType.toLowerCase()
    : "";
  if (
    !UUID.test(sourceAssetId) || row.projectId !== request.projectId ||
    row.actorId !== actorId ||
    row.bucket !== request.sourceBucket || row.path !== request.sourcePath ||
    row.width !== null || row.height !== null ||
    !/^[a-f0-9]{64}$/.test(checksumSha256) ||
    !Number.isSafeInteger(sizeBytes) ||
    (sizeBytes as number) <= 0 ||
    (sizeBytes as number) > MAX_PREPARE_SOURCE_BYTES ||
    !CONTENT_TYPES.has(contentType)
  ) return null;
  return {
    sourceAssetId,
    projectId: request.projectId,
    actorId,
    bucket: WORKING_BUCKET,
    path: request.sourcePath,
    checksumSha256,
    sizeBytes: sizeBytes as number,
    contentType: contentType as AuthorizedSource["contentType"],
  };
}

export class PrepareMediaError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "PrepareMediaError";
  }
}

export type PrepareMediaDependencies = {
  registerSource: (
    args: ReturnType<typeof registerSourceArgs>,
  ) => Promise<unknown>;
  authorize: (args: ReturnType<typeof authorizeSourceArgs>) => Promise<unknown>;
  download: (bucket: string, path: string) => Promise<ArrayBuffer | null>;
  uploadIfAbsent: (
    bucket: string,
    path: string,
    bytes: ArrayBuffer,
    contentType: string,
  ) => Promise<boolean>;
  register: (args: ReturnType<typeof registerPreparedArgs>) => Promise<unknown>;
};

export async function prepareReviewMedia(
  request: PrepareMediaRequest,
  actorId: string,
  dependencies: PrepareMediaDependencies,
): Promise<PreparedDerivative> {
  const bytes = await dependencies.download(
    request.sourceBucket,
    request.sourcePath,
  );
  if (!bytes) throw new PrepareMediaError("source_unavailable", 503);
  const raster = detectRasterMetadata(bytes);
  const checksum = await sha256Hex(bytes);
  if (
    !raster || bytes.byteLength <= 0 ||
    bytes.byteLength > MAX_PREPARE_SOURCE_BYTES
  ) {
    throw new PrepareMediaError("unsupported_source", 415);
  }
  const { contentType, width, height } = raster;
  const registeredValue = await dependencies.registerSource(
    registerSourceArgs(
      request,
      actorId,
      checksum,
      bytes.byteLength,
      contentType,
    ),
  );
  const registeredSource = parseRegisteredSource(
    registeredValue,
    request,
    actorId,
    checksum,
    bytes.byteLength,
    contentType,
  );
  if (!registeredSource) {
    throw new PrepareMediaError("invalid_source_registration", 502);
  }
  const authorizedValue = await dependencies.authorize(
    authorizeSourceArgs(request, actorId),
  );
  const source = parseAuthorizedSource(authorizedValue, request, actorId);
  if (
    !source || source.sourceAssetId !== registeredSource.sourceAssetId ||
    source.checksumSha256 !== checksum ||
    source.sizeBytes !== bytes.byteLength || source.contentType !== contentType
  ) {
    throw new PrepareMediaError("invalid_source_manifest", 422);
  }
  const path = derivativePath(
    request.projectId,
    request.derivativeKind,
    checksum,
    contentType,
  );
  await dependencies.uploadIfAbsent(REVIEW_BUCKET, path, bytes, contentType);
  const uploaded = await dependencies.download(REVIEW_BUCKET, path);
  if (!uploaded) throw new PrepareMediaError("derivative_unavailable", 503);
  if (
    uploaded.byteLength !== bytes.byteLength ||
    await sha256Hex(uploaded) !== checksum ||
    detectRasterContentType(uploaded) !== contentType
  ) throw new PrepareMediaError("derivative_integrity_failed", 409);
  const registeredDerivativeValue = await dependencies.register(
    registerPreparedArgs(request, actorId, source, path, width, height),
  );
  const registered = parsePreparedDerivative(
    registeredDerivativeValue,
    request,
    source,
    path,
    width,
    height,
  );
  if (!registered) throw new PrepareMediaError("invalid_prepared_asset", 502);
  return registered;
}

export function detectRasterContentType(
  bytes: ArrayBuffer,
): AuthorizedSource["contentType"] | null {
  const view = new Uint8Array(bytes);
  if (
    view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff
  ) return "image/jpeg";
  if (
    view.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) =>
      view[index] === byte
    )
  ) return "image/png";
  if (
    view.length >= 12 &&
    new TextDecoder().decode(view.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(view.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

export function detectRasterMetadata(
  bytes: ArrayBuffer,
): {
  contentType: AuthorizedSource["contentType"];
  width: number;
  height: number;
} | null {
  const view = new Uint8Array(bytes);
  const contentType = detectRasterContentType(bytes);
  const valid = (width: number, height: number) =>
    width > 0 && height > 0 && width <= MAX_RASTER_DIMENSION &&
    height <= MAX_RASTER_DIMENSION;
  if (
    contentType === "image/png" && view.length >= 24 &&
    new TextDecoder().decode(view.slice(12, 16)) === "IHDR"
  ) {
    const data = new DataView(bytes);
    const width = data.getUint32(16, false);
    const height = data.getUint32(20, false);
    return valid(width, height) ? { contentType, width, height } : null;
  }
  if (contentType === "image/jpeg") {
    let offset = 2;
    while (offset + 8 < view.length) {
      if (view[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = view[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = (view[offset + 2] << 8) | view[offset + 3];
      if (length < 2 || offset + 2 + length > view.length) return null;
      if (
        [
          0xc0,
          0xc1,
          0xc2,
          0xc3,
          0xc5,
          0xc6,
          0xc7,
          0xc9,
          0xca,
          0xcb,
          0xcd,
          0xce,
          0xcf,
        ].includes(marker)
      ) {
        const height = (view[offset + 5] << 8) | view[offset + 6];
        const width = (view[offset + 7] << 8) | view[offset + 8];
        return valid(width, height) ? { contentType, width, height } : null;
      }
      offset += 2 + length;
    }
  }
  if (contentType === "image/webp" && view.length >= 30) {
    const chunk = new TextDecoder().decode(view.slice(12, 16));
    if (chunk === "VP8X") {
      const width = 1 + view[24] + (view[25] << 8) + (view[26] << 16);
      const height = 1 + view[27] + (view[28] << 8) + (view[29] << 16);
      return valid(width, height) ? { contentType, width, height } : null;
    }
    if (
      chunk === "VP8 " && view[23] === 0x9d && view[24] === 0x01 &&
      view[25] === 0x2a
    ) {
      const width = (view[26] | (view[27] << 8)) & 0x3fff;
      const height = (view[28] | (view[29] << 8)) & 0x3fff;
      return valid(width, height) ? { contentType, width, height } : null;
    }
    if (chunk === "VP8L" && view[20] === 0x2f) {
      const width = 1 + view[21] + ((view[22] & 0x3f) << 8);
      const height = 1 + ((view[22] & 0xc0) >> 6) + (view[23] << 2) +
        ((view[24] & 0x0f) << 10);
      return valid(width, height) ? { contentType, width, height } : null;
    }
  }
  return null;
}

const extensionFor = (contentType: AuthorizedSource["contentType"]) =>
  contentType === "image/jpeg"
    ? "jpg"
    : contentType === "image/png"
    ? "png"
    : "webp";

export function derivativePath(
  projectId: string,
  derivativeKind: PrepareMediaRequest["derivativeKind"],
  checksumSha256: string,
  contentType: AuthorizedSource["contentType"],
): string {
  return `${projectId}/prepared/${derivativeKind}/${checksumSha256}.${
    extensionFor(contentType)
  }`;
}

export function registerPreparedArgs(
  request: PrepareMediaRequest,
  actorId: string,
  source: AuthorizedSource,
  path: string,
  width: number,
  height: number,
) {
  return {
    p_project_id: request.projectId,
    p_actor_id: actorId,
    p_source_bucket: source.bucket,
    p_source_path: source.path,
    p_source_checksum: source.checksumSha256,
    p_source_size: source.sizeBytes,
    p_content_type: source.contentType,
    p_derivative_bucket: REVIEW_BUCKET,
    p_derivative_path: path,
    p_derivative_checksum: source.checksumSha256,
    p_derivative_size: source.sizeBytes,
    p_derivative_kind: request.derivativeKind,
    p_width: width,
    p_height: height,
  };
}

export function parsePreparedDerivative(
  value: unknown,
  request: PrepareMediaRequest,
  source: AuthorizedSource,
  expectedPath: string,
  expectedWidth: number,
  expectedHeight: number,
): PreparedDerivative | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const assetId = typeof row.assetId === "string"
    ? row.assetId.toLowerCase()
    : "";
  if (
    !UUID.test(assetId) || row.sourceAssetId !== source.sourceAssetId ||
    row.projectId !== request.projectId ||
    row.bucket !== REVIEW_BUCKET || row.path !== expectedPath ||
    row.checksumSha256 !== source.checksumSha256 ||
    row.sizeBytes !== source.sizeBytes ||
    row.contentType !== source.contentType ||
    row.derivativeKind !== request.derivativeKind ||
    row.width !== expectedWidth || row.height !== expectedHeight ||
    typeof row.reused !== "boolean"
  ) return null;
  return {
    assetId,
    sourceAssetId: source.sourceAssetId,
    projectId: request.projectId,
    bucket: REVIEW_BUCKET,
    path: expectedPath,
    checksumSha256: source.checksumSha256,
    sizeBytes: source.sizeBytes,
    contentType: source.contentType,
    derivativeKind: request.derivativeKind,
    width: expectedWidth,
    height: expectedHeight,
    reused: row.reused,
  };
}
