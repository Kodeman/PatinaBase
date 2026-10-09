import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  CHANNELS,
  runPaths,
  readPlan,
  validatePlan,
  readFinal,
  appendLedger,
  parseClaims,
} from '../lib/run.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_RUN = path.join(__dirname, 'fixtures', 'run-sample');

function clonePlan() {
  return JSON.parse(JSON.stringify(readPlan(FIXTURE_RUN)));
}

test('validatePlan returns [] for the valid fixture plan', () => {
  const plan = readPlan(FIXTURE_RUN);
  assert.deepEqual(validatePlan(plan), []);
});

test('validatePlan flags a bad channel id', () => {
  const plan = clonePlan();
  plan.pieces[0].channel = 'not-a-real-channel';
  const errors = validatePlan(plan);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('channel')));
});

test('validatePlan flags a dangling visual reference', () => {
  const plan = clonePlan();
  plan.pieces[0].visuals = ['J99'];
  const errors = validatePlan(plan);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('visuals references unknown job')));
});

test('validatePlan flags a duplicate piece id', () => {
  const plan = clonePlan();
  plan.pieces[1].id = plan.pieces[0].id;
  const errors = validatePlan(plan);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('duplicate piece id')));
});

test('validatePlan flags a video job missing startFrom', () => {
  const plan = clonePlan();
  const videoJob = plan.jobs.find((j) => j.kind === 'video');
  delete videoJob.startFrom;
  const errors = validatePlan(plan);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('startFrom')));
});

test('validatePlan flags an out-of-range variants value', () => {
  const plan = clonePlan();
  plan.jobs[0].variants = 7;
  const errors = validatePlan(plan);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('variants')));
});

test('readFinal round-trips YAML frontmatter and body for every piece kind', () => {
  const plan = readPlan(FIXTURE_RUN);
  for (const piece of plan.pieces) {
    const { data, body } = readFinal(FIXTURE_RUN, piece.id);
    assert.equal(typeof data, 'object');
    assert.ok(data !== null);
    assert.equal(typeof body, 'string');
  }

  const { data } = readFinal(FIXTURE_RUN, 'P03');
  assert.equal(data.subject, 'Your studio just added its first hire');
  assert.ok(typeof data.preheader === 'string' && data.preheader.length > 0);
});

test('parseClaims reads statuses from the fixture claims.md', () => {
  const claimsPath = path.join(FIXTURE_RUN, 'claims.md');
  const claims = parseClaims(claimsPath);
  assert.equal(claims.get('C01').status, 'verified');
  assert.equal(claims.get('C02').status, 'todo');
});

test('parseClaims returns an empty Map when the file is missing', () => {
  const claims = parseClaims(path.join(FIXTURE_RUN, 'does-not-exist.md'));
  assert.equal(claims.size, 0);
});

test('appendLedger appends entries in a temp dir and creates the file if absent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-ledger-'));
  try {
    const { ledger } = runPaths(tmpDir);
    assert.ok(!fs.existsSync(ledger));

    const first = appendLedger(tmpDir, { actor: 'opus', action: 'draft' });
    assert.equal(first.actor, 'opus');
    assert.ok(typeof first.ts === 'string');

    appendLedger(tmpDir, { actor: 'sol', action: 'cold-read' });

    const entries = JSON.parse(fs.readFileSync(ledger, 'utf8'));
    assert.equal(entries.length, 2);
    assert.equal(entries[0].actor, 'opus');
    assert.equal(entries[1].actor, 'sol');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runPaths returns the expected key set', () => {
  const paths = runPaths('/tmp/some-run');
  const expectedKeys = [
    'root',
    'brief',
    'plan',
    'copy',
    'critique',
    'mj',
    'inbox',
    'flux',
    'compose',
    'out',
    'approved',
    'board',
    'ledger',
  ];
  assert.deepEqual(Object.keys(paths).sort(), expectedKeys.sort());
});

test('REPO_ROOT and CHANNELS are resolved correctly', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'marketing', 'canon', 'channels.json')));
  assert.equal(Object.keys(CHANNELS).length, 10);
  assert.ok(CHANNELS['instagram-4x5']);
});
