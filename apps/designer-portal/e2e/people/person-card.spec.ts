import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import {
  cardByName,
  removePerson,
  ruleForSubject,
  uniqueName,
} from "./people-fixture";

/**
 * THE PERSON CARD — Leah task 4 (direction §6).
 *
 * "Mark Frank Bauer do not contact; route to Rosa Delgado." The acceptance is
 * that EVERY attempted contact and EVERY future pick shows "write Rosa
 * instead" — so the rule must land on the person's card, carrying the routed
 * person's own card id, not a typed name that nothing can resolve.
 *
 * The card's own regions are asserted alongside it: R-V says a region never
 * vanishes because its record is empty, and that is the rule a studio reading
 * this card under time pressure depends on.
 *
 * Chromium-pinned: one seeded designer, rows read back by name.
 */
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "single seeded actor",
);

/**
 * A mobile number nobody else in the book holds.
 *
 * The room merges on a shared phone by design (b4c1ff290), so a fixed number
 * attached every synthetic sub to whichever card already held it — the seed's
 * permanent Frank Bauer on (612) 555-0115 — and the distinctly-named card the
 * test then reads back never existed. The digits are hashed off the full name,
 * which already carries uniqueName()'s per-run suffix, so the two subs added
 * inside one test differ from each other as well as from the run before. The
 * 4000–9999 band sits clear of every seeded number (the seed's highest is
 * 555-0308) (W6 QA F4-new).
 */
function mobileFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 6000;
  return `(612) 555-${4000 + hash}`;
}

async function addSub(
  page: import("@playwright/test").Page,
  name: string,
  trade: string,
) {
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByRole("button", { name: "a sub" }).click();
  // NAMED, NEVER POSITIONAL. `useProjects` orders the option list
  // `updated_at DESC` (use-projects.ts:130), so index 1 is "whichever project
  // moved last" — it changes the moment any other spec in this room writes a
  // seat, which under `fullyParallel` is constantly. Only three of the eight
  // seeded projects record a studio at all, and a card can only be minted into
  // the studio the job records (the next note), so the project this spec adds
  // to has to be said out loud. The People fixture's own project records one
  // and holds the seats these assertions live beside.
  await page.getByLabel("Project").selectOption({ label: "Okonkwo residence" });
  // AND THEN WAIT FOR THE STUDIO TO COME BACK, BEFORE TOUCHING ANYTHING ELSE.
  // Choosing the project fires `useProjectRecordedStudio` (the
  // `project_recorded_studio` RPC), and CR5-1 mints the person card ONLY into
  // the studio the job records: `add-person-sheet.tsx:818` reads
  // `if (!chain.cardId && wantsCard && recordedStudioId)`. That guard cannot
  // tell "this job records no studio" from "we have not heard back yet" — both
  // are falsy — so a submit that outruns the RPC writes the seat with NO CARD,
  // NO CHANNELS and NO RULE, and `cardByName` below then polls against nothing.
  // Measured: serially this spec passes, and under the three-worker parallel
  // run the seat lands on "Okonkwo residence" (which DOES record studio
  // b0000000-…-0001) carrying `studio_contact_id = NULL`. Reported as a product
  // finding; the wait is what keeps this spec honest about the row it is here
  // to assert.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(name);
  // The Add sheet stands OVER the Directory, whose trade filter is a
  // `role="group"` named "Narrow by trade". `getByLabel` matches a substring by
  // default, so the bare word matched the filter group as well as this select
  // and the call died on strict mode. The select's own name is exactly "Trade"
  // (W6 QA F4).
  await page.getByLabel("Trade", { exact: true }).selectOption(trade);
  await page.getByLabel("Mobile").fill(mobileFor(name));
  await page
    .getByLabel("Email")
    .fill(`${name.split(" ")[0].toLowerCase()}@twincitiesdrywall.com`);
  await page.getByRole("button", { name: "Add to the roster" }).click();
  await expect
    .poll(async () => (await cardByName(name))?.id ?? null, { timeout: 15_000 })
    .not.toBeNull();
  return (await cardByName(name))!.id as string;
}

test.describe("the person card", () => {
  test("task 4 — do not contact, routed to somebody reachable", async ({
    authenticatedPage: page,
  }) => {
    const rosa = uniqueName("Rosa Delgado");
    const frank = uniqueName("Frank Bauer");
    try {
      await page.goto("/people");
      await addSub(page, rosa, "drywall");
      const frankCard = await addSub(page, frank, "drywall");

      // Open Frank's card from the Directory row — the row is a container, so
      // the name is its own control (C11).
      await page.goto("/people");
      await page.getByRole("button", { name: frank }).first().click();

      await page.getByRole("button", { name: "Edit the rule" }).click();
      await page.getByLabel("Never text them").check();
      await page.getByLabel("Never email them").check();
      await page
        .getByLabel("Write someone else instead")
        .selectOption({ label: rosa });
      await page
        .getByLabel("Why")
        .fill("He is deaf to the phone. Rosa runs his book.");
      await page.getByRole("button", { name: "Save the rule" }).click();

      await expect
        .poll(
          async () =>
            (await ruleForSubject(frankCard))?.route_to_person_id ?? null,
          {
            timeout: 15_000,
          },
        )
        .toBe((await cardByName(rosa))!.id);

      await expect
        .poll(async () =>
          ((await ruleForSubject(frankCard))?.channels_forbidden ?? [])
            .slice()
            .sort(),
        )
        .toEqual(["email", "sms"]);

      // R-S / R-L — the clause prints on the Directory row, and it carries a
      // way to actually reach Rosa.
      await page.goto("/people");
      const row = page.locator("[data-person-row]").filter({ hasText: frank });
      await expect(row).toContainText(`Write ${rosa} instead.`);
      await expect(
        row.getByRole("link", {
          name: `${rosa.split(" ")[0].toLowerCase()}@twincitiesdrywall.com`,
        }),
      ).toBeVisible();
    } finally {
      await removePerson(frank);
      await removePerson(rosa);
    }
  });

  test("R-V — every region prints, and an absent record says so in words", async ({
    authenticatedPage: page,
  }) => {
    const name = uniqueName("Erin Sato");
    try {
      await page.goto("/people");
      await addSub(page, name, "carpentry_framing");
      await page.goto("/people");
      await page.getByRole("button", { name }).first().click();

      for (const head of [
        "Reach & access",
        "Seats on projects",
        "Past seats",
        "History",
      ]) {
        await expect(page.getByRole("heading", { name: head })).toBeVisible();
      }
      await expect(page.getByText("No contact rule on file.")).toBeVisible();
      await expect(page.getByText("No grant on file.")).toBeVisible();
      await expect(page.getByText("No closed seat on file.")).toBeVisible();
    } finally {
      await removePerson(name);
    }
  });
});
