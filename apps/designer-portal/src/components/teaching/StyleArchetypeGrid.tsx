'use client';

import { useStyleArchetypes } from '@patina/supabase';

interface StyleArchetype {
  id: string;
  name: string;
  description: string | null;
  color_hex: string | null;
  icon_name: string | null;
  display_order: number | null;
}

interface StyleArchetypeGridProps {
  selectedIds: string[];
  onToggle: (styleId: string) => void;
  maxSelections?: number;
  showDescriptions?: boolean;
}

export function StyleArchetypeGrid({
  selectedIds,
  onToggle,
  maxSelections = 2,
  showDescriptions = false,
}: StyleArchetypeGridProps) {
  const { data: archetypes, isLoading, error } = useStyleArchetypes();

  const selectedSet = new Set(selectedIds);
  const canSelectMore = selectedIds.length < maxSelections;

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-patina-clay-beige/30 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-patina-mocha-brown">
        Failed to load styles. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {((archetypes ?? []) as unknown as StyleArchetype[]).map((style, index) => {
          const isSelected = selectedSet.has(style.id);
          const isPrimary = selectedIds[0] === style.id;
          const isSecondary = selectedIds[1] === style.id;
          const isDisabled = !isSelected && !canSelectMore;

          return (
            <button
              key={style.id}
              onClick={() => onToggle(style.id)}
              disabled={isDisabled}
              className={`relative aspect-square rounded-lg border-2 transition-all flex flex-col items-center justify-center p-2 text-center
                ${
                  isSelected
                    ? 'border-patina-mocha-brown bg-patina-mocha-brown/10 shadow-md'
                    : 'border-patina-clay-beige/50 bg-white hover:border-patina-mocha-brown/50'
                }
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              style={
                style.color_hex && !isSelected
                  ? { backgroundColor: `${style.color_hex}15` }
                  : undefined
              }
            >
              {/* Selection badge */}
              {isSelected && (
                <span
                  className={`absolute top-1 right-1 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center
                    ${isPrimary ? 'bg-patina-mocha-brown' : 'bg-patina-clay-beige'}`}
                >
                  {isPrimary ? '1' : '2'}
                </span>
              )}

              {/* Color dot */}
              {style.color_hex && (
                <div
                  className="w-8 h-8 rounded-full mb-2"
                  style={{ backgroundColor: style.color_hex }}
                />
              )}

              {/* Name */}
              <span
                className={`text-xs font-medium leading-tight ${
                  isSelected ? 'text-patina-charcoal' : 'text-patina-mocha-brown'
                }`}
              >
                {style.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selection hint */}
      <div className="flex items-center justify-between text-xs text-patina-mocha-brown/70">
        <span>
          {selectedIds.length === 0
            ? `Select up to ${maxSelections} styles`
            : `${selectedIds.length} of ${maxSelections} selected`}
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-patina-mocha-brown text-white text-[10px] flex items-center justify-center">
              1
            </span>
            Primary
          </span>
          {maxSelections > 1 && (
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-patina-clay-beige text-white text-[10px] flex items-center justify-center">
                2
              </span>
              Secondary
            </span>
          )}
        </div>
      </div>

      {/* Descriptions (optional) */}
      {showDescriptions && selectedIds.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-patina-clay-beige/30">
          {selectedIds.map((id) => {
            const style = ((archetypes ?? []) as unknown as StyleArchetype[]).find((s) => s.id === id);
            if (!style?.description) return null;

            return (
              <div key={id} className="text-sm text-patina-mocha-brown">
                <span className="font-medium">{style.name}:</span> {style.description}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
