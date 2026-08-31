import { test, expect, type AuthenticatedPage } from "../fixtures/auth";
import { psqlRun, psqlScalar } from "../helpers/psql";

const DESIGNER_ID = "a0000000-0000-0000-0000-000000000004";
const PROPOSAL_ID = "d0c10000-0000-0000-0000-0000000000b2";
const BOARD_ID = "e2e00000-0000-4000-8000-000000000001";
const PRODUCT_ID = "e2e00000-0000-4000-8000-000000000011";
const CAPTURE_ID = "e2e00000-0000-4000-8000-000000000012";
const IMAGE_ID = "e2e00000-0000-4000-8000-000000000013";
const PALETTE_ID = "e2e00000-0000-4000-8000-000000000014";
const NOTE_ID = "e2e00000-0000-4000-8000-000000000015";
const SCAN_ID = "e2e00000-0000-4000-8000-000000000016";
const SOURCE_PALETTE_ID = "e2e00000-0000-4000-8000-000000000021";
const SOURCE_SWATCH_ID = "e2e00000-0000-4000-8000-000000000022";
const PRODUCT_FEEDBACK_ID = "e2e00000-0000-4000-8000-000000000031";
const NOTE_FEEDBACK_ID = "e2e00000-0000-4000-8000-000000000032";
const FEEDBACK_CLIENT_ID = "a0000000-0000-0000-0000-000000000005";
// migration 00462's guard_proposal_board_item_media_reference trigger rejects
// any image_url that resolves to a proposal-mood-boards Storage path the
// board's own design studio doesn't own (public.board_storage_reference_path
// in 00462_workflow_privacy_authority.sql). A `data:` URI has no scheme the
// guard recognizes as external, so it falls through to the private-bucket
// ownership check and is rejected outright — that's the exact failure this
// fixture works around. `board_storage_reference_path` explicitly exempts
// any `^https?://` reference that isn't one of the recognized
// proposal-mood-boards Storage URL shapes (its own comment: "Empty and
// external HTTPS media never crosses this private bucket boundary"), the
// same exemption a designer pasting an external image URL onto a board relies
// on in production. PIXEL_IMAGE_URL below takes that exact path: it's an
// https:// URL on a fixture-only host that never touches DNS, because
// mockBoardImages() below intercepts it at the Playwright network layer and
// fulfills it with real PNG bytes — so the guard is satisfied exactly as it
// would be for a legitimate external board image, and the pins still render
// an actual decodable image for the visual assertions to mean something.
const PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PIXEL_IMAGE_URL = "https://e2e-fixtures.patina.test/mood-board/pixel.png";

/** Serves PIXEL_IMAGE_URL from the Playwright network layer — never a real
 *  request — with real, decodable PNG bytes, so every seeded pin renders an
 *  actual image instead of a broken-image icon. Must be registered before
 *  the board is opened. */
async function mockBoardImages(page: AuthenticatedPage): Promise<void> {
  await page.route(`${PIXEL_IMAGE_URL}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(PIXEL_PNG_BASE64, "base64"),
    }),
  );
}

function seedBoard(): void {
  psqlRun(`
BEGIN;
DELETE FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid;
DELETE FROM public.proposal_palettes WHERE id = '${SOURCE_PALETTE_ID}'::uuid;

INSERT INTO public.proposal_palettes (
  id,
  proposal_id,
  name,
  is_primary,
  sort_order
) VALUES (
  '${SOURCE_PALETTE_ID}'::uuid,
  '${PROPOSAL_ID}'::uuid,
  'GA rail palette',
  false,
  999
);

INSERT INTO public.palette_swatches (
  id,
  palette_id,
  hex,
  name,
  sort_order
) VALUES (
  '${SOURCE_SWATCH_ID}'::uuid,
  '${SOURCE_PALETTE_ID}'::uuid,
  '#9B7653',
  'Warm oak',
  0
);

INSERT INTO public.proposal_boards (
  id,
  proposal_id,
  name,
  canvas_width,
  canvas_height,
  background_color,
  sections,
  status,
  sort_order
) VALUES (
  '${BOARD_ID}'::uuid,
  '${PROPOSAL_ID}'::uuid,
  'GA browser acceptance board',
  1040,
  650,
  '#F7F1E8',
  '[{"id":"foundation","name":"Foundation","color":"#9B7653"},{"id":"details","name":"Details","color":"#6E7F72"}]'::jsonb,
  'active',
  999
);

INSERT INTO public.proposal_board_items (
  id,
  board_id,
  type,
  x,
  y,
  width,
  height,
  z_index,
  rotation,
  locked,
  image_url,
  content,
  data
) VALUES
  (
    '${PRODUCT_ID}'::uuid,
    '${BOARD_ID}'::uuid,
    'product',
    330,
    60,
    220,
    220,
    1,
    0,
    false,
    '${PIXEL_IMAGE_URL}',
    NULL,
    '{"name":"Heirloom lounge chair","vendor_name":"Patina Workshop","price_cents":245000,"section_id":"foundation"}'::jsonb
  ),
  (
    '${CAPTURE_ID}'::uuid,
    '${BOARD_ID}'::uuid,
    'capture',
    620,
    60,
    200,
    220,
    2,
    0,
    false,
    '${PIXEL_IMAGE_URL}',
    NULL,
    '{"name":"Curated capture","vendor_name":"Extension source","price_cents":89000,"section_id":"foundation"}'::jsonb
  ),
  (
    '${PALETTE_ID}'::uuid,
    '${BOARD_ID}'::uuid,
    'palette',
    50,
    90,
    260,
    130,
    3,
    0,
    false,
    NULL,
    NULL,
    '{"name":"Warm earths","section_id":"foundation","swatches":[{"hex":"#D9C3A5","name":"Flax"},{"hex":"#9B7653","name":"Oak"},{"hex":"#6E7F72","name":"Sage"}]}'::jsonb
  ),
  (
    '${IMAGE_ID}'::uuid,
    '${BOARD_ID}'::uuid,
    'image',
    50,
    360,
    240,
    180,
    4,
    0,
    false,
    '${PIXEL_IMAGE_URL}',
    NULL,
    '{"name":"Visual reference","section_id":"details"}'::jsonb
  ),
  (
    '${NOTE_ID}'::uuid,
    '${BOARD_ID}'::uuid,
    'note',
    360,
    360,
    230,
    160,
    5,
    0,
    false,
    NULL,
    'Leave breathing room',
    '{"name":"Composition note","section_id":"details"}'::jsonb
  ),
  (
    '${SCAN_ID}'::uuid,
    '${BOARD_ID}'::uuid,
    'room_scan',
    690,
    340,
    230,
    190,
    6,
    0,
    false,
    '${PIXEL_IMAGE_URL}',
    NULL,
    '{"name":"North wall scan","room_type":"Living room","section_id":"details"}'::jsonb
  );

INSERT INTO public.item_feedback (
  id,
  board_item_id,
  client_id,
  verdict,
  body,
  created_at,
  updated_at
) VALUES
  (
    '${PRODUCT_FEEDBACK_ID}'::uuid,
    '${PRODUCT_ID}'::uuid,
    '${FEEDBACK_CLIENT_ID}'::uuid,
    'approved',
    NULL,
    '2026-08-03T12:00:00Z',
    '2026-08-03T12:00:00Z'
  ),
  (
    '${NOTE_FEEDBACK_ID}'::uuid,
    '${NOTE_ID}'::uuid,
    '${FEEDBACK_CLIENT_ID}'::uuid,
    'rejected',
    'Please revise this note.',
    '2026-08-03T12:01:00Z',
    '2026-08-03T12:01:00Z'
  );
COMMIT;
`);
}

function deleteBoard(): void {
  psqlRun(`
    DELETE FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid;
    DELETE FROM public.proposal_palettes WHERE id = '${SOURCE_PALETTE_ID}'::uuid;
  `);
}

function boardItemScalar(selectExpression: string, itemId: string): string {
  return psqlScalar(
    `SELECT ${selectExpression} FROM public.proposal_board_items WHERE board_id = '${BOARD_ID}'::uuid AND id = '${itemId}'::uuid`,
  );
}

async function openBoard(page: AuthenticatedPage): Promise<void> {
  await mockBoardImages(page);
  await page.goto(`/board/${BOARD_ID}?from=%2Fdesk&source=recent_boards`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("main", {
      name: "GA browser acceptance board mood board room",
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("board-room-canvas")).toBeVisible();
  await expect(page.locator("[data-board-item-id]")).toHaveCount(6);
}

async function setBoardZoom(
  page: AuthenticatedPage,
  percent: 5 | 100 | 400,
): Promise<void> {
  const application = page.getByRole("application", {
    name: "GA browser acceptance board mood board",
  });
  await application.focus();
  await application.press("Meta+0");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  const key = percent === 5 ? "Meta+Minus" : "Meta+Equal";
  const presses = percent === 5 ? 10 : percent === 400 ? 30 : 0;
  for (let index = 0; index < presses; index += 1) {
    await application.press(key);
  }
  await expect(page.getByText(`${percent}%`, { exact: true })).toBeVisible();
}

async function dragRailSourceTo(
  page: AuthenticatedPage,
  source: ReturnType<AuthenticatedPage["locator"]>,
  release: { x: number; y: number },
): Promise<void> {
  const application = page.getByRole("application", {
    name: "GA browser acceptance board mood board",
  });
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  try {
    await source.dispatchEvent("dragstart", { dataTransfer });
    await application.dispatchEvent("dragover", {
      clientX: release.x,
      clientY: release.y,
      dataTransfer,
    });
    await application.dispatchEvent("drop", {
      clientX: release.x,
      clientY: release.y,
      dataTransfer,
    });
  } finally {
    await dataTransfer.dispose();
  }
}

/**
 * Records every mainframe navigation (a full document reload, or a
 * client-side route change) from the moment it's armed, and returns a
 * function that asserts none occurred. A navigation away from an open board
 * mid-gesture is always a defect here — this is the test-shaped version of
 * the P0 reload bug: a silent 401 mistaken for session expiry triggered a
 * `window.location.assign` redirect, the middleware saw the still-valid
 * cookie and bounced straight back, and the dedupe flag guarding it was
 * module-level — so it reloaded again on the very next pin selection,
 * forever.
 */
function armNavigationSentinel(page: AuthenticatedPage): () => void {
  const events: string[] = [];
  const mainFrame = page.mainFrame();
  const onFrameNavigated = (frame: typeof mainFrame) => {
    if (frame === mainFrame) events.push(`framenavigated -> ${frame.url()}`);
  };
  const onLoad = () => events.push(`load -> ${page.url()}`);
  page.on("framenavigated", onFrameNavigated);
  page.on("load", onLoad);
  return () => {
    page.off("framenavigated", onFrameNavigated);
    page.off("load", onLoad);
    expect(
      events,
      "expected no mainframe navigation while the board was mounted",
    ).toEqual([]);
  };
}

/**
 * A genuine cursor-driven HTML5 drag — mousedown, move past the browser's
 * own native drag threshold, move to the release point, mouseup — as
 * opposed to dragRailSourceTo's synthetic dispatchEvent sequence above. Only
 * a real drag session lets the browser's own default drop action (e.g.
 * navigating the tab to the dropped resource) fire when nothing claims the
 * drop first; a dispatchEvent("drop", ...) never invokes that default.
 */
async function mouseDragRailSourceTo(
  page: AuthenticatedPage,
  source: ReturnType<AuthenticatedPage["locator"]>,
  release: { x: number; y: number },
): Promise<void> {
  const box = await source.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 5 });
  await page.mouse.move(release.x, release.y, { steps: 12 });
  await page.mouse.up();
}

/** Dispatches a `drop` carrying a file-bearing DataTransfer at `target` — a
 *  stray OS-level file drop the canvas never opted into via dragover. */
async function dispatchFileDrop(
  page: AuthenticatedPage,
  target: ReturnType<AuthenticatedPage["locator"]>,
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["stray"], "stray-drop.png", { type: "image/png" }));
    return transfer;
  });
  try {
    await target.dispatchEvent("drop", { dataTransfer });
  } finally {
    await dataTransfer.dispose();
  }
}

test.describe.configure({ mode: "serial" });

test.describe("MoodBoard GA browser acceptance", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic fixture owns one shared board row.",
  );

  test.beforeEach(() => {
    seedBoard();
  });

  test.afterAll(() => {
    deleteBoard();
  });

  test("owns the viewport, sheds Desk chrome, and renders all pin and section types", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);

    const room = page.getByRole("main", {
      name: "GA browser acceptance board mood board room",
    });
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    await expect
      .poll(async () => {
        const box = await room.boundingBox();
        return box && viewport
          ? {
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.round(box.width),
              height: Math.round(box.height),
            }
          : null;
      })
      .toEqual({
        x: 0,
        y: 0,
        width: viewport!.width,
        height: viewport!.height,
      });

    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe("hidden");
    await expect(page.locator(".document-route-shell")).toHaveCount(0);
    await expect(page.locator("[data-feedback-layer]")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Studio drawer" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("tablist", { name: "Board sources" }),
    ).toBeVisible();

    const visibleControlSizes = await page
      .locator("header button:visible, header summary:visible, aside button:visible")
      .evaluateAll((controls) =>
        controls.map((control) => {
          const rect = control.getBoundingClientRect();
          return {
            label: control.getAttribute("aria-label") ?? control.textContent?.trim() ?? "control",
            width: rect.width,
            height: rect.height,
          };
        }),
      );
    expect(visibleControlSizes.length).toBeGreaterThan(0);
    expect(
      visibleControlSizes.filter(({ width, height }) => width < 44 || height < 44),
    ).toEqual([]);

    await page.getByRole("button", { name: "Browse products", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Add a product" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe("hidden");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Add a product" })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe("hidden");

    const focusedLastRoomControl = await page.evaluate(() => {
      const room = document.querySelector<HTMLElement>('main[aria-label$="mood board room"]');
      if (!room) return false;
      const controls = Array.from(room.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((control) => {
        const style = window.getComputedStyle(control);
        return style.display !== 'none' && style.visibility !== 'hidden' && control.getClientRects().length > 0;
      });
      const last = controls.at(-1);
      last?.focus();
      return document.activeElement === last;
    });
    expect(focusedLastRoomControl).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => {
        const room = document.querySelector<HTMLElement>('main[aria-label$="mood board room"]');
        return Boolean(room?.contains(document.activeElement));
      }),
    ).toBe(true);

    for (const type of [
      "product",
      "capture",
      "image",
      "palette",
      "note",
      "room scan",
    ]) {
      await expect(
        page.getByRole("button", { name: `${type} item`, exact: true }),
      ).toHaveCount(1);
    }
    await expect(
      page.getByText("Heirloom lounge chair", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Curated capture", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Warm earths", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Leave breathing room", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Scan · North wall scan", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-board-section]")).toHaveCount(2);
    await expect(
      page.getByRole("textbox", { name: "Rename Foundation section" }),
    ).toHaveValue("Foundation");
    await expect(
      page.getByRole("textbox", { name: "Rename Details section" }),
    ).toHaveValue("Details");

    expect(
      psqlScalar(
        `SELECT proposal_id::text FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid`,
      ),
    ).toBe(PROPOSAL_ID);
    expect(
      psqlScalar(
        `SELECT designer_id::text FROM public.proposals WHERE id = '${PROPOSAL_ID}'::uuid`,
      ),
    ).toBe(DESIGNER_ID);
  });

  test("selects by click and marquee while targeting pointer and keyboard context menus correctly", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);

    const product = page.getByRole("button", {
      name: "product item",
      exact: true,
    });
    const note = page.getByRole("button", { name: "note item", exact: true });
    await product.click();
    await expect(product).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("complementary", {
        name: "Selected board item inspector",
      }),
    ).toBeVisible();

    await note.click({ button: "right" });
    await expect(note).toHaveAttribute("aria-pressed", "true");
    await expect(product).toHaveAttribute("aria-pressed", "false");
    const menu = page.getByRole("menu", { name: "Board item actions" });
    await expect(menu).toBeVisible();
    await expect(page.getByText("Composition note", { exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await note.focus();
    await page.keyboard.press("Shift+F10");
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Bring forward" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    const canvasApplication = page.getByRole("application", {
      name: "GA browser acceptance board mood board",
    });
    await canvasApplication.focus();
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-board-item-id][aria-pressed="true"]'),
    ).toHaveCount(0);

    const box = await canvasApplication.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 8, box!.y + 8);
    await page.mouse.down();
    await page.mouse.move(box!.x + 930, box!.y + 320, { steps: 6 });
    await expect(page.getByTestId("board-marquee")).toBeVisible();
    await page.mouse.up();

    await expect(page.getByTestId("board-marquee")).toBeHidden();
    await expect(
      page.locator('[data-board-item-id][aria-pressed="true"]'),
    ).toHaveCount(3);
    await expect(page.getByText("3 pins", { exact: true })).toBeVisible();
  });

  test("centers rail drops at 5%, 100%, and 400% zoom (AC1.9)", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);
    await page.getByRole("tab", { name: "palettes", exact: true }).click();
    const source = page.getByRole("button", { name: /GA rail palette/i });
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute("draggable", "true");
    const application = page.getByRole("application", {
      name: "GA browser acceptance board mood board",
    });
    const viewport = await application.boundingBox();
    expect(viewport).not.toBeNull();
    const release = {
      x: viewport!.x + viewport!.width * 0.64,
      y: viewport!.y + viewport!.height * 0.58,
    };

    for (const [index, zoom] of ([5, 100, 400] as const).entries()) {
      await setBoardZoom(page, zoom);
      await dragRailSourceTo(page, source, release);
      const droppedPins = page
        .locator("[data-board-item-id]")
        .filter({ hasText: "GA rail palette" });
      await expect(droppedPins).toHaveCount(index + 1);
      await expect
        .poll(async () => {
          const box = await droppedPins.nth(index).boundingBox();
          return box
            ? {
                x: Math.abs(box.x + box.width / 2 - release.x) <= 2,
                y: Math.abs(box.y + box.height / 2 - release.y) <= 2,
              }
            : null;
        })
        .toEqual({ x: true, y: true });
      await expect
        .poll(
          () =>
            Number(
              psqlScalar(
                `SELECT count(*) FROM public.proposal_board_items WHERE board_id = '${BOARD_ID}'::uuid`,
              ),
            ),
          { timeout: 15_000 },
        )
        .toBe(7 + index);
    }
  });

  test("Alt-drag duplicates one pin and persists the structural write", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);

    const note = page
      .getByRole("button", { name: "note item", exact: true })
      .first();
    const box = await note.boundingBox();
    expect(box).not.toBeNull();
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };

    await page.keyboard.down("Alt");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 90, start.y + 70, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect(
      page.getByRole("button", { name: "note item", exact: true }),
    ).toHaveCount(2);
    await expect(page.locator("[data-board-item-id]")).toHaveCount(7);
    await expect
      .poll(
        () =>
          Number(
            psqlScalar(
              `SELECT count(*) FROM public.proposal_board_items WHERE board_id = '${BOARD_ID}'::uuid`,
            ),
          ),
        { timeout: 15_000 },
      )
      .toBe(7);
  });

  test("nudges, undoes, redoes, and reloads the persisted layout", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);

    const note = page.getByRole("button", { name: "note item", exact: true });
    const beforeX = Number(boardItemScalar("x::text", NOTE_ID));
    await note.focus();
    await expect(note).toHaveAttribute("aria-pressed", "false");
    await note.press("ArrowRight");
    await expect(note).toHaveAttribute("aria-pressed", "true");

    await expect
      .poll(() => Number(boardItemScalar("x::text", NOTE_ID)), {
        timeout: 15_000,
      })
      .toBe(beforeX + 1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(() => Number(boardItemScalar("x::text", NOTE_ID)), {
        timeout: 15_000,
      })
      .toBe(beforeX);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect
      .poll(() => Number(boardItemScalar("x::text", NOTE_ID)), {
        timeout: 15_000,
      })
      .toBe(beforeX + 1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("board-room-canvas")).toBeVisible();
    await expect
      .poll(async () =>
        Number.parseFloat(
          (await note.getAttribute("style"))?.match(
            /left:\s*([\d.]+)px/,
          )?.[1] ?? "NaN",
        ),
      )
      .toBe(beforeX + 1);
  });

  test("Present removes edit chrome and Escape returns to the editor", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);

    await page.getByRole("button", { name: "note item", exact: true }).click();
    await expect(
      page.getByRole("complementary", {
        name: "Selected board item inspector",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Present", exact: true }).click();

    const controller = page.locator('[data-board-room-controller="true"]');
    await expect(controller).toHaveAttribute("data-board-room-mode", "present");
    await expect(
      page.getByRole("application", {
        name: "GA browser acceptance board mood board",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("tablist", { name: "Board sources" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("complementary", {
        name: "Selected board item inspector",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Leave breathing room", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(controller).toHaveAttribute("data-board-room-mode", "edit");
    await expect(
      page.getByRole("application", {
        name: "GA browser acceptance board mood board",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Board sources" }),
    ).toBeVisible();
  });

  test("shows verdicts in Edit and Present, focuses Feedback, and drops feedback across delete/undo (AC2.12/AC2.13)", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);

    const product = page.locator(`[data-board-item-id="${PRODUCT_ID}"]`);
    const note = page.locator(`[data-board-item-id="${NOTE_ID}"]`);
    await expect(
      product.locator('[data-board-verdict="approved"]'),
    ).toHaveText("Approved");
    await expect(
      note.locator('[data-board-verdict="rejected"]'),
    ).toHaveText("Flagged");

    await page.getByRole("button", { name: "Present", exact: true }).click();
    const presentCanvas = page.locator('[data-board-composition-canvas="true"]');
    await expect(
      presentCanvas
        .locator(`[data-board-item-id="${PRODUCT_ID}"]`)
        .locator('[data-board-verdict="approved"]'),
    ).toHaveText("Approved");
    await expect(
      presentCanvas
        .locator(`[data-board-item-id="${NOTE_ID}"]`)
        .locator('[data-board-verdict="rejected"]'),
    ).toHaveText("Flagged");
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    const boardCanvas = page.getByTestId("board-room-canvas");
    const transformBefore = await boardCanvas.getAttribute("style");
    await page.getByRole("tab", { name: "feedback", exact: true }).click();
    const feedbackRail = page.locator(
      `[data-board-feedback-filter="${BOARD_ID}"]`,
    );
    await feedbackRail
      .getByRole("button", { name: "flagged", exact: true })
      .click();
    const flaggedPin = feedbackRail.getByRole("button", {
      name: /Composition note.*Flagged/i,
    });
    await expect(flaggedPin).toBeVisible();
    await expect(
      feedbackRail.getByRole("button", { name: /Heirloom lounge chair/i }),
    ).toHaveCount(0);
    await flaggedPin.click();
    await expect(note).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => boardCanvas.getAttribute("style"))
      .not.toBe(transformBefore);

    const inspector = page.getByRole("complementary", {
      name: "Selected board item inspector",
    });
    const dialogPromise = page.waitForEvent("dialog");
    const deleteClick = inspector
      .getByRole("button", { name: "Delete reference", exact: true })
      .click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain("1 client feedback entry");
    expect(dialog.message()).toContain("permanently remove it");
    await dialog.accept();
    await deleteClick;

    await expect(note).toHaveCount(0);
    await expect
      .poll(
        () =>
          Number(
            psqlScalar(
              `SELECT count(*) FROM public.proposal_board_items WHERE id = '${NOTE_ID}'::uuid`,
            ),
          ),
        { timeout: 15_000 },
      )
      .toBe(0);
    await expect
      .poll(() =>
        Number(
          psqlScalar(
            `SELECT count(*) FROM public.item_feedback WHERE board_item_id = '${NOTE_ID}'::uuid`,
          ),
        ),
      )
      .toBe(0);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(`[data-board-item-id="${NOTE_ID}"]`)).toHaveCount(1);
    await expect
      .poll(
        () =>
          Number(
            psqlScalar(
              `SELECT count(*) FROM public.proposal_board_items WHERE id = '${NOTE_ID}'::uuid`,
            ),
          ),
        { timeout: 15_000 },
      )
      .toBe(1);
    expect(
      psqlScalar(
        `SELECT count(*) FROM public.item_feedback WHERE board_item_id = '${NOTE_ID}'::uuid`,
      ),
    ).toBe("0");
    await expect(
      page
        .locator(`[data-board-item-id="${NOTE_ID}"]`)
        .locator("[data-board-verdict]"),
    ).toHaveCount(0);
  });

  test("keeps the mobile room bounded and disables canvas motion for reduced-motion users", async ({
    authenticatedPage: page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await openBoard(page);

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    const room = page.getByRole("main", {
      name: "GA browser acceptance board mood board room",
    });
    await expect
      .poll(async () => {
        const box = await room.boundingBox();
        return box
          ? [
              Math.round(box.x),
              Math.round(box.y),
              Math.round(box.width),
              Math.round(box.height),
            ]
          : null;
      })
      .toEqual([0, 0, 390, 844]);
    await expect(
      page.getByRole("tablist", { name: "Board sources" }),
    ).toBeVisible();
    await expect(page.getByText("More", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByTestId("board-room-canvas")
          .evaluate((element) => getComputedStyle(element).transitionProperty),
      )
      .toBe("none");

    await page
      .getByRole("button", { name: "palette item", exact: true })
      .click();
    const inspector = page.getByRole("complementary", {
      name: "Selected board item inspector",
    });
    await expect(inspector).toBeVisible();
    await expect
      .poll(async () => {
        const box = await inspector.boundingBox();
        return box
          ? box.x >= 7 && box.x + box.width <= 383 && box.y + box.height <= 837
          : false;
      })
      .toBe(true);
  });

  test("selecting an image pin survives a 401 from the background-removal capability probe", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);
    const assertNoNavigation = armNavigationSentinel(page);

    // Pre-fix, this exact 401 was read as session expiry and hard-reloaded
    // the page via window.location.assign on every pin selection, forever.
    await page.route(
      "**/api/media/boards/*/background-removal-capability",
      (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Invalid or expired authentication token",
          }),
        }),
    );

    const probe = page.waitForResponse(
      (response) =>
        response.url().includes("background-removal-capability") &&
        response.status() === 401,
    );
    const product = page.getByRole("button", {
      name: "product item",
      exact: true,
    });
    // Selecting a product/image/capture pin mounts BoardImageInspectorActions,
    // which fires the capability probe this route intercepts.
    await product.click();
    await probe;

    await expect(product).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("complementary", {
        name: "Selected board item inspector",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("main", {
        name: "GA browser acceptance board mood board room",
      }),
    ).toBeVisible();

    assertNoNavigation();
  });

  test("stray drops that land outside the canvas never escape the board, in Edit or Present", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);
    const assertNoNavigation = armNavigationSentinel(page);

    await page.getByRole("tab", { name: "palettes", exact: true }).click();
    const source = page.getByRole("button", { name: /GA rail palette/i });
    await expect(source).toBeVisible();
    const header = page.locator("header");
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    const overHeader = {
      x: headerBox!.x + headerBox!.width / 2,
      y: headerBox!.y + headerBox!.height / 2,
    };

    // Pre-fix, a drop the canvas never claims (defaultPrevented stays false)
    // fell through to the browser's own default action for the dragged
    // resource, off the board and into a fresh navigation.
    await mouseDragRailSourceTo(page, source, overHeader);
    await expect(page.locator("[data-board-item-id]")).toHaveCount(6);

    const room = page.getByRole("main", {
      name: "GA browser acceptance board mood board room",
    });
    await dispatchFileDrop(page, room);
    await expect(page.locator("[data-board-item-id]")).toHaveCount(6);

    // Present mode unmounts the add-rail and the edit canvas outright, so
    // the room's only remaining chrome is the read-only composition canvas —
    // which, per the fix, "prevents nothing" on drop itself; window-level
    // containment has to hold with neither rail nor edit canvas in the tree.
    await page.getByRole("button", { name: "Present", exact: true }).click();
    const presentCanvas = page.locator(
      '[data-board-composition-canvas="true"]',
    );
    await expect(presentCanvas).toBeVisible();
    await dispatchFileDrop(page, room);
    await expect(presentCanvas.locator("[data-board-item-id]")).toHaveCount(6);

    assertNoNavigation();
  });

  test("drags the resize handle to change and persist an item's width", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);
    const assertNoNavigation = armNavigationSentinel(page);

    const product = page.getByRole("button", {
      name: "product item",
      exact: true,
    });
    await product.click();
    await expect(product).toHaveAttribute("aria-pressed", "true");

    const handle = page.getByRole("button", { name: "Resize se", exact: true });
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const widthBefore = Number(boardItemScalar("width::text", PRODUCT_ID));

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 40, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(() => Number(boardItemScalar("width::text", PRODUCT_ID)), {
        timeout: 15_000,
      })
      .not.toBe(widthBefore);
    const widthAfterDrag = Number(boardItemScalar("width::text", PRODUCT_ID));
    assertNoNavigation();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("board-room-canvas")).toBeVisible();
    expect(Number(boardItemScalar("width::text", PRODUCT_ID))).toBe(
      widthAfterDrag,
    );
  });

  test("drags the rotate handle to change and persist an item's rotation", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);
    const assertNoNavigation = armNavigationSentinel(page);

    const product = page.getByRole("button", {
      name: "product item",
      exact: true,
    });
    await product.click();
    await expect(product).toHaveAttribute("aria-pressed", "true");

    const handle = page.getByRole("button", { name: "Rotate item", exact: true });
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const rotationBefore = Number(
      boardItemScalar("rotation::text", PRODUCT_ID),
    );

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(() => Number(boardItemScalar("rotation::text", PRODUCT_ID)), {
        timeout: 15_000,
      })
      .not.toBe(rotationBefore);
    const rotationAfterDrag = Number(
      boardItemScalar("rotation::text", PRODUCT_ID),
    );
    assertNoNavigation();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("board-room-canvas")).toBeVisible();
    expect(Number(boardItemScalar("rotation::text", PRODUCT_ID))).toBe(
      rotationAfterDrag,
    );
  });

  // W2c: fixed the aria-pressed multi-select regression — the shift-click
  // branch in BoardRoomCanvas read the `selectedItemIds` prop directly, which
  // could still carry the pre-first-click value if the parent hadn't
  // re-rendered yet. It now reads a ref the component's own selection setter
  // updates eagerly. See BoardRoomCanvas.test.tsx for the unit-level
  // regression coverage.
  test("dragging a multi-selection moves every selected item by the same delta", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);
    const assertNoNavigation = armNavigationSentinel(page);

    const product = page.getByRole("button", {
      name: "product item",
      exact: true,
    });
    const note = page.getByRole("button", { name: "note item", exact: true });
    await product.click();
    await note.click({ modifiers: ["Shift"] });
    await expect(product).toHaveAttribute("aria-pressed", "true");
    await expect(note).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("multi-selection-bounds")).toBeVisible();

    const productBefore = {
      x: Number(boardItemScalar("x::text", PRODUCT_ID)),
      y: Number(boardItemScalar("y::text", PRODUCT_ID)),
    };
    const noteBefore = {
      x: Number(boardItemScalar("x::text", NOTE_ID)),
      y: Number(boardItemScalar("y::text", NOTE_ID)),
    };

    // The multi-selection-bounds overlay itself is pointer-events-none (it's
    // a decorative outline); grabbing any already-selected pin without Shift
    // drags the whole selection together — this starts from inside that
    // bounds rectangle, on the product pin.
    const box = await product.boundingBox();
    expect(box).not.toBeNull();
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 50, start.y + 35, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(() => Number(boardItemScalar("x::text", PRODUCT_ID)), {
        timeout: 15_000,
      })
      .not.toBe(productBefore.x);

    const productAfter = {
      x: Number(boardItemScalar("x::text", PRODUCT_ID)),
      y: Number(boardItemScalar("y::text", PRODUCT_ID)),
    };
    const noteAfter = {
      x: Number(boardItemScalar("x::text", NOTE_ID)),
      y: Number(boardItemScalar("y::text", NOTE_ID)),
    };
    const productDelta = {
      x: productAfter.x - productBefore.x,
      y: productAfter.y - productBefore.y,
    };
    const noteDelta = {
      x: noteAfter.x - noteBefore.x,
      y: noteAfter.y - noteBefore.y,
    };
    expect(noteDelta).toEqual(productDelta);
    assertNoNavigation();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("board-room-canvas")).toBeVisible();
    expect({
      x: Number(boardItemScalar("x::text", PRODUCT_ID)),
      y: Number(boardItemScalar("y::text", PRODUCT_ID)),
    }).toEqual(productAfter);
    expect({
      x: Number(boardItemScalar("x::text", NOTE_ID)),
      y: Number(boardItemScalar("y::text", NOTE_ID)),
    }).toEqual(noteAfter);
  });

  test("Escape once arms an exit guard, Escape twice leaves the board", async ({
    authenticatedPage: page,
  }) => {
    await openBoard(page);

    const room = page.getByRole("main", {
      name: "GA browser acceptance board mood board room",
    });

    // Empty selection: first Escape only arms the guard, it must not exit.
    await page.keyboard.press("Escape");
    await expect(
      page.getByText("Press Escape again to leave the board"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/board\//, { timeout: 15_000 });
    await expect(room).toBeVisible();

    // Second Escape, thrown quickly after the first, actually leaves — the
    // room resolves its exit target from openBoard's `from=%2Fdesk`.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/desk/, { timeout: 15_000 });
  });
});
