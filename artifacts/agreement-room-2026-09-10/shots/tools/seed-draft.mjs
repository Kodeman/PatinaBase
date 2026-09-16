// Throwaway draft seeder for P0 current-state capture.
// Mirrors apps/designer-portal/e2e/agreement/agreement-parts.agreement.pw.ts beforeAll().
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node seed-draft.mjs
//
// Prints: PROPOSAL_ID=<uuid>

import { createRequire } from "node:module";

// ESM resolution walks up from THIS file's path, which sits under
// artifacts/ (no node_modules ancestor) — resolve against the app's
// node_modules instead, the same trick capture.mjs uses for playwright.
const require = createRequire(import.meta.url);
const { createClient } = require(
  require.resolve("@supabase/supabase-js", {
    paths: ["/Users/kody/Code/patina-merged/apps/designer-portal"],
  }),
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

const adminDb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getDesignerId(email) {
  // NOT adminDb.auth.admin.listUsers() — it 500s against a freshly reset
  // local stack (supabase/seed/leads_room_scans.sql inserts auth.users rows
  // without token columns; GoTrue's Go scanner chokes on NULL
  // confirmation_token). Same workaround as
  // e2e/helpers/supabase-admin.ts's getUserIdByEmail: read auth.users
  // directly via psql.
  const { execFileSync } = await import("node:child_process");
  const escaped = email.replace(/'/g, "''");
  const out = execFileSync(
    "psql",
    [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "-t",
      "-A",
      "-c",
      `select id from auth.users where email = '${escaped}'`,
    ],
    { encoding: "utf8" },
  ).trim();
  if (!out) throw new Error(`Designer not found: ${email}`);
  return out;
}

async function run() {
  const designerId = await getDesignerId("designer@patina.dev");

  const { data: proposal, error: proposalErr } = await adminDb
    .from("proposals")
    .insert({
      designer_id: designerId,
      title: "Okonkwo house — design services agreement",
      status: "draft",
      document_kind: "design_services",
      commercial_state: "draft",
    })
    .select("id")
    .single();
  if (proposalErr) throw proposalErr;
  const proposalId = proposal.id;

  const { error: termsErr } = await adminDb.from("proposal_service_terms").insert({
    proposal_id: proposalId,
    scope: "Interior design services for the Okonkwo house.",
    deliverables: ["Concept presentation"],
    exclusions: ["Construction labor"],
    billing_ceiling_cents: 2_400_000,
    retainer_amount_cents: 500_000,
    retainer_activation_policy: "immediate",
    billing_cadence: "monthly",
    currency: "USD",
    terms: "Ownership, cancellation, expenses.",
    current_rate_version: 1,
    furnishings_deposit_percent: 50,
  });
  if (termsErr) throw termsErr;

  console.log(`PROPOSAL_ID=${proposalId}`);
}

run().catch((err) => {
  console.error("SEED_FAILED:", err.message ?? err);
  process.exit(1);
});
