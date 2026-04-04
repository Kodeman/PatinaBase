'use client';

interface ProposalProductItemProps {
  name: string;
  maker?: string | null;
  imageUrl?: string | null;
  price: number; // cents
  quantity?: number;
}

export function ProposalProductItem({
  name,
  maker,
  imageUrl,
  price,
  quantity = 1,
}: ProposalProductItemProps) {
  const displayPrice = `$${((price * quantity) / 100).toLocaleString()}`;

  return (
    <div
      className="grid items-center gap-4 border-b border-[rgba(229,226,221,0.4)] py-4"
      style={{ gridTemplateColumns: '64px 1fr auto' }}
    >
      {/* Thumbnail */}
      <div
        className="relative flex h-12 w-16 items-center justify-center overflow-hidden rounded"
        style={{ background: 'var(--color-pearl)' }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span
            className="z-10"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
            }}
          >
            IMG
          </span>
        )}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(196,165,123,0.04) 12px, rgba(196,165,123,0.04) 24px)',
          }}
        />
      </div>

      {/* Name + Maker */}
      <div>
        <div className="type-label" style={{ fontSize: '0.88rem' }}>
          {name}
          {quantity > 1 && ` \u00D7 ${quantity}`}
        </div>
        {maker && (
          <div
            className="mt-0.5"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              fontStyle: 'italic',
              color: 'var(--accent-primary)',
            }}
          >
            {maker}
          </div>
        )}
      </div>

      {/* Price */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '1rem',
          color: 'var(--text-primary)',
        }}
      >
        {displayPrice}
      </div>
    </div>
  );
}
