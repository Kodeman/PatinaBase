'use client';

/**
 * FF&E line unfold (spec §6, §13 Slice 4): PO detail · movement · receiving,
 * with the existing Order Assistant and LogInspectionDrawer mounted in
 * place (both are portal-local shadow-free panels — R3-clean). Prototype
 * v0.4 .line-detail recipe: clay left border, three-column grid.
 *
 * The Authorized Schedule (Act III, slide 9): on a commercial job the unfold
 * carries the purchase-order sentence — the one thing authorization buys a
 * studio, because the signed row and the schedule row are now one row. A line
 * that has been released is softly locked: the price the client signed stands,
 * and changing it means voiding the instrument and superseding it.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useFindOrCreateVendor,
  useProductPrices,
  useRecordFfeInstalled,
  useSetFfeLineCommercials,
  useUpdateDamageClaim,
  useUpdatePurchaseOrderETA,
  useUpdatePurchaseOrderStatus,
  useVendor,
  useVendors,
} from '@patina/supabase';
import { centsToInput, parseDollarsToCents } from '@/lib/currency-ui';
import { OrderAssistant } from '@/components/portal/procurement/order-assistant';
import { LogInspectionDrawer } from '@/components/portal/procurement/log-inspection-drawer';
import { clientVendorEmailHint } from '@/components/portal/procurement/po-send-actions';
import { LogAckInline, PoPreview } from './po-preview';
import { openInvoiceComposer } from './accounts/invoice-overlays';
import { FolioStrip } from './folio-strip';
import {
  useAssignLineRoom,
  useDocumentRooms,
} from '@/hooks/use-document-rooms';
import { deriveLineStamp } from '@/lib/document/stamp-derivation';
import { deriveProcurementLifecycle } from '@/lib/document/procurement-lifecycle';
import { ProcurementTrail } from './procurement-trail';
import {
  deriveOrderReadiness,
  poGate,
  type LineAuthorization,
} from '@/lib/document/authorization-derivation';
import { fmtDay, fmtUsd, todayYmd } from '@/lib/document/format';
import { DateTextInput } from './date-text-input';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { PieceArtifactPlate } from './piece-artifact-plate';

type FFERow = any;

/** A released line is softly locked — the same sentence everywhere it bites. */
const softLockSentence = (auth: LineAuthorization) =>
  auth.track === 'none'
    ? null
    : `on authorization № ${auth.number} — void & supersede to change`;

function Cell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="mb-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">
        {value}
      </p>
      {sub && <p className="text-[11px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

/**
 * C-03 (D1-07): the one forward move a PO can record from the line. Delivered
 * is not here — it comes from receiving check-in.
 */
const NEXT_PO_STATUS: Record<
  string,
  { to: 'in_production' | 'shipped'; label: string }
> = {
  confirmed: { to: 'in_production', label: 'In production' },
  in_production: { to: 'shipped', label: 'Shipped' },
};

/**
 * The status act's own component, so the mutation mounts only where a move
 * is on offer. The 00184 cascade carries the line (and the balance flip on
 * ship) server-side.
 */
function PoStatusAct({
  poId,
  projectId,
  to,
  label,
  onAdvanced,
}: {
  poId: string;
  projectId: string;
  to: 'in_production' | 'shipped';
  label: string;
  onAdvanced: (to: 'in_production' | 'shipped') => void;
}) {
  const qc = useQueryClient();
  const advance = useUpdatePurchaseOrderStatus();
  const [failed, setFailed] = useState(false);

  const run = () => {
    if (advance.isPending) return;
    setFailed(false);
    advance
      .mutateAsync({ purchaseOrderId: poId, status: to, projectId })
      .then(() => {
        onAdvanced(to);
        void qc.invalidateQueries({ queryKey: ['document-state'] });
      })
      .catch(() => setFailed(true));
  };

  return (
    <div className="mt-1">
      <DocumentAction
        actionKey={`advance-po-${to.replace('_', '-')}`}
        surfaceKey="project"
        regionKey="ffe-movement"
        variant="tertiary"
        loading={advance.isPending}
        loadingLabel="Saving…"
        onClick={run}
      >
        {label}
      </DocumentAction>
      {failed && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          Couldn&rsquo;t save
        </p>
      )}
    </div>
  );
}

/**
 * C-04 (D1-09): a delivered line is marked installed from its unfold. The
 * day defaults to today; the field is there for the install that happened
 * yesterday. Cleared, the server records today.
 */
function InstallAct({
  itemId,
  projectId,
}: {
  itemId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const record = useRecordFfeInstalled({ errorSurface: 'inline' });
  const [installedOn, setInstalledOn] = useState<string | null>(() =>
    todayYmd(),
  );
  const [failed, setFailed] = useState(false);

  const run = () => {
    if (record.isPending) return;
    setFailed(false);
    record
      .mutateAsync({
        projectId,
        itemIds: [itemId],
        installedOn: installedOn ?? undefined,
      })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['document-state'] });
      })
      .catch(() => setFailed(true));
  };

  return (
    <div className="mb-2.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          Installed on
        </span>
        <DateTextInput
          value={installedOn}
          ariaLabel="Install date"
          disabled={record.isPending}
          onChange={setInstalledOn}
          className="bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none"
        />
        <DocumentAction
          actionKey="mark-ffe-line-installed"
          surfaceKey="project"
          regionKey="ffe-install"
          variant="tertiary"
          loading={record.isPending}
          loadingLabel="Saving…"
          onClick={run}
        >
          Mark installed
        </DocumentAction>
      </div>
      {failed && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          Couldn&rsquo;t save
        </p>
      )}
    </div>
  );
}

/**
 * PRC-12 (R84): the Movement cell with the single-PO confirmed-ETA edit —
 * EtaQuickEditDrawer's mutation ported into a quiet inline date field (the
 * PRD W2.4 vision: vendor emails a delay, type the date, done). Saves on a
 * complete date, confirms in a line of text (R51), fails inline (R83).
 */
function MovementCell({
  item,
  po,
  projectId,
}: {
  item: FFERow;
  po: FFERow | null;
  projectId: string;
}) {
  const qc = useQueryClient();
  const updateEta = useUpdatePurchaseOrderETA({ errorSurface: 'inline' });
  // C-03: once a move lands, the next act stands in at once rather than
  // waiting on the refetch; the PO's own status takes over when it arrives.
  const [advancedTo, setAdvancedTo] = useState<string | null>(null);
  useEffect(() => {
    setAdvancedTo(null);
  }, [po?.status]);
  const nextStatus = po ? NEXT_PO_STATUS[advancedTo ?? po.status] : undefined;
  const [eta, setEta] = useState<string>(
    po?.confirmed_eta ? po.confirmed_eta.slice(0, 10) : '',
  );
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Follow external ETA changes (same-truck batch, ack coalesce) into the field.
  useEffect(() => {
    setEta(po?.confirmed_eta ? po.confirmed_eta.slice(0, 10) : '');
  }, [po?.confirmed_eta]);

  const save = (value: string) => {
    // <input type="date"> yields '' until a complete date exists — the same
    // canSave guard the drawer used.
    if (!po || !/^\d{4}-\d{2}-\d{2}$/.test(value) || updateEta.isPending)
      return;
    setError(null);
    setSaved(null);
    updateEta
      .mutateAsync({ purchaseOrderId: po.id, newEta: value })
      .then(() => {
        setSaved(value);
        // One act, many surfaces (§5): line cell, Orders row, Week, Desk.
        void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
        void qc.invalidateQueries({ queryKey: ['document-state'] });
      })
      .catch((e: Error) =>
        setError(e.message || 'The ETA could not be saved.'),
      );
  };

  return (
    <div>
      <p className="mb-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        Movement
      </p>
      <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">
        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
      </p>
      {po && nextStatus && (
        <PoStatusAct
          key={nextStatus.to}
          poId={po.id}
          projectId={projectId}
          to={nextStatus.to}
          label={nextStatus.label}
          onAdvanced={setAdvancedTo}
        />
      )}
      {po ? (
        <>
          <label className="flex items-baseline gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              arrives
            </span>
            <DateTextInput
              value={eta || null}
              ariaLabel="Confirmed ETA"
              disabled={updateEta.isPending}
              onChange={(value) => {
                const next = value ?? '';
                setEta(next);
                save(next);
              }}
              className="bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none"
            />
          </label>
          {!eta && po.status === 'shipped' && !error && (
            <p className="text-[11px] text-[var(--text-muted)]">
              shipped — no scheduled arrival
            </p>
          )}
          {saved && !error && (
            // R51: the quiet confirmation.
            <p className="text-[11px] text-[var(--text-muted)]">
              eta updated — arrives ~{fmtDay(saved)}
            </p>
          )}
          {error && (
            // R83: inline at the act — the reason and a retry.
            <div role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
              <p>{error}</p>
              <DocumentAction
                actionKey="retry-save-ffe-eta"
                surfaceKey="project"
                regionKey="ffe-eta-error"
                variant="primary"
                onClick={() => save(eta)}
                className="mt-2"
              >
                Try again
              </DocumentAction>
            </div>
          )}
        </>
      ) : (
        item.eta && (
          <p className="text-[11px] text-[var(--text-muted)]">
            eta ~{fmtDay(item.eta)}
          </p>
        )
      )}
    </div>
  );
}

const LABEL_CLS =
  'font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]';
const FIELD_CLS =
  'bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60';

type MakerOption = { kind: 'vendor'; id: string; name: string } | { kind: 'add'; name: string };

/**
 * C-05: the maker search, mounted only while choosing so the vendors read
 * runs only then. Offers "Add" when no maker of that name exists yet; the add
 * goes through the People maker path's find-or-create (R78 / PRC-03).
 */
function MakerSearch({
  disabled,
  autoFocus,
  onChoose,
  onCancel,
}: {
  disabled: boolean;
  autoFocus: boolean;
  onChoose: (option: MakerOption) => void;
  onCancel?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  const listId = `line-maker-${useId()}`;
  const term = search.trim();
  const { data } = useVendors(term ? { search: term } : undefined, {
    page: 1,
    pageSize: 8,
  });
  const vendors = ((data as { data?: { id: string; name: string }[] } | undefined)
    ?.data ?? []) as { id: string; name: string }[];
  const options: MakerOption[] = term
    ? [
        ...vendors.map((v) => ({ kind: 'vendor' as const, id: v.id, name: v.name })),
        ...(vendors.some((v) => v.name.trim().toLowerCase() === term.toLowerCase())
          ? []
          : [{ kind: 'add' as const, name: term }]),
      ]
    : [];

  const choose = (option: MakerOption | undefined) => {
    if (!option) return;
    setSearch('');
    setActive(0);
    onChoose(option);
  };

  return (
    <div className="relative min-w-[12rem] flex-1">
      <input
        role="combobox"
        aria-label="Maker"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
        ref={inputRef}
        value={search}
        placeholder="Search makers…"
        disabled={disabled}
        onChange={(e) => {
          setSearch(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setSearch('');
            onCancel?.();
          } else if (e.key === 'ArrowDown' && options.length) {
            e.preventDefault();
            setActive((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === 'ArrowUp' && options.length) {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter' && options.length) {
            e.preventDefault();
            choose(options[active]);
          }
        }}
        className={`w-full ${FIELD_CLS}`}
      />
      {options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Makers"
          className="absolute z-10 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[6px] border border-[var(--color-pearl)] bg-white py-1"
        >
          {options.map((option, i) => (
            <li
              key={option.kind === 'vendor' ? option.id : 'add'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              className={`cursor-pointer px-3 py-1.5 text-[11.5px] text-[var(--color-charcoal)] hover:bg-[var(--doc-sheet-2)] ${
                i === active ? 'bg-[var(--doc-sheet-2)]' : ''
              }`}
            >
              {option.kind === 'vendor' ? option.name : `Add a maker: “${option.name}”`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * C-05 (S5): the buy's commercials — who makes it and what it costs the
 * studio. Editable only while the line is on no purchase order; after that it
 * changes through the PO. The client price and markup are never shown or
 * edited here (R1, R5, R8) — `set_project_ffe_line_commercials` refuses them.
 */
function LineCommercials({
  item,
  po,
  projectId,
  canEdit,
}: {
  item: FFERow;
  po: FFERow | null;
  projectId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const commercials = useSetFfeLineCommercials({ errorSurface: 'inline' });
  const findOrCreate = useFindOrCreateVendor({ errorSurface: 'inline' });
  // The id, not the embed: a query shape without the PO join (or a partial
  // cache) leaves `po` null on a line that is already on a purchase order.
  const onPo = !!item.purchase_order_id;
  const editable = canEdit && !onPo;
  const pending = commercials.isPending || findOrCreate.isPending;

  const storedTrade: number | null = item.trade_price_cents ?? null;
  const [trade, setTrade] = useState(() => centsToInput(storedTrade));
  useEffect(() => {
    setTrade(centsToInput(storedTrade));
  }, [storedTrade]);
  // The joined vendor name lands with the refetch; hold the pick meanwhile.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // §2.4: a line off the catalog (or a product with no trade price) was
  // placed with retail written as trade. Warn, never block (R-DI4 pending).
  const { data: productPrices } = useProductPrices(
    editable ? [item.product_id] : [],
  );
  const offCatalog = !item.product_id
    ? true
    : productPrices
      ? productPrices.get(item.product_id)?.price_trade == null
      : false;
  const retail: number | null = item.unit_price_cents ?? null;
  const tradeMatchesRetail =
    editable &&
    offCatalog &&
    storedTrade != null &&
    retail != null &&
    retail > 0 &&
    storedTrade === retail;

  const save = (request: { vendorId?: string; tradePriceCents?: number }) =>
    commercials
      .mutateAsync({ itemId: item.id, projectId, ...request })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['document-state'] });
      });

  const chooseMaker = (option: MakerOption) => {
    if (pending) return;
    setError(null);
    const resolve =
      option.kind === 'vendor'
        ? Promise.resolve({ id: option.id, name: option.name })
        : findOrCreate
            .mutateAsync({ name: option.name })
            .then((r) => ({ id: r.vendorId, name: r.vendor.name }));
    resolve
      .then((vendor) => {
        if (vendor.id === item.vendor_id) {
          setChanging(false);
          return;
        }
        return save({ vendorId: vendor.id }).then(() => {
          setPicked(vendor);
          setChanging(false);
        });
      })
      .catch((e: Error) => setError(e.message || 'The maker could not be saved.'));
  };

  const commitTrade = () => {
    if (pending) return;
    const raw = trade.replace(/[$,\s]/g, '');
    if (!raw) {
      // The RPC records a cost; it does not clear one.
      setTrade(centsToInput(storedTrade));
      return;
    }
    const cents = parseDollarsToCents(raw);
    if (cents === null) {
      setError('Enter the trade cost in dollars, e.g. 1200 or 1200.50.');
      return;
    }
    if (cents === storedTrade) return;
    setError(null);
    save({ tradePriceCents: cents }).catch((e: Error) =>
      setError(e.message || 'The trade cost could not be saved.'),
    );
  };

  const makerName =
    picked && picked.id === item.vendor_id ? picked.name : item.vendor_name;
  const poLabel = onPo
    ? (po?.po_number ?? po?.vendor_po_number ?? po?.sidemark ?? 'a purchase order')
    : null;

  if (!editable) {
    return (
      <div data-testid="line-commercials" className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-[11px] text-[var(--color-charcoal)]">
          <span className={LABEL_CLS}>Maker</span> {makerName || 'Not recorded'}
        </p>
        <p className="text-[11px] text-[var(--color-charcoal)]">
          <span className={LABEL_CLS}>Trade cost</span>{' '}
          {storedTrade != null ? fmtUsd(storedTrade) : 'Not recorded'}
        </p>
        {poLabel && (
          <p className={LABEL_CLS}>On {poLabel}</p>
        )}
      </div>
    );
  }

  const searching = changing || !item.vendor_id;

  return (
    <div data-testid="line-commercials" className="mb-2.5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <div className="flex min-w-[14rem] flex-1 items-baseline gap-2">
          <span className={LABEL_CLS}>Maker</span>
          {searching ? (
            <MakerSearch
              disabled={pending}
              autoFocus={changing}
              onChoose={chooseMaker}
              onCancel={item.vendor_id ? () => setChanging(false) : undefined}
            />
          ) : (
            <>
              <span className="text-[11.5px] text-[var(--color-charcoal)]">
                {makerName || 'Selected'}
              </span>
              <DocumentAction
                actionKey="change-ffe-line-maker"
                surfaceKey="project"
                regionKey="ffe-commercials"
                variant="tertiary"
                disabled={pending}
                onClick={() => setChanging(true)}
              >
                Change
              </DocumentAction>
            </>
          )}
        </div>
        <label className="flex items-baseline gap-2">
          <span className={LABEL_CLS}>Trade cost</span>
          <span className="text-[11px] text-[var(--text-muted)]">$</span>
          <input
            aria-label="Trade cost"
            inputMode="decimal"
            value={trade}
            placeholder="0"
            disabled={pending}
            onChange={(e) => setTrade(e.target.value)}
            onBlur={commitTrade}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTrade();
              }
            }}
            className={`w-24 ${FIELD_CLS}`}
          />
        </label>
      </div>
      {pending && (
        <p aria-live="polite" className="text-[11px] text-[var(--text-muted)]">
          Saving…
        </p>
      )}
      {tradeMatchesRetail && (
        <p className="text-[11px] text-[var(--color-charcoal)]">
          Trade cost matches retail. Confirm the studio&rsquo;s cost with the maker.
        </p>
      )}
      {error && !pending && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * PRC-11 (R84): the claim lifecycle acts on the line's open item-grain
 * claims — DamageClaimDrawer's state machine (drafted → vendor_notified →
 * resolved, forward only, useUpdateDamageClaim) ported into the unfold's
 * quiet grammar. Creation stays with the inspection drawer's auto-draft;
 * this is the walk forward.
 */
function ClaimActs({ claims }: { claims: { id: string; state: string }[] }) {
  const qc = useQueryClient();
  const updateClaim = useUpdateDamageClaim({ errorSurface: 'inline' });
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, state: 'vendor_notified' | 'resolved') => {
    if (updateClaim.isPending) return;
    setError(null);
    try {
      await updateClaim.mutateAsync({
        id,
        state,
        ...(state === 'resolved' && note.trim()
          ? { resolution_notes: note.trim() }
          : {}),
      });
      // One act, many surfaces (§5): line stamp, Receiving book, Desk need.
      void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      setConfirmed(
        state === 'vendor_notified'
          ? 'Vendor notified — the claim is with them now.'
          : 'Resolved — folded into the record.',
      );
      setResolvingId(null);
      setNote('');
    } catch (e) {
      setError((e as Error).message || 'The claim could not be updated.');
    }
  };

  return (
    <div className="mb-2.5 border-l-[2px] border-[var(--color-terracotta)] pl-2.5">
      {claims.map((c) => (
        <div key={c.id} className="py-0.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
              Claim ·{' '}
              {c.state === 'vendor_notified' ? 'vendor notified' : 'drafted'}
            </span>
            {c.state === 'drafted' && (
              <DocumentAction
                actionKey="notify-vendor-of-ffe-claim"
                surfaceKey="project"
                regionKey="ffe-claim"
                variant="primary"
                disabled={updateClaim.isPending}
                loading={updateClaim.isPending}
                loadingLabel="Notifying…"
                onClick={() => void run(c.id, 'vendor_notified')}
              >
                Notify vendor
              </DocumentAction>
            )}
            {c.state === 'vendor_notified' && (
              <DocumentAction
                actionKey="open-resolve-ffe-claim"
                surfaceKey="project"
                regionKey="ffe-claim"
                variant="secondary"
                onClick={() =>
                  setResolvingId((cur) => (cur === c.id ? null : c.id))
                }
                aria-expanded={resolvingId === c.id}
              >
                Mark resolved {resolvingId === c.id ? '↑' : '↓'}
              </DocumentAction>
            )}
          </div>
          {resolvingId === c.id && (
            <div className="mt-1 flex items-end gap-2">
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="How was it resolved? (replacement shipped, credit issued…)"
                aria-label="Resolution notes"
                className="flex-1 resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)]"
              />
              <DocumentAction
                actionKey="resolve-ffe-claim"
                surfaceKey="project"
                regionKey="ffe-claim-resolution"
                variant="primary"
                disabled={updateClaim.isPending}
                loading={updateClaim.isPending}
                loadingLabel="Resolving…"
                onClick={() => void run(c.id, 'resolved')}
              >
                Mark resolved
              </DocumentAction>
            </div>
          )}
        </div>
      ))}
      {confirmed && !error && (
        // R51: the quiet confirmation.
        <p className="text-[11px] text-[var(--text-muted)]">{confirmed}</p>
      )}
      {error && (
        // R83: inline at the act.
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function LineUnfold({
  item,
  projectId,
  projectName,
  onAddNote,
  onFold,
  auth = { track: 'none' },
  isCommercialOrigin = false,
  onIncludeInRelease,
  canEditSelection = true,
  showArtifactPlate = false,
}: {
  item: FFERow;
  projectId: string;
  projectName: string;
  onAddNote: (lineId: string) => void;
  onFold: () => void;
  /** This line's second stamp — which instrument holds it, if any. */
  auth?: LineAuthorization;
  /** A project with an executed agreement behind it. */
  isCommercialOrigin?: boolean;
  /** Enter the release ceremony with this line already ticked. */
  onIncludeInRelease?: () => void;
  canEditSelection?: boolean;
  showArtifactPlate?: boolean;
}) {
  const stamp = deriveLineStamp(item);
  const po = item.purchase_order ?? null;
  // R7: one derivation, read by the trail here and by the orders book.
  const lifecycle = useMemo(() => deriveProcurementLifecycle(item), [item]);
  // The trail belongs to GOODS. A trade scope runs its own journey (Act IV) —
  // tile does not ship, acknowledge, or arrive — so a fifteen-step goods trail
  // on a trade line would be fifteen rows of nonsense. And a furnishings line
  // with nothing ordered yet has no lifecycle to read: rather than an empty
  // scaffold implying the work is merely pending, the trail simply is not
  // there until an order or an evidenced step gives it something to say.
  const isTradeLine =
    Boolean(item.trade_scope_document_id) || stamp.kind.startsWith('trade_');
  const showTrail =
    !isTradeLine &&
    (Boolean(po) || lifecycle.steps.some((s) => s.state !== 'future'));
  const vendorId: string = item.vendor_id ?? po?.vendor_id ?? '';
  const { data: vendor } = useVendor(vendorId) as { data: FFERow | undefined };

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // R25: lines assign to rooms from the unfold.
  const { data: rooms } = useDocumentRooms(projectId);
  const assignRoom = useAssignLineRoom(projectId);

  // On a commercial job the purchase order waits on the instrument; the
  // strip's sentence says so. Whether Order is offered is the one readiness
  // rule, which mirrors what the database will accept.
  const gate = poGate(item, auth, isCommercialOrigin);
  const readiness = deriveOrderReadiness(item, {
    isCommercialOrigin,
    lineAuth: auth,
  });
  const softLock = softLockSentence(
    auth.track === 'awaiting' || auth.track === 'authorized'
      ? auth
      : { track: 'none' },
  );
  const delta =
    auth.track === 'authorized' && auth.deltaCents !== null
      ? `authorized ${fmtUsd(auth.signedLineTotalCents)} · now ${fmtUsd(
          auth.signedLineTotalCents + auth.deltaCents,
        )}`
      : null;
  const inspectable =
    Boolean(po) && (item.status === 'shipped' || item.status === 'delivered');
  // R18: sending one PO while working its line is engagement work — the
  // unfold offers Send for drafted, never-sent POs only.
  const sendable = Boolean(po) && po.status === 'draft' && !po.sent_at;

  const openClaims = (item.item_claims ?? []).filter(
    (c: { state: string }) =>
      c.state === 'drafted' || c.state === 'vendor_notified',
  );
  const receivingValue =
    stamp.kind === 'damaged'
      ? `Open claim${openClaims.length > 1 ? 's' : ''} · ${openClaims[0]?.state === 'vendor_notified' ? 'vendor notified' : 'drafted'}`
      : stamp.kind === 'received'
        ? `${item.received_quantity ?? 0} of ${item.quantity} inspected`
        : stamp.kind === 'delivered'
          ? 'Awaiting inspection'
          : '—';

  return (
    <div className="mb-2 mt-1 rounded-r-[5px] border-l-[3px] border-[var(--color-clay)] bg-[rgba(196,165,123,0.05)] px-4 py-3.5">
      {showArtifactPlate && !isTradeLine && <PieceArtifactPlate item={item} />}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div data-testid="line-po-cell">
          <Cell
            label="Purchase order"
            value={
              po
                ? (po.po_number ??
                  po.vendor_po_number ??
                  po.sidemark ??
                  'PO drafted')
                : 'Not yet ordered'
            }
            sub={
              po
                ? [
                    // R18: the cell narrates the send lifecycle.
                    po.sent_at
                      ? `sent to vendor ${fmtDay(po.sent_at)}`
                      : 'not yet sent',
                    po.sent_at
                      ? po.acknowledged_at
                        ? 'acknowledged'
                        : 'awaiting acknowledgment'
                      : null,
                    po.payment_pattern
                      ? po.payment_pattern.replace(/_/g, ' ')
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : (item.vendor_name ?? undefined)
            }
          />
          {/* C-10: the vendor phoned or emailed — log the acknowledgment on
              the line itself (the Orders ledger's canAck predicate). */}
          {po &&
            po.sent_at &&
            !po.acknowledged_at &&
            !po.is_patina_catalog &&
            po.status !== 'cancelled' && (
              <div className="mt-2">
                <LogAckInline
                  purchaseOrderId={po.id}
                  vendorPoNumber={po.vendor_po_number}
                  confirmedEta={po.confirmed_eta}
                  sentAt={po.sent_at}
                />
              </div>
            )}
        </div>
        {/* PRC-12: the Movement cell carries the confirmed-ETA quick-edit. */}
        <MovementCell item={item} po={po} projectId={projectId} />
        <Cell label="Receiving" value={receivingValue} />
      </div>

      {/* C-05: the buy — maker and trade cost; never the client price. */}
      <LineCommercials
        item={item}
        po={po}
        projectId={projectId}
        canEdit={canEditSelection}
      />

      {/* R7 (M7): the fifteen-step trail — the position, where the cells above
          give the facts. Retires "Ordered" as the line's whole story. */}
      {showTrail && <ProcurementTrail reading={lifecycle} />}

      {/* C-04: the only door to installed — and only from delivered. */}
      {item.status === 'delivered' && (
        <InstallAct itemId={item.id} projectId={projectId} />
      )}

      {/* The authorization strip — what was signed, and what that permits. */}
      {isCommercialOrigin && (
        <div
          data-testid="line-authorization-strip"
          className="mb-2.5 border-l-[2px] border-[var(--color-sage)] pl-2.5"
        >
          {auth.track === 'authorized' && (
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              signed price {fmtUsd(auth.signedLineTotalCents)} ·{' '}
              {auth.depositClear ? 'deposit clear' : 'deposit not yet clear'}
            </p>
          )}
          {delta && (
            // The signed price stands; the drift is stated, never silent.
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
              {delta}
            </p>
          )}
          {gate.sentence && (
            <p className="text-[11px] text-[var(--color-charcoal)]">
              {gate.sentence}
            </p>
          )}
          {softLock && (
            <p className="mt-px font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {softLock}
            </p>
          )}
        </div>
      )}

      {/* PRC-11: walk the line's open claims forward — notify · resolve. */}
      {openClaims.length > 0 && (
        <ClaimActs claims={openClaims as { id: string; state: string }[]} />
      )}

      {/* R25: room assignment, in the unfold's quiet grammar. */}
      {canEditSelection && (
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Room
          </span>
          <select
            value={item.assignment_scope === 'room' && item.project_room_id
              ? `room:${item.project_room_id}`
              : item.assignment_scope === 'unassigned'
                ? 'unassigned'
                : 'throughout'}
            disabled={Boolean(softLock)}
            title={softLock ?? undefined}
            onChange={(e) => {
              const value = e.target.value;
              assignRoom.mutate({
                itemId: item.id,
                roomId: value.startsWith('room:') ? value.slice(5) : null,
                assignmentScope: value.startsWith('room:') ? 'room' : value as 'throughout' | 'unassigned',
              });
            }}
            aria-label="Assign to room"
            className="bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none disabled:opacity-60"
          >
            <option value="unassigned">Unsorted</option>
            <option value="throughout">Throughout</option>
            {(rooms ?? []).map((r) => (
              <option key={r.id} value={`room:${r.id}`}>
                {r.name}
              </option>
            ))}
          </select>
          {softLock && (
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {softLock}
            </span>
          )}
        </div>
      )}

      {/* R24: cut sheets and spec PDFs clip to the line. */}
      <FolioStrip
        projectId={projectId}
        anchor={{ kind: 'line', anchorId: item.id }}
      />

      {/* C-11a: not ready reads as what would change it, in place of Order.
          A line already on a PO says so in its cell; trade work never orders. */}
      {!readiness.ready && !po && !isTradeLine && (
        <ul
          data-testid="line-order-readiness"
          aria-label="Before this can be ordered"
          className="mb-2 text-[11px] text-[var(--text-muted)]"
        >
          {readiness.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {/* R-PB1: a consequence sentence above the act, never a block. */}
      {readiness.ready &&
        readiness.warnings.map((warning) => (
          <p
            key={warning}
            className="mb-2 text-[11px] text-[var(--color-charcoal)]"
          >
            {warning}
          </p>
        ))}

      <DocumentActionGroup surfaceKey="project" regionKey="ffe-line-actions">
        {readiness.ready && (
          <DocumentAction
            actionKey="order-ffe-line"
            variant={sendable || inspectable ? 'secondary' : 'primary'}
            disabled={!vendor}
            title={vendor ? undefined : 'Loading the maker'}
            onClick={() => setAssistantOpen(true)}
          >
            Order with Assistant
          </DocumentAction>
        )}
        {sendable && (
          <DocumentAction
            actionKey="send-ffe-line-to-vendor"
            variant="primary"
            onClick={() => setPreviewOpen(true)}
          >
            Send to vendor
          </DocumentAction>
        )}
        {inspectable && (
          <DocumentAction
            actionKey="inspect-ffe-delivery"
            variant={sendable ? 'secondary' : 'primary'}
            onClick={() => setInspectionOpen(true)}
          >
            Log inspection
          </DocumentAction>
        )}
        {/* R76 — bill this line: the composer opens FF&E-prefilled and
            intersects against what's still billable (covered lines fall out
            with a quiet notice), so the act needs no coverage gate here. */}
        <DocumentAction
          actionKey="bill-ffe-line"
          variant="secondary"
          onClick={() =>
            openInvoiceComposer({ projectId, initialFfeItemIds: [item.id] })
          }
        >
          Bill
        </DocumentAction>
        {/* Nothing is created here — it opens the ceremony with this line
            already ticked. */}
        {isCommercialOrigin && auth.track === 'none' && onIncludeInRelease && (
          <DocumentAction
            actionKey="include-line-in-next-release"
            variant="tertiary"
            onClick={onIncludeInRelease}
          >
            Include in the next release
          </DocumentAction>
        )}
        <DocumentAction
          actionKey="add-ffe-line-note"
          variant="secondary"
          onClick={() => onAddNote(item.id)}
        >
          Add note
        </DocumentAction>
        <DocumentAction
          actionKey="fold-ffe-line"
          variant="tertiary"
          onClick={onFold}
        >
          Fold
        </DocumentAction>
      </DocumentActionGroup>

      {/* D4 inside the paper: the shared procurement panels carry shadow-xl
          in the old zones — strip it here without touching them (R3). */}
      <div className="contents [&_.shadow-xl]:shadow-none">
        {vendor && (
          <OrderAssistant
            open={assistantOpen}
            onOpenChange={setAssistantOpen}
            vendor={vendor}
            project={{ id: projectId, name: projectName }}
            ffeItems={[item]}
          />
        )}
        {po && (
          <PoPreview
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            purchaseOrderId={po.id}
            vendorName={item.vendor_name ?? vendor?.name ?? 'the vendor'}
            vendorEmailHint={vendor ? clientVendorEmailHint(vendor) : null}
          />
        )}
        {po && (
          <LogInspectionDrawer
            open={inspectionOpen}
            onOpenChange={setInspectionOpen}
            purchaseOrderId={po.id}
            projectId={projectId}
            poLabel={po.vendor_po_number ?? po.sidemark ?? 'PO'}
            vendorName={item.vendor_name ?? vendor?.name ?? 'Vendor'}
            projectName={projectName}
          />
        )}
      </div>
    </div>
  );
}
