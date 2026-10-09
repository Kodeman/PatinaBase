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
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  View,
} from 'npm:@react-pdf/renderer@4.3.0';
// Every printed string passes through pdfText (base-14 WinAnsi; T-60c F13).
import { Text } from './pdf-text.ts';
import {
  type CurrencyTotal,
  DEFAULT_CURRENCY,
  formatMinorUnits,
  isMixed,
  mixedCurrenciesText,
  rowCurrency,
  sumByCurrency,
} from './currency-totals.ts';

const h = React.createElement;

// react-pdf hyphenates by default (`fin-` / `ish`). A spec wraps only between
// words, so every word comes back whole (T-60c F14). Registers no font.
// textkit treats only a single space as a word gap and hyphenates at any other
// run of spaces, so the code cell's `F1a  ·  LABOR` wrapped as `F1a ·-`; a run
// of spaces comes back one space at a time.
export function wholeWordParts(word: string): string[] {
  return /^ {2,}$/.test(word) ? [...word] : [word];
}
Font.registerHyphenationCallback(wholeWordParts);

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

// ─── Unit, LABOR and the also-in line (US-21 T-61 F3) ────────────────────────

/** One room a multi-room line is placed in (00734), in placement order. */
export interface SpecPlacement {
  roomName: string;
  quantity: number;
  areaNote?: string | null;
}

/** The line fields the unit, LABOR mark and also-in line read. All optional:
 *  a proposal line carries none of them and prints as before. */
export interface SpecLineBuildFields {
  unit?: string | null; // project_ffe_items.unit; 'each' or missing prints the bare number
  lineKind?: string | null; // 'labor' prints the LABOR mark
  roomName?: string | null; // the line's primary room, which the also-in line leaves out
  placements?: SpecPlacement[] | null;
}

/** What a line prints beside its quantity and name. Each key is present only
 *  when it prints, so a goods line in one room counted `each` is unchanged. */
interface SpecLineBuildMarks {
  unit?: string;
  labor?: true;
  alsoIn?: string;
}

// Units that are counted, so any quantity but 1 reads plural (T-60a F8,
// mirrored from `document/pieces/placement-chips.tsx` COUNTED_PLURAL; Deno
// can't import from the portal).
const COUNTED_PLURAL: Readonly<Record<string, string>> = {
  roll: 'rolls',
  box: 'boxes',
  hour: 'hours',
  lot: 'lots',
};

/** A quantity and the unit it counts: `913 sq ft`, `9 rolls`, `1 roll`, or
 *  the bare number for `each`. Mirrors `quantityText` in
 *  spec-book-render/render-model.ts, which is not importable from `_shared`;
 *  keep the two words the same. */
export function quantityText(quantity: number, unit?: string | null): string {
  if (!unit || unit === 'each') return String(quantity);
  const plural = COUNTED_PLURAL[unit];
  const word = plural && quantity !== 1 ? plural : unit.replace(/_/g, ' ');
  return `${quantity} ${word}`;
}

/** The also-in line under a placed line's name: the other rooms, then this
 *  room's share and its area note,
 *  `ALSO IN DINING · KITCHEN · 320 SQ FT HERE · BACK ENTRY`. Null for a line
 *  in one room. Mirrors `alsoInText` in spec-book-render/render-model.ts. */
export function alsoInText(item: SpecLineBuildFields): string | null {
  const placements = item.placements ?? [];
  if (placements.length < 2) return null;
  const others = placements.filter((entry) => entry.roomName !== item.roomName);
  if (others.length === 0) return null;
  const here = placements.find((entry) => entry.roomName === item.roomName);
  const parts = [
    `Also in ${others.map((entry) => entry.roomName).join(' · ')}`,
    here ? `${quantityText(here.quantity, item.unit)} here` : null,
    here?.areaNote ?? null,
  ];
  return parts.filter(Boolean).join(' · ').toLocaleUpperCase('en-US');
}

/** The code cell, with the LABOR mark the spec book prints (render-model's
 *  `pdf.ts`: `<code>  ·  LABOR`). */
function codeText(code: string | null, labor: boolean | undefined, missing: string): string {
  return labor ? `${code ?? missing}  ·  LABOR` : code ?? missing;
}

function buildMarks(input: SpecLineBuildFields): SpecLineBuildMarks {
  const marks: SpecLineBuildMarks = {};
  if (input.unit && input.unit !== 'each') marks.unit = input.unit;
  if (input.lineKind === 'labor') marks.labor = true;
  const alsoIn = alsoInText(input);
  if (alsoIn) marks.alsoIn = alsoIn;
  return marks;
}

// ─── Schedule model (pure) ───────────────────────────────────────────────────

/** One normalized line the edge fn hands us (source-agnostic: pre- or post-sale). */
export interface SpecLineInput extends SpecLineBuildFields {
  code: string | null; // doc_code
  name: string;
  quantity: number;
  leadLabel: string | null; // caller-computed (bucket label pre-sale, eta date post-sale)
  clientUnitCents: number | null; // unit_sell_price OR unit_price_cents — CLIENT price
  lineTotalCents: number | null; // line_total_cents
  currency?: string | null; // project_ffe_items.currency; missing reads as USD
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
export interface SpecLine extends SpecLineBuildMarks {
  code: string | null;
  name: string;
  quantity: number;
  leadLabel: string | null;
  clientPriceCents?: number;
  currency?: string; // present exactly when clientPriceCents is
  supplierName?: string;
}

export interface SpecSection {
  roomName: string;
  lines: SpecLine[];
  subtotal?: CurrencyTotal; // present only when pricing is visible
}

export interface SpecScheduleModel {
  sections: SpecSection[];
  documentTotal?: CurrencyTotal; // present only when pricing is visible
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
 *     unit price is non-null); otherwise the key is ABSENT. `currency` rides
 *     with it (the row's own currency, USD when missing).
 *   · supplierName on a line is set ONLY when showSupplier AND the input name
 *     is truthy; otherwise ABSENT.
 *   · subtotal / documentTotal are set ONLY when showPricing; otherwise ABSENT.
 *     Each is Σ lineTotalCents in one currency, or `{ mixed }` when the lines
 *     span several — a total never adds across currencies (SQ-212). A null
 *     lineTotalCents adds nothing and names no currency.
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
  const lineTotal = (input: SpecLineInput) => input.lineTotalCents;

  const outSections: SpecSection[] = sections.map((section) => {
    const lines: SpecLine[] = section.lines.map((input) => {
      totalCount += 1;
      if (input.recordVerified) verifiedCount += 1;

      const line: SpecLine = {
        code: input.code,
        name: input.name,
        quantity: input.quantity,
        leadLabel: input.leadLabel,
        ...buildMarks(input),
      };
      // Assign only when visible so `'clientPriceCents' in line` is false when
      // pricing is off (never write an undefined value).
      if (showPricing && input.clientUnitCents != null) {
        line.clientPriceCents = input.clientUnitCents;
        line.currency = rowCurrency(input);
      }
      if (showSupplier && input.supplierName) {
        line.supplierName = input.supplierName;
      }
      return line;
    });

    const out: SpecSection = { roomName: section.roomName, lines };
    if (showPricing) out.subtotal = sumByCurrency(section.lines, lineTotal);
    return out;
  });

  const model: SpecScheduleModel = {
    sections: outSections,
    verifiedCount,
    totalCount,
    showPricing,
    showSupplier,
  };
  if (showPricing) {
    model.documentTotal = sumByCurrency(
      sections.flatMap((section) => section.lines),
      lineTotal,
    );
  }
  return model;
}

// ─── Item model (pure) ───────────────────────────────────────────────────────

export interface SpecItemCustomField {
  label: string;
  value: string;
}

export interface SpecItemModel extends SpecLineBuildMarks {
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
  currency?: string; // present exactly when clientPriceCents is
}

/** Raw fields the edge fn normalizes before building the item model. */
export interface SpecItemInput extends SpecLineBuildFields {
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
  currency?: string | null; // project_ffe_items.currency; missing reads as USD
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
    ...buildMarks(input),
  };
  if (showPricing && input.clientUnitCents != null) {
    model.clientPriceCents = input.clientUnitCents;
    model.currency = rowCurrency(input);
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

// ─── Schedule columns (T-60c F14) ────────────────────────────────────────────

/** The schedule row's inner width: the LETTER page's 612pt, less the 56pt page
 *  padding, the 1pt table border and the 8pt row padding on each side. */
export const SCHEDULE_ROW_WIDTH = 612 - 2 * 56 - 2 * 1 - 2 * 8;

/** The space between two schedule columns, in the header and in every row. */
export const SCHEDULE_COLUMN_GAP = 8;

export type ScheduleColumnKey = 'code' | 'item' | 'qty' | 'lead' | 'client' | 'supplier';

/** A fixed column has a width and never shrinks, so neither its header nor its
 *  cell runs into the next column. Item and Supplier share what is left, 3:2.
 *  Client is wide enough for `$9,999,999.99`, so a money cell never wraps. */
export const SCHEDULE_COLUMNS: Readonly<
  Record<ScheduleColumnKey, { width?: number; grow?: number; align: 'left' | 'right' }>
> = {
  code: { width: 52, align: 'left' },
  item: { grow: 3, align: 'left' },
  qty: { width: 52, align: 'right' },
  lead: { width: 56, align: 'left' },
  client: { width: 72, align: 'right' },
  supplier: { grow: 2, align: 'left' },
};

const SCHEDULE_HEADS: Readonly<Record<ScheduleColumnKey, string>> = {
  code: 'Code',
  item: 'Item',
  qty: 'Qty',
  lead: 'Lead',
  client: 'Client',
  supplier: 'Supplier',
};

function scheduleColumnStyle(key: ScheduleColumnKey) {
  const column = SCHEDULE_COLUMNS[key];
  return column.width != null
    ? { width: column.width, flexGrow: 0, flexShrink: 0, textAlign: column.align }
    : { flexGrow: column.grow, flexShrink: 1, flexBasis: 0, textAlign: column.align };
}

/** The columns a schedule prints, in order: Client only with pricing,
 *  Supplier only with supplier identity. */
export function scheduleColumnKeys(
  model: Pick<SpecScheduleModel, 'showPricing' | 'showSupplier'>,
): ScheduleColumnKey[] {
  return (['code', 'item', 'qty', 'lead', 'client', 'supplier'] as const).filter((key) =>
    (key !== 'client' || model.showPricing) && (key !== 'supplier' || model.showSupplier)
  );
}

/** One printed cell of a schedule line. `note` is the also-in line under the
 *  item's name. */
export interface ScheduleCell {
  key: ScheduleColumnKey;
  text: string;
  note?: string;
}

/** What each visible column prints for one line, in column order. */
export function scheduleCells(model: SpecScheduleModel, line: SpecLine): ScheduleCell[] {
  return scheduleColumnKeys(model).map((key): ScheduleCell => {
    switch (key) {
      case 'code':
        return { key, text: codeText(line.code, line.labor, '-') };
      case 'item':
        return line.alsoIn ? { key, text: line.name, note: line.alsoIn } : { key, text: line.name };
      case 'qty':
        return { key, text: quantityText(line.quantity, line.unit) };
      case 'lead':
        return { key, text: line.leadLabel ?? '-' };
      case 'client':
        return {
          key,
          text: line.clientPriceCents != null ? fmt(line.clientPriceCents, line.currency) : '-',
        };
      case 'supplier':
        return { key, text: line.supplierName ?? '-' };
    }
  });
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
  // The also-in line under a multi-room line's name (spec-book-render pdf.ts).
  alsoIn: { fontSize: 8, color: '#5C4A3C', marginTop: 2 },
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
  tableHead: {
    flexDirection: 'row',
    columnGap: SCHEDULE_COLUMN_GAP,
    backgroundColor: '#E5E2DD',
    padding: 8,
  },
  tableRow: {
    flexDirection: 'row',
    columnGap: SCHEDULE_COLUMN_GAP,
    padding: 8,
    borderTop: '1pt solid #E5E2DD',
  },
  cellCode: { ...scheduleColumnStyle('code'), fontFamily: 'Courier', fontSize: 9 },
  cellName: scheduleColumnStyle('item'),
  cellQty: scheduleColumnStyle('qty'),
  cellLead: scheduleColumnStyle('lead'),
  cellPrice: scheduleColumnStyle('client'),
  cellSupplier: scheduleColumnStyle('supplier'),
  subtotalRow: {
    flexDirection: 'row',
    columnGap: SCHEDULE_COLUMN_GAP,
    padding: 8,
    borderTop: '1pt solid #2C2926',
  },
  subtotalStrong: { textAlign: 'right', fontWeight: 700 },
  // A mixed-currency note needs more room than the figure cell: it spans the
  // Qty, Lead and Client columns.
  subtotalMixed: {
    width: SCHEDULE_COLUMNS.qty.width! + SCHEDULE_COLUMNS.lead.width! +
      SCHEDULE_COLUMNS.client.width! + 2 * SCHEDULE_COLUMN_GAP,
    flexGrow: 0,
    flexShrink: 0,
    textAlign: 'right',
    fontWeight: 700,
  },
  totals: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBlock: { width: 220 },
  totalsTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: SCHEDULE_COLUMN_GAP,
    paddingVertical: 6,
    borderTop: '1pt solid #2C2926',
    fontWeight: 700,
  },
  // The figure, or the mixed note, which wraps beside `Total` rather than
  // running into it.
  totalsFigure: { flexShrink: 1, textAlign: 'right' },
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

const cellStyles = {
  code: styles.cellCode,
  item: styles.cellName,
  qty: styles.cellQty,
  lead: styles.cellLead,
  client: styles.cellPrice,
  supplier: styles.cellSupplier,
} satisfies Record<ScheduleColumnKey, unknown>;

// ─── Helpers (same shapes as po-pdf.ts) ──────────────────────────────────────

/** A price in its own currency. USD keeps the legacy format byte for byte. */
function fmt(cents: number, currency: string = DEFAULT_CURRENCY): string {
  if (currency !== DEFAULT_CURRENCY) return formatMinorUnits(cents, currency);
  return `$${
    (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }`;
}

/** A total as printed: its figure, or the mixed-currency note (never a sum). */
function fmtTotal(total: CurrencyTotal | undefined): string {
  if (!total) return fmt(0);
  return isMixed(total) ? mixedCurrenciesText(total.mixed) : fmt(total.cents, total.currency);
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
        model.code || model.labor
          ? h(Text, { style: styles.itemCode }, codeText(model.code, model.labor, 'UNASSIGNED CODE'))
          : null,
        model.alsoIn ? h(Text, { style: styles.alsoIn }, model.alsoIn) : null,
      ),
      // Meta grid — category / room / qty / lead-time (lead only when visible)
      h(
        View,
        { style: styles.metaGrid },
        metaCell('Category', model.category ?? '-'),
        metaCell('Room', model.roomName ?? '-'),
        metaCell('Quantity', quantityText(model.quantity, model.unit)),
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
          h(Text, { style: styles.priceValue }, fmt(model.clientPriceCents, model.currency)),
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
  const columns = scheduleColumnKeys(model);
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
              ...columns.map((key) =>
                h(Text, { key, style: [cellStyles[key], styles.label] }, SCHEDULE_HEADS[key])
              ),
            ),
            // Rows
            ...section.lines.map((line, lIdx) =>
              h(
                View,
                { key: lIdx, style: styles.tableRow },
                ...scheduleCells(model, line).map((cell) =>
                  cell.note
                    ? h(
                      View,
                      { key: cell.key, style: cellStyles[cell.key] },
                      h(Text, null, cell.text),
                      h(Text, { style: styles.alsoIn }, cell.note),
                    )
                    : h(Text, { key: cell.key, style: cellStyles[cell.key] }, cell.text)
                ),
              )
            ),
            // Section subtotal (pricing only), on the same columns as the rows:
            // the figure under Client, or the mixed note across Qty to Client.
            model.showPricing
              ? h(
                View,
                { style: styles.subtotalRow },
                ...(section.subtotal && isMixed(section.subtotal)
                  ? [
                    h(Text, { key: 'code', style: cellStyles.code }, ''),
                    h(Text, { key: 'item', style: [cellStyles.item, styles.subtotalStrong] }, 'Subtotal'),
                    h(Text, { key: 'mixed', style: styles.subtotalMixed }, fmtTotal(section.subtotal)),
                    model.showSupplier
                      ? h(Text, { key: 'supplier', style: cellStyles.supplier }, '')
                      : null,
                  ]
                  : columns.map((key) =>
                    h(
                      Text,
                      {
                        key,
                        style: key === 'lead' || key === 'client'
                          ? [cellStyles[key], styles.subtotalStrong]
                          : cellStyles[key],
                      },
                      key === 'lead' ? 'Subtotal' : key === 'client' ? fmtTotal(section.subtotal) : '',
                    )
                  )),
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
              h(Text, { style: styles.totalsFigure }, fmtTotal(model.documentTotal)),
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
          backgroundColor: '#F5F3EE',
          border: '0.7pt solid #E5E2DD',
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
          border: '0.6pt solid #E5E2DD',
          borderRadius: 2,
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
      pin.name
        ? h(Text, {
          style: {
            fontSize: labelSize,
            marginTop: 2,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            color: '#746B62',
          },
        }, pin.name)
        : null,
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
          backgroundColor: '#F3E9D5',
          border: '0.6pt solid #E0D2B8',
          borderRadius: 3,
        },
      },
      h(Text, {
        style: { fontSize: labelSize, lineHeight: 1.5, color: '#4A4137' },
      }, pin.note || 'Note'),
    );
  }
  if (pin.type === 'product' || pin.type === 'capture') {
    return h(
      View,
      {
        style: {
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          border: '0.6pt solid #E5E2DD',
          borderRadius: 2,
          padding: 2,
        },
      },
      h(
        View,
        { style: { flex: 1, minHeight: 0, backgroundColor: '#F5F3EE' } },
        compositionImageOrPlaceholder(pin),
      ),
      pin.name ? h(Text, { style: { fontSize: labelSize, marginTop: 2 } }, pin.name) : null,
      pin.vendorName
        ? h(Text, {
          style: {
            fontSize: Math.max(3.5, labelSize - 0.7),
            fontStyle: 'italic',
            color: '#746B62',
          },
        }, pin.vendorName)
        : null,
      pin.clientPriceCents != null
        ? h(
          Text,
          { style: { fontSize: labelSize, fontWeight: 700 } },
          fmt(pin.clientPriceCents),
        )
        : null,
    );
  }
  if (pin.type === 'image') {
    return h(
      View,
      {
        style: {
          width: '100%',
          height: '100%',
          backgroundColor: '#F5F3EE',
          borderRadius: 2,
        },
      },
      compositionImageOrPlaceholder(pin),
    );
  }
  return h(
    View,
    {
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: '#FFFFFF',
        border: '0.6pt solid #E5E2DD',
        borderRadius: 2,
        padding: 2,
      },
    },
    h(
      View,
      { style: { flex: 1, minHeight: 0, backgroundColor: '#F5F3EE' } },
      compositionImageOrPlaceholder(pin),
    ),
    h(
      Text,
      {
        style: {
          fontSize: labelSize,
          marginTop: 2,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          color: '#746B62',
        },
      },
      pin.name || 'Room scan',
    ),
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
            border: `0.6pt dashed ${section.color}`,
            backgroundColor: section.color,
            opacity: 0.063,
          },
        }),
        h(
          Text,
          {
            key: `${section.id}:label`,
            style: {
              position: 'absolute',
              left: section.pageBounds.x + 4,
              top: section.pageBounds.y - 4,
              paddingHorizontal: 3,
              paddingVertical: 1,
              borderRadius: 4,
              backgroundColor: section.color,
              fontSize: 5.5,
              fontWeight: 500,
              color: '#FFFFFF',
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
