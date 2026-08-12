'use client';

/**
 * The Orders book (D8/R5/R18/R28, spec v1.3 §8): cross-engagement
 * procurement as a book pulled over whatever the designer is holding. R28
 * grows it pages — LEDGER · THE WEEK · RECEIVING · VENDORS — linked by
 * DM-mono text, never tabs.
 *
 * LEDGER (this file's body): vendor-grouped PO rows narrating the send
 * lifecycle, send/resend through the shared preview-confirm (the PDF IS the
 * confirm — R18), the unscheduled-shipment condition as a quiet row mark
 * (never a banner), and the "same truck" batch — a shared ETA written
 * through the ETA-only path; history says "ETA aligned," never an
 * acknowledgment claim (R16: a batch ETA is not a vendor act).
 */

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePurchaseOrders,
  useUpdatePurchaseOrderETA,
  useVendors,
} from '@patina/supabase';
import {
  liveStep,
  nextGate,
  procurementStepLabel,
  PROCUREMENT_LIFECYCLE_GATES,
} from '@patina/types';
import { clientVendorEmailHint } from '@/components/portal/procurement/po-send-actions';
import {
  derivePurchaseOrderLifecycle,
  procurementExpected,
} from '@/lib/document/procurement-lifecycle';
import { Stamp } from './stamp';
import { LogAckInline, PoPreview } from './po-preview';
import { LedgerFrontMatter } from './ledger-front-matter';
import { ordersThroughput } from '@/lib/document/ledger-summary';
import { fmtDay, fmtUsd, todayYmd } from '@/lib/document/format';
import { VendorsBookPage } from './orders-book-vendors';
import { WeekBookPage } from './orders-book-week';
import { ReceivingBookPage } from './orders-book-receiving';
import type { OpenLedgerContext } from './command-bar';
import { DocSheetHead } from './overlays/doc-sheet';
import { STUDIO_LEDGERS } from '@/lib/document/registry';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { DocumentAction } from './document-action';

type BookPage = 'ledger' | 'week' | 'receiving' | 'vendors';

// R96 — the registry is the single source of the surface icon (no drift).
const ORDERS_ICON = STUDIO_LEDGERS.find((l) => l.key === 'orders')!.icon;

const PAGES: { key: BookPage; label: string }[] = [
  { key: 'ledger', label: 'Ledger' },
  { key: 'week', label: 'The Week' },
  { key: 'receiving', label: 'Receiving' },
  { key: 'vendors', label: 'Vendors' },
];

// help-desk Wave 1 — the head's `?` doorway scopes to the OPEN page: the
// sub-keys exist for Week/Receiving/Vendors, the base key covers the Ledger.
const HELP_KEY_BY_PAGE: Record<BookPage, string> = {
  ledger: DOCUMENT_SURFACE_KEYS.orders,
  week: DOCUMENT_SURFACE_KEYS.ordersWeek,
  receiving: DOCUMENT_SURFACE_KEYS.ordersReceiving,
  vendors: DOCUMENT_SURFACE_KEYS.ordersVendors,
};

interface POForThroughput {
  status: string;
  confirmed_eta: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
}

type AnyRecord = any;

/** PRC-06: one lens option — quiet scored ink, held when worn (R28). */
function LensLink({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.06em] transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${
        active
          ? 'da-score-on text-[var(--color-charcoal)]'
          : 'text-[var(--color-quiet-ink)] hover:text-[var(--color-charcoal)]'
      }`}
    >
      {children}
    </button>
  );
}

const PO_STAMP: Record<string, { color: string; ink?: string }> = {
  draft: { color: 'var(--color-aged-oak)', ink: 'var(--color-aged-oak)' },
  confirmed: { color: 'var(--color-dusty-blue)' },
  in_production: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  shipped: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  delivered: { color: 'var(--color-sage)' },
  cancelled: { color: 'var(--color-terracotta)' },
};

export function OrdersLedger({
  onClose,
  initialContext,
}: {
  onClose: () => void;
  initialContext?: OpenLedgerContext | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: orders, isLoading } = usePurchaseOrders() as {
    data: AnyRecord[] | undefined;
    isLoading: boolean;
  };
  // useVendors returns { data, pagination } — unwrap, and ask for the
  // whole directory (the vendor pane is a book, not a feed).
  const { data: vendorsPage } = useVendors(undefined, {
    page: 1,
    pageSize: 200,
  }) as {
    data: { data: AnyRecord[] } | undefined;
  };
  const vendors = vendorsPage?.data;

  const updateEta = useUpdatePurchaseOrderETA();
  // R28: the book's pages, linked by DM-mono text. Brief-a-vendor (R29)
  // pre-addresses straight onto Vendors with the document's project. (page is
  // a free string on the shared context — narrow it to this book's pages.)
  const [page, setPage] = useState<BookPage>(
    PAGES.some((p) => p.key === initialContext?.page)
      ? (initialContext!.page as BookPage)
      : 'ledger',
  );
  // R18: send / resend through the shared preview-confirm.
  const [previewPo, setPreviewPo] = useState<AnyRecord | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [truckEta, setTruckEta] = useState(todayYmd());
  const [batchBusy, setBatchBusy] = useState(false);
  // PRC-07 (R84): the row whose log-acknowledgment band is unfolded.
  const [ackPoId, setAckPoId] = useState<string | null>(null);
  // PRC-06 (R84): the quiet lenses — project + payment state, DM-mono text
  // (the portal's FacetedFilterPopover facets, without the pills).
  const [projectLens, setProjectLens] = useState<string | null>(null);
  const [paymentLens, setPaymentLens] = useState<
    'due' | 'pending' | 'paid' | null
  >(null);

  const vendorById = useMemo(() => {
    const map = new Map<string, AnyRecord>();
    (vendors ?? []).forEach((v) => map.set(v.id, v));
    return map;
  }, [vendors]);

  const live = useMemo(
    () => (orders ?? []).filter((o) => o.status !== 'cancelled'),
    [orders],
  );

  // R7: one derivation per order, computed once per fetch rather than on every
  // render of every row.
  const lifecycleByPo = useMemo(() => {
    const map = new Map<
      string,
      {
        live: ReturnType<typeof liveStep>;
        gate: ReturnType<typeof nextGate>;
        expected: string | null;
      }
    >();
    for (const o of orders ?? []) {
      const reading = derivePurchaseOrderLifecycle(o);
      map.set(o.id, {
        live: liveStep(reading),
        gate: nextGate(reading),
        expected: procurementExpected(o),
      });
    }
    return map;
  }, [orders]);

  // Lens options derive from the unlensed book — the lens narrows the page,
  // never the vocabulary.
  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of live) {
      const id = o.project_id ?? o.project?.id;
      if (id) map.set(id, o.project?.name ?? 'Project');
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [live]);

  const groups = useMemo(() => {
    const lensed = live
      .filter(
        (o) => !projectLens || (o.project_id ?? o.project?.id) === projectLens,
      )
      .filter(
        (o) =>
          !paymentLens ||
          (o.payments ?? []).some((p: AnyRecord) => p.state === paymentLens),
      );
    const byVendor = new Map<string, AnyRecord[]>();
    for (const o of lensed) {
      const list = byVendor.get(o.vendor_id) ?? [];
      list.push(o);
      byVendor.set(o.vendor_id, list);
    }
    return [...byVendor.entries()]
      .map(([vendorId, pos]) => ({
        vendorId,
        vendorName:
          vendorById.get(vendorId)?.name ?? pos[0]?.vendor?.name ?? 'Vendor',
        pos,
      }))
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  }, [live, projectLens, paymentLens, vendorById]);

  const selectedVendor = useMemo(() => {
    const pos = (orders ?? []).filter((o) => selected.includes(o.id));
    const vendorIds = new Set(pos.map((o) => o.vendor_id));
    return vendorIds.size === 1 ? [...vendorIds][0] : null;
  }, [orders, selected]);

  const openDocument = (projectId: string | null) => {
    if (!projectId) return;
    onClose();
    router.push(`/doc/${projectId}`);
  };

  const clearBulkSelection = () => {
    setSelected([]);
    setTruckEta(todayYmd());
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    clearBulkSelection();
  };

  const openPage = (nextPage: BookPage) => {
    if (nextPage !== 'ledger') exitBulkMode();
    setPage(nextPage);
  };

  const sameTruck = async () => {
    if (!truckEta || selected.length < 2) return;
    setBatchBusy(true);
    try {
      // R16: a batch ETA is not a vendor act — write ONLY confirmed_eta and
      // narrate "ETA aligned"; never touch acknowledgment.
      for (const poId of selected) {
        await updateEta.mutateAsync({
          purchaseOrderId: poId,
          newEta: truckEta,
          notes: `ETA aligned across ${selected.length} POs (same truck)`,
        });
      }
      setSelected([]);
      setTruckEta(todayYmd());
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl" data-orders-book>
      <DocSheetHead
        icon={ORDERS_ICON}
        title="Orders"
        pageLabel={PAGES.find((p) => p.key === page)?.label}
        onClose={onClose}
        helpKey={HELP_KEY_BY_PAGE[page]}
      />
      <p className="doc-type-body mb-2 text-[var(--color-quiet-ink)]">
        Every project&apos;s purchase orders, gathered in one studio register.
      </p>

      {/* R28: the book's pages — DM-mono links, never tabs. */}
      <nav
        aria-label="Orders book pages"
        data-orders-page-links
        className="mb-4 flex flex-wrap items-center gap-x-4 border-b border-[var(--color-pearl)]"
      >
        {PAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => openPage(p.key)}
            aria-current={page === p.key ? 'page' : undefined}
            className={`da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.08em] transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${
              page === p.key
                ? 'da-score-on text-[var(--color-charcoal)]'
                : 'text-[var(--color-quiet-ink)] hover:text-[var(--color-charcoal)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </nav>

      {page === 'vendors' && (
        <VendorsBookPage
          vendors={vendors ?? []}
          orders={orders ?? []}
          initialVendorId={initialContext?.vendorId ?? null}
          briefProjectId={initialContext?.projectId ?? null}
          onOpenDocument={openDocument}
        />
      )}

      {page === 'week' && <WeekBookPage />}

      {page === 'receiving' && (
        <ReceivingBookPage onOpenDocument={openDocument} />
      )}

      {page === 'ledger' && (
        <>
          {/* Front-matter (R5): procurement throughput — the page's opening. */}
          {!isLoading && (
            <LedgerFrontMatter
              caption="throughput"
              stats={ordersThroughput((orders ?? []) as POForThroughput[])}
            />
          )}
          {isLoading && (
            <p className="doc-type-body py-3 italic text-[var(--color-quiet-ink)]">
              Opening the book…
            </p>
          )}
          {/* PRC-06 (R84): the ledger's quiet lenses — project + payment
              facets as DM-mono text, never FilterPills. The front matter
              stays the whole book's opening; the lens narrows the rows. */}
          {!isLoading && live.length > 0 && (
            <div
              data-orders-lenses
              className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-[var(--color-pearl)] pb-1"
            >
              {projectOptions.length > 1 && (
                <>
                  <span className="doc-type-meta uppercase tracking-[0.08em]">
                    project ·
                  </span>
                  <LensLink
                    active={!projectLens}
                    onClick={() => {
                      clearBulkSelection();
                      setProjectLens(null);
                    }}
                  >
                    all
                  </LensLink>
                  {projectOptions.map((p) => (
                    <LensLink
                      key={p.id}
                      active={projectLens === p.id}
                      onClick={() => {
                        clearBulkSelection();
                        setProjectLens((cur) => (cur === p.id ? null : p.id));
                      }}
                    >
                      {p.name}
                    </LensLink>
                  ))}
                  <span className="mx-1.5" aria-hidden />
                </>
              )}
              <span className="doc-type-meta uppercase tracking-[0.08em]">
                payment ·
              </span>
              <LensLink
                active={!paymentLens}
                onClick={() => {
                  clearBulkSelection();
                  setPaymentLens(null);
                }}
              >
                all
              </LensLink>
              {(['due', 'pending', 'paid'] as const).map((s) => (
                <LensLink
                  key={s}
                  active={paymentLens === s}
                  onClick={() => {
                    clearBulkSelection();
                    setPaymentLens((cur) => (cur === s ? null : s));
                  }}
                >
                  {s}
                </LensLink>
              ))}
              <button
                type="button"
                data-orders-bulk-toggle
                aria-pressed={bulkMode}
                onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
                className={`da-score-hover doc-type-meta ml-auto inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.06em] text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${bulkMode ? 'da-score-on text-[var(--color-charcoal)]' : ''}`}
              >
                {bulkMode
                  ? `Done selecting${selected.length ? ` · ${selected.length}` : ''}`
                  : 'Select multiple'}
              </button>
            </div>
          )}
          {!isLoading &&
            live.length > 0 &&
            groups.length === 0 &&
            (projectLens || paymentLens) && (
              <p className="doc-type-body py-2 italic text-[var(--color-quiet-ink)]">
                Nothing under this lens.
              </p>
            )}
          {/* The zero-PO state (help-desk Wave 1, copy §E.3) — the page was
              blank here before; a quiet heading + teaching line, no chrome. */}
          {!isLoading && live.length === 0 && (
            <div className="py-6">
              <p className="font-heading text-[15px] italic text-[var(--color-charcoal)]">
                No purchase orders yet
              </p>
              <p className="doc-type-body mt-1.5 max-w-[52ch] text-[var(--color-quiet-ink)]">
                When you order what a proposal specifies, each PO lands here and
                tracks itself from production to your door. Draw the first from
                a project&apos;s schedule.
              </p>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.vendorId} className="mb-4">
              <p className="doc-type-meta mb-1 font-semibold uppercase tracking-[0.07em] text-[var(--color-quiet-ink)]">
                {g.vendorName}
              </p>
              <ul>
                {g.pos.map((po, index) => {
                  const stamp = PO_STAMP[po.status] ?? PO_STAMP.draft;
                  // R7: the same grammar at ledger density — the row's stamp
                  // is the lifecycle POSITION, not the status word "Ordered"
                  // hid everything behind. The fifteen steps never enumerate
                  // here; the book shows where the order stands and what stops
                  // it next. A draft or cancelled order takes no position, so
                  // the row keeps saying "draft" / "cancelled" out loud.
                  const {
                    live: position,
                    gate,
                    expected,
                  } = lifecycleByPo.get(po.id) ?? {
                    live: null,
                    gate: null,
                    expected: null,
                  };
                  // PRC-07 (R84): the ack act lives where the row narrates
                  // "no ack" — sent, unacknowledged, non-catalog, not
                  // cancelled (the portal popover's gate, vendor-section-card).
                  const canAck =
                    Boolean(po.sent_at) &&
                    !po.acknowledged_at &&
                    !po.is_patina_catalog &&
                    po.status !== 'cancelled';
                  return (
                    <Fragment key={po.id}>
                      <li
                        data-orders-po-row
                        className="border-b border-[var(--color-pearl)] px-1 py-3"
                      >
                        <div
                          data-orders-po-primary
                          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2"
                        >
                          {bulkMode && (
                            <label className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                              <input
                                type="checkbox"
                                data-orders-checkbox
                                aria-label={`Select ${po.vendor_po_number ?? po.sidemark ?? 'PO'}`}
                                checked={selected.includes(po.id)}
                                onChange={(e) =>
                                  setSelected((prev) =>
                                    e.target.checked
                                      ? [...prev, po.id]
                                      : prev.filter((x) => x !== po.id),
                                  )
                                }
                              />
                            </label>
                          )}
                          <p className="doc-type-body min-w-[11rem] flex-1 font-medium text-[var(--color-charcoal)]">
                            {po.po_number ??
                              po.vendor_po_number ??
                              po.sidemark ??
                              'PO drafted'}
                          </p>
                          <div className="ml-auto flex min-h-11 shrink-0 items-center gap-3">
                            <Stamp
                              label={
                                position
                                  ? procurementStepLabel(position.key)
                                  : po.status.replace(/_/g, ' ')
                              }
                              color={stamp.color}
                              ink={stamp.ink}
                              size="sm"
                            />
                            {/* Next gate — name, and the term that holds it. */}
                            <span
                              data-orders-next-gate
                              className="doc-type-meta hidden max-w-[16rem] truncate text-[var(--color-quiet-ink)] sm:inline"
                            >
                              {gate
                                ? [
                                    PROCUREMENT_LIFECYCLE_GATES.find(
                                      (g) => g.key === gate.key,
                                    )?.label,
                                    gate.qualifier,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')
                                : '—'}
                            </span>
                            <span
                              data-orders-expected
                              data-orders-unscheduled={
                                !expected && po.status === 'shipped'
                                  ? ''
                                  : undefined
                              }
                              className={`doc-type-meta whitespace-nowrap font-heading ${
                                !expected && po.status === 'shipped'
                                  ? 'font-mono uppercase tracking-[0.05em] text-[#D8BE56]'
                                  : 'text-[var(--color-charcoal)]'
                              }`}
                            >
                              {expected
                                ? `~${fmtDay(expected)}`
                                : po.status === 'shipped'
                                  ? 'NO DATE'
                                  : '—'}
                            </span>
                          </div>
                        </div>
                        <div
                          data-orders-po-secondary
                          className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 ${bulkMode ? 'pl-11' : ''}`}
                        >
                          <p className="doc-type-meta min-w-[12rem] flex-1 uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                            {[
                              po.project?.name ?? 'Project',
                              po.total_cents != null
                                ? fmtUsd(po.total_cents)
                                : '—',
                              // R18: the row narrates the send lifecycle.
                              po.sent_at
                                ? `sent ${fmtDay(po.sent_at)}${po.acknowledged_at ? ' · ack' : ' · no ack'}`
                                : 'not sent',
                            ].join(' · ')}
                          </p>
                          <div
                            data-orders-po-actions
                            className="flex flex-wrap items-center gap-x-3"
                          >
                            {canAck && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAckPoId((cur) =>
                                    cur === po.id ? null : po.id,
                                  )
                                }
                                aria-expanded={ackPoId === po.id}
                                className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.05em] text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
                              >
                                log ack {ackPoId === po.id ? '↑' : '↓'}
                              </button>
                            )}
                            <DocumentAction
                              actionKey="open-purchase-order-preview"
                              surfaceKey="orders"
                              regionKey={`purchase-order-row-${index + 1}`}
                              variant="secondary"
                              onClick={() => setPreviewPo(po)}
                            >
                              {po.sent_at
                                ? 'resend'
                                : po.status === 'draft'
                                  ? 'send →'
                                  : 'pdf'}
                            </DocumentAction>
                            <button
                              type="button"
                              onClick={() =>
                                openDocument(
                                  po.project_id ?? po.project?.id ?? null,
                                )
                              }
                              className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center whitespace-nowrap text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
                            >
                              open document →
                            </button>
                          </div>
                        </div>
                      </li>
                      {/* PRC-07: the unfolded log-acknowledgment band — quiet
                        act under the row, closed by logging or refolding. */}
                      {canAck && ackPoId === po.id && (
                        <li
                          data-orders-ack-unfold
                          className="border-b border-[var(--color-pearl)] px-1 py-3 sm:pl-12"
                        >
                          <LogAckInline
                            purchaseOrderId={po.id}
                            vendorPoNumber={po.vendor_po_number}
                            confirmedEta={po.confirmed_eta}
                            sentAt={po.sent_at}
                            tone="book"
                          />
                        </li>
                      )}
                    </Fragment>
                  );
                })}
              </ul>
            </section>
          ))}

          {previewPo && (
            <PoPreview
              open
              onOpenChange={(o: boolean) => {
                if (!o) setPreviewPo(null);
              }}
              purchaseOrderId={previewPo.id}
              vendorName={
                vendorById.get(previewPo.vendor_id)?.name ??
                previewPo.vendor?.name ??
                'the vendor'
              }
              vendorEmailHint={clientVendorEmailHint(
                vendorById.get(previewPo.vendor_id),
              )}
              mode={previewPo.sent_at ? 'resend' : 'send'}
              onSent={() => setPreviewPo(null)}
              // PRC-07: the resend paper offers the ack act for unacked sends.
              sentAt={previewPo.sent_at}
              acknowledgedAt={previewPo.acknowledged_at}
              vendorPoNumber={previewPo.vendor_po_number}
              confirmedEta={previewPo.confirmed_eta}
            />
          )}

          {bulkMode && selected.length >= 2 && (
            <div
              data-orders-bulk-bar
              className="mt-3 flex flex-wrap items-center gap-2 border-y border-[var(--color-pearl)] px-1 py-3"
            >
              <p className="doc-type-body min-w-[14rem] flex-1 text-[var(--color-charcoal)]">
                {selectedVendor
                  ? `${selected.length} orders · align one confirmed ETA`
                  : `${selected.length} orders · select orders from one vendor to align an ETA`}
              </p>
              {selectedVendor && (
                <>
                  <input
                    type="date"
                    aria-label="Shared ETA"
                    className="doc-type-control min-h-11 rounded-[4px] border border-[var(--color-pearl)] bg-transparent px-2 text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
                    value={truckEta}
                    onChange={(e) => setTruckEta(e.target.value)}
                  />
                  <DocumentAction
                    actionKey="align-purchase-order-eta"
                    surfaceKey="orders"
                    regionKey="same-truck"
                    variant="primary"
                    disabled={!truckEta || batchBusy}
                    loading={batchBusy}
                    loadingLabel="Aligning…"
                    onClick={sameTruck}
                  >
                    Align ETA
                  </DocumentAction>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
