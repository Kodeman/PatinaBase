'use client';

import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
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
import { SearchInput } from '@/components/portal/search-input';
import {
  FacetedFilterPopover,
  type Facet,
  type FacetSelections,
} from '@/components/portal/faceted-filter-popover';
import { proposalEvents } from '@/lib/analytics';
import {
  useProposalScopeRooms,
  useFFECategories,
  useConsumeCapture,
  useReorderProposalItems,
  useReorderProposalScopeRooms,
  useIsStudioOwner,
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
import { findScheduleTwins, type TwinRef } from '@/lib/scope/duplicates';
// S² Wave 2 — custom fields (S6), spec PDFs (S8), financial lens (S9)
import { SpecFieldsManager } from '@/components/portal/scope-builder/spec-fields-manager';
import { FinancialLensPanel, type LensRow } from '@/components/portal/scope-builder/financial-lens';
import { useSpecFieldDefs } from '@/hooks/use-spec-fields';
import { withFieldValue, formatFieldValue } from '@/lib/scope/spec-fields';
import { buildProposalItemFromPick } from '@/components/portal/scope-builder/build-proposal-item-from-pick';
import { computeMarkupUpdate } from '@/lib/scope/markup';
import { downloadSpecPdf } from '@/lib/scope/spec-pdf-client';
import { useDraftingFacetInvalidation } from '@/hooks/use-drafting-facet-invalidation';

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
  // Schedule & Boards Wave 2 — S6 custom field values (keyed by field_key)
  custom_fields: Record<string, unknown> | null;
}

interface ScopeRoom {
  id: string;
  name: string;
  ffe_categories: string[] | null;
}

// S5 — the Drafting Room's line unfold consumes the same row shape and mounts
// the same edit form; exported under schedule-scoped names.
export type ScheduleLineItem = FFEItem;
export type ScheduleScopeRoom = ScopeRoom;

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

export function ItemEditForm({
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
  // S6 — the schedule's designer-defined columns + this line's values.
  const { data: fieldDefs = [] } = useSpecFieldDefs({ proposalId });
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    (item.custom_fields as Record<string, unknown> | null) ?? {}
  );

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
    // S6 — custom field values (keyed by field_key). Only persisted when the
    // document has defs, so lines without custom fields never write a payload.
    if (fieldDefs.length > 0) updates.custom_fields = customFields;

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

      {/* S6 — designer-defined custom fields (typed per kind). */}
      {fieldDefs.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {fieldDefs.map((def) => (
            <label key={def.id} className="block">
              <span className="type-meta mb-1 block">{def.name}</span>
              <Input
                type={def.kind === 'number' ? 'number' : def.kind === 'url' ? 'url' : 'text'}
                value={formatFieldValue(customFields[def.field_key])}
                onChange={(e) =>
                  setCustomFields((cur) => withFieldValue(cur, def.field_key, def.kind, e.target.value))
                }
                placeholder={def.kind === 'url' ? 'https://…' : ''}
              />
            </label>
          ))}
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

export function ItemRow({
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
  verdictChip,
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
  verdictChip?: ReactNode;
}) {
  const removeItem = useRemoveProposalItem();
  const refreshDraftingSummary = useDraftingFacetInvalidation(proposalId);
  const lineCost = item.unit_price * item.quantity;

  const rangeText =
    item.item_type === 'allowance' &&
    typeof item.budget_min_cents === 'number' &&
    typeof item.budget_max_cents === 'number'
      ? `${formatDollars(item.budget_min_cents)} – ${formatDollars(item.budget_max_cents)}`
      : null;

  const handleRemove = () => {
    removeItem.mutate(
      { itemId: item.id, proposalId },
      { onSuccess: () => void refreshDraftingSummary() },
    );
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
      {(verdictChip || twinChip) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {verdictChip}
          {twinChip}
        </div>
      )}
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

// ─── Twin chip (S7) ──────────────────────────────────────────────────────────
//
// Quiet inline warning under a line that shares a product or doc code with
// another line in the SAME document. Never blocks (imports must never break);
// the act is jump-to-twin. Mono, terracotta, shadow-free — Document-safe.

function TwinChip({ twins, onJump }: { twins: TwinRef[]; onJump: (id: string) => void }) {
  const first = twins[0];
  const label = first.docCode ?? first.name ?? 'another line';
  return (
    <button
      type="button"
      onClick={() => onJump(first.id)}
      title={
        first.reason === 'doc_code'
          ? 'Another line carries this doc code — jump to it'
          : 'Another line specifies this same product — jump to it'
      }
      className="self-start font-mono hover:underline"
      style={{
        fontSize: '0.58rem',
        letterSpacing: '0.04em',
        color: 'var(--color-terracotta-ink)',
      }}
    >
      ⚠ twin: {label}
      {first.roomName ? ` in ${first.roomName}` : ''}
      {twins.length > 1 ? ` +${twins.length - 1} more` : ''} →
    </button>
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
  /**
   * S5 — host-supplied expand-in-place panel. When provided, clicking a card
   * unfolds the panel beneath it spanning the full grid row (Document grammar
   * in the Drafting Room). The legacy /portal host omits it and keeps its
   * pencil-edit-only behavior untouched.
   */
  renderUnfold?: (item: FFEItem, fold: () => void) => ReactNode;
  /**
   * C3 (Schedule & Boards Wave 2) — host-supplied per-line verdict chip. When
   * provided, its return renders beside the line's twin chip (the client's
   * latest approve / flag / note). The legacy /portal host omits it. Mirrors
   * renderUnfold: the schedule stays agnostic; the Drafting Room supplies the
   * feedback read.
   */
  renderVerdictChip?: (item: FFEItem) => ReactNode;
  /**
   * A1 (Schedule & Boards Wave 3) — a line to auto-unfold once on mount. The
   * Desk "N lines flagged" walk-in lands the designer on the first flagged
   * line with its Alternatives band already open.
   */
  initialUnfoldedId?: string;
  /**
   * sts W3a — the Worktable's room lens (a LIFT, never a filter): when set to
   * a scope-room id with lines, that room's group renders first; every other
   * group keeps its order and nothing is hidden. Omitted → group order
   * untouched, so the Drafting Room and legacy hosts render pixel-identical.
   */
  liftRoomId?: string | null;
  /**
   * sts W3a — host-supplied empty-state lead. When the schedule has no lines
   * its return renders in place of the default "No items yet" sentence; the
   * callback opens the builder's own add-item flow (the catalog picker,
   * pre-targeted at the lifted room if one is lensed). The Drafting Room and
   * legacy hosts omit it and keep the sentence.
   */
  renderEmptyLead?: (openAddItem: () => void) => ReactNode;
}

interface CaptureDropContext {
  captureId: string;
  scopeRoomId: string;
  roomName: string;
}

export function FFEScheduleBuilder({
  proposalId,
  renderUnfold,
  renderVerdictChip,
  initialUnfoldedId,
  liftRoomId,
  renderEmptyLead,
}: FFEScheduleBuilderProps) {
  const refreshDraftingSummary = useDraftingFacetInvalidation(proposalId);
  const { data: rooms = [] } = useProposalScopeRooms(proposalId);
  const { data: categories = [] } = useFFECategories({ proposalId });

  const addItem = useAddProposalItem();
  const consumeCapture = useConsumeCapture();
  const [captureDrop, setCaptureDrop] = useState<CaptureDropContext | null>(null);
  const [captureDropError, setCaptureDropError] = useState<string | null>(null);
  // Only one row may be in inline-edit mode at a time.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // S5 — one line unfolded at a time (Drafting Room host only).
  const [unfoldedItemId, setUnfoldedItemId] = useState<string | null>(null);
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
  // ── S4 — schedule search + facet filters (client-side; items are loaded) ──
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FacetSelections>({});
  // ── S9 — financial lens (studio-owner money view) + bulk markup ──
  const { isStudioOwner } = useIsStudioOwner();
  const [moneyView, setMoneyView] = useState(false);
  const [bulkMarkup, setBulkMarkup] = useState('');
  // ── S8 — spec PDF export (client-side fetch → blob) ──
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
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
      await refreshDraftingSummary();
    } catch (err) {
      setBulkError(
        err instanceof Error ? err.message : 'Some lines could not be removed — try again.'
      );
    }
  };

  // S9 — set markup% on the selected lines: recompute client price + line total
  // per item (trade × (1 + markup) = client). Allowance/TBD carry no unit trade
  // price, so they're skipped with a per-item count. The canonical
  // useUpdateProposalItem write refolds proposals.total_amount.
  const applyBulkMarkup = async () => {
    const pct = parseFloat(bulkMarkup);
    if (!Number.isFinite(pct)) return;
    setBulkError(null);
    const selectedItems = (items as FFEItem[]).filter((i) => selected.has(i.id));
    let applied = 0;
    let skipped = 0;
    try {
      await Promise.all(
        selectedItems.map((it) => {
          const res = computeMarkupUpdate(
            { item_type: it.item_type, unit_price: it.unit_price, quantity: it.quantity },
            pct
          );
          if (!res) {
            skipped += 1;
            return Promise.resolve();
          }
          applied += 1;
          return updateItem.mutateAsync({
            itemId: it.id,
            proposalId,
            updates: {
              markup_percent: res.markup_percent,
              unit_sell_price: res.unit_sell_price,
            },
          });
        })
      );
      setSelected(new Set());
      setBulkMarkup('');
      if (skipped > 0) {
        setBulkError(
          `Markup applied to ${applied} line${applied === 1 ? '' : 's'} · skipped ${skipped} allowance/TBD line${skipped === 1 ? '' : 's'} (no unit price).`
        );
      }
    } catch (err) {
      setBulkError(
        err instanceof Error ? err.message : 'Some lines could not be updated — try again.'
      );
    }
  };

  // S8 — export the whole schedule as a spec PDF (client price only; no money
  // beyond client price ever reaches the file). Inline error at the act (R83).
  const exportSchedulePdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      await downloadSpecPdf({ kind: 'document', proposalId }, 'schedule.pdf');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Could not export the schedule.');
    } finally {
      setPdfBusy(false);
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

  // ── S7 — twins: shared product_id OR non-empty doc_code within the document.
  // Derived over ALL loaded lines (a document-level property, independent of
  // the current filter view).
  const twins = useMemo(() => {
    const roomNameById = new Map(typedRooms.map((r) => [r.id, r.name] as const));
    return findScheduleTwins(items as FFEItem[], (roomId) =>
      roomId ? roomNameById.get(roomId) ?? null : null
    );
  }, [items, typedRooms]);

  const jumpToLine = (id: string) => {
    document
      .getElementById(`sched-line-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // A1 (Wave 3) — the Desk "N lines flagged" walk-in: open the first flagged
  // line once (its Alternatives band shows itself on an unresolved rejection),
  // then scroll to it. Guarded so it fires only when the row is actually loaded.
  const didAutoOpenRef = useRef(false);
  useEffect(() => {
    if (didAutoOpenRef.current || !initialUnfoldedId || !renderUnfold) return;
    if (!(items as FFEItem[]).some((it) => it.id === initialUnfoldedId)) return;
    didAutoOpenRef.current = true;
    setUnfoldedItemId(initialUnfoldedId);
    requestAnimationFrame(() => jumpToLine(initialUnfoldedId));
  }, [initialUnfoldedId, items, renderUnfold]);

  // ── S4 — apply search + facets over the loaded lines ──────────────────────
  const facets = useMemo<Facet[]>(
    () => [
      {
        key: 'room',
        label: 'Room',
        options: [
          { value: '__unassigned', label: 'Unassigned' },
          ...typedRooms.map((r) => ({ value: r.id, label: r.name })),
        ],
      },
      {
        key: 'type',
        label: 'Item type',
        options: [
          { value: 'fixed', label: 'Fixed' },
          { value: 'allowance', label: 'Allowance' },
          { value: 'tbd', label: 'TBD' },
        ],
      },
      {
        key: 'category',
        label: 'Category',
        options: categoryOptions.map((c) => ({ value: c.slug, label: c.label })),
      },
    ],
    [typedRooms, categoryOptions]
  );

  const hasActiveFilters =
    search.trim().length > 0 || Object.values(filters).some((v) => v.length > 0);

  const filteredItems = useMemo(() => {
    const typedItems = items as FFEItem[];
    const q = search.trim().toLowerCase();
    const roomSel = filters.room ?? [];
    const typeSel = filters.type ?? [];
    const catSel = filters.category ?? [];

    return typedItems.filter((i) => {
      if (roomSel.length > 0 && !roomSel.includes(i.scope_room_id ?? '__unassigned')) return false;
      if (typeSel.length > 0 && !typeSel.includes(i.item_type ?? 'fixed')) return false;
      if (catSel.length > 0 && !(i.ffe_category && catSel.includes(i.ffe_category))) return false;
      if (q) {
        const hay = [
          i.name,
          i.vendor_name,
          i.doc_code,
          i.notes,
          i.ffe_category ? categoryLookup.get(i.ffe_category) : null,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, filters, categoryLookup]);

  // Reordering rewrites the WHOLE document's positions from the visible
  // groups, so it only arms when every line is visible.
  const canReorder = !hasActiveFilters;

  // Group items by room.
  const grouped = useMemo(() => {
    const groups: Record<string, { roomName: string; items: FFEItem[] }> = {};

    const unassigned = filteredItems.filter((i) => !i.scope_room_id);
    if (unassigned.length > 0) {
      groups['__unassigned'] = { roomName: 'Unassigned', items: unassigned };
    }

    for (const room of typedRooms) {
      const roomItems = filteredItems.filter((i) => i.scope_room_id === room.id);
      if (roomItems.length > 0) {
        groups[room.id] = { roomName: room.name, items: roomItems };
      }
    }
    return groups;
  }, [filteredItems, typedRooms]);

  // sts W3a — the room lens reorders the RENDER order only: the lifted room's
  // group first, everyone else unchanged, nothing hidden. handleDragEnd keeps
  // reading `grouped`, so a drag while the lens is up still rewrites positions
  // from the document's canonical group order, never the lifted view.
  const orderedGroups = useMemo(() => {
    const entries = Object.entries(grouped);
    if (!liftRoomId || !grouped[liftRoomId]) return entries;
    return [
      [liftRoomId, grouped[liftRoomId]] as (typeof entries)[number],
      ...entries.filter(([id]) => id !== liftRoomId),
    ];
  }, [grouped, liftRoomId]);

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

  // S9 — financial-lens rows over the WHOLE document (not the filtered view),
  // room-resolved. Rendered only for studio owners when the money view is on.
  const lensRows = useMemo<LensRow[]>(() => {
    const roomNameById = new Map(typedRooms.map((r) => [r.id, r.name] as const));
    return (items as FFEItem[]).map((i) => ({
      id: i.id,
      code: i.doc_code,
      name: i.name || categoryLabel(i.ffe_category, categoryLookup) || 'Untitled',
      quantity: i.quantity,
      itemType: i.item_type,
      tradeCents: i.unit_price ?? null,
      markupPercent: i.markup_percent ?? null,
      clientUnitCents: i.unit_sell_price ?? null,
      lineTotalCents: i.line_total_cents ?? null,
      roomName: i.scope_room_id ? roomNameById.get(i.scope_room_id) ?? 'Unassigned' : 'Unassigned',
    }));
  }, [items, typedRooms, categoryLookup]);

  // Picked from the catalog → add a fixed proposal_item directly from the
  // denormalized pick result (the result already carries name/price/vendor, so
  // no follow-up product fetch is needed). The whole mapping — resolved pricing,
  // the COM-carrying and trade-free configuration envelope, the doc-code
  // suggestion — is `buildProposalItemFromPick`, unit-tested on its own.
  const handleAddProduct = (r: ProductPickResult, ffeCategorySlug: string | null) => {
    const line = buildProposalItemFromPick(r, { ffeCategorySlug, existingDocCodes });
    return addItem
      .mutateAsync({ proposalId, ...line })
      .then(() => {
        proposalEvents.itemAdded({
          proposalId,
          itemType: 'fixed',
          hasProduct: true,
          lineTotal: line.unitPrice,
        });
        return refreshDraftingSummary();
      });
  };

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
        return refreshDraftingSummary();
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
        return refreshDraftingSummary();
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
      // Belt: handles are hidden while filtering, but never rebuild a global
      // order from a partial view.
      if (!canReorder) return;
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
          void refreshDraftingSummary();
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          {hasActiveFilters
            ? `${filteredItems.length} of ${(items as FFEItem[]).length} items`
            : `${(items as FFEItem[]).length} items`}
          {totalEstimate > 0 ? ` · Est. total: ${formatDollars(totalEstimate)}` : ''}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* S6 — the schedule's custom-field columns (both hosts). */}
          <SpecFieldsManager owner={{ proposalId }} />
          {/* S9 — studio-owner money view toggle. */}
          {isStudioOwner && (
            <Button
              variant={moneyView ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMoneyView((v) => !v)}
              aria-pressed={moneyView}
            >
              {moneyView ? 'Money ✓' : 'Money'}
            </Button>
          )}
          {(items as FFEItem[]).length > 0 && (
            <>
              {/* S8 — export the whole schedule as a client-safe spec PDF. */}
              <Button variant="ghost" size="sm" onClick={exportSchedulePdf} disabled={pdfBusy}>
                {pdfBusy ? 'Exporting…' : 'Export schedule (PDF)'}
              </Button>
              {/* S4 — search + facet filters over the schedule (both hosts). */}
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search items, vendors, codes"
              />
              <FacetedFilterPopover facets={facets} value={filters} onChange={setFilters} />
            </>
          )}
        </div>
      </div>

      {/* S8 — spec-PDF export failures land inline (R83), never a toast. */}
      {pdfError && (
        <p
          role="alert"
          className="mb-3 rounded-sm border px-3 py-2"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: 'var(--color-terracotta-ink)',
            borderColor: 'rgba(196,131,111,0.4)',
          }}
        >
          {pdfError}
        </p>
      )}

      {/* S9 — the financial lens (studio owners only; designer-eyes analysis). */}
      {moneyView && isStudioOwner && <FinancialLensPanel rows={lensRows} />}

      {/* R83 — bulk-action failures land inline at the schedule, never a toast. */}
      {bulkError && (
        <p
          role="alert"
          className="mb-3 rounded-sm border px-3 py-2"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: 'var(--color-terracotta-ink)',
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
      {orderedGroups.map(([groupId, group]) => {
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
                    color: 'var(--color-clay-ink)',
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
                    const unfolded = !!renderUnfold && !editing && unfoldedItemId === item.id;
                    const itemTwins = twins.get(item.id);
                    return (
                      <SortableScheduleItem
                        key={item.id}
                        id={item.id}
                        disabled={editing || unfolded || !canReorder}
                        spanFull={editing || unfolded}
                      >
                        {(dragHandle) => (
                          <div id={`sched-line-${item.id}`}>
                            <ItemRow
                              item={item}
                              proposalId={proposalId}
                              rooms={typedRooms}
                              categories={categoryOptions}
                              categoryLookup={categoryLookup}
                              isEditing={editing}
                              onStartEdit={() => {
                                setUnfoldedItemId(null);
                                setEditingItemId(item.id);
                              }}
                              onStopEdit={() => setEditingItemId(null)}
                              dragHandle={dragHandle}
                              selected={selected.has(item.id)}
                              onToggleSelect={() => toggleSelect(item.id)}
                              onOpenDetail={
                                renderUnfold
                                  ? () =>
                                      setUnfoldedItemId((cur) =>
                                        cur === item.id ? null : item.id
                                      )
                                  : undefined
                              }
                              twinChip={
                                itemTwins ? (
                                  <TwinChip twins={itemTwins} onJump={jumpToLine} />
                                ) : undefined
                              }
                              verdictChip={renderVerdictChip?.(item)}
                            />
                            {unfolded && renderUnfold(item, () => setUnfoldedItemId(null))}
                          </div>
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

      {/* S4 — the filter matched nothing (items exist, none visible). */}
      {!isLoading && (items as FFEItem[]).length > 0 && filteredItems.length === 0 && (
        <div
          className="py-8 text-center"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          Nothing matches. Clear the search or filters to see the whole schedule.
        </div>
      )}

      {/* Empty room droppables — surface a drop target for any scope_rooms
          that don't yet have any items so the designer can drag captures
          straight into them. Hidden while filtering (they'd all read empty). */}
      {!hasActiveFilters && typedRooms
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
                    color: 'var(--color-clay-ink)',
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

      {!isLoading &&
        (items as FFEItem[]).length === 0 &&
        (renderEmptyLead ? (
          renderEmptyLead(() =>
            addControlsRef.current?.openProduct(liftRoomId ?? null)
          )
        ) : (
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
        ))}

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
        {/* S9 — bulk markup (pre-sale): set markup% on the selected fixed lines;
            allowance/TBD lines are skipped with a count in the inline notice. */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <Input
              type="number"
              aria-label="Markup percent"
              value={bulkMarkup}
              onChange={(e) => setBulkMarkup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void applyBulkMarkup();
              }}
              placeholder="Markup"
              className="!w-20 pr-5"
            />
            <span
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-body text-[0.82rem]"
              style={{ color: 'var(--text-muted)' }}
            >
              %
            </span>
          </div>
          <BulkActionButton onClick={() => void applyBulkMarkup()}>Apply markup</BulkActionButton>
        </div>
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
