// Shared style constants for the designer-onboarding template family
// (T0/N1/N2 invite track, W0/E2-E10 spine, M1-M4 milestones — see
// docs/marketing/founding-onboarding/copy-deck.md). Keys are preserved so the
// 17 templates inherit the new brand palette without per-file edits; values now
// draw from the canonical design tokens in ./brand.ts.
import type { CSSProperties } from 'react';
import { COLORS, FONTS } from './brand';

export const BRAND = {
  linen: COLORS.card, // #FCF9F2
  warmGold: COLORS.brass, // #B08A46 (accent)
  deepGold: COLORS.verd, // #4E7A66 (signature accent / links)
  charcoal: COLORS.ink, // #1F1B16
  ink: COLORS.ink2, // #4B463E
  faint: COLORS.ink3, // #8C8578
  white: COLORS.cardAlt, // #FFFFFF
  hairline: COLORS.line, // #E6DDCC
};

// Default body copy — used by the spine/milestone/nudge emails (E2-E9, M1-M4, N1).
export const paragraph: CSSProperties = {
  fontFamily: FONTS.sans,
  color: BRAND.ink,
  fontSize: '16px',
  lineHeight: '1.62',
  margin: '0 0 16px 0',
};

// Letters (T0, N2, W0, E10) render with more generous spacing per the copy deck.
export const letterParagraph: CSSProperties = {
  ...paragraph,
  lineHeight: '1.75',
  margin: '0 0 20px 0',
};

export const bullet: CSSProperties = {
  fontFamily: FONTS.sans,
  color: BRAND.ink,
  fontSize: '15px',
  lineHeight: '1.55',
  margin: '0 0 10px 0',
  paddingLeft: '4px',
};

export const buttonContainer: CSSProperties = {
  margin: '28px 0',
  textAlign: 'left',
};

export const signature: CSSProperties = {
  fontFamily: FONTS.serif,
  fontStyle: 'italic',
  color: BRAND.ink,
  fontSize: '16px',
  lineHeight: '1.5',
  margin: '22px 0 0 0',
};

export const tagline: CSSProperties = {
  fontFamily: FONTS.sans,
  color: BRAND.faint,
  fontSize: '13px',
  fontStyle: 'italic',
  margin: '4px 0 0 0',
};

export const smallText: CSSProperties = {
  fontFamily: FONTS.sans,
  color: BRAND.faint,
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
};
