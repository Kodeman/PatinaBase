/**
 * "The Agreement, Composed" W3 — attestation → compose → send, driven end to
 * end. Walk steps 1 through 10, studio-side.
 *
 * Chromium-pinned. The three browser projects run in parallel as the SAME
 * seeded designer, and this spec mutates that studio's ONE attestation row
 * (`studio_license_attestations` is keyed on `studio_id`) — firefox and
 * webkit would race chromium for it. `e2e/header/global-header.spec.ts:28-32`
 * is the precedent, and Wave 1's composer spec is the sibling.
 *
 * The three flags are pinned on by `playwright.design-build.config.ts`. A
 * REUSED dev server booted without them serves the seven-facet room and every
 * assertion below fails; kill the dev server and let this config boot its own.
 *
 * Run:
 *   pnpm --filter @patina/designer-portal test:e2e -- \
 *     --config playwright.design-build.config.ts --project=chromium
 *
 * Requires the wave's two migrations on the local stack.
 */

import { expect, test } from "../fixtures/auth";
import { adminDb, getUserIdByEmail } from "../helpers/supabase-admin";

const DESIGNER_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? "designer@patina.dev";

/** The Halvorsen figures, from `source/fixtures.json`. Cost basis $71,300,
 *  fee 18%, GMP $84,134. */
const COST_LINES: [string, string][] = [
  ["Cabinetry & millwork", "38000"],
  ["Electrical", "9500"],
  ["Plumbing", "7200"],
  ["General conditions / site", "6300"],
];

test.describe("Contract Room · turnkey", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "one seeded designer, one attestation row per studio; the browser projects race it",
  );

  let proposalId = "";
  let studioId = "";

  test.beforeAll(async () => {
    const designerId = await getUserIdByEmail(DESIGNER_EMAIL);

    const { data: membership, error: membershipError } = await adminDb
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", designerId)
      .eq("status", "active")
      .limit(1)
      .single();
    if (membershipError) throw membershipError;
    studioId = membership.organization_id as string;

    const { data, error } = await adminDb
      .from("proposals")
      .insert({
        designer_id: designerId,
        title: "Halvorsen kitchen and mudroom e2e",
        status: "draft",
        document_kind: "design_services",
        commercial_state: "draft",
      })
      .select("id")
      .single();
    if (error) throw error;
    proposalId = data.id as string;

    // Step 1 starts with NO attestation on file, so the picker can be seen
    // locked before it is unlocked.
    await adminDb
      .from("studio_license_attestations")
      .delete()
      .eq("studio_id", studioId);
  });

  test.afterAll(async () => {
    if (proposalId) {
      await adminDb.from("proposals").delete().eq("id", proposalId);
    }
    if (studioId) {
      await adminDb
        .from("studio_license_attestations")
        .delete()
        .eq("studio_id", studioId);
    }
  });

  test("locks the turnkey template until the studio attests, then composes one", async ({
    authenticatedPage: page,
  }) => {
    // ── Step 1. The template is listed and locked, never hidden.
    await page.goto(`/drafting/${proposalId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start from a template…" }).click();

    const lockedRow = page
      .getByRole("listitem")
      .filter({ hasText: "Design-build" });
    await expect(lockedRow).toHaveAttribute("data-template-locked", "true");
    await expect(
      lockedRow.getByText(/Add your licensing attestation in Account → Studio/),
    ).toBeVisible();

    // ── Steps 2–3. File the attestation. Written through the RPC-free table
    // the card writes, as the studio owner would.
    const { error: attestError } = await adminDb
      .from("studio_license_attestations")
      .upsert(
        {
          studio_id: studioId,
          credential_type: "WI Dwelling Contractor",
          credential_number: "1234567",
          state: "WI",
          expires_on: "2027-03-31",
          attested_by: await getUserIdByEmail(DESIGNER_EMAIL),
        },
        { onConflict: "studio_id" },
      );
    expect(attestError).toBeNull();

    // ── Step 4. The template unlocks and materializing flips the kind.
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start from a template…" }).click();
    const unlocked = page
      .getByRole("listitem")
      .filter({ hasText: "Design-build" });
    await expect(unlocked).not.toHaveAttribute("data-template-locked", "true");
    await unlocked.getByRole("button").first().click();
    await page.getByRole("button", { name: "Use this template" }).click();
    await page.getByRole("button", { name: "Replace the parts" }).click();

    await expect
      .poll(
        async () => {
          const { data } = await adminDb
            .from("proposals")
            .select("document_kind")
            .eq("id", proposalId)
            .single();
          return data?.document_kind ?? null;
        },
        { message: "materialize_agreement_template flips the kind (PART 8)" },
      )
      .toBe("design_build");

    const rail = page.getByRole("navigation", { name: "Agreement parts" });
    await expect(rail.getByRole("listitem")).toHaveCount(10);

    // ── Step 5. The pricing basis, and the three derived chips.
    await rail
      .getByRole("button", { name: /Pricing basis/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Cost-plus with GMP" }).click();
    await page.getByLabel("Fee percent").fill("18");

    for (const [index, [label, dollars]] of COST_LINES.entries()) {
      await page.getByRole("button", { name: "+ Add a cost line" }).click();
      await page.getByLabel(`Cost line ${index + 1}`).fill(label);
      await page.getByLabel(`Cost line ${index + 1} amount`).fill(dollars);
    }
    // ── Step 7. The three allowances, each writing its own cost line.
    await rail
      .getByRole("button", { name: /Allowances/ })
      .first()
      .click();
    for (const [index, [label, dollars]] of [
      ["Tile allowance", "4000"],
      ["Plumbing fixtures allowance", "3500"],
      ["Lighting allowance", "2800"],
    ].entries()) {
      await page.getByRole("button", { name: "+ Add an allowance" }).click();
      await page.getByLabel(`Allowance ${index + 1}`).fill(label);
      await page.getByLabel(`Allowance ${index + 1} amount`).fill(dollars);
    }

    await rail
      .getByRole("button", { name: /Pricing basis/ })
      .first()
      .click();
    await page.getByLabel("GMP dollars").fill("84134");
    await expect(page.locator('[data-chip="cost-basis"]')).toHaveText(
      "Cost basis $71,300.00",
    );
    await expect(page.locator('[data-chip="fee"]')).toHaveText(
      "Fee 18% · $12,834.00",
    );
    await expect(page.locator('[data-chip="contract-sum"]')).toHaveText(
      "GMP $84,134.00",
    );

    // ── Step 6. The draws, to the cent, with the pinned release row.
    await rail.getByRole("button", { name: /Draws/ }).first().click();
    await page.getByLabel("Retainage percent").fill("5");
    for (const [index, [label, pct]] of [
      ["Deposit at signing", "10"],
      ["Rough-in", "30"],
      ["Cabinets set", "40"],
      ["Substantial completion", "20"],
    ].entries()) {
      await page.getByRole("button", { name: "+ Add a draw" }).click();
      await page.getByLabel(`Draw ${index + 1}`).fill(label);
      await page.getByLabel(`Draw ${index + 1} percent`).fill(pct);
      if (index > 0) {
        await page.getByLabel(`Retainage applies to draw ${index + 1}`).check();
      }
    }
    const roughIn = page.locator('[data-draw-key="rough_in"]');
    await expect(roughIn.locator('[data-cell="net"]')).toHaveText("$23,978.19");
    await expect(
      page.locator('[data-draw-key="retainage_release"] [data-cell="net"]'),
    ).toHaveText("$3,786.03");

    // ── Step 8. Supervision beside a trade markup — the one refusal that is
    // enforced by the template rather than left to drafting.
    await rail
      .getByRole("button", { name: /Pricing basis/ })
      .first()
      .click();
    await page.getByLabel("Markup on the trades percent").fill("15");
    await rail
      .getByRole("button", { name: /Supervision/ })
      .first()
      .click();
    await page.getByLabel("Supervision fee dollars").fill("2500");
    await expect(page.getByText(/Supervision is paid once/)).toBeVisible();

    await rail
      .getByRole("button", { name: /Pricing basis/ })
      .first()
      .click();
    await page.getByLabel("Markup on the trades percent").fill("");
    await rail
      .getByRole("button", { name: /Supervision/ })
      .first()
      .click();
    await expect(page.getByText(/Supervision is paid once/)).toHaveCount(0);

    // ── Step 9. The Wisconsin notice is held for counsel and cannot be
    // attached; the lien-waiver form can.
    const notices = page.getByRole("region", {
      name: "Jurisdiction attachments",
    });
    await expect(
      notices.locator('[data-notice-state="WI"][data-notice-held="true"]'),
    ).toBeVisible();
    await expect(notices.getByRole("button", { name: "Attach" })).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Save agreement" }).click();
    await expect(page.getByText("All agreement changes saved.")).toBeVisible();

    // The composition landed as ten parts on a design-build document, and the
    // allowances wrote their own cost lines rather than leaving the pricing
    // basis to be kept in step by hand.
    const { data: rows, error } = await adminDb
      .from("proposal_agreement_parts")
      .select("part_key, payload")
      .eq("proposal_id", proposalId)
      .order("position");
    expect(error).toBeNull();
    const basis = (rows ?? []).find(
      (row) => row.part_key === "patina.pricing_basis",
    );
    const costLines = (basis?.payload as { costLines?: { category: string }[] })
      ?.costLines;
    expect(
      (costLines ?? []).filter((line) => line.category === "allowance"),
    ).toHaveLength(3);
  });
});
