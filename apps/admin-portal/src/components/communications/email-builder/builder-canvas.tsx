'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTemplateBuilderStore } from '@/stores/template-builder-store';
import { BlockPreview } from './block-preview';
import { SortableBlock } from './sortable-block';
import { cn } from '@/lib/utils';

export function BuilderCanvas() {
  const headerBlock = useTemplateBuilderStore((s) => s.headerBlock);
  const footerBlock = useTemplateBuilderStore((s) => s.footerBlock);
  const contentBlocks = useTemplateBuilderStore((s) => s.contentBlocks);
  const selectedBlockId = useTemplateBuilderStore((s) => s.selectedBlockId);
  const selectBlock = useTemplateBuilderStore((s) => s.selectBlock);
  const previewDevice = useTemplateBuilderStore((s) => s.previewDevice);

  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop-zone' });

  const blockIds = contentBlocks.map((b) => b.id);

  return (
    <div className="flex-1 overflow-y-auto bg-[#F0EDE9] flex justify-center py-8 px-4">
      <div
        className={cn(
          'transition-all',
          previewDevice === 'mobile' ? 'w-[375px]' : 'w-[600px]'
        )}
      >
        {/* Email container */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* Fixed header */}
          <div
            onClick={() => selectBlock(headerBlock.id)}
            className={cn(
              'cursor-pointer border-2 rounded-t-lg transition-all',
              selectedBlockId === headerBlock.id
                ? 'border-patina-mocha-brown/50'
                : 'border-transparent hover:border-patina-clay-beige/20'
            )}
          >
            <BlockPreview block={headerBlock} />
          </div>

          {/* Sortable content area */}
          <div
            ref={setNodeRef}
            className={cn(
              'min-h-[120px] px-8 py-4 transition-colors',
              isOver ? 'bg-patina-mocha-brown/5' : ''
            )}
          >
            {contentBlocks.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-patina-clay-beige/60">
                <div className="text-center">
                  <p className="text-sm font-medium">Drag blocks here</p>
                  <p className="text-xs mt-1">or click a block in the palette</p>
                </div>
              </div>
            ) : (
              <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {contentBlocks.map((block) => (
                    <SortableBlock key={block.id} block={block} />
                  ))}
                </div>
              </SortableContext>
            )}
          </div>

          {/* Fixed footer */}
          <div
            onClick={() => selectBlock(footerBlock.id)}
            className={cn(
              'cursor-pointer border-2 rounded-b-lg transition-all',
              selectedBlockId === footerBlock.id
                ? 'border-patina-mocha-brown/50'
                : 'border-transparent hover:border-patina-clay-beige/20'
            )}
          >
            <BlockPreview block={footerBlock} />
          </div>
        </div>
      </div>
    </div>
  );
}
