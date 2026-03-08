'use client';

import { useCallback, useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingInputProps {
  /** Current rating value (1-5) */
  value?: number;
  /** Callback when rating changes */
  onChange?: (value: number) => void;
  /** Accessible label for the rating input */
  label?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Optional class name for the container */
  className?: string;
}

const SIZE_STYLES = {
  sm: {
    star: 'w-4 h-4',
    gap: 'gap-0.5',
  },
  md: {
    star: 'w-5 h-5',
    gap: 'gap-1',
  },
  lg: {
    star: 'w-6 h-6',
    gap: 'gap-1.5',
  },
} as const;

export function StarRatingInput({
  value,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className = '',
}: StarRatingInputProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const styles = SIZE_STYLES[size];

  const displayValue = hoverValue ?? value ?? 0;

  const handleClick = useCallback(
    (rating: number) => {
      if (disabled) return;
      onChange?.(rating);
    },
    [disabled, onChange]
  );

  const handleMouseEnter = useCallback(
    (rating: number) => {
      if (disabled) return;
      setHoverValue(rating);
    },
    [disabled]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverValue(null);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, rating: number) => {
      if (disabled) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onChange?.(rating);
      }
    },
    [disabled, onChange]
  );

  return (
    <div
      className={`inline-flex items-center ${styles.gap} ${className}`}
      role="group"
      aria-label={label}
      onMouseLeave={handleMouseLeave}
    >
      {label && <span className="sr-only">{label}</span>}
      {[1, 2, 3, 4, 5].map((rating) => {
        const isFilled = rating <= displayValue;
        const isSelected = rating === value;

        return (
          <button
            key={rating}
            type="button"
            onClick={() => handleClick(rating)}
            onMouseEnter={() => handleMouseEnter(rating)}
            onKeyDown={(e) => handleKeyDown(e, rating)}
            disabled={disabled}
            className={`
              relative transition-all duration-150
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              focus:outline-none focus-visible:ring-2 focus-visible:ring-patina-mocha-brown focus-visible:ring-offset-1 rounded-sm
              ${!disabled && 'hover:scale-110 active:scale-95'}
            `}
            aria-label={`Rate ${rating} out of 5 stars`}
            aria-pressed={isSelected}
          >
            <Star
              className={`
                ${styles.star}
                transition-colors duration-150
                ${
                  isFilled
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-gray-300 fill-transparent'
                }
              `}
            />
          </button>
        );
      })}
    </div>
  );
}
