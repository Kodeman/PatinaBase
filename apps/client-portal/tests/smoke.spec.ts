import { test, expect } from "@playwright/test";

// Smoke sweep over the routes the portal still serves. Every other path this
// file used to visit (/dashboard, /timeline, /notifications, /profile,
// /settings, /projects, /project/<id>/...) is gone: some never existed in
// src/app at all, the rest were retired onto the one project page and now
// answer a 308 from middleware. threshold.spec.ts asserts those folds.

const setupErrorListeners = (page: any) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg: any) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (error: Error) => {
    pageErrors.push(error.message);
  });

  return { consoleErrors, pageErrors };
};

async function expectLoadsClean(page: any, path: string) {
  const { consoleErrors, pageErrors } = setupErrorListeners(page);

  await page.goto(path);
  await page.waitForLoadState("networkidle");

  const bodyText = await page.locator("body").textContent();
  expect(bodyText?.length).toBeGreaterThan(0);

  expect(
    pageErrors,
    `Page errors found: ${pageErrors.join(", ")}`,
  ).toHaveLength(0);

  const criticalErrors = consoleErrors.filter(
    (err: string) =>
      err.includes("Module not found") ||
      err.includes("Cannot find module") ||
      err.includes("Failed to fetch") ||
      err.includes("404"),
  );
  expect(
    criticalErrors,
    `Critical console errors: ${criticalErrors.join(", ")}`,
  ).toHaveLength(0);
}

test.describe("Client Portal - Smoke Tests", () => {
  // `/` is protected: a signed-out visitor is sent to /auth/signin, a signed-in
  // client lands in her house. Either way the document must render clean.
  test("Front door (/) should load without errors", async ({ page }) => {
    await expectLoadsClean(page, "/");
  });

  test("Sign-in page (/auth/signin) should load without errors", async ({
    page,
  }) => {
    await expectLoadsClean(page, "/auth/signin");
  });

  test("Auth error page (/auth/error) should load without errors", async ({
    page,
  }) => {
    await expectLoadsClean(page, "/auth/error");
  });
});
