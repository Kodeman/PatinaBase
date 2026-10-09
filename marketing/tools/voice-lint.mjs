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
// Leading HTML comments (sol.mjs writes a provenance header) are not copy.
const LEADING_COMMENTS = /^(?:\s*<!--[\s\S]*?-->)+\s*/;
const HASHTAG = /(?<![\w&#])#[A-Za-z]\w*/g;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NORMALIZE = LEXICON.normalize;
const STRIP_RE = new RegExp(NORMALIZE.strip, "g");
const HOMOGLYPH_RE = new RegExp(
  `[${Object.keys(NORMALIZE.homoglyphs).join("")}]`,
  "g",
);

// Strip zero-width characters, then compatibility-normalize (fullwidth letters, nbsp, ...).
// Neither step adds or removes a newline, so line numbers counted on the result stay true.
function normalize(text) {
  return text.replace(STRIP_RE, "").normalize(NORMALIZE.form);
}

const ERROR_RULES = [
  ...LEXICON.errors,
  ...LEXICON.places.map((p) => ({
    rule: "place",
    pattern: p.pattern || `\\b${escapeRe(p.name)}\\b`,
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
// punctuation ("...ran itself. [C01]") belong to the sentence they follow. A line break also ends
// one, so every bullet or headline line carries its own marker.
const SENTENCE_END = /[.!?]+["'”’)]*(?:[ \t]*\[C\d{2,}\])*(?=\s|$)|\n/g;

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

// Segments: {text, start} where start is the file line of text's first character. One per
// frontmatter string or number value, one for the body. Also returns frontmatter parse errors, the
// raw frontmatter source and the hashtags-list line for the format checks.
function segmentsOf(file) {
  const segments = [];
  const fmErrors = [];
  const lead = file.match(LEADING_COMMENTS);
  const lineOffset = lead ? countNewlines(lead[0], lead[0].length) : 0;
  const raw = lead ? file.slice(lead[0].length) : file;
  const fm = raw.match(FRONTMATTER);
  let data = {};
  let fmSource = "";
  let hashtagsLine = 1;
  let bodyOffset = 0;
  if (fm) {
    fmSource = fm[1];
    const fmStartLine = 2 + lineOffset; // source begins on the line after the opening ---
    const lineCounter = new YAML.LineCounter();
    const fileLine = (offset) =>
      lineCounter.linePos(offset).line + fmStartLine - 1;
    const doc = YAML.parseDocument(fm[1], { lineCounter });
    for (const err of doc.errors) {
      fmErrors.push({
        rule: "frontmatter",
        match: err.message
          .split("\n")[0]
          .replace(/ at line \d+, column \d+:?$/, ""),
        line: fileLine(err.pos[0]),
      });
    }
    try {
      data = doc.toJS() || {};
    } catch {
      data = {};
    }
    const tagsPair = YAML.isMap(doc.contents)
      ? doc.contents.items.find((p) => p.key && p.key.value === "hashtags")
      : null;
    if (tagsPair && tagsPair.key.range)
      hashtagsLine = fileLine(tagsPair.key.range[0]);
    YAML.visit(doc, {
      Scalar(key, node, path) {
        if (key === "key" || !node.range) return;
        let text;
        if (typeof node.value === "string") text = node.value;
        else if (typeof node.value === "number") {
          const pair = path[path.length - 1];
          const name = YAML.isPair(pair) && pair.key && pair.key.value;
          if (NUMBER.structuralKeys.includes(name)) return;
          text = String(node.value);
        } else return;
        const block =
          node.type === "BLOCK_LITERAL" || node.type === "BLOCK_FOLDED";
        segments.push({
          text,
          start: fileLine(node.range[0]) + (block ? 1 : 0),
        });
      },
    });
    bodyOffset = fm[0].length;
  }
  const body = raw.slice(bodyOffset);
  segments.push({
    text: body,
    start: countNewlines(raw, bodyOffset) + 1 + lineOffset,
  });
  return { data, body, segments, fmErrors, fmSource, hashtagsLine };
}

function countNewlines(s, end) {
  let n = 0;
  for (let i = 0; i < end; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

function numberHits(masked) {
  const hits = [];
  for (const m of masked.matchAll(NUMBER_RE)) {
    const [whole, currency, num, unit] = m;
    const digits = num.replace(/\D/g, "").length;
    const isYear =
      !currency &&
      !unit &&
      /^\d{4}$/.test(num) &&
      +num >= NUMBER.yearMin &&
      +num <= NUMBER.yearMax;
    if (currency || unit || (digits >= NUMBER.minDigits && !isYear)) {
      hits.push({
        index: m.index,
        end: m.index + whole.length,
        match: whole.trim(),
        number: num.replace(/,/g, ""),
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

// A cited claim backs a number only when its own text states that number.
function claimHasNumber(claim, number) {
  const text = normalize(claim).replace(/(\d),(?=\d)/g, "$1");
  return new RegExp(`(?<!\\d)${escapeRe(number)}(?!\\d)`).test(text);
}

export function lintText(raw, { kind = null, claims = parseClaims() } = {}) {
  const { data, body, segments, fmErrors, fmSource, hashtagsLine } =
    segmentsOf(raw);
  const errors = [...fmErrors];
  const warnings = [];
  let exclamations = [];

  for (const seg of segments) {
    const text = normalize(seg.text);
    const glyphText = text.replace(
      HOMOGLYPH_RE,
      (c) => NORMALIZE.homoglyphs[c],
    );
    const line = (i) => seg.start + countNewlines(text, i);
    for (const r of ERROR_RULES) {
      for (const m of (r.homoglyphs ? glyphText : text).matchAll(r.re))
        errors.push({ rule: r.rule, match: m[0], line: line(m.index) });
    }
    for (const r of WARN_RULES) {
      for (const m of text.matchAll(r.re)) {
        const hit = { rule: r.rule, match: m[0], line: line(m.index) };
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
          line: line(m.index),
        });
      }
    }

    const masked = text.replace(MARKER_RE, (s) => " ".repeat(s.length));
    for (const [start, end] of sentenceSpans(text)) {
      const cited = [...text.slice(start, end).matchAll(MARKER_RE)]
        .map((m) => claims.get(m[1])?.claim)
        .filter((c) => c !== undefined);
      const markers = new RegExp(LEXICON.claims.marker).test(
        text.slice(start, end),
      );
      for (const hit of numberHits(masked.slice(start, end))) {
        if (!markers) {
          errors.push({
            rule: NUMBER.rule,
            match: hit.match,
            line: line(start + hit.index),
          });
        } else if (
          hit.number &&
          cited.length &&
          !cited.some((c) => claimHasNumber(c, hit.number))
        ) {
          errors.push({
            rule: NUMBER.mismatchRule,
            match: hit.match,
            line: line(start + hit.index),
          });
        }
      }
    }
  }

  if (exclamations.length > (exclamations[0]?.max ?? Infinity)) {
    for (const { max, ...hit } of exclamations) warnings.push(hit);
  }

  const format = (kind && LEXICON.formats[kind]) || {};
  if (format.maxHashtags !== undefined) {
    const tags = new Set();
    const items = Array.isArray(data.hashtags) ? data.hashtags : [];
    if (items.some((t) => t === null || t === undefined)) {
      errors.push({
        rule: LEXICON.hashtags.nullRule,
        match: LEXICON.hashtags.nullMessage,
        line: hashtagsLine,
      });
    }
    for (const t of items) {
      if (t === null || t === undefined) continue;
      tags.add(String(t).replace(/^#/, "").toLowerCase());
    }
    // The raw frontmatter catches tags YAML swallowed as comments (- #one parses as null).
    for (const text of [fmSource, ...segments.map((s) => s.text)]) {
      for (const m of text.matchAll(HASHTAG))
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
  try {
    run(target, values);
  } catch (err) {
    // A crash must never pass for "not linted yet": --json always leaves a readable verdict.
    const fatal = String((err && err.message) || err).split("\n")[0];
    if (values.json) {
      console.log(
        JSON.stringify(
          {
            file: path.resolve(target),
            kind: values.kind || null,
            fatal,
            errors: [{ rule: "lint-crashed", match: fatal, line: 1 }],
            warnings: [],
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`voice-lint crashed: ${fatal}`);
    }
    process.exit(2);
  }
}

function run(target, values) {
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
