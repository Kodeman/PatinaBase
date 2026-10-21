import { test, expect, type Page, type Locator } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// Only disposable LOCAL households. No Stripe, outbound mail or customer records.
// Server reads, RLS and approval writes remain real; faults are injected at the
// browser's RPC boundary, never by replacing page markup or the response rail.
const LOCAL = 'http://127.0.0.1:54321';
const DESIGNER = 'a0000000-0000-0000-0000-000000000004';
const PASSWORD = 'password123';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
function admin() {
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Export the LOCAL service key').toBeTruthy();
  return createClient(LOCAL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
async function checked<T>(result: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await result;
  expect(error).toBeNull();
  return data;
}
async function actor(email: string) {
  const client = createClient(LOCAL, ANON, { auth: { persistSession: false } });
  await checked(client.auth.signInWithPassword({ email, password: PASSWORD }));
  return client;
}
interface Household { id: string; email: string; studio: string; project: string | null; client: SupabaseClient }
async function household(withProject = false): Promise<Household> {
  const db = admin();
  const email = `cpux-${randomUUID()}@patina.dev`;
  const created = await checked(db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true,
    user_metadata: { full_name: 'Synthetic Homeowner', role: 'homeowner' } }));
  const id = created.user!.id;
  await checked(db.from('profiles').update({ role: 'homeowner', full_name: 'Synthetic Homeowner' }).eq('id', id));
  await checked(db.from('designer_clients').insert({ designer_id: DESIGNER, client_id: id,
    client_name: 'Synthetic Homeowner', client_email: email, status: 'active' }));
  const identity = await checked(db.rpc('resolve_studio_identity', { p_designer_id: DESIGNER }));
  const studio = (Array.isArray(identity) ? identity[0] : identity).studio_id as string;
  const project = withProject ? randomUUID() : null;
  if (project) await checked(db.from('projects').insert({ id: project, name: 'Synthetic homeowner house',
    designer_id: DESIGNER, client_id: id, created_by: DESIGNER, studio_id: studio,
    status: 'active', current_phase: null, budget_cents: 0, design_fee_cents: 0, client_visibility_tier: 'milestone' }));
  return { id, email, studio, project, client: await actor(email) };
}
async function invoice(house: Household, cents: number, due: string | null, status = 'sent', currency = 'USD') {
  const db = admin();
  const id = randomUUID();
  await checked(db.from('invoices').insert({ id, project_id: house.project, studio_id: house.studio,
    designer_id: DESIGNER, client_id: house.id, invoice_number: `CPUX-${id.slice(0, 8)}`,
    title: `Synthetic invoice ${id.slice(0, 8)}`, status: 'draft', issue_date: '2026-10-01', due_date: due,
    currency, subtotal_cents: cents, tax_cents: 0, tax_rate: 0, total_cents: cents, amount_paid_cents: 0 }));
  if (status !== 'draft') await checked(db.from('invoices').update({ status, sent_at: new Date().toISOString() }).eq('id', id));
  return id;
}
async function signIn(page: Page, house: Household, path = '/') {
  await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(path)}`);
  const password = page.getByLabel(/password/i).first();
  await expect(async () => {
    if (!await password.isVisible()) await page.getByRole('button', { name: /sign in with email|use (?:email and )?password instead|use a password instead/i }).first().click();
    await expect(password).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60000 });
  await page.getByLabel(/email/i).first().fill(house.email);
  await password.fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(url => !url.pathname.includes('/auth/signin'), { timeout: 60000 });
  await expect(page.getByTestId('landmark-ledger')).toBeVisible({ timeout: 60000 });
}
function row(page: Page, id: string) { return page.locator(`[data-testid="invoice-row"][data-invoice-id="${id}"]`); }
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function targetSize(control: Locator) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}
async function approval(house: Household) {
  const db = admin();
  const studio = await actor('designer@patina.dev');
  const createdPhase = await checked(studio.rpc('create_project_phase', { p_project_id: house.project,
    p_phase_key: `cpux-${randomUUID()}`, p_name: 'Synthetic review', p_sort_order: 0, p_lane: 'thread' }));
  const phase = createdPhase.id;
  const issue = randomUUID();
  await checked(db.from('plan_issues').insert({ id: issue, project_id: house.project, issue_number: 1,
    name: 'Synthetic elevations', idempotency_key: issue, request_hash: 'a'.repeat(64), set_checksum: 'b'.repeat(64),
    sheet_count: 1, created_by: DESIGNER }));
  await checked(studio.rpc('set_project_decision_authority', { p_project_id: house.project,
    p_decision_lead_id: house.id, p_required_coapprover_id: null, p_expected_revision: 0 }));
  const created = await checked(studio.rpc('create_project_approval_decision', { p_project_id: house.project,
    p_payload: { title: 'Synthetic elevations', question: 'Do these synthetic elevations read right?', dueAt: '2099-11-01T12:00:00Z',
      phaseId: phase, sectionKey: 'project', artifactKind: 'plan_issue', artifactId: issue,
      costCentsDelta: 0, scheduleDaysDelta: 0, leadTimeDaysDelta: 0 }, p_idempotency_key: randomUUID() }));
  await checked(house.client.rpc('confirm_project_decision_review', { p_decision_id: created.decisionId,
    p_payload: { authorityRevision: created.authorityRevision, artifactHash: created.artifactHash, reviewMethod: 'portal_clickthrough' },
    p_idempotency_key: randomUUID() }));
  await checked(studio.rpc('publish_client_decision', { p_decision_id: created.decisionId }));
  return created.decisionId as string;
}

test.describe.configure({ timeout: 180000 });

test('A01/A02/A04: six outstanding rows, hidden states, separate currencies and history', async ({ page }) => {
  const house = await household();
  const balances = [60000, 10000, 30000, 25000, 5000, 7500];
  const dates = ['2020-01-01', '2026-10-21', '2099-01-01', '2099-02-01', '2099-03-01', null];
  const ids: string[] = [];
  for (let i = 0; i < balances.length; i++) ids.push(await invoice(house, balances[i], dates[i]));
  const euro = await invoice(house, 12000, '2099-04-01', 'sent', 'EUR');
  const draft = await invoice(house, 900, null, 'draft');
  const voided = await invoice(house, 900, null, 'void');
  const zero = await invoice(house, 0, null);
  await signIn(page, house);
  const outstanding = page.locator('[data-group="payable"]');
  await expect(outstanding).toHaveCount(7);
  expect(await outstanding.first().getAttribute('hidden')).toBeNull();
  const rendered = await outstanding.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-invoice-id')));
  expect(rendered).toEqual([...ids.slice(0, 5), euro, ids[5]]);
  for (const id of ids) await expect(row(page, id)).toBeVisible();
  await expect(row(page, draft)).toHaveCount(0);
  await expect(row(page, voided)).toHaveCount(0);
  await expect(page.locator('[data-currency="USD"][data-testid="letterbox-total-amount"]')).toHaveText(/1,375\.00/);
  await expect(page.locator('[data-currency="EUR"][data-testid="letterbox-total-amount"]')).toHaveText(/120\.00/);
  await page.getByRole('button', { name: 'Payment history', exact: true }).click();
  await expect(row(page, zero)).toContainText('No balance due');
  await expect(row(page, zero)).not.toContainText('Paid');
});

test('A05: processing evidence and review outrank payable; abandoned checkout does not', async ({ page }) => {
  const house = await household();
  const processing = await invoice(house, 10000, null);
  const abandoned = await invoice(house, 10000, null);
  const review = await invoice(house, 10000, null);
  for (const [id, status, intent] of [[processing, 'pending', `pi_${randomUUID()}`], [abandoned, 'pending', null], [review, 'requires_refund', `pi_${randomUUID()}`]] as const) {
    await checked(admin().from('invoice_payments').insert({ invoice_id: id, amount_cents: 10000,
      surcharge_cents: 0, method: 'stripe', status, stripe_payment_intent_id: intent }));
  }
  await signIn(page, house);
  await expect(row(page, processing)).toHaveAttribute('data-group', 'processing');
  await expect(row(page, review)).toHaveAttribute('data-group', 'review');
  await expect(row(page, abandoned)).toHaveAttribute('data-group', 'payable');
  for (const id of [processing, review]) {
    await row(page, id).getByRole('button', { name: 'View invoice' }).click();
    await expect(row(page, id).getByRole('button', { name: /Continue to secure payment/ })).toHaveCount(0);
  }
});

test('A06/A18: invoice read failure keeps recovery and contact, never all-clear', async ({ page }) => {
  const house = await household();
  await invoice(house, 10000, null);
  await page.route('**/rest/v1/invoices?*', route => route.fulfill({ status: 500, json: { message: 'Synthetic unavailable read' } }));
  await signIn(page, house);
  await expect(page.getByTestId('letterbox-read-notice')).toContainText('We couldn’t load your invoices.', { timeout: 30000 });
  await expect(page.getByTestId('letterbox').getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByTestId('letterbox')).not.toContainText('No invoices to pay.');
  await page.unroute('**/rest/v1/invoices?*');
  await page.getByTestId('letterbox').getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('invoice-row')).toHaveCount(1);
});

test('A07/A08/A19/A20: named invoice, disclosure focus, keyboard, 390px and 200% layout', async ({ page }) => {
  const house = await household();
  const id = await invoice(house, 12345, '2099-01-01');
  let starts = 0;
  await page.route('**/functions/v1/create-checkout-session', route => { starts++; return route.abort(); });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, house, `/?invoice=${id}#letterbox`);
  const details = row(page, id).getByTestId('invoice-details');
  await expect(details).toBeVisible();
  await expect(details.getByRole('heading')).toBeFocused();
  const close = details.getByRole('button', { name: 'Close payment details' });
  await targetSize(close);
  await close.focus();
  await page.keyboard.press('Enter');
  const open = row(page, id).getByRole('button', { name: 'View invoice' });
  await expect(open).toBeFocused();
  await targetSize(open);
  await page.keyboard.press('Enter');
  await expect(details).toBeVisible();
  await expect(details.getByRole('heading')).toBeFocused();
  for (const testId of ['invoice-row-amount', 'invoice-row-reference', 'invoice-row-status']) {
    expect(await row(page, id).getByTestId(testId).evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(15);
  }
  await noOverflow(page);
  // Desktop 200% layout viewport (1280 / 2). Chromium's CDP pageScaleFactor
  // is pinch zoom, not browser zoom; don't call that reflow evidence.
  await page.setViewportSize({ width: 640, height: 450 });
  await noOverflow(page);
  for (const link of await page.getByTestId('landmark-ledger').getByRole('link').all()) {
    await targetSize(link);
    const href = await link.getAttribute('href');
    await expect(page.locator(href!)).toHaveCount(1);
  }
  expect(starts, 'opening and changing disclosures never starts payment').toBe(0);
});

for (const outcome of ['approved', 'changes_requested', 'needs_discussion'] as const) {
  test(`A10/A11/A14/A16: ${outcome} records its exact authoritative consent`, async ({ page }) => {
    const house = await household(true);
    const id = await approval(house);
    await signIn(page, house, `/decisions/${id}`);
    await expect(page).toHaveURL(new RegExp(`\\?decision=${id}#approval-${id}$`));
    const ask = page.locator(`#approval-${id}`);
    const label = { approved: 'Approve this edition', changes_requested: 'Request changes', needs_discussion: 'Pause to discuss' }[outcome];
    await ask.getByRole('button', { name: label, exact: true }).click();
    const terminal = ask.getByTestId('approval-terminal');
    const terminalLabel = { approved: 'Approve this edition', changes_requested: 'Send change request', needs_discussion: 'Confirm pause' }[outcome];
    await expect(terminal).toContainText(terminalLabel);
    await expect(terminal).toHaveAttribute('data-hold-ms', '900');
    await targetSize(terminal);
    if (outcome !== 'needs_discussion') {
      await expect(terminal).toHaveAttribute('aria-disabled', 'true');
      await expect(ask.getByTestId('approval-unavailable-reason')).toBeVisible();
      await terminal.focus();
      await page.keyboard.press('Enter');
      const field = outcome === 'approved' ? ask.getByLabel('Your full name') : ask.getByTestId('approval-change-note');
      await expect(field).toBeFocused();
      await field.fill('   ');
      await expect(terminal).toHaveAttribute('aria-disabled', 'true');
      await field.fill(outcome === 'approved' ? 'Synthetic Homeowner' : 'Please widen the synthetic shelf.');
    }
    await expect(terminal).toBeEnabled();
    const before = await checked(house.client.rpc('get_project_decision_review', { p_decision_id: id }));
    expect(before.outcome).toBeNull();
    // A freshly revealed terminal can sit below the fold: focusing it scrolls
    // the page, and that scroll lands a frame later — after the key is down —
    // cancelling the hold as a page scrolled under the thumb. Bring it into
    // view first so the hold is the only thing being tested.
    await terminal.scrollIntoViewIfNeeded();
    await terminal.focus();
    await page.keyboard.down('Enter');
    await expect(terminal).toHaveAttribute('data-hold-state', 'holding');
    await page.keyboard.up('Enter');
    const afterEarlyRelease = await checked(house.client.rpc('get_project_decision_review', { p_decision_id: id }));
    expect(afterEarlyRelease.outcome).toBeNull();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await terminal.focus();
    await page.keyboard.down('Enter');
    await expect.poll(async () => (await checked(house.client.rpc('get_project_decision_review', { p_decision_id: id }))).outcome).toBe(outcome);
    await page.keyboard.up('Enter');
    const record = await checked(house.client.rpc('get_project_decision_review', { p_decision_id: id }));
    expect(record.clientConsentMethod).toBe(outcome === 'approved' ? 'electronic_signature' : 'click_through');
    expect(record.clientSignature).toBe(outcome === 'approved' ? 'Synthetic Homeowner' : null);
    await page.reload();
    await expect(page.locator(`#approval-${id}`)).toContainText(outcome === 'approved' ? 'Approved' : outcome === 'changes_requested' ? 'Change request sent' : /pause|discussion/i);
  });
}

test('A15: expired invitation retries transport failure without promising delivery', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/auth/invite/refresh', route => {
    calls++;
    return route.fulfill({ status: calls === 1 ? 503 : 200, json: calls === 1 ? {} : { ok: true } });
  });
  await page.goto(`/auth/invite/${randomUUID()}`);
  await expect(page.getByText('This invitation link has expired.')).toBeVisible();
  await page.getByRole('button', { name: 'Send a new invitation link' }).click();
  await expect(page.getByTestId('invite-refresh-failed')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('invite-refresh-acknowledged')).toHaveText('If a new invitation can be sent, you’ll receive an email.');
  await expect(page.locator('body')).not.toContainText('Email sent');
  expect(calls).toBe(2);
});

test('A17/A18/A20: empty project progress and studio-only arrival have real destinations', async ({ page }) => {
  const house = await household();
  await invoice(house, 10000, null);
  await signIn(page, house);
  await expect(page.getByText('Pay invoices, review approvals, and follow your project here.', { exact: true })).toBeVisible();
  await page.getByTestId('landmark-ledger').getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(page.locator('#road')).toContainText('Your project isn’t connected to this page yet. You can still view and pay your studio invoices.');
  for (const link of await page.getByTestId('landmark-ledger').getByRole('link').all()) {
    await expect(page.locator((await link.getAttribute('href'))!)).toHaveCount(1);
  }
});

test('A17: connected project without stage or note stays honest', async ({ page }) => {
  const connected = await household(true);
  await signIn(page, connected);
  await expect(page.getByTestId('progress-now')).toContainText('No project stage is shown here yet.');
  await expect(page.getByTestId('progress-update')).toContainText('No current designer update is shown here.');
  await expect(page.getByTestId('project-progress')).not.toContainText('% complete');
});
