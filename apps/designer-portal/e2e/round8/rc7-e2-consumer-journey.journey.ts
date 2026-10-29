/**
 * RC-7 lane e2: service acceptance, paper, completion and care journeys
 * (A20–A23; R3b findings 2 and 4). Opt-in only: the `.journey.ts` name keeps it
 * out of every default discovery. rc7-e2-run.mjs runs it through
 * rc7-e2-consumer-journey.spec.ts under playwright.round8.config.ts (projects
 * chromium and webkit-iphone; each project applies its own fresh jobs), against
 * the owned stack it started and proved, with the client portal it keeps up on
 * RC7_CLIENT_URL. playwright.consumer-journey.config.ts (chromium) also matches it:
 *
 *   @rc7-e2-acceptance  applies consumer-journey-fixture.sql + rc7-e2-fixture.sql
 *                       (fresh jobs), then job A (client-buy, two required signers):
 *                       R1 delivered, opened, read through the page, returned;
 *                       R2 on new evidence, one of two accepts, then an executed
 *                       amendment supersedes it; R3 on the new edition, one of two
 *                       accepts, a signer is replaced, the replacement accepts with
 *                       a condition.
 *   @rc7-e2-paper       job P (two household members with no account): presented
 *                       on paper, recorded, stamped, reviewed by a second admin.
 *   @rc7-e2-completion  job A (held by an open included phase, then completed with
 *                       conditions, care), job F (full service), job D (design only,
 *                       walkthrough, close, a later care question).
 *
 * Every actor works in their own browser context (the designer and client share
 * one localhost auth cookie name), on the running project's device. Acts go
 * through the product's UI, or its RPC or API over HTTP with the real actor's
 * own session where the UI has no control; psql (postgres) only applies the
 * fixtures and reads back. Every transition is followed by a DB readback.
 * Nothing here writes a request, response, intake, completion or outbound row directly.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';

const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const DESIGNER_EMAIL = 'f01-designer@test.invalid';
const ADMIN_EMAIL = 'rc2-admin@test.invalid';
const ACTOR = {
  client: { id: 'c2c20000-0000-4000-8000-000000000005', email: 'rc2-client@patina.test' },
  partner: { id: 'c2c20000-0000-4000-8000-000000000006', email: 'rc2-partner@patina.test' },
  third: { id: 'c2c20000-0000-4000-8000-000000000008', email: 'rc7-third@patina.test' },
  paper: { id: 'c2c20000-0000-4000-8000-000000000009', email: 'rc7-paper-client@patina.test' },
  full: { id: 'c2c20000-0000-4000-8000-00000000000a', email: 'rc7-full-client@patina.test' },
  design: { id: 'c2c20000-0000-4000-8000-00000000000b', email: 'rc7-design-client@patina.test' },
} as const;
const THIRD_CARD = 'c2c26000-0000-4000-8000-000000000003';
const PAPER_CARDS = { one: 'RC7 Paper Signer One', two: 'RC7 Paper Signer Two' } as const;
const PASSWORD = 'password123';
const SHARED_PORTS = new Set(['54321', '54322']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

// ── The owned stack (refuses anything else before a write) ─────────────────

function owned() {
  const env = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error(`RC7 e2 journey refused: ${key} is not set; run rc7-e2-run.mjs`);
    return value;
  };
  const ids = { dbPort: env('RC2_OWNED_DB_PORT'), apiPort: env('RC2_OWNED_API_PORT'),
    serverAddr: env('RC2_OWNED_SERVER_ADDR'), systemId: env('RC2_OWNED_SYSTEM_ID') };
  const db = new URL(env('SUPABASE_DB_URL'));
  const api = new URL(env('NEXT_PUBLIC_SUPABASE_URL'));
  const client = new URL(env('RC7_CLIENT_URL'));
  for (const [name, url, port] of [['database', db, ids.dbPort], ['API', api, ids.apiPort]] as const) {
    if (!LOOPBACK.has(url.hostname) || SHARED_PORTS.has(url.port) || url.port !== port) {
      throw new Error(`RC7 e2 journey refused: ${name} ${url.host} is not the owned local stack`);
    }
  }
  if (!LOOPBACK.has(client.hostname)) throw new Error('RC7 e2 journey refused: the client portal is not local');
  return { ...ids, dbUrl: db.toString(), apiUrl: api.origin, anonKey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), clientUrl: client.origin };
}

/** Reads (and fixture application) as postgres, only on the owned stack. */
function sql(query: string): string {
  return execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', owned().dbUrl, '-c', query],
    { encoding: 'utf8' }).trim();
}

function json<T = Record<string, unknown>>(query: string): T {
  return JSON.parse(sql(query)) as T;
}

/** A signed-in actor's own session against the API (no service key); one per fixture application. */
const sessions = new Map<string, string>();
async function token(email: string): Promise<string> {
  const cached = sessions.get(email);
  if (cached) return cached;
  const { apiUrl, anonKey } = owned();
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(response.status, `${email} signs in`).toBe(200);
  const access = ((await response.json()) as { access_token: string }).access_token;
  sessions.set(email, access);
  return access;
}

async function rpcAs(email: string, name: string, args: Record<string, unknown>) {
  const { apiUrl, anonKey } = owned();
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', body: JSON.stringify(args),
    headers: { apikey: anonKey, Authorization: `Bearer ${await token(email)}`, 'Content-Type': 'application/json' },
  });
  return { status: response.status, body: await response.text() };
}

/** A transition as the real signed-in actor, through the API (authenticated HTTP, the actor's own JWT). */
async function actAs<T = unknown>(email: string, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await rpcAs(email, name, args);
  expect(result.status, `${name} as ${email}: ${result.body}`).toBeLessThan(300);
  return (result.body ? JSON.parse(result.body) : null) as T;
}

/** A refusal as PostgREST returns it: the HTTP status, the SQLSTATE and the RAISE message. */
function refusal(result: { status: number; body: string }): { status: number; code?: string; message?: string } {
  const body = JSON.parse(result.body) as { code?: string; message?: string };
  return { status: result.status, code: body.code, message: body.message };
}

// ── Fixture ────────────────────────────────────────────────────────────────

/** A small, valid one-page PDF naming the fictional sheet. */
function pdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const sha256 = (body: Buffer) => createHash('sha256').update(body).digest('hex');

/** Upload the drawing prints through the Storage API, then apply both fixtures (fresh jobs). */
async function applyFixtures() {
  const target = owned();
  const run = randomUUID();
  sessions.clear();
  const files = [
    { path: `${run}/rc7-e2/a-101.pdf`, body: pdf(`RC7 fictional A-101 plan ${run}`) },
    { path: `${run}/rc7-e2/a-201.pdf`, body: pdf(`RC7 fictional A-201 elevations ${run}`) },
  ];
  for (const file of files) {
    const response = await fetch(`${target.apiUrl}/storage/v1/object/project-documents/${file.path}`, {
      method: 'POST', body: new Uint8Array(file.body),
      headers: { Authorization: `Bearer ${target.serviceKey}`, apikey: target.serviceKey, 'Content-Type': 'application/pdf' },
    });
    expect(response.status, `upload ${file.path}`).toBe(200);
  }
  const out = execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-v', `owned_port=${target.dbPort}`, '-v', `owned_server_addr=${target.serverAddr}`,
    '-v', `owned_system_id=${target.systemId}`,
    '-v', `evidence_path_1=${files[0]!.path}`, '-v', `evidence_sha_1=${sha256(files[0]!.body)}`,
    '-v', `evidence_path_2=${files[1]!.path}`, '-v', `evidence_sha_2=${sha256(files[1]!.body)}`,
    target.dbUrl, '-f', path.join(__dirname, 'rc7-e2-fixture.sql')], { encoding: 'utf8' });
  console.log('[RC7 e2 fixture]', out.trim());
  return JSON.parse(out.trim().split('\n').pop()!) as { rc7_jobs: Record<'a' | 'paper' | 'full' | 'design', string> };
}

/** The newest job of a client: each fixture application composes fresh ones. */
function jobOf(client: string): string {
  const id = sql(`SELECT id FROM public.projects WHERE client_id='${client}' ORDER BY created_at DESC LIMIT 1;`);
  expect(id, `job of ${client}`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

function manifest(project: string, key: string): string {
  const id = sql(`SELECT id FROM public.evidence_manifests WHERE project_id='${project}'
    AND purpose='service_acceptance' AND idempotency_key='${key}';`);
  expect(id, `evidence set ${key}`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

function activeEdition(project: string): { id: string; number: number; hash: string } {
  return json(`SELECT json_build_object('id', id, 'number', edition_number, 'hash', content_hash)
    FROM public.project_scope_editions WHERE project_id='${project}' AND status='active';`);
}

type RequestRow = { id: string; number: number; lifecycle: string; outcome: string; edition: string;
  scopeHash: string; evidenceHash: string; revision: number; superseded: string | null; offline: string | null };

function request(id: string): RequestRow {
  return json(`SELECT json_build_object('id', id, 'number', request_number, 'lifecycle', lifecycle,
      'outcome', aggregate_outcome, 'edition', scope_edition_id, 'scopeHash', scope_content_hash,
      'evidenceHash', evidence_manifest_hash, 'revision', signer_policy_revision, 'superseded', superseded_reason,
      'offline', offline_presented_at)
    FROM public.service_acceptance_requests WHERE id='${id}';`);
}

function newestRequest(project: string): RequestRow {
  return request(sql(`SELECT id FROM public.service_acceptance_requests WHERE project_id='${project}'
    ORDER BY request_number DESC LIMIT 1;`));
}

function requestCount(project: string): number {
  return Number(sql(`SELECT count(*) FROM public.service_acceptance_requests WHERE project_id='${project}';`));
}

/** The audit of a replaced client slot: the replaced row, its successor and the request revision. */
function replacementAudit(requestId: string): Record<string, unknown> {
  return json(`SELECT json_build_object('status', s.status, 'reason', s.replacement_reason,
      'by', s.replaced_by, 'at', s.replaced_at IS NOT NULL, 'revision', s.replacement_policy_revision,
      'successorCard', n.household_person_id, 'successorStatus', n.status, 'successorRequired', n.required,
      'requestRevision', r.signer_policy_revision)
    FROM public.service_acceptance_signers s JOIN public.service_acceptance_signers n ON n.id = s.replaced_by_signer_id
    JOIN public.service_acceptance_requests r ON r.id = s.request_id
    WHERE s.request_id='${requestId}' AND s.slot='client' AND s.status='replaced';`);
}

type ResponseRow = { slot: string; answer: string; method: string; responder: string | null; intake: string | null;
  conditions: { text: string }[]; reason: string | null };

function responses(requestId: string): ResponseRow[] {
  return json(`SELECT COALESCE(json_agg(json_build_object('slot', s.slot, 'answer', r.response, 'method', r.method,
      'responder', r.responder_profile_id, 'intake', r.paper_intake_id, 'conditions', r.conditions,
      'reason', r.return_reason) ORDER BY s.slot), '[]')
    FROM public.service_acceptance_responses r JOIN public.service_acceptance_signers s ON s.id = r.signer_id
    WHERE r.request_id='${requestId}';`);
}

/** The frozen send-time evidence of a request: member titles and pinned files. */
function frozen(requestId: string): { members: string[]; files: string[] } {
  return json(`SELECT json_build_object(
      'members', COALESCE((SELECT json_agg(member_kind || ':' || title ORDER BY ordinal)
        FROM public.service_acceptance_evidence_snapshots WHERE request_id='${requestId}'), '[]'),
      'files', COALESCE((SELECT json_agg(bucket_id || '/' || object_name ORDER BY ordinal, object_name)
        FROM public.service_acceptance_evidence_snapshot_objects WHERE request_id='${requestId}'), '[]'));`);
}

/** Project closure state C6 must never touch. */
function closure(project: string): string {
  return sql(`SELECT concat_ws('|', status, COALESCE(closure_checklist::text, '-'), COALESCE(portfolio_snapshot::text, '-'))
    FROM public.projects WHERE id='${project}';`);
}

function obligations(project: string): { blockers: string[]; info: string[] } {
  return json(`SELECT json_build_object(
      'blockers', COALESCE((SELECT json_agg(b->>'code' || ':' || COALESCE(b->>'packageKey', '-') ORDER BY b->>'code', b->>'packageKey')
        FROM jsonb_array_elements(x->'blockers') b), '[]'),
      'info', COALESCE((SELECT json_agg(i->>'code' || ':' || COALESCE(i->>'packageKey', '-') ORDER BY i->>'code', i->>'packageKey')
        FROM jsonb_array_elements(x->'informational') i), '[]'))
    FROM public._derive_studio_service_obligations('${project}') x;`);
}

function completions(project: string): { state: string; request: string; edition: string; revoked: string | null }[] {
  return json(`SELECT COALESCE(json_agg(json_build_object('state', state, 'request', acceptance_request_id,
      'edition', scope_edition_id, 'revoked', revoked_at) ORDER BY completed_at), '[]')
    FROM public.studio_service_completions WHERE project_id='${project}';`);
}

/** Money and acceptance rows a later question must not create. */
function ledger(project: string): string {
  return sql(`SELECT concat_ws('|', (SELECT count(*) FROM public.invoices WHERE project_id='${project}'),
    (SELECT count(*) FROM public.service_acceptance_requests WHERE project_id='${project}'),
    (SELECT count(*) FROM public.scope_change_requests WHERE project_id='${project}'),
    (SELECT count(*) FROM public.studio_service_completions WHERE project_id='${project}'));`);
}

function phases(project: string): { id: string; name: string; status: string }[] {
  return json(`SELECT COALESCE(json_agg(json_build_object('id', id, 'name', name, 'status', status)
    ORDER BY sort_order, name), '[]') FROM public.project_phases WHERE project_id='${project}';`);
}

const today = () => new Date().toISOString().slice(0, 10);

/** The closeout checklist close_project requires, every item completed. */
const CHECKLIST = ['walkthrough', 'punch_list', 'payment', 'photography', 'photos', 'case_study']
  .map((key) => ({ key, completed: true }));

/** The designer closes the project (close_project, with their own session); the HTTP result, refused or not. */
function closeProject(project: string, snapshot: Record<string, unknown> | null = null) {
  return rpcAs(DESIGNER_EMAIL, 'close_project', { p_project_id: project, p_closure: CHECKLIST, p_snapshot: snapshot });
}

/** The financial closeout the service section shows beside (never inside) the obligations. */
function financialHold(project: string): { openInvoiceCount: number; balanceCents: number; uncollectedContractCents: number } {
  return json(`SELECT public._service_completion_financial_hold('${project}');`);
}

/** The designer completes each open phase through advance_project_phase (the phase control's RPC). */
async function completePhases(project: string) {
  // Completing one phase may start its successor: walk until none is in progress.
  for (let round = 0; round < 6; round += 1) {
    const open = phases(project).filter((row) => row.status === 'in_progress');
    if (open.length === 0) break;
    for (const phase of open) {
      await actAs(DESIGNER_EMAIL, 'advance_project_phase',
        { p_project_id: project, p_phase_id: phase.id, p_expected_status: 'in_progress' });
    }
  }
  expect(phases(project).map((row) => row.status), 'every phase completed').toEqual(
    phases(project).map(() => 'completed'));
}

// ── Browser actors ─────────────────────────────────────────────────────────

/** Each actor in its own context: the portals share one localhost cookie name. */
async function signIn(browser: Browser, base: string, email: string, landing: string): Promise<Page> {
  // The running project's device (Desktop Chrome, or iPhone 14 on webkit-iphone) applies to every actor.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = test.info().project.use;
  const context = await browser.newContext({ baseURL: base, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  // As e2e/fixtures/auth.ts does: the first-sign-in welcome dialog never opens.
  await context.addInitScript(() => {
    try { window.localStorage.setItem('help-system.welcome-shown.first-project-walkthrough', '1'); } catch { /* none */ }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`[RC7 ${email} pageerror]`, error.message));
  await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(landing)}`, { timeout: 180_000, waitUntil: 'domcontentloaded' });
  const disclosure = page.getByRole('button', { name: /use a password instead|use email and password instead|sign in with email/i });
  const password = page.locator('input[type="password"]').first();
  const signedIn = (url: URL) => !url.pathname.includes('/auth/signin');
  // A sign-in the local auth service times out on reads "Sign-in unsuccessful":
  // start again. The landing page's cold dev compile can take minutes.
  for (let round = 1; ; round += 1) {
    // A click before hydration (cold dev compile) is lost: reload and retry.
    let attempt = 0;
    await expect(async () => {
      if (attempt++ > 0) await page.reload({ waitUntil: 'load' });
      if (!(await password.isVisible()) && await disclosure.first().getAttribute('aria-expanded') !== 'true') {
        await disclosure.first().click();
      }
      await expect(password).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 180_000 });
    await page.getByLabel(/email/i).first().fill(email);
    await password.fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    const outcome = await Promise.race([
      page.waitForURL(signedIn, { timeout: 240_000, waitUntil: 'commit' }).then(() => 'in'),
      page.getByText('Sign-in unsuccessful').waitFor({ timeout: 240_000 }).then(() => 'refused'),
    ]);
    if (outcome === 'in') return page;
    console.log(`[RC7 ${email}] sign-in refused by the local auth service (round ${round}); retrying`);
    if (round === 3) throw new Error(`${email} could not sign in after ${round} rounds`);
    await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(landing)}`, { timeout: 180_000, waitUntil: 'domcontentloaded' });
  }
}

const designerBase = () => test.info().project.use.baseURL!;

async function designer(browser: Browser, email = DESIGNER_EMAIL) {
  return signIn(browser, designerBase(), email, '/desk');
}

async function client(browser: Browser, email: string, landing: string) {
  return signIn(browser, owned().clientUrl, email, landing);
}

async function openCloseout(page: Page, project: string) {
  await page.goto(`/doc/${project}`, { timeout: 180_000, waitUntil: 'domcontentloaded' });
  const section = page.locator('[data-service-acceptance]');
  await expect(section).toBeAttached({ timeout: 180_000 });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText('Reading service acceptance…')).toHaveCount(0, { timeout: 60_000 });
  return section;
}

/** Draft through the UI on the chosen evidence set. Returns the new request. */
async function draft(page: Page, project: string, manifestId: string): Promise<RequestRow> {
  const before = requestCount(project);
  const section = await openCloseout(page, project);
  await section.getByLabel('Evidence the client reviews').selectOption(manifestId);
  await section.getByRole('button', { name: /^Draft (the|a new) request$/ }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Request drafted.' })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => requestCount(project), { timeout: 30_000 }).toBe(before + 1);
  const row = newestRequest(project);
  expect(row.lifecycle).toBe('draft');
  expect(row.edition, 'the draft binds the agreed edition').toBe(activeEdition(project).id);
  expect(sql(`SELECT evidence_manifest_id FROM public.service_acceptance_requests WHERE id='${row.id}';`)).toBe(manifestId);
  return row;
}

function openNotices(requestId: string): { id: string; to: string | null }[] {
  return json(`SELECT COALESCE(json_agg(json_build_object('id', id, 'to', to_address) ORDER BY to_address), '[]')
    FROM public.outbound_drafts WHERE ref_type='service_acceptance_request' AND ref_id='${requestId}'
      AND status='awaiting_review';`);
}

/** Notices of a request by status: a duplicate send or a duplicate draft changes these counts. */
function noticeCounts(requestId: string): { sent: number; total: number } {
  return json(`SELECT json_build_object('sent', count(*) FILTER (WHERE status = 'sent'), 'total', count(*))
    FROM public.outbound_drafts WHERE ref_type='service_acceptance_request' AND ref_id='${requestId}';`);
}

/**
 * V22: Review and send on the request card, check every notice still waiting
 * for this request, Send; then the DB reads each notice sent with a dry-run
 * delivery id and the request sent (no hand-set rows).
 */
async function sendNotices(page: Page, project: string, requestId: string, expectTo: string[]) {
  const notices = openNotices(requestId);
  expect(notices.map((notice) => notice.to).sort(), 'one notice per signer still waiting').toEqual([...expectTo].sort());
  const countsBefore = noticeCounts(requestId);
  const section = await openCloseout(page, project);
  const card = section.locator(`[data-service-acceptance-request="${requestId}"]`);
  const sheet = page.getByTestId('ready-to-send-sheet');
  const review = card.getByRole('button', { name: 'Review and send' });
  // One retap at most, so a missed first tap is recorded with what it left
  // behind; any send that needed it fails the test (RC7-E2-OBS-1).
  let taps = 1;
  await review.click();
  if (!(await sheet.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false))) {
    console.log(`[RC7 e2 review-and-send] ${test.info().project.name} request ${requestId} missed tap 1:`,
      JSON.stringify(await page.evaluate(() => ({
        backdrops: document.querySelectorAll('[data-testid="doc-sheet-backdrop"]').length,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        active: document.activeElement?.textContent?.trim().slice(0, 40) ?? null,
      }))));
    taps = 2;
    await review.click();
  }
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  console.log(`[RC7 e2 review-and-send] ${test.info().project.name} request ${requestId}: taps=${taps}`);
  test.info().annotations.push({ type: 'review-and-send-taps', description: `${requestId}: ${taps}` });
  expect.soft(taps, 'the first Review and send tap opens the sheet').toBe(1);
  for (const notice of notices) {
    const row = sheet.locator(`[data-outbound-row="${notice.id}"]`);
    await expect(row).toContainText(`To ${notice.to}`, { timeout: 30_000 });
    await row.getByRole('checkbox', { name: new RegExp(`to ${(notice.to ?? '').replace(/\./g, '\\.')}$`) }).check();
  }
  await sheet.getByRole('button', { name: `Send the ${notices.length} checked` }).click();
  for (const notice of notices) {
    await expect.poll(() => sql(`SELECT status FROM public.outbound_drafts WHERE id='${notice.id}';`),
      { timeout: 90_000 }).toBe('sent');
    // The sheet marks the row Sent, or (when it was the last one waiting) drops it.
    const row = sheet.locator(`[data-outbound-row="${notice.id}"]`);
    await expect.poll(async () => (await row.count()) === 0 ? 'gone'
      : (await row.locator('[data-outbound-row-state]').count()) === 0 ? 'pending'
        : (await row.locator('[data-outbound-row-state]').textContent())?.trim(), { timeout: 60_000 })
      .toMatch(/^(Sent|gone)$/);
    expect(sql(`SELECT delivery_message_id FROM public.outbound_drafts WHERE id='${notice.id}';`),
      'EMAIL_DEV_MODE=dry_run: a dry-run id, never a provider message').toMatch(/^dryrun_\d+$/);
  }
  await page.keyboard.press('Escape');
  await expect.poll(() => request(requestId).lifecycle, { timeout: 30_000 }).toBe('sent');
  // Exactly the checked notices were sent, once each, and no notice row was added.
  expect(noticeCounts(requestId), 'sent notices for the request').toEqual(
    { sent: countsBefore.sent + notices.length, total: countsBefore.total });
}

/** The client's door on their house page names the request; opening it records nothing. */
async function openFromDoor(page: Page, project: string, row: RequestRow) {
  await page.goto(`/projects/${project}`, { timeout: 180_000, waitUntil: 'domcontentloaded' });
  const door = page.getByRole('complementary', { name: 'Service acceptance' })
    .getByRole('link', { name: `Waiting for your acceptance · Request ${row.number}` });
  await expect(door).toBeVisible({ timeout: 120_000 });
  await door.click();
  await expect(page).toHaveURL(new RegExp(`/acceptance/${row.id}$`), { timeout: 120_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Service acceptance' })).toBeVisible({ timeout: 120_000 });
}

/**
 * R3b finding 4: the signer reads the bound scope and the issued evidence on
 * the acceptance page itself. The evidence read is held at the network: while
 * it is in flight the page says so and the response controls stay disabled;
 * once it lands the scope and evidence render, the answer opens, and the
 * issued document opened from the page is the issued print, byte for byte.
 */
async function readEvidenceOnPage(page: Page, row: RequestRow, expectScope: string[], member: string) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let held = 0;
  await page.route('**/rest/v1/rpc/get_my_service_acceptance_evidence*', async (route) => {
    held += 1;
    await released;
    await route.continue();
  });
  await page.goto(`/acceptance/${row.id}`, { timeout: 180_000, waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Service acceptance' })).toBeVisible({ timeout: 120_000 });
  const loading = page.getByRole('status').filter({ hasText: 'Loading the agreed scope and evidence…' });
  await expect(loading).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => held, { timeout: 30_000 }).toBeGreaterThan(0);
  const answer = page.getByRole('region', { name: 'Your response' });
  for (const name of ['Accept', 'Accept with conditions', 'Return']) {
    await expect(answer.getByRole('button', { name, exact: true }), `${name} held until the evidence is loaded`).toBeDisabled();
  }
  const region = page.getByRole('region', { name: 'Agreed scope and evidence' });
  await expect(region.getByRole('heading', { name: 'Agreed scope', exact: true })).toHaveCount(0);
  release();
  await expect(region.getByRole('heading', { name: 'Agreed scope', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(loading).toHaveCount(0);
  for (const line of expectScope) await expect(region).toContainText(line);
  const evidence = region.getByRole('heading', { name: 'Issued evidence' }).locator('xpath=..');
  await expect(evidence).toContainText(member);
  await expect(evidence).toContainText('Issued plan');
  await expect(answer.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled({ timeout: 30_000 });
  await page.unroute('**/rest/v1/rpc/get_my_service_acceptance_evidence*');

  // Each issued document, opened from the page: the signed file is the issued print.
  const files = frozen(row.id).files;
  const buttons = evidence.locator('ul ul button');
  await expect(buttons).toHaveCount(files.length);
  const opened: string[] = [];
  for (let index = 0; index < files.length; index += 1) {
    // The new tab loads the signed URL; headless Chromium aborts a PDF
    // navigation as a download, so the tab's own GET of the signed URL is read.
    const popup = page.waitForEvent('popup');
    const signed = page.context().waitForEvent('request', {
      predicate: (request) => request.method() === 'GET'
        && /\/storage\/v1\/object\/sign\/project-documents\/.+[?&]token=/.test(request.url()),
      timeout: 60_000,
    });
    await buttons.nth(index).click();
    const tab = await popup;
    const signedUrl = (await signed).url();
    const url = new URL(signedUrl);
    const object = decodeURIComponent(url.pathname.split('/storage/v1/object/sign/project-documents/')[1]!);
    const body = Buffer.from(await (await page.request.get(signedUrl)).body());
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(sha256(body), `${object} opened from the page is the issued print`).toBe(sql(`
      SELECT pr.sha256 FROM public.plan_prints pr JOIN public.project_documents d ON d.id = pr.project_document_id
      WHERE d.storage_path = '${object.replace(/'/g, "''")}' AND d.project_id = (SELECT project_id
        FROM public.service_acceptance_requests WHERE id='${row.id}');`));
    opened.push(`project-documents/${object}`);
    await tab.close().catch(() => {});
  }
  expect(opened.sort(), 'every frozen file was opened from the page').toEqual([...files].sort());
  return opened;
}

async function respond(page: Page, answer: 'Accept' | 'Accept with conditions' | 'Return', fill?: (page: Page) => Promise<void>) {
  const form = page.getByRole('region', { name: 'Your response' });
  await form.getByRole('button', { name: answer, exact: true }).click();
  if (fill) await fill(page);
  await form.getByRole('button', { name: 'Review response' }).click();
  await form.getByRole('button', { name: 'Confirm response' }).click();
  await expect(page.getByLabel('Your recorded response').first()).toBeVisible({ timeout: 60_000 });
}

/** An executed amendment, as the real actors (the RPCs the agreement UI calls):
 *  the designer drafts an addendum that adds an excluded cabinetry package,
 *  sends it; the client signs; the designer countersigns. A material change. */
async function executeAmendment(project: string) {
  const { proposalId: ap } = await actAs<{ proposalId: string }>(DESIGNER_EMAIL, 'create_service_addendum',
    { p_project_id: project, p_title: 'RC7 fictional cabinetry amendment' });
  await actAs(DESIGNER_EMAIL, 'copy_agreement_parts_from_authority', { p_proposal_id: ap, p_why: 'rc7 copy before amending' });
  // The copied parts as the agreement editor holds them (a read), plus the cabinetry package.
  const parts = json<unknown[]>(`SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'variant', variant,
      'partKey', part_key, 'title', title, 'payload', payload, 'required', required, 'clientVisible', client_visible)
      ORDER BY position), '[]') FROM public.proposal_agreement_parts WHERE proposal_id = '${ap}';`);
  await actAs(DESIGNER_EMAIL, 'upsert_agreement_parts', { p_proposal_id: ap, p_why: 'rc7 amendment adds cabinetry',
    p_parts: [...parts, { kind: 'scope_package', partKey: 'scope.cabinetry', title: 'Cabinetry',
      payload: { packageKey: 'pkg.cabinetry', label: 'Cabinetry', inclusion: 'excluded',
        responsibilities: { design: 'none', purchasing: 'client', payer: 'client', fabrication_contract: 'gc', installation: 'gc' } } }] });
  const snapshot = await actAs<{ documentFingerprint: string }>(DESIGNER_EMAIL, 'get_commercial_document_send_snapshot',
    { p_proposal_id: ap });
  await actAs(DESIGNER_EMAIL, 'send_commercial_document', { p_proposal_id: ap,
    p_expected_fingerprint: snapshot.documentFingerprint, p_personal_message: null,
    p_valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  await actAs(ACTOR.client.email, 'sign_design_services_agreement', { p_proposal_id: ap, p_signed_name: 'RC2 Fictional Client' });
  const executed = await actAs<{ newlyExecuted: unknown }>(DESIGNER_EMAIL, 'countersign_design_services_agreement',
    { p_proposal_id: ap, p_signer_name: 'F01 Fictional Designer' });
  expect(String(executed.newlyExecuted), 'the amendment executed').toBe('true');
}

// ════════════════════════════════════════════════════════════════════════════

// The timeout is set here, not by a config: the round8 config (60 s) and the consumer-journey config both run this file.
test.describe.configure({ mode: 'serial', timeout: 600_000 });

// The journeys execute agreements; the round8 global teardown's account purge
// refuses designers holding executed editions (00390). Remove this lane's
// fictional jobs first (rc7-e2-cleanup.sql), on the owned cluster only.
test.afterAll(() => {
  const target = owned();
  const out = execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-v', `owned_port=${target.dbPort}`, '-v', `owned_server_addr=${target.serverAddr}`,
    '-v', `owned_system_id=${target.systemId}`, target.dbUrl, '-f', path.join(__dirname, 'rc7-e2-cleanup.sql')], { encoding: 'utf8' });
  console.log('[RC7 e2 cleanup]', out.trim());
  expect(JSON.parse(out.trim().split('\n').pop()!)).toMatchObject({ f01NonDraftProposals: 0 });
});

test.describe('RC-7 e2 acceptance — job A', () => {
  test.beforeAll(async () => {
    const fixture = await applyFixtures();
    expect(fixture.rc7_jobs.a).toBe(jobOf(ACTOR.client.id));
  });

  test('@rc7-e2-acceptance R1: delivery and opening record nothing; the client reads the evidence on the page, then returns it', async ({ browser }) => {
    const project = jobOf(ACTOR.client.id);
    expect(requestCount(project)).toBe(0);
    const studio = await designer(browser);
    const r1 = await draft(studio, project, manifest(project, 'rc2-sa-1'));
    await sendNotices(studio, project, r1.id, [ACTOR.client.email, ACTOR.partner.email]);
    // A22: delivery is not an answer.
    expect(responses(r1.id), 'delivered, no response').toEqual([]);
    expect(request(r1.id)).toMatchObject({ lifecycle: 'sent', outcome: 'pending' });

    const home = await client(browser, ACTOR.client.email, `/projects/${project}`);
    await openFromDoor(home, project, r1);
    // A22: opening the request is not an answer.
    expect(responses(r1.id), 'opened, no response').toEqual([]);
    const files = await readEvidenceOnPage(home, r1,
      ['Living room · Included', 'Design: your studio', 'Purchasing: you', 'Installation: your general contractor'],
      'RC2 fictional drawing set');
    expect(files).toHaveLength(1);
    // A22: reading the evidence (and opening its file) is not an answer either.
    expect(responses(r1.id), 'read, no response').toEqual([]);
    expect(request(r1.id)).toMatchObject({ lifecycle: 'sent', outcome: 'pending' });

    await respond(home, 'Return', async (p) => {
      await p.getByLabel('Reason for returning').fill('Fictional: the elevations are missing from the set.');
    });
    const readback = responses(r1.id);
    console.log('[RC7 e2 R1 readback]', JSON.stringify(readback), JSON.stringify(request(r1.id)));
    expect(readback).toEqual([expect.objectContaining({ slot: 'client', answer: 'return', method: 'portal_authenticated',
      responder: ACTOR.client.id, intake: null, reason: 'Fictional: the elevations are missing from the set.' })]);
    // A20: a return closes the request returned; it is never reopened.
    expect(request(r1.id)).toMatchObject({ lifecycle: 'closed', outcome: 'returned' });
  });

  test('@rc7-e2-acceptance R2: a new request on new evidence; one of two accepts (incomplete); an executed amendment supersedes it, its evidence stays readable', async ({ browser }) => {
    const project = jobOf(ACTOR.client.id);
    const r1 = newestRequest(project);
    expect(r1).toMatchObject({ number: 1, lifecycle: 'closed', outcome: 'returned' });
    const studio = await designer(browser);
    const r2 = await draft(studio, project, manifest(project, 'rc2-sa-2'));
    expect(r2.number).toBe(2);
    expect(r2.evidenceHash, 'the new request names new evidence').not.toBe(r1.evidenceHash);
    await sendNotices(studio, project, r2.id, [ACTOR.client.email, ACTOR.partner.email]);
    expect(frozen(r2.id).members).toEqual(['plan_issue:RC2 fictional drawing set, revised']);
    expect(request(r1.id), 'the returned request stays returned').toMatchObject({ lifecycle: 'closed', outcome: 'returned' });

    // A20: the partner accepts; the client has not: incomplete.
    const partner = await client(browser, ACTOR.partner.email, `/acceptance/${r2.id}`);
    await readEvidenceOnPage(partner, r2, ['Living room · Included'], 'RC2 fictional drawing set, revised');
    await respond(partner, 'Accept');
    expect(responses(r2.id)).toEqual([expect.objectContaining({ slot: 'partner', answer: 'accept',
      method: 'portal_authenticated', responder: ACTOR.partner.id })]);
    expect(request(r2.id), 'one of two required: still pending').toMatchObject({ lifecycle: 'sent', outcome: 'pending' });
    await partner.reload({ waitUntil: 'domcontentloaded' });
    await expect(partner.getByLabel('Responses')).toContainText('Waiting for response', { timeout: 60_000 });

    // A20 supersession: a material scope change (an amendment adding an excluded
    // package) executes while request 2 is pending.
    const before = activeEdition(project);
    const r2Files = frozen(r2.id);
    await executeAmendment(project);
    const after = activeEdition(project);
    expect(after.number).toBe(before.number + 1);
    expect(after.hash).not.toBe(before.hash);
    expect(sql(`SELECT status FROM public.project_scope_editions WHERE id='${before.id}';`)).toBe('superseded');
    const superseded = request(r2.id);
    console.log('[RC7 e2 R2 supersession readback]', JSON.stringify(superseded), JSON.stringify(after));
    expect(superseded).toMatchObject({ lifecycle: 'superseded', superseded: 'scope_edition_superseded', outcome: 'pending' });
    expect(frozen(r2.id), 'the superseded request keeps its frozen evidence').toEqual(r2Files);
    // The superseded request refuses answers; the client's RPC says so.
    const late = await rpcAs(ACTOR.client.email, 'respond_service_acceptance', {
      p_request_id: r2.id, p_response: 'accept', p_conditions: [], p_return_reason: null,
      p_scope_content_hash: r2.scopeHash, p_evidence_manifest_hash: r2.evidenceHash,
      p_signer_policy_revision: r2.revision, p_client_request_id: `rc7-late-${randomUUID()}`,
    });
    expect(refusal(late), late.body).toEqual({ status: 500, code: '55000', message: 'request_not_open' });
    expect(responses(r2.id)).toHaveLength(1);

    // Old evidence stays readable: the client opens request 2 and still reads
    // its own scope and files, with no answer offered.
    const home = await client(browser, ACTOR.client.email, `/acceptance/${r2.id}`);
    await expect(home.getByRole('heading', { level: 1, name: 'Service acceptance' })).toBeVisible({ timeout: 120_000 });
    await expect(home.getByText('Request 2 · Replaced')).toBeVisible({ timeout: 60_000 });
    const region = home.getByRole('region', { name: 'Agreed scope and evidence' });
    await expect(region.getByRole('heading', { name: 'Agreed scope', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(region).toContainText('RC2 fictional drawing set, revised');
    await expect(region).not.toContainText('Cabinetry');
    await expect(home.getByRole('region', { name: 'Your response' })).toHaveCount(0);
    const evidence = await rpcAs(ACTOR.client.email, 'get_my_service_acceptance_evidence', { p_request_id: r2.id });
    expect(evidence.status, evidence.body).toBe(200);
    expect(JSON.parse(evidence.body)).toMatchObject({ requestId: r2.id, scope: { editionId: before.id },
      evidence: { manifestHash: r2.evidenceHash } });
    // The studio sees why.
    const section = await openCloseout(studio, project);
    await expect(section.locator(`[data-service-acceptance-request="${r2.id}"]`))
      .toContainText('Replaced because the agreed scope changed.', { timeout: 60_000 });
    // A draft cannot be made on the superseded edition: the designer's own
    // create_service_acceptance_request (the Draft button's RPC) is refused.
    const requestsBefore = requestCount(project);
    const stale = await rpcAs(DESIGNER_EMAIL, 'create_service_acceptance_request', { p_project_id: project,
      p_scope_edition_id: before.id, p_evidence_manifest_id: manifest(project, 'rc2-sa-2'),
      p_client_request_id: `rc7-stale-edition-${randomUUID()}` });
    console.log('[RC7 e2 R2 draft on the superseded edition]', stale.status, stale.body);
    expect(refusal(stale), stale.body).toEqual({ status: 500, code: '55000', message: 'scope_edition_not_active' });
    expect(requestCount(project), 'the refused draft writes no request').toBe(requestsBefore);
  });

  test('@rc7-e2-acceptance R3: new evidence on the new edition; one of two accepts; a signer is replaced (audited, the old signer refused); the replacement accepts with a condition', async ({ browser }) => {
    const project = jobOf(ACTOR.client.id);
    const r2 = newestRequest(project);
    expect(r2).toMatchObject({ number: 2, lifecycle: 'superseded' });
    const edition = activeEdition(project);
    const studio = await designer(browser);
    const r3 = await draft(studio, project, manifest(project, 'rc2-sa-2'));
    expect(r3.edition, 'request 3 binds the amended edition').toBe(edition.id);
    expect(r3.scopeHash).not.toBe(r2.scopeHash);
    // The evidence set is the same manifest as request 2's (rc2-sa-2): what is
    // new is the bound scope edition and request 3's own send-time freeze.
    expect(r3.evidenceHash, 'same manifest as request 2').toBe(r2.evidenceHash);
    await sendNotices(studio, project, r3.id, [ACTOR.client.email, ACTOR.partner.email]);
    // New evidence required: request 3 froze its own snapshot; nothing carried over.
    expect(frozen(r3.id).members).toEqual(['plan_issue:RC2 fictional drawing set, revised']);
    expect(responses(r3.id), 'the partner\'s answer on request 2 does not carry').toEqual([]);

    const partner = await client(browser, ACTOR.partner.email, `/acceptance/${r3.id}`);
    await readEvidenceOnPage(partner, r3, ['Living room · Included', 'Cabinetry · Not included'],
      'RC2 fictional drawing set, revised');
    await respond(partner, 'Accept');
    expect(request(r3.id), 'one of two: incomplete').toMatchObject({ lifecycle: 'sent', outcome: 'pending' });

    // A20 replacement: the studio replaces the client's slot with the third
    // household member. The card's Replace form cannot offer the household on
    // this job (DEFECT RC7-e2-1, see the fixme below), so the designer sends the
    // same RPC the form's hook sends (useReplaceServiceAcceptanceSigner), with
    // their own session; the card then shows the replaced row.
    const clientSigner = sql(`SELECT id FROM public.service_acceptance_signers WHERE request_id='${r3.id}'
      AND slot='client' AND status='active';`);
    await actAs(DESIGNER_EMAIL, 'replace_service_acceptance_signer', { p_request_id: r3.id, p_signer_id: clientSigner,
      p_new_profile_id: null, p_new_household_person_id: THIRD_CARD, p_expected_signer_policy_revision: r3.revision,
      p_reason: 'Fictional: the client is travelling; the household member signs.',
      p_client_request_id: `rc7-replace-${randomUUID()}` });
    const section = await openCloseout(studio, project);
    const card = section.locator(`[data-service-acceptance-request="${r3.id}"]`);
    const signers = card.getByRole('list', { name: `Signers on request ${r3.number}` });
    await expect(signers.locator('li[data-signer-status="replaced"]'))
      .toContainText('was replaced', { timeout: 60_000 });
    await expect(signers.locator('li[data-signer-status="active"]').filter({ hasText: 'RC7 Fictional Third' }))
      .toContainText('Waiting');
    const audit = replacementAudit(r3.id);
    console.log('[RC7 e2 replacement audit]', JSON.stringify(audit));
    expect(audit).toMatchObject({ status: 'replaced', reason: 'Fictional: the client is travelling; the household member signs.',
      by: DESIGNER, at: true, successorCard: THIRD_CARD, successorStatus: 'active', successorRequired: true,
      requestRevision: r3.revision + 1, revision: r3.revision + 1 });
    expect(request(r3.id)).toMatchObject({ lifecycle: 'sent', outcome: 'pending' });

    // The old signer cannot answer: no form on the page, and the RPC refuses.
    const home = await client(browser, ACTOR.client.email, `/acceptance/${r3.id}`);
    await expect(home.getByRole('heading', { level: 1, name: 'Service acceptance' })).toBeVisible({ timeout: 120_000 });
    await expect(home.getByRole('region', { name: 'Agreed scope and evidence' })
      .getByRole('heading', { name: 'Agreed scope', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(home.getByRole('region', { name: 'Your response' })).toHaveCount(0);
    const refused = await rpcAs(ACTOR.client.email, 'respond_service_acceptance', {
      p_request_id: r3.id, p_response: 'accept', p_conditions: [], p_return_reason: null,
      p_scope_content_hash: r3.scopeHash, p_evidence_manifest_hash: r3.evidenceHash,
      p_signer_policy_revision: r3.revision + 1, p_client_request_id: `rc7-old-${randomUUID()}`,
    });
    console.log('[RC7 e2 old signer refusal]', refused.status, refused.body);
    // 55000 surfaces as HTTP 500 through PostgREST (observation RC7-E2-OBS-3).
    expect(refusal(refused), refused.body).toEqual({ status: 500, code: '55000', message: 'signer_not_active' });
    expect(responses(r3.id).map((row) => row.slot)).toEqual(['partner']);

    // V22: the replacement's own notice, reviewed and sent by the designer.
    await sendNotices(studio, project, r3.id, [ACTOR.third.email]);

    // The replacement reads the evidence and accepts with a condition: the
    // second required answer decides the request.
    const third = await client(browser, ACTOR.third.email, `/acceptance/${r3.id}`);
    await readEvidenceOnPage(third, request(r3.id), ['Living room · Included'], 'RC2 fictional drawing set, revised');
    await respond(third, 'Accept with conditions', async (p) => {
      await p.getByRole('textbox', { name: 'Condition 1' }).fill('Fictional: finish the design review of the reading nook.');
    });
    const readback = responses(r3.id);
    console.log('[RC7 e2 R3 readback]', JSON.stringify(readback), JSON.stringify(request(r3.id)));
    expect(readback).toEqual([
      expect.objectContaining({ slot: 'client', answer: 'accept_with_conditions', method: 'portal_authenticated',
        responder: ACTOR.third.id }),
      expect.objectContaining({ slot: 'partner', answer: 'accept', responder: ACTOR.partner.id }),
    ]);
    expect(request(r3.id)).toMatchObject({ lifecycle: 'closed', outcome: 'accepted_with_conditions', edition: edition.id });
  });
});

test.describe('RC-7 e2 paper — job P', () => {
  test('@rc7-e2-paper an all-paper household: presented offline, recorded, stamped, reviewed by a second admin; same scoped truth, never a client response', async ({ browser }) => {
    const project = jobOf(ACTOR.paper.id);
    expect(requestCount(project)).toBe(0);
    const edition = activeEdition(project);
    const studio = await designer(browser);
    const row = await draft(studio, project, manifest(project, 'rc7-sa-1'));
    // Neither signer has an account: each notice is held with no address on file (00891).
    expect(openNotices(row.id).map((notice) => notice.to), 'card-only signers: address-less holds').toEqual([null, null]);

    // 00899: the designer (studio owner) says the request was handed over in person.
    let section = await openCloseout(studio, project);
    let card = section.locator(`[data-service-acceptance-request="${row.id}"]`);
    await card.getByRole('button', { name: 'Presented on paper' }).click();
    await card.getByRole('group', { name: `Present request ${row.number} on paper` })
      .getByRole('button', { name: 'Mark presented' }).click();
    await expect(card.getByRole('status').filter({ hasText: `Request ${row.number} is marked as presented on paper.` }))
      .toBeVisible({ timeout: 60_000 });
    const presented = json<Record<string, unknown>>(`SELECT json_build_object('lifecycle', lifecycle,
        'offline', offline_presented_at IS NOT NULL, 'by', offline_presented_by, 'sentEqualsOffline', sent_at = offline_presented_at,
        'sentDrafts', (SELECT count(*) FROM public.outbound_drafts d WHERE d.ref_id = r.id AND d.status = 'sent'))
      FROM public.service_acceptance_requests r WHERE id='${row.id}';`);
    console.log('[RC7 e2 paper presented]', JSON.stringify(presented));
    expect(presented).toMatchObject({ lifecycle: 'sent', offline: true, by: DESIGNER, sentEqualsOffline: true, sentDrafts: 0 });
    expect(responses(row.id), 'presenting records no answer').toEqual([]);
    // Same scoped truth as online: the agreed edition and the frozen evidence.
    const sent = request(row.id);
    expect(sent.edition).toBe(edition.id);
    expect(sent.scopeHash).toBe(edition.hash);
    expect(frozen(row.id).members).toEqual(['plan_issue:RC7 fictional drawing set']);

    // A paper whose scope or evidence code does not match the request is refused
    // (record_service_acceptance_paper_intake, the Record paper form's RPC, as the
    // designer): checked before the stored PDF, so nothing is uploaded or written.
    const clientSlot = sql(`SELECT id FROM public.service_acceptance_signers WHERE request_id='${row.id}'
      AND slot='client' AND status='active';`);
    const paperArgs = (scope: string, evidence: string) => ({ p_request_id: row.id, p_signer_id: clientSlot,
      p_storage_object_id: randomUUID(), p_paper_signed_on: today(), p_signed_name: PAPER_CARDS.one,
      p_disposition: 'accept', p_conditions: [], p_return_reason: null, p_presented_request_number: sent.number,
      p_presented_scope_content_hash: scope, p_presented_evidence_manifest_hash: evidence,
      p_presented_signer_policy_revision: sent.revision, p_client_request_id: `rc7-paper-mismatch-${randomUUID()}` });
    const otherHash = (hash: string) => `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;
    for (const [what, args] of [['scope code', paperArgs(otherHash(sent.scopeHash), sent.evidenceHash)],
      ['evidence code', paperArgs(sent.scopeHash, otherHash(sent.evidenceHash))]] as const) {
      const mismatch = await rpcAs(DESIGNER_EMAIL, 'record_service_acceptance_paper_intake', args);
      console.log(`[RC7 e2 paper ${what} mismatch]`, mismatch.status, mismatch.body);
      expect(mismatch.status, `${what}: ${mismatch.body}`).toBeGreaterThanOrEqual(400);
      expect(refusal(mismatch), what).toMatchObject({ code: '40001', message: 'stale_scope' });
    }
    expect(sql(`SELECT count(*) FROM public.service_acceptance_paper_intakes WHERE request_id='${row.id}';`),
      'the refused papers record nothing').toBe('0');

    const admin = await designer(browser, ADMIN_EMAIL);
    for (const [index, name] of [PAPER_CARDS.one, PAPER_CARDS.two].entries()) {
      section = await openCloseout(studio, project);
      card = section.locator(`[data-service-acceptance-request="${row.id}"]`);
      const signer = card.locator('li[data-signer-status="active"]').filter({ hasText: name });
      await signer.getByRole('button', { name: 'Record paper' }).click();
      const slot = index === 0 ? 'Client' : 'Partner';
      const form = signer.getByRole('form', { name: `Record paper for ${slot}` });
      const paper = pdf(`RC7 fictional signed acceptance ${name} ${randomUUID()}`);
      await form.getByLabel('PDF of the paper (up to 20 MiB)').setInputFiles({
        name: `acceptance-${index + 1}.pdf`, mimeType: 'application/pdf', buffer: paper });
      await form.getByLabel('Request number').fill(String(sent.number));
      await form.getByLabel('Scope code (full)').fill(sent.scopeHash);
      await form.getByLabel('Evidence code (full)').fill(sent.evidenceHash);
      await form.getByLabel('Signer revision').fill(String(sent.revision));
      await form.getByLabel('Date on the paper').fill(new Date().toISOString().slice(0, 10));
      await form.getByLabel('Name written on the paper').fill(name);
      await form.getByRole('radio', { name: 'Accepted', exact: true }).check();
      await form.getByRole('button', { name: 'Record paper' }).click();

      const intakes = card.getByRole('list', { name: `Paper recorded on request ${row.number}` });
      const intakeRow = intakes.locator('[data-paper-intake]').filter({ hasText: name });
      await expect(intakeRow.locator('[data-paper-stamp="stamped"]')).toBeVisible({ timeout: 90_000 });
      await expect(intakeRow.getByText('Waiting for a second reviewer.')).toBeVisible();
      const intakeId = (await intakeRow.getAttribute('data-paper-intake'))!;
      const intake = json<Record<string, unknown>>(`SELECT json_build_object('state', review_state, 'sha', document_sha256,
          'recordedBy', recorded_by, 'number', presented_request_number, 'scope', presented_scope_content_hash,
          'evidence', presented_evidence_manifest_hash, 'name', signed_name, 'disposition', disposition)
        FROM public.service_acceptance_paper_intakes WHERE id='${intakeId}';`);
      console.log('[RC7 e2 paper intake]', JSON.stringify(intake));
      expect(intake).toMatchObject({ state: 'pending_review', sha: sha256(paper), recordedBy: DESIGNER,
        number: sent.number, scope: sent.scopeHash, evidence: sent.evidenceHash, name, disposition: 'accept' });
      expect(responses(row.id), 'recorded paper is not yet an answer').toHaveLength(index);
      if (index === 0) {
        // K5: the recorder cannot confirm their own paper, though they are a
        // studio owner/admin who may review (review_service_acceptance_paper_intake as the designer).
        expect(sql(`SELECT m.role FROM public.organization_members m JOIN public.organizations o
            ON o.id = m.organization_id AND o.status = 'active'
          WHERE m.organization_id = public.project_recorded_studio('${project}') AND m.user_id = '${DESIGNER}'
            AND m.status = 'active';`)).toMatch(/^(owner|admin)$/);
        const own = await rpcAs(DESIGNER_EMAIL, 'review_service_acceptance_paper_intake', { p_intake_id: intakeId,
          p_decision: 'confirmed', p_expected_document_sha256: sha256(paper), p_note: null,
          p_client_request_id: `rc7-own-review-${randomUUID()}` });
        console.log('[RC7 e2 paper own review]', own.status, own.body);
        expect(own.status, own.body).toBeGreaterThanOrEqual(400);
        expect(refusal(own)).toMatchObject({ code: '42501', message: 'insufficient_privilege' });
        expect(sql(`SELECT review_state || '|' || (reviewed_by IS NULL) FROM public.service_acceptance_paper_intakes
          WHERE id='${intakeId}';`), 'the refused self-review leaves the intake waiting').toBe('pending_review|true');
        expect(responses(row.id)).toHaveLength(0);
      }

      // K5: a second owner/admin compares the stored PDF, then confirms.
      const review = await openCloseout(admin, project);
      const reviewRow = review.locator(`[data-paper-intake="${intakeId}"]`);
      await reviewRow.getByRole('button', { name: 'View the stored paper' }).click();
      await expect(reviewRow.locator('[data-acceptance-paper-view] iframe')).toBeVisible({ timeout: 60_000 });
      await expect(reviewRow.getByRole('button', { name: 'Confirm paper' })).toBeEnabled({ timeout: 60_000 });
      await reviewRow.getByRole('button', { name: 'Confirm paper' }).click();
      await expect.poll(() => sql(`SELECT review_state FROM public.service_acceptance_paper_intakes WHERE id='${intakeId}';`),
        { timeout: 60_000 }).toBe('confirmed');
      expect(sql(`SELECT reviewed_by FROM public.service_acceptance_paper_intakes WHERE id='${intakeId}';`))
        .toBe(sql(`SELECT id FROM public.profiles WHERE email='${ADMIN_EMAIL}';`));
    }

    // Never recorded as a client response: both answers are reviewed paper, with no responder.
    const readback = responses(row.id);
    console.log('[RC7 e2 paper readback]', JSON.stringify(readback), JSON.stringify(request(row.id)));
    expect(readback).toHaveLength(2);
    for (const answer of readback) {
      expect(answer).toMatchObject({ answer: 'accept', method: 'paper_intake', responder: null });
      expect(answer.intake).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(request(row.id)).toMatchObject({ lifecycle: 'closed', outcome: 'accepted', edition: edition.id });
    section = await openCloseout(studio, project);
    await expect(section.locator(`[data-service-acceptance-request="${row.id}"] [data-response-method="paper_intake"]`))
      .toHaveCount(2, { timeout: 60_000 });
    await expect(section.locator(`[data-service-acceptance-request="${row.id}"]`)).toContainText('Accepted on paper, reviewed');
    // The project client (not a signer) sees the request and its reviewed paper,
    // and is offered no answer of their own.
    const home = await client(browser, ACTOR.paper.email, `/acceptance/${row.id}`);
    await expect(home.getByRole('heading', { level: 1, name: 'Service acceptance' })).toBeVisible({ timeout: 120_000 });
    await expect(home.getByLabel('Responses')).toContainText('Reviewed paper response', { timeout: 60_000 });
    await expect(home.getByRole('region', { name: 'Your response' })).toHaveCount(0);
  });
});

test.describe('RC-7 e2 completion and care', () => {
  test('@rc7-e2-completion job A: accepted with a condition while an included phase is open stays held; outside work and a punch item never hold; completion, then care', async ({ browser }) => {
    const project = jobOf(ACTOR.client.id);
    const accepted = newestRequest(project);
    expect(accepted).toMatchObject({ number: 3, lifecycle: 'closed', outcome: 'accepted_with_conditions' });
    const edition = activeEdition(project);
    const before = closure(project);
    // A GC-reported install punch item, as the designer records it (the install manifest's RPC).
    const chair = sql(`SELECT id FROM public.project_ffe_items WHERE project_id='${project}' AND name='RC7 client-bought chair';`);
    await actAs(DESIGNER_EMAIL, 'upsert_install_punch_item',
      { p_request: { ffeItemId: chair, note: 'Fictional: scuff on the chair leg, GC to touch up.' } });
    expect(obligations(project)).toEqual({
      blockers: ['agreed_phase_open:pkg.living'],
      info: ['external_fulfilment_open:pkg.living', 'package_excluded:pkg.cabinetry', 'punch_item_open:-'],
    });

    const studio = await designer(browser);
    await openCloseout(studio, project);
    const service = studio.locator('[data-studio-service]');
    await service.scrollIntoViewIfNeeded();
    // A22: a conditional acceptance with an open included obligation is visibly held.
    await expect(service.locator('[data-blocker="agreed_phase_open"]')).toBeVisible({ timeout: 120_000 });
    await expect(service.locator('[data-obligation-package="pkg.living"]')).toContainText('Living room');
    await expect(service.locator('[data-informational="external_fulfilment_open"]')).toContainText('Outside work still in progress');
    await expect(service.locator('[data-informational="punch_item_open"]')).toContainText('Open install punch items');
    await expect(service.locator('[data-informational="package_excluded"]')).toContainText('Cabinetry');
    await expect(service.locator('[data-open-condition]')).toContainText('Fictional: finish the design review of the reading nook.');
    await expect(service.getByRole('button', { name: 'Complete studio service' })).toBeDisabled();
    expect(completions(project)).toEqual([]);

    // The studio finishes the design phase; outside work and the punch item remain.
    await completePhases(project);
    expect(obligations(project).blockers).toEqual([]);
    await studio.reload({ waitUntil: 'domcontentloaded' });
    await openCloseout(studio, project);
    await service.scrollIntoViewIfNeeded();
    await expect(service.getByRole('button', { name: 'Complete studio service' })).toBeEnabled({ timeout: 120_000 });
    await expect(service.locator('[data-informational="punch_item_open"]')).toBeVisible();
    await service.getByRole('button', { name: 'Complete studio service' }).click();
    await expect(service.locator('[data-studio-service-state="completed_with_conditions"]')).toBeVisible({ timeout: 60_000 });
    expect(completions(project)).toEqual([{ state: 'completed_with_conditions', request: accepted.id, edition: edition.id, revoked: null }]);
    // A21: studio completion is not project closure.
    expect(closure(project)).toBe(before);

    // Resolve the client's condition: the completion reads complete.
    const open = service.locator('[data-open-condition]').first();
    await open.getByRole('button', { name: 'Resolve this condition' }).click();
    const form = service.getByRole('form', { name: /^Resolve: / });
    await form.getByLabel('How it was resolved').fill('Fictional: the reading nook design was reviewed with the household.');
    await form.getByRole('combobox').selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Record the resolution' }).click();
    await expect(service.locator('[data-open-condition]')).toHaveCount(0, { timeout: 60_000 });
    await expect.poll(() => completions(project)[0]?.state, { timeout: 60_000 }).toBe('completed');
    await expect(service.locator('[data-studio-service-state="completed"]')).toBeVisible({ timeout: 60_000 });
    expect(closure(project)).toBe(before);

    // A23: care refers to the accepted edition, its request and who is responsible.
    const care = service.locator('[data-care-references]');
    await expect(care).toContainText(`scope edition ${edition.number}, in force from`);
    await expect(care).toContainText(`accepted on request ${accepted.number}`);
    await expect(care.locator('[data-care-package="pkg.living"]'))
      .toHaveText('Living room: bought by the client, installed by the general contractor');
    await expect(care.locator('[data-care-package="pkg.cabinetry"]')).toHaveCount(0);
    const opener = care.getByRole('link', { name: 'Open the specification' });
    await opener.click();
    await expect(studio).toHaveURL(/unfold=pieces/, { timeout: 60_000 });
    expect(new URL(studio.url()).pathname).toBe(`/doc/${project}`);
    const unfold = studio.locator('[data-unfold-instrument="pieces"]');
    await expect(unfold).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => unfold.evaluate((node) => node.contains(document.activeElement)), { timeout: 30_000 }).toBe(true);
    await studio.keyboard.press('Escape');
    await expect(unfold).toHaveCount(0, { timeout: 30_000 });
    await expect(opener, 'the deep reference returns to Closeout').toBeFocused({ timeout: 30_000 });

    // The client reads the completed service on their request.
    const home = await client(browser, ACTOR.client.email, `/acceptance/${accepted.id}`);
    await expect(home.getByText('The studio’s service is complete')).toBeVisible({ timeout: 120_000 });
  });

  test('@rc7-e2-completion job F (full service): studio lines, installation and phases hold; the excluded package does not; the balance holds closure, not the service', async ({ browser }) => {
    const project = jobOf(ACTOR.full.id);
    const before = closure(project);
    expect(obligations(project)).toEqual({
      blockers: ['acceptance_not_accepted:-', 'agreed_phase_open:pkg.home', 'studio_installation_open:pkg.home',
        'studio_line_open:pkg.home'],
      info: ['package_excluded:pkg.cabinetry'],
    });
    const studio = await designer(browser);
    const row = await draft(studio, project, manifest(project, 'rc7-sa-1'));
    await sendNotices(studio, project, row.id, [ACTOR.full.email]);
    const home = await client(browser, ACTOR.full.email, `/projects/${project}`);
    await openFromDoor(home, project, row);
    await readEvidenceOnPage(home, row, ['Whole home · Included', 'Purchasing: your studio', 'Installation: your studio',
      'Cabinetry · Not included'], 'RC7 fictional drawing set');
    await respond(home, 'Accept');
    expect(request(row.id)).toMatchObject({ lifecycle: 'closed', outcome: 'accepted' });

    await openCloseout(studio, project);
    const service = studio.locator('[data-studio-service]');
    await service.scrollIntoViewIfNeeded();
    for (const code of ['studio_line_open', 'studio_installation_open', 'agreed_phase_open']) {
      await expect(service.locator(`[data-blocker="${code}"]`)).toBeVisible({ timeout: 120_000 });
    }
    await expect(service.locator('[data-informational="package_excluded"]')).toContainText('Cabinetry');
    await expect(service.getByRole('button', { name: 'Complete studio service' })).toBeDisabled();

    // The studio installs its line and finishes its phases (the FF&E and phase controls' RPCs).
    const sofa = sql(`SELECT id FROM public.project_ffe_items WHERE project_id='${project}' AND scope_package_key='pkg.home';`);
    await actAs(DESIGNER_EMAIL, 'record_project_ffe_installed', { p_item_ids: [sofa], p_installed_on: today() });
    await completePhases(project);
    expect(obligations(project)).toEqual({ blockers: [], info: ['package_excluded:pkg.cabinetry'] });

    await studio.reload({ waitUntil: 'domcontentloaded' });
    await openCloseout(studio, project);
    await service.scrollIntoViewIfNeeded();
    // Financial closeout is shown on its own line and never holds the service.
    await expect(service.locator('[data-financial-hold]')).toContainText('holds project closure, not service completion',
      { timeout: 120_000 });
    await expect(service.getByRole('button', { name: 'Complete studio service' })).toBeEnabled({ timeout: 60_000 });
    await service.getByRole('button', { name: 'Complete studio service' }).click();
    await expect(service.locator('[data-studio-service-state="completed"]')).toBeVisible({ timeout: 60_000 });
    expect(completions(project)).toEqual([expect.objectContaining({ state: 'completed', request: row.id, revoked: null })]);
    await expect(service.locator('[data-care-package="pkg.home"]'))
      .toHaveText('Whole home: bought by the studio, installed by the studio');
    expect(closure(project)).toBe(before);

    // close_project stays its own act: the client's open cabinetry line (outside the service) refuses it first.
    const completedService = completions(project);
    const outsideLine = await closeProject(project);
    console.log('[RC7 e2 F close: outside line]', outsideLine.status, outsideLine.body);
    expect(outsideLine.status).toBe(400);
    expect(outsideLine.body).toMatch(/project cannot close: 1 FF&E item\(s\) are not installed/);
    expect(closure(project), 'a refused close leaves closure state as it was').toBe(before);

    // Clear every non-financial blocker: the GC's cabinetry run is installed.
    // Its delivery is the GC's, outside the studio's acts, so the fixture records
    // it (postgres); the studio then marks it installed through the real RPC.
    const kitchen = sql(`SELECT id FROM public.project_ffe_items WHERE project_id='${project}' AND scope_package_key='pkg.cabinetry';`);
    sql(`UPDATE public.project_ffe_items SET status='delivered' WHERE id='${kitchen}' AND status='ordered';`);
    expect(sql(`SELECT status FROM public.project_ffe_items WHERE id='${kitchen}';`)).toBe('delivered');
    await actAs(DESIGNER_EMAIL, 'record_project_ffe_installed', { p_item_ids: [kitchen], p_installed_on: today() });
    expect(sql(`SELECT count(*) FROM public.project_ffe_items WHERE project_id='${project}' AND status <> 'installed';`)).toBe('0');
    // Financial state, read back: the agreed fee is uncollected and nothing is invoiced.
    expect(financialHold(project)).toEqual({ openInvoiceCount: 0, balanceCents: 0, uncollectedContractCents: 500000 });
    const uncollected = await closeProject(project);
    console.log('[RC7 e2 F close: financial]', uncollected.status, uncollected.body);
    expect(uncollected.status).toBe(400);
    expect(uncollected.body).toMatch(/project cannot close: contract total is not fully collected/);
    expect(closure(project), 'the financial refusal leaves closure state as it was').toBe(before);
    expect(completions(project), 'the financial hold never touches the service').toEqual(completedService);

    // A separate step: the studio invoices the fee, issues it, and records the client's cheque (the invoice acts' RPCs).
    const invoice = await actAs<{ id: string }>(DESIGNER_EMAIL, 'compose_project_invoice', {
      p_project_id: project, p_expected_designer_id: DESIGNER, p_expected_client_id: ACTOR.full.id,
      p_expected_studio_id: sql(`SELECT studio_id FROM public.projects WHERE id='${project}';`),
      p_tax_rate: 0, p_payment_terms_days: 15, p_memo: 'RC7 fictional design fee', p_internal_notes: null,
      p_lines: [{ kind: 'adhoc', milestone_id: null, ffe_item_id: null, description: 'RC7 fictional design fee',
        quantity: 1, unit_amount_cents: 500000, metadata: {}, sort_order: 0 }],
      p_entry_ids: [], p_billing_lines: [] });
    await actAs(DESIGNER_EMAIL, 'issue_invoice', { p_invoice_id: invoice.id, p_due_date: null });
    expect(financialHold(project), 'issued, not yet paid').toMatchObject({ openInvoiceCount: 1, balanceCents: 500000 });
    await actAs(DESIGNER_EMAIL, 'record_invoice_payment', { p_invoice_id: invoice.id, p_amount_cents: 500000,
      p_method: 'check', p_reference: 'RC7 fictional cheque 1001', p_received_at: new Date().toISOString(), p_note: null });
    expect(financialHold(project)).toEqual({ openInvoiceCount: 0, balanceCents: 0, uncollectedContractCents: 0 });
    const closed = await closeProject(project);
    expect(closed.status, closed.body).toBe(200);
    expect(sql(`SELECT status FROM public.projects WHERE id='${project}';`)).toBe('completed');
    expect(completions(project), 'closing leaves the service completion as it was').toEqual(completedService);
  });

  test('@rc7-e2-completion job D (design only): silence, opening and a walkthrough record no acceptance; accept, complete, close; a later care question neither reopens nor bills', async ({ browser }) => {
    const project = jobOf(ACTOR.design.id);
    const studio = await designer(browser);
    const row = await draft(studio, project, manifest(project, 'rc7-sa-1'));
    await sendNotices(studio, project, row.id, [ACTOR.design.email]);
    const home = await client(browser, ACTOR.design.email, `/projects/${project}`);
    await openFromDoor(home, project, row);
    await readEvidenceOnPage(home, row, ['Design only · Included', 'Design: your studio', 'Purchasing: you'],
      'RC7 fictional drawing set');
    // The design phase and the final walkthrough are done; the client has said nothing.
    expect(phases(project).map((phase) => phase.name)).toEqual(['Design', 'Final walkthrough']);
    await completePhases(project);
    // A22: silence, an opened request, delivery and the walkthrough record no acceptance.
    expect(responses(row.id)).toEqual([]);
    expect(request(row.id)).toMatchObject({ lifecycle: 'sent', outcome: 'pending' });
    expect(obligations(project)).toEqual({ blockers: ['acceptance_not_accepted:-'], info: [] });
    await openCloseout(studio, project);
    const service = studio.locator('[data-studio-service]');
    await service.scrollIntoViewIfNeeded();
    await expect(service.locator('[data-blocker="acceptance_not_accepted"]')).toBeVisible({ timeout: 120_000 });
    await expect(service.getByRole('button', { name: 'Complete studio service' })).toBeDisabled();

    await home.goto(`/acceptance/${row.id}`, { waitUntil: 'domcontentloaded' });
    await expect(home.getByRole('region', { name: 'Your response' }).getByRole('button', { name: 'Accept', exact: true }))
      .toBeEnabled({ timeout: 120_000 });
    await respond(home, 'Accept');
    expect(request(row.id)).toMatchObject({ lifecycle: 'closed', outcome: 'accepted' });
    await studio.reload({ waitUntil: 'domcontentloaded' });
    await openCloseout(studio, project);
    await service.scrollIntoViewIfNeeded();
    await expect(service.getByRole('button', { name: 'Complete studio service' })).toBeEnabled({ timeout: 120_000 });
    await service.getByRole('button', { name: 'Complete studio service' }).click();
    await expect(service.locator('[data-studio-service-state="completed"]')).toBeVisible({ timeout: 60_000 });
    await expect(service.locator('[data-care-package="pkg.design"]'))
      .toHaveText('Design only: bought by the client, installed by the client');
    const completed = completions(project);
    expect(completed).toEqual([expect.objectContaining({ state: 'completed', request: row.id, revoked: null })]);

    // close_project is a separate act, with the walkthrough on its checklist.
    expect(sql(`SELECT status FROM public.projects WHERE id='${project}';`)).toBe('active');
    // An incomplete checklist (the walkthrough not ticked) is refused, and nothing moves.
    const openClosure = closure(project);
    const incomplete = await rpcAs(DESIGNER_EMAIL, 'close_project', { p_project_id: project,
      p_closure: CHECKLIST.map((item) => item.key === 'walkthrough' ? { ...item, completed: false } : item),
      p_snapshot: null });
    console.log('[RC7 e2 D close: incomplete checklist]', incomplete.status, incomplete.body);
    expect(refusal(incomplete), incomplete.body).toEqual({ status: 400, code: '23514',
      message: 'project closeout checklist must include every required item as completed' });
    expect(closure(project), 'the refused close leaves closure state as it was').toBe(openClosure);
    expect(completions(project), 'the refused close leaves the completion as it was').toEqual(completed);
    const snapshot = { caption: 'RC7 fictional design-only closeout', photos: [] as string[] };
    const closed = await closeProject(project, snapshot);
    expect(closed.status, closed.body).toBe(200);
    // Close persists its evidence: the checklist and the portfolio snapshot.
    const closedState = json<{ status: string; checklist: unknown; snapshot: unknown }>(`SELECT json_build_object(
        'status', status, 'checklist', closure_checklist, 'snapshot', portfolio_snapshot) FROM public.projects WHERE id='${project}';`);
    console.log('[RC7 e2 D closed]', JSON.stringify(closedState));
    expect(closedState).toEqual({ status: 'completed', checklist: CHECKLIST, snapshot });
    expect(responses(row.id), 'closing records no acceptance').toHaveLength(1);
    expect(completions(project), 'closing leaves the completion as it was').toEqual(completed);

    // Freeze: post-close mutations are refused for both sides, and nothing moves.
    const frozenClosure = closure(project);
    const ledgerClosed = ledger(project);
    const { apiUrl, anonKey } = owned();
    const rewrite = await fetch(`${apiUrl}/rest/v1/projects?id=eq.${project}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${await token(DESIGNER_EMAIL)}`,
        'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ closure_checklist: [{ key: 'walkthrough', completed: false }] }),
    });
    const rewriteBody = await rewrite.text();
    console.log('[RC7 e2 D post-close checklist rewrite]', rewrite.status, rewriteBody);
    expect(rewrite.status, rewriteBody).toBe(400);
    expect(rewriteBody).toMatch(/project closeout evidence may only change through close_project/);
    const reopen = await rpcAs(ACTOR.design.email, 'create_client_scope_change_request', { p_project_id: project,
      p_idempotency_key: randomUUID(), p_title: 'RC7 fictional post-close change',
      p_description: 'Fictional: add a reading lamp to the design.' });
    console.log('[RC7 e2 D post-close scope change]', reopen.status, reopen.body);
    expect(reopen.status).toBe(400);
    expect(reopen.body).toMatch(/completed_project/);
    expect(closure(project), 'the refused writes leave the closeout as it was').toBe(frozenClosure);
    expect(ledger(project), 'no scope change follows').toBe(ledgerClosed);

    // Post-close: the edition stays the agreed one, the care record still reads it.
    const edition = activeEdition(project);
    expect(edition.id).toBe(row.edition);
    await studio.reload({ waitUntil: 'domcontentloaded' });
    await openCloseout(studio, project);
    await expect(service.locator('[data-care-references]')).toContainText(`scope edition ${edition.number}, in force from`,
      { timeout: 120_000 });
    await expect(service.locator('[data-care-references]')).toContainText(`accepted on request ${row.number}`);

    // A later care question arrives on the project thread, from the client.
    const ledgerBefore = ledger(project);
    const thread = sql(`SELECT id FROM public.comms_threads WHERE project_id='${project}' AND kind='project';`);
    const asked = await fetch(`${apiUrl}/rest/v1/comms_messages`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${await token(ACTOR.design.email)}`,
        'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ thread_id: thread, sender_id: ACTOR.design.id,
        body: 'Fictional: how should we care for the oak table finish?', attachments: [], mentions: [] }),
    });
    expect(asked.status, await asked.clone().text()).toBe(201);
    expect(sql(`SELECT count(*) FROM public.comms_messages WHERE thread_id='${thread}' AND sender_id='${ACTOR.design.id}';`)).toBe('1');
    expect(ledger(project), 'no invoice, request, scope change or completion follows').toBe(ledgerBefore);
    expect(completions(project), 'the completion is not reopened').toEqual(completed);
    expect(sql(`SELECT status FROM public.projects WHERE id='${project}';`)).toBe('completed');
    await home.goto(`/acceptance/${row.id}`, { waitUntil: 'domcontentloaded' });
    await expect(home.getByText('The studio’s service is complete')).toBeVisible({ timeout: 120_000 });
    await expect(home.getByText('Care questions are still welcome.')).toBeVisible();
  });
});

test.describe('RC-7 e2 defects (repro only; not in a counted runner leg)', () => {
  // DEFECT RC7-e2-1: the request card's Replace form finds no household on a composed job: useProjectHousehold reads projects.client_profile_id (FK to client_profiles, never set) instead of projects.client_id.
  test('@rc7-e2-defect the Replace form offers the job household\'s other members and replaces the signer', async ({ browser }) => {
    // Fixme unless rc7-e2-run.mjs --defect-probe lifts it (RC7_E2_DEFECT_PROBE=1).
    test.fixme(process.env.RC7_E2_DEFECT_PROBE !== '1', 'DEFECT RC7-e2-1');
    await applyFixtures();
    const project = jobOf(ACTOR.client.id);
    const studio = await designer(browser);
    const row = await draft(studio, project, manifest(project, 'rc2-sa-1'));
    const section = await openCloseout(studio, project);
    const card = section.locator(`[data-service-acceptance-request="${row.id}"]`);
    const signers = card.getByRole('list', { name: `Signers on request ${row.number}` });
    await signers.locator('li[data-signer-status="active"]').filter({ hasText: '(Client)' })
      .getByRole('button', { name: 'Replace this person' }).click();
    const replace = card.getByRole('form', { name: 'Replace Client' });
    // The defect step: on this base the form says no household member is on file.
    await expect(replace.getByText('No other household member is on file for this job.')).toHaveCount(0);
    await expect(replace.getByLabel('New person').locator(`option[value="${THIRD_CARD}"]`)).toHaveCount(1);

    // Past the offer: the designer replaces the client with the third household member in the form.
    await replace.getByLabel('New person').selectOption(THIRD_CARD);
    const reason = 'Fictional: the client is travelling; the household member signs (UI).';
    await replace.getByLabel('Reason for the change').fill(reason);
    await replace.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect(signers.locator('li[data-signer-status="replaced"]')).toContainText('was replaced', { timeout: 60_000 });
    await expect(signers.locator('li[data-signer-status="active"]').filter({ hasText: 'RC7 Fictional Third' }))
      .toBeVisible({ timeout: 60_000 });
    const audit = replacementAudit(row.id);
    console.log('[RC7 e2 defect replacement audit]', JSON.stringify(audit));
    expect(audit).toMatchObject({ status: 'replaced', reason, by: DESIGNER, at: true, successorCard: THIRD_CARD,
      successorStatus: 'active', successorRequired: true, requestRevision: row.revision + 1, revision: row.revision + 1 });
  });
});
