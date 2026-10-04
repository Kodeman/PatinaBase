/**
 * Walks one slide's `p:cSld/p:spTree` into pictures, text blocks and link
 * overlays with absolute slide geometry (EMU). Layout and master parts are read
 * only to inherit placeholder geometry: their own images are never emitted.
 */
import type { ElementKind, EmuBox, SkippedItem, SrcRect } from "./manifest";
import {
  NS,
  boolAttr,
  child,
  childrenOf,
  numAttr,
  parseXml,
  path,
  readRels,
  relId,
  type PackageFiles,
  type Relationship,
} from "./xml";

// ---------------------------------------------------------------- geometry

/** x' = a·x + c·y + e, y' = b·x + d·y + f */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** m ∘ n: apply n first. */
export function compose(m: Affine, n: Affine): Affine {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export interface Xfrm {
  x: number;
  y: number;
  cx: number;
  cy: number;
  /** Degrees clockwise. */
  rot: number;
  flipH: boolean;
  flipV: boolean;
  ch?: { x: number; y: number; cx: number; cy: number };
}

export function readXfrm(el: Element | null): Xfrm | null {
  const off = child(el, NS.a, "off");
  const ext = child(el, NS.a, "ext");
  if (!el || !off || !ext) return null;
  const chOff = child(el, NS.a, "chOff");
  const chExt = child(el, NS.a, "chExt");
  return {
    x: numAttr(off, "x"),
    y: numAttr(off, "y"),
    cx: numAttr(ext, "cx"),
    cy: numAttr(ext, "cy"),
    rot: numAttr(el, "rot") / 60000,
    flipH: boolAttr(el, "flipH"),
    flipV: boolAttr(el, "flipV"),
    ch:
      chOff && chExt
        ? {
            x: numAttr(chOff, "x"),
            y: numAttr(chOff, "y"),
            cx: numAttr(chExt, "cx"),
            cy: numAttr(chExt, "cy"),
          }
        : undefined,
  };
}

/** Child space → parent space for a `p:grpSp`: scale/offset, then flip and rotate about the group centre. */
export function groupAffine(x: Xfrm): Affine {
  const ch = x.ch ?? { x: x.x, y: x.y, cx: x.cx, cy: x.cy };
  const sx = ch.cx ? x.cx / ch.cx : 1;
  const sy = ch.cy ? x.cy / ch.cy : 1;
  const scale: Affine = {
    a: sx,
    b: 0,
    c: 0,
    d: sy,
    e: x.x - ch.x * sx,
    f: x.y - ch.y * sy,
  };
  const t = (x.rot * Math.PI) / 180;
  const fh = x.flipH ? -1 : 1;
  const fv = x.flipV ? -1 : 1;
  const a = Math.cos(t) * fh;
  const b = Math.sin(t) * fh;
  const c = -Math.sin(t) * fv;
  const d = Math.cos(t) * fv;
  const px = x.x + x.cx / 2;
  const py = x.y + x.cy / 2;
  const turn: Affine = {
    a,
    b,
    c,
    d,
    e: px - (a * px + c * py),
    f: py - (b * px + d * py),
  };
  return compose(turn, scale);
}

export interface Placement {
  bbox: EmuBox;
  aabb: EmuBox;
  rot: number;
  flip_h: boolean;
  flip_v: boolean;
}

function round(value: number, places = 0): number {
  const k = 10 ** places;
  return Math.round(value * k) / k;
}

export function rotatedAabb(box: EmuBox, rot: number): EmuBox {
  const t = (rot * Math.PI) / 180;
  const w = Math.abs(box.w * Math.cos(t)) + Math.abs(box.h * Math.sin(t));
  const h = Math.abs(box.w * Math.sin(t)) + Math.abs(box.h * Math.cos(t));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    x: round(cx - w / 2),
    y: round(cy - h / 2),
    w: round(w),
    h: round(h),
  };
}

/** Places a leaf frame through the composed group transform. */
export function place(m: Affine, x: Xfrm): Placement {
  const lx = x.x + x.cx / 2;
  const ly = x.y + x.cy / 2;
  const cx = m.a * lx + m.c * ly + m.e;
  const cy = m.b * lx + m.d * ly + m.f;
  const t = (x.rot * Math.PI) / 180;
  const ux = m.a * Math.cos(t) + m.c * Math.sin(t);
  const uy = m.b * Math.cos(t) + m.d * Math.sin(t);
  const vx = -m.a * Math.sin(t) + m.c * Math.cos(t);
  const vy = -m.b * Math.sin(t) + m.d * Math.cos(t);
  const w = x.cx * Math.hypot(ux, uy);
  const h = x.cy * Math.hypot(vx, vy);
  const mirror = m.a * m.d - m.b * m.c < 0;
  let rot = (Math.atan2(uy, ux) * 180) / Math.PI + (mirror ? 180 : 0);
  rot = round(((rot % 360) + 360) % 360, 4);
  if (rot === 360) rot = 0;
  const bbox = {
    x: round(cx - w / 2),
    y: round(cy - h / 2),
    w: round(w),
    h: round(h),
  };
  return {
    bbox,
    aabb: rotatedAabb(bbox, rot),
    rot,
    flip_h: x.flipH !== mirror,
    flip_v: x.flipV,
  };
}

// ---------------------------------------------------------------- raw model

export interface RawLinkRef {
  /** Rel target (external URL, or an internal part for slide jumps). */
  target: string;
  /** `action` attribute, e.g. `ppaction://hlinksldjump`. */
  action: string | null;
  external: boolean;
  /** Visible text the link sits on. */
  text: string;
}

export interface RawParagraph {
  text: string;
  links: RawLinkRef[];
}

export interface RawPicture {
  key: string;
  kind: ElementKind;
  media: string | null;
  media_type: string | null;
  remote_url: string | null;
  bbox: EmuBox;
  aabb: EmuBox;
  rot: number;
  flip_h: boolean;
  flip_v: boolean;
  z: number;
  group_path: string[];
  src_rect: SrcRect | null;
  alt: string | null;
  shape_link: RawLinkRef | null;
  /** Text typed inside a picture-filled shape. */
  own_text: RawParagraph[];
}

export interface RawTableRow {
  frame_key: string;
  row: number;
  /** Cell texts in column order ('' for empty or picture cells). */
  cells: string[];
  picture_keys: string[];
}

export interface RawText {
  key: string;
  bbox: EmuBox | null;
  aabb: EmuBox | null;
  z: number;
  group_path: string[];
  paragraphs: RawParagraph[];
  text: string;
  shape_link: RawLinkRef | null;
  is_title: boolean;
  table?: RawTableRow;
}

export interface RawOverlay {
  key: string;
  aabb: EmuBox;
  z: number;
  group_path: string[];
  link: RawLinkRef;
}

export interface RawSlide {
  index: number;
  part: string;
  hidden: boolean;
  title: string | null;
  pictures: RawPicture[];
  texts: RawText[];
  overlays: RawOverlay[];
  notes: RawParagraph[];
  skipped: SkippedItem[];
}

export const RASTER_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

// ---------------------------------------------------------------- context

export interface DeckWalkContext {
  files: PackageFiles;
  entryNames: Set<string>;
  slideSize: { cx: number; cy: number };
  /** Running z across the deck (document order). */
  z: { next: number };
  docs?: Map<string, Element | null>;
  rels?: Map<string, Map<string, Relationship>>;
}

function docRoot(
  ctx: DeckWalkContext,
  part: string | null | undefined,
): Element | null {
  if (!part) return null;
  ctx.docs ??= new Map();
  if (!ctx.docs.has(part)) {
    const bytes = ctx.files.get(part);
    ctx.docs.set(part, bytes ? parseXml(bytes, part).documentElement : null);
  }
  return ctx.docs.get(part) ?? null;
}

function relsOf(ctx: DeckWalkContext, part: string): Map<string, Relationship> {
  ctx.rels ??= new Map();
  let rels = ctx.rels.get(part);
  if (!rels) {
    rels = readRels(ctx.files, part);
    ctx.rels.set(part, rels);
  }
  return rels;
}

function relOfType(
  rels: Map<string, Relationship>,
  type: string,
): Relationship | null {
  for (const rel of rels.values()) if (rel.type === type) return rel;
  return null;
}

// ---------------------------------------------------------------- placeholders

interface Placeholder {
  type: string;
  idx: string | null;
}

function placeholderOf(nvPr: Element | null): Placeholder | null {
  const ph = child(nvPr, NS.p, "ph");
  if (!ph) return null;
  return {
    type: ph.getAttribute("type") ?? "obj",
    idx: ph.getAttribute("idx"),
  };
}

function masterType(type: string): string {
  if (type === "ctrTitle" || type === "title") return "title";
  if (
    [
      "subTitle",
      "obj",
      "pic",
      "tbl",
      "chart",
      "dgm",
      "media",
      "clipArt",
      "body",
    ].includes(type)
  )
    return "body";
  return type;
}

function shapeNvPr(el: Element): Element | null {
  for (const nv of ["nvSpPr", "nvPicPr", "nvGraphicFramePr", "nvGrpSpPr"]) {
    const found = child(el, NS.p, nv);
    if (found) return child(found, NS.p, "nvPr");
  }
  return null;
}

function findPlaceholderShape(
  root: Element | null,
  want: Placeholder,
  byIdx: boolean,
): Element | null {
  const tree = path(root, [NS.p, "cSld"], [NS.p, "spTree"]);
  for (const el of Array.from(tree?.children ?? [])) {
    const ph = placeholderOf(shapeNvPr(el));
    if (!ph) continue;
    if (
      byIdx
        ? want.idx != null && ph.idx === want.idx
        : masterType(ph.type) === masterType(want.type)
    )
      return el;
  }
  return null;
}

function spPrXfrm(el: Element | null): Xfrm | null {
  return readXfrm(child(child(el, NS.p, "spPr"), NS.a, "xfrm"));
}

/** Layout placeholder (by idx, then type), then master placeholder (by type). */
function inheritedXfrm(
  ctx: DeckWalkContext,
  slidePart: string,
  ph: Placeholder,
): Xfrm | null {
  const layout = relOfType(relsOf(ctx, slidePart), "slideLayout")?.part ?? null;
  const layoutRoot = docRoot(ctx, layout);
  const layoutShape =
    findPlaceholderShape(layoutRoot, ph, true) ??
    findPlaceholderShape(layoutRoot, ph, false);
  const fromLayout = spPrXfrm(layoutShape);
  if (fromLayout) return fromLayout;
  if (!layout) return null;
  const master = relOfType(relsOf(ctx, layout), "slideMaster")?.part ?? null;
  const layoutPh =
    placeholderOf(layoutShape ? shapeNvPr(layoutShape) : null) ?? ph;
  return spPrXfrm(findPlaceholderShape(docRoot(ctx, master), layoutPh, false));
}

// ---------------------------------------------------------------- text and links

function linkRef(
  hlink: Element | null,
  rels: Map<string, Relationship>,
  text: string,
): RawLinkRef | null {
  if (!hlink) return null;
  const id = relId(hlink, "id");
  const rel = id ? rels.get(id) : undefined;
  const action = hlink.getAttribute("action");
  if (!rel && !action) return null;
  return {
    target: rel?.target ?? "",
    action,
    external: rel?.external ?? false,
    text,
  };
}

export function readParagraphs(
  txBody: Element | null,
  rels: Map<string, Relationship>,
): RawParagraph[] {
  const out: RawParagraph[] = [];
  for (const p of childrenOf(txBody, NS.a, "p")) {
    let text = "";
    const links: RawLinkRef[] = [];
    for (const node of Array.from(p.children)) {
      if (node.namespaceURI !== NS.a) continue;
      if (node.localName === "br") {
        text += "\n";
      } else if (node.localName === "r" || node.localName === "fld") {
        const t = child(node, NS.a, "t")?.textContent ?? "";
        text += t;
        const link = linkRef(
          child(child(node, NS.a, "rPr"), NS.a, "hlinkClick"),
          rels,
          t,
        );
        if (link) links.push(link);
      }
    }
    out.push({ text, links });
  }
  return out;
}

export function paragraphsText(paragraphs: RawParagraph[]): string {
  return paragraphs
    .map((p) => p.text)
    .join("\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ---------------------------------------------------------------- pictures

type BlipResult =
  | {
      ok: true;
      media: string | null;
      media_type: string | null;
      remote_url: string | null;
    }
  | { ok: false; reason: SkippedItem["reason"]; detail: string };

function resolveBlip(
  blipFill: Element | null,
  rels: Map<string, Relationship>,
  ctx: DeckWalkContext,
): BlipResult | null {
  const blip = child(blipFill, NS.a, "blip");
  if (!blip) return null;
  // The main blip only: an SVG sits in extLst (svgBlip) with this PNG as its fallback,
  // and an HD Photo `.wdp` hangs off a14:imgProps; both are ignored.
  const embed = relId(blip, "embed");
  if (embed) {
    const rel = rels.get(embed);
    const part = rel?.part ?? null;
    if (!part || !ctx.entryNames.has(part))
      return {
        ok: false,
        reason: "missing_media",
        detail: rel?.target ?? embed,
      };
    const ext = part.split(".").pop()?.toLowerCase() ?? "";
    const type = RASTER_TYPES[ext];
    if (!type) return { ok: false, reason: "unsupported_format", detail: ext };
    return { ok: true, media: part, media_type: type, remote_url: null };
  }
  const link = relId(blip, "link");
  if (link) {
    const rel = rels.get(link);
    const target = rel?.target ?? "";
    if (rel?.external && /^https?:\/\//i.test(target)) {
      return { ok: true, media: null, media_type: null, remote_url: target };
    }
    return { ok: false, reason: "linked_image_unsupported", detail: target };
  }
  return null;
}

function srcRectOf(blipFill: Element | null): SrcRect | null {
  const rect = child(blipFill, NS.a, "srcRect");
  if (!rect) return null;
  const v = (k: string) => numAttr(rect, k) / 100000;
  const out = { l: v("l"), t: v("t"), r: v("r"), b: v("b") };
  return out.l || out.t || out.r || out.b ? out : null;
}

const MEDIA_NS_P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main";

function mediaKind(nvPr: Element | null): "video" | "audio" | null {
  if (!nvPr) return null;
  if (child(nvPr, NS.a, "videoFile") || child(nvPr, NS.a, "quickTimeFile"))
    return "video";
  if (child(nvPr, NS.a, "audioFile") || child(nvPr, NS.a, "wavAudioFile"))
    return "audio";
  if (nvPr.getElementsByTagNameNS(MEDIA_NS_P14, "media").length > 0)
    return "video";
  return null;
}

// ---------------------------------------------------------------- walk

interface WalkState {
  ctx: DeckWalkContext;
  slide: RawSlide;
  rels: Map<string, Relationship>;
}

function shapeKey(state: WalkState, cNvPr: Element | null): string {
  return `${state.slide.part}#${cNvPr?.getAttribute("id") ?? `z${state.ctx.z.next}`}`;
}

function leafXfrm(
  state: WalkState,
  el: Element,
  nvPr: Element | null,
): Xfrm | null {
  const own = spPrXfrm(el);
  if (own) return own;
  const ph = placeholderOf(nvPr);
  return ph ? inheritedXfrm(state.ctx, state.slide.part, ph) : null;
}

function skip(
  state: WalkState,
  key: string | null,
  reason: SkippedItem["reason"],
  detail?: string,
) {
  state.slide.skipped.push({
    slide_index: state.slide.index,
    element_key: key,
    reason,
    ...(detail ? { detail } : {}),
  });
}

function addPicture(
  state: WalkState,
  el: Element,
  kind: ElementKind,
  blipFill: Element | null,
  cNvPr: Element | null,
  nvPr: Element | null,
  m: Affine,
  groupPath: string[],
  ownText: RawParagraph[],
): boolean {
  const key = shapeKey(state, cNvPr);
  const media = mediaKind(nvPr);
  if (media) {
    skip(state, key, media);
    return true;
  }
  const blip = resolveBlip(blipFill, state.rels, state.ctx);
  if (!blip) return false;
  if (!blip.ok) {
    skip(state, key, blip.reason, blip.detail);
    return true;
  }
  const xfrm = leafXfrm(state, el, nvPr);
  if (!xfrm) {
    skip(state, key, "missing_media", "no geometry");
    return true;
  }
  const placed = place(m, xfrm);
  const descr =
    cNvPr?.getAttribute("descr")?.trim() ||
    cNvPr?.getAttribute("title")?.trim() ||
    null;
  state.slide.pictures.push({
    key,
    kind,
    media: blip.media,
    media_type: blip.media_type,
    remote_url: blip.remote_url,
    ...placed,
    z: state.ctx.z.next++,
    group_path: groupPath,
    src_rect: srcRectOf(blipFill),
    alt: descr,
    shape_link: linkRef(child(cNvPr, NS.a, "hlinkClick"), state.rels, ""),
    own_text: ownText,
  });
  return true;
}

function walkTable(
  state: WalkState,
  frame: Element,
  m: Affine,
  groupPath: string[],
) {
  const cNvPr = path(frame, [NS.p, "nvGraphicFramePr"], [NS.p, "cNvPr"]);
  const frameKey = shapeKey(state, cNvPr);
  const xfrm = readXfrm(child(frame, NS.p, "xfrm"));
  const tbl = path(
    frame,
    [NS.a, "graphic"],
    [NS.a, "graphicData"],
    [NS.a, "tbl"],
  );
  if (!xfrm || !tbl) return;
  const widths = childrenOf(child(tbl, NS.a, "tblGrid"), NS.a, "gridCol").map(
    (c) => numAttr(c, "w"),
  );
  let y = xfrm.y;
  childrenOf(tbl, NS.a, "tr").forEach((tr, r) => {
    const h = numAttr(tr, "h");
    const cells: string[] = [];
    const pictureKeys: string[] = [];
    const paragraphs: RawParagraph[] = [];
    let textBox: EmuBox | null = null;
    let col = 0;
    for (const tc of childrenOf(tr, NS.a, "tc")) {
      const span = Math.max(1, numAttr(tc, "gridSpan", 1));
      const x = xfrm.x + widths.slice(0, col).reduce((s, w) => s + w, 0);
      const w = widths.slice(col, col + span).reduce((s, v) => s + v, 0);
      const c = col;
      col += span;
      if (boolAttr(tc, "hMerge") || boolAttr(tc, "vMerge")) continue;
      const cellParas = readParagraphs(child(tc, NS.a, "txBody"), state.rels);
      const cellText = paragraphsText(cellParas);
      const blipFill = child(child(tc, NS.a, "tcPr"), NS.a, "blipFill");
      const cellFrame: Xfrm = {
        x,
        y,
        cx: w,
        cy: h,
        rot: 0,
        flipH: false,
        flipV: false,
      };
      if (blipFill) {
        const key = `${frameKey}/r${r}c${c}`;
        const blip = resolveBlip(blipFill, state.rels, state.ctx);
        if (blip && !blip.ok) {
          skip(state, key, blip.reason, blip.detail);
        } else if (blip) {
          pictureKeys.push(key);
          state.slide.pictures.push({
            key,
            kind: "table_cell",
            media: blip.media,
            media_type: blip.media_type,
            remote_url: blip.remote_url,
            ...place(m, cellFrame),
            z: state.ctx.z.next++,
            group_path: groupPath,
            src_rect: srcRectOf(blipFill),
            alt: null,
            shape_link: null,
            own_text: [],
          });
        }
      }
      cells.push(cellText);
      if (cellText) {
        paragraphs.push(...cellParas);
        const box = place(m, cellFrame).aabb;
        textBox = textBox ? union(textBox, box) : box;
      }
    }
    if (textBox) {
      state.slide.texts.push({
        key: `${frameKey}/r${r}`,
        bbox: textBox,
        aabb: textBox,
        z: state.ctx.z.next++,
        group_path: groupPath,
        paragraphs,
        text: cells.filter(Boolean).join("\n"),
        shape_link: null,
        is_title: false,
        table: {
          frame_key: frameKey,
          row: r,
          cells,
          picture_keys: pictureKeys,
        },
      });
    }
    y += h;
  });
}

export function union(a: EmuBox, b: EmuBox): EmuBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

const OLE_URI = "http://schemas.openxmlformats.org/presentationml/2006/ole";

function walkTree(
  state: WalkState,
  container: Element,
  m: Affine,
  groupPath: string[],
) {
  for (const el of Array.from(container.children)) {
    if (el.namespaceURI === NS.mc && el.localName === "AlternateContent") {
      const choice = child(el, NS.mc, "Choice");
      if (choice) walkTree(state, choice, m, groupPath);
      continue;
    }
    if (el.namespaceURI !== NS.p) continue;
    switch (el.localName) {
      case "grpSp": {
        const cNvPr = path(el, [NS.p, "nvGrpSpPr"], [NS.p, "cNvPr"]);
        const xfrm = readXfrm(child(child(el, NS.p, "grpSpPr"), NS.a, "xfrm"));
        const inner = xfrm ? compose(m, groupAffine(xfrm)) : m;
        walkTree(state, el, inner, [
          ...groupPath,
          cNvPr?.getAttribute("id") ?? `z${state.ctx.z.next}`,
        ]);
        break;
      }
      case "pic": {
        const nv = child(el, NS.p, "nvPicPr");
        addPicture(
          state,
          el,
          "picture",
          child(el, NS.p, "blipFill"),
          child(nv, NS.p, "cNvPr"),
          child(nv, NS.p, "nvPr"),
          m,
          groupPath,
          [],
        );
        break;
      }
      case "sp":
        walkShape(state, el, m, groupPath);
        break;
      case "graphicFrame": {
        const uri =
          path(el, [NS.a, "graphic"], [NS.a, "graphicData"])?.getAttribute(
            "uri",
          ) ?? "";
        if (uri.endsWith("/table")) walkTable(state, el, m, groupPath);
        else if (uri === OLE_URI) {
          skip(
            state,
            shapeKey(
              state,
              path(el, [NS.p, "nvGraphicFramePr"], [NS.p, "cNvPr"]),
            ),
            "ole_object",
          );
        }
        break;
      }
      default:
        break;
    }
  }
}

function walkShape(
  state: WalkState,
  el: Element,
  m: Affine,
  groupPath: string[],
) {
  const nv = child(el, NS.p, "nvSpPr");
  const cNvPr = child(nv, NS.p, "cNvPr");
  const nvPr = child(nv, NS.p, "nvPr");
  const paragraphs = readParagraphs(child(el, NS.p, "txBody"), state.rels);
  const text = paragraphsText(paragraphs);
  const blipFill = child(child(el, NS.p, "spPr"), NS.a, "blipFill");
  if (
    blipFill &&
    addPicture(
      state,
      el,
      "picture_fill",
      blipFill,
      cNvPr,
      nvPr,
      m,
      groupPath,
      text ? paragraphs : [],
    )
  )
    return;

  const xfrm = leafXfrm(state, el, nvPr);
  const placed = xfrm ? place(m, xfrm) : null;
  const shapeLink = linkRef(child(cNvPr, NS.a, "hlinkClick"), state.rels, text);
  const key = shapeKey(state, cNvPr);
  if (text) {
    const ph = placeholderOf(nvPr);
    state.slide.texts.push({
      key,
      bbox: placed?.bbox ?? null,
      aabb: placed?.aabb ?? null,
      z: state.ctx.z.next++,
      group_path: groupPath,
      paragraphs,
      text,
      shape_link: shapeLink,
      is_title: ph != null && (ph.type === "title" || ph.type === "ctrTitle"),
    });
  } else if (shapeLink && placed) {
    state.slide.overlays.push({
      key,
      aabb: placed.aabb,
      z: state.ctx.z.next++,
      group_path: groupPath,
      link: shapeLink,
    });
  }
}

const NOTES_SKIP = new Set(["sldNum", "sldImg", "hdr", "ftr", "dt"]);

function readNotes(ctx: DeckWalkContext, slidePart: string): RawParagraph[] {
  const notesPart =
    relOfType(relsOf(ctx, slidePart), "notesSlide")?.part ?? null;
  const root = docRoot(ctx, notesPart);
  if (!root || !notesPart) return [];
  const rels = relsOf(ctx, notesPart);
  const out: RawParagraph[] = [];
  const tree = path(root, [NS.p, "cSld"], [NS.p, "spTree"]);
  for (const sp of Array.from(tree?.getElementsByTagNameNS(NS.p, "sp") ?? [])) {
    const ph = placeholderOf(path(sp, [NS.p, "nvSpPr"], [NS.p, "nvPr"]));
    if (ph && NOTES_SKIP.has(ph.type)) continue;
    out.push(...readParagraphs(child(sp, NS.p, "txBody"), rels));
  }
  return out.filter((p) => p.text.trim() || p.links.length);
}

export function walkSlide(
  ctx: DeckWalkContext,
  index: number,
  part: string,
): RawSlide {
  const root = docRoot(ctx, part);
  const slide: RawSlide = {
    index,
    part,
    hidden: root?.getAttribute("show") === "0",
    title: null,
    pictures: [],
    texts: [],
    overlays: [],
    notes: [],
    skipped: [],
  };
  if (!root) return slide;
  const state: WalkState = { ctx, slide, rels: relsOf(ctx, part) };
  const cSld = child(root, NS.p, "cSld");

  const bgFill = path(cSld, [NS.p, "bg"], [NS.p, "bgPr"], [NS.a, "blipFill"]);
  if (bgFill) {
    const blip = resolveBlip(bgFill, state.rels, ctx);
    const key = `${part}#bg`;
    if (blip && !blip.ok) skip(state, key, blip.reason, blip.detail);
    else if (blip) {
      const full = { x: 0, y: 0, w: ctx.slideSize.cx, h: ctx.slideSize.cy };
      slide.pictures.push({
        key,
        kind: "background",
        media: blip.media,
        media_type: blip.media_type,
        remote_url: blip.remote_url,
        bbox: full,
        aabb: full,
        rot: 0,
        flip_h: false,
        flip_v: false,
        z: ctx.z.next++,
        group_path: [],
        src_rect: srcRectOf(bgFill),
        alt: null,
        shape_link: null,
        own_text: [],
      });
    }
  }

  const tree = child(cSld, NS.p, "spTree");
  if (tree) walkTree(state, tree, IDENTITY, []);
  const title = slide.texts.find((t) => t.is_title);
  slide.title = title ? title.text.replace(/\s+/g, " ").trim() || null : null;
  slide.notes = readNotes(ctx, part);
  return slide;
}
