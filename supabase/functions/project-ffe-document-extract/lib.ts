export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_ROWS = 5_000;

export type ExtractRequest = { stagingUploadId: string; projectId: string };

export function parseExtractRequest(value: unknown): ExtractRequest | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return typeof row.stagingUploadId === 'string' && row.stagingUploadId && typeof row.projectId === 'string' && row.projectId
    ? { stagingUploadId: row.stagingUploadId, projectId: row.projectId }
    : null;
}

/** Keep Claude output as staging-only rows; live selections are exclusively
 * created by commit_project_ffe_import / place_product_in_project_v2. */
export function extractionPrompt(): string {
  return 'Extract FF&E rows from this PDF. Return JSON only: {"rows":[{"page":number,"name":string,"quantity":number|null,"room":string|null,"category":string|null,"manufacturer":string|null,"sourcePrice":number|null,"confidence":number}]}. Never infer approval, authority, cost, markup, or a client verdict.';
}

export function validateExtraction(value: unknown): { rows: Array<Record<string, unknown>> } | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).rows)) return null;
  const rows = (value as { rows: unknown[] }).rows;
  if (rows.length > MAX_ROWS) return null;
  const safe = rows.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const page = row.page;
    const confidence = row.confidence;
    if (!name || name.length > 500 || !Number.isInteger(page) || (page as number) < 1 || (page as number) > 10_000 || typeof confidence !== "number" || confidence < 0 || confidence > 1) return null;
    return { ...row, name };
  });
  return safe.every(Boolean) ? { rows: safe as Array<Record<string, unknown>> } : null;
}

export function base64Chunks(bytes: Uint8Array, chunkSize = 0x6000): string {
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) encoded += btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  return encoded;
}
