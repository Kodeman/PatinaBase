// Harness for the Press workflow scripts (.claude/workflows/marketing-{draft,compose}.js).
// A Workflow script is an async function body with Workflow globals (agent, phase, parallel,
// pipeline, log, args, budget, workflow) and a top-level `return`, so it is loaded as an
// AsyncFunction with stubbed globals and scripted agent responses keyed by agent label.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const SCRIPTS = {
  draft: path.join(REPO_ROOT, '.claude/workflows/marketing-draft.js'),
  compose: path.join(REPO_ROOT, '.claude/workflows/marketing-compose.js'),
};
const ROOT = '/srv/patina-test-root';
const BRIEF = 'marketing/briefs/2026-10-first-hire.md';
const RUN = `${ROOT}/marketing/runs/2026-10-08-first-hire`;

function source(name) {
  return fs.readFileSync(SCRIPTS[name], 'utf8');
}

async function runWorkflow(name, args, respond) {
  const src = source(name);
  assert.match(src, /^export const meta = \{/, `${name}: script must open with export const meta`);
  const body = src.replace(/^export const meta =/, 'const meta =');
  const calls = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts, label: opts.label });
    const r = await respond(opts.label, prompt, opts);
    if (r instanceof Error) throw r;
    return r === undefined ? null : r;
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null)));
  const pipeline = (items, ...stages) =>
    Promise.all(
      items.map(async (item, i) => {
        let v = item;
        try {
          for (const stage of stages) v = await stage(v, item, i);
          return v;
        } catch {
          return null;
        }
      }),
    );
  const budget = { total: null, spent: () => 0, remaining: () => Infinity };
  const workflow = () => {
    throw new Error('nested workflow() not expected');
  };
  const fn = new AsyncFunction('agent', 'phase', 'parallel', 'pipeline', 'log', 'args', 'budget', 'workflow', body);
  const result = await fn(agent, () => {}, parallel, pipeline, () => {}, args, budget, workflow);
  return { result, calls };
}

const byLabel = (calls, prefix) => calls.filter((c) => c.label.startsWith(prefix));

// ---------------------------------------------------------------- draft scenario
const DRAFT_PIECES = [
  { id: 'P01', kind: 'social', channel: 'instagram-4x5' },
  { id: 'P02', kind: 'video', channel: 'video-9x16' },
];
function draftResponder(overrides = {}) {
  return (label) => {
    for (const [prefix, value] of Object.entries(overrides)) {
      if (label === prefix || label.startsWith(prefix)) return typeof value === 'function' ? value(label) : value;
    }
    if (label === 'A0:setup') return { date: '2026-10-08', ok: true, reason: '', warnings: ['mflux: not installed'] };
    if (label === 'A1:direction') return { pass: true, reason: 'studio first-hire moment', planValid: true, planErrors: [], pieces: DRAFT_PIECES };
    if (label.startsWith('A2:opus:')) return { written: true, note: '' };
    if (label.startsWith('A2:sol:')) return { ok: true, detail: '' };
    if (label.startsWith('A3:judge:')) return { status: 'ok', chose: 'merge', errors: [] };
    if (label === 'A4:cold-read:sol') return { ok: true, detail: '' };
    if (label === 'A4:cold-read:apply') return { pieces: DRAFT_PIECES.map((p) => ({ id: p.id, errors: 0 })) };
    if (label === 'A5:art-direction') return { ok: true, warnings: [], errors: [] };
    throw new Error(`unscripted agent ${label}`);
  };
}
const draftArgs = { brief: BRIEF, root: ROOT };

// ---------------------------------------------------------------- compose scenario
const COMPOSE_PIECES = [
  { id: 'P01', kind: 'social', channel: 'instagram-4x5', visuals: ['J01'], lintErrors: 0 },
  { id: 'P02', kind: 'poster', channel: 'poster-18x24', visuals: ['J02'], lintErrors: 0 },
  { id: 'P03', kind: 'video', channel: 'video-9x16', visuals: ['J03'], lintErrors: 0 },
];
function composeResponder(only, overrides = {}) {
  const ids = only || COMPOSE_PIECES.map((p) => p.id);
  const templateIds = ids.filter((id) => COMPOSE_PIECES.find((p) => p.id === id).kind !== 'video');
  return (label) => {
    for (const [prefix, value] of Object.entries(overrides)) {
      if (label === prefix || label.startsWith(prefix)) return typeof value === 'function' ? value(label) : value;
    }
    if (label.startsWith('B0:revise:')) return { status: 'ok', errors: [] };
    if (label === 'B1:ingest') return { ok: true, detail: '', placeholders: [], missing: [], pieces: COMPOSE_PIECES };
    if (label === 'B2:picks') return 'picked';
    if (label === 'B3:compose') return { ok: true, detail: '', pieces: templateIds.map((id) => ({ id, status: 'ok' })) };
    if (label.startsWith('B3:')) return { ok: true, detail: '' };
    if (label === 'B4:render') {
      return {
        pieces: ids.map((id) =>
          id === 'P03'
            ? { id, status: 'skipped', outputs: [], reason: 'hyperframes CLI not installed' }
            : { id, status: 'ok', outputs: [`${RUN}/out/${id}/${id}.png`] },
        ),
      };
    }
    if (label === 'B5:review') return { findings: [{ piece: ids[0], severity: 'low', issue: 'tight crop', fix: 'loosen' }] };
    if (label === 'B5:review:sol') return { ok: true, detail: '' };
    if (label === 'B6:fix') return { pieces: [] };
    if (label === 'B7:board') return { ok: true, detail: 'wrote board.html' };
    throw new Error(`unscripted agent ${label}`);
  };
}

// ---------------------------------------------------------------- tests
test('(a) draft seats: A1 fable, A2 opus + haiku via sol.mjs, A3 fable; returns awaiting-midjourney', async () => {
  const { result, calls } = await runWorkflow('draft', draftArgs, draftResponder());
  assert.equal(result.status, 'awaiting-midjourney');
  assert.equal(result.runDir, RUN);
  assert.equal(result.promptsPath, `${RUN}/mj/prompts.md`);
  assert.deepEqual(result.pieces.map((p) => [p.id, p.status, p.sol]), [['P01', 'ok', 'ok'], ['P02', 'ok', 'ok']]);

  assert.equal(byLabel(calls, 'A1:direction')[0].opts.model, 'fable');
  for (const p of DRAFT_PIECES) {
    const opus = byLabel(calls, `A2:opus:${p.id}`);
    const sol = byLabel(calls, `A2:sol:${p.id}`);
    const judge = byLabel(calls, `A3:judge:${p.id}`);
    assert.equal(opus.length, 1);
    assert.equal(opus[0].opts.model, 'opus');
    assert.equal(sol[0].opts.model, 'haiku');
    assert.match(sol[0].prompt, /marketing\/tools\/sol\.mjs/);
    assert.match(sol[0].prompt, new RegExp(`--run ${RUN} --piece ${p.id} --seat sol-draft`));
    assert.equal(judge[0].opts.model, 'fable');
    assert.match(judge[0].prompt, new RegExp(`${p.id}\\.sol\\.md --json > ${RUN}/critique/lint-${p.id}\\.sol\\.json`));
  }
  assert.equal(byLabel(calls, 'A4:cold-read:sol')[0].opts.model, 'haiku');
  assert.match(byLabel(calls, 'A4:cold-read:sol')[0].prompt, /sol-cold-read\.md/);
  assert.equal(byLabel(calls, 'A4:cold-read:apply')[0].opts.model, 'opus');
  assert.match(byLabel(calls, 'A5:art-direction')[0].prompt, /mj-pack\.mjs/);
});

test('(b) a refused content test returns refused and runs no later agents', async () => {
  const { result, calls } = await runWorkflow(
    'draft',
    draftArgs,
    draftResponder({ 'A1:direction': { pass: false, reason: 'reader is a homeowner, not a studio', pieces: [] } }),
  );
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'reader is a homeowner, not a studio');
  assert.deepEqual(calls.map((c) => c.label), ['A0:setup', 'A1:direction']);
});

test('(c) a preflight block returns blocked before direction', async () => {
  const { result, calls } = await runWorkflow(
    'draft',
    draftArgs,
    draftResponder({ 'A0:setup': { date: '2026-10-08', ok: false, reason: 'gateway: unreachable', warnings: [] } }),
  );
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /gateway/);
  assert.deepEqual(calls.map((c) => c.label), ['A0:setup']);
});

test('(d) a Sol failure marks the piece sol unavailable, records it, and does not block the batch', async () => {
  const { result, calls } = await runWorkflow(
    'draft',
    draftArgs,
    draftResponder({
      'A2:sol:P01': { ok: false, detail: 'gateway 502' },
      'A2:sol:P02': new Error('agent died'),
    }),
  );
  assert.equal(result.status, 'awaiting-midjourney');
  assert.deepEqual(result.pieces.map((p) => [p.id, p.status, p.sol]), [['P01', 'ok', 'unavailable'], ['P02', 'ok', 'unavailable']]);
  for (const id of ['P01', 'P02']) {
    const judge = byLabel(calls, `A3:judge:${id}`);
    assert.equal(judge.length, 1, `${id} still judged`);
    assert.match(judge[0].prompt, /appendLedger/);
    assert.match(judge[0].prompt, /"status":"unavailable"/);
    assert.doesNotMatch(judge[0].prompt, new RegExp(`${id}\\.sol\\.md`), 'no lint of a missing Sol draft');
  }
  assert.ok(byLabel(calls, 'A5:art-direction').length === 1, 'pipeline reached art direction');
});

test('compose full run surfaces a skipped video render and rolls up to ready-with-failures', async () => {
  const { result, calls } = await runWorkflow('compose', { run: 'marketing/runs/2026-10-08-first-hire', root: ROOT }, composeResponder());
  assert.equal(result.status, 'ready-with-failures');
  assert.equal(result.board, `${RUN}/board.html`);
  const byId = Object.fromEntries(result.pieces.map((p) => [p.id, p]));
  assert.equal(byId.P01.status, 'rendered');
  assert.deepEqual(byId.P01.outputs, [`${RUN}/out/P01/P01.png`]);
  assert.equal(byId.P03.status, 'render-skipped');
  assert.match(byId.P03.reason, /hyperframes/);
  assert.equal(byLabel(calls, 'B5:review')[0].opts.model, 'fable');
  assert.equal(byLabel(calls, 'B5:review:sol')[0].opts.model, 'haiku');
  assert.match(byLabel(calls, 'B5:review:sol')[0].prompt, /marketing\/tools\/sol\.mjs/);
  assert.equal(byLabel(calls, 'B3:video:P03')[0].opts.model, 'opus');
  assert.match(byLabel(calls, 'B3:video:P03')[0].prompt, /hyperframes-core/);
  assert.equal(byLabel(calls, 'B6:fix')[0].opts.model, 'sonnet');
  assert.equal(byLabel(calls, 'B0:').length, 0, 'no revise without feedback');
});

test('(e) compose with pieces + feedback only touches those pieces', async () => {
  const { result, calls } = await runWorkflow(
    'compose',
    { run: RUN, root: ROOT, pieces: ['P02'], feedback: 'Make the headline warmer.' },
    composeResponder(['P02']),
  );
  assert.equal(result.status, 'ready-for-review');
  assert.deepEqual(result.pieces.map((p) => p.id), ['P02']);
  const revise = byLabel(calls, 'B0:revise:');
  assert.deepEqual(revise.map((c) => c.label), ['B0:revise:P02']);
  assert.match(revise[0].prompt, /Make the headline warmer\./);
  assert.equal(revise[0].opts.model, 'fable');
  for (const c of calls) {
    assert.doesNotMatch(c.label, /P0[13]/, `${c.label} targets another piece`);
    if (c.label === 'B1:ingest' || c.label === 'B7:board') continue; // run-wide by design: ingest lists, board summarizes
    assert.doesNotMatch(c.prompt, /\bP0[13]\b/, `${c.label} mentions another piece`);
  }
  for (const label of ['B3:compose', 'B4:render']) {
    const prompt = byLabel(calls, label)[0].prompt;
    const tool = label === 'B3:compose' ? 'compose' : 'render';
    const uses = prompt.match(new RegExp(`${tool}\\.mjs ${RUN}[^\\n]*`, 'g'));
    assert.ok(uses && uses.length, `${label} runs ${tool}.mjs`);
    for (const u of uses) assert.match(u, /--piece P02$/, `${label}: ${u}`);
  }
});

const renderAll = (status) => ({
  pieces: COMPOSE_PIECES.map((p) => ({ id: p.id, status, outputs: status === 'ok' ? [`${RUN}/out/${p.id}/${p.id}.png`] : [], reason: status === 'ok' ? undefined : 'x' })),
});

test('compose top-level status: every piece rendered → ready-for-review; none → blocked', async () => {
  const all = await runWorkflow('compose', { run: RUN, root: ROOT }, composeResponder(null, { 'B4:render': renderAll('ok') }));
  assert.equal(all.result.status, 'ready-for-review');
  assert.ok(all.result.pieces.every((p) => p.status === 'rendered'));

  const none = await runWorkflow('compose', { run: RUN, root: ROOT }, composeResponder(null, { 'B4:render': renderAll('failed') }));
  assert.equal(none.result.status, 'blocked');
  assert.match(none.result.reason, /no piece rendered/);
  assert.equal(none.result.board, `${RUN}/board.html`);
  assert.ok(none.result.pieces.every((p) => p.status === 'render-failed'));
});

test('compose: a missing lead image is image-missing, never rendered (compose line or ingest missing)', async () => {
  const { result } = await runWorkflow('compose', { run: RUN, root: ROOT }, composeResponder(null, {
    'B1:ingest': { ok: true, detail: '', placeholders: [], missing: ['J02'], pieces: COMPOSE_PIECES },
    'B3:compose': { ok: true, detail: '', pieces: [{ id: 'P01', status: 'image-missing', reason: 'no image for J01' }, { id: 'P02', status: 'ok' }] },
    'B4:render': renderAll('ok'),
  }));
  const byId = Object.fromEntries(result.pieces.map((p) => [p.id, p.status]));
  assert.deepEqual(byId, { P01: 'image-missing', P02: 'image-missing', P03: 'rendered' });
  assert.equal(result.status, 'ready-with-failures');
});

test('compose: a template piece compose.mjs reports failed (or never reports) is compose-failed', async () => {
  const { result } = await runWorkflow('compose', { run: RUN, root: ROOT }, composeResponder(null, {
    'B3:compose': { ok: false, detail: 'compose.mjs: 1 piece(s) failed: P02', pieces: [{ id: 'P02', status: 'failed', reason: 'ENOENT P02.final.md' }] },
    'B4:render': {
      pieces: [
        { id: 'P01', status: 'skipped', outputs: [], reason: 'index.html is missing' },
        { id: 'P02', status: 'skipped', outputs: [], reason: 'index.html is missing' },
        { id: 'P03', status: 'ok', outputs: [`${RUN}/out/P03/P03.mp4`] },
      ],
    },
  }));
  const byId = Object.fromEntries(result.pieces.map((p) => [p.id, p.status]));
  // P01 has no compose line at all: fail closed.
  assert.deepEqual(byId, { P01: 'compose-failed', P02: 'compose-failed', P03: 'rendered' });
  assert.equal(result.status, 'ready-with-failures');
});

test('compose lints video with the pinned CLI and never installs it mid-run', async () => {
  const { calls } = await runWorkflow('compose', { run: RUN, root: ROOT }, composeResponder());
  for (const label of ['B3:video:P03', 'B6:fix']) {
    const prompt = byLabel(calls, label)[0].prompt;
    assert.ok(prompt.includes('npx --no-install hyperframes@0.8.142 lint '), `${label} uses --no-install`);
    assert.match(prompt, /do not install it/);
  }
  assert.doesNotMatch(source('compose'), /npx -y|npx --yes/);
});

test('draft: planValid is required; anything but true blocks before drafting', async () => {
  for (const planValid of [undefined, false, 'true']) {
    const direction = { pass: true, reason: 'ok', planErrors: [], pieces: DRAFT_PIECES };
    if (planValid !== undefined) direction.planValid = planValid;
    const { result, calls } = await runWorkflow('draft', draftArgs, draftResponder({ 'A1:direction': direction }));
    assert.equal(result.status, 'blocked', `planValid=${planValid}`);
    assert.match(result.reason, /plan-check/);
    assert.deepEqual(calls.map((c) => c.label), ['A0:setup', 'A1:direction']);
  }
});

test('draft top-level status: some pieces not ok → with-failures; none ok → blocked', async () => {
  const some = await runWorkflow('draft', draftArgs, draftResponder({
    'A4:cold-read:apply': { pieces: [{ id: 'P01', errors: 0 }, { id: 'P02', errors: 2 }] },
  }));
  assert.equal(some.result.status, 'awaiting-midjourney-with-failures');
  assert.deepEqual(some.result.pieces.map((p) => [p.id, p.status]), [['P01', 'ok'], ['P02', 'lint-failed']]);

  const none = await runWorkflow('draft', draftArgs, draftResponder({
    'A4:cold-read:apply': { pieces: [{ id: 'P01', errors: 1 }, { id: 'P02', errors: 2 }] },
  }));
  assert.equal(none.result.status, 'blocked');
  assert.match(none.result.reason, /no piece/);
});

test('compose: feedback without pieces is refused before any agent runs', async () => {
  const { result, calls } = await runWorkflow('compose', { run: RUN, root: ROOT, feedback: 'warmer' }, composeResponder());
  assert.equal(result.status, 'blocked');
  assert.equal(calls.length, 0);
});

// Collect every prompt both scripts hand out across the scenarios above.
async function allPrompts() {
  const runs = [
    await runWorkflow('draft', draftArgs, draftResponder()),
    await runWorkflow('draft', draftArgs, draftResponder({ 'A2:sol:P01': { ok: false, detail: 'x' }, 'A4:cold-read:sol': { ok: false, detail: 'x' } })),
    await runWorkflow('compose', { run: RUN, root: ROOT }, composeResponder()),
    await runWorkflow('compose', { run: RUN, root: ROOT, pieces: ['P02'], feedback: 'warmer' }, composeResponder(['P02'])),
  ];
  return runs.flatMap((r) => r.calls);
}

const FORBIDDEN = [
  /gmail/i,
  /sanity/i,
  /send_message/i,
  /publish_documents/i,
  /\bbuffer\b/i,
  // Midjourney automation (the human hand-off text is allowed): its site, bot, API or proxies.
  /midjourney\.com|discord|\/imagine|midjourney\s+(api|bot)|useapi|goapi|imagineapi/i,
];

test('(f) no prompt or script text reaches an external send/publish tool or automates Midjourney', async () => {
  for (const name of Object.keys(SCRIPTS)) {
    for (const re of FORBIDDEN) assert.doesNotMatch(source(name), re, `${name} source matches ${re}`);
  }
  for (const c of await allPrompts()) {
    for (const re of FORBIDDEN) assert.doesNotMatch(c.prompt, re, `${c.label} prompt matches ${re}`);
    assert.match(c.prompt, /never send, post, schedule or publish anything/, `${c.label} carries the no-send rule`);
  }
});

test('(g) every path handed to an agent is absolute and under the root', async () => {
  const relative = /(?<![\w.\/~-])(?:\.{1,2}\/)?(?:marketing|docs|\.claude|\.agents|copy|critique|mj|compose|out|flux|approved|canon|tools|templates|prompts|briefs|runs)\/[^\s`'")]*/g;
  const absolute = /(?:^|[\s`'"(=])(\/[^\s`'"),]+)/gm;
  for (const c of await allPrompts()) {
    assert.deepEqual(c.prompt.match(relative) || [], [], `${c.label} hands out a relative path`);
    for (const m of c.prompt.matchAll(absolute)) {
      const p = m[1].replace(/[.:;]+$/, ''); // sentence punctuation after a path
      assert.ok(p === ROOT || p.startsWith(`${ROOT}/`), `${c.label} hands out a path outside the root: ${p}`);
    }
  }
});

test('scripts avoid the clock and randomness Workflow forbids', () => {
  for (const name of Object.keys(SCRIPTS)) {
    assert.doesNotMatch(source(name), /Date\.now\(|Math\.random\(|new Date\(/, name);
  }
});
