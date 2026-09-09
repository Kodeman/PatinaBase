import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';
import { deleteAllMessages, listMessagesTo, messageBody } from '../helpers/mailpit';

/**
 * The assertion this spec exists for is EXACTLY ONE message. generateLink is
 * the "generate, don't send" endpoint — the in-repo proof is designer-invite,
 * which would otherwise double-mail every designer it onboards — but a two-
 * letter first touch is an embarrassing way to learn that, so it is a one-line
 * assertion here rather than a comment somewhere.
 *
 * Chromium-pinned: this seeds and mutates rows for one shared seeded designer,
 * and Playwright's three browser projects run in parallel as the same user.
 */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'single-actor: the three browser projects would race the same seeded designer',
);

test('a letter goes to a new client, and only one', async ({ authenticatedPage: page }) => {
  const stamp = Date.now();
  const email = `dave.${stamp}@okonkwo.test`;
  await deleteAllMessages();

  await page.goto('/people');
  await page.getByRole('button', { name: /Add person/i }).first().click();
  await page.getByRole('button', { name: 'a client' }).click();
  await page.getByLabel('Full name (optional)').fill('Dave Okonkwo');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('A line for Dave').fill('Dave — the drawings are in.');
  await page.getByRole('button', { name: 'ADD AND SEND THE LETTER' }).click();

  await expect(
    page.getByText(`Dave Okonkwo is on your roster. Your letter is on its way to ${email}.`),
  ).toBeVisible();

  // The send is asynchronous; poll rather than trusting networkidle, which can
  // fire before the write and the send have landed.
  await expect
    .poll(async () => (await listMessagesTo(email)).length, { timeout: 20_000 })
    .toBe(1);

  const [msg] = await listMessagesTo(email);
  // R1 — the studio leads and "via" discloses the relay.
  expect(msg.From.Name).toContain('via Patina');
  // R3 — the subject names the person, and never Patina.
  expect(msg.Subject).toContain('Dave');
  expect(msg.Subject).not.toMatch(/patina/i);
  expect(msg.Subject).not.toMatch(/you're invited/i);

  const body = await messageBody(msg.ID);
  expect(body.HTML).toContain('Dave — the drawings are in.');
  // PP-1 — Patina appears exactly once, in the colophon.
  expect((body.HTML.match(/Patina/g) ?? []).length).toBe(1);
  expect(body.HTML).toContain('Sent through Patina');
  // The CTA is OUR token, not a 60-minute GoTrue link.
  expect(body.HTML).toContain('/auth/invite/');
  expect(body.HTML).not.toContain('/auth/v1/verify');
  // The plain-text part is mandatory on a cold first touch.
  expect(body.Text.length).toBeGreaterThan(0);
});

test('the roster still works with no letter, and nothing is sent', async ({
  authenticatedPage: page,
}) => {
  const stamp = Date.now();
  const email = `quiet.${stamp}@okonkwo.test`;
  await deleteAllMessages();

  await page.goto('/people');
  await page.getByRole('button', { name: /Add person/i }).first().click();
  await page.getByRole('button', { name: 'a client' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Send them the letter').uncheck();
  await page.getByRole('button', { name: 'ADD TO YOUR PEOPLE' }).click();

  await expect(page.getByText(`${email} is on your roster. Nothing was sent.`)).toBeVisible();
  await expect.poll(async () => (await listMessagesTo(email)).length, { timeout: 8_000 }).toBe(0);
});
