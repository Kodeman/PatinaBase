import { test as authTest, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const STUDIO = 'f0180000-0000-4000-8000-000000000001';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const JOB = 'f0180000-0000-4000-8000-000000000010';
const NAME = 'E6 Fictional Maker Account';
let fixtureReady = false;

// Main-frame navigation log, registered on `page` before the auth fixture signs in, so it
// covers the sign-in replace to /desk as well as the /people visit. Emitted as annotations.
type NavLog = { events: string[]; note: (event: string) => void };
const test = authTest.extend<{ nav: NavLog }>({
  nav: async ({}, use) => {
    const t0 = Date.now();
    const events: string[] = [];
    await use({ events, note: event => events.push(`${Date.now() - t0}ms ${event}`) });
  },
  page: async ({ page, nav }, use) => {
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) nav.note(`framenavigated ${new URL(frame.url()).pathname}`); });
    page.on('console', message => { if (/Fast Refresh|full reload/i.test(message.text())) nav.note(`console ${message.text().slice(0, 160)}`); });
    await use(page);
  },
});

const vendorId = () => psqlScalar(`SELECT id FROM vendors WHERE name='${NAME}';`);

test.beforeAll(() => {
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
  expect(psqlScalar(`SELECT current_setting('rc7.e6_stack', true);`)).toBe('patina-rc7-e6');
  expect(psqlScalar(`SELECT count(*) FROM projects WHERE id='${JOB}' AND studio_id='${STUDIO}' AND designer_id='${DESIGNER}';`)).toBe('1');
  expect(psqlScalar(`SELECT count(*) FROM vendors WHERE name='${NAME}';`)).toBe('0');
  fixtureReady = true;
});

test.afterAll(() => {
  if (!fixtureReady) return;
  psqlRun(`DO $$ DECLARE v_id uuid; BEGIN
    IF current_setting('rc7.e6_stack', true) IS DISTINCT FROM 'patina-rc7-e6' OR NOT EXISTS (SELECT 1 FROM projects WHERE id='${JOB}' AND studio_id='${STUDIO}' AND designer_id='${DESIGNER}')
      THEN RAISE EXCEPTION 'not E6 owned F01 stack'; END IF;
    SELECT id INTO v_id FROM vendors WHERE name='${NAME}';
    IF v_id IS NULL THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM studio_vendor_accounts WHERE vendor_id=v_id AND organization_id<>'${STUDIO}')
      OR EXISTS (SELECT 1 FROM saved_vendors WHERE vendor_id=v_id AND designer_id<>'${DESIGNER}')
      OR EXISTS (SELECT 1 FROM purchase_orders WHERE vendor_id=v_id)
      THEN RAISE EXCEPTION 'E6 maker gained external references; refusing cleanup'; END IF;
    DELETE FROM studio_vendor_accounts WHERE vendor_id=v_id AND organization_id='${STUDIO}';
    DELETE FROM saved_vendors WHERE vendor_id=v_id AND designer_id='${DESIGNER}';
    DELETE FROM vendors WHERE id=v_id AND name='${NAME}';
  END $$;`);
  expect(vendorId()).toBe('');
});

test('A13 saving a maker account does not appoint a job party or create a PO', async ({ authenticatedPage: page, nav }) => {
  test.setTimeout(240_000);
  const { note } = nav;
  let peopleRecoveryFired = false;
  const partiesBefore = psqlScalar(`SELECT count(*) FROM project_parties WHERE project_id='${JOB}';`);
  try {
    // HARNESS WORKAROUND (not a product defect; rc7-e6.md "WebKit /desk interruption"): on WebKit the first
    // goto('/people') can be interrupted by a dev-server-driven navigation of the open /desk document.
    // Retry only that exact interruption; the annotations record whether it fired.
    note('goto /people start');
    try {
      await page.goto('/people', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    } catch (error) {
      if (!/Navigation to .*\/people.* is interrupted by another navigation to .*\/desk/.test(String(error))) throw error;
      peopleRecoveryFired = true;
      note('goto /people interrupted; recovery retry');
      await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
      await page.goto('/people', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    }
    note('goto /people done');
  } finally {
    test.info().annotations.push(
      { type: 'e6-people-recovery', description: peopleRecoveryFired ? 'fired' : 'not fired' },
      { type: 'e6-nav-log', description: nav.events.join(' | ') },
    );
    console.log(`[e6-people-recovery] ${peopleRecoveryFired ? 'fired' : 'not fired'}`);
    console.log(`[e6-nav-log] ${nav.events.join(' | ')}`);
  }
  await expect(page.locator('[data-people-renderer="round8"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Add contact' })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Add contact' }).click();
  const sheet = page.getByRole('dialog', { name: 'New contact' });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole('group', { name: 'What kind of person' }).getByRole('button', { name: 'a maker' }).click();
  await sheet.locator('label').filter({ hasText: /^Maker or supplier name$/ }).locator('xpath=following-sibling::input[1]').fill(NAME);
  await sheet.getByRole('button', { name: 'Add to directory' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(NAME, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => vendorId()).toMatch(/^[0-9a-f-]{36}$/);
  const id = vendorId();
  expect(psqlScalar(`SELECT count(*) FROM saved_vendors WHERE vendor_id='${id}' AND designer_id='${DESIGNER}';`)).toBe('1');
  expect(psqlScalar(`SELECT count(*) FROM studio_vendor_accounts WHERE vendor_id='${id}' AND organization_id='${STUDIO}';`)).toBe('1');
  expect(psqlScalar(`SELECT count(*) FROM project_parties WHERE project_id='${JOB}';`)).toBe(partiesBefore);
  expect(psqlScalar(`SELECT count(*) FROM project_parties WHERE project_id='${JOB}' AND display_name='${NAME}';`)).toBe('0');
  expect(psqlScalar(`SELECT count(*) FROM purchase_orders WHERE vendor_id='${id}';`)).toBe('0');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(NAME, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  expect(psqlScalar(`SELECT count(*) FROM project_parties WHERE project_id='${JOB}';`)).toBe(partiesBefore);
  expect(psqlScalar(`SELECT count(*) FROM studio_vendor_accounts WHERE vendor_id='${id}' AND organization_id='${STUDIO}';`)).toBe('1');
});
