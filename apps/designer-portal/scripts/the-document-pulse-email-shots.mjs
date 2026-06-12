/**
 * Slice 6 increment 2 — the Pulse email leg (R13) acceptance.
 *   - sending the Pulse from the margin flips it to 'sent' (the RPC) AND
 *     posts the client portal mirror (comms_messages)
 *   - the email leg (/api/pulse/send-email) fires after the RPC, renders the
 *     WeeklyPulse template, and is NON-FATAL: with no RESEND_API_KEY locally
 *     it returns { ok:true, emailSent:false } and the send is unaffected (I12)
 *
 *   node scripts/the-document-pulse-email-shots.mjs
 *
 * Requires: worktree dev server on :3100, migrations through 00201, seed run.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-6/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const WHITFIELD_PROPOSAL = 'b0000000-0000-0000-0000-000000000001';
const DESIGNER = 'a0000000-0000-0000-0000-000000000004';

const psql = (sql) =>
  execSync('docker exec -i supabase_db_supabase psql -U postgres -d postgres -At', { input: sql })
    .toString()
    .trim();

const projectId = psql(`select project_id from proposals where id='${WHITFIELD_PROPOSAL}';`);
// Reset this week's pulse to draft so it can be sent (idempotent re-runs).
psql(`update weekly_pulses set status='draft', sent_at=null, sent_message_id=null
      where project_id='${projectId}' and week_of = date_trunc('week', now())::date;`);
const mirrorsBefore = psql(
  `select count(*) from comms_messages m join comms_threads t on t.id=m.thread_id
   where t.project_id='${projectId}';`,
);

const waitFor = async (label, fn, timeoutMs = 12000) => {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });

// capture the email-leg response
let emailLeg = null;
page.on('response', async (res) => {
  if (res.url().includes('/api/pulse/send-email')) {
    emailLeg = { status: res.status(), body: await res.json().catch(() => null) };
  }
});

await page.goto(`${BASE}/auth/signin`);
await page.click('text=/sign in with email/i');
try {
  await page.waitForSelector('input[type="password"]', { timeout: 15_000 });
} catch {
  await page.click('[data-testid="auth-mode-toggle"]');
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
}
await page.fill('input[type="email"]', 'designer@patina.dev');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/portal**', { timeout: 60_000 });

await page.goto(`${BASE}/doc/${WHITFIELD_PROPOSAL}`);
await page.waitForURL((u) => !u.pathname.includes(WHITFIELD_PROPOSAL), { timeout: 60_000 });
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });

// Open the Pulse margin item and send it.
await page.click('aside[aria-label="Margin"] >> text=/Weekly Pulse/i');
await page.waitForSelector('aside[aria-label="Margin"] >> textarea', { timeout: 15_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}pulse-compose.png`, fullPage: false });
await page.click('aside[aria-label="Margin"] >> text=/^Send the Pulse$|^Send Pulse$|^Send$/');

// The pulse flips to sent (RPC) and the mirror posts.
await waitFor('pulse sent', async () => {
  return (
    psql(
      `select status from weekly_pulses where project_id='${projectId}'
       and week_of = date_trunc('week', now())::date;`,
    ) === 'sent'
  );
});
const mirrorsAfter = psql(
  `select count(*) from comms_messages m join comms_threads t on t.id=m.thread_id
   where t.project_id='${projectId}';`,
);
if (Number(mirrorsAfter) !== Number(mirrorsBefore) + 1)
  throw new Error(`portal mirror not posted (${mirrorsBefore} → ${mirrorsAfter})`);
console.log('✓ Pulse sent: status→sent (RPC) and the client portal mirror posted');

// The email leg fired and was non-fatal (no RESEND key locally → emailSent:false).
await waitFor('email leg responded', async () => emailLeg !== null);
if (emailLeg.status !== 200)
  throw new Error(`email leg returned ${emailLeg.status} (must be non-fatal 200)`);
if (emailLeg.body?.ok !== true)
  throw new Error(`email leg body not ok: ${JSON.stringify(emailLeg.body)}`);
console.log(
  `✓ email leg fired, non-fatal: ${JSON.stringify(emailLeg.body)} (renders + sends in prod with RESEND_API_KEY)`,
);

await browser.close();
console.log('done');
