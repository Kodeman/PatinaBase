'use client';

/**
 * The ⌘K command bar (spec §3): every destination is a document or a ledger,
 * never a zone. Documents render with their fill-state Strata Mark (R15) —
 * the mark answers "how far" right in the result row. Ledgers dispatch an
 * `open-ledger` event the Studio Drawer owns (the drawer holds sheet state).
 *
 * R38 — the Engine speaks here, with no mode. The same box jumps to a
 * destination OR, for the current query, offers "Ask the Engine" as the last
 * row; choosing it answers inline in paper result-lines, each carrying one act:
 * Place → [document]. The ask leaves no thread; only the placement persists.
 *
 * R3-clean: this is a Document-local paper surface, NOT a design-system
 * Command/Dialog primitive — no shadows, ink border, flat edges.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { fillStateForDesk } from '@/lib/document/fill-state';
import { folderTab } from '@/lib/document/desk-derivation';
import { StrataMark } from './strata-mark';
import { EngineResults, type InDocument } from './engine/engine-results';

type Row =
  | { kind: 'document'; id: string; label: string; sub: string; fill: [number, number, number] }
  | { kind: 'ledger'; ledger: string; label: string; sub: string }
  | { kind: 'action'; label: string; sub: string; run: () => void }
  | { kind: 'engine'; label: string; sub: string };

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
  const pathname = usePathname();
  const { data } = useDeskEngagements();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState<string | null>(null);
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
        if (asking) setAsking(null);
        else setOpen(false);
      }
    };
    const onAffordance = () => setOpen(true);
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('document:open-command-bar', onAffordance);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('document:open-command-bar', onAffordance);
    };
  }, [open, asking]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setAsking(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // The document in hand (if any) — Place → targets it directly (R38).
  const inDocument = useMemo<InDocument | null>(() => {
    const m = pathname?.match(/^\/doc\/(.+)$/);
    const docId = m?.[1] ?? null;
    if (!docId || !data) return null;
    const f = [...(data.folders ?? []), ...(data.chips ?? [])].find(
      (x) => x.row.engagement_id === docId,
    );
    const pid = f?.row.project_id;
    return pid ? { projectId: pid, projectName: folderTab(f!.row) } : null;
  }, [pathname, data]);

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
      sub: l === 'Library' ? 'room ↗' : 'ledger',
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
    const q = query.trim().toLowerCase();
    const dest = [...docs, ...ledgers, ...actions];
    const filtered = q ? dest.filter((r) => `${r.label} ${r.sub}`.toLowerCase().includes(q)) : dest;
    // R38: the ask is always offered for a non-empty query — destinations jump,
    // a question asks. No mode.
    if (query.trim()) {
      filtered.push({ kind: 'engine', label: 'Ask the Engine', sub: `“${query.trim()}” · ask & place` });
    }
    return filtered;
  }, [data, query, router]);

  // Keep the active row in range as the list changes.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const choose = (row: Row) => {
    if (row.kind === 'engine') {
      setAsking(query.trim()); // answer inline; don't close the bar
      return;
    }
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
          aria-label="Find anything, or ask the Engine"
          placeholder="Find a document or a ledger — or ask the Engine…"
          className="w-full border-b border-[var(--color-pearl)] bg-transparent px-4 py-3 text-[14px] text-[var(--color-charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (asking) setAsking(null);
          }}
          onKeyDown={(e) => {
            if (asking) {
              if (e.key === 'Enter') {
                e.preventDefault();
                setAsking(query.trim() || null);
              }
              return;
            }
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

        {asking ? (
          <div className="max-h-[60vh] overflow-y-auto px-4 pb-3 pt-2">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-clay)]">
                The Engine · “{asking}”
              </span>
              <button
                type="button"
                onClick={() => setAsking(null)}
                className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-charcoal)]"
              >
                ← results
              </button>
            </div>
            <EngineResults query={asking} inDocument={inDocument} />
          </div>
        ) : (
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
                  ) : row.kind === 'engine' ? (
                    <StrataMark size="sm" state="active" />
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
        )}
      </div>
    </div>
  );
}
