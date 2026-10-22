import { open, shot, dump, BASE, PROJECT, openLine, vshot, txt } from "./lib.mjs";
const { browser, page } = await open();
await openLine(page, "US-50 Walk Channel-back sofa");
await page.getByRole("button", { name: "Order", exact: true }).first().click();
const paper = page.getByRole("dialog", { name: "The order paper" });
await paper.waitFor(); await page.waitForTimeout(3000);
await paper.getByRole("radio", { name: /Somewhere else/ }).check();
await page.waitForTimeout(1000);
await shot(page, "06-paper-somewhere-else-1440", false);
console.log("SE:", await txt(paper.getByRole("group", { name: "Ship to" })));
await dump(page, "dialog input, dialog textarea, dialog select");
// scroll paper to bottom
await paper.evaluate(el => { const s = el.querySelector("[class*=overflow]") || el; s.scrollTop = 99999; el.scrollTop = 99999; });
await page.waitForTimeout(600);
await shot(page, "07-paper-bottom-actions-1440", false);
const term = paper.getByRole("button", { name: /^Send to / });
console.log("terminal aria-disabled:", await term.getAttribute("aria-disabled"));
await browser.close();
