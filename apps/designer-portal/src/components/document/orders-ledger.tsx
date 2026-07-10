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
import { usePurchaseOrders, useUpdatePurchaseOrderETA, useVendors } from '@patina/supabase';
import { clientVendorEmailHint } from '@/components/portal/procurement/po-send-actions';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

/** PRC-06: one lens option — quiet DM-mono text, clay when worn (R28). */
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
      className={`font-mono text-[8.5px] uppercase tracking-[0.06em] transition-colors ${
        active
          ? 'text-[var(--color-clay)]'
          : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
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
  const { data: vendorsPage } = useVendors(undefined, { page: 1, pageSize: 200 }) as {
    data: { data: AnyRecord[] } | undefined;
  };
  const vendors = vendorsPage?.data;

  const updateEta = useUpdatePurchaseOrderETA();
  // R28: the book's pages, linked by DM-mono text. Brief-a-vendor (R29)
  // pre-addresses straight onto Vendors with the document's project. (page is
  // a free string on the shared context — narrow it to this book's pages.)
  const [page, setPage] = useState<BookPage>(
    PAGES.some((p) => p.key === initialContext?.page) ? (initialContext!.page as BookPage) : 'ledger',
  );
  // R18: send / resend through the shared preview-confirm.
  const [previewPo, setPreviewPo] = useState<AnyRecord | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [truckEta, setTruckEta] = useState(todayYmd());
  const [batchBusy, setBatchBusy] = useState(false);
  // PRC-07 (R84): the row whose log-acknowledgment band is unfolded.
  const [ackPoId, setAckPoId] = useState<string | null>(null);
  // PRC-06 (R84): the quiet lenses — project + payment state, DM-mono text
  // (the portal's FacetedFilterPopover facets, without the pills).
  const [projectLens, setProjectLens] = useState<string | null>(null);
  const [paymentLens, setPaymentLens] = useState<'due' | 'pending' | 'paid' | null>(null);

  const vendorById = useMemo(() => {
    const map = new Map<string, AnyRecord>();
    (vendors ?? []).forEach((v) => map.set(v.id, v));
    return map;
  }, [vendors]);

  const live = useMemo(
    () => (orders ?? []).filter((o) => o.status !== 'cancelled'),
    [orders],
  );

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
      .filter((o) => !projectLens || (o.project_id ?? o.project?.id) === projectLens)
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
        vendorName: vendorById.get(vendorId)?.name ?? pos[0]?.vendor?.name ?? 'Vendor',
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
    <div className="mx-auto max-w-3xl">
      <DocSheetHead
        icon={ORDERS_ICON}
        title="Orders"
        pageLabel={PAGES.find((p) => p.key === page)?.label}
        onClose={onClose}
        helpKey={HELP_KEY_BY_PAGE[page]}
      />
      <div className="mb-3">
        <h2 className="font-heading text-xl text-[var(--color-charcoal)]">
          Orders <em className="italic text-[var(--color-clay)]">· the studio book</em>
        </h2>
        <p className="mt-0.5 text-[11px] text-[var(--color-aged-oak)]">
          A lens over every document — pulled over whatever you&apos;re holding, put back when
          done.
        </p>
      </div>

      {/* R28: the book's pages — DM-mono links, never tabs. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 border-b border-[var(--color-pearl)] pb-2">
        {PAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPage(p.key)}
            aria-current={page === p.key ? 'page' : undefined}
            className={`font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
              page === p.key
                ? 'text-[var(--color-clay)]'
                : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

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

      {page === 'receiving' && <ReceivingBookPage onOpenDocument={openDocument} />}

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
            <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
              Opening the book…
            </p>
          )}
          {/* PRC-06 (R84): the ledger's quiet lenses — project + payment
              facets as DM-mono text, never FilterPills. The front matter
              stays the whole book's opening; the lens narrows the rows. */}
          {!isLoading && live.length > 0 && (
            <div className="mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              {projectOptions.length > 1 && (
                <>
                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                    project ·
                  </span>
                  <LensLink active={!projectLens} onClick={() => setProjectLens(null)}>
                    all
                  </LensLink>
                  {projectOptions.map((p) => (
                    <LensLink
                      key={p.id}
                      active={projectLens === p.id}
                      onClick={() => setProjectLens((cur) => (cur === p.id ? null : p.id))}
                    >
                      {p.name}
                    </LensLink>
                  ))}
                  <span className="mx-1.5" aria-hidden />
                </>
              )}
              <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                payment ·
              </span>
              <LensLink active={!paymentLens} onClick={() => setPaymentLens(null)}>
                all
              </LensLink>
              {(['due', 'pending', 'paid'] as const).map((s) => (
                <LensLink
                  key={s}
                  active={paymentLens === s}
                  onClick={() => setPaymentLens((cur) => (cur === s ? null : s))}
                >
                  {s}
                </LensLink>
              ))}
            </div>
          )}
          {!isLoading && groups.length === 0 && (projectLens || paymentLens) && (
            <p className="py-2 text-[11px] italic text-[var(--color-aged-oak)]">
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
              <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed text-[var(--color-aged-oak)]">
                When you order what a proposal specifies, each PO lands here and tracks itself
                from production to your door. Draw the first from a project&apos;s schedule.
              </p>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.vendorId} className="mb-4">
              <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay)]">
                {g.vendorName}
              </p>
              <ul>
                {g.pos.map((po) => {
                  const stamp = PO_STAMP[po.status] ?? PO_STAMP.draft;
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
                      className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-3 border-b border-[var(--color-pearl)] px-1 py-2.5"
                    >
                      <input
                        type="checkbox"
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
                      <div>
                        <p className="text-[12.5px] font-medium text-[var(--color-charcoal)]">
                          {po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO drafted'}
                        </p>
                        <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                          {[
                            po.project?.name ?? 'Project',
                            po.total_cents != null ? fmtUsd(po.total_cents) : '—',
                            // R18: the row narrates the send lifecycle.
                            po.sent_at
                              ? `sent ${fmtDay(po.sent_at)}${po.acknowledged_at ? ' · ack' : ' · no ack'}`
                              : 'not sent',
                          ].join(' · ')}
                          {canAck && (
                            <>
                              {' · '}
                              <button
                                type="button"
                                onClick={() =>
                                  setAckPoId((cur) => (cur === po.id ? null : po.id))
                                }
                                aria-expanded={ackPoId === po.id}
                                className="uppercase tracking-[0.05em] text-[var(--color-clay)] hover:underline"
                              >
                                log ack {ackPoId === po.id ? '↑' : '↓'}
                              </button>
                            </>
                          )}
                        </p>
                      </div>
                      <Stamp
                        label={po.status.replace(/_/g, ' ')}
                        color={stamp.color}
                        ink={stamp.ink}
                      />
                      <span
                        className="whitespace-nowrap font-heading text-[12.5px]"
                        style={
                          // R18: unscheduled shipment — a quiet row mark, never a banner.
                          !po.confirmed_eta && po.status === 'shipped'
                            ? { color: '#D8BE56', fontFamily: 'var(--font-mono, monospace)', fontSize: '10px', letterSpacing: '0.05em' }
                            : { color: 'var(--color-charcoal)' }
                        }
                      >
                        {po.confirmed_eta
                          ? `~${fmtDay(po.confirmed_eta)}`
                          : po.status === 'shipped'
                            ? 'NO DATE'
                            : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewPo(po)}
                        className="whitespace-nowrap text-[10.5px] text-[var(--color-clay)] hover:underline"
                      >
                        {po.sent_at ? 'resend' : po.status === 'draft' ? 'send →' : 'pdf'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDocument(po.project_id ?? po.project?.id ?? null)}
                        className="whitespace-nowrap text-[10.5px] text-[var(--color-clay)] hover:underline"
                      >
                        open document →
                      </button>
                    </li>
                    {/* PRC-07: the unfolded log-acknowledgment band — quiet
                        act under the row, closed by logging or refolding. */}
                    {canAck && ackPoId === po.id && (
                      <li className="border-b border-[var(--color-pearl)] py-2.5 pl-8 pr-1">
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
          vendorName={vendorById.get(previewPo.vendor_id)?.name ?? previewPo.vendor?.name ?? 'the vendor'}
          vendorEmailHint={clientVendorEmailHint(vendorById.get(previewPo.vendor_id))}
          mode={previewPo.sent_at ? 'resend' : 'send'}
          onSent={() => setPreviewPo(null)}
          // PRC-07: the resend paper offers the ack act for unacked sends.
          sentAt={previewPo.sent_at}
          acknowledgedAt={previewPo.acknowledged_at}
          vendorPoNumber={previewPo.vendor_po_number}
          confirmedEta={previewPo.confirmed_eta}
        />
      )}

      {selected.length >= 2 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[5px] border border-[rgba(196,165,123,0.3)] bg-[rgba(196,165,123,0.05)] px-3 py-2.5">
              <p className="text-[11.5px] text-[var(--color-charcoal)]">
                {selected.length} orders{' '}
                {selectedVendor ? '— same truck?' : '— pick one vendor to batch'}
              </p>
              {selectedVendor && (
                <>
                  <input
                    type="date"
                    aria-label="Shared ETA"
                    className="rounded-[4px] border border-[var(--color-pearl)] bg-transparent px-2 py-1 text-[11px] text-[var(--color-charcoal)]"
                    value={truckEta}
                    onChange={(e) => setTruckEta(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!truckEta || batchBusy}
                    onClick={sameTruck}
                    className="rounded-[4px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {batchBusy ? 'Aligning…' : 'Align ETA'}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
