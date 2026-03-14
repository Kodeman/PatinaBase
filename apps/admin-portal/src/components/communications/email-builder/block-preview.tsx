'use client';

import type { TypedContentBlock } from '@patina/shared/types';
import { BLOCK_TYPE_LABELS } from './constants';

/** Simplified visual preview of a block shown on the canvas. */
export function BlockPreview({ block }: { block: TypedContentBlock }) {
  switch (block.type) {
    case 'header':
      return (
        <div className="bg-[#3C3226] text-center py-5 px-6 rounded-t-lg">
          <div className="text-[#FAF7F2] font-display text-lg font-semibold tracking-wider">PATINA</div>
          <div className="text-[#A3927C] text-[10px] tracking-widest uppercase mt-1">{block.props.tagline}</div>
        </div>
      );

    case 'hero':
      return (
        <div className="px-6 py-5">
          <p className="text-xs text-[#A3927C] mb-0.5">{block.props.greeting}</p>
          <h2 className="font-display text-lg font-semibold text-patina-charcoal leading-tight">{block.props.headline}</h2>
          <p className="text-xs text-[#6B645D] mt-1">{block.props.subline}</p>
        </div>
      );

    case 'text_block':
      return (
        <div className="px-6 py-3" style={{ textAlign: block.props.align }}>
          <p className="text-xs text-[#4A453F] line-clamp-3">{block.props.text}</p>
        </div>
      );

    case 'divider':
      return (
        <div className="px-6 py-2">
          <div
            className={block.props.variant === 'gold' ? 'border-t-2 border-[#A3927C]' : 'border-t border-[#EDE9E4]'}
          />
        </div>
      );

    case 'product_card':
      return (
        <div className="px-6 py-3">
          <div className="border border-[#EDE9E4] rounded-lg overflow-hidden">
            <div className="h-20 bg-[#F5F1ED]" />
            <div className="p-3">
              <p className="text-[9px] text-[#A3927C] uppercase tracking-wider font-medium">{block.props.provenance}</p>
              <p className="text-sm font-semibold text-patina-charcoal">{block.props.product_name}</p>
              <p className="text-xs text-patina-charcoal font-medium mt-1">{block.props.price}</p>
            </div>
          </div>
        </div>
      );

    case 'product_grid': {
      const count = block.props.products?.length ?? 0;
      return (
        <div className="px-6 py-3">
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: Math.min(count, 4) || 2 }).map((_, i) => (
              <div key={i} className="border border-[#EDE9E4] rounded-md overflow-hidden">
                <div className="h-12 bg-[#F5F1ED]" />
                <div className="p-2">
                  <p className="text-[10px] font-medium text-patina-charcoal truncate">
                    {block.props.products?.[i]?.product_name || 'Product'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'cta_button':
      return (
        <div className="px-6 py-4 text-center">
          {block.props.supporting_text && (
            <p className="text-[11px] text-[#6B645D] mb-2">{block.props.supporting_text}</p>
          )}
          <span
            className={`inline-block px-5 py-2 text-white text-xs font-medium rounded-full ${
              block.props.variant === 'dark' ? 'bg-[#2C2926]' : 'bg-[#A3927C]'
            }`}
          >
            {block.props.text}
          </span>
        </div>
      );

    case 'notification':
      return (
        <div className="px-6 py-3">
          <div className="bg-[#FAF7F2] rounded-lg p-3">
            <span className="inline-block px-2 py-0.5 bg-[#A3927C] text-white rounded-full text-[9px] font-semibold uppercase tracking-wider">
              {block.props.badge_label}
            </span>
            <p className="text-sm font-semibold text-patina-charcoal mt-1.5">{block.props.headline}</p>
            <p className="text-[11px] text-[#6B645D] mt-0.5 line-clamp-2">{block.props.body}</p>
          </div>
        </div>
      );

    case 'maker_spotlight':
      return (
        <div className="px-6 py-3">
          <div className="bg-[#FAF7F2] rounded-lg p-4 text-center">
            <div className="w-10 h-10 rounded-full bg-[#EDE9E4] mx-auto mb-2" />
            <p className="text-[9px] text-[#A3927C] uppercase tracking-widest font-semibold">Maker Spotlight</p>
            <p className="text-sm font-display font-semibold text-patina-charcoal">{block.props.maker_name}</p>
            <p className="text-[11px] text-[#6B645D] mt-1 line-clamp-2">{block.props.story}</p>
          </div>
        </div>
      );

    case 'footer':
      return (
        <div className="bg-[#2C2926] text-center py-4 px-6 rounded-b-lg">
          <div className="text-[#FAF7F2] font-display text-sm font-semibold tracking-wider">PATINA</div>
          <div className="flex items-center justify-center gap-2 mt-2">
            {block.props.nav_links?.map((l: { label: string }, i: number) => (
              <span key={i} className="text-[10px] text-[#A3927C]">{l.label}</span>
            ))}
          </div>
        </div>
      );

    default:
      return (
        <div className="px-6 py-4 text-center text-xs text-patina-clay-beige">
          {BLOCK_TYPE_LABELS[(block as TypedContentBlock).type] || 'Unknown block'}
        </div>
      );
  }
}
