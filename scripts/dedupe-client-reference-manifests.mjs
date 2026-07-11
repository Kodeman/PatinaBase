#!/usr/bin/env node
/*
 * dedupe-client-reference-manifests.mjs
 * ------------------------------------------------------------------------
 * WHAT THIS DOES
 * Next.js emits one `route_client-reference-manifest.js` per API route under
 * `src/app/api/**`. For designer-portal that is 114 files, each ~347KB, and
 * their bodies are byte-similar: they share the same `ssrModuleMapping`,
 * `rscModuleMapping`, `edgeRscModuleMapping`, and (for 113 of 114) the same
 * `clientModules` payload. When @opennextjs/cloudflare bundles the Worker,
 * OpenNext's `load-manifest.js` plugin emits `require("<path>")` for every
 * route manifest (it only factors *page* manifests, not route ones), so
 * esbuild pulls all 114 near-identical modules into `handler.mjs` — ~35.9MiB
 * of duplicated JSON that pushes the Worker over Cloudflare's 64MB
 * uncompressed limit (error 10027).
 *
 * This script runs AFTER `next build` (via OpenNext's `buildCommand`) and
 * BEFORE OpenNext copies the standalone tree into the bundle. It rewrites the
 * 114 manifests in `.next/standalone/**` so the shared payloads live exactly
 * once: the lexicographically-first manifest becomes the "canonical" module
 * that defines a `__crmShared` bag and `module.exports`es it; every other
 * manifest becomes a tiny stub that `require()`s the canonical and rebuilds
 * its own `__RSC_MANIFEST[route]` entry from the shared bag plus its few
 * per-route (singleton) values inlined. esbuild dedupes the canonical by
 * resolved path, so the shared payload is bundled once.
 *
 * This is a workaround for vercel/next.js#88316 (route manifests not
 * factored). Upstream fixes it only in Next 16.2+, so once this repo is on
 * Next >=16.2 (or OpenNext learns to factor route manifests) the duplication
 * disappears and this script no-ops via Gate 1 below.
 *
 * CAVEAT (accepted): the rewritten standalone tree can no longer be run under
 * a plain `node server.js` for API routes. Next's vanilla `evalManifest`
 * executes each manifest with `vm.runInNewContext(...)` and provides NO
 * `require`, so the stub's `require("../.../route_client-reference-manifest.js")`
 * would throw. That is acceptable here because Patina serves this app ONLY via
 * OpenNext on Cloudflare Workers (where the module graph is resolved by
 * esbuild at bundle time, not by Next's `evalManifest`), and `.next` is
 * rebuilt from scratch on every deploy — the rewrite never persists across
 * builds.
 *
 * Invocation: run with cwd = the app directory, e.g.
 *   cd apps/designer-portal && node ../../scripts/dedupe-client-reference-manifests.mjs
 *
 * Node-only, zero npm deps. Fail-closed: any ambiguity aborts (exit 1) rather
 * than shipping a possibly-broken manifest. Benign no-op cases exit 0.
 * ------------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert';

// --- constants -----------------------------------------------------------
const MARKER = '/*__CRM_DEDUPED__*/';
const STANDALONE_DIR = '.next/standalone';
const MANIFEST_NAME = 'route_client-reference-manifest.js';
const SERVER_APP_SEGMENT = '/.next/server/app/';

// Anchored prefix; no backtracking risk. Captures the JSON-quoted route key.
const PREFIX_RX =
  /^globalThis\.__RSC_MANIFEST=\(globalThis\.__RSC_MANIFEST\|\|\{\}\);globalThis\.__RSC_MANIFEST\[("(?:[^"\\]|\\.)*")\]=/;

// Gate 1 (benign skip): the duplication is only worth touching at scale.
const GATE1_MIN_COUNT = 100;
const GATE1_MIN_BYTES = 8 * 1024 * 1024; // 8MiB

// Hoisting: a value is worth pulling into __crmShared only if it is large.
const MIN_HOIST_LEN = 1024;
// A singleton value larger than this is hoisted anyway so it never bloats its
// stub past the Gate-5 per-stub cap. In practice the only singleton this
// catches is /api/po/generate's ~286KB `clientModules`. This is a deliberate
// extension of the "shared by >=2" hoist rule: inlining a 286KB singleton
// would produce a ~286KB stub and Gate 5 (each stub <= 16KB) would correctly
// abort — so that value must be hoisted for the transform to be valid at all.
const STUB_INLINE_BUDGET = 8 * 1024; // 8KiB

// Gate 5 (abort): sanity bounds on the output.
const STUB_MAX_BYTES = 16 * 1024; // each stub <= 16KiB
const GATE5_AGG_RATIO = 0.05; // post-transform aggregate < 5% of original

// --- helpers -------------------------------------------------------------
const MiB = (n) => (n / (1024 * 1024)).toFixed(2) + 'MiB';
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const log = (...a) => console.log('[crm-dedupe]', ...a);
const fail = (...a) => {
  console.error('[crm-dedupe] ABORT:', ...a);
  process.exit(1);
};

/** Recursively collect absolute paths of every `route_client-reference-manifest.js`
 *  that sits under a `.next/server/app/` segment. */
function collectManifests(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      collectManifests(p, acc);
    } else if (e.name === MANIFEST_NAME) {
      const posix = p.split(path.sep).join('/');
      if (posix.includes(SERVER_APP_SEGMENT)) acc.push(path.resolve(p));
    }
  }
  return acc;
}

// --- Gate 0: standalone tree must exist ----------------------------------
if (!fs.existsSync(STANDALONE_DIR) || !fs.statSync(STANDALONE_DIR).isDirectory()) {
  console.error(
    `[crm-dedupe] ERROR: ${STANDALONE_DIR} not found under ${process.cwd()}.`,
  );
  console.error(
    '[crm-dedupe] Run this with cwd = the app directory, after `next build` has produced the standalone tree.',
  );
  process.exit(1);
}

// --- collect + sort (deterministic canonical selection) ------------------
const cwd = process.cwd();
const relPosix = (abs) => path.relative(cwd, abs).split(path.sep).join('/');
const allFiles = collectManifests(STANDALONE_DIR, []).sort((a, b) => {
  const ra = relPosix(a);
  const rb = relPosix(b);
  return ra < rb ? -1 : ra > rb ? 1 : 0;
});

if (allFiles.length === 0) {
  log('no route_client-reference-manifest.js files found; nothing to do.');
  process.exit(0);
}

// --- Idempotency: skip if already deduped --------------------------------
const marked = [];
const vanilla = [];
for (const abs of allFiles) {
  const raw = fs.readFileSync(abs, 'utf8');
  if (raw.startsWith(MARKER)) marked.push({ abs, raw });
  else vanilla.push({ abs, raw });
}
if (marked.length === allFiles.length) {
  log(`all ${allFiles.length} manifests already deduped (marker present); nothing to do.`);
  process.exit(0);
}
if (marked.length > 0) {
  // Mixed state should never occur on a fresh build. Fail closed rather than
  // guess how to reconcile deduped + vanilla manifests.
  fail(
    `inconsistent state: ${marked.length} deduped + ${vanilla.length} vanilla manifests. ` +
      'Delete .next and rebuild.',
  );
}

// --- Parse every vanilla manifest strictly -------------------------------
// record: { abs, raw, bytes, keyLiteral, routeKey, obj }
const parsed = [];
const unparseable = [];
for (const { abs, raw } of vanilla) {
  const m = raw.match(PREFIX_RX);
  if (!m) {
    unparseable.push({ abs, reason: 'prefix regex did not match' });
    continue;
  }
  const keyLiteral = m[1];
  let routeKey;
  try {
    routeKey = JSON.parse(keyLiteral);
  } catch (err) {
    unparseable.push({ abs, reason: 'route key not JSON-parseable: ' + err.message });
    continue;
  }
  // Remainder is a pure JSON object (real files end at `}` — no trailing
  // semicolon/newline — but tolerate optional trailing `;`/whitespace).
  const remainder = raw.slice(m[0].length).replace(/;?\s*$/, '');
  let obj;
  try {
    obj = JSON.parse(remainder);
  } catch (err) {
    unparseable.push({ abs, reason: 'manifest body not JSON-parseable: ' + err.message });
    continue;
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    unparseable.push({ abs, reason: 'manifest body is not a plain object' });
    continue;
  }
  parsed.push({ abs, raw, bytes: Buffer.byteLength(raw), keyLiteral, routeKey, obj });
}

const parseableBytes = parsed.reduce((n, p) => n + p.bytes, 0);

// --- Gate 1 (benign skip): duplication not present at scale ---------------
if (parsed.length < GATE1_MIN_COUNT || parseableBytes < GATE1_MIN_BYTES) {
  log(
    '################################################################\n' +
      `[crm-dedupe] route-manifest duplication not present; skipping dedupe.\n` +
      `[crm-dedupe]   parseable manifests: ${parsed.length} (need >= ${GATE1_MIN_COUNT})\n` +
      `[crm-dedupe]   aggregate bytes:     ${MiB(parseableBytes)} (need >= ${MiB(GATE1_MIN_BYTES)})\n` +
      `[crm-dedupe] Likely fixed upstream (Next>=16.2 or OpenNext factoring route manifests).\n` +
      '################################################################',
  );
  process.exit(0);
}

// --- Gate 2 (abort): at scale, every manifest MUST parse ------------------
if (unparseable.length > 0) {
  console.error(
    `[crm-dedupe] ${unparseable.length} manifest(s) at scale (${vanilla.length} found) could not be parsed:`,
  );
  for (const u of unparseable) console.error(`  - ${relPosix(u.abs)}: ${u.reason}`);
  fail('unparseable manifest(s) present; refusing to dedupe a partially-understood tree.');
}

// --- Group top-level values by content hash ------------------------------
// hash -> { s, len, count }
const values = new Map();
for (const p of parsed) {
  for (const key of Object.keys(p.obj)) {
    const s = JSON.stringify(p.obj[key]);
    const h = sha1(s);
    const rec = values.get(h);
    if (rec) rec.count++;
    else values.set(h, { s, len: s.length, count: 1 });
  }
}

// --- Decide which values to hoist into __crmShared -----------------------
// Hoist iff large AND (shared by >=2 files OR a singleton too big to inline
// without blowing a stub past the Gate-5 cap — see STUB_INLINE_BUDGET).
const hoisted = new Set(); // hash
const varOf = new Map(); // hash -> "v_xxxxxxxx"
const prefixOwner = new Map(); // 8-char prefix -> hash (collision guard)
for (const [h, rec] of values) {
  const hoist = rec.len >= MIN_HOIST_LEN && (rec.count >= 2 || rec.len > STUB_INLINE_BUDGET);
  if (!hoist) continue;
  const prefix = h.slice(0, 8);
  if (prefixOwner.has(prefix) && prefixOwner.get(prefix) !== h) {
    fail(
      `sha1 8-char prefix collision on "${prefix}" between distinct hoisted values ` +
        `(${prefixOwner.get(prefix)} vs ${h}).`,
    );
  }
  prefixOwner.set(prefix, h);
  hoisted.add(h);
  varOf.set(h, 'v_' + prefix);
}

// --- Emit (all in memory; write nothing until every gate passes) ---------
/** Build the `{ ... }` literal for one route's manifest object, preserving
 *  original top-level key order; hoisted values -> __crmShared.v_*, singletons
 *  inlined as JSON. */
function emitRouteObject(obj) {
  const parts = [];
  for (const key of Object.keys(obj)) {
    const s = JSON.stringify(obj[key]);
    const h = sha1(s);
    const rhs = hoisted.has(h) ? '__crmShared.' + varOf.get(h) : s;
    parts.push(JSON.stringify(key) + ':' + rhs);
  }
  return '{' + parts.join(',') + '}';
}

const canonical = parsed[0];
const stubs = parsed.slice(1);

// Canonical: defines + exports __crmShared, and registers its own route.
const sharedEntries = [...hoisted].map((h) => JSON.stringify(varOf.get(h)) + ':' + values.get(h).s);
const canonicalContent =
  MARKER +
  '\n' +
  'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});\n' +
  'const __crmShared={' +
  sharedEntries.join(',') +
  '};\n' +
  'module.exports.__crmShared=__crmShared;\n' +
  'globalThis.__RSC_MANIFEST[' +
  canonical.keyLiteral +
  ']=' +
  emitRouteObject(canonical.obj) +
  ';\n';

// Each stub: require the canonical for __crmShared, then register its route.
function stubContent(entry) {
  let rp = path.relative(path.dirname(entry.abs), canonical.abs).split(path.sep).join('/');
  if (!rp.startsWith('.')) rp = './' + rp;
  return (
    MARKER +
    '\n' +
    'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});\n' +
    'const {__crmShared}=require(' +
    JSON.stringify(rp) +
    ');\n' +
    'globalThis.__RSC_MANIFEST[' +
    entry.keyLiteral +
    ']=' +
    emitRouteObject(entry.obj) +
    ';\n'
  );
}

const outputs = [{ entry: canonical, content: canonicalContent, isCanonical: true }];
for (const s of stubs) outputs.push({ entry: s, content: stubContent(s), isCanonical: false });

// --- Gate 3: every emitted module must compile ---------------------------
for (const o of outputs) {
  try {
    new vm.Script(o.content, { filename: relPosix(o.entry.abs) });
  } catch (err) {
    fail(`emitted module failed to compile: ${relPosix(o.entry.abs)}: ${err.message}`);
  }
}

// --- Gate 4 (semantic): re-executed manifests must equal the originals ----
// Objects built INSIDE a vm context carry that context's Object.prototype, so
// a raw deepStrictEqual against a main-realm JSON.parse result trips on the
// prototype mismatch ("same structure but not reference-equal") even when the
// data is identical. Manifests are pure JSON, so we normalize the vm-realm
// result back into the main realm with a JSON round-trip before asserting —
// this erases only the realm artifact, never a real semantic difference.
const assertManifestEqual = (actual, expected, label) => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected, label);
};
// Run the canonical to capture __crmShared + its own registration.
let capturedShared;
try {
  const ctx = {
    module: { exports: {} },
    require: () => fail('canonical must not require anything'),
  };
  vm.createContext(ctx);
  new vm.Script(canonicalContent).runInContext(ctx);
  capturedShared = ctx.module.exports.__crmShared;
  assert.ok(capturedShared && typeof capturedShared === 'object', 'canonical did not export __crmShared');
  assertManifestEqual(ctx.__RSC_MANIFEST[canonical.routeKey], canonical.obj, 'canonical route mismatch');
} catch (err) {
  fail(`canonical semantic check failed (${relPosix(canonical.abs)}): ${err.message}`);
}
// Run each stub with a require() that returns the captured shared bag.
for (const s of stubs) {
  try {
    const ctx = {
      module: { exports: {} },
      require: () => ({ __crmShared: capturedShared }),
    };
    vm.createContext(ctx);
    new vm.Script(stubContent(s)).runInContext(ctx);
    assertManifestEqual(ctx.__RSC_MANIFEST[s.routeKey], s.obj, 'stub route mismatch');
  } catch (err) {
    fail(`stub semantic check failed (${relPosix(s.abs)}): ${err.message}`);
  }
}

// --- Gate 5: output sanity bounds ----------------------------------------
let postBytes = 0;
for (const o of outputs) {
  const b = Buffer.byteLength(o.content);
  postBytes += b;
  if (!o.isCanonical && b > STUB_MAX_BYTES) {
    fail(`stub exceeds ${STUB_MAX_BYTES}B (${b}B): ${relPosix(o.entry.abs)}`);
  }
}
const origBytes = parseableBytes;
if (postBytes >= origBytes * GATE5_AGG_RATIO) {
  fail(
    `post-transform aggregate ${MiB(postBytes)} is not < ${(GATE5_AGG_RATIO * 100).toFixed(0)}% ` +
      `of original ${MiB(origBytes)} — transform did not shrink as expected.`,
  );
}

// --- Write everything ----------------------------------------------------
for (const o of outputs) fs.writeFileSync(o.entry.abs, o.content);

// --- Summary -------------------------------------------------------------
log(
  `rewrote ${outputs.length} manifests (1 canonical + ${stubs.length} stubs); ` +
    `hoisted ${hoisted.size} shared value(s).`,
);
log(`canonical: ${relPosix(canonical.abs)}`);
log(`aggregate: ${MiB(origBytes)} -> ${MiB(postBytes)} (${((postBytes / origBytes) * 100).toFixed(2)}%)`);
process.exit(0);
