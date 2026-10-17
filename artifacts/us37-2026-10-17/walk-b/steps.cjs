// usage: node steps.cjs <portal> <size> <steps.json> [email]
// A step is one of:
//  {goto:"/path"} {wait:ms} {click:"text"|{role,name}|{css}} {fill:{css|label, value}}
//  {press:"Tab"} {tabTo:"accessible name", max} {upload:{css, files:[...]}}
//  {chooser:{click:..., files:[...]}} {shot:"name"} {text:chars} {audit:"css"}
//  {focus:true} (print focused element) {eval:"js"} {scroll:"css"}
const fs = require('fs');
const { open, shot, audit, PORTALS } = require('./lib.cjs');

function loc(page, t) {
  if (typeof t === 'string') return page.getByText(t, { exact: false }).first();
  if (t.role) return page.getByRole(t.role, { name: t.name, exact: !!t.exact }).nth(t.nth || 0);
  if (t.label) return page.getByLabel(t.label, { exact: !!t.exact }).nth(t.nth || 0);
  if (t.testid) return page.getByTestId(t.testid).nth(t.nth || 0);
  return page.locator(t.css).nth(t.nth || 0);
}

async function focused(page) {
  return page.evaluate(() => {
    const e = document.activeElement;
    if (!e) return 'none';
    return `${e.tagName} "${(e.getAttribute('aria-label') || e.innerText || e.value || '').trim().slice(0, 60)}"`;
  });
}

(async () => {
  const [portal, size, file, email] = process.argv.slice(2);
  const steps = JSON.parse(fs.readFileSync(file, 'utf8').replace(/SIZE/g, size === 'wide' ? '1400' : '390'));
  const { browser, page, context, statePath } = await open(portal, size, { email });
  try {
    for (const s of steps) {
      if (s.goto) { await page.goto(PORTALS[portal].base + s.goto, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForTimeout(s.after || 7000); }
      else if (s.wait) await page.waitForTimeout(s.wait);
      else if (s.click) { await loc(page, s.click).click({ timeout: 20000 }); await page.waitForTimeout(s.after || 1500); }
      else if (s.fill) { await loc(page, s.fill).fill(s.fill.value); }
      else if (s.press) { for (let i = 0; i < (s.times || 1); i++) await page.keyboard.press(s.press); await page.waitForTimeout(s.after || 300); }
      else if (s.type) { await page.keyboard.type(s.type); }
      else if (s.tabTo) {
        let ok = false;
        for (let i = 0; i < (s.max || 120); i++) {
          await page.keyboard.press(s.back ? 'Shift+Tab' : 'Tab');
          const f = await focused(page);
          if (f.toLowerCase().includes(s.tabTo.toLowerCase())) { console.log(`tabTo ok after ${i + 1}: ${f}`); ok = true; break; }
        }
        if (!ok) throw new Error('tabTo failed: ' + s.tabTo);
      }
      else if (s.upload) { await page.locator(s.upload.css).nth(s.upload.nth || 0).setInputFiles(s.upload.files); await page.waitForTimeout(s.after || 4000); }
      else if (s.chooser) {
        const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), s.chooser.key ? page.keyboard.press(s.chooser.key) : loc(page, s.chooser.click).click()]);
        await fc.setFiles(s.chooser.files); await page.waitForTimeout(s.after || 6000);
      }
      else if (s.shot) await shot(page, s.shot);
      else if (s.eshot) {
        // Viewport-sized shot scrolled to an element (what the reader sees there).
        const el = loc(page, s.eshot.target);
        await el.scrollIntoViewIfNeeded();
        await page.evaluate((y) => window.scrollBy(0, y), s.eshot.offset ?? -120);
        await page.waitForTimeout(800);
        const file = require('path').join(require('./lib.cjs').OUT, `${s.eshot.name}.png`);
        await page.screenshot({ path: file });
        console.log('shot', file);
      }
      else if (s.text !== undefined) { const t = await page.evaluate((sel) => (sel ? document.querySelector(sel)?.innerText : document.body.innerText) || '(none)', s.sel || null); console.log('---TEXT---\n' + t.slice(0, s.text || 3000)); }
      else if (s.audit) console.log('AUDIT', s.audit, JSON.stringify(await audit(page, s.audit)));
      else if (s.focus) console.log('FOCUS', await focused(page));
      else if (s.eval) { const v = await page.evaluate(s.eval); console.log('OUT>', typeof v === 'string' ? v : JSON.stringify(v)); }
      else if (s.scroll) { await loc(page, s.scroll).scrollIntoViewIfNeeded(); await page.waitForTimeout(500); }
    }
  } catch (e) {
    console.log('STEP ERROR', e.message.split('\n')[0]);
    await shot(page, 'error-last');
  }
  await context.storageState({ path: statePath });
  await browser.close();
})();
