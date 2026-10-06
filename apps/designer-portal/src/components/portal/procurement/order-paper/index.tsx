'use client';

/**
 * The order paper (C-23, D1-05): the purchase order itself, editable in
 * place, with one terminal act. It replaces the Order Assistant's four steps
 * (review / coverage / details / created) and its second send screen.
 *
 * - Header: the studio's letterhead, the vendor and the studio's account
 *   facts, sidemark, requested ship date, ship-to (nothing preselected,
 *   R-PB3), bill-to, freight terms.
 * - Body: the lines, the total, the client-payment fact (a warning that never
 *   blocks), terms from the studio account, the note to the vendor.
 * - One terminal act with the amount inside its label. It creates the PO,
 *   writes the header (set_purchase_order_header, 00701) and the ship-to, then
 *   sends through po-send. "Save, don't send" keeps the paper as a draft.
 * - Patina-maker lane (`is_patina_catalog`): "Order from Patina · $X" goes to
 *   Stripe hosted Checkout. Patina carries sidemark, ship-to and freight, so
 *   they are not on the paper. V1: no Patina margin or fee appears here.
 *
 * Opened on an existing unsent PO (the Orders ledger's drafts), an edit is a
 * header write at once and the terminal act only sends.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import {
  fetchPOPayments,
  useCreatePurchaseOrder,
  useFfeInvoiceCoverage,
  useProcurementItems,
  useSendPurchaseOrder,
  useSetPurchaseOrderHeader,
  useStartPoCheckout,
  useStudioIdentity,
  useStudioVendorAccount,
  useVendorQuotes,
  type CreatePurchaseOrderInput,
  type FreightTerms,
  type PaymentPattern,
  type PurchaseOrderHeaderRequest,
} from '@patina/supabase';
import { DocSheet } from '@/components/document/overlays/doc-sheet';
import { DocumentAction } from '@/components/document/document-action';
import { PoPreview } from '@/components/document/po-preview';
import {
  BlockedByDecisionInline,
  getBlockedItems,
} from '@/components/portal/procurement/blocked-by-decision-notice';
import {
  clientVendorEmailHint,
  poSendErrorMessage,
} from '@/components/portal/procurement/po-send-actions';
import {
  EMPTY_SHIP_TO,
  SHIP_TO_REQUIRED_MESSAGE,
  ShipToChoice,
  resolveShipTo,
  useSaveShipTo,
  useShipToAddresses,
  type ShipToSelection,
} from '@/components/portal/procurement/order-assistant/ship-to-choice';
import { generateSidemark } from '@/components/portal/procurement/order-assistant/sidemark';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { isMixed, rowCurrency } from '@/lib/currency-totals';
import { fmtDay } from '@/lib/document/format';
import {
  FREIGHT_TERMS_OPTIONS,
  PAYMENT_PATTERN_OPTIONS,
  SIDEMARK_MAX_LENGTH,
  billToText,
  depositCentsForPattern,
  formatDollars,
  formatTradeMoney,
  formatTradeTotal,
  freshMilestone,
  itemTradeCents,
  parseDollarsToCents,
  paymentPatternLabel,
  prefillPaymentPattern,
  terminalLabel,
  termsNote,
  tradeTotal,
  uncoveredItems,
  validatePaper,
  type MilestoneRow,
  type OrderPaperFFEItem,
  type OrderPaperProject,
  type OrderPaperPurchaseOrder,
  type OrderPaperVendor,
  type PendingOrder,
} from './model';
import { latestQuoteForLine } from '@/components/document/line-unfold/quote-model';
import { PoRiders } from './riders';
import { ComLineNote, useComPaper } from './com-slot';

export * from './model';

export interface OrderPaperQueuePosition {
  /** Zero-based place of this paper in the queue. */
  index: number;
  count: number;
  /** Lay the next paper, or put the queue back after the last one. */
  onNext: () => void;
}

export interface OrderPaperProps {
  open: boolean;
  onClose: () => void;
  vendor: OrderPaperVendor;
  project: OrderPaperProject;
  ffeItems: OrderPaperFFEItem[];
  /** An existing unsent PO: edits write its header and the act only sends. */
  purchaseOrder?: OrderPaperPurchaseOrder | null;
  /** Set when this paper is one of several from "Order all". */
  queue?: OrderPaperQueuePosition;
  /** Fires once the PO exists (created here), so callers can refresh. */
  onCreated?: () => void;
}

/** A paper's state, once it acted: the act is replaced by its record. */
type PaperRecord =
  | { kind: 'sent'; at: string; recipient: string | null }
  | { kind: 'marked'; at: string }
  | { kind: 'saved'; at: string }
  | { kind: 'ordered'; at: string };

type Busy = 'send' | 'mark' | 'save' | 'order' | 'bill' | null;

const LABEL = 'doc-type-meta uppercase tracking-[0.07em] text-[var(--color-quiet-ink)]';
const FIELD =
  'min-h-11 min-w-0 border-0 border-b border-dotted border-[var(--color-rule-strong,#D8CCB8)] bg-transparent px-0 doc-type-body text-[var(--color-charcoal)] placeholder:text-[var(--color-quiet-ink)] focus:border-solid focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-60';
const RULE = 'border-t border-[var(--color-pearl)]';

const todayIso = () => new Date().toISOString();

/** The order paper. Mounts fresh on every open, so a put-back paper starts clean. */
export function OrderPaper(props: OrderPaperProps) {
  if (!props.open) return null;
  return <PaperSheet {...props} />;
}

/**
 * "Order all": one paper per (vendor, project), laid one after another in the
 * same sheet with a running head ("2 of 3 · Hewn"). Putting the sheet back
 * puts the whole queue back.
 */
export function OrderPaperQueue({
  orders,
  onClose,
}: {
  orders: PendingOrder[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const current = orders[index];
  if (!current) return null;
  const onNext = () => (index + 1 < orders.length ? setIndex(index + 1) : onClose());
  return (
    <OrderPaper
      key={`${index}:${current.vendor.id}:${current.project.id}`}
      open
      onClose={onClose}
      vendor={current.vendor}
      project={current.project}
      ffeItems={current.ffeItems}
      queue={orders.length > 1 ? { index, count: orders.length, onNext } : undefined}
    />
  );
}

/**
 * The paper for an existing unsent PO (the Orders ledger's draft rows): its
 * lines are the FF&E items linked to it.
 */
export function ExistingOrderPaper(props: {
  open: boolean;
  onClose: () => void;
  purchaseOrder: OrderPaperPurchaseOrder;
  vendor: OrderPaperVendor;
  projectName: string;
}) {
  if (!props.open) return null;
  return <ExistingPaperLines {...props} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ItemRow = Record<string, any>;

function ExistingPaperLines({
  onClose,
  purchaseOrder,
  vendor,
  projectName,
}: {
  onClose: () => void;
  purchaseOrder: OrderPaperPurchaseOrder;
  vendor: OrderPaperVendor;
  projectName: string;
}) {
  const { data: items } = useProcurementItems({ purchaseOrderId: purchaseOrder.id }) as {
    data: ItemRow[] | undefined;
  };
  const ffeItems = useMemo<OrderPaperFFEItem[]>(
    () =>
      (items ?? [])
        .filter((it) => it.purchase_order_id === purchaseOrder.id)
        .map((it) => ({
          id: it.id,
          name: it.name,
          room: it.room?.name,
          line_total_cents: it.line_total_cents ?? 0,
          quantity: it.quantity ?? 1,
          unit_price_cents: it.unit_price_cents ?? null,
          trade_price_cents: it.trade_price_cents ?? null,
          currency: it.currency ?? null,
        })),
    [items, purchaseOrder.id],
  );
  return (
    <OrderPaper
      open
      onClose={onClose}
      vendor={vendor}
      project={{ id: purchaseOrder.project_id, name: projectName }}
      ffeItems={ffeItems}
      purchaseOrder={purchaseOrder}
    />
  );
}

function PaperSheet({
  onClose,
  vendor,
  project,
  ffeItems,
  purchaseOrder,
  queue,
  onCreated,
}: OrderPaperProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const alive = useRef(true);
  useEffect(() => {
    // Set on every mount: StrictMode's dev remount runs the cleanup first.
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const isPatinaMaker =
    Boolean(vendor.is_patina_catalog) ||
    (ffeItems.length > 0 && ffeItems.every((i) => i.layer === 'catalog'));
  const existing = purchaseOrder ?? null;

  // The money. A PO on file prints its stored total; a new paper prints the
  // trade total create_purchase_order will store (00186).
  const batchTotal = useMemo(() => tradeTotal(ffeItems), [ffeItems]);
  const totalCents = existing
    ? existing.total_cents
    : isMixed(batchTotal)
      ? 0
      : batchTotal.cents;
  const amount = existing ? formatDollars(existing.total_cents) : formatTradeTotal(batchTotal);

  const blockedItems = useMemo(() => getBlockedItems(ffeItems), [ffeItems]);

  // The studio: letterhead, its account with this vendor (C-12), its inbox.
  const { data: identity } = useStudioIdentity({ projectId: project.id });
  const studioName = identity?.name ?? null;
  const { data: accountRow } = useStudioVendorAccount(identity?.studioId ?? null, vendor.id);
  const account = accountRow && !accountRow.archived_at ? accountRow : null;
  const recipient =
    account?.orders_email_override?.trim() || clientVendorEmailHint(vendor) || null;

  // ─── Header fields ──────────────────────────────────────────────────────
  const sharedRoom = useMemo(() => {
    const rooms = new Set(ffeItems.map((i) => i.room).filter(Boolean));
    return rooms.size === 1 ? (Array.from(rooms)[0] as string) : undefined;
  }, [ffeItems]);
  const generatedSidemark = generateSidemark({
    studioName,
    projectName: project.name,
    roomName: sharedRoom,
  });
  const [sidemarkDraft, setSidemarkDraft] = useState<string | null>(
    existing ? (existing.sidemark ?? '') : null,
  );
  // Until touched, a new paper's sidemark follows the generator (the studio
  // name loads after open).
  const sidemark = sidemarkDraft ?? generatedSidemark;
  const [requestedShipOn, setRequestedShipOn] = useState(existing?.requested_ship_on ?? '');
  const [billTo, setBillTo] = useState(existing ? billToText(existing.bill_to) : '');
  const [freightTerms, setFreightTerms] = useState<FreightTerms | ''>(
    (existing?.freight_terms as FreightTerms | null) ?? '',
  );
  const [vendorNote, setVendorNote] = useState(existing?.vendor_note ?? '');

  const shipToAddresses = useShipToAddresses(project.id);
  const [shipToSelection, setShipToSelection] = useState<ShipToSelection>(EMPTY_SHIP_TO);
  const chosenShipTo = resolveShipTo(shipToSelection, shipToAddresses);
  const shipToOnFile = existing?.ship_to?.trim() || null;
  const hasShipTo = Boolean(chosenShipTo || shipToOnFile);
  // C-24: a COM pair on this paper (the fabric PO, or the piece it feeds).
  const com = useComPaper({
    projectId: project.id,
    itemIds: ffeItems.map((i) => i.id),
    vendorName: vendor.name,
  });
  // C-29: what this maker quoted for each line (unit × qty, beside the trade
  // total), when a live quote prices it. The column shows only where one does.
  const { data: quotes } = useVendorQuotes(project.id);
  const quotedCents = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of ffeItems) {
      const quote = latestQuoteForLine(quotes, item.id, vendor.id);
      if (quote) map.set(item.id, quote.unitTradeCents * (item.quantity ?? 1));
    }
    return map;
  }, [quotes, ffeItems, vendor.id]);

  // ─── Terms (a new paper; a PO on file keeps its schedule) ──────────────
  const accountPattern: PaymentPattern | null = account?.payment_pattern ?? null;
  const prefill = prefillPaymentPattern(accountPattern, vendor.default_payment_terms);
  const [pickedPattern, setPickedPattern] = useState<PaymentPattern | null>(null);
  const paymentPattern = pickedPattern ?? prefill;
  const accountPct =
    account?.deposit_pct != null && (accountPattern == null || accountPattern === paymentPattern)
      ? account.deposit_pct
      : null;
  const depositCents = depositCentsForPattern(paymentPattern, totalCents, accountPct);
  const [depositDueDate, setDepositDueDate] = useState('');
  const [milestones, setMilestones] = useState<MilestoneRow[]>(() => [
    freshMilestone(),
    freshMilestone(),
  ]);

  // ─── Coverage: one quiet fact, a warning that never blocks ─────────────
  const coverageQuery = useFfeInvoiceCoverage(project.id);
  const coverageKnown = !coverageQuery.isLoading && !coverageQuery.isError;
  const uncovered = useMemo(
    () => (coverageKnown ? uncoveredItems(ffeItems, coverageQuery.data) : []),
    [coverageKnown, ffeItems, coverageQuery.data],
  );
  const uncoveredTotal = useMemo(() => tradeTotal(uncovered.map((u) => u.item)), [uncovered]);
  const gateShown = useRef(false);
  useEffect(() => {
    if (!coverageKnown || uncovered.length === 0 || gateShown.current) return;
    gateShown.current = true;
    procurementEvents.coverageGateShown({
      uncovered_count: uncovered.length,
      uncovered_cents: isMixed(uncoveredTotal) ? 0 : uncoveredTotal.cents,
      total_count: ffeItems.length,
    });
  }, [coverageKnown, uncovered.length, uncoveredTotal, ffeItems.length]);

  // ─── Mutations ──────────────────────────────────────────────────────────
  const createPO = useCreatePurchaseOrder();
  const setHeader = useSetPurchaseOrderHeader({ errorSurface: 'inline' });
  const saveShipTo = useSaveShipTo();
  const sendPo = useSendPurchaseOrder({ errorSurface: 'inline' });
  const startCheckout = useStartPoCheckout({ errorSurface: 'inline' });

  const [poId, setPoId] = useState<string | null>(existing?.id ?? null);
  const [record, setRecord] = useState<PaperRecord | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [shipToInvalid, setShipToInvalid] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Maker lane: payment not started, or deferred inside a queue.
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [deferredPaymentId, setDeferredPaymentId] = useState<string | null>(null);
  const [payNowPending, setPayNowPending] = useState(false);

  const failWith = (e: unknown, fallback: string) => {
    if (!alive.current) return;
    const message = e instanceof Error ? e.message : fallback;
    if (message.includes('ship_to_required')) {
      setShipToInvalid(true);
      setError(SHIP_TO_REQUIRED_MESSAGE);
    } else {
      setError(poSendErrorMessage(message));
    }
  };

  // What the PO holds now, so a blur that changed nothing writes nothing.
  const savedHeader = useRef<Record<string, string>>({
    sidemark: existing?.sidemark ?? '',
    requestedShipOn: existing?.requested_ship_on ?? '',
    billTo: existing ? billToText(existing.bill_to) : '',
    freightTerms: existing?.freight_terms ?? '',
    vendorNote: existing?.vendor_note ?? '',
  });

  /** A header edit on a PO that exists is written at once. */
  const writeHeader = (key: keyof PurchaseOrderHeaderRequest, text: string) => {
    if (!poId || savedHeader.current[key] === text) return;
    const value =
      key === 'billTo' ? (text ? { name: text } : null) : text || null;
    savedHeader.current[key] = text;
    setError(null);
    setHeader
      .mutateAsync({
        purchaseOrderId: poId,
        request: { [key]: value } as PurchaseOrderHeaderRequest,
      })
      .catch((e: unknown) => {
        delete savedHeader.current[key];
        if (alive.current) setError(e instanceof Error ? e.message : 'The header was not saved.');
      });
  };

  const headerRequest = (): PurchaseOrderHeaderRequest => {
    const request: PurchaseOrderHeaderRequest = {};
    if (requestedShipOn) request.requestedShipOn = requestedShipOn;
    if (billTo.trim()) request.billTo = { name: billTo.trim() };
    if (freightTerms && !isPatinaMaker) request.freightTerms = freightTerms;
    if (vendorNote.trim()) request.vendorNote = vendorNote.trim();
    return request;
  };

  const refuseBlocked = (): boolean => {
    if (blockedItems.length === 0) return false;
    procurementEvents.orderBlocked({
      blocked_item_count: blockedItems.length,
      vendor_id: vendor.id,
      project_id: project.id,
      is_patina_catalog: isPatinaMaker,
    });
    setError(
      `${blockedItems.length} item${blockedItems.length === 1 ? ' is' : 's are'} blocked pending a client decision. Resolve the decision before ordering.`,
    );
    return true;
  };

  const overriddenOnce = useRef(false);
  const noteCoverageOverride = () => {
    if (uncovered.length === 0 || overriddenOnce.current) return;
    overriddenOnce.current = true;
    procurementEvents.coverageOverridden({
      uncovered_count: uncovered.length,
      uncovered_cents: isMixed(uncoveredTotal) ? 0 : uncoveredTotal.cents,
      vendor_id: vendor.id,
      project_id: project.id,
    });
  };

  /**
   * The PO this paper is: the one on file, or created now with its header and
   * ship-to. Once it exists it is never created twice.
   */
  const ensurePurchaseOrder = async (): Promise<string> => {
    if (poId) {
      if (chosenShipTo) await saveShipTo.save(poId, shipToSelection, chosenShipTo);
      await com.linkSupplies(poId);
      return poId;
    }
    const invalid = validatePaper({
      paymentPattern,
      milestones,
      totalCents,
      sidemark,
    });
    if (invalid) throw new Error(invalid);

    const input: CreatePurchaseOrderInput = {
      projectId: project.id,
      vendorId: vendor.id,
      paymentPattern,
      isPatinaCatalog: false,
      ffeItemIds: ffeItems.map((i) => i.id),
      sidemark: sidemark.trim() || undefined,
    };
    if (paymentPattern === 'fifty_fifty' || paymentPattern === 'thirty_seventy') {
      input.depositDueDate = depositDueDate || undefined;
      input.depositAmountCents = depositCents && depositCents > 0 ? depositCents : undefined;
    } else if (paymentPattern === 'full_upfront') {
      input.depositDueDate = depositDueDate || undefined;
    } else if (paymentPattern === 'custom_milestones') {
      input.customMilestones = milestones.map((m, idx) => ({
        label: m.label.trim(),
        amountCents: parseDollarsToCents(m.amountInput),
        dueDate: m.dueDate || undefined,
        sortOrder: idx,
      }));
    }

    const po = await createPO.mutateAsync(input);
    setPoId(po.id);
    procurementEvents.poCreated({
      payment_pattern: paymentPattern,
      total_cents: po.total_cents,
      is_patina_catalog: false,
      coverage_overridden: overriddenOnce.current,
      sidemark_edited: sidemarkDraft !== null,
      vendor_id: vendor.id,
      project_id: project.id,
    });
    onCreated?.();

    const request = headerRequest();
    if (Object.keys(request).length > 0) {
      await setHeader.mutateAsync({ purchaseOrderId: po.id, request });
    }
    savedHeader.current = {
      sidemark: sidemark.trim(),
      requestedShipOn,
      billTo: billTo.trim(),
      freightTerms,
      vendorNote: vendorNote.trim(),
    };
    if (chosenShipTo) await saveShipTo.save(po.id, shipToSelection, chosenShipTo);
    await com.linkSupplies(po.id);
    return po.id;
  };

  const settled = () => {
    void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
    void qc.invalidateQueries({ queryKey: ['document-state'] });
    void qc.invalidateQueries({ queryKey: ['margin-items'] });
  };

  // ─── The terminal act, and its phone/portal twin ───────────────────────
  const send = async (mode: 'send' | 'mark_sent') => {
    if (busy) return;
    setError(null);
    if (refuseBlocked()) return;
    if (!hasShipTo) {
      setShipToInvalid(true);
      setError(SHIP_TO_REQUIRED_MESSAGE);
      return;
    }
    setBusy(mode === 'send' ? 'send' : 'mark');
    noteCoverageOverride();
    try {
      const id = await ensurePurchaseOrder();
      const result = await sendPo.mutateAsync({
        purchaseOrderId: id,
        mode,
        recipientEmail: mode === 'send' ? (recipient ?? undefined) : undefined,
        message: mode === 'send' ? vendorNote.trim() || undefined : undefined,
      });
      procurementEvents.poSent({
        method: mode === 'send' ? 'email' : 'manual',
        vendor_id: vendor.id,
      });
      settled();
      if (!alive.current) return;
      setRecord(
        mode === 'send'
          ? { kind: 'sent', at: todayIso(), recipient: result.recipient ?? recipient }
          : { kind: 'marked', at: todayIso() },
      );
    } catch (e) {
      failWith(e, 'The order did not send.');
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const saveDraft = async (): Promise<boolean> => {
    if (busy) return false;
    setError(null);
    if (refuseBlocked()) return false;
    setBusy('save');
    try {
      await ensurePurchaseOrder();
      settled();
      if (alive.current) setRecord({ kind: 'saved', at: todayIso() });
      return true;
    } catch (e) {
      failWith(e, 'The paper was not saved.');
      return false;
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  // Not covered: bill the client first, keeping this paper as a draft.
  const accountsHref = `/desk?book=accounts&projectId=${project.id}`;
  const billClientFirst = async () => {
    if (await saveDraft()) router.push(accountsHref);
  };

  // ─── The maker lane: Patina is the merchant, paid at Stripe Checkout ──
  const queuedBehind = queue ? queue.index < queue.count - 1 : false;
  const orderFromPatina = async () => {
    if (busy) return;
    setError(null);
    setCheckoutError(null);
    if (refuseBlocked()) return;
    setBusy('order');
    noteCoverageOverride();
    let id: string;
    try {
      const po = await createPO.mutateAsync({
        projectId: project.id,
        vendorId: vendor.id,
        paymentPattern: 'full_upfront',
        isPatinaCatalog: true,
        ffeItemIds: ffeItems.map((i) => i.id),
        sidemark: sidemark.trim() || undefined,
      });
      id = po.id;
      setPoId(po.id);
      procurementEvents.poCreated({
        payment_pattern: 'full_upfront',
        total_cents: po.total_cents,
        is_patina_catalog: true,
        coverage_overridden: overriddenOnce.current,
        sidemark_edited: false,
        vendor_id: vendor.id,
        project_id: project.id,
      });
      onCreated?.();
    } catch (e) {
      if (alive.current) {
        setBusy(null);
        setError(e instanceof Error ? e.message : 'The order was not placed.');
      }
      return;
    }

    // The PO exists from here and is never rolled back.
    const request = headerRequest();
    if (Object.keys(request).length > 0) {
      await setHeader.mutateAsync({ purchaseOrderId: id, request }).catch(() => undefined);
    }
    try {
      const payments = await fetchPOPayments(id);
      const payment = payments[0];
      if (!payment) throw new Error('No payment record was found for this order.');
      if (!alive.current) return;
      // Inside a queue, Stripe would take the tab and abandon the papers
      // still behind this one: pay from here instead, when ready.
      if (queuedBehind) {
        setDeferredPaymentId(payment.id);
        setRecord({ kind: 'ordered', at: todayIso() });
        setBusy(null);
        return;
      }
      const { url } = await startCheckout.mutateAsync({ poPaymentId: payment.id });
      if (!alive.current) return;
      window.location.href = url;
    } catch (e) {
      if (!alive.current) return;
      setCheckoutError(e instanceof Error ? e.message : "Payment couldn't be started.");
      setRecord({ kind: 'ordered', at: todayIso() });
      setBusy(null);
    }
  };

  const payNow = async () => {
    if (!deferredPaymentId || payNowPending) return;
    setPayNowPending(true);
    setCheckoutError(null);
    try {
      const { url } = await startCheckout.mutateAsync({ poPaymentId: deferredPaymentId });
      if (!alive.current) return;
      window.location.href = url;
    } catch (e) {
      if (!alive.current) return;
      setPayNowPending(false);
      setCheckoutError(e instanceof Error ? e.message : "Payment couldn't be started.");
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const locked = busy !== null || record !== null;
  const runningHead = queue
    ? `${queue.index + 1} of ${queue.count} · ${vendor.name}`
    : vendor.name;
  const coverageFact = !coverageKnown
    ? coverageQuery.isError
      ? "Client payment · couldn't check. You can still order."
      : 'Client payment · checking'
    : uncovered.length === 0
      ? ffeItems.length === 1
        ? 'Client payment · paid'
        : `Client payment · paid for all ${ffeItems.length}`
      : `Client payment · ${uncovered
          .map(({ item, chip }) => `${item.name}, ${chip.label.toLowerCase()}`)
          .join(' · ')}`;
  const consequence = isPatinaMaker
    ? `Patina places this order with ${vendor.name} and carries freight and claims.`
    : uncovered.length > 0
      ? `The client hasn't paid for ${uncovered.length} of these yet — sending fronts ${formatTradeTotal(uncoveredTotal)} of studio funds until they do.`
      : `${
          coverageKnown
            ? ffeItems.length === 1
              ? 'The client has paid for this piece. '
              : `The client has paid for all ${ffeItems.length} pieces. `
            : ''
        }Sending commits ${amount} of studio money to ${vendor.name}.`;
  const label = terminalLabel({ vendorName: vendor.name, amount, isPatinaMaker });
  const terminalHeld = !isPatinaMaker && !hasShipTo;

  return (
    <DocSheet
      open
      onClose={() => !busy && onClose()}
      title={existing?.po_number ? `Purchase order ${existing.po_number}` : 'The order paper'}
      pageLabel={runningHead}
      icon={FileText}
      wide
      kind="order-paper"
    >
      <div data-order-paper className="flex flex-col gap-5">
        {/* Letterhead: the studio's, because this paper goes to a vendor. */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-heading text-[17px] text-[var(--color-charcoal)]">
              {studioName ?? 'The studio'}
            </p>
            <p className={LABEL}>{project.name}</p>
          </div>
          <div className="min-w-0 text-right">
            <p className={LABEL}>
              Purchase order ·{' '}
              {existing?.po_number ?? (isPatinaMaker ? 'placed by Patina' : 'numbered at send')}
            </p>
            <p className="doc-type-body text-[var(--color-charcoal)]">to {vendor.name}</p>
            {!isPatinaMaker && (
              <p data-order-paper-account className="doc-type-meta text-[var(--color-quiet-ink)]">
                {[
                  recipient,
                  account?.account_number ? `account ${account.account_number}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No orders email on file'}
                {(account?.portal_url || vendor.trade_portal_url) && (
                  <>
                    {' · '}
                    <a
                      href={account?.portal_url || vendor.trade_portal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-dotted underline-offset-2"
                    >
                      trade portal ↗
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </header>

        {/* The header, editable in place. */}
        <section aria-label="Order header" className={`grid gap-x-6 gap-y-3 pt-4 sm:grid-cols-2 ${RULE}`}>
          {!isPatinaMaker && (
            <label className="flex flex-col">
              <span className={LABEL}>Sidemark</span>
              <input
                type="text"
                value={sidemark}
                disabled={locked}
                maxLength={SIDEMARK_MAX_LENGTH + 10}
                aria-invalid={sidemark.trim().length > SIDEMARK_MAX_LENGTH || undefined}
                onChange={(e) => setSidemarkDraft(e.target.value)}
                onBlur={() => writeHeader('sidemark', sidemark.trim())}
                className={`${FIELD} font-mono`}
              />
            </label>
          )}
          <label className="flex flex-col">
            <span className={LABEL}>Requested ship</span>
            <input
              type="date"
              value={requestedShipOn}
              disabled={locked}
              onChange={(e) => {
                setRequestedShipOn(e.target.value);
                writeHeader('requestedShipOn', e.target.value);
              }}
              className={FIELD}
            />
          </label>
          {!isPatinaMaker && (
            <div className="sm:col-span-2">
              <ShipToChoice
                {...shipToAddresses}
                locations={com.orderLocations(shipToAddresses.locations)}
                value={shipToSelection}
                onChange={(next) => {
                  setShipToSelection(next);
                  if (shipToInvalid) {
                    setShipToInvalid(false);
                    setError(null);
                  }
                }}
                disabled={locked}
                invalid={shipToInvalid}
              />
              {com.isFabricPaper && (
                <p data-order-paper-com-ship-to className="doc-type-meta mt-1 text-[var(--color-quiet-ink)]">
                  COM fabric ships to the workroom{com.workroomName ? `: ${com.workroomName}` : ''}.
                </p>
              )}
              {shipToOnFile && (
                <p className="doc-type-meta mt-1 text-[var(--color-quiet-ink)]">
                  On the PO now: {shipToOnFile}
                </p>
              )}
              {!hasShipTo && shipToAddresses.locations.length === 0 && (
                <p className="doc-type-meta mt-1 text-[var(--color-quiet-ink)]">
                  No receiver on file — pick the site or add one.
                </p>
              )}
            </div>
          )}
          <label className="flex flex-col">
            <span className={LABEL}>Bill to</span>
            <input
              type="text"
              value={billTo}
              disabled={locked}
              placeholder={studioName ?? 'The studio'}
              onChange={(e) => setBillTo(e.target.value)}
              onBlur={() => writeHeader('billTo', billTo.trim())}
              className={FIELD}
            />
          </label>
          {!isPatinaMaker && (
            <label className="flex flex-col">
              <span className={LABEL}>Freight</span>
              <select
                value={freightTerms}
                disabled={locked}
                onChange={(e) => {
                  const next = e.target.value as FreightTerms | '';
                  setFreightTerms(next);
                  writeHeader('freightTerms', next);
                }}
                className={FIELD}
              >
                <option value="">Not set</option>
                {FREIGHT_TERMS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        {/* The lines. Trade cost is read-only here: edit it on the line. */}
        <section aria-label="Lines" className={`pt-4 ${RULE}`}>
          <ol className="flex flex-col gap-2">
            {quotedCents.size > 0 && (
              <li aria-hidden className="flex items-baseline justify-end gap-3">
                <span className={`${LABEL} w-20 shrink-0 text-right`}>Quoted</span>
                <span className={`${LABEL} w-20 shrink-0 text-right`}>Trade</span>
              </li>
            )}
            {ffeItems.map((item, idx) => (
              <li key={item.id} data-order-paper-line className="flex items-baseline gap-3">
                <span className={`${LABEL} w-5 shrink-0`}>{idx + 1}</span>
                <span className="min-w-0 flex-1 doc-type-body text-[var(--color-charcoal)]">
                  {item.name}
                  {item.room && (
                    <span className="text-[var(--color-quiet-ink)]"> · {item.room}</span>
                  )}
                  {/* COM (C-24, SQ-424): the pair's fact, and a fabric line's CFA warning. */}
                  <ComLineNote com={com} itemId={item.id} />
                </span>
                <span className="doc-type-meta shrink-0 text-[var(--color-quiet-ink)]">
                  ×{item.quantity ?? 1}
                </span>
                {quotedCents.size > 0 && (
                  <span
                    data-order-paper-quoted
                    aria-label="Quoted"
                    className="doc-type-meta w-20 shrink-0 text-right tabular-nums text-[var(--color-quiet-ink)]"
                  >
                    {quotedCents.has(item.id)
                      ? formatTradeMoney(quotedCents.get(item.id)!, rowCurrency(item))
                      : '—'}
                  </span>
                )}
                <span
                  className={`doc-type-body shrink-0 tabular-nums text-[var(--color-charcoal)] ${
                    quotedCents.size > 0 ? 'w-20 text-right' : ''
                  }`}
                >
                  {formatTradeMoney(itemTradeCents(item), rowCurrency(item))}
                </span>
              </li>
            ))}
          </ol>
          {/* Riders (C-26, P2-5): the PO's cost lines, above the total. Patina carries a maker-lane PO's freight. */}
          {!isPatinaMaker && (
            <PoRiders
              purchaseOrderId={poId}
              projectId={project.id}
              vendor={vendor}
              disabled={busy !== null}
              receiptAnchor={{ kind: 'section', sectionKey: 'project' }}
            />
          )}
          <p className="mt-3 flex justify-between border-t border-[var(--color-pearl)] pt-2 doc-type-body text-[var(--color-charcoal)]">
            <span className={LABEL}>Total</span>
            <span data-order-paper-total className="tabular-nums">
              {amount}
            </span>
          </p>
          <p data-order-paper-coverage className="doc-type-meta mt-2 text-[var(--color-quiet-ink)]">
            {coverageFact}
          </p>
        </section>

        {/* Terms and the note to the vendor. */}
        <section aria-label="Terms" className={`flex flex-col gap-3 pt-4 ${RULE}`}>
          {isPatinaMaker ? (
            <p className="doc-type-body text-[var(--color-charcoal)]">
              <span className={LABEL}>Terms</span> · paid in full at checkout
            </p>
          ) : existing ? (
            <p className="doc-type-body text-[var(--color-charcoal)]">
              <span className={LABEL}>Terms</span> · {paymentPatternLabel(existing.payment_pattern)}
            </p>
          ) : (
            <TermsFields
              vendor={vendor}
              accountPattern={accountPattern}
              paymentPattern={paymentPattern}
              onPaymentPatternChange={setPickedPattern}
              totalCents={totalCents}
              depositCents={depositCents}
              depositDueDate={depositDueDate}
              onDepositDueDateChange={setDepositDueDate}
              milestones={milestones}
              onMilestonesChange={setMilestones}
              disabled={locked}
            />
          )}
          <label className="flex flex-col">
            <span className={LABEL}>Note to {vendor.name}</span>
            <textarea
              value={vendorNote}
              disabled={locked}
              rows={2}
              onChange={(e) => setVendorNote(e.target.value)}
              onBlur={() => writeHeader('vendorNote', vendorNote.trim())}
              className={`${FIELD} resize-y`}
            />
          </label>
        </section>

        {blockedItems.length > 0 && !record && (
          <BlockedByDecisionInline blockedItems={blockedItems} projectId={project.id} />
        )}

        {error && (
          <p
            role="alert"
            className="border-l-2 border-[var(--color-terracotta-ink)] pl-3 doc-type-body text-[var(--color-charcoal)]"
          >
            {error}
          </p>
        )}

        {/* The consequence, then the one act — or the act's record. */}
        <footer className={`flex flex-col gap-3 pt-4 ${RULE}`}>
          {record ? (
            <PaperRecordLine
              record={record}
              vendorName={vendor.name}
              checkoutError={checkoutError}
            />
          ) : (
            <p data-order-paper-consequence className="doc-type-body text-[var(--color-charcoal)]">
              {consequence}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!record &&
              (isPatinaMaker ? (
                <DocumentAction
                  actionKey="order-paper-order-from-patina"
                  surfaceKey="order-paper"
                  regionKey="terminal"
                  variant="terminal"
                  loading={busy === 'order'}
                  disabled={busy !== null}
                  onClick={orderFromPatina}
                >
                  {label}
                </DocumentAction>
              ) : (
                <DocumentAction
                  actionKey="order-paper-send"
                  surfaceKey="order-paper"
                  regionKey="terminal"
                  variant="terminal"
                  loading={busy === 'send'}
                  disabled={busy !== null || terminalHeld}
                  held={terminalHeld}
                  aria-describedby={terminalHeld ? 'order-paper-held-reason' : undefined}
                  onHeldActivate={() => {
                    setShipToInvalid(true);
                    setError(SHIP_TO_REQUIRED_MESSAGE);
                  }}
                  onClick={() => send('send')}
                >
                  {label}
                </DocumentAction>
              ))}
            {!record && terminalHeld && (
              <span id="order-paper-held-reason" className="doc-type-meta text-[var(--color-quiet-ink)]">
                choose where this ships
              </span>
            )}
            {deferredPaymentId && (
              <DocumentAction
                actionKey="order-paper-pay-now"
                surfaceKey="order-paper"
                regionKey="terminal"
                variant="primary"
                loading={payNowPending}
                onClick={payNow}
              >
                Pay now · {amount}
              </DocumentAction>
            )}
            {record && (
              <DocumentAction
                actionKey="order-paper-next"
                surfaceKey="order-paper"
                regionKey="terminal"
                variant="primary"
                disabled={payNowPending}
                onClick={queue ? queue.onNext : onClose}
              >
                {queue && queuedBehind
                  ? `Next paper · ${queue.index + 2} of ${queue.count} →`
                  : 'Done'}
              </DocumentAction>
            )}
          </div>

          {!record && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {!isPatinaMaker && (
                <DocumentAction
                  actionKey="order-paper-save"
                  surfaceKey="order-paper"
                  regionKey="secondary"
                  variant="secondary"
                  loading={busy === 'save'}
                  disabled={busy !== null}
                  onClick={() => void saveDraft()}
                >
                  Save, don&rsquo;t send
                </DocumentAction>
              )}
              {!isPatinaMaker && (
                <DocumentAction
                  actionKey="order-paper-mark-sent"
                  surfaceKey="order-paper"
                  regionKey="secondary"
                  variant="tertiary"
                  loading={busy === 'mark'}
                  disabled={busy !== null}
                  onClick={() => send('mark_sent')}
                >
                  Released by phone or portal — mark as sent
                </DocumentAction>
              )}
              {!isPatinaMaker && uncovered.length > 0 && (
                <DocumentAction
                  actionKey="order-paper-bill-client-first"
                  surfaceKey="order-paper"
                  regionKey="secondary"
                  variant="tertiary"
                  disabled={busy !== null}
                  onClick={billClientFirst}
                >
                  Bill the client first →
                </DocumentAction>
              )}
              {poId && !isPatinaMaker && (
                <DocumentAction
                  actionKey="order-paper-see-pdf"
                  surfaceKey="order-paper"
                  regionKey="secondary"
                  variant="tertiary"
                  disabled={busy !== null}
                  onClick={() => setPreviewOpen(true)}
                >
                  See the PDF
                </DocumentAction>
              )}
              {queue && (
                <DocumentAction
                  actionKey="order-paper-skip"
                  surfaceKey="order-paper"
                  regionKey="secondary"
                  variant="tertiary"
                  disabled={busy !== null}
                  onClick={queue.onNext}
                >
                  Skip this paper
                </DocumentAction>
              )}
            </div>
          )}
        </footer>
      </div>

      {poId &&
        typeof document !== 'undefined' &&
        createPortal(
          <PoPreview
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            purchaseOrderId={poId}
            vendorName={vendor.name}
            vendorEmailHint={recipient}
            onSent={(at) => setRecord({ kind: 'sent', at, recipient })}
          />,
          document.body,
        )}
    </DocSheet>
  );
}

function PaperRecordLine({
  record,
  vendorName,
  checkoutError,
}: {
  record: PaperRecord;
  vendorName: string;
  checkoutError: string | null;
}) {
  const day = fmtDay(record.at);
  const text =
    record.kind === 'sent'
      ? `Sent${record.recipient ? ` to ${record.recipient}` : ` to ${vendorName}`} · ${day}`
      : record.kind === 'marked'
        ? `Released by phone or portal · ${day}`
        : record.kind === 'saved'
          ? `Saved as a draft · ${day}. Nothing went to ${vendorName}.`
          : checkoutError
            ? `Ordered from Patina · ${day}. Payment wasn't started — ${checkoutError} Pay any time from Orders → Vendors.`
            : `Ordered from Patina · ${day}. Pay now, or any time from Orders → Vendors.`;
  return (
    <p data-order-paper-record className="doc-type-body text-[var(--color-charcoal)]">
      {text}
    </p>
  );
}

function TermsFields({
  vendor,
  accountPattern,
  paymentPattern,
  onPaymentPatternChange,
  totalCents,
  depositCents,
  depositDueDate,
  onDepositDueDateChange,
  milestones,
  onMilestonesChange,
  disabled,
}: {
  vendor: OrderPaperVendor;
  accountPattern: PaymentPattern | null;
  paymentPattern: PaymentPattern;
  onPaymentPatternChange: (v: PaymentPattern) => void;
  totalCents: number;
  depositCents: number | null;
  depositDueDate: string;
  onDepositDueDateChange: (v: string) => void;
  milestones: MilestoneRow[];
  onMilestonesChange: (next: MilestoneRow[]) => void;
  disabled: boolean;
}) {
  const split = paymentPattern === 'fifty_fifty' || paymentPattern === 'thirty_seventy';
  const update = (key: string, patch: Partial<MilestoneRow>) =>
    onMilestonesChange(milestones.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col">
        <span className={LABEL}>Terms</span>
        <select
          value={paymentPattern}
          disabled={disabled}
          onChange={(e) => onPaymentPatternChange(e.target.value as PaymentPattern)}
          className={FIELD}
        >
          {PAYMENT_PATTERN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {termsNote(o.value, accountPattern, vendor.default_payment_terms)}
            </option>
          ))}
        </select>
      </label>
      {(split || paymentPattern === 'full_upfront') && depositCents != null && (
        <p className="flex flex-wrap items-baseline gap-x-2 doc-type-body text-[var(--color-charcoal)]">
          <span>
            {split ? 'Deposit' : 'Payment'} {formatDollars(depositCents)} due
          </span>
          <input
            type="date"
            aria-label={split ? 'Deposit due' : 'Payment due'}
            value={depositDueDate}
            disabled={disabled}
            onChange={(e) => onDepositDueDateChange(e.target.value)}
            className={FIELD}
          />
          {split && (
            <span>
              · balance {formatDollars(Math.max(totalCents - depositCents, 0))} before it ships
            </span>
          )}
        </p>
      )}
      {paymentPattern === 'net_30' && (
        <p className="doc-type-body text-[var(--color-charcoal)]">
          Full balance due 30 days after delivery.
        </p>
      )}
      {paymentPattern === 'custom_milestones' && (
        <div className="flex flex-col gap-2">
          {milestones.map((m, idx) => (
            <div key={m.key} className="grid grid-cols-[1fr_7rem_9rem_auto] items-end gap-2">
              <input
                type="text"
                aria-label={`Milestone ${idx + 1} label`}
                placeholder="Label"
                value={m.label}
                disabled={disabled}
                onChange={(e) => update(m.key, { label: e.target.value })}
                className={FIELD}
              />
              <input
                type="text"
                inputMode="decimal"
                aria-label={`Milestone ${idx + 1} amount`}
                placeholder="Amount"
                value={m.amountInput}
                disabled={disabled}
                onChange={(e) => update(m.key, { amountInput: e.target.value })}
                className={FIELD}
              />
              <input
                type="date"
                aria-label={`Milestone ${idx + 1} due`}
                value={m.dueDate}
                disabled={disabled}
                onChange={(e) => update(m.key, { dueDate: e.target.value })}
                className={FIELD}
              />
              {milestones.length > 2 ? (
                <DocumentAction
                  actionKey="order-paper-remove-milestone"
                  surfaceKey="order-paper"
                  regionKey="terms"
                  variant="tertiary"
                  disabled={disabled}
                  aria-label={`Remove milestone ${idx + 1}`}
                  onClick={() => onMilestonesChange(milestones.filter((x) => x.key !== m.key))}
                >
                  remove
                </DocumentAction>
              ) : (
                <span />
              )}
            </div>
          ))}
          {milestones.length < 4 && (
            <DocumentAction
              actionKey="order-paper-add-milestone"
              surfaceKey="order-paper"
              regionKey="terms"
              variant="tertiary"
              disabled={disabled}
              onClick={() => onMilestonesChange([...milestones, freshMilestone()])}
            >
              Add a milestone
            </DocumentAction>
          )}
        </div>
      )}
    </div>
  );
}
