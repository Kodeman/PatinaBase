// SQ-1801 C step 2: pickup -> arrival on the rug. Usage: node rewalk-c2.mjs 1440|390 [arrive]
import { open, shot, txt, body, dump, openLine, overflow } from "./rewalk-lib.mjs";
const w = Number(process.argv[2] || 1440);
const arrive = process.argv[3] === "arrive";
const { browser, page } = await open("us50-member@patina.dev", w);
await openLine(page, "Hand-knotted rug", w);
for (const id of ["line-next-act", "line-movement-cell", "line-receiving-cell"]) console.log("==", id, await txt(page.getByTestId(id)));
await page.getByTestId("line-next-act").scrollIntoViewIfNeeded();
await shot(page, `C-rug-line-${w}`);
await dump(page, "[data-testid=line-next-act] button, [data-testid=line-movement-cell] button, [data-testid=line-receiving-cell] button");
if (arrive) {
  const act = page.getByTestId("line-next-act").getByRole("button").first();
  console.log("act:", await act.innerText());
  await act.click(); await page.waitForTimeout(2000);
  await shot(page, `C-after-act-${w}`);
  await dump(page, "[role=dialog] button, [role=dialog] select, [role=dialog] label, button");
}
console.log("overflow", JSON.stringify(await overflow(page)));
await browser.close();
