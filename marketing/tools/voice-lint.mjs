#!/usr/bin/env node
// Voice lint for Press copy. Rules are data in marketing/canon/lexicon.json.
// Usage: node marketing/tools/voice-lint.mjs <file|dir> [--kind <kind>] [--claims <path>] [--json]
// Lints every frontmatter string value (recursively) and the markdown body, with file line numbers.
// Exit 1 on any error.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { REPO_ROOT, readPlan, parseClaims } from "./lib/run.mjs";

export const LEXICON = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "marketing/canon/lexicon.json"), "utf8"),
);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const HASHTAG = /(?<![\w&#])#[A-Za-z]\w*/g;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ERROR_RULES = [
  ...LEXICON.errors,
  ...LEXICON.places.map((p) => ({
    rule: "place",
    pattern: `\\b${escapeRe(p.name)}\\b`,
    flags: p.flags,
  })),
].map((r) => ({ ...r, re: new RegExp(r.pattern, `${r.flags}g`) }));
const WARN_RULES = LEXICON.warnings.map((r) => ({
  ...r,
  re: new RegExp(r.pattern, `${r.flags}g`),
}));
const NUMBER = LEXICON.numbers;
const NUMBER_RE = new RegExp(NUMBER.pattern, `${NUMBER.flags}g`);
const MARKER_RE = new RegExp(LEXICON.claims.marker, "g");

// Sentence ends at terminal punctuation followed by whitespace or end; [Cnn] markers that trail the
// punctuation ("...ran itself. [C01]") belong to the sentence they follow. Blank lines also end one.
const SENTENCE_END = /[.!?]+["'”’)]*(?:[ \t]*\[C\d{2,}\])*(?=\s|$)|\n[ \t]*\n/g;

function sentenceSpans(text) {
  const spans = [];
  let start = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    spans.push([start, end]);
    start = end;
  }
  if (start < text.length) spans.push([start, text.length]);
  return spans;
}

// Segments: {text, line(index) -> file line}. One per frontmatter string value, one for the body.
function segmentsOf(raw) {
  const segments = [];
  const fm = raw.match(FRONTMATTER);
  let data = {};
  let bodyOffset = 0;
  if (fm) {
    const fmStartLine = 2; // frontmatter source begins on the line after the opening ---
    const lineCounter = new YAML.LineCounter();
    const doc = YAML.parseDocument(fm[1], { lineCounter });
    data = doc.toJS() || {};
    YAML.visit(doc, {
      Scalar(key, node) {
        if (key === "key" || typeof node.value !== "string" || !node.range)
          return;
        const startLine =
          lineCounter.linePos(node.range[0]).line + fmStartLine - 1;
        const block =
          node.type === "BLOCK_LITERAL" || node.type === "BLOCK_FOLDED";
        const text = node.value;
        segments.push({
          text,
          line: (i) => startLine + (block ? 1 : 0) + countNewlines(text, i),
        });
      },
    });
    bodyOffset = fm[0].length;
  }
  const body = raw.slice(bodyOffset);
  const bodyStartLine = countNewlines(raw, bodyOffset) + 1;
  segments.push({
    text: body,
    line: (i) => bodyStartLine + countNewlines(body, i),
    body: true,
  });
  return { data, body, segments };
}

function countNewlines(s, end) {
  let n = 0;
  for (let i = 0; i < end; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

function numberHits(masked) {
  const hits = [];
  for (const m of masked.matchAll(NUMBER_RE)) {
    const [whole, currency, num, percent] = m;
    const digits = num.replace(/\D/g, "").length;
    const isYear =
      !currency &&
      !percent &&
      /^\d{4}$/.test(num) &&
      +num >= NUMBER.yearMin &&
      +num <= NUMBER.yearMax;
    if (currency || percent || (digits >= NUMBER.minDigits && !isYear)) {
      hits.push({
        index: m.index,
        end: m.index + whole.length,
        match: whole.trim(),
      });
    }
  }
  // A stray % or $ not attached to a number still needs a citation.
  for (const m of masked.matchAll(/[%$]/g)) {
    if (!hits.some((h) => m.index >= h.index && m.index < h.end)) {
      hits.push({ index: m.index, match: m[0] });
    }
  }
  return hits;
}

export function lintText(raw, { kind = null, claims = parseClaims() } = {}) {
  const errors = [];
  const warnings = [];
  const { data, body, segments } = segmentsOf(raw);
  let exclamations = [];

  for (const seg of segments) {
    const { text } = seg;
    for (const r of ERROR_RULES) {
      for (const m of text.matchAll(r.re))
        errors.push({ rule: r.rule, match: m[0], line: seg.line(m.index) });
    }
    for (const r of WARN_RULES) {
      for (const m of text.matchAll(r.re)) {
        const hit = { rule: r.rule, match: m[0], line: seg.line(m.index) };
        if (r.maxPerPiece !== undefined)
          exclamations.push({ ...hit, max: r.maxPerPiece });
        else warnings.push(hit);
      }
    }

    for (const m of text.matchAll(MARKER_RE)) {
      const claim = claims.get(m[1]);
      if (!claim || claim.status !== "verified") {
        errors.push({
          rule: LEXICON.claims.rule,
          match: m[0],
          line: seg.line(m.index),
        });
      }
    }

    const masked = text.replace(MARKER_RE, (s) => " ".repeat(s.length));
    for (const [start, end] of sentenceSpans(text)) {
      const sentence = text.slice(start, end);
      if (new RegExp(LEXICON.claims.marker).test(sentence)) continue;
      for (const hit of numberHits(masked.slice(start, end))) {
        errors.push({
          rule: NUMBER.rule,
          match: hit.match,
          line: seg.line(start + hit.index),
        });
      }
    }
  }

  if (exclamations.length > (exclamations[0]?.max ?? Infinity)) {
    for (const { max, ...hit } of exclamations) warnings.push(hit);
  }

  const format = (kind && LEXICON.formats[kind]) || {};
  if (format.maxHashtags !== undefined) {
    const tags = new Set();
    for (const t of Array.isArray(data.hashtags) ? data.hashtags : []) {
      tags.add(String(t).replace(/^#/, "").toLowerCase());
    }
    for (const seg of segments) {
      for (const m of seg.text.matchAll(HASHTAG))
        tags.add(m[0].slice(1).toLowerCase());
    }
    if (tags.size > format.maxHashtags) {
      errors.push({
        rule: "hashtags",
        match: `${tags.size} hashtags (max ${format.maxHashtags})`,
        line: 1,
      });
    }
  }
  if (format.maxWords !== undefined) {
    const words = body
      .replace(MARKER_RE, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    if (words > format.maxWords) {
      errors.push({
        rule: "pitch-words",
        match: `${words} words (max ${format.maxWords})`,
        line: 1,
      });
    }
  }
  if (format.maxSubject !== undefined) {
    const subject = typeof data.subject === "string" ? data.subject : "";
    if (subject.length > format.maxSubject) {
      errors.push({
        rule: "subject-length",
        match: `${subject.length} chars (max ${format.maxSubject})`,
        line: 1,
      });
    }
  }

  const byLine = (a, b) => a.line - b.line;
  return { kind, errors: errors.sort(byLine), warnings: warnings.sort(byLine) };
}

// Kind of a file sitting in <run>/copy/: the piece's kind in <run>/plan.json.
function kindFromPlan(file) {
  const dir = path.dirname(file);
  if (path.basename(dir) !== "copy") return null;
  const runDir = path.dirname(dir);
  if (!fs.existsSync(path.join(runDir, "plan.json"))) return null;
  const pieceId = path.basename(file).split(".")[0];
  const piece = (readPlan(runDir).pieces || []).find((p) => p.id === pieceId);
  return piece ? piece.kind : null;
}

export function lintFile(file, { kind, claims } = {}) {
  const resolved = path.resolve(file);
  const result = lintText(fs.readFileSync(resolved, "utf8"), {
    kind: kind || kindFromPlan(resolved),
    claims,
  });
  return { file: resolved, ...result };
}

function filesOf(target) {
  if (!fs.statSync(target).isDirectory()) return [target];
  const names = fs.readdirSync(target).sort();
  const finals = names.filter((n) => n.endsWith(".final.md"));
  return (finals.length ? finals : names.filter((n) => n.endsWith(".md"))).map(
    (n) => path.join(target, n),
  );
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      kind: { type: "string" },
      claims: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  const target = positionals[0];
  if (!target) {
    console.error(
      "usage: voice-lint.mjs <file|dir> [--kind <kind>] [--claims <path>] [--json]",
    );
    process.exit(2);
  }
  const claims = values.claims
    ? parseClaims(path.resolve(values.claims))
    : parseClaims();
  const isDir = fs.statSync(target).isDirectory();
  const results = filesOf(target).map((f) =>
    lintFile(f, { kind: values.kind, claims }),
  );

  if (values.json) {
    console.log(JSON.stringify(isDir ? results : results[0], null, 2));
  } else {
    for (const r of results) {
      const rel = path.relative(process.cwd(), r.file);
      for (const e of r.errors)
        console.log(
          `${rel}:${e.line}  error  ${e.rule}  ${JSON.stringify(e.match)}`,
        );
      for (const w of r.warnings)
        console.log(
          `${rel}:${w.line}  warn   ${w.rule}  ${JSON.stringify(w.match)}`,
        );
    }
    const errs = results.reduce((n, r) => n + r.errors.length, 0);
    const warns = results.reduce((n, r) => n + r.warnings.length, 0);
    console.log(
      `${results.length} file(s): ${errs} error(s), ${warns} warning(s)`,
    );
  }
  process.exit(results.some((r) => r.errors.length) ? 1 : 0);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
