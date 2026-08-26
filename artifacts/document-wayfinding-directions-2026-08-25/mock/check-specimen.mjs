// Specimen consistency check — same data, two shapes.
//   node mock/check-specimen.mjs
//
// Reads the ten deck fragments (mock/fragments/{a,b}-M{1..5}.html), strips the
// markup so every text node becomes one cell, then pulls the cells that follow
// each tracked label. Prints one row per lane x screen x label x value, plus a
// per-label summary, so a divergence between the two lanes — or between two
// screens inside one lane — is visible without opening a browser.
//
// It reports; it does not judge. Some divergences are legitimate (each lane
// keeps its own glosses, and B's M5 is a different job from A's M5).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAG = path.join(HERE, "fragments");

// Canonical row name -> the literals the two lanes actually print for it.
const LABELS = [
  ["Budget", ["Budget"]],
  ["Plan", ["Plan"]],
  ["Authorized", ["Authorized", "Committed"]],
  ["Moved", ["Moved"]],
  ["Owed", ["Owed you", "Owed"]],
  ["Call sheet", ["Call sheet", "People"]],
  ["Boards", ["Mood boards", "Boards"]],
  ["Spec book", ["Spec book", "Spec"]],
  ["Plan room", ["Plan room", "Drawings"]],
];

const ALL_LITERALS = LABELS.flatMap(([, ls]) => ls);
// Longest first, so "Plan room" wins over "Plan" and "Owed you" over "Owed".
const BY_LENGTH = [...ALL_LITERALS].sort((a, b) => b.length - a.length);
const STOP = /^(?:→|↗|↑|↓|←|⌘|Fold\b|Unfold\b|\+)/;
const BLOCK = "\u0000"; // block boundary sentinel
const BLOCK_TAGS = /<\/?(?:div|p|section|header|footer|aside|li|ul|ol|tr|td|th|table|h[1-6]|figure|figcaption|nav|main|button|br)\b[^>]*>/gi;

const clean = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, `\n${BLOCK}\n`)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, `\n${BLOCK}\n`)
    // A block boundary ends a row; an inline tag boundary only ends a cell.
    .replace(BLOCK_TAGS, `\n${BLOCK}\n`)
    .replace(/<[^>]+>/g, "\n")
    .replace(/&middot;|&#183;/g, "·")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&rarr;|&#8594;/g, "→")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ");

const norm = (s) => s.replace(/^[·\s]+/, "").replace(/[·:\s]+$/, "").trim();

const cells = (html) =>
  clean(html)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

// The canonical row this cell opens, or null. The longest literal wins, so the
// act "Spec book ->" is never read as the row "Spec".
function labelAt(cell) {
  const n = norm(cell);
  for (const lit of BY_LENGTH) {
    if (n === lit || n.startsWith(lit + " ")) {
      const canon = LABELS.find(([, ls]) => ls.includes(lit))[0];
      return { canon, rest: n.slice(lit.length).replace(/^[\u00b7\s]+/, "").trim() };
    }
  }
  return null;
}

function extract(html) {
  const c = cells(html);
  const out = [];
  const seen = new Set();
  const push = (label, value) => {
    const v = value.replace(/\s+/g, " ").trim();
    // A bare label is not a value, and an act ("Spec book ->") is not a row.
    if (!v || labelAt(v) || STOP.test(v) || /[\u2192\u2197]$/.test(v)) return;
    const k = label + " " + v;
    if (seen.has(k)) return;
    seen.add(k);
    out.push([label, v]);
  };

  for (let i = 0; i < c.length; i += 1) {
    if (c[i] === BLOCK) continue;
    const hit = labelAt(c[i]);
    if (!hit) continue;
    if (hit.rest) {
      push(hit.canon, hit.rest); // label and value share one cell
      continue;
    }
    // Label alone: its value is the rest of its own block.
    const parts = [];
    for (let j = i + 1; j < c.length && parts.length < 3; j += 1) {
      const nx = c[j].trim();
      if (nx === BLOCK) break; // block boundary: the row is over
      if (!nx || labelAt(nx) || STOP.test(nx)) break;
      parts.push(nx);
    }
    push(hit.canon, parts.join(" "));
  }
  return out;
}

const MONEY = /\$[\d,]+/;
const key = (v) => {
  const m = v.match(MONEY);
  return m ? m[0] : v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
};

const rows = [];
for (const lane of ["a", "b"]) {
  for (const m of [1, 2, 3, 4, 5]) {
    for (const [label, value] of extract(fs.readFileSync(path.join(FRAG, `${lane}-M${m}.html`), "utf8"))) {
      rows.push({ lane: lane.toUpperCase(), screen: `M${m}`, label, value });
    }
  }
}

const order = new Map(LABELS.map(([c], i) => [c, i]));
rows.sort((x, y) => order.get(x.label) - order.get(y.label) || x.lane.localeCompare(y.lane) || x.screen.localeCompare(y.screen));

const W = (k, min) => Math.max(min, ...rows.map((r) => r[k].length));
const w = { lane: W("lane", 4), screen: W("screen", 6), label: W("label", 10) };
const pad = (s, n) => String(s).padEnd(n, " ");
const line = (a, b, c, d) => `${pad(a, w.lane)}  ${pad(b, w.screen)}  ${pad(c, w.label)}  ${d}`;

console.log(line("LANE", "SCREEN", "LABEL", "VALUE"));
console.log(line("-".repeat(w.lane), "-".repeat(w.screen), "-".repeat(w.label), "-".repeat(56)));
let last = null;
for (const r of rows) {
  if (last && last !== r.label) console.log("");
  console.log(line(r.lane, r.screen, r.label, r.value));
  last = r.label;
}

console.log("\nBY LABEL — do the lanes agree on the figure?");
console.log(`${pad("LABEL", w.label)}  ${pad("VERDICT", 8)}  KEYS`);
for (const [canon] of LABELS) {
  const A = [...new Set(rows.filter((r) => r.label === canon && r.lane === "A").map((r) => key(r.value)))];
  const B = [...new Set(rows.filter((r) => r.label === canon && r.lane === "B").map((r) => key(r.value)))];
  if (!A.length && !B.length) continue;
  let verdict = "ONE LANE";
  if (A.length && B.length) {
    if (A.some((x) => B.includes(x))) verdict = "MATCH";
    else if (A.some((x) => B.some((y) => y.includes(x) || x.includes(y)))) verdict = "PARTIAL";
    else verdict = "DIVERGE";
  }
  console.log(`${pad(canon, w.label)}  ${pad(verdict, 8)}  A: ${A.join(" | ") || "-"}    B: ${B.join(" | ") || "-"}`);
}
