/**
 * Style chips for quick style tagging
 */

import type { StyleArchetype, UUID } from '@patina/shared';

interface StyleChipsProps {
  styles: StyleArchetype[];
  selectedIds: UUID[];
  onToggle: (styleId: UUID) => void;
  maxVisible?: number;
  isLoading?: boolean;
}

export function StyleChips({
  styles,
  selectedIds,
  onToggle,
  maxVisible = 6,
  isLoading = false,
}: StyleChipsProps) {
  const visibleStyles = styles.slice(0, maxVisible);
  const selectedSet = new Set(selectedIds);

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 bg-patina-clay-beige/30 rounded-full animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (styles.length === 0) {
    return (
      <p className="text-sm text-patina-mocha-brown/50">
        No styles available
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visibleStyles.map(style => {
          const isSelected = selectedSet.has(style.id);

          return (
            <button
              key={style.id}
              onClick={() => onToggle(style.id)}
              className={`px-3 py-1 rounded-full text-sm transition-colors flex items-center gap-1
                       ${isSelected
                         ? 'bg-patina-mocha-brown text-white'
                         : 'bg-patina-clay-beige/30 text-patina-charcoal hover:bg-patina-clay-beige/50'
                       }`}
              style={
                style.colorHex && !isSelected
                  ? { backgroundColor: `${style.colorHex}30` }
                  : undefined
              }
            >
              {isSelected && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {style.name}
            </button>
          );
        })}
      </div>

      {selectedIds.length > 0 && (
        <p className="text-xs text-patina-mocha-brown">
          {selectedIds.length} style{selectedIds.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}
