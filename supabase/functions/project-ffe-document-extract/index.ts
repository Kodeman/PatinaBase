import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTRACTION_TOOL_NAME,
  MAX_PDF_BYTES,
  base64Chunks,
  extractionPrompt,
  extractionStageArgs,
  extractionTool,
  parseExtractionBatchResult,
  parseExtractRequest,
  parseExtractSource,
  sha256Hex,
  validateExtraction,
} from "./lib.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (caller.error || !caller.data.user) return json({ error: "unauthorized" }, 401);
  const payload = parseExtractRequest(await req.json().catch(() => null));
  if (!payload) return json({ error: "invalid_body" }, 400);
  const staged = await admin.rpc("get_project_ffe_extract_upload", {
    p_project_id: payload.projectId,
    p_asset_id: payload.assetId,
    p_actor_id: caller.data.user.id,
  });
  if (staged.error || !staged.data) return json({ error: "not_found" }, 404);
  const source = parseExtractSource(staged.data, payload, caller.data.user.id);
  if (!source) return json({ error: "invalid_source_manifest" }, 422);
  const download = await admin.storage.from(source.bucket).download(source.path);
  if (download.error || !download.data) return json({ error: "source_unavailable" }, 422);
  const pdfBuffer = await download.data.arrayBuffer();
  if (pdfBuffer.byteLength !== source.sizeBytes || pdfBuffer.byteLength > MAX_PDF_BYTES) return json({ error: "source_integrity_failed" }, 409);
  const fileHash = await sha256Hex(pdfBuffer);
  if (source.checksumSha256 !== fileHash) return json({ error: "source_integrity_failed" }, 409);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "extractor_unavailable" }, 503);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 6000,
      system: extractionPrompt(),
      tools: [extractionTool()],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME, disable_parallel_tool_use: true },
      messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Chunks(new Uint8Array(pdfBuffer)) } }] }],
    }),
  });
  if (!response.ok) return json({ error: "extraction_failed" }, 502);
  const model = await response.json() as { content?: Array<{ type?: string; name?: string; input?: unknown }> };
  const toolUse = model.content?.find((entry) => entry.type === "tool_use" && entry.name === EXTRACTION_TOOL_NAME);
  const extraction = validateExtraction(toolUse?.input);
  if (!extraction) return json({ error: "invalid_extraction" }, 502);
  const committed = await admin.rpc(
    "stage_project_ffe_document_extraction",
    extractionStageArgs(payload, caller.data.user.id, fileHash, extraction.rows),
  );
  if (committed.error) return json({ error: "staging_failed" }, 500);
  const batch = parseExtractionBatchResult(committed.data, payload.assetId);
  if (!batch) return json({ error: "invalid_staging_result" }, 502);
  return json(batch);
});
