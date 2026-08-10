import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractionPrompt, parseExtractRequest } from "./lib.ts";
Deno.test("extract request requires explicit project and staged upload", () => { assertEquals(parseExtractRequest({ projectId: "p", stagingUploadId: "u" }), { projectId: "p", stagingUploadId: "u" }); assertEquals(parseExtractRequest({ projectId: "p" }), null); });
Deno.test("extract prompt preserves non-authoritative staging boundary", () => { assertEquals(extractionPrompt().includes("Never infer approval"), true); });
