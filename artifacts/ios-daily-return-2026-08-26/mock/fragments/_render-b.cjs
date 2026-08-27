/* _render-b.cjs — render _preview-b.html to _preview-b.png at 2x.
   Borrows Playwright from apps/designer-portal (KIT.md §Files). Needs the sandbox off. */
const path = require("path");
const ROOT = "/Users/kody/Code/patina-merged";
const { chromium } = require(path.join(ROOT, "apps/designer-portal/node_modules/@playwright/test"));
const DIR = path.join(ROOT, "artifacts/ios-daily-return-2026-08-26/mock/fragments");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2340, height: 1200 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("requestfailed", (r) => errs.push("requestfailed " + r.url()));
  await page.goto("file://" + path.join(DIR, "_preview-b.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  // report any horizontal overflow inside a phone screen
  const overflow = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".frame__screen").forEach((s) => {
      const id = s.closest("[data-mock]")?.dataset.mock || "?";
      if (s.scrollWidth > s.clientWidth + 1) out.push(id + " scrollWidth " + s.scrollWidth);
      const body = s.querySelector(".screen-body");
      if (body && body.scrollHeight > body.clientHeight)
        out.push(id + " content " + body.scrollHeight + "px (viewport 874)");
    });
    return out;
  });
  console.log(overflow.join("\n"));
  if (errs.length) console.log("ERRORS:\n" + errs.join("\n"));

  await page.screenshot({ path: path.join(DIR, "_preview-b.png"), fullPage: true });
  await browser.close();
})();
