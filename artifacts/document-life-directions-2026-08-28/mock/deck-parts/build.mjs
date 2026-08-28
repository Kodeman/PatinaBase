// Assemble presentation.html from the deck parts.
//
//   node mock/deck-parts/build.mjs
//   SMOKE=1 node mock/deck-parts/build.mjs   (Phase 0 gate: missing direction
//     css and missing shots are tolerated instead of fatal, for building a
//     placeholder deck before Phase 2/3 parts exist)
//
// What it does, in order:
//   1. concatenates PARTS (fixed order; a missing part is fatal)
//   2. injects fonts-data-uri.css / kit.css / direction-{a,b,c}.css at the
//      /* @@FONTS@@ */ /* @@KIT@@ */ /* @@DIR_A@@ */ /* @@DIR_B@@ */
//      /* @@DIR_C@@ */ markers (missing direction css is fatal, except SMOKE=1)
//   3. pins the mocks to the light palette regardless of page theme, by
//      re-emitting kit.css's own :root declarations as .dk-mock-scale{...}
//   4. resolves <!-- include:fragments/NAME.html --> (raw, unscaled — the ios
//      mechanism, kept for prose-adjacent snippets) and
//      <!-- FRAGMENT name [| col=N] --> (mock/fragments/NAME.html wrapped in a
//      scaled .dk-mock figure fitted to a COLUMN-px deck column, its own
//      <figcaption> lifted out) from mock/fragments/
//   5. inlines mock/img/*.jpg product crops once each as CSS custom properties
//      (--crop-<basename>) and rewrites url(img/<name>.jpg) references to
//      var(--crop-<name>); an <img src="img/..."> anywhere in the output is
//      fatal — crops are backgrounds, never <img> elements
//   6. resolves <!-- shot:FILE.png --> and <img data-shot="FILE.png"> to
//      base64 JPEG data URIs, downscaled to 804px wide by sips, quality 78,
//      cached in mock/deck-assets/ (skipped, not fatal, under SMOKE=1 when
//      the source PNG is missing)
//   7. folds the file to pure ASCII (the artifact skeleton owns <head>, so
//      the page cannot declare its own charset)
//   8. hard-fail gates, write presentation.html, print the summary line
//
// Exit codes: 0 clean · 1 any hard-fail gate below.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");            // artifacts/document-life-directions-2026-08-28
const MOCK = path.join(ROOT, "mock");
const FRAGMENTS = path.join(MOCK, "fragments");
const IMG = path.join(MOCK, "img");
const SHOTS = path.join(ROOT, "shots");
const ASSETS = path.join(MOCK, "deck-assets");
const OUT = path.join(ROOT, "presentation.html");

const SMOKE = process.env.SMOKE === "1";

const PARTS = [
  "00-head.html",
  "01-cover.html",
  "02-ask.html",
  "03-today.html",
  "04-found.html",
  "05-planks.html",
  "06-direction-a.html",
  "07-direction-b.html",
  "08-direction-c.html",
  "09-strip.html",
  "10-mobile.html",
  "11-compare.html",
  "12-recommendation.html",
  "13-questions.html",
  "14-colophon.html",
  "99-script.html",
];

const COLUMN = 1080;          // deck's own measure; JS re-fits on load/resize
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

/* ── 2. CSS: fonts (base64), kit, three direction stylesheets ────────────── */
function stripCssComments(css) {
  // Comment-aware strip that never touches a data: URI sitting in a string.
  let out = "";
  let i = 0;
  let quote = null;
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === "\\") { out += css[i + 1] || ""; i += 2; continue; }
      if (c === quote) quote = null;
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

const fontsPath = path.join(MOCK, "assets", "fonts", "fonts-data-uri.css");
if (!fs.existsSync(fontsPath)) errors.push("missing mock/assets/fonts/fonts-data-uri.css");
const fontsCss = fs.existsSync(fontsPath) ? read(fontsPath) : "";

const kitPath = path.join(MOCK, "kit.css");
if (!fs.existsSync(kitPath)) errors.push("missing mock/kit.css");
let kitCssRaw = fs.existsSync(kitPath) ? read(kitPath) : "";
if (!/--doc-paper/.test(kitCssRaw)) {
  errors.push("kit.css lost --doc-paper — the token block did not survive (kit gate)");
}

// Pin the mocks to the light palette: lift kit.css's own light :root block
// (the first one — before the dark media/[data-theme] blocks) and re-emit its
// declarations under .dk-mock-scale so a dark deck theme never repaints a mock.
let mockPinCss = "";
{
  const m = kitCssRaw.match(/:root\s*\{([\s\S]*?)\}/);
  if (!m) {
    errors.push("could not find a :root{...} block in kit.css to pin mocks light");
  } else {
    mockPinCss = `.dk-mock-scale{${m[1]}}\n`;
  }
}

let kitCss = stripCssComments(kitCssRaw);

function loadDirCss(letter) {
  const p = path.join(MOCK, `direction-${letter}.css`);
  if (!fs.existsSync(p)) {
    if (SMOKE) return "";
    errors.push(`missing mock/direction-${letter}.css`);
    return "";
  }
  return stripCssComments(read(p));
}
const dirACss = loadDirCss("a");
const dirBCss = loadDirCss("b");
const dirCCss = loadDirCss("c");

// Product crops (see step 5 below) are emitted as :root{--crop-*} rules, in a
// generated block appended after @@DIR_C@@ per the Phase 0 spec.
const cropManifest = [];
let cropCss = "";
if (fs.existsSync(IMG)) {
  for (const file of fs.readdirSync(IMG).filter((f) => /\.jpe?g$/i.test(f))) {
    const buf = fs.readFileSync(path.join(IMG, file));
    const base = file.replace(/\.[^.]+$/, "");
    cropCss += `:root{--crop-${base}:url("data:image/jpeg;base64,${buf.toString("base64")}")}\n`;
    cropManifest.push({ file, base, bytes: buf.length });
  }
}

function inject(marker, css) {
  if (!html.includes(marker)) {
    errors.push(`missing CSS marker ${marker}`);
    return;
  }
  html = html.replace(marker, () => css);
}
inject("/* @@FONTS@@ */", fontsCss);
inject("/* @@KIT@@ */", kitCss + "\n" + mockPinCss);
inject("/* @@DIR_A@@ */", dirACss);
inject("/* @@DIR_B@@ */", dirBCss);
inject("/* @@DIR_C@@ */", dirCCss + "\n" + cropCss);

/* ── 3. Fragments ──────────────────────────────────────────────────────────
   Two mechanisms, both read from mock/fragments/:
     <!-- include:fragments/NAME.html -->   raw, unscaled (ios mechanism)
     <!-- FRAGMENT name [| col=N] -->       scaled .dk-mock figure, caption
                                             lifted out (wayfinding mechanism)
*/
const INCLUDE = /<!--\s*include:fragments\/([A-Za-z0-9._-]+)\s*-->/g;
for (let pass = 0; pass < 4 && INCLUDE.test(html); pass += 1) {
  INCLUDE.lastIndex = 0;
  html = html.replace(INCLUDE, (_m, name) => {
    const file = path.join(FRAGMENTS, name);
    if (!fs.existsSync(file)) {
      errors.push(`missing include mock/fragments/${name}`);
      return `<!-- MISSING INCLUDE ${name} -->`;
    }
    return read(file);
  });
  INCLUDE.lastIndex = 0;
}

let fragmentCount = 0;
html = html.replace(/<!--\s*FRAGMENT\s+([a-zA-Z0-9_-]+)(?:\s*\|\s*col=(\d+))?\s*-->/g,
  (_m, name, colOverride) => {
    const file = path.join(FRAGMENTS, `${name}.html`);
    if (!fs.existsSync(file)) {
      errors.push(`missing fragment mock/fragments/${name}.html`);
      return `<!-- MISSING FRAGMENT ${name} -->`;
    }
    let frag = read(file);

    if (/<img\b[^>]*\bsrc=["']?(?:\.{0,2}\/)*img\//i.test(frag)) {
      errors.push(`fragment ${name}.html has an <img src="img/..."> — crops are backgrounds (var(--crop-<name>)), never <img>`);
    }

    let caption = "";
    frag = frag.replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/, (_f, inner) => {
      caption = inner.trim();
      return "";
    });

    const dims = frag.match(/width:\s*(\d+)px;\s*height:\s*(\d+)px/);
    if (!dims) {
      errors.push(`no width/height found in fragment ${name}.html`);
      return "";
    }
    const w = Number(dims[1]);
    const h = Number(dims[2]);
    const col = colOverride ? Number(colOverride) : COLUMN;
    const scale = Math.min(1, col / w);

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
    ].filter(Boolean).join("\n");
  });

/* ── 4. Product crops: rewrite url(img/x.jpg) -> var(--crop-x) ───────────── */
html = html.replace(
  /url\(\s*(["']?)(?:\.{0,2}\/)*img\/([A-Za-z0-9._-]+)\.jpe?g\1\s*\)/gi,
  (m, _q, base) => {
    if (!cropManifest.some((c) => c.base === base)) {
      errors.push(`fragment references img/${base}.jpg which is not in mock/img/`);
      return m;
    }
    return `var(--crop-${base})`;
  }
);
if (/<img\b[^>]*\bsrc=["']?(?:\.{0,2}\/)*img\//i.test(html)) {
  errors.push('forbidden <img src="img/..."> in output — use background-image:var(--crop-<name>) instead');
}

/* ── 5. Shots (ios mechanism, kept verbatim) ──────────────────────────────
   <!-- shot:FILE.png -->  and  <img data-shot="FILE.png" ...>  resolve to
   base64 JPEG, downscaled 804px/q78, cached in mock/deck-assets/. Under
   SMOKE=1 a missing source PNG is skipped (empty string), not fatal — there
   is no shots/ ledger yet in Phase 0. */
fs.mkdirSync(ASSETS, { recursive: true });
const shotCache = new Map();
const shotManifest = [];

function encodeShot(name) {
  if (shotCache.has(name)) return shotCache.get(name);
  const src = path.join(SHOTS, name);
  if (!fs.existsSync(src)) {
    if (!SMOKE) errors.push(`missing shot shots/${name}`);
    shotCache.set(name, null);
    return null;
  }
  const dst = path.join(ASSETS, name.replace(/\.png$/i, "") + `.${SHOT_WIDTH}.jpg`);
  const fresh = fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs;
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
    const probe = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", dst], { encoding: "utf8" });
    const mw = probe.match(/pixelWidth:\s*(\d+)/);
    const mh = probe.match(/pixelHeight:\s*(\d+)/);
    if (mw) w = Number(mw[1]);
    if (mh) h = Number(mh[1]);
  } catch (e) { /* dimensions are a nicety; the data URI is the payload */ }
  const buf = fs.readFileSync(dst);
  const entry = { data: buf.toString("base64"), w, h, bytes: buf.length, file: dst };
  shotCache.set(name, entry);
  shotManifest.push({ name, w, h, bytes: buf.length });
  return entry;
}

function shotImg(name, attrs) {
  const entry = encodeShot(name);
  if (!entry) return SMOKE ? "" : `<!-- MISSING SHOT ${name} -->`;
  const dims = entry.h ? ` width="${entry.w}" height="${entry.h}"` : "";
  return `<img src="data:image/jpeg;base64,${entry.data}"${dims} decoding="async"${attrs}>`;
}

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

html = html.replace(/<!--\s*shot:([A-Za-z0-9._-]+\.png)\s*-->/g, (_m, name) =>
  shotImg(name, ` alt="${escAttr("Evidence shot " + name)}"`)
);
html = html.replace(/<img\b([^>]*?)\bdata-shot="([A-Za-z0-9._-]+\.png)"([^>]*?)\/?>/g,
  (_m, pre, name, post) => {
    const rest = (pre + post).replace(/\s+/g, " ").trim();
    const attrs = rest ? " " + rest : "";
    const withAlt = /\balt=/.test(attrs) ? attrs : attrs + ` alt="${escAttr("Evidence shot " + name)}"`;
    return shotImg(name, withAlt);
  }
);

/* ── 6. ASCII fold ──────────────────────────────────────────────────────── */
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
      if (folded !== chunk) foldedBlocks += 1;
      return folded;
    }
    return toEntities(chunk);
  })
  .join("");

/* ── 7. Hard-fail gates ────────────────────────────────────────────────── */
const shadowMatches =
  (html.match(/box-shadow\s*:(?!\s*none\b)/gi) || []).length +
  (html.match(/drop-shadow\(/gi) || []).length;

const leftovers = html.match(
  /<!--\s*(FRAGMENT|IMG|include:|shot:|MISSING)[^>]*-->|\/\*\s*@@(FONTS|KIT|DIR_[ABC])@@\s*\*\//g
) || [];

const openSections = (html.match(/<section\b/g) || []).length;
const closeSections = (html.match(/<\/section>/g) || []).length;
const openFigures = (html.match(/<figure\b/g) || []).length;
const closeFigures = (html.match(/<\/figure>/g) || []).length;

const forbidden = /<!doctype|<html\b|<head\b|<body\b/i.test(html);

const styleBlock = (html.match(/<style[\s\S]*?<\/style>/) || [""])[0];
const braceOpen = (styleBlock.match(/\{/g) || []).length;
const braceClose = (styleBlock.match(/\}/g) || []).length;

const badUrls = (html.match(/https:\/\/[^"'\s)]+/g) || [])
  .filter((u) => !/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(u));

const nonAscii = (html.match(/[^\x00-\x7F]/g) || []).length;

const bytes = Buffer.byteLength(html, "utf8");

if (shadowMatches > 0) errors.push(`${shadowMatches} box-shadow/drop-shadow declaration(s) in output (D4)`);
if (leftovers.length) errors.push("unresolved marker(s): " + leftovers.slice(0, 8).join(" "));
if (openSections !== closeSections) errors.push(`unbalanced <section> tags: ${openSections} open / ${closeSections} close`);
if (openFigures !== closeFigures) errors.push(`unbalanced <figure> tags: ${openFigures} open / ${closeFigures} close`);
if (forbidden) errors.push("a <!doctype>/<html>/<head>/<body> tag is present — the artifact skeleton owns those");
if (braceOpen !== braceClose) errors.push(`unbalanced CSS braces in <style>: ${braceOpen} open / ${braceClose} close`);
if (badUrls.length) errors.push("disallowed https:// URL(s): " + badUrls.slice(0, 5).join(", "));
if (nonAscii > 0) errors.push(`${nonAscii} non-ascii byte(s) survived the ASCII fold`);
if (bytes > FAIL_BYTES) errors.push(`size ${mb(bytes)} exceeds the 15.5 MB hard budget`);

fs.writeFileSync(OUT, html, "utf8");

/* ── 8. Report ─────────────────────────────────────────────────────────── */
const shotBytes = shotManifest.reduce((n, s) => n + s.bytes, 0);
const cropBytes = cropManifest.reduce((n, c) => n + c.bytes, 0);

console.log("");
console.log("PARTS       " + PARTS.length + " concatenated" + (SMOKE ? "  (SMOKE=1)" : ""));
console.log("FRAGMENTS   " + fragmentCount + " inlined (dk-mock)");
console.log("CROPS       " + cropManifest.length + " inlined (" + kb(cropBytes) + ")");
cropManifest.forEach((c) => console.log("            " + c.file.padEnd(38) + kb(c.bytes)));
console.log("SHOTS       " + shotManifest.length + " embedded at " + SHOT_WIDTH + "px / q" + SHOT_QUALITY +
  "  (" + mb(shotBytes) + " raw JPEG)");
console.log("MARKUP      section " + openSections + "/" + closeSections +
  "  figure " + openFigures + "/" + closeFigures +
  "  doc tags " + (forbidden ? "PRESENT - FIX" : "none"));
console.log("CSS         " + braceOpen + " braces open / " + braceClose + " close");
console.log("ASCII       " + nonAscii + " non-ascii bytes left (" + foldedBlocks + " style/script blocks folded)");
console.log("SIZE        " + mb(bytes) + "  " +
  (bytes > FAIL_BYTES ? "OVER THE 15.5 MB HARD BUDGET"
    : bytes > WARN_BYTES ? "WARNING: over the 12 MB soft budget"
      : "within budget"));
console.log("WROTE       " + OUT);
console.log("");
console.log(
  `PARTS ${PARTS.length}, FRAGMENTS ${fragmentCount}, SHOTS ${shotManifest.length}, ` +
  `box-shadow ${shadowMatches}, markers ${leftovers.length}, non-ascii ${nonAscii}, SIZE ${mb(bytes)}`
);
console.log("");

if (errors.length) {
  console.error("FAILED");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
