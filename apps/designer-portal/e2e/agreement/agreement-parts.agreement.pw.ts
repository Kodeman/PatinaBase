/**
 * "The Agreement, Composed" W1 — the composer, driven end to end.
 *
 * Chromium-pinned. The three browser projects run in parallel as the SAME
 * seeded designer, and this spec both seeds and mutates one proposal row —
 * firefox and webkit would race chromium for it
 * (`e2e/header/global-header.spec.ts:28-32` is the precedent).
 *
 * The flag is pinned on by `playwright.agreement.config.ts`, which derives
 * from the base config and adds `agreement-parts:true` to `webServer.env`
 * (the base config itself is uneditable — see that file's header). That
 * pinned value beats `.env.local` and reaches only the server Playwright
 * starts; a REUSED dev server booted without it serves the seven-facet room
 * and every assertion below fails. Run this spec as:
 *
 *   pnpm --filter @patina/designer-portal test:e2e -- \
 *     --config playwright.agreement.config.ts --project=chromium
 *
 * The `.agreement.pw.ts` suffix is deliberate: the base config collects
 * `e2e/**\/*.spec.ts` with the flag OFF, where this spec could only fail.
 * Only `playwright.agreement.config.ts` matches this name.
 *
 * Requires migration 00575 (`proposal_agreement_parts`,
 * `materialize_standard_parts`, `upsert_agreement_parts`) on the local stack.
 */

import { expect, test } from "../fixtures/auth";
import {
  adminDb,
  countByProposal,
  getUserIdByEmail,
} from "../helpers/supabase-admin";

const DESIGNER_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? "designer@patina.dev";

test.describe("Contract Room · composed", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "single seeded designer; the three browser projects race the same proposal row",
  );

  let proposalId = "";

  test.beforeAll(async () => {
    const designerId = await getUserIdByEmail(DESIGNER_EMAIL);

    const { data, error } = await adminDb
      .from("proposals")
      .insert({
        designer_id: designerId,
        title: "Composed agreement e2e",
        status: "draft",
        document_kind: "design_services",
        commercial_state: "draft",
      })
      .select("id")
      .single();
    if (error) throw error;
    proposalId = data.id as string;

    // A terms row so `materialize_standard_parts` has something to seed the
    // nine parts FROM — the same shape the seven-facet room writes.
    const { error: termsError } = await adminDb
      .from("proposal_service_terms")
      .insert({
        proposal_id: proposalId,
        scope: "Interior design services for the e2e walk.",
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
    if (termsError) throw termsError;
  });

  test.afterAll(async () => {
    if (!proposalId) return;
    await adminDb.from("proposals").delete().eq("id", proposalId);
  });

  test("composes, reorders and saves the parts of an agreement", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/drafting/${proposalId}`, { waitUntil: "networkidle" });

    const rail = page.getByRole("navigation", { name: "Agreement parts" });
    // The nine standard parts materialize on first open. This is the assertion
    // that also proves the flag reached the server Playwright started.
    await expect(rail.getByRole("listitem")).toHaveCount(9);
    await expect
      .poll(() => countByProposal("proposal_agreement_parts", proposalId), {
        message: "materialize_standard_parts seeds nine rows on first open",
      })
      .toBe(9);

    // Remove Exclusions — R4 names it removable.
    await page
      .getByRole("button", { name: "Part options for Exclusions" })
      .click();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(rail.getByRole("listitem")).toHaveCount(8);

    // Add a Clause, rename it, and move it up one.
    await page.getByRole("button", { name: "+ Add a part" }).click();
    await page.getByRole("button", { name: "Clause", exact: true }).click();
    await expect(rail.getByRole("listitem")).toHaveCount(9);

    await page.getByRole("button", { name: "Part options for Clause" }).click();
    await page.getByRole("button", { name: "Rename" }).click();
    const rename = page.getByRole("textbox", { name: "Rename Clause" });
    await rename.fill("Site access");
    await rename.press("Enter");
    await expect(rail.getByText("Site access")).toBeVisible();

    await page
      .getByRole("button", { name: "Part options for Site access" })
      .click();
    await page.getByRole("button", { name: "Move up" }).click();

    // Give the new clause a body so the client copy has something to print.
    await page
      .getByRole("textbox", { name: "Body" })
      .fill("Access on weekdays.");

    await page.getByRole("button", { name: "Save agreement" }).click();
    await expect(page.getByText("All agreement changes saved.")).toBeVisible();

    // One RPC call replaced the whole set: nine rows, Exclusions gone, the new
    // clause second from last.
    await expect
      .poll(() => countByProposal("proposal_agreement_parts", proposalId), {
        message: "upsert_agreement_parts writes the whole ordered array",
      })
      .toBe(9);

    const { data: rows, error } = await adminDb
      .from("proposal_agreement_parts")
      .select("position, part_key, title")
      .eq("proposal_id", proposalId)
      .order("position");
    expect(error).toBeNull();
    const keys = (rows ?? []).map((row) => row.part_key as string);
    expect(keys).not.toContain("patina.exclusions");
    expect(keys[keys.length - 1]).toBe("patina.terms");
    expect((rows ?? []).map((row) => row.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect((rows ?? []).map((row) => row.title)).toContain("Site access");

    // Removing Exclusions removed it from the money row's projection too —
    // absent, not the previous value stuck in place.
    const { data: terms } = await adminDb
      .from("proposal_service_terms")
      .select("exclusions")
      .eq("proposal_id", proposalId)
      .single();
    expect(terms?.exclusions).toEqual([]);

    // The client copy renders the parts in rail order, and never "Not yet set".
    await page.getByRole("button", { name: "Preview client copy" }).click();
    const preview = page
      .getByRole("article", { name: "Design services agreement client copy" })
      .last();
    await expect(
      preview.getByRole("heading", { name: "Site access" }),
    ).toBeVisible();
    await expect(preview.getByText("Not yet set")).toHaveCount(0);
    await expect(
      preview.getByRole("heading", { name: "Exclusions" }),
    ).toHaveCount(0);
  });
});
