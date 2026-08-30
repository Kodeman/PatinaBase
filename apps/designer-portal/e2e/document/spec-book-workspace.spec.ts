import { test, expect } from "../fixtures/auth";
import { psqlRow, psqlRun, psqlScalar } from "../helpers/psql";

function sqlLiteral(value: string | null): string {
  return value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

test.describe("spec-book workspace", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "ensure_project_spec_book creates one canonical row; avoid cross-browser fixture races",
  );

  let projectId = "";
  let specId = "";
  let ffeItemId = "";
  let originalFinish: string | null = null;
  let originalRowVersion = 0;

  test.beforeAll(() => {
    projectId = psqlScalar(`
      SELECT p.id::text
        FROM public.projects p
        JOIN public.project_ffe_items f ON f.project_id = p.id
       WHERE p.designer_id = 'a0000000-0000-0000-0000-000000000004'
       ORDER BY p.created_at
       LIMIT 1
    `);
    // The seeded fixture's three FF&E items share an identical (sort_order,
    // created_at) — the same tie the app's own query (use-spec-books.ts's
    // .order("sort_order").order("created_at"), no further tiebreak) resolves
    // by incidental physical row order, which drifts once any of the tied
    // rows is written (a non-HOT UPDATE moves its heap tuple). Rather than
    // guess which of the three the app will auto-select as data.items[0], the
    // test below clicks this exact ffe_item_id explicitly
    // (#spec-book-item-{ffeItemId}) so it always edits the same row this
    // query pinned, regardless of which item the app would have defaulted to.
    const spec = JSON.parse(
      psqlScalar(`
        SELECT json_build_object(
                 'id', s.id,
                 'ffe_item_id', f.id,
                 'finish', s.finish,
                 'row_version', s.row_version
               )::text
          FROM public.project_ffe_items f
          JOIN public.project_ffe_specs s ON s.ffe_item_id = f.id
         WHERE f.project_id = '${projectId}'
         ORDER BY f.sort_order ASC NULLS LAST, f.created_at ASC
         LIMIT 1
      `),
    ) as { id: string; ffe_item_id: string; finish: string | null; row_version: number };
    specId = spec.id;
    ffeItemId = spec.ffe_item_id;
    originalFinish = spec.finish;
    originalRowVersion = spec.row_version;
  });

  test.afterAll(() => {
    if (!specId) return;
    psqlRun(`
      UPDATE public.project_ffe_specs
         SET finish = ${sqlLiteral(originalFinish)}
       WHERE id = '${specId}'
    `);
  });

  test("opens the workbench and uses one audience-safe preview surface", async ({
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

    // Force the workbench onto the exact item beforeAll pinned above — the
    // three seeded items tie on (sort_order, created_at), so data.items[0]
    // (the app's own default-selection fallback) is not guaranteed to be
    // this item once any of the tied rows has been written to.
    await page.locator(`#spec-book-item-${ffeItemId}`).click();

    const savedFinish = `E2E saved finish ${Date.now()}`;
    await page.getByLabel("Finish", { exact: true }).fill(savedFinish);
    await page.getByRole("button", { name: "Save selection" }).press("Enter");

    await expect
      .poll(() =>
        psqlRow(`
          SELECT finish, row_version::text
            FROM public.project_ffe_specs
           WHERE id = '${specId}'
        `),
      )
      .toEqual([savedFinish, String(originalRowVersion + 1)]);
    await expect(
      page.getByText(`Project selection · v${originalRowVersion + 1}`),
    ).toBeVisible();

    const concurrentFinish = `Concurrent finish ${Date.now()}`;
    psqlRun(`
      UPDATE public.project_ffe_specs
         SET finish = ${sqlLiteral(concurrentFinish)}
       WHERE id = '${specId}'
    `);

    await page
      .getByLabel("Finish", { exact: true })
      .fill(`Stale browser finish ${Date.now()}`);
    await page.getByRole("button", { name: "Save selection" }).press("Enter");
    // Scoped to `main`: the conflict also raises a global toast (a second,
    // assertive `role="status"` element with the same text) — this assertion
    // is about the workbench's own inline feedback, not the toast.
    await expect(
      page
        .getByRole("main")
        .getByRole("status")
        .filter({
          hasText:
            "This selection changed in another session. Refresh before saving.",
        }),
    ).toBeVisible();
    await expect
      .poll(() =>
        psqlRow(`
          SELECT finish, row_version::text
            FROM public.project_ffe_specs
           WHERE id = '${specId}'
        `),
      )
      .toEqual([concurrentFinish, String(originalRowVersion + 2)]);

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
