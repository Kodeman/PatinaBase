import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, createLlmLedger } from "../_shared/claude.ts";
import { resolveCaller } from "../_shared/caller.ts";
import {
  claudeFailureResponse,
  type ExtractionClient,
  extractionCaller,
  extractionPrompt,
  extractionStageArgs,
  extractionTool,
  maxSourceBytes,
  parseClaudeExtraction,
  parseExtractionBatchResult,
  parseExtractRequest,
  parseExtractSource,
  registerSourceDocument,
  sha256Hex,
  sourceContentBlock,
  sourceKindFor,
  type SourceRegistration,
  SourceRegistrationError,
} from "./lib.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await resolveCaller(req, admin);
  if (!caller.userId) return json({ error: "unauthorized" }, 401);
  const payload = parseExtractRequest(await req.json().catch(() => null));
  if (payload === "unsupported_schema_version") return json({ error: "unsupported_schema_version" }, 400);
  if (payload === "invalid_source_path") return json({ error: "invalid_source_path" }, 422);
  if (!payload) return json({ error: "invalid_body" }, 400);
  let assetId: string;
  let registered: { registration: SourceRegistration; bytes: ArrayBuffer } | null = null;
  if ("assetId" in payload) {
    assetId = payload.assetId;
  } else {
    // The object is read as the caller, under the bucket's studio RLS, so a
    // non-member cannot probe another project's objects through service_role.
    const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    try {
      registered = await registerSourceDocument(payload, caller.userId, {
        download: async (bucket, path) => {
          const object = await asCaller.storage.from(bucket).download(path);
          return object.error || !object.data ? null : { bytes: await object.data.arrayBuffer(), storedContentType: object.data.type };
        },
        register: async (args) => {
          const result = await admin.rpc("register_project_ffe_working_media_source", args);
          return { data: result.data, sqlState: result.error?.code, failed: !!result.error };
        },
      });
    } catch (error) {
      if (error instanceof SourceRegistrationError) return json({ error: error.code }, error.status);
      return json({ error: "source_registration_failed" }, 500);
    }
    assetId = registered.registration.assetId;
  }
  const asset = { projectId: payload.projectId, assetId };
  const staged = await admin.rpc("get_project_ffe_extract_upload", {
    p_project_id: asset.projectId,
    p_asset_id: asset.assetId,
    p_actor_id: caller.userId,
  });
  if (staged.error || !staged.data) return json({ error: "not_found" }, 404);
  const source = parseExtractSource(staged.data, asset, caller.userId);
  if (!source) return json({ error: "invalid_source_manifest" }, 422);
  if (source.sizeBytes > maxSourceBytes(source.contentType)) return json({ error: "source_too_large" }, 413);
  let sourceBytes = registered?.bytes;
  if (!sourceBytes) {
    const download = await admin.storage.from(source.bucket).download(source.path);
    if (download.error || !download.data) return json({ error: "source_unavailable" }, 422);
    sourceBytes = await download.data.arrayBuffer();
  }
  if (sourceBytes.byteLength !== source.sizeBytes) return json({ error: "source_integrity_failed" }, 409);
  const fileHash = await sha256Hex(sourceBytes);
  if (source.checksumSha256 !== fileHash) return json({ error: "source_integrity_failed" }, 409);
  const sourceKind = sourceKindFor(source.contentType);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const modelClient = apiKey ? new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 }) : null;
  const tool = extractionTool(payload.schemaVersion);
  const result = await callClaude({
    feature: "ffe-extract",
    role: "extract",
    studioId: caller.studioId,
    userId: caller.userId,
    studioLookupFailed: caller.studioLookupFailed,
    promptVersion: `ffe-extract-v${payload.schemaVersion}`,
    timeoutMs: 120_000,
    ledger: createLlmLedger(admin),
    caller: extractionCaller(
      modelClient as unknown as ExtractionClient | null,
      source.contentType,
      new Uint8Array(sourceBytes),
    ),
    params: {
      max_tokens: 6000,
      system: extractionPrompt(payload.schemaVersion),
      output_config: {
        format: {
          type: "json_schema",
          name: tool.name,
          description: tool.description,
          schema: tool.input_schema,
        },
      },
      messages: [{ role: "user", content: [sourceContentBlock(source.contentType, new Uint8Array(sourceBytes))] }],
    },
  });
  if (!result.ok) {
    if ("denied" in result) {
      const failure = claudeFailureResponse(result);
      return json(failure.body, failure.status);
    }
    return json({ error: "extraction_failed" }, 502);
  }
  if (result.response.stop_reason === "max_tokens") return json({ error: "extraction_truncated" }, 502);
  const extraction = parseClaudeExtraction(
    result.response.content,
    payload.schemaVersion,
    sourceKind,
  );
  if (!extraction) return json({ error: "invalid_extraction" }, 502);
  const committed = await admin.rpc(
    "stage_project_ffe_document_extraction",
    extractionStageArgs(asset, caller.userId, fileHash, extraction.rows),
  );
  if (committed.error) return json({ error: "staging_failed" }, 500);
  const batch = parseExtractionBatchResult(committed.data, asset.assetId);
  if (!batch) return json({ error: "invalid_staging_result" }, 502);
  return json({
    ...(registered ? { sourceRegistration: registered.registration } : {}),
    ...batch,
    schemaVersion: payload.schemaVersion,
  });
});
