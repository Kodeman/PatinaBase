// board-web-match — "Search the web for this piece" (US-15 W4b, SQ-361).
//
// Designer-pressed only; nothing calls it on a schedule. verify_jwt=true and
// the bearer must be a user's JWT: {item_ids[≤20]} are read under RLS (board
// managers), so a piece the caller cannot see is a 404. Everything after that
// runs with the service role: the crop is read from the board bucket (only
// under the import's own board), the 00680 budget is consumed for the board's
// studio (00682) for the crops that loaded, and results are
// appended through 00680's record_board_web_match_result (a settled piece has
// no resolver lease, so the lease-checked 00678 record RPC does not apply).
// core.ts holds the matching.
//
// GOOGLE_VISION_API_KEY is optional: without it POST answers 503 {code:'no_key'}
// and `GET ?probe=1` answers {enabled:false}, which hides the UI.

// deno-lint-ignore-file no-explicit-any no-import-prefix

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { DECK_PAGE_MAX_BYTES } from "../_shared/product-page/page.ts";
import {
  denoPinnedHttpTransport,
  fetchHtml,
  type PinnedRequestOptions,
  type ResolvedAddress,
  UrlError,
} from "../_shared/product-page/ssrf.ts";
import { BOARD_ASSET_BUCKET, bearerRole, normalizeBoardObjectReference } from "../board-asset-cleanup/core.ts";
import {
  FetchBlocked,
  gate,
  json,
  readItemIds,
  responseFor,
  runWebMatch,
  VISION_MAX_RESULTS,
  vendorDomain,
  type WebMatchItem,
} from "./core.ts";

const FUNCTION_NAME = "board-web-match";
const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn: FUNCTION_NAME, event, ...fields }));
}

function cropReference(pin: { image_url?: string | null; data?: any } | undefined): string | null {
  if (!pin) return null;
  const data = pin.data && typeof pin.data === "object" ? pin.data : {};
  return normalizeBoardObjectReference(data.original_image_url ?? pin.image_url ?? data.image_url);
}

Deno.serve(async (req) => {
  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY") || undefined;
  const early = gate(req, apiKey);
  if (early) return early;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "not_configured" }, 500);

  const authorization = req.headers.get("Authorization");
  if (bearerRole(authorization) !== "authenticated") return json({ error: "unauthorized" }, 401);

  let ids: string[] | null;
  try {
    ids = readItemIds(await req.json());
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!ids) return json({ error: "item_ids_required" }, 400);

  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization! } },
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Board-manager access: every piece must be readable under RLS.
  const visible = await asCaller
    .from("board_deck_import_items")
    .select("id, import_id, board_item_id, state, candidates")
    .in("id", ids);
  if (visible.error || (visible.data ?? []).length !== ids.length) return json({ error: "not_found" }, 404);
  const rows = visible.data as any[];
  const importIds = [...new Set(rows.map((row) => row.import_id as string))];
  if (importIds.length !== 1) return json({ error: "one_import_only" }, 400);

  const pinIds = rows.map((row) => row.board_item_id).filter((id): id is string => typeof id === "string");
  const pins = pinIds.length
    ? await asCaller.from("proposal_board_items").select("id, image_url, data").in("id", pinIds)
    : { data: [], error: null };
  if (pins.error) return json({ error: "pins_unavailable" }, 500);
  const pinById = new Map((pins.data ?? []).map((pin: any) => [pin.id as string, pin]));

  const deckImport = await asCaller.from("board_deck_imports").select("board_id").eq("id", importIds[0]).maybeSingle();
  if (deckImport.error || !deckImport.data?.board_id) return json({ error: "not_found" }, 404);
  const boardId = deckImport.data.board_id as string;

  // The board's studio pays (00682), and only its vendors and catalog vendors count as shops.
  const studio = await admin.rpc("board_web_match_studio_key", { p_import_id: importIds[0] });
  if (studio.error || !studio.data) return json({ error: "studio_unavailable" }, 500);

  const vendors = await admin.rpc("board_web_match_vendor_websites", { p_studio_id: studio.data });
  if (vendors.error) return json({ error: "vendors_unavailable" }, 500);
  const vendorDomains = new Map<string, string>();
  for (const vendor of (Array.isArray(vendors.data) ? vendors.data : []) as Array<{ name: string; website: string }>) {
    const domain = vendorDomain(vendor.website);
    if (domain && !vendorDomains.has(domain)) vendorDomains.set(domain, vendor.name);
  }

  const items: WebMatchItem[] = rows.map((row) => ({
    item_id: row.id,
    import_id: row.import_id,
    board_id: boardId,
    state: row.state,
    candidates: Array.isArray(row.candidates) ? row.candidates : [],
    crop_path: row.board_item_id ? cropReference(pinById.get(row.board_item_id)) : null,
  }));

  try {
    const result = await runWebMatch(items, {
      consumeBudget: async (n) => {
        const { data, error } = await admin.rpc("consume_board_web_match_budget", {
          p_studio_id: studio.data,
          p_n: n,
        });
        if (error) throw new Error(`consume_board_web_match_budget: ${error.message}`);
        return { granted: Number(data?.granted ?? 0), resets_at: data?.resets_at ?? null };
      },
      loadCrop: async (path) => {
        const object = await admin.storage.from(BOARD_ASSET_BUCKET).download(path);
        if (object.error || !object.data) return null;
        return encodeBase64(await object.data.arrayBuffer());
      },
      annotate: async (content) => {
        const response = await fetch(VISION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey! },
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            requests: [{
              image: { content },
              features: [{ type: "WEB_DETECTION", maxResults: VISION_MAX_RESULTS }],
            }],
          }),
        });
        if (!response.ok) throw new Error(`vision http ${response.status}`);
        return await response.json();
      },
      fetchPage: async (url, hop) => {
        try {
          // Each hop's request waits on its own host's gate (redirects included).
          const transport = {
            request: (target: URL, address: ResolvedAddress, options: PinnedRequestOptions) =>
              hop(target.toString(), () => denoPinnedHttpTransport.request(target, address, options)),
          };
          return await fetchHtml(url, { transport }, { maxBytes: DECK_PAGE_MAX_BYTES });
        } catch (error) {
          if (error instanceof UrlError) throw new FetchBlocked(error.message, error.status === 400);
          throw new FetchBlocked("fetch_failed", false);
        }
      },
      record: async (itemId, candidates, baseCandidates) => {
        const { data, error } = await admin.rpc("record_board_web_match_result", {
          p_item_id: itemId,
          p_candidates: candidates,
          p_base_candidates: baseCandidates,
        });
        if (error) throw new Error(`record_board_web_match_result: ${error.message}`);
        return data?.applied === true;
      },
      vendorDomains,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log,
    });
    log("run_done", { import_id: importIds[0], calls: result.calls, cap_reached: result.cap_reached });
    return responseFor(result);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    log("run_failed", { import_id: importIds[0], error: message });
    return json({ error: "web_match_failed" }, 500);
  }
});
