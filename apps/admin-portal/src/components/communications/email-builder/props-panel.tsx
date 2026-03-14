'use client';

import { useSelectedBlock, useTemplateBuilderStore } from '@/stores/template-builder-store';
import { BLOCK_TYPE_LABELS } from './constants';
import { HeaderPropsForm } from './props-forms/header-props-form';
import { HeroPropsForm } from './props-forms/hero-props-form';
import { TextBlockPropsForm } from './props-forms/text-block-props-form';
import { DividerPropsForm } from './props-forms/divider-props-form';
import { ProductCardPropsForm } from './props-forms/product-card-props-form';
import { ProductGridPropsForm } from './props-forms/product-grid-props-form';
import { CtaButtonPropsForm } from './props-forms/cta-button-props-form';
import { NotificationPropsForm } from './props-forms/notification-props-form';
import { MakerSpotlightPropsForm } from './props-forms/maker-spotlight-props-form';
import { FooterPropsForm } from './props-forms/footer-props-form';

export function PropsPanel() {
  const block = useSelectedBlock();
  const updateBlockProps = useTemplateBuilderStore((s) => s.updateBlockProps);

  if (!block) {
    return (
      <div className="w-[320px] flex-shrink-0 border-l border-patina-clay-beige/20 bg-white">
        <div className="flex items-center justify-center h-full text-patina-clay-beige/60">
          <div className="text-center px-8">
            <p className="text-sm font-medium">No block selected</p>
            <p className="text-xs mt-1">Click a block on the canvas to edit its properties</p>
          </div>
        </div>
      </div>
    );
  }

  const handleChange = (partial: Record<string, unknown>) => {
    updateBlockProps(block.id, partial);
  };

  return (
    <div className="w-[320px] flex-shrink-0 border-l border-patina-clay-beige/20 bg-white overflow-y-auto">
      <div className="p-4 border-b border-patina-clay-beige/10">
        <h3 className="text-sm font-semibold text-patina-charcoal">
          {BLOCK_TYPE_LABELS[block.type]}
        </h3>
        <p className="text-[11px] text-patina-clay-beige mt-0.5">
          Edit block properties
        </p>
      </div>
      <div className="p-4">
        {block.type === 'header' && <HeaderPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'hero' && <HeroPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'text_block' && <TextBlockPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'divider' && <DividerPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'product_card' && <ProductCardPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'product_grid' && <ProductGridPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'cta_button' && <CtaButtonPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'notification' && <NotificationPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'maker_spotlight' && <MakerSpotlightPropsForm props={block.props} onChange={handleChange} />}
        {block.type === 'footer' && <FooterPropsForm props={block.props} onChange={handleChange} />}
      </div>
    </div>
  );
}
