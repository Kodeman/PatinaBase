import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const out = { forwards: [], nav: [], discussions: [], tokens: {} };
  document.querySelectorAll('[data-testid="approval-receipt-forward"]').forEach((e) => {
    const c = getComputedStyle(e);
    out.forwards.push({ text: e.innerText.trim(), color: c.color, cls: (e.className||'').toString().slice(0,120), href: e.getAttribute('href') });
  });
  document.querySelectorAll('nav a.min-h-11.underline, nav .min-h-11.underline').forEach((e) => {
    out.nav.push({ text: e.innerText.trim().slice(0,60), color: getComputedStyle(e).color, cls: (e.className||'').toString().slice(0,120) });
  });
  document.querySelectorAll('[data-testid="approval-discussion"]').forEach((e) => {
    out.discussions.push({ id: e.parentElement?.id, label: e.getAttribute('aria-label'), labelledby: e.getAttribute('aria-labelledby'), role: e.tagName });
  });
  const cs = getComputedStyle(document.documentElement);
  for (const v of ['--text-muted','--color-aged-oak','--text-body','--color-mocha','--color-clay','--text-faint','--color-brass']) out.tokens[v] = cs.getPropertyValue(v).trim();
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
