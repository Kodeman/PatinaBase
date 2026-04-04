'use client';

import { useState, useCallback } from 'react';
import { PortalButton } from '@/components/portal/button';
import {
  useProposalScopeRooms,
  useAddScopeRoom,
  useUpdateScopeRoom,
  useRemoveScopeRoom,
} from '@patina/supabase';

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

const FFE_CATEGORIES = [
  'Seating',
  'Tables',
  'Lighting',
  'Rugs',
  'Window Treatments',
  'Art & Accessories',
  'Paint & Finish',
  'Storage',
  'Built-Ins',
  'Dining Table',
  'Sideboard',
  'Table Linens',
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
  onSave,
  onCancel,
  isSaving,
}: {
  initial: RoomFormState;
  onSave: (form: RoomFormState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<RoomFormState>(initial);

  const toggleCategory = useCallback((cat: string) => {
    setForm((prev) => ({
      ...prev,
      ffeCategories: prev.ffeCategories.includes(cat)
        ? prev.ffeCategories.filter((c) => c !== cat)
        : [...prev.ffeCategories, cat],
    }));
  }, []);

  const update = <K extends keyof RoomFormState>(key: K, value: RoomFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4 rounded-md border border-[var(--accent-primary)] p-4">
      {/* Name + Type row */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Room Name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Primary Living Room"
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          />
        </label>
        <label className="block">
          <span className="type-meta mb-1 block">Room Type</span>
          <select
            value={form.roomType}
            onChange={(e) => update('roomType', e.target.value as RoomType)}
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          >
            {ROOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Dimensions + Budget row */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Dimensions</span>
          <input
            type="text"
            value={form.dimensions}
            onChange={(e) => update('dimensions', e.target.value)}
            placeholder={`e.g. 18' x 22'`}
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
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
            <input
              type="number"
              min="0"
              step="100"
              value={form.budgetDollars}
              onChange={(e) => update('budgetDollars', e.target.value)}
              placeholder="0"
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </div>
        </label>
      </div>

      {/* FFE Categories */}
      <div>
        <span className="type-meta mb-2 block">FF&E Categories</span>
        <div className="flex flex-wrap gap-1.5">
          {FFE_CATEGORIES.map((cat) => {
            const active = form.ffeCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`cursor-pointer whitespace-nowrap rounded-sm border px-2.5 py-1 font-body text-[0.72rem] font-medium transition-colors ${
                  active
                    ? 'border-[var(--accent-primary)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                    : 'border-[var(--border-default)] bg-transparent text-[var(--text-muted)]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          placeholder="Design direction, client preferences, constraints..."
          className="w-full resize-none rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.82rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
        />
      </label>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <PortalButton
          variant="primary"
          onClick={() => onSave(form)}
          disabled={!form.name.trim() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Room'}
        </PortalButton>
        <PortalButton variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </PortalButton>
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
  editingId,
  onEdit,
  onCancelEdit,
}: {
  room: ScopeRoom;
  proposalId: string;
  editingId: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
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
      { onSuccess: () => onCancelEdit() },
    );
  };

  const handleRemove = () => {
    removeRoom.mutate({ roomId: room.id, proposalId });
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
        <div className="text-right">
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
        </div>
      </div>

      {/* FFE category tags */}
      {room.ffe_categories?.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {room.ffe_categories.map((cat) => (
            <span
              key={cat}
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
              {cat}
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
        <button
          onClick={() => onEdit(room.id)}
          className="cursor-pointer rounded-[3px] px-2 py-1 font-body text-[0.72rem] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Edit
        </button>
        <button
          onClick={handleRemove}
          disabled={removeRoom.isPending}
          className="cursor-pointer rounded-[3px] px-2 py-1 font-body text-[0.72rem] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--color-terracotta)]"
        >
          {removeRoom.isPending ? 'Removing...' : 'Remove'}
        </button>
      </div>
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
  const addRoom = useAddScopeRoom();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

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
      { onSuccess: () => setIsAdding(false) },
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

      {/* Room cards */}
      <div className="space-y-3">
        {(rooms as ScopeRoom[]).map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            proposalId={proposalId}
            editingId={editingId}
            onEdit={setEditingId}
            onCancelEdit={() => setEditingId(null)}
          />
        ))}
      </div>

      {/* Add room form / button */}
      {isAdding ? (
        <div className="mt-3">
          <RoomForm
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setIsAdding(false)}
            isSaving={addRoom.isPending}
          />
        </div>
      ) : (
        <div className="mt-3">
          <PortalButton variant="secondary" onClick={() => setIsAdding(true)}>
            + Add Room
          </PortalButton>
        </div>
      )}

      {/* Budget summary bar */}
      <BudgetBar rooms={rooms as ScopeRoom[]} />
    </div>
  );
}
