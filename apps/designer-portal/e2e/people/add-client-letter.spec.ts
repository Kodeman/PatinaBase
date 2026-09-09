import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';
import { adminDb } from '../helpers/supabase-admin';
import { deleteAllMessages, listMessagesTo } from '../helpers/mailpit';

/**
 * REQUIRES the local edge runtime container (`supabase_edge_runtime_supabase`)
 * to be serving THIS checkout's `supabase/functions` — verify the bind mount
 * first:
 *   docker inspect supabase_edge_runtime_supabase --format '{{range .Mounts}}{{.Source}} {{end}}'
 * If it points somewhere else, `client-invite` runs a different checkout's
 * code and this spec's column assertions (rendered_subject, personal_message)
 * prove nothing about this branch — do not run it there.
 *
 * WHAT THIS PROVES, AND WHY NOT MAILPIT. The letter is sent through
 * sendCompliantEmail → Resend HTTPS (supabase/functions/_shared/send-email.ts),
 * never SMTP, so Mailpit (the local GoTrue SMTP catcher) can never hold it —
 * asserting the letter's contents there is a plan defect this rewrite fixes.
 * Instead this spec reads the frozen snapshot row client-invite writes
 * (`client_invitations`, service role via `adminDb`, same helper the rest of
 * e2e uses) directly. Mailpit still earns one assertion: `client-invite`'s
 * 'invite' path calls `admin.auth.admin.generateLink`, which mints an account
 * and a link WITHOUT mailing it (the header comment on
 * supabase/functions/client-invite/index.ts is explicit — the action_link is
 * discarded); zero messages there for the address proves that leg didn't also
 * send, which would be a duplicate first touch.
 *
 * FAIL LOUD, NEVER SKIP: if the letter route 500s or the upstream function
 * returns non-2xx, `sendTheLetter` (apps/designer-portal/src/app/api/clients/
 * invite/route.ts) surfaces the error inline as "Could not send the letter
 * just now." (or the upstream's own message) — the assertion below fails on
 * that text explicitly rather than timing out silently waiting on the success
 * line.
 *
 * R3 — the subject names the DESIGNER and the project/studio, never the
 * client and never "Patina" (supabase/functions/_shared/client-letter.ts
 * `letterSubject`); the earlier version of this spec asserted the opposite.
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

  const success = page.getByText(
    `Dave Okonkwo is on your roster. Your letter is on its way to ${email}.`,
  );
  const failure = page.getByText(/could not send the letter/i);
  await expect(success.or(failure)).toBeVisible({ timeout: 20_000 });
  if (await failure.isVisible()) {
    throw new Error(`Letter send failed: "${await failure.textContent()}"`);
  }
  await expect(success).toBeVisible();

  // The row lands via the client-invite edge function before the fetch inside
  // sendTheLetter resolves and the UI paints its success line — poll rather
  // than trusting networkidle, which can fire before the insert lands.
  await expect
    .poll(
      async () => {
        const { count, error } = await adminDb
          .from('client_invitations')
          .select('id', { count: 'exact', head: true })
          .eq('email', email);
        if (error) throw error;
        return count ?? 0;
      },
      { timeout: 20_000 },
    )
    .toBe(1);

  const { data: invitations, error } = await adminDb
    .from('client_invitations')
    .select('kind, rendered_subject, personal_message, designer_full_name, designer_given_name')
    .eq('email', email);
  if (error) throw error;
  expect(invitations).toHaveLength(1);
  const [row] = invitations!;

  // A fresh email with no existing profile takes the 'invite' branch, not R13's
  // 'notice'.
  expect(row.kind).toBe('invite');
  // The designer's own words, untouched (validateNote only trims).
  expect(row.personal_message).toBe('Dave — the drawings are in.');
  // R3 — the subject names the studio/designer, and never Patina.
  const designerName = row.designer_full_name ?? row.designer_given_name;
  expect(designerName).toBeTruthy();
  expect(row.rendered_subject).toContain(designerName);
  expect(row.rendered_subject).not.toMatch(/patina/i);

  // generateLink mints the account and discards its action_link without
  // mailing anything — see the header comment on
  // supabase/functions/client-invite/index.ts. Zero messages here rules out a
  // duplicate GoTrue send alongside the Resend letter.
  await expect
    .poll(async () => (await listMessagesTo(email)).length, { timeout: 5_000 })
    .toBe(0);
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

  const { count, error } = await adminDb
    .from('client_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('email', email);
  if (error) throw error;
  expect(count ?? 0).toBe(0);
});
