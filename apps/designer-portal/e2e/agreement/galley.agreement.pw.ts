/**
 * The Agreement Room · the galley — driven end to end.
 *
 * The paper IS the page: every part prints through the renderer the client's
 * copy is made of, and writing one unfolds beneath the printed form rather
 * than beside it. Nothing here asks for a rail, an editor column, a preview
 * aside or a Save control — none of them survives the galley.
 *
 * Chromium-pinned, for the same reason Wave 1's composer spec is: the three
 * browser projects run as the SAME seeded designer, and every case here seeds
 * and mutates its own proposal row. Each case gets a fresh agreement so the
 * order, the visibility and the readiness of one never reach another.
 *
 * Run:
 *   pnpm --filter @patina/designer-portal test:e2e -- \
 *     --config playwright.agreement.config.ts --project=chromium
 *
 * Requires migration 00575 (`proposal_agreement_parts`,
 * `materialize_standard_parts`, `upsert_agreement_parts`) on the local stack.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/auth";
import {
  adminDb,
  countByProposal,
  getUserIdByEmail,
} from "../helpers/supabase-admin";

const DESIGNER_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? "designer@patina.dev";
/** The seeded homeowner the seeded designer already carries in her client
 *  list (`designer_clients`), so `profiles_select_counterparty` admits the
 *  join the room reads the recipient's email through. */
const CLIENT_USER_ID = "a0000000-0000-0000-0000-000000000005";

/** R21/FS-6 — what the studio reads where the client's copy prints nothing. */
const REST_ROW =
  "Not written yet. Your client’s copy does not print this part.";

/** `patina.role_rates` → `patina-role-rates`. The room's own id scheme, which
 *  keys on the PART KEY so the four ids survive a save that re-mints uuids. */
function idsFor(partKey: string) {
  const slug = partKey.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return {
    section: `part-${slug}`,
    head: `head-${slug}`,
    foldAct: `write-${slug}`,
    foldPanel: `fold-${slug}`,
  };
}

interface SeedOptions {
  /** Omit the terms row entirely — the brand-new draft, whose retainer is
   *  seeded with no figure at all and is therefore a thing to finish. */
  terms?: boolean;
  /** `null` leaves the deposit unwritten, which is the part that prints
   *  nothing on the paper (FS-6). */
  depositPercent?: number | null;
  /** Linked at INSERT, never by UPDATE: `set_document_client` (00225) is the
   *  only road that may CHANGE a proposal's client, and it demands an
   *  authenticated caller — which `adminDb` is not. */
  clientId?: string;
}

const proposalsToDrop: string[] = [];

async function seedAgreement(options: SeedOptions = {}): Promise<string> {
  const { terms = true, depositPercent = 50, clientId } = options;
  const designerId = await getUserIdByEmail(DESIGNER_EMAIL);

  // 00387 — a proposal may not name a client without naming the studio's own
  // record of that client alongside it.
  let designerClientId: string | null = null;
  if (clientId) {
    const { data: link, error: linkError } = await adminDb
      .from("designer_clients")
      .select("id")
      .eq("designer_id", designerId)
      .eq("client_id", clientId)
      .single();
    if (linkError) throw linkError;
    designerClientId = link.id as string;
  }

  const { data, error } = await adminDb
    .from("proposals")
    .insert({
      designer_id: designerId,
      title: "Galley agreement e2e",
      status: "draft",
      document_kind: "design_services",
      commercial_state: "draft",
      client_id: clientId ?? null,
      designer_client_id: designerClientId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const proposalId = data.id as string;
  proposalsToDrop.push(proposalId);

  if (terms) {
    const { error: termsError } = await adminDb
      .from("proposal_service_terms")
      .insert({
        proposal_id: proposalId,
        scope: "Interior design services for the galley walk.",
        deliverables: ["Concept presentation"],
        exclusions: ["Construction labor"],
        billing_ceiling_cents: 2_400_000,
        retainer_amount_cents: 500_000,
        retainer_activation_policy: "immediate",
        billing_cadence: "monthly",
        currency: "USD",
        terms: "Ownership, cancellation, expenses.",
        current_rate_version: 1,
        furnishings_deposit_percent: depositPercent,
      });
    if (termsError) throw termsError;
  }

  return proposalId;
}

/** Open the room and wait for the nine standard parts to have materialized. */
async function openGalley(page: Page, proposalId: string): Promise<void> {
  await page.goto(`/drafting/${proposalId}`, { waitUntil: "networkidle" });
  await expect(page.locator("#room-status")).toBeVisible();
  await expect
    .poll(() => countByProposal("proposal_agreement_parts", proposalId), {
      message: "materialize_standard_parts seeds nine rows on first open",
    })
    .toBe(9);
  await expect(page.locator(".g-part[data-part-key]")).toHaveCount(9);
}

/** The move / hide acts are reserved, not revealed: their box holds its width
 *  and they show only while the part holds focus (FS-19, check 18). Focusing
 *  the part's own fold act is what a keyboard walk does to reach them. */
async function focusPart(page: Page, partKey: string): Promise<void> {
  await page.locator(`#${idsFor(partKey).foldAct}`).focus();
}

test.describe("Contract Room · the galley", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "single seeded designer; the three browser projects race the same rows",
  );

  test.afterAll(async () => {
    for (const id of proposalsToDrop.splice(0)) {
      await adminDb.from("proposals").delete().eq("id", id);
    }
  });

  test("prints the written parts on the paper and rests the unwritten one in the studio's strip", async ({
    authenticatedPage: page,
  }) => {
    const proposalId = await seedAgreement({ depositPercent: null });
    await openGalley(page, proposalId);

    // The outline keeps the shipped rail's contract (FS-16) — nine rows.
    const outline = page.getByRole("navigation", { name: "Agreement parts" });
    await expect(outline.getByRole("listitem")).toHaveCount(9);

    // A written part prints, once, through the client's own renderer.
    const services = page.locator('.g-part[data-part-key="patina.services"]');
    await expect(
      services.getByRole("heading", { name: "Services", level: 3 }),
    ).toBeVisible();
    await expect(services.locator(".g-part__printed")).toContainText(
      "Interior design services for the galley walk.",
    );

    // The unwritten deposit puts NOTHING on the paper (R21/FS-6) — no head,
    // no printed form — and is still listed and still reachable.
    const deposit = page.locator('.g-part[data-part-key="patina.deposit"]');
    await expect(deposit).toHaveCount(1);
    await expect(deposit.locator(".g-part__printed")).toHaveCount(0);
    await expect(
      deposit.getByRole("heading", { name: "Furnishings deposit" }),
    ).toHaveCount(0);
    await expect(
      outline.getByRole("button", { name: "Furnishings deposit" }),
    ).toBeVisible();

    // Its head, its rest row and its Write act live in the studio's strip.
    const strip = page.getByRole("complementary", {
      name: "The studio · Furnishings deposit",
    });
    await expect(strip).toContainText(REST_ROW);
    await expect(
      strip.locator(`#${idsFor("patina.deposit").foldAct}`),
    ).toBeVisible();
  });

  test("unfolds Services beneath its printed form, and the fold survives a save", async ({
    authenticatedPage: page,
  }) => {
    const proposalId = await seedAgreement();
    await openGalley(page, proposalId);

    const ids = idsFor("patina.services");
    const section = page.locator('.g-part[data-part-key="patina.services"]');
    const printed = section.locator(".g-part__printed");
    const fold = page.locator(`#${ids.foldPanel}`);
    const write = page.locator(`#${ids.foldAct}`);

    await expect(write).toHaveAttribute("aria-expanded", "false");
    await expect(fold).toBeHidden();
    await write.click();
    await expect(write).toHaveAttribute("aria-expanded", "true");
    await expect(fold).toBeVisible();

    // Beneath the printed part, not beside it and not instead of it.
    const printedBox = await printed.boundingBox();
    const foldBox = await fold.boundingBox();
    expect(printedBox).not.toBeNull();
    expect(foldBox).not.toBeNull();
    expect(foldBox!.y).toBeGreaterThanOrEqual(
      printedBox!.y + printedBox!.height - 1,
    );

    const body = fold.getByRole("textbox", { name: "Body" });
    await body.fill("The studio designs the whole of the ground floor.");

    // Esc folds the part and hands focus back to the act that opened it; the
    // printed form now carries what was typed.
    await body.press("Escape");
    await expect(fold).toBeHidden();
    await expect(write).toBeFocused();
    await expect(printed).toContainText(
      "The studio designs the whole of the ground floor.",
    );

    // §A5 "taken" — there is no Save control. Closing the fold is the act, and
    // the dated record is what it leaves behind.
    const record = page.locator(".g-head .g-record");
    await expect(record).toHaveText(/^Saved /);
    await expect(record).not.toHaveText(/not yet saved/);

    // ED-5/N-8 — `upsert_agreement_parts` is DELETE-then-INSERT, so a save
    // re-mints every uuid. Re-selecting the open part from the outline saves
    // behind the open fold: the fold must not close and the writing must not
    // be lost.
    await write.click();
    await expect(fold).toBeVisible();
    await body.fill("The studio designs the ground floor and the stair hall.");
    await expect(record).toHaveText(/· Services not yet saved$/);
    await page
      .getByRole("navigation", { name: "Agreement parts" })
      .getByRole("button", { name: "Services", exact: true })
      .click();

    await expect(record).not.toHaveText(/not yet saved/);
    await expect(write).toHaveAttribute("aria-expanded", "true");
    await expect(fold).toBeVisible();
    await expect(fold.getByRole("textbox", { name: "Body" })).toHaveValue(
      "The studio designs the ground floor and the stair hall.",
    );
    // Focus stays inside the fold rather than being thrown back to the page.
    // It lands on the fold's FIRST field, not the one the caret was in: the
    // save re-mints every uuid, `GalleyPart` is keyed on `part.id`, so the
    // part remounts and `GalleyPart`'s open-effect re-seeds focus. The writing
    // survives because it lives in the composer's state, not in the DOM.
    await expect(fold.getByLabel("The name of this part")).toBeFocused();

    const { data: rows } = await adminDb
      .from("proposal_agreement_parts")
      .select("payload")
      .eq("proposal_id", proposalId)
      .eq("part_key", "patina.services")
      .single();
    expect((rows?.payload as { body?: string })?.body).toBe(
      "The studio designs the ground floor and the stair hall.",
    );
  });

  test("moves Billing cadence up twice from the keyboard, keeping focus and saying where it landed", async ({
    authenticatedPage: page,
  }) => {
    const proposalId = await seedAgreement();
    await openGalley(page, proposalId);

    const order = () =>
      page
        .locator(".g-part[data-part-key]")
        .evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLElement).dataset.partKey ?? ""),
        );
    expect(await order()).toEqual([
      "patina.services",
      "patina.deliverables",
      "patina.exclusions",
      "patina.role_rates",
      "patina.ceiling",
      "patina.deposit",
      "patina.retainer",
      "patina.cadence",
      "patina.terms",
    ]);

    const moveUp = page.locator("#head-patina-cadence-move-up");
    await focusPart(page, "patina.cadence");
    await expect(moveUp).toBeVisible();

    await moveUp.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#room-status")).toHaveText(
      "Billing cadence is now part 7 of 9.",
    );
    await expect(moveUp).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("#room-status")).toHaveText(
      "Billing cadence is now part 6 of 9.",
    );
    await expect(moveUp).toBeFocused();

    expect(await order()).toEqual([
      "patina.services",
      "patina.deliverables",
      "patina.exclusions",
      "patina.role_rates",
      "patina.ceiling",
      "patina.cadence",
      "patina.deposit",
      "patina.retainer",
      "patina.terms",
    ]);
  });

  test("hides Exclusions from the client's paper and shows it again from the strip", async ({
    authenticatedPage: page,
  }) => {
    const proposalId = await seedAgreement();
    await openGalley(page, proposalId);

    const exclusions = page.locator(
      '.g-part[data-part-key="patina.exclusions"]',
    );
    await expect(exclusions.locator(".g-part__printed")).toContainText(
      "Construction labor",
    );

    await focusPart(page, "patina.exclusions");
    await exclusions
      .getByRole("button", { name: "Hide from the client", exact: true })
      .click();

    // R39 — the paper here IS the client's copy, so a hidden part prints
    // nothing on it. It keeps its rest row, and the act that shows it again,
    // in the studio's own ground.
    await expect(exclusions.locator(".g-part__printed")).toHaveCount(0);
    const strip = page.getByRole("complementary", {
      name: "The studio · Exclusions",
    });
    await expect(strip).toContainText("Hidden from your client");
    await expect(
      strip.locator(`#${idsFor("patina.exclusions").foldAct}`),
    ).toBeVisible();

    await strip.getByRole("button", { name: "Show to the client" }).click();
    await expect(exclusions.locator(".g-part__printed")).toContainText(
      "Construction labor",
    );
    await expect(strip).toHaveCount(0);
  });

  test("keeps one status region that reads the readiness sentence and rewrites it when the retainer is written", async ({
    authenticatedPage: page,
  }) => {
    // No terms row: the brand-new draft, whose retainer part is seeded with no
    // figure at all — so writing it is one of the things left to finish.
    const proposalId = await seedAgreement({ terms: false });
    await openGalley(page, proposalId);

    const status = page.locator("#room-status");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveText(
      "Four things before this can go: Set a valid retainer amount, including zero when none is due; Write Terms; name a fee; link a client.",
    );

    await page.locator(`#${idsFor("patina.retainer").foldAct}`).click();
    await page
      .locator(`#${idsFor("patina.retainer").foldPanel}`)
      .getByLabel("Retainer · dollars")
      .fill("5000");

    await expect(status).toHaveText(
      "Three things before this can go: Write Terms; name a fee; link a client.",
    );
  });

  test("carries the consequence, the held send and its reason at 1024 and at 390", async ({
    authenticatedPage: page,
  }) => {
    const proposalId = await seedAgreement();
    await openGalley(page, proposalId);

    const send = page.locator('[data-action-key="review-design-agreement"]');
    const consequence = page.locator(".g-consequence");
    const status = page.locator("#room-status");

    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 900 });

      // Check 13 — the terminal act is present at every width, and the
      // sentence that says what it does sits directly above it.
      await expect(send).toBeVisible();
      await expect(consequence).toBeVisible();
      const consequenceBox = await consequence.boundingBox();
      const sendBox = await send.boundingBox();
      expect(consequenceBox!.y + consequenceBox!.height).toBeLessThanOrEqual(
        sendBox!.y + 1,
      );
      await expect(
        page.locator('[data-action-key="read-whole-agreement"]'),
      ).toBeVisible();

      // Check 7 — held, never natively disabled: it keeps its place in the tab
      // order and points at a reason that resolves and is visible.
      await expect(send).toHaveAttribute("aria-disabled", "true");
      // §A5 — held is never the native attribute: the act keeps its place in
      // the tab order. (`toBeDisabled` counts `aria-disabled`, so the DOM
      // property is what proves this.)
      expect(
        await send.evaluate((node) => (node as HTMLButtonElement).disabled),
      ).toBe(false);
      const describedBy = await send.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`#${describedBy}`)).toBeVisible();

      // Check 8 — activating a held act is never silent.
      // `force`, because Playwright's actionability treats `aria-disabled` as
      // not-enabled — and a held act is exactly one a designer CAN still
      // press. The DOM property asserted above is what proves it is not
      // natively disabled.
      await send.click({ force: true });
      await expect(status).toHaveText(
        "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
      );
    }
  });

  test("opens the send sheet, composed from the parts, once the fee, the ceiling and the client are there", async ({
    authenticatedPage: page,
  }) => {
    const proposalId = await seedAgreement({ clientId: CLIENT_USER_ID });
    await openGalley(page, proposalId);

    // The ceiling is seeded; the rate card is what the studio still owes.
    await page.locator(`#${idsFor("patina.role_rates").foldAct}`).click();
    const rateFold = page.locator(`#${idsFor("patina.role_rates").foldPanel}`);
    await rateFold.getByRole("button", { name: "+ Add a role" }).click();
    await rateFold.getByLabel("Role 1 hourly rate").fill("250");
    await rateFold
      .getByLabel("Role 1", { exact: true })
      .fill("Principal designer");

    const status = page.locator("#room-status");
    await expect(status).toHaveText("Nothing left to finish.");

    const send = page.locator('[data-action-key="review-design-agreement"]');
    await expect(send).not.toHaveAttribute("aria-disabled", "true");
    await expect(send).toHaveText(/Send the agreement · \$5,000\.00 retainer/);
    await send.click();

    const sheet = page.getByRole("dialog", { name: "Send design agreement" });
    await expect(sheet).toBeVisible();
    // FS-22 — the sheet describes the paper it is sending, composed from the
    // parts that are actually written. Nothing in it says "facet".
    await expect(sheet).toContainText(
      "Client User receives the nine parts this agreement has written",
    );
    await expect(sheet).toContainText("the services");
    await expect(sheet).toContainText("the $5,000.00 retainer");
    await expect(sheet).toContainText("the role rates");
    await expect(sheet).toContainText("the monthly billing cadence");
    await expect(sheet.getByText(/facet/i)).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Not yet" })).toBeVisible();
    await expect(
      sheet.getByRole("button", {
        name: /Send the agreement · \$5,000\.00 retainer/,
      }),
    ).toBeEnabled();
  });

  test("lays the whole paper over the room at its own measure", async ({
    authenticatedPage: page,
  }) => {
    const proposalId = await seedAgreement();
    await openGalley(page, proposalId);

    await page.locator('[data-action-key="read-whole-agreement"]').click();
    const sheet = page.getByRole("dialog", { name: "The whole paper" });
    await expect(sheet).toBeVisible();

    // FS-5/FS-13 — the SAME renderer the galley prints, never a third.
    const paper = sheet.getByRole("article", {
      name: "Design services agreement client copy",
    });
    await expect(paper).toBeVisible();
    for (const heading of [
      "Services",
      "Deliverables",
      "Exclusions",
      "Role rates",
      "Ceiling",
      "Retainer",
      "Billing cadence",
      "Terms",
    ]) {
      await expect(paper.getByRole("heading", { name: heading })).toBeVisible();
    }

    const box = await sheet.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(760);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });
});
