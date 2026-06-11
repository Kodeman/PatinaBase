'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { type FFEStageKey } from '@patina/types';
import { STAGES, stageColor, stageLabel } from './stages';

/**
 * PO-sync state for the item this select controls (migration 00184 stage
 * ratchet). `systemSet` = the current stage was advanced server-side by the
 * item's purchase order; a manual pick overrides the sync until the next PO
 * transition re-ratchets it.
 */
export interface StageSyncInfo {
  systemSet: boolean;
  poNumber?: string | null;
}

// Stages the 00184 PO-sync triggers can set. An item linked to a PO and
// sitting in one of these stages is "system-set": the stage controls show a
// sync badge, and a manual pick counts as an override (it sticks until the
// next PO transition re-ratchets anything below the PO's stage).
export const PO_SYNCED_STAGES: readonly string[] = ['ordered', 'production', 'shipped', 'delivered'];

/**
 * Derives the PO-sync state for an FF&E item row. Shared by the board page
 * and the item drawer so card dropdowns and the drawer's stage picker agree
 * on what counts as a system-set stage.
 */
export function poSync(item: {
  purchase_order_id?: string | null;
  status?: string | null;
  po_number?: string | null;
}): StageSyncInfo {
  return {
    systemSet: !!item.purchase_order_id && PO_SYNCED_STAGES.includes(item.status ?? ''),
    // The board's items query doesn't join purchase_orders — the legacy
    // po_number column is the best label available (null → generic copy).
    poNumber: item.po_number ?? null,
  };
}

interface StageSelectProps {
  currentStatus: FFEStageKey | string;
  /** Parent owns the mutation + toast; may return a promise we await for the pending state. */
  onChangeStatus: (next: FFEStageKey) => void | Promise<void>;
  /** External disable (e.g. read-only contexts). */
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** When `sync.systemSet`, a Zap badge marks the stage as PO-driven. */
  sync?: StageSyncInfo;
}

/**
 * Inline stage picker for an FF&E card. A styled listbox (NOT the design-system
 * Radix Select, which is themed with foreign shadcn tokens, and NOT a native
 * <select>, which can't render the per-stage color dot). Any stage → any stage
 * in one action. Presentational: the parent performs the status mutation.
 */
export function StageSelect({
  currentStatus,
  onChangeStatus,
  disabled = false,
  size = 'sm',
  sync,
}: StageSelectProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const currentIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.key === currentStatus)
  );

  // Click-outside closes (mirrors faceted-filter-popover idiom).
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // When opening, highlight the current stage.
  useEffect(() => {
    if (open) setActiveIndex(currentIndex);
  }, [open, currentIndex]);

  const isDisabled = disabled || pending;

  const select = async (next: FFEStageKey) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (next === currentStatus) return;
    setPending(true);
    try {
      await onChangeStatus(next);
    } finally {
      setPending(false);
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(STAGES.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(STAGES.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void select(STAGES[activeIndex].key);
    }
  };

  const triggerPad = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5';
  const triggerText = size === 'sm' ? 'text-[0.72rem]' : 'text-[0.8rem]';

  // PO-sync badge title — "Synced from PO {number}", number omitted when the
  // item carries no PO label.
  const syncTitle = sync?.systemSet
    ? sync.poNumber
      ? `Synced from PO ${sync.poNumber}`
      : 'Synced from PO'
    : null;

  return (
    <div
      className="relative"
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Stage: ${stageLabel(currentStatus)}.${syncTitle ? ` ${syncTitle}.` : ''} Change stage.`}
        className={`inline-flex w-full items-center justify-between gap-1.5 rounded-[3px] border transition-colors ${triggerPad} ${triggerText} ${
          isDisabled ? 'cursor-wait opacity-60' : 'cursor-pointer hover:border-[var(--text-primary)]'
        }`}
        style={{
          borderColor: 'var(--border-default)',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: stageColor(currentStatus) }}
          />
          <span className="truncate">{stageLabel(currentStatus)}</span>
          {syncTitle && (
            <span
              title={syncTitle}
              className="inline-flex shrink-0 items-center"
              style={{ color: 'var(--color-clay, #C4A57B)' }}
            >
              <Zap size={10} strokeWidth={2.5} aria-hidden />
            </span>
          )}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden
          className="shrink-0 text-[var(--text-muted)]"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          id={listboxId}
          aria-activedescendant={`${listboxId}-${STAGES[activeIndex].key}`}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={onListKeyDown}
          className="absolute left-0 z-40 mt-1 max-h-[280px] w-[220px] overflow-auto rounded-md border bg-[var(--bg-surface)] py-1 shadow-lg outline-none"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {/* PO-sync explainer — informational header, not an option. */}
          {sync?.systemSet && (
            <li
              role="presentation"
              className="border-b px-3 pb-1.5 pt-0.5 text-[0.68rem] italic leading-snug"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Manual pick overrides PO sync until the next PO update.
            </li>
          )}
          {STAGES.map((stage, idx) => {
            const isCurrent = stage.key === currentStatus;
            const isActive = idx === activeIndex;
            return (
              <li
                key={stage.key}
                id={`${listboxId}-${stage.key}`}
                role="option"
                aria-selected={isCurrent}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => void select(stage.key)}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[0.78rem] transition-colors"
                style={{
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: stage.color }}
                />
                <span className="flex-1 truncate">{stage.label}</span>
                {isCurrent && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden
                    className="text-[var(--text-muted)]"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
