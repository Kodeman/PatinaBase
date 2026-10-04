// Minimal browser PPTX parser for the SQ-351 feasibility spike. Throwaway, not product code.
// fflate for the zip, native DOMParser for the XML, createImageBitmap + OffscreenCanvas for crops.
import * as fflate from './fflate.js';

const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
};
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const PASS1 = /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/;
const DEFAULT_CAPS = { maxEntries: 10000, maxTotalUncompressed: 1024 ** 3, maxRatio: 100, ratioMinBytes: 1024 ** 2 };

// ---------------------------------------------------------------- zip layer

/** Zip-bomb caps checked against header metadata before anything is inflated. */
function capGuard(caps, stats) {
  return (f) => {
    stats.entries += 1;
    stats.declaredUncompressed += f.originalSize ?? 0;
    if (!caps) return;
    if (stats.entries > caps.maxEntries) throw new Error(`cap: more than ${caps.maxEntries} zip entries`);
    if (stats.declaredUncompressed > caps.maxTotalUncompressed) throw new Error(`cap: declared uncompressed bytes exceed ${caps.maxTotalUncompressed} (entry ${f.name} declares ${f.originalSize})`);
  };
}

function noteRatio(f, caps, stats) {
  if (f.size > 0 && f.originalSize != null) {
    const ratio = f.originalSize / f.size;
    if (ratio > stats.maxRatio) stats.maxRatio = ratio;
    if (caps && f.originalSize >= caps.ratioMinBytes && ratio > caps.maxRatio) throw new Error(`cap: ${f.name} ratio ${ratio.toFixed(0)} > ${caps.maxRatio}`);
  }
}

/** Returns read(want) -> Promise<Map<name, Uint8Array>>; each call is one pass over the archive. */
async function openArchive(file, strategy, caps, stats) {
  if (strategy === 'stream') return (want, first) => streamPass(file, want, first ? capGuard(caps, stats) : null, caps, stats);
  const buf = new Uint8Array(await file.arrayBuffer());
  return (want, first) => {
    const guard = first ? capGuard(caps, stats) : null;
    const filter = (f) => {
      guard?.(f);
      if (!want(f.name)) return false;
      noteRatio(f, caps, stats);
      return true;
    };
    if (strategy === 'unzipSync') return Promise.resolve(toMap(fflate.unzipSync(buf, { filter })));
    return new Promise((res, rej) => fflate.unzip(buf, { filter }, (err, out) => (err ? rej(err) : res(toMap(out)))));
  };
}

function toMap(obj) {
  return new Map(Object.entries(obj));
}

/** Streaming Unzip over file.stream(): never holds the whole archive. No central directory. */
async function streamPass(file, want, guard, caps, stats) {
  const out = new Map();
  const pending = [];
  let failure = null;
  const uz = new fflate.Unzip();
  uz.register(fflate.UnzipInflate);
  uz.onfile = (f) => {
    try {
      guard?.(f);
      if (!want(f.name)) return;
      noteRatio(f, caps, stats);
    } catch (e) {
      failure ??= e;
      return;
    }
    const chunks = [];
    let got = 0;
    pending.push(new Promise((res, rej) => {
      f.ondata = (err, chunk, final) => {
        if (err) return rej(err);
        got += chunk.length;
        if (caps && got > caps.maxTotalUncompressed) {
          f.terminate();
          return rej(new Error(`cap: ${f.name} inflated past ${caps.maxTotalUncompressed}`));
        }
        chunks.push(chunk);
        if (final) {
          out.set(f.name, concat(chunks, got));
          res();
        }
      };
    }));
    f.start();
  };
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (failure) {
      reader.cancel();
      throw failure;
    }
    if (done) {
      uz.push(new Uint8Array(0), true);
      break;
    }
    uz.push(value);
  }
  await Promise.all(pending);
  if (failure) throw failure;
  return out;
}

function concat(chunks, len) {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// ---------------------------------------------------------------- xml layer

const td = new TextDecoder();
function xml(bytes, name) {
  const doc = new DOMParser().parseFromString(td.decode(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`xml: ${name} did not parse`);
  return doc;
}

function child(el, ns, ln) {
  if (!el) return null;
  for (const c of el.children) if (c.localName === ln && c.namespaceURI === ns) return c;
  return null;
}

function resolvePart(fromPart, target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null; // absolute URI, not a package part
  const parts = target.startsWith('/') ? [] : fromPart.split('/').slice(0, -1);
  for (const seg of target.replace(/^\//, '').split('/')) {
    if (seg === '..') {
      if (!parts.length) throw new Error(`rels: ${target} escapes the package`);
      parts.pop();
    } else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

function relsPathFor(part) {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
}

function readRels(files, part) {
  const map = new Map();
  const bytes = files.get(relsPathFor(part));
  if (!bytes) return map;
  for (const r of xml(bytes, part).getElementsByTagNameNS(NS.rel, 'Relationship')) {
    const external = r.getAttribute('TargetMode') === 'External';
    const target = r.getAttribute('Target');
    map.set(r.getAttribute('Id'), {
      type: r.getAttribute('Type').split('/').pop(),
      target,
      external,
      part: external ? null : resolvePart(part, target),
    });
  }
  return map;
}

// affine for group space: X = a*x + tx, Y = d*y + ty (rotation/flip ignored in the spike)
const IDENTITY = { a: 1, d: 1, tx: 0, ty: 0 };
function groupTransform(parent, grpSp) {
  const x = child(child(grpSp, NS.p, 'grpSpPr'), NS.a, 'xfrm');
  if (!x) return parent;
  const n = (ln, at) => Number(child(x, NS.a, ln)?.getAttribute(at) ?? 0);
  const sx = n('chExt', 'cx') ? n('ext', 'cx') / n('chExt', 'cx') : 1;
  const sy = n('chExt', 'cy') ? n('ext', 'cy') / n('chExt', 'cy') : 1;
  const g = { a: sx, d: sy, tx: n('off', 'x') - n('chOff', 'x') * sx, ty: n('off', 'y') - n('chOff', 'y') * sy };
  return { a: parent.a * g.a, d: parent.d * g.d, tx: parent.a * g.tx + parent.tx, ty: parent.d * g.ty + parent.ty };
}

function bbox(spPr, xf) {
  const x = child(spPr, NS.a, 'xfrm');
  if (!x) return null; // placeholder geometry inherited from layout: not resolved in the spike
  const off = child(x, NS.a, 'off');
  const ext = child(x, NS.a, 'ext');
  const ox = Number(off.getAttribute('x'));
  const oy = Number(off.getAttribute('y'));
  return [Math.round(xf.a * ox + xf.tx), Math.round(xf.d * oy + xf.ty), Math.round(Number(ext.getAttribute('cx')) * xf.a), Math.round(Number(ext.getAttribute('cy')) * xf.d)];
}

function walk(container, xf, rels, out, slide) {
  for (const el of container.children) {
    if (el.namespaceURI === NS.mc && el.localName === 'AlternateContent') {
      const branch = child(el, NS.mc, 'Choice') ?? child(el, NS.mc, 'Fallback');
      if (branch) walk(branch, xf, rels, out, slide);
      continue;
    }
    if (el.namespaceURI !== NS.p) continue;
    if (el.localName === 'grpSp') {
      walk(el, groupTransform(xf, el), rels, out, slide);
      continue;
    }
    let blipFill;
    let spPr;
    let cNvPr;
    let kind;
    if (el.localName === 'pic') {
      kind = 'pic';
      blipFill = child(el, NS.p, 'blipFill');
      spPr = child(el, NS.p, 'spPr');
      cNvPr = child(child(el, NS.p, 'nvPicPr'), NS.p, 'cNvPr');
    } else if (el.localName === 'sp') {
      cNvPr = child(child(el, NS.p, 'nvSpPr'), NS.p, 'cNvPr');
      if (cNvPr?.getAttribute('name')?.startsWith('key-')) slide.key = cNvPr.getAttribute('name');
      spPr = child(el, NS.p, 'spPr');
      blipFill = child(spPr, NS.a, 'blipFill');
      kind = 'shapeFill';
      if (!blipFill) continue;
    } else continue; // graphicFrame tables, cxnSp, etc. are out of spike scope
    const blip = child(blipFill, NS.a, 'blip');
    const embed = blip?.getAttributeNS(NS.r, 'embed');
    const linkedOnly = !embed && blip?.getAttributeNS(NS.r, 'link');
    const media = embed ? rels.get(embed)?.part ?? null : null;
    const src = child(blipFill, NS.a, 'srcRect');
    const crop = ['l', 't', 'r', 'b'].map((k) => Number(src?.getAttribute(k) ?? 0));
    const hl = child(cNvPr, NS.a, 'hlinkClick');
    let link = null;
    if (hl && !(hl.getAttribute('action') ?? '').startsWith('ppaction://')) {
      const rel = rels.get(hl.getAttributeNS(NS.r, 'id'));
      if (rel?.external && /^https?:\/\//i.test(rel.target)) link = rel.target;
    }
    out.push({ kind, media, linkedOnly: Boolean(linkedOnly), bbox: bbox(spPr, xf), crop, link, alt: cNvPr?.getAttribute('descr') ?? '' });
  }
}

function buildManifest(files) {
  const presPart = 'ppt/presentation.xml';
  const pres = xml(files.get(presPart), presPart);
  const sz = pres.getElementsByTagNameNS(NS.p, 'sldSz')[0];
  const presRels = readRels(files, presPart);
  const slides = [];
  for (const sldId of pres.getElementsByTagNameNS(NS.p, 'sldId')) {
    const part = presRels.get(sldId.getAttributeNS(NS.r, 'id'))?.part;
    if (!part || !files.has(part)) throw new Error(`manifest: slide ${sldId.getAttribute('id')} missing`);
    const rels = readRels(files, part);
    const doc = xml(files.get(part), part);
    const spTree = child(child(doc.documentElement, NS.p, 'cSld'), NS.p, 'spTree');
    const slide = { index: slides.length, part, key: null, pictures: [], notesText: '' };
    walk(spTree, IDENTITY, rels, slide.pictures, slide);
    const notes = [...rels.values()].find((r) => r.type === 'notesSlide');
    if (notes?.part && files.has(notes.part)) {
      slide.notesText = [...xml(files.get(notes.part), notes.part).getElementsByTagNameNS(NS.a, 't')].map((t) => t.textContent).join(' ');
    }
    slides.push(slide);
  }
  return { slideSize: [Number(sz?.getAttribute('cx')), Number(sz?.getAttribute('cy'))], slides };
}

// ---------------------------------------------------------------- crops

async function cropAll(manifest, media, opts, stats) {
  const byMedia = new Map();
  for (const s of manifest.slides) {
    for (const p of s.pictures) {
      if (!p.media) continue;
      if (!byMedia.has(p.media)) byMedia.set(p.media, []);
      byMedia.get(p.media).push(p);
    }
  }
  const queue = [...byMedia.entries()];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [part, pics] = job;
      const type = MIME[part.split('.').pop().toLowerCase()];
      const bytes = media.get(part);
      if (!type || !bytes) {
        stats.skippedMedia += 1;
        continue;
      }
      const bitmap = await createImageBitmap(new Blob([bytes], { type }));
      media.delete(part); // drop the compressed bytes as soon as they are decoded
      for (const p of pics) {
        const [l, t, r, b] = p.crop.map((v) => Math.max(0, v) / 100000); // negative = padding, not rendered here
        const sx = bitmap.width * l;
        const sy = bitmap.height * t;
        const sw = bitmap.width * (1 - l - r);
        const sh = bitmap.height * (1 - t - b);
        if (sw < 1 || sh < 1) continue;
        const scale = opts.maxEdge ? Math.min(1, opts.maxEdge / Math.max(sw, sh)) : 1;
        const tw = Math.max(1, Math.round(sw * scale));
        const th = Math.max(1, Math.round(sh * scale));
        const canvas = new OffscreenCanvas(tw, th);
        canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, tw, th);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
        if (blob.type !== 'image/webp') throw new Error(`encode: got ${blob.type}`);
        stats.crops += 1;
        stats.webpBytes += blob.size;
        stats.decodedPixels += bitmap.width * bitmap.height;
      }
      bitmap.close();
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency }, worker));
}

// ---------------------------------------------------------------- entry

export async function runParse(file, options = {}) {
  const opts = { strategy: 'unzip', caps: DEFAULT_CAPS, maxEdge: 2400, concurrency: 4, ...options };
  if (opts.caps === true) opts.caps = DEFAULT_CAPS;
  const stats = { entries: 0, declaredUncompressed: 0, maxRatio: 0, inflatedXmlBytes: 0, inflatedMediaBytes: 0, crops: 0, webpBytes: 0, decodedPixels: 0, skippedMedia: 0 };
  const t0 = performance.now();
  let stage = 'open';
  try {
    const read = await openArchive(file, opts.strategy, opts.caps, stats);
    stage = 'unzip-xml';
    const files = await read((name) => PASS1.test(name), true);
    for (const b of files.values()) stats.inflatedXmlBytes += b.length;
    stage = 'manifest';
    const manifest = buildManifest(files);
    files.clear();
    const wanted = new Set(manifest.slides.flatMap((s) => s.pictures.map((p) => p.media)).filter(Boolean));
    const tXml = performance.now() - t0;
    stage = 'unzip-media';
    const media = await read((name) => wanted.has(name), false);
    for (const b of media.values()) stats.inflatedMediaBytes += b.length;
    const missingMedia = [...wanted].filter((m) => !media.has(m)).length;
    const tManifest = performance.now() - t0;
    stage = 'crops';
    await cropAll(manifest, media, opts, stats);
    const tCrops = performance.now() - t0;
    return {
      ok: true,
      tXmlMs: Math.round(tXml),
      tManifestMs: Math.round(tManifest),
      tCropsMs: Math.round(tCrops),
      stats,
      missingMedia,
      uniqueMedia: wanted.size,
      manifest: {
        slideSize: manifest.slideSize,
        slides: manifest.slides.map((s) => ({ key: s.key, part: s.part, notesUrl: /https?:\/\//.test(s.notesText), pictures: s.pictures.map(({ kind, bbox, crop, link }) => ({ kind, bbox, crop, link })) })),
      },
    };
  } catch (e) {
    return { ok: false, stage, error: String(e?.message ?? e), elapsedMs: Math.round(performance.now() - t0), stats };
  }
}
