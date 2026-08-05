#!/usr/bin/env node
// Generates the email artifacts from the branded email source files:
//   1. supabase/migrations/<REBAKE_MIGRATION>  — the ONLY migration this script
//        still writes by default: one idempotent UPSERT of all 17 branded slugs
//        plus a replace()-based patch for the 3 hand-authored 00336 arrival rows.
//   2. apps/admin-portal/src/data/system-email-previews.ts
//        — the 6 GoTrue auth templates with sample vars substituted, for the
//          read-only admin "System emails" preview tab.
//
// FROZEN (only rewritten with EMAILS_REWRITE_APPLIED=1, for drift inspection):
//   00309_seed_branded_email_templates.sql            — 5 DB/Resend templates
//   00311_reseed_static_email_templates_branded.sql   — 7 migrated static emails
//   00312_reseed_remaining_email_templates_branded.sql— 5 remaining rows
// These are applied on Strata; template changes fix forward via the re-bake
// migration, never by rewriting an applied file (see the patina-db-migrations
// skill). After the re-bake migration ships, bump REBAKE_MIGRATION.
//
// Source of truth: packages/email/branded/*.html (DB templates, {{mustache}})
//                  supabase/templates/*.html      (auth templates, Go dialect)
// Re-run after editing any source file:  node scripts/emails/build.mjs
// Auth-template-only preview refresh (never writes a migration):
//   node scripts/emails/build.mjs --auth-previews-only
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH_PREVIEWS_ONLY = process.argv.includes("--auth-previews-only");
const MIGRATION = "00309_seed_branded_email_templates.sql";
const MIGRATION_STATIC = "00311_reseed_static_email_templates_branded.sql";

// 00309/00311/00312 are APPLIED on Strata — frozen point-in-time snapshots.
// Editing a branded/*.html now ships as a NEW re-bake migration (REBAKE_MIGRATION
// below), never by rewriting an applied file. Set EMAILS_REWRITE_APPLIED=1 only
// to inspect drift between those snapshots and the current sources.
const REWRITE_APPLIED = process.env.EMAILS_REWRITE_APPLIED === "1";

// The current re-bake target. Once this migration has shipped, bump it to the
// next free number (ls supabase/migrations | sort | tail -1) before re-running —
// same rule as packages/email/scripts/render-db-templates.ts.
const REBAKE_MIGRATION = "00405_harden_email_templates_outlook_m365.sql";

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

const RECOVERY_LINK_TEMPLATE =
  "{{ if .RedirectTo }}{{ .RedirectTo }}#token_hash={{ .TokenHash }}&amp;type=recovery{{ else }}{{ .ConfirmationURL }}{{ end }}";
const RECOVERY_LINK_SAMPLE =
  "https://client.patina.cloud/auth/callback?type=recovery#token_hash=preview-token-hash&amp;type=recovery";

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

if (REWRITE_APPLIED && !AUTH_PREVIEWS_ONLY) {
  writeFileSync(join(ROOT, "supabase/migrations", MIGRATION), sql);
}

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

if (REWRITE_APPLIED && !AUTH_PREVIEWS_ONLY) {
  writeFileSync(join(ROOT, "supabase/migrations", MIGRATION_STATIC), staticSql);
}

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

if (REWRITE_APPLIED && !AUTH_PREVIEWS_ONLY) {
  writeFileSync(join(ROOT, "supabase/migrations", MIGRATION_REMAINING), remainingSql);
}

// ---- 1d. Re-bake migration (fix-forward for the applied 00309/00311/00312) ---
// All 17 branded slugs in one idempotent UPSERT, plus a replace()-based UPDATE
// for the three hand-authored 00336 "arrival" rows (they have no bake path —
// their HTML lives in that migration, not in packages/email/branded/).
const ALL_BRANDED = [...DB_TEMPLATES, ...STATIC_TEMPLATES, ...REMAINING_TEMPLATES];
const rebakeRows = buildRows(ALL_BRANDED);

// The 00336 rows carry byte-identical shell markup to the branded sources, so
// the same four rewrites apply. ORDER MATTERS: the bar block must be rewritten
// before the generic bare-table rule, or the bar table takes the plain
// width:100% style and never gets border-collapse. Every step is idempotent —
// no replacement's output re-matches its own pattern.
const ARRIVAL_SLUGS = [
  "design-request-held",
  "design-request-intro-delivered",
  "design-request-claimed",
];
const BAR_COLORS = ["#4E7A66", "#B08A46", "#A24E2E"];

// [from, to] pairs, in application order (first = applied first = innermost
// replace() call). The bar block MUST precede the generic bare-table rule.
const ARRIVAL_REWRITES = [
  [
    '<tr><td style="font-size:0; line-height:0;">\n' +
      '          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>',
    '<tr><td style="font-size:0; line-height:0; padding:0;">\n' +
      '          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;"><tr>',
  ],
  [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">',
  ],
  [
    '<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F0E6;">',
    '<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background:#F5F0E6;">',
  ],
  ...BAR_COLORS.map((c) => [
    `height="4" style="background:${c}; font-size:0; line-height:0;"`,
    `height="4" style="background:${c}; height:4px; font-size:4px; line-height:4px; padding:0;"`,
  ]),
];

// Nest the rewrites into one replace(replace(...)) expression over html_content,
// indenting each level so the generated SQL stays readable.
const arrivalExpr = ARRIVAL_REWRITES.reduce((inner, [from, to], i) => {
  const pad = "  ".repeat(ARRIVAL_REWRITES.length - i);
  return (
    `replace(\n` +
    `${pad}  ${inner.split("\n").join(`\n`)},\n` +
    `${pad}  $o$${from}$o$,\n` +
    `${pad}  $n$${to}$n$\n` +
    `${pad})`
  );
}, "html_content");

const rebakeSql = `-- ═══════════════════════════════════════════════════════════════════════════
-- ${REBAKE_MIGRATION.replace(/_.*/, "")} — Harden the remaining email_templates rows for Outlook/M365
--
-- Companion to 00404 (which re-baked the 17 designer-onboarding drip rows from
-- the fixed packages/email React templates). This one covers every OTHER live
-- row: the ${ALL_BRANDED.length} branded slugs seeded by 00309/00311/00312 and the ${ARRIVAL_SLUGS.length} hand-authored
-- "arrival" rows seeded by 00336.
--
-- Microsoft's Exchange HTML converter (new Outlook desktop, OWA, Outlook iOS —
-- all render the Exchange-converted body, not the source) strips <head>/<style>,
-- every table ATTRIBUTE (width/align/border/cellpadding/cellspacing/role), the
-- bgcolor attribute, and the CSS \`height\` property. It KEEPS inline
-- background/background-color, padding, border-radius, fonts, width, font-size
-- and line-height. Gmail independently forces border-collapse:collapse on
-- message tables, which voids padding declared on a <table>. So the shells now
-- state inline what they used to state by attribute:
--
--   (a) CTA fill as inline background-color on the <a> (the <td bgcolor> stays,
--       but it alone left buttons transparent-on-cream with pale text);
--   (b) the 4px tri-colour bar cells carry height:4px + font-size:4px +
--       line-height:4px + padding:0, the cell WRAPPING them carries padding:0,
--       and the bar table carries border-collapse — losing cellpadding="0" and
--       cellspacing="0" falls back to td{padding:1px} and border-spacing:2px.
--       Measured in headless Chromium on the converted body: cells-only 10px
--       band → +wrapper padding 8px → +border-collapse 4px (the design intent);
--   (c) every full-width layout table declares width:100% inline, not only
--       width="100%".
--
-- No copy, colour, spacing value, or class name changed; healthy renderers are
-- pixel-identical to the previous markup.
--
-- The ${ALL_BRANDED.length}-row UPSERT below is GENERATED by scripts/emails/build.mjs from
-- packages/email/branded/*.html — do not hand-edit. 00309/00311/00312 are
-- applied on Strata and stay frozen; this is the fix-forward. The 00125 BEFORE
-- UPDATE snapshot trigger versions the prior content, so it is reversible.
--
-- The ${ARRIVAL_SLUGS.length} arrival rows are patched with replace() rather than re-seeded, so any
-- later admin-portal copy edit survives; each replace is a no-op if the pattern
-- is absent. Hit counts verified against 00336's actual html_content: 1 bar
-- block, 2 bare tables, 1 .bg table and 3 bar cells per row.
--
-- No GRANT/REVOKE: email_templates is reached only by the service-role client
-- inside edge functions (00296 precedent) — the legacy-grants seed is unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.email_templates
  (slug, name, category, subject_default, html_content, content_blocks, variables, is_active)
VALUES
${rebakeRows}
ON CONFLICT (slug) DO UPDATE SET
  name            = EXCLUDED.name,
  category        = EXCLUDED.category,
  subject_default = EXCLUDED.subject_default,
  html_content    = EXCLUDED.html_content,
  variables       = EXCLUDED.variables,
  is_active       = true,
  updated_at      = now();

-- ── The three 00336 arrival rows (hand-authored HTML, no bake path) ──────────
UPDATE public.email_templates AS t
SET html_content = s.h,
    updated_at   = now()
FROM (
  SELECT
    slug,
    ${arrivalExpr} AS h
  FROM public.email_templates
  WHERE slug IN (${ARRIVAL_SLUGS.map((s) => `'${s}'`).join(", ")})
) AS s
WHERE t.slug = s.slug
  AND t.html_content IS DISTINCT FROM s.h;
`;

if (!AUTH_PREVIEWS_ONLY) {
  writeFileSync(join(ROOT, "supabase/migrations", REBAKE_MIGRATION), rebakeSql);
}

// ---- 2. Admin preview module ------------------------------------------------
const previews = AUTH_TEMPLATES.map((t) => {
  let html = readSrc(`supabase/templates/${t.file}`);
  html = html.replaceAll(RECOVERY_LINK_TEMPLATE, RECOVERY_LINK_SAMPLE);
  for (const [token, value] of Object.entries(AUTH_SAMPLE)) {
    html = html.replaceAll(token, value);
  }
  if (/{{\s*(?:\.|if\b|else\b|end\b)/.test(html)) {
    throw new Error(
      `supabase/templates/${t.file} has an unresolved GoTrue variable in its admin preview`,
    );
  }
  return { key: t.key, file: t.file, subject: t.subject, html };
});

const ts = `// GENERATED by scripts/emails/build.mjs — do not hand-edit.
// Source: supabase/templates/*.html (GoTrue auth email templates).
// Sample GoTrue variables are substituted for the read-only admin preview.
// These are deployed to Strata via scripts/emails/deploy-auth-templates.mjs.

export interface SystemEmailPreview {
  key: string;
  file: string;
  subject: string;
  html: string;
}

export const systemEmailPreviews: SystemEmailPreview[] = ${JSON.stringify(previews, null, 2)};
`;

writeFileSync(join(ROOT, "apps/admin-portal/src/data/system-email-previews.ts"), ts);

if (AUTH_PREVIEWS_ONLY) {
  console.log(`Skipped all migration writes; wrote auth previews only (${previews.length} templates)`);
} else if (REWRITE_APPLIED) {
  console.log(`Rewrote APPLIED ${MIGRATION} / ${MIGRATION_STATIC} / ${MIGRATION_REMAINING}`);
} else {
  console.log(`Left 00309/00311/00312 frozen (applied on Strata) — set EMAILS_REWRITE_APPLIED=1 to inspect drift`);
}
if (!AUTH_PREVIEWS_ONLY) {
  console.log(`Wrote supabase/migrations/${REBAKE_MIGRATION} (${ALL_BRANDED.length} branded + ${ARRIVAL_SLUGS.length} arrival rows)`);
}
console.log(`Wrote apps/admin-portal/src/data/system-email-previews.ts (${previews.length} templates)`);
