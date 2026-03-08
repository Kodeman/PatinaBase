'use client';

import { useSortable } from '@dnd-kit/sortable';
import { GripVertical, Copy, Trash2 } from 'lucide-react';
import type { TypedContentBlock } from '@patina/types';
import { useTemplateBuilderStore } from '@/stores/template-builder-store';
import { BlockPreview } from './BlockPreview';
import { BLOCK_TYPE_LABELS } from './constants';
import { cn } from '@/lib/utils';

interface SortableBlockProps {
  block: TypedContentBlock;
}

export function SortableBlock({ block }: SortableBlockProps) {
  const selectedBlockId = useTemplateBuilderStore((s) => s.selectedBlockId);
  const selectBlock = useTemplateBuilderStore((s) => s.selectBlock);
  const duplicateBlock = useTemplateBuilderStore((s) => s.duplicateBlock);
  const removeBlock = useTemplateBuilderStore((s) => s.removeBlock);
  const isSelected = selectedBlockId === block.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => selectBlock(block.id)}
      className={cn(
        'group relative rounded-lg border transition-all cursor-pointer',
        isSelected
          ? 'border-patina-mocha-brown/50 ring-2 ring-patina-mocha-brown/20'
          : 'border-transparent hover:border-patina-clay-beige/30',
        isDragging ? 'opacity-40 z-50' : ''
      )}
    >
      {/* Drag handle + actions */}
      <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-patina-clay-beige hover:text-patina-charcoal cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>

      <div className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }}
          className="p-1 text-patina-clay-beige hover:text-patina-charcoal"
          title="Duplicate"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
          className="p-1 text-patina-clay-beige hover:text-red-500"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Block type label */}
      <div className="absolute top-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] uppercase tracking-wider text-patina-clay-beige/60 font-medium">
          {BLOCK_TYPE_LABELS[block.type]}
        </span>
      </div>

      <BlockPreview block={block} />
    </div>
  );
}
