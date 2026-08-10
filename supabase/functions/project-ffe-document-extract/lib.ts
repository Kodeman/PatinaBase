export const MAX_PDF_BYTES = 25 * 1024 * 1024;

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
