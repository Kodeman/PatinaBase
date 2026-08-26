'use client';

import { useCallback, useRef, useState } from 'react';
import { useImageUpload } from '@/hooks/use-image-upload';
import {
  useCreateDraftProduct,
  useProduct,
  type LayerProductLayer,
  type ClientDecisionOption,
} from '@patina/supabase';
import type {
  ProductConfigurationComDetails,
  ProductConfigurationMode,
  ProductConfigurationSelection,
} from '@patina/types';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '@/components/portal/proposals/product-picker-modal';
import {
  CompareAcrossGroupPanel,
  isComparableConfigurationMode,
} from '@/components/portal/decision-compare-across-group';
import { Button, Input, Textarea } from '@/components/ui/controls';

interface DecisionOptionValue {
  name: string;
  imageUrl: string;
  designerNote: string;
  isRecommended: boolean;
  /** Price as a free-form string (e.g. "$1,200.00"). Parsed to cents on submit. */
  price: string;
  /** Quantity to suggest to the client. Stored as string for input compatibility. */
  quantity: string;
  /** Cost delta vs the recommended option as a free-form string ("+$200" or "-100"). */
  costDelta: string;
  /** Lead-time delta in days vs the recommended option ("+7", "-3"). */
  leadTimeDelta: string;
  /** Catalog/library product this option is built from (00172). Empty = manual. */
  productId?: string;
  /** Brand/vendor of the linked product, for the linked-state strip. */
  brand?: string;
  /** Library layer the linked product came from, for the badge. */
  layer?: LayerProductLayer;
  /** UI: designer chose manual entry rather than the library picker. */
  manualMode?: boolean;
  /** UI: persist a manual entry as a draft product in the library on submit. */
  saveAsDraft?: boolean;
  /**
   * The specification resolved in the picker's configure step (P0-2). Its
   * `selections` persist to `client_decision_options.selection_snapshot`
   * (00413) so `apply_decision` can carry the winner's finish/material into
   * the project spec.
   */
  configurationSelections?: ProductConfigurationSelection[];
  /** Provenance when the option was built from a saved configuration (00413). */
  savedConfigurationId?: string;
  /** True when an optioned piece was linked without resolving a spec. */
  configurationPending?: boolean;
  /**
   * The linked piece's configuration mode, carried from the pick. Absent on a
   * hydrated or legacy option — the builder then reads it off the product row.
   */
  configurationMode?: ProductConfigurationMode;
}

interface DecisionOptionBuilderProps {
  value: DecisionOptionValue;
  onChange: (value: DecisionOptionValue) => void;
  onRemove?: () => void;
  index: number;
  /**
   * Hand new sibling options to whoever owns the options array (P1-6 "Compare
   * across a group"). Absent = the affordance is not offered.
   */
  onGenerateSiblings?: (siblings: DecisionOptionValue[]) => void;
}

// ─── Shared helpers (single-sourced for new / edit / project-detail surfaces) ────

/** A pristine option — library-first (no product, no manual flag yet). */
export const emptyOption = (): DecisionOptionValue => ({
  name: '',
  imageUrl: '',
  designerNote: '',
  isRecommended: false,
  price: '',
  quantity: '1',
  costDelta: '',
  leadTimeDelta: '',
  productId: undefined,
  brand: undefined,
  layer: undefined,
  manualMode: false,
  // New manual entries seed the library by default (designer can opt out).
  saveAsDraft: true,
  configurationSelections: undefined,
  savedConfigurationId: undefined,
  configurationPending: false,
  configurationMode: undefined,
});

/**
 * The COM fabric the designer specified in the picker, as one line a human
 * reads: "COM: Belgian Linen — Rogers & Goffigon · 12 yds".
 *
 * A decision option has nowhere structured to keep COM — the row carries a
 * price, a note and a selection snapshot, and the snapshot's vocabulary has no
 * fabric in it. Rather than drop the intent on the floor between the picker and
 * the option, it is written into the designer note, where it is visible on the
 * card and editable like any other note. Parts the designer left blank are
 * simply absent; an empty COM produces no line at all.
 */
export function comDetailsNote(
  com: ProductConfigurationComDetails | null | undefined,
): string | null {
  if (!com) return null;
  const fabric = (com.fabricName ?? '').trim();
  const mill = (com.mill ?? '').trim();
  const rawYardage = com.yardage;
  const yardage =
    rawYardage == null || String(rawYardage).trim() === ''
      ? ''
      : `${String(rawYardage).trim()} yds`;
  const head = [fabric, mill].filter(Boolean).join(' — ');
  const parts = [head, yardage].filter(Boolean);
  if (parts.length === 0) return null;
  return `COM: ${parts.join(' · ')}`;
}

/** Append the COM line to a note without swallowing what the designer wrote. */
function noteWithCom(
  existing: string,
  com: ProductConfigurationComDetails | null | undefined,
): string {
  const line = comDetailsNote(com);
  if (!line) return existing;
  const kept = existing.trim();
  if (kept.includes(line)) return existing;
  return kept ? `${kept}\n${line}` : line;
}

export function parsePriceToCents(price: string): number | undefined {
  if (!price) return undefined;
  const cleaned = price.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return undefined;
  return Math.round(num * 100);
}

export function parseDeltaToCents(value: string): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[$,\s]/g, '').replace(/^\+/, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return undefined;
  return Math.round(num * 100);
}

export function parseInteger(value: string): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/^\+/, '');
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return undefined;
  return num;
}

/**
 * Hydrate the option-builder string fields from a persisted option row. Prices
 * are stored in cents and surfaced as plain dollar strings; deltas keep their
 * sign so a designer sees exactly what the client sees. A persisted option is
 * never re-saved as a draft (`saveAsDraft: false`) — it already exists.
 */
export function optionToValue(opt: ClientDecisionOption): DecisionOptionValue {
  return {
    name: opt.name ?? '',
    imageUrl: opt.image_url ?? '',
    designerNote: opt.designer_note ?? '',
    isRecommended: opt.is_recommended ?? false,
    price: opt.price != null ? String(opt.price / 100) : '',
    quantity: opt.quantity != null ? String(opt.quantity) : '1',
    costDelta: opt.cost_delta_cents != null ? String(opt.cost_delta_cents / 100) : '',
    leadTimeDelta: opt.lead_time_days_delta != null ? String(opt.lead_time_days_delta) : '',
    productId: opt.product_id ?? undefined,
    brand: undefined,
    layer: undefined,
    // A row with no product link is a manual option; show its fields directly.
    manualMode: !opt.product_id,
    saveAsDraft: false,
    configurationSelections: opt.selection_snapshot ?? undefined,
    savedConfigurationId: opt.configuration_id ?? undefined,
    configurationPending: false,
    // Not on the row — the builder reads it off the product when it needs it.
    configurationMode: undefined,
  };
}

/** The decision-mutation option shape (matches Create/UpdateDecisionInput.options[]). */
export interface DecisionOptionInput {
  name: string;
  imageUrl?: string;
  designerNote?: string;
  isRecommended: boolean;
  price?: number;
  quantity: number;
  costDeltaCents?: number;
  leadTimeDaysDelta?: number;
  productId?: string;
  /** Saved product configuration this option represents (00413). */
  configurationId?: string;
  /** The option's chosen values in the snapshot vocabulary (00413). */
  selectionSnapshot?: ProductConfigurationSelection[];
}

/** Map a builder value to the input the create/update decision hooks expect. */
export function optionValueToInput(o: DecisionOptionValue): DecisionOptionInput {
  return {
    name: o.name.trim(),
    imageUrl: o.imageUrl || undefined,
    designerNote: o.designerNote.trim() || undefined,
    isRecommended: o.isRecommended,
    price: parsePriceToCents(o.price),
    quantity: parseInteger(o.quantity) ?? 1,
    costDeltaCents: parseDeltaToCents(o.costDelta),
    leadTimeDaysDelta: parseInteger(o.leadTimeDelta),
    productId: o.productId || undefined,
    configurationId: o.savedConfigurationId || undefined,
    selectionSnapshot:
      o.configurationSelections && o.configurationSelections.length > 0
        ? o.configurationSelections
        : undefined,
  };
}

/**
 * Returns a function that, before submit, turns every "save as draft" manual
 * option into a real personal/draft product and stamps its `productId` onto the
 * option. Drafting is non-fatal: a failed create leaves the option as free text.
 * Call this in a submit handler, then map the result through `optionValueToInput`.
 */
export function useMaterializeDraftOptions() {
  const createDraft = useCreateDraftProduct();
  return useCallback(
    async (opts: DecisionOptionValue[]): Promise<DecisionOptionValue[]> => {
      const out: DecisionOptionValue[] = [];
      for (const o of opts) {
        if (o.saveAsDraft && !o.productId && o.name.trim()) {
          try {
            const cents = parsePriceToCents(o.price);
            const draft = await createDraft.mutateAsync({
              name: o.name.trim(),
              brand: o.brand?.trim() || undefined,
              priceRetailDollars: cents != null ? cents / 100 : undefined,
            });
            out.push({ ...o, productId: draft.id, saveAsDraft: false });
          } catch {
            out.push(o); // keep as a free-text option
          }
        } else {
          out.push(o);
        }
      }
      return out;
    },
    [createDraft],
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const labelStyle = {
  fontFamily: 'var(--font-meta)',
  fontSize: '0.62rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
};

const metaStyle = {
  fontFamily: 'var(--font-meta)',
  fontSize: '0.55rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
};

const LAYER_LABEL: Record<LayerProductLayer, string> = {
  personal: 'Personal',
  studio: 'Studio',
  catalog: 'Catalog',
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function DecisionOptionBuilder({
  value,
  onChange,
  onRemove,
  index,
  onGenerateSiblings,
}: DecisionOptionBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadToBucket, isUploading } = useImageUpload();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [comparing, setComparing] = useState(false);

  const isLinked = !!value.productId;
  // A pick carries its mode; a hydrated or legacy option does not, so read it
  // off the product row — and only then (the query is disabled otherwise).
  const modeProbe = useProduct(
    isLinked && !value.configurationMode ? (value.productId as string) : '',
  );
  const configurationMode =
    value.configurationMode ??
    (modeProbe.data as { configuration_mode?: ProductConfigurationMode } | undefined)
      ?.configuration_mode;
  const canCompare =
    isLinked && !!onGenerateSiblings && isComparableConfigurationMode(configurationMode);
  const hasContent = !!(
    value.name ||
    value.imageUrl ||
    value.price ||
    value.designerNote ||
    value.costDelta ||
    value.leadTimeDelta
  );
  // State A = pristine library-first prompt; B = linked product; C = manual entry.
  const showFields = isLinked || value.manualMode || hasContent;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // A manual option has no backing product, so upload directly to the public
    // product-images bucket under a `decisions/` path. The URL persists to
    // client_decision_options.image_url on submit.
    const url = await uploadToBucket('product-images', 'decisions', file);
    if (url) onChange({ ...value, imageUrl: url });
  };

  const handlePick = (r: ProductPickResult) => {
    // Denormalize the product onto the option (the client card reads these
    // columns); keep everything editable as overrides afterwards.
    const selection = r.configurationSelection;
    // A resolved specification names itself on the client card — "Bed — King ·
    // Walnut" — and prices at the RESOLVED price, not the product's list price.
    const baseName = r.name || value.name;
    const name =
      selection && selection.label ? `${baseName} — ${selection.label}` : baseName;
    const priceCents = selection?.retailPriceCents ?? r.priceCents;
    onChange({
      ...value,
      productId: r.productId,
      name,
      imageUrl: r.imageUrl ?? value.imageUrl,
      // W2-A — the pick's COM fabric has no column on a decision option, so it
      // rides in the note rather than being dropped at the boundary.
      designerNote: noteWithCom(value.designerNote, selection?.comDetails),
      price: priceCents != null ? String(priceCents / 100) : value.price,
      brand: r.vendorName ?? undefined,
      layer: r.layer,
      manualMode: false,
      configurationSelections: selection?.selections,
      savedConfigurationId: selection?.savedConfigurationId ?? undefined,
      configurationPending: r.configurationSkipped === true,
      configurationMode: r.configurationMode,
    });
    setPickerOpen(false);
    setComparing(false);
  };

  const clearLink = () => {
    setComparing(false);
    // Drop the product link but keep the copied text so a mis-pick never wipes work.
    onChange({
      ...value,
      productId: undefined,
      brand: undefined,
      layer: undefined,
      manualMode: true,
      configurationSelections: undefined,
      savedConfigurationId: undefined,
      configurationPending: false,
      configurationMode: undefined,
    });
  };

  const picker = (
    <ProductPickerModal
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      onPick={handlePick}
      scope="library"
      allowDraftCreate
    />
  );

  return (
    <div className="rounded-md p-4" style={{ border: '1px solid var(--color-pearl)' }}>
      {/* Card header: option label + remove */}
      <div className="mb-3 flex items-center justify-between">
        <span style={metaStyle}>Option {index + 1}</span>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="px-0 py-0 text-[0.72rem] text-[var(--color-terracotta-ink)] hover:text-[var(--color-terracotta-ink)]"
          >
            Remove
          </Button>
        )}
      </div>

      {/* ── State A: pristine, library-first prompt ── */}
      {!showFields && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            data-testid={`option-${index}-choose-product`}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-sm py-6 transition-colors hover:border-[var(--accent-primary)]"
            style={{
              border: '1px dashed var(--border-default)',
              background: 'linear-gradient(135deg, var(--color-off-white), var(--color-pearl))',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
              }}
            >
              Choose from Library / Catalog
            </span>
            <span style={metaStyle}>Personal · Studio · Catalog</span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...value, manualMode: true })}
            data-testid={`option-${index}-enter-manually`}
            className="self-center px-0 py-0 text-[0.72rem] text-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
          >
            or enter manually →
          </Button>
        </div>
      )}

      {showFields && (
        <>
          {/* ── State B: linked-product strip ── */}
          {isLinked ? (
            <div
              className="mb-3 flex items-center gap-3 rounded-sm p-2"
              style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
            >
              <div
                className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-sm"
                style={{ background: 'var(--color-pearl)' }}
              >
                {value.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={value.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {value.layer && (
                    <span
                      className="rounded-sm px-1.5 py-0.5"
                      style={{ ...metaStyle, border: '1px solid var(--border-default)' }}
                    >
                      {LAYER_LABEL[value.layer]}
                    </span>
                  )}
                  {value.brand && (
                    <span
                      className="truncate italic"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.68rem',
                        color: 'var(--color-aged-oak)',
                      }}
                    >
                      {value.brand}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    data-testid={`option-${index}-change-product`}
                    className="px-0 py-0 text-[0.72rem] text-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
                  >
                    Change
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearLink}
                    data-testid={`option-${index}-clear-link`}
                    className="px-0 py-0 text-[0.72rem]"
                  >
                    Clear link
                  </Button>
                  {/* P1-6 — a family piece can put its own group in front of
                      the client as separate cards. */}
                  {canCompare && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setComparing((open) => !open)}
                      data-testid={`option-${index}-compare-group`}
                      className="px-0 py-0 text-[0.72rem] text-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
                    >
                      Compare across a group
                    </Button>
                  )}
                </div>
                {/* Warn, never block: the option is usable, but nobody can
                    order it until the specification is resolved. */}
                {value.configurationPending && (
                  <div
                    className="mt-1"
                    style={metaStyle}
                    data-testid={`option-${index}-configuration-pending`}
                  >
                    Configuration pending
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── State C: manual image upload + "choose instead" ── */
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="relative mb-2 flex w-full items-center justify-center overflow-hidden rounded"
                style={{
                  height: '80px',
                  background: value.imageUrl
                    ? undefined
                    : 'linear-gradient(135deg, var(--color-off-white), var(--color-pearl))',
                  border: '1px dashed var(--border-default)',
                  cursor: isUploading ? 'wait' : 'pointer',
                }}
                aria-label={
                  value.imageUrl
                    ? `Replace Option ${index + 1} image`
                    : `Upload Option ${index + 1} image`
                }
                data-testid={`option-${index}-image-upload`}
              >
                {value.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={value.imageUrl}
                    alt={`Option ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span style={metaStyle}>
                    {isUploading ? 'Uploading…' : `Option ${index + 1} Image`}
                  </span>
                )}
                {isUploading && value.imageUrl && (
                  <span
                    className="absolute inset-0 flex items-center justify-center bg-white/70"
                    style={metaStyle}
                  >
                    Uploading…
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPickerOpen(true)}
                data-testid={`option-${index}-choose-product`}
                className="mb-3 px-0 py-0 text-[0.72rem] text-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
              >
                ‹ choose from library instead
              </Button>
            </>
          )}

          {/* P1-6 — the comparison panel sits under the linked strip it was
              opened from, above the fields it is about to write siblings for. */}
          {canCompare && comparing && (
            <CompareAcrossGroupPanel
              source={value}
              index={index}
              basePriceCents={parsePriceToCents(value.price)}
              onGenerate={(siblings) => onGenerateSiblings?.(siblings)}
              onClose={() => setComparing(false)}
            />
          )}

          {/* ── Shared editable fields (states B & C) ── */}
          <div className="mb-2 flex flex-col gap-1">
            <label style={labelStyle}>Option Name</label>
            <Input
              type="text"
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              data-testid={`option-${index}-name`}
            />
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Price (each)</label>
              <Input
                type="text"
                value={value.price}
                onChange={(e) => onChange({ ...value, price: e.target.value })}
                placeholder="$0.00"
                data-testid={`option-${index}-price`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Quantity</label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={value.quantity}
                onChange={(e) => onChange({ ...value, quantity: e.target.value })}
                placeholder="1"
                data-testid={`option-${index}-quantity`}
              />
            </div>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Cost Delta vs Recommended</label>
              <Input
                type="text"
                value={value.costDelta}
                onChange={(e) => onChange({ ...value, costDelta: e.target.value })}
                placeholder="+$200 / -$50"
                data-testid={`option-${index}-cost-delta`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Lead-Time Delta (days)</label>
              <Input
                type="text"
                value={value.leadTimeDelta}
                onChange={(e) => onChange({ ...value, leadTimeDelta: e.target.value })}
                placeholder="+7 / -3"
                data-testid={`option-${index}-lead-time-delta`}
              />
            </div>
          </div>

          <div className="mb-2 flex flex-col gap-1">
            <label style={labelStyle}>Designer Note</label>
            <Textarea
              value={value.designerNote}
              onChange={(e) => onChange({ ...value, designerNote: e.target.value })}
              rows={2}
              className="resize-vertical text-[0.8rem]"
            />
          </div>

          {/* Manual entries can seed the library */}
          {!isLinked && (
            <label className="mb-2 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={value.saveAsDraft ?? false}
                onChange={(e) => onChange({ ...value, saveAsDraft: e.target.checked })}
                data-testid={`option-${index}-save-as-draft`}
              />
              <span style={metaStyle}>Save as draft product in my library</span>
            </label>
          )}

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={value.isRecommended}
                onChange={(e) => onChange({ ...value, isRecommended: e.target.checked })}
                aria-label="My Recommendation"
              />
              <span style={metaStyle}>My Recommendation</span>
            </label>
          </div>
        </>
      )}

      {pickerOpen && picker}
    </div>
  );
}

export type { DecisionOptionValue };
