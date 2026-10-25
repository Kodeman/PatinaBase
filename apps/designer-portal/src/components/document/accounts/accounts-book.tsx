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
 * The opening front matter states the studio's totals as text (US-28 S8:
 * "$13,700 is out with clients; $3,800 of it is overdue."), never figure
 * tiles, and only to a seat that holds the studio's money (V18 Q10). STUDIO
 * EYES ONLY — this book never reaches the client mirror.
 *
 * The Invoice folio opens IN PLACE (V20 U-Q16): it replaces the book inside
 * this one sheet, with "← Accounts" in its head — never a second dialog
 * stacked on the first.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rememberPaperOrigin, restoreStudioOverlay, studioOverlayScroll } from '@/lib/document/paper/paper-origin';
import { useRouter } from 'next/navigation';
import {
  computeArAging,
  useEarningsStats,
  useInvoices,
} from '@patina/supabase';
import { useStudioMargin } from '@/hooks/use-studio-accounts';
import { useStudioMoney } from '@/hooks/use-studio-money';
import { mixedCurrenciesText } from '@/lib/currency-totals';
import { collectedCents } from '@/lib/document/account-summary';
import { fmtUsd } from '@/lib/document/format';
import type { OpenLedgerContext } from '../command-bar';
import { AccountsLedgerPage } from './accounts-ledger-page';
import { AccountsReceivablesPage } from './accounts-receivables-page';
import { AccountsEarningsPage } from './accounts-earnings-page';
import { InvoiceFolio } from './invoice-folio';
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
  const { data: earnings } = useEarningsStats();
  // Q10 (walk W-D5): a studio's whole book is its owner's or admin's; any
  // other seat sees the invoices on the jobs she leads and no studio totals.
  // SQ-774 R1 — judged per invoice by its own studio, and the totals sum only
  // the studios whose book is hers.
  const money = useStudioMoney();
  const canSeeMargin = money.bookStudioIds.length > 0;
  const margin = useStudioMargin(money.bookStudioIds);
  const visibleInvoices = useMemo(
    () => (invoices ?? []).filter((invoice) => money.canSeeRecord(invoice.studio_id, invoice.project_id)),
    [invoices, money],
  );
  const bookInvoices = useMemo(
    () => (invoices ?? []).filter((invoice) => money.canSeeStudio(invoice.studio_id)),
    [invoices, money],
  );
  const visibleAging = useMemo(() => computeArAging(visibleInvoices), [visibleInvoices]);
  const bookAr = useMemo(() => {
    const aging = computeArAging(bookInvoices);
    return {
      outCents: aging.totalBalanceCents,
      overdueCents: aging.buckets
        .filter((b) => b.key !== 'current')
        .reduce((sum, b) => sum + b.balanceCents, 0),
    };
  }, [bookInvoices]);

  // U-Q16 — the folio this sheet is showing in place of the book, if any.
  const [folioId, setFolioId] = useState<string | null>(initialContext?.studioReturn?.focusKey === 'folio' ? initialContext.studioReturn.subject ?? null : null);
  // The doorway's invoice (/desk?book=accounts&…&invoiceId=) is spent by the
  // first folio this sheet opens: the ledger remounts on "← Accounts", and
  // an unspent doorway would swap the folio straight back in.
  // A new doorway re-arms it; reset during render, not in an effect, which
  // would run after the ledger's own effect had already spent it.
  const doorwayProp = initialContext?.studioReturn ? null : initialContext?.invoiceId ?? null;
  const [doorwayId, setDoorwayId] = useState<string | null>(doorwayProp);
  const [doorwaySeen, setDoorwaySeen] = useState<string | null>(doorwayProp);
  if (doorwaySeen !== doorwayProp) {
    setDoorwaySeen(doorwayProp);
    setDoorwayId(doorwayProp);
  }
  const openFolio = useCallback((invoiceId: string) => {
    setDoorwayId(null);
    setFolioId(invoiceId);
  }, []);
  const backRef = useRef<HTMLButtonElement>(null);
  const lastFolioId = useRef<string | null>(null);
  // Focus follows the swap: onto "← Accounts" when the folio opens, and back
  // onto the row that opened it when the book returns.
  useEffect(() => {
    if (folioId) {
      lastFolioId.current = folioId;
      backRef.current?.focus();
      return;
    }
    const returning = lastFolioId.current;
    if (!returning) return;
    lastFolioId.current = null;
    sheetRef.current
      ?.querySelector<HTMLElement>(`[data-invoice-folio-opener="${CSS.escape(returning)}"]`)
      ?.focus();
  }, [folioId]);

  // page is a free string on the shared context — narrow it to this book.
  const [page, setPage] = useState<BookPage>(
    PAGES.some((p) => p.key === initialContext?.page)
      ? (initialContext!.page as BookPage)
      : 'ledger',
  );

  const pressed = useRef<HTMLElement | null>(null);
  const returnState = useRef(initialContext?.studioReturn);
  useEffect(() => {
    const held = returnState.current;
    const root = sheetRef.current;
    if (!held || !root) return;
    return restoreStudioOverlay(root, held, () => {
      if (held.focusKey === 'folio') return root.querySelector<HTMLElement>('[data-action-key="open-invoice-document"]');
      const [invoiceId, index] = (held.focusKey ?? '').split(':');
      const row = root.querySelector<HTMLElement>('[data-invoice-folio-opener="' + CSS.escape(invoiceId ?? '') + '"]')?.closest('li');
      return row?.querySelectorAll<HTMLElement>('button')[Number(index)] ?? null;
    }, () => { returnState.current = undefined; });
  }, []);

  const openDocument = (projectId: string | null) => {
    if (!projectId) return;
    const root = sheetRef.current;
    const row = pressed.current?.closest('li');
    const invoiceId = row?.querySelector<HTMLElement>('[data-invoice-folio-opener]')?.dataset.invoiceFolioOpener;
    const index = row ? Array.from(row.querySelectorAll('button')).indexOf(pressed.current as HTMLButtonElement) : -1;
    rememberPaperOrigin(projectId, { path: '/desk', focusId: 'studio-door-accounts', studioOverlay: {
      overlay: 'books', filter: page, subject: folioId ?? undefined,
      scrollTop: root ? studioOverlayScroll(root).scrollTop : 0,
      focusKey: folioId ? 'folio' : invoiceId ? invoiceId + ':' + index : undefined,
    } });
    onClose();
    router.push('/doc/' + projectId);
  };

  const marginText = margin.data?.mixedCurrencies
    ? mixedCurrenciesText(margin.data.mixedCurrencies)
    : margin.data?.marginPct != null
      ? `${margin.data.marginPct}%`
      : null;
  const availablePages = canSeeMargin ? PAGES : PAGES.filter((p) => p.key !== 'earnings');

  if (folioId) {
    const folioInvoice = (invoices ?? []).find((inv) => inv.id === folioId);
    return (
      <div ref={sheetRef} onClickCapture={(event) => { pressed.current = (event.target as Element).closest<HTMLElement>('button'); }} className="mx-auto max-w-3xl" data-accounts-folio={folioId}>
        <div className="sh-head money-folio-head">
          <span className="sh-title">
            <ACCOUNTS_ICON className="sh-ic" strokeWidth={1.2} aria-hidden />
            <button
              ref={backRef}
              type="button"
              onClick={() => setFolioId(null)}
              className="money-back"
            >
              ← Accounts
            </button>
            <span>
              {folioInvoice?.invoice_number
                ? folioInvoice.invoice_number
                : folioInvoice?.status === 'draft'
                  ? 'Draft invoice'
                  : 'Invoice'}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Put back · Esc"
            className="money-back"
          >
            Put back · Esc
          </button>
        </div>
        <div className="sh-body">
          <InvoiceFolio invoiceId={folioId} onOpenDocument={openDocument} />
        </div>
      </div>
    );
  }

  return (
    <div ref={sheetRef} onClickCapture={(event) => { pressed.current = (event.target as Element).closest<HTMLElement>('button'); }} className="mx-auto max-w-3xl">
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
          {/* SQ-778 N4 — the studio's book is claimed only to a seat that
              holds the studio's money; any other seat reads her projects'
              invoices, with no studio-book claim and no STUDIO EYES ONLY. */}
          <h2 className="font-heading text-xl text-[var(--color-charcoal)]">
            Accounts{' '}
            <em className="italic text-[var(--color-clay-ink)]">
              {canSeeMargin ? '· the studio’s book' : '· your projects’ invoices'}
            </em>
          </h2>
          {canSeeMargin && (
            <p className="mt-0.5 text-[11px] text-[var(--color-aged-oak)]">
              Revenue, what&apos;s owed, what you earn — the sum of every engagement&apos;s account.
            </p>
          )}
        </div>
        {canSeeMargin && (
          <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            Studio eyes only
          </span>
        )}
      </div>

      {/* R28: the book's pages — DM-mono links, never tabs. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 border-b border-[var(--color-pearl)] pb-2">
        {availablePages.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPage(p.key)}
            aria-current={page === p.key ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
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
          {/* The totals said once, as text — a ledger is not a dashboard.
              V18 Q10: a seat without the studio's book reads no studio totals. */}
          {canSeeMargin && (
            <div className="money-front" data-accounts-front-matter>
              <p className="t-body">
                {bookAr.outCents > 0 ? (
                  <>
                    <span className="money-num">{fmtUsd(bookAr.outCents)}</span> is out with clients;{' '}
                    {bookAr.overdueCents > 0 ? (
                      <span className="od">
                        <span className="money-num">{fmtUsd(bookAr.overdueCents)}</span> of it is
                        overdue
                      </span>
                    ) : (
                      'none of it is overdue'
                    )}
                    .
                  </>
                ) : (
                  'Nothing is out with clients.'
                )}
              </p>
              <p className="t-body-sm money-front-sub">
                <span className="money-num">{fmtUsd(collectedCents(bookInvoices))}</span> collected
                {marginText ? (
                  <>
                    ; margin <span className="money-num">{marginText}</span>
                  </>
                ) : null}
                .
              </p>
            </div>
          )}

          {page === 'ledger' && (
            <AccountsLedgerPage
              invoices={visibleInvoices}
              canExport={canSeeMargin}
              highlightInvoiceId={doorwayId}
              onOpenDocument={openDocument}
              onOpenFolio={openFolio}
            />
          )}
          {page === 'receivables' && (
            <AccountsReceivablesPage
              aging={visibleAging}
              highlightInvoiceId={doorwayId}
              onOpenDocument={openDocument}
              onOpenFolio={openFolio}
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
