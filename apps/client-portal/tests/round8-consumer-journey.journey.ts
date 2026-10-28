/**
 * RC-2 consumer journey, client legs (SQ-2329, repaired SQ-2337; A20, A22, X08).
 * Opt-in only: the `.journey.ts` name keeps it out of the default discovery,
 * and only playwright.consumer-journey.config.ts matches it. It runs between
 * the designer legs of apps/designer-portal/e2e/round8/consumer-journey.journey.ts
 * (see its header for the order), driven by run-consumer-journey.mjs against
 * the owned stack it started.
 *
 * Every answer goes through the client UI (respond_service_acceptance as the
 * signed-in signer); the database is only read back. The evidence each
 * request froze is read as the signed-in signer through the API, because the
 * client page shows only the references (rc2-consumer-walk.md, narrowed claims).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

const CLIENT = 'c2c20000-0000-4000-8000-000000000005';
const ACTORS = { client: 'rc2-client@patina.test', partner: 'rc2-partner@patina.test' } as const;
const PASSWORD = 'password123';
const SHARED_PORTS = new Set(['54321', '54322']);

/** Reads only, and only the owned stack the runner proved (never 54321/54322). */
function owned() {
  const env = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error(`RC2 client leg refused: ${key} is not set; run run-consumer-journey.mjs`);
    return value;
  };
  const db = new URL(env('SUPABASE_DB_URL'));
  const api = new URL(env('NEXT_PUBLIC_SUPABASE_URL'));
  for (const [url, port] of [[db, env('RC2_OWNED_DB_PORT')], [api, env('RC2_OWNED_API_PORT')]] as const) {
    if (url.hostname !== '127.0.0.1' || SHARED_PORTS.has(url.port) || url.port !== port) {
      throw new Error(`RC2 client leg refused: ${url.host} is not the owned local stack`);
    }
  }
  return { dbUrl: db.toString(), apiUrl: api.origin, anonKey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY') };
}

function sql(query: string): string {
  return execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', owned().dbUrl, '-c', query],
    { encoding: 'utf8' }).trim();
}

function job(): string {
  return sql(`SELECT id FROM public.projects WHERE client_id='${CLIENT}' ORDER BY created_at DESC LIMIT 1;`);
}

/** [id, lifecycle, aggregate_outcome, request_number, scope_edition_id, evidence_manifest_hash] of the newest request. */
function newest(project: string): string[] {
  return sql(`SELECT concat_ws('|', id, lifecycle, aggregate_outcome, request_number, scope_edition_id,
      evidence_manifest_hash)
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
  await password.fill(PASSWORD);
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

/** The page names the agreed edition and the frozen evidence reference of this request. */
async function expectReferences(page: Page, request: string[]) {
  const region = page.getByRole('region', { name: 'Agreed scope and evidence' });
  await expect(region).toContainText(request[3]!);
  await expect(region.locator('dt', { hasText: 'Agreed scope edition' }).locator('xpath=following-sibling::dd'))
    .toHaveText(request[4]!);
  await expect(region.locator('dt', { hasText: 'Evidence reference' })).toHaveText(`Evidence reference · ${request[5]!.slice(0, 12)}`);
}

/**
 * As the signed-in signer, through the API (no service key): the request's
 * evidence reader returns the agreed edition and the issued drawing set it
 * froze at send, and every listed file downloads with the bytes the studio
 * issued (sha256 equal to its plan print's).
 */
async function expectSignerEvidence(email: string, request: string[], title: string, files: number) {
  const { apiUrl, anonKey } = owned();
  const token = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  }).then(async (response) => {
    expect(response.status, `${email} signs in`).toBe(200);
    return ((await response.json()) as { access_token: string }).access_token;
  });
  const auth = { apikey: anonKey, Authorization: `Bearer ${token}` };
  const read = await fetch(`${apiUrl}/rest/v1/rpc/get_my_service_acceptance_evidence`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_request_id: request[0] }),
  });
  expect(read.status, `${email} reads the evidence of request ${request[3]}`).toBe(200);
  const evidence = await read.json() as {
    requestId: string; scope: { editionId: string };
    evidence: { manifestHash: string; members: { kind: string; title: string; documents: { path: string }[] }[] };
  };
  console.log('[RC2 signer evidence]', email, JSON.stringify(evidence.evidence.members));
  expect(evidence.requestId).toBe(request[0]);
  expect(evidence.scope.editionId, 'evidence reader names the agreed edition').toBe(request[4]);
  expect(evidence.evidence.manifestHash).toBe(request[5]);
  expect(evidence.evidence.members.map((member) => `${member.kind}:${member.title}`)).toEqual([`plan_issue:${title}`]);
  const documents = evidence.evidence.members[0]!.documents;
  expect(documents).toHaveLength(files);
  for (const document of documents) {
    const download = await fetch(`${apiUrl}/storage/v1/object/authenticated/project-documents/${document.path}`, { headers: auth });
    expect(download.status, `${email} downloads ${document.path}`).toBe(200);
    const body = Buffer.from(await download.arrayBuffer());
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(createHash('sha256').update(body).digest('hex'), `${document.path} is the issued print`).toBe(sql(`
      SELECT pr.sha256 FROM public.plan_prints pr JOIN public.project_documents d ON d.id = pr.project_document_id
      WHERE d.storage_path = '${document.path.replace(/'/g, "''")}';`));
  }
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
  await expectReferences(page, request);
  await expectSignerEvidence(ACTORS.client, request, 'RC2 fictional drawing set', 1);
  // A22: an opened (and read) request is not an answer.
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

  // The household partner holds a required slot, reads the revised set and answers online.
  const partner = await signIn(browser, ACTORS.partner, `/acceptance/${request[0]}`);
  await expect(partner.getByRole('heading', { level: 1, name: 'Service acceptance' })).toBeVisible({ timeout: 90_000 });
  await expectReferences(partner, request);
  await expectSignerEvidence(ACTORS.partner, request, 'RC2 fictional drawing set, revised', 2);
  await respond(partner, 'Accept');
  await partner.reload();
  await expect(partner.getByLabel('Responses')).toContainText('Waiting for response', { timeout: 60_000 });
  // A20: one required signer accepted, another pending: incomplete.
  expect(newest(project).slice(1, 3)).toEqual(['sent', 'pending']);

  const client = await signIn(browser, ACTORS.client, `/projects/${project}`);
  await openFromDoor(client, project, request);
  await expectReferences(client, request);
  await expectSignerEvidence(ACTORS.client, request, 'RC2 fictional drawing set, revised', 2);
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
  // The accepted request is on the job's agreed (active) edition.
  expect(sql(`SELECT status FROM public.project_scope_editions WHERE id='${request[4]}';`)).toBe('active');

  // X08: the existing client house page still renders with the new record on it,
  // and the decided request no longer offers a door.
  await client.goto(`/projects/${project}`);
  await expect(client.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 90_000 });
  await expect(client.getByRole('link', { name: /Waiting for your acceptance/ })).toHaveCount(0);
});
