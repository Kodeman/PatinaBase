#!/usr/bin/env node
// CI guard for the designer portal's webpack client output.
// Reads webpack-bundle-analyzer's chartData and Next client-reference manifests,
// following the same chunk/module parsing used by the US-33 bundle harness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/bundle-budget.config.json'), 'utf8'));
const KIB = 1024;
const MIB = 1024 * KIB;

function leaves(node, acc = []) {
  if (node.groups?.length) node.groups.forEach((group) => leaves(group, acc));
  else acc.push(node);
  return acc;
}

function readChart(nextDir) {
  const html = fs.readFileSync(path.join(nextDir, 'analyze.html'), 'utf8');
  const match = html.match(/window\.chartData\s*=\s*(\[.*?\]);\s*\n/s)
    || html.match(/chartData\s*=\s*(\[.*?\]);/s);
  if (!match) throw new Error(`webpack analyzer chartData not found in ${nextDir}/analyze.html`);
  return JSON.parse(match[1]);
}

function routeChunkFiles(nextDir, route) {
  const manifestPath = path.join(nextDir, 'server/app', route, 'page_client-reference-manifest.js');
  const source = fs.readFileSync(manifestPath, 'utf8');
  const assignment = source.indexOf(']=');
  if (assignment < 0) throw new Error(`unrecognized client-reference manifest: ${manifestPath}`);
  const manifest = JSON.parse(source.slice(assignment + 2).trim().replace(/;$/, ''));
  const chunks = new Set();

  if (manifest.clientModules) {
    // Next 16 records each client module's emitted chunks here; retain only
    // physical client files (the interleaved webpack module ids aren't files).
    for (const module of Object.values(manifest.clientModules)) {
      for (const file of module.chunks ?? []) {
        const normalized = decodeURIComponent(file);
        if (normalized.startsWith('static/chunks/') && normalized.endsWith('.js')) chunks.add(normalized);
      }
    }
  } else {
    // Compatibility with the older entryJSFiles format used by bundle.mjs.
    const buildManifest = JSON.parse(fs.readFileSync(path.join(nextDir, 'build-manifest.json'), 'utf8'));
    for (const file of [...(buildManifest.rootMainFiles ?? []), ...(buildManifest.polyfillFiles ?? [])]) chunks.add(file);
    for (const [entry, files] of Object.entries(manifest.entryJSFiles ?? {})) {
      if (/\/(page|layout)$/.test(entry)) files.forEach((file) => chunks.add(file));
    }
  }
  if (chunks.size === 0) throw new Error(`no client chunks found for ${route}`);
  return [...chunks];
}

function collectFiles(dir, predicate, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(file, predicate, found);
    else if (predicate(file)) found.push(file);
  }
  return found;
}

function inspect(nextDir, config = CONFIG) {
  const chart = readChart(nextDir);
  const moduleLeaves = chart.flatMap((chunk) => leaves(chunk));
  const cryptoModules = moduleLeaves.filter((module) => /crypto-browserify/i.test(module.path || module.label || ''));
  const lucideIcons = new Set(moduleLeaves
    .filter((module) => /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?lucide-react\/.*\/icons\//.test(module.path || module.label || ''))
    .map((module) => module.path || module.label));
  const clientFiles = collectFiles(path.join(nextDir, 'static/chunks'), (file) => file.endsWith('.js'));
  const cryptoFiles = clientFiles.filter((file) => /crypto-browserify/i.test(fs.readFileSync(file, 'utf8')));
  const failures = [];
  const warnings = [];
  const routeMetrics = {};

  if (cryptoModules.length || cryptoFiles.length) {
    failures.push(`crypto-browserify found in client output (${cryptoModules.length} analyzer modules, ${cryptoFiles.length} chunks)`);
  }
  if (lucideIcons.size > config.lucideIconModuleLimit) {
    failures.push(`lucide icon modules ${lucideIcons.size} exceed limit ${config.lucideIconModuleLimit}`);
  }

  for (const [route, budget] of Object.entries(config.routes)) {
    const files = routeChunkFiles(nextDir, route);
    const gzipBytes = files.reduce((total, file) => {
      const absolute = path.join(nextDir, file);
      if (!fs.existsSync(absolute)) throw new Error(`manifest chunk is missing: ${absolute}`);
      return total + zlib.gzipSync(fs.readFileSync(absolute)).length;
    }, 0);
    routeMetrics[route] = { gzipBytes, gzipKiB: Math.round(gzipBytes / KIB * 10) / 10, chunks: files.length, budgetBytes: budget.budgetBytes };
    if (gzipBytes > budget.budgetBytes) {
      failures.push(`${route} first-load gzip ${gzipBytes} bytes exceeds ${budget.budgetBytes} bytes`);
    }
  }

  const openNextDir = path.resolve(nextDir, '..', '.open-next');
  const handlers = collectFiles(openNextDir, (file) => path.basename(file) === 'handler.mjs');
  for (const handler of handlers) {
    const size = fs.statSync(handler).size;
    if (size > 30 * MIB) warnings.push(`handler.mjs is ${size} bytes (> 30 MiB): ${path.relative(ROOT, handler)}`);
  }
  return { failures, warnings, routeMetrics, cryptoModules: cryptoModules.length, cryptoFiles: cryptoFiles.length, lucideIconModules: lucideIcons.size };
}

function report(result) {
  for (const [route, metric] of Object.entries(result.routeMetrics)) {
    console.log(`${route}: ${metric.gzipBytes} bytes (${metric.gzipKiB} KiB) / ${metric.budgetBytes} byte budget, ${metric.chunks} chunks`);
  }
  console.log(`client crypto-browserify modules: ${result.cryptoModules}; chunks: ${result.cryptoFiles}`);
  console.log(`lucide icon modules: ${result.lucideIconModules} / ${CONFIG.lucideIconModuleLimit}`);
  result.warnings.forEach((warning) => console.warn(`WARNING: ${warning}`));
  result.failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  if (!result.failures.length) console.log('Bundle budget passed.');
}

function selfTest() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'patina-bundle-budget-'));
  const nextDir = path.join(fixture, '.next');
  const chunk = 'static/chunks/page.js';
  const iconModules = Array.from({ length: 201 }, (_, index) => ({
    path: `/fixture/node_modules/lucide-react/dist/esm/icons/icon-${index}.js`,
    parsedSize: 5,
  }));
  const cryptoModule = { path: '/fixture/node_modules/crypto-browserify/index.js', parsedSize: 5 };
  fs.mkdirSync(path.join(nextDir, 'static/chunks'), { recursive: true });
  fs.mkdirSync(path.join(nextDir, 'server/app/desk'), { recursive: true });
  fs.mkdirSync(path.join(nextDir, 'server/app/doc/[id]'), { recursive: true });
  fs.writeFileSync(path.join(nextDir, chunk), 'fixture client chunk');
  for (const route of ['desk', 'doc/[id]']) {
    fs.writeFileSync(path.join(nextDir, `server/app/${route}/page_client-reference-manifest.js`),
      `globalThis.__RSC_MANIFEST["/${route}/page"]={"clientModules":{"fixture":{"chunks":["${chunk}"]}}};`);
  }
  const chart = [{ label: chunk, parsedSize: 10, gzipSize: 10, groups: [...iconModules, cryptoModule] }];
  fs.writeFileSync(path.join(nextDir, 'analyze.html'), `window.chartData = ${JSON.stringify(chart)};\n`);
  try {
    const result = inspect(nextDir, {
      routes: { desk: { budgetBytes: 1000 }, 'doc/[id]': { budgetBytes: 1000 } },
      lucideIconModuleLimit: 200,
    });
    assert(result.failures.some((failure) => failure.includes('crypto-browserify')), 'crypto re-export fixture must fail the client tripwire');
    assert(result.failures.some((failure) => failure.includes('lucide icon modules 201 exceed limit 200')), 'full icon-set fixture must fail the lucide tripwire');
    assert.equal(result.routeMetrics.desk.gzipBytes > 0, true, 'fixture route should measure gzip from its built client chunk');
    console.log('Self-test passed: crypto re-export and full icon-set fixtures fail their tripwires.');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--self-test') {
  selfTest();
} else {
  const nextDir = path.resolve(process.argv[2] ?? path.join(ROOT, 'apps/designer-portal/.next'));
  try {
    const result = inspect(nextDir);
    report(result);
    if (result.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(`Bundle budget could not be evaluated: ${error.message}`);
    process.exitCode = 1;
  }
}
