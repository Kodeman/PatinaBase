#!/usr/bin/env node
// Deploys the branded GoTrue auth email templates (supabase/templates/*.html)
// to the Strata Supabase Cloud project via the Management API. These templates
// are NOT covered by `supabase db push` — this is the prod deploy path.
//
// Requires a Supabase personal access token:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/emails/deploy-auth-templates.mjs
// Verify without writing:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/emails/deploy-auth-templates.mjs --check
//
// The supabase/templates/*.html files are the single source of truth; local dev
// picks them up through config.toml [auth.email.template.*].
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REF = process.env.SUPABASE_PROJECT_REF || "bkvcixdmuyejfzcijpdg"; // Strata
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const CHECK_ONLY = process.argv.includes("--check");
const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;

// GoTrue Management-API config keys. reauthentication is best-effort — some
// API versions don't expose a content key for it (config.toml still covers local).
const TEMPLATES = [
  { file: "magic-link.html", subjectKey: "mailer_subjects_magic_link", contentKey: "mailer_templates_magic_link_content", subject: "Sign in to Patina", core: true },
  { file: "confirmation.html", subjectKey: "mailer_subjects_confirmation", contentKey: "mailer_templates_confirmation_content", subject: "Confirm your Patina email address", core: true },
  { file: "recovery.html", subjectKey: "mailer_subjects_recovery", contentKey: "mailer_templates_recovery_content", subject: "Reset your Patina password", core: true },
  { file: "email-change.html", subjectKey: "mailer_subjects_email_change", contentKey: "mailer_templates_email_change_content", subject: "Confirm your new Patina email", core: true },
  { file: "invite.html", subjectKey: "mailer_subjects_invite", contentKey: "mailer_templates_invite_content", subject: "You're invited to Patina", core: true },
  { file: "reauthentication.html", subjectKey: "mailer_subjects_reauthentication", contentKey: "mailer_templates_reauthentication_content", subject: "Your Patina verification code", core: false },
];

if (!TOKEN) {
  console.error("Missing SUPABASE_ACCESS_TOKEN (Supabase personal access token).");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function getConfig() {
  const res = await fetch(API, { headers });
  if (!res.ok) throw new Error(`GET config failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patch(payload) {
  const res = await fetch(API, { method: "PATCH", headers, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function loadTemplate(t) {
  const html = readFileSync(join(ROOT, "supabase/templates", t.file), "utf8");
  return { [t.contentKey]: html, [t.subjectKey]: t.subject };
}

function verify(cfg) {
  const magic = cfg.mailer_templates_magic_link_content || "";
  const ok = magic.includes("{{ .Token }}") && magic.includes("Patina");
  console.log(`  otp_length: ${cfg.mailer_otp_length} (want 6)`);
  console.log(`  magic_link has {{ .Token }} + branding: ${ok ? "yes" : "NO"}`);
  return ok && cfg.mailer_otp_length === 6;
}

if (CHECK_ONLY) {
  const cfg = await getConfig();
  console.log(`Strata (${REF}) auth email config:`);
  const ok = verify(cfg);
  process.exit(ok ? 0 : 2);
}

// Core templates + otp_length in one PATCH.
const corePayload = { mailer_otp_length: 6 };
for (const t of TEMPLATES.filter((x) => x.core)) Object.assign(corePayload, loadTemplate(t));
await patch(corePayload);
console.log(`Pushed ${TEMPLATES.filter((x) => x.core).length} core templates + otp_length=6.`);

// Reauthentication best-effort (unknown key on some API versions).
for (const t of TEMPLATES.filter((x) => !x.core)) {
  try {
    await patch(loadTemplate(t));
    console.log(`Pushed ${t.file}.`);
  } catch (err) {
    console.warn(`Skipped ${t.file}: ${err.message.split("\n")[0]} (config.toml still covers local).`);
  }
}

console.log("Verifying…");
if (verify(await getConfig())) {
  console.log("Auth templates deployed and verified.");
} else {
  console.error("Verification failed — inspect the Strata dashboard.");
  process.exit(2);
}
