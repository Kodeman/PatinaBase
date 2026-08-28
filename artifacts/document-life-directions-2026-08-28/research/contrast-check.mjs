#!/usr/bin/env node
// WCAG 2.2 contrast check for a direction's (or the kit's) CSS custom
// properties.
//
//   node contrast-check.mjs mock/direction-x.css [mock/kit.css]
//
// Parses every `--name: #hex;` declaration (3- or 6-digit hex) from the given
// file(s). A trailing `/* contrast: ignore */` comment on the declaration
// line skips it. GROUND tokens are names containing paper|sheet|bg|ground|
// chrome|surface|stock|tint|desk; TEXT tokens end in -ink or contain text|fg.
// Grounds/text come from the first file; if it declares none of a kind, the
// second (kit) file's tokens of that kind are used instead. Prints every
// TEXT x GROUND pair's ratio and exits 1 if any pair is below 4.5:1 -- unless
// either token name contains muted-on-dark or quiet, which is a warning, not
// a failure.
//
// Math ported from apps/designer-portal/src/lib/document/__tests__/contrast.test.ts:82-100.

import fs from "node:fs";

const [dirPath, kitPath] = process.argv.slice(2);
if (!dirPath) {
  console.error("usage: node contrast-check.mjs mock/direction-x.css [mock/kit.css]");
  process.exit(2);
}
if (!fs.existsSync(dirPath)) {
  console.error("missing " + dirPath);
  process.exit(2);
}

function parseTokens(css) {
  // First declaration wins. kit.css and a direction file both declare their
  // light values first and re-declare the same names again inside a dark
  // media query / [data-theme="dark"] block further down -- this check is
  // about the light register (globals.css's own -ink comments are light-
  // register ratios), so a later dark re-declaration must not overwrite it.
  const tokens = new Map();
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\s*;([^\n]*)/g;
  let m;
  while ((m = re.exec(css))) {
    const [, name, hex, trailing] = m;
    if (/\/\*\s*contrast:\s*ignore\s*\*\//.test(trailing)) continue;
    if (!tokens.has(name)) tokens.set(name, hex);
  }
  return tokens;
}

function toRgb(hex) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function relativeLuminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const isGround = (n) => /paper|sheet|bg|ground|chrome|surface|stock|tint|desk/i.test(n);
const isText = (n) => /-ink$/i.test(n) || /text|fg/i.test(n);
const isSoft = (n) => /muted-on-dark|quiet/i.test(n);

const dirTokens = parseTokens(fs.readFileSync(dirPath, "utf8"));
const kitTokens = kitPath && fs.existsSync(kitPath)
  ? parseTokens(fs.readFileSync(kitPath, "utf8"))
  : new Map();

const dirGrounds = [...dirTokens].filter(([n]) => isGround(n));
const dirTexts = [...dirTokens].filter(([n]) => isText(n));
const kitGrounds = [...kitTokens].filter(([n]) => isGround(n));
const kitTexts = [...kitTokens].filter(([n]) => isText(n));

const grounds = dirGrounds.length ? dirGrounds : kitGrounds;
const texts = dirTexts.length ? dirTexts : kitTexts;

if (!grounds.length) {
  console.error("no GROUND tokens found in " + dirPath + (kitPath ? " or " + kitPath : ""));
  process.exit(2);
}
if (!texts.length) {
  console.error("no TEXT tokens found in " + dirPath + (kitPath ? " or " + kitPath : ""));
  process.exit(2);
}

console.log("GROUNDS: " + grounds.map(([n]) => n).join(", "));
console.log("TEXT:    " + texts.map(([n]) => n).join(", "));
console.log("");
console.log("text".padEnd(32) + "ground".padEnd(28) + "ratio   result");

let failures = 0;
let warnings = 0;
for (const [tName, tHex] of texts) {
  for (const [gName, gHex] of grounds) {
    const ratio = contrastRatio(tHex, gHex);
    const soft = isSoft(tName) || isSoft(gName);
    let result;
    if (ratio >= 4.5) { result = "OK"; }
    else if (soft) { result = "WARN (muted/quiet, below 4.5:1)"; warnings += 1; }
    else { result = "FAIL"; failures += 1; }
    console.log(tName.padEnd(32) + gName.padEnd(28) + ratio.toFixed(2).padEnd(8) + result);
  }
}

console.log("");
console.log(failures + " failure(s), " + warnings + " warning(s)");
process.exit(failures > 0 ? 1 : 0);
