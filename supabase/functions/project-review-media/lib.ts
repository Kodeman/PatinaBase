export const MAX_REVIEW_MEDIA = 50;
export const MAX_REVIEW_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_REVIEW_MEDIA_TOTAL_BYTES = 50 * 1024 * 1024;
const REVIEW_BUCKET = "project-review-media";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type MediaRequest = { editionId: string };
export type AuthorizedDerivative = {
  assetId: string;
  bucket: typeof REVIEW_BUCKET;
  path: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
};

export function parseMediaRequest(value: unknown): MediaRequest | null {
  if (!value || typeof value !== "object") return null;
  const editionId = (value as Record<string, unknown>).editionId;
  return typeof editionId === "string" && UUID.test(editionId.trim())
    ? { editionId: editionId.trim().toLowerCase() }
    : null;
}

export function isSafeDerivativePath(path: string, projectId: string): boolean {
  if (path.length === 0 || path.length > 1024 || !path.startsWith(`${projectId}/`)) return false;
  if (/[\\?#\u0000-\u001f\u007f]/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function parseAuthorizedMedia(
  value: unknown,
  editionId: string,
  actorId: string,
): { assets: AuthorizedDerivative[] } | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const projectId = typeof root.projectId === "string" ? root.projectId.toLowerCase() : "";
  if (
    root.editionId !== editionId || root.actorId !== actorId || !UUID.test(projectId) ||
    !Array.isArray(root.media) || root.media.length > MAX_REVIEW_MEDIA
  ) return null;
  const seenAssets = new Set<string>();
  const seenPaths = new Set<string>();
  let totalBytes = 0;
  const assets: AuthorizedDerivative[] = [];

  for (const entry of root.media) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    const assetId = typeof row.assetId === "string" ? row.assetId.toLowerCase() : "";
    const bucket = row.bucket;
    const path = typeof row.path === "string" ? row.path : "";
    const sha256 = typeof row.checksumSha256 === "string" ? row.checksumSha256.toLowerCase() : "";
    const sizeBytes = row.sizeBytes;
    const contentType = typeof row.contentType === "string" ? row.contentType.toLowerCase() : "";
    if (
      !UUID.test(assetId) || bucket !== REVIEW_BUCKET || !isSafeDerivativePath(path, projectId) ||
      !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(sizeBytes) || (sizeBytes as number) <= 0 ||
      (sizeBytes as number) > MAX_REVIEW_MEDIA_BYTES || !CONTENT_TYPES.has(contentType) ||
      seenAssets.has(assetId) || seenPaths.has(path)
    ) return null;
    totalBytes += sizeBytes as number;
    if (totalBytes > MAX_REVIEW_MEDIA_TOTAL_BYTES) return null;
    seenAssets.add(assetId);
    seenPaths.add(path);
    assets.push({ assetId, bucket: REVIEW_BUCKET, path, sha256, sizeBytes: sizeBytes as number, contentType });
  }
  return { assets };
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
