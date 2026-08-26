import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { psqlScalar, psqlRow } from '../helpers/psql';

/**
 * Room View (R107, W1–W3) — the full v1 acceptance walk against the seeded
 * Elena Ruiz "Formal Dining Room" scan.
 *
 * Prereqs (house pattern, playwright.config.ts): local Supabase up + seeded
 * (designer@patina.dev / password123, `supabase/seed/leads_room_scans.sql`),
 * no flag override needed (the R21 dissolve, I109, retired
 * `the-document-pilot` — the Document is unconditional). Elena's
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

// ═══════════════════════════════════════════════════════════════════════════
// Orbit photo-marker click math — independently computed, same spirit as
// feetToScreenPoint/ftIn above but for the Orbit projection, which has no
// per-marker DOM element to click (it's a WebGL raycast against an invisible
// hit sphere at the marker's apex — photo-marker-objects.ts). Ported from
// photo-poses.ts's photoPlanPose, photo-markers.tsx's off-plan clamp, and
// orbit/controls.ts's frameRoom/sphericalPosition, plus the SAME lookAt +
// perspective-projection math three.js's PerspectiveCamera applies. Keep
// these in sync if those modules' math or constants ever change.
//
// We only ever need ONE marker's world position: the EARLIEST-captured photo
// is ALWAYS the representative of photo-poses.ts's clusterPoses' first
// cluster (it seeds clusters in ascending sortKey order, so the very first
// item in that order can never be pre-assigned to an earlier cluster) — so
// no membership/clustering logic needs to be replicated, just its own pose.
// ═══════════════════════════════════════════════════════════════════════════

const M_TO_FT = 3.28084; // photo-poses.ts M_TO_FT
const ORBIT_FOV_DEG = 38; // orbit-canvas.tsx FOV_DEG
const ORBIT_TARGET_EYE_FT = 2.2; // orbit/controls.ts TARGET_EYE_FT
const ORBIT_AZIMUTH = 0.82; // orbit/controls.ts DEFAULT_AZIMUTH
const ORBIT_POLAR = 1.08; // orbit/controls.ts DEFAULT_POLAR
const ORBIT_RADIUS_FIT = 1.35; // orbit/controls.ts RADIUS_FIT

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Rotate a plan point (x,z) by −θ (radians). Ported from photo-poses.ts's `rotateNeg`. */
function rotateNeg(x: number, z: number, theta: number): { x: number; z: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: x * c + z * s, z: -x * s + z * c };
}

/** camera_transform (row-major 16 doubles) + provenance → plan-frame pose,
 *  feet. Ported from photo-poses.ts's `photoPlanPose` (position only — the
 *  click target is the marker's apex, so heading is not needed). */
function photoPlanPose(t: number[], yawDeg: number, offX: number, offZ: number): Vec3 {
  const theta = (yawDeg * Math.PI) / 180;
  const wx = t[3];
  const wy = t[7];
  const wz = t[11];
  const rotated = rotateNeg(wx, wz, theta);
  return { x: (rotated.x - offX) * M_TO_FT, y: wy * M_TO_FT, z: (rotated.z - offZ) * M_TO_FT };
}

/** Clamp a pose's x/z onto the floor bbox + 2ft margin when it falls
 *  outside it — mirrors photo-markers.tsx's off-plan clamp (y is never
 *  clamped; Orbit reuses the SAME possibly-clamped x/z the Plan tick draws). */
function clampToFloorBounds(
  pose: Vec3,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): Vec3 {
  const margin = 2;
  const offPlan =
    pose.x < bounds.minX - margin ||
    pose.x > bounds.maxX + margin ||
    pose.z < bounds.minZ - margin ||
    pose.z > bounds.maxZ + margin;
  if (!offPlan) return pose;
  return {
    x: Math.min(Math.max(pose.x, bounds.minX), bounds.maxX),
    y: pose.y,
    z: Math.min(Math.max(pose.z, bounds.minZ), bounds.maxZ),
  };
}

/** orbit/controls.ts's frameRoom + sphericalPosition, ported — the DEFAULT
 *  (untouched) camera framing, since this spec never drags the Orbit view. */
function orbitDefaultCamera(widthFt: number, depthFt: number): { position: Vec3; target: Vec3 } {
  const diag = Math.hypot(widthFt, depthFt);
  const target: Vec3 = { x: widthFt / 2, y: ORBIT_TARGET_EYE_FT, z: depthFt / 2 };
  const radius = ORBIT_RADIUS_FIT * diag;
  const sinP = Math.sin(ORBIT_POLAR);
  const position: Vec3 = {
    x: target.x + radius * sinP * Math.cos(ORBIT_AZIMUTH),
    y: target.y + radius * Math.cos(ORBIT_POLAR),
    z: target.z + radius * sinP * Math.sin(ORBIT_AZIMUTH),
  };
  return { position, target };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Projects a world (feet) point into the canvas's client (viewport) pixel
 *  coordinates, under the SAME lookAt-basis + symmetric-perspective math a
 *  three.js `PerspectiveCamera` applies (`Camera.lookAt`'s axis construction
 *  + the standard FOV/aspect NDC projection) — the 3D counterpart of
 *  feetToScreenPoint's SVG CTM inversion above. */
function projectToCanvas(
  worldPoint: Vec3,
  cameraPos: Vec3,
  target: Vec3,
  canvasBox: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const zAxis = normalize(sub(cameraPos, target));
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  const xAxis = normalize(cross(worldUp, zAxis));
  const yAxis = cross(zAxis, xAxis);

  const rel = sub(worldPoint, cameraPos);
  const viewX = dot(rel, xAxis);
  const viewY = dot(rel, yAxis);
  const viewZ = dot(rel, zAxis);

  const aspect = canvasBox.width / canvasBox.height;
  const tanHalfFovY = Math.tan((ORBIT_FOV_DEG * Math.PI) / 180 / 2);
  const ndcY = viewY / -viewZ / tanHalfFovY;
  const ndcX = viewX / -viewZ / (tanHalfFovY * aspect);

  return {
    x: canvasBox.x + ((ndcX + 1) / 2) * canvasBox.width,
    y: canvasBox.y + ((1 - ndcY) / 2) * canvasBox.height,
  };
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

  // Photos ride the same fixture but a SEPARATE seeding step (`pnpm
  // dev:seed-room-fixture` seeds them by default; `--photos-only` re-seeds
  // just these 6 rows) — guard independently so a geometry-only fixture run
  // skips the photo assertions below rather than failing red.
  const photoCount = Number(
    psqlScalar(`select count(*) from room_scan_images where scan_id='${scanId}'`),
  );
  test.skip(
    photoCount === 0,
    `scan ${scanId} has no seeded photos — run \`pnpm dev:seed-room-fixture\` ` +
      '(or `--photos-only` to just add them) locally first.',
  );

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
  // implicit "banner" landmark role, which also keeps this off any other
  // chrome that happens to print the roster's name. A3-L3 renamed the studio
  // lexicon's door to "The Scans" (registry.tsx, the StudioDrawer, ⌘K); the
  // `/rooms` page's own banner is outside that rename and still reads
  // "The Rooms", which is the string asserted here.
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

  // ── 4. Photos — the facts-rail line reads the seeded count, and the
  //      contact strip renders one tile per photo (Room View PHOTOS, W1–W3;
  //      I76). Scope the facts-rail assertion to `<aside>`: PhotoStrip's own
  //      section header ALSO reads the bare text "Photos", so an unscoped
  //      locator would match both. ──────────────────────────────────────
  const factsRail = page.locator('aside');
  await expect(factsRail.getByText('Photos', { exact: true })).toBeVisible();
  await expect(factsRail.getByRole('button', { name: /6 photos/ })).toBeVisible();

  const photoStrip = page.getByRole('list', { name: 'Room photos' });
  await expect(photoStrip.getByRole('listitem')).toHaveCount(6);

  // ── 5. Hover a wall → chip text matches independently-computed ftIn truth
  const planSvg = 'svg[aria-label="Room plan"]';
  const wallGroup = page.locator(`${planSvg} g[aria-label="${expectedTip}"]`);
  await expect(wallGroup).toHaveCount(1);
  await wallGroup.hover();
  await expect(page.getByText(expectedTip, { exact: true })).toBeVisible({ timeout: 5_000 });
  // Move off so the hover chip doesn't linger and shadow later locators.
  await page.mouse.move(0, 0);

  // ── 6. Clicking a Plan photo marker opens the viewer at the right total,
  //      Esc closes it, and focus returns to the marker that opened it. The
  //      measure tool's catcher rect only occludes markers while ARMED
  //      (photo-markers.tsx's header) — this runs before arming, so no
  //      suppression is in play. ─────────────────────────────────────────
  const firstPlanMarker = page.locator('[data-photo-marker]').first();
  await expect(firstPlanMarker).toHaveCount(1);
  await firstPlanMarker.click();

  const photoDialog = page.getByRole('dialog');
  await expect(photoDialog).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/photo \d+ of 6/i)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(photoDialog).toHaveCount(0);
  await expect(firstPlanMarker).toBeFocused();

  // ── 7. Measure the SAME wall's two endpoints → label within 1″ ─────────
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

  // ── 8. Orbit — canvas mounts on click, and NOT a byte of three.js loaded
  //      beforehand (the lazy-boundary the whole shell is built around) ───
  const preOrbitClickCount = requestUrls.length;
  const threeLoadedBeforeOrbit = requestUrls
    .slice(preClickRequestCount, preOrbitClickCount)
    .some((u) => /three/i.test(u));
  expect(threeLoadedBeforeOrbit).toBe(false);

  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  const orbitCanvas = page.locator('canvas').first();
  await expect(orbitCanvas).toBeVisible({ timeout: 20_000 });

  const threeLoadedAfterOrbit =
    requestUrls.slice(preOrbitClickCount).some((u) => /three/i.test(u)) ||
    (await page.evaluate(
      () =>
        performance
          .getEntriesByType('resource')
          .some((r) => /three/i.test(r.name) || /orbit-canvas/i.test(r.name)),
    ));
  expect(threeLoadedAfterOrbit).toBe(true);

  // ── 9. Clicking an Orbit photo-frustum marker opens the viewer too. The
  //      marker is WebGL (no DOM node to click), so this projects the
  //      EARLIEST photo's pose through the SAME default camera framing +
  //      perspective math the app applies and clicks that screen point —
  //      see the projectToCanvas/orbitDefaultCamera block above. ─────────
  const provRow = psqlRow(
    `select origin_yaw_deg, origin_offset_m, width_ft, depth_ft, floor_polygon
       from room_scan_geometry where scan_id='${scanId}'`,
  );
  const [yawDegStr, offsetJson, widthStr, depthStr, floorJson] = provRow;
  const yawDeg = Number(yawDegStr);
  const offset = JSON.parse(offsetJson) as { x: number; z: number };
  const widthFt = Number(widthStr);
  const depthFt = Number(depthStr);

  const earliestPhotoRow = psqlRow(
    `select camera_transform from room_scan_images
       where scan_id='${scanId}' and camera_transform is not null
       order by captured_at asc, id asc limit 1`,
  );
  const cameraTransform = earliestPhotoRow[0]
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map(Number);

  let bounds = { minX: 0, maxX: Math.max(0, widthFt), minZ: 0, maxZ: Math.max(0, depthFt) };
  if (floorJson) {
    const floor = JSON.parse(floorJson) as Array<[number, number]>;
    if (floor.length > 0) {
      bounds = floor.reduce(
        (acc, [x, z]) => ({
          minX: Math.min(acc.minX, x),
          maxX: Math.max(acc.maxX, x),
          minZ: Math.min(acc.minZ, z),
          maxZ: Math.max(acc.maxZ, z),
        }),
        { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
      );
    }
  }
  const markerPose = clampToFloorBounds(photoPlanPose(cameraTransform, yawDeg, offset.x, offset.z), bounds);
  const { position: orbitCameraPos, target: orbitTarget } = orbitDefaultCamera(widthFt, depthFt);

  await orbitCanvas.scrollIntoViewIfNeeded();
  const canvasBox = await orbitCanvas.boundingBox();
  if (!canvasBox) throw new Error('Orbit canvas has no bounding box — is it visible?');
  const orbitClickPt = projectToCanvas(markerPose, orbitCameraPos, orbitTarget, canvasBox);

  await page.mouse.click(orbitClickPt.x, orbitClickPt.y);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/photo \d+ of 6/i)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 10. Leave → "← the Rooms" (fix A: room-card.tsx stashed /rooms as the
  //      origin on click) → actually returns to /rooms ────────────────────
  // exact + case-sensitive: RoomShell's leave affordance is the lowercase
  // originLabel(), distinct from the roster banner's capital-T "The Rooms".
  const leaveButton = page.getByRole('button', { name: 'the Rooms', exact: true });
  await expect(leaveButton).toBeVisible();
  await leaveButton.click();
  await page.waitForURL(/\/rooms$/, { timeout: 5_000 });
  // RoomShell's title is a plain <span> in its `<header>` — scoped via the
  // implicit "banner" landmark role, which also keeps this off any other
  // chrome that happens to print the roster's name. A3-L3 renamed the studio
  // lexicon's door to "The Scans" (registry.tsx, the StudioDrawer, ⌘K); the
  // `/rooms` page's own banner is outside that rename and still reads
  // "The Rooms", which is the string asserted here.
  await expect(page.getByRole('banner').getByText('The Rooms', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
});
