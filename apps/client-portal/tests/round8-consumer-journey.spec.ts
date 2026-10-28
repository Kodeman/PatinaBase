/**
 * RC-2 consumer journey, client legs (SQ-2329; A20, A22, X08). Runs between
 * the designer legs in apps/designer-portal/e2e/round8/consumer-journey.spec.ts
 * (see its header for the order) against the same owned local stack, with the
 * client portal on port 3202. Run ad hoc with --config naming baseURL
 * http://localhost:3202 and SUPABASE_DB_URL on 127.0.0.1.
 *
 * Every answer goes through the client UI (respond_service_acceptance as the
 * signed-in signer); the database is only read back.
 */
import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';

const CLIENT = 'c2c20000-0000-4000-8000-000000000005';
const ACTORS = { client: 'rc2-client@patina.test', partner: 'rc2-partner@patina.test' } as const;
const DB_URL = process.env.SUPABASE_DB_URL ?? '';

function sql(query: string): string {
  if (new URL(DB_URL).hostname !== '127.0.0.1') throw new Error('RC2 client leg reads only a 127.0.0.1 database');
  return execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', DB_URL, '-c', query],
    { encoding: 'utf8' }).trim();
}

function job(): string {
  return sql(`SELECT id FROM public.projects WHERE client_id='${CLIENT}' ORDER BY created_at DESC LIMIT 1;`);
}

/** [id, lifecycle, aggregate_outcome, request_number] of the newest request. */
function newest(project: string): string[] {
  return sql(`SELECT concat_ws('|', id, lifecycle, aggregate_outcome, request_number)
    FROM public.service_acceptance_requests WHERE project_id='${project}' ORDER BY created_at DESC LIMIT 1;`).split('|');
}

function responses(request: string): string {
  return sql(`SELECT COALESCE(json_agg(json_build_object('slot', s.slot, 'answer', r.response, 'method', r.method,
      'conditions', r.conditions, 'reason', r.return_reason) ORDER BY s.slot), '[]')
    FROM public.service_acceptance_responses r JOIN public.service_acceptance_signers s ON s.id = r.signer_id
    WHERE r.request_id='${request}';`);
}

async function signIn(browser: Browser, email: string, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(path)}`);
  const password = page.locator('#portal-auth-password');
  const disclosure = page.getByRole('button', { name: 'Use a password instead' });
  page.on('pageerror', (error) => console.log(`[RC2 ${email} pageerror]`, error.message));
  // A click before hydration (cold dev compile) is lost: retries reload, then
  // click only while the panel reads closed, so no retry toggles it shut.
  let attempt = 0;
  await expect(async () => {
    if (attempt++ > 0) await page.reload({ waitUntil: 'load' });
    if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click();
    await expect(password).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 150_000 });
  await page.getByLabel(/email/i).first().fill(email);
  await password.fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), { timeout: 90_000 });
  return page;
}

/** The project page's door names the request; opening it records nothing (A22). */
async function openFromDoor(page: Page, project: string, request: string[]) {
  await page.goto(`/projects/${project}`);
  const door = page.getByRole('complementary', { name: 'Service acceptance' })
    .getByRole('link', { name: `Waiting for your acceptance · Request ${request[3]}` });
  await expect(door).toBeVisible({ timeout: 90_000 });
  await door.click();
  await expect(page).toHaveURL(new RegExp(`/acceptance/${request[0]}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Service acceptance' })).toBeVisible({ timeout: 60_000 });
}

async function respond(page: Page, answer: 'Accept' | 'Accept with conditions' | 'Return', fill?: (page: Page) => Promise<void>) {
  const form = page.getByRole('region', { name: 'Your response' });
  await form.getByRole('button', { name: answer, exact: true }).click();
  if (fill) await fill(page);
  await form.getByRole('button', { name: 'Review response' }).click();
  await form.getByRole('button', { name: 'Confirm response' }).click();
  // The receipt, then the refetched reading, both carry the recorded answer.
  await expect(page.getByLabel('Your recorded response').first()).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

test('@rc2-return the client returns request 1 with a reason; viewing alone recorded nothing', async ({ browser }) => {
  const project = job();
  const request = newest(project);
  expect(request.slice(1, 3), 'designer leg sent request 1').toEqual(['sent', 'pending']);
  const page = await signIn(browser, ACTORS.client, `/projects/${project}`);
  await openFromDoor(page, project, request);
  await expect(page.getByRole('region', { name: 'Agreed scope and evidence' })).toContainText(request[3]!);
  // A22: an opened request is not an answer.
  expect(responses(request[0]!)).toBe('[]');
  expect(newest(project).slice(1, 3)).toEqual(['sent', 'pending']);

  await respond(page, 'Return', async (p) => {
    await p.getByLabel('Reason for returning').fill('Fictional: the living room scope is missing the reading lamp.');
  });
  const readback = responses(request[0]!);
  console.log('[RC2 return readback]', readback, newest(project).join('|'));
  expect(JSON.parse(readback)).toEqual([expect.objectContaining({ slot: 'client', answer: 'return',
    method: 'portal_authenticated' })]);
  expect(newest(project).slice(1, 3)).toEqual(['closed', 'returned']);
});

test('@rc2-accept one required signer accepting is held; the client accepts with a condition', async ({ browser }) => {
  const project = job();
  const request = newest(project);
  expect(request.slice(1, 3), 'designer leg sent request 3').toEqual(['sent', 'pending']);

  // The household partner holds a required slot and answers online.
  const partner = await signIn(browser, ACTORS.partner, `/acceptance/${request[0]}`);
  await expect(partner.getByRole('heading', { level: 1, name: 'Service acceptance' })).toBeVisible({ timeout: 90_000 });
  await respond(partner, 'Accept');
  await partner.reload();
  await expect(partner.getByLabel('Responses')).toContainText('Waiting for response', { timeout: 60_000 });
  // A20: one required signer accepted, another pending: incomplete.
  expect(newest(project).slice(1, 3)).toEqual(['sent', 'pending']);

  const client = await signIn(browser, ACTORS.client, `/projects/${project}`);
  await openFromDoor(client, project, request);
  await respond(client, 'Accept with conditions', async (p) => {
    await p.getByRole('textbox', { name: 'Condition 1' }).fill('Fictional: touch up the hallway paint before closeout.');
  });
  const readback = responses(request[0]!);
  console.log('[RC2 accept readback]', readback, newest(project).join('|'));
  expect(JSON.parse(readback)).toEqual([
    expect.objectContaining({ slot: 'client', answer: 'accept_with_conditions', method: 'portal_authenticated' }),
    expect.objectContaining({ slot: 'partner', answer: 'accept', method: 'portal_authenticated' }),
  ]);
  expect(newest(project).slice(1, 3)).toEqual(['closed', 'accepted_with_conditions']);

  // X08: the existing client house page still renders with the new record on it,
  // and the decided request no longer offers a door.
  await client.goto(`/projects/${project}`);
  await expect(client.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 90_000 });
  await expect(client.getByRole('link', { name: /Waiting for your acceptance/ })).toHaveCount(0);
});
