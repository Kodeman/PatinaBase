// Assemble presentation.html from the deck parts.
//   node mock/deck-parts/build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const MOCK = path.join(ROOT, "mock");
const ASSETS = path.join(MOCK, "deck-assets");
const OUT = path.join(ROOT, "presentation.html");

const PARTS = [
  "00-head.html",
  "01-cover.html",
  "02-ask.html",
  "03a-reading.html",
  "03b-findings-1.html",
  "03c-findings-2.html",
  "04-voices.html",
  "06-planks.html",
  "07a-direction-a.html",
  "07b-direction-a-mocks.html",
  "08a-direction-b.html",
  "08b-direction-b-mocks.html",
  "09-compare.html",
  "10-recommendation.html",
  "11-questions.html",
  "12-colophon.html",
  "99-script.html",
];

const read = (p) => fs.readFileSync(p, "utf8");

let html = PARTS.map((p) => read(path.join(HERE, p))).join("\n");

/* ── 1. CSS: fonts (base64), the mock kit, the two direction stylesheets ── */
const fontsCss = read(path.join(MOCK, "assets", "fonts", "fonts-data-uri.css"));

// kit.css ships @font-face blocks pointing at relative woff2 files that cannot
// resolve inside a published artifact. Strip them so the base64 faces (declared
// above kit.css) are the only ones for those families.
let kitCss = read(path.join(MOCK, "kit.css"));
const beforeFaces = (kitCss.match(/@font-face/g) || []).length;
kitCss = kitCss.replace(/@font-face\s*\{[^}]*\.\/assets\/fonts\/[^}]*\}/g, "");
// The kit's two "Alternative A/B" comment blocks are paste-in instructions that
// carry sample markup (including a literal <head>) — they have no job here.
kitCss = kitCss.replace(/\/\*\s*Alternative [AB][\s\S]*?\*\//g, "");
const afterFaces = (kitCss.match(/@font-face/g) || []).length;

// Comments in these three carry no runtime meaning and are the bulk of kit.css.
// (Safe to strip: none of the three holds a data: URI outside a comment, so no
// base64 payload can contain an accidental comment delimiter.)
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n{3,}/g, "\n\n");
kitCss = stripCssComments(kitCss);
const dirACss = stripCssComments(read(path.join(MOCK, "direction-a.css")));
const dirBCss = stripCssComments(read(path.join(MOCK, "direction-b.css")));

const inject = (marker, css) => {
  if (!html.includes(marker)) throw new Error(`missing CSS marker ${marker}`);
  html = html.replace(marker, () => css);
};
inject("/* @@FONTS@@ */", fontsCss);
inject("/* @@KIT@@ */", kitCss);
inject("/* @@DIR_A@@ */", dirACss);
inject("/* @@DIR_B@@ */", dirBCss);

/* ── 2. Fragments: inline each screen, scaled, caption lifted out ───────── */
const COLUMN = 1080; // the deck's own measure; JS re-fits on load and resize
let fragmentCount = 0;

html = html.replace(/<!--\s*FRAGMENT\s+([a-zA-Z0-9-]+)\s*-->/g, (_m, name) => {
  const file = path.join(MOCK, "fragments", `${name}.html`);
  let frag = read(file);

  // Lift the fragment's own <figcaption> out so it renders at native size.
  let caption = "";
  frag = frag.replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/g, (_f, inner) => {
    caption = inner.trim();
    return "";
  });

  const dims = frag.match(/width:\s*(\d+)px;\s*height:\s*(\d+)px/);
  if (!dims) throw new Error(`no width/height found in fragment ${name}`);
  const w = Number(dims[1]);
  const h = Number(dims[2]);
  const scale = Math.min(1, COLUMN / w);

  fragmentCount += 1;
  return [
    `<figure class="dk-mock" data-w="${w}" data-h="${h}">`,
    `  <div class="dk-mock-viewport" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px">`,
    `    <div class="dk-mock-scale" style="width:${w}px;transform:scale(${scale.toFixed(4)})">`,
    frag.trim(),
    `    </div>`,
    `  </div>`,
    caption ? `  <figcaption class="dk-mock-cap">${caption}</figcaption>` : "",
    `</figure>`,
  ]
    .filter(Boolean)
    .join("\n");
});

/* ── 3. Screenshots: data-URI <img>, never typed by hand ────────────────── */
const manifest = JSON.parse(read(path.join(ASSETS, "manifest.json")));
let imageCount = 0;
let imageBytes = 0;

html = html.replace(/<!--\s*IMG\s+([a-zA-Z0-9._-]+)\s*(?:\|\s*([^>]*?))?\s*-->/g, (_m, name, alt) => {
  const file = path.join(ASSETS, `${name}.jpg`);
  if (!fs.existsSync(file)) throw new Error(`missing screenshot ${name}.jpg`);
  const buf = fs.readFileSync(file);
  imageBytes += buf.length;
  imageCount += 1;
  const dim = manifest[name] || {};
  const altText = (alt || name).replace(/"/g, "&quot;").trim();
  return (
    `<img src="data:image/jpeg;base64,${buf.toString("base64")}"` +
    (dim.w ? ` width="${dim.w}" height="${dim.h}"` : "") +
    ` alt="${altText}" loading="lazy" decoding="async" />`
  );
});

/* ── 4. Make the whole file ASCII ────────────────────────────────────────
   The artifact skeleton owns <head>, so this page cannot declare its own
   charset. Emitting pure ASCII makes the rendering independent of whatever
   encoding the host announces: markup keeps numeric character references,
   while <style> and <script> (where entities are not decoded) get plain ASCII
   equivalents — every non-ASCII character in those two lives in a comment. */
const ASCII_FOLD = {
  "—": "--", "–": "-", "‘": "'", "’": "'",
  "“": '"', "”": '"', "…": "...", "·": "-",
  "→": "->", "←": "<-", "↑": "^", "↓": "v",
  "≥": ">=", "≤": "<=", "×": "x", " ": " ",
  "─": "-", "│": "|", "……": "...",
};
const foldToAscii = (s) =>
  s.replace(/[^\x00-\x7F]/g, (ch) => (Object.prototype.hasOwnProperty.call(ASCII_FOLD, ch) ? ASCII_FOLD[ch] : "-"));
const toEntities = (s) =>
  s.replace(/[^\x00-\x7F]/g, (ch) => "&#" + ch.codePointAt(0) + ";");

let asciiFolded = 0;
html = html
  .split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>)/)
  .map((chunk) => {
    if (/^<style|^<script/.test(chunk)) {
      const folded = foldToAscii(chunk);
      if (folded !== chunk) asciiFolded += 1;
      return folded;
    }
    return toEntities(chunk);
  })
  .join("");

/* ── 5. Write and report ────────────────────────────────────────────────── */
fs.writeFileSync(OUT, html, "utf8");
const bytes = Buffer.byteLength(html, "utf8");

// Cheap structural check: balanced <section> tags, no leftover markers.
const openSections = (html.match(/<section\b/g) || []).length;
const closeSections = (html.match(/<\/section>/g) || []).length;
const openFigures = (html.match(/<figure\b/g) || []).length;
const closeFigures = (html.match(/<\/figure>/g) || []).length;
const leftovers = html.match(/<!--\s*(IMG|FRAGMENT)\b[^>]*-->/g) || [];
const forbidden = /<!doctype|<html\b|<head\b|<body\b/i.test(html);
const shadows = (html.match(/box-shadow\s*:(?!\s*none)/gi) || []).length +
  (html.match(/drop-shadow\(/gi) || []).length;
const nonAscii = (html.match(/[^\x00-\x7F]/g) || []).length;

console.log(`fonts        : ${beforeFaces} @font-face in kit.css → ${afterFaces} kept (relative-url faces stripped)`);
console.log(`fragments    : ${fragmentCount} inlined`);
console.log(`screenshots  : ${imageCount} embedded (${(imageBytes / 1048576).toFixed(2)} MB raw)`);
console.log(`sections     : ${openSections} open / ${closeSections} close`);
console.log(`figures      : ${openFigures} open / ${closeFigures} close`);
console.log(`leftovers    : ${leftovers.length}`);
console.log(`doc/html tags: ${forbidden ? "PRESENT — FIX" : "none"}`);
console.log(`box-shadow   : ${shadows}`);
console.log(`non-ascii    : ${nonAscii} bytes left (${asciiFolded} style/script blocks folded)`);
console.log(`size         : ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MB)  ${bytes <= 16 * 1048576 ? "OK ≤16MB" : "TOO BIG"}`);
console.log(`wrote        : ${OUT}`);

if (openSections !== closeSections || openFigures !== closeFigures || leftovers.length || forbidden) {
  process.exitCode = 1;
}
