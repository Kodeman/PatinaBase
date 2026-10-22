import { open, shot, dump, BASE, PROJECT, openLine, vshot, txt } from "./lib.mjs";
const CH = "US-50 Walk Custom lounge chair (COM)", RUG = "US-50 Walk Hand-knotted rug 9x12", ANT="US-50 Walk Antique brass mirror (dealer find)";
const { browser, page } = await open();
// chair -> receiver
await openLine(page, CH);
await page.getByRole("button", { name: "Order", exact: true }).first().click();
let paper = page.getByRole("dialog", { name: "The order paper" });
await paper.waitFor(); await page.waitForTimeout(3000);
await paper.getByRole("radio", { name: /Receiving Warehouse/ }).check();
console.log("chair paper:", (await txt(paper)).slice(0,300));
await paper.evaluate(el => el.querySelectorAll("*").forEach(e=>{ if(e.scrollHeight>e.clientHeight+20) e.scrollTop=99999; }));
await shot(page, "33-chair-paper-receiver-1440", false);
await paper.getByRole("button", { name: /^Send to / }).click(); await page.waitForTimeout(6000);
console.log("chair sent:", (await txt(paper)).slice(-80));
await paper.getByRole("button", { name: "Done" }).click(); await page.waitForTimeout(800);
// rug -> client home free text
await openLine(page, RUG);
await page.getByRole("button", { name: "Order", exact: true }).first().click();
paper = page.getByRole("dialog", { name: "The order paper" });
await paper.waitFor(); await page.waitForTimeout(3000);
console.log("rug radios:", await paper.getByRole("radio").evaluateAll(r=>r.map(x=>x.closest("label")?.innerText.replace(/\n/g," ")))); 
await paper.getByRole("radio", { name: /Somewhere else/ }).check();
await paper.getByPlaceholder(/Receiver, street/).fill("Hartwell family home, 41 Hartwell Rd, Madison, WI 53711 (client home)");
await shot(page, "34-rug-paper-client-home-freetext-1440", false);
await paper.getByRole("button", { name: /^Send to / }).click(); await page.waitForTimeout(6000);
await paper.getByRole("button", { name: "Done" }).click(); await page.waitForTimeout(800);
// sample request on rug
await openLine(page, RUG);
await page.getByRole("button", { name: "Request a sample" }).first().click(); await page.waitForTimeout(1500);
await shot(page, "35-request-sample-form-1440", false);
console.log("sample form:", (await txt(page.getByTestId("line-buy-cell"))).slice(0,700));
await dump(page, "dialog button, dialog input, dialog label, dialog select, [data-testid=line-buy-cell] input, [data-testid=line-buy-cell] select");
await browser.close();
