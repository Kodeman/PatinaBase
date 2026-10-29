import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/auth";
import { psqlRun, psqlScalar } from "../helpers/psql";
import { rc7OwnedStackSql } from "./owned-stack";

/**
 * RC-7 E8 — X04 visual comparison against the frozen Room Proof 08 reference
 * (artifacts/room-proof-round8-2026-10-23). chromium = desktop 1440, webkit-iphone
 * = phone 390. Captures the portal and the reference at the same viewport, plus
 * the DOM facts each comparison rests on. The judgement (match / deviation /
 * defect) is made by looking at the captures and is recorded in rc7-e8.md.
 *
 * Preconditions on the owned stack (applied once, before the runs):
 * rc7-e8-activation-fixture.sql (C2/C4/C6 on) and rc7-e7-fixtures/mixed-fixture.sql
 * (E7 household job: C4 returned + accepted-with-conditions, C6 completion, GC
 * cabinetry fulfilment, each produced by its RPC as its real actor).
 */

const JOB = "f0180000-0000-4000-8000-000000000010";
const ROOT = path.resolve(__dirname, "../../../..");
const REFERENCE = path.join(ROOT, "artifacts/room-proof-round8-2026-10-23");
const SHOTS = path.join(
  ROOT,
  "docs/design/designer-portal-round8/evidence/rc/visual-rc7",
);
const COVER_KEY = `${JOB}/boards/e8e80000-0000-4000-8000-000000000001/room.png`;
const E7_OWNER = "rc7-e7-1@patina.test";

const facts: Record<string, unknown> = {};

async function shot(
  page: Page,
  name: string,
  target?: Locator,
  fullPage = false,
) {
  const project = test.info().project.name;
  mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${project}-${name}.jpg`);
  const options = {
    path: file,
    type: "jpeg" as const,
    quality: 70,
    animations: "disabled" as const,
  };
  if (target) {
    // Element captures stitch the scroll, so the sticky job head and the fixed
    // dock would be painted over the chapter. Hide only those overlays here;
    // the viewport captures keep them.
    await target.evaluate((root) =>
      document.querySelectorAll("body *").forEach((node) => {
        const position = getComputedStyle(node).position;
        if (
          (position === "fixed" || position === "sticky") &&
          !root.contains(node)
        )
          node.setAttribute("data-e8-overlay", "");
      }),
    );
    await target.screenshot({
      ...options,
      style: "[data-e8-overlay]{visibility:hidden !important}",
    });
    await page.evaluate(() =>
      document
        .querySelectorAll("[data-e8-overlay]")
        .forEach((node) => node.removeAttribute("data-e8-overlay")),
    );
  } else await page.screenshot({ ...options, fullPage });
}

async function settleStudio(page: Page) {
  await page.goto("about:blank");
  await page.goto("/desk", { waitUntil: "domcontentloaded", timeout: 120_000 });
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

async function settleJob(page: Page, id: string) {
  await page.goto("about:blank");
  await page.goto(`/doc/${id}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await expect(
    page.locator('[data-document-shell][data-paper-renderer="round8"]'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.locator("[data-document-shell][data-arrival-ready]"),
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator("html")).not.toHaveClass(
    /\barr-(?:pre|on|press)\b/,
    { timeout: 30_000 },
  );
}

/** Scroll the whole document once so every quiet region mounts, then return to the top. */
async function walkDown(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
}

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ) - document.documentElement.clientWidth,
  );

async function reference(
  page: Page,
  file: string,
  name: string,
  anchor?: string,
) {
  await page.goto(
    pathToFileURL(path.join(REFERENCE, file)).href +
      (anchor ? `#${anchor}` : ""),
  );
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);
  if (anchor) {
    const section = page.locator(`#${anchor}`);
    await section.scrollIntoViewIfNeeded();
    await shot(page, `ref-${name}`, section);
  } else {
    await shot(page, `ref-${name}`);
  }
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

test.describe("RC-7 E8 X04 visual capture", () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    const activation =
      psqlScalar(`SELECT json_build_object('scopeEditions', (SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'),
      'c4', has_function_privilege('authenticated','public.create_service_acceptance_request(uuid,uuid,uuid,text)','EXECUTE'),
      'c6', has_function_privilege('authenticated','public.complete_studio_service(uuid,uuid,text,text)','EXECUTE'));`);
    expect(
      JSON.parse(activation),
      "C4/C6 activated on the owned stack",
    ).toEqual({ scopeEditions: true, c4: true, c6: true });
    // Upload the reference photograph to the board's private folder, then
    // point an active project board's cover at it.
    const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const upload = await fetch(
      `${api}/storage/v1/object/project-ffe-working/${COVER_KEY}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          "Content-Type": "image/png",
          "x-upsert": "true",
        },
        body: readFileSync(path.join(REFERENCE, "assets/room.png")),
      },
    );
    expect(upload.ok, `cover upload ${upload.status}`).toBe(true);
    psqlRun(
      rc7OwnedStackSql("rc7-e8 cover fixture") +
        readFileSync(path.join(__dirname, "rc7-e8-cover-fixture.sql"), "utf8"),
    );
    facts.coverBoard = psqlScalar(
      `SELECT cover_image_url FROM public.proposal_boards WHERE id='e8e80000-0000-4000-8000-000000000001' AND status='active';`,
    );
  });

  test.afterAll(() => {
    mkdirSync(SHOTS, { recursive: true });
    const project = test.info().project.name;
    writeFileSync(
      path.join(SHOTS, `${project}-facts.json`),
      JSON.stringify(facts, null, 2),
    );
  });

  test("studio: portal against studio.html, with the photographic cover", async ({
    authenticatedPage: page,
  }) => {
    await settleStudio(page);
    const plate = page.locator('[data-studio="round8"] img').first();
    await expect(
      plate,
      "the commission plate renders the board cover",
    ).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          plate.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        {
          timeout: 30_000,
          message: "the signed cover photograph decoded",
        },
      )
      .toBe(true);
    facts.studio = {
      overflow: await overflow(page),
      plate: await plate.evaluate((img: HTMLImageElement) => ({
        signed: /\/storage\/v1\/object\/sign\/project-ffe-working\//.test(
          img.currentSrc,
        ),
        natural: [img.naturalWidth, img.naturalHeight],
        box: [
          Math.round(img.getBoundingClientRect().width),
          Math.round(img.getBoundingClientRect().height),
        ],
        alt: img.alt,
      })),
      caption: await page
        .locator('[data-studio="round8"] figcaption')
        .first()
        .textContent()
        .catch(() => null),
    };
    expect(facts.studio).toMatchObject({ plate: { signed: true } });
    await shot(page, "studio-top");
    await walkDown(page);
    await shot(page, "studio-full", undefined, true);
    await reference(page, "studio.html", "studio-top");
  });

  test("F01 job paper: full paper and the activated acceptance/care chapter", async ({
    authenticatedPage: page,
  }) => {
    await settleJob(page, JOB);
    await shot(page, "job-top");
    await walkDown(page);
    const closeout = page.locator('[data-paper-chapter="closeout"]');
    await closeout.scrollIntoViewIfNeeded();
    await expect(closeout).toBeVisible();
    facts.f01 = {
      overflow: await overflow(page),
      chapters: await page
        .locator("[data-paper-chapter]")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-paper-chapter")),
        ),
      studioServiceInactive: await page
        .locator("[data-studio-service-inactive]")
        .count(),
      serviceAcceptanceInactive: await page
        .locator("[data-service-acceptance-inactive]")
        .count(),
      closeoutText: (await closeout.innerText()).slice(0, 1200),
    };
    expect(facts.f01).toMatchObject({ studioServiceInactive: 0 });
    await shot(page, "job-f01-closeout", closeout);
    await shot(page, "job-full", undefined, true);
    await reference(page, "job.html", "job-top");
    await reference(page, "job.html", "job-closeout", "closeout");
    await reference(page, "job.html", "job-cabinetry", "cabinetry");
    await reference(page, "index.html", "index-top");
  });

  test("E7 household job: cabinetry chapter and populated acceptance/care", async ({
    page,
  }) => {
    const job = psqlScalar(
      `SELECT id FROM public.projects WHERE name='E7 household job' AND designer_id='e7e70000-0000-4000-8000-000000000001';`,
    );
    expect(job, "E7 mixed fixture is loaded on the owned stack").toMatch(
      /^[0-9a-f-]{36}$/,
    );
    const records = psqlScalar(`SELECT json_build_object(
      'cabinetry', (SELECT count(*) FROM public.project_external_fulfilments WHERE project_id='${job}' AND kind='gc_cabinetry'),
      'requests', (SELECT json_agg(lifecycle ORDER BY created_at) FROM public.service_acceptance_requests WHERE project_id='${job}'))`);
    facts.e7 = { job, records: JSON.parse(records) };
    await signInAs(page, E7_OWNER);
    await settleJob(page, job);
    await walkDown(page);
    const cabinetry = page.locator('[data-paper-chapter="cabinetry"]');
    await cabinetry.scrollIntoViewIfNeeded();
    await expect(cabinetry.locator("[data-cabinetry-chapter]")).toBeVisible({
      timeout: 30_000,
    });
    const closeout = page.locator('[data-paper-chapter="closeout"]');
    await closeout.scrollIntoViewIfNeeded();
    await expect(closeout.locator("[data-service-acceptance]")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      closeout.locator("[data-service-acceptance-request]").first(),
    ).toBeVisible({ timeout: 30_000 });
    Object.assign(facts.e7 as object, {
      overflow: await overflow(page),
      requestsRendered: await closeout
        .locator("[data-service-acceptance-request]")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-lifecycle")),
        ),
      inactive: await page
        .locator(
          "[data-studio-service-inactive], [data-service-acceptance-inactive]",
        )
        .count(),
      cabinetryText: (await cabinetry.innerText()).slice(0, 1200),
      closeoutText: (await closeout.innerText()).slice(0, 1600),
    });
    await shot(page, "job-e7-cabinetry", cabinetry);
    await shot(page, "job-e7-closeout", closeout);
  });
});
