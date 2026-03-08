'use client';

import { useState, useCallback } from 'react';
import type { SpectrumValues } from '@patina/types';
import { StyleArchetypeGrid } from './StyleArchetypeGrid';
import { StyleSpectrumSlider } from './StyleSpectrumSlider';

interface StyleAttributionPanelProps {
  primaryStyleId: string | null;
  secondaryStyleId: string | null;
  spectrumValues: Partial<SpectrumValues>;
  onPrimaryChange: (styleId: string | null) => void;
  onSecondaryChange: (styleId: string | null) => void;
  onSpectrumChange: (values: Partial<SpectrumValues>) => void;
  showSpectrum?: boolean;
  disabled?: boolean;
}

export function StyleAttributionPanel({
  primaryStyleId,
  secondaryStyleId,
  spectrumValues,
  onPrimaryChange,
  onSecondaryChange,
  onSpectrumChange,
  showSpectrum = true,
  disabled = false,
}: StyleAttributionPanelProps) {
  const [expandedSection, setExpandedSection] = useState<'styles' | 'spectrum' | null>('styles');

  const selectedStyleIds = [primaryStyleId, secondaryStyleId].filter(Boolean) as string[];

  const handleStyleToggle = useCallback(
    (styleId: string) => {
      if (primaryStyleId === styleId) {
        // Clicking primary: move secondary to primary, clear secondary
        onPrimaryChange(secondaryStyleId);
        onSecondaryChange(null);
      } else if (secondaryStyleId === styleId) {
        // Clicking secondary: just remove it
        onSecondaryChange(null);
      } else if (!primaryStyleId) {
        // No primary: set as primary
        onPrimaryChange(styleId);
      } else if (!secondaryStyleId) {
        // Has primary, no secondary: set as secondary
        onSecondaryChange(styleId);
      } else {
        // Both slots full: replace secondary
        onSecondaryChange(styleId);
      }
    },
    [primaryStyleId, secondaryStyleId, onPrimaryChange, onSecondaryChange]
  );

  return (
    <div className="space-y-6">
      {/* Style Selection Section */}
      <section>
        <button
          onClick={() => setExpandedSection(expandedSection === 'styles' ? null : 'styles')}
          className="w-full flex items-center justify-between py-2 text-left"
        >
          <div>
            <h3 className="font-medium text-patina-charcoal">Style Classification</h3>
            <p className="text-sm text-patina-mocha-brown/70">
              Select primary and optionally secondary style
            </p>
          </div>
          <svg
            className={`w-5 h-5 text-patina-mocha-brown transition-transform ${
              expandedSection === 'styles' ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSection === 'styles' && (
          <div className="pt-4">
            <StyleArchetypeGrid
              selectedIds={selectedStyleIds}
              onToggle={handleStyleToggle}
              maxSelections={2}
              showDescriptions={true}
            />
          </div>
        )}

        {/* Selection summary when collapsed */}
        {expandedSection !== 'styles' && selectedStyleIds.length > 0 && (
          <div className="flex gap-2 mt-2">
            {selectedStyleIds.map((id, index) => (
              <span
                key={id}
                className={`px-3 py-1 text-sm rounded-full ${
                  index === 0
                    ? 'bg-patina-mocha-brown text-white'
                    : 'bg-patina-clay-beige/30 text-patina-charcoal'
                }`}
              >
                {index === 0 ? 'Primary' : 'Secondary'}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Spectrum Section */}
      {showSpectrum && (
        <section className="border-t border-patina-clay-beige/30 pt-4">
          <button
            onClick={() => setExpandedSection(expandedSection === 'spectrum' ? null : 'spectrum')}
            className="w-full flex items-center justify-between py-2 text-left"
          >
            <div>
              <h3 className="font-medium text-patina-charcoal">Style Spectrum</h3>
              <p className="text-sm text-patina-mocha-brown/70">
                Fine-tune positioning on 6 design dimensions
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-patina-mocha-brown transition-transform ${
                expandedSection === 'spectrum' ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSection === 'spectrum' && (
            <div className="pt-4">
              <StyleSpectrumSlider
                values={spectrumValues}
                onChange={onSpectrumChange}
                disabled={disabled}
                showDescriptions={true}
              />
            </div>
          )}

          {/* Spectrum summary when collapsed */}
          {expandedSection !== 'spectrum' && Object.values(spectrumValues).some((v) => v !== null) && (
            <div className="flex items-center gap-4 mt-2 text-sm text-patina-mocha-brown">
              <span>
                {Object.values(spectrumValues).filter((v) => v !== null).length} of 6 dimensions set
              </span>
            </div>
          )}
        </section>
      )}

      {/* Validation hint */}
      {!primaryStyleId && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            Please select at least a primary style to continue.
          </p>
        </div>
      )}
    </div>
  );
}
