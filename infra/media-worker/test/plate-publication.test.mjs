// Framing-versioned publication on genuine encoded bytes (SQ-1731 F3). The
// Worker's ingest (src/plates.ts) runs against container/server.mjs, started as
// its own process as in the image, so every rendition is a real Sharp AVIF or
// WebP encode; R2 is an in-memory bucket. Needs the container's dependencies;
// `npm test` runs `npm ci` in container/ when sharp is missing.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const { handlePlateIngest, framingRevision } = await import('../src/plates.ts');
const sharp = createRequire(new URL('../container/package.json', import.meta.url))('sharp');
const SERVER = fileURLToPath(new URL('../container/server.mjs', import.meta.url));

// Workers' crypto.subtle.timingSafeEqual; Node lacks it.
Object.defineProperty(crypto.subtle, 'timingSafeEqual', { configurable: true, value: timingSafeEqual });

const SECRET = 'plate-publication-test-secret-0123';
const PROJECT = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b';
const FRAMING_A = { focal: [0.2, 0.5], subjectBox: null };
const FRAMING_B = { focal: [0.8, 0.5], subjectBox: null };
// A scene that fills the wide floor exactly: a framing moves cover_phone,
// wide32 and pair; wide and piece are the whole frame under any framing.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#2d4a3e"/><stop offset="1" stop-color="#d9c7a3"/></linearGradient></defs>
  <rect width="1600" height="1000" fill="url(#g)"/>
  <circle cx="320" cy="500" r="220" fill="#8a3b2e"/>
  <rect x="1050" y="250" width="380" height="520" fill="#1f2a44"/>
</svg>`;

let server;
let port;
let source;

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port: free } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return free;
}

before(async () => {
  source = await sharp(Buffer.from(SVG)).jpeg({ quality: 88 }).toBuffer();
  port = await freePort();
  // One libvips thread and one threadpool thread, like the 1-vCPU container.
  const env = { ...process.env, PORT: String(port), UV_THREADPOOL_SIZE: '1', VIPS_CONCURRENCY: '1' };
  server = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.once('exit', (code) => reject(new Error(`server exited with ${code}`)));
    server.stdout.on('data', (chunk) => String(chunk).includes('listening') && resolve());
  });
});

after(() => server.kill('SIGKILL'));

function harness() {
  const objects = new Map();
  const puts = [];
  const env = {
    PLATE_INGEST_SECRET: SECRET,
    SUPABASE_STORAGE_ORIGIN: 'https://abcdefghijklmnop.supabase.co',
    PLATES: {
      async get(key) {
        const body = objects.get(key);
        return body ? { etag: createHash('sha256').update(body).digest('hex'), json: async () => JSON.parse(new TextDecoder().decode(body)) } : null;
      },
      async head(key) {
        return objects.has(key) ? { key } : null;
      },
      async put(key, value, options) {
        const held = objects.get(key);
        const etag = held && createHash('sha256').update(held).digest('hex');
        if (options?.onlyIf?.etagMatches !== undefined && options.onlyIf.etagMatches !== etag) return null;
        if (options?.onlyIf?.etagDoesNotMatch === '*' && held) return null;
        objects.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value));
        puts.push(key);
        return { etag: createHash('sha256').update(objects.get(key)).digest('hex') };
      },
    },
  };
  let jobs = 0;
  const deps = {
    fetchSource: async () => new Response(source, { headers: { 'content-type': 'image/jpeg' } }),
    // The Worker's container hop, made over HTTP to the real processor.
    processPlate: async (request) => {
      jobs++;
      return fetch(`http://127.0.0.1:${port}/process`, {
        method: 'POST',
        headers: { 'x-media-job': request.headers.get('x-media-job') },
        body: new Uint8Array(await request.arrayBuffer()),
        signal: request.signal,
      });
    },
  };
  const ingest = async (framing, n) => {
    const res = await handlePlateIngest(
      new Request('https://media-worker/plates/ingest', {
        method: 'POST',
        headers: { authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({
          projectId: PROJECT,
          requestId: `${n}a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`,
          sourceKind: 'maker',
          sourceUrl: 'https://cdn.example.com/scene.jpg',
          ...framing,
        }),
      }),
      env,
      deps,
    );
    assert.equal(res.status, 200, await res.clone().text());
    return res.json();
  };
  return { objects, puts, ingest, jobs: () => jobs };
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** file → SHA-256 of every rendition under the framing's prefix. */
function renditions(objects, base, rev) {
  const prefix = `${base}/f/${rev}/`;
  return new Map(
    [...objects]
      .filter(([key]) => key.startsWith(prefix) && !key.endsWith('/crops.json'))
      .map(([key, bytes]) => [key.slice(prefix.length), digest(bytes)]),
  );
}

const cropOf = (file) => file.replace(/-\d+\.(avif|webp)$/, '');

test('real Sharp: framing A, then B, then A late — A keeps every encoded byte, B differs exactly where its crop does', async () => {
  const h = harness();
  const base = `plates/${PROJECT}/${digest(source)}`;
  const revA = await framingRevision(FRAMING_A.focal, FRAMING_A.subjectBox);
  const revB = await framingRevision(FRAMING_B.focal, FRAMING_B.subjectBox);

  const a = await h.ingest(FRAMING_A, 1);
  const aBytes = renditions(h.objects, base, revA);
  assert.deepEqual(Object.keys(a.crops), ['wide', 'cover_phone', 'wide32', 'pair', 'piece']);
  // The record names every file it publishes, and they are genuine encodes at their stated width.
  const files = Object.entries(a.crops).flatMap(([key, { widths, rev }]) => {
    assert.equal(rev, revA);
    return widths.flatMap((w) => ['avif', 'webp'].map((f) => `${key}-${w}.${f}`));
  });
  assert.deepEqual([...aBytes.keys()].sort(), files.sort());
  for (const file of ['cover_phone-640.avif', 'cover_phone-640.webp']) {
    const meta = await sharp(h.objects.get(`${base}/f/${revA}/${file}`)).metadata();
    assert.equal(meta.format, file.endsWith('.avif') ? 'heif' : 'webp');
    assert.equal(meta.width, 640);
  }

  const b = await h.ingest(FRAMING_B, 2);
  const bBytes = renditions(h.objects, base, revB);
  assert.deepEqual(renditions(h.objects, base, revA), aBytes, 'B changed an A byte');
  assert.deepEqual([...bBytes.keys()].sort(), [...aBytes.keys()].sort());
  const moved = Object.keys(a.crops).filter((crop) => JSON.stringify(a.crops[crop].rect) !== JSON.stringify(b.crops[crop].rect));
  assert.deepEqual(moved, ['cover_phone', 'wide32', 'pair']);
  for (const [file, hash] of bBytes) {
    if (moved.includes(cropOf(file))) assert.notEqual(hash, aBytes.get(file), `${file}: another rectangle, other bytes`);
    else assert.equal(hash, aBytes.get(file), `${file}: the same rectangle encodes the same bytes`);
  }

  // A late, while its manifest stands: the record comes back and nothing is written.
  const written = h.puts.length;
  assert.deepEqual(await h.ingest(FRAMING_A, 3), a);
  assert.equal(h.puts.length, written);
  assert.equal(h.jobs(), 2);

  // A late after A's crops.json is gone (a publication that died before its
  // manifest, or the loser of a same-framing race): Sharp renders A again and
  // every A key is put again, with the same bytes.
  h.objects.delete(`${base}/f/${revA}/crops.json`);
  const late = await h.ingest(FRAMING_A, 4);
  assert.equal(h.jobs(), 3);
  assert.deepEqual(late, a);
  assert.deepEqual(h.puts.slice(written).filter((key) => !key.endsWith('/crops.json')).sort(), files.map((f) => `${base}/f/${revA}/${f}`).sort());
  assert.deepEqual(renditions(h.objects, base, revA), aBytes, 'the late re-render changed an A byte');
  assert.deepEqual(renditions(h.objects, base, revB), bBytes, 'the late re-render changed a B byte');
  // The unversioned prefix holds the original and nothing else.
  assert.deepEqual(
    [...h.objects.keys()].filter((key) => !key.startsWith(`${base}/f/`)),
    [`${base}/original.jpeg`],
  );
});
