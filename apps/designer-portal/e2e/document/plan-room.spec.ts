import path from 'path';
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { adminDb } from '../helpers/supabase-admin';
import { psqlScalar } from '../helpers/psql';

/**
 * The Plan Room, walked end to end: drop a set on the Light Table, answer what
 * it asks, file it, then share a sheet with the client.
 *
 * Prereqs (house pattern, playwright.config.ts): local Supabase up + seeded
 * (designer@patina.dev / password123). No flag override — the plan room is
 * unconditional.
 *
 * Chromium-pinned: this is a single-actor DB walk, not a rendering-engine
 * question, and it files real rows.
 *
 * The storage-policy blocker this spec first surfaced is FIXED: migration 00430
 * qualifies `storage.objects.name` in all four project-documents policies.
 * Before it, every policy wrote `(storage.foldername(name))[1]` inside a
 * subquery selecting `FROM public.projects p`, so the unqualified `name` bound
 * to the PROJECT'S NAME and denied every project-prefixed object — blocking the
 * plan room's upload leg and the project leg of the Folio alike.
 *
 * ISOLATION AND CLEANUP. The plan-room tables are guard-protected — a filed
 * print freezes its Folio row (00429's folio guard: no re-file, no re-anchor,
 * no delete), so a spec cannot tidy up after itself by deleting rows. Instead
 * this spec creates a THROWAWAY PROJECT of its own in `beforeAll` and leaves
 * every row it files in place. That is deliberate: on a local dev database an
 * abandoned project costs nothing, and the alternative — fighting the guards
 * that exist precisely so drawings cannot be quietly unmade — would be testing
 * against the design. The spec is therefore runnable in isolation and
 * repeatable: each run gets a fresh project.
 */

test.describe.configure({ mode: 'serial' });

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'whitlock-set.pdf');

let projectId = '';

test.beforeAll(async () => {
  // Read the id straight off auth.users: the local GoTrue admin API's
  // listUsers is unreliable on this stack, and psql.ts refuses to run against
  // anything but the local Postgres.
  const designerId = psqlScalar(
    "select id from auth.users where email = 'designer@patina.dev'",
  );
  if (!designerId) throw new Error('designer@patina.dev is not seeded locally');
  const { data, error } = await adminDb
    .from('projects')
    .insert({
      name: `Whitlock residence (plan room e2e ${Date.now()})`,
      designer_id: designerId,
      created_by: designerId,
      status: 'active',
      current_phase: 'design',
    })
    .select('id')
    .single();
  if (error) throw new Error(`could not seed the e2e project: ${error.message}`);
  projectId = (data as { id: string }).id;
});

test.beforeEach(async ({ page }) => {
  test.skip(
    test.info().project.name !== 'chromium',
    'single-browser sweep is enough here',
  );
  // Set here rather than in the body: the authenticatedPage fixture's UI
  // sign-in is built lazily when the test first asks for it, and that setup
  // counts against the test's timeout — a setTimeout inside the body is too
  // late to cover it.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

const count = (sql: string) => Number(psqlScalar(sql) || '0');

async function openPlanRoom(page: AuthenticatedPage): Promise<void> {
  await page.goto(`/doc/${projectId}/plans`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'The plan room' })).toBeVisible({
    timeout: 60_000,
  });
}

test('files a dropped set, then shares a sheet with the client', async ({
  authenticatedPage: page,
}) => {
  // ── The empty room invites a set ────────────────────────────────────────
  await openPlanRoom(page);
  await expect(
    page.getByText(/Drop a PDF set — the table splits it/),
  ).toBeVisible();

  // ── Stage the fixture on the Light Table ────────────────────────────────
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);

  // Three cards: two pages carry a sheet number and are proposed as new sheets,
  // and the third — which has none — gets a card of its own in the loose papers
  // tray, where it can go to the Folio or be pointed at a sheet already held.
  await expect(page.locator('[data-plan-card]')).toHaveCount(3, {
    timeout: 60_000,
  });
  await expect(page.getByLabel('Sheet number for page 1')).toHaveValue('ID-401');
  await expect(page.getByLabel('Sheet number for page 2')).toHaveValue('ID-501');
  await expect(page.getByText('Loose papers')).toBeVisible();
  await expect(page.getByRole('button', { name: /Send to the Folio/i })).toBeVisible();

  // Neither new-sheet card asks a question, so the strip's gate is already
  // open — the fork chips only appear on a near miss.
  await expect(page.locator('[data-plan-card][data-unresolved]')).toHaveCount(0);
  // .first(): the strip inks the sentence once and repeats it in an sr-only
  // live region, so AT hears it whole rather than as split spans. The verb
  // counts PRINTS — a confirmation carries no bytes and makes no print.
  await expect(
    page
      .getByText('File 2 prints · 2 new sheets · 1 loose page · one transaction')
      .first(),
  ).toBeVisible();

  // ── File it — one RPC, one transaction ──────────────────────────────────
  await page.locator('[data-action-key="file-plan-prints"]').click();

  await expect
    .poll(
      () =>
        count(
          `select count(*) from public.plan_sheets where project_id = '${projectId}'`,
        ),
      { timeout: 60_000 },
    )
    .toBe(2);

  // Both sheets open at Rev A, and each one's pointer is set to its print.
  expect(
    count(
      `select count(*) from public.plan_prints pp
         join public.plan_sheets s on s.id = pp.sheet_id
        where s.project_id = '${projectId}' and pp.rev_letter = 'A'`,
    ),
  ).toBe(2);
  expect(
    count(
      `select count(*) from public.plan_sheets
        where project_id = '${projectId}' and current_print_id is not null`,
    ),
  ).toBe(2);
  expect(
    psqlScalar(
      `select string_agg(sheet_number, ',' order by sheet_number)
         from public.plan_sheets where project_id = '${projectId}'`,
    ),
  ).toBe('ID-401,ID-501');

  // The room lands back on the set once the filing clears.
  await expect(page.getByText('The current set')).toBeVisible({ timeout: 30_000 });

  // ── The same file again ─────────────────────────────────────────────────
  // A NEW staged table mints a NEW idempotency key, so this is a second batch,
  // not a replay. What keeps it honest is the text fingerprint: both pages now
  // match a sheet the room holds AND hash identically to its filed print, so
  // the table proposes confirm_current for both — no duplicate sheet, no
  // spurious Rev B. That is the real duplicate-drop defence.
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(
    page.getByText(/2 further pages matched cleanly/),
  ).toBeVisible({ timeout: 60_000 });
  // Nothing carries bytes this time, so the act names itself a confirmation.
  await expect(
    page
      .getByText('Confirm 2 sheets current · 1 loose page · one transaction')
      .first(),
  ).toBeVisible();

  await page.locator('[data-action-key="file-plan-prints"]').click();

  await expect
    .poll(
      () =>
        count(
          `select count(*) from public.plan_print_batches where project_id = '${projectId}'`,
        ),
      { timeout: 60_000 },
    )
    .toBe(2);
  // Nothing was duplicated and no pointer moved.
  expect(
    count(`select count(*) from public.plan_sheets where project_id = '${projectId}'`),
  ).toBe(2);
  expect(
    count(
      `select count(*) from public.plan_prints pp
         join public.plan_sheets s on s.id = pp.sheet_id
        where s.project_id = '${projectId}'`,
    ),
  ).toBe(2);
  expect(
    count(
      `select coalesce(array_length(confirmed_sheet_ids, 1), 0)
         from public.plan_print_batches
        where project_id = '${projectId}'
        order by created_at desc limit 1`,
    ),
  ).toBe(2);

  // ── Share one sheet with the client ─────────────────────────────────────
  await expect(page.getByText('The current set')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /ID-401/ }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Millwork Elevations - Study' }),
  ).toBeVisible({ timeout: 30_000 });

  await page.locator('[data-action-key="toggle-plan-sheet-state"]').click();
  await expect(
    page.getByText(
      'Shared — the client sees the current print of this sheet, always the current print.',
    ),
  ).toBeVisible({ timeout: 30_000 });

  // The sharing is not an assertion the UI makes — it is derived onto the
  // print's Folio row, which is what the client portal actually reads.
  await expect
    .poll(
      () =>
        count(
          `select count(*) from public.project_documents d
             join public.plan_prints pp on pp.project_document_id = d.id
             join public.plan_sheets s on s.id = pp.sheet_id
            where s.project_id = '${projectId}'
              and s.sheet_number = 'ID-401'
              and pp.id = s.current_print_id
              and d.client_visible = true`,
        ),
      { timeout: 30_000 },
    )
    .toBe(1);

  // ID-501 was never shared, so its print stays private.
  expect(
    count(
      `select count(*) from public.project_documents d
         join public.plan_prints pp on pp.project_document_id = d.id
         join public.plan_sheets s on s.id = pp.sheet_id
        where s.project_id = '${projectId}'
          and s.sheet_number = 'ID-501'
          and d.client_visible = true`,
    ),
  ).toBe(0);
});
