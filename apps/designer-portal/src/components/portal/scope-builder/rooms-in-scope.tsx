'use client';

import { useState, useMemo, type ReactNode } from 'react';
import {
  DndContext,
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
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Input, Select, Textarea } from '@/components/ui/controls';
import { proposalEvents } from '@/lib/analytics';
import {
  useProposalScopeRooms,
  useAddScopeRoom,
  useUpdateScopeRoom,
  useRemoveScopeRoom,
  useReorderProposalScopeRooms,
  useFFECategories,
  useCreateFFECategory,
  type FFECategory,
} from '@patina/supabase';
import {
  FFECategoryPicker,
  type FFECategoryOption,
} from '@patina/design-system';

// ─── Constants ───────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  { value: 'living_room', label: 'Living Room' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'dining_room', label: 'Dining Room' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' },
] as const;

type RoomType = (typeof ROOM_TYPES)[number]['value'];

interface RoomFormState {
  name: string;
  roomType: RoomType;
  dimensions: string;
  budgetDollars: string;
  ffeCategories: string[];
  notes: string;
}

const EMPTY_FORM: RoomFormState = {
  name: '',
  roomType: 'living_room',
  dimensions: '',
  budgetDollars: '',
  ffeCategories: [],
  notes: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function roomTypeLabel(value: string): string {
  return ROOM_TYPES.find((t) => t.value === value)?.label ?? value;
}

// ─── Inline Form ─────────────────────────────────────────────────────────────

function RoomForm({
  initial,
  proposalId,
  categories,
  onCreateCustom,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: RoomFormState;
  proposalId: string;
  categories: FFECategoryOption[];
  onCreateCustom?: (label: string) => Promise<{ slug: string }>;
  onSave: (form: RoomFormState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<RoomFormState>(initial);

  const update = <K extends keyof RoomFormState>(key: K, value: RoomFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4 rounded-md border border-[var(--accent-primary)] p-4">
      {/* Name + Type row */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Room Name</span>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Primary Living Room"
          />
        </label>
        <label className="block">
          <span className="type-meta mb-1 block">Room Type</span>
          <Select
            value={form.roomType}
            onChange={(e) => update('roomType', e.target.value as RoomType)}
          >
            {ROOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Dimensions + Budget row */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Dimensions</span>
          <Input
            type="text"
            value={form.dimensions}
            onChange={(e) => update('dimensions', e.target.value)}
            placeholder={`e.g. 18' x 22'`}
          />
        </label>
        <label className="block">
          <span className="type-meta mb-1 block">Budget Allocation</span>
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
              step="100"
              value={form.budgetDollars}
              onChange={(e) => update('budgetDollars', e.target.value)}
              placeholder="0"
              className="pl-7"
            />
          </div>
        </label>
      </div>

      {/* FFE Categories */}
      <div>
        <span className="type-meta mb-2 block">FF&E Categories</span>
        <FFECategoryPicker
          value={form.ffeCategories}
          onChange={(slugs) => update('ffeCategories', slugs)}
          categories={categories}
          allowCustom={!!onCreateCustom}
          onCreateCustom={onCreateCustom}
          scope="proposal"
          placeholder="Select FF&E categories…"
        />
      </div>

      {/* Notes */}
      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <Textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          placeholder="Design direction, client preferences, constraints..."
        />
      </label>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={() => onSave(form)}
          disabled={!form.name.trim() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Room'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Room Card ───────────────────────────────────────────────────────────────

interface ScopeRoom {
  id: string;
  name: string;
  room_type: string | null;
  dimensions: string | null;
  budget_cents: number;
  ffe_categories: string[];
  notes: string | null;
}

function RoomCard({
  room,
  proposalId,
  categories,
  categoryLookup,
  onCreateCustom,
  editingId,
  onEdit,
  onCancelEdit,
  dragHandle,
}: {
  room: ScopeRoom;
  proposalId: string;
  categories: FFECategoryOption[];
  categoryLookup: Map<string, string>;
  onCreateCustom?: (label: string) => Promise<{ slug: string }>;
  editingId: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  /** S3 — sortable grip rendered beside the budget (hover-visible). */
  dragHandle?: ReactNode;
}) {
  const updateRoom = useUpdateScopeRoom();
  const removeRoom = useRemoveScopeRoom();
  const isEditing = editingId === room.id;

  const handleSave = (form: RoomFormState) => {
    updateRoom.mutate(
      {
        roomId: room.id,
        proposalId,
        updates: {
          name: form.name,
          room_type: form.roomType,
          dimensions: form.dimensions || null,
          budget_cents: Math.round(parseFloat(form.budgetDollars || '0') * 100),
          ffe_categories: form.ffeCategories,
          notes: form.notes || null,
        },
      },
      {
        onSuccess: () => {
          proposalEvents.scopeUpdated({ proposalId, field: 'room', action: 'update' });
          onCancelEdit();
        },
      },
    );
  };

  const handleRemove = () => {
    removeRoom.mutate(
      { roomId: room.id, proposalId },
      {
        onSuccess: () => {
          proposalEvents.scopeUpdated({ proposalId, field: 'room', action: 'remove' });
        },
      },
    );
  };

  if (isEditing) {
    return (
      <RoomForm
        initial={{
          name: room.name,
          roomType: (room.room_type as RoomType) || 'other',
          dimensions: room.dimensions ?? '',
          budgetDollars: room.budget_cents ? String(room.budget_cents / 100) : '',
          ffeCategories: room.ffe_categories ?? [],
          notes: room.notes ?? '',
        }}
        proposalId={proposalId}
        categories={categories}
        onCreateCustom={onCreateCustom}
        onSave={handleSave}
        onCancel={onCancelEdit}
        isSaving={updateRoom.isPending}
      />
    );
  }

  return (
    <div
      className="group rounded-md border p-4 transition-colors hover:border-[var(--color-clay)]"
      style={{ borderColor: 'var(--border-default)' }}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.88rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {room.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
            }}
          >
            {room.room_type ? roomTypeLabel(room.room_type) : ''}
            {room.dimensions ? ` · ${room.dimensions}` : ''}
          </div>
        </div>
        <div className="flex items-start gap-1.5 text-right">
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '1rem',
              color: 'var(--text-primary)',
            }}
          >
            {formatDollars(room.budget_cents)}
          </div>
          {dragHandle && (
            <span className="opacity-0 transition-opacity group-hover:opacity-100">
              {dragHandle}
            </span>
          )}
        </div>
      </div>

      {/* FFE category tags — render as labels from the taxonomy */}
      {room.ffe_categories?.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {room.ffe_categories.map((slug) => (
            <span
              key={slug}
              className="inline-flex whitespace-nowrap rounded-sm border px-2.5 py-1"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.62rem',
                fontWeight: 500,
                color: 'var(--text-body)',
                borderColor: 'var(--border-default)',
                background: 'var(--bg-primary)',
              }}
            >
              {categoryLookup.get(slug) ?? slug}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {room.notes && (
        <div
          className="mb-2"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            fontStyle: 'italic',
            color: 'var(--text-muted)',
          }}
        >
          {room.notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(room.id)}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          disabled={removeRoom.isPending}
        >
          {removeRoom.isPending ? 'Removing...' : 'Remove'}
        </Button>
      </div>
    </div>
  );
}

// ─── Sortable room wrapper (S3) ──────────────────────────────────────────────
//
// Vertical-list sortable around each card; the grip renders inside the card
// header via render-prop so Edit/Remove clicks never start a drag.

function SortableRoom({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const handle = disabled ? null : (
    <button
      type="button"
      aria-label="Reorder room"
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
        opacity: isDragging ? 0.4 : undefined,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
    >
      {children(handle)}
    </div>
  );
}

// ─── Budget Bar ──────────────────────────────────────────────────────────────

function BudgetBar({ rooms }: { rooms: ScopeRoom[] }) {
  const total = rooms.reduce((sum, r) => sum + (r.budget_cents || 0), 0);
  if (total === 0) return null;

  return (
    <div
      className="mt-4 rounded-md border p-3"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="type-meta">Total Budget Allocation</span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '1.1rem',
            color: 'var(--text-primary)',
          }}
        >
          {formatDollars(total)}
        </span>
      </div>
      <div
        className="flex gap-0.5 overflow-hidden rounded-full"
        style={{ height: '6px', background: 'var(--bg-hover)' }}
      >
        {rooms
          .filter((r) => r.budget_cents > 0)
          .map((r) => (
            <div
              key={r.id}
              title={`${r.name}: ${formatDollars(r.budget_cents)}`}
              style={{
                width: `${(r.budget_cents / total) * 100}%`,
                background: 'var(--accent-primary)',
                opacity: 0.7 + (r.budget_cents / total) * 0.3,
                minWidth: '4px',
              }}
            />
          ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
        {rooms
          .filter((r) => r.budget_cents > 0)
          .map((r) => (
            <span
              key={r.id}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.68rem',
                color: 'var(--text-muted)',
              }}
            >
              {r.name}: {formatDollars(r.budget_cents)}
            </span>
          ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface RoomsInScopeProps {
  proposalId: string;
}

export function RoomsInScope({ proposalId }: RoomsInScopeProps) {
  const { data: rooms = [], isLoading } = useProposalScopeRooms(proposalId);
  const { data: ffeCategoryRows = [] } = useFFECategories({ proposalId });
  const addRoom = useAddScopeRoom();
  const createCategory = useCreateFFECategory();
  const reorderRooms = useReorderProposalScopeRooms();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // S3 — drag starts after 6px of travel so card clicks stay clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const typedRooms = rooms as ScopeRoom[];
    const from = typedRooms.findIndex((r) => r.id === active.id);
    const to = typedRooms.findIndex((r) => r.id === over.id);
    if (from === -1 || to === -1) return;
    const orderedIds = arrayMove(typedRooms, from, to).map((r) => r.id);
    // Optimistic order with rollback lives in the hook (00263 RPC).
    reorderRooms.mutate({ proposalId, orderedIds });
  };

  // Map taxonomy rows -> picker options + slug→label lookup.
  const categoryOptions = useMemo<FFECategoryOption[]>(
    () =>
      ffeCategoryRows.map((c: FFECategory) => ({
        slug: c.slug,
        label: c.label,
        icon: c.icon ?? undefined,
        isCustom: !c.is_system,
      })),
    [ffeCategoryRows]
  );
  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of ffeCategoryRows) map.set(c.slug, c.label);
    return map;
  }, [ffeCategoryRows]);

  // The picker scopes new customs to the proposal.
  const handleCreateCustomCategory = async (label: string) => {
    const created = await createCategory.mutateAsync({ label, proposalId });
    return { slug: created.slug };
  };

  const handleAdd = (form: RoomFormState) => {
    addRoom.mutate(
      {
        proposalId,
        name: form.name,
        roomType: form.roomType,
        dimensions: form.dimensions || undefined,
        budgetCents: Math.round(parseFloat(form.budgetDollars || '0') * 100),
        ffeCategories: form.ffeCategories,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          proposalEvents.scopeUpdated({ proposalId, field: 'room', action: 'add' });
          setIsAdding(false);
        },
      },
    );
  };

  return (
    <div>
      <h3
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: '1.25rem',
          lineHeight: 1.35,
          marginBottom: '0.25rem',
        }}
      >
        Rooms in Scope
      </h3>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
          marginBottom: '1rem',
        }}
      >
        Define each room, its budget allocation, and which FF&E categories apply
      </div>

      {isLoading && (
        <div
          className="py-8 text-center"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}
        >
          Loading rooms...
        </div>
      )}

      {/* Room cards — vertically sortable (S3); order persists via 00263. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={(rooms as ScopeRoom[]).map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {(rooms as ScopeRoom[]).map((room) => (
              <SortableRoom key={room.id} id={room.id} disabled={editingId === room.id}>
                {(dragHandle) => (
                  <RoomCard
                    room={room}
                    proposalId={proposalId}
                    categories={categoryOptions}
                    categoryLookup={categoryLookup}
                    onCreateCustom={handleCreateCustomCategory}
                    editingId={editingId}
                    onEdit={setEditingId}
                    onCancelEdit={() => setEditingId(null)}
                    dragHandle={dragHandle}
                  />
                )}
              </SortableRoom>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add room form / button */}
      {isAdding ? (
        <div className="mt-3">
          <RoomForm
            initial={EMPTY_FORM}
            proposalId={proposalId}
            categories={categoryOptions}
            onCreateCustom={handleCreateCustomCategory}
            onSave={handleAdd}
            onCancel={() => setIsAdding(false)}
            isSaving={addRoom.isPending}
          />
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => setIsAdding(true)}>
            + Add Room
          </Button>
        </div>
      )}

      {/* Budget summary bar */}
      <BudgetBar rooms={rooms as ScopeRoom[]} />
    </div>
  );
}
