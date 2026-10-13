import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/caller.ts";
import { sendOutboundDraft } from "../_shared/outbound-send.ts";
import { sendDraftBatch } from "./batch.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function canSend(admin: SupabaseClient<any>, draft: { organization_id: string; project_id: string | null }, userId: string): Promise<boolean> {
  const { data: membershipData, error: membershipError } = await admin.from("organization_members")
    .select("role").eq("organization_id", draft.organization_id).eq("user_id", userId).eq("status", "active").maybeSingle();
  const membership = membershipData as { role: string } | null;
  if (membershipError || !membership) return false;
  if (membership.role === "owner" || membership.role === "admin") return true;
  if (!draft.project_id) return false;
  const [{ data: projectData, error: projectError }, { data: leadData, error: leadError }] = await Promise.all([
    admin.from("projects").select("designer_id, lead_designer_id").eq("id", draft.project_id).maybeSingle(),
    admin.from("project_team_members").select("user_id").eq("project_id", draft.project_id).eq("role", "lead_designer").is("removed_at", null),
  ]);
  const project = projectData as { designer_id: string | null; lead_designer_id: string | null } | null;
  const leads = (leadData ?? []) as Array<{ user_id: string }>;
  if (projectError || leadError || !project) return false;
  if (leads.length) return leads.some((lead) => lead.user_id === userId);
  return (project.lead_designer_id ?? project.designer_id) === userId;
}

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
  if (!Array.isArray(draftIds) || draftIds.length < 1 || draftIds.length > 50 || draftIds.some((id) => typeof id !== "string" || !id)) {
    return json({ error: "draftIds_must_contain_1_to_50_ids" }, 400);
  }
  const results = await sendDraftBatch(draftIds as string[], caller.userId, {
    loadDraft: async (id) => {
      const { data, error } = await admin.from("outbound_drafts").select("id, organization_id, project_id").eq("id", id).maybeSingle();
      return error ? null : data;
    },
    canSend: (draft, userId) => canSend(admin, draft, userId),
    send: (id, userId) => sendOutboundDraft(admin, id, { kind: "designer", userId, draftId: id }),
  });
  return json({ results });
});
