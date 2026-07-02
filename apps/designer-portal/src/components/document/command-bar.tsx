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
import { usePeopleDirectory } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { openAccount } from './account/account-sheet';
import { openInvoiceComposer } from './accounts/invoice-overlays';
import { openPost } from './overlays/post-sheet';
import { openHelp } from '@/lib/help-system/open-help';
import { openDraftProposalPicker } from './rooms/drafting/draft-proposal-opener';
import { fillStateForDesk } from '@/lib/document/fill-state';
import { folderTab } from '@/lib/document/desk-derivation';
import { StrataMark } from './strata-mark';
import { EngineResults, type InDocument } from './engine/engine-results';

type Row =
  | { kind: 'document'; id: string; label: string; sub: string; fill: [number, number, number] }
  | { kind: 'ledger'; ledger: string; label: string; sub: string }
  // `keywords` are extra match terms (aliases) folded into the filter only.
  | { kind: 'action'; label: string; sub: string; run: () => void; keywords?: string }
  | { kind: 'person'; label: string; sub: string; run: () => void }
  | { kind: 'engine'; label: string; sub: string };

const LEDGERS = ['Library', 'Orders', 'Accounts', 'People', 'Hours'];

/** Set true by {@link openCaptureLead} when the front door is invoked from a
 *  non-Desk surface; the Desk reads + clears it on mount so the sheet opens
 *  after the navigation lands (the event fires before the Desk's listener is
 *  registered). A plain module flag — the Desk and the command bar are the only
 *  readers. */
export const captureLeadPending = { value: false };

/** Open the Desk's capture-lead front door from anywhere (the Desk listens).
 *  The sheet is mounted on the Desk; ⌘K reaches it via this event so "new lead"
 *  works whether or not you're standing on the Desk. When invoked off the Desk,
 *  the caller routes there and the pending flag carries the intent across. */
export function openCaptureLead() {
  captureLeadPending.value = true;
  window.dispatchEvent(new CustomEvent('document:open-capture-lead'));
}

/** R79 — same pattern as {@link openCaptureLead}: the OpenProjectSheet is
 *  mounted on the Desk; the pending flag carries the intent across a
 *  navigation from any other surface. */
export const openProjectPending = { value: false };

export function openOpenProject() {
  openProjectPending.value = true;
  window.dispatchEvent(new CustomEvent('document:open-open-project'));
}

/** R28/R29/R36 pre-addressing: optional context rides the open-ledger event —
 *  e.g. Brief-a-vendor opens the Orders book onto the Vendors page with the
 *  project in hand; an overdue-invoice Desk need opens the Accounts book onto
 *  Receivables with that invoice in hand. `page` is a free string so each book
 *  validates its own page set (Orders: ledger/week/receiving/vendors; Accounts:
 *  ledger/receivables/earnings). */
export interface OpenLedgerContext {
  page?: string;
  vendorId?: string;
  projectId?: string;
  invoiceId?: string;
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
  // The missing noun beside documents + ledgers (G3): every party in the
  // unified directory is ⌘K-reachable. Small per-designer roster — fetched once
  // and filtered in memory like the rest of the rows.
  const { data: people } = usePeopleDirectory();
  // Account actions (Settings / Sign out) belong to the "do anything" surface;
  // the identity itself is answered by the persistent nameplate.
  const { user, signOut } = useAuth();
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
      {
        // G1 capture · R62 — alias-aware so "new lead" / "new client" /
        // "capture" land here (not only "Ask the Engine"). The sheet lives on
        // the Desk; route there if we're elsewhere, then open it (the pending
        // flag carries the intent across the navigation).
        kind: 'action' as const,
        label: 'Capture a lead',
        sub: 'begin a Brief',
        keywords: 'new lead new client capture prospect intake brief',
        run: () => {
          if (pathname !== '/desk') router.push('/desk');
          openCaptureLead();
        },
      },
      {
        // R79 — open a project that didn't come through a proposal.
        kind: 'action' as const,
        label: 'Open a project',
        sub: 'no proposal needed',
        keywords: 'new project open project manual project start project create project',
        run: () => {
          if (pathname !== '/desk') router.push('/desk');
          openOpenProject();
        },
      },
      {
        // R74b — the anti-wizard composer; context-free it asks which project.
        kind: 'action' as const,
        label: 'Draw an invoice',
        sub: 'milestones · time · FF&E · ad-hoc',
        keywords: 'invoice bill new invoice draw invoice billing money',
        run: () => openInvoiceComposer(),
      },
      {
        // R85 · PRO-01 — draft a proposal for an existing household (skips
        // lead/discovery). The picker cold-starts; templates are retired.
        kind: 'action' as const,
        label: 'Draft a proposal',
        sub: 'for an existing household',
        keywords: 'new proposal draft proposal quote estimate propose',
        run: () => openDraftProposalPicker(),
      },
      {
        // R78 — add a maker (the Wave-1 owed doorway): the People Room's
        // add-a-person sheet in maker mode.
        kind: 'action' as const,
        label: 'Add a maker',
        sub: 'a vendor on your roster',
        keywords: 'new vendor add vendor add maker supplier manufacturer trade',
        run: () => router.push('/people?add=maker'),
      },
      {
        // R82 — the Post: Letters (messages) + the Record (system notices).
        kind: 'action' as const,
        label: 'The Post',
        sub: 'letters · the record',
        keywords: 'inbox notifications messages mail the post letters record bell',
        run: () => openPost(),
      },
      {
        // R89 — the contextual help panel, scoped to the current surface.
        kind: 'action' as const,
        label: 'Help…',
        sub: 'about this surface',
        keywords: 'help guide docs how to support question learn',
        run: () => openHelp(),
      },
      { kind: 'action' as const, label: 'The Desk', sub: 'go home', run: () => router.push('/desk') },
      {
        kind: 'action' as const,
        label: 'Interruptions',
        sub: 'break-through settings',
        run: () => window.dispatchEvent(new CustomEvent('document:open-interruptions')),
      },
      {
        kind: 'action' as const,
        label: 'Settings',
        sub: 'profile · notifications · security',
        keywords: 'account profile preferences settings security notifications devices password studio',
        run: openAccount,
      },
      {
        kind: 'action' as const,
        label: 'Sign out',
        sub: user?.email ?? 'end this session',
        keywords: 'log out logout sign off leave',
        run: () => {
          void signOut();
        },
      },
    ];
    // Jump to a person (G3) — the unified directory's parties. Only offered for
    // a non-empty query so a clean ⌘K isn't flooded with the whole roster.
    const persons: Row[] =
      query.trim() && people
        ? people.slice(0, 40).map((p) => ({
            kind: 'person' as const,
            label: p.display_name,
            sub: `${p.role} · jump to person →`,
            run: () => {
              // Land in the People Room; the directory holds the roster. A
              // deep-link onto the exact profile would need a `?person=` param
              // honored by the People Room (out of this territory — DECISIONS).
              router.push('/people');
            },
          }))
        : [];
    const q = query.trim().toLowerCase();
    const dest = [...docs, ...ledgers, ...actions, ...persons];
    const filtered = q
      ? dest.filter((r) => {
          const keywords = r.kind === 'action' ? (r.keywords ?? '') : '';
          return `${r.label} ${r.sub} ${keywords}`.toLowerCase().includes(q);
        })
      : dest;
    // R38: the ask is always offered for a non-empty query — destinations jump,
    // a question asks. No mode.
    if (query.trim()) {
      filtered.push({ kind: 'engine', label: 'Ask the Engine', sub: `“${query.trim()}” · ask & place` });
    }
    return filtered;
  }, [data, people, query, router, user?.email, signOut]);

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
                  ) : row.kind === 'person' ? (
                    // A party reads as a quiet terracotta dot — the People spine
                    // color (studio-drawer), so the noun's home is legible.
                    <span
                      aria-hidden
                      className="inline-block h-[8px] w-[8px] shrink-0 rounded-full"
                      style={{ background: 'var(--color-terracotta)' }}
                    />
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
