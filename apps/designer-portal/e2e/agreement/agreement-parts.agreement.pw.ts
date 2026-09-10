/**
 * "The Agreement, Composed" W1 — the composer, driven end to end.
 *
 * Retargeted onto the galley (Direction D, 2026-09-10). What it proves is
 * unchanged — nine parts materialize on first open, one RPC replaces the whole
 * ordered array, a removed part is absent from the money row's projection, and
 * the client's copy renders the parts in order. What it clicks has moved: the
 * rail is an outline, the editor is a fold beneath the printed part, there is
 * no `Save agreement` act (the dated record line is what a save leaves behind)
 * and `Preview client copy` is `Read the whole paper`.
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

    // FS-16 — the outline keeps the rail's own contract: a `nav` labelled
    // `Agreement parts` wrapping a `ul` of `li`, one row per part.
    const outline = page.getByRole("navigation", { name: "Agreement parts" });
    // The nine standard parts materialize on first open. This is the assertion
    // that also proves the flag reached the server Playwright started.
    await expect(outline.getByRole("listitem")).toHaveCount(9);
    await expect
      .poll(() => countByProposal("proposal_agreement_parts", proposalId), {
        message: "materialize_standard_parts seeds nine rows on first open",
      })
      .toBe(9);

    // Remove Exclusions — R4 names it removable. The act is in the part's own
    // fold now, not a row menu.
    await page.locator("#write-patina-exclusions").click();
    await page
      .locator("#fold-patina-exclusions")
      .getByRole("button", { name: "Remove from this agreement" })
      .click();
    await expect(outline.getByRole("listitem")).toHaveCount(8);

    // Walk D2 — a part added at a seam lands AT that seam. The seam beneath
    // Ceiling is the act clicked here, and the part it opens has to arrive
    // directly after Ceiling, not on the end of the paper.
    await page
      .locator('.g-part[data-part-key="patina.ceiling"] + .g-seam')
      .getByRole("button", { name: "+ Add a part" })
      .click();
    await page.getByRole("button", { name: "Clause", exact: true }).click();
    await expect(outline.getByRole("listitem")).toHaveCount(9);

    // The new part is the open one, and a blank clause draws nothing on the
    // paper (R21/FS-6) — so its name and its body are written in the fold.
    const added = page.locator('.g-part[data-selected="true"]');
    await added.getByLabel("The name of this part").fill("Concept fee");
    await expect(
      outline.getByRole("button", { name: "Concept fee" }),
    ).toBeVisible();

    // Where it landed, read off the outline: the row after Ceiling's.
    const landed = await outline.getByRole("listitem").allInnerTexts();
    const ceilingRow = landed.findIndex((row) => row.includes("Ceiling"));
    expect(ceilingRow).toBeGreaterThanOrEqual(0);
    expect(landed[ceilingRow + 1]).toContain("Concept fee");

    await added
      .getByRole("textbox", { name: "Body" })
      .fill("A concept fee of $2,400.00, billed on signature.");
    // Written, it prints — and its head carries the order acts.
    await expect(added.locator(".g-part__printed")).toContainText(
      "A concept fee of $2,400.00, billed on signature.",
    );
    await page.getByRole("button", { name: "Concept fee Move up" }).click();

    // §A5 "taken" — no `Save agreement` act survives. Closing the fold is what
    // saves, and the dated record line is what it leaves behind.
    const record = page.locator(".g-head .g-record");
    await expect(record).toHaveText(/not yet saved$/);
    await page.getByRole("button", { name: "Concept fee Write" }).click();
    await expect(record).toHaveText(/^Saved /);
    await expect(record).not.toHaveText(/not yet saved/);

    // One RPC call replaced the whole set: nine rows, Exclusions gone, and the
    // clause that landed after Ceiling now one place above it.
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
    const titles = (rows ?? []).map((row) => row.title as string);
    expect(titles).toContain("Concept fee");
    // It landed after Ceiling and was moved up once, so it persists directly
    // ABOVE Ceiling — never on the end of the paper, which is where an
    // always-append seam put it (walk D2).
    expect(titles.indexOf("Concept fee")).toBe(
      keys.indexOf("patina.ceiling") - 1,
    );

    // Removing Exclusions removed it from the money row's projection too —
    // absent, not the previous value stuck in place.
    const { data: terms } = await adminDb
      .from("proposal_service_terms")
      .select("exclusions")
      .eq("proposal_id", proposalId)
      .single();
    expect(terms?.exclusions).toEqual([]);

    // The client copy renders the parts in order, and never "Not yet set". The
    // overlay prints the SAME `ServiceAgreementPreview` the room prints from
    // (FS-5/FS-13), laid over the room rather than instead of it.
    await page.getByRole("button", { name: "Read the whole paper" }).click();
    const preview = page
      .getByRole("dialog", { name: "The whole paper" })
      .getByRole("article", { name: "Design services agreement client copy" });
    await expect(
      preview.getByRole("heading", { name: "Concept fee" }),
    ).toBeVisible();
    await expect(preview.getByText("Not yet set")).toHaveCount(0);
    await expect(
      preview.getByRole("heading", { name: "Exclusions" }),
    ).toHaveCount(0);
  });
});
