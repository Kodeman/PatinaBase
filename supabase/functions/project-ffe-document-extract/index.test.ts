import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EXTRACTION_TOOL_NAME,
  MAX_PDF_BYTES,
  base64Chunks,
  extractionStageArgs,
  extractionPrompt,
  extractionTool,
  parseExtractRequest,
  parseExtractSource,
  parseExtractionBatchResult,
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
