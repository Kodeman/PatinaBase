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
 * EARNINGS (design fees + commissions).
 * The opening front-matter (I23) states Revenue · A/R · margin. STUDIO EYES
 * ONLY — this book never reaches the client mirror.
 */

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  computeArAging,
  useArAging,
  useEarningsStats,
  useInvoices,
} from '@patina/supabase';
import { LedgerFrontMatter } from '../ledger-front-matter';
import { useStudioMargin } from '@/hooks/use-studio-accounts';
import { useStudioMoney } from '@/hooks/use-studio-money';
import { mixedCurrenciesText } from '@/lib/currency-totals';
import { collectedCents } from '@/lib/document/account-summary';
import { fmtUsd } from '@/lib/document/format';
import type { OpenLedgerContext } from '../command-bar';
import { AccountsLedgerPage } from './accounts-ledger-page';
import { AccountsReceivablesPage } from './accounts-receivables-page';
import { AccountsEarningsPage } from './accounts-earnings-page';
import { DocSheetHead } from '../overlays/doc-sheet';
import { STUDIO_LEDGERS } from '@/lib/document/registry';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { AccountsQueryFailure } from './accounts-query-failure';
import { SectionLoadingLine } from '../section-loading-line';
import { TEACHING_MARGIN_COLUMN, TeachingAnchorNote } from '../teaching/teaching-anchor-note';

// R96 — the registry is the single source of the surface icon (no drift).
const ACCOUNTS_ICON = STUDIO_LEDGERS.find((l) => l.key === 'accounts')!.icon;

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
  const sheetRef = useRef<HTMLDivElement>(null);
  const { data: invoices, isLoading, isError, refetch } = useInvoices();
  const { aging } = useArAging();
  const { data: earnings } = useEarningsStats();
  const margin = useStudioMargin();
  // Q10 (walk W-D5): the whole book is an owner's or admin's; any other seat
  // sees the invoices on the jobs she leads and no studio totals.
  const money = useStudioMoney();
  const canSeeMargin = money.all;
  const visibleInvoices = useMemo(
    () => canSeeMargin
      ? invoices ?? []
      : (invoices ?? []).filter((invoice) => money.canSeeProject(invoice.project_id)),
    [canSeeMargin, invoices, money],
  );
  const visibleAging = useMemo(
    () => canSeeMargin ? aging : computeArAging(visibleInvoices),
    [aging, canSeeMargin, visibleInvoices],
  );

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

  const stats = !isLoading && canSeeMargin
    ? [
        { label: 'revenue', value: fmtUsd(collectedCents(invoices ?? [])) },
        { label: 'A/R', value: fmtUsd(aging.totalBalanceCents) },
        {
          label: 'margin',
          value: margin.data?.mixedCurrencies
            ? mixedCurrenciesText(margin.data.mixedCurrencies)
            : margin.data?.marginPct != null
              ? `${margin.data.marginPct}%`
              : '—',
        },
      ]
    : [];
  const availablePages = canSeeMargin ? PAGES : PAGES.filter((p) => p.key !== 'earnings');

  return (
    <div ref={sheetRef} className="mx-auto max-w-3xl">
      <DocSheetHead
        icon={ACCOUNTS_ICON}
        title="Studio accounts"
        pageLabel={PAGES.find((p) => p.key === page)?.label}
        onClose={onClose}
        helpKey={DOCUMENT_SURFACE_KEYS.accounts}
      />
      {/* Return teaching: the book, then the margin an in-place note sits in. */}
      <div className={TEACHING_MARGIN_COLUMN}>
      <div className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl text-[var(--color-charcoal)]">
            Accounts <em className="italic text-[var(--color-clay-ink)]">· the studio&apos;s book</em>
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--color-aged-oak)]">
            Revenue, what&apos;s owed, what you earn — the sum of every engagement&apos;s account.
          </p>
        </div>
        <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Studio eyes only
        </span>
      </div>

      {/* R28: the book's pages — DM-mono links, never tabs. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 border-b border-[var(--color-pearl)] pb-2">
        {availablePages.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPage(p.key)}
            aria-current={page === p.key ? 'page' : undefined}
            className={`font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
              page === p.key
                ? 'text-[var(--color-clay-ink)]'
                : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* A failed ledger read must not become a zero-revenue front matter or
          an empty Ledger / Receivables page. */}
      {isError ? (
        <AccountsQueryFailure
          title="The studio book could not be opened."
          message="Invoices and receivables are still held in place. Try the account read again."
          onRetry={refetch}
        />
      ) : isLoading ? (
        <SectionLoadingLine label="Opening the book" className="py-3" />
      ) : (
        <>
          <LedgerFrontMatter caption="the studio" stats={stats} />

          {page === 'ledger' && (
            <AccountsLedgerPage
              invoices={visibleInvoices}
              canExport={canSeeMargin}
              highlightInvoiceId={initialContext?.invoiceId ?? null}
              onOpenDocument={openDocument}
            />
          )}
          {page === 'receivables' && (
            <AccountsReceivablesPage
              aging={visibleAging}
              highlightInvoiceId={initialContext?.invoiceId ?? null}
              onOpenDocument={openDocument}
            />
          )}
          {canSeeMargin && page === 'earnings' && (
            <AccountsEarningsPage stats={earnings} />
          )}
        </>
      )}
      </div>
      <TeachingAnchorNote surfaceKey={DOCUMENT_SURFACE_KEYS.accounts} hostRef={sheetRef} />
      </div>
    </div>
  );
}
