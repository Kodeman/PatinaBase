import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { adminDb } from "../helpers/supabase-admin";

/**
 * COMPARE & MERGE — two cards for one human converge (direction §8 P2, PR-o).
 *
 * The Directory's duplicate band detects an exact phone match (crm-model §4
 * rule 2) and now offers the act R-Y held back in P1. This spec writes its own
 * collision — two person cards on one number, in the seeded studio — so the
 * shipped fixture is never mutated, then walks it:
 *
 *   · the band names both cards and offers "Compare these two";
 *   · the sheet pre-picks the OLDER card and the pick FLIPS (PR-o);
 *   · the consequence sentence says consent stays with the number;
 *   · after the act the Directory shows ONE card and the room announces it;
 *   · both ids stay resolvable — `resolve_merged_contact()` maps the old id
 *     forward and `studio_contact_merges` holds the act with its evidence.
 *
 * Chromium-pinned: one shared seeded designer, three parallel browser projects.
 */
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "single-actor: the three browser projects would race the same seeded designer",
);

const STUDIO = "5d1a76b1-0000-0000-0000-000000000000";
const OKONKWO = "d0e00000-0000-0000-0000-00000000000a";

const stamp = Date.now().toString(36).slice(-5);
const OLDER_NAME = `Wren Ashby ${stamp}`;
const NEWER_NAME = `W. Ashby ${stamp}`;
const PHONE = "+16125559931";

let organizationId: string;
let olderId: string;
let newerId: string;

test.beforeAll(async () => {
  const { data: project, error: projectError } = await adminDb
    .from("projects")
    .select("studio_id")
    .eq("id", OKONKWO)
    .single();
  if (projectError) throw projectError;
  organizationId = (project.studio_id as string | null) ?? STUDIO;

  const insert = async (fullName: string, createdAt: string) => {
    const { data, error } = await adminDb
      .from("studio_contacts")
      .insert({
        organization_id: organizationId,
        entity_kind: "person",
        contact_kind: "sub",
        full_name: fullName,
        phone: PHONE,
        created_at: createdAt,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };
  olderId = await insert(OLDER_NAME, "2024-03-01T00:00:00Z");
  newerId = await insert(NEWER_NAME, "2026-08-01T00:00:00Z");
});

test.afterAll(async () => {
  for (const id of [olderId, newerId].filter(Boolean)) {
    await adminDb.from("studio_contact_merges").delete().eq("survivor_id", id);
    await adminDb.from("studio_contact_merges").delete().eq("merged_id", id);
  }
  // The pointer first: `merged_into` is a self-FK with ON DELETE SET NULL, so
  // order only matters for the record above.
  for (const id of [newerId, olderId].filter(Boolean)) {
    await adminDb.from("studio_contact_channels").delete().eq("owner_id", id);
    await adminDb.from("studio_contacts").delete().eq("id", id);
  }
});

test("the duplicate band merges two cards into one (PR-o)", async ({
  authenticatedPage: page,
}) => {
  await page.goto("/people?role=all&scope=studio", {
    waitUntil: "domcontentloaded",
  });
  const band = page.locator("[data-duplicate-band]");
  await expect(band).toBeVisible({ timeout: 30_000 });
  await expect(band).toContainText("These two cards share a phone.");
  await expect(band).toContainText(OLDER_NAME);
  await expect(band).toContainText(NEWER_NAME);

  await band
    .locator(
      `[data-compare-merge*="${olderId}"], [data-compare-merge*="${newerId}"]`,
    )
    .first()
    .click();

  const sheet = page.locator("[data-compare-merge-sheet]");
  await expect(sheet).toBeVisible({ timeout: 15_000 });

  // Two columns, field by field.
  await expect(sheet.locator('[data-compare-field="Name"]')).toContainText(
    OLDER_NAME,
  );
  await expect(sheet.locator('[data-compare-field="Name"]')).toContainText(
    NEWER_NAME,
  );
  await expect(
    sheet.locator('[data-compare-field="In the book since"]'),
  ).toBeVisible();

  // PR-o — the OLDER card is pre-picked, and the pick flips.
  await expect(
    sheet.locator(`[data-survivor-pick="${olderId}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  await sheet.locator(`[data-survivor-pick="${newerId}"]`).click();
  await expect(
    sheet.locator(`[data-survivor-pick="${newerId}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  // …and back, because the older card is the one this spec keeps.
  await sheet.locator(`[data-survivor-pick="${olderId}"]`).click();

  // The consequence sentence names what moves, and what does not.
  const consequence = sheet.locator("[data-merge-consequence]");
  await expect(consequence).toContainText(`${NEWER_NAME}’s seats, channels`);
  await expect(consequence).toContainText(
    "Consent stays with the number, not with the card",
  );

  await sheet.getByRole("button", { name: `Merge into ${OLDER_NAME}` }).click();

  // The record landed, with the evidence the studio named.
  await expect
    .poll(
      async () => {
        const { data } = await adminDb
          .from("studio_contact_merges")
          .select("survivor_id, merged_id, matched_on")
          .eq("survivor_id", olderId)
          .maybeSingle();
        return data;
      },
      { timeout: 20_000 },
    )
    .toMatchObject({
      survivor_id: olderId,
      merged_id: newerId,
      matched_on: "phone",
    });

  // PR-o — BOTH ids stay resolvable, and the merged card is neither deleted
  // nor archived.
  const { data: merged } = await adminDb
    .from("studio_contacts")
    .select("id, merged_into, archived_at")
    .eq("id", newerId)
    .maybeSingle();
  expect(merged?.merged_into).toBe(olderId);
  expect(merged?.archived_at).toBeNull();

  const { data: resolved, error: resolveError } = await adminDb.rpc(
    "resolve_merged_contact",
    { p_contact_id: newerId },
  );
  if (resolveError) throw resolveError;
  expect(resolved).toBe(olderId);

  // The Directory now shows one card, the band is gone, and the room says so.
  await expect(page.locator("[data-people-announcer]")).toContainText(
    "Two cards are now one",
    { timeout: 20_000 },
  );
  await expect(page.locator("[data-duplicate-band]")).toHaveCount(0, {
    timeout: 20_000,
  });
  /**
   * QA-R14-1 — SCOPE THE DISAPPEARANCE AWAY FROM THE ANNOUNCER.
   * The room's own `role="status"` announcer, asserted three lines above,
   * legitimately names the folded card in its confirmation sentence ("Two
   * cards are now one. <survivor> carries what <merged> held…") — SPEC's own
   * literal. The page-wide `toHaveCount(0)` this replaced therefore
   * contradicted the room's designed text and could never pass.
   *
   * The act also opens the SURVIVOR'S CARD, so `[data-directory-list]` is off
   * the page at this moment; the folded name is asked for everywhere the
   * studio reads EXCEPT the announcement, by walking the DOM with the
   * announcer removed.
   */
  await expect
    .poll(
      () =>
        page.evaluate((name) => {
          const copy = document.body.cloneNode(true) as HTMLElement;
          copy
            .querySelectorAll("[data-people-announcer]")
            .forEach((node) => node.remove());
          return (copy.textContent ?? "").includes(name);
        }, NEWER_NAME),
      { timeout: 20_000 },
    )
    .toBe(false);
  await expect(
    page.getByRole("heading", { name: OLDER_NAME, exact: true }),
  ).toBeVisible();

  // …and back on the Directory itself, one card stands where two did.
  await page.goto("/people?role=all&scope=studio", {
    waitUntil: "domcontentloaded",
  });
  const directory = page.locator("[data-directory-list]");
  await expect(directory).toBeVisible({ timeout: 30_000 });
  await expect(directory.getByText(OLDER_NAME).first()).toBeVisible();
  await expect(directory.getByText(NEWER_NAME)).toHaveCount(0);
});
