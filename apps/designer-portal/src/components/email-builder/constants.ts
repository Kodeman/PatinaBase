import type { ContentBlockType } from '@patina/types';

export interface BlockPaletteItem {
  type: ContentBlockType;
  label: string;
  icon: string; // lucide icon name
  description: string;
}

/** Blocks available in the palette (excludes header/footer which are structural). */
export const PALETTE_BLOCKS: BlockPaletteItem[] = [
  { type: 'hero', label: 'Hero', icon: 'Sparkles', description: 'Greeting, headline & subline' },
  { type: 'text_block', label: 'Text', icon: 'Type', description: 'Paragraph text' },
  { type: 'divider', label: 'Divider', icon: 'Minus', description: 'Subtle or gold line' },
  { type: 'product_card', label: 'Product', icon: 'ShoppingBag', description: 'Full-width product card' },
  { type: 'product_grid', label: 'Grid', icon: 'LayoutGrid', description: 'Two-column product grid' },
  { type: 'cta_button', label: 'Button', icon: 'MousePointerClick', description: 'Call-to-action button' },
  { type: 'notification', label: 'Notice', icon: 'Bell', description: 'Notification card' },
  { type: 'maker_spotlight', label: 'Maker', icon: 'User', description: 'Maker spotlight section' },
];

export const BLOCK_TYPE_LABELS: Record<ContentBlockType, string> = {
  header: 'Header',
  hero: 'Hero',
  text_block: 'Text Block',
  divider: 'Divider',
  product_card: 'Product Card',
  product_grid: 'Product Grid',
  cta_button: 'CTA Button',
  notification: 'Notification',
  maker_spotlight: 'Maker Spotlight',
  footer: 'Footer',
};
