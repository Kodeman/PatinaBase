import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { base64Chunks, extractionPrompt, parseExtractRequest, validateExtraction } from "./lib.ts";
Deno.test("extract request requires explicit project and staged upload", () => { assertEquals(parseExtractRequest({ projectId: "p", stagingUploadId: "u" }), { projectId: "p", stagingUploadId: "u" }); assertEquals(parseExtractRequest({ projectId: "p" }), null); });
Deno.test("extract prompt preserves non-authoritative staging boundary", () => { assertEquals(extractionPrompt().includes("Never infer approval"), true); });
Deno.test("extraction schema requires bounded name, page, confidence and rows", () => { assertEquals(validateExtraction({ rows: [{ page: 1, name: "Chair", confidence: 0.8 }] })?.rows.length, 1); assertEquals(validateExtraction({ rows: [{ page: 0, name: "Chair", confidence: 2 }] }), null); assertEquals(base64Chunks(new Uint8Array([1, 2, 3])), "AQID"); });
