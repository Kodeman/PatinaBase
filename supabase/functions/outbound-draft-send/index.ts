import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/caller.ts";
import { canSendOutbound } from "../_shared/outbound-can-send.ts";
import { finalizeOutboundDraft, sendOutboundDraft } from "../_shared/outbound-send.ts";
import { sendDraftBatch } from "./batch.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!req.headers.get("authorization")) return json({ error: "unauthenticated" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const caller = await resolveCaller(req, admin);
  if (caller.service || !caller.userId) return json({ error: "unauthenticated" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const draftIds = (body as { draftIds?: unknown })?.draftIds;
  // {finalize:true} finishes drafts the provider already has; it never sends.
  const finalize = (body as { finalize?: unknown })?.finalize === true;
  if (!Array.isArray(draftIds) || draftIds.length < 1 || draftIds.length > 50 || draftIds.some((id) => typeof id !== "string" || !id)) {
    return json({ error: "draftIds_must_contain_1_to_50_ids" }, 400);
  }
  const results = await sendDraftBatch(draftIds as string[], caller.userId, {
    loadDraft: async (id) => {
      const { data, error } = await admin.from("outbound_drafts").select("id, organization_id, project_id").eq("id", id).maybeSingle();
      return error ? null : data;
    },
    canSend: (draft, userId) => canSendOutbound(admin, draft, userId),
    send: (id, userId) => (finalize ? finalizeOutboundDraft : sendOutboundDraft)(admin, id, { kind: "designer", userId, draftId: id }),
  });
  return json({ results });
});
