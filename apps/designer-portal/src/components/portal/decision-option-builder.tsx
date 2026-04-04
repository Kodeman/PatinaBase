'use client';

interface DecisionOptionValue {
  name: string;
  imageUrl: string;
  designerNote: string;
  isRecommended: boolean;
  price: string;
}

interface DecisionOptionBuilderProps {
  value: DecisionOptionValue;
  onChange: (value: DecisionOptionValue) => void;
  onRemove?: () => void;
  index: number;
}

export function DecisionOptionBuilder({
  value,
  onChange,
  onRemove,
  index,
}: DecisionOptionBuilderProps) {
  return (
    <div
      className="rounded-md p-4"
      style={{ border: '1px solid var(--color-pearl)' }}
    >
      {/* Image placeholder */}
      <div
        className="mb-3 flex items-center justify-center rounded"
        style={{
          width: '100%',
          height: '80px',
          background: 'linear-gradient(135deg, var(--color-off-white), var(--color-pearl))',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.55rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-muted)',
          }}
        >
          Option {index + 1} Image
        </span>
      </div>

      {/* Name */}
      <div className="mb-2 flex flex-col gap-1">
        <label
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
          }}
        >
          Option Name
        </label>
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Price */}
      <div className="mb-2 flex flex-col gap-1">
        <label
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
          }}
        >
          Price (each)
        </label>
        <input
          type="text"
          value={value.price}
          onChange={(e) => onChange({ ...value, price: e.target.value })}
          placeholder="$0.00"
          className="rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Designer Note */}
      <div className="mb-2 flex flex-col gap-1">
        <label
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
          }}
        >
          Designer Note
        </label>
        <textarea
          value={value.designerNote}
          onChange={(e) => onChange({ ...value, designerNote: e.target.value })}
          rows={2}
          className="resize-vertical rounded-sm border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 outline-none focus:border-[var(--accent-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Actions */}
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
