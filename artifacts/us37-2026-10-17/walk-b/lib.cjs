// SQ-1110 walk B driver helpers. Local Supabase only (127.0.0.1:54321).
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/kody/Code/patina-merged/.claude/worktrees/us37-release-b/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright');

const OUT = '/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1110';
const STATE = path.join(OUT, 'state');
fs.mkdirSync(STATE, { recursive: true });

const PORTALS = {
  designer: { base: 'http://localhost:3000', email: 'designer@patina.dev' },
  client: { base: 'http://localhost:3002', email: 'client-solo@patina.dev' },
};
const SIZES = { wide: { width: 1400, height: 900 }, narrow: { width: 390, height: 844 } };

async function open(portal, size = 'wide', opts = {}) {
  const browser = await chromium.launch({ headless: true });
  const statePath = path.join(STATE, `${portal}-${opts.email || PORTALS[portal].email}.json`);
  const context = await browser.newContext({
    viewport: SIZES[size],
    // BYPASS_CSP=1: local-only harness setting. The client CSP allows https images only,
    // and local storage is http://127.0.0.1:54321 (ENV-2); prod storage is https.
    bypassCSP: process.env.BYPASS_CSP === '1',
    storageState: fs.existsSync(statePath) ? statePath : undefined,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
  return { browser, context, page, statePath };
}

async function login(portal, email) {
  email = email || PORTALS[portal].email;
  const { browser, context, page, statePath } = await open(portal, 'wide', { email });
  await page.goto(`${PORTALS[portal].base}/auth/signin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  const pw = page.getByText('Use a password instead');
  if (await pw.count()) await pw.first().click();
  await page.waitForTimeout(1000);
  await page.locator('input[type=email]').first().fill(email);
  await page.locator('input[type=password]').first().fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(8000);
  console.log('after login url', page.url());
  await context.storageState({ path: statePath });
  await browser.close();
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('shot', file);
  return file;
}

/** Shadow and truncation audit of the subtree matched by selector. */
async function audit(page, selector) {
  return page.evaluate((sel) => {
    const roots = Array.from(document.querySelectorAll(sel));
    const shadows = []; const truncs = [];
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const cs = getComputedStyle(el);
        if (cs.boxShadow && cs.boxShadow !== 'none') shadows.push(`${el.tagName}.${(el.className || '').toString().slice(0, 60)} ${cs.boxShadow}`);
        if (cs.filter && cs.filter.includes('drop-shadow')) shadows.push(`${el.tagName} filter ${cs.filter}`);
        if (cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) truncs.push(`${el.tagName}.${(el.className || '').toString().slice(0, 60)}: ${el.textContent.slice(0, 40)}`);
        if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'hidden' && el.textContent.trim()) truncs.push(`clipped ${el.tagName}.${(el.className || '').toString().slice(0, 40)}: ${el.textContent.slice(0, 40)}`);
      }
    }
    return { roots: roots.length, shadows, truncs, hscroll: document.documentElement.scrollWidth > window.innerWidth };
  }, selector);
}

module.exports = { open, login, shot, audit, PORTALS, SIZES, OUT };
