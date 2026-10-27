import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const STUDIO = 'f0180000-0000-4000-8000-000000000001';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const CARD = 'f1972000-0000-4000-8000-000000000001';
const SEAT = 'f1972000-0000-4000-8000-000000000002';
const NAME = 'A03 Fictional Rowan';
let fixtureOwned = false;

// This slice creates only its two fictional records. F01 owns the job/studio.
test.beforeAll(() => {
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toBe('127.0.0.1');
  expect(psqlScalar(`SELECT count(*) FROM projects WHERE id='${JOB}' AND studio_id='${STUDIO}' AND designer_id='${DESIGNER}';`)).toBe('1');
  expect(psqlScalar(`SELECT (SELECT count(*) FROM studio_contacts WHERE id='${CARD}') + (SELECT count(*) FROM project_parties WHERE id='${SEAT}');`)).toBe('0');
  psqlRun(`BEGIN;
    INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by)
    VALUES ('${CARD}', '${STUDIO}', 'person', 'other', '${NAME}', '${DESIGNER}');
    INSERT INTO project_parties (id, project_id, party_kind, display_name, studio_contact_id, created_by)
    VALUES ('${SEAT}', '${JOB}', 'client_rep', '${NAME}', '${CARD}', '${DESIGNER}');
    COMMIT;`);
  fixtureOwned = true;
  console.log('[A03 readback]', psqlScalar(`SELECT json_build_object('contact', c.id, 'seat', p.id, 'job', p.project_id, 'consent', p.sms_consent_status, 'authority', (SELECT count(*) FROM project_party_authority WHERE engagement_id=p.id)) FROM studio_contacts c JOIN project_parties p ON p.studio_contact_id=c.id WHERE c.id='${CARD}' AND p.id='${SEAT}';`));
});

test.afterAll(() => {
  if (!fixtureOwned) return;
  psqlRun(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM studio_contacts WHERE id='${CARD}' AND (organization_id<>'${STUDIO}' OR full_name IS DISTINCT FROM '${NAME}'))
      OR EXISTS (SELECT 1 FROM project_parties WHERE id='${SEAT}' AND (project_id<>'${JOB}' OR studio_contact_id IS DISTINCT FROM '${CARD}'::uuid))
    THEN RAISE EXCEPTION 'A03 fixture identity changed; refusing cleanup'; END IF;
    DELETE FROM project_parties WHERE id='${SEAT}';
    DELETE FROM studio_contacts WHERE id='${CARD}';
  END $$;`);
  expect(psqlScalar(`SELECT (SELECT count(*) FROM studio_contacts WHERE id='${CARD}') + (SELECT count(*) FROM project_parties WHERE id='${SEAT}');`)).toBe('0');
  console.log('[A03 cleanup] contact+seat=0');
});

test('People separates six meanings, opens existing resources and returns from a person’s job', async ({ authenticatedPage: page }, testInfo) => {
  test.setTimeout(240_000);
  const studio = page.locator('[data-studio="round8"]');
  await expect(studio).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  await page.goto('/people', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-people-renderer]')).toHaveAttribute('data-people-renderer', 'round8', { timeout: 60_000 });
  const person = page.getByRole('button', { name: NAME, exact: true });
  await expect(person).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
  await page.getByText('Contacts, accounts and permissions — different records', { exact: true }).click();
  for (const term of ['Saved contact', 'Trade account', 'Appointment', 'Permitted work copy', 'Consent', 'Authority']) {
    await expect(page.locator('dt').filter({ hasText: new RegExp(`^${term}$`) })).toBeVisible();
  }
  await expect(page.getByText(/Neither a contact nor an appointment creates it/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('people-meanings.png'), fullPage: true });

  const resources = page.getByRole('navigation', { name: 'People resources' });
  for (const [door, view, heading] of [
    ['Relationship follow-ups', 'nurture', 'Nurture'],
    ['Client reviews', 'reviews', 'Reviews'],
    ['Email campaigns', 'outreach', 'Outreach'],
  ]) {
    await resources.getByRole('button', { name: door, exact: true }).click();
    await expect(page.locator('[data-people-main-panel]')).toHaveAttribute('data-people-current-view', view);
    await expect(page).toHaveURL(new RegExp(`[?&]view=${view}(?:&|$)`));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await resources.getByRole('button', { name: 'Directory', exact: true }).click();
  await expect(page).toHaveURL('/people');
  await expect(page.locator('[data-people-main-panel]')).toHaveAttribute('data-people-current-view', 'directory');
  await person.click();
  await expect(page.locator(`[data-person-card="${CARD}"]`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`person=${CARD}`));
  const returnSearch = new URL(page.url()).search;
  await page.locator(`[data-person-card="${CARD}"] [data-seat-line="${SEAT}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/doc/${JOB}\\?sheet=call`), { timeout: 60_000 });
  await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });
  const back = page.locator('[data-job-head-return]');
  await expect(back).toHaveAttribute('href', `/people${returnSearch}`);
  // The seat opens the existing call sheet; put it down before the job-head return.
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  await back.click();
  await expect(page).toHaveURL(`/people${returnSearch}`);
  await expect(page.locator(`[data-person-card="${CARD}"]`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Back to Studio contacts', exact: true }).click();
  await expect(page).toHaveURL('/people');
  await expect(person).toBeVisible();
  expect(psqlScalar(`SELECT count(*) FROM project_party_authority WHERE engagement_id='${SEAT}';`)).toBe('0');
});
