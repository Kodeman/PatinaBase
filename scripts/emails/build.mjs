#!/usr/bin/env node
// Generates three artifacts from the branded email source files:
//   1. supabase/migrations/00309_seed_branded_email_templates.sql
//        — dollar-quoted UPSERTs of the 5 DB/Resend templates into email_templates.
//   1b. supabase/migrations/00311_reseed_static_email_templates_branded.sql
//        — dollar-quoted UPSERTs of the 7 migrated static transactional/engagement
//          emails (back-in-stock, price-drop, lead-expiring, new-lead-designer,
//          client-confirmation, security-alert, workspace-invite).
//   2. apps/admin-portal/src/data/system-email-previews.ts
//        — the 6 GoTrue auth templates with sample vars substituted, for the
//          read-only admin "System emails" preview tab.
//
// Source of truth: packages/email/branded/*.html (DB templates, {{mustache}})
//                  supabase/templates/*.html      (auth templates, Go dialect)
// Re-run after editing any source file:  node scripts/emails/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = "00309_seed_branded_email_templates.sql";
const MIGRATION_STATIC = "00311_reseed_static_email_templates_branded.sql";

// Footer/nav merge-tags every DB template inherits from brandDefaults().
const BRAND_VARS = [
  "dashboard_url",
  "help_url",
  "prefs_url",
  "unsub_url",
  "business_address",
  "app_url",
];

const DB_TEMPLATES = [
  { file: "welcome.html", slug: "welcome-verification", name: "Welcome",
    category: "transactional", subject: "Welcome to Patina", vars: [] },
  { file: "weekly-digest.html", slug: "weekly-inspiration", name: "Weekly digest",
    category: "engagement", subject: "Your week on Patina",
    vars: ["new_commissions", "pieces_saved", "messages", "maker_name", "piece_name",
      "pieces_added", "project_name", "maker_name_2", "piece_name_2"] },
  { file: "announcement.html", slug: "founding-circle-update", name: "Product announcement",
    category: "campaign", subject: "New in Patina", vars: ["changelog_url"] },
  { file: "invitation.html", slug: "maker-invite", name: "Maker invitation",
    category: "transactional", subject: "{{designer_name}} would like to build with you",
    vars: ["designer_name", "studio_name", "invite_message", "accept_url",
      "recipient_email", "about_url"] },
  { file: "commission.html", slug: "commission-offer", name: "Commission offer",
    category: "transactional", subject: "A new commission from {{designer_name}}",
    vars: ["commission_id", "piece_name", "project_name", "designer_name", "studio_name",
      "quantity", "estimated_value", "commission_fee", "estimated_payout",
      "response_window", "commission_url"] },
];

// Previously-static transactional/engagement emails migrated onto the branded
// design system (00311). Each `vars` list reuses the EXACT {{tokens}} the current
// DB row + its sender already emit, so dispatch keeps rendering unchanged:
//   - back-in-stock / price-drop  → notification-dispatch (product wishlist)
//   - lead-expiring / new-lead-designer / client-confirmation / security-alert
//                                  → notification-dispatch (job.data + displayName)
//   - workspace-invite            → workspace-member-invite/index.ts
const STATIC_TEMPLATES = [
  { file: "back-in-stock.html", slug: "back-in-stock", name: "Back in stock",
    category: "engagement", subject: "Back in stock: {{productName}}",
    vars: ["productName", "displayName", "productImageTag", "productUrl"] },
  { file: "price-drop.html", slug: "price-drop", name: "Price drop",
    category: "engagement", subject: "Price drop: {{productName}}",
    vars: ["productName", "newPriceFormatted", "displayName", "oldPriceFormatted",
      "percentOff", "productImageTag", "productUrl"] },
  { file: "lead-expiring.html", slug: "lead-expiring", name: "Lead expiring",
    category: "transactional",
    subject: "Action needed: Lead from {{clientName}} expires in {{hoursRemaining}}h",
    vars: ["hoursRemaining", "designerName", "clientName", "leadUrl"] },
  { file: "new-lead-designer.html", slug: "new-lead-designer", name: "New lead (designer)",
    category: "transactional", subject: "New lead: {{clientName}} is interested",
    vars: ["clientName", "designerName", "projectType", "timeline", "budget", "leadUrl"] },
  { file: "client-confirmation.html", slug: "client-confirmation", name: "Consultation confirmed",
    category: "transactional", subject: "Your Patina consultation request is confirmed",
    vars: ["displayName", "designerName", "expectedResponseTime", "projectUrl"] },
  { file: "security-alert.html", slug: "security-alert", name: "Security alert",
    category: "transactional", subject: "Security alert for your Patina account",
    vars: ["displayName", "alertDescription", "deviceInfo", "location", "secureAccountUrl"] },
  { file: "workspace-invite.html", slug: "workspace-invite", name: "Workspace invitation",
    category: "transactional",
    subject: "{{inviter_name}} invited you to join {{studio_name}} on Patina",
    vars: ["first_name", "inviter_name", "studio_name", "action_link"] },
];

// The last un-migrated email_templates rows, brought onto the branded shell
// (00312). Two are LIVE — the in-app notification emails dispatched via
// comms-notification-dispatch → notification-dispatch → renderTemplateFromDb.
// Three are dormant/superseded transactional rows still on the old 00078 design
// (real password resets ship via GoTrue recovery.html; real receipts via
// invoice-payment-receipt; order-confirmation is the marketplace-order flow).
// Each `vars` list reuses the EXACT {{tokens}} the sender already emits, so
// dispatch keeps rendering unchanged — only the surrounding markup changes.
const REMAINING_TEMPLATES = [
  { file: "in-app-message.html", slug: "in-app-message", name: "In-app message — new",
    category: "transactional", subject: "New message from {{senderName}}",
    vars: ["displayName", "headline", "contextSubtitle", "senderName", "previewBody",
      "avatarHtml", "deepLink", "ctaLabel", "muteFooterHtml"] },
  { file: "in-app-message-mention.html", slug: "in-app-message-mention", name: "In-app message — @-mention",
    category: "transactional", subject: "{{senderName}} mentioned you in Patina",
    vars: ["displayName", "headline", "contextSubtitle", "senderName", "previewBody",
      "avatarHtml", "deepLink", "ctaLabel", "muteFooterHtml"] },
  { file: "order-confirmation.html", slug: "order-confirmation", name: "Order confirmation",
    category: "transactional", subject: "Order confirmed — {{orderNumber}}",
    vars: ["displayName", "orderNumber", "totalFormatted", "shippingAddress", "orderUrl"] },
  { file: "payment-receipt.html", slug: "payment-receipt", name: "Payment receipt",
    category: "transactional", subject: "Payment receipt — {{amountFormatted}}",
    vars: ["displayName", "amountFormatted", "orderNumber", "paidAt", "cardBrand",
      "cardLast4", "paymentIntentId"] },
  { file: "password-reset.html", slug: "password-reset", name: "Password reset",
    category: "transactional", subject: "Reset your Patina password",
    vars: ["displayName", "resetUrl"] },
];

const AUTH_TEMPLATES = [
  { file: "magic-link.html", key: "magic_link", subject: "Sign in to Patina" },
  { file: "confirmation.html", key: "confirmation", subject: "Confirm your Patina email address" },
  { file: "recovery.html", key: "recovery", subject: "Reset your Patina password" },
  { file: "email-change.html", key: "email_change", subject: "Confirm your new Patina email" },
  { file: "invite.html", key: "invite", subject: "You're invited to Patina" },
  { file: "reauthentication.html", key: "reauthentication", subject: "Your Patina verification code" },
];

const AUTH_SAMPLE = {
  "{{ .ConfirmationURL }}": "#preview-confirmation-link",
  "{{ .Token }}": "042731",
  "{{ .Email }}": "designer@example.com",
  "{{ .NewEmail }}": "new-address@example.com",
  "{{ .SiteURL }}": "https://app.patina.cloud",
};

const DELIM = "$tmpl$";

function readSrc(rel) {
  const html = readFileSync(join(ROOT, rel), "utf8");
  if (html.includes(DELIM)) {
    throw new Error(`${rel} contains the SQL dollar-quote delimiter ${DELIM}`);
  }
  return html;
}

// ---- 1. Seed migration ------------------------------------------------------
// Build the dollar-quoted UPSERT VALUES rows for a template array. Shared by the
// 00309 (branded design-system) and 00311 (migrated static emails) generators so
// both produce byte-identical row syntax.
function buildRows(templates) {
  return templates.map((t) => {
    const html = readSrc(`packages/email/branded/${t.file}`);
    const vars = JSON.stringify([...new Set([...t.vars, ...BRAND_VARS])]);
    const subject = t.subject.replaceAll("'", "''");
    const name = t.name.replaceAll("'", "''");
    return `  ('${t.slug}', '${name}', '${t.category}', '${subject}',\n` +
      `   ${DELIM}${html}${DELIM},\n` +
      `   '[]'::jsonb, '${vars}'::jsonb, true)`;
  }).join(",\n");
}

const rows = buildRows(DB_TEMPLATES);

const sql = `-- 00309_seed_branded_email_templates.sql
-- GENERATED by scripts/emails/build.mjs — do not hand-edit.
-- Edit packages/email/branded/*.html and re-run: node scripts/emails/build.mjs
--
-- Reseeds email_templates.html_content for the Patina email design system
-- (welcome, weekly digest, announcement) and adds the maker-invite and
-- commission-offer templates. The BEFORE UPDATE snapshot trigger (00125)
-- versions the prior content, so this reseed is reversible.

INSERT INTO public.email_templates
  (slug, name, category, subject_default, html_content, content_blocks, variables, is_active)
VALUES
${rows}
ON CONFLICT (slug) DO UPDATE SET
  name            = EXCLUDED.name,
  category        = EXCLUDED.category,
  subject_default = EXCLUDED.subject_default,
  html_content    = EXCLUDED.html_content,
  variables       = EXCLUDED.variables,
  is_active       = true,
  updated_at      = now();
`;

writeFileSync(join(ROOT, "supabase/migrations", MIGRATION), sql);

// ---- 1b. Static-email reseed migration (00311) ------------------------------
// Same UPSERT generator as 00309 — migrates the remaining hand-coded
// transactional/engagement emails onto the branded shell without altering the
// {{tokens}} their senders provide.
const staticRows = buildRows(STATIC_TEMPLATES);

const staticSql = `-- 00311_reseed_static_email_templates_branded.sql
-- GENERATED by scripts/emails/build.mjs — do not hand-edit.
-- Edit packages/email/branded/*.html and re-run: node scripts/emails/build.mjs
--
-- Migrates the remaining static transactional/engagement emails onto the Patina
-- branded email design system: back-in-stock, price-drop, lead-expiring,
-- new-lead-designer, client-confirmation, security-alert, workspace-invite.
-- Each row reuses the EXACT {{placeholder}} tokens its current sender emits, so
-- notification-dispatch / workspace-member-invite keep rendering unchanged — only
-- the surrounding markup is replaced with the branded shell. The BEFORE UPDATE
-- snapshot trigger (00125) versions the prior content, so this reseed is reversible.

INSERT INTO public.email_templates
  (slug, name, category, subject_default, html_content, content_blocks, variables, is_active)
VALUES
${staticRows}
ON CONFLICT (slug) DO UPDATE SET
  name            = EXCLUDED.name,
  category        = EXCLUDED.category,
  subject_default = EXCLUDED.subject_default,
  html_content    = EXCLUDED.html_content,
  variables       = EXCLUDED.variables,
  is_active       = true,
  updated_at      = now();
`;

writeFileSync(join(ROOT, "supabase/migrations", MIGRATION_STATIC), staticSql);

// ---- 1c. Remaining-email reseed migration (00312) ---------------------------
// Same UPSERT generator as 00309/00311 — brings the last un-migrated rows onto
// the branded shell: the two LIVE in-app notification emails and the three
// dormant transactional rows still on the old 00078 design. Tokens preserved.
const MIGRATION_REMAINING =
  "00312_reseed_remaining_email_templates_branded.sql";
const remainingRows = buildRows(REMAINING_TEMPLATES);

const remainingSql = `-- 00312_reseed_remaining_email_templates_branded.sql
-- GENERATED by scripts/emails/build.mjs — do not hand-edit.
-- Edit packages/email/branded/*.html and re-run: node scripts/emails/build.mjs
--
-- Brings the last un-migrated email_templates rows onto the Patina branded
-- email design system: the two LIVE in-app notification emails (in-app-message,
-- in-app-message-mention — dispatched via comms-notification-dispatch →
-- notification-dispatch → renderTemplateFromDb) and the three dormant/superseded
-- transactional rows still on the old 00078 design (order-confirmation,
-- payment-receipt, password-reset). Each row reuses the EXACT {{placeholder}}
-- tokens its sender already emits, so dispatch keeps rendering unchanged — only
-- the surrounding markup is replaced with the branded shell. The BEFORE UPDATE
-- snapshot trigger (00125) versions the prior content, so this reseed is
-- reversible.

INSERT INTO public.email_templates
  (slug, name, category, subject_default, html_content, content_blocks, variables, is_active)
VALUES
${remainingRows}
ON CONFLICT (slug) DO UPDATE SET
  name            = EXCLUDED.name,
  category        = EXCLUDED.category,
  subject_default = EXCLUDED.subject_default,
  html_content    = EXCLUDED.html_content,
  variables       = EXCLUDED.variables,
  is_active       = true,
  updated_at      = now();
`;

writeFileSync(
  join(ROOT, "supabase/migrations", MIGRATION_REMAINING),
  remainingSql
);

// ---- 2. Admin preview module ------------------------------------------------
const previews = AUTH_TEMPLATES.map((t) => {
  let html = readSrc(`supabase/templates/${t.file}`);
  for (const [token, value] of Object.entries(AUTH_SAMPLE)) {
    html = html.replaceAll(token, value);
  }
  return { key: t.key, file: t.file, subject: t.subject, html };
});

const ts = `// GENERATED by scripts/emails/build.mjs — do not hand-edit.
// Source: supabase/templates/*.html (GoTrue auth email templates).
// Sample GoTrue variables are substituted for the read-only admin preview.
// These are deployed to Strata via scripts/emails/deploy-auth-templates.ts.

export interface SystemEmailPreview {
  key: string;
  file: string;
  subject: string;
  html: string;
}

export const systemEmailPreviews: SystemEmailPreview[] = ${JSON.stringify(previews, null, 2)};
`;

writeFileSync(join(ROOT, "apps/admin-portal/src/data/system-email-previews.ts"), ts);

console.log(`Wrote supabase/migrations/${MIGRATION} (${DB_TEMPLATES.length} templates)`);
console.log(`Wrote supabase/migrations/${MIGRATION_STATIC} (${STATIC_TEMPLATES.length} templates)`);
console.log(`Wrote supabase/migrations/${MIGRATION_REMAINING} (${REMAINING_TEMPLATES.length} templates)`);
console.log(`Wrote apps/admin-portal/src/data/system-email-previews.ts (${previews.length} templates)`);
