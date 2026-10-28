/**
 * RC-2 consumer journey, designer legs (SQ-2329; A20–A23, X08).
 *
 * The journey alternates portals, so each leg is a tagged test run on its own,
 * in this order, against one owned local stack (edge-runtime on, functions env
 * EMAIL_DEV_MODE=dry_run, no RESEND_API_KEY):
 *
 *   1. designer  --grep @rc2-send      fixture + draft request 1 + V22 Send
 *   2. client    --grep @rc2-return    client returns request 1
 *   3. designer  --grep @rc2-resend    request 2 + Send; request 3 supersedes the
 *                                      open request 2 + Send
 *   4. client    --grep @rc2-accept    partner accepts request 3; held at one of
 *                                      two; client accepts with a condition
 *   5. designer  --grep @rc2-complete  complete, resolve condition, care return,
 *                                      revoke
 *
 * Designer runs use playwright.round8.config.ts with --project chromium and
 * PLAYWRIGHT_DESIGNER_PORT; the DB URL is SUPABASE_DB_URL (127.0.0.1 only).
 * Lifecycle, address, response and completion rows are only ever read here.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRow, psqlScalar } from '../helpers/psql';

const CLIENT = 'c2c20000-0000-4000-8000-000000000005';
const CLIENT_EMAIL = 'rc2-client@patina.test';
const DB_URL = process.env.SUPABASE_DB_URL ?? '';

function applyFixture(): string {
  const db = new URL(DB_URL);
  if (db.hostname !== '127.0.0.1') throw new Error('RC2 fixture refuses a non-local database');
  return execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', `expected_port=${db.port}`,
    DB_URL, '-f', path.join(__dirname, 'consumer-journey-fixture.sql')], { encoding: 'utf8' });
}

/** The newest RC2 job: each fixture application composes a fresh one. */
function job(): string {
  const id = psqlScalar(`SELECT id FROM public.projects WHERE client_id='${CLIENT}' ORDER BY created_at DESC LIMIT 1;`);
  expect(id, 'RC2 job exists').toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

/** [id, lifecycle, aggregate_outcome, outbound_draft_id, superseded_reason, request_number] newest first. */
function requests(project: string): string[][] {
  return psqlScalar(`SELECT string_agg(concat_ws('|', id, lifecycle, aggregate_outcome, outbound_draft_id,
      COALESCE(superseded_reason, '-'), request_number), E'\\n' ORDER BY created_at DESC)
    FROM public.service_acceptance_requests WHERE project_id='${project}';`)
    .split('\n').filter(Boolean).map((line) => line.split('|'));
}

async function openCloseout(page: Page, project: string) {
  await page.goto(`/doc/${project}`);
  const section = page.locator('[data-service-acceptance]');
  await expect(section).toBeAttached({ timeout: 120_000 });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText('Reading service acceptance…')).toHaveCount(0, { timeout: 60_000 });
  return section;
}

/** Draft through the UI, then V22: Ready to send shows the address, Send, DB reads `sent`. */
async function draftAndSend(page: Page, project: string, before: number) {
  const section = await openCloseout(page, project);
  await section.getByRole('button', { name: /^Draft (the|a new) request$/ }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Request drafted.' })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => requests(project).length, { timeout: 30_000 }).toBe(before + 1);
  const [requestId, lifecycle, , draftId] = requests(project)[0]!;
  expect(lifecycle).toBe('draft');
  // 00890: the draft is addressed to the project client's profile email.
  expect(psqlRow(`SELECT to_address, status, recipient_kind FROM public.outbound_drafts WHERE id='${draftId}';`))
    .toEqual([CLIENT_EMAIL, 'awaiting_review', 'client']);

  const card = section.locator(`[data-service-acceptance-request="${requestId}"]`);
  await card.getByRole('button', { name: 'Review and send' }).click();
  const sheet = page.getByTestId('ready-to-send-sheet');
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  const row = sheet.locator(`[data-outbound-row="${draftId}"]`);
  await expect(row).toContainText(`To ${CLIENT_EMAIL}`);
  await row.getByRole('checkbox', { name: new RegExp(`to ${CLIENT_EMAIL.replace(/\./g, '\\.')}$`) }).check();
  await sheet.getByRole('button', { name: 'Send the 1 checked' }).click();
  await expect(row.locator('[data-outbound-row-state]')).toHaveText('Sent', { timeout: 90_000 });

  // DB readback: V22 reached `sent` and the request went out (no hand-set rows).
  await expect.poll(() => psqlScalar(`SELECT status FROM public.outbound_drafts WHERE id='${draftId}';`),
    { timeout: 60_000 }).toBe('sent');
  await expect.poll(() => psqlScalar(`SELECT lifecycle FROM public.service_acceptance_requests WHERE id='${requestId}';`),
    { timeout: 30_000 }).toBe('sent');
  const readback = psqlScalar(`SELECT json_build_object('request', r.id, 'number', r.request_number,
      'lifecycle', r.lifecycle, 'sentAt', r.sent_at, 'scopeEdition', r.scope_edition_id,
      'editionActive', e.status = 'active', 'scopeHashMatches', r.scope_content_hash = e.content_hash,
      'requiredSigners', (SELECT count(*) FROM public.service_acceptance_signers s
        WHERE s.request_id = r.id AND s.required AND s.status = 'active'),
      'draft', json_build_object('id', d.id, 'status', d.status, 'to', d.to_address, 'sentAt', d.sent_at))
    FROM public.service_acceptance_requests r JOIN public.project_scope_editions e ON e.id = r.scope_edition_id
    JOIN public.outbound_drafts d ON d.id = r.outbound_draft_id WHERE r.id = '${requestId}';`);
  console.log('[RC2 send readback]', readback);
  const parsed = JSON.parse(readback);
  expect(parsed).toMatchObject({ lifecycle: 'sent', editionActive: true, scopeHashMatches: true, requiredSigners: 2,
    draft: { status: 'sent', to: CLIENT_EMAIL } });
  return requestId;
}

test.describe('RC-2 consumer journey — designer', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'one designer walk; the client leg owns its own browser');
  test.setTimeout(300_000);

  test('@rc2-send drafts the request against the agreed edition and sends it through V22', async ({
    authenticatedPage: page,
  }) => {
    console.log('[RC2 fixture]', applyFixture().trim());
    const project = job();
    expect(requests(project)).toHaveLength(0);
    await draftAndSend(page, project, 0);
  });

  test('@rc2-resend sends new evidence after the return, and a successor supersedes the open request', async ({
    authenticatedPage: page,
  }) => {
    const project = job();
    const [first] = requests(project);
    // 00886: a decided outcome closes the request ((lifecycle='closed') = (outcome<>'pending')).
    expect(first?.slice(1, 3), 'request 1 was returned by the client leg').toEqual(['closed', 'returned']);
    // A20: a rejection requires a new request (new evidence), never a reopened one.
    const second = await draftAndSend(page, project, 1);
    // Supersession: drafting again while request 2 is open replaces it.
    const third = await draftAndSend(page, project, 2);
    const rows = requests(project);
    expect(rows.map((row) => row[0])).toEqual([third, second, first![0]]);
    expect(rows[1]!.slice(1, 3)).toEqual(['superseded', 'pending']);
    expect(rows[1]![4]).toBe('successor_request');
    expect(rows[2]!.slice(1, 3)).toEqual(['closed', 'returned']);
    expect(psqlScalar(`SELECT predecessor_request_id FROM public.service_acceptance_requests WHERE id='${third}';`))
      .toBe(second);
    const section = await openCloseout(page, project);
    await expect(section.locator(`[data-service-acceptance-request="${second}"]`))
      .toContainText('Replaced because a newer request took its place.');
  });

  test('@rc2-complete completes the service, resolves the condition, returns from care, and revokes', async ({
    authenticatedPage: page,
  }) => {
    const project = job();
    const [current] = requests(project);
    expect(current?.slice(1, 3), 'request 3 accepted with conditions by the client leg')
      .toEqual(['closed', 'accepted_with_conditions']);
    const closure = psqlRow(`SELECT status, COALESCE(closure_checklist::text, '-') FROM public.projects WHERE id='${project}';`);

    await openCloseout(page, project);
    const service = page.locator('[data-studio-service]');
    await service.scrollIntoViewIfNeeded();
    // A22: the client's open condition is visible; it does not hide the act (K3 option A).
    await expect(service.getByRole('button', { name: 'Complete studio service' })).toBeEnabled({ timeout: 60_000 });
    await service.getByRole('button', { name: 'Complete studio service' }).click();
    await expect(service.locator('[data-studio-service-state="completed_with_conditions"]')).toBeVisible({ timeout: 60_000 });
    expect(psqlRow(`SELECT state, acceptance_request_id FROM public.studio_service_completions
      WHERE project_id='${project}' AND revoked_at IS NULL;`)).toEqual(['completed_with_conditions', current![0]]);
    // A21: service completion is not project closure.
    expect(psqlRow(`SELECT status, COALESCE(closure_checklist::text, '-') FROM public.projects WHERE id='${project}';`))
      .toEqual(closure);

    const open = service.locator('[data-open-condition]').first();
    await open.getByRole('button', { name: 'Resolve this condition' }).click();
    const form = service.getByRole('form', { name: /^Resolve: / });
    await form.getByLabel('How it was resolved').fill('Fictional: confirmed on site with the client.');
    const picker = form.getByRole('combobox');
    await picker.selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Record the resolution' }).click();
    await expect(service.locator('[data-open-condition]')).toHaveCount(0, { timeout: 60_000 });
    expect(psqlScalar(`SELECT count(*) FROM public.service_acceptance_condition_resolutions
      WHERE request_id='${current![0]}';`)).toBe('1');

    // A23: care references name the accepted edition and return to Closeout.
    const care = service.locator('[data-care-references]');
    await expect(care).toContainText(`accepted on request ${current![5]}`);
    const opener = care.getByRole('link', { name: 'Open the specification' });
    await opener.click();
    await expect(page).toHaveURL(/unfold=pieces/, { timeout: 60_000 });
    expect(new URL(page.url()).pathname, 'unfolds over the paper, no route change').toBe(`/doc/${project}`);
    const unfold = page.locator('[data-unfold-instrument="pieces"]');
    await expect(unfold).toBeVisible({ timeout: 60_000 });
    // Esc folds back only once the unfold holds focus (ffe-unfold.spec.ts pattern).
    await expect.poll(() => unfold.evaluate((node) => node.contains(document.activeElement)), { timeout: 30_000 }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(unfold).toHaveCount(0, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('unfold')).toBeNull();
    await expect(opener, 'care reference returns to its opener in Closeout').toBeFocused({ timeout: 30_000 });

    await service.getByRole('button', { name: 'Revoke this completion' }).click();
    const revoke = service.getByRole('form', { name: 'Revoke this completion' });
    await revoke.getByLabel('Why it is revoked').fill('Fictional: punch list reopened.');
    await revoke.getByRole('button', { name: 'Revoke' }).click();
    await expect.poll(() => psqlScalar(`SELECT count(*) FROM public.studio_service_completions
      WHERE project_id='${project}' AND revoked_at IS NOT NULL;`), { timeout: 60_000 }).toBe('1');
    const readback = psqlScalar(`SELECT json_agg(json_build_object('completion', c.id, 'state', c.state,
        'request', c.acceptance_request_id, 'revokedAt', c.revoked_at, 'revokeReason', c.revoke_reason))
      FROM public.studio_service_completions c WHERE c.project_id='${project}';`);
    console.log('[RC2 completion readback]', readback);
    expect(psqlRow(`SELECT status, COALESCE(closure_checklist::text, '-') FROM public.projects WHERE id='${project}';`))
      .toEqual(closure);
  });
});
