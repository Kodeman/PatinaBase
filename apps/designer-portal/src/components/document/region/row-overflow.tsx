'use client';

/**
 * A row's verbs, kept behind one always-visible mark.
 *
 * The glyph never hides — a row whose acts appear only under a pointer is a row
 * that does not exist on a touch screen or to a keyboard. Only ONE row's verbs
 * are open at a time, which is why the open key is lifted to the caller.
 *
 * Collapsed verbs are UNMOUNTED, not hidden: hidden-but-focusable children
 * would put a dozen invisible stops in the tab order of a long list. That
 * unmounting is also why there is no CSS hover pre-reveal here — pre-revealing
 * would require the children to be in the DOM while collapsed, which is exactly
 * the contract this primitive keeps.
 */

import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface RowOverflowProps {
  rowKey: string;
  openKey: string | null;
  onOpenChange: (key: string | null) => void;
  surfaceKey: string;
  regionKey: string;
  label?: string;
  children: ReactNode;
}

export function RowOverflow({
  rowKey,
  openKey,
  onOpenChange,
  surfaceKey,
  regionKey,
  label = 'More actions',
  children,
}: RowOverflowProps) {
  const glyphRef = useRef<HTMLButtonElement>(null);
  const open = openKey === rowKey;
  const verbsId = `row-verbs-${rowKey}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onOpenChange(null);
    glyphRef.current?.focus();
  };

  return (
    <span
      className="doc-row-verbs inline-flex items-center gap-1"
      onKeyDown={handleKeyDown}
    >
      <button
        ref={glyphRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={verbsId}
        data-row-overflow={rowKey}
        data-surface-key={surfaceKey}
        data-action-region={regionKey}
        onClick={() => onOpenChange(open ? null : rowKey)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-[13px] leading-none text-[var(--color-clay)]"
      >
        ···
      </button>
      {open && (
        <span id={verbsId} className="inline-flex items-center gap-1">
          {children}
        </span>
      )}
    </span>
  );
}
