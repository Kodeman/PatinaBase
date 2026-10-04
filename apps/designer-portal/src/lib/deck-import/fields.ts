/**
 * Product fields from a caption/ticket and its links. Precision first: a field
 * is filled only when the text says it plainly; two different prices yield none.
 */
import type { Dimensions, ExtractedFields } from "./manifest";

/**
 * Port of `parsePriceToCents` from supabase/functions/capture-from-url/extract.ts.
 * US-centric: `,` is a thousands separator and `.` the decimal point. A bare
 * integer is whole dollars. Null when nothing numeric is present.
 */
export function parsePriceToCents(
  raw: string | number | null | undefined,
): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  }
  const cleaned = String(raw).replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const noThousands = cleaned.replace(/,/g, "");
  const value = Number(noThousands);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * Copy of RETAILER_MAP from apps/extension/src/lib/extraction/retailer.ts
 * (the extension is a separate build; keep the two in step by hand).
 */
export const RETAILER_MAP: Record<string, string> = {
  "restorationhardware.com": "Restoration Hardware",
  "rh.com": "Restoration Hardware",
  "cb2.com": "CB2",
  "crateandbarrel.com": "Crate & Barrel",
  "westelm.com": "West Elm",
  "potterybarn.com": "Pottery Barn",
  "potterybarnkids.com": "Pottery Barn Kids",
  "arhaus.com": "Arhaus",
  "roomandboard.com": "Room & Board",
  "article.com": "Article",
  "wayfair.com": "Wayfair",
  "allmodern.com": "AllModern",
  "jossandmain.com": "Joss & Main",
  "birchlane.com": "Birch Lane",
  "ethanallen.com": "Ethan Allen",
  "bassettfurniture.com": "Bassett",
  "haverty.com": "Haverty's",
  "ikea.com": "IKEA",
  "target.com": "Target",
  "amazon.com": "Amazon",
  "overstock.com": "Overstock",
  "homedepot.com": "The Home Depot",
  "lowes.com": "Lowe's",
  "williams-sonoma.com": "Williams Sonoma",
  "serenaandlily.com": "Serena & Lily",
  "ballarddesigns.com": "Ballard Designs",
  "anthropologie.com": "Anthropologie",
  "urbanoutfitters.com": "Urban Outfitters",
  "zgallerie.com": "Z Gallerie",
  "lumens.com": "Lumens",
  "ylighting.com": "YLighting",
  "design-within-reach.com": "Design Within Reach",
  "dwr.com": "Design Within Reach",
  "hermanmiller.com": "Herman Miller",
  "knoll.com": "Knoll",
  "vitra.com": "Vitra",
  "hay.dk": "HAY",
  "muuto.com": "Muuto",
  "fritzhansen.com": "Fritz Hansen",
  "kartell.com": "Kartell",
  "flos.com": "Flos",
  "artek.fi": "Artek",
  "cassina.com": "Cassina",
  "bebitalia.com": "B&B Italia",
  "poliform.com": "Poliform",
  "minotti.com": "Minotti",
  "flexform.it": "Flexform",
  "ligne-roset.com": "Ligne Roset",
  "natuzzi.com": "Natuzzi",
  "burkedecor.com": "Burke Decor",
  "1stdibs.com": "1stDibs",
  "chairish.com": "Chairish",
  "luluandgeorgia.com": "Lulu and Georgia",
  "mcgeeandco.com": "McGee & Co.",
  "rejuvenation.com": "Rejuvenation",
  "schoolhouse.com": "Schoolhouse",
  "interiordefine.com": "Interior Define",
  "joybird.com": "Joybird",
  "burrow.com": "Burrow",
  "floyd.com": "Floyd",
  "inside-weather.com": "Inside Weather",
  "apt2b.com": "Apt2B",
};

/** Known retailer for a URL (exact host or subdomain), else null. */
export function vendorFromUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (RETAILER_MAP[host]) return RETAILER_MAP[host];
  for (const [domain, name] of Object.entries(RETAILER_MAP)) {
    if (host.endsWith(`.${domain}`)) return name;
  }
  return null;
}

const PRICE =
  /(?:US\$|\$|USD\s?)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?!\d)|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?\s?USD\b/gi;

/** One clear price, in cents. Two different prices (trade vs retail) are left for a human. */
export function extractPriceCents(text: string): number | null {
  const values = new Set<number>();
  for (const m of text.matchAll(PRICE)) {
    const cents = parsePriceToCents(
      m[1] ? `${m[1]}.${m[2] ?? "00"}` : `${m[3]}.${m[4] ?? "00"}`,
    );
    if (cents != null && cents > 0) values.add(cents);
  }
  return values.size === 1 ? [...values][0] : null;
}

const SKU =
  /\b(?:SKU|Item\s*(?:#|No\.?|Number)|Model\s*(?:#|No\.?|Number)?|Style\s*#|Art\.?\s*No\.?|Ref\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{2,})/i;

export function extractSku(text: string): string | null {
  const m = SKU.exec(text);
  if (!m) return null;
  const sku = m[1].replace(/[.]+$/, "");
  return /\d/.test(sku) ? sku : null;
}

const UNIT = String.raw`(?:"|”|″|''|in\b\.?|inch(?:es)?\b|cm\b)?`;
const NUM = String.raw`(\d+(?:\.\d+)?)`;
const AXIS = String.raw`\s*([WDHL])?`;
const DIMS = new RegExp(
  `${NUM}\\s*${UNIT}${AXIS}\\s*[x×X]\\s*${NUM}\\s*${UNIT}${AXIS}\\s*[x×X]\\s*${NUM}\\s*${UNIT}${AXIS}`,
);
const LABELLED =
  /\b([WDH])\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:"|”|″|in\b\.?|cm\b)?/g;

function axisName(
  letter: string | undefined,
): keyof Pick<Dimensions, "width" | "depth" | "height"> | null {
  switch (letter?.toUpperCase()) {
    case "W":
    case "L":
      return "width";
    case "D":
      return "depth";
    case "H":
      return "height";
    default:
      return null;
  }
}

/** `84"W x 38"D x 30"H`, `84 x 38 x 30 in`, `W 84 D 38 H 30`. */
export function extractDimensions(text: string): Dimensions | null {
  const m = DIMS.exec(text);
  if (m) {
    const unit = /cm\b/i.test(m[0]) ? "cm" : "in";
    const dims: Dimensions = { unit, raw: m[0].trim() };
    const positional: Array<
      keyof Pick<Dimensions, "width" | "depth" | "height">
    > = ["width", "depth", "height"];
    const labels = [m[2], m[4], m[6]].map(axisName);
    const labelled = labels.every(Boolean) && new Set(labels).size === 3;
    [m[1], m[3], m[5]].forEach((value, i) => {
      dims[labelled ? labels[i]! : positional[i]] = Number(value);
    });
    return dims;
  }
  const found: Partial<Record<"width" | "depth" | "height", number>> = {};
  const parts: string[] = [];
  for (const lm of text.matchAll(LABELLED)) {
    const axis = axisName(lm[1]);
    if (axis && found[axis] == null) {
      found[axis] = Number(lm[2]);
      parts.push(lm[0].trim());
    }
  }
  if (Object.keys(found).length < 2) return null;
  return {
    ...found,
    unit: /cm\b/i.test(parts.join(" ")) ? "cm" : "in",
    raw: parts.join(" "),
  };
}

const MAKER_LINE =
  /^\s*(?:maker|vendor|brand|manufacturer|by|from|source)\s*[:\-–]\s*(.+)$/i;

const URLISH =
  /\S*(?:https?:\/\/|www\.|\.(?:com|ly|co|net|org|dk|it|fi|to|gl|gy|at|cc|gd)\/)\S*/gi;

/** A line's product name once URLs, prices and price labels are taken out. */
function nameFromLine(line: string): string | null {
  if (MAKER_LINE.test(line) || extractSku(line) || extractDimensions(line))
    return null;
  const stripped = line
    .replace(URLISH, " ")
    .replace(PRICE, " ")
    .replace(/\b(?:msrp|retail|trade|price|net)\b\s*:?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—·|,:;]+|[\s\-–—·|,:;]+$/g, "")
    .trim();
  return stripped.length >= 3 && /[A-Za-z]{2}/.test(stripped) ? stripped : null;
}

/** Caption text plus the paired links → extracted fields. */
export function extractFields(
  caption: string | null,
  links: string[],
): ExtractedFields {
  const out: ExtractedFields = {};
  const text = caption ?? "";
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const name = lines.map(nameFromLine).find(Boolean);
  if (name) out.name = name.slice(0, 200);
  const price = extractPriceCents(text);
  if (price != null) out.price_cents = price;
  const sku = extractSku(text);
  if (sku) out.sku = sku;
  const dims = extractDimensions(text);
  if (dims) out.dims = dims;
  const maker = lines.map((l) => MAKER_LINE.exec(l)?.[1]?.trim()).find(Boolean);
  const vendor = maker ?? links.map(vendorFromUrl).find(Boolean) ?? null;
  if (vendor) out.vendor = vendor;
  return out;
}
