/**
 * Adapters between the panel's draft slice and the UI-agnostic lib/* builders.
 *
 * These are the seam that keeps lib/payloads.ts (and its test suite) unchanged:
 *  - draftFromExtraction:   ExtractedProductData → DraftSlice (with field status)
 *  - draftToProductPayload: DraftSlice → BuildProductPayloadInput (reflecting edits)
 */
import type { ExtractedProductData } from '@patina/shared';
import type { BuildProductPayloadInput } from '../lib/payloads';
import type {
  DraftSlice,
  DraftField,
  DraftImage,
  EditableDimensions,
} from './types';

type ExtractedDimensions = ExtractedProductData['dimensions'];

function field<T>(value: T, present: boolean): DraftField<T> {
  return {
    value,
    status: present ? 'extracted' : 'missing',
    source: 'extracted',
    original: value,
  };
}

function numToStr(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n);
}

function strToNum(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

export function editableDimensionsFromExtracted(
  d: ExtractedDimensions
): EditableDimensions {
  const dims = d as Record<string, number | string | undefined> | null;
  return {
    width: numToStr(dims?.width as number | undefined),
    height: numToStr(dims?.height as number | undefined),
    depth: numToStr(dims?.depth as number | undefined),
    seatHeight: numToStr(dims?.seatHeight as number | undefined),
    seatDepth: numToStr(dims?.seatDepth as number | undefined),
    seatWidth: numToStr(dims?.seatWidth as number | undefined),
    armHeight: numToStr(dims?.armHeight as number | undefined),
    backHeight: numToStr(dims?.backHeight as number | undefined),
    legHeight: numToStr(dims?.legHeight as number | undefined),
    clearance: numToStr(dims?.clearance as number | undefined),
    unit: (dims?.unit as 'in' | 'cm') ?? 'in',
  };
}

function editableDimensionsToExtracted(
  e: EditableDimensions,
  original: ExtractedDimensions
): ExtractedDimensions {
  const parts = {
    width: strToNum(e.width),
    height: strToNum(e.height),
    depth: strToNum(e.depth),
    seatHeight: strToNum(e.seatHeight),
    seatDepth: strToNum(e.seatDepth),
    seatWidth: strToNum(e.seatWidth),
    armHeight: strToNum(e.armHeight),
    backHeight: strToNum(e.backHeight),
    legHeight: strToNum(e.legHeight),
    clearance: strToNum(e.clearance),
  };
  const hasAny = Object.values(parts).some((v) => v !== undefined);
  if (!hasAny) return null as ExtractedDimensions;
  const rawSource = original as { raw?: string } | null;
  return {
    ...parts,
    unit: e.unit,
    raw: rawSource?.raw ?? '',
  } as unknown as ExtractedDimensions;
}

export function draftFromExtraction(data: ExtractedProductData): DraftSlice {
  const colors = data.colors?.map((c) => c.name) ?? [];
  const images: DraftImage[] = (data.images ?? []).map((img) => ({
    url: img.url,
    score: img.score,
    width: img.width,
    height: img.height,
    alt: img.alt,
  }));

  return {
    captureKind: 'product',
    sourceUrl: data.url,
    snapshotUrl: null,
    confidence: data.confidence,
    currency: data.currency ?? data.price?.currency ?? 'USD',
    fields: {
      name: field(data.productName ?? '', !!data.productName),
      price: field(
        data.price ? (data.price.value / 100).toFixed(2) : '',
        !!data.price
      ),
      sku: field(data.sku ?? '', !!data.sku),
      description: field(data.description ?? '', !!data.description),
      materials: field(data.materials ?? [], (data.materials?.length ?? 0) > 0),
      colors: field(colors, colors.length > 0),
      finish: field(data.finish?.name ?? '', !!data.finish),
      dimensions: field(
        editableDimensionsFromExtracted(data.dimensions),
        !!data.dimensions
      ),
    },
    custom: [],
    // Default to keeping every extracted image (legacy parity — the panel saved
    // all, highest-scored first). The C3 curation sheet narrows this.
    images: { all: images, selected: images.map((_, i) => i), variant: null },
    manufacturer: { vendor: null, confidence: 'low', status: 'missing' },
    retailer: { vendor: null, confidence: 'low', status: 'missing' },
    styleIds: [],
    note: '',
    raw: data,
  };
}

/** A blank draft for manual entry (R3) — every field starts missing. */
export function emptyDraft(url: string): DraftSlice {
  const blank = <T,>(value: T): DraftField<T> => ({
    value,
    status: 'missing',
    source: 'user',
    original: value,
  });
  const raw = {
    productName: null,
    description: null,
    price: null,
    dimensions: null,
    materials: [],
    colors: null,
    finish: null,
    availableColors: null,
    availableFinishes: null,
    images: [],
    manufacturer: null,
    url,
    extractedAt: '',
    confidence: 'low',
  } as unknown as ExtractedProductData;

  return {
    captureKind: 'unknown',
    sourceUrl: url,
    snapshotUrl: null,
    confidence: 'low',
    currency: 'USD',
    fields: {
      name: blank(''),
      price: blank(''),
      sku: blank(''),
      description: blank(''),
      materials: blank<string[]>([]),
      colors: blank<string[]>([]),
      finish: blank(''),
      dimensions: blank(editableDimensionsFromExtracted(null)),
    },
    custom: [],
    images: { all: [], selected: [], variant: null },
    manufacturer: { vendor: null, confidence: 'low', status: 'missing' },
    retailer: { vendor: null, confidence: 'low', status: 'missing' },
    styleIds: [],
    note: '',
    raw,
  };
}

export function draftToProductPayload(
  draft: DraftSlice,
  userId: string
): BuildProductPayloadInput {
  const f = draft.fields;
  // Reconstruct an ExtractedProductData reflecting inline edits so the existing
  // buildProductInsertPayload picks them up unchanged.
  const extractedData = {
    ...draft.raw,
    productName: f.name.value || draft.raw.productName,
    description: f.description.value || null,
    materials: f.materials.value,
    colors: f.colors.value.length ? f.colors.value.map((name) => ({ name })) : null,
    finish: f.finish.value.trim() ? { name: f.finish.value.trim() } : null,
    dimensions: editableDimensionsToExtracted(f.dimensions.value, draft.raw.dimensions),
    availableColors: draft.raw.availableColors,
    availableFinishes: draft.raw.availableFinishes,
    url: draft.sourceUrl,
  } as unknown as ExtractedProductData;

  const images = draft.images.selected
    .map((i) => draft.images.all[i]?.url)
    .filter((u): u is string => !!u);

  return {
    productName: f.name.value,
    extractedData,
    price: f.price.value,
    sku: f.sku.value,
    images,
    vendorId: draft.manufacturer.vendor?.id ?? null,
    retailerId: draft.retailer.vendor?.id ?? null,
    userId,
  };
}
