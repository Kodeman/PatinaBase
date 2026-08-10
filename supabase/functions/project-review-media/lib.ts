export function isSafeDerivativePath(path: string): boolean {
  return /^project-review\/[^/]+\/[a-f0-9]{64}\.[a-z0-9]+$/i.test(path);
}
export const MAX_REVIEW_MEDIA = 50;
export type AuthorizedDerivative = { path: string; sha256: string };
export function authorizedDerivatives(value: unknown): AuthorizedDerivative[] {
  const records = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).derivatives) ? (value as Record<string, unknown>).derivatives as unknown[] : [];
  if (!Array.isArray(records)) return [];
  const seen = new Set<string>();
  return records.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const path = typeof row.path === "string" ? row.path : "";
    const sha256 = typeof row.sha256 === "string" ? row.sha256.toLowerCase() : "";
    if (!isSafeDerivativePath(path) || !/^[a-f0-9]{64}$/.test(sha256) || seen.has(path) || seen.size >= MAX_REVIEW_MEDIA) return [];
    seen.add(path); return [{ path, sha256 }];
  });
}
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
