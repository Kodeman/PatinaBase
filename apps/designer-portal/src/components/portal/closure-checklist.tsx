'use client';

import type { ClosureItem } from '@/types/project-ui';

interface ClosureChecklistProps {
  items: ClosureItem[];
  onToggle?: (key: string) => void;
}

export function ClosureChecklist({ items, onToggle }: ClosureChecklistProps) {
  return (
    <div>
      {items.map((item) => (
        <div
          key={item.key}
          className="grid items-start gap-3 border-b py-2.5"
          style={{
            gridTemplateColumns: '20px 1fr auto',
            borderColor: 'rgba(229, 226, 221, 0.4)',
          }}
        >
          <button
            className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] ${
              item.completed
                ? 'border-[var(--color-sage)] bg-[rgba(122,155,118,0.1)] text-[var(--color-sage)]'
                : 'border-[var(--border-default)]'
            }`}
            style={{ fontSize: '0.6rem', cursor: 'pointer' }}
            onClick={() => onToggle?.(item.key)}
          >
            {item.completed && '✓'}
          </button>

          <span
            className={`font-body text-[0.88rem] ${
              item.completed
                ? 'text-[var(--text-muted)] line-through decoration-[var(--border-default)]'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {item.label}
          </span>

          {item.date && (
            <span
              className="whitespace-nowrap type-meta-small"
              style={{ color: item.completed ? 'var(--color-sage)' : 'var(--text-muted)' }}
            >
              {item.date}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
