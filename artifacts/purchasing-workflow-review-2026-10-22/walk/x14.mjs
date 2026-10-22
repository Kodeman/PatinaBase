import { open, shot, dump, BASE, PROJECT, vshot, txt } from "./lib.mjs";
const { browser, page } = await open();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/doc/${PROJECT}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(7000);
await page.getByRole("button", { name: /Open project contents/ }).click();
await page.waitForTimeout(1500);
await shot(page, "23-phone-contents-menu-390", false);
await dump(page, "dialog button, dialog a, nav button, nav a");
await browser.close();
