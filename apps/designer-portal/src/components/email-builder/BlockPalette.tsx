'use client';

import { useDraggable } from '@dnd-kit/core';
import {
  Sparkles, Type, Minus, ShoppingBag, LayoutGrid,
  MousePointerClick, Bell, User,
} from 'lucide-react';
import type { ContentBlockType } from '@patina/types';
import { PALETTE_BLOCKS } from './constants';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Sparkles, Type, Minus, ShoppingBag, LayoutGrid,
  MousePointerClick, Bell, User,
};

function PaletteItem({ type, label, icon, description }: {
  type: ContentBlockType;
  label: string;
  icon: string;
  description: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { type, source: 'palette' },
  });

  const Icon = ICON_MAP[icon] || Sparkles;

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
        hover:bg-patina-clay-beige/10 active:scale-[0.97]
        ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="w-8 h-8 rounded-lg bg-patina-off-white flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-patina-mocha-brown" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-patina-charcoal">{label}</p>
        <p className="text-[11px] text-patina-clay-beige truncate">{description}</p>
      </div>
    </button>
  );
}

export function BlockPalette() {
  return (
    <div className="w-[220px] flex-shrink-0 border-r border-patina-clay-beige/20 bg-white overflow-y-auto">
      <div className="p-4">
        <h3 className="text-xs font-semibold text-patina-clay-beige uppercase tracking-wider mb-3">
          Blocks
        </h3>
        <div className="space-y-0.5">
          {PALETTE_BLOCKS.map((item) => (
            <PaletteItem key={item.type} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}
