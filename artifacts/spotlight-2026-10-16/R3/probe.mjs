// SQ-1055 discovery probe: land, click a sequence of buttons (regex), dump dialogs + held acts.
// node probe.mjs <email> <url> [buttonRegex ...]   (a step "ev:<name>:<json>" dispatches a window CustomEvent)
import { chromium, context, BASE, settle } from './walk-lib.mjs';
const [email, url, ...clicks] = process.argv.slice(2);
const browser = await chromium.launch();
const s = await context(browser, email, 'desk');
const page = await s.ctx.newPage();
await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 300000 });
await settle(page, 8000);
const out = { url: page.url(), steps: [] };
for (const c of clicks) {
  if (c.startsWith('ev:')) {
    const [, name, json] = c.match(/^ev:([^:]+):?(.*)$/);
    await page.evaluate(([n, d]) => window.dispatchEvent(new CustomEvent(n, { detail: d ? JSON.parse(d) : {} })), [name, json]);
  } else {
    const b = page.locator('button,a,[role=button]', { hasText: new RegExp(c, 'i') }).filter({ visible: true }).first();
    const ok = await b.click({ timeout: 8000 }).then(() => true).catch((e) => String(e.message).slice(0, 80));
    out.steps.push({ c, ok });
  }
  await page.waitForTimeout(2500);
}
out.dialogs = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getBoundingClientRect().width > 0).map((d) => ({ label: d.getAttribute('aria-label'), frame: !!d.closest('[data-spotlight-frame]') || !!d.querySelector('[data-spotlight-frame]'), text: d.innerText.replace(/\s+/g, ' ').slice(0, 500) })));
out.held = await page.evaluate(() => [...document.querySelectorAll('[aria-disabled=true]')].map((b) => ({ text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 50), reason: b.getAttribute('aria-describedby') ? (document.getElementById(b.getAttribute('aria-describedby').split(' ')[0])?.innerText || '').slice(0, 120) : null, inDialog: !!b.closest('[role=dialog]'), frame: b.closest('[data-spotlight-frame]')?.tagName ?? null })));
out.buttons = await page.evaluate(() => [...new Set([...document.querySelectorAll('button,a')].map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean))].slice(0, 90));
console.log(JSON.stringify(out, null, 0));
await browser.close();
