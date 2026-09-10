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
/** `getByLabel` is a substring match, and every one of these rows carries a
 *  sibling label that starts with the same words ("Cost line 1 category",
 *  "Cost line 1 amount"), so the base lookups below are all `exact`. */
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

    // FS-16 — the rail is the galley's outline now, and it keeps the same
    // `nav` / `ul` / `li` contract, so every selector below still finds it.
    const rail = page.getByRole("navigation", { name: "Agreement parts" });

    /**
     * Open a part from the outline, and WAIT FOR THE SAVE IT STARTS.
     *
     * The galley has no Save act: selecting a part saves the whole ordered
     * array behind it (§A5 "taken"), and when that RPC lands it replaces the
     * composition wholesale. Typing into the fold while it is in flight is
     * therefore typing into state that is about to be overwritten — so every
     * open below settles the network first.
     */
    const record = page.locator(".g-head .g-record");
    const room = page.locator(".g-room");

    /**
     * Open a part from the outline, and WAIT FOR THE SAVE IT STARTS.
     *
     * The galley has no Save act: selecting a part saves the whole ordered
     * array behind it (§A5 "taken"), and when that RPC lands it replaces the
     * composition wholesale — every part re-minted, because
     * `upsert_agreement_parts` is DELETE-then-INSERT. Writing into a fold
     * while that is in flight writes against ids that are about to be
     * replaced, and the write is silently dropped. `networkidle` alone is not
     * enough: `persist()` is fired without being awaited, so the click can
     * return before the request has even started. So the save is awaited by
     * its own response, and only when the record line says there is one.
     */
    const openPart = async (name: RegExp) => {
      const dirty = /not yet saved/.test(await record.innerText());
      const saved = dirty
        ? page
            .waitForResponse((response) =>
              response.url().includes("upsert_agreement_parts"),
            )
            .catch(() => null)
        : null;
      await rail.getByRole("button", { name }).first().click();
      if (saved) await saved;
      await page.waitForLoadState("networkidle");
    };
    /**
     * Write one field of the open fold, and PROVE the write landed.
     *
     * The galley re-renders the whole sheet on every keystroke (readiness, the
     * printed form and the studio's strips all recompute), and a `fill` issued
     * while the previous render is still settling is silently dropped —
     * observed here as a draw row that vanished the moment its label was
     * typed. Asserting the value back is what makes each write a barrier.
     */
    const writeField = async (label: string, value: string) => {
      const field = page.getByLabel(label, { exact: true });
      await expect(field).toBeVisible();
      await field.fill(value);
      await expect(field).toHaveValue(value);
    };
    await expect(rail.getByRole("listitem")).toHaveCount(10);

    // ── Step 5. The pricing basis, and the three derived chips.
    await openPart(/Pricing basis/);
    await page.getByRole("button", { name: "Cost-plus with GMP" }).click();
    await writeField("Fee percent", "18");

    for (const [index, [label, dollars]] of COST_LINES.entries()) {
      await page.getByRole("button", { name: "+ Add a cost line" }).click();
      await writeField(`Cost line ${index + 1}`, label);
      await writeField(`Cost line ${index + 1} amount`, dollars);
    }
    // ── Step 7. The three allowances, each writing its own cost line.
    await openPart(/Allowances/);
    for (const [index, [label, dollars]] of [
      ["Tile allowance", "4000"],
      ["Plumbing fixtures allowance", "3500"],
      ["Lighting allowance", "2800"],
    ].entries()) {
      await page.getByRole("button", { name: "+ Add an allowance" }).click();
      await writeField(`Allowance ${index + 1}`, label);
      await writeField(`Allowance ${index + 1} amount`, dollars);
    }

    await openPart(/Pricing basis/);
    await writeField("GMP dollars", "84134");
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
    // The outline row carries the part's TITLE and nothing else — the old
    // rail printed the kind label ("Draws") above it, and the galley does not.
    await openPart(/Draw schedule/);
    await writeField("Retainage percent", "5");
    for (const [index, [label, pct]] of [
      ["Deposit at signing", "10"],
      ["Rough-in", "30"],
      ["Cabinets set", "40"],
      ["Substantial completion", "20"],
    ].entries()) {
      await page.getByRole("button", { name: "+ Add a draw" }).click();
      await writeField(`Draw ${index + 1}`, label);
      await writeField(`Draw ${index + 1} percent`, pct);
      if (index > 0) {
        await page.getByLabel(`Retainage applies to draw ${index + 1}`).check();
      }
    }
    // The draw key is minted when the ROW is created, from the position — the
    // label is typed afterwards and never re-keys a row that already has one
    // (`mintDrawKey`, draws-editor.tsx:189-192). So the rough-in draw is
    // `draw_2`, not `rough_in`.
    const roughIn = page.locator('[data-draw-key="draw_2"]');
    await expect(roughIn.locator('[data-cell="net"]')).toHaveText("$23,978.19");
    await expect(
      page.locator('[data-draw-key="retainage_release"] [data-cell="net"]'),
    ).toHaveText("$3,786.03");

    // ── Step 8. Supervision beside a trade markup — the one refusal that is
    // enforced by the template rather than left to drafting.
    await openPart(/Pricing basis/);
    await writeField("Markup on the trades percent", "15");
    await openPart(/Supervision/);
    await writeField("Supervision fee dollars", "2500");
    // R49 — the refusal is about a PAIR, so the galley prints it on the room,
    // on both parts' strips and inside the open editor. Any one of them is the
    // proof that it is being said. Scoped to the room, because the save the
    // next act starts is refused with the same sentence and its toast is not
    // what is being tested here.
    const doubleCount = room.getByText(/Supervision is paid once/);
    await expect(doubleCount.first()).toBeVisible();

    await openPart(/Pricing basis/);
    await writeField("Markup on the trades percent", "");
    await openPart(/Supervision/);
    await expect(doubleCount).toHaveCount(0);

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

    // §A5 "taken" — the galley has no `Save agreement` act. Selecting a part
    // saves the whole ordered array behind it, so by the time the last part
    // has been opened the composition is already on the table; the dated
    // record line is what those saves left behind.
    await expect(record).toHaveText(/^Saved /);
    await expect(record).not.toHaveText(/not yet saved/);

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
