'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { Button, IconButton, Input, Select, Textarea } from '@/components/ui/controls';
import { proposalEvents } from '@/lib/analytics';
import {
  useProposalScopeRooms,
  useFFECategories,
  useConsumeCapture,
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface FFEItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number; // cents
  notes: string | null;
  category: string | null;
  vendor_name: string | null;
  position: number;
  scope_room_id: string | null;
  product_id: string | null;
  item_type: ProposalItemType;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  ffe_category: string | null;
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
}: {
  item: FFEItem;
  proposalId: string;
  rooms: ScopeRoom[];
  categories: Array<{ slug: string; label: string }>;
  categoryLookup: Map<string, string>;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
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
    <FFEItemCard
      name={displayName}
      vendorName={subtitle}
      quantity={item.item_type === 'tbd' ? null : item.quantity}
      unitTotalLabel={unitTotalLabel}
      itemType={item.item_type}
      actions={
        <>
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
        className="w-full max-w-[480px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
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

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.slug, c.label);
    return map;
  }, [categories]);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ slug: c.slug, label: c.label })),
    [categories]
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
  const handleAddProduct = (r: ProductPickResult) =>
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
      })
      .then(() => {
        proposalEvents.itemAdded({ proposalId, itemType: 'tbd', hasProduct: false, lineTotal: 0 });
      });

  // Map a drag-end (capture dragged from inbox onto a room droppable) into a
  // capture-drop context. The category is collected via CategoryPromptModal.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
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
    <DndContext onDragEnd={handleDragEnd}>
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

              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
              >
                {group.items.map((item) => {
                  const editing = editingItemId === item.id;
                  return (
                    <div key={item.id} style={{ gridColumn: editing ? '1 / -1' : undefined }}>
                      <ItemRow
                        item={item}
                        proposalId={proposalId}
                        rooms={typedRooms}
                        categories={categoryOptions}
                        categoryLookup={categoryLookup}
                        isEditing={editing}
                        onStartEdit={() => setEditingItemId(item.id)}
                        onStopEdit={() => setEditingItemId(null)}
                      />
                    </div>
                  );
                })}
              </div>
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
