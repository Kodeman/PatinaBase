// SQ-1807 inbound qty: read each stool inbound-notice draft's textarea (the draft review sheet) and screenshot it. No Send. Usage: node w5-inb5.mjs
import { open, shot, openLine, overflow } from "./rewalk-lib.mjs";
for (const w of [1440, 390]) {
  const { browser, page } = await open("us50-member@patina.dev", w);
  await openLine(page, "Bar stool W5", w);
  const areas = page.locator("textarea");
  const n = await areas.count();
  console.log(`[${w}] textareas:`, n);
  for (let i = 0; i < n; i++) {
    const ta = areas.nth(i);
    const v = await ta.inputValue();
    if (!/shipment from|inbound/i.test(v)) { console.log(`[${w}] ta${i} skipped (not a notice)`); continue; }
    const m = v.match(/^.*\d+\s*×.*$/gm);
    console.log(`[${w}] ta${i} piece lines:`, JSON.stringify(m), "| has '6 ×':", /6\s*×/.test(v));
    console.log(`[${w}] ta${i} body:`, JSON.stringify(v.slice(0, 700)));
    await ta.scrollIntoViewIfNeeded();
    await ta.evaluate((el) => { const k = el.value.search(/\d+\s*×/); const lines = el.value.slice(0, Math.max(k, 0)).split("\n").length; el.scrollTop = Math.max(0, (lines - 2)) * 20; });
    await shot(page, `W5-r7-inbound-draft${i}-${w}`);
  }
  console.log("overflow", JSON.stringify(await overflow(page)));
  await browser.close();
}
