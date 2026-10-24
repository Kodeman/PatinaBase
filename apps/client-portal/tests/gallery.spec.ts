import { test, expect, type Page, type Locator } from '@playwright/test';
import { createRequire } from 'node:module';
import { ELM, LAKE, servePlates, settled, signInAsJune, sideboardStatusWords } from './fixtures/house-issue';
import { admin, checked, household, invoice, signIn, approval, row, targetSize } from './fixtures/homeowner';

// Reuse the repo's installed axe runner; do not add a client dependency.
const requireAdmin = createRequire(require.resolve('../../admin-portal/package.json'));
const { injectAxe, getViolations } = requireAdmin('axe-playwright');

test.describe.configure({ timeout: 120000 });

async function openAddress(page: Page, hash: string) {
  await page.goto(`/projects/${ELM.id}${hash}`);
  await settled(page);
  await expect(page.getByRole('dialog', { name: 'Invoices and approvals' })).toBeVisible();
}

async function above(first: Locator, second: Locator) {
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`Gallery ${viewport.width}`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => { await servePlates(page); });

    test('arrival names the urgent amount and shows the first caption below the band', async ({ page }, info) => {
      await signInAsJune(page, `/projects/${ELM.id}`);
      await settled(page);
      const arrival = page;
      // The fixture's legacy 60-character headline falls back to the house.
      await expect(arrival.getByRole('heading', { level: 1 })).toHaveText(ELM.name);
      await expect(arrival.getByRole('link', { name: /\$600\.00 past due/ })).toBeVisible();
      const figure = arrival.getByRole('figure').first();
      await expect(figure.getByRole('img')).toBeVisible();
      const caption = figure.locator('figcaption');
      await expect(caption).not.toBeEmpty();
      const captionBox = await caption.boundingBox();
      expect(captionBox!.y).toBeGreaterThanOrEqual(viewport.height - 48);
      expect(captionBox!.y).toBeLessThan(viewport.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      expect(await page.locator('body').innerText()).not.toMatch(/\bAI\b/i);
      await page.screenshot({ path: info.outputPath('arrival.png') });
    });

    for (const anchor of ['doorstep', 'ledger', 'letterbox', 'approvals']) {
      test(`#${anchor} opens asks with the correct item reached`, async ({ page }) => {
        await signInAsJune(page, `/projects/${ELM.id}${'#' + anchor}`);
        await settled(page);
        const drawer = page.getByRole('dialog', { name: 'Invoices and approvals' });
        await expect(drawer).toBeVisible();
        const first = drawer.locator('[data-invoice-id]').first();
        await expect(first).toHaveAttribute('data-invoice-id', ELM.invoices[0]);
        if (anchor === 'approvals') {
          await expect(page.locator('#approvals')).toBeInViewport();
        } else {
          await expect(first.getByRole('button', { name: /Continue to secure payment/ })).toBeVisible();
        }
      });
    }

    for (const anchor of ['note', 'road', 'previously', 'mat']) {
      test(`#${anchor} scrolls to its permanent target`, async ({ page }) => {
        await signInAsJune(page, `/projects/${ELM.id}`);
        await settled(page);
        await page.goto(`/projects/${ELM.id}#${anchor}`);
        await expect(page.locator(`#${anchor}`)).toBeInViewport();
        await expect(page.getByRole('dialog')).not.toBeVisible();
      });
    }

    for (const close of ['Escape', 'Back']) {
      test(`${close} closes asks and returns focus to the band opener`, async ({ page }) => {
        await signInAsJune(page, `/projects/${ELM.id}`);
        await settled(page);
        const opener = page.getByRole('link', { name: /\$600\.00 past due/ });
        await opener.click();
        await expect(page.getByRole('dialog', { name: 'Invoices and approvals' })).toBeVisible();
        if (close === 'Escape') await page.keyboard.press('Escape');
        else await page.goBack();
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await expect(opener).toBeFocused();
      });
    }

    test('Menu lists asks before other houses before chapters', async ({ page }) => {
      await signInAsJune(page, `/projects/${ELM.id}`);
      await settled(page);
      await page.getByRole('link', { name: 'Menu', exact: true }).click();
      const menu = page.getByRole('navigation', { name: 'Page index' });
      const links = await menu.getByRole('link').evaluateAll(nodes => nodes.map(n => ({ href: n.getAttribute('href'), text: n.textContent })));
      const asks = links.findIndex(n => n.href === '#approvals');
      const lake = links.findIndex(n => n.href === `/projects/${LAKE.id}`);
      const chapter = links.findIndex(n => n.href?.startsWith('#room-'));
      expect(asks).toBeGreaterThanOrEqual(0);
      expect(lake).toBeGreaterThan(asks);
      expect(chapter).toBeGreaterThan(lake);
      expect(links[lake].text).toMatch(/Lake Cottage.+waiting|Lake Cottage.+Nothing/);
      await expect(menu.getByRole('link', { name: 'The house', exact: true })).toHaveAttribute('href', '#key');
    });

    test('Every piece opens the room rows with status in words', async ({ page }) => {
      await signInAsJune(page, `/projects/${ELM.id}`);
      await settled(page);
      const pieces = page.getByRole('link', { name: /Every piece in the Living room/i });
      await pieces.click();
      const drawer = page.getByRole('dialog', { name: /Every piece in the Living room/i });
      await expect(drawer).toBeVisible();
      for (const name of [ELM.sideboard, ELM.sofa]) {
        const piece = drawer.getByRole('listitem').filter({ hasText: name });
        await expect(piece).toHaveCount(1);
        await expect(piece.getByText(name, { exact: true }).first()).toBeVisible();
      }
      await expect(drawer.getByRole('listitem').filter({ hasText: ELM.sideboard })).toContainText(await sideboardStatusWords());
    });

    test('Pay reaches the existing checkout seam without touching Stripe', async ({ page }) => {
      let calls: { invoice_id?: string }[] = [];
      await page.route('**/functions/v1/create-checkout-session', async route => {
        if (route.request().method() === 'OPTIONS') return route.continue();
        calls.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, json: {
          url: `/projects/${ELM.id}?checkout=cancelled&invoice=${ELM.invoices[0]}#letterbox`,
          amount_cents: 60000, currency: 'usd', checkout_attempt_id: 'cka_gallery',
          payment_id: 'pay_gallery', session_id: 'cs_gallery', reused: false,
          surcharge_cents: 0, payment_method: 'us_bank_account',
        } });
      });
      await signInAsJune(page, `/projects/${ELM.id}#doorstep`);
      await settled(page);
      const pay = page.getByRole('button', { name: /Continue to secure payment/ });
      await expect(pay).toBeVisible();
      await targetSize(pay);
      await pay.click();
      await expect.poll(() => calls.length).toBe(1);
      expect(JSON.stringify(calls[0])).toContain(ELM.invoices[0]);
      await expect(page.getByTestId('letterbox-receipt')).toHaveText('Nothing changed.');
      await expect(page.getByRole('dialog', { name: 'Invoices and approvals' })).toBeVisible();
    });

    test('checkout return shows a server-confirmed receipt first, not the paid invoice', async ({ page }) => {
      const house = await household(true);
      const id = await invoice(house, 60000, '2020-01-01');
      const other = await invoice(house, 10000, '2099-01-01');
      // Model the settled webhook on a disposable local invoice, not a URL claim.
      await checked(admin().from('invoice_payments').insert({ invoice_id: id, amount_cents: 60000,
        surcharge_cents: 0, method: 'stripe', status: 'succeeded', received_at: '2026-10-24T12:00:00Z' }));
      await checked(admin().from('invoices').update({ status: 'paid', amount_paid_cents: 60000 }).eq('id', id));
      await signIn(page, house, `/projects/${house.project}?invoice=${id}&checkout=success#letterbox`);
      const drawer = page.getByRole('dialog', { name: 'Invoices and approvals' });
      await expect(drawer).toBeVisible();
      const receipt = drawer.getByTestId('letterbox-receipt');
      await expect(receipt).toHaveText('Paid $600.00 on 24 October. Thank you.');
      await expect(row(page, id).filter({ has: page.getByRole('button', { name: /Continue to secure payment/ }) })).toHaveCount(0);
      await above(receipt, row(page, other));
      await expect.poll(() => new URL(page.url()).searchParams.get('checkout')).toBeNull();
    });

    test('pointer hold Approve records consent; early release records nothing', async ({ page }) => {
      const house = await household(true);
      const id = await approval(house);
      await signIn(page, house, `/projects/${house.project}#approval-${id}`);
      const ask = page.locator(`#approval-${id}`);
      await ask.getByRole('button', { name: 'Approve this edition', exact: true }).click();
      await ask.getByLabel('Your full name').fill('Synthetic Homeowner');
      const terminal = ask.getByTestId('approval-terminal');
      await targetSize(terminal);
      await terminal.scrollIntoViewIfNeeded();
      await terminal.focus();
      await terminal.hover();
      await expect(terminal).not.toHaveAttribute('aria-disabled', 'true');
      await page.mouse.down();
      await expect(terminal).toHaveAttribute('data-hold-state', 'holding');
      await page.mouse.up();
      expect((await checked(house.client.rpc('get_project_decision_review', { p_decision_id: id }))).outcome).toBeNull();
      await page.mouse.down();
      await expect.poll(async () => (await checked(house.client.rpc('get_project_decision_review', { p_decision_id: id }))).outcome).toBe('approved');
      await page.mouse.up();
      const result = await checked(house.client.rpc('get_project_decision_review', { p_decision_id: id }));
      expect(result.clientSignature).toBe('Synthetic Homeowner');
      expect(result.clientConsentMethod).toBe('electronic_signature');
    });

    for (const check of ['44px controls', 'no AI word or overflow', 'installed axe accessibility']) {
      test(`${check} on page, asks and Menu`, async ({ page }) => {
        await signInAsJune(page, `/projects/${ELM.id}`);
        await settled(page);
        if (check === 'installed axe accessibility') await injectAxe(page);
        for (const state of ['page', 'asks', 'menu']) {
          if (state === 'asks') await page.getByRole('link', { name: /\$600\.00 past due/ }).click();
          if (state === 'menu') {
            await page.keyboard.press('Escape');
            await page.getByRole('link', { name: 'Menu', exact: true }).click();
          }
          if (check === '44px controls') {
            const controls = (state === 'page' ? page.locator('main') : page.getByRole('dialog'))
              .locator('a, button, summary, input, select, textarea');
            for (const control of await controls.all()) if (await control.isVisible()) await targetSize(control);
          } else if (check === 'no AI word or overflow') {
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
            expect(await page.locator('body').innerText()).not.toMatch(/\bAI\b/i);
          } else {
            const violations = await getViolations(page, undefined, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
            expect(violations.map((v: { id: string; nodes: unknown[] }) => ({ id: v.id, nodes: v.nodes })), state).toEqual([]);
          }
        }
      });
    }
  });
}
