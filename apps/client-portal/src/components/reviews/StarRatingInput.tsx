'use client';

import { Star } from 'lucide-react';

interface StarRatingInputProps {
  value: number;
  onChange: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const SIZE_PX: Record<NonNullable<StarRatingInputProps['size']>, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

export function StarRatingInput({
  value,
  onChange,
  size = 'md',
  disabled = false,
}: StarRatingInputProps) {
  const px = SIZE_PX[size];
  return (
    <div role="radiogroup" aria-label="Rating" className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="rounded-sm p-1 transition hover:bg-[var(--bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
          >
            <Star
              width={px}
              height={px}
              className={
                filled
                  ? 'fill-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'text-[var(--border-default)]'
              }
            />
          </button>
        );
      })}
    </div>
  );
}
