import * as React from 'react';

export interface PrefilledChipProps {
  /**
   * Source attribution rendered as the chip's body. Examples:
   * "Pre-filled from vendor record", "From 3 orders", "Auto-detected".
   * Passed verbatim; format it on the caller side.
   */
  source: string;
  className?: string;
}

/**
 * Small badge attached to field labels indicating that the adjacent field's
 * value was pre-populated, and from which source. Pairs with
 * `<PrefilledInput />`. Visual spec per PRD §5.6 — Sage tint, DM Mono,
 * uppercase, very small.
 */
export function PrefilledChip({ source, className }: PrefilledChipProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        marginLeft: 6,
        borderRadius: 2,
        background: 'rgba(168, 181, 160, 0.12)',
        color: 'var(--color-sage, #A8B5A0)',
        fontFamily: "'DM Mono', ui-monospace, SFMono-Regular, monospace",
        fontSize: '0.44rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      {source}
    </span>
  );
}
