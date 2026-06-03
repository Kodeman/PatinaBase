'use client';

import { useCallback, useRef, useState } from 'react';
import { useImageUpload } from '@/hooks/use-image-upload';
import {
  useCreateDraftProduct,
  type LayerProductLayer,
  type ClientDecisionOption,
} from '@patina/supabase';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '@/components/portal/proposals/product-picker-modal';

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
}

interface DecisionOptionBuilderProps {
  value: DecisionOptionValue;
  onChange: (value: DecisionOptionValue) => void;
  onRemove?: () => void;
  index: number;
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
});

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

const inputClass =
  'rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]';
const inputStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.85rem',
  color: 'var(--text-primary)',
};

const LAYER_LABEL: Record<LayerProductLayer, string> = {
  personal: 'Personal',
  studio: 'Studio',
  catalog: 'Catalog',
};

const linkButtonStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.72rem',
  color: 'var(--accent-primary)',
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function DecisionOptionBuilder({
  value,
  onChange,
  onRemove,
  index,
}: DecisionOptionBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadToBucket, isUploading } = useImageUpload();
  const [pickerOpen, setPickerOpen] = useState(false);

  const isLinked = !!value.productId;
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
    onChange({
      ...value,
      productId: r.productId,
      name: r.name || value.name,
      imageUrl: r.imageUrl ?? value.imageUrl,
      price: r.priceCents != null ? String(r.priceCents / 100) : value.price,
      brand: r.vendorName ?? undefined,
      layer: r.layer,
      manualMode: false,
    });
    setPickerOpen(false);
  };

  const clearLink = () =>
    // Drop the product link but keep the copied text so a mis-pick never wipes work.
    onChange({ ...value, productId: undefined, brand: undefined, layer: undefined, manualMode: true });

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
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer border-0 bg-transparent"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.72rem',
              color: 'var(--color-terracotta)',
            }}
          >
            Remove
          </button>
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
          <button
            type="button"
            onClick={() => onChange({ ...value, manualMode: true })}
            data-testid={`option-${index}-enter-manually`}
            className="cursor-pointer self-center border-0 bg-transparent"
            style={linkButtonStyle}
          >
            or enter manually →
          </button>
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
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    data-testid={`option-${index}-change-product`}
                    className="cursor-pointer border-0 bg-transparent p-0"
                    style={linkButtonStyle}
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={clearLink}
                    data-testid={`option-${index}-clear-link`}
                    className="cursor-pointer border-0 bg-transparent p-0"
                    style={{ ...linkButtonStyle, color: 'var(--text-muted)' }}
                  >
                    Clear link
                  </button>
                </div>
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
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                data-testid={`option-${index}-choose-product`}
                className="mb-3 cursor-pointer border-0 bg-transparent p-0"
                style={linkButtonStyle}
              >
                ‹ choose from library instead
              </button>
            </>
          )}

          {/* ── Shared editable fields (states B & C) ── */}
          <div className="mb-2 flex flex-col gap-1">
            <label style={labelStyle}>Option Name</label>
            <input
              type="text"
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              className={inputClass}
              style={inputStyle}
              data-testid={`option-${index}-name`}
            />
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Price (each)</label>
              <input
                type="text"
                value={value.price}
                onChange={(e) => onChange({ ...value, price: e.target.value })}
                placeholder="$0.00"
                className={inputClass}
                style={inputStyle}
                data-testid={`option-${index}-price`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Quantity</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={value.quantity}
                onChange={(e) => onChange({ ...value, quantity: e.target.value })}
                placeholder="1"
                className={inputClass}
                style={inputStyle}
                data-testid={`option-${index}-quantity`}
              />
            </div>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Cost Delta vs Recommended</label>
              <input
                type="text"
                value={value.costDelta}
                onChange={(e) => onChange({ ...value, costDelta: e.target.value })}
                placeholder="+$200 / -$50"
                className={inputClass}
                style={inputStyle}
                data-testid={`option-${index}-cost-delta`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Lead-Time Delta (days)</label>
              <input
                type="text"
                value={value.leadTimeDelta}
                onChange={(e) => onChange({ ...value, leadTimeDelta: e.target.value })}
                placeholder="+7 / -3"
                className={inputClass}
                style={inputStyle}
                data-testid={`option-${index}-lead-time-delta`}
              />
            </div>
          </div>

          <div className="mb-2 flex flex-col gap-1">
            <label style={labelStyle}>Designer Note</label>
            <textarea
              value={value.designerNote}
              onChange={(e) => onChange({ ...value, designerNote: e.target.value })}
              rows={2}
              className="resize-vertical rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]"
              style={{ ...inputStyle, fontSize: '0.8rem' }}
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
