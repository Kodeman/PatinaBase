'use client';

/**
 * The ⌘K command bar (spec §3): every destination is a document or a ledger,
 * never a zone. Documents render with their fill-state Strata Mark (R15) —
 * the mark answers "how far" right in the result row. Ledgers dispatch an
 * `open-ledger` event the Studio Drawer owns (the drawer holds sheet state).
 *
 * R3-clean: this is a Document-local paper surface, NOT a design-system
 * Command/Dialog primitive — no shadows, ink border, flat edges.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { fillStateForDesk } from '@/lib/document/fill-state';
import { folderTab } from '@/lib/document/desk-derivation';
import { StrataMark } from './strata-mark';

type Row =
  | { kind: 'document'; id: string; label: string; sub: string; fill: [number, number, number] }
  | { kind: 'ledger'; ledger: string; label: string; sub: string }
  | { kind: 'action'; label: string; sub: string; run: () => void };

const LEDGERS = ['Library', 'Orders', 'Accounts', 'People', 'Hours'];

/** R28/R29 pre-addressing: optional context rides the open-ledger event —
 *  e.g. Brief-a-vendor opens the Orders book onto the Vendors page with the
 *  project in hand. */
export interface OpenLedgerContext {
  page?: 'ledger' | 'week' | 'receiving' | 'vendors';
  vendorId?: string;
  projectId?: string;
}

/** Open a Studio Drawer ledger from anywhere (the drawer listens). */
export function openLedger(name: string, context?: OpenLedgerContext) {
  window.dispatchEvent(
    new CustomEvent('document:open-ledger', {
      detail: context ? { name: name.toLowerCase(), context } : name.toLowerCase(),
    }),
  );
}

/** Open the command bar from a click affordance (the Desk's "Find anything"). */
export function openCommandBar() {
  window.dispatchEvent(new CustomEvent('document:open-command-bar'));
}

export function CommandBar() {
  const router = useRouter();
  const { data } = useDeskEngagements();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl-K toggles; Esc closes (but yields to a deeper overlay first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onAffordance = () => setOpen(true);
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('document:open-command-bar', onAffordance);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('document:open-command-bar', onAffordance);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const docs: Row[] = [...(data?.folders ?? []), ...(data?.chips ?? [])].map((f) => ({
      kind: 'document' as const,
      id: f.row.engagement_id,
      label: folderTab(f.row),
      sub: f.row.title,
      fill: fillStateForDesk(f.row),
    }));
    const ledgers: Row[] = LEDGERS.map((l) => ({
      kind: 'ledger' as const,
      ledger: l,
      label: l,
      sub: 'ledger',
    }));
    const actions: Row[] = [
      { kind: 'action' as const, label: 'The Desk', sub: 'go home', run: () => router.push('/desk') },
      {
        kind: 'action' as const,
        label: 'Interruptions',
        sub: 'break-through settings',
        run: () => window.dispatchEvent(new CustomEvent('document:open-interruptions')),
      },
    ];
    const all = [...docs, ...ledgers, ...actions];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => `${r.label} ${r.sub}`.toLowerCase().includes(q));
  }, [data, query, router]);

  const choose = (row: Row) => {
    setOpen(false);
    if (row.kind === 'document') router.push(`/doc/${row.id}`);
    else if (row.kind === 'ledger') openLedger(row.ledger);
    else row.run();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Command bar"
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]"
    >
      <button
        type="button"
        aria-label="Close command bar"
        className="absolute inset-0 cursor-default bg-[rgba(44,41,38,0.45)]"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-[min(560px,92vw)] overflow-hidden rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)]">
        <input
          ref={inputRef}
          type="text"
          aria-label="Find anything"
          placeholder="Find a document or a ledger…"
          className="w-full border-b border-[var(--color-pearl)] bg-transparent px-4 py-3 text-[14px] text-[var(--color-charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, rows.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && rows[active]) {
              e.preventDefault();
              choose(rows[active]);
            }
          }}
        />
        <ul className="max-h-[52vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <li className="px-4 py-3 text-[12px] italic text-[var(--text-muted)]">
              Nothing by that name.
            </li>
          )}
          {rows.map((row, i) => (
            <li key={`${row.kind}-${row.label}-${i}`}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(row)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                  i === active ? 'bg-[rgba(196,165,123,0.12)]' : ''
                }`}
              >
                {row.kind === 'document' ? (
                  <StrataMark size="sm" fill={row.fill} />
                ) : (
                  <span
                    aria-hidden
                    className="inline-block h-[14px] w-[3px] rounded-[1px]"
                    style={{ background: row.kind === 'ledger' ? 'var(--color-clay)' : 'var(--color-aged-oak)' }}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--color-charcoal)]">
                    {row.label}
                  </span>
                  <span className="block truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {row.sub}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
