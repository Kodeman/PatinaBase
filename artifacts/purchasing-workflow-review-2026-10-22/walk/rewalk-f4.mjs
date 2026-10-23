// SQ-1801 F: open a fresh-project line to see its acts. Usage: node rewalk-f4.mjs [name]
import { open, shot, txt, body, dump, BASE } from "./rewalk-lib.mjs";
const NEW = process.env.NEWPROJ || "6545eb31-73ce-4947-8a71-c05c83cf5efc";
const { browser, page } = await open("us50-owner@patina.dev", 1440);
await page.goto(`${BASE}/doc/${NEW}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await page.getByRole("button", { name: /Pieces & purchasing/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: new RegExp(process.argv[2] || "typed credenza") }).first().click();
await page.waitForTimeout(2500);
await shot(page, "F-new-line-open-1440");
await dump(page, "[data-testid^=line-] button, button");
for (const id of ["line-next-act", "line-po-cell", "line-movement-cell"]) console.log("==", id, await txt(page.getByTestId(id)));
await browser.close();
