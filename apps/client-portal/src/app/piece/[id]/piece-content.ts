/**
 * The shaping behind the public piece page (SP-03).
 *
 * Pure on purpose: everything that decides what a stranger reads about a piece
 * lives here, so it can be tested without a Next runtime or a database.
 *
 * Honesty rules it enforces (C5), each of which the app got wrong somewhere:
 *   • no "Unknown Maker" — a piece with no resolvable maker says nothing about
 *     one, rather than printing a placeholder over a provenance marketplace;
 *   • no "$0" — a piece with no price says nothing about price;
 *   • no invented dimensions or lead times — a missing column omits its line.
 */

export interface PieceVendorRef {
  name: string | null;
}

export interface PieceRow {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  price_retail: number | null;
  images: string[] | null;
  dimensions: unknown;
  lead_time_weeks: number | null;
  vendors: PieceVendorRef | PieceVendorRef[] | null;
}

export interface PieceView {
  id: string;
  name: string;
  /** products.brand, else the vendor's name, else nothing. */
  maker: string | null;
  /** Formatted from integer cents, or null. */
  price: string | null;
  imageUrl: string | null;
  blurb: string | null;
  /** e.g. 96″ W × 40″ D × 30″ H */
  size: string | null;
  /** e.g. Ships in about 10 weeks */
  leadTime: string | null;
  /** Custom scheme, so an installed app can be handed the piece directly. */
  appLink: string;
}

function firstVendorName(vendors: PieceRow["vendors"]): string | null {
  if (!vendors) return null;
  const vendor = Array.isArray(vendors) ? vendors[0] : vendors;
  const name = vendor?.name?.trim();
  return name ? name : null;
}

function formatCents(cents: number | null): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents))
    return null;
  if (cents <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const UNIT_MARK: Record<string, string> = { in: "″", cm: " cm" };

function formatDimensions(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const width = Number(d.width);
  const depth = Number(d.depth);
  const height = Number(d.height);
  const parts: string[] = [];
  const unit = typeof d.unit === "string" ? d.unit : "in";
  const mark = UNIT_MARK[unit] ?? ` ${unit}`;
  if (Number.isFinite(width) && width > 0) parts.push(`${width}${mark} W`);
  if (Number.isFinite(depth) && depth > 0) parts.push(`${depth}${mark} D`);
  if (Number.isFinite(height) && height > 0) parts.push(`${height}${mark} H`);
  return parts.length ? parts.join(" × ") : null;
}

function formatLeadTime(weeks: number | null): string | null {
  if (weeks === null || weeks === undefined || !Number.isFinite(weeks))
    return null;
  if (weeks <= 0) return null;
  return `Ships in about ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

export function toPieceView(row: PieceRow): PieceView {
  const brand = row.brand?.trim();
  const images = (row.images ?? []).filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  const blurb = row.description?.trim();
  return {
    id: row.id,
    name: row.name,
    maker: brand ? brand : firstVendorName(row.vendors),
    price: formatCents(row.price_retail),
    imageUrl: images[0] ?? null,
    blurb: blurb ? blurb : null,
    size: formatDimensions(row.dimensions),
    leadTime: formatLeadTime(row.lead_time_weeks),
    appLink: `patina://piece/${row.id}`,
  };
}

export interface PieceMetadata {
  title: string;
  description: string;
  openGraph: {
    title: string;
    description: string;
    images: string[];
    type: "website";
  };
}

export function pieceMetadata(view: PieceView): PieceMetadata {
  // The single most-cited finding in the review: sharing a chair handed over a
  // sheet titled "Patina Designer Portal". The title is the piece and its maker.
  const title = view.maker ? `${view.name} by ${view.maker}` : view.name;
  const description =
    view.blurb ??
    [view.maker ? `Made by ${view.maker}.` : null, view.price, view.leadTime]
      .filter((line): line is string => Boolean(line))
      .join(" · ") ??
    "";
  return {
    title,
    description: description || `${view.name}, on Patina.`,
    openGraph: {
      title,
      description: description || `${view.name}, on Patina.`,
      images: view.imageUrl ? [view.imageUrl] : [],
      type: "website",
    },
  };
}
