'use client';

interface FilterOption {
  key: string;
  label: string;
  count?: number;
}

interface FilterRowProps {
  options: FilterOption[];
  active: string;
  onChange: (key: string) => void;
}

export function FilterRow({ options, active, onChange }: FilterRowProps) {
  return (
    <div className="mb-6 flex flex-wrap gap-4">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`cursor-pointer border-0 bg-transparent type-meta transition-colors ${
            active === opt.key
              ? 'text-[var(--text-primary)] underline underline-offset-4 decoration-[var(--accent-primary)]'
              : 'text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]'
          }`}
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className="type-meta-small ml-1.5 text-[var(--text-muted)]">
              {opt.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
