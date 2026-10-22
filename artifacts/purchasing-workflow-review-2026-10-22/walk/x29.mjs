import { open, shot, dump, BASE, PROJECT, openLine, vshot, txt } from "./lib.mjs";
let { browser, page } = await open("us50-owner@patina.dev");
await page.waitForTimeout(6000);
await dump(page, "button, a");
await page.getByText(/Approve the release of the order/).first().click(); await page.waitForTimeout(1500);
await shot(page, "52b-owner-need-expanded-1440", false);
await dump(page, "button");
await browser.close();
