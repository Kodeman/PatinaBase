export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_ROWS = 5_000;
export const MAX_UNIT_PRICE_MINOR = 100_000_000;
export const EXTRACTION_TOOL_NAME = "stage_project_ffe_rows";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROW_KEYS_V1 = new Set(["pageNumber", "provenance", "name", "quantity", "roomName", "category"]);
const ROW_KEYS = new Set([...ROW_KEYS_V1, "maker", "sku", "unitPriceMinor", "currency", "priceBasis"]);
const PROVENANCE_KEYS_V1 = new Set(["page", "confidence"]);
const PROVENANCE_KEYS = new Set(["page", "confidence", "sourceKind"]);
const EXTRACTED_VALUE_KEYS = new Set(["value", "confidence", "state"]);

export type SchemaVersion = 1 | 2;
export type SourceKind = "pdf" | "photo";
export type ExtractRequest = { assetId: string; projectId: string; schemaVersion: SchemaVersion };
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
// schemaVersion 1: the row shape shipped before ruling D7.
export type ExtractionRowV1 = {
  pageNumber: number;
  provenance: { page: number; confidence: number };
  name: string;
  quantity: number;
  roomName: string | null;
  category: string | null;
};
// A commercial value is NEVER a bare scalar anywhere on the wire. A designer's
// confirmed value travels on the commit decision instead, so the two can never
// be mistaken for each other.
export type ExtractedValue<T> = {
  value: T;
  confidence: number;
  state: "unconfirmed";
};
export type ExtractionRow = {
  pageNumber: number;
  provenance: { page: number; confidence: number; sourceKind: SourceKind };
  name: string;
  quantity: number;
  roomName: string | null;
  category: string | null;
  maker: ExtractedValue<string> | null;
  sku: ExtractedValue<string> | null;
  unitPriceMinor: ExtractedValue<number> | null;
  currency: ExtractedValue<string> | null;
  priceBasis: "unknown";
};
export type ExtractionBatchResult = {
  batchId: string;
  status: "staged" | "committed" | "failed" | "abandoned";
  reused: boolean;
  rowCount: number;
  sourceAssetId: string;
  unconfirmedCommercialRows: number;
};

export function parseExtractRequest(value: unknown): ExtractRequest | "unsupported_schema_version" | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const assetId = typeof row.assetId === "string" ? row.assetId.trim().toLowerCase() : "";
  const projectId = typeof row.projectId === "string" ? row.projectId.trim().toLowerCase() : "";
  if (!UUID.test(assetId) || !UUID.test(projectId)) return null;
  const schemaVersion = row.schemaVersion === undefined ? 1 : row.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) return "unsupported_schema_version";
  return { assetId, projectId, schemaVersion };
}

export function parseExtractSource(
  value: unknown,
  request: Pick<ExtractRequest, "assetId" | "projectId">,
  actorId: string,
): ExtractSource | null {
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
    !/^[a-f0-9]{64}$/.test(checksumSha256) || !Number.isSafeInteger(sizeBytes) || (sizeBytes as number) <= 0
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

export function extractionPrompt(schemaVersion: SchemaVersion = 1): string {
  if (schemaVersion === 1) {
    return "Extract only explicit FF&E facts from the PDF. Never infer approval, authority, pricing, trade cost, markup, or a client verdict. Preserve the PDF page number in both pageNumber and provenance.page, use an integer quantity (default 1), and give provenance.confidence from 0–1. Submit all rows with the provided tool.";
  }
  // Ruling D7: maker, SKU, unit price and currency only — never markup, never a
  // client-vs-trade classification, and every reading is unconfirmed.
  return "Extract only explicit FF&E facts that are printed in the source. Read the commercial block — maker, SKU, unit price and currency — only when it is printed verbatim; never compute, convert or infer it, and never decide whether a printed price is a client price or a trade cost. Never infer approval, authority, markup, or a client verdict. Every commercial value you return is an unconfirmed reading a designer must confirm: set `state` to `\"unconfirmed\"` on each, and leave a commercial field null rather than guessing. Return the source page in both `pageNumber` and `provenance.page` — for a photograph, use 1 — set `provenance.sourceKind` to `\"pdf\"` or `\"photo\"`, use an integer quantity (default 1), and give `provenance.confidence` and each commercial value's own confidence from 0–1. Submit all rows with the provided tool.";
}

const nullableStringSchema = (maxLength: number) => ({ type: ["string", "null"], maxLength });
const extractedValueSchema = (value: Record<string, unknown>) => ({
  type: ["object", "null"],
  additionalProperties: false,
  required: ["value", "confidence", "state"],
  properties: {
    value,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    state: { const: "unconfirmed" },
  },
});

export function extractionTool(schemaVersion: SchemaVersion = 1) {
  const provenanceKeys = schemaVersion === 1 ? ["page", "confidence"] : ["page", "confidence", "sourceKind"];
  const commercial = schemaVersion === 1 ? {} : {
    maker: extractedValueSchema({ type: "string", minLength: 1, maxLength: 200 }),
    sku: extractedValueSchema({ type: "string", minLength: 1, maxLength: 200 }),
    unitPriceMinor: extractedValueSchema({ type: "integer", minimum: 0, maximum: MAX_UNIT_PRICE_MINOR }),
    currency: extractedValueSchema({ type: "string", pattern: "^[A-Z]{3}$" }),
    priceBasis: { const: "unknown" },
  };
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
            required: [...(schemaVersion === 1 ? ROW_KEYS_V1 : ROW_KEYS)],
            properties: {
              pageNumber: { type: "integer", minimum: 1, maximum: 10_000 },
              provenance: {
                type: "object",
                additionalProperties: false,
                required: provenanceKeys,
                properties: {
                  page: { type: "integer", minimum: 1, maximum: 10_000 },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  ...(schemaVersion === 1 ? {} : { sourceKind: { type: "string", enum: ["pdf", "photo"] } }),
                },
              },
              name: { type: "string", minLength: 1, maxLength: 500 },
              quantity: { type: "integer", minimum: 1, maximum: 1_000_000 },
              roomName: nullableStringSchema(200),
              category: nullableStringSchema(200),
              ...commercial,
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
  // A minus before a digit is a formula (-2+3+cmd|x) unless the text is a plain number.
  const formulaLike = /^[=+@]/.test(trimmed) || /^-[A-Za-z]/.test(trimmed) ||
    (/^-[0-9]/.test(trimmed) && !/^-[0-9]+(\.[0-9]+)?$/.test(trimmed));
  if (trimmed.length > maxLength || formulaLike || /[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  return trimmed || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
  return !Object.keys(value).some((key) => !keys.has(key)) && Object.keys(value).length === keys.size;
}

function validateRows<T>(value: unknown, parseRow: (row: Record<string, unknown>) => T | null): { rows: T[] } | null {
  if (!isRecord(value) || !Array.isArray(value.rows)) return null;
  if (Object.keys(value).some((key) => key !== "rows")) return null;
  if (value.rows.length > MAX_ROWS) return null;
  const safe: T[] = [];
  for (const entry of value.rows) {
    if (!isRecord(entry)) return null;
    const row = parseRow(entry);
    if (!row) return null;
    safe.push(row);
  }
  return { rows: safe };
}

function parseBaseRow(row: Record<string, unknown>, rowKeys: Set<string>, provenanceKeys: Set<string>): ExtractionRowV1 | null {
  if (!hasExactKeys(row, rowKeys)) return null;
  const name = nullableText(row.name, 500);
  const roomName = nullableText(row.roomName, 200);
  const category = nullableText(row.category, 200);
  const provenance = isRecord(row.provenance) ? row.provenance : null;
  if (
    !name || roomName === undefined || category === undefined || !provenance || !hasExactKeys(provenance, provenanceKeys) ||
    !Number.isInteger(row.pageNumber) || (row.pageNumber as number) < 1 || (row.pageNumber as number) > 10_000 ||
    !Number.isInteger(provenance.page) || provenance.page !== row.pageNumber ||
    typeof provenance.confidence !== "number" || !Number.isFinite(provenance.confidence) || provenance.confidence < 0 || provenance.confidence > 1 ||
    !Number.isInteger(row.quantity) || (row.quantity as number) < 1 || (row.quantity as number) > 1_000_000
  ) return null;
  return {
    pageNumber: row.pageNumber as number,
    provenance: { page: provenance.page as number, confidence: provenance.confidence as number },
    name,
    quantity: row.quantity as number,
    roomName,
    category,
  };
}

export function validateExtraction(value: unknown): { rows: ExtractionRowV1[] } | null {
  return validateRows(value, (row) => parseBaseRow(row, ROW_KEYS_V1, PROVENANCE_KEYS_V1));
}

// `undefined` = invalid; `null` = the model left the field empty.
function extractedValue<T>(value: unknown, parseScalar: (scalar: unknown) => T | undefined): ExtractedValue<T> | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactKeys(value, EXTRACTED_VALUE_KEYS) || value.state !== "unconfirmed") return undefined;
  const confidence = value.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return undefined;
  const scalar = parseScalar(value.value);
  return scalar === undefined ? undefined : { value: scalar, confidence, state: "unconfirmed" };
}

const commercialText = (scalar: unknown) => nullableText(scalar, 200) ?? undefined;
const currencyCode = (scalar: unknown) =>
  typeof scalar === "string" && /^[A-Z]{3}$/.test(scalar.trim()) ? scalar.trim() : undefined;
const minorUnits = (scalar: unknown) =>
  Number.isInteger(scalar) && (scalar as number) >= 0 && (scalar as number) <= MAX_UNIT_PRICE_MINOR ? scalar as number : undefined;

export function validateExtractionV2(value: unknown, sourceKind: SourceKind): { rows: ExtractionRow[] } | null {
  return validateRows<ExtractionRow>(value, (row) => {
    const base = parseBaseRow(row, ROW_KEYS, PROVENANCE_KEYS);
    if (!base || (row.provenance as Record<string, unknown>).sourceKind !== sourceKind) return null;
    const maker = extractedValue(row.maker, commercialText);
    const sku = extractedValue(row.sku, commercialText);
    const unitPriceMinor = extractedValue(row.unitPriceMinor, minorUnits);
    const currency = extractedValue(row.currency, currencyCode);
    if (
      maker === undefined || sku === undefined || unitPriceMinor === undefined || currency === undefined ||
      (unitPriceMinor === null) !== (currency === null) || row.priceBasis !== "unknown"
    ) return null;
    return {
      ...base,
      provenance: { ...base.provenance, sourceKind },
      maker,
      sku,
      unitPriceMinor,
      currency,
      priceBasis: "unknown",
    };
  });
}

export function extractionStageArgs(
  request: Pick<ExtractRequest, "assetId" | "projectId">,
  actorId: string,
  fileHash: string,
  rows: ExtractionRowV1[] | ExtractionRow[],
) {
  return {
    p_project_id: request.projectId,
    p_asset_id: request.assetId,
    p_actor_id: actorId,
    p_file_hash: fileHash,
    p_rows: rows,
  };
}

export function parseExtractionBatchResult(value: unknown, expectedAssetId: string): ExtractionBatchResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const batchId = typeof row.batchId === "string" ? row.batchId.toLowerCase() : "";
  const sourceAssetId = typeof row.sourceAssetId === "string" ? row.sourceAssetId.toLowerCase() : "";
  const status = row.status;
  if (
    !UUID.test(batchId) || sourceAssetId !== expectedAssetId ||
    (status !== "staged" && status !== "committed" && status !== "failed" && status !== "abandoned") ||
    typeof row.reused !== "boolean" || !Number.isSafeInteger(row.rowCount) ||
    (row.rowCount as number) < 0 || (row.rowCount as number) > MAX_ROWS ||
    !Number.isSafeInteger(row.unconfirmedCommercialRows) || (row.unconfirmedCommercialRows as number) < 0 ||
    (row.unconfirmedCommercialRows as number) > (row.rowCount as number)
  ) return null;
  return {
    batchId,
    sourceAssetId,
    status,
    reused: row.reused,
    rowCount: row.rowCount as number,
    unconfirmedCommercialRows: row.unconfirmedCommercialRows as number,
  };
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
