import type { SendAuthority } from "../_shared/send-authority.ts";

export const TEMPLATE_SEND_AUTHORITIES: Record<string, SendAuthority> = {
  "welcome-verification": { kind: "exempt", reason: "auth" },
  "password-reset": { kind: "exempt", reason: "auth" },
  "security-alert": { kind: "exempt", reason: "auth" },
  "order-confirmation": { kind: "exempt", reason: "recipient_receipt" },
  "payment-receipt": { kind: "exempt", reason: "recipient_receipt" },
  "client-confirmation": { kind: "exempt", reason: "recipient_receipt" },
  "new-lead-designer": { kind: "exempt", reason: "patina_to_designer" },
  "lead-expiring": { kind: "exempt", reason: "patina_to_designer" },
  "weekly-inspiration": { kind: "exempt", reason: "patina_to_designer" },
  "founding-circle-update": { kind: "exempt", reason: "patina_to_designer" },
  "price-drop": { kind: "exempt", reason: "internal" },
  "back-in-stock": { kind: "exempt", reason: "internal" },
  "campaign-product-launch": { kind: "exempt", reason: "internal" },
  "campaign-seasonal": { kind: "exempt", reason: "internal" },
  "campaign-maker-spotlight": { kind: "exempt", reason: "internal" },
  "campaign-reengagement": { kind: "exempt", reason: "internal" },
  "maker-invite": { kind: "exempt", reason: "patina_to_designer" },
  "commission-offer": { kind: "exempt", reason: "patina_to_designer" },
  "in-app-message": { kind: "exempt", reason: "internal" },
  "in-app-message-mention": { kind: "exempt", reason: "internal" },
  "design-request-held": { kind: "exempt", reason: "patina_to_designer" },
  "design-request-intro-delivered": { kind: "exempt", reason: "patina_to_designer" },
  "design-request-claimed": { kind: "exempt", reason: "patina_to_designer" },
  "milestone-proposal-sent": { kind: "exempt", reason: "patina_to_designer" },
  "milestone-proposal-signed": { kind: "exempt", reason: "patina_to_designer" },
  "milestone-request-claimed": { kind: "exempt", reason: "patina_to_designer" },
  "milestone-first-payment": { kind: "exempt", reason: "patina_to_designer" },
  "designer-invite": { kind: "exempt", reason: "patina_to_designer" },
  "designer-invite-nudge-1": { kind: "exempt", reason: "patina_to_designer" },
  "designer-invite-nudge-2": { kind: "exempt", reason: "patina_to_designer" },
  "designer-welcome": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-document-model": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-capture": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-library": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-drafting-room": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-open-requests": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-hours": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-books": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-aesthete": { kind: "exempt", reason: "patina_to_designer" },
  "onboarding-six-weeks": { kind: "exempt", reason: "patina_to_designer" },
  "workspace-invite": { kind: "exempt", reason: "internal" },
  "sms_optin_invite": { kind: "exempt", reason: "internal" },
  "sms_optin_confirm": { kind: "exempt", reason: "recipient_receipt" },
  "sms_court_assignment": { kind: "exempt", reason: "internal" },
  "sms_daily_digest": { kind: "exempt", reason: "patina_to_designer" },
  "sms_delivery_confirm": { kind: "exempt", reason: "recipient_receipt" },
  "sms_help": { kind: "exempt", reason: "carrier_compliance" },
  "sms_selection": { kind: "exempt", reason: "recipient_receipt" },
  "sms_inbound_reply": { kind: "exempt", reason: "carrier_compliance" },
  "sms_site_card": { kind: "exempt", reason: "patina_to_designer" },
  "sms_day_of": { kind: "exempt", reason: "patina_to_designer" },
  "sms_field_link_renew": { kind: "exempt", reason: "patina_to_designer" },
  "sms_client_first_letter": { kind: "exempt", reason: "patina_to_designer" },
  "sms_selection_ready": { kind: "exempt", reason: "patina_to_designer" },
  "sms_window_pick": { kind: "exempt", reason: "patina_to_designer" },
  "sms_hours_prompt": { kind: "exempt", reason: "patina_to_designer" },
};

interface NotificationJob {
  user_id: string;
  template_id: string;
  data: Record<string, unknown>;
}

interface NotificationAuthorityDb {
  from(table: string): any;
}

export async function resolveNotificationAuthority(
  job: NotificationJob,
  db: NotificationAuthorityDb,
): Promise<SendAuthority | null> {
  if (job.data.sequence_id != null) {
    return { kind: "exempt", reason: "patina_to_designer" };
  }
  if (job.template_id === "in-app-message" || job.template_id === "in-app-message-mention") {
    const senderId = job.data.sender_id;
    if (typeof senderId !== "string" || !senderId) return null;

    const projectId = job.data.project_id;
    if (typeof projectId === "string" && projectId) {
      const { data: project } = await db.from("projects")
        .select("studio_id")
        .eq("id", projectId)
        .maybeSingle();
      if (project?.studio_id) {
        const { data: membership } = await db.from("organization_members")
          .select("user_id")
          .eq("organization_id", project.studio_id)
          .eq("user_id", job.user_id)
          .eq("status", "active")
          .maybeSingle();
        if (membership) return { kind: "exempt", reason: "internal" };
      }
    }
    return { kind: "designer", userId: senderId };
  }
  return TEMPLATE_SEND_AUTHORITIES[job.template_id] ?? null;
}
