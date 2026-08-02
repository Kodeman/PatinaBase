import * as React from 'react';

/**
 * Padding-safe stand-in for react-email's <Section>.
 *
 * react-email's <Section style={{ padding }}> puts the style on the wrapping
 * <table>, and CSS `border-collapse: collapse` makes a TABLE's own padding a
 * no-op. Gmail applies border-collapse to every message table (its `.cf` rule)
 * and strips our embedded reset, so any padding declared on a <table> is simply
 * dropped — sections render edge-to-edge. Padding on a <td> survives collapse
 * in every renderer, which is why the Deno shell
 * (supabase/functions/_shared/branded-email.ts) has never had this bug.
 *
 * PadSection emits the same table/tbody/tr/td skeleton as <Section> but routes
 * every padding-ish declaration to the <td> and everything else (background,
 * border, radius, margin, text-align…) to the <table>, where those properties
 * do work. It also pins `width:100%` inline: Microsoft's Exchange HTML
 * converter strips table *attributes* (width/align/border/cellpadding), so the
 * `width="100%"` attribute alone is not load-bearing in Outlook/M365.
 *
 * `className` lands on the padded <td> so HEAD_CSS's mobile override
 * (`.px { padding-left/right }`) still targets the element that owns padding.
 */

const PADDING_PROPS = new Set<string>([
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingBlockStart',
  'paddingBlockEnd',
  'paddingInline',
  'paddingInlineStart',
  'paddingInlineEnd',
]);

/** Splits a style object into the part a <table> can honour and the padding a <td> must own. */
export function splitPaddingStyle(style?: React.CSSProperties): {
  tableStyle: React.CSSProperties;
  cellStyle: React.CSSProperties;
} {
  const tableStyle: Record<string, unknown> = {};
  const cellStyle: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style ?? {})) {
    if (value === undefined) continue;
    if (PADDING_PROPS.has(key)) cellStyle[key] = value;
    else tableStyle[key] = value;
  }
  return {
    tableStyle: tableStyle as React.CSSProperties,
    cellStyle: cellStyle as React.CSSProperties,
  };
}

export interface PadSectionProps {
  /** Same style object you would have handed <Section>; padding is re-homed onto the <td>. */
  style?: React.CSSProperties;
  /** Applied to the padded <td> — keep `px` here so the mobile media query still bites. */
  className?: string;
  /** Horizontal alignment of the cell content (the table itself always centers). */
  cellAlign?: 'left' | 'center' | 'right';
  children?: React.ReactNode;
}

export const PadSection: React.FC<PadSectionProps> = ({
  style,
  className,
  cellAlign,
  children,
}) => {
  const { tableStyle, cellStyle } = splitPaddingStyle(style);
  return (
    <table
      align="center"
      width="100%"
      border={0}
      cellPadding="0"
      cellSpacing="0"
      role="presentation"
      style={{ width: '100%', ...tableStyle }}
    >
      <tbody>
        <tr>
          <td className={className} align={cellAlign} style={cellStyle}>
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
};

export default PadSection;
