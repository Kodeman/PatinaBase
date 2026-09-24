import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EXTRACTION_TOOL_NAME,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  base64Chunks,
  extractionStageArgs,
  extractionPrompt,
  extractionTool,
  maxSourceBytes,
  parseExtractRequest,
  parseExtractSource,
  parseExtractionBatchResult,
  registerSourceDocument,
  sha256Hex,
  sniffSourceContentType,
  sourceContentBlock,
  sourceKindFor,
  sourceRegistrationArgs,
  SourceRegistrationError,
  sourceRegistrationError,
  type SourceRegistrationDependencies,
  type SourceRequest,
  validateExtraction,
  validateExtractionV2,
} from "./lib.ts";

const projectId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = "123e4567-e89b-42d3-a456-426614174001";
const actorId = "123e4567-e89b-42d3-a456-426614174002";
const row = { pageNumber: 1, provenance: { page: 1, confidence: 0.8 }, name: "Chair", quantity: 2, roomName: "Living", category: "Seating" };
const reading = (value: unknown, confidence = 0.7) => ({ value, confidence, state: "unconfirmed" });
const v2Row = {
  pageNumber: 1,
  provenance: { page: 1, confidence: 0.8, sourceKind: "pdf" },
  name: "Chair",
  quantity: 2,
  roomName: "Living",
  category: "Seating",
  maker: reading("Vaughan"),
  sku: reading("TM0064"),
  unitPriceMinor: reading(184000, 0.6),
  currency: reading("EUR", 0.6),
  priceBasis: "unknown",
};
const v2 = (patch: Record<string, unknown>) => validateExtractionV2({ rows: [{ ...v2Row, ...patch }] }, "pdf");

Deno.test("extract request requires explicit UUID project and staged asset", () => {
  assertEquals(parseExtractRequest({ projectId, assetId }), { projectId, assetId, schemaVersion: 1 });
  assertEquals(parseExtractRequest({ projectId, assetId: "  " }), null);
});

Deno.test("schemaVersion is optional, defaults to 1, and only 1 or 2 are supported", () => {
  assertEquals(parseExtractRequest({ projectId, assetId, schemaVersion: 2 }), { projectId, assetId, schemaVersion: 2 });
  assertEquals(parseExtractRequest({ projectId, assetId, schemaVersion: 1 }), { projectId, assetId, schemaVersion: 1 });
  for (const schemaVersion of [3, 0, "2", null, 1.5]) {
    assertEquals(parseExtractRequest({ projectId, assetId, schemaVersion }), "unsupported_schema_version");
  }
  assertEquals(parseExtractRequest({ projectId: "nope", assetId, schemaVersion: 9 }), null);
});

Deno.test("extract source must be the exact actor-authorized project PDF record", () => {
  const source = {
    projectId,
    assetId,
    actorId,
    bucket: "project-ffe-working",
    path: `${projectId}/documents/specification.pdf`,
    checksumSha256: "a".repeat(64),
    sizeBytes: 1024,
    contentType: "application/pdf",
  };
  assertEquals(parseExtractSource(source, { projectId, assetId }, actorId)?.path, source.path);
  assertEquals(parseExtractSource({ ...source, actorId: assetId }, { projectId, assetId }, actorId), null);
  assertEquals(parseExtractSource({ ...source, path: `${projectId}/../specification.pdf` }, { projectId, assetId }, actorId), null);
  assertEquals(parseExtractSource({ ...source, checksumSha256: "missing" }, { projectId, assetId }, actorId), null);
  // An oversize file is a valid manifest the handler answers 413 source_too_large,
  // not a malformed one (422) or a tampered one (409).
  assertEquals(parseExtractSource({ ...source, sizeBytes: MAX_PDF_BYTES + 1 }, { projectId, assetId }, actorId)?.sizeBytes, MAX_PDF_BYTES + 1);
});

Deno.test("Anthropic request uses one forced schema-constrained staging tool", () => {
  const tool = extractionTool();
  assertEquals(tool.name, EXTRACTION_TOOL_NAME);
  assertEquals(tool.input_schema.additionalProperties, false);
  assertEquals(tool.input_schema.properties.rows.items.additionalProperties, false);
  assertEquals(tool.input_schema.properties.rows.items.required.length, 6);
  assertEquals(extractionPrompt().includes("Never infer approval, authority, pricing, trade cost"), true);
});

Deno.test("v2 prompt reverses the pricing refusal for exactly four fields and keeps markup prohibited", () => {
  const prompt = extractionPrompt(2);
  assertEquals(prompt.includes("maker, SKU, unit price and currency"), true);
  assertEquals(prompt.includes("only when it is printed verbatim; never compute, convert or infer it"), true);
  assertEquals(prompt.includes("never decide whether a printed price is a client price or a trade cost"), true);
  assertEquals(prompt.includes("Never infer approval, authority, markup, or a client verdict"), true);
  assertEquals(prompt.includes('set `state` to `"unconfirmed"` on each'), true);
  assertEquals(prompt.includes("leave a commercial field null rather than guessing"), true);
  assertEquals(prompt.includes("pricing, trade cost"), false);
});

Deno.test("v2 tool requires all eleven keys and closes every object, envelopes included", () => {
  const items = extractionTool(2).input_schema.properties.rows.items;
  assertEquals(new Set(items.required), new Set([
    "pageNumber", "provenance", "name", "quantity", "roomName", "category",
    "maker", "sku", "unitPriceMinor", "currency", "priceBasis",
  ]));
  assertEquals(items.additionalProperties, false);
  assertEquals(items.properties.provenance.additionalProperties, false);
  assertEquals(items.properties.provenance.required, ["page", "confidence", "sourceKind"]);
  const properties = items.properties as Record<string, Record<string, unknown>>;
  for (const key of ["maker", "sku", "unitPriceMinor", "currency"]) {
    const envelope = properties[key];
    assertEquals(envelope.type, ["object", "null"]);
    assertEquals(envelope.additionalProperties, false);
    assertEquals(envelope.required, ["value", "confidence", "state"]);
    assertEquals((envelope.properties as Record<string, unknown>).state, { const: "unconfirmed" });
  }
  assertEquals(properties.priceBasis, { const: "unknown" });
  assertEquals("markup" in properties || "tradeCost" in properties, false);
});

Deno.test("extraction runtime validator rejects unknown, malformed, and formula-like fields", () => {
  assertEquals(validateExtraction({ rows: [row] })?.rows, [row]);
  assertEquals(validateExtraction({ rows: [{ ...row, pageNumber: 0 }] }), null);
  assertEquals(validateExtraction({ rows: [{ ...row, provenance: { page: 2, confidence: 0.8 } }] }), null);
  assertEquals(validateExtraction({ rows: [{ ...row, quantity: "many" }] }), null);
  assertEquals(validateExtraction({ rows: [{ ...row, quantity: 1.5 }] }), null);
  assertEquals(validateExtraction({ rows: [{ ...row, roomName: "=1+1" }] }), null);
  assertEquals(validateExtraction({ rows: [{ ...row, tradeCost: 99 }] }), null);
  assertEquals(validateExtraction({ rows: [v2Row] }), null, "v1 refuses the commercial block");
});

Deno.test("v2 validator accepts envelopes and an all-null commercial block", () => {
  assertEquals<unknown>(v2({})?.rows, [v2Row]);
  const empty = { maker: null, sku: null, unitPriceMinor: null, currency: null };
  assertEquals<unknown>(v2(empty)?.rows, [{ ...v2Row, ...empty }]);
  assertEquals(v2({ maker: reading("  Vaughan "), currency: reading(" EUR ") })?.rows[0].maker?.value, "Vaughan");
  assertEquals(v2({ unitPriceMinor: reading(100_000_000) })?.rows[0].unitPriceMinor?.value, 100_000_000);
  assertEquals(v2({ unitPriceMinor: reading(0) })?.rows[0].unitPriceMinor?.value, 0);
});

Deno.test("v2 validator keeps every row strict at eleven keys", () => {
  const { maker: _maker, ...missingMaker } = v2Row;
  assertEquals(validateExtractionV2({ rows: [missingMaker] }, "pdf"), null, "absent value must be null, never a missing key");
  assertEquals(v2({ markup: 20 }), null);
  assertEquals(v2({ tradeCost: reading(9000) }), null);
  assertEquals(validateExtractionV2({ rows: [row] }, "pdf"), null, "a v1 row is not a v2 row");
});

Deno.test("v2 validator refuses anything but an unconfirmed envelope", () => {
  assertEquals(v2({ maker: "Vaughan" }), null, "bare scalar");
  assertEquals(v2({ unitPriceMinor: 184000 }), null, "bare number");
  assertEquals(v2({ sku: { ...reading("TM0064"), state: "confirmed" } }), null, "model-minted confirmation");
  assertEquals(v2({ sku: { value: "TM0064", confidence: 0.7 } }), null, "missing state");
  assertEquals(v2({ sku: { ...reading("TM0064"), source: "tag" } }), null, "extra envelope key");
  assertEquals(v2({ maker: reading("Vaughan", 1.2) }), null, "confidence above 1");
  assertEquals(v2({ maker: reading("Vaughan", -0.1) }), null, "confidence below 0");
  assertEquals(v2({ maker: reading("Vaughan", Number.NaN) }), null, "confidence not finite");
  assertEquals(v2({ maker: reading(null) }), null, "an empty reading is null, not an envelope of null");
  assertEquals(v2({ maker: reading("   ") }), null, "blank text");
  assertEquals(v2({ maker: reading("x".repeat(201)) }), null, "too long");
});

Deno.test("v2 validator enforces money shape, currency shape, pairing, and priceBasis", () => {
  assertEquals(v2({ unitPriceMinor: reading(1840.5) }), null, "minor units are integers");
  assertEquals(v2({ unitPriceMinor: reading(-1) }), null);
  assertEquals(v2({ unitPriceMinor: reading(100_000_001) }), null);
  assertEquals(v2({ unitPriceMinor: reading("184000") }), null);
  assertEquals(v2({ currency: reading("eur") }), null, "ISO 4217 is uppercase; never lower-cased for the model");
  assertEquals(v2({ currency: reading("EURO") }), null);
  assertEquals(v2({ currency: null }), null, "a price without a currency is unusable");
  assertEquals(v2({ unitPriceMinor: null }), null, "a currency without a price is refused");
  assertEquals(v2({ priceBasis: "trade" }), null, "the model never classifies the price");
  assertEquals(v2({ priceBasis: "client" }), null);
  assertEquals(v2({ priceBasis: null }), null);
});

Deno.test("v2 validator applies the injection guard to maker and sku", () => {
  for (const value of ["=HYPERLINK(\"x\")", "+SUM(A1)", "@SUM(A1)", "-cmd", "-2+3+cmd|x", " =cmd", "Vau\u0000ghan"]) {
    assertEquals(v2({ maker: reading(value) }), null, `maker ${value}`);
    assertEquals(v2({ sku: reading(value) }), null, `sku ${value}`);
  }
  assertEquals(validateExtraction({ rows: [{ ...row, name: "-2+3+cmd|x" }] }), null, "text fields share the guard");
  for (const value of ["-12", "-12.50"]) {
    assertEquals(v2({ sku: reading(value) })?.rows[0].sku?.value, value, `plain negative number ${value} is not a formula`);
  }
});

Deno.test("v2 provenance names the source kind of the branch that produced it", () => {
  assertEquals(v2({ provenance: { page: 1, confidence: 0.8, sourceKind: "photo" } }), null);
  assertEquals(v2({ provenance: { page: 1, confidence: 0.8 } }), null);
  assertEquals(
    validateExtractionV2({ rows: [{ ...v2Row, provenance: { page: 1, confidence: 0.8, sourceKind: "photo" } }] }, "photo")?.rows[0].provenance.sourceKind,
    "photo",
  );
});

Deno.test("staging orchestration uses exact SQL args and returns only authoritative batch data", () => {
  const fileHash = "b".repeat(64);
  assertEquals(extractionStageArgs({ projectId, assetId }, actorId, fileHash, [row]), {
    p_project_id: projectId,
    p_asset_id: assetId,
    p_actor_id: actorId,
    p_file_hash: fileHash,
    p_rows: [row],
  });
  const batchId = "123e4567-e89b-42d3-a456-426614174003";
  const result = { batchId, status: "staged", reused: false, rowCount: 30, sourceAssetId: assetId, unconfirmedCommercialRows: 12 };
  assertEquals(parseExtractionBatchResult(result, assetId), result);
  assertEquals(parseExtractionBatchResult({ ...result, sourceAssetId: projectId }, assetId), null);
  assertEquals(parseExtractionBatchResult({ ...result, unconfirmedCommercialRows: 31 }, assetId), null);
  assertEquals(parseExtractionBatchResult({ ...result, unconfirmedCommercialRows: -1 }, assetId), null);
  const { unconfirmedCommercialRows: _count, ...legacy } = result;
  assertEquals(parseExtractionBatchResult(legacy, assetId), null, "a staging RPC without 00661 is not authoritative");
});

Deno.test("PDF base64 encoding roundtrips across multiple bounded chunks", () => {
  const bytes = new Uint8Array(100_003);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  const decoded = Uint8Array.from(atob(base64Chunks(bytes)), (value) => value.charCodeAt(0));
  assertEquals(decoded, bytes);
});

// ── Image branch (Contract A §A.3) and source registration (Contract B) ─────

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = new TextEncoder().encode("RIFF$\u0000\u0000\u0000WEBPVP8 ");
const PDF = new TextEncoder().encode("%PDF-1.7\n%âã\n1 0 obj\n");
const bufferOf = (bytes: Uint8Array) => bytes.slice().buffer;
const sourcePath = async (bytes: Uint8Array, ext: string) =>
  `${projectId}/source-documents/${await sha256Hex(bufferOf(bytes))}.${ext}`;
const sourceRequest = (path: string): SourceRequest => ({
  source: { bucket: "project-ffe-working", path },
  projectId,
  schemaVersion: 2,
});
const photoRow = { ...v2Row, provenance: { page: 1, confidence: 0.8, sourceKind: "photo" } };

// A fake storage object plus a registration RPC that behaves like 00455:
// ON CONFLICT (bucket, path) DO NOTHING, returning the existing asset as reused.
function fakeSource(bytes: Uint8Array | null, storedContentType: string) {
  const calls: Array<ReturnType<typeof sourceRegistrationArgs>> = [];
  const assets = new Map<string, string>();
  const dependencies: SourceRegistrationDependencies = {
    download: async () => bytes ? { bytes: bufferOf(bytes), storedContentType } : null,
    register: async (args) => {
      calls.push(args);
      const reused = assets.has(args.p_path);
      if (!reused) assets.set(args.p_path, `123e4567-e89b-42d3-a456-42661417${String(assets.size).padStart(4, "0")}`);
      return {
        failed: false,
        data: {
          sourceAssetId: assets.get(args.p_path), projectId: args.p_project_id, actorId: args.p_actor_id,
          ffeItemId: null, bucket: args.p_bucket, path: args.p_path, checksumSha256: args.p_checksum_sha256,
          sizeBytes: args.p_size_bytes, contentType: args.p_content_type, mediaKind: args.p_media_kind, reused,
        },
      };
    },
  };
  return { calls, dependencies };
}

const refusal = async (promise: Promise<unknown>) => {
  const error = await assertRejects(() => promise, SourceRegistrationError);
  return [(error as SourceRegistrationError).code, (error as SourceRegistrationError).status];
};

Deno.test("a camera request names a content-addressed source path instead of an asset", async () => {
  const path = await sourcePath(JPEG, "jpg");
  assertEquals(
    parseExtractRequest({ projectId, source: { bucket: "project-ffe-working", path }, schemaVersion: 2 }),
    sourceRequest(path),
  );
  const source = { bucket: "project-ffe-working", path };
  assertEquals(parseExtractRequest({ projectId, assetId, source }), null, "assetId and source are exclusive");
  assertEquals(parseExtractRequest({ projectId }), null, "one of assetId or source is required");
  assertEquals(parseExtractRequest({ projectId, source: { ...source, bucket: "project-review-media" } }), null);
  assertEquals(parseExtractRequest({ projectId, source: { ...source, contentType: "image/jpeg" } }), null, "the client never names the type");
  assertEquals(parseExtractRequest({ projectId, source: { ...source, path: 7 } }), null);
  const otherProject = path.replace(projectId, assetId);
  for (const bad of [
    otherProject, `${projectId}/source-documents/../${path.split("/").pop()}`,
    `${projectId}/documents/spec.pdf`, path.replace(/[0-9a-f]{64}/, "A".repeat(64)),
    path.replace(".jpg", ".heic"), `${path}?x=1`, `https://evil.test/${path}`,
  ]) {
    assertEquals(parseExtractRequest({ projectId, source: { ...source, path: bad } }), "invalid_source_path", bad);
  }
});

Deno.test("the sniff reads the four accepted types from their magic bytes only", () => {
  assertEquals(sniffSourceContentType(bufferOf(PDF)), "application/pdf");
  assertEquals(sniffSourceContentType(bufferOf(JPEG)), "image/jpeg");
  assertEquals(sniffSourceContentType(bufferOf(PNG)), "image/png");
  assertEquals(sniffSourceContentType(bufferOf(WEBP)), "image/webp");
  assertEquals(sniffSourceContentType(bufferOf(new TextEncoder().encode("RIFF$\u0000\u0000\u0000WAVEfmt "))), null);
  assertEquals(sniffSourceContentType(bufferOf(new TextEncoder().encode("GIF89a"))), null);
  assertEquals(sniffSourceContentType(new ArrayBuffer(0)), null);
});

Deno.test("an image upload extracts: registered, sent as an image block, staged as photo rows", async () => {
  const path = await sourcePath(JPEG, "jpg");
  const { calls, dependencies } = fakeSource(JPEG, "image/jpeg");
  const { registration, bytes } = await registerSourceDocument(sourceRequest(path), actorId, dependencies);
  assertEquals(calls, [{
    p_project_id: projectId, p_actor_id: actorId, p_bucket: "project-ffe-working", p_path: path,
    p_checksum_sha256: await sha256Hex(bufferOf(JPEG)), p_size_bytes: JPEG.length,
    p_content_type: "image/jpeg", p_media_kind: "source_document", p_ffe_item_id: null,
  }]);
  assertEquals(registration.mediaKind, "source_document");
  assertEquals(registration.contentType, "image/jpeg");
  assertEquals(registration.reused, false);
  assertEquals(registration.sourceRegistrationVersion, 1);
  // The manifest get_project_ffe_extract_upload returns for that asset (00660).
  const manifest = parseExtractSource({
    projectId, assetId: registration.assetId, actorId, bucket: "project-ffe-working", path,
    checksumSha256: registration.checksumSha256, sizeBytes: registration.sizeBytes, contentType: "image/jpeg",
  }, { projectId, assetId: registration.assetId }, actorId);
  assertEquals(manifest?.contentType, "image/jpeg");
  assertEquals(sourceKindFor(manifest!.contentType), "photo");
  assertEquals(maxSourceBytes(manifest!.contentType), MAX_IMAGE_BYTES);
  assertEquals(sourceContentBlock(manifest!.contentType, new Uint8Array(bytes)), {
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: base64Chunks(JPEG) },
  });
  const extraction = validateExtractionV2({ rows: [photoRow] }, "photo");
  assertEquals(extraction?.rows[0].provenance.sourceKind, "photo");
  assertEquals(
    extractionStageArgs({ projectId, assetId: registration.assetId }, actorId, registration.checksumSha256, extraction!.rows),
    {
      p_project_id: projectId, p_asset_id: registration.assetId, p_actor_id: actorId,
      p_file_hash: registration.checksumSha256, p_rows: extraction!.rows,
    },
  );
});

Deno.test("a photograph has no pages: its rows are pinned to page 1", () => {
  const page2 = { ...photoRow, pageNumber: 2, provenance: { ...photoRow.provenance, page: 2 } };
  assertEquals(validateExtractionV2({ rows: [page2] }, "photo"), null);
  assertEquals(validateExtraction({ rows: [{ ...row, pageNumber: 2, provenance: { page: 2, confidence: 0.8 } }] }, "photo"), null);
  assertEquals(validateExtraction({ rows: [row] }, "photo")?.rows, [row]);
  assertEquals(validateExtractionV2({ rows: [{ ...page2, provenance: { ...page2.provenance, sourceKind: "pdf" } }] }, "pdf")?.rows.length, 1);
});

Deno.test("a PDF uploaded as an image is refused by the sniff, before registration", async () => {
  const path = await sourcePath(PDF, "jpg");
  const renamed = fakeSource(PDF, "image/jpeg");
  assertEquals(await refusal(registerSourceDocument(sourceRequest(path), actorId, renamed.dependencies)), ["unsupported_source_type", 415]);
  assertEquals(renamed.calls.length, 0, "nothing is registered");
  const relabelled = fakeSource(JPEG, "image/png");
  assertEquals(
    await refusal(registerSourceDocument(sourceRequest(await sourcePath(JPEG, "png")), actorId, relabelled.dependencies)),
    ["unsupported_source_type", 415],
    "sniffed bytes disagree with the stored metadata",
  );
  const unknown = fakeSource(new TextEncoder().encode("GIF89a...."), "image/gif");
  assertEquals(
    await refusal(registerSourceDocument(sourceRequest(await sourcePath(new TextEncoder().encode("GIF89a...."), "jpg")), actorId, unknown.dependencies)),
    ["unsupported_source_type", 415],
  );
  // The same PDF bytes under their own type still register, as a document.
  const honest = fakeSource(PDF, "application/pdf; charset=binary");
  const { registration } = await registerSourceDocument(sourceRequest(await sourcePath(PDF, "pdf")), actorId, honest.dependencies);
  assertEquals(registration.contentType, "application/pdf");
  assertEquals(sourceKindFor(registration.contentType), "pdf");
  assertEquals(sourceContentBlock(registration.contentType, PDF).type, "document");
});

Deno.test("registering the same upload twice is idempotent", async () => {
  const path = await sourcePath(PNG, "png");
  const { calls, dependencies } = fakeSource(PNG, "image/png");
  const first = await registerSourceDocument(sourceRequest(path), actorId, dependencies);
  const second = await registerSourceDocument(sourceRequest(path), actorId, dependencies);
  assertEquals(first.registration.reused, false);
  assertEquals(second.registration.reused, true);
  assertEquals(second.registration.assetId, first.registration.assetId);
  assertEquals(calls[1], calls[0], "the retry sends the identical registration");
});

Deno.test("the source path must be the content address of the bytes it holds", async () => {
  const { calls, dependencies } = fakeSource(JPEG, "image/jpeg");
  const wrongDigest = await sourcePath(PNG, "jpg");
  assertEquals(await refusal(registerSourceDocument(sourceRequest(wrongDigest), actorId, dependencies)), ["invalid_source_path", 422]);
  assertEquals(calls.length, 0);
});

Deno.test("registration refuses absent and oversize objects by the branch cap", async () => {
  const absent = fakeSource(null, "");
  assertEquals(await refusal(registerSourceDocument(sourceRequest(await sourcePath(JPEG, "jpg")), actorId, absent.dependencies)), ["source_unavailable", 404]);
  const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
  big.set(JPEG);
  const oversize = fakeSource(big, "image/jpeg");
  assertEquals(await refusal(registerSourceDocument(sourceRequest(await sourcePath(big, "jpg")), actorId, oversize.dependencies)), ["source_too_large", 413]);
  assertEquals(oversize.calls.length, 0);
  const pdf = new Uint8Array(MAX_IMAGE_BYTES + 1);
  pdf.set(PDF);
  const { registration } = await registerSourceDocument(sourceRequest(await sourcePath(pdf, "pdf")), actorId, fakeSource(pdf, "application/pdf").dependencies);
  assertEquals(registration.sizeBytes, MAX_IMAGE_BYTES + 1, "a PDF keeps its 25 MiB cap");
  assertEquals(maxSourceBytes("application/pdf"), MAX_PDF_BYTES);
});

Deno.test("registration maps 00455's refusals to Contract B §B.8 codes", async () => {
  const cases: Array<[string | undefined, string, number]> = [
    ["42501", "source_not_authorized", 403],
    ["23514", "invalid_source_path", 422],
    ["22000", "source_registration_conflict", 409],
    ["23000", "source_item_mismatch", 409],
    ["XX000", "source_registration_failed", 500],
    [undefined, "source_registration_failed", 500],
  ];
  for (const [sqlState, code, status] of cases) {
    const error = sourceRegistrationError(sqlState);
    assertEquals([error.code, error.status], [code, status], String(sqlState));
    const refused: SourceRegistrationDependencies = {
      download: async () => ({ bytes: bufferOf(JPEG), storedContentType: "image/jpeg" }),
      register: async () => ({ data: null, sqlState, failed: true }),
    };
    assertEquals(await refusal(registerSourceDocument(sourceRequest(await sourcePath(JPEG, "jpg")), actorId, refused)), [code, status]);
  }
});

Deno.test("a registration result that disagrees with what was sent is not authoritative", async () => {
  const path = await sourcePath(JPEG, "jpg");
  for (const patch of [{ mediaKind: "board_reference" }, { checksumSha256: "c".repeat(64) }, { contentType: "image/png" }, { reused: "no" }, { ffeItemId: assetId }]) {
    const { dependencies } = fakeSource(JPEG, "image/jpeg");
    const register = dependencies.register;
    dependencies.register = async (args) => {
      const result = await register(args);
      return { ...result, data: { ...(result.data as Record<string, unknown>), ...patch } };
    };
    assertEquals(await refusal(registerSourceDocument(sourceRequest(path), actorId, dependencies)), ["invalid_source_registration", 502], JSON.stringify(patch));
  }
});

Deno.test("the extract manifest accepts the four registered types and nothing else", () => {
  const manifest = {
    projectId, assetId, actorId, bucket: "project-ffe-working", path: `${projectId}/source-documents/${"a".repeat(64)}.webp`,
    checksumSha256: "a".repeat(64), sizeBytes: 1024, contentType: "image/webp",
  };
  for (const contentType of ["application/pdf", "image/jpeg", "image/png", "image/webp"]) {
    assertEquals(parseExtractSource({ ...manifest, contentType }, { projectId, assetId }, actorId)?.contentType, contentType);
  }
  for (const contentType of ["image/heic", "image/gif", "IMAGE/JPEG", null]) {
    assertEquals(parseExtractSource({ ...manifest, contentType }, { projectId, assetId }, actorId), null, String(contentType));
  }
});
