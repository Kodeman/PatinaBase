'use client';

/**
 * "On this paper" — the running index, and from B1 the spine's ONE block. The
 * product's own metaphor (D12), and it stops colliding with the ticket's
 * `The job`. The four Project regions that carry
 * a real inline surface, each with the one thing it currently says, and a
 * reading line that rides down the list as the paper scrolls.
 *
 * The line is one absolutely-positioned rule measured off the active row, not
 * a border on the row itself: it slides between entries rather than blinking
 * from one to the next.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { DocumentIndexKey } from '@/lib/document/document-index';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface RunningIndexEntry {
  key: DocumentIndexKey;
  label: string;
  value: string;
}

export function SpineRunningIndex({
  entries,
  activeKey,
  onJump,
}: {
  entries: readonly RunningIndexEntry[];
  activeKey: DocumentIndexKey | null;
  onJump: (key: DocumentIndexKey) => void;
}) {
  const buttonsRef = useRef(new Map<DocumentIndexKey, HTMLButtonElement>());
  const [line, setLine] = useState<{ top: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const el = activeKey ? buttonsRef.current.get(activeKey) : undefined;
    if (!el) {
      setLine(null);
      return;
    }
    setLine({ top: el.offsetTop, height: el.offsetHeight });
  }, [activeKey]);

  useIsomorphicLayoutEffect(measure, [measure, entries]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  if (entries.length === 0) return null;

  return (
    <div className="mt-4 border-t border-[var(--color-pearl)] pt-3">
      <p
        id="doc-running-index-label"
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
      >
        On this paper
      </p>
      <div
        role="group"
        aria-labelledby="doc-running-index-label"
        className="relative pl-3"
      >
        {line && (
          <span
            aria-hidden
            className="absolute left-0 w-[2px] bg-[var(--color-clay)] transition-[top,height] duration-200 ease-out motion-reduce:transition-none"
            style={{ top: line.top, height: line.height }}
          />
        )}
        {entries.map((entry) => {
          const current = entry.key === activeKey;
          return (
            <button
              key={entry.key}
              type="button"
              ref={(el) => {
                if (el) buttonsRef.current.set(entry.key, el);
                else buttonsRef.current.delete(entry.key);
              }}
              aria-current={current ? 'true' : 'false'}
              onClick={() => onJump(entry.key)}
              className="block w-full py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              <span
                className={`block text-[13px] leading-tight ${
                  current
                    ? 'font-semibold text-[var(--color-charcoal)]'
                    : 'text-[var(--color-charcoal)]'
                }`}
              >
                {entry.label}
              </span>
              <span
                className={`mt-px block font-mono text-[11px] uppercase tracking-[0.07em] ${
                  current
                    ? 'text-[var(--color-charcoal)]'
                    : 'text-[var(--color-aged-oak)]'
                }`}
              >
                {entry.value}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
