// SQ-1801: the 390 shots the first walk missed (steps 3, 6, 8, 12, 13) + F project head at 390. Usage: node rewalk-m390.mjs
import { open, shot, txt, body, dump, openLine, overflow, BASE } from "./rewalk-lib.mjs";
const w = 390;
const { browser, page } = await open("us50-member@patina.dev", w);
// steps 3 + 8: sofa (released, not sent) order cell
await openLine(page, "Channel-back sofa", w);
await page.getByTestId("line-po-cell").scrollIntoViewIfNeeded();
await shot(page, "S3-S8-sofa-order-cell-390");
console.log("sofa next:", await txt(page.getByTestId("line-next-act")));
console.log("sofa po cell:", (await txt(page.getByTestId("line-po-cell"))).slice(0, 700));
console.log("overflow", JSON.stringify(await overflow(page)));
// step 13: quote verbs (rug has quote cell) + draft sheet
await openLine(page, "Custom lounge chair", w);
const q = page.getByRole("button", { name: /Draft quote request/ }).first();
await q.scrollIntoViewIfNeeded();
await shot(page, "S13-quote-verbs-390");
console.log("quote verbs:", await page.getByRole("button", { name: /Draft quote request|Record quote/ }).allInnerTexts());
await q.click(); await page.waitForTimeout(2000);
await shot(page, "S13-quote-draft-sheet-390");
console.log("quote sheet:", (await body(page, 30000)).match(/[^|]*(Nothing is sent from Patina|copy)[^|]*/gi)?.slice(0, 4));
await page.keyboard.press("Escape"); await page.waitForTimeout(800);
// step 12: COM reading on the lounge chair
const com = page.getByText(/Workroom confirmation|Not confirmed/).first();
await com.scrollIntoViewIfNeeded().catch(() => {});
await shot(page, "S12-com-reading-390");
const t = await body(page, 40000);
console.log("COM:", t.match(/[^|]*(Not confirmed|Workroom confirmation|Material arrival alone)[^|]*/g)?.slice(0, 5));
console.log("overflow", JSON.stringify(await overflow(page)));
console.log("errs", JSON.stringify(page.errs.slice(0, 4)));
await browser.close();
