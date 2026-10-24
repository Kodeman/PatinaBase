import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Only disposable LOCAL households. No Stripe, outbound mail or customer records.
// Server reads, RLS and approval writes remain real; faults are injected at the
// browser's RPC boundary, never by replacing page markup or the response rail.
import { admin, checked, household, invoice, signIn, row, noOverflow, targetSize, approval } from './fixtures/homeowner';

test.describe.configure({ timeout: 180000 });

test('A01/A02/A04: six outstanding rows, hidden states, separate currencies and history', async ({ page }) => {
  const house = await household(true);
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
  const remaining = page.getByTestId('gallery-also-open');
  await expect(remaining).toContainText(/775\.00/);
  await expect(remaining).toContainText(/120\.00/);
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
  await expect.soft(page.getByText('Pay invoices, review approvals, and follow your project here.', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/#road');
  await expect(page.locator('#road')).toContainText('Your project isn’t connected to this page yet. You can still view and pay your studio invoices.');
  for (const link of await page.getByTestId('landmark-ledger').getByRole('link').all()) {
    await expect(page.locator((await link.getAttribute('href'))!)).toHaveCount(1);
  }
});

test('A17: connected project without stage or note stays honest', async ({ page }) => {
  const connected = await household(true);
  await signIn(page, connected);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'The house', exact: true }).click();
  await expect(page.getByTestId('progress-now')).toContainText('No project stage is shown here yet.');
  await expect(page.getByTestId('progress-update')).toContainText('No current designer update is shown here.');
  await expect(page.getByTestId('project-progress')).not.toContainText('% complete');
});
