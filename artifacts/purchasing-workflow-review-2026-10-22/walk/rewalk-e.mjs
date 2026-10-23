// SQ-1801: E (receive drawer defaults) + start of A (pending receipt on chairs). Usage: node rewalk-e.mjs 1440|390 [save]
import { open, shot, txt, body, dump, overflow, openLine } from "./rewalk-lib.mjs";
const w = Number(process.argv[2] || 1440);
const save = process.argv[3] === "save";
const { browser, page } = await open("us50-member@patina.dev", w);
await openLine(page, "Dining chair", w);
for (const id of ["line-next-act", "line-po-cell", "line-movement-cell", "line-receiving-cell"]) console.log("==", id, await txt(page.getByTestId(id)));
await page.getByTestId("line-receiving-cell").scrollIntoViewIfNeeded();
await shot(page, `E-chairs-before-receive-${w}`);
const rb = page.getByRole("button", { name: /Receive a delivery|Log inspection/ }).first();
console.log("receive btn:", await rb.innerText());
await rb.click();
await page.waitForTimeout(2000);
await shot(page, `E-receive-drawer-${w}`);
console.log("drawer:", (await body(page, 3000)));
const selects = page.locator("dialog select, [role=dialog] select, form select");
const n = await selects.count();
for (let i = 0; i < n; i++) {
  const s = selects.nth(i);
  console.log("select", i, "label=", await s.getAttribute("aria-label"), "val=", await s.inputValue().catch(() => ""), "opts=", JSON.stringify(await s.locator("option").allInnerTexts()));
}
console.log("overflow", JSON.stringify(await overflow(page)));
console.log("errs", JSON.stringify(page.errs));
await browser.close();
