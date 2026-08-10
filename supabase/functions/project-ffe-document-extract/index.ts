import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractionPrompt, parseExtractRequest } from "./lib.ts";

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
  // The database RPC verifies studio membership + upload ownership before the
  // service client sees a PDF path, preventing body-selected foreign objects.
  const staged = await admin.rpc("get_project_ffe_extract_upload", { p_project_id: payload.projectId, p_staging_upload_id: payload.stagingUploadId, p_actor_id: caller.data.user.id });
  if (staged.error || !staged.data) return json({ error: "not_found" }, 404);
  const source = staged.data as { bucket: string; path: string };
  const download = await admin.storage.from(source.bucket).download(source.path);
  if (download.error || !download.data) return json({ error: "source_unavailable" }, 422);
  const pdf = new Uint8Array(await download.data.arrayBuffer());
  if (pdf.byteLength > 25 * 1024 * 1024) return json({ error: "pdf_too_large" }, 413);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "extractor_unavailable" }, 503);
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 6000, system: extractionPrompt(), messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: btoa(String.fromCharCode(...pdf)) } }] }] }) });
  if (!response.ok) return json({ error: "extraction_failed" }, 502);
  const model = await response.json() as { content?: Array<{ text?: string }> };
  let extracted: unknown;
  try { extracted = JSON.parse(model.content?.[0]?.text ?? ""); } catch { return json({ error: "invalid_extraction" }, 502); }
  const committed = await admin.rpc("stage_project_ffe_document_extraction", { p_project_id: payload.projectId, p_staging_upload_id: payload.stagingUploadId, p_actor_id: caller.data.user.id, p_extraction: extracted });
  if (committed.error) return json({ error: "staging_failed" }, 500);
  return json({ ok: true, stagingUploadId: payload.stagingUploadId, staged: true });
});
