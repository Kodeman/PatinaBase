// Assemble presentation.html from the deck parts.
//
//   node artifacts/ios-daily-return-2026-08-26/mock/deck-parts/build.mjs
//
// What it does, in order:
//   1. concatenates PARTS (fixed order; a missing part is fatal)
//   2. resolves  <!-- include:fragments/NAME.html -->  from mock/fragments/
//   3. injects kit.css at the /* @@KIT@@ */ marker (its @import is stripped —
//      the deck's <link> carries the same three families)
//   4. resolves  <!-- shot:FILE.png -->  and  <img data-shot="FILE.png">  to
//      base64 JPEG data URIs, downscaled to 804px wide by sips, quality 78,
//      cached in mock/deck-assets/
//   5. inlines the mock/img/*.jpg product crops the fragments reference
//   6. folds the file to pure ASCII (the artifact skeleton owns <head>, so the
//      page cannot declare its own charset)
//   7. writes presentation.html and prints size + manifest
//
// Exit codes: 0 clean · 1 missing include, unbalanced markup, leftover marker,
// forbidden document tag, or over the 15.5 MB hard budget.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");           // artifacts/ios-daily-return-2026-08-26
const MOCK = path.join(ROOT, "mock");
const FRAGMENTS = path.join(MOCK, "fragments");
const IMG = path.join(MOCK, "img");
const SHOTS = path.join(ROOT, "shots");
const ASSETS = path.join(MOCK, "deck-assets");
const OUT = path.join(ROOT, "presentation.html");

const PARTS = [
  "00-head.html",
  "01-cover.html",
  "02-ask.html",
  "03-today.html",
  "04-panel.html",
  "05-found.html",
  "06-why-return.html",
  "07-why-buy.html",
  "08-planks.html",
  "09-direction-a.html",
  "10-direction-b.html",
  "11-purchase.html",
  "12-compare.html",
  "13-recommendation.html",
  "14-questions.html",
  "15-colophon.html",
  "99-script.html",
];

const SHOT_WIDTH = 804;
const SHOT_QUALITY = 78;
const WARN_BYTES = 12 * 1048576;
const FAIL_BYTES = Math.round(15.5 * 1048576);

const errors = [];
const read = (p) => fs.readFileSync(p, "utf8");
const kb = (n) => (n / 1024).toFixed(0) + " KB";
const mb = (n) => (n / 1048576).toFixed(2) + " MB";

/* ── 1. Parts ───────────────────────────────────────────────────────────── */
const missingParts = PARTS.filter((p) => !fs.existsSync(path.join(HERE, p)));
if (missingParts.length) {
  console.error("missing part(s): " + missingParts.join(", "));
  process.exit(1);
}
let html = PARTS.map((p) => read(path.join(HERE, p))).join("\n");

/* ── 2. Fragments ───────────────────────────────────────────────────────── */
const fragments = [];
const INCLUDE = /<!--\s*include:fragments\/([A-Za-z0-9._-]+)\s*-->/g;

for (let pass = 0; pass < 4 && INCLUDE.test(html); pass += 1) {
  INCLUDE.lastIndex = 0;
  html = html.replace(INCLUDE, (_m, name) => {
    const file = path.join(FRAGMENTS, name);
    if (!fs.existsSync(file)) {
      errors.push(`missing fragment ${path.relative(ROOT, file)}`);
      return `<!-- MISSING FRAGMENT ${name} -->`;
    }
    const body = read(file);
    fragments.push({ name, bytes: Buffer.byteLength(body, "utf8") });
    return body;
  });
  INCLUDE.lastIndex = 0;
}

/* ── 3. kit.css ─────────────────────────────────────────────────────────── */
// Strip comments without touching a data: URI that happens to sit in a string.
function stripCssComments(css) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === "\\") { out += css[i + 1] || ""; i += 2; continue; }
      if (c === quote) { quote = null; }
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i += 1; continue; }
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out.replace(/\n{3,}/g, "\n\n");
}

const kitPath = path.join(MOCK, "kit.css");
if (!fs.existsSync(kitPath)) { errors.push("missing mock/kit.css"); }
let kitCss = fs.existsSync(kitPath) ? read(kitPath) : "";
const kitRaw = Buffer.byteLength(kitCss, "utf8");
// The kit's line 1 @import would be invalid this far down a stylesheet, and the
// deck's <link> already loads the same three families.  The URL itself contains
// semicolons (font weight lists), so the at-rule has to be matched whole — a
// lazy match to the first ";" leaves half a URL behind as top-level garbage and
// silently eats every rule after it.
const AT_IMPORT = /@import\s+(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"[^"]*"|'[^']*')[^;]*;\s*/g;
const importsStripped = (kitCss.match(AT_IMPORT) || []).length;
kitCss = kitCss.replace(AT_IMPORT, "");
kitCss = stripCssComments(kitCss);
if (/fonts\.googleapis\.com/.test(kitCss)) {
  errors.push("kit.css still references fonts.googleapis.com after the @import strip");
}
if (!/--pat-screen-w/.test(kitCss)) {
  errors.push("kit.css lost --pat-screen-w — the token block did not survive");
}

if (!html.includes("/* @@KIT@@ */")) { errors.push("missing CSS marker /* @@KIT@@ */"); }
html = html.replace("/* @@KIT@@ */", () => kitCss);

/* ── 4. Shots ───────────────────────────────────────────────────────────── */
fs.mkdirSync(ASSETS, { recursive: true });

const shotCache = new Map();     // png name -> { data, w, h, bytes }
const shotManifest = [];

function encodeShot(name) {
  if (shotCache.has(name)) { return shotCache.get(name); }

  const src = path.join(SHOTS, name);
  if (!fs.existsSync(src)) {
    errors.push(`missing shot shots/${name}`);
    shotCache.set(name, null);
    return null;
  }
  const dst = path.join(ASSETS, name.replace(/\.png$/i, "") + `.${SHOT_WIDTH}.jpg`);

  const fresh =
    fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs;
  if (!fresh) {
    try {
      execFileSync("sips", [
        "--resampleWidth", String(SHOT_WIDTH),
        "-s", "format", "jpeg",
        "-s", "formatOptions", String(SHOT_QUALITY),
        src, "--out", dst,
      ], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      const why = (e.stderr ? e.stderr.toString() : String(e)).trim().split("\n")[0];
      errors.push(
        `sips failed on ${name}: ${why}\n    (sips writes a scratch file into the system temp dir; ` +
        `run this build with the command sandbox off)`
      );
      shotCache.set(name, null);
      return null;
    }
  }

  let w = SHOT_WIDTH;
  let h = 0;
  try {
    const probe = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", dst], {
      encoding: "utf8",
    });
    const mw = probe.match(/pixelWidth:\s*(\d+)/);
    const mh = probe.match(/pixelHeight:\s*(\d+)/);
    if (mw) { w = Number(mw[1]); }
    if (mh) { h = Number(mh[1]); }
  } catch (e) { /* dimensions are a nicety; the data URI is the payload */ }

  const buf = fs.readFileSync(dst);
  const entry = { data: buf.toString("base64"), w, h, bytes: buf.length, file: dst };
  shotCache.set(name, entry);
  shotManifest.push({ name, w, h, bytes: buf.length });
  return entry;
}

function shotImg(name, attrs) {
  const entry = encodeShot(name);
  if (!entry) { return `<!-- MISSING SHOT ${name} -->`; }
  const dims = entry.h ? ` width="${entry.w}" height="${entry.h}"` : "";
  return (
    `<img src="data:image/jpeg;base64,${entry.data}"${dims}` +
    ` decoding="async"${attrs}>`
  );
}

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// <!-- shot:FILE.png --> : bare figure image, alt from the file name
html = html.replace(/<!--\s*shot:([A-Za-z0-9._-]+\.png)\s*-->/g, (_m, name) =>
  shotImg(name, ` alt="${escAttr("Simulator shot " + name)}"`)
);

// <img data-shot="FILE.png" ...> : the author's own attributes are kept
html = html.replace(/<img\b([^>]*?)\bdata-shot="([A-Za-z0-9._-]+\.png)"([^>]*?)\/?>/g,
  (_m, pre, name, post) => {
    const rest = (pre + post).replace(/\s+/g, " ").trim();
    const attrs = rest ? " " + rest : "";
    const withAlt = /\balt=/.test(attrs) ? attrs : attrs + ` alt="${escAttr("Simulator shot " + name)}"`;
    return shotImg(name, withAlt);
  }
);

/* ── 5. Product crops (mock/img/*.jpg) ──────────────────────────────────── */
const cropCache = new Map();
const cropManifest = [];

function cropUri(file) {
  if (cropCache.has(file)) { return cropCache.get(file); }
  const src = path.join(IMG, file);
  if (!fs.existsSync(src)) {
    errors.push(`missing crop mock/img/${file}`);
    cropCache.set(file, null);
    return null;
  }
  const buf = fs.readFileSync(src);
  const uri = "data:image/jpeg;base64," + buf.toString("base64");
  cropCache.set(file, uri);
  cropManifest.push({ file, bytes: buf.length });
  return uri;
}

// quoted:  src="img/x.jpg"  ·  src='../img/x.jpg'  ·  url("img/x.jpg")
html = html.replace(/(["'])(?:\.{0,2}\/)*img\/([A-Za-z0-9._-]+\.jpe?g)\1/g,
  (m, q, file) => {
    const uri = cropUri(file);
    return uri ? q + uri + q : m;
  }
);
// unquoted:  url(img/x.jpg)
html = html.replace(/url\(\s*(?:\.{0,2}\/)*img\/([A-Za-z0-9._-]+\.jpe?g)\s*\)/g,
  (m, file) => {
    const uri = cropUri(file);
    return uri ? 'url("' + uri + '")' : m;
  }
);

/* ── 6. ASCII fold ──────────────────────────────────────────────────────────
   The artifact skeleton owns <head>, so this page cannot declare a charset.
   Emitting pure ASCII makes rendering independent of whatever the host
   announces: markup keeps numeric character references, while <style> and
   <script> (where entities are not decoded) get ASCII equivalents. */
const ASCII_FOLD = {
  "—": "--", "–": "-", "‘": "'", "’": "'",
  "“": '"', "”": '"', "…": "...", "·": "-",
  "→": "->", "←": "<-", "↑": "^", "↓": "v",
  "≥": ">=", "≤": "<=", "×": "x", " ": " ",
  "─": "-", "│": "|", "°": "deg", "″": '"', "′": "'",
};
const foldToAscii = (s) =>
  s.replace(/[^\x00-\x7F]/g, (ch) =>
    Object.prototype.hasOwnProperty.call(ASCII_FOLD, ch) ? ASCII_FOLD[ch] : "-");
const toEntities = (s) =>
  s.replace(/[^\x00-\x7F]/g, (ch) => "&#" + ch.codePointAt(0) + ";");

let foldedBlocks = 0;
html = html
  .split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>)/)
  .map((chunk) => {
    if (/^<style|^<script/.test(chunk)) {
      const folded = foldToAscii(chunk);
      if (folded !== chunk) { foldedBlocks += 1; }
      return folded;
    }
    return toEntities(chunk);
  })
  .join("");

/* ── 7. Checks, write, report ───────────────────────────────────────────── */
const openSections = (html.match(/<section\b/g) || []).length;
const closeSections = (html.match(/<\/section>/g) || []).length;
const openFigures = (html.match(/<figure\b/g) || []).length;
const closeFigures = (html.match(/<\/figure>/g) || []).length;
const leftovers = html.match(/<!--\s*(include:|shot:|MISSING)[^>]*-->/g) || [];
const forbidden = /<!doctype|<html\b|<head\b|<body\b/i.test(html);
const nonAscii = (html.match(/[^\x00-\x7F]/g) || []).length;
const styleBlock = (html.match(/<style[\s\S]*?<\/style>/) || [""])[0];
const braceOpen = (styleBlock.match(/\{/g) || []).length;
const braceClose = (styleBlock.match(/\}/g) || []).length;
if (braceOpen !== braceClose) {
  errors.push(`unbalanced CSS braces in <style>: ${braceOpen} open / ${braceClose} close`);
}
const bytes = Buffer.byteLength(html, "utf8");

fs.writeFileSync(OUT, html, "utf8");

const shotBytes = shotManifest.reduce((n, s) => n + s.bytes, 0);
const cropBytes = cropManifest.reduce((n, c) => n + c.bytes, 0);

console.log("");
console.log("PARTS      " + PARTS.length + " concatenated");
console.log("KIT        kit.css " + kb(kitRaw) + " raw -> " + kb(Buffer.byteLength(kitCss, "utf8")) +
  " (" + importsStripped + " @import stripped, comments removed)");

console.log("FRAGMENTS  " + fragments.length + " inlined");
fragments.forEach((f) => console.log("           " + f.name.padEnd(38) + kb(f.bytes)));

console.log("SHOTS      " + shotManifest.length + " embedded at " + SHOT_WIDTH +
  "px / q" + SHOT_QUALITY + "  (" + mb(shotBytes) + " raw JPEG)");
shotManifest
  .slice()
  .sort((a, b) => b.bytes - a.bytes)
  .forEach((s) => console.log("           " + s.name.padEnd(38) + kb(s.bytes) +
    (s.h ? "  " + s.w + "x" + s.h : "")));

console.log("CROPS      " + cropManifest.length + " inlined (" + kb(cropBytes) + ")");
cropManifest.forEach((c) => console.log("           " + c.file.padEnd(38) + kb(c.bytes)));

console.log("MARKUP     section " + openSections + "/" + closeSections +
  "  figure " + openFigures + "/" + closeFigures +
  "  leftover markers " + leftovers.length +
  "  doc tags " + (forbidden ? "PRESENT - FIX" : "none"));
console.log("CSS        " + braceOpen + " braces open / " + braceClose + " close");
console.log("ASCII      " + nonAscii + " non-ascii bytes left (" + foldedBlocks + " style/script blocks folded)");
console.log("SIZE       " + mb(bytes) + "  " +
  (bytes > FAIL_BYTES ? "OVER THE 15.5 MB HARD BUDGET"
    : bytes > WARN_BYTES ? "WARNING: over the 12 MB soft budget"
      : "within budget"));
console.log("WROTE      " + OUT);
console.log("");

if (bytes > WARN_BYTES && bytes <= FAIL_BYTES) {
  console.warn("warning: " + mb(bytes) + " is past the 12 MB soft budget - drop or crop a shot.");
}
if (bytes > FAIL_BYTES) { errors.push("size " + mb(bytes) + " exceeds the 15.5 MB hard budget"); }
if (openSections !== closeSections) { errors.push("unbalanced <section> tags"); }
if (openFigures !== closeFigures) { errors.push("unbalanced <figure> tags"); }
if (leftovers.length) { errors.push("unresolved marker(s): " + leftovers.slice(0, 6).join(" ")); }
if (forbidden) { errors.push("a <!doctype>/<html>/<head>/<body> tag is present - the artifact skeleton owns those"); }

if (errors.length) {
  console.error("FAILED");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
