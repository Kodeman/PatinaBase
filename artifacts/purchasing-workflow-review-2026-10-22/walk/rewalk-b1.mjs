// SQ-1801 B step 1: member prepares a PO on the rug; with arg "hold" presses Hold for release. Usage: node rewalk-b1.mjs [hold]
import { open, shot, txt, body, dump, openLine } from "./rewalk-lib.mjs";
const { browser, page } = await open("us50-member@patina.dev", 1440);
await openLine(page, "Hand-knotted rug", 1440);
await page.getByRole("button", { name: "Prepare a PO" }).first().click();
const paper = page.getByRole("dialog", { name: /The order paper/i });
await paper.waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
const rad = paper.getByRole("radio", { name: /Receiving Warehouse/ });
if (await rad.count()) await rad.first().check().catch(() => {});
await paper.evaluate(el => el.querySelectorAll("*").forEach(e => { if (e.scrollHeight > e.clientHeight + 20) e.scrollTop = 99999; }));
await shot(page, "B1-rug-paper-1440");
await dump(page, "dialog button");
console.log((await txt(paper)).slice(-700));
if (process.argv[2] === "hold") {
  await paper.getByRole("button", { name: /^Hold for release/ }).click();
  await page.waitForTimeout(4000);
  await shot(page, "B1-after-hold-1440");
  console.log("held:", (await txt(paper)).slice(-300));
}
await browser.close();
