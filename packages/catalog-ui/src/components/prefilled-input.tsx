import * as React from 'react';
import { Input, type InputProps } from '@patina/design-system';

export interface PrefilledInputProps extends InputProps {
  /**
   * Marks the field as pre-filled from an inferred source (vendor record,
   * past orders, auto-detection, etc.). Applies the Sage tint specified in
   * PRD §5.6 so reviewers can see at a glance which fields were inferred
   * vs. typed.
   */
  prefilled?: boolean;
  /**
   * Optional human-readable source attribution (e.g. "vendor record",
   * "3 orders", "auto-detected"). Surfaced via `<PrefilledChip />` next to
   * the field label — pass it through to the chip from the form layout
   * rather than reading it here. Stored on the field for symmetry with the
   * PRD interface.
   */
  prefilledFrom?: string;
}

const PREFILLED_STYLE: React.CSSProperties = {
  // 5% Sage background, 30% Sage border per PRD §5.6.
  backgroundColor: 'rgba(168, 181, 160, 0.05)',
  borderColor: 'rgba(168, 181, 160, 0.3)',
};

/**
 * Wraps the design-system `<Input>` with the Sage-tinted pre-fill state used
 * across promotion modals (PRD §5.6, §6.2). When `prefilled` is false the
 * component is a pass-through.
 *
 * Source attribution is not rendered inline — use `<PrefilledChip>` next to
 * the field's label instead, so screen readers see a single discoverable
 * announcement rather than redundant text inside the input.
 */
export const PrefilledInput = React.forwardRef<HTMLInputElement, PrefilledInputProps>(
  ({ prefilled, prefilledFrom: _prefilledFrom, style, ...rest }, ref) => {
    return (
      <Input
        ref={ref}
        style={prefilled ? { ...PREFILLED_STYLE, ...style } : style}
        {...rest}
      />
    );
  }
);

PrefilledInput.displayName = 'PrefilledInput';
