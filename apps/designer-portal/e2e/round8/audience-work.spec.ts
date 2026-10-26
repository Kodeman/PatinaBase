import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const CLIENT = 'f0180000-0000-4000-8000-000000000003';
const RELATIONSHIP = 'f0180000-0000-4000-8000-000000000078';

async function openDocument(page: Page) {
  await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
}

async function openPhoneMargin(page: Page) {
  await page.getByRole('button', { name: 'More studio actions', exact: true }).click();
  await page.getByRole('group', { name: 'In this document', exact: true }).getByRole('button', { name: /^Margin/ }).click();
  return page.getByRole('dialog', { name: 'The margin', exact: true });
}

async function openComposer(page: Page) {
  await openDocument(page);
  const door = page.getByRole('button', { name: '+ Decision', exact: true });
  await expect(door).toBeVisible();
  await door.click();
  const composer = page.getByRole('dialog', { name: 'New decision', exact: true });
  await expect(composer).toBeVisible();
  return composer;
}

test('native audience surface keeps private work out of client-visible records and sends', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toBe('127.0.0.1');
  const title = `N03 fictional audience ${info.project.name}`;
  const owned = `project_id='${JOB}' AND title='${title}'`;
  expect(psqlScalar(`SELECT count(*) FROM client_decisions WHERE ${owned};`)).toBe('0');
  const ownedNote = `project_id='${JOB}' AND body='${title}'`;
  expect(psqlScalar(`SELECT count(*) FROM margin_notes WHERE ${ownedNote};`)).toBe('0');
  const visibleCounts = () => psqlScalar(`SELECT json_build_array(
    (SELECT count(*) FROM client_decisions WHERE project_id='${JOB}'),
    (SELECT count(*) FROM project_notes WHERE project_id='${JOB}'),
    (SELECT count(*) FROM outbound_drafts WHERE project_id='${JOB}'))::text;`);
  const visibleBefore = visibleCounts();
  let creates = 0;
  let externalSends = 0;
  page.on('request', request => {
    if (request.url().includes('/rest/v1/rpc/create_client_decision')) creates++;
  });
  const sendRoute = '**/functions/v1/*';
  await page.route(sendRoute, route => {
    externalSends++;
    return route.fulfill({ status: 503, json: { message: 'N03 never permits an external send' } });
  });
  const before = psqlScalar(`SELECT count(*) FROM client_decisions WHERE project_id='${JOB}';`);
  let linked = false;
  try {
    // F01 starts without a client; the native decision door needs its relationship.
    // Reuse F01's second fictional profile rather than provisioning another login.
    psqlRun(`BEGIN;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM projects WHERE id='${JOB}' AND designer_id='${DESIGNER}' AND client_id IS NULL)
          OR EXISTS (SELECT 1 FROM designer_clients WHERE id='${RELATIONSHIP}' OR (designer_id='${DESIGNER}' AND client_id='${CLIENT}'))
        THEN RAISE EXCEPTION 'N03 client fixture preconditions changed'; END IF;
      END $$;
      INSERT INTO designer_clients (id, designer_id, client_id, client_name, status)
        VALUES ('${RELATIONSHIP}', '${DESIGNER}', '${CLIENT}', 'N03 Fictional Client', 'active');
      SELECT set_config('request.jwt.claims', '{"sub":"${DESIGNER}","role":"authenticated"}', true);
      SELECT public.set_document_client('project', '${JOB}', '${CLIENT}');
      COMMIT;`);
    linked = true;
    if (info.project.name === 'webkit-iphone') {
      await openDocument(page);
      const margin = await openPhoneMargin(page);
      await expect(margin.getByRole('button', { name: 'Capture a note', exact: true })).toBeVisible();
      await expect(margin.getByRole('radio')).toHaveCount(0);
      await expect(margin.getByText('Who can see this?', { exact: true })).toHaveCount(0);
      await expect(margin.getByRole('button', { name: /Shared|Send|Decision/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '+ Decision', exact: true })).toHaveCount(0);
      await margin.getByRole('button', { name: 'Capture a note', exact: true }).click();
      const noteSchemaReady = psqlScalar(`SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='margin_notes' AND column_name IN ('subject_id', 'subject_kind');`) === '2';
      await page.getByRole('textbox', { name: 'Note body', exact: true }).fill(title);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      if (noteSchemaReady) {
        await expect.poll(() => psqlScalar(`SELECT count(*) FROM margin_notes WHERE ${ownedNote} AND designer_id='${DESIGNER}';`)).toBe('1');
        await expect(page.getByRole('dialog', { name: 'Note to the margin', exact: true })).toHaveCount(0);
      } else {
        // W3's shared DB intentionally lacks 00874; the exit fresh reset owns persistence.
        const note = page.getByRole('dialog', { name: 'Note to the margin', exact: true });
        await expect(note).toBeVisible();
        await expect(note.getByRole('alert')).toContainText(/Could not find the 'subject_(id|kind)' column/);
        await expect(note.getByRole('textbox', { name: 'Note body', exact: true })).toHaveValue(title);
        await expect(note.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: /\bsaved\b|\bsent\b/i })).toHaveCount(0);
        expect(psqlScalar(`SELECT count(*) FROM margin_notes WHERE ${ownedNote};`)).toBe('0');
      }
      expect(visibleCounts()).toBe(visibleBefore);
      expect(creates).toBe(0);
      expect(externalSends).toBe(0);
      console.log(`[N03 phone readback] private note persistence=${noteSchemaReady ? '1' : 'UNVERIFIED: shared DB lacks 00874; error shown, words retained, note=0'}; client-visible records unchanged; external sends=0; audience composer unavailable`);      return;
    }
    const composer = await openComposer(page);
    await composer.locator('textarea').first().fill(title);
    const privateChoice = composer.getByRole('radio', { name: 'Private — studio only', exact: true });
    const sharedChoice = composer.getByRole('radio', { name: 'Shared — client and project parties', exact: true });
    await expect(privateChoice).not.toBeChecked();
    await expect(sharedChoice).not.toBeChecked();
    await expect(composer.getByRole('button', { name: 'Save as draft', exact: true })).toBeDisabled();
    await expect(composer.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
    await privateChoice.check();
    await expect(composer.getByText(/Use the existing private note in the margin/)).toBeVisible();
    await expect(composer.getByRole('button', { name: 'Save as draft', exact: true })).toHaveCount(0);
    await expect(composer.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
    expect(creates).toBe(0);
    expect(psqlScalar(`SELECT count(*) FROM client_decisions WHERE project_id='${JOB}';`)).toBe(before);
    await sharedChoice.check();
    await expect(composer.getByText(/Project parties can see shared drafts/)).toBeVisible();
    expect(creates).toBe(0);
    await page.screenshot({ path: info.outputPath('shared-audience.png') });
    await composer.getByRole('button', { name: 'Save as draft', exact: true }).click();
    await expect.poll(() => psqlScalar(`SELECT count(*) FROM client_decisions WHERE ${owned} AND status='draft' AND sent_at IS NULL;`)).toBe('1');
    await expect(composer).toHaveCount(0);
    expect(creates).toBe(1);
    expect(externalSends).toBe(0);
    console.log('[N03 readback] Private creates=0; Shared draft=1, sent_at=NULL, external sends=0');
  } finally {
    try {
      psqlRun(`BEGIN;
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM client_decisions WHERE ${owned} AND designer_id IS DISTINCT FROM '${DESIGNER}')
            OR EXISTS (SELECT 1 FROM margin_notes WHERE ${ownedNote} AND designer_id IS DISTINCT FROM '${DESIGNER}')
          THEN RAISE EXCEPTION 'N03 fixture ownership changed'; END IF;
        END $$;
        SET LOCAL session_replication_role=replica;
        DELETE FROM client_decision_options WHERE decision_id IN (SELECT id FROM client_decisions WHERE ${owned});
        DELETE FROM client_decisions WHERE ${owned};
        DELETE FROM margin_notes WHERE ${ownedNote};
        SET LOCAL session_replication_role=origin;
        ${linked ? `SELECT set_config('request.jwt.claims', '{"sub":"${DESIGNER}","role":"authenticated"}', true);
        SELECT public.set_document_client('project', '${JOB}', NULL)
          WHERE EXISTS (SELECT 1 FROM projects WHERE id='${JOB}' AND designer_id='${DESIGNER}' AND client_id='${CLIENT}');
        DELETE FROM designer_clients WHERE id='${RELATIONSHIP}' AND designer_id='${DESIGNER}' AND client_id='${CLIENT}';` : ''}
        COMMIT;`);
      expect(psqlScalar(`SELECT count(*) FROM client_decisions WHERE ${owned};`)).toBe('0');
      expect(psqlScalar(`SELECT count(*) FROM margin_notes WHERE ${ownedNote};`)).toBe('0');
      expect(psqlScalar(`SELECT count(*) FROM designer_clients WHERE id='${RELATIONSHIP}';`)).toBe('0');
    } finally {
      if (!page.isClosed()) await page.unroute(sendRoute);
    }
  }
});
