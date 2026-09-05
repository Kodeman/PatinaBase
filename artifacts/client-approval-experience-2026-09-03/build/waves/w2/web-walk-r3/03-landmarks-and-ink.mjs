import { open, signIn, openHouse, t } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

const lm = await page.evaluate(() => {
  const out = [];
  for (const s of document.querySelectorAll('[data-testid="approval-discussion"]')) {
    const r = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    out.push({
      label: s.getAttribute('aria-label'),
      id: s.closest('[data-testid="doorstep-approval"]')?.id ?? null,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
      hiddenAncestor: !!s.closest('[aria-hidden="true"],[hidden]'),
    });
  }
  return out;
});
console.log('discussion landmarks:', lm.length);
const byLabel = {};
for (const l of lm) (byLabel[l.label] ??= []).push(l);
for (const [k, v] of Object.entries(byLabel))
  console.log(`  ${v.length}x  "${k}"  visible=${v.filter((x) => x.visible).length}  hiddenAncestor=${v.filter((x) => x.hiddenAncestor).length}`);

// the door's low-contrast meta line
const ink = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('[data-gate-variant] .type-meta-small')) {
    const cs = getComputedStyle(el);
    out.push({
      variant: el.closest('[data-gate-variant]')?.getAttribute('data-gate-variant'),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      color: cs.color, size: cs.fontSize, bg: getComputedStyle(el.parentElement).backgroundColor,
      cls: el.className,
    });
  }
  return out;
});
console.log('\n[data-gate-variant] .type-meta-small nodes:', ink.length);
for (const i of ink) console.log('  ', JSON.stringify(i));
await browser.close();
