'use client';

/**
 * FF&E line unfold (spec §6, §13 Slice 4): PO detail · movement · receiving,
 * with the existing Order Assistant and LogInspectionDrawer mounted in
 * place (both are portal-local shadow-free panels — R3-clean). Prototype
 * v0.4 .line-detail recipe: clay left border, three-column grid.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDamageClaim, useUpdatePurchaseOrderETA, useVendor } from '@patina/supabase';
import { OrderAssistant } from '@/components/portal/procurement/order-assistant';
import { LogInspectionDrawer } from '@/components/portal/procurement/log-inspection-drawer';
import { clientVendorEmailHint } from '@/components/portal/procurement/po-send-actions';
import { PoPreview } from './po-preview';
import { FolioStrip } from './folio-strip';
import { useAssignLineRoom, useDocumentRooms } from '@/hooks/use-document-rooms';
import { deriveLineStamp } from '@/lib/document/stamp-derivation';
import { fmtDay } from '@/lib/document/format';

type FFERow = any;

const ACTION_BTN =
  'rounded-[4px] border border-[var(--color-pearl)] px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--color-charcoal)] hover:border-[var(--color-clay)] disabled:opacity-50';

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">{value}</p>
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
  const [eta, setEta] = useState<string>(po?.confirmed_eta ? po.confirmed_eta.slice(0, 10) : '');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Follow external ETA changes (same-truck batch, ack coalesce) into the field.
  useEffect(() => {
    setEta(po?.confirmed_eta ? po.confirmed_eta.slice(0, 10) : '');
  }, [po?.confirmed_eta]);

  const save = (value: string) => {
    // <input type="date"> yields '' until a complete date exists — the same
    // canSave guard the drawer used.
    if (!po || !/^\d{4}-\d{2}-\d{2}$/.test(value) || updateEta.isPending) return;
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
      .catch((e: Error) => setError(e.message || 'The ETA could not be saved.'));
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
            <input
              type="date"
              value={eta}
              aria-label="Confirmed ETA"
              disabled={updateEta.isPending}
              onChange={(e) => {
                setEta(e.target.value);
                save(e.target.value);
              }}
              className="bg-transparent text-[10.5px] text-[var(--color-charcoal)] outline-none disabled:opacity-50"
            />
          </label>
          {!eta && po.status === 'shipped' && !error && (
            <p className="text-[10px] text-[var(--text-muted)]">shipped — no scheduled arrival</p>
          )}
          {saved && !error && (
            // R51: the quiet confirmation.
            <p className="text-[10px] text-[var(--text-muted)]">
              eta updated — arrives ~{fmtDay(saved)}
            </p>
          )}
          {error && (
            // R83: inline at the act — the reason and a retry.
            <p role="alert" className="text-[10px] text-[#C4836F]">
              {error}{' '}
              <button
                type="button"
                onClick={() => save(eta)}
                className="underline hover:opacity-80"
              >
                try again
              </button>
            </p>
          )}
        </>
      ) : (
        item.eta && <p className="text-[10px] text-[var(--text-muted)]">eta ~{fmtDay(item.eta)}</p>
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
        ...(state === 'resolved' && note.trim() ? { resolution_notes: note.trim() } : {}),
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
              Claim · {c.state === 'vendor_notified' ? 'vendor notified' : 'drafted'}
            </span>
            {c.state === 'drafted' && (
              <button
                type="button"
                disabled={updateClaim.isPending}
                onClick={() => void run(c.id, 'vendor_notified')}
                className="text-[10.5px] text-[var(--color-clay)] hover:underline disabled:opacity-50"
              >
                notify vendor →
              </button>
            )}
            {c.state === 'vendor_notified' && (
              <button
                type="button"
                onClick={() => setResolvingId((cur) => (cur === c.id ? null : c.id))}
                aria-expanded={resolvingId === c.id}
                className="text-[10.5px] text-[var(--color-clay)] hover:underline"
              >
                mark resolved {resolvingId === c.id ? '↑' : '↓'}
              </button>
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
              <button
                type="button"
                disabled={updateClaim.isPending}
                onClick={() => void run(c.id, 'resolved')}
                className="whitespace-nowrap rounded-[4px] border border-[var(--color-clay)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--color-clay)] hover:bg-[rgba(196,165,123,0.1)] disabled:opacity-50"
              >
                {updateClaim.isPending ? 'Resolving…' : 'Mark resolved'}
              </button>
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
}: {
  item: FFERow;
  projectId: string;
  projectName: string;
  onAddNote: (lineId: string) => void;
  onFold: () => void;
}) {
  const stamp = deriveLineStamp(item);
  const po = item.purchase_order ?? null;
  const vendorId: string = item.vendor_id ?? po?.vendor_id ?? '';
  const { data: vendor } = useVendor(vendorId) as { data: FFERow | undefined };

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // R25: lines assign to rooms from the unfold.
  const { data: rooms } = useDocumentRooms(projectId);
  const assignRoom = useAssignLineRoom(projectId);

  const orderable = ORDERABLE.has(item.status) && !item.blocked;
  const inspectable = Boolean(po) && (item.status === 'shipped' || item.status === 'delivered');
  // R18: sending one PO while working its line is engagement work — the
  // unfold offers Send for drafted, never-sent POs only.
  const sendable = Boolean(po) && po.status === 'draft' && !po.sent_at;

  const openClaims = (item.item_claims ?? []).filter(
    (c: { state: string }) => c.state === 'drafted' || c.state === 'vendor_notified',
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
            po ? (po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO drafted') : 'Not yet ordered'
          }
          sub={
            po
              ? [
                  // R18: the cell narrates the send lifecycle.
                  po.sent_at ? `sent to vendor ${fmtDay(po.sent_at)}` : 'not yet sent',
                  po.sent_at
                    ? po.acknowledged_at
                      ? 'acknowledged'
                      : 'awaiting acknowledgment'
                    : null,
                  po.payment_pattern ? po.payment_pattern.replace(/_/g, ' ') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : item.vendor_name ?? undefined
          }
        />
        {/* PRC-12: the Movement cell carries the confirmed-ETA quick-edit. */}
        <MovementCell item={item} po={po} />
        <Cell label="Receiving" value={receivingValue} />
      </div>

      {/* PRC-11: walk the line's open claims forward — notify · resolve. */}
      {openClaims.length > 0 && (
        <ClaimActs claims={openClaims as { id: string; state: string }[]} />
      )}

      {/* R25: room assignment, in the unfold's quiet grammar. */}
      {(rooms ?? []).length > 0 && (
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Room
          </span>
          <select
            value={item.project_room_id ?? ''}
            onChange={(e) =>
              assignRoom.mutate({ itemId: item.id, roomId: e.target.value || null })
            }
            aria-label="Assign to room"
            className="bg-transparent text-[10.5px] text-[var(--color-charcoal)] outline-none"
          >
            <option value="">Throughout · unassigned</option>
            {(rooms ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* R24: cut sheets and spec PDFs clip to the line. */}
      <FolioStrip projectId={projectId} anchor={{ kind: 'line', anchorId: item.id }} />

      <div className="flex flex-wrap gap-1.5">
        {orderable && (
          <button
            type="button"
            className={ACTION_BTN}
            disabled={!vendor}
            title={vendor ? undefined : 'No vendor on this line yet'}
            onClick={() => setAssistantOpen(true)}
          >
            Order with Assistant
          </button>
        )}
        {sendable && (
          <button type="button" className={ACTION_BTN} onClick={() => setPreviewOpen(true)}>
            Send to vendor
          </button>
        )}
        {inspectable && (
          <button type="button" className={ACTION_BTN} onClick={() => setInspectionOpen(true)}>
            Log inspection
          </button>
        )}
        <button type="button" className={ACTION_BTN} onClick={() => onAddNote(item.id)}>
          + Note
        </button>
        <button type="button" className={ACTION_BTN} onClick={onFold}>
          Fold ↑
        </button>
      </div>

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
