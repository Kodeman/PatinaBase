import { test, expect } from "../fixtures/auth";
import { psqlScalar } from "../helpers/psql";

test.describe("spec-book workspace pilot", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "ensure_project_spec_book creates one canonical row; avoid cross-browser fixture races",
  );

  let projectId = "";

  test.beforeAll(() => {
    projectId = psqlScalar(`
      SELECT p.id::text
        FROM public.projects p
        JOIN public.project_ffe_items f ON f.project_id = p.id
       WHERE p.designer_id = 'a0000000-0000-0000-0000-000000000004'
       ORDER BY p.created_at
       LIMIT 1
    `);
  });

  test("opens the gated workbench and uses one audience-safe preview surface", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/doc/${projectId}/spec-book`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("navigation", { name: "Spec book workspace" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Workbench" }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "Audience preview" }).click();
    await expect(
      page.getByRole("region", { name: "client edition preview" }),
    ).toBeVisible();
    await expect(page.getByText("Trade price", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Markup", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Preflight" }).first().click();
    await expect(
      page.getByText(/blockers remain|ready to issue/i),
    ).toBeVisible();
  });
});
