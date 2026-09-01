import { test, expect, type AuthenticatedPage } from "../fixtures/auth";
import { psqlRow, psqlRun, psqlScalar } from "../helpers/psql";

/**
 * The GA acceptance suite (mood-board-ga.spec.ts) drives a PROPOSAL-owned
 * board. Every project-owned write instead goes through
 * `apply_board_room_state`, whose validation is far stricter than the
 * proposal leg's plain table writes — which is why three P1 defects
 * (blank create, group drag, duplicate) reached production unseen. This
 * sibling suite owns the PROJECT leg.
 */

const PROJECT_ID = "b0000000-0000-0000-0000-0000000000d1";
const BOARD_ID = "e2e00000-0000-4000-8000-000000000101";
// Pin accessible names (CI-13) — a pin announces its real name, not its type.
const PRODUCT_PIN_NAME = "Heirloom lounge chair, product";
const NOTE_PIN_NAME = "Project leg note, note";
const PRODUCT_ID = "e2e00000-0000-4000-8000-000000000111";
const NOTE_ID = "e2e00000-0000-4000-8000-000000000112";

function seedProjectBoard(): void {
  psqlRun(`
BEGIN;
DELETE FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid;

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  '${BOARD_ID}'::uuid,
  NULL,
  '${PROJECT_ID}'::uuid,
  'Project leg acceptance board',
  800,
  650,
  '#F7F1E8',
  '[{"id":"foundation","name":"Foundation","color":"#9B7653"}]'::jsonb,
  'active',
  999
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, locked,
  image_url, content, data
) VALUES
  -- No image_url: guard_proposal_board_item_media_reference refuses any
  -- reference a project board's studio does not own, data: URIs included.
  -- The product is rotated, so it is the right-most pin by a fraction of a
  -- pixel and any canvas auto-grow derived from its bounds is fractional —
  -- the shape that broke the project leg in production.
  (
    '${PRODUCT_ID}'::uuid, '${BOARD_ID}'::uuid, 'product',
    330, 60, 220, 220, 1, 30, false, NULL, NULL,
    '{"name":"Heirloom lounge chair","section_id":"foundation"}'::jsonb
  ),
  (
    '${NOTE_ID}'::uuid, '${BOARD_ID}'::uuid, 'note',
    360, 360, 230, 160, 2, 0, false, NULL, 'Project leg note', '{}'::jsonb
  );
COMMIT;
`);
}

function deleteProjectBoard(): void {
  psqlRun(
    `DELETE FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid OR (project_id = '${PROJECT_ID}'::uuid AND name LIKE 'Board %')`,
  );
}

function boardItemScalar(selectExpression: string, itemId: string): string {
  return psqlScalar(
    `SELECT ${selectExpression} FROM public.proposal_board_items WHERE board_id = '${BOARD_ID}'::uuid AND id = '${itemId}'::uuid`,
  );
}

function boardItemCount(): number {
  return Number(
    psqlScalar(
      `SELECT count(*) FROM public.proposal_board_items WHERE board_id = '${BOARD_ID}'::uuid`,
    ),
  );
}

/**
 * Resolves a share token as the `anon` role — the exact grant a guest holds.
 * Returns psql's rendering of the boolean: 'true' / 'false'.
 */
function resolveAsGuest(token: string): string {
  return psqlScalar(
    `BEGIN; SET LOCAL ROLE anon; SELECT (public.resolve_board_share('${token}') IS NOT NULL)::text; COMMIT;`,
  );
}

function guestResolvedBoardName(token: string): string {
  return psqlScalar(
    `BEGIN; SET LOCAL ROLE anon; SELECT public.resolve_board_share('${token}') #>> '{board,name}'; COMMIT;`,
  );
}

/** One key of the resolve DTO, read through the guest's own `anon` grant. */
function guestResolvedField(token: string, expression: string): string {
  return psqlScalar(
    `BEGIN; SET LOCAL ROLE anon; SELECT ${expression.replace(/PAYLOAD/g, `public.resolve_board_share('${token}')`)}; COMMIT;`,
  );
}

/**
 * A guest tap, at the exact grant the guest page's browser call holds: the
 * `anon` role and nothing else. Returns 'ok' or 'refused'.
 */
function guestReaction(
  token: string,
  boardItemId: string,
  verdict: string,
  body: string | null,
): string {
  const bodyLiteral = body === null ? "NULL" : `'${body.replace(/'/g, "''")}'`;
  try {
    psqlRun(
      `BEGIN; SET LOCAL ROLE anon; SELECT public.submit_board_share_reaction('${token}', '${boardItemId}'::uuid, '${verdict}', ${bodyLiteral}); COMMIT;`,
    );
    return "ok";
  } catch {
    return "refused";
  }
}

async function openProjectBoard(page: AuthenticatedPage): Promise<void> {
  await page.goto(`/board/${BOARD_ID}?from=%2Fdesk&source=recent_boards`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("main", {
      name: "Project leg acceptance board mood board room",
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("board-room-canvas")).toBeVisible();
  await expect(page.locator("[data-board-item-id]")).toHaveCount(2);
}

test.describe.configure({ mode: "serial" });

test.describe("Project-owned board save path", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic fixture owns one shared project board row.",
  );

  test.beforeEach(() => {
    seedProjectBoard();
  });

  test.afterAll(() => {
    deleteProjectBoard();
  });

  test("dragging a multi-selection persists the same delta for every selected pin (AC1.11)", async ({
    authenticatedPage: page,
  }) => {
    await openProjectBoard(page);

    const product = page.getByRole("button", {
      name: PRODUCT_PIN_NAME,
      exact: true,
    });
    const note = page.getByRole("button", { name: NOTE_PIN_NAME, exact: true });
    // Either order works now. The inline note editor opens on double-click
    // only (CI-24), so a single click on a note no longer mounts a textarea
    // that steals focus and collapses the selection back to one pin.
    await product.click();
    await note.click({ modifiers: ["Shift"] });
    await expect(product).toHaveAttribute("aria-pressed", "true");
    await expect(note).toHaveAttribute("aria-pressed", "true");
    // The bounds overlay is the multi-selection's own tell — it renders only
    // once two or more pins are selected together.
    await expect(page.getByTestId("multi-selection-bounds")).toBeVisible();

    const productBefore = {
      x: Number(boardItemScalar("x::text", PRODUCT_ID)),
      y: Number(boardItemScalar("y::text", PRODUCT_ID)),
    };
    const noteBefore = {
      x: Number(boardItemScalar("x::text", NOTE_ID)),
      y: Number(boardItemScalar("y::text", NOTE_ID)),
    };

    const box = await product.boundingBox();
    expect(box).not.toBeNull();
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    // Far enough right that the rotated product overruns the canvas and the
    // room's auto-grow fires — the gesture that used to send a fractional
    // canvasWidth and earn `invalid board fields`.
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 260, start.y + 40, { steps: 12 });
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
    expect({
      x: noteAfter.x - noteBefore.x,
      y: noteAfter.y - noteBefore.y,
    }).toEqual({
      x: productAfter.x - productBefore.x,
      y: productAfter.y - productBefore.y,
    });

    // No revert banner: the whole point is that the project leg's RPC
    // accepted the group write rather than 400ing and rolling it back.
    await expect(
      page.getByText(/could not be saved/i),
    ).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("board-room-canvas")).toBeVisible();
    expect({
      x: Number(boardItemScalar("x::text", PRODUCT_ID)),
      y: Number(boardItemScalar("y::text", PRODUCT_ID)),
    }).toEqual(productAfter);
  });

  test("Cmd+D duplicates a pin and the copy survives a reload", async ({
    authenticatedPage: page,
  }) => {
    await openProjectBoard(page);
    expect(boardItemCount()).toBe(2);

    // The product pin, not the note: clicking a note focuses its inline
    // textarea, and the room's shortcut handler ignores keys typed into an
    // editable target.
    const product = page.getByRole("button", {
      name: PRODUCT_PIN_NAME,
      exact: true,
    });
    await product.click();
    await expect(
      page.getByLabel("Selected board item inspector"),
    ).toBeVisible();

    await page.keyboard.press("Meta+d");

    await expect.poll(() => boardItemCount(), { timeout: 15_000 }).toBe(3);
    await expect(page.getByText(/could not be saved/i)).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("board-room-canvas")).toBeVisible();
    await expect(page.locator("[data-board-item-id]")).toHaveCount(3);
    expect(boardItemCount()).toBe(3);
  });

  test("creates a blank board from the New-board picker on a project owner (IA-10)", async ({
    authenticatedPage: page,
  }) => {
    psqlRun(
      `DELETE FROM public.proposal_boards WHERE project_id = '${PROJECT_ID}'::uuid AND name LIKE 'Board %'`,
    );

    await page.goto(`/doc/${PROJECT_ID}/boards`, {
      waitUntil: "domcontentloaded",
    });
    // The project boards page mounts the builder behind its own act.
    await page.getByRole("button", { name: "Start a board" }).click();
    await page
      .getByRole("button", { name: /new board|start the first mood board/i })
      .first()
      .click();

    await expect(
      page.getByRole("heading", { name: "Start a mood board" }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Blank board/ }).click();

    await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByTestId("board-room-canvas")).toBeVisible({
      timeout: 15_000,
    });

    expect(
      Number(
        psqlScalar(
          `SELECT count(*) FROM public.proposal_boards WHERE project_id = '${PROJECT_ID}'::uuid AND proposal_id IS NULL AND name LIKE 'Board %'`,
        ),
      ),
    ).toBeGreaterThan(0);
  });

  test("mints and revokes a guest link from a project board (D3)", async ({
    authenticatedPage: page,
  }) => {
    psqlRun(
      `DELETE FROM public.document_shares WHERE board_id = '${BOARD_ID}'::uuid`,
    );
    await openProjectBoard(page);

    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Share Project leg acceptance board",
      }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/^Label/).fill("Client preview");
    await page
      .getByRole("button", { name: "Create and copy link" })
      .click();

    const linkField = page.getByLabel("Board share link");
    await expect(linkField).toBeVisible({ timeout: 15_000 });
    const shareUrl = await linkField.inputValue();
    const token = shareUrl.match(/\/share\/([0-9a-f]{64})/)?.[1];
    expect(token, `minted link should carry a token: ${shareUrl}`).toBeTruthy();

    await expect
      .poll(() =>
        Number(
          psqlScalar(
            `SELECT count(*) FROM public.document_shares WHERE board_id = '${BOARD_ID}'::uuid AND status = 'active'`,
          ),
        ),
      )
      .toBe(1);

    // The guest leg, from an identity that has never signed in. The link's own
    // host is the client portal on :3002, which this suite's webServer does not
    // start — so the fresh context proves it holds no designer session, and the
    // token is then resolved through the same `anon`-granted RPC the guest page
    // calls, which is where the actual authorization lives.
    const guestContext = await page.context().browser()!.newContext();
    try {
      const guestPage = await guestContext.newPage();
      await guestPage.goto("/desk", { waitUntil: "domcontentloaded" });
      await expect(guestPage).toHaveURL(/\/auth\/signin/, { timeout: 20_000 });

      expect(resolveAsGuest(token!)).toBe("true");
      expect(guestResolvedBoardName(token!)).toBe(
        "Project leg acceptance board",
      );
    } finally {
      await guestContext.close();
    }

    await page.getByRole("button", { name: "Revoke" }).first().click();
    await expect
      .poll(() =>
        Number(
          psqlScalar(
            `SELECT count(*) FROM public.document_shares WHERE board_id = '${BOARD_ID}'::uuid AND status = 'active'`,
          ),
        ),
      )
      .toBe(0);

    // A revoked token must go dead for the guest, not merely disappear from the
    // designer's list.
    expect(resolveAsGuest(token!)).toBe("false");
  });

  /**
   * The guest half of this pair runs at the `anon` grant rather than in the
   * client portal's own page, for the reason the D3 test above already
   * documents: the link's host is :3002, which this suite's webServer does not
   * start. The page-level check that IS available here is the designer's — the
   * verdict has to reach the room and read as a guest's, which is what the
   * reload below asserts. The client-portal render itself is covered by that
   * app's own unit suite (share/[token]/__tests__/board-reactions.test.tsx).
   */
  test("an opted-in link takes a guest reaction and the room shows it as a guest's (Path B)", async ({
    authenticatedPage: page,
  }) => {
    psqlRun(
      `DELETE FROM public.item_feedback WHERE board_item_id IN (SELECT id FROM public.proposal_board_items WHERE board_id = '${BOARD_ID}'::uuid);
       DELETE FROM public.document_shares WHERE board_id = '${BOARD_ID}'::uuid`,
    );
    await openProjectBoard(page);

    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Share Project leg acceptance board",
      }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/^Label/).fill("Reaction link");
    await page.getByRole("checkbox", { name: /Allow reactions/ }).check();
    await page.getByRole("button", { name: "Create and copy link" }).click();

    const linkField = page.getByLabel("Board share link");
    await expect(linkField).toBeVisible({ timeout: 15_000 });
    const token = (await linkField.inputValue()).match(
      /\/share\/([0-9a-f]{64})/,
    )?.[1];
    expect(token).toBeTruthy();

    await expect
      .poll(() =>
        psqlScalar(
          `SELECT board_reactions_enabled::text FROM public.document_shares WHERE board_id = '${BOARD_ID}'::uuid AND status = 'active'`,
        ),
      )
      .toBe("true");

    // The capability is in the resolve DTO the guest page reads.
    expect(guestResolvedField(token!, "PAYLOAD ->> 'reactionsEnabled'")).toBe(
      "true",
    );

    expect(guestReaction(token!, PRODUCT_ID, "approved", "Love this one")).toBe(
      "ok",
    );

    // Server-side truth: one row, attributed to the share and to no user.
    expect(
      psqlRow(
        `SELECT verdict, body, (client_id IS NULL)::text, (guest_share_id IS NOT NULL)::text
           FROM public.item_feedback WHERE board_item_id = '${PRODUCT_ID}'::uuid`,
      ),
    ).toEqual(["approved", "Love this one", "true", "true"]);

    // Re-tapping updates rather than stacking.
    expect(guestReaction(token!, PRODUCT_ID, "rejected", null)).toBe("ok");
    expect(
      psqlScalar(
        `SELECT count(*)::text FROM public.item_feedback WHERE board_item_id = '${PRODUCT_ID}'::uuid`,
      ),
    ).toBe("1");

    // And the link plays its own reactions back on the next resolve.
    expect(
      guestResolvedField(token!, "PAYLOAD #>> '{reactions,0,verdict}'"),
    ).toBe("rejected");

    // The designer's page-level check: the verdict lands on the pin, marked.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("board-room-canvas")).toBeVisible();
    await expect(
      page.locator('[data-verdict-source="guest"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-board-verdict="rejected"]').first(),
    ).toBeVisible();

    psqlRun(
      `DELETE FROM public.item_feedback WHERE board_item_id = '${PRODUCT_ID}'::uuid;
       DELETE FROM public.document_shares WHERE board_id = '${BOARD_ID}'::uuid`,
    );
  });

  test("a link minted without the opt-in offers no reaction capability at all", async ({
    authenticatedPage: page,
  }) => {
    psqlRun(
      `DELETE FROM public.document_shares WHERE board_id = '${BOARD_ID}'::uuid`,
    );
    await openProjectBoard(page);

    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Share Project leg acceptance board",
      }),
    ).toBeVisible({ timeout: 15_000 });

    // The toggle is OFF by default — a designer has to ask for the capability.
    await expect(
      page.getByRole("checkbox", { name: /Allow reactions/ }),
    ).not.toBeChecked();
    await page.getByRole("button", { name: "Create and copy link" }).click();

    const linkField = page.getByLabel("Board share link");
    await expect(linkField).toBeVisible({ timeout: 15_000 });
    const token = (await linkField.inputValue()).match(
      /\/share\/([0-9a-f]{64})/,
    )?.[1];
    expect(token).toBeTruthy();

    // The guest page decides what to render from this DTO. There is no
    // `reactions` key to hang an affordance on, and the flag says so outright.
    expect(guestResolvedField(token!, "PAYLOAD ->> 'reactionsEnabled'")).toBe(
      "false",
    );
    expect(guestResolvedField(token!, "(PAYLOAD ? 'reactions')::text")).toBe(
      "false",
    );

    // And the write path refuses even a caller that skips the page entirely.
    expect(guestReaction(token!, PRODUCT_ID, "approved", null)).toBe("refused");
    expect(
      psqlScalar(
        `SELECT count(*)::text FROM public.item_feedback WHERE board_item_id = '${PRODUCT_ID}'::uuid`,
      ),
    ).toBe("0");

    psqlRun(
      `DELETE FROM public.document_shares WHERE board_id = '${BOARD_ID}'::uuid`,
    );
  });

  test("a failed save reads in plain words, retries, and never traps the reader", async ({
    authenticatedPage: page,
  }) => {
    await openProjectBoard(page);

    const rpc = "**/rest/v1/rpc/apply_board_room_state";
    const refuse = async (route: Parameters<Parameters<typeof page.route>[1]>[0]) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "23514",
          message: "invalid board item",
          details: null,
          hint: null,
        }),
      });
    };
    await page.route(rpc, refuse);

    const product = page.getByRole("button", {
      name: PRODUCT_PIN_NAME,
      exact: true,
    });
    await product.click();
    await page.keyboard.press("ArrowRight");

    // Next mounts its own empty role="alert" route announcer; scope to ours.
    const banner = page.getByRole("alert").filter({ hasText: "reverted" });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    // D7 — the backend's own words never reach the reader.
    await expect(banner).toContainText(
      "That change was reverted — the board could not accept that layout.",
    );
    await expect(banner).not.toContainText("invalid board item");
    await expect(banner).not.toContainText("apply_board_room_state");

    // D8 — the retry is offered, and it works once the write can land again.
    await page.unroute(rpc, refuse);
    await page.getByRole("button", { name: /try again/i }).click();
    await expect(banner).toBeHidden({ timeout: 15_000 });

    // D8 — a still-standing failure must not hold the reader in the room.
    await page.route(rpc, refuse);
    // Re-focus the pin: "Try again" took focus, and arrow keys only nudge
    // while the board itself holds it.
    await product.click();
    await page.keyboard.press("ArrowDown");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/desk/, { timeout: 20_000 });
  });
});
