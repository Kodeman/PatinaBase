/**
 * Block Renderer — maps content_blocks JSONB to HTML strings.
 * Used by the preview API, campaign-dispatch Edge Function, and client-side builder preview.
 *
 * Pure string functions — no React dependency. Works in Edge Functions and browser.
 */

import type { ContentBlock, ContentBlockType } from '@patina/shared/types';
import { wrapSkeleton } from './block-html/skeleton';
import { renderHeader } from './block-html/header';
import { renderHero } from './block-html/hero';
import { renderTextBlock } from './block-html/text-block';
import { renderDivider } from './block-html/divider';
import { renderProductCard } from './block-html/product-card';
import { renderProductGrid } from './block-html/product-grid';
import { renderCtaButton } from './block-html/cta-button';
import { renderNotification } from './block-html/notification';
import { renderMakerSpotlight } from './block-html/maker-spotlight';
import { renderFooter } from './block-html/footer';

export interface RenderContext {
  previewMode?: boolean;
  baseUrl?: string;
  /**
   * Optional flat variable map. When set, the renderer post-processes block
   * HTML to replace `{{name}}` and `{{ name.path }}` tokens with these values.
   * Mirrors the mustache-style interpolation in
   * `supabase/functions/_shared/render-template.ts`.
   */
  variables?: Record<string, unknown>;
  /**
   * Optional hidden inbox-preview snippet, emitted by wrapSkeleton
   * immediately after <body> (see welcome.html). Only used by renderTemplate
   * — has no effect on renderBlock/renderBlocks.
   */
  preheader?: string;
}

/**
 * Replace {{key}} and {{ key }} tokens in a string with values from data.
 * Missing keys render as empty strings to avoid leaking placeholders.
 */
export function interpolate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = resolveKey(data, key);
    if (value === null || value === undefined) return '';
    return String(value);
  });
}

function resolveKey(data: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return data[key];
  const parts = key.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// ─── Block dispatch ─────────────────────────────────────────────────────

type BlockRenderer = (props: Record<string, unknown>, ctx: RenderContext) => string;

const blockRenderers: Record<ContentBlockType, BlockRenderer> = {
  header: (props, ctx) => renderHeader(props as never, ctx),
  hero: (props, ctx) => renderHero(props as never, ctx),
  text_block: (props, ctx) => renderTextBlock(props as never, ctx),
  divider: (props, ctx) => renderDivider(props as never, ctx),
  product_card: (props, ctx) => renderProductCard(props as never, ctx),
  product_grid: (props, ctx) => renderProductGrid(props as never, ctx),
  cta_button: (props, ctx) => renderCtaButton(props as never, ctx),
  notification: (props, ctx) => renderNotification(props as never, ctx),
  maker_spotlight: (props, ctx) => renderMakerSpotlight(props as never, ctx),
  footer: (props, ctx) => renderFooter(props as never, ctx),
};

function applyInterpolation(html: string, ctx: RenderContext): string {
  if (!ctx.variables) return html;
  return interpolate(html, ctx.variables);
}

/**
 * Render a single block to an HTML `<tr>` fragment.
 */
export function renderBlock(block: ContentBlock, ctx: RenderContext = {}): string {
  const renderer = blockRenderers[block.type];
  if (!renderer) {
    return `<!-- Unknown block type: ${block.type} -->`;
  }
  return applyInterpolation(renderer(block.props, ctx), ctx);
}

/**
 * Render an array of blocks to HTML fragments (no skeleton wrapper).
 * Backward-compatible with the old API.
 */
export function renderBlocks(blocks: ContentBlock[], ctx: RenderContext = {}): string {
  if (!blocks || blocks.length === 0) return '';
  return blocks.map((block) => renderBlock(block, ctx)).join('\n');
}

/**
 * Render a full email template from blocks — wraps in the email skeleton.
 * Expects the full ordered array: [header, ...content, footer].
 */
export function renderTemplate(blocks: ContentBlock[], ctx: RenderContext = {}): string {
  if (!blocks || blocks.length === 0) return '';
  const innerRows = blocks.map((block) => renderBlock(block, ctx)).join('\n');
  return wrapSkeleton(innerRows, ctx.preheader);
}
