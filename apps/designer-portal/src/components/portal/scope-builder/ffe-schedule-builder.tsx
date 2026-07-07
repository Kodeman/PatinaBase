'use client';

import { useState, useMemo, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, IconButton, Input, Select, Textarea } from '@/components/ui/controls';
import { BulkActionBar, BulkActionButton } from '@/components/portal/bulk-action-bar';
import { proposalEvents } from '@/lib/analytics';
import {
  useProposalScopeRooms,
  useFFECategories,
  useConsumeCapture,
  useReorderProposalItems,
  useReorderProposalScopeRooms,
  createBrowserClient,
  type ProposalItemType,
} from '@patina/supabase';
import {
  useAddProposalItem,
  useUpdateProposalItem,
  useRemoveProposalItem,
} from '@/hooks/use-proposals';
import { type ProductPickResult } from '@/components/portal/proposals/product-picker-modal';
import { FFEItemCard } from '@/components/portal/ffe/ffe-item-card';
import {
  AddFFEItemControls,
  type AddFFEItemControlsHandle,
} from '@/components/portal/ffe/add-ffe-item-controls';
import {
  type AllowanceFormState,
  type TbdFormState,
} from '@/components/portal/ffe/ffe-item-forms';
import {
  CaptureInbox,
  parseCaptureDraggableId,
} from '@/components/portal/proposals/capture-inbox';
import { LeadTimeSelect } from '@/components/portal/ffe/lead-time-select';
import { LEAD_TIME_BUCKETS, leadTimeLabel } from '@/lib/scope/lead-time';
import { resolveDocCode } from '@/lib/scope/doc-code';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FFEItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number; // cents (trade)
  unit_sell_price: number; // cents (client)
  markup_percent: number | null;
  line_total_cents: number;
  notes: string | null;
  internal_notes: string | null;
  category: string | null;
  vendor_name: string | null;
  position: number;
  scope_room_id: string | null;
  product_id: string | null;
  image_url: string | null;
  item_type: ProposalItemType;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  ffe_category: string | null;
  // Schedule & Boards Wave 1 — spec instrument
  doc_code: string | null;
  lead_time_weeks: number | null;
}

interface ScopeRoom {
  id: string;
  name: string;
  ffe_categories: string[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

// Item-type chip styling/labels now live in the shared FFEItemCard.

function categoryLabel(slug: string | null, lookup: Map<string, string>): string {
  if (!slug) return '';
  return lookup.get(slug) ?? slug;
}


// ─── Inline item edit form ───────────────────────────────────────────────────
//
// Toggled from a row's pencil affordance. Field set is gated by item_type and
// mirrors the Allowance/TBD/fixed add-form layouts. On save we pass plain field
// updates to useUpdateProposalItem — the hook recomputes line_total_cents, so
// we never compute it here.
// ═══════════════════════════════════════════════════════════════════════════

function ItemEditForm({
  item,
  proposalId,
  rooms,
  categories,
  onDone,
}: {
  item: FFEItem;
  proposalId: string;
  rooms: ScopeRoom[];
  categories: Array<{ slug: string; label: string }>;
  onDone: () => void;
}) {
  const updateItem = useUpdateProposalItem();

  const [name, setName] = useState(item.name ?? '');
  const [qty, setQty] = useState(String(item.quantity ?? 1));
  const [priceDollars, setPriceDollars] = useState(
    item.unit_price ? String(item.unit_price / 100) : ''
  );
  const [ffeCategory, setFfeCategory] = useState(item.ffe_category ?? '');
  const [scopeRoomId, setScopeRoomId] = useState(item.scope_room_id ?? '');
  const [minDollars, setMinDollars] = useState(
    typeof item.budget_min_cents === 'number' ? String(item.budget_min_cents / 100) : ''
  );
  const [maxDollars, setMaxDollars] = useState(
    typeof item.budget_max_cents === 'number' ? String(item.budget_max_cents / 100) : ''
  );
  const [notes, setNotes] = useState(item.notes ?? '');
  // S1/S2 — spec doc code (free text, mono) + lead-time bucket.
  const [docCode, setDocCode] = useState(item.doc_code ?? '');
  const [leadTimeWeeks, setLeadTimeWeeks] = useState<number | null>(
    typeof item.lead_time_weeks === 'number' ? item.lead_time_weeks : null
  );

  const minN = parseFloat(minDollars);
  const maxN = parseFloat(maxDollars);
  const rangeOk =
    !Number.isNaN(minN) && !Number.isNaN(maxN) && minN >= 0 && maxN >= 0 && minN <= maxN;

  const canSave =
    item.item_type === 'fixed'
      ? !!name.trim()
      : item.item_type === 'allowance'
        ? !!ffeCategory && rangeOk
        : !!ffeCategory; // tbd

  const handleSave = () => {
    // Build a type-gated update payload. Do NOT compute line_total_cents — the
    // hook recomputes it from the merged row.
    let updates: Record<string, unknown>;
    if (item.item_type === 'fixed') {
      updates = {
        name: name.trim(),
        quantity: Math.max(1, Math.floor(Number(qty) || 1)),
        unit_price: Math.round(parseFloat(priceDollars || '0') * 100),
        scope_room_id: scopeRoomId || null,
        ffe_category: ffeCategory || null,
        notes: notes || null,
      };
    } else if (item.item_type === 'allowance') {
      updates = {
        ffe_category: ffeCategory,
        scope_room_id: scopeRoomId || null,
        budget_min_cents: Math.round(parseFloat(minDollars || '0') * 100),
        budget_max_cents: Math.round(parseFloat(maxDollars || '0') * 100),
        notes: notes || null,
      };
    } else {
      // tbd
      updates = {
        ffe_category: ffeCategory,
        scope_room_id: scopeRoomId || null,
        notes: notes || null,
      };
    }

    // Spec fields apply to every item type. doc_code is free text (the
    // designer's own code wins); lead_time_weeks stores the bucket bound.
    updates.doc_code = docCode.trim() || null;
    updates.lead_time_weeks = leadTimeWeeks;

    updateItem.mutate(
      { itemId: item.id, proposalId, updates },
      { onSuccess: onDone }
    );
  };

  const isSaving = updateItem.isPending;

  return (
    <div className="my-2 space-y-3 rounded-md border border-[var(--accent-primary)] p-4">
      {/* Fixed: name + qty + price */}
      {item.item_type === 'fixed' && (
        <>
          <label className="block">
            <span className="type-meta mb-1 block">Name *</span>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name"
            />
          </label>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="block">
              <span className="type-meta mb-1 block">Qty</span>
              <Input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="type-meta mb-1 block">Unit Price</span>
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
                  value={priceDollars}
                  onChange={(e) => setPriceDollars(e.target.value)}
                  placeholder="0"
                  className="pl-7"
                />
              </div>
            </label>
          </div>
        </>
      )}

      {/* Category + Room — category required for allowance/tbd, optional for fixed */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">
            Category{item.item_type === 'fixed' ? '' : ' *'}
          </span>
          <Select
            value={ffeCategory}
            onChange={(e) => setFfeCategory(e.target.value)}
          >
            <option value="">{item.item_type === 'fixed' ? 'None' : 'Select…'}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className="type-meta mb-1 block">Room</span>
          <Select
            value={scopeRoomId}
            onChange={(e) => setScopeRoomId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Spec instrument (S1/S2): doc code (mono, free text) + lead-time bucket */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Doc code</span>
          <Input
            type="text"
            value={docCode}
            onChange={(e) => setDocCode(e.target.value)}
            placeholder="CH-01"
            className="font-mono uppercase"
          />
        </label>
        <label className="block">
          <span className="type-meta mb-1 block">Lead time</span>
          <LeadTimeSelect value={leadTimeWeeks} onChange={setLeadTimeWeeks} />
        </label>
      </div>

      {/* Allowance: min/max range */}
      {item.item_type === 'allowance' && (
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="block">
            <span className="type-meta mb-1 block">Min *</span>
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
                value={minDollars}
                onChange={(e) => setMinDollars(e.target.value)}
                placeholder="0"
                className="pl-7"
              />
            </div>
          </label>
          <label className="block">
            <span className="type-meta mb-1 block">Max *</span>
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
                value={maxDollars}
                onChange={(e) => setMaxDollars(e.target.value)}
                placeholder="0"
                className="pl-7"
              />
            </div>
          </label>
        </div>
      )}

      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="resize-none"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!canSave || isSaving}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Item row ────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  proposalId,
  rooms,
  categories,
  categoryLookup,
  isEditing,
  onStartEdit,
  onStopEdit,
  dragHandle,
  selected,
  onToggleSelect,
  onOpenDetail,
  twinChip,
}: {
  item: FFEItem;
  proposalId: string;
  rooms: ScopeRoom[];
  categories: Array<{ slug: string; label: string }>;
  categoryLookup: Map<string, string>;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  dragHandle?: ReactNode;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpenDetail?: () => void;
  twinChip?: ReactNode;
}) {
  const removeItem = useRemoveProposalItem();
  const lineCost = item.unit_price * item.quantity;

  const rangeText =
    item.item_type === 'allowance' &&
    typeof item.budget_min_cents === 'number' &&
    typeof item.budget_max_cents === 'number'
      ? `${formatDollars(item.budget_min_cents)} – ${formatDollars(item.budget_max_cents)}`
      : null;

  const handleRemove = () => {
    removeItem.mutate({ itemId: item.id, proposalId });
  };

  const subtitle = item.vendor_name
    ? item.vendor_name
    : item.ffe_category
      ? categoryLabel(item.ffe_category, categoryLookup)
      : null;

  if (isEditing) {
    return (
      <ItemEditForm
        item={item}
        proposalId={proposalId}
        rooms={rooms}
        categories={categories}
        onDone={onStopEdit}
      />
    );
  }

  const displayName = item.name || categoryLabel(item.ffe_category, categoryLookup) || 'Untitled';
  const unitTotalLabel =
    item.item_type === 'allowance' && rangeText
      ? rangeText
      : lineCost > 0
        ? formatDollars(lineCost)
        : '—';

  return (
    <div className="flex flex-col gap-1">
      <FFEItemCard
        name={displayName}
        vendorName={subtitle}
        docCode={item.doc_code}
        leadTimeLabel={leadTimeLabel(item.lead_time_weeks)}
        quantity={item.item_type === 'tbd' ? null : item.quantity}
        unitTotalLabel={unitTotalLabel}
        itemType={item.item_type}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onOpenDetail={onOpenDetail}
        actions={
          <>
            {dragHandle}
            <IconButton
              label="Edit item"
              variant="ghost"
              size="sm"
              onClick={onStartEdit}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </IconButton>
            <IconButton
              label="Remove item"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={removeItem.isPending}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </IconButton>
          </>
        }
      />
      {twinChip}
    </div>
  );
}


// ─── Drop target ─────────────────────────────────────────────────────────────

const ROOM_DROPPABLE_PREFIX = 'ffe-schedule-room:';
const UNASSIGNED_DROPPABLE_ID = 'ffe-schedule-unassigned';

function roomDroppableId(roomId: string): string {
  return `${ROOM_DROPPABLE_PREFIX}${roomId}`;
}

function parseRoomDroppableId(id: string | number | null | undefined): string | null {
  if (typeof id !== 'string') return null;
  if (id === UNASSIGNED_DROPPABLE_ID) return null;
  if (!id.startsWith(ROOM_DROPPABLE_PREFIX)) return null;
  const rest = id.slice(ROOM_DROPPABLE_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

function isFFEScheduleDroppable(id: string | number | null | undefined): boolean {
  if (typeof id !== 'string') return false;
  return id === UNASSIGNED_DROPPABLE_ID || id.startsWith(ROOM_DROPPABLE_PREFIX);
}

function RoomDropZone({
  droppableId,
  children,
}: {
  droppableId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md transition-colors ${
        isOver ? 'bg-[rgba(122,155,118,0.06)]' : ''
      }`}
      style={{
        outline: isOver ? '1px solid var(--accent-primary)' : 'none',
        outlineOffset: isOver ? '-1px' : undefined,
      }}
    >
      {children}
    </div>
  );
}

// ─── Sortable item wrapper (S3) ──────────────────────────────────────────────
//
// Grid cell + useSortable. The drag affordance is a dedicated handle (grip)
// rendered into the card's hover action cluster via a render-prop, so clicks
// on the checkbox / edit / remove / unfold never start a drag.

function SortableScheduleItem({
  id,
  disabled,
  spanFull,
  children,
}: {
  id: string;
  disabled?: boolean;
  /** Editing / unfolded rows span the whole grid row. */
  spanFull?: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const handle = disabled ? null : (
    <button
      type="button"
      aria-label="Reorder item"
      className="cursor-grab rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="9" cy="5" r="1.6" />
        <circle cx="15" cy="5" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="19" r="1.6" />
        <circle cx="15" cy="19" r="1.6" />
      </svg>
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        gridColumn: spanFull ? '1 / -1' : undefined,
        opacity: isDragging ? 0.4 : undefined,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
    >
      {children(handle)}
    </div>
  );
}

// ─── Category prompt modal ───────────────────────────────────────────────────
//
// Shown after a capture is dropped on a room: forces the designer to pick
// the FF&E category before consume_capture is called (the RPC requires
// it).
// ═══════════════════════════════════════════════════════════════════════════

function CategoryPromptModal({
  open,
  roomName,
  categories,
  isSaving,
  errorMessage,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  roomName: string;
  categories: Array<{ slug: string; label: string }>;
  isSaving: boolean;
  errorMessage: string | null;
  onConfirm: (categorySlug: string, qty: number) => void;
  onCancel: () => void;
}) {
  const [slug, setSlug] = useState('');
  const [qty, setQty] = useState('1');

  // Reset on open.
  useMemo(() => {
    if (open) {
      setSlug('');
      setQty('1');
    }
  }, [open]);

  if (!open) return null;

  const parsedQty = Math.max(1, Math.floor(Number(qty) || 1));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-drop-title"
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[480px] rounded-md border-2 bg-[var(--bg-surface)] p-6"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h3 id="capture-drop-title" className="type-section-head" style={{ fontSize: '1.05rem' }}>
            Add capture to {roomName}
          </h3>
          <IconButton
            label="Cancel"
            variant="ghost"
            size="sm"
            onClick={onCancel}
          >
            ×
          </IconButton>
        </div>
        <p
          className="mb-3"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          Pick an FF&amp;E category for this line item. We&apos;ll add it to the
          schedule as a fixed item.
        </p>

        <div className="grid gap-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <label className="block">
            <span className="type-meta mb-1 block">Category *</span>
            <Select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="type-meta mb-1 block">Qty</span>
            <Input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="primary"
            onClick={() => onConfirm(slug, parsedQty)}
            disabled={!slug || isSaving}
          >
            {isSaving ? 'Adding…' : 'Add to schedule'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface FFEScheduleBuilderProps {
  proposalId: string;
}

interface CaptureDropContext {
  captureId: string;
  scopeRoomId: string;
  roomName: string;
}

export function FFEScheduleBuilder({ proposalId }: FFEScheduleBuilderProps) {
  const { data: rooms = [] } = useProposalScopeRooms(proposalId);
  const { data: categories = [] } = useFFECategories({ proposalId });

  const addItem = useAddProposalItem();
  const consumeCapture = useConsumeCapture();
  const [captureDrop, setCaptureDrop] = useState<CaptureDropContext | null>(null);
  const [captureDropError, setCaptureDropError] = useState<string | null>(null);
  // Only one row may be in inline-edit mode at a time.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // The shared Add controls own the picker + allowance/TBD forms; per-room
  // "+ Add Item" links open its picker pre-targeted via the imperative handle.
  const addControlsRef = useRef<AddFFEItemControlsHandle>(null);

  const { data: items = [], isLoading } = useProposalItems(proposalId);

  const typedRooms = rooms as ScopeRoom[];

  // ── S3 — drag reorder + selection / bulk bar ──────────────────────────────
  const reorderItems = useReorderProposalItems();
  const updateItem = useUpdateProposalItem();
  const removeItem = useRemoveProposalItem();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  // A drag starts only after 6px of travel, so plain clicks on the handle's
  // neighbors (checkbox, edit, remove, unfold) stay clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Apply one field-update to every selected line. Errors surface inline
  // (R83) — never a toast — and the selection survives a failure so the
  // designer can retry.
  const bulkUpdate = async (updates: Record<string, unknown>) => {
    setBulkError(null);
    try {
      await Promise.all(
        [...selected].map((itemId) => updateItem.mutateAsync({ itemId, proposalId, updates }))
      );
      setSelected(new Set());
    } catch (err) {
      setBulkError(
        err instanceof Error ? err.message : 'Some lines could not be updated — try again.'
      );
    }
  };

  const bulkDelete = async () => {
    setBulkError(null);
    try {
      await Promise.all(
        [...selected].map((itemId) => removeItem.mutateAsync({ itemId, proposalId }))
      );
      setSelected(new Set());
    } catch (err) {
      setBulkError(
        err instanceof Error ? err.message : 'Some lines could not be removed — try again.'
      );
    }
  };

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.slug, c.label);
    return map;
  }, [categories]);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ slug: c.slug, label: c.label })),
    [categories]
  );

  // S1 — every doc code already in this document, for auto-suggest sequencing.
  const existingDocCodes = useMemo(
    () => (items as FFEItem[]).map((i) => i.doc_code),
    [items]
  );

  // Group items by room.
  const grouped = useMemo(() => {
    const typedItems = items as FFEItem[];
    const groups: Record<string, { roomName: string; items: FFEItem[] }> = {};

    const unassigned = typedItems.filter((i) => !i.scope_room_id);
    if (unassigned.length > 0) {
      groups['__unassigned'] = { roomName: 'Unassigned', items: unassigned };
    }

    for (const room of typedRooms) {
      const roomItems = typedItems.filter((i) => i.scope_room_id === room.id);
      if (roomItems.length > 0) {
        groups[room.id] = { roomName: room.name, items: roomItems };
      }
    }
    return groups;
  }, [items, typedRooms]);

  const totalEstimate = useMemo(() => {
    return (items as FFEItem[]).reduce((sum, i) => {
      if (i.item_type === 'fixed') return sum + (i.unit_price || 0) * (i.quantity || 1);
      // For allowances, take the midpoint of min/max as the "expected".
      if (
        i.item_type === 'allowance' &&
        typeof i.budget_min_cents === 'number' &&
        typeof i.budget_max_cents === 'number'
      ) {
        return sum + Math.round((i.budget_min_cents + i.budget_max_cents) / 2);
      }
      return sum;
    }, 0);
  }, [items]);

  // Picked from the catalog → add a fixed proposal_item directly from the
  // denormalized pick result (the result already carries name/price/vendor, so
  // no follow-up product fetch is needed). priceCents is already cents.
  const handleAddProduct = (r: ProductPickResult, ffeCategorySlug: string | null) =>
    addItem
      .mutateAsync({
        proposalId,
        productId: r.productId,
        name: r.name,
        quantity: 1,
        unitPrice: r.priceCents ?? 0,
        vendorName: r.vendorName ?? undefined,
        itemType: 'fixed',
        scopeRoomId: r.scopeRoomId,
        ffeCategory: ffeCategorySlug ?? undefined,
        // S1 — auto-suggest a spec code on add (prefix from category, else name).
        docCode: resolveDocCode(null, ffeCategorySlug, existingDocCodes, r.name),
      })
      .then(() => {
        proposalEvents.itemAdded({
          proposalId,
          itemType: 'fixed',
          hasProduct: true,
          lineTotal: r.priceCents ?? 0,
        });
      });

  const handleAllowanceSave = (form: AllowanceFormState) => {
    const budgetMin = Math.round(parseFloat(form.minDollars || '0') * 100);
    const budgetMax = Math.round(parseFloat(form.maxDollars || '0') * 100);
    return addItem
      .mutateAsync({
        proposalId,
        name: categoryLookup.get(form.ffeCategory) ?? form.ffeCategory,
        quantity: 1,
        unitPrice: 0,
        notes: form.notes || undefined,
        itemType: 'allowance',
        scopeRoomId: form.scopeRoomId || null,
        ffeCategory: form.ffeCategory,
        budgetMinCents: budgetMin,
        budgetMaxCents: budgetMax,
        docCode: resolveDocCode(null, form.ffeCategory, existingDocCodes, form.ffeCategory),
      })
      .then(() => {
        proposalEvents.itemAdded({
          proposalId,
          itemType: 'allowance',
          hasProduct: false,
          lineTotal: Math.round((budgetMin + budgetMax) / 2),
        });
      });
  };

  const handleTbdSave = (form: TbdFormState) =>
    addItem
      .mutateAsync({
        proposalId,
        name: categoryLookup.get(form.ffeCategory) ?? form.ffeCategory,
        quantity: 1,
        unitPrice: 0,
        notes: form.notes || undefined,
        itemType: 'tbd',
        scopeRoomId: form.scopeRoomId || null,
        ffeCategory: form.ffeCategory,
        docCode: resolveDocCode(null, form.ffeCategory, existingDocCodes, form.ffeCategory),
      })
      .then(() => {
        proposalEvents.itemAdded({ proposalId, itemType: 'tbd', hasProduct: false, lineTotal: 0 });
      });

  // One DndContext serves two drag species: capture cards dropped onto room
  // zones (existing) and schedule lines sorted within a room (S3). Lines are
  // told apart by their raw uuid ids living in the loaded item set.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    // ── S3: sort a line within its room ──
    const typedItems = items as FFEItem[];
    const activeItem =
      typeof active.id === 'string' ? typedItems.find((i) => i.id === active.id) : undefined;
    if (activeItem) {
      const overItem =
        typeof over.id === 'string' ? typedItems.find((i) => i.id === over.id) : undefined;
      // Same-room sorts only — cross-room moves go through the edit form /
      // bulk bar, keeping the drop-zone semantics reserved for captures.
      if (!overItem || overItem.id === activeItem.id) return;
      if ((overItem.scope_room_id ?? null) !== (activeItem.scope_room_id ?? null)) return;

      // Rebuild the GLOBAL order from the display groups, with the active
      // line moved to the over line's slot inside its room. The RPC rewrites
      // position = array index for every id, normalizing 0..n-1.
      const orderedIds: string[] = [];
      for (const group of Object.values(grouped)) {
        const ids = group.items.map((i) => i.id);
        const from = ids.indexOf(activeItem.id);
        const to = ids.indexOf(overItem.id);
        if (from !== -1 && to !== -1) {
          ids.splice(from, 1);
          ids.splice(to, 0, activeItem.id);
        }
        orderedIds.push(...ids);
      }
      reorderItems.mutate({ proposalId, orderedIds });
      return;
    }

    // ── Existing: capture dropped onto a room zone ──
    if (!isFFEScheduleDroppable(over.id)) return;
    const captureId = parseCaptureDraggableId(active.id);
    if (!captureId) return;

    // Drops on the unassigned zone require an explicit room; reject for now.
    const scopeRoomId = parseRoomDroppableId(over.id);
    if (!scopeRoomId) return;

    const room = typedRooms.find((r) => r.id === scopeRoomId);
    if (!room) return;

    setCaptureDropError(null);
    setCaptureDrop({ captureId, scopeRoomId, roomName: room.name });
  };

  const handleConfirmCaptureDrop = (categorySlug: string, qty: number) => {
    if (!captureDrop) return;
    setCaptureDropError(null);
    consumeCapture.mutate(
      {
        captureId: captureDrop.captureId,
        proposalId,
        scopeRoomId: captureDrop.scopeRoomId,
        ffeCategorySlug: categorySlug,
        qty,
      },
      {
        onSuccess: () => {
          setCaptureDrop(null);
        },
        onError: (err) => {
          setCaptureDropError(
            err instanceof Error ? err.message : 'Failed to add capture to schedule'
          );
        },
      }
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <div>
      {/* The "Preliminary FF&E Schedule" heading + description are rendered by
          ScopeBuilderShell. We only render the live item-count / estimated-total
          summary here to avoid a duplicate heading. */}
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
          marginBottom: '0.75rem',
        }}
      >
        {(items as FFEItem[]).length} items
        {totalEstimate > 0 ? ` · Est. total: ${formatDollars(totalEstimate)}` : ''}
      </div>

      {/* R83 — bulk-action failures land inline at the schedule, never a toast. */}
      {bulkError && (
        <p
          role="alert"
          className="mb-3 rounded-sm border px-3 py-2"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: '#C4836F',
            borderColor: 'rgba(196,131,111,0.4)',
          }}
        >
          {bulkError}
        </p>
      )}

      {isLoading && (
        <div
          className="py-8 text-center"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          Loading schedule…
        </div>
      )}

      {/* Render groups for rooms that already have items, wrapped in droppables. */}
      {Object.entries(grouped).map(([groupId, group]) => {
        const droppableId =
          groupId === '__unassigned' ? UNASSIGNED_DROPPABLE_ID : roomDroppableId(groupId);
        const groupRoomId = groupId === '__unassigned' ? null : groupId;
        return (
          <RoomDropZone key={groupId} droppableId={droppableId}>
            <div>
              <div className="mb-1 mt-3 flex items-center justify-between gap-2">
                <div
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.62rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-clay)',
                  }}
                >
                  {group.roomName}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addControlsRef.current?.openProduct(groupRoomId)}
                >
                  + Add Item
                </Button>
              </div>

              <SortableContext
                items={group.items.map((i) => i.id)}
                strategy={rectSortingStrategy}
              >
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
                >
                  {group.items.map((item) => {
                    const editing = editingItemId === item.id;
                    return (
                      <SortableScheduleItem
                        key={item.id}
                        id={item.id}
                        disabled={editing}
                        spanFull={editing}
                      >
                        {(dragHandle) => (
                          <ItemRow
                            item={item}
                            proposalId={proposalId}
                            rooms={typedRooms}
                            categories={categoryOptions}
                            categoryLookup={categoryLookup}
                            isEditing={editing}
                            onStartEdit={() => setEditingItemId(item.id)}
                            onStopEdit={() => setEditingItemId(null)}
                            dragHandle={dragHandle}
                            selected={selected.has(item.id)}
                            onToggleSelect={() => toggleSelect(item.id)}
                          />
                        )}
                      </SortableScheduleItem>
                    );
                  })}
                </div>
              </SortableContext>
            </div>
          </RoomDropZone>
        );
      })}

      {/* Empty room droppables — surface a drop target for any scope_rooms
          that don't yet have any items so the designer can drag captures
          straight into them. */}
      {typedRooms
        .filter((room) => !grouped[room.id])
        .map((room) => (
          <RoomDropZone key={`empty-${room.id}`} droppableId={roomDroppableId(room.id)}>
            <div className="mt-3 rounded-md border border-dashed px-3 py-3" style={{ borderColor: 'var(--border-default)' }}>
              <div className="flex items-center justify-between gap-2">
                <div
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.62rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-clay)',
                  }}
                >
                  {room.name}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addControlsRef.current?.openProduct(room.id)}
                >
                  + Add Item
                </Button>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.25rem',
                }}
              >
                Drop a capture here, or use + Add Item.
              </div>
            </div>
          </RoomDropZone>
        ))}

      {!isLoading && (items as FFEItem[]).length === 0 && (
        <div
          className="py-8 text-center"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          No items yet. Add your first FF&amp;E item to begin building the schedule.
        </div>
      )}

      {(items as FFEItem[]).length > 0 && (
        <div className="mt-4 flex items-baseline justify-between border-t-2 border-[var(--border-default)] pt-3">
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.88rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Estimated Total
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '1rem',
              color: 'var(--text-primary)',
            }}
          >
            {formatDollars(totalEstimate)}
          </span>
        </div>
      )}

      {/* Add product / allowance / TBD — shared with the project FF&E board.
          Owns the catalog picker + inline allowance/TBD forms; per-room
          "+ Add Item" links drive it via the imperative handle. */}
      <div className="mt-4">
        <AddFFEItemControls
          ref={addControlsRef}
          rooms={typedRooms}
          categories={categoryOptions}
          pickerScope="catalog"
          isSaving={addItem.isPending}
          productLabel="+ Add Item"
          onAddProduct={handleAddProduct}
          onAddAllowance={handleAllowanceSave}
          onAddTbd={handleTbdSave}
        />
      </div>

      {/* Capture inbox + drag-and-drop into rooms above */}
      <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border-default)' }}>
        <CaptureInbox mode="panel" />
      </div>

      <CategoryPromptModal
        open={!!captureDrop}
        roomName={captureDrop?.roomName ?? ''}
        categories={categoryOptions}
        isSaving={consumeCapture.isPending}
        errorMessage={captureDropError}
        onConfirm={handleConfirmCaptureDrop}
        onCancel={() => {
          setCaptureDrop(null);
          setCaptureDropError(null);
        }}
      />

      {/* S3 — pre-sale bulk bar (mirrors the post-sale BulkActionBar pattern):
          move to room · set item type · set lead-time bucket · delete. The
          Selects act immediately on change and reset to their placeholder. */}
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Select
          aria-label="Move selected to room"
          value=""
          className="!w-auto"
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') return;
            void bulkUpdate({ scope_room_id: v === '__unassigned' ? null : v });
          }}
        >
          <option value="">Move to room…</option>
          <option value="__unassigned">Unassigned</option>
          {typedRooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Set item type"
          value=""
          className="!w-auto"
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') return;
            void bulkUpdate({ item_type: v });
          }}
        >
          <option value="">Set type…</option>
          <option value="fixed">Fixed</option>
          <option value="allowance">Allowance</option>
          <option value="tbd">TBD</option>
        </Select>
        <Select
          aria-label="Set lead time"
          value=""
          className="!w-auto"
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') return;
            void bulkUpdate({ lead_time_weeks: Number(v) });
          }}
        >
          <option value="">Set lead time…</option>
          {LEAD_TIME_BUCKETS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </Select>
        <BulkActionButton variant="danger" onClick={() => void bulkDelete()}>
          Delete
        </BulkActionButton>
      </BulkActionBar>
    </div>
    </DndContext>
  );
}

// ─── Local hook for proposal items with all wave-1 columns ───────────────────

function useProposalItems(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-items-schedule', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data, error } = await supabase
        .from('proposal_items')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('position', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}
