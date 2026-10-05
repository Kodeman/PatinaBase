// board-deck-import-resolve — finds the products in an imported deck.
//
// Two callers, one verify_jwt=true endpoint:
//   • pg_cron (00677 dispatch_board_deck_import_resolve) with a service-role
//     bearer and {job_run_id}: claims pending pieces across imports.
//   • The browser with the designer's JWT and {import_id}: the import must be
//     readable under RLS (board managers); then that import's pieces resolve.
// The caller kind comes from the bearer's decoded role claim (legacy JWT) or a
// timing-safe match against SUPABASE_SECRET_KEYS (sb_secret_ keys), never from
// a string comparison against the legacy service-role JWT (auth.ts).
//
// Every write a run makes carries the lease owner its claim returned, so a run
// whose lease expired (and whose pieces another run re-claimed) writes nothing.
//
// All matching runs as import.created_by through the 00677 service-role RPCs;
// core.ts holds the tiers. ANTHROPIC_API_KEY and INFERENCE_URL/TOKEN are
// optional: without them a run is deterministic-only and nothing parks.

// deno-lint-ignore-file no-explicit-any no-import-prefix

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createInferenceClient, toPgVector } from "../_shared/aesthete.ts";
import { DECK_PAGE_MAX_BYTES } from "../_shared/product-page/page.ts";
import { fetchHtml, UrlError } from "../_shared/product-page/ssrf.ts";
import { BOARD_ASSET_BUCKET, normalizeBoardObjectReference } from "../board-asset-cleanup/core.ts";
import { isServiceCaller } from "./auth.ts";
import {
  ADJUDICATION_SYSTEM,
  ADJUDICATION_TOOL_NAME,
  type AdjudicationClaim,
  AdjudicationHttpError,
  adjudicationTool,
  type ClaimedItem,
  FetchBlocked,
  type ResolveDeps,
  runResolve,
} from "./core.ts";
import { cropSignature } from "./crop_signature.ts";
import type { KnnHit, LookGate, PhashHit } from "./look.ts";
import { ADJUDICATION } from "./thresholds.ts";

const FUNCTION_NAME = "board-deck-import-resolve";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_CROP_SECONDS = 600;
/** Crops are ≤2400 px WebP; anything far larger is not hashed. */
const CROP_MAX_BYTES = 16 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn: FUNCTION_NAME, event, ...fields }));
}

async function rpc<T>(admin: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

function deps(
  admin: SupabaseClient,
  claimRpc: (limit: number) => Promise<unknown>,
): ResolveDeps {
  const inferenceUrl = Deno.env.get("INFERENCE_URL");
  const inferenceToken = Deno.env.get("INFERENCE_TOKEN");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const inference = inferenceUrl && inferenceToken
    ? createInferenceClient({ url: inferenceUrl, token: inferenceToken, timeoutMs: 15_000 })
    : null;
  // The claim's lease owner; every later write is refused without it.
  let leaseOwner: string | null = null;
  // The model behind the crop vectors this run embedded (stored with them).
  let imageModelVersion: string | null = null;

  return {
    claim: async (limit) => {
      const result = await claimRpc(limit);
      const owner = (result as { lease_owner?: unknown })?.lease_owner;
      leaseOwner = typeof owner === "string" ? owner : null;
      return claimedItems(result);
    },
    matchLinks: (importId, urls) =>
      rpc(admin, "board_deck_import_match_links", { p_import_id: importId, p_urls: urls }),
    matchSku: (importId, sku, vendor) =>
      rpc(admin, "board_deck_import_match_sku", { p_import_id: importId, p_sku: sku, p_vendor: vendor }),
    searchWords: (importId, query, vendor, limit) =>
      rpc(admin, "board_deck_import_search_words", {
        p_import_id: importId,
        p_query: query,
        p_vendor: vendor,
        p_limit: limit,
      }),
    consumeLinkQuota: async (importId, n) => {
      const result = await rpc<{ granted?: number }>(admin, "consume_board_deck_import_link_quota", {
        p_import_id: importId,
        p_n: n,
        p_lease_owner: leaseOwner,
      });
      return Number(result?.granted ?? 0);
    },
    fetchPage: async (url) => {
      try {
        // A page past the budget is read as its first 5MB, not refused.
        return await fetchHtml(url, {}, { maxBytes: DECK_PAGE_MAX_BYTES, truncate: true });
      } catch (error) {
        if (error instanceof UrlError) throw new FetchBlocked(error.message, error.status === 400);
        throw new FetchBlocked("fetch_failed", false);
      }
    },
    record: async (itemId, state, foundBy, candidates) => {
      await rpc(admin, "record_board_deck_import_resolution", {
        p_item_id: itemId,
        p_state: state,
        p_found_by: foundBy,
        p_candidates: candidates,
        p_lease_owner: leaseOwner,
      });
    },
    release: async (itemIds) => {
      await rpc(admin, "release_board_deck_import_items", {
        p_lease_owner: leaseOwner,
        p_item_ids: itemIds,
      });
    },
    pairablePictures: async (importId) => {
      const rows = await rpc<{ item_id: string; slide_index: number; image_url: string }[]>(
        admin,
        "board_deck_import_pairable_pictures",
        { p_import_id: importId },
      );
      const out = [];
      for (const row of rows ?? []) {
        // Only crops in the board bucket are sent to the embedder, signed.
        const path = normalizeBoardObjectReference(row.image_url);
        if (!path) continue;
        const signed = await admin.storage.from(BOARD_ASSET_BUCKET).createSignedUrl(path, SIGNED_CROP_SECONDS);
        if (signed.error || !signed.data?.signedUrl) continue;
        out.push({ item_id: row.item_id, slide_index: row.slide_index, image_url: signed.data.signedUrl });
      }
      return out;
    },
    pairLink: (linkItemId, pictureItemId, candidates) =>
      rpc<boolean>(admin, "pair_board_deck_import_link", {
        p_link_item_id: linkItemId,
        p_picture_item_id: pictureItemId,
        p_candidates: candidates,
      }),
    embedImages: inference
      ? async (inputs) => {
        const response = await inference.embedImage(inputs);
        imageModelVersion = response.model_version;
        return new Map(response.vectors.map((vector) => [vector.id, vector.v]));
      }
      : null,
    claimAdjudication: (importId, slideIndex) =>
      rpc<AdjudicationClaim>(admin, "claim_board_deck_import_adjudication", {
        p_import_id: importId,
        p_slide_index: slideIndex,
        p_lease_owner: leaseOwner,
      }),
    storeAdjudication: async (importId, slideIndex, assignments) => {
      await rpc(admin, "store_board_deck_import_adjudication", {
        p_import_id: importId,
        p_slide_index: slideIndex,
        p_assignments: assignments,
        p_lease_owner: leaseOwner,
      });
    },
    adjudicate: apiKey
      ? async (context) => {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            model: ADJUDICATION.model,
            max_tokens: ADJUDICATION.maxTokens,
            system: ADJUDICATION_SYSTEM,
            tools: [adjudicationTool()],
            tool_choice: { type: "tool", name: ADJUDICATION_TOOL_NAME, disable_parallel_tool_use: true },
            messages: [{ role: "user", content: [{ type: "text", text: JSON.stringify(context) }] }],
          }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new AdjudicationHttpError(response.status);
        }
        const body = await response.json() as {
          content?: Array<{ type?: string; name?: string; input?: unknown }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const toolUse = body.content?.find((entry) => entry.type === "tool_use" && entry.name === ADJUDICATION_TOOL_NAME);
        return {
          input: toolUse?.input ?? null,
          usage: {
            input_tokens: Number(body.usage?.input_tokens ?? 0),
            output_tokens: Number(body.usage?.output_tokens ?? 0),
          },
        };
      }
      : null,
    // The look tier (look.ts, 00679). Without inference it reports itself
    // unavailable for imports that asked for photo match.
    look: {
      healthy: async () => Boolean(inference && (await inference.healthz())?.warmed),
      gate: (importId) => rpc<LookGate>(admin, "board_deck_import_look_gate", { p_import_id: importId }),
      cropUrls: async (itemIds) => {
        const out = new Map<string, string>();
        if (itemIds.length === 0) return out;
        const { data, error } = await admin
          .from("board_deck_import_items")
          .select("id, pin:proposal_board_items(image_url, data_image_url:data->>image_url)")
          .in("id", itemIds);
        if (error) throw new Error(`crop urls: ${error.message}`);
        for (const row of (data ?? []) as any[]) {
          const pin = Array.isArray(row.pin) ? row.pin[0] : row.pin;
          // Only crops in the board bucket go to the embedder, signed after
          // the claim (cron) or the caller's RLS read (browser) let us here.
          const path = normalizeBoardObjectReference(pin?.image_url ?? pin?.data_image_url);
          if (!path) continue;
          const signed = await admin.storage.from(BOARD_ASSET_BUCKET).createSignedUrl(path, SIGNED_CROP_SECONDS);
          if (!signed.error && signed.data?.signedUrl) out.set(row.id, signed.data.signedUrl);
        }
        return out;
      },
      knn: async (importId, vector, limit, category) => {
        const rows = await rpc<KnnHit[] | null>(admin, "board_deck_import_match_knn", {
          p_import_id: importId,
          p_embedding: toPgVector(vector),
          p_limit: limit,
          p_category: category,
        });
        return (rows ?? []).map((row) => ({
          product_id: row.product_id,
          rank: Number(row.rank),
          layer: row.layer ?? null,
        }));
      },
      imageKnn: async (importId, vector, limit, category) => {
        const rows = await rpc<KnnHit[] | null>(admin, "board_deck_import_match_image_knn", {
          p_import_id: importId,
          p_embedding: toPgVector(vector),
          p_limit: limit,
          p_category: category,
        });
        return (rows ?? []).map((row) => ({
          product_id: row.product_id,
          rank: Number(row.rank),
          layer: row.layer ?? null,
          source: row.source ?? null,
        }));
      },
      phashMatch: async (importId, phash, maxDistance, limit) => {
        const rows = await rpc<PhashHit[] | null>(admin, "board_deck_import_match_phash", {
          p_import_id: importId,
          p_phash: phash,
          p_max_distance: maxDistance,
          p_limit: limit,
        });
        return (rows ?? []).map((row) => ({
          product_id: row.product_id,
          distance: Number(row.distance),
          layer: row.layer ?? null,
          source: row.source ?? null,
        }));
      },
      // The URL is one this function just signed on the board bucket.
      cropSignature: async (url) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) {
          await response.body?.cancel();
          return null;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        return bytes.length > 0 && bytes.length <= CROP_MAX_BYTES ? await cropSignature(bytes) : null;
      },
      storeCrop: async (itemId, crop) => {
        if (!imageModelVersion) return;
        await rpc(admin, "store_board_deck_import_crop_signature", {
          p_item_id: itemId,
          p_lease_owner: leaseOwner,
          p_image_hash: crop.image_hash,
          p_phash: crop.phash,
          p_vector: toPgVector(crop.vector),
          p_model_version: imageModelVersion,
        });
      },
      suppressed: async (itemIds) => {
        const out = new Map<string, Set<string>>();
        if (itemIds.length === 0) return out;
        const { data, error } = await admin
          .from("board_deck_import_items")
          .select("id, suppressed:evidence->suppressed")
          .in("id", itemIds);
        if (error) throw new Error(`suppressed: ${error.message}`);
        for (const row of (data ?? []) as any[]) {
          const ids = (Array.isArray(row.suppressed) ? row.suppressed : [])
            .map((entry: any) => entry?.product_id)
            .filter((id: unknown): id is string => typeof id === "string");
          if (ids.length) out.set(row.id, new Set(ids));
        }
        return out;
      },
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log,
  };
}

function claimedItems(result: unknown): ClaimedItem[] {
  const items = (result as { items?: unknown })?.items;
  return Array.isArray(items) ? items as ClaimedItem[] : [];
}

async function finish(
  admin: SupabaseClient,
  runId: number,
  status: "succeeded" | "failed" | "skipped",
  detail: Record<string, unknown>,
  error: string | null,
  costUsd: number | null,
): Promise<void> {
  const { error: finishError } = await admin.rpc("finish_board_deck_import_resolve_run", {
    p_run_id: runId,
    p_status: status,
    p_detail: detail,
    p_error: error,
    p_cost_usd: costUsd,
  });
  if (finishError) log("finish_failed", { run_id: runId, error: finishError.message });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "not_configured" }, 500);

  let body: { job_run_id?: unknown; import_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const authorization = req.headers.get("Authorization");
  const isService = isServiceCaller(authorization, Deno.env.get("SUPABASE_SECRET_KEYS"));
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (isService) {
    const runId = Number(body.job_run_id);
    if (!Number.isSafeInteger(runId) || runId < 1) return json({ error: "job_run_id_required" }, 400);
    try {
      const summary = await runResolve(deps(admin, (limit) =>
        rpc(admin, "claim_board_deck_import_items", { p_limit: limit })));
      await finish(admin, runId, summary.claimed ? "succeeded" : "skipped", { summary }, null, summary.cost_usd);
      log("run_done", { run_id: runId, ...summary });
      return json({ ok: true, summary });
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      await finish(admin, runId, "failed", {}, message, null);
      log("run_failed", { run_id: runId, error: message });
      return json({ error: "resolve_failed" }, 500);
    }
  }

  // Browser path: the import must be visible to the caller under RLS.
  const importId = typeof body.import_id === "string" ? body.import_id : "";
  if (!UUID_RE.test(importId)) return json({ error: "import_id_required" }, 400);
  if (!authorization) return json({ error: "unauthorized" }, 401);
  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const visible = await asCaller.from("board_deck_imports").select("id").eq("id", importId).maybeSingle();
  if (visible.error || !visible.data) return json({ error: "not_found" }, 404);

  let runId: number | null = null;
  try {
    await rpc(admin, "materialize_board_deck_import_links", { p_import_id: importId });
    const summary = await runResolve(deps(admin, async (limit) => {
      const result = await rpc(admin, "claim_board_deck_import_items_for_import", {
        p_import_id: importId,
        p_limit: limit,
      });
      // Billing guard: a job_runs row only when there is work.
      if (claimedItems(result).length && runId == null) {
        runId = await rpc<number>(admin, "begin_board_deck_import_resolve_run", { p_import_id: importId });
      }
      return result;
    }));
    if (runId != null) await finish(admin, runId, "succeeded", { summary }, null, summary.cost_usd);
    return json({ ok: true, summary });
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    if (runId != null) await finish(admin, runId, "failed", {}, message, null);
    log("run_failed", { import_id: importId, error: message });
    return json({ error: "resolve_failed" }, 500);
  }
});
