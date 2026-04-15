'use client';

import { motion } from 'framer-motion';
import { useId } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface FilterTab<V extends string = string> {
  value: V;
  label: string;
  count?: number;
  /** Optional dot color for stage-like filters */
  dotColor?: string;
}

interface FilterTabsProps<V extends string = string> {
  items: FilterTab<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

export function FilterTabs<V extends string = string>({
  items,
  value,
  onChange,
  className,
}: FilterTabsProps<V>) {
  const layoutId = useId();
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={`flex items-stretch gap-0 border-b border-[var(--border-default)] ${className ?? ''}`}
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`relative flex items-center whitespace-nowrap px-[0.85rem] py-2.5 text-[0.75rem] no-underline transition-colors first:pl-0 ${
              active
                ? 'font-medium text-[var(--text-primary)]'
                : 'font-normal text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {item.dotColor && (
              <span
                className="mr-[0.35rem] inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: item.dotColor }}
              />
            )}
            {item.label}
            {typeof item.count === 'number' && (
              <span className="ml-1.5 font-mono text-[0.5rem] text-[var(--text-muted)]">
                {item.count}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--accent-primary)]"
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 30 }
                }
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
