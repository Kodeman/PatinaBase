'use client';

import { useState, useCallback } from 'react';
import type { SpectrumDimension, SpectrumValues } from '@patina/types';

interface DimensionConfig {
  id: SpectrumDimension;
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftDescription?: string;
  rightDescription?: string;
}

const DIMENSION_CONFIGS: DimensionConfig[] = [
  {
    id: 'warmth',
    label: 'Warmth',
    leftLabel: 'Cool',
    rightLabel: 'Warm',
    leftDescription: 'Cool tones, crisp metals, minimal warmth',
    rightDescription: 'Rich woods, warm metals, earthy tones',
  },
  {
    id: 'complexity',
    label: 'Complexity',
    leftLabel: 'Simple',
    rightLabel: 'Complex',
    leftDescription: 'Clean lines, minimal ornamentation',
    rightDescription: 'Detailed, layered, intricate',
  },
  {
    id: 'formality',
    label: 'Formality',
    leftLabel: 'Casual',
    rightLabel: 'Formal',
    leftDescription: 'Relaxed, approachable, everyday',
    rightDescription: 'Refined, elegant, ceremonial',
  },
  {
    id: 'timelessness',
    label: 'Timelessness',
    leftLabel: 'Trendy',
    rightLabel: 'Classic',
    leftDescription: 'Contemporary, of-the-moment',
    rightDescription: 'Enduring, time-tested design',
  },
  {
    id: 'boldness',
    label: 'Boldness',
    leftLabel: 'Subtle',
    rightLabel: 'Bold',
    leftDescription: 'Understated, blends in',
    rightDescription: 'Statement piece, conversation starter',
  },
  {
    id: 'craftsmanship',
    label: 'Craftsmanship',
    leftLabel: 'Industrial',
    rightLabel: 'Artisan',
    leftDescription: 'Mass-produced, efficient',
    rightDescription: 'Handcrafted, unique details',
  },
];

interface StyleSpectrumSliderProps {
  values: Partial<SpectrumValues>;
  onChange: (values: Partial<SpectrumValues>) => void;
  disabled?: boolean;
  showDescriptions?: boolean;
}

export function StyleSpectrumSlider({
  values,
  onChange,
  disabled = false,
  showDescriptions = true,
}: StyleSpectrumSliderProps) {
  const [activeSlider, setActiveSlider] = useState<SpectrumDimension | null>(null);

  const handleChange = useCallback(
    (dimension: SpectrumDimension, value: number) => {
      onChange({
        ...values,
        [dimension]: value,
      });
    },
    [values, onChange]
  );

  const getSliderPosition = (value: number | null | undefined): number => {
    if (value === null || value === undefined) return 50;
    // Convert -1 to 1 range to 0-100 percentage
    return ((value + 1) / 2) * 100;
  };

  const getValueFromPosition = (position: number): number => {
    // Convert 0-100 percentage to -1 to 1 range
    return (position / 100) * 2 - 1;
  };

  return (
    <div className="space-y-6">
      {DIMENSION_CONFIGS.map((config) => {
        const value = values[config.id];
        const position = getSliderPosition(value);
        const isActive = activeSlider === config.id;
        const hasValue = value !== null && value !== undefined;

        return (
          <div key={config.id} className="space-y-2">
            {/* Labels */}
            <div className="flex items-center justify-between text-sm">
              <span
                className={`text-patina-mocha-brown ${
                  hasValue && value! < 0 ? 'font-medium text-patina-charcoal' : ''
                }`}
              >
                {config.leftLabel}
              </span>
              <span className="font-medium text-patina-charcoal">{config.label}</span>
              <span
                className={`text-patina-mocha-brown ${
                  hasValue && value! > 0 ? 'font-medium text-patina-charcoal' : ''
                }`}
              >
                {config.rightLabel}
              </span>
            </div>

            {/* Slider track */}
            <div
              className={`relative h-8 rounded-lg transition-colors ${
                disabled ? 'bg-patina-clay-beige/20' : 'bg-patina-clay-beige/30'
              }`}
            >
              {/* Center line */}
              <div className="absolute left-1/2 top-1 bottom-1 w-px bg-patina-clay-beige/50" />

              {/* Tick marks */}
              <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
                {[-1, -0.5, 0, 0.5, 1].map((tick) => (
                  <div
                    key={tick}
                    className={`w-1 h-1 rounded-full ${
                      tick === 0 ? 'bg-patina-mocha-brown' : 'bg-patina-clay-beige'
                    }`}
                  />
                ))}
              </div>

              {/* Range input */}
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={position}
                onChange={(e) => {
                  const newValue = getValueFromPosition(parseInt(e.target.value));
                  handleChange(config.id, Math.round(newValue * 100) / 100);
                }}
                onFocus={() => setActiveSlider(config.id)}
                onBlur={() => setActiveSlider(null)}
                disabled={disabled}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />

              {/* Thumb */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 transition-all pointer-events-none
                  ${
                    disabled
                      ? 'bg-patina-clay-beige border-patina-clay-beige'
                      : hasValue
                      ? 'bg-patina-mocha-brown border-patina-mocha-brown shadow-md'
                      : 'bg-white border-patina-clay-beige'
                  }
                  ${isActive ? 'scale-110 shadow-lg' : ''}
                `}
                style={{ left: `calc(${position}% - 12px)` }}
              >
                {hasValue && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium">
                    {value! > 0 ? '+' : ''}
                    {Math.round(value! * 10) / 10}
                  </span>
                )}
              </div>
            </div>

            {/* Descriptions */}
            {showDescriptions && isActive && (
              <div className="flex justify-between text-xs text-patina-mocha-brown/70 px-1">
                <span className="max-w-[45%]">{config.leftDescription}</span>
                <span className="max-w-[45%] text-right">{config.rightDescription}</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Reset button */}
      {Object.values(values).some((v) => v !== null && v !== undefined) && !disabled && (
        <button
          onClick={() =>
            onChange({
              warmth: null,
              complexity: null,
              formality: null,
              timelessness: null,
              boldness: null,
              craftsmanship: null,
            })
          }
          className="text-xs text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
        >
          Reset all sliders
        </button>
      )}
    </div>
  );
}

// Single slider component for inline use
interface SingleSpectrumSliderProps {
  dimension: SpectrumDimension;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function SingleSpectrumSlider({
  dimension,
  value,
  onChange,
  disabled = false,
}: SingleSpectrumSliderProps) {
  const config = DIMENSION_CONFIGS.find((c) => c.id === dimension);
  if (!config) return null;

  const position = value !== null ? ((value + 1) / 2) * 100 : 50;
  const hasValue = value !== null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-patina-mocha-brown">{config.leftLabel}</span>
        <span className="font-medium text-patina-charcoal">{config.label}</span>
        <span className="text-patina-mocha-brown">{config.rightLabel}</span>
      </div>

      <div className="relative h-6 bg-patina-clay-beige/30 rounded">
        <div className="absolute left-1/2 top-0.5 bottom-0.5 w-px bg-patina-clay-beige/50" />

        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={position}
          onChange={(e) => {
            const newValue = (parseInt(e.target.value) / 100) * 2 - 1;
            onChange(Math.round(newValue * 100) / 100);
          }}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        <div
          className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 transition-all pointer-events-none
            ${
              hasValue
                ? 'bg-patina-mocha-brown border-patina-mocha-brown'
                : 'bg-white border-patina-clay-beige'
            }
          `}
          style={{ left: `calc(${position}% - 10px)` }}
        />
      </div>
    </div>
  );
}
