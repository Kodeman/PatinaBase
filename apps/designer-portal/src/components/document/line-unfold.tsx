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

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUpdateDamageClaim,
  useUpdatePurchaseOrderETA,
  useVendor,
} from '@patina/supabase';
import { OrderAssistant } from '@/components/portal/procurement/order-assistant';
import { LogInspectionDrawer } from '@/components/portal/procurement/log-inspection-drawer';
import { clientVendorEmailHint } from '@/components/portal/procurement/po-send-actions';
import { PoPreview } from './po-preview';
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
  poGate,
  type LineAuthorization,
} from '@/lib/document/authorization-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { DateTextInput } from './date-text-input';
import { DocumentAction, DocumentActionGroup } from './document-action';

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
      <p className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">
        {value}
      </p>
      {sub && <p className="text-[10px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

const ORDERABLE = new Set(['specified', 'quoted', 'approved']);

/**
 * PRC-12 (R84): the Movement cell with the single-PO confirmed-ETA edit —
 * EtaQuickEditDrawer's mutation ported into a quiet inline date field (the
 * PRD W2.4 vision: vendor emails a delay, type the date, done). Saves on a
 * complete date, confirms in a line of text (R51), fails inline (R83).
 */
function MovementCell({ item, po }: { item: FFERow; po: FFERow | null }) {
  const qc = useQueryClient();
  const updateEta = useUpdatePurchaseOrderETA({ errorSurface: 'inline' });
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
      <p className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        Movement
      </p>
      <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">
        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
      </p>
      {po ? (
        <>
          <label className="flex items-baseline gap-1.5">
            <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
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
              className="bg-transparent text-[10.5px] text-[var(--color-charcoal)] outline-none"
            />
          </label>
          {!eta && po.status === 'shipped' && !error && (
            <p className="text-[10px] text-[var(--text-muted)]">
              shipped — no scheduled arrival
            </p>
          )}
          {saved && !error && (
            // R51: the quiet confirmation.
            <p className="text-[10px] text-[var(--text-muted)]">
              eta updated — arrives ~{fmtDay(saved)}
            </p>
          )}
          {error && (
            // R83: inline at the act — the reason and a retry.
            <div role="alert" className="text-[10px] text-[#C4836F]">
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
          <p className="text-[10px] text-[var(--text-muted)]">
            eta ~{fmtDay(item.eta)}
          </p>
        )
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
            <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-terracotta)]">
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
        <p className="text-[10px] text-[var(--text-muted)]">{confirmed}</p>
      )}
      {error && (
        // R83: inline at the act.
        <p role="alert" className="text-[10px] text-[#C4836F]">
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

  // On a commercial job the purchase order waits on the instrument, not just
  // the stage. Elsewhere the schedule keeps its old predicate and says nothing.
  const gate = poGate(item, auth, isCommercialOrigin);
  const orderable = isCommercialOrigin
    ? gate.orderable
    : ORDERABLE.has(item.status) && !item.blocked;
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
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        {/* PRC-12: the Movement cell carries the confirmed-ETA quick-edit. */}
        <MovementCell item={item} po={po} />
        <Cell label="Receiving" value={receivingValue} />
      </div>

      {/* R7 (M7): the fifteen-step trail — the position, where the cells above
          give the facts. Retires "Ordered" as the line's whole story. */}
      {showTrail && <ProcurementTrail reading={lifecycle} />}

      {/* The authorization strip — what was signed, and what that permits. */}
      {isCommercialOrigin && (
        <div
          data-testid="line-authorization-strip"
          className="mb-2.5 border-l-[2px] border-[var(--color-sage)] pl-2.5"
        >
          {auth.track === 'authorized' && (
            <p className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              signed price {fmtUsd(auth.signedLineTotalCents)} ·{' '}
              {auth.depositClear ? 'deposit clear' : 'deposit not yet clear'}
            </p>
          )}
          {delta && (
            // The signed price stands; the drift is stated, never silent.
            <p className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-terracotta)]">
              {delta}
            </p>
          )}
          {gate.sentence && (
            <p className="text-[11px] text-[var(--color-charcoal)]">
              {gate.sentence}
            </p>
          )}
          {softLock && (
            <p className="mt-px font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
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
          <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
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
            className="bg-transparent text-[10.5px] text-[var(--color-charcoal)] outline-none disabled:opacity-60"
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
            <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
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

      <DocumentActionGroup surfaceKey="project" regionKey="ffe-line-actions">
        {orderable && (
          <DocumentAction
            actionKey="order-ffe-line"
            variant={sendable || inspectable ? 'secondary' : 'primary'}
            disabled={!vendor}
            title={vendor ? undefined : 'No vendor on this line yet'}
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
