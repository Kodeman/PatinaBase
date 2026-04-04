'use client';

interface TemplateCardProps {
  name: string;
  description: string | null;
  sectionCount: number;
  estimatedPages: number;
  selected: boolean;
  onSelect: () => void;
}

export function TemplateCard({
  name,
  description,
  sectionCount,
  estimatedPages,
  selected,
  onSelect,
}: TemplateCardProps) {
  return (
    <div
      className={`cursor-pointer rounded-md border-[1.5px] p-5 transition-all ${
        selected
          ? 'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.04)]'
          : 'border-[var(--color-pearl)] hover:border-[var(--accent-primary)]'
      }`}
      onClick={onSelect}
    >
      <div className="type-label mb-1">{name}</div>
      {description && (
        <div
          className="mb-2"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      )}
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.55rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--accent-primary)',
        }}
      >
        {sectionCount > 0
          ? `${sectionCount} Sections \u00B7 ~${estimatedPages} page${estimatedPages !== 1 ? 's' : ''}`
          : 'You decide'}
      </div>
    </div>
  );
}
