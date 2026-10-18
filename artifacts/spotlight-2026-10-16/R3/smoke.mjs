// SQ-1055 smoke: sign in locally, land on a URL, list visible held acts. node smoke.mjs <email> <url>
import { chromium, context, BASE, settle } from './walk-lib.mjs';
const [email = 'designer@patina.dev', url = '/desk'] = process.argv.slice(2);
const browser = await chromium.launch();
const s = await context(browser, email, 'desk');
const page = await s.ctx.newPage();
await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 300000 });
await settle(page, 8000);
const held = await page.evaluate(() => [...document.querySelectorAll('[aria-disabled=true],[data-held]')].map((b) => ({ text: (b.innerText || '').trim().slice(0, 60), d: b.getAttribute('aria-describedby') })).slice(0, 40));
console.log(JSON.stringify({ iss: s.iss, url: page.url(), title: await page.title(), held, remote: s.remote.length, body: (await page.evaluate(() => document.body.innerText)).slice(0, 600) }, null, 1));
await browser.close();
