#!/usr/bin/env node
// Oracle for the founders' plan page (doc/index.html). Node ESM, no dependencies.
// Usage from the repo root: node artifacts/client-house-issue-2026-10-21/tools/check-doc.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(here, '../doc/index.html');

let html;
try {
  html = readFileSync(docPath, 'utf8');
} catch (err) {
  console.error(`check-doc: cannot read ${docPath}: ${err.message}`);
  process.exit(1);
}

const problems = [];
const lineOf = (source, index) => source.slice(0, index).split('\n').length;

// Text a reader sees: comments, scripts and styles removed, tags replaced by spaces.
const bodyText = html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
  .replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ');

const snippet = (source, index, length) =>
  source.slice(Math.max(0, index - 30), index + length + 30).replace(/\s+/g, ' ').trim();

if (!html.includes('<title>The House Issue</title>')) {
  problems.push('missing <title>The House Issue</title>');
}

const banned = [
  ['curated', /curated/gi],
  ['luxury', /luxury/gi],
  ['seamless', /seamless/gi],
  ['elevated', /elevated/gi],
  ['bespoke', /bespoke/gi],
  ['disrupt', /disrupt/gi],
  ['revolutioni', /revolutioni/gi],
  ['unlock', /unlock/gi],
  ['game-chang', /game-chang/gi],
  ['ai-powered', /ai-powered/gi],
  ['gig', /\bgig\b/gi],
];
for (const [word, pattern] of banned) {
  for (const m of html.matchAll(pattern)) {
    problems.push(`banned lexicon "${word}" at line ${lineOf(html, m.index)}: …${snippet(html, m.index, m[0].length)}…`);
  }
}

for (const m of bodyText.matchAll(/!/g)) {
  problems.push(`exclamation point in body text: …${snippet(bodyText, m.index, 1)}…`);
}

const ruleContext = ['ban', 'never', 'no ', 'label', 'forbid'];
for (const m of bodyText.matchAll(/\bAI\b/gi)) {
  const windowText = bodyText.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).toLowerCase();
  if (!ruleContext.some((word) => windowText.includes(word))) {
    problems.push(`standalone "AI" outside a quoted rule: …${snippet(bodyText, m.index, m[0].length)}…`);
  }
}

for (const m of html.matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)) {
  const code = m[0].codePointAt(0).toString(16).toUpperCase();
  problems.push(`emoji codepoint U+${code} at line ${lineOf(html, m.index)}`);
}

if (!html.includes('prefers-color-scheme: dark')) {
  problems.push('dark theme missing: no "prefers-color-scheme: dark" block');
}

for (const m of html.matchAll(/01 \/ /g)) {
  problems.push(`numeral-over-total index "01 / " at line ${lineOf(html, m.index)}`);
}

if (problems.length) {
  console.error(`check-doc: ${problems.length} problem(s) in ${docPath}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('check-doc: ok');
