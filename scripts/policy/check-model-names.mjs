#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowlistPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'model-name-allowlist.json');
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const forbidden = [
  /designer-taught intelligence/i,
  /\bthe engine\b/i,
  /\bAesthete\b/,
  /\bAI\b/,
  /powered by/i,
];
const extensions = new Set(['.ts', '.tsx', '.swift']);
const found = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (extensions.has(path.extname(entry.name))) {
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!relative.startsWith('apps/') && !relative.startsWith('packages/')) continue;
      if (relative.startsWith('apps/mobile/') && !relative.endsWith('.swift')) continue;
      if (/(?:^|\/)(?:test|tests|__tests__|_tests)(?:\/|\.)/.test(relative) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative) || /Tests\.swift$/.test(relative) || /\.stories\.tsx$/.test(relative)) continue;
      if (relative === 'scripts/policy/check-model-names.mjs') continue;
      scan(relative, readFileSync(absolute, 'utf8'));
    }
  }
}

function stripComments(source) {
  const input = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, (comment) => comment.replace(/[^\n]/g, ' '));
  let output = '';
  let state = 'code';
  let quote = '';
  for (let i = 0; i < input.length; i += 1) {
    const current = input[i];
    const next = input[i + 1];
    if (state === 'line') {
      if (current === '\n') { output += '\n'; state = 'code'; }
      else output += ' ';
      continue;
    }
    if (state === 'block') {
      if (current === '*' && next === '/') { output += '  '; i += 1; state = 'code'; }
      else output += current === '\n' ? '\n' : ' ';
      continue;
    }
    if (state === 'string') {
      output += current;
      if (current === '\\' && i + 1 < source.length) output += source[++i];
      else if (current === quote) state = 'code';
      continue;
    }
    if (current === '/' && next === '/') { output += '  '; i += 1; state = 'line'; continue; }
    if (current === '/' && next === '*') { output += '  '; i += 1; state = 'block'; continue; }
    if (current === '"' || current === "'" || current === '`') { quote = current; state = 'string'; }
    output += current;
  }
  return output;
}

function scan(file, source) {
  const cleaned = stripComments(source);
  const literals = [];
  const stringPattern = /(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g;
  for (const match of cleaned.matchAll(stringPattern)) literals.push({ text: match[0].slice(1, -1), index: match.index });
  const jsxText = />\s*([^<>{}\n]+?)\s*</g;
  for (const match of cleaned.matchAll(jsxText)) literals.push({ text: match[1], index: match.index + match[0].indexOf(match[1]) });
  for (const literal of literals) {
    for (const pattern of forbidden) {
      const match = pattern.exec(literal.text);
      if (!match) continue;
      const line = cleaned.slice(0, literal.index + match.index).split('\n').length;
      if (!allowlist.some((entry) => entry.path === file && literal.text.includes(entry.text))) {
        found.push(`${file}:${line}: ${match[0]}`);
      }
    }
  }
}

for (const area of ['apps', 'packages']) {
  const directory = path.join(root, area);
  if (area === 'apps') {
    const mobile = path.join(directory, 'mobile');
    try { visit(mobile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name, 'src');
    try { if (entry.isDirectory()) visit(source); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

if (found.length) {
  console.error('Model-feature names found in product strings:');
  for (const violation of found) console.error(`  ${violation}`);
  process.exitCode = 1;
} else {
  console.log('No model-feature names found in product strings.');
}
