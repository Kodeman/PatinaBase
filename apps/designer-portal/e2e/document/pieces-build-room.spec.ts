/**
 * US-21 T-59 · The Build room, S1–S8 end to end (direction.md §5, SPEC §6).
 *
 * Every scenario starts from the same job: pieces-fixture.sql (Whole Home
 * Renovation, SPEC §4, "before"), re-seeded through e2e/helpers/psql.ts
 * before each test, and each one ends on its return path to the overview.
 * The scenarios run at 1440 and at 390, in file order, one at a time: they
 * share one project, so they never run side by side.
 *
 * Timing is logged per scenario (an annotation and a `[timing]` line), never
 * asserted.
 *
 * Not driven here, and why: a release, a PO, receiving and an invoice need a
 * client and an executed design-services origin, and SPEC §4.1's job has no
 * client. Those paths are held by the SQL suite (supabase/tests/commercial/
 * pieces_w4_review_fixes_test.sql, pieces_w5_review_fixes_test.sql,
 * supabase/tests/receiving/pieces_receipt_placements_test.sql). Here the
 * Release lens's no-client refusal and the maker-PO refusal stand for them.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlAsUser, psqlRun, psqlScalar } from '../helpers/psql';

test.describe.configure({ mode: 'default' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'One shared fixture project; the walk runs in Chromium (T-60 walks WebKit).',
);

const FIXTURE_SQL = readFileSync(path.join(__dirname, 'pieces-fixture.sql'), 'utf8');

const LEAH = 'a0000000-0000-0000-0000-000000000004';
const JOB = 'e6590000-0000-4000-8000-000000000001';
const ROOM = {
  hall: 'e6590000-0000-4000-8000-000000000011',
  living: 'e6590000-0000-4000-8000-000000000012',
  dining: 'e6590000-0000-4000-8000-000000000013',
  kitchen: 'e6590000-0000-4000-8000-000000000014',
  bath: 'e6590000-0000-4000-8000-000000000015',
  sunroom: 'e6590000-0000-4000-8000-000000000016',
  bedroom: 'e6590000-0000-4000-8000-000000000017',
} as const;
const WALLPAPER = 'e6590000-0000-4000-8000-000000000103';
const WALLPAPER_DUPLICATE = 'e6590000-0000-4000-8000-000000000104';
const PHILLIP_JEFFRIES = 'e6590000-0000-4000-8000-000000000201';

/** SPEC §4.4 "before": counts include placed lines; the labor line counts as a line. */
const RAIL_COUNTS: Array<[string, number]> = [
  ['Hall', 4],
  ['Living Room', 6],
  ['Dining', 4],
  ['Kitchen', 4],
  ['Primary Bath', 8],
  ['Sunroom', 2],
  ['Bedroom', 4],
];

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900, phone: false },
  { name: '390', width: 390, height: 844, phone: true },
] as const;

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function lineId(name: string): string {
  return psqlScalar(
    `SELECT id FROM public.project_ffe_items WHERE project_id = '${JOB}' AND name = ${sql(name)} ORDER BY created_at LIMIT 1`,
  );
}

function laborLineId(): string {
  return psqlScalar(
    `SELECT id FROM public.project_ffe_items WHERE project_id = '${JOB}' AND line_kind = 'labor' LIMIT 1`,
  );
}

/** The refusal an RPC raises as Leah, or '' when it goes through (rolled back either way). */
function refusalAsLeah(statement: string): string {
  try {
    psqlAsUser(LEAH, `${statement};\nROLLBACK;\nBEGIN;`);
    return '';
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? (error as Error).message);
    return stderr.match(/ERROR:\s+(.+)/)?.[1]?.trim() ?? stderr;
  }
}

async function timed(info: TestInfo, label: string, run: () => Promise<void>): Promise<void> {
  const started = Date.now();
  try {
    await run();
  } finally {
    const ms = Date.now() - started;
    info.annotations.push({ type: 'timing', description: `${label}: ${ms} ms` });
    // Logged, not asserted (T-59 acceptance).
    console.log(`[timing] ${label}: ${ms} ms`);
  }
}

function piecesUrl(lens: string, room?: string): string {
  return `/doc/${JOB}/pieces?lens=${lens}${room ? `&room=${room}` : ''}`;
}

async function openSheet(page: Page, lens: string, room?: string): Promise<void> {
  await page.goto(piecesUrl(lens, room), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('build-room')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('group', { name: 'Lens' }).getByRole('button', { pressed: true })).toBeVisible();
}

/** The return path lands on the overview at the room's row, marked as the one you came from. */
async function expectBackAtRoom(page: Page, roomId: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/doc/${JOB}#pieces-room-${roomId}$`), { timeout: 30_000 });
  const row = page.locator(`[data-pieces-room="${roomId}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute('data-returned', 'true');
}

function roughSection(page: Page, placeId: string) {
  return page.locator(`[data-rough-in-room="${placeId}"]`);
}

function lineRow(page: Page, id: string) {
  return page.locator(`[data-line-id="${id}"]`);
}

async function openRowMenu(page: Page, id: string, name: string) {
  await lineRow(page, id).first().getByRole('button', { name: `Acts for ${name}` }).click();
  return page.getByRole('menu', { name: `Acts for ${name}` });
}

for (const vp of VIEWPORTS) {
  test.describe(`The Build room at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    test.beforeEach(() => {
      psqlRun(FIXTURE_SQL);
    });

    test(`S1 four Enters, and Esc home (a2, a13) @${vp.name}`, async ({ authenticatedPage: page }, info) => {
      const names = ['Sconces, pair', 'Drapery panels, linen', 'Rug, 9 × 12', 'Side table'];
      await timed(info, `S1 @${vp.name}`, async () => {
        await openSheet(page, 'rough', ROOM.living);
        await expect(page.getByText('Rough in · Name it, count it, place it.')).toBeVisible();

        // The rail (1440) or the room picker (390) counts placed lines in each room.
        if (vp.phone) {
          await page.getByRole('button', { name: 'Living Room ▾' }).click();
          const picker = page.getByRole('navigation', { name: 'Choose a room' });
          for (const [room, count] of RAIL_COUNTS)
            await expect(picker.getByRole('link', { name: `${room} ${count}`, exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Living Room ▾' }).click();
        } else {
          const rail = page.getByRole('navigation', { name: 'Rooms' });
          for (const [room, count] of RAIL_COUNTS)
            await expect(rail.getByRole('link', { name: `${room} ${count}`, exact: true })).toBeVisible();
          await expect(page.getByTestId('build-room-place')).toHaveText('Living Room · 6 lines · 5 placeholders');
        }

        const living = roughSection(page, ROOM.living);
        const entry = living.getByRole('textbox', { name: 'New line in Living Room' });
        await entry.click();
        for (const name of names) {
          await entry.fill(name);
          if (vp.phone) await living.getByRole('button', { name: 'Add to Living Room' }).click();
          else await entry.press('Enter');
          // Enter adds and starts the next line: the entry empties and keeps the caret.
          await expect(entry).toHaveValue('');
          await expect(entry).toBeFocused();
        }
        if (vp.phone) await living.getByRole('button', { name: 'Done adding, Living Room' }).click();

        await expect
          .poll(() =>
            psqlScalar(`
              SELECT count(*) FROM public.project_ffe_items
               WHERE project_id = '${JOB}' AND project_room_id = '${ROOM.living}'
                 AND removed_at IS NULL AND public.ffe_line_stage(project_ffe_items) = 'placeholder'
                 AND name IN (${names.map(sql).join(', ')})`),
          )
          .toBe('4');
        for (const name of names)
          await expect(living.locator('input[aria-label^="Line "]').and(page.locator(`[value="${name}"]`))).toHaveCount(1);
        if (!vp.phone)
          await expect(page.getByRole('navigation', { name: 'Rooms' }).getByRole('link', { name: 'Living Room 10', exact: true })).toBeVisible();

        // Return path: Esc from the empty entry row.
        await entry.click();
        await entry.press('Escape');
        await expectBackAtRoom(page, ROOM.living);
      });
    });

    test(`S2 the oak floor in four rooms (a5) @${vp.name}`, async ({ authenticatedPage: page }, info) => {
      const floor = lineId('White oak floor, satin Bona finish');
      await timed(info, `S2 @${vp.name}`, async () => {
        await openSheet(page, 'spec', ROOM.hall);
        const spec = page.getByTestId('spec-lens');
        await expect(spec).toBeVisible();

        // One row in Hall, printed with the rooms it is also in and Hall's share.
        const alsoIn = spec.getByTestId('also-in-line').filter({ hasText: /living room/i }).first();
        await expect(alsoIn).toContainText(/also in living room · dining · kitchen/i);
        await expect(alsoIn).toContainText(/120 sq ft here/i);

        await spec.getByRole('list', { name: 'Lines' }).getByText('White oak floor, satin Bona finish').first().click();
        const pane = page.getByTestId('spec-fields-pane');
        await expect(pane).toHaveAttribute('aria-label', /White oak floor/);
        const chips = pane.getByTestId('placement-chips');
        for (const chip of ['Hall · 120 sq ft', 'Living Room · 320 sq ft', 'Dining · 180 sq ft', 'Kitchen · 210 sq ft'])
          await expect(chips).toContainText(chip);
        // The Spec lens prints no money (Q7, T-55b).
        await expect(spec).not.toContainText('$');

        // One line, four placements, on the server.
        expect(
          psqlScalar(`SELECT string_agg(r.name || ':' || trim_scale(p.quantity::numeric), ',' ORDER BY r.sort_order)
                        FROM public.project_ffe_placements p JOIN public.project_rooms r ON r.id = p.project_room_id
                       WHERE p.ffe_item_id = '${floor}'`),
        ).toBe('Hall:120,Living Room:320,Dining:180,Kitchen:210');

        // The working budget splits a placed line by share (00757): F1's $9,545
        // goes 138,000 · 368,000 · 207,000 · 241,500 cents, T1's $1,904 by its
        // four shares, and D1 sits whole in Dining.
        psqlAsUser(LEAH, `SELECT public.derive_working_budget_draft('${JOB}');`);
        expect(
          psqlScalar(`SELECT string_agg(l.room_name || ':' || l.target_cents, ',' ORDER BY l.sort_order)
                        FROM public.project_budget_lines l
                        JOIN public.project_budget_versions v ON v.id = l.budget_version_id
                       WHERE v.project_id = '${JOB}' AND v.status = 'draft' AND l.category = 'Uncategorized'
                         AND l.room_name <> 'Bedroom'`),
        ).toBe('Hall:162480,Living Room:368000,Dining:887000,Kitchen:257820,Primary Bath:48960,Sunroom:100640');

        // Return path: ← the job.
        await page.getByRole('link', { name: 'Back to Whole Home Renovation' }).click();
        await expectBackAtRoom(page, ROOM.hall);
      });
    });

    test(`S3 fill a placeholder, and group the shower (a6) @${vp.name}`, async ({ authenticatedPage: page }, info) => {
      const knobs = lineId('Hardware, 2 knobs for custom cabinet');
      const shower = ['Valve and trim', 'Shower head', 'Hand shower', 'Linear drain', 'Niche tile', 'Glass panel'];
      await timed(info, `S3 @${vp.name}`, async () => {
        await openSheet(page, 'rough', ROOM.living);
        const menu = await openRowMenu(page, knobs, 'Hardware, 2 knobs for custom cabinet');
        await menu.getByRole('menuitem', { name: 'Fill with a product' }).click();
        const search = page.getByRole('combobox', { name: 'Fill Hardware, 2 knobs for custom cabinet with a product' });
        await search.fill('knob');
        const results = page.getByRole('listbox', { name: 'Library results' });
        await expect(results.getByRole('option', { name: /Rejuvenation Mission knob/ })).toBeVisible({ timeout: 15_000 });
        await results.getByRole('option', { name: /Emtek Ribbon & Reed knob/ }).click();

        // The need survives the fill (D2); the line now carries the product.
        await expect
          .poll(() =>
            psqlScalar(`SELECT f.product_id || '|' || t.need_label FROM public.project_ffe_items f
                          JOIN public.project_ffe_selection_threads t ON t.id = f.selection_thread_id
                         WHERE f.id = '${knobs}'`),
          )
          .toBe('e6590000-0000-4000-8000-000000000101|Hardware, 2 knobs for custom cabinet');
        const row = lineRow(page, knobs).first();
        await expect(row.locator('input[aria-label^="Line "]')).toHaveValue('Hardware, 2 knobs for custom cabinet');
        await expect(row.locator('.stamp').last()).not.toHaveText(/placeholder/i);

        // The shower: Tab at the start of a name opens a group heading (D6, Q9).
        // Tab-indent is the table's keyboard act; the phone's cards carry no
        // group act, so the shower is grouped in the 1440 run only.
        await openSheet(page, 'rough', ROOM.bath);
        if (!vp.phone) {
        const bath = roughSection(page, ROOM.bath);
        const nameOf = (name: string) => lineRow(page, lineId(name)).first().locator('input[aria-label^="Line "]');
        const indent = async (name: string) => {
          const input = nameOf(name);
          await input.click();
          await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0));
          await input.press('Tab');
        };
        await indent(shower[0]);
        const groupName = bath.getByRole('textbox', { name: `Name the group for ${shower[0]}` });
        await groupName.fill('Shower');
        await groupName.press('Enter');
        await expect.poll(() => psqlScalar(`SELECT count(*) FROM public.project_line_groups WHERE project_id = '${JOB}' AND name = 'Shower'`)).toBe('1');
        for (const name of shower.slice(1)) {
          const before = psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id = '${JOB}' AND line_group_id IS NOT NULL`);
          await indent(name);
          await expect
            .poll(() => psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id = '${JOB}' AND line_group_id IS NOT NULL`))
            .toBe(String(Number(before) + 1));
        }
        expect(
          psqlScalar(`SELECT string_agg(f.name, ',' ORDER BY f.sort_order, f.created_at) FROM public.project_ffe_items f
                        JOIN public.project_line_groups g ON g.id = f.line_group_id
                       WHERE f.project_id = '${JOB}' AND g.name = 'Shower' AND g.project_room_id = '${ROOM.bath}'`),
        ).toBe(shower.join(','));
        await expect(bath.getByText('Shower', { exact: true })).toBeVisible();
        }

        // Return path: ← the job.
        await page.getByRole('link', { name: 'Back to Whole Home Renovation' }).click();
        await expectBackAtRoom(page, ROOM.bath);
      });
    });

    test(`S4 wallpaper labor, the PO and the price (a7) @${vp.name}`, async ({ authenticatedPage: page }, info) => {
      const wallpaper = lineId('Phillip Jeffries Manila Hemp, Chalk');
      const labor = laborLineId();
      const bed = lineId('Bed, king, upholstered');
      await timed(info, `S4 @${vp.name}`, async () => {
        await openSheet(page, 'price', ROOM.bedroom);
        await expect(
          page.getByText('This job is active. Markup and client price are read-only here; they change through Record a change. Trade cost can still be typed.'),
        ).toBeVisible();
        // R1a sits under R1, labor, by the roll; the room's subtotal counts both.
        const laborRow = lineRow(page, labor).first();
        await expect(laborRow).toContainText('Install, wallpaper hanger');
        await expect(laborRow).toContainText(/labor/i);
        await expect(laborRow).toContainText(/roll/i);
        await expect(page.getByText('Bedroom · $2,835 priced · ~$6,100 roughed')).toBeVisible();

        // An allowance prints Up to (Q12, T-55b).
        const menu = await openRowMenu(page, bed, 'Bed, king, upholstered');
        await menu.getByRole('menuitem', { name: 'Make it an allowance' }).click();
        const form = page.getByRole('form', { name: 'Make Bed, king, upholstered an allowance' });
        await form.getByRole('textbox').first().fill('4500');
        await form.getByRole('button', { name: 'Make it an allowance' }).click();
        await expect(lineRow(page, bed).first()).toContainText('Up to $4,500');
        await expect
          .poll(() => psqlScalar(`SELECT item_type || ':' || budget_max_cents FROM public.project_ffe_items WHERE id = '${bed}'`))
          .toBe('allowance:450000');

        // Labor is never on the maker's PO (D5): the maker's PO refuses the hanger's line.
        expect(
          refusalAsLeah(`SELECT public.create_purchase_order('${JOB}'::uuid, '${PHILLIP_JEFFRIES}'::uuid,
            'full_upfront'::purchase_order_payment_pattern, ARRAY['${wallpaper}', '${labor}']::uuid[],
            NULL, NULL, false, NULL, NULL, NULL, NULL, NULL)`),
        ).toBe('every PO line must be an active selected line for the PO project and vendor');

        // Return path: Esc, with nothing holding it.
        await page.getByTestId('build-room').getByRole('heading', { name: 'Build the pieces' }).click({ force: true });
        await page.keyboard.press('Escape');
        await expectBackAtRoom(page, ROOM.bedroom);
      });
    });

    test(`S5 remove, undo, the refusal and the merge (a8, a15) @${vp.name}`, async ({ authenticatedPage: page }, info) => {
      const chair = lineId('Rattan lounge chair');
      await timed(info, `S5 @${vp.name}`, async () => {
        await openSheet(page, 'rough', ROOM.sunroom);
        const menu = await openRowMenu(page, chair, 'Rattan lounge chair');
        await menu.getByRole('menuitem', { name: 'Remove' }).click();
        const toast = page.getByRole('status').filter({ hasText: /Removed Rattan lounge chair ×2/ });
        await expect(toast).toBeVisible();
        await expect(lineRow(page, chair)).toHaveCount(0);
        await expect.poll(() => psqlScalar(`SELECT removed_at IS NOT NULL FROM public.project_ffe_items WHERE id = '${chair}'`)).toBe('t');

        await toast.getByRole('button', { name: /undo/i }).click();
        await expect.poll(() => psqlScalar(`SELECT removed_at IS NULL FROM public.project_ffe_items WHERE id = '${chair}'`)).toBe('t');
        await expect(lineRow(page, chair).first()).toBeVisible();

        // A product a line names is never deleted; the refusal names the merge (D11, F6).
        const refused = await page.request.delete(`/api/catalog/products/${WALLPAPER}`);
        expect(refused.status()).toBe(409);
        expect((await refused.json()).error).toBe("A product on a line can't be deleted. Merge it into the one you keep.");
        expect(psqlScalar(`SELECT count(*) FROM public.products WHERE id = '${WALLPAPER}' AND deleted_at IS NULL`)).toBe('1');

        // The duplicate merges into the one kept (merge, never hard delete: Q11).
        psqlAsUser(LEAH, `SELECT public.merge_studio_product('${WALLPAPER_DUPLICATE}', '${WALLPAPER}');`);
        expect(
          psqlScalar(`SELECT merged_into_id || '|' || (deleted_at IS NOT NULL) FROM public.products WHERE id = '${WALLPAPER_DUPLICATE}'`),
        ).toBe(`${WALLPAPER}|true`);

        // Return path: ← the job (the phone's `← Whole Home`).
        await page.getByRole('link', { name: 'Back to Whole Home Renovation' }).click();
        await expectBackAtRoom(page, ROOM.sunroom);
      });
    });

    test(`S6 drag and Move to room… (a9) @${vp.name}`, async ({ authenticatedPage: page }, info) => {
      const stools = lineId('Counter stools');
      const pendants = lineId('Pendant lights, island');
      const floor = lineId('White oak floor, satin Bona finish');
      await timed(info, `S6 @${vp.name}`, async () => {
        await openSheet(page, 'rough', ROOM.dining);
        const menu = await openRowMenu(page, stools, 'Counter stools');
        await menu.getByRole('menuitem', { name: 'Move to room…' }).click();
        await page.getByRole('menu', { name: 'Move to room' }).getByRole('menuitem', { name: /^Kitchen/ }).click();
        await expect.poll(() => psqlScalar(`SELECT project_room_id FROM public.project_ffe_items WHERE id = '${stools}'`)).toBe(ROOM.kitchen);
        await expect(roughSection(page, ROOM.kitchen).locator(`[data-line-id="${stools}"]`)).toHaveCount(1);
        await expect(roughSection(page, ROOM.dining).locator(`[data-line-id="${stools}"]`)).toHaveCount(0);

        if (!vp.phone) {
          // Drag: the pendants from Kitchen onto the Dining heading (I25 reopened, Q8).
          const handle = lineRow(page, pendants).first().locator('span[aria-hidden="true"]', { hasText: '⋮⋮' });
          await handle.dragTo(roughSection(page, ROOM.dining).getByRole('heading', { name: 'Dining' }));
          await expect.poll(() => psqlScalar(`SELECT project_room_id FROM public.project_ffe_items WHERE id = '${pendants}'`)).toBe(ROOM.dining);
        }

        // The server's refusals, as Leah (00759): a placed line and a labor line alone.
        const triage = (id: string) =>
          `SELECT public.triage_project_ffe_items(jsonb_build_object('projectId', '${JOB}', 'selectionIds', jsonb_build_array('${id}'), 'roomId', '${ROOM.kitchen}', 'assignmentScope', 'room'))`;
        expect(refusalAsLeah(triage(floor))).toBe('This line sits in 4 rooms. Change its rooms instead.');
        expect(refusalAsLeah(triage(laborLineId()))).toBe('Labor moves with its piece.');

        // In the sheet, the placed line's move is refused and the line stays put.
        const floorMenu = await openRowMenu(page, floor, 'White oak floor, satin Bona finish');
        await floorMenu.getByRole('menuitem', { name: 'Move to room…' }).click();
        await page.getByRole('menu', { name: 'Move to room' }).getByRole('menuitem', { name: /^Kitchen/ }).click();
        await expect(page.getByRole('alert').filter({ hasText: /move/i })).toBeVisible();
        expect(psqlScalar(`SELECT project_room_id FROM public.project_ffe_items WHERE id = '${floor}'`)).toBe(ROOM.living);

        // Return path: ← the job.
        await page.getByRole('link', { name: 'Back to Whole Home Renovation' }).click();
        await expectBackAtRoom(page, ROOM.dining);
      });
    });

    test(`S7 the head, Esc, back and the hold (a3, a10) @${vp.name}`, async ({ authenticatedPage: page }, info) => {
      await timed(info, `S7 @${vp.name}`, async () => {
        await page.goto(`/doc/${JOB}#pieces-room-${ROOM.living}`, { waitUntil: 'domcontentloaded' });
        const row = page.locator(`[data-pieces-room="${ROOM.living}"]`);
        await expect(row).toBeVisible({ timeout: 30_000 });
        await row.getByRole('link', { name: /work this room/i }).click();
        await expect(page).toHaveURL(new RegExp(`/doc/${JOB}/pieces\\?lens=rough&room=${ROOM.living}`));

        // The head names the sheet and the lens; the reading says what the lens does.
        const lenses = page.getByRole('group', { name: 'Lens' });
        await expect(page.getByRole('heading', { name: 'Build the pieces' })).toBeAttached();
        await expect(lenses.getByRole('button', { name: 'Rough in' })).toHaveAttribute('aria-pressed', 'true');
        await lenses.getByRole('button', { name: 'Release' }).click();
        await expect(page).toHaveURL(/lens=release/);
        await expect(lenses.getByRole('button', { name: 'Release' })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText('Release · Check what the client will see, then release rooms for authorization.')).toBeVisible();

        // Back walks the lens change, then lands on the overview at the room.
        await page.goBack();
        await expect(page).toHaveURL(/lens=rough/);
        await page.goBack();
        await expectBackAtRoom(page, ROOM.living);

        // In again, then Esc.
        await row.getByRole('link', { name: /work this room/i }).click();
        await expect(page.getByTestId('build-room')).toBeVisible();
        if (vp.phone) {
          // The phone head: the room picker carries the place.
          await page.getByRole('button', { name: 'Living Room ▾' }).click();
          await page.getByRole('navigation', { name: 'Choose a room' }).getByRole('link', { name: /^Kitchen/ }).click();
          await expect(page).toHaveURL(new RegExp(`room=${ROOM.kitchen}`));
        }
        await page.getByRole('heading', { name: 'Build the pieces' }).click({ force: true });
        await page.keyboard.press('Escape');
        await expectBackAtRoom(page, vp.phone ? ROOM.kitchen : ROOM.living);

        // The hold lives on the layout: nothing asks to log or discard the time.
        await expect(page.getByRole('button', { name: /discard/i })).toHaveCount(0);

        // No client is linked (§4.1). Bedroom's wallpaper and its hanger are
        // ready and selected, so the ceremony names the missing client first.
        await openSheet(page, 'release', ROOM.bedroom);
        await expect(page.getByTestId('release-lens')).toContainText('Link a client to this job before releasing.');
        await page.getByRole('heading', { name: 'Build the pieces' }).click({ force: true });
        await page.keyboard.press('Escape');
        await expectBackAtRoom(page, ROOM.bedroom);
      });
    });

    test(`S8 finishes and the painter's print (a11) @${vp.name}`, async ({ authenticatedPage: page }, info) => {
      await timed(info, `S8 @${vp.name}`, async () => {
        await openSheet(page, 'finishes', ROOM.bedroom);
        const lens = page.getByTestId('finishes-lens');
        await expect(lens).toBeVisible();

        const surface = lens.getByRole('textbox', { name: 'New surface in Bedroom' });
        await surface.fill('Walls');
        await surface.press('Enter');
        const product = lens.getByRole('textbox', { name: 'Product for Walls' });
        if (vp.phone) {
          // FINDING (T-59): at 390 the finishes table is table-fixed at min-w-[560px]
          // with fixed columns of 200 + 140 + 140 + 88 = 568px, so the Product
          // column (the one auto <col>) collapses to 0px and its input cannot be
          // reached (finishes-lens.tsx colgroup). Expected to fail until fixed.
          test.fail(true, 'Finishes lens at 390: the Product column collapses to 0px');
          await expect(product).toBeAttached();
          const box = await product.boundingBox();
          expect(box?.width ?? 0, 'Product for Walls has width at 390').toBeGreaterThan(0);
        }
        await product.fill('Farrow & Ball Setting Plaster No. 231');
        await product.press('Enter');
        const sheen = lens.getByRole('combobox', { name: 'Sheen for Walls' }).or(lens.getByRole('textbox', { name: 'Sheen for Walls' }));
        await sheen.fill('Eggshell');
        await sheen.press('Enter');
        const hex = lens.getByRole('textbox', { name: 'Swatch color for Walls' });
        await hex.fill('#F2DCD2');
        await hex.press('Enter');
        await expect
          .poll(() =>
            psqlScalar(`SELECT swatches::text FROM public.project_palettes WHERE project_id = '${JOB}' AND scope_room_id = '${ROOM.bedroom}'`),
          )
          .toMatch(/Walls.*Farrow & Ball Setting Plaster No\. 231|Farrow & Ball Setting Plaster No\. 231.*Walls/);

        if (vp.phone) {
          // The phone's lens strip wraps; nothing runs off the 390 page.
          const lensButtons = page.getByRole('group', { name: 'Lens' }).getByRole('button');
          await expect(lensButtons).toHaveCount(5);
          for (const button of await lensButtons.all()) {
            const box = await button.boundingBox();
            expect(box, 'each lens word is on screen').not.toBeNull();
            expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
        }

        // The print: one page per room, addressed to the painter.
        const print = lens.getByRole('link', { name: /print the paint and finish schedule/i });
        await expect(print).toHaveAttribute('href', new RegExp(`/doc/${JOB}/pieces/finishes/print\\?room=${ROOM.bedroom}`));
        await print.click();
        await expect(page).toHaveURL(/\/pieces\/finishes\/print/);
        await expect(page.getByText('Farrow & Ball Setting Plaster No. 231')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Walls', { exact: true }).first()).toBeVisible();
        await expect(page.getByText(/painter/i).first()).toBeVisible();

        // Return path: from the print back to the sheet, then ←.
        await page.goBack();
        await expect(page.getByTestId('finishes-lens')).toBeVisible();
        await page.getByRole('link', { name: 'Back to Whole Home Renovation' }).click();
        await expectBackAtRoom(page, ROOM.bedroom);
      });
    });
  });
}

/**
 * Product defects the walk found (T-59). Each is marked test.fail: it names the
 * defect and passes while the defect stands. A fix flips it to an unexpected
 * pass, which is the cue to drop the mark.
 */
test.describe('The Build room · findings @1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(() => {
    psqlRun(FIXTURE_SQL);
  });

  test('FINDING: a refused move names the server refusal (a9)', async ({ authenticatedPage: page }) => {
    // DEFECT: rough-in and price lens Move/drag show the generic "The move did
    // not save. Use Move to room… to try again." instead of the server's
    // sentence, "This line sits in 4 rooms. Change its rooms instead." (00759).
    test.fail(true, 'Move to room… refusals show a generic alert, not the named refusal');
    const floor = lineId('White oak floor, satin Bona finish');
    await openSheet(page, 'rough', ROOM.living);
    const menu = await openRowMenu(page, floor, 'White oak floor, satin Bona finish');
    await menu.getByRole('menuitem', { name: 'Move to room…' }).click();
    await page.getByRole('menu', { name: 'Move to room' }).getByRole('menuitem', { name: /^Kitchen/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'This line sits in 4 rooms. Change its rooms instead.' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('FINDING: MERGE INTO THIS ONE asks first, and a refused delete is reported (a15)', async ({ authenticatedPage: page }) => {
    // DEFECT: components/catalog/duplicate-detection-panel.tsx (MERGE INTO THIS
    // ONE → "Confirm the merge") and delete-product-dialog.tsx are mounted on
    // no route, so neither the merge confirmation nor the delete refusal can
    // be reached in the portal. The 409 refusal is held at the API in S5.
    test.fail(true, 'DuplicateDetectionPanel and DeleteProductDialog are not mounted on any route');
    await page.goto(`/library/${WALLPAPER}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /merge into this one/i }).first().click({ timeout: 15_000 });
    await expect(page.getByRole('group', { name: 'Confirm the merge' })).toBeVisible();
  });
});
