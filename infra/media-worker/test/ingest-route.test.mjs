import assert from 'node:assert/strict';
import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import test, { mock } from 'node:test';

// src/plates.ts is erasable-only TypeScript with no runtime imports: Node strips
// the types and loads it in place, so coverage maps to the real source lines.
const {
  handlePlateIngest,
  routePlates,
  framingRevision,
  MAX_SOURCE_BYTES,
  PROCESSOR_TIMEOUT_MS,
  PROCESSOR_MARGIN_MS,
  processorBudgetMs,
} = await import('../src/plates.ts');
const { outputJobs, planCrops } = await import('../container/plates.mjs');

// Workers' crypto.subtle.timingSafeEqual (Node lacks it): same contract, recorded.
const compares = [];
Object.defineProperty(crypto.subtle, 'timingSafeEqual', {
  configurable: true,
  value: (a, b) => {
    compares.push([a.byteLength, b.byteLength]);
    return nodeTimingSafeEqual(a, b);
  },
});

const SECRET = 'plate-ingest-test-secret-0123456789';
const STORAGE = 'https://abcdefghijklmnop.supabase.co';
const PROJECT = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b';
const REQUEST = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

function bucket() {
  const objects = new Map();
  return {
    objects,
    async get(key) {
      const o = objects.get(key);
      return o ? { json: async () => JSON.parse(new TextDecoder().decode(o.body)) } : null;
    },
    async head(key) {
      return objects.has(key) ? { key } : null;
    },
    async put(key, value, options) {
      const body = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      objects.set(key, { body, contentType: options?.httpMetadata?.contentType });
    },
  };
}

function processorResult(overrides = {}) {
  return {
    success: true,
    width: 3000,
    height: 2000,
    format: 'jpeg',
    ground: 'scene',
    dominantHex: '#806040',
    lqip: 'data:image/webp;base64,AAAA',
    crops: { piece: { rect: [0, 0, 3000, 2000], widths: [256] } },
    outputs: [
      { key: 'piece-256.avif', contentType: 'image/avif', dataB64: btoa('avif-bytes') },
      { key: 'piece-256.webp', contentType: 'image/webp', dataB64: btoa('webp-bytes') },
    ],
    ...overrides,
  };
}

function harness({ source, processor, secret = SECRET } = {}) {
  const env = { PLATES: bucket(), PLATE_INGEST_SECRET: secret, SUPABASE_STORAGE_ORIGIN: STORAGE };
  const fetches = [];
  const jobs = [];
  const deps = {
    fetchSource: async (url, init) => {
      fetches.push({ url, init });
      return source ? source(init, url) : new Response(IMAGE, { headers: { 'content-type': 'image/jpeg' } });
    },
    processPlate: async (request) => {
      const job = JSON.parse(atob(request.headers.get('x-media-job')));
      jobs.push({ job, bytes: new Uint8Array(await request.arrayBuffer()) });
      return processor ? processor(request, job) : Response.json(processorResult());
    },
  };
  const ingest = (body, authorization = `Bearer ${secret}`) =>
    handlePlateIngest(
      new Request('https://media-worker/plates/ingest', {
        method: 'POST',
        headers: authorization ? { authorization } : {},
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      env,
      deps,
    );
  return { env, fetches, jobs, ingest };
}

const valid = {
  projectId: PROJECT,
  requestId: REQUEST,
  sourceKind: 'upload',
  sourceUrl: `${STORAGE}/storage/v1/object/public/project-item-images/a.jpg`,
};
const hotlink = { ...valid, sourceKind: 'maker', sourceUrl: 'https://cdn.example.com/a.jpg' };

async function expectError(res, status) {
  assert.equal(res.status, status);
  const { error } = await res.json();
  assert.equal(typeof error, 'string');
  assert.ok(error.length > 0 && error.length <= 200);
  return error;
}

test('a missing bearer is rejected before anything is fetched', async () => {
  const h = harness();
  await expectError(await h.ingest(valid, null), 401);
  await expectError(await h.ingest(valid, `Basic ${SECRET}`), 401);
  assert.equal(h.fetches.length, 0);
});

test('a wrong-length bearer is rejected after one equal-length dummy compare', async () => {
  const h = harness();
  compares.length = 0;
  await expectError(await h.ingest(valid, 'Bearer short'), 401);
  assert.deepEqual(compares, [[SECRET.length, SECRET.length]]);
  assert.equal(h.fetches.length, 0);
});

test('a same-length wrong bearer is rejected by the timing-safe compare', async () => {
  const h = harness();
  compares.length = 0;
  const wrong = `x${SECRET.slice(1)}`;
  await expectError(await h.ingest(valid, `Bearer ${wrong}`), 401);
  assert.deepEqual(compares, [[SECRET.length, SECRET.length]]);
  assert.equal(h.fetches.length, 0);
});

test('an unset secret rejects every request', async () => {
  const h = harness({ secret: '' });
  await expectError(await h.ingest(valid, 'Bearer '), 401);
  await expectError(await h.ingest(valid, 'Bearer anything'), 401);
});

test('body validation: uuids, source kind, url, focal and subject box', async () => {
  const h = harness();
  const bad = [
    'not json',
    [1, 2],
    { ...valid, projectId: 'project-1' },
    { ...valid, requestId: undefined },
    { ...valid, sourceKind: 'catalogue' },
    { ...valid, sourceUrl: 'cdn.example.com/a.jpg' },
    { ...valid, sourceUrl: 'file:///etc/passwd' },
    { ...valid, sourceUrl: 42 },
    { ...valid, focal: [0.5] },
    { ...valid, focal: [1.2, 0.5] },
    { ...valid, subjectBox: [0.5, 0.5, 0.6, 0.2] },
    { ...valid, subjectBox: [0.1, 0.1, 0, 0.2] },
  ];
  for (const body of bad) {
    await expectError(await h.ingest(body), 400);
  }
  assert.equal(h.fetches.length, 0);
});

test('a non-image content type is rejected and never processed', async () => {
  let cancelled = false;
  const h = harness({
    source: () =>
      new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
  });
  assert.match(await expectError(await h.ingest(valid), 415), /image/);
  assert.equal(cancelled, true);
  assert.equal(h.jobs.length, 0);
  assert.equal(h.fetches[0].init.headers.Accept, 'image/*');
});

test('a declared size over 20 MB is rejected without reading the body', async () => {
  const h = harness({
    source: () =>
      new Response(new ReadableStream(), {
        headers: { 'content-type': 'image/jpeg', 'content-length': String(MAX_SOURCE_BYTES + 1) },
      }),
  });
  await expectError(await h.ingest(valid), 413);
  assert.equal(h.jobs.length, 0);
});

test('a streamed body over 20 MB is cut off and the stream cancelled', async () => {
  let pulls = 0;
  let cancelled = false;
  const chunk = new Uint8Array(1024 * 1024);
  const h = harness({
    source: () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulls++;
            controller.enqueue(chunk);
          },
          cancel: () => void (cancelled = true),
        }),
        { headers: { 'content-type': 'image/png' } },
      ),
  });
  await expectError(await h.ingest(valid), 413);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 23, `read ${pulls} MB before stopping`);
  assert.equal(h.jobs.length, 0);
  assert.equal(h.env.PLATES.objects.size, 0);
});

test('an upstream error status is a 502', async () => {
  const h = harness({ source: () => new Response('gone', { status: 404, headers: { 'content-type': 'text/plain' } }) });
  await expectError(await h.ingest(valid), 502);
});

test('a source that does not answer within 10 s is aborted with a 504', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let started;
    const fetching = new Promise((resolve) => (started = resolve));
    const h = harness({
      source: (init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          started();
        }),
    });
    const pending = h.ingest(valid);
    let settled = false;
    pending.then(() => (settled = true));
    await fetching;
    mock.timers.tick(9_999);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    mock.timers.tick(1);
    await expectError(await pending, 504);
  } finally {
    mock.timers.reset();
  }
});

test('ingest writes every output, the original and crops.json, and returns the plate record', async () => {
  const h = harness();
  // A still clock: the job leaves the moment the Worker's 25 s starts.
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let res;
  try {
    res = await h.ingest({ ...valid, sourceKind: 'sheet', focal: [0.4, 0.5], subjectBox: [0.1, 0.1, 0.5, 0.6] });
  } finally {
    mock.timers.reset();
  }
  assert.equal(res.status, 200);
  const record = await res.json();
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', IMAGE)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const base = `plates/${PROJECT}/${sha}`;
  // A framed ingest lands under its framing's own prefix and names it on every crop.
  const rev = framingRevision([0.4, 0.5], [0.1, 0.1, 0.5, 0.6]);
  const prefix = `${base}/f/${rev}`;
  assert.deepEqual(record, {
    sha256: sha,
    width: 3000,
    height: 2000,
    format: 'jpeg',
    ground: 'scene',
    dominantHex: '#806040',
    lqip: 'data:image/webp;base64,AAAA',
    originalKey: `${base}/original.jpeg`,
    crops: { piece: { rect: [0, 0, 3000, 2000], widths: [256], rev } },
  });

  assert.deepEqual(h.jobs[0].job, {
    op: 'plate_ingest',
    sourceKind: 'sheet',
    focal: [0.4, 0.5],
    subjectBox: [0.1, 0.1, 0.5, 0.6],
    skip: [],
    budgetMs: PROCESSOR_TIMEOUT_MS - PROCESSOR_MARGIN_MS,
  });
  assert.deepEqual(h.jobs[0].bytes, IMAGE);
  const objects = h.env.PLATES.objects;
  assert.deepEqual([...objects.keys()], [
    `${prefix}/piece-256.avif`,
    `${prefix}/piece-256.webp`,
    `${base}/original.jpeg`,
    `${prefix}/crops.json`,
  ]);
  assert.equal(objects.get(`${prefix}/piece-256.avif`).contentType, 'image/avif');
  assert.equal(new TextDecoder().decode(objects.get(`${prefix}/piece-256.webp`).body), 'webp-bytes');
  assert.equal(objects.get(`${base}/original.jpeg`).contentType, 'image/jpeg');
  assert.deepEqual(objects.get(`${base}/original.jpeg`).body, IMAGE);
  assert.equal(objects.get(`${prefix}/crops.json`).contentType, 'application/json');
});

test('re-ingesting the same bytes returns the stored crops without reprocessing', async () => {
  const h = harness();
  const first = await (await h.ingest(valid)).json();
  const again = await h.ingest({ ...valid, requestId: '1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' });
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), first);
  assert.equal(h.jobs.length, 1);
  // A new focal point (designer drag) is new crops: process again.
  await h.ingest({ ...valid, focal: [0.3, 0.4] });
  assert.equal(h.jobs.length, 2);
});

test('only POST /plates/ingest reaches the ingest handler', async () => {
  const h = harness();
  const deps = { fetchSource: async () => assert.fail('fetched'), processPlate: async () => assert.fail('processed') };
  for (const [method, path] of [['GET', '/plates/ingest'], ['POST', '/plates'], ['POST', '/nope']]) {
    const res = await routePlates(new Request(`https://media-worker${path}`, { method }), h.env, deps);
    assert.equal(res.status, 404);
  }
  const unauthorised = await routePlates(
    new Request('https://media-worker/plates/ingest', { method: 'POST', body: '{}' }),
    h.env,
    deps,
  );
  assert.equal(unauthorised.status, 401);
});

test('a failed source fetch, empty source or failing bucket is a JSON error', async () => {
  const refused = harness({ source: () => Promise.reject(new Error('connection refused')) });
  assert.equal(await expectError(await refused.ingest(valid), 502), 'source fetch failed');

  const empty = harness({ source: () => new Response(new Uint8Array(0), { headers: { 'content-type': 'image/png' } }) });
  await expectError(await empty.ingest(valid), 422);

  const bodiless = harness({ source: () => new Response(null, { headers: { 'content-type': 'image/png' } }) });
  await expectError(await bodiless.ingest(valid), 502);

  const broken = harness({
    source: () =>
      new Response(new ReadableStream({ pull: (c) => c.error(new Error('reset')) }), {
        headers: { 'content-type': 'image/png' },
      }),
  });
  assert.equal(await expectError(await broken.ingest(valid), 502), 'source fetch failed');

  const h = harness();
  h.env.PLATES.put = async () => {
    throw new Error('bucket unavailable');
  };
  assert.match(await expectError(await h.ingest(valid), 500), /bucket unavailable/);

  const odd = harness({ processor: () => Response.json(processorResult({ format: 'Not A Format' })) });
  const record = await (await odd.ingest(valid)).json();
  assert.match(record.originalKey, /\/original\.bin$/);
});

test('a processor failure or unexpected output name writes nothing', async () => {
  const failing = harness({ processor: () => Response.json({ success: false, error: 'bad input' }, { status: 422 }) });
  assert.match(await expectError(await failing.ingest(valid), 502), /bad input/);
  assert.equal(failing.env.PLATES.objects.size, 0);

  const sneaky = harness({
    processor: () =>
      Response.json(processorResult({ outputs: [{ key: '../crops.json', contentType: 'image/avif', dataB64: 'AA==' }] })),
  });
  await expectError(await sneaky.ingest(valid), 502);
  assert.equal(sneaky.env.PLATES.objects.size, 0);
});

// ---- source origin policy (F3) ---------------------------------------------

const redirect = (location, status = 302) => new Response(null, { status, headers: location ? { location } : {} });
const image = () => new Response(IMAGE, { headers: { 'content-type': 'image/jpeg' } });

test('a plain http source is refused before anything is fetched', async () => {
  const h = harness();
  for (const sourceUrl of [`http://abcdefghijklmnop.supabase.co/a.jpg`, 'http://cdn.example.com/a.jpg']) {
    assert.match(await expectError(await h.ingest({ ...hotlink, sourceUrl }), 400), /https/);
  }
  assert.equal(h.fetches.length, 0);
});

test('a hotlink may be any public https host, never an IP, local name, worker or Patina host', async () => {
  const h = harness();
  const refused = [
    'https://203.0.113.7/a.jpg',
    'https://2130706433/a.jpg', // 127.0.0.1 written as one number
    'https://0x7f.1/a.jpg',
    'https://[::1]/a.jpg',
    'https://[fd00::5]/a.jpg',
    'https://localhost/a.jpg',
    'https://localhost./a.jpg',
    'https://intranet/a.jpg',
    'https://printer.local/a.jpg',
    'https://metadata.google.internal/a.jpg',
    'https://patina-media-worker.kody.workers.dev/a.jpg',
    'https://patina.cloud/a.jpg',
    'https://client.patina.cloud/a.jpg',
    'https://user:secret@cdn.example.com/a.jpg',
  ];
  for (const sourceUrl of refused) {
    const error = await expectError(await h.ingest({ ...hotlink, sourceUrl }), 403);
    assert.match(error, /hotlink|credentials/, sourceUrl);
  }
  assert.equal(h.fetches.length, 0);
  // An outside retailer host (and one that merely contains a refused word) is fine.
  for (const sourceUrl of ['https://images.hermanmiller.com/a.jpg', 'https://local-maker.example/a.jpg']) {
    assert.equal((await h.ingest({ ...hotlink, sourceUrl })).status, 200, sourceUrl);
  }
});

test('a private source must come from the Supabase storage origin', async () => {
  const h = harness();
  for (const sourceKind of ['upload', 'concept', 'scan', 'sheet', 'installed']) {
    for (const sourceUrl of [
      'https://cdn.example.com/a.jpg',
      'https://abcdefghijklmnop.supabase.co.evil.example/a.jpg',
      'https://abcdefghijklmnop.supabase.co:8443/a.jpg',
      'https://other-project.supabase.co/a.jpg',
    ]) {
      assert.match(await expectError(await h.ingest({ ...valid, sourceKind, sourceUrl }), 403), /storage origin/);
    }
  }
  assert.equal(h.fetches.length, 0);
  const signed = `${STORAGE}/storage/v1/object/sign/room-renders/r/1.png?token=t`;
  assert.equal((await h.ingest({ ...valid, sourceKind: 'concept', sourceUrl: signed })).status, 200);
  assert.equal(h.fetches[0].url, signed);
});

test('with SUPABASE_STORAGE_ORIGIN unset every private source is refused, hotlinks still pass', async () => {
  for (const storage of ['', undefined, 'not a url', 'http://abcdefghijklmnop.supabase.co']) {
    const h = harness();
    h.env.SUPABASE_STORAGE_ORIGIN = storage;
    assert.match(await expectError(await h.ingest(valid), 403), /SUPABASE_STORAGE_ORIGIN/);
    assert.equal(h.fetches.length, 0);
    assert.equal((await h.ingest(hotlink)).status, 200);
  }
});

test('every fetch is manual-redirect with no credentials, and a 2-hop public redirect is followed', async () => {
  const h = harness({
    source: (_, url) =>
      ({
        'https://shop.example.com/a.jpg': () => redirect('https://cdn.example.net/b.jpg', 301),
        'https://cdn.example.net/b.jpg': () => redirect('/img/c.jpg', 307),
        'https://cdn.example.net/img/c.jpg': image,
      })[url](),
  });
  const res = await h.ingest({ ...hotlink, sourceUrl: 'https://shop.example.com/a.jpg' });
  assert.equal(res.status, 200);
  assert.deepEqual(
    h.fetches.map((f) => f.url),
    ['https://shop.example.com/a.jpg', 'https://cdn.example.net/b.jpg', 'https://cdn.example.net/img/c.jpg'],
  );
  for (const { init } of h.fetches) {
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(init.headers, { Accept: 'image/*' });
    assert.equal(init.credentials, undefined);
  }
  assert.equal(h.jobs.length, 1);
});

test('a redirect to a refused host or off the storage origin fails before it is fetched', async () => {
  const cases = [
    [hotlink, 'https://10.0.0.5/a.jpg', /IP address/],
    [hotlink, 'https://metadata.internal/a.jpg', /internal/],
    [hotlink, 'http://cdn.example.net/a.jpg', /https/],
    [hotlink, 'https://user:pw@cdn.example.net/a.jpg', /credentials/],
    [valid, 'https://cdn.example.com/a.jpg', /storage origin/],
  ];
  for (const [body, location, message] of cases) {
    let cancelled = false;
    const h = harness({
      source: (_, url) =>
        url === body.sourceUrl
          ? new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), {
              status: 302,
              headers: { location },
            })
          : assert.fail(`fetched ${url}`),
    });
    assert.match(await expectError(await h.ingest(body), 403), message, location);
    assert.equal(h.fetches.length, 1);
    assert.equal(cancelled, true);
    assert.equal(h.jobs.length, 0);
  }
});

test('more than three redirects, or a redirect with no Location, is a 502', async () => {
  let n = 0;
  const looping = harness({ source: () => redirect(`https://cdn.example.com/${++n}.jpg`) });
  assert.match(await expectError(await looping.ingest(hotlink), 502), /more than 3/);
  assert.equal(looping.fetches.length, 4);
  const blank = harness({ source: () => redirect(null) });
  assert.match(await expectError(await blank.ingest(hotlink), 502), /no Location/);
  const garbled = harness({ source: () => redirect('https://bad host/a.jpg') });
  assert.match(await expectError(await garbled.ingest(hotlink), 502), /Location is not a URL/);
});

// ---- idempotency keyed on the crops a source kind needs (F2) ---------------

test('the same bytes as maker then board: board adds only its crop, the manifest keeps the union', async () => {
  // The container's own planner stands in for Sharp: a 2400x1800 scene.
  const h = harness({
    processor: (_, job) => {
      const crops = planCrops({ width: 2400, height: 1800, ground: 'scene', ...job });
      const outputs = outputJobs(crops).map((o) => ({ key: o.key, contentType: o.contentType, dataB64: btoa(o.key) }));
      return Response.json(processorResult({ width: 2400, height: 1800, crops, outputs }));
    },
  });
  const maker = await (await h.ingest(hotlink)).json();
  const shared = ['wide', 'cover_phone', 'wide32', 'pair', 'piece'];
  assert.deepEqual(Object.keys(maker.crops), shared);

  const board = await (await h.ingest({ ...hotlink, requestId: '2a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', sourceKind: 'board', sourceUrl: valid.sourceUrl })).json();
  assert.equal(h.jobs.length, 2);
  assert.deepEqual(h.jobs[1].job.skip, shared);
  assert.deepEqual(Object.keys(board.crops), [...shared, 'board']);
  assert.deepEqual(board.crops.board, { rect: [0, 0, 2400, 1800], widths: [768, 1024, 1600, 2048] });
  for (const key of shared) assert.deepEqual(board.crops[key], maker.crops[key], key);
  assert.equal(board.originalKey, maker.originalKey);
  const prefix = maker.originalKey.replace(/\/original\.jpeg$/, '');
  assert.ok(h.env.PLATES.objects.has(`${prefix}/board-2048.avif`));
  const manifest = JSON.parse(new TextDecoder().decode(h.env.PLATES.objects.get(`${prefix}/crops.json`).body));
  assert.deepEqual(manifest.sourceKinds, ['maker', 'board']);
  assert.deepEqual(Object.keys(manifest.crops), [...shared, 'board']);

  // A third ingest as maker (and a repeat as board) is a no-op returning the union.
  assert.deepEqual(await (await h.ingest(hotlink)).json(), board);
  assert.deepEqual(await (await h.ingest({ ...hotlink, sourceKind: 'board', sourceUrl: valid.sourceUrl })).json(), board);
  assert.equal(h.jobs.length, 2);
});

// ---- framing-versioned renditions (SQ-1727 F1) -----------------------------

test('framingRevision: 16 hex of FNV-1a 64 over [focal, subjectBox], shared with the client route', () => {
  // The same vectors pin apps/client-portal/src/lib/plates.ts framingRevision.
  assert.equal(framingRevision(null, null), '7272b34ce903217b');
  assert.equal(framingRevision([0.4, 0.5], null), '234dc778349cc289');
  assert.equal(framingRevision([0.4, 0.5], [0.1, 0.1, 0.5, 0.6]), '2ceb50ab64e60e27');
  assert.equal(framingRevision([0.3, 0.4], null), 'f443ad36e2b82d43');
  assert.equal(framingRevision(null, [0, 0, 1, 1]), 'ea45f831d5fcaff0');
});

// The container's planner on a 2400x1800 scene; each rendition's bytes carry
// its crop rectangle, so two framings that crop differently write different bytes.
function framedHarness() {
  return harness({
    processor: (_, job) => {
      const crops = planCrops({ width: 2400, height: 1800, ground: 'scene', ...job });
      const outputs = outputJobs(crops).map((o) => ({
        key: o.key,
        contentType: o.contentType,
        dataB64: btoa(`${o.key}@${o.rect.join(',')}`),
      }));
      return Response.json(processorResult({ width: 2400, height: 1800, crops, outputs }));
    },
  });
}

const BASE = `plates/${PROJECT}/${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', IMAGE)), (b) =>
  b.toString(16).padStart(2, '0'),
).join('')}`;
const FRAMING_A = { focal: [0.2, 0.2], subjectBox: null };
const FRAMING_B = { focal: [0.8, 0.8], subjectBox: [0.5, 0.5, 0.4, 0.4] };
const request = (n) => `${n}a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`;

/** key → bytes for every object under `prefix/`; the unversioned prefix excludes f/. */
function snapshot(objects, prefix) {
  const unversioned = prefix === BASE;
  return new Map(
    [...objects]
      .filter(([key]) => key.startsWith(`${prefix}/`) && !(unversioned && key.startsWith(`${BASE}/f/`)))
      .map(([key, o]) => [key, Buffer.from(o.body).toString('base64')]),
  );
}

const crop = (key) => `${key}-1280.avif`;

/** The keys a reader builds from a plate record (the client route's mapping of crop.rev). */
function readerKeys(record) {
  return Object.entries(record.crops).flatMap(([key, { widths, rev }]) =>
    widths.flatMap((w) => ['avif', 'webp'].map((f) => `${rev ? `${BASE}/f/${rev}` : BASE}/${key}-${w}.${f}`)),
  );
}

function bytesAt(objects, keys) {
  return new Map(keys.map((key) => [key, objects.has(key) ? Buffer.from(objects.get(key).body).toString('base64') : null]));
}

test('(a) framing A then framing B of the same bytes: A stays byte-identical, B lands at its own keys', async () => {
  const h = framedHarness();
  const a = await (await h.ingest({ ...valid, requestId: request(1), ...FRAMING_A })).json();
  const aKeys = readerKeys(a);
  const before = bytesAt(h.env.PLATES.objects, aKeys);
  assert.ok(before.size > 0 && [...before.values()].every((bytes) => bytes !== null));

  const b = await (await h.ingest({ ...valid, requestId: request(2), ...FRAMING_B })).json();
  assert.equal(h.jobs.length, 2);
  // Every URL A's record builds still reads the bytes rendered for A.
  assert.deepEqual(bytesAt(h.env.PLATES.objects, aKeys), before);
  // B's record builds keys of its own, and the framings crop differently.
  const bKeys = readerKeys(b);
  for (const key of bKeys) assert.ok(!aKeys.includes(key), key);
  const bWide = bytesAt(h.env.PLATES.objects, bKeys).get(`${BASE}/f/${b.crops.wide.rev}/${crop('wide')}`);
  assert.ok(bWide);
  assert.notEqual(bWide, before.get(`${BASE}/f/${a.crops.wide.rev}/${crop('wide')}`));

  const revA = framingRevision(FRAMING_A.focal, FRAMING_A.subjectBox);
  const revB = framingRevision(FRAMING_B.focal, FRAMING_B.subjectBox);
  assert.ok(Object.values(a.crops).every((c) => c.rev === revA));
  assert.ok(Object.values(b.crops).every((c) => c.rev === revB));
  assert.equal(a.originalKey, `${BASE}/original.jpeg`);
  assert.equal(b.originalKey, a.originalKey);
  // Nothing framed touches the unversioned prefix but the shared original.
  assert.deepEqual([...snapshot(h.env.PLATES.objects, BASE).keys()], [`${BASE}/original.jpeg`]);
});

test('(b) a first copy with null framing after a framed copy does not change the framed keys', async () => {
  const h = framedHarness();
  const b = await (await h.ingest({ ...valid, requestId: request(1), ...FRAMING_B })).json();
  const revB = framingRevision(FRAMING_B.focal, FRAMING_B.subjectBox);
  const bKeys = readerKeys(b);
  const read = bytesAt(h.env.PLATES.objects, bKeys);
  const framed = snapshot(h.env.PLATES.objects, `${BASE}/f/${revB}`);

  const first = await (await h.ingest({ ...valid, requestId: request(2) })).json();
  assert.equal(h.jobs.length, 2);
  assert.deepEqual(h.jobs[1].job.focal, null);
  // Every URL the framed record builds still reads the framed bytes, and its prefix is untouched.
  assert.deepEqual(bytesAt(h.env.PLATES.objects, bKeys), read);
  assert.deepEqual(snapshot(h.env.PLATES.objects, `${BASE}/f/${revB}`), framed);
  assert.ok(framed.size > 0);
  // Null framing takes the unversioned prefix, which held no other framing; its crops name no rev.
  assert.ok(h.env.PLATES.objects.has(`${BASE}/${crop('wide')}`));
  assert.ok(Object.values(first.crops).every((c) => c.rev === undefined));
});

test('(c) a framed copy after a legacy null-framing copy leaves the legacy objects intact', async () => {
  const h = framedHarness();
  await h.ingest({ ...valid, requestId: request(1) });
  const legacy = snapshot(h.env.PLATES.objects, BASE);
  assert.ok(legacy.has(`${BASE}/${crop('wide')}`) && legacy.has(`${BASE}/crops.json`) && legacy.has(`${BASE}/original.jpeg`));

  const framed = await (await h.ingest({ ...valid, requestId: request(2), ...FRAMING_A })).json();
  assert.equal(h.jobs.length, 2);
  assert.deepEqual(snapshot(h.env.PLATES.objects, BASE), legacy);
  const revA = framingRevision(FRAMING_A.focal, FRAMING_A.subjectBox);
  assert.ok(h.env.PLATES.objects.has(`${BASE}/f/${revA}/${crop('wide')}`));
  assert.equal(framed.crops.wide.rev, revA);
});

test('null framing never overwrites a framing a Phase 2 re-crop left at the unversioned prefix', async () => {
  const h = framedHarness();
  const old = { focal: [0.6, 0.4], subjectBox: null, crops: { wide: { rect: [0, 0, 2400, 1500], widths: [1280] } } };
  await h.env.PLATES.put(`${BASE}/crops.json`, JSON.stringify(old));
  await h.env.PLATES.put(`${BASE}/${crop('wide')}`, new TextEncoder().encode('phase-2-wide'));
  const legacy = snapshot(h.env.PLATES.objects, BASE);

  const record = await (await h.ingest({ ...valid, requestId: request(1) })).json();
  const rev0 = framingRevision(null, null);
  assert.deepEqual(snapshot(h.env.PLATES.objects, BASE), new Map([...legacy, [`${BASE}/original.jpeg`, Buffer.from(IMAGE).toString('base64')]]));
  assert.ok(h.env.PLATES.objects.has(`${BASE}/f/${rev0}/${crop('wide')}`));
  assert.equal(record.crops.wide.rev, rev0);
});

test('a revision held by another framing, or an unreadable manifest there, fails and writes nothing', async () => {
  const revA = framingRevision(FRAMING_A.focal, FRAMING_A.subjectBox);
  for (const manifest of [JSON.stringify({ focal: [0.9, 0.9], subjectBox: null, crops: {} }), 'not json']) {
    const h = framedHarness();
    await h.env.PLATES.put(`${BASE}/f/${revA}/crops.json`, manifest);
    const keys = [...h.env.PLATES.objects.keys()];
    assert.match(await expectError(await h.ingest({ ...valid, ...FRAMING_A }), 409), /already holds another framing/);
    assert.equal(h.jobs.length, 0);
    assert.deepEqual([...h.env.PLATES.objects.keys()], keys);
  }
});

test('a crop the manifest already holds is never rewritten, even if the processor sends it again', async () => {
  const h = harness({
    processor: (_, job) =>
      Response.json(processorResult({
        crops: { piece: { rect: [0, 0, 3000, 2000], widths: [256] }, ...(job.skip.length ? { board: { rect: [0, 0, 3000, 2000], widths: [768] } } : {}) },
        outputs: [
          { key: 'piece-256.webp', contentType: 'image/webp', dataB64: btoa(`piece-${h.jobs.length}`) },
          ...(job.skip.length ? [{ key: 'board-768.webp', contentType: 'image/webp', dataB64: btoa('board') }] : []),
        ],
      })),
  });
  await h.ingest({ ...valid, ...FRAMING_A, sourceKind: 'maker', sourceUrl: hotlink.sourceUrl });
  const rev = framingRevision(FRAMING_A.focal, FRAMING_A.subjectBox);
  const record = await (await h.ingest({ ...valid, ...FRAMING_A, sourceKind: 'board' })).json();
  assert.equal(new TextDecoder().decode(h.env.PLATES.objects.get(`${BASE}/f/${rev}/piece-256.webp`).body), 'piece-1');
  assert.ok(h.env.PLATES.objects.has(`${BASE}/f/${rev}/board-768.webp`));
  assert.deepEqual(record.crops.board, { rect: [0, 0, 3000, 2000], widths: [768], rev });
});

// ---- processor deadline (F6) ------------------------------------------------

test('a processor that stalls is abandoned at 25 s with a 504 and sees the abort', async () => {
  const stalls = {
    'no answer': () => new Promise(() => {}),
    'answer with a body that never ends': () => new Response(new ReadableStream(), { status: 200 }),
  };
  for (const [name, stall] of Object.entries(stalls)) {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      let called;
      const calling = new Promise((resolve) => (called = resolve));
      let cancelled = false;
      const h = harness({
        processor: (request) => {
          request.signal.addEventListener('abort', () => (cancelled = true));
          called();
          return stall();
        },
      });
      const pending = h.ingest(valid);
      let settled = false;
      pending.then(() => (settled = true));
      await calling;
      mock.timers.tick(PROCESSOR_TIMEOUT_MS - 1);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, false, name);
      assert.equal(cancelled, false, name);
      mock.timers.tick(1);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, true, `${name}: no answer at the deadline`);
      assert.match(await expectError(await pending, 504), /processor did not finish within 25 s/, name);
      assert.equal(cancelled, true, name);
      assert.equal(h.env.PLATES.objects.size, 0, name);
    } finally {
      mock.timers.reset();
    }
  }
});

test('the container gets what is left of the 25 s less a 1 s margin, never less than 1 ms', () => {
  const deadlineAt = 1_000_000 + PROCESSOR_TIMEOUT_MS;
  assert.equal(processorBudgetMs(deadlineAt, 1_000_000), 24_000);
  assert.equal(processorBudgetMs(deadlineAt, deadlineAt - 10_000), 9_000);
  assert.equal(processorBudgetMs(deadlineAt, deadlineAt - 1_000), 1);
  assert.equal(processorBudgetMs(deadlineAt, deadlineAt + 5), 1);
});

test('a busy container is a 503 busy and a job it killed at its deadline is a 504; nothing is written', async () => {
  const answers = [
    [Response.json({ error: 'busy' }, { status: 503 }), 503, /^busy$/],
    [Response.json({ success: false, error: 'job deadline of 24000 ms passed' }, { status: 504 }), 504, /processor did not finish within 25 s/],
    [Response.json({ success: false, error: 'client disconnected' }, { status: 504 }), 504, /processor did not finish within 25 s/],
    [Response.json({ error: 'overloaded' }, { status: 503 }), 502, /processor failed: overloaded/],
  ];
  for (const [answer, status, message] of answers) {
    const h = harness({ processor: () => answer });
    assert.match(await expectError(await h.ingest(valid), status), message);
    assert.equal(h.env.PLATES.objects.size, 0);
  }
});

// Public board covers are queued as-is by client-plate-copy, not signed storage URLs.
const publicBoard = { ...valid, sourceKind: 'board', sourceUrl: 'https://img.test/us49-board-cover.jpg' };

test('a queue-shaped public board cover reaches fetch without credentials and keeps board crops', async () => {
  const h = harness({
    processor: (_, job) => {
      const crops = planCrops({ width: 2400, height: 1800, ground: 'scene', ...job });
      const outputs = outputJobs(crops).map((o) => ({ key: o.key, contentType: o.contentType, dataB64: btoa(o.key) }));
      return Response.json(processorResult({ width: 2400, height: 1800, crops, outputs }));
    },
  });
  const res = await h.ingest(publicBoard);
  assert.equal(res.status, 200);
  assert.equal(h.fetches[0].url, publicBoard.sourceUrl);
  assert.deepEqual(h.fetches[0].init.headers, { Accept: 'image/*' });
  assert.equal(h.fetches[0].init.credentials, undefined);
  assert.equal(h.fetches[0].init.redirect, 'manual');
  assert.equal(h.jobs[0].job.sourceKind, 'board');
  assert.ok((await res.json()).crops.board);
});

test('storage-origin board and maker sources stay pinned through redirects', async () => {
  for (const sourceKind of ['board', 'maker']) {
    const signed = STORAGE + '/storage/v1/object/sign/proposal-mood-boards/p/cover.jpg?token=t';
    const sameOrigin = STORAGE + '/storage/v1/object/sign/proposal-mood-boards/p/next.jpg?token=t';
    const h = harness({ source: (_, url) => url === signed ? redirect(sameOrigin) : image() });
    const body = { ...valid, sourceKind, sourceUrl: signed };
    assert.equal((await h.ingest(body)).status, 200);
    assert.deepEqual(h.fetches.map((f) => f.url), [signed, sameOrigin]);
    const rejected = harness({ source: () => redirect(publicBoard.sourceUrl) });
    assert.match(await expectError(await rejected.ingest(body), 403), /storage origin/);
    assert.equal(rejected.fetches.length, 1);
    assert.equal(rejected.jobs.length, 0);
  }
});

test('public board covers refuse HTTP, IP literals, credentials and forbidden hosts before fetch', async () => {
  const h = harness();
  await expectError(await h.ingest({ ...publicBoard, sourceUrl: 'http://img.test/cover.jpg' }), 400);
  for (const sourceUrl of [
    'https://203.0.113.7/cover.jpg', 'https://2130706433/cover.jpg', 'https://[::1]/cover.jpg',
    'https://user:pw@img.test/cover.jpg', 'https://localhost/cover.jpg',
    'https://metadata.internal/cover.jpg', 'https://printer.local/cover.jpg',
    'https://media.workers.dev/cover.jpg', 'https://client.patina.cloud/cover.jpg',
  ]) {
    assert.match(await expectError(await h.ingest({ ...publicBoard, sourceUrl }), 403), /hotlink|credentials/);
  }
  assert.equal(h.fetches.length, 0);
});

test('public board redirects follow validated hops manually without credentials', async () => {
  const destination = 'https://cdn.example.net/cover.jpg';
  const h = harness({ source: (_, url) => url === publicBoard.sourceUrl ? redirect(destination) : image() });
  assert.equal((await h.ingest(publicBoard)).status, 200);
  assert.deepEqual(h.fetches.map((f) => f.url), [publicBoard.sourceUrl, destination]);
  for (const { init } of h.fetches) {
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(init.headers, { Accept: 'image/*' });
    assert.equal(init.credentials, undefined);
  }
});

test('public board redirect targets are validated before fetch and retain the hop limit', async () => {
  for (const location of [
    'http://img.test/cover.jpg', 'https://10.0.0.5/cover.jpg',
    'https://user:pw@img.test/cover.jpg', 'https://metadata.internal/cover.jpg',
  ]) {
    const h = harness({ source: () => redirect(location) });
    assert.match(await expectError(await h.ingest(publicBoard), 403), /https|IP address|credentials|internal/);
    assert.equal(h.fetches.length, 1);
    assert.equal(h.jobs.length, 0);
  }
  const looping = harness({ source: () => redirect(publicBoard.sourceUrl) });
  assert.match(await expectError(await looping.ingest(publicBoard), 502), /more than 3/);
  assert.equal(looping.fetches.length, 4);
});
