import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

/**
 * THE DIRECTORY — the room's ledger (PR-q), its six chips (PR-g), and the
 * address that names what is on screen (PR-j).
 *
 * Read-only: nothing here writes, so it runs against whatever the studio's
 * book already holds. What it pins is the GRAMMAR, which no fixture can drift:
 * the head counts both nouns, the chips are six in one order, a row is a
 * container with sibling controls, and a narrowing survives a refresh.
 *
 * Chromium-pinned beside its writing siblings so the three specs share one
 * actor's state in one order.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'single seeded actor');

test.describe('the Directory', () => {
  test('the head counts cards, and names both nouns', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/people');
    await expect(page.getByRole('heading', { name: 'The People Room' })).toBeVisible();
    await expect(page.getByText(/\d+ (people|person) · \d+ firms?/)).toBeVisible();
  });

  test('six chips, in one order, inside a group that says what it narrows', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/people');
    const group = page.getByRole('group', { name: 'Narrow the book' });
    await expect(group.getByRole('button')).toHaveText([
      'Everyone',
      'Clients',
      'Crew',
      'Makers',
      'Studio',
      'Firms',
    ]);
    await expect(group.getByRole('button', { name: 'Everyone' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the trade line appears under Crew and nowhere else', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/people');
    await expect(page.getByRole('group', { name: 'Narrow by trade' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Crew' }).click();
    await expect(page.getByRole('group', { name: 'Narrow by trade' })).toBeVisible();
    await page.getByRole('button', { name: 'Clients' }).click();
    await expect(page.getByRole('group', { name: 'Narrow by trade' })).toHaveCount(0);
  });

  test('PR-j — the narrowing stays in the address and survives a refresh', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/people');
    await page.getByRole('button', { name: 'Crew' }).click();
    await expect(page).toHaveURL(/role=crew/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Crew' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('a legacy ?role= link still lands somewhere true', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/people?role=sub');
    await expect(page.getByRole('button', { name: 'Crew' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('C11 — a row is a container, and its phone is a sibling control', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/people');
    const rows = page.locator('[data-person-row]');
    await expect(rows.first()).toBeVisible();
    // The row itself is never a button; the name inside it is.
    await expect(rows.first().locator('xpath=self::button')).toHaveCount(0);
    await expect(rows.first().locator('[data-open-person]')).toHaveCount(1);
    // An anchor may never nest inside the open control.
    await expect(
      rows.first().locator('[data-open-person] a[data-tel-link]'),
    ).toHaveCount(0);
  });

  test('nothing under a narrowing says so in the room’s own words', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/people');
    await page.getByLabel(/ask/i).first().fill('zzzzzz-nobody-by-this-name');
    await expect(page.getByText('Nobody under this narrowing yet.')).toBeVisible();
  });
});
