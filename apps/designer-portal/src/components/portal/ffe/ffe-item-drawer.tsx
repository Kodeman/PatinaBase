'use client';

/**
 * FF&E item detail drawer (W3-T3a extraction — moved verbatim from the
 * project FF&E board page). Read-only item facts + the 00185 dual-pricing
 * editor + stage picker + Generate PO / Remove actions. The parent page owns
 * the routing (?item= deep link), the status mutation, and the remove
 * mutation; the drawer owns only the pricing mutation.
 */

import { useEffect, useState } from 'react';
import { useUpdateFFEItemPricing } from '@patina/supabase';
import { StageSelect, poSync } from '@/components/portal/ffe/stage-select';
import { useToast } from '@/components/portal/toast-provider';
import { StrataInfoIcon, SurfaceKeys } from '@patina/help-system';
import { Button, IconButton, Input } from '@/components/ui/controls';
import {
  centsToInput,
  formatDollars,
  formatSignedDollars,
  parseDollarsToCents,
  parsePercentInput,
} from '@/lib/currency-ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyItem = any;

function formatDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function FFEItemDrawer({
  item,
  projectId,
  rooms,
  vendors,
  isStudioOwner,
  canEditPricing,
  onClose,
  onUpdateStatus,
  onGeneratePO,
  onRemove,
}: {
  item: AnyItem;
  projectId: string;
  rooms: AnyItem[];
  vendors: AnyItem[];
  /** Gates the margin readout — hidden (not disabled) for non-owners. */
  isStudioOwner: boolean;
  /** False for slug-fixture (mock) projects with no Supabase row to update. */
  canEditPricing: boolean;
  onClose: () => void;
  onUpdateStatus: (status: string) => Promise<void>;
  onGeneratePO?: () => void;
  onRemove?: () => void | Promise<void>;
}) {
  const room = rooms.find((r) => r.id === item.project_room_id);
  const { toast } = useToast();
  // Decision-Framework integrity (PT-D-2-T3-1): an item held by a pending
  // blocks_procurement decision (blocked flag + a blocked_by_decision_id)
  // cannot be ordered until the client responds.
  const isOrderBlocked = Boolean(item.blocked) && Boolean(item.blocked_by_decision_id);

  // ── Dual-pricing editor state (00185) ────────────────────────────────────
  // Dollars in the UI, cents in the API. Empty field ⇄ NULL ("unknown").
  // Derivation: editing trade or markup recomputes client (client = trade ×
  // (1 + markup/100), rounded to the cent); editing client recomputes markup
  // (when trade > 0). Save writes only the fields that changed.
  const updatePricing = useUpdateFFEItemPricing();
  const [tradeInput, setTradeInput] = useState(() => centsToInput(item.trade_price_cents));
  const [markupInput, setMarkupInput] = useState(() =>
    item.markup_percent !== null && item.markup_percent !== undefined
      ? String(item.markup_percent)
      : ''
  );
  const [clientInput, setClientInput] = useState(() => centsToInput(item.unit_price_cents));

  // Re-seed when the drawer moves to a different item (same component instance,
  // ?item= changes). Saves refetch the same id with the values just written, so
  // in-flight edits are not clobbered by unrelated invalidations.
  useEffect(() => {
    setTradeInput(centsToInput(item.trade_price_cents));
    setMarkupInput(
      item.markup_percent !== null && item.markup_percent !== undefined
        ? String(item.markup_percent)
        : ''
    );
    setClientInput(centsToInput(item.unit_price_cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Client price recompute (line_total = unit × qty) is only valid for fixed
  // items — allowance line totals are the budget-range midpoint, owned by
  // useUpdateProjectFFEItem (see useUpdateFFEItemPricing JSDoc).
  const clientEditable = item.item_type === 'fixed';

  const deriveClient = (trade: string, markup: string) => {
    const t = parseDollarsToCents(trade);
    const m = parsePercentInput(markup);
    if (t !== null && m !== null) {
      setClientInput(centsToInput(Math.round(t * (1 + m / 100))));
    }
  };
  const handleTradeChange = (v: string) => {
    setTradeInput(v);
    // Only derive the client price for fixed items — allowance/TBD client
    // values come from the budget-range midpoint and cannot be saved here,
    // so deriving would paint a misleading (unsaveable) preview on locked
    // client price fields.
    if (clientEditable) deriveClient(v, markupInput);
  };
  const handleMarkupChange = (v: string) => {
    setMarkupInput(v);
    if (clientEditable) deriveClient(tradeInput, v);
  };
  const handleClientChange = (v: string) => {
    setClientInput(v);
    const t = parseDollarsToCents(tradeInput);
    const c = parseDollarsToCents(v);
    if (t !== null && t > 0 && c !== null) {
      setMarkupInput(String(Math.round((c / t - 1) * 10000) / 100));
    }
  };

  const tradeCents = parseDollarsToCents(tradeInput);
  const markupPct = parsePercentInput(markupInput);
  const clientCents = parseDollarsToCents(clientInput);
  // Non-empty input that fails to parse must block Save — it must NOT be
  // mistaken for an intentional clear-to-NULL.
  const tradeInvalid = tradeInput.trim() !== '' && tradeCents === null;
  const markupInvalid = markupInput.trim() !== '' && markupPct === null;
  const clientInvalid = clientInput.trim() !== '' && clientCents === null;
  const anyInvalid = tradeInvalid || markupInvalid || clientInvalid;

  // Save sends only changed fields; explicit null clears trade/markup. Client
  // price is not nullable — an emptied client field means "unchanged".
  const pricingPayload: {
    tradePriceCents?: number | null;
    markupPercent?: number | null;
    unitPriceCents?: number;
  } = {};
  if (!tradeInvalid && tradeCents !== (item.trade_price_cents ?? null)) {
    pricingPayload.tradePriceCents = tradeCents;
  }
  if (!markupInvalid && markupPct !== (item.markup_percent ?? null)) {
    pricingPayload.markupPercent = markupPct;
  }
  if (
    clientEditable &&
    !clientInvalid &&
    clientCents !== null &&
    clientCents !== (item.unit_price_cents ?? null)
  ) {
    pricingPayload.unitPriceCents = clientCents;
  }
  const pricingDirty = Object.keys(pricingPayload).length > 0;

  const handleSavePricing = async () => {
    if (!pricingDirty || anyInvalid) return;
    try {
      await updatePricing.mutateAsync({ itemId: item.id, projectId, ...pricingPayload });
      toast('Pricing updated', 'success');
      // Re-seed inputs from the just-submitted payload values (falling back to
      // the item's existing values for fields not in the payload). This closes
      // the window where a user clears a field right after Save and a subsequent
      // Save would send a spurious null clear.
      setTradeInput(
        centsToInput(
          'tradePriceCents' in pricingPayload
            ? pricingPayload.tradePriceCents
            : item.trade_price_cents
        )
      );
      setMarkupInput(
        'markupPercent' in pricingPayload
          ? pricingPayload.markupPercent !== null && pricingPayload.markupPercent !== undefined
            ? String(pricingPayload.markupPercent)
            : ''
          : item.markup_percent !== null && item.markup_percent !== undefined
            ? String(item.markup_percent)
            : ''
      );
      setClientInput(
        centsToInput(
          'unitPriceCents' in pricingPayload
            ? pricingPayload.unitPriceCents
            : item.unit_price_cents
        )
      );
    } catch {
      /* global mutation error toast already fired */
    }
  };

  // Margin readout — studio owners only, and only when a trade cost is set
  // against a real (>$0) client price. margin = (client − trade) × qty.
  const quantity = item.quantity ?? 1;
  const marginCents =
    tradeCents !== null && clientCents !== null && clientCents > 0
      ? (clientCents - tradeCents) * quantity
      : null;
  const marginPct =
    tradeCents !== null && clientCents !== null && clientCents > 0
      ? Math.round(((clientCents - tradeCents) / clientCents) * 100)
      : null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[480px] max-w-[95vw] overflow-y-auto border-l bg-[var(--bg-surface)] shadow-xl"
      style={{ borderColor: 'var(--border-default)' }}>
      <div className="flex items-center justify-between border-b p-4" style={{ borderColor: 'var(--border-default)' }}>
        <span className="type-meta-small uppercase tracking-wider">Item Detail</span>
        <IconButton label="Close" onClick={onClose}>
          ×
        </IconButton>
      </div>

      <div className="p-5">
        <h2
          className="mb-3"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            color: 'var(--text-primary)',
          }}
        >
          {item.name}
        </h2>

        <Field label="Room" value={room?.name || '—'} />
        <Field label="Vendor" value={item.vendor_name || '—'} />
        {/* Procurement-side concepts get StrataInfoIcons so designers can
            learn what each label measures without leaving the drawer. */}
        <Field
          label="PO Number"
          value={item.po_number || '—'}
          surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Detail.PoNumber}
        />
        <Field label="Quantity" value={String(item.quantity ?? 1)} />
        {/* Mock (slug) projects have no Supabase row — read-only price only. */}
        {!canEditPricing && (
          <Field label="Unit Price" value={formatDollars(item.unit_price_cents || 0)} />
        )}
        <Field
          label="Line Total"
          value={formatDollars(item.line_total_cents || 0)}
          surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Detail.LineTotal}
        />
        <Field
          label="ETA"
          value={formatDate(item.eta)}
          surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Detail.Eta}
        />
        <Field label="Last Updated" value={formatDate(item.last_status_change_at || item.updated_at)} />

        {item.blocked && (
          <div
            className="my-3 rounded-md border-2 p-3"
            style={{ borderColor: 'var(--color-terracotta, #D4A090)' }}
          >
            <div
              className="type-meta-small uppercase tracking-wider mb-1 inline-flex items-baseline gap-1"
              style={{ color: 'var(--color-terracotta)' }}
            >
              ⚠ Blocked
              {/* Blocked-reason is a Patina-defined procurement status —
                  StrataInfoIcon explains what triggers a block and how to
                  unblock. */}
              <StrataInfoIcon
                surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Detail.BlockedReason}
                size={11}
                ariaLabel="What does a Blocked item mean?"
              />
            </div>
            <p className="type-body text-[0.82rem]">
              {item.blocked_reason || 'Pending decision blocks this item.'}
            </p>
            {item.blocked_by_decision_id && (
              <a
                href={`/portal/decisions/${item.blocked_by_decision_id}`}
                className="mt-2 inline-block type-meta-small font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
                style={{ color: 'var(--color-terracotta, #D4A090)' }}
              >
                View the decision →
              </a>
            )}
          </div>
        )}

        {/* Pricing editor (00185 dual pricing). Trade + markup are advisory
            studio-side numbers; Client price is what flows into line_total.
            Editing trade/markup derives client; editing client derives markup. */}
        {canEditPricing && (
          <div className="mt-5">
            <span className="type-meta-small mb-2 block uppercase tracking-wider text-[var(--text-muted)]">
              Pricing
            </span>
            <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label className="block">
                <span className="type-meta mb-1 block">Trade price</span>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-body text-[0.88rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tradeInput}
                    invalid={tradeInvalid}
                    onChange={(e) => handleTradeChange(e.target.value)}
                    placeholder="—"
                    className="pl-7"
                    aria-label="Trade price"
                    aria-invalid={tradeInvalid || undefined}
                    aria-describedby={tradeInvalid ? 'trade-price-error' : undefined}
                  />
                </div>
                {tradeInvalid && (
                  <span
                    id="trade-price-error"
                    role="alert"
                    className="sr-only"
                  >
                    Enter a valid amount
                  </span>
                )}
              </label>
              <label className="block">
                <span className="type-meta mb-1 block">Markup %</span>
                <Input
                  type="number"
                  step="0.01"
                  value={markupInput}
                  invalid={markupInvalid}
                  onChange={(e) => handleMarkupChange(e.target.value)}
                  placeholder="—"
                  aria-label="Markup percent"
                  aria-invalid={markupInvalid || undefined}
                  aria-describedby={markupInvalid ? 'markup-percent-error' : undefined}
                />
                {markupInvalid && (
                  <span
                    id="markup-percent-error"
                    role="alert"
                    className="sr-only"
                  >
                    Enter a valid percent
                  </span>
                )}
              </label>
              <label className="block">
                <span className="type-meta mb-1 block">Client price</span>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-body text-[0.88rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={clientInput}
                    invalid={clientInvalid}
                    onChange={(e) => handleClientChange(e.target.value)}
                    placeholder="—"
                    className="pl-7"
                    aria-label="Client price"
                    aria-invalid={clientInvalid || undefined}
                    aria-describedby={clientInvalid ? 'client-price-error' : undefined}
                    disabled={!clientEditable}
                    title={
                      clientEditable
                        ? undefined
                        : 'Allowance/TBD line totals come from the budget range, not a unit price'
                    }
                  />
                </div>
                {clientInvalid && (
                  <span
                    id="client-price-error"
                    role="alert"
                    className="sr-only"
                  >
                    Enter a valid amount
                  </span>
                )}
              </label>
            </div>
            {/* Margin readout — studio owners only (hidden, not disabled, for
                everyone else). Only shown for fixed items with a real client
                price: allowance/TBD line totals are budget-range midpoints and
                the client field is disabled, so marginCents is always null for
                those item types — gating on clientEditable makes that explicit
                without relying on the null guard alone. */}
            {isStudioOwner && clientEditable && marginCents !== null && (
              <div className="mt-2 type-meta-small text-[var(--text-muted)]">
                Margin: {formatSignedDollars(marginCents)}
                {marginPct !== null ? ` · ${marginPct}%` : ''}
              </div>
            )}
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleSavePricing()}
                disabled={!pricingDirty || anyInvalid || updatePricing.isPending}
              >
                {updatePricing.isPending ? 'Saving…' : 'Save pricing'}
              </Button>
            </div>
          </div>
        )}

        {/* Stage picker — any stage → any stage, consistent with the card grid. */}
        <div className="mt-5">
          <span className="type-meta-small mb-1 block uppercase tracking-wider text-[var(--text-muted)]">
            Stage
          </span>
          <div className="max-w-[220px]">
            <StageSelect
              currentStatus={item.status || 'specified'}
              onChangeStatus={(next) => onUpdateStatus(next)}
              sync={poSync(item)}
              size="md"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => item.vendor_id && !isOrderBlocked && onGeneratePO?.()}
            disabled={!item.vendor_id || isOrderBlocked}
            title={
              isOrderBlocked
                ? 'Ordering is blocked pending a client decision'
                : item.vendor_id
                  ? 'Create a purchase order for this item'
                  : 'Assign a vendor first'
            }
          >
            {isOrderBlocked ? 'Blocked — decision pending' : 'Generate PO'}
          </Button>
          {onRemove && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void onRemove()}
              className="ml-auto"
              title="Remove this item from the project"
            >
              Remove item
            </Button>
          )}
        </div>

        {/* Suppress unused vendors prop warning until vendor reassignment ships */}
        <span className="hidden">{vendors.length}</span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  surfaceKey,
}: {
  label: string;
  value: string;
  surfaceKey?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b py-1.5 last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="type-meta-small text-[var(--text-muted)] inline-flex items-baseline gap-1">
        {label}
        {/* Optional StrataInfoIcon — surfaces Patina-vocab definitions inline
            without bloating the row. Hidden when no surfaceKey is provided. */}
        {surfaceKey ? (
          <StrataInfoIcon
            surfaceKey={surfaceKey}
            size={11}
            ariaLabel={`What does ${label} mean?`}
          />
        ) : null}
      </span>
      <span className="type-body text-[0.85rem] text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
