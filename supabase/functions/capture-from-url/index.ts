// Supabase Edge Function: capture-from-url
//
// Schedule & Boards Wave 3 (A3). Fetches a product page server-side, behind
// SSRF hard-guards (see ssrf.ts), and extracts name/brand/price/images/
// description (see extract.ts) into the `ExtractedProduct` shape the portal
// consumes via `useCaptureFromUrl`.
//
//   · mode 'capture'  → fetch + extract the given `url`; returns ExtractedProduct
//                       for a fresh personal-layer draft (captureProduct).
//   · mode 'refresh'  → require `productId`; load it, confirm the caller may see
//                       it, fetch + extract from its stored `source_url`; returns
//                       ExtractedProduct for buildRefreshDiff (per-field accept,
//                       never a silent overwrite).
//
// Auth mirrors spec-pdf/po-send: the gateway verifies the JWT (verify_jwt
// default) AND we resolve the caller in-code from the Authorization header (a
// service-role client carrying the caller's JWT → auth.getUser). Not-found and
// not-owned BOTH collapse to 404 so foreign product ids aren't confirmed.
// Uniform error shape: { error: string } with a matching HTTP status.

// deno-lint-ignore-file no-explicit-any no-import-prefix

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type ExtractedProduct, extractProduct } from "./extract.ts";
import {
  parseQuotaDecision,
  quotaRpcArgsForVerifiedCaller,
  rateLimitBody,
} from "./quota.ts";
import { fetchHtml, UrlError } from "./ssrf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

/** Resolve the caller from the Authorization header (spec-pdf/po-send idiom). */
async function getCallerUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

// ─── Body parsing ────────────────────────────────────────────────────────────

interface CapturePayload {
  url: string | null;
  mode: "capture" | "refresh";
  productId: string | null;
}

function parseBody(
  raw: unknown,
): { ok: true; payload: CapturePayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_body" };
  }
  const b = raw as Record<string, unknown>;

  const mode = b.mode;
  if (mode !== "capture" && mode !== "refresh") {
    return { ok: false, error: "invalid_mode" };
  }

  const url = typeof b.url === "string" && b.url.trim() ? b.url.trim() : null;
  const productId = typeof b.productId === "string" && b.productId
    ? b.productId
    : null;

  if (mode === "capture" && !url) return { ok: false, error: "url_required" };
  if (mode === "refresh" && !productId) {
    return { ok: false, error: "product_id_required" };
  }

  return { ok: true, payload: { url, mode, productId } };
}

// ─── Refresh ownership gate (mirrors products RLS from 00152) ──────────────────

interface ProductRow {
  id: string;
  source_url: string | null;
  layer: string | null;
  owner_user_id: string | null;
  studio_id: string | null;
}

/**
 * Mirror `products_*_select` (00152): personal → the owner; studio → an active
 * organization_members row; catalog → any authenticated caller. Returns false
 * for anything else so the handler 404-collapses.
 */
async function callerCanSeeProduct(
  admin: any,
  callerId: string,
  p: ProductRow,
): Promise<boolean> {
  if (p.layer === "personal") return p.owner_user_id === callerId;
  if (p.layer === "catalog") return true;
  if (p.layer === "studio") {
    if (!p.studio_id) return false;
    const { data } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", p.studio_id)
      .eq("user_id", callerId)
      .eq("status", "active")
      .maybeSingle();
    return !!data;
  }
  return false;
}

// ─── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const parsed = parseBody(rawBody);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { url, mode, productId } = parsed.payload;

  const caller = await getCallerUser(req);
  if (!caller) return json({ error: "unauthorized" }, 401);

  // All privileged reads and quota accounting use the service client. The
  // quota RPC receives ONLY the id resolved from auth.getUser above; no body
  // field can select or consume quota for another user.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve which URL to fetch. capture → the given url; refresh → the
  // product's stored source_url, gated on visibility (404-collapse).
  let targetUrl: string;
  if (mode === "capture") {
    targetUrl = url!;
  } else {
    const { data, error } = await admin
      .from("products")
      .select("id, source_url, layer, owner_user_id, studio_id")
      .eq("id", productId!)
      .maybeSingle();
    if (error) {
      console.error("capture-from-url: product lookup failed", error);
      return json({ error: "lookup_failed" }, 500);
    }
    const product = data as ProductRow | null;
    if (!product || !(await callerCanSeeProduct(admin, caller.id, product))) {
      return json({ error: "not_found" }, 404);
    }
    if (!product.source_url || !product.source_url.trim()) {
      return json({ error: "no_source_url" }, 422);
    }
    targetUrl = product.source_url.trim();
  }

  // Consume immediately before the network boundary. Lookup/ownership errors
  // do not burn allowance, while both fresh captures and authorized refreshes
  // share the same durable per-user limits.
  const { data: quotaData, error: quotaError } = await admin.rpc(
    "consume_board_unfurl_quota",
    quotaRpcArgsForVerifiedCaller(caller.id),
  );
  if (quotaError) {
    console.error("capture-from-url: quota RPC failed", quotaError);
    return json({ error: "quota_check_failed" }, 503);
  }
  const quota = parseQuotaDecision(quotaData);
  if (!quota) {
    console.error("capture-from-url: malformed quota RPC response");
    return json({ error: "quota_check_failed" }, 503);
  }
  if (!quota.allowed) {
    return json(rateLimitBody(quota), 429, {
      "Retry-After": String(quota.retry_after_seconds),
    });
  }

  // Fetch + extract behind the SSRF guard.
  let result: ExtractedProduct;
  try {
    const { html, finalUrl } = await fetchHtml(targetUrl);
    result = extractProduct(html, finalUrl);
  } catch (e) {
    if (e instanceof UrlError) return json({ error: e.message }, e.status);
    console.error("capture-from-url: fetch/extract failed", e);
    return json({ error: "fetch_failed" }, 502);
  }

  return json(result, 200);
});
