import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function canSendOutbound(
  admin: SupabaseClient<any>,
  draft: { organization_id: string | null; project_id: string | null },
  userId: string,
): Promise<boolean> {
  if (!draft.organization_id) return false;
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
