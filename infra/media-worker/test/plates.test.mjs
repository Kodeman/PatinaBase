import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  LQIP_MAX_CHARS,
  MAX_DISCARD,
  borderLuminance,
  classifyGround,
  disconnectSignal,
  encodeInOrder,
  fitLqip,
  outputJobs,
  planCrops,
  runnerFor,
  widthLadder,
} from '../container/plates.mjs';

test('/process runs plate_ingest jobs on the plate lane and everything else as media jobs', () => {
  const runners = { plateIngest: () => 'plate', mediaJob: () => 'media' };
  assert.equal(runnerFor({ op: 'plate_ingest' }, runners), runners.plateIngest);
  assert.equal(runnerFor({ jobId: 'j', assetId: 'a', type: 'IMAGE_PROCESS' }, runners), runners.mediaJob);
});

test('an unknown or inherited source kind adds no plate', () => {
  for (const sourceKind of ['constructor', '__proto__', 'toString', undefined]) {
    const crops = planCrops({ width: 3000, height: 2000, ground: 'scene', sourceKind });
    assert.deepEqual(Object.keys(crops), ['wide', 'cover_phone', 'wide32', 'pair', 'piece']);
  }
});

function assertWithinBounds(crops, width, height) {
  for (const [key, { rect, widths }] of Object.entries(crops)) {
    const [x, y, w, h] = rect;
    assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, `${key} rect ${rect} outside ${width}x${height}`);
    assert.ok(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h), `${key} rect not integral`);
    assert.ok(1 - (w * h) / (width * height) <= MAX_DISCARD, `${key} discards more than half the source`);
    assert.ok(widths.length > 0 && widths.every((n) => n <= w), `${key} widths ${widths} upscale ${w}`);
  }
}

function contains(rect, box, width, height) {
  const [x, y, w, h] = rect;
  const eps = 1e-6;
  return (
    x <= box[0] * width + eps &&
    y <= box[1] * height + eps &&
    x + w >= (box[0] + box[2]) * width - eps &&
    y + h >= (box[1] + box[3]) * height - eps
  );
}

test('3000x2000 scene: every crop whose floor and 50 percent rule it meets, in bounds', () => {
  const crops = planCrops({ width: 3000, height: 2000, ground: 'scene', sourceKind: 'upload' });
  // tall (0.46) would keep 920x2000 = 31 percent of a 3:2 frame, so the 50 percent rule drops it.
  assert.deepEqual(Object.keys(crops), ['wide', 'cover_phone', 'wide32', 'pair', 'piece']);
  assertWithinBounds(crops, 3000, 2000);
  assert.deepEqual(crops.wide.rect, [0, 0, 3000, 1875]);
  assert.deepEqual(crops.wide32.rect, [0, 0, 3000, 2000]);
  assert.deepEqual(crops.cover_phone.rect.slice(2), [2294, 2000]);
  assert.deepEqual(crops.piece, { rect: [0, 0, 3000, 2000], widths: [256, 512, 768] });
});

test('portrait 1800x3600 gets the tall crop for the phone held plate', () => {
  const crops = planCrops({ width: 1800, height: 3600, ground: 'scene', sourceKind: 'upload' });
  assert.deepEqual(Object.keys(crops), ['tall', 'piece']);
  assert.deepEqual(crops.tall, { rect: [72, 0, 1656, 3600], widths: [640, 828, 1080, 1242] });
  assertWithinBounds(crops, 1800, 3600);
});

test('1000x800: cover_phone and pair pass their floors, wide does not', () => {
  const crops = planCrops({ width: 1000, height: 800, ground: 'scene', sourceKind: 'upload' });
  assert.deepEqual(Object.keys(crops), ['cover_phone', 'pair', 'piece']);
  assert.equal(crops.wide, undefined);
  assert.deepEqual(crops.cover_phone.rect.slice(2), [918, 800]);
  assertWithinBounds(crops, 1000, 800);
});

test('600x400: only the piece plate', () => {
  const crops = planCrops({ width: 600, height: 400, ground: 'scene', sourceKind: 'maker' });
  assert.deepEqual(Object.keys(crops), ['piece']);
  assert.deepEqual(crops.piece.widths, [256, 512]);
});

test('below the piece floor nothing is planned', () => {
  assert.deepEqual(planCrops({ width: 320, height: 900, ground: 'scene', sourceKind: 'maker' }), {});
});

test('white-ground 2000x2000: piece and pair only', () => {
  const crops = planCrops({ width: 2000, height: 2000, ground: 'white', sourceKind: 'maker' });
  assert.deepEqual(Object.keys(crops), ['pair', 'piece']);
  assertWithinBounds(crops, 2000, 2000);
});

test('the subject box is always wholly inside the crop', () => {
  const box = [0.7, 0.05, 0.25, 0.5];
  const crops = planCrops({ width: 3000, height: 2000, ground: 'scene', sourceKind: 'upload', subjectBox: box });
  assert.deepEqual(Object.keys(crops), ['wide', 'cover_phone', 'wide32', 'pair', 'piece']);
  for (const [key, { rect }] of Object.entries(crops)) {
    assert.ok(contains(rect, box, 3000, 2000), `${key} ${rect} misses the subject box`);
  }
  assertWithinBounds(crops, 3000, 2000);
});

test('a crop that cannot hold the subject box is dropped', () => {
  // 95 percent of the width: wider than cover_phone (2294 of 3000) and pair (2800).
  const box = [0.02, 0.2, 0.95, 0.5];
  const crops = planCrops({ width: 3000, height: 2000, ground: 'scene', sourceKind: 'upload', subjectBox: box });
  assert.deepEqual(Object.keys(crops), ['wide', 'wide32', 'piece']);
  for (const { rect } of Object.values(crops)) assert.ok(contains(rect, box, 3000, 2000));
});

test('the crop centres on the focal point when the frame allows it', () => {
  const crops = planCrops({ width: 4000, height: 2000, ground: 'scene', sourceKind: 'upload', focal: [0.6, 0.5] });
  const [x, , w] = crops.cover_phone.rect;
  assert.ok(Math.abs(x + w / 2 - 2400) <= 1, `cover_phone centre ${x + w / 2} is not on focal x 2400`);
  // Near the edge the crop clamps to the frame instead of leaving it.
  const edge = planCrops({ width: 4000, height: 2000, ground: 'scene', sourceKind: 'upload', focal: [0.98, 0.5] });
  assert.equal(edge.cover_phone.rect[0] + edge.cover_phone.rect[2], 4000);
});

test('subject containment wins over the focal point', () => {
  const crops = planCrops({
    width: 4000,
    height: 2000,
    ground: 'scene',
    sourceKind: 'upload',
    focal: [0.1, 0.5],
    subjectBox: [0.4, 0.2, 0.2, 0.4],
  });
  const [x, , w] = crops.cover_phone.rect;
  assert.equal(x + w, 2400); // pushed right just far enough to hold the box's right edge
  assert.ok(contains(crops.cover_phone.rect, [0.4, 0.2, 0.2, 0.4], 4000, 2000));
});

test('with no focal point the crop centre sits at 0.5 across and 0.45 down', () => {
  const crops = planCrops({ width: 3000, height: 3000, ground: 'scene', sourceKind: 'upload' });
  const [x, y, w, h] = crops.wide32.rect;
  assert.equal(x + w / 2, 1500);
  assert.equal(y + h / 2, 0.45 * 3000);
});

test('the width ladder drops widths above the native width', () => {
  assert.deepEqual(widthLadder([1280, 1600, 2048, 2560], 2100), [1280, 1600, 2048]);
  assert.deepEqual(widthLadder([768, 1024, 1600, 2048], 740), [740]);
  const crops = planCrops({ width: 1000, height: 800, ground: 'scene', sourceKind: 'upload' });
  assert.deepEqual(crops.cover_phone.widths, [640, 828]);
  assert.deepEqual(crops.pair.widths, [768]);
  assert.deepEqual(crops.piece.widths, [256, 512, 768]);
  // pair's floor (716) is under its first step (768): served once at native width.
  const small = planCrops({ width: 740, height: 600, ground: 'scene', sourceKind: 'upload' });
  assert.deepEqual(small.pair, { rect: [0, 6, 740, 529], widths: [740] });
});

test('sheet and board sources also get an uncropped plate keyed by source kind', () => {
  const sheet = planCrops({ width: 2480, height: 3508, ground: 'white', sourceKind: 'sheet' });
  assert.deepEqual(sheet.sheet, { rect: [0, 0, 2480, 3508], widths: [768, 1024, 1600, 2048] });
  assert.deepEqual(Object.keys(sheet), ['pair', 'piece', 'sheet']);
  const board = planCrops({ width: 1800, height: 1200, ground: 'scene', sourceKind: 'board' });
  assert.deepEqual(board.board, { rect: [0, 0, 1800, 1200], widths: [768, 1024, 1600] });
  assert.equal(board.sheet, undefined);
  // Below the board floor (1600 wide) there is no board plate; uploads never get one.
  assert.equal(planCrops({ width: 800, height: 600, ground: 'scene', sourceKind: 'board' }).board, undefined);
  assert.equal(planCrops({ width: 2480, height: 3508, ground: 'scene', sourceKind: 'upload' }).sheet, undefined);
});

test('skip leaves out the crops these bytes already have, so a new kind plans only its own', () => {
  const shared = ['wide', 'cover_phone', 'wide32', 'pair', 'piece'];
  const board = planCrops({ width: 2400, height: 1800, ground: 'scene', sourceKind: 'board', skip: shared });
  assert.deepEqual(Object.keys(board), ['board']);
  assert.deepEqual(planCrops({ width: 2400, height: 1800, ground: 'scene', sourceKind: 'maker', skip: shared }), {});
});

test('encoding stops before the next crop once the request is aborted', async () => {
  const controller = new AbortController();
  const encoded = [];
  const encode = async (job) => {
    encoded.push(job);
    if (job === 'b') controller.abort(new Error('client disconnected'));
    return job.toUpperCase();
  };
  await assert.rejects(encodeInOrder(['a', 'b', 'c', 'd'], encode, controller.signal), /client disconnected/);
  assert.deepEqual(encoded, ['a', 'b']);
  assert.deepEqual(await encodeInOrder(['a', 'b'], async (j) => j.toUpperCase(), new AbortController().signal), ['A', 'B']);
});

test('a client that hangs up after sending its body aborts the job signal; a finished response does not', async () => {
  const signals = [];
  let received;
  const stalledArrived = new Promise((resolve) => (received = resolve));
  const server = createServer((req, res) => {
    const signal = disconnectSignal(res);
    signals.push(signal);
    req.resume();
    req.on('end', () => (req.url === '/finish' ? res.end('ok') : received(signal)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await (await fetch(`${base}/finish`, { method: 'POST', body: 'x' })).text();
    const hangUp = new AbortController();
    const stalled = fetch(`${base}/stall`, { method: 'POST', body: 'x', signal: hangUp.signal }).catch(() => 'hung up');
    const signal = await stalledArrived;
    // Long enough for node:http to close the fully read request while the client still waits.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(signal.aborted, false);
    const aborted = new Promise((resolve) => signal.addEventListener('abort', () => resolve('aborted')));
    hangUp.abort();
    let timer;
    const outcome = await Promise.race([aborted, new Promise((resolve) => (timer = setTimeout(resolve, 2000, 'still running')))]);
    clearTimeout(timer);
    assert.equal(outcome, 'aborted');
    assert.equal(await stalled, 'hung up');
    assert.match(String(signal.reason?.message), /client disconnected/);
    assert.equal(signals[0].aborted, false);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('outputs are AVIF q50 and WebP q72 per crop width', () => {
  const jobs = outputJobs({ piece: { rect: [0, 0, 600, 400], widths: [256, 512] } });
  assert.deepEqual(
    jobs.map((j) => [j.key, j.format, j.quality, j.contentType, j.width]),
    [
      ['piece-256.avif', 'avif', 50, 'image/avif', 256],
      ['piece-256.webp', 'webp', 72, 'image/webp', 256],
      ['piece-512.avif', 'avif', 50, 'image/avif', 512],
      ['piece-512.webp', 'webp', 72, 'image/webp', 512],
    ],
  );
});

function rawFrame(width, height, border, inner) {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x < 8 || y < 8 || x >= width - 8 || y >= height - 8;
      data.set(edge ? border(x, y) : inner, (y * width + x) * 3);
    }
  }
  return data;
}

test('ground: a flat white border is white, a busy one is a scene', () => {
  const white = rawFrame(64, 48, () => [255, 255, 255], [40, 30, 20]);
  const samples = borderLuminance(white, 64, 48, 3);
  assert.equal(samples.length, 64 * 48 - 48 * 32);
  assert.equal(classifyGround(samples), 'white');
  const scene = rawFrame(64, 48, (x, y) => [(x * 37) % 256, (y * 53) % 256, 90], [255, 255, 255]);
  assert.equal(classifyGround(borderLuminance(scene, 64, 48, 3)), 'scene');
});

test('ground: paper with ink lines is a drawing', () => {
  // About 80 percent paper, 20 percent ink: too varied for white, all near paper or ink.
  const sheet = rawFrame(64, 48, (x) => (x % 7 === 0 ? [20, 20, 20] : [250, 248, 244]), [0, 0, 0]);
  assert.equal(classifyGround(borderLuminance(sheet, 64, 48, 3)), 'drawing');
  assert.equal(classifyGround([]), 'scene');
});

test('lqip steps quality down until the data URI fits, else gives up', async () => {
  const asked = [];
  const uri = await fitLqip(async (q) => {
    asked.push(q);
    return new Uint8Array(q >= 30 ? 900 : 400);
  });
  assert.deepEqual(asked, [50, 40, 30, 20]);
  assert.ok(uri.startsWith('data:image/webp;base64,') && uri.length <= LQIP_MAX_CHARS);
  assert.equal(await fitLqip(async () => new Uint8Array(2000)), null);
});
