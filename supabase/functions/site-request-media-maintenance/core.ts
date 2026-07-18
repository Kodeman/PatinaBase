export const SITE_REQUEST_MEDIA_BUCKET = "site-requests";
export const DERIVE_LIMIT = 25;
export const PURGE_REQUEST_LIMIT = 25;
export const MAX_DERIVE_ATTEMPTS = 5;
export const PROCESSABLE_IMAGE_MIME_TYPES = [
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export interface SiteMediaRow {
  id: string;
  deliverable_id: string;
  object_path: string;
  mime_type: string;
  upload_state: string;
  derivatives: Record<string, unknown> | null;
  derive_attempts: number;
  purged_at: string | null;
}

export function bearerRole(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const parts = header.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
    const value = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof value.role === "string" ? value.role : null;
  } catch {
    return null;
  }
}

export function isProcessableImage(mimeType: string): boolean {
  return (PROCESSABLE_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function validImmutableObjectPath(path: string): boolean {
  const parts = path.split("/");
  return parts.length === 4 &&
    parts.every((part) => part.length > 0 && part !== "." && part !== "..") &&
    /^[0-9a-f-]{36}$/i.test(parts[0]) &&
    /^[0-9a-f-]{36}$/i.test(parts[1]) &&
    /^\d+$/.test(parts[2]) &&
    /^[A-Za-z0-9._-]+$/.test(parts[3]);
}

export function derivativePaths(
  row: Pick<SiteMediaRow, "id" | "object_path">,
): {
  thumbnail: string;
  preview: string;
} {
  if (!validImmutableObjectPath(row.object_path)) {
    throw new Error("invalid immutable Site Request media path");
  }
  const directory = row.object_path.split("/").slice(0, -1).join("/");
  return {
    thumbnail: `${directory}/derivatives/${row.id}_512.jpg`,
    preview: `${directory}/derivatives/${row.id}_1600.jpg`,
  };
}

export function derivativeObjectPaths(
  derivatives: Record<string, unknown> | null,
): string[] {
  if (!derivatives) return [];
  return [derivatives.thumbnail_path, derivatives.preview_path]
    .filter((value): value is string =>
      typeof value === "string" && validDerivativePath(value)
    );
}

function validDerivativePath(path: string): boolean {
  const parts = path.split("/");
  return parts.length === 5 &&
    parts[3] === "derivatives" &&
    validImmutableObjectPath(`${parts.slice(0, 3).join("/")}/source.jpg`) &&
    /^[A-Za-z0-9._-]+$/.test(parts[4]);
}

export function b64Bytes(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
}
