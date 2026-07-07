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

import React from 'npm:react@19.1.0';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
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
  const piece = hasDimensions(product.dimensions) && (product.materials?.length ?? 0) > 0;
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

// ─── Styles (ported from po-pdf.ts) ──────────────────────────────────────────

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 10, fontFamily: 'Helvetica', color: '#2C2926' },
  header: { borderBottom: '1pt solid #2C2926', paddingBottom: 16, marginBottom: 24 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 9, color: '#5C4A3C' },
  itemCode: { fontSize: 11, color: '#5C4A3C', marginTop: 4, fontFamily: 'Courier' },
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
  customRow: { flexDirection: 'row', paddingVertical: 3, borderTop: '1pt solid #E5E2DD' },
  customLabel: { flex: 2, fontSize: 9, color: '#5C4A3C' },
  customValue: { flex: 3, fontSize: 10 },
  provenanceText: { fontSize: 9, color: '#5C4A3C' },
  priceValue: { fontSize: 16, fontWeight: 700 },

  // Schedule
  section: { marginBottom: 20 },
  sectionHeading: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  table: { border: '1pt solid #E5E2DD', borderRadius: 2 },
  tableHead: { flexDirection: 'row', backgroundColor: '#E5E2DD', padding: 8 },
  tableRow: { flexDirection: 'row', padding: 8, borderTop: '1pt solid #E5E2DD' },
  cellCode: { flex: 2, fontFamily: 'Courier', fontSize: 9 },
  cellName: { flex: 4 },
  cellQty: { flex: 1, textAlign: 'right' },
  cellLead: { flex: 2 },
  cellPrice: { flex: 2, textAlign: 'right' },
  cellSupplier: { flex: 3 },
  subtotalRow: { flexDirection: 'row', padding: 8, borderTop: '1pt solid #2C2926' },
  subtotalSpacer: { flex: 9, textAlign: 'right', fontWeight: 700, paddingRight: 8 },
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
});

// ─── Helpers (same shapes as po-pdf.ts) ──────────────────────────────────────

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
      // Header — big item name, then studio · project · Specification, then code
      h(
        View,
        { style: styles.header },
        h(Text, { style: styles.title }, model.name),
        h(
          Text,
          { style: styles.meta },
          [model.studioName, model.projectName, 'Specification'].filter(Boolean).join(' · '),
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
              ),
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
  header: { studioName: string; projectName: string; title: string },
) {
  return h(
    Document,
    null,
    h(
      Page,
      { size: 'LETTER', style: styles.page },
      // Header
      h(
        View,
        { style: styles.header },
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
                ? h(Text, { style: [styles.cellSupplier, styles.label] }, 'Supplier')
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
                  ? h(Text, { style: styles.cellSupplier }, line.supplierName ?? '-')
                  : null,
              ),
            ),
            // Section subtotal (pricing only)
            model.showPricing
              ? h(
                  View,
                  { style: styles.subtotalRow },
                  h(Text, { style: styles.subtotalSpacer }, 'Subtotal'),
                  h(Text, { style: styles.subtotalAmount }, fmt(section.subtotalCents ?? 0)),
                  model.showSupplier ? h(Text, { style: styles.subtotalSupplierPad }, '') : null,
                )
              : null,
          ),
        ),
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
        h(Text, null, `${model.verifiedCount} of ${model.totalCount} lines verified records`),
        h(Text, null, 'Generated by Patina · patina.cloud'),
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
export async function renderSpecItemPdf(model: SpecItemModel): Promise<Uint8Array> {
  const buffer = await renderToBuffer(ItemDocument(model));
  return new Uint8Array(buffer);
}

/** Render the per-project Specification schedule to PDF bytes. */
export async function renderSpecSchedulePdf(
  model: SpecScheduleModel,
  header: { studioName: string; projectName: string; title: string },
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(ScheduleDocument(model, header));
  return new Uint8Array(buffer);
}
