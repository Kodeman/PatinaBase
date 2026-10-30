import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/auth";
import { psqlScalar } from "../helpers/psql";

/**
 * RC-7 E8 — X05 keyboard-only processes and axe, on chromium (1440) and
 * webkit-iphone (390). Every step from the studio to the saved FF&E line and
 * back is driven through native tab order (Alt+Tab on WebKit, whose plain Tab
 * skips links) and Enter/Escape only: no click(), focus() or scroll rescue.
 * axe-core 4.11.1 is the copy already installed for admin-portal's
 * axe-playwright; it is evaluated in the page (no new dependency).
 *
 * Asserted on every axe surface: 0 critical violations and 0 serious
 * violations other than color-contrast. RC7-E8-2 separately asserts zero
 * color-contrast violations across every recorded surface. Every focused
 * control shows a focus indicator (an outline or box-shadow while
 * :focus-visible) and is not entirely obscured
 * (WCAG 2.4.11); a partly covered control is recorded as observation O-1
 * (2.4.12, AAA), not asserted.
 */

const JOB = "f0180000-0000-4000-8000-000000000010";
const LIVING = "f0180000-0000-4000-8000-000000000011";
const LINE_NAME = "F01 Living Room selection 07";
const E7_OWNER = "rc7-e7-1@patina.test";
const F01_DESIGNER = process.env.DESIGNER_E2E_EMAIL ?? "designer@patina.dev";
const OUT =
  process.env.PLAYWRIGHT_OUTPUT_DIR ??
  path.join(__dirname, "../../test-results/round8");
const adminRequire = createRequire(
  path.resolve(__dirname, "../../../admin-portal/package.json"),
);
const AXE = readFileSync(
  createRequire(adminRequire.resolve("axe-playwright")).resolve(
    "axe-core/axe.min.js",
  ),
  "utf8",
);

type AxeSummary = {
  surface: string;
  counts: Record<string, number>;
  violations: Array<{
    id: string;
    impact: string | null;
    nodes: number;
    targets: string[];
  }>;
};
const axeResults: AxeSummary[] = [];
const tabCounts: Record<string, number> = {};
const focusIndicators: Record<string, string> = {};

async function runAxe(page: Page, surface: string, include?: string) {
  await page.evaluate(AXE);
  const result = await page.evaluate(async (context) => {
    const run = (
      window as unknown as {
        axe: { run: (c: unknown, o: unknown) => Promise<any> };
      }
    ).axe.run;
    return run(context ? { include: [context] } : document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
      resultTypes: ["violations"],
    });
  }, include ?? null);
  const counts: Record<string, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  const violations = (result.violations as any[]).map((violation) => {
    counts[violation.impact ?? "minor"] =
      (counts[violation.impact ?? "minor"] ?? 0) + violation.nodes.length;
    return {
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 8).map((node: any) => {
        const data = node.any?.[0]?.data;
        const contrast = data?.contrastRatio
          ? ` ${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}:1 (${data.fontSize}, need ${data.expectedContrastRatio})`
          : "";
        return `${node.target.join(" ")}${contrast}`;
      }),
    };
  });
  const summary = { surface, counts, violations };
  axeResults.push(summary);
  expect(result.testEngine?.version, "axe ran").toBe("4.11.1");
  return summary;
}

/** Critical and non-contrast serious violations fail immediately.
 * RC7-E8-2 checks contrast across all recorded surfaces. */
async function axe(page: Page, surface: string, include?: string) {
  const { counts, violations } = await runAxe(page, surface, include);
  expect(
    counts.critical,
    `${surface}: axe critical ${JSON.stringify(violations.filter((v) => v.impact === "critical"))}`,
  ).toBe(0);
  expect(
    violations.filter(
      (v) => v.impact === "serious" && v.id !== "color-contrast",
    ),
    `${surface}: axe serious other than color-contrast`,
  ).toEqual([]);
}

const tabKey = (page: Page) =>
  page.context().browser()?.browserType().name() === "webkit"
    ? "Alt+Tab"
    : "Tab";

/** Traverse native tab order from the reader's current place until the control holds focus. */
async function tabTo(
  page: Page,
  control: Locator,
  label: string,
  backwards = false,
  limit = 250,
) {
  const key = backwards ? `Shift+${tabKey(page)}` : tabKey(page);
  const trail: string[] = [];
  let steps = 0;
  const deadline = Date.now() + 150_000;
  while (
    steps < limit &&
    Date.now() < deadline &&
    !(await control
      .evaluate((element) => element === document.activeElement, undefined, {
        timeout: 500,
      })
      .catch(() => false))
  ) {
    await page.keyboard.press(key);
    // Human pace: the paper's lens opens a quiet stop only once the
    // focus-driven scroll settles (use-lens-density.ts, L-9); a stop's
    // controls do not exist until then.
    await page.waitForTimeout(150);
    steps++;
    trail.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return "body";
        const ffe =
          document
            .querySelector('[data-paper-chapter="ffe"] [data-density]')
            ?.getAttribute("data-density") ?? "-";
        return `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30)} y${Math.round(scrollY)} ffe=${ffe}`;
      }),
    );
  }
  tabCounts[label] = steps;
  if (steps >= limit || Date.now() >= deadline)
    console.log(
      "[rc7-e8 focus trail]",
      test.info().project.name,
      label,
      JSON.stringify(trail.slice(-60)),
    );
  await expect(
    control,
    `${label}: reachable through native tab order`,
  ).toBeFocused();
  const seen = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const focusVisible = element.matches(":focus-visible");
    const style = getComputedStyle(element);
    return {
      inViewport:
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        rect.right > 0 &&
        rect.left < innerWidth,
      // WCAG 2.4.11: what paints over the control at its centre and 4 inset corners
      // (k/5 covered; 5/5 = entirely hidden), and by which fixed/sticky layer.
      obscuredBy: (() => {
        const inset = (a: number, b: number) => Math.min(Math.max(a, 0), b - 1);
        const points = [
          [0.5, 0.5],
          [0.1, 0.15],
          [0.9, 0.15],
          [0.1, 0.85],
          [0.9, 0.85],
        ].map(([fx, fy]) => [
          inset(rect.left + rect.width * fx, innerWidth),
          inset(rect.top + rect.height * fy, innerHeight),
        ]);
        const covers = points
          .map(([x, y]) => document.elementFromPoint(x, y))
          .filter(
            (top) => top && !element.contains(top) && !top.contains(element),
          ) as Element[];
        if (!covers.length) return { covered: 0, by: null };
        const top =
          covers[0].closest('[data-job-head], header, nav, [role="dialog"]') ??
          covers[0];
        return {
          covered: covers.length,
          by: `${covers.length}/5 by ${top.tagName.toLowerCase()}${[
            ...top.attributes,
          ]
            .filter((a) => a.name.startsWith("data-"))
            .slice(0, 2)
            .map((a) => `[${a.name}]`)
            .join("")}`,
        };
      })(),
      focusVisible,
      // A transparent outline (Tailwind outline-none) is not an indicator; fall through to the ring.
      indicator:
        style.outlineStyle !== "none" &&
        style.outlineWidth !== "0px" &&
        !/rgba\([^)]*,\s*0\)|transparent/.test(style.outlineColor)
          ? `outline ${style.outlineWidth} ${style.outlineColor}`
          : style.boxShadow !== "none"
            ? `box-shadow ${style.boxShadow.slice(0, 60)}`
            : style.textDecorationLine !== "none"
              ? "underline"
              : "none detected",
    };
  });
  focusIndicators[label] = seen.obscuredBy.by
    ? `${seen.indicator}; covered ${seen.obscuredBy.by}`
    : seen.indicator;
  expect(seen.inViewport, `${label}: focused control is on screen`).toBe(true);
  // WCAG 2.4.7: keyboard focus shows a painted indicator (an always-on underline is not one).
  expect(seen.focusVisible, `${label}: :focus-visible matches`).toBe(true);
  expect(
    seen.indicator,
    `${label}: visible focus indicator (outline or box-shadow)`,
  ).toMatch(/^(outline|box-shadow) /);
  // WCAG 2.4.11 (AA): not entirely hidden. Partly covered stays an observation (O-1, 2.4.12 AAA).
  expect(
    seen.obscuredBy.covered,
    `${label}: focused control not entirely obscured (${seen.obscuredBy.by})`,
  ).toBeLessThan(5);
  if (seen.obscuredBy.covered > 0)
    test.info().annotations.push({
      type: "O-1 partly obscured focus (2.4.12 AAA)",
      description: `${label}: ${seen.obscuredBy.by}`,
    });
}

async function arrivedStudio(page: Page) {
  await expect(page.locator('[data-studio="round8"]')).toHaveAttribute(
    "data-arrival-ready",
    "",
    { timeout: 60_000 },
  );
  await expect(page.locator("html")).not.toHaveClass(
    /\barr-(?:pre|on|press)\b/,
    { timeout: 30_000 },
  );
}

async function arrivedJob(page: Page) {
  await expect(
    page.locator("[data-document-shell][data-arrival-ready]"),
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator("html")).not.toHaveClass(
    /\barr-(?:pre|on|press)\b/,
    { timeout: 30_000 },
  );
}

async function signInAs(page: Page, email: string) {
  await page.goto("/auth/signin?callbackUrl=%2Fdesk", {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page
    .getByRole("button", {
      name: /sign in with email|use email and password instead|use a password instead/i,
    })
    .first()
    .click();
  await page.getByLabel(/email/i).first().fill(email);
  await page
    .getByLabel(/password/i)
    .first()
    .fill("password123");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/desk/, { timeout: 60_000 });
}

const instrument = (page: Page) =>
  page.locator('[data-paper-chapter="ffe"] [data-unfold-instrument="pieces"]');

test.describe("RC-7 E8 X05 keyboard-only processes and axe", () => {
  test.setTimeout(300_000);

  test.afterAll(() => {
    const project = test.info().project.name;
    mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `rc7-e8-a11y-${project}.json`);
    let prior: { axeResults: AxeSummary[]; tabCounts: Record<string, number> } =
      { axeResults: [], tabCounts: {} };
    try {
      prior = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* first worker */
    }
    const surfaces = new Set(axeResults.map((r) => r.surface));
    writeFileSync(
      file,
      JSON.stringify(
        {
          axeResults: [
            ...prior.axeResults.filter((r) => !surfaces.has(r.surface)),
            ...axeResults,
          ],
          tabCounts: { ...prior.tabCounts, ...tabCounts },
          focusIndicators: {
            ...(prior as { focusIndicators?: Record<string, string> })
              .focusIndicators,
            ...focusIndicators,
          },
        },
        null,
        2,
      ),
    );
    console.log(
      "[rc7-e8 axe]",
      project,
      JSON.stringify(
        axeResults.map((r) => ({
          s: r.surface,
          c: r.counts,
          ids: r.violations.map((v) => `${v.id}:${v.impact}:${v.nodes}`),
        })),
      ),
    );
    console.log("[rc7-e8 tabs]", project, JSON.stringify(tabCounts));
    console.log(
      "[rc7-e8 focus indicators]",
      project,
      JSON.stringify(focusIndicators),
    );
  });

  test("studio → job → FF&E unfold → save → close → studio, keyboard only", async ({
    authenticatedPage: page,
  }, info) => {
    const line = psqlScalar(
      `SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${LIVING}' AND name='${LINE_NAME}';`,
    );
    expect(line).toMatch(/^[0-9a-f-]{36}$/);
    const value = `RC7-E8 keyboard ${info.project.name} ${Date.now()}`;
    // Compile /doc first so the keyboard arrival is not an HMR reload.
    await page.goto(`/doc/${JOB}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    await page.goto("about:blank");
    await page.goto("/desk", {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedStudio(page);
    await axe(page, "studio");

    // Studio → job paper.
    await tabTo(
      page,
      page.getByRole("link", {
        name: /^Open the job paper — F01 Fictional Full-Service House/,
      }),
      "studio → Open the job paper",
    );
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`/doc/${JOB}`), { timeout: 60_000 });
    await arrivedJob(page);
    await axe(page, "job paper (F01)");

    // Job → FF&E chapter: the Living Room disclosure, then its door.
    const room = page.locator(
      `[data-paper-chapter="ffe"] [data-pieces-room="${LIVING}"]`,
    );
    // First match: once open, the room's line buttons also carry the room name.
    const toggle = room.getByRole("button", { name: /Living Room/ }).first();
    await tabTo(page, toggle, "job → Living Room disclosure");
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const door = room.getByRole("link", { name: /Edit room selections/ });
    await tabTo(page, door, "Living Room → Edit room selections");
    await page.keyboard.press("Enter");
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    await expect(
      instrument(page).locator(`[data-room-heading="${LIVING}"]`),
    ).toBeFocused({ timeout: 30_000 });

    // Unfold → Specifications lens → the line → Finish → Enter saves.
    await tabTo(
      page,
      instrument(page)
        .getByRole("group", { name: "Schedule view" })
        .getByRole("button", { name: "Specifications" }),
      "unfold → Specifications lens (Shift+Tab: the lens bar precedes the focused room heading)",
      true,
    );
    await page.keyboard.press("Enter");
    await expect(instrument(page).getByTestId("spec-lens")).toBeVisible({
      timeout: 30_000,
    });
    const lineButton = instrument(page)
      .getByTestId("spec-lens")
      .locator(`[data-line-id="${line}"] > button`);
    await tabTo(page, lineButton, "Specifications → line");
    await page.keyboard.press("Enter");
    await expect(lineButton).toHaveAttribute("aria-current", "true", {
      timeout: 30_000,
    });
    const pane = instrument(page).getByTestId("spec-fields-pane");
    await expect(pane).toContainText(LINE_NAME, { timeout: 30_000 });
    await axe(page, "FF&E unfold, Specifications, line open");
    const finish = pane.getByRole("textbox", { name: "Finish", exact: true });
    await tabTo(page, finish, "line → Finish field");
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await page.keyboard.type(value);
    await page.keyboard.press("Enter");
    await expect
      .poll(
        () =>
          psqlScalar(
            `SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id='${line}';`,
          ),
        { timeout: 30_000, message: "keyboard save persisted (DB readback)" },
      )
      .toBe(value);
    await expect(finish).not.toHaveAttribute("aria-invalid", "true");

    // Close. Esc in a non-empty field is held by design (escapeIsHeld,
    // build-room-shell.tsx:190), so she leaves the field first: Shift+Tab to the
    // line she chose, then Esc folds the unfold.
    await page.keyboard.press("Escape");
    await expect(
      instrument(page),
      "Esc inside the filled Finish field keeps the unfold open",
    ).toBeVisible();
    await tabTo(
      page,
      lineButton,
      "Finish → back to the line (Shift+Tab)",
      true,
    );
    await page.keyboard.press("Escape");
    await expect(instrument(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(
      door,
      "focus returns to the door that opened the unfold",
    ).toBeFocused({ timeout: 10_000 });

    // Back to the studio through the job head's Studio link.
    const studioLink = page
      .locator("[data-document-shell]")
      .getByRole("link", { name: /Studio/ })
      .first();
    await tabTo(page, studioLink, "door → job head Studio link", true);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/desk/, { timeout: 60_000 });
    await arrivedStudio(page);
    // The saved value is still the database value after the round trip.
    expect(
      psqlScalar(
        `SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id='${line}';`,
      ),
    ).toBe(value);
  });

  test("acceptance chapter (C4/C6 active): keyboard resolve-condition form, refused submit, cancel", async ({
    page,
  }) => {
    const job = psqlScalar(
      `SELECT id FROM public.projects WHERE name='E7 household job' AND designer_id='e7e70000-0000-4000-8000-000000000001';`,
    );
    expect(job, "E7 mixed fixture loaded").toMatch(/^[0-9a-f-]{36}$/);
    const openConditions = () =>
      psqlScalar(`SELECT count(*) FROM public.service_acceptance_condition_resolutions c
      JOIN public.service_acceptance_requests r ON r.id = c.request_id WHERE r.project_id='${job}';`);
    const before = openConditions();
    await signInAs(page, E7_OWNER);
    await page.goto("about:blank");
    await page.goto(`/doc/${job}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    const closeout = page.locator('[data-paper-chapter="closeout"]');
    await expect(
      closeout.locator("[data-service-acceptance-request]").first(),
    ).toBeAttached({ timeout: 30_000 });
    await axe(page, "job paper (E7, acceptance active)");
    await axe(
      page,
      "acceptance/care chapter (E7)",
      '[data-paper-chapter="closeout"]',
    );

    const resolveButton = closeout.getByRole("button", {
      name: "Resolve this condition",
    });
    await tabTo(page, resolveButton, "job → Resolve this condition");
    await page.keyboard.press("Enter");
    const form = closeout.getByRole("form", { name: /^Resolve: / });
    await expect(form).toBeVisible();
    const how = form.getByLabel("How it was resolved");
    await tabTo(page, how, "form → How it was resolved");
    await page.keyboard.type("Oak floor kept; recorded by keyboard");
    await axe(
      page,
      "resolve-condition form open",
      '[data-paper-chapter="closeout"]',
    );
    // Refused branch: no reference chosen → inline alert, no mutation.
    await tabTo(
      page,
      form.getByRole("button", { name: "Record the resolution" }),
      "form → Record the resolution",
    );
    await page.keyboard.press("Enter");
    await expect(form.getByRole("alert")).toContainText("choose one reference");
    expect(
      openConditions(),
      "refused submit records no resolution (condition stays open)",
    ).toBe(before);
    // Cancel closes the form; record where focus lands.
    await tabTo(
      page,
      form.getByRole("button", { name: "Cancel" }),
      "form → Cancel",
    );
    await page.keyboard.press("Enter");
    await expect(form).toHaveCount(0);
    const landed = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      return `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 40)}`;
    });
    console.log("[rc7-e8 cancel focus]", test.info().project.name, landed);
    test.info().annotations.push({ type: "cancel-focus", description: landed });
  });

  // RC7-E8-1 (fixed by FIX4 5386a159e): Cancel on the resolve-condition form used to
  // drop keyboard focus to <body>; it now returns focus to its opener.
  test('RC7-E8-1: Cancel returns focus to "Resolve this condition"', async ({
    page,
  }) => {
    const job = psqlScalar(
      `SELECT id FROM public.projects WHERE name='E7 household job' AND designer_id='e7e70000-0000-4000-8000-000000000001';`,
    );
    await signInAs(page, E7_OWNER);
    // As the acceptance test above: the studio settles before the job opens
    // (on WebKit a navigation cut into the studio's first reads left the job
    // read failed, "This document could not be loaded" — observation O-4).
    await arrivedStudio(page);
    await page.goto("about:blank");
    await page.goto(`/doc/${job}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    const closeout = page.locator('[data-paper-chapter="closeout"]');
    const resolveButton = closeout.getByRole("button", {
      name: "Resolve this condition",
    });
    await tabTo(page, resolveButton, "E8-1 → Resolve this condition");
    await page.keyboard.press("Enter");
    const form = closeout.getByRole("form", { name: /^Resolve: / });
    await tabTo(
      page,
      form.getByRole("button", { name: "Cancel" }),
      "E8-1 → Cancel",
    );
    await page.keyboard.press("Enter");
    await expect(form).toHaveCount(0);
    await expect(resolveButton).toBeFocused();
  });
  test("RC7-E8-2: axe color-contrast serious == 0 on every surface", async ({
    page,
  }) => {
    const incomplete: Record<string, number> = {};
    const contrast = async (surface: string, include?: string) => {
      const shell = page.locator('[data-paper-renderer="round8"][data-document-shell]');
      if (await shell.count()) {
        await expect(page.locator('[data-document-paper] > [data-paper-shown]').first()).toBeAttached({ timeout: 30_000 });
        await expect(shell).toHaveAttribute('data-lens-resolved', 'true', { timeout: 30_000 });
      }
      const { violations } = await runAxe(
        page,
        `${surface} [RC7-E8-2]`,
        include,
      );
      incomplete[surface] = await page.evaluate(async (context) => {
        const run = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<any> } }).axe.run;
        const result = await run(context ? { include: [context] } : document, {
          runOnly: { type: 'rule', values: ['color-contrast'] },
          resultTypes: ['incomplete'],
        });
        return result.incomplete.find((entry: { id: string }) => entry.id === 'color-contrast')?.nodes.length ?? 0;
      }, include ?? null);
      return violations.filter((v) => v.id === "color-contrast");
    };
    const found: Record<string, unknown> = {};
    const line = psqlScalar(
      `SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${LIVING}' AND name='${LINE_NAME}';`,
    );
    await signInAs(page, F01_DESIGNER);
    await arrivedStudio(page);
    found.studio = await contrast("studio");
    await page.goto(`/doc/${JOB}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    found.f01 = await contrast("job paper (F01)");
    const room = page.locator(
      `[data-paper-chapter="ffe"] [data-pieces-room="${LIVING}"]`,
    );
    const toggle = room.getByRole("button", { name: /Living Room/ }).first();
    await tabTo(page, toggle, "contrast job → Living Room disclosure");
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await page.keyboard.press("Enter");
    const door = room.getByRole("link", { name: /Edit room selections/ });
    await tabTo(page, door, "contrast Living Room → Edit room selections");
    await page.keyboard.press("Enter");
    await expect(
      instrument(page).locator(`[data-room-heading="${LIVING}"]`),
    ).toBeFocused({ timeout: 30_000 });
    await tabTo(
      page,
      instrument(page)
        .getByRole("group", { name: "Schedule view" })
        .getByRole("button", { name: "Specifications" }),
      "contrast unfold → Specifications",
      true,
    );
    await page.keyboard.press("Enter");
    const lineButton = instrument(page)
      .getByTestId("spec-lens")
      .locator(`[data-line-id="${line}"] > button`);
    await tabTo(page, lineButton, "contrast Specifications → line");
    await page.keyboard.press("Enter");
    await expect(lineButton).toHaveAttribute("aria-current", "true", {
      timeout: 30_000,
    });
    await expect(instrument(page).getByTestId("spec-fields-pane")).toContainText(
      LINE_NAME,
      { timeout: 60_000 },
    );
    await expect(page.getByText('Authorizations & trade scopes', { exact: false }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^Working budget ·/ }).first()).toBeVisible();
    await expect(page.getByText(/^Start with ·/).first()).toBeVisible();
    await expect(page.getByText(/^(Studio only|Studio eyes only)$/).first()).toBeVisible();
    found.spec = await contrast("FF&E unfold, Specifications, line open");

    const job = psqlScalar(
      `SELECT id FROM public.projects WHERE name='E7 household job' AND designer_id='e7e70000-0000-4000-8000-000000000001';`,
    );
    await page.goto("about:blank");
    await page.context().clearCookies();
    await signInAs(page, E7_OWNER);
    await page.goto("about:blank");
    await page.goto(`/doc/${job}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    const closeout = page.locator('[data-paper-chapter="closeout"]');
    await expect(
      closeout.locator("[data-service-acceptance-request]").first(),
    ).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('[data-paper-chapter="schedule"] span').filter({ hasText: /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/ }).first()).toBeVisible();
    found.e7 = await contrast("job paper (E7, acceptance active)");
    found.e7Closeout = await contrast(
      "acceptance/care chapter (E7)",
      '[data-paper-chapter="closeout"]',
    );
    const resolveButton = closeout.getByRole("button", {
      name: "Resolve this condition",
    });
    await tabTo(page, resolveButton, "contrast job → Resolve this condition");
    await page.keyboard.press("Enter");
    await expect(
      closeout.getByRole("form", { name: /^Resolve: / }),
    ).toBeVisible();
    found.resolveForm = await contrast(
      "resolve-condition form open",
      '[data-paper-chapter="closeout"]',
    );
    console.log('[rc7-e8 contrast-incomplete]', test.info().project.name, JSON.stringify(incomplete));
    expect(
      Object.values(found).flat(),
      `color-contrast serious ${JSON.stringify(found)}`,
    ).toEqual([]);
  });
});
