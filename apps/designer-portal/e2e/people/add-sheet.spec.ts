import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import {
  authorityForSeat,
  cardByName,
  channelsFor,
  mobileFor,
  removePerson,
  ruleForSubject,
  seatByName,
  uniqueName,
} from "./people-fixture";

/**
 * THE ADD SHEET — Leah tasks 1 and 2 (direction §6).
 *
 * Task 1: "Add Dana Kowalski text only, so nobody emails her." The acceptance
 * is not that a sentence appears on screen — it is A RULE ON THE PERSON that
 * every add, every send and every future edit honours without retyping. So the
 * assertion is against `studio_contact_rules`, keyed on the person's CARD, not
 * against the seat the add also wrote.
 *
 * Task 2: "Record that Chidi signs money over $2,500." The acceptance is TWO
 * SEPARATE FACTS (C14): a seat for the household member, and an authority
 * grant on that seat. The money book reads the grant later; this room's job is
 * to have recorded it.
 *
 * Chromium-pinned: the three browser projects run in parallel as the same
 * seeded designer, and these specs write rows that spec is then read back by
 * name.
 */
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "single seeded actor",
);

test.describe("the add sheet writes the studio’s book", () => {
  test("task 1 — a text-only rule lands on the PERSON, not on the seat", async ({
    authenticatedPage: page,
  }) => {
    const name = uniqueName("Dana Kowalski");
    try {
      await page.goto("/people");
      await page.getByRole("button", { name: "Add person" }).click();
      await page.getByRole("button", { name: "a sub" }).click();

      const project = page.getByLabel("Project");
      await project.selectOption({ index: 1 });
      await page.getByLabel("Full name").fill(name);
      await page.getByLabel("Trade", { exact: true }).selectOption("electrical");
      await page.getByLabel("Mobile").fill(mobileFor(name));
      await page
        .getByLabel("How to reach them")
        .fill("Text only. The email on file bounces.");
      await page.getByRole("button", { name: "Add to the roster" }).click();

      // The seat, the card, the channel and the rule — one act, four rows.
      await expect
        .poll(async () => (await seatByName(name))?.party_kind ?? null, {
          timeout: 15_000,
        })
        .toBe("sub");

      await expect
        .poll(async () => (await cardByName(name))?.id ?? null, {
          timeout: 15_000,
        })
        .not.toBeNull();
      const card = (await cardByName(name))!.id as string;

      await expect
        .poll(async () => (await ruleForSubject(card))?.reason ?? null, {
          timeout: 15_000,
        })
        .toBe("Text only. The email on file bounces.");

      // CR3-10(b) — THE RULING: CR-21 stands, and this assertion moves.
      //
      // The sheet used to infer the forbidden list from whether the Email box
      // happened to be blank, so "Email only. No cell for work." typed beside
      // an empty Email box wrote a rule FORBIDDING EMAIL — the opposite of what
      // the studio said, and what every send gate would then read. CR-21 made
      // the sheet infer NOTHING: the studio's sentence is recorded as the
      // reason, and which channel is barred is written on the person card,
      // where there are controls that say so. Task 1's acceptance is the RULE
      // ON THE PERSON carrying the studio's own words — asserted above — not a
      // machine-readable list nobody typed.
      await expect
        .poll(
          async () => (await ruleForSubject(card))?.channels_forbidden ?? null,
        )
        .toEqual([]);

      await expect
        .poll(async () =>
          (await channelsFor(card)).map((c) => c.channel_kind).sort(),
        )
        .toEqual(["mobile"]);
    } finally {
      await removePerson(name);
    }
  });

  test("task 2 — a household member is a seat and an authority grant, two facts", async ({
    authenticatedPage: page,
  }) => {
    const name = uniqueName("Chidi Okonkwo");
    try {
      await page.goto("/people");
      await page.getByRole("button", { name: "Add person" }).click();
      await page.getByRole("button", { name: "a household member" }).click();

      // C5 — the studio's own words, never the schema's.
      await expect(page.getByText("client_rep")).toHaveCount(0);

      await page.getByLabel("Project").selectOption({ index: 1 });
      await page.getByLabel("Full name").fill(name);

      // R-J — the sheet says plainly that nothing defaulted, and the authority
      // field OPENS FROM THE ACT beside that sentence (C20 / SPEC §5.5 #16):
      // `add-person-sheet.tsx` keeps it inside `hidden={!authorityOpen}` so it
      // never sits there looking pre-filled. The field is in the DOM the whole
      // time, so reaching for it without pressing the act resolves the input
      // and then waits out the timeout on visibility.
      await expect(
        page.getByText("Nothing defaulted from the agreement."),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Record the authority" })
        .click();

      await page.getByLabel("Authority").fill("Signs money to $2,500");

      await page.getByRole("button", { name: "Add to the roster" }).click();

      await expect
        .poll(async () => (await seatByName(name))?.party_kind ?? null, {
          timeout: 15_000,
        })
        .toBe("client_rep");

      const seat = (await seatByName(name))!;
      await expect
        .poll(async () =>
          (await authorityForSeat(seat.id as string)).map(
            (a) => a.source_clause,
          ),
        )
        .toContain("Signs money to $2,500");
    } finally {
      await removePerson(name);
    }
  });

  test("the sheet asks for a trade before it will write a sub", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/people");
    await page.getByRole("button", { name: "Add person" }).click();
    await page.getByRole("button", { name: "a sub" }).click();
    await page.getByLabel("Project").selectOption({ index: 1 });
    await page.getByLabel("Full name").fill(uniqueName("No Trade"));
    await page.getByRole("button", { name: "Add to the roster" }).click();
    // Scoped to the SHEET. Next's own `__next-route-announcer__` is a
    // `<div role="alert">` living at the end of <body>, so an unscoped
    // `getByRole('alert')` resolves to two elements and dies on strict mode.
    // The sheet is `RoomSheet`'s `role="dialog"` panel, and the refusal this
    // asserts is the `<p role="alert">` inside it.
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
      "A sub or an installer needs the trade they work in.",
    );
  });
});
