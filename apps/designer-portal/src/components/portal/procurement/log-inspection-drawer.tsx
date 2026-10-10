'use client';

/**
 * LogInspectionDrawer — small right-slide sheet for the Procurement → Receiving
 * "Pending Inspection" tab.
 *
 * The phone-first receiving flow lives in the iOS app (PRD §9 "Log on
 * phone"); this drawer is the desktop door for a box already at the studio.
 * C-19: each line takes its count, a condition (good / damaged / short /
 * wrong) and whether it was noted on the bill of lading, and photos upload
 * through the media proxy (`/api/media/assets`).
 *
 * Submits via `useCreateReceivingInspection`, which records the receipt and
 * the per-line check-in in record_project_ffe_inspection (00700), then
 * auto-drafts one `damage_claims` row per line not in good condition when
 * the outcome is not 'clean'.
 *
 * While the designer hasn't explicitly picked an outcome it is suggested
 * from the lines: a damaged or wrong line suggests Damaged, a short count or
 * short line suggests Partial, otherwise Clean.
 *
 * US-21 T-54: a line placed in two or more rooms asks which rooms the
 * delivery covers, pre-filled in placement order; the split rides the
 * receipt as `placements` (00754/00756). A single-room line asks nothing.
 *
 * Mirrors the slide-from-right pattern used by the Sprint 1 OrderAssistant.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useCreateReceivingInspection,
  useFfePlacementReceipts,
  useProcurementItems,
  useProjectRoomPlacements,
  useProjectRooms,
  type ReceivingInspectionItemInput,
  type ReceivingInspectionOutcome,
} from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { Button, IconButton, Input, Select, Textarea } from '@/components/ui/controls';
import { unitWord } from '@/components/document/pieces/placement-chips';
import type { FfeRoomPlacement } from '@patina/types';

type LineCondition = NonNullable<ReceivingInspectionItemInput['condition']>;

const CONDITION_OPTIONS: Array<{ value: LineCondition; label: string }> = [
  { value: 'good', label: 'Good' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'short', label: 'Short' },
  { value: 'wrong', label: 'Wrong item' },
];

interface InspectionPhoto {
  assetId: string;
  name: string;
  previewUrl: string;
}

/**
 * Upload one photo through the media proxy route; resolves its asset id. The
 * PO's project rides every upload so the media ACL scopes the photo to that
 * project, not to the uploader alone.
 */
export async function uploadInspectionPhoto(file: File, projectId: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('projectId', projectId);
  const res = await fetch('/api/media/assets', { method: 'POST', body: form });
  const body = await res.json().catch(() => null);
  const assetId = body?.data?.assetId;
  if (!res.ok || typeof assetId !== 'string') {
    throw new Error(body?.error?.message ?? `${file.name} could not be uploaded.`);
  }
  return assetId;
}

// ─── Receiving by room (US-21 T-54; D7 phase 3, case 2) ─────────────────────

/** One room a placed line is in, in placement order. */
export interface ReceiptRoom {
  placementId: string;
  roomName: string;
  /** The room's share of the line. */
  placed: number;
  /** What earlier deliveries already brought the room. */
  received: number;
}

const roomLacks = (room: ReceiptRoom) => Math.max(room.placed - room.received, 0);

/**
 * What the rooms must add up to: this delivery, or all the rooms still lack
 * when the delivery is larger (the waste, 913 over 830, is in no room).
 */
export function receiptRoomsTarget(rooms: ReceiptRoom[], receipt: number): number {
  return Math.min(
    Math.max(receipt, 0),
    rooms.reduce((sum, room) => sum + roomLacks(room), 0),
  );
}

/**
 * The delivery spread over the rooms in placement order, each up to what it
 * still lacks (00754's default): 500 of the oak floor → Hall 120, Living 320,
 * Dining 60.
 */
export function fillReceiptRooms(rooms: ReceiptRoom[], receipt: number): Record<string, number> {
  let left = Math.max(receipt, 0);
  const split: Record<string, number> = {};
  for (const room of rooms) {
    const take = Math.min(left, roomLacks(room));
    split[room.placementId] = take;
    left -= take;
  }
  return split;
}

/** Why an edited split cannot be recorded, or null when it can. */
export function receiptRoomsProblem(
  rooms: ReceiptRoom[],
  receipt: number,
  split: Record<string, number>,
): string | null {
  const over = rooms.find((room) => (split[room.placementId] ?? 0) > roomLacks(room));
  if (over) return `${over.roomName} can take ${roomLacks(over)} more.`;
  const total = rooms.reduce((sum, room) => sum + (split[room.placementId] ?? 0), 0);
  const target = receiptRoomsTarget(rooms, receipt);
  if (total !== target) {
    return `The rooms add up to ${total}; this delivery brought ${target} to place.`;
  }
  return null;
}

/**
 * Which rooms a delivery covers, for a line placed in two or more rooms.
 * Pre-filled in placement order, each room editable; the rooms add up to the
 * delivery. A single-room line asks nothing (it shows no prompt).
 */
export function ReceiptRoomsPrompt({
  lineName,
  unit,
  rooms,
  receipt,
  split,
  disabled,
  onChange,
}: {
  lineName: string;
  unit: string | null | undefined;
  rooms: ReceiptRoom[];
  /** This delivery's count for the line (the received count less earlier ones). */
  receipt: number;
  split: Record<string, number>;
  disabled?: boolean;
  onChange: (split: Record<string, number>) => void;
}) {
  if (rooms.length < 2 || receipt <= 0) return null;
  const word = unitWord(unit);
  const total = rooms.reduce((sum, room) => sum + (split[room.placementId] ?? 0), 0);
  const target = receiptRoomsTarget(rooms, receipt);
  const problem = receiptRoomsProblem(rooms, receipt, split);
  return (
    <fieldset className="mt-2 border-t border-[var(--border-default)] pt-2">
      <legend
        className="text-[var(--text-muted)]"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Which rooms does it cover?
      </legend>
      <div className="mt-1 flex flex-col gap-1.5">
        {rooms.map((room) => (
          <div key={room.placementId} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.78rem] text-[var(--text-primary)]">
                {room.roomName}
              </div>
              <div className="text-[0.65rem] text-[var(--text-muted)]">
                {roomLacks(room)} {word} to come
              </div>
            </div>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={roomLacks(room)}
              value={split[room.placementId] ?? 0}
              disabled={disabled}
              aria-label={`${room.roomName} share of ${lineName}`}
              onChange={(e) => {
                const raw = Number.parseInt(e.target.value, 10);
                onChange({
                  ...split,
                  [room.placementId]: Number.isNaN(raw) ? 0 : Math.max(0, raw),
                });
              }}
              className="w-[76px] text-right"
            />
          </div>
        ))}
      </div>
      <p
        aria-live="polite"
        className="mt-1.5 text-[0.65rem]"
        style={{ color: problem ? 'var(--color-terracotta-ink)' : 'var(--text-muted)' }}
      >
        {problem ?? `${total} of ${target} ${word} in rooms`}
      </p>
    </fieldset>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LogInspectionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PO under inspection. */
  purchaseOrderId: string;
  /**
   * Project the PO belongs to. When provided, the FF&E caches for the
   * project are invalidated after a logged inspection (the 00184 triggers
   * advance linked FF&E items server-side on clean outcomes).
   */
  projectId?: string;
  /** Human-readable PO summary for the drawer header. */
  poLabel: string;
  /** Vendor name shown in the drawer header sub-line. */
  vendorName: string;
  /** Project name shown in the drawer header sub-line. */
  projectName: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

const OUTCOME_OPTIONS: Array<{
  value: ReceivingInspectionOutcome;
  label: string;
  description: string;
  accent: string;
}> = [
  {
    value: 'clean',
    label: 'Clean',
    description: 'All items received undamaged.',
    accent: 'var(--color-sage)',
  },
  {
    value: 'damaged',
    label: 'Damaged',
    description: 'One or more items show damage.',
    accent: 'var(--color-terracotta)',
  },
  {
    value: 'partial',
    label: 'Partial',
    description: 'Delivery is incomplete (missing pieces).',
    accent: 'var(--color-golden-hour)',
  },
];

export function LogInspectionDrawer(props: LogInspectionDrawerProps) {
  const {
    open,
    onOpenChange,
    purchaseOrderId,
    projectId,
    poLabel,
    vendorName,
    projectName,
  } = props;

  const [outcome, setOutcome] = useState<ReceivingInspectionOutcome>('clean');
  // W5-T2 — once the designer explicitly picks an outcome, the per-item
  // auto-suggest below stops overriding it.
  const [outcomeTouched, setOutcomeTouched] = useState(false);
  const [notes, setNotes] = useState('');
  // W5-T2 — per-item received counts, keyed by project_ffe_items.id. Sparse:
  // untouched rows fall back to the full ordered quantity.
  const [received, setReceived] = useState<Record<string, number>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // C-19 — per-line condition and "noted on the BOL", keyed like `received`.
  // Sparse: untouched lines are good and not noted.
  const [conditions, setConditions] = useState<Record<string, LineCondition>>({});
  const [notedOnBol, setNotedOnBol] = useState<Record<string, boolean>>({});
  // T-54 — edited room splits, keyed like `received`. Sparse: an untouched
  // line spreads its delivery over its rooms in placement order.
  const [roomSplits, setRoomSplits] = useState<Record<string, Record<string, number>>>({});
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const photosRef = useRef<InspectionPhoto[]>([]);
  photosRef.current = photos;
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const createInspection = useCreateReceivingInspection();
  const { toast } = useToast();

  // W5-T2 — the PO's linked FF&E lines for the per-item receipt section.
  const itemsQuery = useProcurementItems({ purchaseOrderId });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  // Reset form whenever the drawer reopens for a new PO.
  useEffect(() => {
    if (!open) return;
    setOutcome('clean');
    setOutcomeTouched(false);
    setNotes('');
    setReceived({});
    setSubmitError(null);
    setConditions({});
    setNotedOnBol({});
    setRoomSplits({});
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setPhotoError(null);
  }, [open, purchaseOrderId]);

  // Previews are object URLs: released on removal, reset and unmount.
  useEffect(
    () => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)),
    [],
  );
  const removePhoto = (assetId: string) =>
    setPhotos((prev) =>
      prev.filter((p) => {
        if (p.assetId === assetId) URL.revokeObjectURL(p.previewUrl);
        return p.assetId !== assetId;
      }),
    );

  const receivedFor = (itemId: string, ordered: number): number =>
    received[itemId] ?? ordered;
  const conditionFor = (itemId: string): LineCondition => conditions[itemId] ?? 'good';

  const suggestedOutcome = useMemo<ReceivingInspectionOutcome>(() => {
    if (items.some((it) => ['damaged', 'wrong'].includes(conditionFor(it.id)))) {
      return 'damaged';
    }
    if (
      items.some(
        (it) =>
          conditionFor(it.id) === 'short' || receivedFor(it.id, it.quantity) < it.quantity,
      )
    ) {
      return 'partial';
    }
    return 'clean';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, received, conditions]);

  // Suggest the outcome from the lines while the designer hasn't explicitly
  // chosen one. An explicit click (outcomeTouched) always wins.
  useEffect(() => {
    if (!open || outcomeTouched) return;
    setOutcome(suggestedOutcome);
  }, [open, outcomeTouched, suggestedOutcome]);

  // The PO's project: its lines name it; the caller's stands in while they load.
  const poProjectId = items[0]?.project_id ?? projectId;

  // T-54 — the rooms each placed line is in, in placement order, with what
  // earlier deliveries already brought them (00754).
  const placementsQuery = useProjectRoomPlacements(poProjectId ?? null);
  const projectRoomsQuery = useProjectRooms(poProjectId ?? '');
  const placementsByLine = useMemo(() => {
    const onPo = new Set(items.map((it) => it.id));
    const byLine = new Map<string, FfeRoomPlacement[]>();
    for (const placement of placementsQuery.data ?? []) {
      if (!onPo.has(placement.ffeItemId)) continue;
      byLine.set(placement.ffeItemId, [...(byLine.get(placement.ffeItemId) ?? []), placement]);
    }
    for (const [lineId, placements] of byLine) {
      if (placements.length < 2) byLine.delete(lineId);
      else placements.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return byLine;
  }, [items, placementsQuery.data]);
  const roomedPlacementIds = useMemo(
    () => [...placementsByLine.values()].flat().map((placement) => placement.id),
    [placementsByLine],
  );
  const earlierReceipts = useFfePlacementReceipts(roomedPlacementIds);
  const roomsFor = (itemId: string): ReceiptRoom[] => {
    const placements = placementsByLine.get(itemId);
    // Until the earlier receipts are read, ask nothing: the server fills.
    if (!placements || !earlierReceipts.data) return [];
    const roomNames = new Map<string, string>(
      ((projectRoomsQuery.data ?? []) as Array<{ id: string; name: string }>).map((room) => [
        room.id,
        room.name,
      ]),
    );
    return placements.map((placement) => ({
      placementId: placement.id,
      roomName: roomNames.get(placement.projectRoomId) ?? 'Room',
      placed: placement.quantity,
      received: earlierReceipts.data?.[placement.id] ?? 0,
    }));
  };
  // This delivery's count for a line: the received count less earlier ones.
  const receiptFor = (it: { id: string; quantity: number; received_quantity?: number | null }) =>
    receivedFor(it.id, it.quantity) - (it.received_quantity ?? 0);
  const splitFor = (it: { id: string; quantity: number; received_quantity?: number | null }) =>
    roomSplits[it.id] ?? fillReceiptRooms(roomsFor(it.id), receiptFor(it));

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!poProjectId) {
      setPhotoError('The order is still loading. Add the photos again in a moment.');
      return;
    }
    setPhotoError(null);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const assetId = await uploadInspectionPhoto(file, poProjectId);
        setPhotos((prev) => [
          ...prev,
          { assetId, name: file.name, previewUrl: URL.createObjectURL(file) },
        ]);
      } catch (e) {
        setPhotoError((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const busy = createInspection.isPending || uploading > 0;

  const handleSubmit = async () => {
    setSubmitError(null);
    const flaggedItemIds = items
      .filter((it) => conditionFor(it.id) !== 'good')
      .map((it) => it.id);
    if (outcome === 'clean' && flaggedItemIds.length > 0) {
      setSubmitError('A clean receipt needs every line in good condition.');
      return;
    }
    // T-54 — a placed line's rooms add up to its delivery.
    const roomedLines = items
      .map((it) => ({ it, rooms: roomsFor(it.id), receipt: receiptFor(it) }))
      .filter(({ rooms, receipt }) => rooms.length >= 2 && receipt > 0);
    for (const { it, rooms, receipt } of roomedLines) {
      const problem = receiptRoomsProblem(rooms, receipt, splitFor(it));
      if (problem) {
        setSubmitError(`${it.name}: ${problem}`);
        return;
      }
    }
    const placementsFor = (itemId: string) => {
      const line = roomedLines.find(({ it }) => it.id === itemId);
      if (!line) return undefined;
      const split = splitFor(line.it);
      return line.rooms
        .filter((room) => (split[room.placementId] ?? 0) > 0)
        .map((room) => ({ placementId: room.placementId, quantity: split[room.placementId] }));
    };
    try {
      const photoAssetIds = photos.map((p) => p.assetId);
      const result = await createInspection.mutateAsync({
        purchaseOrderId,
        projectId,
        outcome,
        notes: notes.trim() ? notes.trim() : undefined,
        photoAssetIds,
        // C-19 — every line carries its count, condition and BOL note, so
        // the hook records the check-in through record_project_ffe_inspection.
        items:
          items.length > 0
            ? items.map((it) => {
                const placements = placementsFor(it.id);
                return {
                  ffeItemId: it.id,
                  receivedQuantity: receivedFor(it.id, it.quantity),
                  orderedQuantity: it.quantity,
                  condition: conditionFor(it.id),
                  notedOnBol: notedOnBol[it.id] ?? false,
                  // T-54 — the rooms this delivery covers (00756).
                  ...(placements ? { placements } : {}),
                };
              })
            : undefined,
        // R7 (The Document) — item-grain claim attribution: one drafted
        // claim per line not in good condition; those lines carry the stamp.
        damagedFfeItemIds:
          outcome !== 'clean' && flaggedItemIds.length > 0 ? flaggedItemIds : undefined,
      });

      procurementEvents.inspectionLogged({
        outcome,
        has_photos: photoAssetIds.length > 0,
      });
      // Fire procurement_damage_claim_created only when the damage_claim
      // INSERT actually succeeded. Previously this fired on `outcome !== 'clean'`,
      // which double-counted in the compensating-delete path: when step 4
      // failed, the hook deleted the inspection AND threw, but the event
      // had already fired purely on outcome. Now the hook's resolved value
      // carries `damageClaimCreated`, which is `true` only after a clean
      // damage_claims INSERT (W3.5.5 HIGH-1).
      if (result.damageClaimCreated) {
        procurementEvents.damageClaimCreated({ outcome });
      }

      const successMsg =
        outcome === 'clean'
          ? `Inspection logged — ${poLabel} cleared.`
          : outcome === 'damaged'
            ? `Inspection logged — damage claim drafted for ${vendorName}.`
            : `Inspection logged — partial delivery noted for ${vendorName}.`;
      toast(successMsg, outcome === 'clean' ? 'success' : 'warning');
      onOpenChange(false);
    } catch (e) {
      setSubmitError((e as Error)?.message ?? 'Failed to log inspection.');
    }
  };

  // Portal to document.body (as OrderAssistant does): rendered inline from the
  // line unfold, /doc's stacking context capped the panel's z-50 beneath the
  // fixed z-40 Studio drawer, which swallowed clicks on the footer.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => !createInspection.isPending && onOpenChange(false)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Log inspection for ${poLabel}`}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[440px] max-w-[92vw] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4">
              <div className="min-w-0">
                <div className="type-meta-small text-[var(--color-clay-ink)]">
                  Log inspection
                </div>
                <div className="mt-0.5 truncate font-heading text-[1rem] font-medium text-[var(--text-primary)]">
                  {poLabel}
                </div>
                <div className="type-meta-small text-[var(--text-muted)]">
                  {vendorName} · {projectName}
                </div>
              </div>
              <IconButton
                label="Close"
                onClick={() => !createInspection.isPending && onOpenChange(false)}
                disabled={createInspection.isPending}
                size="sm"
              >
                <X size={18} />
              </IconButton>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mb-5">
                <div
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Outcome
                </div>
                <div className="flex flex-col gap-2">
                  {OUTCOME_OPTIONS.map((opt) => {
                    const isActive = outcome === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setOutcome(opt.value);
                          setOutcomeTouched(true);
                        }}
                        className="flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors"
                        style={{
                          borderColor: isActive ? opt.accent : 'var(--border-default)',
                          background: isActive
                            ? `color-mix(in srgb, ${opt.accent} 7%, transparent)`
                            : 'transparent',
                        }}
                      >
                        <span
                          className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            background: isActive ? opt.accent : 'transparent',
                            border: `1px solid ${isActive ? opt.accent : 'var(--border-default)'}`,
                          }}
                          aria-hidden
                        />
                        <span className="flex-1">
                          <span className="block text-[0.85rem] font-medium text-[var(--text-primary)]">
                            {opt.label}
                          </span>
                          <span className="block text-[0.72rem] text-[var(--text-muted)]">
                            {opt.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* W5-T2 — per-item received counts. Defaults to the full
                  ordered quantity; lowering any count auto-suggests the
                  Partial outcome above (until the designer picks one). */}
              {itemsQuery.isLoading ? (
                <div className="mb-5 text-[0.72rem] italic text-[var(--text-muted)]">
                  Loading linked items…
                </div>
              ) : items.length > 0 ? (
                <div className="mb-5">
                  <div
                    className="mb-2"
                    style={{
                      fontFamily: 'var(--font-meta)',
                      fontSize: '0.6rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Items received
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((it) => {
                      const value = receivedFor(it.id, it.quantity);
                      const missing = it.quantity - value;
                      const condition = conditionFor(it.id);
                      return (
                        <div
                          key={it.id}
                          className="rounded-md border px-3 py-2"
                          style={{
                            borderColor:
                              condition === 'damaged' || condition === 'wrong'
                                ? 'var(--color-terracotta)'
                                : missing > 0 || condition === 'short'
                                  ? 'var(--color-golden-hour)'
                                  : 'var(--border-default)',
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[0.8rem] text-[var(--text-primary)]">
                                {it.name}
                              </div>
                              <div className="text-[0.65rem] text-[var(--text-muted)]">
                                {it.quantity} ordered
                                {missing > 0 && (
                                  <span style={{ color: 'var(--color-golden-hour)' }}>
                                    {' '}
                                    · {missing} missing
                                  </span>
                                )}
                              </div>
                            </div>
                            <Input
                              id={`received-qty-${it.id}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={it.quantity}
                              value={value}
                              disabled={createInspection.isPending}
                              aria-label={`Received quantity for ${it.name}`}
                              title={`Received quantity (0–${it.quantity})`}
                              onChange={(e) => {
                                const raw = Number.parseInt(e.target.value, 10);
                                const next = Number.isNaN(raw)
                                  ? 0
                                  : Math.max(0, Math.min(it.quantity, raw));
                                setReceived((prev) => ({ ...prev, [it.id]: next }));
                                // A new count re-spreads the rooms in order.
                                setRoomSplits(({ [it.id]: _dropped, ...rest }) => rest);
                              }}
                              className="w-[76px] text-right"
                            />
                          </div>
                          {/* C-19 — the line's condition, and the BOL note once
                              it is anything but good. */}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <Select
                              aria-label={`Condition of ${it.name}`}
                              value={condition}
                              disabled={createInspection.isPending}
                              onChange={(e) => {
                                const next = e.target.value as LineCondition;
                                setConditions((prev) => ({ ...prev, [it.id]: next }));
                                if (next === 'good') {
                                  setNotedOnBol((prev) => ({ ...prev, [it.id]: false }));
                                }
                              }}
                              wrapperClassName="w-[140px]"
                            >
                              {CONDITION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </Select>
                            {condition !== 'good' && (
                              <label className="flex min-h-11 items-center gap-2 text-[0.74rem] text-[var(--text-primary)]">
                                <input
                                  type="checkbox"
                                  checked={notedOnBol[it.id] ?? false}
                                  disabled={createInspection.isPending}
                                  onChange={(e) =>
                                    setNotedOnBol((prev) => ({
                                      ...prev,
                                      [it.id]: e.target.checked,
                                    }))
                                  }
                                />
                                Noted on the BOL
                              </label>
                            )}
                          </div>
                          {/* T-54 — a line in two or more rooms names them. */}
                          <ReceiptRoomsPrompt
                            lineName={it.name}
                            unit={it.unit}
                            rooms={roomsFor(it.id)}
                            receipt={receiptFor(it)}
                            split={splitFor(it)}
                            disabled={createInspection.isPending}
                            onChange={(split) =>
                              setRoomSplits((prev) => ({ ...prev, [it.id]: split }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[0.68rem] text-[var(--text-muted)]">
                    Short counts suggest a partial delivery. With a non-clean
                    outcome, each line not in good condition gets its own
                    drafted claim.
                  </p>
                </div>
              ) : null}

              <div className="mb-5">
                <label
                  htmlFor="inspection-notes"
                  className="mb-2 block"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Notes (optional)
                </label>
                <Textarea
                  id="inspection-notes"
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    outcome === 'clean'
                      ? 'e.g. All 3 pieces accounted for. Packaging intact.'
                      : outcome === 'damaged'
                        ? 'e.g. Chip on canopy of pendant cluster. Estimated 2cm chip.'
                        : 'e.g. 2 of 3 chairs delivered; one back-ordered.'
                  }
                />
              </div>

              {/* C-19 — desktop photos, uploaded through the media proxy as
                  they are chosen; the inspection carries their asset ids. */}
              <div>
                <label
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-dashed px-4 py-2 text-[0.75rem] font-medium text-[var(--text-primary)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent-primary)]"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  {uploading > 0 ? 'Uploading photos…' : 'Add photos'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    multiple
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      void addPhotos(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                {photos.length > 0 && (
                  <ul aria-label="Photos to attach" className="mt-2 flex flex-wrap gap-2">
                    {photos.map((p) => (
                      <li key={p.assetId} className="relative">
                        <img
                          src={p.previewUrl}
                          alt={p.name}
                          className="h-14 w-14 rounded-[3px] border object-cover"
                          style={{ borderColor: 'var(--border-default)' }}
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(p.assetId)}
                          disabled={createInspection.isPending}
                          aria-label={`Remove ${p.name}`}
                          className="absolute -right-4 -top-4 flex h-11 w-11 items-center justify-center"
                        >
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-full border bg-[var(--bg-surface)] text-[var(--text-muted)]"
                            style={{ borderColor: 'var(--border-default)' }}
                          >
                            <X size={12} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {photoError && (
                  <p role="alert" className="mt-2 text-[0.72rem] text-[var(--color-terracotta-ink)]">
                    {photoError}
                  </p>
                )}
              </div>

              {submitError && (
                <div
                  className="mt-4 rounded-md border px-3 py-2 text-[0.75rem]"
                  style={{
                    borderColor: 'var(--color-terracotta)',
                    background: 'rgba(212,160,144,0.10)',
                    color: 'var(--color-terracotta-ink)',
                  }}
                  role="alert"
                >
                  {submitError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border-default)] px-5 py-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={createInspection.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={busy}
                loading={createInspection.isPending}
              >
                Log inspection
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default LogInspectionDrawer;
