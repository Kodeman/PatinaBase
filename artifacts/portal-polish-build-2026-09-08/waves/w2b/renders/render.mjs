/* House-page renders for the Wave 2 ship report. Signs in as the seeded solo
   client the way tests/threshold.spec.ts does, opens Cedar Lane Study, and
   shoots the whole page at both widths, asserting no console error and no
   horizontal overflow at either. */
import { chromium } from '../../../../../node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/Users/kody/Code/patina-merged/artifacts/portal-polish-build-2026-09-08/waves/w2b/renders';
const BASE = 'http://localhost:3002';
const PROJECT_ID = 'b0000000-0000-0000-0000-00000000c0d1';

mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'house-w2b-1440x900', width: 1440, height: 900, scale: 1 },
  { name: 'house-w2b-390x844@2x', width: 390, height: 844, scale: 2 },
];

const browser = await chromium.launch();
const report = [];

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
  const disclosure = page
    .getByRole('button', { name: /sign in with email|use email and password instead/i })
    .first();
  const password = page.getByLabel(/password/i).first();
  for (let i = 0; i < 20; i += 1) {
    try {
      await disclosure.waitFor({ state: 'visible', timeout: 30_000 });
      await disclosure.click();
      await password.waitFor({ state: 'visible', timeout: 5_000 });
      break;
    } catch {
      /* the disclosure is server-rendered before React attaches; press again */
    }
  }
  await page.getByLabel(/email/i).first().fill('client-solo@patina.dev');
  await password.fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });

  await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('doorplate').waitFor({ state: 'visible', timeout: 60_000 });
  await page
    .getByTestId('threshold-hold')
    .waitFor({ state: 'detached', timeout: 90_000 })
    .catch(() => {});
  await page.waitForTimeout(2500);

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const landmarks = [...document.querySelectorAll('[data-testid="landmark-ledger"] a')].map(
      (a) => ({ label: a.textContent?.trim(), href: a.getAttribute('href') }),
    );
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      landmarks,
      landmarkTargets: landmarks.map((l) => ({
        href: l.href,
        present: !!document.querySelector(l.href),
      })),
      anchors: ['doorstep', 'key', 'letterbox', 'wall', 'door', 'road', 'note', 'previously',
        'mat', 'mat-papers', 'ledger', 'changed'].filter((id) => !!document.getElementById(id)),
      owed: document.querySelector('[data-testid="house-ledger-owed"]')?.textContent?.trim() ?? null,
      wallConsequence:
        document.querySelector('[data-testid="wall-consequence"]')?.textContent?.trim() ?? null,
      signOut: [...document.querySelectorAll('[data-testid="mat"] button, [data-testid="mat"] a')]
        .map((n) => n.textContent?.trim())
        .filter((t) => t === 'Sign out').length,
      storyPoleLinks: document.querySelectorAll('[data-testid="story-pole"] a[href^="#"]').length,
    };
  });

  const file = `${OUT}/${vp.name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  report.push({ viewport: vp.name, file, consoleErrors, ...metrics });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));

const failures = report.flatMap((r) => [
  ...(r.consoleErrors.length ? [`${r.viewport}: ${r.consoleErrors.length} console error(s)`] : []),
  ...(r.scrollWidth > r.clientWidth
    ? [`${r.viewport}: scrollWidth ${r.scrollWidth} > clientWidth ${r.clientWidth}`]
    : []),
  ...r.landmarkTargets
    .filter((t) => !t.present)
    .map((t) => `${r.viewport}: landmark ${t.href} has no target`),
]);
if (failures.length) {
  console.error('FAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('OK — no console errors, no horizontal overflow, every landmark resolves.');
