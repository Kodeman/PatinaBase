// Plate geometry for the `plate_ingest` op: pure functions, no Sharp, so they
// run under `node --test` (test/plates.test.mjs). server.mjs owns the Sharp I/O.
// Floors, aspects and widths are the PLAN floors/serving tables
// (artifacts/client-house-issue-2026-10-21/brief/PLAN.md, "Floors and crops").

// aspect = width / height; null = uncropped (the whole source rect).
export const PLATE_CROPS = {
  wide: { aspect: 1.6, minWidth: 1600, minHeight: 1000, widths: [1280, 1600, 2048, 2560] },
  cover_phone: { aspect: 39 / 34, minWidth: 780, minHeight: 680, widths: [640, 828, 1080, 1242] },
  tall: { aspect: 0.46, minWidth: 780, minHeight: 1696, widths: [640, 828, 1080, 1242] },
  wide32: { aspect: 3 / 2, minWidth: 1248, minHeight: 832, widths: [768, 1024, 1600, 2048] },
  pair: { aspect: 7 / 5, minWidth: 716, minHeight: 0, widths: [768, 1024, 1600, 2048] },
  piece: { aspect: null, minWidth: 330, minHeight: 0, widths: [256, 512, 768] },
};

// Sheets and boards also get an uncropped plate keyed by their source kind,
// whatever their ground (a drawing sheet's paper margin reads as 'white').
export const SOURCE_KIND_PLATES = {
  sheet: { aspect: null, minWidth: 2048, minHeight: 0, widths: [768, 1024, 1600, 2048] },
  board: { aspect: null, minWidth: 1600, minHeight: 0, widths: [768, 1024, 1600, 2048] },
};

export const WHITE_GROUND_CROPS = new Set(['piece', 'pair']);
export const MAX_DISCARD = 0.5;
// Default crop centre (normalised) when no focal point is given: the thirds bias.
export const DEFAULT_CENTRE = [0.5, 0.45];

export const PLATE_FORMATS = [
  { format: 'avif', quality: 50 },
  { format: 'webp', quality: 72 },
];

export const LQIP_WIDTH = 24;
export const LQIP_MAX_CHARS = 800;
export const LQIP_QUALITIES = [50, 40, 30, 20, 10, 1];

export const BORDER_BAND = 8;
export const WHITE_MIN_MEAN = 0.92;
export const WHITE_MAX_VARIANCE = 0.0025;
export const DRAWING_TOLERANCE = 0.05;
export const DRAWING_MIN_SHARE = 0.9;
export const PAPER_MIN = 0.8;
export const INK_MAX = 0.35;

/** Ladder widths that do not upscale the crop. */
export function widthLadder(widths, nativeWidth) {
  const fit = widths.filter((w) => w <= nativeWidth);
  // A crop can meet its floor below its smallest ladder step (pair: floor 716,
  // first step 768); it is then served once at its native width.
  return fit.length ? fit : [nativeWidth];
}

/** Largest rect of `aspect` that fits inside width × height. */
export function maxRectSize(width, height, aspect) {
  if (width / height > aspect) return [Math.round(height * aspect), height];
  return [width, Math.round(width / aspect)];
}

// One axis of a crop placement: centre on `centre`, but keep the crop inside the
// source and around the subject span [subjectStart, subjectEnd]. Containment
// wins over centring; null when the subject is longer than the crop.
function axisOffset(cropLength, sourceLength, centre, subjectStart, subjectEnd) {
  const min = Math.max(0, subjectEnd - cropLength);
  const max = Math.min(sourceLength - cropLength, subjectStart);
  if (min > max) return null;
  return Math.min(max, Math.max(min, Math.round(centre - cropLength / 2)));
}

function subjectSpan(subjectBox, width, height) {
  // No subject box: a span that constrains nothing (starts at the far edge, ends at 0).
  if (!subjectBox) return { left: width, right: 0, top: height, bottom: 0 };
  const [x, y, w, h] = subjectBox;
  // The epsilon keeps float noise (0.4 + 0.2 = 0.6000000000000001) from adding a pixel.
  const floor = (v) => Math.floor(v + 1e-6);
  const ceil = (v) => Math.ceil(v - 1e-6);
  return {
    left: Math.max(0, floor(x * width)),
    right: Math.min(width, ceil((x + w) * width)),
    top: Math.max(0, floor(y * height)),
    bottom: Math.min(height, ceil((y + h) * height)),
  };
}

function wholeCrop(spec, { width, height }) {
  if (width < spec.minWidth || height < spec.minHeight) return null;
  return { rect: [0, 0, width, height], widths: widthLadder(spec.widths, width) };
}

function meetsFloor(spec, width, height, cw, ch) {
  return cw >= spec.minWidth && ch >= spec.minHeight && 1 - (cw * ch) / (width * height) <= MAX_DISCARD;
}

function fittedCrop(spec, source) {
  const { width, height } = source;
  const [cw, ch] = maxRectSize(width, height, spec.aspect);
  if (!meetsFloor(spec, width, height, cw, ch)) return null;
  const [fx, fy] = source.focal ?? DEFAULT_CENTRE;
  const span = subjectSpan(source.subjectBox, width, height);
  const left = axisOffset(cw, width, fx * width, span.left, span.right);
  const top = axisOffset(ch, height, fy * height, span.top, span.bottom);
  if (left === null || top === null) return null;
  return { rect: [left, top, cw, ch], widths: widthLadder(spec.widths, cw) };
}

function cropFor(spec, source) {
  return spec.aspect === null ? wholeCrop(spec, source) : fittedCrop(spec, source);
}

function plateSpecs(ground, sourceKind) {
  const crops = Object.entries(PLATE_CROPS).filter(([key]) => ground !== 'white' || WHITE_GROUND_CROPS.has(key));
  return Object.hasOwn(SOURCE_KIND_PLATES, sourceKind) ? [...crops, [sourceKind, SOURCE_KIND_PLATES[sourceKind]]] : crops;
}

/**
 * Every plate crop whose hard floor the (EXIF-oriented) source meets.
 * focal [x, y] and subjectBox [x, y, w, h] are normalised 0–1; rects are source px.
 * @returns {Record<string, {rect: [number, number, number, number], widths: number[]}>}
 */
export function planCrops({ width, height, ground, sourceKind, focal = null, subjectBox = null }) {
  const source = { width, height, focal, subjectBox };
  const planned = plateSpecs(ground, sourceKind).map(([key, spec]) => [key, cropFor(spec, source)]);
  return Object.fromEntries(planned.filter(([, crop]) => crop));
}

/** One encode per crop × width × format, named `{crop}-{w}.{avif|webp}`. */
export function outputJobs(crops) {
  const jobs = [];
  for (const [crop, { rect, widths }] of Object.entries(crops)) {
    for (const width of widths) {
      for (const { format, quality } of PLATE_FORMATS) {
        jobs.push({ key: `${crop}-${width}.${format}`, rect, width, format, quality, contentType: `image/${format}` });
      }
    }
  }
  return jobs;
}

function luma(data, i, channels) {
  return channels >= 3 ? (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255 : data[i] / 255;
}

// [from, to) x ranges of row y that lie in a border band.
function rowSpans(y, width, height, band) {
  if (y < band || y >= height - band) return [[0, width]];
  return [
    [0, Math.min(band, width)],
    [Math.max(band, width - band), width],
  ];
}

/** Rec. 709 luma (0–1) of every pixel in the four `band`-px borders of a raw buffer. */
export function borderLuminance(data, width, height, channels, band = BORDER_BAND) {
  const values = [];
  for (let y = 0; y < height; y++) {
    for (const [from, to] of rowSpans(y, width, height, band)) {
      for (let x = from; x < to; x++) values.push(luma(data, (y * width + x) * channels, channels));
    }
  }
  return values;
}

function meanVariance(samples) {
  const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  const variance = samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / samples.length;
  return { mean, variance };
}

function nearPaperOrInk(v, paper, ink) {
  return Math.abs(v - paper) <= DRAWING_TOLERANCE || (ink <= INK_MAX && Math.abs(v - ink) <= DRAWING_TOLERANCE);
}

// Paper is the bright end of the border and ink its dark end; a drawing's
// border is almost entirely one or the other, with little in between.
function isDrawing(samples) {
  const sorted = Float64Array.from(samples).sort();
  const paper = sorted[Math.floor(0.95 * (sorted.length - 1))];
  const ink = sorted[Math.floor(0.05 * (sorted.length - 1))];
  const near = samples.filter((v) => nearPaperOrInk(v, paper, ink)).length;
  return paper >= PAPER_MIN && near / samples.length >= DRAWING_MIN_SHARE;
}

/** 'white' | 'drawing' | 'scene' from border luminance samples. */
export function classifyGround(samples) {
  if (!samples.length) return 'scene';
  const { mean, variance } = meanVariance(samples);
  if (variance < WHITE_MAX_VARIANCE && mean >= WHITE_MIN_MEAN) return 'white';
  return isDrawing(samples) ? 'drawing' : 'scene';
}

/** The /process runner for a job header: op plate_ingest, else the media ops. */
export function runnerFor(job, { plateIngest, mediaJob }) {
  return job.op === 'plate_ingest' ? plateIngest : mediaJob;
}

export function toHex({ r, g, b }) {
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * WebP data URI at the highest LQIP_QUALITIES step whose URI fits LQIP_MAX_CHARS
 * (the client_plate_assets.lqip check); null when even the lowest does not fit.
 * @param {(quality: number) => Promise<Uint8Array>} encode
 */
export async function fitLqip(encode) {
  for (const quality of LQIP_QUALITIES) {
    const uri = `data:image/webp;base64,${Buffer.from(await encode(quality)).toString('base64')}`;
    if (uri.length <= LQIP_MAX_CHARS) return uri;
  }
  return null;
}
