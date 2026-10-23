// SQ-1805: open a walk-project line and print NEXT / order cell / movement. Usage: node w5-line.mjs <member|owner> "<line name>" <tag>
import { open, shot, txt, overflow, openLine } from "./rewalk-lib.mjs";
const [who, name, tag] = [process.argv[2] || "member", process.argv[3] || "Hale console", process.argv[4] || "line"];
for (const w of [1440, 390]) {
  const { browser, page } = await open(`us50-${who}@patina.dev`, w);
  await openLine(page, name, w);
  console.log(`[${who} ${w}] next:`, await txt(page.getByTestId("line-next-act")));
  console.log(`[${who} ${w}] po cell:`, await txt(page.getByTestId("line-po-cell")));
  await page.getByTestId("line-po-cell").scrollIntoViewIfNeeded();
  await shot(page, `W5-${tag}-${who}-${w}`);
  console.log("overflow", JSON.stringify(await overflow(page)));
  await browser.close();
}
