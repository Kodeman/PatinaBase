// SQ-1805 inbound qty step 1: member opens the paper for the 6-piece stool line and lists the terminal acts. Usage: node w5-inb1.mjs [markSent]
import { open, shot, txt, dump, openLine } from "./rewalk-lib.mjs";
const { browser, page } = await open("us50-member@patina.dev", 1440);
await openLine(page, "Bar stool W5", 1440);
await page.getByRole("button", { name: "Prepare a PO" }).first().click();
const paper = page.getByRole("dialog", { name: /The order paper/i });
await paper.waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
const rad = paper.getByRole("radio", { name: /Receiving Warehouse/ });
if (await rad.count()) await rad.first().check().catch(() => {});
await paper.evaluate(el => el.querySelectorAll("*").forEach(e => { if (e.scrollHeight > e.clientHeight + 20) e.scrollTop = 99999; }));
await dump(page, "dialog button");
console.log((await txt(paper)).slice(-500));
await shot(page, "W5-inb-paper-1440");
if (process.argv[2] === "markSent") {
  await paper.getByRole("button", { name: /mark as sent/i }).first().click();
  await page.waitForTimeout(3000);
  await shot(page, "W5-inb-marksent-1440");
  await dump(page, "dialog button, dialog input, dialog label");
  console.log((await txt(paper)).slice(-500));
}
await browser.close();
