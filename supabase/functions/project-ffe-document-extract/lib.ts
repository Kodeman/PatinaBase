export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_ROWS = 5_000;
export const EXTRACTION_TOOL_NAME = "stage_project_ffe_rows";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROW_KEYS = new Set(["page", "name", "quantity", "room", "category", "manufacturer", "sourcePrice", "confidence"]);

export type ExtractRequest = { assetId: string; projectId: string };
export type ExtractSource = {
  assetId: string;
  projectId: string;
  actorId: string;
  bucket: "project-ffe-working";
  path: string;
  checksumSha256: string;
  sizeBytes: number;
  contentType: "application/pdf";
};
export type ExtractionRow = {
  page: number;
  name: string;
  quantity: number | null;
  room: string | null;
  category: string | null;
  manufacturer: string | null;
  sourcePrice: number | null;
  confidence: number;
};

export function parseExtractRequest(value: unknown): ExtractRequest | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const assetId = typeof row.assetId === "string" ? row.assetId.trim().toLowerCase() : "";
  const projectId = typeof row.projectId === "string" ? row.projectId.trim().toLowerCase() : "";
  return UUID.test(assetId) && UUID.test(projectId) ? { assetId, projectId } : null;
}

export function parseExtractSource(value: unknown, request: ExtractRequest, actorId: string): ExtractSource | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const sourceAssetId = typeof row.assetId === "string" ? row.assetId.toLowerCase() : "";
  const sourceProjectId = typeof row.projectId === "string" ? row.projectId.toLowerCase() : "";
  const sourceActorId = typeof row.actorId === "string" ? row.actorId.toLowerCase() : "";
  const path = typeof row.path === "string" ? row.path : "";
  const checksumSha256 = typeof row.checksumSha256 === "string" ? row.checksumSha256.toLowerCase() : "";
  const sizeBytes = row.sizeBytes;
  if (
    sourceAssetId !== request.assetId || sourceProjectId !== request.projectId || sourceActorId !== actorId ||
    row.bucket !== "project-ffe-working" || row.contentType !== "application/pdf" ||
    !path.startsWith(`${request.projectId}/`) || path.length > 1024 || /[\\?#\u0000-\u001f\u007f]/.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
    !/^[a-f0-9]{64}$/.test(checksumSha256) || !Number.isSafeInteger(sizeBytes) ||
    (sizeBytes as number) <= 0 || (sizeBytes as number) > MAX_PDF_BYTES
  ) return null;
  return {
    assetId: sourceAssetId,
    projectId: sourceProjectId,
    actorId: sourceActorId,
    bucket: "project-ffe-working",
    path,
    checksumSha256,
    sizeBytes: sizeBytes as number,
    contentType: "application/pdf",
  };
}

export function extractionPrompt(): string {
  return "Extract only explicit FF&E facts from the PDF. Never infer approval, authority, trade cost, markup, or a client verdict. Preserve the PDF page number and give a 0–1 confidence for every row. Submit all rows with the provided tool.";
}

const nullableStringSchema = (maxLength: number) => ({ type: ["string", "null"], maxLength });

export function extractionTool() {
  return {
    name: EXTRACTION_TOOL_NAME,
    description: "Return schema-constrained FF&E rows for staging; this never creates live project selections.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["rows"],
      properties: {
        rows: {
          type: "array",
          maxItems: MAX_ROWS,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["page", "name", "quantity", "room", "category", "manufacturer", "sourcePrice", "confidence"],
            properties: {
              page: { type: "integer", minimum: 1, maximum: 10_000 },
              name: { type: "string", minLength: 1, maxLength: 500 },
              quantity: { type: ["number", "null"], exclusiveMinimum: 0, maximum: 1_000_000 },
              room: nullableStringSchema(200),
              category: nullableStringSchema(200),
              manufacturer: nullableStringSchema(300),
              sourcePrice: { type: ["number", "null"], minimum: 0, maximum: 1_000_000_000_000 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
  };
}

function nullableText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed || null : undefined;
}

export function validateExtraction(value: unknown): { rows: ExtractionRow[] } | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).rows)) return null;
  if (Object.keys(value as Record<string, unknown>).some((key) => key !== "rows")) return null;
  const rows = (value as { rows: unknown[] }).rows;
  if (rows.length > MAX_ROWS) return null;
  const safe: ExtractionRow[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (Object.keys(row).some((key) => !ROW_KEYS.has(key)) || Object.keys(row).length !== ROW_KEYS.size) return null;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const room = nullableText(row.room, 200);
    const category = nullableText(row.category, 200);
    const manufacturer = nullableText(row.manufacturer, 300);
    if (
      !name || name.length > 500 || !Number.isInteger(row.page) || (row.page as number) < 1 || (row.page as number) > 10_000 ||
      (row.quantity !== null && (typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > 1_000_000)) ||
      room === undefined || category === undefined || manufacturer === undefined ||
      (row.sourcePrice !== null && (typeof row.sourcePrice !== "number" || !Number.isFinite(row.sourcePrice) || row.sourcePrice < 0 || row.sourcePrice > 1_000_000_000_000)) ||
      typeof row.confidence !== "number" || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1
    ) return null;
    safe.push({
      page: row.page as number,
      name,
      quantity: row.quantity as number | null,
      room,
      category,
      manufacturer,
      sourcePrice: row.sourcePrice as number | null,
      confidence: row.confidence,
    });
  }
  return { rows: safe };
}

export function base64Chunks(bytes: Uint8Array, chunkSize = 0x6000): string {
  if (chunkSize <= 0 || chunkSize % 3 !== 0) throw new Error("base64 chunk size must be a positive multiple of three");
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) encoded += btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  return encoded;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
