/**
 * WP4 screenshot pass — the procurement lifecycle on the designer surfaces
 * (ruling R7, DECISIONS I121–I125).
 *
 * The charter asks every new surface for a desktop (≥1280px) and a mobile
 * (~390px) reading. Shots land in
 * docs/design/workflow-alignment/screenshots/wp4/.
 *
 * LOCAL STACK ONLY — it seeds `helpers/wp4-procurement-fixture.sql`, whose
 * four lines between them draw every state the trail has: settled stamps, the
 * live clay step, dashed future, quiet `no-record`, and gate bars reading
 * settled, open, unreached and passed-unsealed.
 *
 * Not a gate: this spec produces artifacts. The assertions exist only so a
 * shot is never taken of a half-rendered surface.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type AuthenticatedPage } from "./fixtures/auth";
import { psqlRun } from "./helpers/psql";

const SHOT_DIR = "../../docs/design/workflow-alignment/screenshots/wp4";
// Tall enough that the whole fifteen-step trail clears the fixed studio-books
// bar: an element screenshot captures whatever is painted over the element, so
// a trail sitting under the bar loses steps 14/15 to it.
const DESKTOP = { width: 1512, height: 1200 };
const MOBILE = { width: 390, height: 900 };

/** Chen Residence — the seeded project the fixture hangs its four lines on. */
const PROJECT_ID = "6053f182-f2ff-4687-9d7c-c73daae96531";

const LINES = {
  midLifecycle: "Ashford Slipper Chair",
  delivered: "Larkspur Walnut Credenza",
  openClaim: "Hollis Reading Lamp",
  passedUnsealed: "Weld Iron Console",
} as const;

test.describe.configure({ mode: "serial" });
test.skip(({ browserName }) => browserName !== "chromium", "screenshot pass");

test.beforeAll(() => {
  psqlRun(
    readFileSync(
      path.join(__dirname, "helpers", "wp4-procurement-fixture.sql"),
      "utf8",
    ),
  );
  // The Desk Walkthrough's welcome modal renders over every route and would
  // stand in front of the ledger. Settled in the database, not localStorage —
  // the gate reads the persisted profile record (see wp3-screenshots.spec.ts).
  psqlRun(
    `UPDATE public.profiles
        SET help_state = '{"tours": {"desk-walkthrough": {"completed": true}}}'::jsonb
      WHERE id = 'a0000000-0000-0000-0000-000000000004'::uuid`,
  );
});

// No teardown: the fixture is left in place so the surfaces stay walkable
// after the pass. It rebuilds itself by id on the next run.

async function openDocument(
  page: AuthenticatedPage,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(`/doc/${PROJECT_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(LINES.midLifecycle).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Unfold exactly one line and hand back its trail, folding whatever was open. */
async function unfoldTrail(page: AuthenticatedPage, lineText: string) {
  const open = page.locator('[aria-expanded="true"]');
  for (const handle of await open.all()) {
    await handle.click().catch(() => undefined);
  }
  const row = page.getByRole("button").filter({ hasText: lineText }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const trail = page.locator("[data-procurement-trail]");
  await expect(trail).toHaveCount(1);
  // Top-align rather than centre: the trail is ~690px tall and the fixed bar
  // at the foot of the window would otherwise paint over its last steps.
  await trail.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -24));
  return trail;
}

test("the fifteen-step trail, in the line unfold", async ({
  authenticatedPage: page,
}) => {
  for (const [name, viewport] of [
    ["desktop", DESKTOP],
    ["mobile", MOBILE],
  ] as const) {
    await openDocument(page, viewport);

    // Mid-lifecycle: settled 01-03, live clay at 06, dashed future above it,
    // quiet no-record at 04, and G1 sealed while G2 is still unreached.
    let trail = await unfoldTrail(page, LINES.midLifecycle);
    await expect(
      trail.locator('[data-trail-step="in_production"]'),
    ).toHaveAttribute("data-trail-state", "live");
    await expect(
      trail.locator('[data-trail-gate="complete_to_produce"]'),
    ).toHaveAttribute("data-trail-state", "settled");
    await expect(trail.locator('[data-trail-step="stored"]')).toHaveAttribute(
      "data-trail-state",
      "future",
    );
    await trail.screenshot({
      path: `${SHOT_DIR}/procurement-trail-mid-lifecycle-${name}.png`,
    });

    // The open reading: an unpaid deposit holds G1 open, a drafted claim holds
    // G2 open, and step 01 goes quiet because nothing cleared it.
    trail = await unfoldTrail(page, LINES.openClaim);
    await expect(
      trail.locator('[data-trail-gate="received_and_dispositioned"]'),
    ).toHaveAttribute("data-trail-state", "open");
    await expect(trail).toContainText("open claim");
    await expect(
      trail.locator('[data-trail-step="cleared_to_produce"]'),
    ).toHaveAttribute("data-trail-state", "no-record");
    await trail.screenshot({
      path: `${SHOT_DIR}/procurement-trail-open-claim-${name}.png`,
    });

    // Passed-unsealed: the work went past a gate whose terms were never
    // written down. It goes quiet rather than drawing a stop under finished
    // work.
    trail = await unfoldTrail(page, LINES.passedUnsealed);
    await expect(
      trail.locator('[data-trail-gate="complete_to_produce"]'),
    ).toHaveAttribute("data-trail-state", "passed-unsealed");
    await expect(
      trail.locator('[data-trail-step="installed"]'),
    ).toHaveAttribute("data-trail-state", "live");
    await trail.screenshot({
      path: `${SHOT_DIR}/procurement-trail-passed-unsealed-${name}.png`,
    });

    // Both operational seals settled, the line closed out at step 10.
    trail = await unfoldTrail(page, LINES.delivered);
    await expect(
      trail.locator('[data-trail-gate="received_and_dispositioned"]'),
    ).toHaveAttribute("data-trail-state", "settled");
    await trail.screenshot({
      path: `${SHOT_DIR}/procurement-trail-delivered-inspected-${name}.png`,
    });
  }
});

test("the orders book — Stamp, Next gate, Expected", async ({
  authenticatedPage: page,
}) => {
  // Taller than the trail shots on purpose: the sheet grows with the viewport,
  // and the point of this reading is a RUN of rows carrying the three columns,
  // not one row in isolation.
  await page.setViewportSize({ width: 1512, height: 1600 });
  await page.goto("/desk?book=orders", { waitUntil: "domcontentloaded" });

  const nextGate = page.locator("[data-orders-next-gate]");
  await expect(nextGate.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-orders-expected]").first()).toBeVisible();

  await page.screenshot({ path: `${SHOT_DIR}/orders-book-desktop.png` });

  // The rows themselves, at reading distance — the stamp is now a lifecycle
  // position rather than the status word, with the gate that stops it next and
  // the shipment expectation beside it.
  const sections = page.locator("section:has([data-orders-next-gate])");
  const first = await sections.first().boundingBox();
  const rowCount = await sections.count();
  const last = await sections.nth(Math.min(rowCount, 4) - 1).boundingBox();
  if (!first || !last) throw new Error("no bounding box for the ledger rows");
  // Stop short of the fixed studio-books bar at the foot of the window, which
  // the last section runs underneath.
  const top = first.y - 8;
  await page.screenshot({
    path: `${SHOT_DIR}/orders-book-rows-desktop.png`,
    clip: {
      x: first.x - 8,
      y: top,
      width: first.width + 16,
      height: Math.min(last.y + last.height + 8, 1600 - 96) - top,
    },
  });
});
