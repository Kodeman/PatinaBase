/**
 * Deterministic caption/link ↔ picture association. Precision over recall: a
 * wrong pairing costs the designer more than an unpaired link, so every tier
 * either decides on an explicit signal or abstains. Every http(s) link that is
 * not paired lands in `unpaired` with its text context — never dropped.
 *
 * Priority: link on the picture > overlay link shape > table row with an image
 * cell > numbered legend > shared innermost group > caption below/above >
 * caption to the side, the last two solved jointly (Hungarian) per connected
 * component with a margin. A geometric pairing below MARGIN_MIN is abstained
 * and the slide is flagged `needs_adjudication` for the Wave 3 resolver.
 */
import type {
  AssociationBasis,
  ElementLink,
  EmuBox,
  LinkSource,
  SkippedItem,
  TextRole,
  UnpairedLink,
  UnpairedLinkSource,
} from "./manifest";
import {
  classifyLink,
  harvestLinks,
  isAttributionText,
  matchOverlay,
  type FoundLink,
} from "./links";
import {
  paragraphsText,
  union,
  type RawParagraph,
  type RawPicture,
  type RawSlide,
  type RawTableRow,
  type RawText,
} from "./walk-slide";

export const MARGIN_MIN = 0.15;
const UNMATCHED_COST = 1;
const INF = 1e6;
/** Pictures + texts in one geometric component before we refuse to guess. */
const MAX_COMPONENT = 40;

export interface PicturePairing {
  links: ElementLink[];
  caption: string | null;
  caption_keys: string[];
  basis: AssociationBasis | null;
  margin: number | null;
  legend_number: number | null;
}

export interface SlideAssociation {
  pictures: Map<string, PicturePairing>;
  unpaired: UnpairedLink[];
  textRoles: Map<string, TextRole>;
  textLinks: Map<string, string[]>;
  margin: number | null;
  needs_adjudication: boolean;
  denied: SkippedItem[];
}

interface TextBlock {
  key: string;
  keys: string[];
  box: EmuBox | null;
  text: string;
  paragraphs: RawParagraph[];
  links: FoundLink[];
  group_path: string[];
  is_title: boolean;
  table?: RawTableRow;
  consumed: boolean;
}

interface LegendEntry {
  number: number;
  text: string;
  links: FoundLink[];
}

interface Legend {
  slide: number;
  block: TextBlock;
  entries: LegendEntry[];
}

const MARKER = /^\s*[#(]?\s*(\d{1,2})\s*[).:]?\s*$/;
const LEGEND_LINE = /^\s*(?:#|No\.?\s*)?(\d{1,2})\s*[.):\-–—]?\s+(\S[\s\S]*)$/;

function emptyPairing(): PicturePairing {
  return {
    links: [],
    caption: null,
    caption_keys: [],
    basis: null,
    margin: null,
    legend_number: null,
  };
}

function addLink(
  pairing: PicturePairing,
  url: string,
  source: LinkSource,
  text?: string,
) {
  if (pairing.links.some((l) => l.url === url)) return;
  pairing.links.push(text ? { url, source, text } : { url, source });
}

function center(box: EmuBox) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function distanceToBox(p: { x: number; y: number }, box: EmuBox): number {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.w));
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.h));
  return Math.hypot(dx, dy);
}

function span(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

// ---------------------------------------------------------------- text blocks

function buildBlocks(
  slide: RawSlide,
  denied: SkippedItem[],
  textLinks: Map<string, string[]>,
): TextBlock[] {
  const harvest = (t: RawText) => {
    const h = harvestLinks(t.paragraphs, t.shape_link);
    for (const d of h.denied)
      denied.push({
        slide_index: slide.index,
        element_key: t.key,
        reason: d.reason,
        detail: d.detail,
      });
    textLinks.set(
      t.key,
      h.links.map((l) => l.url),
    );
    return h.links;
  };
  const pictureGroups = new Set(slide.pictures.flatMap((p) => p.group_path));
  const byGroup = new Map<string, RawText[]>();
  const blocks: TextBlock[] = [];
  for (const t of slide.texts) {
    const g = t.group_path[t.group_path.length - 1];
    if (g && !pictureGroups.has(g) && !t.is_title && !t.table) {
      byGroup.set(g, [...(byGroup.get(g) ?? []), t]);
      continue;
    }
    blocks.push({
      key: t.key,
      keys: [t.key],
      box: t.aabb,
      text: t.text,
      paragraphs: t.paragraphs,
      links: harvest(t),
      group_path: t.group_path,
      is_title: t.is_title,
      table: t.table,
      consumed: false,
    });
  }
  // A "grouped text box" ticket: several text boxes grouped together, no picture inside.
  for (const [g, members] of byGroup) {
    const sorted = [...members].sort(
      (a, b) =>
        (a.aabb?.y ?? 0) - (b.aabb?.y ?? 0) ||
        (a.aabb?.x ?? 0) - (b.aabb?.x ?? 0),
    );
    const boxes = sorted
      .map((m) => m.aabb)
      .filter((b): b is EmuBox => b != null);
    const links: FoundLink[] = [];
    for (const m of sorted)
      for (const l of harvest(m))
        if (!links.some((x) => x.url === l.url)) links.push(l);
    blocks.push({
      key: sorted.length > 1 ? `${slide.part}#${g}` : sorted[0].key,
      keys: sorted.map((m) => m.key),
      box: boxes.length ? boxes.reduce(union) : null,
      text: sorted.map((m) => m.text).join("\n"),
      paragraphs: sorted.flatMap((m) => m.paragraphs),
      links,
      group_path: sorted[0].group_path,
      is_title: false,
      consumed: false,
    });
  }
  return blocks;
}

// ---------------------------------------------------------------- markers and legends

type MarkerHit = { picture: string } | { picture: null };

function markerPicture(block: TextBlock, pictures: RawPicture[]): MarkerHit {
  if (!block.box) return { picture: null };
  const c = center(block.box);
  const candidates = pictures.filter((p) => p.kind !== "background");
  const containing = candidates.filter((p) => distanceToBox(c, p.aabb) === 0);
  if (containing.length === 1) return { picture: containing[0].key };
  if (containing.length > 1) {
    const sorted = [...containing].sort(
      (a, b) => a.aabb.w * a.aabb.h - b.aabb.w * b.aabb.h,
    );
    const [first, second] = sorted;
    return first.aabb.w * first.aabb.h < 0.5 * second.aabb.w * second.aabb.h
      ? { picture: first.key }
      : { picture: null };
  }
  const ranked = candidates
    .map((p) => ({ p, d: distanceToBox(c, p.aabb) }))
    .sort((a, b) => a.d - b.d);
  const [best, next] = ranked;
  if (!best || best.d > 0.25 * Math.min(best.p.aabb.w, best.p.aabb.h))
    return { picture: null };
  if (next && next.d < 2 * best.d) return { picture: null };
  return { picture: best.p.key };
}

function legendFromParagraphs(block: TextBlock): LegendEntry[] {
  const entries: Array<{ number: number; paragraphs: RawParagraph[] }> = [];
  for (const p of block.paragraphs) {
    const m = LEGEND_LINE.exec(p.text);
    if (m)
      entries.push({
        number: Number(m[1]),
        paragraphs: [{ ...p, text: m[2] }],
      });
    else if (entries.length && p.text.trim())
      entries[entries.length - 1].paragraphs.push(p);
  }
  return entries.map((e) => ({
    number: e.number,
    text: paragraphsText(e.paragraphs),
    links: harvestLinks(e.paragraphs).links,
  }));
}

function distinctNumbers(entries: LegendEntry[]): boolean {
  return (
    entries.length >= 2 &&
    new Set(entries.map((e) => e.number)).size === entries.length
  );
}

/** Splits blocks into markers / legends and records their roles. */
function findLegends(
  slideIndex: number,
  blocks: TextBlock[],
  roles: Map<string, TextRole>,
): { markers: TextBlock[]; legends: Legend[] } {
  const markers: TextBlock[] = [];
  const legends: Legend[] = [];
  const setRole = (b: TextBlock, role: TextRole) =>
    b.keys.forEach((k) => roles.set(k, role));
  const tableRows = new Map<string, TextBlock[]>();
  for (const b of blocks) {
    if (b.is_title) continue;
    if (b.table) {
      if (
        b.table.picture_keys.length === 0 &&
        /^\s*\d{1,2}\s*[.)]?\s*$/.test(b.table.cells[0] ?? "")
      ) {
        tableRows.set(b.table.frame_key, [
          ...(tableRows.get(b.table.frame_key) ?? []),
          b,
        ]);
      }
      continue;
    }
    if (MARKER.test(b.text)) {
      markers.push(b);
      setRole(b, "marker");
      continue;
    }
    const entries = legendFromParagraphs(b);
    if (distinctNumbers(entries)) {
      legends.push({ slide: slideIndex, block: b, entries });
      setRole(b, "legend");
    }
  }
  for (const rows of tableRows.values()) {
    const entries = rows.map((r) => ({
      number: Number(/\d+/.exec(r.table!.cells[0])![0]),
      text: r.table!.cells.slice(1).filter(Boolean).join("\n"),
      links: r.links,
    }));
    if (!distinctNumbers(entries)) continue;
    rows.forEach((r, i) => {
      legends.push({ slide: slideIndex, block: r, entries: [entries[i]] });
      setRole(r, "legend");
    });
  }
  return { markers, legends };
}

// ---------------------------------------------------------------- assignment

/** Min-cost perfect matching on a square matrix (Kuhn–Munkres, O(n³)). Returns row → column. */
export function hungarian(cost: number[][]): {
  total: number;
  match: number[];
} {
  const n = cost.length;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const match = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j += 1) if (p[j] > 0) match[p[j] - 1] = j - 1;
  return { total: match.reduce((s, j, i) => s + cost[i][j], 0), match };
}

interface Candidate {
  cost: number;
  basis: AssociationBasis;
}

/** Caption geometry relative to a picture, or null when it is not a candidate. */
export function captionCandidate(pic: EmuBox, text: EmuBox): Candidate | null {
  const options: Candidate[] = [];
  const xov =
    span(pic.x, pic.x + pic.w, text.x, text.x + text.w) /
    Math.min(pic.w, text.w);
  const yov =
    span(pic.y, pic.y + pic.h, text.y, text.y + text.h) /
    Math.min(pic.h, text.h);
  if (xov >= 0.5) {
    const below = text.y - (pic.y + pic.h);
    if (below >= -0.1 * pic.h && below < 0.5 * pic.h) {
      options.push({
        cost: Math.max(below, 0) / pic.h + 0.3 * (1 - xov),
        basis: "caption_below",
      });
    }
    const above = pic.y - (text.y + text.h);
    if (above >= -0.1 * pic.h && above < 0.5 * pic.h) {
      options.push({
        cost: 0.1 + Math.max(above, 0) / pic.h + 0.3 * (1 - xov),
        basis: "caption_above",
      });
    }
  }
  if (yov >= 0.5) {
    const right = text.x - (pic.x + pic.w);
    const left = pic.x - (text.x + text.w);
    const gap =
      right >= -0.1 * pic.w ? right : left >= -0.1 * pic.w ? left : null;
    if (gap != null && gap < 0.5 * pic.w) {
      options.push({
        cost: 0.2 + Math.max(gap, 0) / pic.w + 0.3 * (1 - Math.min(yov, 1)),
        basis: "caption_side",
      });
    }
  }
  if (options.length === 0) return null;
  return options.reduce((a, b) => (b.cost < a.cost ? b : a));
}

interface GeometricPair {
  picture: string;
  text: TextBlock;
  basis: AssociationBasis;
  margin: number;
}

/**
 * Solves one connected component: pictures and texts each may stay unmatched
 * (picture cost UNMATCHED_COST, text 0). A pair's margin is how much the best
 * total worsens when that pair is forbidden.
 */
function solveComponent(
  pictures: string[],
  texts: TextBlock[],
  cands: Map<string, Candidate>,
): GeometricPair[] {
  const P = pictures.length;
  const T = texts.length;
  const n = P + T;
  const pairKey = (i: number, j: number) => `${pictures[i]}|${texts[j].key}`;
  const build = (forbid?: [number, number]) => {
    const m = Array.from({ length: n }, () => new Array<number>(n).fill(INF));
    for (let i = 0; i < P; i += 1) {
      for (let j = 0; j < T; j += 1) {
        const c = cands.get(pairKey(i, j));
        if (c && !(forbid && forbid[0] === i && forbid[1] === j))
          m[i][j] = c.cost;
      }
      m[i][T + i] = UNMATCHED_COST;
    }
    for (let k = 0; k < T; k += 1) {
      m[P + k][k] = 0;
      for (let l = 0; l < P; l += 1) m[P + k][T + l] = 0;
    }
    return m;
  };
  const best = hungarian(build());
  const out: GeometricPair[] = [];
  for (let i = 0; i < P; i += 1) {
    const j = best.match[i];
    if (j < 0 || j >= T) continue;
    const alt = hungarian(build([i, j]));
    const c = cands.get(pairKey(i, j))!;
    out.push({
      picture: pictures[i],
      text: texts[j],
      basis: c.basis,
      margin: Math.round(Math.min(alt.total - best.total, 1) * 1000) / 1000,
    });
  }
  return out;
}

// ---------------------------------------------------------------- deck

function captionFrom(
  pairing: PicturePairing,
  block: TextBlock,
  basis: AssociationBasis,
  source: LinkSource,
  margin: number,
) {
  pairing.caption = block.table
    ? block.table.cells.filter(Boolean).join("\n")
    : block.text;
  pairing.caption_keys = block.keys;
  pairing.basis = basis;
  pairing.margin = margin;
  for (const l of block.links) addLink(pairing, l.url, source);
  block.consumed = true;
}

export function associateDeck(slides: RawSlide[]): SlideAssociation[] {
  const results: SlideAssociation[] = slides.map((s) => ({
    pictures: new Map(s.pictures.map((p) => [p.key, emptyPairing()])),
    unpaired: [],
    textRoles: new Map(),
    textLinks: new Map(),
    margin: null,
    needs_adjudication: false,
    denied: [],
  }));
  const blocksBySlide = slides.map((s, i) =>
    buildBlocks(s, results[i].denied, results[i].textLinks),
  );
  const unpaired = (
    i: number,
    url: string,
    context: string,
    source: UnpairedLinkSource,
  ) => {
    const list = results[i].unpaired;
    if (!list.some((u) => u.url === url && u.source === source))
      list.push({ url, text_context: context, source });
  };

  // Markers and legends, deck-wide (a shopping-list slide may key pictures on another slide).
  const markerMaps = slides.map((s, i) => {
    const { markers, legends } = findLegends(
      s.index,
      blocksBySlide[i],
      results[i].textRoles,
    );
    const byNumber = new Map<number, string | null>();
    for (const m of markers) {
      const n = Number(MARKER.exec(m.text)![1]);
      const hit = markerPicture(m, s.pictures);
      if (!hit.picture) results[i].needs_adjudication = true;
      byNumber.set(n, byNumber.has(n) ? null : hit.picture);
      m.consumed = true;
    }
    return { byNumber, legends };
  });
  const allLegends = markerMaps.flatMap((m) => m.legends);
  for (const legend of allLegends) {
    const own = slides[legend.slide];
    const numbers = legend.entries.map((e) => e.number);
    const covers = (i: number) =>
      numbers.every((n) => markerMaps[i].byNumber.has(n));
    let target: number | null = null;
    if (own.pictures.some((p) => p.kind !== "background")) {
      target = legend.slide;
    } else {
      for (let d = 1; d < slides.length && target == null; d += 1) {
        if (legend.slide - d >= 0 && covers(legend.slide - d))
          target = legend.slide - d;
      }
      for (let d = 1; d < slides.length && target == null; d += 1) {
        if (legend.slide + d < slides.length && covers(legend.slide + d))
          target = legend.slide + d;
      }
    }
    for (const entry of legend.entries) {
      let slideIdx = target;
      if (slideIdx == null) {
        const holders = markerMaps
          .map((m, i) => (m.byNumber.has(entry.number) ? i : -1))
          .filter((i) => i >= 0);
        slideIdx = holders.length === 1 ? holders[0] : null;
      }
      const picture =
        slideIdx != null
          ? (markerMaps[slideIdx].byNumber.get(entry.number) ?? null)
          : null;
      const pairing =
        picture && slideIdx != null
          ? results[slideIdx].pictures.get(picture)
          : undefined;
      if (pairing && pairing.basis == null) {
        pairing.caption = entry.text;
        pairing.caption_keys = legend.block.keys;
        pairing.basis = "legend";
        pairing.margin = 1;
        pairing.legend_number = entry.number;
        for (const l of entry.links) addLink(pairing, l.url, "legend");
      } else {
        for (const l of entry.links)
          unpaired(legend.slide, l.url, l.context, "legend");
      }
    }
    legend.block.consumed = true;
  }

  slides.forEach((slide, i) => {
    const result = results[i];
    const blocks = blocksBySlide[i];
    const pairing = (key: string) => result.pictures.get(key)!;

    for (const b of blocks) {
      if (b.is_title) b.keys.forEach((k) => result.textRoles.set(k, "title"));
      else if (isAttributionText(b.text)) {
        b.keys.forEach((k) => result.textRoles.set(k, "attribution"));
        b.consumed = true;
      }
    }

    // 1. Link on the picture itself; text typed inside a picture-filled shape.
    for (const pic of slide.pictures) {
      const pr = pairing(pic.key);
      if (pic.shape_link) {
        const verdict = classifyLink(pic.shape_link);
        if (verdict?.ok) addLink(pr, verdict.url, "picture");
        else if (verdict)
          result.denied.push({
            slide_index: slide.index,
            element_key: pic.key,
            reason: verdict.reason,
            detail: verdict.detail,
          });
      }
      if (pic.own_text.length && pr.basis == null) {
        pr.caption = paragraphsText(pic.own_text);
        pr.basis = "group";
        pr.margin = 1;
        for (const l of harvestLinks(pic.own_text).links)
          addLink(pr, l.url, "group");
      }
    }

    // 2. Linked overlay shapes.
    for (const ov of slide.overlays) {
      const verdict = classifyLink(ov.link);
      if (!verdict) continue;
      if (!verdict.ok) {
        result.denied.push({
          slide_index: slide.index,
          element_key: ov.key,
          reason: verdict.reason,
          detail: verdict.detail,
        });
        continue;
      }
      const hit = matchOverlay(ov, slide.pictures);
      if (hit.picture !== null)
        addLink(pairing(hit.picture), verdict.url, "overlay");
      else {
        unpaired(i, verdict.url, ov.link.text, "overlay");
        if (hit.reason === "ambiguous") result.needs_adjudication = true;
      }
    }

    // 3. Table row holding exactly one image cell.
    for (const b of blocks) {
      if (b.consumed || !b.table || b.table.picture_keys.length !== 1) continue;
      const pr = pairing(b.table.picture_keys[0]);
      if (pr.basis == null) captionFrom(pr, b, "table_row", "table_row", 1);
    }

    // 4. Shared innermost group: the first enclosing group with text decides, if it holds one picture.
    const free = (b: TextBlock) =>
      !b.consumed &&
      !b.is_title &&
      !result.textRoles.has(b.keys[0]) &&
      !b.table?.picture_keys.length;
    for (const pic of slide.pictures) {
      const pr = pairing(pic.key);
      if (pr.basis != null || pic.kind === "background") continue;
      for (let g = pic.group_path.length - 1; g >= 0; g -= 1) {
        const group = pic.group_path[g];
        const texts = blocks.filter(
          (b) => free(b) && b.group_path.includes(group),
        );
        if (texts.length === 0) continue;
        const pics = slide.pictures.filter((p) => p.group_path.includes(group));
        if (pics.length === 1) {
          const merged: TextBlock = {
            ...texts[0],
            keys: texts.flatMap((t) => t.keys),
            text: texts.map((t) => t.text).join("\n"),
            links: texts.flatMap((t) => t.links),
            table: undefined,
          };
          captionFrom(pr, merged, "group", "group", 1);
          texts.forEach((t) => (t.consumed = true));
        }
        break;
      }
    }

    // 5. Captions below/above/beside, solved jointly with margins.
    const pictures = slide.pictures.filter(
      (p) => p.kind !== "background" && pairing(p.key).basis == null,
    );
    const texts = blocks.filter((b) => free(b) && b.box);
    const cands = new Map<string, Candidate>();
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      while (parent.get(x) !== x) x = parent.get(x)!;
      return x;
    };
    for (const p of pictures) parent.set(p.key, p.key);
    for (const t of texts) parent.set(t.key, t.key);
    for (const p of pictures) {
      for (const t of texts) {
        const c = captionCandidate(p.aabb, t.box!);
        if (!c) continue;
        cands.set(`${p.key}|${t.key}`, c);
        parent.set(find(p.key), find(t.key));
      }
    }
    const components = new Map<
      string,
      { pictures: string[]; texts: TextBlock[] }
    >();
    for (const p of pictures) {
      const root = find(p.key);
      if (![...cands.keys()].some((k) => k.startsWith(`${p.key}|`))) continue;
      const comp = components.get(root) ?? { pictures: [], texts: [] };
      comp.pictures.push(p.key);
      components.set(root, comp);
    }
    for (const t of texts) components.get(find(t.key))?.texts.push(t);
    const margins: number[] = [];
    for (const comp of components.values()) {
      if (comp.pictures.length + comp.texts.length > MAX_COMPONENT) {
        result.needs_adjudication = true;
        continue;
      }
      for (const pair of solveComponent(comp.pictures, comp.texts, cands)) {
        margins.push(pair.margin);
        if (pair.margin < MARGIN_MIN) {
          result.needs_adjudication = true;
          continue;
        }
        captionFrom(
          pairing(pair.picture),
          pair.text,
          pair.basis,
          "caption",
          pair.margin,
        );
      }
    }
    result.margin = margins.length ? Math.min(...margins) : null;

    // 6. Whatever is left keeps its links as unpaired, with context.
    for (const b of blocks) {
      if (b.consumed) {
        if (!result.textRoles.has(b.keys[0]))
          b.keys.forEach((k) => result.textRoles.set(k, "caption"));
        continue;
      }
      if (!result.textRoles.has(b.keys[0]))
        b.keys.forEach((k) => result.textRoles.set(k, "text"));
      for (const l of b.links) unpaired(i, l.url, l.context, "text");
    }
    const notes = harvestLinks(slide.notes);
    for (const d of notes.denied)
      result.denied.push({
        slide_index: slide.index,
        element_key: null,
        reason: d.reason,
        detail: d.detail,
      });
    for (const l of notes.links) unpaired(i, l.url, l.context, "notes");
  });

  return results;
}
