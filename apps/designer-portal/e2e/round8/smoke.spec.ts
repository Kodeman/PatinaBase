import { test, expect } from '../fixtures/auth';
import { psqlAsUserRow, psqlRow, psqlScalar } from '../helpers/psql';

test('F01 live studio opens its full-service job with 36 living-room lines and 80 total', async ({ authenticatedPage: page }) => {
  // Stable roots are documented in f01-fixture.sql. Discover names, room and
  // line identity from the DB, not from an independently duplicated fixture.
  const [job, name, designer, studio] = psqlRow(`
    SELECT id, name, designer_id, studio_id FROM public.projects
    WHERE id = 'f0180000-0000-4000-8000-000000000010';
  `);
  expect(job, 'F01 job exists').toBeTruthy();
  const [living, livingName] = psqlRow(`
    SELECT id, name FROM public.project_rooms WHERE project_id = '${job}' AND sort_order = 0;
  `);
  expect(psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id = '${job}' AND removed_at IS NULL;`), '80 live job lines').toBe('80');
  expect(psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id = '${job}' AND project_room_id = '${living}' AND removed_at IS NULL;`), '36 live living-room lines').toBe('36');
  expect(psqlScalar(`SELECT count(*) FROM public.organization_members WHERE organization_id = '${studio}' AND user_id = '${designer}' AND status = 'active';`), 'designer belongs to stamped studio').toBe('1');
  expect(psqlScalar(`SELECT count(*) FROM public.room_scans WHERE project_id = '${job}' AND project_room_id = '${living}' AND status = 'ready';`), 'ready survey is linked to the living room').toBe('1');
  expect(psqlScalar(`SELECT count(*) FROM public.margin_notes n JOIN public.project_ffe_items i ON i.id = n.anchor_id WHERE n.project_id = '${job}' AND n.anchor_kind = 'line' AND i.project_room_id = '${living}';`), 'private margin note anchors a living-room line').toBe('1');
  expect(psqlScalar(`SELECT count(*) FROM public.project_tasks WHERE project_id = '${job}' AND status = 'todo' AND due_date <= current_date;`), 'native due task supplies the studio next act').toBe('1');
  expect(psqlAsUserRow('f0180000-0000-4000-8000-000000000003', `SELECT count(*) FROM public.projects WHERE id = '${job}';`), 'unrelated actor cannot read F01').toEqual(['0']);

  await page.goto('/desk', { waitUntil: 'domcontentloaded' });
  const jobDoor = page.getByRole('link', { name: new RegExp(name) }).first();
  await expect(jobDoor, 'live F01 job is on the studio desk').toBeVisible({ timeout: 30_000 });
  await expect(jobDoor).toHaveAttribute('href', `/doc/${job}`);
  await Promise.all([
    page.waitForRequest((request) => request.url().includes(`/doc/${job}`), { timeout: 60_000 }),
    jobDoor.click(),
  ]);
  // The first next dev compile of /doc/[id] is slow.
  await expect(page).toHaveURL(new RegExp(`/doc/${job}`), { timeout: 60_000 });
  await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 30_000 });
  // WP-01.5 — the round-8 paper: the contents margin from 1180px; below it the
  // mobile bar's sections sheet stays the way in (preservation-inventory).
  if ((page.viewportSize()?.width ?? 1440) < 1180) {
    await page.locator('[data-sections-door]').click();
    await page
      .getByRole('dialog', { name: 'Sections of this document', exact: true })
      .getByRole('button', { name: /^Pieces & purchasing\b/i })
      .click();
  } else {
    await page
      .getByRole('navigation', { name: 'Job contents', exact: true })
      .locator('[data-contents-entry="ffe"]')
      .click({ timeout: 30_000 });
  }
  await expect(page.getByText('80 lines · not yet on the paper · press Pieces & purchasing on the index to open', { exact: true })).toHaveCount(0);
  const rooms = page.locator('[data-pieces-room]');
  await expect(rooms).toHaveCount(3);
  for (const visibleRoom of await rooms.all()) await expect(visibleRoom).toBeVisible();
  const room = page.locator(`[data-pieces-room="${living}"]`);
  await expect(room.getByRole('button', { name: livingName, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(room, 'legacy room overview displays its 36-line count').toContainText('36 lines');
});
