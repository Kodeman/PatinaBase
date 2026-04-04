'use client';

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
        <button
          key={tpl}
          onClick={() => onSelect(tpl)}
          className="cursor-pointer whitespace-nowrap rounded-full border bg-transparent px-3 py-1.5"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.7rem',
            color: 'var(--accent-primary)',
            borderColor: 'rgba(196, 165, 123, 0.2)',
            background: 'rgba(196, 165, 123, 0.06)',
            transition: `background var(--duration-fast) var(--ease-default)`,
          }}
        >
          {tpl}
        </button>
      ))}
    </div>
  );
}
