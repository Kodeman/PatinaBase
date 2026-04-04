/**
 * Confidence indicator for extraction quality
 */

import type { ExtractionConfidence } from '@patina/shared';

interface ConfidenceIndicatorProps {
  confidence: ExtractionConfidence;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const CONFIDENCE_CONFIG = {
  high: {
    color: 'bg-sage',
    textColor: 'text-sage',
    bgColor: 'bg-sage/15',
    label: 'High confidence',
    description: 'Most product data was extracted successfully',
  },
  medium: {
    color: 'bg-golden-hour',
    textColor: 'text-aged-oak',
    bgColor: 'bg-golden-hour/15',
    label: 'Medium confidence',
    description: 'Some data may need review',
  },
  low: {
    color: 'bg-terracotta',
    textColor: 'text-terracotta',
    bgColor: 'bg-terracotta/15',
    label: 'Low confidence',
    description: 'Manual entry recommended',
  },
};

export function ConfidenceIndicator({
  confidence,
  showLabel = true,
  size = 'md',
}: ConfidenceIndicatorProps) {
  const config = CONFIDENCE_CONFIG[confidence];
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${showLabel ? `${config.bgColor} px-2 py-1 rounded-[3px]` : ''}`}
      title={config.description}
    >
      <span className={`${dotSize} rounded-full ${config.color}`} />
      {showLabel && (
        <span className={`font-mono text-[0.62rem] uppercase tracking-[0.06em] ${config.textColor}`}>
          {config.label}
        </span>
      )}
    </div>
  );
}

// Also export a text-only version for use in descriptions
export function ConfidenceText({ confidence }: { confidence: ExtractionConfidence }) {
  const config = CONFIDENCE_CONFIG[confidence];

  return (
    <span className={`text-sm ${config.textColor}`}>
      {config.description}
    </span>
  );
}
