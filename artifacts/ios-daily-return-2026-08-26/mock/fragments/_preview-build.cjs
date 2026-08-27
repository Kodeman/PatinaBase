/* _preview-build.cjs — assemble _preview-b.html from every b-M*.html fragment
   (and its .sheet.html twin) so the set can be rendered and looked at in one shot. */
const fs = require("fs");
const path = require("path");
const DIR = __dirname;

const frames = fs.readdirSync(DIR)
  .filter((f) => /^b-M.+\.html$/.test(f) && !f.endsWith(".sheet.html"))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const sheets = fs.readdirSync(DIR).filter((f) => /^b-M.+\.sheet\.html$/.test(f))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

const cap = {
  "b-M1": "M1 &middot; Today, activeProject", "b-M1d": "M1d &middot; Today, activeProject &middot; dark",
  "b-M2": "M2 &middot; Today, discovering", "b-M2d": "M2d &middot; Today, discovering &middot; dark",
  "b-M3": "M3 &middot; Piece detail, purchase acts", "b-M3d": "M3d &middot; Piece detail &middot; dark",
  "b-M4": "M4 &middot; The room", "b-M5a": "5a &middot; Order sheet",
  "b-M5b": "5b &middot; Payment hand-off", "b-M5c": "5c &middot; Order placed",
  "b-M6a": "6a &middot; Lock Screen", "b-M6b": "6b &middot; Home Screen widget",
  "b-M6c": "6c &middot; Permission primer", "b-M6d": "6d &middot; What greets you",
  "b-M7": "M7 &middot; Ask your designer", "b-M8": "M8 &middot; Studio &rarr; Ordered",
  "b-M9": "M9 &middot; The Pieces tab", "b-M9b": "M9b &middot; Saved, pushed",
};

const body = frames.map((f) => {
  const id = f.replace(/\.html$/, "");
  return `<div class="pv-slot" data-mock="${id}">${fs.readFileSync(path.join(DIR, f), "utf8")}` +
    `<p class="pv-cap">${cap[id] || id}</p></div>`;
}).join("\n");

const sheetBody = sheets.map((f) =>
  `<div class="pv-sheet">${fs.readFileSync(path.join(DIR, f), "utf8")}</div>`).join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<base href="../">
<title>Direction B — fragment preview</title>
<link rel="stylesheet" href="kit.css">
<style>
body{margin:0;background:#DCD8D1;font-family:Inter,sans-serif;padding:28px;}
h1{font:500 26px/1.2 'Playfair Display',serif;color:#2C2926;margin:0 0 18px;}
h2{font:600 12px/1.3 Inter,sans-serif;text-transform:uppercase;letter-spacing:1.5px;
   color:#5C4A3C;margin:34px 0 14px;}
.pv-row{display:flex;flex-wrap:wrap;gap:34px 26px;align-items:flex-start;}
.pv-slot{width:428px;}
.pv-cap{font:400 11px/1.4 'DM Mono',monospace;text-transform:uppercase;letter-spacing:.5px;
   color:#5C4A3C;margin:10px 0 0;text-align:center;}
.pv-sheets{display:flex;flex-wrap:wrap;gap:26px;}
.pv-sheet{width:720px;background:#FAF7F2;border-radius:10px;padding:18px 20px;}
</style></head><body>
<h1>Direction B &mdash; the Record &middot; mock fragments</h1>
<div class="pv-row">
${body}
</div>
<h2>Screen sheets</h2>
<div class="pv-sheets">
${sheetBody}
</div>
</body></html>`;

fs.writeFileSync(path.join(DIR, "_preview-b.html"), html);
console.log("frames " + frames.length + " · sheets " + sheets.length);
