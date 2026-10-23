// SQ-1801: A (complete inspection from the line), D, E at a given width. Usage: node rewalk-a.mjs 1440|390
import { open, shot, txt, body, dump, overflow, openLine, gotoPieces } from "./rewalk-lib.mjs";
const w = Number(process.argv[2] || 1440);
const { browser, page } = await open("us50-member@patina.dev", w);
await gotoPieces(page, w);
await shot(page, `pieces-overview-${w}`);
console.log("overflow", JSON.stringify(await overflow(page)));
console.log("overview:", (await body(page, 2500)));
await openLine(page, "Table lamp (pair)", w);
await shot(page, `A-lamps-line-${w}`);
for (const id of ["line-next-act", "line-po-cell", "line-movement-cell", "line-receiving-cell"]) console.log("==", id, await txt(page.getByTestId(id)));
await dump(page, "button, a");
console.log("errs", JSON.stringify(page.errs));
await browser.close();
