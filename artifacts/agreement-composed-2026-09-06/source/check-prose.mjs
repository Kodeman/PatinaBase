// Word-budget gate for ../proposal.html.
//
// Convention: top-level <section id="…" data-prose-cap="N"> elements (default cap 60
// when the attribute is absent). Prose = words inside <p> elements that are NOT inside
// <figure>, <table>, <figcaption>, <nav>, <aside class="mock…">, or any element carrying
// class "mock" (including "mock-…" prefixes) or "no-prose". A document-wide cap is read
// from <body data-prose-total="N"> (default 900).
//
// Implemented with a small balanced-tag walker over regex tokens — no jsdom.
// Run: node source/check-prose.mjs   ->   prints the section table, then PASS/FAIL.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const proposalPath = path.join(here, '..', 'proposal.html');

if (!existsSync(proposalPath)) {
  console.log('proposal.html not present — nothing to check');
  process.exit(0);
}

const html = readFileSync(proposalPath, 'utf8');

const DEFAULT_SECTION_CAP = 60;
const DEFAULT_TOTAL_CAP = 900;
const EXCLUDED_TAGS = new Set(['figure', 'table', 'figcaption', 'nav']);
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function getAttr(tagSource, name) {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*'([^']*)'`, 'i');
  const m = tagSource.match(re);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : m[2];
}

function hasExcludedClass(tagSource) {
  const cls = getAttr(tagSource, 'class');
  if (!cls) return false;
  return cls.split(/\s+/).some((c) => c === 'no-prose' || c === 'mock' || c.startsWith('mock'));
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function countWords(text) {
  const words = decodeEntities(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}

// ---- tokenize: comments, tags, or raw text runs ----
const tokenRe = /<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;
const tokens = html.match(tokenRe) || [];

let bodyTotalCap = DEFAULT_TOTAL_CAP;
const sectionOrder = [];
const sectionWords = {};
const sectionCaps = {};
let currentSectionId = null;

const stack = []; // { tag, excluded, isSectionTop, prevSectionId }

for (const token of tokens) {
  if (token.startsWith('<!--')) continue;

  if (token.startsWith('<')) {
    const closing = /^<\//.test(token);
    const nameMatch = token.match(/^<\/?([a-zA-Z][a-zA-Z0-9-]*)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].toLowerCase();
    const selfClosing = /\/>\s*$/.test(token) || VOID_TAGS.has(name);

    if (closing) {
      // pop the nearest matching frame (tolerant of malformed/unbalanced markup)
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === name) {
          const popped = stack.splice(i);
          const top = popped[0];
          if (top.isSectionTop) currentSectionId = top.prevSectionId;
          break;
        }
      }
      continue;
    }

    if (name === 'body') {
      const totalAttr = getAttr(token, 'data-prose-total');
      if (totalAttr) bodyTotalCap = parseInt(totalAttr, 10);
    }

    const parentExcluded = stack.length ? stack[stack.length - 1].excluded : false;
    const excluded = parentExcluded || EXCLUDED_TAGS.has(name) || hasExcludedClass(token);

    let isSectionTop = false;
    if (name === 'section' && !excluded && currentSectionId === null) {
      const id = getAttr(token, 'id') || `section-${sectionOrder.length + 1}`;
      const capAttr = getAttr(token, 'data-prose-cap');
      const cap = capAttr ? parseInt(capAttr, 10) : DEFAULT_SECTION_CAP;
      sectionOrder.push(id);
      sectionCaps[id] = cap;
      sectionWords[id] = 0;
      isSectionTop = true;
      currentSectionId = id;
    }

    if (!selfClosing) {
      stack.push({ tag: name, excluded, isSectionTop, prevSectionId: isSectionTop ? null : undefined });
    }
    continue;
  }

  // text token
  if (!currentSectionId) continue;
  const pFrame = [...stack].reverse().find((f) => f.tag === 'p');
  if (!pFrame || pFrame.excluded) continue;
  sectionWords[currentSectionId] = (sectionWords[currentSectionId] || 0) + countWords(token);
}

// ---- report ----
if (sectionOrder.length === 0) {
  console.log('no top-level <section> elements found in proposal.html');
}

const idWidth = Math.max(4, ...sectionOrder.map((id) => id.length));
console.log(`${'section'.padEnd(idWidth)}  words  cap   status`);

let total = 0;
let anyOver = false;
for (const id of sectionOrder) {
  const words = sectionWords[id] || 0;
  const cap = sectionCaps[id];
  const over = words > cap;
  if (over) anyOver = true;
  total += words;
  console.log(`${id.padEnd(idWidth)}  ${String(words).padStart(5)}  ${String(cap).padStart(3)}   ${over ? 'OVER' : 'OK'}`);
}

const totalOver = total > bodyTotalCap;
console.log('');
console.log(`total${' '.repeat(Math.max(0, idWidth - 5))}  ${String(total).padStart(5)}  ${String(bodyTotalCap).padStart(3)}   ${totalOver ? 'OVER' : 'OK'}`);

if (anyOver || totalOver) {
  console.error('\nprose budget exceeded');
  process.exit(1);
}

console.log('\nprose budget ok');
