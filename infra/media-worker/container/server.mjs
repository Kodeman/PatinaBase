// Media processor — runs inside a Cloudflare Container (linux/amd64).
// Pure compute: the consumer Worker reads the raw object from R2 (via its R2
// binding) and POSTs the bytes here with the job spec in the `x-media-job`
// header; this runs the Sharp pipeline and returns the renditions (base64) +
// metadata for the Worker to write back to R2. No R2/S3 credentials live here.
//
// Fidelity: the rendition set (sizes, formats, quality tiers, fit) mirrors
// services/media/src/modules/transform/image-transform.service.ts. Ops not yet
// ported (analyze, duplicate_check, 3D, virus scan) return notImplemented.

import { createServer } from 'node:http';
import sharp from 'sharp';
import { encode as blurhashEncode } from 'blurhash';

const PORT = Number(process.env.PORT || 8080);

// Mirrors image-transform.service.ts RENDITION_SIZES + QUALITY_SETTINGS.
const RENDITION_SIZES = [256, 512, 768, 1024, 1600, 2048];
const QUALITY = {
  webp: { thumb: 70, web: 80, retina: 85 },
  avif: { thumb: 60, web: 70, retina: 75 },
  jpeg: { thumb: 78, web: 85, retina: 90 },
  png: { thumb: 78, web: 85, retina: 90 },
};

function tier(size) {
  if (size <= 256) return 'thumb';
  if (size <= 1024) return 'web';
  return 'retina';
}
function quality(format, size) {
  return (QUALITY[format] || QUALITY.webp)[tier(size)];
}
function purpose(size) {
  if (size <= 256) return 'thumbnail';
  if (size <= 1024) return 'web';
  return 'retina';
}
function renditionKey(assetId, size, format) {
  return `images/${assetId}/${size}x${size}.${format}`;
}

async function encodeRendition(buffer, size, format) {
  let p = sharp(buffer).resize({
    width: size,
    fit: 'inside',
    position: 'centre',
    background: { r: 255, g: 255, b: 255, alpha: 1 },
    withoutEnlargement: true,
  });
  const q = quality(format, size);
  if (format === 'webp') p = p.webp({ quality: q });
  else if (format === 'avif') p = p.avif({ quality: q });
  else if (format === 'jpeg') p = p.jpeg({ quality: q });
  else if (format === 'png') p = p.png({ quality: q });
  return p.toBuffer();
}

async function opGenerateRenditions(assetId, buffer) {
  const src = await sharp(buffer).metadata();
  const originalFormat = src.format === 'png' ? 'png' : 'jpeg';
  const renditions = [];

  for (const size of RENDITION_SIZES) {
    if ((src.width || 0) < size && (src.height || 0) < size) continue;

    for (const format of ['webp', 'avif']) {
      const out = await encodeRendition(buffer, size, format);
      renditions.push({
        key: renditionKey(assetId, size, format),
        width: size,
        format,
        contentType: `image/${format}`,
        quality: quality(format, size),
        purpose: purpose(size),
        dataB64: out.toString('base64'),
      });
    }

    if (src.format === 'jpeg' || src.format === 'png') {
      const out = await encodeRendition(buffer, size, originalFormat);
      renditions.push({
        key: renditionKey(assetId, size, originalFormat),
        width: size,
        format: originalFormat,
        contentType: `image/${originalFormat}`,
        quality: quality(originalFormat, size),
        purpose: purpose(size),
        dataB64: out.toString('base64'),
      });
    }
  }
  return { renditions };
}

async function opExtractMetadata(assetId, buffer) {
  const md = await sharp(buffer).metadata();

  const { data, info } = await sharp(buffer)
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });
  const blurhash = blurhashEncode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);

  const stats = await sharp(buffer).stats();
  const d = stats.dominant;
  const toHex = (n) => n.toString(16).padStart(2, '0');
  const dominantColor = d ? `#${toHex(d.r)}${toHex(d.g)}${toHex(d.b)}` : null;

  return {
    width: md.width,
    height: md.height,
    format: md.format,
    space: md.space,
    hasAlpha: md.hasAlpha,
    size: md.size,
    blurhash,
    dominantColor,
  };
}

async function opOptimize(assetId, buffer) {
  const out = await sharp(buffer)
    .resize({ width: 2048, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return {
    key: `images/${assetId}/optimized.webp`,
    format: 'webp',
    contentType: 'image/webp',
    dataB64: out.toString('base64'),
  };
}

const OPS = {
  generate_renditions: (assetId, buffer) => opGenerateRenditions(assetId, buffer),
  extract_metadata: (assetId, buffer) => opExtractMetadata(assetId, buffer),
  optimize: (assetId, buffer) => opOptimize(assetId, buffer),
};

async function runJob(job, imageBuffer) {
  const { assetId, meta = {} } = job;
  if (!assetId || !imageBuffer?.length) {
    return { success: false, error: 'assetId and a non-empty image body are required' };
  }
  const operations = meta.operations?.length
    ? meta.operations
    : [{ type: 'generate_renditions' }, { type: 'extract_metadata' }];

  const results = {};
  for (const op of operations) {
    const fn = OPS[op.type];
    if (!fn) {
      results[op.type] = { notImplemented: true };
      continue;
    }
    try {
      results[op.type] = await fn(assetId, imageBuffer);
    } catch (err) {
      results[op.type] = { error: String(err?.message || err) };
    }
  }
  return { success: true, jobId: job.jobId, assetId, results };
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.method === 'POST' && req.url === '/process') {
    const jobHeader = req.headers['x-media-job'];
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const job = JSON.parse(Buffer.from(String(jobHeader || ''), 'base64').toString('utf8'));
        const result = await runJob(job, Buffer.concat(chunks));
        res.writeHead(result.success ? 200 : 422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(err?.message || err) }));
      }
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`media-processor (pure-sharp) listening on :${PORT}`);
});
