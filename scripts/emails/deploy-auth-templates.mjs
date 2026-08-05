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
const TAGLINE = "A workshop for interior designers, their clients, and the makers they trust.";

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

const REQUIRED_TEMPLATE_DETAILS = {
  "magic-link.html": ["{{ .Token }}", "{{ .ConfirmationURL }}", "60 minutes"],
  "confirmation.html": ["{{ .ConfirmationURL }}", "60 minutes"],
  "recovery.html": ["{{ .ConfirmationURL }}", "60 minutes"],
  "email-change.html": ["{{ .ConfirmationURL }}", "60 minutes"],
  "invite.html": ["{{ .ConfirmationURL }}", "60 minutes"],
  "reauthentication.html": ["{{ .Token }}", "60 minutes"],
};

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

function readTemplate(t) {
  return readFileSync(join(ROOT, "supabase/templates", t.file), "utf8");
}

function loadTemplate(t) {
  const html = readTemplate(t);
  return { [t.contentKey]: html, [t.subjectKey]: t.subject };
}

function verify(cfg) {
  const localOk = TEMPLATES.every((t) => {
    const html = readTemplate(t);
    const missing = [TAGLINE, ...REQUIRED_TEMPLATE_DETAILS[t.file]].filter((detail) => !html.includes(detail));
    console.log(`  ${t.file}: ${missing.length === 0 ? "yes" : `NO (missing ${missing.join(", ")})`}`);
    return missing.length === 0;
  });

  // Strata may not expose reauthentication's content key in every Management
  // API version. Every local source is checked above; remotely verify every
  // template key that the API does expose, and require all core templates.
  const remoteOk = TEMPLATES.every((t) => {
    const html = cfg[t.contentKey];
    if (!html && !t.core) {
      console.log(`  ${t.file} in Strata: not exposed by this API version (local source checked)`);
      return true;
    }
    const missing = !html
      ? ["template content"]
      : [TAGLINE, ...REQUIRED_TEMPLATE_DETAILS[t.file]].filter((detail) => !html.includes(detail));
    const subjectOk = cfg[t.subjectKey] === t.subject;
    console.log(`  ${t.file} in Strata: ${missing.length === 0 && subjectOk ? "yes" : `NO${missing.length ? ` (missing ${missing.join(", ")})` : ""}${subjectOk ? "" : " (subject differs)"}`}`);
    return missing.length === 0 && subjectOk;
  });

  console.log(`  otp_length: ${cfg.mailer_otp_length} (want 6)`);
  console.log(`  otp_exp: ${cfg.mailer_otp_exp} (want 3600 seconds)`);
  return localOk && remoteOk && cfg.mailer_otp_length === 6 && cfg.mailer_otp_exp === 3600;
}

if (CHECK_ONLY) {
  const cfg = await getConfig();
  console.log(`Strata (${REF}) auth email config:`);
  const ok = verify(cfg);
  process.exit(ok ? 0 : 2);
}

// Core templates + otp_length in one PATCH.
const corePayload = { mailer_otp_length: 6, mailer_otp_exp: 3600 };
for (const t of TEMPLATES.filter((x) => x.core)) Object.assign(corePayload, loadTemplate(t));
await patch(corePayload);
console.log(`Pushed ${TEMPLATES.filter((x) => x.core).length} core templates + otp_length=6 + otp_exp=3600.`);

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
