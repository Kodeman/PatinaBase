/**
 * V3 verify:repro — The Document Wayfinding Review (2026-08-25).
 *
 * Standalone Playwright script (not the test-runner) mirroring the login /
 * hide-dev-overlays approach in apps/designer-portal/e2e/fixtures/auth.ts
 * and e2e/helpers/hide-dev-overlays.ts. Flag OFF. Navigates every surface
 * named in 30-collated-findings.json at the width the script is invoked
 * with, saving full-page screenshots + innerText dumps for offline
 * cross-checking against each finding's `observation`.
 *
 * Run three passes from this probe/ directory:
 *   SHOT_W=1440 SHOT_H=1000 node run-probe.mjs
 *   SHOT_W=1280 SHOT_H=1000 node run-probe.mjs
 *   SHOT_W=390  SHOT_H=844  node run-probe.mjs
 *
 * IDs re-derived live via psql against document_state for designer
 * a0000000-0000-0000-0000-000000000004 (2026-08-25, this run):
 *   - Chen Residence (project_rich) = 2992a486-b2bd-4139-9e51-33ed1621c59c — MATCHES state-ladder.json's E1-corrected value.
 *   - Full Room lead (brief) = def699b9-4ffa-4d8e-8a9f-17b3d7db84fd — MATCHES E1-corrected value (NOT state-ladder.json's original 6d18a14c...).
 *   - discovery (Ashfords) = d0c10000-0000-0000-0000-0000000000a1 — DRIFTED. state-ladder.json says …a2; that row no longer
 *     exists in document_state. The live relationship row is …a1 ("The Ashfords (no-login household)"). E1's script did NOT
 *     catch this (it assumed fixed-uuid rows survived unchanged) and used the stale …a2. Corrected here.
 *   - install/care/proposal_sent/direction/project_plain all MATCH state-ladder.json unchanged (b0…d1, b0…d3, b0…002, d0c1…b2, b0…d4).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const W = Number(process.env.SHOT_W) || 1440;
const H = Number(process.env.SHOT_H) || 1000;
const PREFIX = `w${W}-`;
const MOBILE = W < 700;

const IDS = {
  brief: 'def699b9-4ffa-4d8e-8a9f-17b3d7db84fd',
  discovery: 'd0c10000-0000-0000-0000-0000000000a1',
  direction: 'd0c10000-0000-0000-0000-0000000000b2',
  proposal_sent: 'b0000000-0000-0000-0000-000000000002',
  project_rich: '2992a486-b2bd-4139-9e51-33ed1621c59c',
  project_plain: 'b0000000-0000-0000-0000-0000000000d4',
  install: 'b0000000-0000-0000-0000-0000000000d1',
  care: 'b0000000-0000-0000-0000-0000000000d3',
};

const TEST_EMAIL = 'designer@patina.dev';
const TEST_PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

const textLog = {};

async function hideDevOverlays(page) {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style');
      style.setAttribute('data-e2e-hide-dev-overlays', '');
      style.textContent =
        '.tsqd-open-btn-container, .tsqd-main-panel { display: none !important; pointer-events: none !important; }';
      document.head?.appendChild(style);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject);
    } else {
      inject();
    }
  });
}

async function signIn(page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {}
  }, WELCOME_SHOWN_KEY);

  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, {
    timeout: 30_000,
    waitUntil: 'networkidle',
  });
  if (!page.url().includes('/auth/signin')) return;

  const disclosure = page.getByRole('button', {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().waitFor({ state: 'visible', timeout: 15_000 });
  await disclosure.first().click();

  const emailInput = page.getByLabel(/email/i).first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill(TEST_EMAIL);
  const passwordInput = page.getByLabel(/password/i).first();
  await passwordInput.fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/, {
    timeout: 60_000,
  });
}

async function shot(page, name, fn, { full = true } = {}) {
  try {
    if (fn) await fn();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `${PREFIX}${name}.png`), fullPage: full });
    const text = await page.evaluate(() => document.body.innerText);
    textLog[`${PREFIX}${name}`] = { url: page.url(), text };
    console.log(`OK ${PREFIX}${name} url=${page.url()}`);
  } catch (e) {
    textLog[`${PREFIX}${name}`] = { url: page.url(), error: String(e) };
    console.log(`FAIL ${PREFIX}${name}: ${e}`);
  }
}

async function gotoDoc(page, id) {
  await page.goto(`${BASE}/doc/${id}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForSelector('[data-document-shell], main', { timeout: 15_000 }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    isMobile: MOBILE,
    hasTouch: MOBILE,
    deviceScaleFactor: MOBILE ? 2 : 1,
  });
  const page = await context.newPage();
  await hideDevOverlays(page);
  await signIn(page);

  // ── Desk ──
  await shot(page, 'desk', async () => {
    await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 30_000 });
  });

  // ── All 8 document states ──
  for (const [key, id] of Object.entries(IDS)) {
    await shot(page, `doc-${key.replace('_', '-')}`, async () => {
      await gotoDoc(page, id);
    });
  }

  // ── ⌘K from desk ──
  await shot(page, 'cmdk-open', async () => {
    await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
    await page.keyboard.press(MOBILE ? 'Control+k' : 'Meta+k');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
  }, { full: false });

  if (!MOBILE) {
    await shot(page, 'cmdk-typed-install', async () => {
      await page.keyboard.type('install');
      await page.waitForTimeout(300);
    }, { full: false });

    await shot(page, 'cmdk-typed-plan', async () => {
      await page.keyboard.press('Meta+a');
      await page.keyboard.type('plan');
      await page.waitForTimeout(300);
    }, { full: false });

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // ── Drafting room ──
    await shot(page, 'drafting-route', async () => {
      await page.goto(`${BASE}/drafting/${IDS.direction}`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
    });

    // ── project_rich: spine, drawer, orders, money, margin, rooms ──
    await gotoDoc(page, IDS.project_rich);

    await shot(page, 'spine-detail', null, { full: false });

    await shot(page, 'drawer-open', async () => {
      const trigger = page.getByRole('button', { name: /studio|drawer|orders|books/i }).first();
      if (await trigger.count()) await trigger.click().catch(() => {});
    }, { full: false });

    await shot(page, 'ledger-sheet-orders', async () => {
      const ordersLink = page.getByRole('link', { name: /^orders$/i }).or(page.getByRole('button', { name: /^orders$/i }));
      if (await ordersLink.count()) {
        await ordersLink.first().click().catch(() => {});
      } else {
        await page.goto(`${BASE}/doc/${IDS.project_rich}/orders`, { waitUntil: 'networkidle' }).catch(() => {});
      }
    });

    await page.keyboard.press('Escape').catch(() => {});
    await gotoDoc(page, IDS.project_rich);

    await shot(page, 'money-region', async () => {
      const moneyHeading = page.getByText(/design authority/i).first();
      if (await moneyHeading.count()) await moneyHeading.scrollIntoViewIfNeeded().catch(() => {});
    }, { full: false });

    if (W >= 1440) {
      await shot(page, 'margin-closed', null, { full: false });
      await shot(page, 'margin-open', async () => {
        const marginTab = page.getByRole('button', { name: /margin/i }).first();
        if (await marginTab.count()) await marginTab.click().catch(() => {});
      }, { full: false });
      await page.keyboard.press('Escape').catch(() => {});
    }

    // Room lens (install has project_rooms rows)
    await gotoDoc(page, IDS.install);
    await shot(page, 'room-lens-install', null, { full: true });

    // Mood boards shelf leaf, Plan room shelf leaf, spec-book shelf leaf
    if (W >= 1440) {
      await gotoDoc(page, IDS.project_rich);
      await shot(page, 'shelf-moodboards', async () => {
        const leaf = page.getByText(/mood board/i).first();
        if (await leaf.count()) await leaf.click().catch(() => {});
      });
      await page.keyboard.press('Escape').catch(() => {});
      await shot(page, 'shelf-planroom', async () => {
        const leaf = page.getByText(/plan room/i).first();
        if (await leaf.count()) await leaf.click().catch(() => {});
      });
      await page.keyboard.press('Escape').catch(() => {});
      await shot(page, 'shelf-knowledge', async () => {
        const leaf = page.getByText(/knowledge/i).first();
        if (await leaf.count()) await leaf.click().catch(() => {});
      });
      await page.keyboard.press('Escape').catch(() => {});
      await shot(page, 'shelf-specbook', async () => {
        const leaf = page.getByText(/spec book/i).first();
        if (await leaf.count()) await leaf.click().catch(() => {});
      });
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  if (MOBILE) {
    // mobile spine sheet + mobile bar + more menu
    await gotoDoc(page, IDS.project_rich);
    await shot(page, 'mobile-bar', null, { full: false });
    await shot(page, 'mobile-spine-sheet', async () => {
      const spineTrigger = page.locator('[data-mobile-spine-trigger], button:has-text("In this document")').first();
      if (await spineTrigger.count()) await spineTrigger.click().catch(() => {});
    });
    await page.keyboard.press('Escape').catch(() => {});
    await shot(page, 'mobile-more-menu', async () => {
      const moreBtn = page.getByRole('button', { name: /more/i }).first();
      if (await moreBtn.count()) await moreBtn.click().catch(() => {});
    });
    await page.keyboard.press('Escape').catch(() => {});
    await shot(page, 'ffe-head-390', async () => {
      const ffeHeading = page.getByText(/project.*ff&e|ff&e/i).first();
      if (await ffeHeading.count()) await ffeHeading.scrollIntoViewIfNeeded().catch(() => {});
    });
  }

  writeFileSync(path.join(OUT, `text-dump-w${W}.json`), JSON.stringify(textLog, null, 2));
  await browser.close();
  console.log('DONE', W);
})();
