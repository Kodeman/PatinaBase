// Shared spec-sheet PDF builder for Supabase Edge Functions (Wave 2).
//
// Two documents, one styling language ported from _shared/po-pdf.ts (the
// procurement PO builder): a per-item Specification sheet and a per-project
// Specification schedule. Same @react-pdf/renderer approach proven by the
// W4-T1 spike — version pins, React.createElement (edge functions are .ts, no
// JSX), base-14 Helvetica (no Font.register, nothing fetched at render time),
// brand palette (#2C2926 ink · #5C4A3C muted · #E5E2DD rule), LETTER page,
// 56pt padding.
//
// The MODEL builders (buildScheduleModel / buildItemModel / computeRecordPct)
// are PURE and react-pdf-free so the money-visibility gating is unit-testable
// without parsing PDF bytes. CLIENT pricing only — trade price, markup, and
// margin have NO field anywhere in these models by construction; the
// money-never-trade guarantee is STRUCTURAL, not a runtime filter you could
// forget to apply.

// deno-lint-ignore-file no-import-prefix

import React from 'npm:react@19.1.0';
import {
  Document,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from 'npm:@react-pdf/renderer@4.3.0';

const h = React.createElement;

// ─── Visibility contract ─────────────────────────────────────────────────────

/**
 * What the client is allowed to see on a shared spec document. Structurally
 * identical to the `ShareVisibility` record being defined in packages/utils —
 * NOT imported here on purpose (avoids cross-branch coupling; integration
 * reconciles the import). Every flag defaults to true (undefined === visible);
 * gating is expressed as `flag !== false`.
 */
export interface SpecVisibility {
  pricing?: boolean;
  supplierIdentity?: boolean;
  sourceUrls?: boolean;
  leadTimes?: boolean;
  itemDetails?: boolean;
}

// ─── Schedule model (pure) ───────────────────────────────────────────────────

/** One normalized line the edge fn hands us (source-agnostic: pre- or post-sale). */
export interface SpecLineInput {
  code: string | null; // doc_code
  name: string;
  quantity: number;
  leadLabel: string | null; // caller-computed (bucket label pre-sale, eta date post-sale)
  clientUnitCents: number | null; // unit_sell_price OR unit_price_cents — CLIENT price
  lineTotalCents: number | null; // line_total_cents
  supplierName: string | null; // vendor_name
  itemType: 'fixed' | 'allowance' | 'tbd';
  recordVerified: boolean; // computeRecordPct === 100
}

/**
 * A rendered schedule line. There is deliberately NO trade / markup / margin
 * field on this type — money-never-trade is enforced by the shape, not by a
 * filter. `clientPriceCents` and `supplierName` are OMITTED (key absent) when
 * their visibility flag is off.
 */
export interface SpecLine {
  code: string | null;
  name: string;
  quantity: number;
  leadLabel: string | null;
  clientPriceCents?: number;
  supplierName?: string;
}

export interface SpecSection {
  roomName: string;
  lines: SpecLine[];
  subtotalCents?: number; // present only when pricing is visible
}

export interface SpecScheduleModel {
  sections: SpecSection[];
  documentTotalCents?: number; // present only when pricing is visible
  verifiedCount: number;
  totalCount: number;
  showPricing: boolean;
  showSupplier: boolean;
}

/**
 * Fold normalized sections into the render model, applying visibility gating.
 *
 * Rules (all unit-tested):
 *   · showPricing  = visibility.pricing         !== false
 *   · showSupplier = visibility.supplierIdentity !== false
 *   · clientPriceCents on a line is set ONLY when showPricing (and the input
 *     unit price is non-null); otherwise the key is ABSENT.
 *   · supplierName on a line is set ONLY when showSupplier AND the input name
 *     is truthy; otherwise ABSENT.
 *   · subtotalCents / documentTotalCents are set ONLY when showPricing (= Σ of
 *     lineTotalCents, treating null as 0); otherwise ABSENT.
 *   · verifiedCount / totalCount count input lines across every section.
 * Trade / markup / margin are never read or emitted.
 */
export function buildScheduleModel(
  sections: { roomName: string; lines: SpecLineInput[] }[],
  visibility: SpecVisibility,
): SpecScheduleModel {
  const showPricing = visibility.pricing !== false;
  const showSupplier = visibility.supplierIdentity !== false;

  let verifiedCount = 0;
  let totalCount = 0;
  let documentTotalCents = 0;

  const outSections: SpecSection[] = sections.map((section) => {
    let subtotalCents = 0;
    const lines: SpecLine[] = section.lines.map((input) => {
      totalCount += 1;
      if (input.recordVerified) verifiedCount += 1;

      const lineTotal = input.lineTotalCents ?? 0;
      subtotalCents += lineTotal;
      documentTotalCents += lineTotal;

      const line: SpecLine = {
        code: input.code,
        name: input.name,
        quantity: input.quantity,
        leadLabel: input.leadLabel,
      };
      // Assign only when visible so `'clientPriceCents' in line` is false when
      // pricing is off (never write an undefined value).
      if (showPricing && input.clientUnitCents != null) {
        line.clientPriceCents = input.clientUnitCents;
      }
      if (showSupplier && input.supplierName) {
        line.supplierName = input.supplierName;
      }
      return line;
    });

    const out: SpecSection = { roomName: section.roomName, lines };
    if (showPricing) out.subtotalCents = subtotalCents;
    return out;
  });

  const model: SpecScheduleModel = {
    sections: outSections,
    verifiedCount,
    totalCount,
    showPricing,
    showSupplier,
  };
  if (showPricing) model.documentTotalCents = documentTotalCents;
  return model;
}

// ─── Item model (pure) ───────────────────────────────────────────────────────

export interface SpecItemCustomField {
  label: string;
  value: string;
}

export interface SpecItemModel {
  studioName: string;
  /** Optional public studio logo URL (Designer Studios). Rendered small in the
   *  header; null/undefined → no logo, byte-identical to the pre-logo output. */
  studioLogoUrl?: string;
  projectName: string;
  name: string;
  code: string | null;
  category: string | null;
  roomName: string | null;
  quantity: number;
  leadLabel: string | null; // null when leadTimes visibility is off
  itemType: 'fixed' | 'allowance' | 'tbd';
  specs: string | null; // description / notes joined
  customFields: SpecItemCustomField[]; // ordered by def sort_order; non-empty values only
  provenance: {
    sourceHost: string | null; // null when sourceUrls visibility is off
    capturedBy: string | null;
    recordPct: number | null;
    brand: string | null;
  };
  imageUrls: string[];
  clientPriceCents?: number; // present ONLY when pricing is visible
}

/** Raw fields the edge fn normalizes before building the item model. */
export interface SpecItemInput {
  studioName: string;
  /** Optional public studio logo URL (Designer Studios). */
  studioLogoUrl?: string;
  projectName: string;
  name: string;
  code: string | null;
  category: string | null;
  roomName: string | null;
  quantity: number;
  leadLabel: string | null;
  itemType: 'fixed' | 'allowance' | 'tbd';
  specs: string | null;
  customFields: SpecItemCustomField[];
  sourceUrl: string | null; // product.source_url — rendered as host only
  capturedBy: string | null; // resolved display name
  recordPct: number | null; // computeRecordPct (null when no linked product)
  brand: string | null;
  imageUrls: string[];
  clientUnitCents: number | null; // CLIENT unit price
}

/** Host portion of a source URL, or null when absent / unparseable. */
function sourceHostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

/**
 * Build the per-item spec model, applying visibility gating:
 *   · clientPriceCents set ONLY when pricing is visible (and unit price given).
 *   · provenance.sourceHost null when sourceUrls is off.
 *   · leadLabel nulled when leadTimes is off (the meta grid drops the cell).
 * Trade / markup / margin never appear.
 */
export function buildItemModel(
  input: SpecItemInput,
  visibility: SpecVisibility,
): SpecItemModel {
  const showPricing = visibility.pricing !== false;
  const showSource = visibility.sourceUrls !== false;
  const showLead = visibility.leadTimes !== false;

  const customFields = input.customFields.filter(
    (f) => f.value != null && String(f.value).trim() !== '',
  );

  const model: SpecItemModel = {
    studioName: input.studioName,
    studioLogoUrl: input.studioLogoUrl,
    projectName: input.projectName,
    name: input.name,
    code: input.code,
    category: input.category,
    roomName: input.roomName,
    quantity: input.quantity,
    leadLabel: showLead ? input.leadLabel : null,
    itemType: input.itemType,
    specs: input.specs,
    customFields,
    provenance: {
      sourceHost: showSource ? sourceHostOf(input.sourceUrl) : null,
      capturedBy: input.capturedBy,
      recordPct: input.recordPct,
      brand: input.brand,
    },
    imageUrls: input.imageUrls,
  };
  if (showPricing && input.clientUnitCents != null) {
    model.clientPriceCents = input.clientUnitCents;
  }
  return model;
}

// ─── Record completeness (mirrors piece-progress.ts, server-side) ────────────

/** The `products` fields the completeness score reads. */
export interface SpecProductRecord {
  name?: string | null;
  brand?: string | null;
  dimensions?: unknown;
  materials?: string[] | null;
  price_retail?: number | null;
  price_trade?: number | null;
  images?: string[] | null;
}

/** Does the JSONB dimensions object carry a real measurement? (piece-progress.ts) */
function hasDimensions(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const dim = d as Record<string, unknown>;
  return ['width', 'depth', 'height'].some((k) => {
    const v = dim[k];
    return v != null && String(v).trim() !== '';
  });
}

/**
 * The Piece Room's completeness percentage, computed server-side exactly as
 * apps/designer-portal/src/lib/document/piece-progress.ts does it. Returns
 * null when there is no linked product (an item with no product is never a
 * verified record). A line is a "verified record" when this === 100.
 */
export function computeRecordPct(
  product: SpecProductRecord | null,
  productStylesCount: number,
): number | null {
  if (!product) return null;
  const identity = !!product.name?.trim() && !!product.brand?.trim();
  const piece = hasDimensions(product.dimensions) &&
    (product.materials?.length ?? 0) > 0;
  const commerce = product.price_retail != null || product.price_trade != null;
  const folio = (product.images?.length ?? 0) >= 1;
  const eye = productStylesCount > 0;
  const fill: [number, number, number] = [
    (identity ? 0.5 : 0) + (piece ? 0.5 : 0),
    (commerce ? 0.5 : 0) + (folio ? 0.5 : 0),
    eye ? 1 : 0,
  ];
  return Math.round(((fill[0] + fill[1] + fill[2]) / 3) * 100);
}

// ─── Board model (pure) — B3 board export ────────────────────────────────────

/** One pin the edge fn hands us, source is proposal_board_items. */
export interface SpecBoardTileInput {
  type: string; // product | capture | image | palette | note | room_scan
  name: string | null; // data.name
  imageUrl: string | null; // image_url ?? data.image_url
  note: string | null; // note content
  swatches: string[]; // palette hexes
  priceCents: number | null; // data.price_cents — CLIENT snapshot price
  sectionId: string | null; // data.section_id
}

export interface SpecBoardInput {
  studioName: string;
  projectName: string;
  boardName: string;
  sections: { id: string; name: string }[]; // proposal_boards.sections
  tiles: SpecBoardTileInput[];
}

/**
 * A rendered board tile. As with SpecLine, there is deliberately NO trade /
 * markup / margin field — money-never-trade is STRUCTURAL. `clientPriceCents`
 * is the ONLY money key and is OMITTED (key absent) when pricing is off or the
 * pin has no price. Board snapshots never carry a trade cost, so a board sheet
 * cannot leak one by construction.
 */
export interface SpecBoardTile {
  name: string | null;
  imageUrl: string | null;
  note: string | null;
  swatches: string[];
  clientPriceCents?: number;
}

export interface SpecBoardSection {
  name: string; // the trailing catch-all is 'Unsectioned'
  tiles: SpecBoardTile[];
}

export interface SpecBoardModel {
  boardName: string;
  sections: SpecBoardSection[];
  showPricing: boolean;
}

const UNSECTIONED_KEY = '__unsectioned__';

/**
 * Group a board's pins into its declared sections (order preserved; empty
 * sections dropped; unsectioned pins in a trailing group). Client price rides
 * only on product/capture tiles, only under `pricing`. Pure — unit-tested.
 */
export function buildBoardModel(
  input: SpecBoardInput,
  visibility: SpecVisibility,
): SpecBoardModel {
  const showPricing = visibility.pricing !== false;
  const nameById = new Map(input.sections.map((s) => [s.id, s.name]));
  const declaredOrder = input.sections.map((s) => s.id);

  const buckets = new Map<string, { name: string; tiles: SpecBoardTile[] }>();
  const order: string[] = [];

  for (const t of input.tiles) {
    const sid = t.sectionId && nameById.has(t.sectionId) ? t.sectionId : UNSECTIONED_KEY;
    const name = sid === UNSECTIONED_KEY ? 'Unsectioned' : nameById.get(sid)!;
    if (!buckets.has(sid)) {
      buckets.set(sid, { name, tiles: [] });
      order.push(sid);
    }
    const tile: SpecBoardTile = {
      name: t.name,
      imageUrl: t.imageUrl,
      note: t.note,
      swatches: t.swatches,
    };
    if (
      showPricing && t.priceCents != null &&
      (t.type === 'product' || t.type === 'capture')
    ) {
      tile.clientPriceCents = t.priceCents;
    }
    buckets.get(sid)!.tiles.push(tile);
  }

  const sections: SpecBoardSection[] = order
    .sort((a, b) => {
      if (a === UNSECTIONED_KEY) return 1;
      if (b === UNSECTIONED_KEY) return -1;
      return declaredOrder.indexOf(a) - declaredOrder.indexOf(b);
    })
    .map((sid) => ({
      name: buckets.get(sid)!.name,
      tiles: buckets.get(sid)!.tiles,
    }));

  return { boardName: input.boardName, sections, showPricing };
}

// ─── Board composition model (pure) — geometry-preserving landscape export ──

export type SpecBoardCompositionPinType =
  | 'product'
  | 'capture'
  | 'image'
  | 'palette'
  | 'note'
  | 'room_scan';

export interface SpecBoardCompositionPinInput {
  /** Optional for frozen project-board snapshots created before item ids. */
  id?: string;
  type: SpecBoardCompositionPinType;
  x: number | string | null;
  y: number | string | null;
  width: number | string | null;
  height: number | string | null;
  resolvedHeight: number | string | null;
  zIndex: number | string | null;
  rotation: number | string | null;
  imageDataUrl: string | null;
  imageRequested: boolean;
  name: string | null;
  vendorName: string | null;
  note: string | null;
  swatches: string[];
  priceCents: number | null;
  sectionId: string | null;
}

export interface SpecBoardCompositionInput {
  studioName: string;
  projectName: string;
  boardName: string;
  canvasWidth: number | string | null;
  canvasHeight: number | string | null;
  backgroundColor: string | null;
  sections: { id: string; name: string; color?: string | null }[];
  pins: SpecBoardCompositionPinInput[];
}

export interface SpecBoardCompositionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpecBoardCompositionPin {
  key: string;
  id?: string;
  sourceIndex: number;
  type: SpecBoardCompositionPinType;
  logicalBox: SpecBoardCompositionRect;
  pageBox: SpecBoardCompositionRect;
  zIndex: number;
  rotation: number;
  imageDataUrl: string | null;
  placeholderLabel: string;
  name: string | null;
  vendorName: string | null;
  note: string | null;
  swatches: string[];
  clientPriceCents?: number;
}

export interface SpecBoardCompositionSection {
  id: string;
  name: string;
  color: string;
  memberKeys: string[];
  logicalBounds: SpecBoardCompositionRect;
  pageBounds: SpecBoardCompositionRect;
}

export interface SpecBoardCompositionWarningMetadata {
  denseBoard: null | {
    pinCount: number;
    pinLimitExceeded: boolean;
    pinsBelowTwentyPoints: string[];
  };
  imagePlaceholders: string[];
}

/**
 * Composition-only client render model. It accepts only the public client
 * price snapshot and has no internal-cost fields by construction.
 */
export interface SpecBoardCompositionModel {
  studioName: string;
  projectName: string;
  boardName: string;
  showPricing: boolean;
  canvas: { width: number; height: number; backgroundColor: string };
  frame: SpecBoardCompositionRect & { scale: number };
  sections: SpecBoardCompositionSection[];
  pins: SpecBoardCompositionPin[];
  warnings: string[];
  warningMetadata: SpecBoardCompositionWarningMetadata;
}

const COMPOSITION_FRAME_AREA = {
  x: 24,
  y: 54,
  width: 744,
  height: 522,
} as const;
const COMPOSITION_DEFAULT_WIDTH = 1200;
const COMPOSITION_DEFAULT_HEIGHT = 800;
const COMPOSITION_DEFAULT_PIN_WIDTH = 240;

function compositionFinite(
  value: number | string | null,
  fallback: number,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compositionPositive(value: number | string | null): number | null {
  const parsed = compositionFinite(value, Number.NaN);
  return parsed > 0 ? parsed : null;
}

function compositionRound(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function compositionAabb(
  rect: SpecBoardCompositionRect,
  degrees: number,
): SpecBoardCompositionRect {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) return { ...rect };
  const radians = (normalized * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const width = rect.width * cos + rect.height * sin;
  const height = rect.width * sin + rect.height * cos;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function compositionPageRect(
  rect: SpecBoardCompositionRect,
  frame: SpecBoardCompositionModel['frame'],
): SpecBoardCompositionRect {
  return {
    x: compositionRound(frame.x + rect.x * frame.scale),
    y: compositionRound(frame.y + rect.y * frame.scale),
    width: compositionRound(rect.width * frame.scale),
    height: compositionRound(rect.height * frame.scale),
  };
}

function safeCompositionColor(
  value: string | null | undefined,
  fallback: string,
): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function compositionPlaceholderLabel(
  type: SpecBoardCompositionPinType,
): string {
  if (type === 'room_scan') return 'Room scan unavailable';
  if (type === 'product' || type === 'capture') {
    return 'Product image unavailable';
  }
  if (type === 'image') return 'Image unavailable';
  return 'Preview unavailable';
}

/**
 * Resolve the same persisted geometry used by the interactive board, fit it
 * into one landscape Letter page, and derive every page coordinate once. Pins
 * stay in ascending z order and rotation remains center-based in the renderer.
 */
export function buildBoardCompositionModel(
  input: SpecBoardCompositionInput,
  visibility: SpecVisibility,
): SpecBoardCompositionModel {
  const canvas = {
    width: compositionPositive(input.canvasWidth) ?? COMPOSITION_DEFAULT_WIDTH,
    height: compositionPositive(input.canvasHeight) ??
      COMPOSITION_DEFAULT_HEIGHT,
    backgroundColor: safeCompositionColor(input.backgroundColor, '#FAF8F5'),
  };
  const scale = Math.min(
    COMPOSITION_FRAME_AREA.width / canvas.width,
    COMPOSITION_FRAME_AREA.height / canvas.height,
  );
  const frame = {
    x: compositionRound(
      COMPOSITION_FRAME_AREA.x +
        (COMPOSITION_FRAME_AREA.width - canvas.width * scale) / 2,
    ),
    y: compositionRound(
      COMPOSITION_FRAME_AREA.y +
        (COMPOSITION_FRAME_AREA.height - canvas.height * scale) / 2,
    ),
    width: compositionRound(canvas.width * scale),
    height: compositionRound(canvas.height * scale),
    scale: compositionRound(scale),
  };
  const showPricing = visibility.pricing !== false;
  const resolved = input.pins
    .map((source, sourceIndex) => {
      const width = compositionPositive(source.width) ??
        COMPOSITION_DEFAULT_PIN_WIDTH;
      const height = compositionPositive(source.height) ??
        compositionPositive(source.resolvedHeight) ??
        compositionRound(
          width *
            (source.type === 'image' || source.type === 'room_scan' ? 0.72 : 1.15),
        );
      const logicalBox = {
        x: compositionFinite(source.x, 0),
        y: compositionFinite(source.y, 0),
        width,
        height,
      };
      return {
        source,
        sourceIndex,
        key: source.id || `snapshot:${sourceIndex}`,
        logicalBox,
        aabb: compositionAabb(
          logicalBox,
          compositionFinite(source.rotation, 0),
        ),
        zIndex: compositionFinite(source.zIndex, 0),
        rotation: compositionFinite(source.rotation, 0),
      };
    })
    .sort((a, b) => a.zIndex - b.zIndex || a.sourceIndex - b.sourceIndex);

  const pins: SpecBoardCompositionPin[] = resolved.map((item) => {
    const pin: SpecBoardCompositionPin = {
      key: item.key,
      sourceIndex: item.sourceIndex,
      type: item.source.type,
      logicalBox: item.logicalBox,
      pageBox: compositionPageRect(item.logicalBox, frame),
      zIndex: item.zIndex,
      rotation: item.rotation,
      imageDataUrl: item.source.imageDataUrl,
      placeholderLabel: compositionPlaceholderLabel(item.source.type),
      name: item.source.name,
      vendorName: item.source.vendorName,
      note: item.source.note,
      swatches: item.source.swatches.filter((color) => /^#[0-9a-f]{6}$/i.test(color)),
    };
    if (item.source.id) pin.id = item.source.id;
    if (
      showPricing &&
      item.source.priceCents != null &&
      (item.source.type === 'product' || item.source.type === 'capture')
    ) {
      pin.clientPriceCents = item.source.priceCents;
    }
    return pin;
  });

  const fallbackSectionColors = ['#C9B7A4', '#B7C5BE', '#C7B9C9', '#D0C2A5'];
  const sections: SpecBoardCompositionSection[] = [];
  input.sections.forEach((section, sectionIndex) => {
    const members = resolved.filter((item) => item.source.sectionId === section.id);
    if (members.length === 0) return;
    const minX = Math.min(...members.map((item) => item.aabb.x));
    const minY = Math.min(...members.map((item) => item.aabb.y));
    const maxX = Math.max(
      ...members.map((item) => item.aabb.x + item.aabb.width),
    );
    const maxY = Math.max(
      ...members.map((item) => item.aabb.y + item.aabb.height),
    );
    const x = Math.max(0, minX - 16);
    const y = Math.max(0, minY - 24);
    const logicalBounds = {
      x,
      y,
      width: maxX + 16 - x,
      height: maxY + 16 - y,
    };
    sections.push({
      id: section.id,
      name: section.name || 'Section',
      color: safeCompositionColor(
        section.color,
        fallbackSectionColors[sectionIndex % fallbackSectionColors.length],
      ),
      memberKeys: members.map((member) => member.key),
      logicalBounds,
      pageBounds: compositionPageRect(logicalBounds, frame),
    });
  });

  const pinsBelowTwentyPoints = pins
    .filter((pin) => pin.pageBox.width < 20 || pin.pageBox.height < 20)
    .map((pin) => pin.key);
  const denseBoard = input.pins.length > 60 || pinsBelowTwentyPoints.length > 0
    ? {
      pinCount: input.pins.length,
      pinLimitExceeded: input.pins.length > 60,
      pinsBelowTwentyPoints,
    }
    : null;
  const imagePlaceholders = resolved
    .filter((item) => item.source.imageRequested && !item.source.imageDataUrl)
    .map((item) => item.key);
  const warnings = [
    ...(denseBoard ? ['dense_board'] : []),
    ...(imagePlaceholders.length > 0 ? ['image_placeholders'] : []),
  ];

  return {
    studioName: input.studioName,
    projectName: input.projectName,
    boardName: input.boardName,
    showPricing,
    canvas,
    frame,
    sections,
    pins,
    warnings,
    warningMetadata: { denseBoard, imagePlaceholders },
  };
}

// ─── Styles (ported from po-pdf.ts) ──────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    padding: 56,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#2C2926',
  },
  header: {
    borderBottom: '1pt solid #2C2926',
    paddingBottom: 16,
    marginBottom: 24,
  },
  // Studio logo (Designer Studios) — small, above the title. Height-capped so a
  // tall logo can't blow out the header; width scales to the intrinsic ratio.
  headerLogo: { height: 30, marginBottom: 10, objectFit: 'contain' },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 9, color: '#5C4A3C' },
  itemCode: {
    fontSize: 11,
    color: '#5C4A3C',
    marginTop: 4,
    fontFamily: 'Courier',
  },
  label: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#5C4A3C',
    marginBottom: 4,
  },
  value: { fontSize: 11 },
  valueSmall: { fontSize: 9, color: '#3D3A36', marginTop: 2 },

  // Item sheet
  metaGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  metaCell: { flex: 1 },
  imageRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  image: {
    width: 120,
    height: 120,
    objectFit: 'cover',
    border: '1pt solid #E5E2DD',
    borderRadius: 2,
  },
  block: { marginBottom: 20 },
  specText: { fontSize: 10, color: '#3D3A36', lineHeight: 1.4 },
  customRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderTop: '1pt solid #E5E2DD',
  },
  customLabel: { flex: 2, fontSize: 9, color: '#5C4A3C' },
  customValue: { flex: 3, fontSize: 10 },
  provenanceText: { fontSize: 9, color: '#5C4A3C' },
  priceValue: { fontSize: 16, fontWeight: 700 },

  // Schedule
  section: { marginBottom: 20 },
  sectionHeading: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  table: { border: '1pt solid #E5E2DD', borderRadius: 2 },
  tableHead: { flexDirection: 'row', backgroundColor: '#E5E2DD', padding: 8 },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderTop: '1pt solid #E5E2DD',
  },
  cellCode: { flex: 2, fontFamily: 'Courier', fontSize: 9 },
  cellName: { flex: 4 },
  cellQty: { flex: 1, textAlign: 'right' },
  cellLead: { flex: 2 },
  cellPrice: { flex: 2, textAlign: 'right' },
  cellSupplier: { flex: 3 },
  subtotalRow: {
    flexDirection: 'row',
    padding: 8,
    borderTop: '1pt solid #2C2926',
  },
  subtotalSpacer: {
    flex: 9,
    textAlign: 'right',
    fontWeight: 700,
    paddingRight: 8,
  },
  subtotalAmount: { flex: 2, textAlign: 'right', fontWeight: 700 },
  subtotalSupplierPad: { flex: 3 },
  totals: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBlock: { width: 220 },
  totalsTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTop: '1pt solid #2C2926',
    fontWeight: 700,
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 56,
    right: 56,
    textAlign: 'center',
    fontSize: 8,
    color: '#5C4A3C',
  },

  // Board sheet (B3) — section-grouped tile grid.
  boardSection: { marginBottom: 18 },
  boardSectionHeading: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  boardTile: { width: 150, marginBottom: 6 },
  boardTileImage: {
    width: 150,
    height: 150,
    objectFit: 'cover',
    border: '1pt solid #E5E2DD',
    borderRadius: 2,
    marginBottom: 4,
  },
  boardSwatchRow: {
    flexDirection: 'row',
    height: 28,
    border: '1pt solid #E5E2DD',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  boardTileName: { fontSize: 9, color: '#2C2926' },
  boardTilePrice: { fontSize: 10, fontWeight: 700, marginTop: 2 },
  boardTileNote: { fontSize: 9, color: '#3D3A36', lineHeight: 1.3 },
});

// ─── Helpers (same shapes as po-pdf.ts) ──────────────────────────────────────

function fmt(cents: number): string {
  return `$${
    (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }`;
}

// Same shape as po-pdf.ts fmtDate. Exported so the edge fn formats the
// post-sale eta date into a leadLabel with one canonical formatter.
export function fmtDate(value: string): string {
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isBareDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(isBareDate ? { timeZone: 'UTC' } : {}),
  });
}

// ─── Item document tree ──────────────────────────────────────────────────────

function metaCell(label: string, value: string) {
  return h(
    View,
    { style: styles.metaCell },
    h(Text, { style: styles.label }, label),
    h(Text, { style: styles.value }, value),
  );
}

function provenanceBlock(p: SpecItemModel['provenance']) {
  const bits: string[] = [];
  if (p.brand) bits.push(p.brand);
  if (p.sourceHost) bits.push(p.sourceHost);
  if (p.capturedBy) bits.push(`Captured by ${p.capturedBy}`);
  if (p.recordPct != null) bits.push(`Record ${p.recordPct}% complete`);
  if (bits.length === 0) return null;
  return h(
    View,
    { style: styles.block },
    h(Text, { style: styles.label }, 'Provenance'),
    h(Text, { style: styles.provenanceText }, bits.join(' · ')),
  );
}

function ItemDocument(model: SpecItemModel) {
  const images = model.imageUrls.slice(0, 4);
  return h(
    Document,
    null,
    h(
      Page,
      { size: 'LETTER', style: styles.page },
      // Header — optional studio logo, big item name, then studio · project ·
      // Specification, then code. Logo guarded → null renders as before.
      h(
        View,
        { style: styles.header },
        model.studioLogoUrl
          ? h(Image, { style: styles.headerLogo, src: model.studioLogoUrl })
          : null,
        h(Text, { style: styles.title }, model.name),
        h(
          Text,
          { style: styles.meta },
          [model.studioName, model.projectName, 'Specification'].filter(Boolean)
            .join(' · '),
        ),
        model.code ? h(Text, { style: styles.itemCode }, model.code) : null,
      ),
      // Meta grid — category / room / qty / lead-time (lead only when visible)
      h(
        View,
        { style: styles.metaGrid },
        metaCell('Category', model.category ?? '-'),
        metaCell('Room', model.roomName ?? '-'),
        metaCell('Quantity', String(model.quantity)),
        model.leadLabel ? metaCell('Lead Time', model.leadLabel) : null,
      ),
      // Images (up to 4) — react-pdf Image fetches src at render time
      images.length > 0
        ? h(
          View,
          { style: styles.imageRow },
          ...images.map((src, idx) => h(Image, { key: idx, style: styles.image, src })),
        )
        : null,
      // Specs / description
      model.specs
        ? h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Specification'),
          h(Text, { style: styles.specText }, model.specs),
        )
        : null,
      // Custom fields (label: value rows)
      model.customFields.length > 0
        ? h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Details'),
          ...model.customFields.map((f, idx) =>
            h(
              View,
              { key: idx, style: styles.customRow },
              h(Text, { style: styles.customLabel }, f.label),
              h(Text, { style: styles.customValue }, f.value),
            )
          ),
        )
        : null,
      // Provenance
      provenanceBlock(model.provenance),
      // Client price — CLIENT only, present only when pricing is visible
      model.clientPriceCents != null
        ? h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Client Price'),
          h(Text, { style: styles.priceValue }, fmt(model.clientPriceCents)),
        )
        : null,
      // Footer
      h(Text, { style: styles.footer }, 'Generated by Patina · patina.cloud'),
    ),
  );
}

// ─── Schedule document tree ──────────────────────────────────────────────────

function ScheduleDocument(
  model: SpecScheduleModel,
  header: {
    studioName: string;
    projectName: string;
    title: string;
    studioLogoUrl?: string;
  },
) {
  return h(
    Document,
    null,
    h(
      Page,
      { size: 'LETTER', style: styles.page },
      // Header (optional studio logo above the title; guarded → null as before)
      h(
        View,
        { style: styles.header },
        header.studioLogoUrl
          ? h(Image, { style: styles.headerLogo, src: header.studioLogoUrl })
          : null,
        h(Text, { style: styles.title }, header.title),
        h(
          Text,
          { style: styles.meta },
          [header.studioName, header.projectName].filter(Boolean).join(' · '),
        ),
      ),
      // Sections
      ...model.sections.map((section, sIdx) =>
        h(
          View,
          { key: sIdx, style: styles.section },
          h(Text, { style: styles.sectionHeading }, section.roomName),
          h(
            View,
            { style: styles.table },
            // Column heads
            h(
              View,
              { style: styles.tableHead },
              h(Text, { style: [styles.cellCode, styles.label] }, 'Code'),
              h(Text, { style: [styles.cellName, styles.label] }, 'Item'),
              h(Text, { style: [styles.cellQty, styles.label] }, 'Qty'),
              h(Text, { style: [styles.cellLead, styles.label] }, 'Lead'),
              model.showPricing
                ? h(Text, { style: [styles.cellPrice, styles.label] }, 'Client')
                : null,
              model.showSupplier
                ? h(
                  Text,
                  { style: [styles.cellSupplier, styles.label] },
                  'Supplier',
                )
                : null,
            ),
            // Rows
            ...section.lines.map((line, lIdx) =>
              h(
                View,
                { key: lIdx, style: styles.tableRow },
                h(Text, { style: styles.cellCode }, line.code ?? '-'),
                h(Text, { style: styles.cellName }, line.name),
                h(Text, { style: styles.cellQty }, String(line.quantity)),
                h(Text, { style: styles.cellLead }, line.leadLabel ?? '-'),
                model.showPricing
                  ? h(
                    Text,
                    { style: styles.cellPrice },
                    line.clientPriceCents != null ? fmt(line.clientPriceCents) : '-',
                  )
                  : null,
                model.showSupplier
                  ? h(
                    Text,
                    { style: styles.cellSupplier },
                    line.supplierName ?? '-',
                  )
                  : null,
              )
            ),
            // Section subtotal (pricing only)
            model.showPricing
              ? h(
                View,
                { style: styles.subtotalRow },
                h(Text, { style: styles.subtotalSpacer }, 'Subtotal'),
                h(
                  Text,
                  { style: styles.subtotalAmount },
                  fmt(section.subtotalCents ?? 0),
                ),
                model.showSupplier ? h(Text, { style: styles.subtotalSupplierPad }, '') : null,
              )
              : null,
          ),
        )
      ),
      // Document total (pricing only)
      model.showPricing
        ? h(
          View,
          { style: styles.totals },
          h(
            View,
            { style: styles.totalsBlock },
            h(
              View,
              { style: styles.totalsTotal },
              h(Text, null, 'Total'),
              h(Text, null, fmt(model.documentTotalCents ?? 0)),
            ),
          ),
        )
        : null,
      // Footer — verified-record tally + provenance line
      h(
        View,
        { style: styles.footer },
        h(
          Text,
          null,
          `${model.verifiedCount} of ${model.totalCount} lines verified records`,
        ),
        h(Text, null, 'Generated by Patina · patina.cloud'),
      ),
    ),
  );
}

// ─── Board document tree (B3) ────────────────────────────────────────────────

function BoardDocument(
  model: SpecBoardModel,
  header: { studioName: string; projectName: string; studioLogoUrl?: string },
) {
  return h(
    Document,
    null,
    h(
      Page,
      { size: 'LETTER', style: styles.page, wrap: true },
      // Header — optional studio logo above the board title (guarded → null).
      h(
        View,
        { style: styles.header },
        header.studioLogoUrl
          ? h(Image, { style: styles.headerLogo, src: header.studioLogoUrl })
          : null,
        h(Text, { style: styles.title }, model.boardName),
        h(
          Text,
          { style: styles.meta },
          [header.studioName, header.projectName].filter(Boolean).join(' · '),
        ),
      ),
      // Section-grouped tile grid.
      ...model.sections.map((section, sIdx) =>
        h(
          View,
          { key: sIdx, style: styles.boardSection },
          h(Text, { style: styles.boardSectionHeading }, section.name),
          h(
            View,
            { style: styles.boardGrid },
            ...section.tiles.map((tile, tIdx) =>
              h(
                View,
                { key: tIdx, style: styles.boardTile, wrap: false },
                tile.imageUrl
                  ? h(Image, {
                    style: styles.boardTileImage,
                    src: tile.imageUrl,
                  })
                  : null,
                tile.swatches.length > 0
                  ? h(
                    View,
                    { style: styles.boardSwatchRow },
                    ...tile.swatches.map((hex, i) =>
                      h(View, {
                        key: i,
                        style: { flex: 1, backgroundColor: hex },
                      })
                    ),
                  )
                  : null,
                tile.name ? h(Text, { style: styles.boardTileName }, tile.name) : null,
                tile.clientPriceCents != null
                  ? h(
                    Text,
                    { style: styles.boardTilePrice },
                    fmt(tile.clientPriceCents),
                  )
                  : null,
                tile.note ? h(Text, { style: styles.boardTileNote }, tile.note) : null,
              )
            ),
          ),
        )
      ),
      // Provenance footer.
      h(
        Text,
        { style: styles.footer },
        [header.studioName, 'Generated by Patina · patina.cloud'].filter(
          Boolean,
        ).join(' · '),
      ),
    ),
  );
}

// ─── Board composition document tree ────────────────────────────────────────

function compositionImageOrPlaceholder(pin: SpecBoardCompositionPin) {
  return pin.imageDataUrl
    ? h(Image, {
      src: pin.imageDataUrl,
      style: { width: '100%', height: '100%', objectFit: 'contain' },
    })
    : h(
      View,
      {
        style: {
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#EEEAE4',
          border: '0.7pt solid #CFC8BF',
          padding: 3,
        },
      },
      h(
        Text,
        {
          style: {
            fontSize: Math.max(3.5, Math.min(7, pin.pageBox.width / 20)),
            color: '#746B62',
          },
        },
        pin.placeholderLabel,
      ),
    );
}

function compositionPinContent(pin: SpecBoardCompositionPin) {
  const labelSize = Math.max(3.5, Math.min(8, pin.pageBox.width / 18));
  if (pin.type === 'palette') {
    return h(
      View,
      {
        style: {
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          padding: 2,
        },
      },
      h(
        View,
        { style: { flexDirection: 'row', flex: 1 } },
        ...(pin.swatches.length > 0 ? pin.swatches : ['#EEEAE4']).map((
          color,
          index,
        ) => h(View, { key: index, style: { flex: 1, backgroundColor: color } })),
      ),
      pin.name ? h(Text, { style: { fontSize: labelSize, marginTop: 2 } }, pin.name) : null,
    );
  }
  if (pin.type === 'note') {
    return h(
      View,
      {
        style: {
          width: '100%',
          height: '100%',
          padding: Math.max(2, pin.pageBox.width / 24),
          backgroundColor: '#F1E7D8',
          border: '0.6pt solid #D8C8B3',
          borderRadius: 3,
        },
      },
      h(Text, {
        style: { fontSize: labelSize, lineHeight: 1.25, color: '#3D3A36' },
      }, pin.note || 'Note'),
    );
  }
  if (pin.type === 'product' || pin.type === 'capture') {
    const caption = [pin.name, pin.vendorName].filter(Boolean).join(' · ');
    return h(
      View,
      {
        style: {
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          border: '0.6pt solid #D8D2CA',
          padding: 2,
        },
      },
      h(
        View,
        { style: { flex: 1, minHeight: 0 } },
        compositionImageOrPlaceholder(pin),
      ),
      caption ? h(Text, { style: { fontSize: labelSize, marginTop: 2 } }, caption) : null,
      pin.clientPriceCents != null
        ? h(
          Text,
          { style: { fontSize: labelSize, fontWeight: 700 } },
          fmt(pin.clientPriceCents),
        )
        : null,
    );
  }
  return h(
    View,
    {
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: '#FFFFFF',
        border: '0.6pt solid #D8D2CA',
        padding: 2,
      },
    },
    h(
      View,
      { style: { flex: 1, minHeight: 0 } },
      compositionImageOrPlaceholder(pin),
    ),
    pin.type === 'room_scan' || pin.name
      ? h(
        Text,
        { style: { fontSize: labelSize, marginTop: 2 } },
        pin.name || 'Room scan',
      )
      : null,
  );
}

function BoardCompositionDocument(model: SpecBoardCompositionModel) {
  return h(
    Document,
    null,
    h(
      Page,
      {
        size: 'LETTER',
        orientation: 'landscape',
        style: {
          width: 792,
          height: 612,
          fontFamily: 'Helvetica',
          color: '#2C2926',
          backgroundColor: '#FFFFFF',
        },
      },
      h(Text, {
        style: {
          position: 'absolute',
          left: 24,
          top: 18,
          fontSize: 16,
          fontWeight: 700,
        },
      }, model.boardName),
      h(
        Text,
        {
          style: {
            position: 'absolute',
            right: 24,
            top: 21,
            fontSize: 8,
            color: '#5C4A3C',
          },
        },
        [model.studioName, model.projectName].filter(Boolean).join(' · '),
      ),
      h(View, {
        style: {
          position: 'absolute',
          left: model.frame.x,
          top: model.frame.y,
          width: model.frame.width,
          height: model.frame.height,
          backgroundColor: model.canvas.backgroundColor,
          border: '0.6pt solid #CFC8BF',
          overflow: 'hidden',
        },
      }),
      ...model.sections.flatMap((section) => [
        h(View, {
          key: `${section.id}:band`,
          style: {
            position: 'absolute',
            left: section.pageBounds.x,
            top: section.pageBounds.y,
            width: section.pageBounds.width,
            height: section.pageBounds.height,
            border: `0.8pt dashed ${section.color}`,
            backgroundColor: section.color,
            opacity: 0.13,
          },
        }),
        h(
          Text,
          {
            key: `${section.id}:label`,
            style: {
              position: 'absolute',
              left: section.pageBounds.x + 3,
              top: section.pageBounds.y + 2,
              fontSize: 6,
              fontWeight: 700,
              color: '#3D3A36',
            },
          },
          section.name,
        ),
      ]),
      ...model.pins.map((pin) =>
        h(
          View,
          {
            key: pin.key,
            style: {
              position: 'absolute',
              left: pin.pageBox.x,
              top: pin.pageBox.y,
              width: pin.pageBox.width,
              height: pin.pageBox.height,
              transform: `rotate(${pin.rotation}deg)`,
              transformOrigin: 'center center',
            },
          },
          compositionPinContent(pin),
        )
      ),
      h(
        Text,
        {
          style: {
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 14,
            textAlign: 'center',
            fontSize: 7,
            color: '#746B62',
          },
        },
        'Generated by Patina · patina.cloud',
      ),
    ),
  );
}

// ─── Render entrypoints ──────────────────────────────────────────────────────

/**
 * Render the per-item Specification sheet to PDF bytes. `renderToBuffer`
 * returns a Node Buffer under Deno npm-compat; wrap as Uint8Array so callers
 * can hand it to `Response`, `storage.upload`, or base64-encode it (po-pdf.ts
 * "API shape").
 */
export async function renderSpecItemPdf(
  model: SpecItemModel,
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(ItemDocument(model));
  return new Uint8Array(buffer);
}

/** Render the per-project Specification schedule to PDF bytes. */
export async function renderSpecSchedulePdf(
  model: SpecScheduleModel,
  header: {
    studioName: string;
    projectName: string;
    title: string;
    studioLogoUrl?: string;
  },
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(ScheduleDocument(model, header));
  return new Uint8Array(buffer);
}

/** Render a single board (B3) to PDF bytes — a section-grouped tile grid. */
export async function renderBoardPdf(
  model: SpecBoardModel,
  header: { studioName: string; projectName: string; studioLogoUrl?: string },
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(BoardDocument(model, header));
  return new Uint8Array(buffer);
}

/** Render one persisted board composition on exactly one landscape Letter page. */
export async function renderBoardCompositionPdf(
  model: SpecBoardCompositionModel,
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(BoardCompositionDocument(model));
  return new Uint8Array(buffer);
}
