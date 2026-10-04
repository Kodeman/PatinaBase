/**
 * Link collection and filtering. Only http(s) links survive; slide-jump
 * actions, hover links, other schemes and licence/attribution hosts are denied.
 * Denied links are reported (skipped[]), never silently lost.
 */
import type { EmuBox, SkipReason } from "./manifest";
import type {
  RawLinkRef,
  RawOverlay,
  RawParagraph,
  RawPicture,
} from "./walk-slide";

/** Licence, stock and attribution hosts: never a product source. */
export const LICENCE_HOSTS = [
  "creativecommons.org",
  "unsplash.com",
  "pexels.com",
  "pixabay.com",
  "bing.com",
  "freepik.com",
  "shutterstock.com",
  "gettyimages.com",
  "istockphoto.com",
  "stock.adobe.com",
  "pngtree.com",
  "pngwing.com",
  "flaticon.com",
  "wikimedia.org",
];

/** Shorteners a designer may type without a scheme. */
const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "amzn.to",
  "rb.gy",
  "shorturl.at",
  "tiny.cc",
  "cutt.ly",
  "is.gd",
];

/** PowerPoint's stock-photo credit line. */
const ATTRIBUTION_TEXT =
  /\b(?:this photo|this image|photo|image)\b.{0,80}\blicensed under\b/i;

export type LinkVerdict =
  | { ok: true; url: string }
  | { ok: false; reason: SkipReason; detail: string };

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function normalizeUrl(raw: string): string | null {
  let candidate = raw.trim().replace(/[)\].,;:!?'"’”]+$/, "");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate))
    candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Applies every deny rule to a hyperlink target or a bare URL. Null = not a link at all. */
export function classifyLink(
  link: Pick<RawLinkRef, "target" | "action" | "external">,
): LinkVerdict | null {
  if (link.action?.toLowerCase().startsWith("ppaction://")) return null;
  const target = link.target.trim();
  if (!target) return null;
  if (!link.external && !/^[a-z][a-z0-9+.-]*:/i.test(target)) return null; // internal part (slide jump)
  if (!/^https?:\/\//i.test(target)) {
    return {
      ok: false,
      reason: "link_denied",
      detail: target.split(":")[0].toLowerCase() || target,
    };
  }
  const url = normalizeUrl(target);
  if (!url) return { ok: false, reason: "link_denied", detail: target };
  const host = new URL(url).hostname.toLowerCase();
  const licence = LICENCE_HOSTS.find((d) => hostMatches(host, d));
  if (licence) return { ok: false, reason: "link_denied", detail: host };
  return { ok: true, url };
}

const BARE_URL = new RegExp(
  [
    String.raw`\bhttps?:\/\/[^\s<>"'“”]+`,
    String.raw`\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"'“”]*)?`,
    String.raw`\b(?:${SHORTENERS.map((s) => s.replace(/\./g, "\\.")).join("|")})\/[A-Za-z0-9_-]+`,
  ].join("|"),
  "gi",
);

/** http(s), `www.` and scheme-less shortener URLs typed as plain text. */
export function findBareUrls(text: string): string[] {
  const out: string[] = [];
  for (const match of text.match(BARE_URL) ?? []) {
    const url = normalizeUrl(match);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

export function isAttributionText(text: string): boolean {
  return ATTRIBUTION_TEXT.test(text);
}

export interface FoundLink {
  url: string;
  /** Paragraph (or link) text the URL sits in, for the resolver. */
  context: string;
}

export interface Denied {
  target: string;
  reason: SkipReason;
  detail: string;
}

export interface LinkHarvest {
  links: FoundLink[];
  denied: Denied[];
}

function contextOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat;
}

/**
 * Every link in a block of text: the shape's own link, run hyperlinks, and
 * bare URLs. A stock-photo attribution block has all its links denied.
 */
export function harvestLinks(
  paragraphs: RawParagraph[],
  shapeLink: RawLinkRef | null = null,
): LinkHarvest {
  const out: LinkHarvest = { links: [], denied: [] };
  const attribution = isAttributionText(
    paragraphs.map((p) => p.text).join(" "),
  );
  const add = (url: string, context: string) => {
    if (!out.links.some((l) => l.url === url))
      out.links.push({ url, context: contextOf(context) });
  };
  const consider = (ref: RawLinkRef, context: string) => {
    const verdict = classifyLink(ref);
    if (!verdict) return;
    if (attribution)
      out.denied.push({
        target: ref.target,
        reason: "attribution_link",
        detail: ref.text || ref.target,
      });
    else if (verdict.ok) add(verdict.url, context);
    else
      out.denied.push({
        target: ref.target,
        reason: verdict.reason,
        detail: verdict.detail,
      });
  };
  if (shapeLink) consider(shapeLink, paragraphs.map((p) => p.text).join(" "));
  for (const p of paragraphs) {
    for (const ref of p.links) consider(ref, p.text);
    for (const url of findBareUrls(p.text)) {
      consider(
        { target: url, action: null, external: true, text: url },
        p.text,
      );
    }
  }
  return out;
}

export function area(box: EmuBox): number {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

export function intersection(a: EmuBox, b: EmuBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Overlap as a share of the smaller box. */
export function overlapRatio(a: EmuBox, b: EmuBox): number {
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? intersection(a, b) / smaller : 0;
}

export type OverlayMatch =
  | { picture: string; ratio: number }
  | { picture: null; reason: "none" | "ambiguous" };

/**
 * A linked shape laid over a picture (≥50% of the smaller box). When it covers
 * more than one picture it must beat the runner-up clearly, else it abstains.
 */
export function matchOverlay(
  overlay: Pick<RawOverlay, "aabb">,
  pictures: Pick<RawPicture, "key" | "aabb" | "kind">[],
): OverlayMatch {
  const scored = pictures
    .filter((p) => p.kind !== "background")
    .map((p) => ({ picture: p.key, ratio: overlapRatio(overlay.aabb, p.aabb) }))
    .filter((s) => s.ratio >= 0.5)
    .sort((a, b) => b.ratio - a.ratio);
  if (scored.length === 0) return { picture: null, reason: "none" };
  if (scored.length > 1 && scored[0].ratio - scored[1].ratio < 0.25)
    return { picture: null, reason: "ambiguous" };
  return scored[0];
}
