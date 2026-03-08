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
    color: 'bg-green-500',
    textColor: 'text-green-700',
    bgColor: 'bg-green-100',
    label: 'High confidence',
    description: 'Most product data was extracted successfully',
  },
  medium: {
    color: 'bg-yellow-500',
    textColor: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    label: 'Medium confidence',
    description: 'Some data may need review',
  },
  low: {
    color: 'bg-red-500',
    textColor: 'text-red-700',
    bgColor: 'bg-red-100',
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
      className={`inline-flex items-center gap-1.5 ${showLabel ? `${config.bgColor} px-2 py-1 rounded-full` : ''}`}
      title={config.description}
    >
      <span className={`${dotSize} rounded-full ${config.color}`} />
      {showLabel && (
        <span className={`text-xs font-medium ${config.textColor}`}>
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
