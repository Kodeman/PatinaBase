'use client';

/**
 * The Studio Drawer (D8, spec v1.1 §8): a quiet fixed strip at the bottom
 * edge — part of the desk, never the paper. Five ledger books + the
 * right-aligned "In hand today" readout (static until Slice 5). Discipline:
 * no badges, no unread counts, no pulsing. Sheets are stubbed in Slice 1;
 * the real ledgers arrive in Slices 4–5.
 */

import { useState } from 'react';
import { DocSheet } from './overlays/doc-sheet';

const LEDGERS = [
  { key: 'library', name: 'Library', spine: 'var(--color-clay)' },
  { key: 'orders', name: 'Orders', spine: 'var(--color-dusty-blue)' },
  { key: 'accounts', name: 'Accounts', spine: 'var(--color-sage)' },
  { key: 'people', name: 'People', spine: 'var(--color-terracotta)' },
  { key: 'hours', name: 'Hours', spine: 'var(--color-mocha)' },
] as const;

type LedgerKey = (typeof LEDGERS)[number]['key'];

export function StudioDrawer() {
  const [openLedger, setOpenLedger] = useState<LedgerKey | null>(null);
  const open = LEDGERS.find((l) => l.key === openLedger) ?? null;

  return (
    <>
      <nav
        aria-label="Studio drawer"
        className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 overflow-x-auto border-t border-[rgba(250,247,242,0.14)] bg-[var(--color-charcoal)] px-4 py-[0.55rem] sm:px-6"
      >
        <span className="mr-1.5 whitespace-nowrap font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[rgba(250,247,242,0.3)]">
          Studio
        </span>
        {LEDGERS.map((ledger) => (
          <button
            key={ledger.key}
            type="button"
            onClick={() => setOpenLedger(ledger.key)}
            className="inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-[4px] border border-[rgba(250,247,242,0.12)] bg-[rgba(250,247,242,0.06)] px-3 py-[0.4rem] transition-colors duration-150 hover:border-[rgba(196,165,123,0.45)]"
          >
            <span
              aria-hidden
              className="h-[15px] w-[3px] rounded-[1px]"
              style={{ background: ledger.spine }}
            />
            <span className="font-heading text-[11px] font-medium text-[rgba(250,247,242,0.85)]">
              {ledger.name}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpenLedger('hours')}
          className="ml-auto inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-[4px] border border-transparent px-3 py-[0.4rem] hover:border-[rgba(196,165,123,0.35)]"
        >
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[rgba(250,247,242,0.35)]">
            In hand today
          </span>
          <span className="font-heading text-[13px] italic text-[var(--color-clay)]">—</span>
        </button>
      </nav>

      <DocSheet open={open !== null} onClose={() => setOpenLedger(null)} title={open?.name ?? ''}>
        {open && (
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center gap-3">
              <span
                aria-hidden
                className="h-[18px] w-[3px] rounded-[1px]"
                style={{ background: open.spine }}
              />
              <h2 className="font-heading text-xl text-[var(--color-pearl)]">{open.name}</h2>
            </div>
            <p className="text-[13px] leading-relaxed text-[rgba(250,247,242,0.55)]">
              This ledger arrives in a later slice. The drawer and its sheets are in place so
              the desk feels whole; the {open.name} book itself is still being bound.
            </p>
          </div>
        )}
      </DocSheet>
    </>
  );
}
