import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EXTRACTION_TOOL_NAME,
  base64Chunks,
  extractionPrompt,
  extractionTool,
  parseExtractRequest,
  parseExtractSource,
  validateExtraction,
} from "./lib.ts";

const projectId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = "123e4567-e89b-42d3-a456-426614174001";
const actorId = "123e4567-e89b-42d3-a456-426614174002";
const row = { page: 1, name: "Chair", quantity: 2, room: "Living", category: "Seating", manufacturer: null, sourcePrice: 1200, confidence: 0.8 };

Deno.test("extract request requires explicit UUID project and staged asset", () => {
  assertEquals(parseExtractRequest({ projectId, assetId }), { projectId, assetId });
  assertEquals(parseExtractRequest({ projectId, assetId: "  " }), null);
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
});

Deno.test("Anthropic request uses one forced schema-constrained staging tool", () => {
  const tool = extractionTool();
  assertEquals(tool.name, EXTRACTION_TOOL_NAME);
  assertEquals(tool.input_schema.additionalProperties, false);
  assertEquals(tool.input_schema.properties.rows.items.additionalProperties, false);
  assertEquals(extractionPrompt().includes("Never infer approval"), true);
});

Deno.test("extraction runtime validator rejects unknown, malformed, and formula-like fields", () => {
  assertEquals(validateExtraction({ rows: [row] })?.rows, [row]);
  assertEquals(validateExtraction({ rows: [{ ...row, page: 0 }] }), null);
  assertEquals(validateExtraction({ rows: [{ ...row, quantity: "many" }] }), null);
  assertEquals(validateExtraction({ rows: [{ ...row, sourcePrice: "=1+1" }] }), null);
  assertEquals(validateExtraction({ rows: [{ ...row, tradeCost: 99 }] }), null);
});

Deno.test("PDF base64 encoding roundtrips across multiple bounded chunks", () => {
  const bytes = new Uint8Array(100_003);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  const decoded = Uint8Array.from(atob(base64Chunks(bytes)), (value) => value.charCodeAt(0));
  assertEquals(decoded, bytes);
});
