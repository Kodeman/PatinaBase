import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveNotificationAuthority, TEMPLATE_SEND_AUTHORITIES } from "./authority.ts";

const seededAndTriggeredTemplateIds = [
  "welcome-verification", "password-reset", "security-alert", "order-confirmation",
  "payment-receipt", "client-confirmation", "new-lead-designer", "lead-expiring",
  "weekly-inspiration", "founding-circle-update", "price-drop", "back-in-stock",
  "campaign-product-launch", "campaign-seasonal", "campaign-maker-spotlight",
  "campaign-reengagement", "maker-invite", "commission-offer", "in-app-message",
  "in-app-message-mention", "design-request-held", "design-request-intro-delivered",
  "design-request-claimed", "designer-invite", "designer-invite-nudge-1",
  "designer-invite-nudge-2", "designer-welcome", "onboarding-document-model",
  "onboarding-capture", "onboarding-library", "onboarding-drafting-room",
  "onboarding-open-requests", "onboarding-hours", "onboarding-books",
  "onboarding-aesthete", "onboarding-six-weeks", "milestone-proposal-sent",
  "milestone-proposal-signed", "milestone-request-claimed", "milestone-first-payment",
  "workspace-invite", "sms_optin_invite", "sms_optin_confirm", "sms_court_assignment",
  "sms_daily_digest", "sms_delivery_confirm", "sms_help", "sms_selection",
  "sms_inbound_reply", "sms_site_card", "sms_day_of", "sms_field_link_renew",
  "sms_client_first_letter", "sms_selection_ready", "sms_window_pick", "sms_hours_prompt",
];

Deno.test("every seeded and trigger-supplied email template has an authority", () => {
  for (const templateId of seededAndTriggeredTemplateIds) {
    if (!TEMPLATE_SEND_AUTHORITIES[templateId]) {
      throw new Error(`missing send authority for template: ${templateId}`);
    }
  }
});

Deno.test("notification authority rejects an unmapped template", async () => {
  assertEquals(
    await resolveNotificationAuthority(
      { user_id: "recipient", template_id: "not-mapped", data: {} },
      { from: () => ({}) },
    ),
    null,
  );
  assertEquals(
    await resolveNotificationAuthority(
      { user_id: "designer", template_id: "dynamic-sequence-name", data: { sequence_id: "sequence" } },
      { from: () => ({}) },
    ),
    { kind: "exempt", reason: "patina_to_designer" },
  );
});

Deno.test("comms notifications use internal or sender authority by recipient membership", async () => {
  const tables: string[] = [];
  const db = {
    from(table: string) {
      tables.push(table);
      return {
        select: () => {
          const query = {
            eq: () => query,
            maybeSingle: async () => table === "projects"
              ? { data: { organization_id: "studio" } }
              : { data: { user_id: "recipient" } },
          };
          return query;
        },
      };
    },
  };
  assertEquals(
    await resolveNotificationAuthority(
      { user_id: "recipient", template_id: "in-app-message", data: { sender_id: "sender", project_id: "project" } },
      db,
    ),
    { kind: "exempt", reason: "internal" },
  );
  assertEquals(tables, ["projects", "organization_members"]);

  const clientDb = {
    from: () => ({
      select: () => {
        const query = { eq: () => query, maybeSingle: async () => ({ data: null }) };
        return query;
      },
    }),
  };
  assertEquals(
    await resolveNotificationAuthority(
      { user_id: "client", template_id: "in-app-message-mention", data: { sender_id: "designer", project_id: "project" } },
      clientDb,
    ),
    { kind: "designer", userId: "designer" },
  );
});
