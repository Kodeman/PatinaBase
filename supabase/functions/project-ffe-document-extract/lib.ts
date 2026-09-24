export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5_000;
export const MAX_UNIT_PRICE_MINOR = 100_000_000;
export const EXTRACTION_TOOL_NAME = "stage_project_ffe_rows";
export const SOURCE_BUCKET = "project-ffe-working";
export const SOURCE_REGISTRATION_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Contract B §B.6: a camera upload is content-addressed, <projectId>/source-documents/<sha256hex>.<ext>.
const SOURCE_PATH = /^([0-9a-f-]{36})\/source-documents\/([0-9a-f]{64})\.(?:pdf|jpg|jpeg|png|webp)$/;
const SOURCE_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const ROW_KEYS_V1 = new Set(["pageNumber", "provenance", "name", "quantity", "roomName", "category"]);
const ROW_KEYS = new Set([...ROW_KEYS_V1, "maker", "sku", "unitPriceMinor", "currency", "priceBasis"]);
const PROVENANCE_KEYS_V1 = new Set(["page", "confidence"]);
const PROVENANCE_KEYS = new Set(["page", "confidence", "sourceKind"]);
const EXTRACTED_VALUE_KEYS = new Set(["value", "confidence", "state"]);
const SOURCE_LOCATION_KEYS = new Set(["bucket", "path"]);

export type SchemaVersion = 1 | 2;
export type SourceKind = "pdf" | "photo";
export type SourceContentType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export type AssetRef = { assetId: string; projectId: string };
export type SourceLocation = { bucket: typeof SOURCE_BUCKET; path: string };
// `assetId` names an already-registered source_document; `source` is an
// uploaded object this function registers first (Contract B §B.3).
export type ExtractRequest =
  | { assetId: string; projectId: string; schemaVersion: SchemaVersion }
  | { source: SourceLocation; projectId: string; schemaVersion: SchemaVersion };
export type SourceRequest = Extract<ExtractRequest, { source: SourceLocation }>;
export type ExtractSource = {
  assetId: string;
  projectId: string;
  actorId: string;
  bucket: typeof SOURCE_BUCKET;
  path: string;
  checksumSha256: string;
  sizeBytes: number;
  contentType: SourceContentType;
};
export type SourceRegistration = {
  assetId: string;
  mediaKind: "source_document";
  contentType: SourceContentType;
  checksumSha256: string;
  sizeBytes: number;
  reused: boolean;
  sourceRegistrationVersion: typeof SOURCE_REGISTRATION_VERSION;
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

export function parseExtractRequest(
  value: unknown,
): ExtractRequest | "unsupported_schema_version" | "invalid_source_path" | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const projectId = typeof row.projectId === "string" ? row.projectId.trim().toLowerCase() : "";
  if (!UUID.test(projectId) || (row.assetId === undefined) === (row.source === undefined)) return null;
  const assetId = typeof row.assetId === "string" ? row.assetId.trim().toLowerCase() : "";
  const source = isRecord(row.source) ? row.source : null;
  if (
    row.assetId !== undefined ? !UUID.test(assetId)
      : !source || !hasExactKeys(source, SOURCE_LOCATION_KEYS) || source.bucket !== SOURCE_BUCKET || typeof source.path !== "string"
  ) return null;
  const schemaVersion = row.schemaVersion === undefined ? 1 : row.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) return "unsupported_schema_version";
  if (!source) return { assetId, projectId, schemaVersion };
  const path = source.path as string;
  if (SOURCE_PATH.exec(path)?.[1] !== projectId) return "invalid_source_path";
  return { source: { bucket: SOURCE_BUCKET, path }, projectId, schemaVersion };
}

export function parseExtractSource(
  value: unknown,
  request: AssetRef,
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
  const contentType = row.contentType;
  if (
    sourceAssetId !== request.assetId || sourceProjectId !== request.projectId || sourceActorId !== actorId ||
    row.bucket !== SOURCE_BUCKET || typeof contentType !== "string" || !SOURCE_CONTENT_TYPES.has(contentType) ||
    !path.startsWith(`${request.projectId}/`) || path.length > 1024 || /[\\?#\u0000-\u001f\u007f]/.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
    !/^[a-f0-9]{64}$/.test(checksumSha256) || !Number.isSafeInteger(sizeBytes) || (sizeBytes as number) <= 0
  ) return null;
  return {
    assetId: sourceAssetId,
    projectId: sourceProjectId,
    actorId: sourceActorId,
    bucket: SOURCE_BUCKET,
    path,
    checksumSha256,
    sizeBytes: sizeBytes as number,
    contentType: contentType as SourceContentType,
  };
}

// Contract A §A.3: the media branch comes from the registered content type,
// which the sniff below pinned to the stored bytes; the client never names it.
export const sourceKindFor = (contentType: SourceContentType): SourceKind =>
  contentType === "application/pdf" ? "pdf" : "photo";

export const maxSourceBytes = (contentType: SourceContentType): number =>
  contentType === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;

export function sourceContentBlock(contentType: SourceContentType, bytes: Uint8Array) {
  const source = { type: "base64", media_type: contentType, data: base64Chunks(bytes) };
  return contentType === "application/pdf" ? { type: "document", source } : { type: "image", source };
}

// Contract B §B.5: the type is read from the bytes, never from the request or
// the upload's client-asserted Content-Type.
export function sniffSourceContentType(bytes: ArrayBuffer): SourceContentType | null {
  const view = new Uint8Array(bytes);
  const startsWith = (prefix: number[], offset = 0) =>
    view.length >= offset + prefix.length && prefix.every((byte, index) => view[offset + index] === byte);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
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

function parseBaseRow(
  row: Record<string, unknown>,
  rowKeys: Set<string>,
  provenanceKeys: Set<string>,
  sourceKind: SourceKind,
): ExtractionRowV1 | null {
  if (!hasExactKeys(row, rowKeys)) return null;
  // A photograph has no pages: its rows are pinned to page 1 (Contract A §A.3).
  const maxPage = sourceKind === "photo" ? 1 : 10_000;
  const name = nullableText(row.name, 500);
  const roomName = nullableText(row.roomName, 200);
  const category = nullableText(row.category, 200);
  const provenance = isRecord(row.provenance) ? row.provenance : null;
  if (
    !name || roomName === undefined || category === undefined || !provenance || !hasExactKeys(provenance, provenanceKeys) ||
    !Number.isInteger(row.pageNumber) || (row.pageNumber as number) < 1 || (row.pageNumber as number) > maxPage ||
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

export function validateExtraction(value: unknown, sourceKind: SourceKind = "pdf"): { rows: ExtractionRowV1[] } | null {
  return validateRows(value, (row) => parseBaseRow(row, ROW_KEYS_V1, PROVENANCE_KEYS_V1, sourceKind));
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
    const base = parseBaseRow(row, ROW_KEYS, PROVENANCE_KEYS, sourceKind);
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
  request: AssetRef,
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

// ── Contract B: registering an uploaded object as a source_document ─────────

export class SourceRegistrationError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

// Contract B §B.8: the SQLSTATEs register_project_ffe_working_media_source (00455) raises.
export function sourceRegistrationError(sqlState: string | undefined): SourceRegistrationError {
  switch (sqlState) {
    case "42501": return new SourceRegistrationError("source_not_authorized", 403);
    case "23514": return new SourceRegistrationError("invalid_source_path", 422);
    case "22000": return new SourceRegistrationError("source_registration_conflict", 409);
    case "23000": return new SourceRegistrationError("source_item_mismatch", 409);
    default: return new SourceRegistrationError("source_registration_failed", 500);
  }
}

export function sourceRegistrationArgs(
  request: SourceRequest,
  actorId: string,
  checksumSha256: string,
  sizeBytes: number,
  contentType: SourceContentType,
) {
  return {
    p_project_id: request.projectId,
    p_actor_id: actorId,
    p_bucket: request.source.bucket,
    p_path: request.source.path,
    p_checksum_sha256: checksumSha256,
    p_size_bytes: sizeBytes,
    p_content_type: contentType,
    p_media_kind: "source_document",
    p_ffe_item_id: null,
  };
}

// Re-checks every returned field against what was sent (the
// project-review-media parseRegisteredSource shape, for a source_document).
export function parseRegisteredSource(
  value: unknown,
  args: ReturnType<typeof sourceRegistrationArgs>,
): SourceRegistration | null {
  if (!isRecord(value)) return null;
  const lower = (field: unknown) => typeof field === "string" ? field.toLowerCase() : "";
  const assetId = lower(value.sourceAssetId);
  if (
    !UUID.test(assetId) || lower(value.projectId) !== args.p_project_id || lower(value.actorId) !== args.p_actor_id.toLowerCase() ||
    value.ffeItemId !== null || value.bucket !== args.p_bucket || value.path !== args.p_path ||
    value.checksumSha256 !== args.p_checksum_sha256 || value.sizeBytes !== args.p_size_bytes ||
    value.contentType !== args.p_content_type || value.mediaKind !== "source_document" || typeof value.reused !== "boolean"
  ) return null;
  return {
    assetId,
    mediaKind: "source_document",
    contentType: args.p_content_type,
    checksumSha256: args.p_checksum_sha256,
    sizeBytes: args.p_size_bytes,
    reused: value.reused,
    sourceRegistrationVersion: SOURCE_REGISTRATION_VERSION,
  };
}

export type SourceRegistrationDependencies = {
  // The stored object and the Content-Type its upload asserted, or null when absent.
  download: (bucket: string, path: string) => Promise<{ bytes: ArrayBuffer; storedContentType: string } | null>;
  // The registration RPC's data, or the SQLSTATE it raised.
  register: (args: ReturnType<typeof sourceRegistrationArgs>) => Promise<{ data: unknown; sqlState?: string; failed: boolean }>;
};

// Download, sniff, size, hash, then register-or-reuse (Contract B §B.5–B.6).
// Returns the verified bytes so the extraction does not download them twice.
export async function registerSourceDocument(
  request: SourceRequest,
  actorId: string,
  dependencies: SourceRegistrationDependencies,
): Promise<{ registration: SourceRegistration; bytes: ArrayBuffer }> {
  const object = await dependencies.download(request.source.bucket, request.source.path);
  if (!object) throw new SourceRegistrationError("source_unavailable", 404);
  const contentType = sniffSourceContentType(object.bytes);
  const storedContentType = object.storedContentType.split(";")[0].trim().toLowerCase();
  if (!contentType || contentType !== storedContentType) throw new SourceRegistrationError("unsupported_source_type", 415);
  if (object.bytes.byteLength > maxSourceBytes(contentType)) throw new SourceRegistrationError("source_too_large", 413);
  const checksumSha256 = await sha256Hex(object.bytes);
  // The path must be the content address of the bytes it holds, so a retry of
  // the same bytes always lands on the same asset and the same batch.
  if (SOURCE_PATH.exec(request.source.path)?.[2] !== checksumSha256) {
    throw new SourceRegistrationError("invalid_source_path", 422);
  }
  const args = sourceRegistrationArgs(request, actorId, checksumSha256, object.bytes.byteLength, contentType);
  const result = await dependencies.register(args);
  if (result.failed) throw sourceRegistrationError(result.sqlState);
  const registration = parseRegisteredSource(result.data, args);
  if (!registration) throw new SourceRegistrationError("invalid_source_registration", 502);
  return { registration, bytes: object.bytes };
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
