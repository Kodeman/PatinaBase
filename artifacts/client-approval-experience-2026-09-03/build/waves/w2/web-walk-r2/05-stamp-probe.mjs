import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'stair rail turn');
await ask.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
const tree = await ask.locator('[data-testid="approval-stamp"]').first().evaluate((root) => {
  const out = [];
  const walk = (el, d) => {
    const cs = getComputedStyle(el);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('|');
    out.push({ d, tag: el.tagName, cls: el.className, txt: own.slice(0, 40), color: cs.color, bg: cs.backgroundColor, border: cs.borderColor, bw: cs.borderWidth, shadow: cs.boxShadow });
    [...el.children].forEach((c) => walk(c, d + 1));
  };
  walk(root, 0);
  return out;
});
tree.forEach((n) => console.log(`${'  '.repeat(n.d)}${n.tag} "${n.txt}" color=${n.color} bg=${n.bg} border=${n.bw} ${n.border} shadow=${n.shadow}\n${'  '.repeat(n.d)}   cls=${n.cls}`));
await browser.close();
