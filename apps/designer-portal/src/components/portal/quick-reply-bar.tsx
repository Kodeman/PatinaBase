'use client';

import { FilterPill } from '@/components/ui/controls';

const defaultTemplates = [
  'Schedule visit',
  'Send weekly update',
  'Request decision',
  'Share photo',
  'Confirm appointment',
];

interface QuickReplyBarProps {
  templates?: string[];
  onSelect: (template: string) => void;
}

export function QuickReplyBar({
  templates = defaultTemplates,
  onSelect,
}: QuickReplyBarProps) {
  return (
    <div className="flex flex-wrap gap-1.5 py-3">
      {templates.map((tpl) => (
        <FilterPill
          key={tpl}
          onClick={() => onSelect(tpl)}
          className="whitespace-nowrap border-[rgba(196,165,123,0.2)] bg-[rgba(196,165,123,0.06)] text-[var(--accent-primary)]"
        >
          {tpl}
        </FilterPill>
      ))}
    </div>
  );
}
