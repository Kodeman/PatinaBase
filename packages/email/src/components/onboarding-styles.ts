// Shared style constants for the designer-onboarding template family
// (T0/N1/N2 invite track, W0/E2-E10 spine, M1-M4 milestones — see
// docs/marketing/founding-onboarding/copy-deck.md). Kept in one place so the
// 17 templates stay visually consistent instead of repeating a style
// dictionary per file. Palette matches BaseEmailLayout/Button's BRAND
// constants (kept in sync by eye — those files are the source of truth for
// the house brand).
import type { CSSProperties } from 'react';

export const BRAND = {
  linen: '#FAF7F2',
  warmGold: '#C4A57B',
  deepGold: '#8B7355',
  charcoal: '#2C2926',
  ink: '#4A453F',
  faint: '#7A736C',
  white: '#FFFFFF',
  hairline: '#E8E2DB',
};

// Default body copy — used by the spine/milestone/nudge emails (E2-E9,
// M1-M4, N1).
export const paragraph: CSSProperties = {
  color: BRAND.ink,
  fontSize: '15px',
  lineHeight: '25px',
  margin: '0 0 18px 0',
};

// Letters (T0, N2, W0, E10) render with more generous spacing per the copy
// deck's conventions ("must render as letters — no feature grids, no
// screenshots, generous line spacing").
export const letterParagraph: CSSProperties = {
  ...paragraph,
  lineHeight: '28px',
  margin: '0 0 22px 0',
};

export const bullet: CSSProperties = {
  color: BRAND.ink,
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 10px 0',
  paddingLeft: '4px',
};

export const buttonContainer: CSSProperties = {
  margin: '30px 0',
  textAlign: 'center',
};

export const signature: CSSProperties = {
  color: BRAND.charcoal,
  fontSize: '15px',
  lineHeight: '24px',
  margin: '26px 0 0 0',
};

export const tagline: CSSProperties = {
  color: BRAND.faint,
  fontSize: '13px',
  fontStyle: 'italic',
  margin: '4px 0 0 0',
};

export const smallText: CSSProperties = {
  color: BRAND.faint,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 16px 0',
};
