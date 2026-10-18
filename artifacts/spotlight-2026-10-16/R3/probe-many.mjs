// SQ-1055 discovery: node probe-many.mjs '<json [[email,url,[clickRegex...]],...]>' — compact dump per target.
import { chromium, context, BASE, settle } from './walk-lib.mjs';
const targets = JSON.parse(process.argv[2]);
const browser = await chromium.launch();
for (const [email, url, clicks = []] of targets) {
  const s = await context(browser, email, 'desk');
  const page = await s.ctx.newPage();
  const out = { url, steps: [] };
  try {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await settle(page, 7000);
    for (const c of clicks) {
      const b = page.locator('button,a,[role=button],summary', { hasText: new RegExp(c, 'i') }).filter({ visible: true }).first();
      out.steps.push([c, await b.click({ timeout: 6000 }).then(() => 'ok').catch(() => 'MISS')]);
      await page.waitForTimeout(2200);
    }
    out.dialogs = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getBoundingClientRect().width > 0).map((d) => (d.getAttribute('aria-label') || '') + ' :: ' + d.innerText.replace(/\s+/g, ' ').slice(0, 260)));
    out.held = await page.evaluate(() => [...document.querySelectorAll('[aria-disabled=true]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 40) + ' => ' + (b.getAttribute('aria-describedby') ? (document.getElementById(b.getAttribute('aria-describedby').split(' ')[0])?.innerText || '').slice(0, 90) : '-')).slice(0, 14));
    out.buttons = await page.evaluate(() => [...new Set([...document.querySelectorAll('button,a,summary')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 34)).filter(Boolean))].slice(0, 70));
  } catch (e) { out.error = String(e.message).slice(0, 150); }
  console.log(JSON.stringify(out));
  await s.ctx.close();
}
await browser.close();
