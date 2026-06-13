'use client';

/**
 * The Accounts book (R36) — the studio's money ledger, a Drawer SHEET (D14):
 * pull, glance, put it back; the document stays mounted beneath. R26 put
 * per-engagement money inside the document (the Account Page, the leaf); this
 * book is the SUM — cross-engagement receivables, the studio's own earnings —
 * with no figure authored twice.
 *
 * Three pages in the R28 grammar — DM-mono links, never tabs: LEDGER (every
 * invoice), RECEIVABLES (A/R aging + the dunning chase, the Desk's act surface),
 * EARNINGS (design fees + commissions; the Aesthete fold lands here in slice 5).
 * The opening front-matter (I23) states Revenue · A/R · margin. STUDIO EYES
 * ONLY — this book never reaches the client mirror.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useArAging, useEarningsStats, useInvoices } from '@patina/supabase';
import { LedgerFrontMatter } from '../ledger-front-matter';
import { useStudioMargin } from '@/hooks/use-studio-accounts';
import { collectedCents } from '@/lib/document/account-summary';
import { fmtUsd } from '@/lib/document/format';
import { AccountsLedgerPage } from './accounts-ledger-page';
import { AccountsReceivablesPage } from './accounts-receivables-page';
import { AccountsEarningsPage } from './accounts-earnings-page';
import type { OpenLedgerContext } from '../command-bar';

type BookPage = 'ledger' | 'receivables' | 'earnings';

const PAGES: { key: BookPage; label: string }[] = [
  { key: 'ledger', label: 'Ledger' },
  { key: 'receivables', label: 'Receivables' },
  { key: 'earnings', label: 'Earnings' },
];

export function AccountsBook({
  onClose,
  initialContext,
}: {
  onClose: () => void;
  initialContext?: OpenLedgerContext | null;
}) {
  const router = useRouter();
  const { data: invoices, isLoading } = useInvoices();
  const { aging } = useArAging();
  const { data: earnings } = useEarningsStats();
  const margin = useStudioMargin();

  // page is a free string on the shared context — narrow it to this book.
  const [page, setPage] = useState<BookPage>(
    PAGES.some((p) => p.key === initialContext?.page)
      ? (initialContext!.page as BookPage)
      : 'ledger',
  );

  const openDocument = (projectId: string | null) => {
    if (!projectId) return;
    onClose();
    router.push(`/doc/${projectId}`);
  };

  const stats = !isLoading
    ? [
        { label: 'revenue', value: fmtUsd(collectedCents(invoices ?? [])) },
        { label: 'A/R', value: fmtUsd(aging.totalBalanceCents) },
        {
          label: 'margin',
          value: margin.data?.marginPct != null ? `${margin.data.marginPct}%` : '—',
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl text-[var(--color-pearl)]">
            Accounts <em className="italic text-[var(--color-clay)]">· the studio&apos;s book</em>
          </h2>
          <p className="mt-0.5 text-[11px] text-[rgba(250,247,242,0.45)]">
            Revenue, what&apos;s owed, what you earn — the sum of every engagement&apos;s account.
          </p>
        </div>
        <span className="whitespace-nowrap font-mono text-[7.5px] uppercase tracking-[0.1em] text-[rgba(250,247,242,0.35)]">
          Studio eyes only
        </span>
      </div>

      {/* R28: the book's pages — DM-mono links, never tabs. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 border-b border-[rgba(250,247,242,0.1)] pb-2">
        {PAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPage(p.key)}
            aria-current={page === p.key ? 'page' : undefined}
            className={`font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
              page === p.key
                ? 'text-[var(--color-clay)]'
                : 'text-[rgba(250,247,242,0.45)] hover:text-[rgba(250,247,242,0.8)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Front-matter (I23): Revenue · A/R · margin — the studio's opening lens. */}
      {isLoading ? (
        <p className="py-3 text-[12px] italic text-[rgba(250,247,242,0.5)]">Opening the book…</p>
      ) : (
        <LedgerFrontMatter caption="the studio" stats={stats} />
      )}

      {page === 'ledger' && (
        <AccountsLedgerPage invoices={invoices ?? []} onOpenDocument={openDocument} />
      )}
      {page === 'receivables' && (
        <AccountsReceivablesPage
          aging={aging}
          highlightInvoiceId={initialContext?.invoiceId ?? null}
          onOpenDocument={openDocument}
        />
      )}
      {page === 'earnings' && <AccountsEarningsPage stats={earnings} />}
    </div>
  );
}
