// One `plate_ingest` job in a process of its own. plate-lane.mjs forks this
// script per job and SIGKILLs it at the job's deadline or when the Worker hangs
// up: libvips work on the threadpool cannot be cancelled from JavaScript, but a
// killed process takes its CPU with it.
//
// Message in: {job, body}. Message out: {ok: true, result} or {ok: false, error}.
// EXIF-orient and decode once, classify the ground, then encode every planned
// crop × width × format. Geometry lives in plates.mjs; outputs travel as base64.

import sharp from 'sharp';
import {
  LQIP_WIDTH,
  borderLuminance,
  classifyGround,
  encodeInOrder,
  fitLqip,
  outputJobs,
  planCrops,
  toHex,
} from './plates.mjs';

async function encodePlate(data, raw, out) {
  const [left, top, width, height] = out.rect;
  const bytes = await sharp(data, raw)
    .extract({ left, top, width, height })
    .resize({ width: out.width, withoutEnlargement: true })
    .toFormat(out.format, { quality: out.quality, effort: out.effort })
    .toBuffer();
  return { key: out.key, contentType: out.contentType, dataB64: bytes.toString('base64') };
}

async function runPlateIngest(job, imageBuffer) {
  const { format } = await sharp(imageBuffer).metadata();
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
  const ground = classifyGround(borderLuminance(data, info.width, info.height, info.channels));
  const { dominant } = await sharp(data, raw).stats();
  const crops = planCrops({
    width: info.width,
    height: info.height,
    ground,
    sourceKind: job.sourceKind,
    focal: job.focal,
    subjectBox: job.subjectBox,
    skip: job.skip,
  });
  return {
    success: true,
    width: info.width,
    height: info.height,
    format,
    ground,
    dominantHex: toHex(dominant),
    lqip: await fitLqip((quality) => sharp(data, raw).resize({ width: LQIP_WIDTH }).webp({ quality }).toBuffer()),
    crops,
    outputs: await encodeInOrder(outputJobs(crops), (out) => encodePlate(data, raw, out)),
  };
}

// One job per process. The listener stays attached, so the process lives until
// the lane kills it and its exit can never overtake the reply.
let started = false;
process.on('message', async ({ job, body }) => {
  if (started) return;
  started = true;
  try {
    const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    process.send({ ok: true, result: await runPlateIngest(job, bytes) });
  } catch (err) {
    process.send({ ok: false, error: String(err?.message || err) });
  }
});
