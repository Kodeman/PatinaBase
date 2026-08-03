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
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function seedBoard(): void {
  psqlRun(`
BEGIN;
DELETE FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid;

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
    '${PIXEL}',
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
    '${PIXEL}',
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
    '${PIXEL}',
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
    '${PIXEL}',
    NULL,
    '{"name":"North wall scan","room_type":"Living room","section_id":"details"}'::jsonb
  );
COMMIT;
`);
}

function deleteBoard(): void {
  psqlRun(`DELETE FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid;`);
}

function boardItemScalar(selectExpression: string, itemId: string): string {
  return psqlScalar(
    `SELECT ${selectExpression} FROM public.proposal_board_items WHERE board_id = '${BOARD_ID}'::uuid AND id = '${itemId}'::uuid`,
  );
}

async function openBoard(page: AuthenticatedPage): Promise<void> {
  await page.goto(`/board/${BOARD_ID}?from=%2Fdesk&source=recent_boards`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("main", {
      name: "GA browser acceptance board mood board room",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("board-room-canvas")).toBeVisible();
  await expect(page.locator("[data-board-item-id]")).toHaveCount(6);
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
    await expect(page.getByText("Foundation", { exact: true })).toBeVisible();
    await expect(page.getByText("Details", { exact: true })).toBeVisible();

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
    await note.click();
    await note.press("ArrowRight");

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
});
