import assert from 'node:assert/strict';
import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import test, { mock } from 'node:test';

// src/plates.ts is erasable-only TypeScript with no runtime imports: Node strips
// the types and loads it in place, so coverage maps to the real source lines.
const { handlePlateIngest, routePlates, MAX_SOURCE_BYTES, PROCESSOR_TIMEOUT_MS } = await import('../src/plates.ts');
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
  const res = await h.ingest({ ...valid, sourceKind: 'sheet', focal: [0.4, 0.5], subjectBox: [0.1, 0.1, 0.5, 0.6] });
  assert.equal(res.status, 200);
  const record = await res.json();
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', IMAGE)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const prefix = `plates/${PROJECT}/${sha}`;
  assert.deepEqual(record, {
    sha256: sha,
    width: 3000,
    height: 2000,
    format: 'jpeg',
    ground: 'scene',
    dominantHex: '#806040',
    lqip: 'data:image/webp;base64,AAAA',
    originalKey: `${prefix}/original.jpeg`,
    crops: { piece: { rect: [0, 0, 3000, 2000], widths: [256] } },
  });

  assert.deepEqual(h.jobs[0].job, {
    op: 'plate_ingest',
    sourceKind: 'sheet',
    focal: [0.4, 0.5],
    subjectBox: [0.1, 0.1, 0.5, 0.6],
    skip: [],
  });
  assert.deepEqual(h.jobs[0].bytes, IMAGE);
  const objects = h.env.PLATES.objects;
  assert.deepEqual([...objects.keys()], [
    `${prefix}/piece-256.avif`,
    `${prefix}/piece-256.webp`,
    `${prefix}/original.jpeg`,
    `${prefix}/crops.json`,
  ]);
  assert.equal(objects.get(`${prefix}/piece-256.avif`).contentType, 'image/avif');
  assert.equal(new TextDecoder().decode(objects.get(`${prefix}/piece-256.webp`).body), 'webp-bytes');
  assert.equal(objects.get(`${prefix}/original.jpeg`).contentType, 'image/jpeg');
  assert.deepEqual(objects.get(`${prefix}/original.jpeg`).body, IMAGE);
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
  for (const sourceKind of ['upload', 'concept', 'scan', 'board', 'sheet', 'installed']) {
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
