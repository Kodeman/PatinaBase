// The static text a template carries reaches every piece composed from it, so it gets the same
// voice-lint ERROR rules as copy: a template can never smuggle a tagline, "AI" or the held line.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintText } from '../voice-lint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(__dirname, '..', '..', 'templates');

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

const ENTITIES = { nbsp: ' ', middot: '·', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };

/**
 * The text a reader can see or hear: element text, <title>, alt and aria-label values. Comments,
 * <style>, <script> and {{…}} placeholders are dropped; every tag becomes a line break, so two
 * elements never run together into one sentence. Layout numbers are not copy, in the same spirit
 * as lexicon.json's numbers.structuralKeys: a line that is only a slide number or counter ("02",
 * "01 / 03") is dropped, and a channel size tag ("16x9", "1920x1080") is masked.
 */
export function visibleText(html) {
  const attrs = [...html.matchAll(/\s(?:alt|aria-label)="([^"]*)"/g)].map((m) => m[1]);
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '\n')
    .replace(/<[^>]*>/g, '\n');
  return [body, ...attrs]
    .join('\n')
    .replace(/\{\{\{?[^}]*\}?\}\}/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? ' ')
    .split('\n')
    .map((l) => l.replace(/\b\d+x\d+\b/g, 'NxN').replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^\d{1,3}(?: \/ \d{1,3})?$/.test(l))
    .join('\n');
}

// A line that ends "for … studios." is a positioning line, which voice.md §4 rules out.
const TAGLINE = /\bfor\b[^.\n]*\bstudios\.$/i;

const files = htmlFiles(TEMPLATES);

test('every template is found', () => {
  const names = files.map((f) => path.relative(TEMPLATES, f)).sort();
  for (const name of ['deck/index.html', 'email.html', 'one-pager.html', 'pin.html', 'poster.html', 'social.html']) {
    assert.ok(names.includes(name), `${name} missing from ${names.join(', ')}`);
  }
});

for (const file of files) {
  const rel = path.relative(TEMPLATES, file);
  test(`template text passes voice-lint: ${rel}`, () => {
    const text = visibleText(fs.readFileSync(file, 'utf8'));
    const { errors } = lintText(text);
    assert.deepEqual(errors, [], `${rel}:\n${text}`);
    const taglines = text.split('\n').filter((l) => TAGLINE.test(l));
    assert.deepEqual(taglines, [], `${rel} carries a tagline`);
  });
}

test('the extractor and the lint catch a smuggled tagline, AI and the held line', () => {
  const html = '<style>.a{}</style><!-- AI --><p>{{eyebrow}}</p><div>AI-powered help</div>'
    + '<td>Where Time Adds Value</td><img alt="powered by AI"><p>Designer-Taught Intelligence for growing design studios.</p>'
    + '<span>02</span><p>Studios save 40 hours a month.</p>';
  const text = visibleText(html);
  const errors = lintText(text).errors;
  const rules = errors.map((e) => e.rule);
  // The slide number is layout and dropped; a number in a sentence is still copy and still fails.
  assert.deepEqual(errors.filter((e) => e.rule === 'uncited-number').map((e) => e.match), ['40 hours']);
  assert.ok(rules.includes('held-tagline'), rules.join(','));
  assert.ok(rules.includes('ai-powered'), rules.join(','));
  assert.ok(rules.includes('powered-by'), rules.join(','));
  assert.ok(text.split('\n').some((l) => TAGLINE.test(l)));
  assert.doesNotMatch(text, /eyebrow|\.a\{/);
});

test('the email footer carries the place line, not a tagline', () => {
  const text = visibleText(fs.readFileSync(path.join(TEMPLATES, 'email.html'), 'utf8'));
  assert.match(text, /^Middle West Studio · Madison, Wisconsin$/m);
  assert.doesNotMatch(text, /Designer-Taught Intelligence/);
});
