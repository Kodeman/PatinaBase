'use client';

/**
 * FF&E line unfold. C-14 (D1-03): six cells — The buy · Quote · Order ·
 * Movement · Money out · Receiving — with the one next act lifted above them,
 * chosen by the order readiness rule (§3.4) and the PO's lifecycle. Each cell
 * lives in `./line-unfold/`; this file composes them and mounts the existing
 * Order Assistant, PO preview and LogInspectionDrawer in place (all
 * portal-local shadow-free panels — R3-clean). Clay left border, as before.
 *
 * The Authorized Schedule (Act III, slide 9): on a commercial job the unfold
 * carries the purchase-order sentence — the one thing authorization buys a
 * studio, because the signed row and the schedule row are now one row. A line
 * that has been released is softly locked: the price the client signed stands,
 * and changing it means voiding the instrument and superseding it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useVendor, type StudioPurchaseRow } from '@patina/supabase';
import { OrderPaper } from '@/components/portal/procurement/order-paper';
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
import { fmtUsd } from '@/lib/document/format';
import {
  DocumentAction,
  DocumentActionGroup,
  type DocumentActionVariant,
} from './document-action';
import { PieceArtifactPlate } from './piece-artifact-plate';
import { LABEL_CLS } from './line-unfold/cell';
import { TheBuyCell } from './line-unfold/the-buy-cell';
import { QuoteCell } from './line-unfold/quote-cell';
import { OrderCell } from './line-unfold/order-cell';
import { MovementCell, PoStatusAct } from './line-unfold/movement-cell';
import { MoneyOutCell } from './line-unfold/money-out-cell';
import { ReceivingCell } from './line-unfold/receiving-cell';
import { InstallAct } from './line-unfold/install-act';
import { ClaimActs } from './line-unfold/claim-acts';
import {
  canInspect,
  canSend,
  deriveNextAct,
} from './line-unfold/next-act';

type FFERow = any;

/** A released line is softly locked — the same sentence everywhere it bites. */
const softLockSentence = (auth: LineAuthorization) =>
  auth.track === 'none'
    ? null
    : `on authorization № ${auth.number} — void & supersede to change`;

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
  purchase = null,
}: {
  item: FFERow;
  /** C-25: the purchase record this line was bought on, when it has one. */
  purchase?: StudioPurchaseRow | null;
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

  const [paperOpen, setPaperOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // C-03: once a status move lands, the next act stands in at once rather
  // than waiting on the refetch; the PO's own status takes over when it
  // arrives.
  const [advancedTo, setAdvancedTo] = useState<string | null>(null);
  useEffect(() => {
    setAdvancedTo(null);
  }, [po?.status]);
  const poStatus: string | null = po ? (advancedTo ?? po.status) : null;

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
  const inspectable = canInspect(po, item.status);
  // R18: sending one PO while working its line is engagement work — the
  // unfold offers Send for drafted, never-sent POs only.
  const sendable = canSend(po);

  const openClaims = (item.item_claims ?? []).filter(
    (c: { state: string }) =>
      c.state === 'drafted' || c.state === 'vendor_notified',
  );

  // C-14: exactly one act leads, above the cells. Any other act that still
  // applies stays where it lives — its cell, or the action row.
  const next = deriveNextAct({
    itemStatus: item.status,
    po: po ? { ...po, status: poStatus } : null,
    ready: readiness.ready,
    inspected: item.received_quantity != null,
    hasOpenClaim: openClaims.length > 0,
  });

  const orderAct = (variant: DocumentActionVariant) => (
    <DocumentAction
      actionKey="order-ffe-line"
      variant={variant}
      disabled={!vendor}
      title={vendor ? undefined : 'Loading the maker'}
      onClick={() => setPaperOpen(true)}
    >
      Order
    </DocumentAction>
  );
  const sendAct = (variant: DocumentActionVariant) => (
    <DocumentAction
      actionKey="send-ffe-line-to-vendor"
      variant={variant}
      onClick={() => setPreviewOpen(true)}
    >
      Send to vendor
    </DocumentAction>
  );
  const inspectAct = (variant: DocumentActionVariant) => (
    <DocumentAction
      actionKey="inspect-ffe-delivery"
      variant={variant}
      onClick={() => setInspectionOpen(true)}
    >
      Log inspection
    </DocumentAction>
  );

  return (
    <div className="mb-2 mt-1 rounded-r-[5px] border-l-[3px] border-[var(--color-clay)] bg-[rgba(196,165,123,0.05)] px-4 py-3.5">
      {showArtifactPlate && !isTradeLine && <PieceArtifactPlate item={item} />}

      {next && (
        <div data-testid="line-next-act" className="mb-3">
          {/* R-PB1: a consequence sentence above the act, never a block. */}
          {next.kind === 'order' &&
            readiness.warnings.map((warning) => (
              <p
                key={warning}
                className="mb-1.5 text-[11px] text-[var(--color-charcoal)]"
              >
                {warning}
              </p>
            ))}
          <DocumentActionGroup
            surfaceKey="project"
            regionKey="ffe-next-act"
            aria-label="Next act"
            className="!items-baseline"
          >
            <span className={LABEL_CLS}>Next</span>
            {next.kind === 'order' && orderAct('primary')}
            {next.kind === 'send' && sendAct('primary')}
            {next.kind === 'inspect' && inspectAct('primary')}
            {next.kind === 'log-ack' && (
              // C-10: the vendor phoned or emailed — log the acknowledgment on
              // the line itself (the Orders ledger's canAck predicate).
              <LogAckInline
                purchaseOrderId={po.id}
                vendorPoNumber={po.vendor_po_number}
                confirmedEta={po.confirmed_eta}
                sentAt={po.sent_at}
              />
            )}
            {next.kind === 'advance' && (
              <PoStatusAct
                key={next.to}
                poId={po.id}
                projectId={projectId}
                to={next.to}
                label={next.label}
                lifted
                onAdvanced={setAdvancedTo}
              />
            )}
            {next.kind === 'install' && (
              <InstallAct itemId={item.id} projectId={projectId} lifted />
            )}
          </DocumentActionGroup>
        </div>
      )}

      {/* C-14: two rows of three at desktop, two columns between, one stack
          at 390. Hairline rules between cells, no shadow. */}
      <div className="mb-3 grid grid-cols-1 gap-px border border-[var(--color-pearl)] bg-[var(--color-pearl)] sm:grid-cols-2 lg:grid-cols-3">
        <TheBuyCell
          item={item}
          po={po}
          projectId={projectId}
          canEdit={canEditSelection}
        />
        <QuoteCell
          item={item}
          projectId={projectId}
          projectName={projectName}
          vendor={vendor ? { id: vendor.id, name: vendor.name } : null}
          canEdit={canEditSelection && !isTradeLine}
        />
        {/* C-11a: not ready reads as what would change it, in place of Order.
            A line already on a PO says so in its cell; trade work never orders. */}
        <OrderCell
          item={item}
          po={po}
          purchase={purchase}
          reasons={!readiness.ready && !po && !purchase && !isTradeLine ? readiness.reasons : []}
          projectId={projectId}
          auth={auth}
          canChange={canEditSelection}
        />
        {/* PRC-12: the Movement cell carries the confirmed-ETA quick-edit. */}
        <MovementCell
          item={item}
          po={po}
          projectId={projectId}
          poStatus={poStatus}
          showAdvance={next?.kind !== 'advance'}
          onAdvanced={setAdvancedTo}
        />
        <MoneyOutCell po={po} projectId={projectId} itemId={item.id} />
        <ReceivingCell
          item={item}
          stampKind={stamp.kind}
          openClaims={openClaims}
        />
      </div>

      {/* R7 (M7): the fifteen-step trail — the position, where the cells above
          give the facts. Retires "Ordered" as the line's whole story. */}
      {showTrail && <ProcurementTrail reading={lifecycle} />}

      {/* C-04: the only door to installed — and only from delivered. */}
      {item.status === 'delivered' && next?.kind !== 'install' && (
        <InstallAct itemId={item.id} projectId={projectId} />
      )}

      {/* The authorization strip — what was signed, and what that permits. */}
      {isCommercialOrigin && (
        <div
          data-testid="line-authorization-strip"
          className="mb-2.5 border-l-[2px] border-[var(--color-sage)] pl-2.5"
        >
          {auth.track === 'authorized' && (
            <p className={LABEL_CLS}>
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
          {softLock && <p className={`mt-px ${LABEL_CLS}`}>{softLock}</p>}
        </div>
      )}

      {/* PRC-11: walk the line's open claims forward — notify · resolve. */}
      {openClaims.length > 0 && (
        <ClaimActs claims={openClaims as { id: string; state: string }[]} />
      )}

      {/* R25: room assignment, in the unfold's quiet grammar. */}
      {canEditSelection && (
        <div className="mb-2.5 flex flex-wrap items-baseline gap-2">
          <span className={LABEL_CLS}>Room</span>
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
          {softLock && <span className={LABEL_CLS}>{softLock}</span>}
        </div>
      )}

      {/* R24: cut sheets and spec PDFs clip to the line. */}
      <FolioStrip
        projectId={projectId}
        anchor={{ kind: 'line', anchorId: item.id }}
      />

      <DocumentActionGroup surfaceKey="project" regionKey="ffe-line-actions">
        {/* Acts that apply but are not the lifted one stay reachable here. */}
        {readiness.ready && next?.kind !== 'order' && orderAct('secondary')}
        {sendable && next?.kind !== 'send' && sendAct('secondary')}
        {inspectable && next?.kind !== 'inspect' && inspectAct('secondary')}
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
          <OrderPaper
            open={paperOpen}
            onClose={() => setPaperOpen(false)}
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
