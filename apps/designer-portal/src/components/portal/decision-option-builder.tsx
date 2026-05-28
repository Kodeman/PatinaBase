'use client';

import { useRef } from 'react';
import { useImageUpload } from '@/hooks/use-image-upload';

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
}

interface DecisionOptionBuilderProps {
  value: DecisionOptionValue;
  onChange: (value: DecisionOptionValue) => void;
  onRemove?: () => void;
  index: number;
}

const labelStyle = {
  fontFamily: 'var(--font-meta)',
  fontSize: '0.62rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
};

const inputClass =
  'rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]';
const inputStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.85rem',
  color: 'var(--text-primary)',
};

export function DecisionOptionBuilder({
  value,
  onChange,
  onRemove,
  index,
}: DecisionOptionBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadToBucket, isUploading } = useImageUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // No backing product id exists for a decision option, so upload directly
    // to the public product-images bucket under a `decisions/` path. The
    // returned URL persists to client_decision_options.image_url on submit.
    const url = await uploadToBucket('product-images', 'decisions', file);
    if (url) onChange({ ...value, imageUrl: url });
  };

  return (
    <div
      className="rounded-md p-4"
      style={{ border: '1px solid var(--color-pearl)' }}
    >
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="relative mb-3 flex w-full items-center justify-center overflow-hidden rounded"
        style={{
          height: '80px',
          background: value.imageUrl
            ? undefined
            : 'linear-gradient(135deg, var(--color-off-white), var(--color-pearl))',
          border: '1px dashed var(--border-default)',
          cursor: isUploading ? 'wait' : 'pointer',
        }}
        aria-label={value.imageUrl ? `Replace Option ${index + 1} image` : `Upload Option ${index + 1} image`}
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
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
            }}
          >
            {isUploading ? 'Uploading…' : `Option ${index + 1} Image`}
          </span>
        )}
        {isUploading && value.imageUrl && (
          <span
            className="absolute inset-0 flex items-center justify-center bg-white/70"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
            }}
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

      <div className="mb-2 flex flex-col gap-1">
        <label style={labelStyle}>Option Name</label>
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className={inputClass}
          style={inputStyle}
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

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value.isRecommended}
            onChange={(e) => onChange({ ...value, isRecommended: e.target.checked })}
          />
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
            }}
          >
            My Recommendation
          </span>
        </label>
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
    </div>
  );
}

export type { DecisionOptionValue };
