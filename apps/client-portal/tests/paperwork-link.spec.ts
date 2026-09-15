import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// The trade-side compliance upload door (PR-a, VISION V10, 00637) —
// /paperwork/[token] is a login-less page a firm's paperwork contact opens
// from a link the studio minted against the company card. This drives the real
// route against the LOCAL stack (never Strata), following pay-link.spec.ts /
// plans-link.spec.ts.
//
// Every fixture is minted through the honest path:
//   - the company card is a real `studio_contacts` company row, created fresh
//     per test, because `uniq_paperwork_link_tokens_active_company` holds a
//     firm to ONE live door (R-AF) and two tests sharing a firm would revoke
//     each other's token under `fullyParallel`;
//   - the token comes from `mint_paperwork_link` called as the SIGNED-IN
//     seeded designer, because the RPC's first act is
//     `is_active_studio_member(org)` and a service-role caller with no
//     auth.uid() is refused — driving it as service_role would pass through a
//     hole no real flow takes;
//   - the mint is given an explicit end date, which is R-AD's own path: a firm
//     with no open engagement may still be minted a link, and the studio names
//     the date. There is no fallback clock to lean on.
//
// THE UPLOAD CASE NEEDS THE EDGE RUNTIME. The form posts straight to the
// `paperwork-upload` function with the anon key. `supabase start` does not
// always leave the runtime up; bring it up first:
//
//   supabase functions serve --no-verify-jwt
//
// Cleanup: rows are left in place under throwaway company cards. This is the
// LOCAL stack and `supabase db reset` is the broom.

const LOCAL_URL = "http://127.0.0.1:54321";

// The local service-role key is NOT written into this file. The repo's
// pre-commit scan rejects any file whose content carries a service_role JWT,
// the Supabase CLI's public demo key included. Export it before the run:
//
//   export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)"
//   env -u CI pnpm --dir apps/client-portal test:e2e -- \
//     --project=chromium tests/paperwork-link.spec.ts
const SERVICE_JWT = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// The Supabase CLI's fixed local demo ANON key — the one `supabase status`
// prints on every machine, and the one playwright.config.ts already pins for
// the same reason. It authorizes nothing outside a local stack.
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Seeded dev studio and its owner (supabase/seed/dev-accounts.sql).
const STUDIO_ORG_ID = "b0000000-0000-0000-0000-000000000001";
const STUDIO_NAME = "Local Dev Studio";

// Constructed LAZILY: supabase-js throws `supabaseKey is required.` from its
// constructor, so building this at module scope would crash the import and an
// operator who forgot the export would meet that instead of the sentence below.
let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!adminClient) {
    expect(
      SERVICE_JWT,
      "SUPABASE_SERVICE_ROLE_KEY must be exported from the LOCAL stack (see the note at the top of this file)",
    ).not.toBe("");
    adminClient = createClient(LOCAL_URL, SERVICE_JWT, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
}

/** The seeded studio owner, signed in — the only caller `mint_paperwork_link` accepts. */
let designerClientCache: SupabaseClient | null = null;
async function designer(): Promise<SupabaseClient> {
  if (designerClientCache) return designerClientCache;
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: "designer@patina.dev",
    password: "password123",
  });
  expect(error, "the seeded designer must be able to sign in").toBeNull();
  designerClientCache = client;
  return client;
}

interface MintedDoor {
  companyId: string;
  companyName: string;
  tokenId: string;
  token: string;
}

async function mintDoor(): Promise<MintedDoor> {
  const companyId = randomUUID();
  const companyName = `Paperwork E2E ${randomUUID().slice(0, 8)}`;

  const { error: cardError } = await admin().from("studio_contacts").insert({
    id: companyId,
    organization_id: STUDIO_ORG_ID,
    entity_kind: "company",
    contact_kind: "sub",
    company_kind: "sub",
    company_name: companyName,
  });
  expect(cardError, "the firm's company card must be creatable").toBeNull();

  const { data, error } = await (await designer()).rpc("mint_paperwork_link", {
    p_company_id: companyId,
    // R-AD: the studio names the end date out loud; no silent fallback clock.
    p_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  expect(error, "the studio owner must be able to mint the firm's door").toBeNull();

  const row = (Array.isArray(data) ? data[0] : data) as {
    id: string;
    token: string;
  };
  expect(row?.token, "the mint returns the raw token exactly once").toMatch(
    /^[0-9a-f]{64}$/,
  );
  return { companyId, companyName, tokenId: row.id, token: row.token };
}

/** A gating paper the studio already holds for the firm, lapsed long ago. */
async function seedLapsedCertificate(companyId: string): Promise<void> {
  const { error } = await admin().from("studio_compliance_documents").insert({
    organization_id: STUDIO_ORG_ID,
    holder_type: "company",
    holder_id: companyId,
    doc_type: "coi_gl",
    number: "GL-118822",
    issuer: "Acme Mutual",
    issued_on: "2024-04-01",
    expires_on: "2025-03-31",
    blocks: ["site_access", "draw"],
  });
  expect(error, "the studio's own paper must be recordable").toBeNull();
}

async function documentsFor(companyId: string) {
  const { data } = await admin()
    .from("studio_compliance_documents")
    .select(
      "doc_type, inbound, source, verified_at, verified_by, rejected_at, superseded_by, file_path, expires_on",
    )
    .eq("holder_id", companyId);
  return data ?? [];
}

test.describe("/paperwork/[token]", () => {
  test("shows the firm what the studio holds, what it blocks, and what is owed", async ({
    page,
  }) => {
    const door = await mintDoor();
    await seedLapsedCertificate(door.companyId);

    await page.goto(`/paperwork/${door.token}`);

    await expect(
      page.getByRole("heading", { name: `Paperwork for ${STUDIO_NAME}` }),
    ).toBeVisible();
    await expect(page.getByText(door.companyName)).toBeVisible();

    // The paper word and the gate, in the studio's words (direction §3.8).
    await expect(
      page.getByText("COI, general liability, lapsed 31 March 2025."),
    ).toBeVisible();
    await expect(
      page.getByText("Blocks site access and the draw."),
    ).toBeVisible();

    // What is owed: an expected type with nothing on file, its form already
    // open (spec §3).
    await expect(page.getByText("W-9 is not on file.")).toBeVisible();
    await expect(page.getByText("Licence is not on file.")).toBeVisible();
    await expect(page.locator('form[aria-label="Add W-9"]')).toBeVisible();

    // No caveat about what happens if the firm does nothing; the block is the
    // whole notice.
    await expect(page.getByText(/will be removed|suspended|terminated/i)).toHaveCount(0);

    // A guest surface: no portal nav, and the shell says so.
    await expect(page.locator('[data-portal-shell="public"]')).toHaveCount(1);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  // NOTE on HTTP status: this app's App Router + streaming shell means
  // notFound() lands the not-found UI while the status the server already
  // flushed stays 200 — field-link.spec.ts records the same, for every
  // notFound() caller in this portal. Content assertions only, as that suite
  // and share-link.spec.ts both do; and staying 200 either way is itself the
  // non-enumerating posture, since a status that differed would be the oracle.
  test("an expired link is a dead link, and says no more than a stranger's", async ({
    page,
  }) => {
    const door = await mintDoor();
    await seedLapsedCertificate(door.companyId);

    // Time-travel the window past — the one state a mint refuses to create.
    const { error } = await admin()
      .from("paperwork_link_tokens")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", door.tokenId);
    expect(error).toBeNull();

    await page.goto(`/paperwork/${door.token}`);
    await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });
    // Nothing about the firm, its paper or the studio leaks out of a dead door.
    await expect(page.getByText(door.companyName)).toHaveCount(0);
    await expect(page.getByText(STUDIO_NAME)).toHaveCount(0);
    await expect(page.getByText(/COI/)).toHaveCount(0);

    // A token that was never minted dies into exactly the same page.
    await page.goto(`/paperwork/${"b".repeat(64)}`);
    await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });

    // So does a token that was never the right shape.
    await page.goto("/paperwork/not-a-real-token");
    await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });
  });

  test("an upload lands unverified on the token's firm", async ({ page }) => {
    const door = await mintDoor();

    await page.goto(`/paperwork/${door.token}`);

    const form = page.locator('form[aria-label="Add W-9"]');
    await expect(form).toBeVisible();
    await form.getByLabel("File").setInputFiles({
      name: "w9.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 paperwork e2e"),
    });
    await form.getByLabel("Issuer").fill("Twin Cities Drywall");
    await form.getByRole("button", { name: "Send W-9" }).click();

    await expect(
      page.getByText(`Received. ${STUDIO_NAME} will confirm it.`),
    ).toBeVisible();

    await expect
      .poll(async () => (await documentsFor(door.companyId)).length, {
        timeout: 20_000,
        message: "the upload must write exactly one document on the firm's card",
      })
      .toBe(1);

    const [row] = (await documentsFor(door.companyId)) as Array<{
      doc_type: string;
      inbound: boolean;
      source: string;
      verified_at: string | null;
      verified_by: string | null;
      rejected_at: string | null;
      superseded_by: string | null;
      file_path: string | null;
    }>;

    expect(row.doc_type).toBe("w9");
    expect(row.inbound).toBe(true);
    expect(row.source).toBe("field_link");
    // Unverified until a studio member opens it (spec §5.3).
    expect(row.verified_at).toBeNull();
    expect(row.verified_by).toBeNull();
    expect(row.rejected_at).toBeNull();
    expect(row.superseded_by).toBeNull();
    // Every segment before the filename is a real uuid (spec §4).
    expect(row.file_path).toMatch(
      new RegExp(
        `^${STUDIO_ORG_ID}/${door.companyId}/[0-9a-f-]{36}/w9\\.pdf$`,
      ),
    );

    // The page now says the same thing on a fresh load, from the record.
    await page.goto(`/paperwork/${door.token}`);
    await expect(
      page.getByText(`Received. ${STUDIO_NAME} will confirm it.`),
    ).toBeVisible();
  });
});
