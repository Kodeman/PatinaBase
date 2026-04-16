'use client';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: SearchInputProps) {
  return (
    <div className={`relative w-full max-w-[320px] ${className}`}>
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[0.82rem] text-[var(--text-muted)]">
        ⌕
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] py-2 pl-7 pr-3 font-body text-[0.82rem] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      />
    </div>
  );
}
