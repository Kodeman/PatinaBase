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

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useHeldPurchaseOrders,
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
import { ExistingOrderPaper } from '@/components/portal/procurement/order-paper';
import {
  derivePurchaseOrderLifecycle,
  procurementExpected,
} from '@/lib/document/procurement-lifecycle';
import { lineStampLabel, purchaseOrderState } from '@/lib/document/stamp-derivation';
import { PoStateWord } from './accounts/money-state-word';
import { DateTextInput } from './date-text-input';
import { LogAckInline, PoPreview } from './po-preview';
import { AckDifferenceStamp, AckRecord } from './buying/ack-check';
import { dueToMakers, LedgerFrontMatter } from './ledger-front-matter';
import { PoMoneyOut } from './line-unfold/record-payment';
import { ordersThroughput } from '@/lib/document/ledger-summary';
import { fmtDay, fmtUsd, todayYmd } from '@/lib/document/format';
import { VendorsBookPage, type VendorPlace } from './orders-book-vendors';
import { WeekBookPage } from './orders-book-week';
import { ReceivingBookPage } from './orders-book-receiving';
import type { OpenLedgerContext } from './command-bar';
import { DocSheetHead } from './overlays/doc-sheet';
import { STUDIO_LEDGERS } from '@/lib/document/registry';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { DocumentAction } from './document-action';
import { useStudioMoney } from '@/hooks/use-studio-money';
import { ActFailLine } from '@/components/feedback/act-fail-line';
import {
  rememberPaperOrigin,
  restoreStudioOverlay,
  studioOverlayScroll,
  type StudioOverlayState,
} from '@/lib/document/paper/paper-origin';

type BookPage = 'ledger' | 'week' | 'receiving' | 'vendors';

// R96 — the registry is the single source of the surface icon (no drift).
const ORDERS_ICON = STUDIO_LEDGERS.find((l) => l.key === 'orders')!.icon;

const PAGES: { key: BookPage; label: string }[] = [
  { key: 'ledger', label: 'Order register' },
  { key: 'week', label: 'Weekly orders' },
  { key: 'receiving', label: 'Receiving' },
  { key: 'vendors', label: 'Vendor accounts' },
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

type PaymentLens = 'due' | 'pending' | 'paid';

/** A held Orders return: its filter is the page, with any worn lens after `?`
 *  (`ledger?project=…&payment=due`), and on the vendors page the vendor, its
 *  sub-page and thread (`vendors?vendor=…&sub=thread&thread=…`). Stored data
 *  is untrusted. */
function parseOrdersReturn(held: StudioOverlayState | null | undefined) {
  if (held?.overlay !== 'orders') return null;
  const [pageKey, lens] = (held.filter ?? '').split('?');
  const params = new URLSearchParams(lens ?? '');
  const payment = params.get('payment');
  return {
    held,
    page: PAGES.find((p) => p.key === pageKey)?.key ?? 'ledger',
    project: params.get('project'),
    payment: payment === 'due' || payment === 'pending' || payment === 'paid' ? (payment as PaymentLens) : null,
    vendor: params.get('vendor'),
    vendorPage: params.get('sub'),
    thread: params.get('thread'),
  };
}

/** PRC-06: one lens option — an underline word in a `.filters` line, held
 *  (underlined) when worn (R28; US-28 S8). */
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
    <button type="button" onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

/**
 * US-19 walk D3 — `Send the purchase order` where no Pieces line carries the
 * drafted PO (the need counts the project's POs, not its lines) sets this
 * before it opens the ledger on the project; the page spends it once its
 * orders have read, landing on the first drafted, unsent row's own `Send →`.
 * The ledger is never the landing (520-4's grammar).
 */
export const ordersSendLanding = { pending: false };

export function OrdersLedger({
  onClose,
  initialContext,
}: {
  onClose: () => void;
  initialContext?: OpenLedgerContext | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: orders, isLoading, isError, refetch } = usePurchaseOrders() as {
    data: AnyRecord[] | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => unknown;
  };
  // Q10 (walk W-D5): studio totals are an owner's or admin's; any other seat
  // sees the money on the jobs she leads. Vendors applies the same rule
  // (SQ-751 F3).
  // SQ-774 R1 — each PO is judged by its own job's studio, and the book's
  // totals sum only the studios whose book is hers.
  const money = useStudioMoney();
  const canSeeMargin = money.bookStudioIds.length > 0;
  const canSeePoMoney = (po: AnyRecord) =>
    money.canSeeRecord(po.project?.studio_id ?? null, po.project_id ?? po.project?.id ?? null);
  const inBook = (po: AnyRecord) => money.canSeeStudio(po.project?.studio_id ?? null);
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
  // A return from a job reopens the page and lenses it was left on.
  const [heldReturn] = useState(() => parseOrdersReturn(initialContext?.studioReturn));
  // R28: the book's pages, linked by DM-mono text. Brief-a-vendor (R29)
  // pre-addresses straight onto Vendors with the document's project. (page is
  // a free string on the shared context — narrow it to this book's pages.)
  const [page, setPage] = useState<BookPage>(
    heldReturn?.page ??
      (PAGES.some((p) => p.key === initialContext?.page)
        ? (initialContext!.page as BookPage)
        : 'ledger'),
  );
  // R18: send / resend through the shared preview-confirm.
  const [previewPo, setPreviewPo] = useState<AnyRecord | null>(null);
  const [paperPoId, setPaperPoId] = useState<string | null>(null);
  const paperPo = orders?.find((po) => po.id === paperPoId);
  const orderOpener = useRef<HTMLElement | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [truckEta, setTruckEta] = useState(todayYmd());
  const [batchBusy, setBatchBusy] = useState(false);
  // PRC-07 (R84): the row whose log-acknowledgment band is unfolded.
  const [ackPoId, setAckPoId] = useState<string | null>(null);
  // C-11 (D1-11): the row whose money-out band is unfolded.
  // C-22: the Desk's payment needs open the book onto that PO's band.
  const [moneyPoId, setMoneyPoId] = useState<string | null>(
    initialContext?.purchaseOrderId ?? null,
  );
  // PRC-06 (R84): the quiet lenses — project + payment state, DM-mono text
  // (the portal's FacetedFilterPopover facets, without the pills).
  // US-16 (C-08): seeded from the opening context so the project the
  // designer was holding stays the lens across Ledger, Week and Receiving —
  // not just the page the book happened to open onto.
  const [projectLens, setProjectLens] = useState<string | null>(
    heldReturn ? heldReturn.project : initialContext?.projectId ?? null,
  );
  const [paymentLens, setPaymentLens] = useState<PaymentLens | null>(
    heldReturn?.payment ?? null,
  );
  // US-28 S8 — at 390 the two lens lines fold behind "Filter" (CSS reads
  // data-open; at wider widths they always show and Filter is not drawn).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const lensCount = (projectLens ? 1 : 0) + (paymentLens ? 1 : 0);

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

  // C-32 (SQ-430): the orders waiting on THIS seat's release lead the page;
  // they leave the vendor groups so each order reads once.
  const heldQuery = useHeldPurchaseOrders();
  const heldRows = heldQuery.data;
  const ordersKnown = orders !== undefined && heldRows !== undefined;
  const releasableIds = useMemo(
    () =>
      new Set(
        (heldRows ?? []).filter((h) => h.viewerCanRelease).map((h) => h.id),
      ),
    [heldRows],
  );
  const heldForRelease = useMemo(
    () =>
      (heldRows ?? []).filter(
        (h) =>
          h.viewerCanRelease && (!projectLens || h.projectId === projectLens),
      ),
    [heldRows, projectLens],
  );
  // A payment lens reads money already scheduled; a held order has none yet.
  const heldShown = paymentLens ? [] : heldForRelease;

  const groups = useMemo(() => {
    const lensed = live
      .filter((o) => !releasableIds.has(o.id))
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
  }, [live, projectLens, paymentLens, vendorById, releasableIds]);

  // Walk D3 — two frames, so the landing follows the sheet's own focus. Never
  // cancelled: StrictMode's second pass finds the flag already spent.
  const bookRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ordersSendLanding.pending || !ordersKnown || page !== 'ledger') return;
    ordersSendLanding.pending = false;
    const index = groups
      .flatMap((g) => g.pos)
      .findIndex((po) => !po.sent_at && po.status === 'draft');
    if (index < 0) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const control = bookRef.current
          ?.querySelectorAll<HTMLElement>('[data-orders-po-row]')
          [index]?.querySelector<HTMLElement>(
            '[data-action-key="open-purchase-order-preview"]',
          );
        control?.scrollIntoView?.({ block: 'center' });
        control?.focus({ preventScroll: true });
      }),
    );
  }, [ordersKnown, page, groups]);

  const selectedVendor = useMemo(() => {
    const pos = (orders ?? []).filter((o) => selected.includes(o.id));
    const vendorIds = new Set(pos.map((o) => o.vendor_id));
    return vendorIds.size === 1 ? [...vendorIds][0] : null;
  }, [orders, selected]);

  const pressed = useRef<HTMLElement | null>(null);
  const returnState = useRef(heldReturn?.held);
  useEffect(() => {
    const held = returnState.current;
    const root = bookRef.current;
    if (!held || !root) return;
    return restoreStudioOverlay(root, held, () => held.focusKey
      ? root.querySelector<HTMLElement>(`[data-orders-return="${CSS.escape(held.focusKey)}"]`)
      : root.querySelector<HTMLElement>('[data-orders-page-links] [aria-current="page"]'),
    () => { returnState.current = undefined; });
  }, []);

  const openDocument = (projectId: string | null, place?: VendorPlace) => {
    if (!projectId) return;
    const root = bookRef.current;
    const rowKey = pressed.current?.dataset.ordersReturn;
    const lens = new URLSearchParams({
      ...(projectLens ? { project: projectLens } : {}),
      ...(paymentLens ? { payment: paymentLens } : {}),
      ...(place ? { vendor: place.vendorId, sub: place.page } : {}),
      ...(place?.threadId ? { thread: place.threadId } : {}),
    }).toString();
    // Without a row to land on, the page link takes focus, so the sheet opens at its top.
    rememberPaperOrigin(projectId, { path: '/desk', studioOverlay: {
      overlay: 'orders', filter: lens ? `${page}?${lens}` : page,
      ...(rowKey ? { subject: rowKey, focusKey: rowKey } : {}),
      scrollTop: root && rowKey ? studioOverlayScroll(root).scrollTop : 0,
    } });
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
    } catch {
      // N12b — updateEta.error carries the failure to the line by the act.
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <div
      ref={bookRef}
      onClickCapture={(event) => { pressed.current = (event.target as Element).closest<HTMLElement>('button'); }}
      className="mx-auto w-full min-w-0 max-w-3xl"
      data-orders-book
    >
      <DocSheetHead
        icon={ORDERS_ICON}
        title="Purchase orders"
        pageLabel={PAGES.find((p) => p.key === page)?.label}
        onClose={onClose}
        helpKey={HELP_KEY_BY_PAGE[page]}
      />
      <p className="doc-type-body mb-2 text-[var(--color-quiet-ink)]">
        Every project&apos;s purchase orders, gathered in one studio register.
      </p>

      {/* R28: the book's pages — DM-mono links, never tabs. */}
      <nav
        aria-label="Order register views"
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

      {(isError || heldQuery.isError) && (page === 'ledger' || page === 'vendors') && (
        <div role={ordersKnown ? 'status' : 'alert'} className="doc-type-body py-3">
          <p>{ordersKnown
            ? 'The purchase orders could not be refreshed. The last read is still shown; your edits are kept.'
            : 'The purchase orders could not be read. Try reading them again.'}</p>
          <DocumentAction actionKey="retry-order-register" surfaceKey="orders" regionKey="read-failure" variant="secondary" onClick={() => { void refetch(); void heldQuery.refetch(); }}>
            Read the orders again
          </DocumentAction>
        </div>
      )}

      {page === 'vendors' && ordersKnown && (
        <VendorsBookPage
          vendors={vendors ?? []}
          orders={orders ?? []}
          initialVendorId={heldReturn?.vendor ?? initialContext?.vendorId ?? null}
          initialVendorPage={heldReturn?.vendorPage ?? initialContext?.vendorPage ?? null}
          initialThreadId={heldReturn?.thread ?? null}
          focusField={initialContext?.focus ?? null}
          briefProjectId={initialContext?.projectId ?? null}
          canSeePoMoney={canSeePoMoney}
          onOpenDocument={openDocument}
        />
      )}

      {page === 'week' && (
        <WeekBookPage
          projectId={projectLens}
          onClearProject={() => setProjectLens(null)}
        />
      )}

      {page === 'receiving' && (
        <ReceivingBookPage
          projectId={projectLens}
          onClearProject={() => setProjectLens(null)}
          onOpenDocument={openDocument}
        />
      )}

      {page === 'ledger' && (
        <>
          {/* Front-matter (R5): procurement throughput — the page's opening. */}
          {ordersKnown && canSeeMargin && (
            <LedgerFrontMatter
              caption="throughput"
              stats={ordersThroughput((orders ?? []).filter(inBook) as POForThroughput[])}
            />
          )}
          {!ordersKnown && (isLoading || heldQuery.isLoading) && (
            <p className="doc-type-body py-3 italic text-[var(--color-quiet-ink)]">
              Opening the book…
            </p>
          )}
          {/* US-28 S8 — the register is ONE Section: one head, then PRC-06's
              lenses (R84 — never FilterPills) as two labelled lines of
              underline words that fold behind "Filter" at 390, then the
              orders; the Section closes on its own rule after the last row. */}
          {ordersKnown && (
            <section
              className="section money-register"
              data-orders-register
              aria-labelledby="orders-register-head"
            >
              <div className="sec-head">
                <p className="eb" id="orders-register-head">
                  <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
                    <path d="M0 2h34M0 6h28M0 10h20" />
                  </svg>
                  <span>Order register</span>
                </p>
                {live.length > 0 && (
                  <span className="money-head-acts">
                    <button
                      type="button"
                      className="money-filter-toggle"
                      aria-expanded={filtersOpen}
                      aria-controls="orders-lenses"
                      onClick={() => setFiltersOpen((open) => !open)}
                    >
                      {`Filter${lensCount ? ` · ${lensCount}` : ''}`}
                    </button>
                    <button
                      type="button"
                      data-orders-bulk-toggle
                      aria-pressed={bulkMode}
                      onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
                      className={`da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.06em] text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${bulkMode ? 'da-score-on text-[var(--color-charcoal)]' : ''}`}
                    >
                      {bulkMode
                        ? `Done selecting${selected.length ? ` · ${selected.length}` : ''}`
                        : 'Select multiple'}
                    </button>
                  </span>
                )}
              </div>
              {live.length > 0 && (
                <div
                  id="orders-lenses"
                  data-orders-lenses
                  data-open={filtersOpen || undefined}
                  className="money-flines"
                >
                  {projectOptions.length > 1 && (
                    <div className="money-fline">
                      <span className="t-meta money-fline-l" id="orders-lens-project">
                        Project
                      </span>
                      <div className="filters" role="group" aria-labelledby="orders-lens-project">
                        <LensLink
                          key="all"
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
                      </div>
                    </div>
                  )}
                  <div className="money-fline">
                    <span className="t-meta money-fline-l" id="orders-lens-payment">
                      Payment
                    </span>
                    <div className="filters" role="group" aria-labelledby="orders-lens-payment">
                      <LensLink
                          key="all"
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
                    </div>
                  </div>
                </div>
              )}
          {/* The bill run (D1-11): under the `payment · due` lens, one total
              over exactly the rows beneath it (V11). */}
          {ordersKnown && canSeeMargin && paymentLens === 'due' && (
            <LedgerFrontMatter
              caption="due to makers this week"
              stats={dueToMakers(groups.flatMap((g) => g.pos).filter(inBook))}
            />
          )}
          {ordersKnown &&
            live.length > 0 &&
            groups.length === 0 &&
            heldShown.length === 0 &&
            (projectLens || paymentLens) && (
              <p className="doc-type-body py-2 italic text-[var(--color-quiet-ink)]">
                No orders match this view.
              </p>
            )}
          {/* The zero-PO state (help-desk Wave 1, copy §E.3) — the page was
              blank here before; a quiet heading + teaching line, no chrome. */}
          {ordersKnown && live.length === 0 && (
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
          {/* C-32: held for release — only the orders this seat may release. */}
          {ordersKnown && heldShown.length > 0 && (
            <section data-orders-held-for-release className="mb-4">
              <p className="doc-type-meta mb-1 font-semibold uppercase tracking-[0.07em] text-[var(--color-clay-ink)]">
                {[
                  'Held for release',
                  String(heldShown.length),
                  canSeeMargin
                    ? fmtUsd(heldShown.reduce((s, h) => s + h.totalCents, 0))
                    : null,
                ].filter(Boolean).join(' · ')}
              </p>
              <ul>
                {heldShown.map((h) => {
                  const po = (orders ?? []).find((o) => o.id === h.id);
                  const holder = h.heldByName?.trim().split(/\s+/)[0] ?? null;
                  return (
                    <li
                      key={h.id}
                      data-orders-held-row
                      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-pearl)] px-1 py-3"
                    >
                      <div className="min-w-[12rem] flex-1">
                        <p className="doc-type-body font-medium text-[var(--color-charcoal)]">
                          {[h.vendorName ?? 'Vendor', h.projectName ?? 'Project'].join(' · ')}
                        </p>
                        <p className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                          {[
                            money.canSeeRecord(h.studioId, h.projectId)
                              ? fmtUsd(h.totalCents)
                              : null,
                            h.heldAt ? `held ${fmtDay(h.heldAt)}` : 'held',
                            holder,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {h.holdNote && (
                          <p className="doc-type-body mt-0.5 italic text-[var(--color-quiet-ink)]">
                            “{h.holdNote}”
                          </p>
                        )}
                      </div>
                      {po && (
                        <DocumentAction
                          actionKey="open-held-purchase-order"
                          surfaceKey="orders"
                          regionKey="held-for-release"
                          variant="secondary"
                          onClick={(event) => {
                            orderOpener.current = event.currentTarget;
                            setPaperPoId(po.id);
                          }}
                        >
                          Open →
                        </DocumentAction>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {ordersKnown && groups.map((g) => (
            <section key={g.vendorId} className="mb-4">
              <p className="doc-type-meta mb-1 font-semibold uppercase tracking-[0.07em] text-[var(--color-quiet-ink)]">
                {g.vendorName}
              </p>
              <ul>
                {g.pos.map((po, index) => {
                  // R7: the same grammar at ledger density — the row's word
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
                  // C-27: an acknowledgment with an open difference stamps
                  // the row in terracotta and unfolds its record to answer.
                  const ackDiffers = po.ack_state === 'discrepancy';
                  // C-11: the payment band — schedule, records, Record act.
                  const hasMoney = (po.payments ?? []).length > 0;
                  return (
                    <Fragment key={po.id}>
                      <li
                        data-orders-po-row={po.id}
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
                            {ackDiffers ? (
                              <AckDifferenceStamp purchaseOrderId={po.id} />
                            ) : (
                              // U-Q13 — the position is an ink word, never a
                              // tilted, pigment-graded stamp.
                              <PoStateWord
                                status={po.status}
                                label={
                                  !po.sent_at || !position || position.key === 'released_to_maker' || position.key === 'cleared_to_produce'
                                    ? (purchaseOrderState(po) ? lineStampLabel(purchaseOrderState(po)!) : po.status.replace(/_/g, ' '))
                                    : procurementStepLabel(position.key)
                                }
                              />
                            )}
                            {/* Next gate — name, and the term that holds it. */}
                            <span
                              data-orders-next-gate
                              className="doc-type-meta hidden max-w-[16rem] text-[var(--color-quiet-ink)] sm:inline"
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
                              className={
                                !expected && po.status === 'shipped'
                                  ? 'word'
                                  : 'doc-type-meta whitespace-nowrap font-heading text-[var(--color-charcoal)]'
                              }
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
                              po.total_cents != null && canSeePoMoney(po)
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
                            {ackDiffers && (
                              <button
                                type="button"
                                data-orders-ack-differences-toggle
                                onClick={() =>
                                  setAckPoId((cur) =>
                                    cur === po.id ? null : po.id,
                                  )
                                }
                                aria-expanded={ackPoId === po.id}
                                className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.05em] text-[var(--color-terracotta-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
                              >
                                differences {ackPoId === po.id ? '↑' : '↓'}
                              </button>
                            )}
                            {hasMoney && canSeePoMoney(po) && (
                              <button
                                type="button"
                                data-orders-money-toggle
                                onClick={() =>
                                  setMoneyPoId((cur) =>
                                    cur === po.id ? null : po.id,
                                  )
                                }
                                aria-expanded={moneyPoId === po.id}
                                className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.05em] text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
                              >
                                money out {moneyPoId === po.id ? '↑' : '↓'}
                              </button>
                            )}
                            <DocumentAction
                              actionKey="open-purchase-order-preview"
                              surfaceKey="orders"
                              regionKey={`purchase-order-row-${index + 1}`}
                              variant="secondary"
                              onClick={(event) => {
                                orderOpener.current = event.currentTarget;
                                // C-23: an unsent draft opens on its order
                                // paper; a sent PO keeps its PDF paper.
                                // C-32: a held PO reads on its paper too.
                                !po.sent_at &&
                                (po.status === 'draft' ||
                                  po.status === 'held_for_release') &&
                                !po.is_patina_catalog
                                  ? setPaperPoId(po.id)
                                  : setPreviewPo(po);
                              }}
                            >
                              {po.sent_at
                                ? 'Resend'
                                : po.status === 'draft'
                                  ? 'Send →'
                                  : po.status === 'held_for_release'
                                    ? 'Open →'
                                    : 'PDF'}
                            </DocumentAction>
                            <button
                              type="button"
                              data-orders-return={`po:${po.id}`}
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
                            door={false}
                          />
                        </li>
                      )}
                      {ackDiffers && ackPoId === po.id && (
                        <li
                          data-orders-ack-record
                          className="border-b border-[var(--color-pearl)] px-1 py-3 sm:pl-12"
                        >
                          <AckRecord
                            purchaseOrderId={po.id}
                            projectId={po.project_id ?? po.project?.id ?? null}
                            vendorPoNumber={po.vendor_po_number}
                            confirmedEta={po.confirmed_eta}
                            // R8: the change order lives on the line, in the Document.
                            onStartChange={() =>
                              openDocument(po.project_id ?? po.project?.id ?? null)
                            }
                          />
                        </li>
                      )}
                      {hasMoney && canSeePoMoney(po) && moneyPoId === po.id && (
                        <li
                          data-orders-money-unfold
                          className="border-b border-[var(--color-pearl)] px-1 py-3 sm:pl-12"
                        >
                          <p className="doc-type-meta mb-1 uppercase tracking-[0.07em] text-[var(--color-quiet-ink)]">
                            Vendor payments
                          </p>
                          <PoMoneyOut
                            purchaseOrderId={po.id}
                            projectId={po.project_id ?? po.project?.id ?? null}
                            isPatinaCatalog={Boolean(po.is_patina_catalog)}
                            fallback={po.payments}
                            receiptAnchor={{ kind: 'section', sectionKey: 'project' }}
                            surfaceKey="orders"
                          />
                        </li>
                      )}
                    </Fragment>
                  );
                })}
              </ul>
            </section>
          ))}
            </section>
          )}

          {previewPo && (
            <PoPreview
              open
              onOpenChange={(o: boolean) => {
                if (!o) setPreviewPo(null);
              }}
              returnFocusTo={orderOpener.current}
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

          {paperPo && (
            <ExistingOrderPaper
              open
              onClose={() => setPaperPoId(null)}
              returnFocusTo={orderOpener.current}
              purchaseOrder={paperPo}
              vendor={
                vendorById.get(paperPo.vendor_id) ??
                paperPo.vendor ?? {
                  id: paperPo.vendor_id,
                  name: 'the vendor',
                  default_payment_terms: null,
                }
              }
              projectName={paperPo.project?.name ?? 'Project'}
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
                  <DateTextInput
                    ariaLabel="Shared ETA"
                    className="doc-type-control min-h-11 rounded-[4px] border border-[var(--color-pearl)] bg-transparent px-2 text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
                    value={truckEta || null}
                    onChange={(value) => setTruckEta(value ?? '')}
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
                    Update ETA
                  </DocumentAction>
                  {/* N12b (R83) — no Try again: some POs may already carry
                      the new ETA, and each write adds a note. */}
                  <ActFailLine error={updateEta.error} />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
