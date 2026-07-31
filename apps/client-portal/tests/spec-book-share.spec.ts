import { expect, test } from "@playwright/test";

test("malformed spec-book shares fail closed on the public guest route", async ({
  page,
}) => {
  await page.goto("/field/spec-book/not-a-capability");

  await expect(
    page.getByRole("heading", { name: "This link isn’t available" }),
  ).toBeVisible();
  await expect(
    page.getByText(/ask the studio for a fresh link/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /view pdf|download pdf/i }),
  ).toHaveCount(0);
});
