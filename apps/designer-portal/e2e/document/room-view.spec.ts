import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { psqlScalar, psqlRow } from '../helpers/psql';

/**
 * Room View (R107, W1–W3) — the full v1 acceptance walk against the seeded
 * Elena Ruiz "Formal Dining Room" scan.
 *
 * Prereqs (house pattern, playwright.config.ts): local Supabase up + seeded
 * (designer@patina.dev / password123, `supabase/seed/leads_room_scans.sql`),
 * flag `the-document-pilot` on (pinned in the config's webServer env). Elena's
 * scan must have PARSED geometry — locally that means
 * `pnpm dev:seed-room-fixture` has run (scripts/dev/seed-room-scan-fixture.mjs)
 * — CI has no such fixture, so this spec self-skips rather than fail red.
 *
 * Chromium-pinned: the measure-tool and Orbit-chunk-boundary beats drive raw
 * `page.mouse` coordinates computed via the Plan SVG's own `getScreenCTM()` —
 * cross-browser SVG/CTM quirks aren't the concern here (mirrors
 * arrival-arc.spec.ts's rationale for pinning a long single-actor narrative).
 *
 * One test, one narrative: the roster → card click → facts rail → wall-hover
 * truth → measure-tool truth → the Orbit lazy-load boundary → the leave
 * affordance all live in ONE page session on purpose — the roster-origin fix
 * (Phase-2 gate, room-card.tsx's `rememberRoomOrigin`) is `sessionStorage`-
 * scoped, so proving "leaving a room opened from /rooms reads '← the Rooms'
 * and returns there" requires the SAME tab that actually clicked the card,
 * not a fresh `page` fixture re-navigated straight to `/room/[id]`.
 */
test.describe.configure({ mode: 'serial' });

// Headless Chromium's default sandboxed GPU setup fails WebGL context
// creation outright (verified live: "BindToCurrentSequence failed", the
// well-known headless-Chrome SwiftShader gate) — OrbitCanvas's own
// ErrorBoundary/try-catch then correctly swaps in the "couldn't start on
// this device" fallback, which is a real, tested app behavior but NOT what
// this spec means by "canvas mounts". `--enable-unsafe-swiftshader` +
// `--use-gl=swiftshader` restore software WebGL for this file only (no
// other spec's browser instance is affected — Playwright launches a
// separate browser per distinct `launchOptions`).
test.use({
  launchOptions: {
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--ignore-gpu-blocklist'],
  },
});

const ELENA_EMAIL = 'elena.ruiz@example.com';
const SCAN_NAME = 'Formal Dining Room';

/** Plan/mini-plan feet→SVG-user-space transform (plan-stage.tsx's
 *  PLAN_STAGE_SCALE/PLAN_STAGE_PAD) — duplicated here because Playwright
 *  specs run in Node, outside the app's module graph; keep in sync with
 *  plan-stage.tsx if those constants ever change. */
const SCALE = 28;
const PAD = 54;

/** Ported EXACTLY from geometry.ts's `ftIn` (feet → "F′ I″", 12″ carry) — the
 *  spec asserts against this independently-computed truth, not against
 *  whatever the app itself renders, so a bug in the app's own tip-building
 *  logic would still be caught. */
function ftIn(ft: number): string {
  const f = Math.floor(ft);
  const i = Math.round((ft - f) * 12);
  return i === 12 ? `${f + 1}′ 0″` : `${f}′ ${i}″`;
}

/** Inverse of ftIn — "14′ 3″" → 14.25. Used for the measure-tool's "within
 *  1″" tolerance check (pixel-click precision, unlike the deterministic wall
 *  hover chip, which reads a stored length with no mouse math involved). */
function parseFtIn(text: string): number {
  const m = text.trim().match(/^(\d+)′\s*(\d+)″$/);
  if (!m) throw new Error(`unparseable ftIn text: "${text}"`);
  return Number(m[1]) + Number(m[2]) / 12;
}

/** Converts a feet-space point (the Plan/geometry frame) into the CURRENT
 *  viewport (client) coordinates of the given SVG, via the SAME
 *  `getScreenCTM()` mechanism use-measure.ts's `screenPointToFeet` inverts —
 *  so a click here round-trips losslessly back through the app's own math,
 *  independent of the page's actual CSS scale/zoom/layout. */
async function feetToScreenPoint(
  page: AuthenticatedPage,
  svgSelector: string,
  ftX: number,
  ftZ: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ svgSelector, ftX, ftZ, SCALE, PAD }) => {
      const svg = document.querySelector(svgSelector) as SVGSVGElement | null;
      if (!svg) throw new Error(`no element matched "${svgSelector}"`);
      const ctm = svg.getScreenCTM();
      if (!ctm) throw new Error('SVG has no screen CTM (unmounted or zero-size)');
      const pt = svg.createSVGPoint();
      pt.x = ftX * SCALE + PAD;
      pt.y = ftZ * SCALE + PAD;
      const screenPt = pt.matrixTransform(ctm);
      return { x: screenPt.x, y: screenPt.y };
    },
    { svgSelector, ftX, ftZ, SCALE, PAD },
  );
}

interface WallTruth {
  label: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  lengthFt: number;
}

test('the Room View — roster, wall truth, measure, Orbit boundary, and the /rooms leave affordance (fix A)', async ({
  authenticatedPage: page,
}) => {
  // ── seed-dependency guard (house pattern) ──────────────────────────────
  const scanId = psqlScalar(
    `select rsd.scan_id from room_scan_documents rsd
       join profiles p on p.id = rsd.user_id
      where p.email = '${ELENA_EMAIL}' and rsd.name = '${SCAN_NAME}'
        and rsd.parse_status = 'parsed'`,
  );
  test.skip(
    !scanId,
    `No PARSED "${SCAN_NAME}" scan for ${ELENA_EMAIL} — run ` +
      '`pnpm dev:seed-room-fixture` locally first (CI has no parsed fixture).',
  );

  const geometryRowCount = Number(
    psqlScalar(`select count(*) from room_scan_geometry_elements where scan_id='${scanId}'`),
  );
  test.skip(geometryRowCount === 0, `scan ${scanId} has a parsed header but zero geometry element rows.`);

  const roomCount = Number(psqlScalar('select count(*) from room_scans'));

  // The wall this spec hovers AND measures against — position 0 is the
  // parser's own deterministic ordering (N,E,S,W then along-wall position;
  // lib.ts), so this is stable across reseeds, not a hardcoded label.
  const wallRow = psqlRow(
    `select label, x1_ft, z1_ft, x2_ft, z2_ft, confidence
       from room_scan_geometry_elements
      where scan_id='${scanId}' and kind='wall'
      order by position asc limit 1`,
  );
  const [label, x1s, z1s, x2s, z2s, confidence] = wallRow;
  const x1 = Number(x1s), z1 = Number(z1s), x2 = Number(x2s), z2 = Number(z2s);
  const wallTruth: WallTruth = {
    label,
    x1, z1, x2, z2,
    lengthFt: Math.hypot(x2 - x1, z2 - z1),
  };
  const expectedTip =
    `${wallTruth.label} — ${ftIn(wallTruth.lengthFt)}` +
    (confidence === 'low' ? ' · low confidence — verify on site' : '');

  // Track every request from here on — the Orbit-boundary assertion needs a
  // "before" slice (nothing three.js-shaped has loaded yet) and an "after"
  // slice (the Orbit click's lazy chunk landed).
  const requestUrls: string[] = [];
  page.on('request', (req) => requestUrls.push(req.url()));

  // ── 1. The Rooms roster — card count + Elena's mini-plan ───────────────
  await page.goto('/rooms', { waitUntil: 'domcontentloaded' });
  // RoomShell's title is a plain <span> in its `<header>` — scoped via the
  // implicit "banner" landmark role, since the StudioDrawer's OWN "The
  // Rooms" nav button also matches a bare text/exact locator.
  await expect(page.getByRole('banner').getByText('The Rooms', { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const roomLinks = page.getByRole('link', { name: /^Open the room for/ });
  await expect(roomLinks).toHaveCount(roomCount, { timeout: 20_000 });

  const elenaCardLink = page.getByRole('link', { name: 'Open the room for Elena Ruiz' });
  await expect(elenaCardLink).toBeVisible();
  const elenaCard = elenaCardLink.locator('xpath=..');
  await expect(elenaCard.locator('svg[aria-label="Room plan sketch"]')).toBeVisible();
  await expect(elenaCard.locator('[data-testid="room-plan-thumb-placeholder"]')).toHaveCount(0);

  const preClickRequestCount = requestUrls.length;

  // ── 2. Card click → /room/[id] (this is what stashes the Rooms origin —
  //      room-card.tsx's onClick, the Phase-2 fix under test) ─────────────
  await elenaCardLink.click();
  await page.waitForURL(new RegExp(`/room/${scanId}`), { timeout: 20_000 });

  // ── 3. Facts rail — the Verify line (Elena's fixture carries exactly one
  //      low-confidence wall; facts-rail.tsx only renders this when ≥1) ───
  await expect(page.getByText('Verify', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/drawn dashed; confirm on site/)).toBeVisible();

  // ── 4. Hover a wall → chip text matches independently-computed ftIn truth
  const planSvg = 'svg[aria-label="Room plan"]';
  const wallGroup = page.locator(`${planSvg} g[aria-label="${expectedTip}"]`);
  await expect(wallGroup).toHaveCount(1);
  await wallGroup.hover();
  await expect(page.getByText(expectedTip, { exact: true })).toBeVisible({ timeout: 5_000 });
  // Move off so the hover chip doesn't linger and shadow later locators.
  await page.mouse.move(0, 0);

  // ── 5. Measure the SAME wall's two endpoints → label within 1″ ─────────
  await page.locator(planSvg).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Measure', exact: true }).click();

  const pA = await feetToScreenPoint(page, planSvg, wallTruth.x1, wallTruth.z1);
  await page.mouse.click(pA.x, pA.y);
  const pB = await feetToScreenPoint(page, planSvg, wallTruth.x2, wallTruth.z2);
  await page.mouse.click(pB.x, pB.y);

  const measureChip = page.locator(`${planSvg} foreignObject div`);
  await expect(measureChip).toBeVisible({ timeout: 5_000 });
  const measuredFt = parseFtIn(await measureChip.innerText());
  expect(Math.abs(measuredFt - wallTruth.lengthFt)).toBeLessThanOrEqual(1 / 12 + 1e-6);

  await page.getByRole('button', { name: 'Clear', exact: true }).click();

  // ── 6. Orbit — canvas mounts on click, and NOT a byte of three.js loaded
  //      beforehand (the lazy-boundary the whole shell is built around) ───
  const preOrbitClickCount = requestUrls.length;
  const threeLoadedBeforeOrbit = requestUrls
    .slice(preClickRequestCount, preOrbitClickCount)
    .some((u) => /three/i.test(u));
  expect(threeLoadedBeforeOrbit).toBe(false);

  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });

  const threeLoadedAfterOrbit =
    requestUrls.slice(preOrbitClickCount).some((u) => /three/i.test(u)) ||
    (await page.evaluate(
      () =>
        performance
          .getEntriesByType('resource')
          .some((r) => /three/i.test(r.name) || /orbit-canvas/i.test(r.name)),
    ));
  expect(threeLoadedAfterOrbit).toBe(true);

  // ── 7. Leave → "← the Rooms" (fix A: room-card.tsx stashed /rooms as the
  //      origin on click) → actually returns to /rooms ────────────────────
  // exact + case-sensitive: the StudioDrawer's OWN nav button is "The Rooms"
  // (capital T) — RoomShell's leave affordance is the lowercase originLabel().
  const leaveButton = page.getByRole('button', { name: 'the Rooms', exact: true });
  await expect(leaveButton).toBeVisible();
  await leaveButton.click();
  await page.waitForURL(/\/rooms$/, { timeout: 5_000 });
  // RoomShell's title is a plain <span> in its `<header>` — scoped via the
  // implicit "banner" landmark role, since the StudioDrawer's OWN "The
  // Rooms" nav button also matches a bare text/exact locator.
  await expect(page.getByRole('banner').getByText('The Rooms', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
});
