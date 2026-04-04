'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PortalButton } from '@/components/portal/button';
import { useProposalScopeRooms, createBrowserClient } from '@patina/supabase';
import {
  useAddProposalItem,
  useUpdateProposalItem,
  useRemoveProposalItem,
} from '@/hooks/use-proposals';

// ─── Types ───────────────────────────────────────────────────────────────────

type ItemType = 'fixed' | 'allowance' | 'tbd';

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
  scope_room_id?: string | null;
}

interface ScopeRoom {
  id: string;
  name: string;
}

interface ItemFormState {
  itemType: ItemType;
  name: string;
  quantity: string;
  vendorName: string;
  unitPrice: string;
  minPrice: string;
  maxPrice: string;
  category: string;
  roomId: string;
  notes: string;
}

const EMPTY_FORM: ItemFormState = {
  itemType: 'fixed',
  name: '',
  quantity: '1',
  vendorName: '',
  unitPrice: '',
  minPrice: '',
  maxPrice: '',
  category: '',
  roomId: '',
  notes: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function parseItemType(item: FFEItem): ItemType {
  if (item.notes?.includes('[tbd]') || (!item.unit_price && !item.vendor_name)) return 'tbd';
  if (item.notes?.includes('[allowance]') || item.vendor_name === 'TBD') return 'allowance';
  return 'fixed';
}

function typeTagStyle(type: ItemType): { color: string; bg: string } {
  switch (type) {
    case 'fixed':
      return { color: 'var(--color-sage)', bg: 'rgba(122, 155, 118, 0.08)' };
    case 'allowance':
      return { color: 'var(--color-golden-hour)', bg: 'rgba(232, 197, 71, 0.08)' };
    case 'tbd':
      return { color: 'var(--text-muted)', bg: 'rgba(139, 115, 85, 0.06)' };
  }
}

function typeLabel(type: ItemType): string {
  switch (type) {
    case 'fixed':
      return 'Fixed';
    case 'allowance':
      return 'Allowance';
    case 'tbd':
      return 'TBD';
  }
}

// ─── Type Selector ───────────────────────────────────────────────────────────

function TypeSelector({
  value,
  onChange,
}: {
  value: ItemType;
  onChange: (t: ItemType) => void;
}) {
  const types: ItemType[] = ['fixed', 'allowance', 'tbd'];

  return (
    <div className="mb-4">
      <span className="type-meta mb-2 block">Item Type</span>
      <div className="flex gap-2">
        {types.map((t) => {
          const style = typeTagStyle(t);
          const active = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              className={`cursor-pointer rounded-sm border px-3 py-1.5 font-body text-[0.78rem] font-medium transition-colors ${
                active ? 'border-[var(--accent-primary)]' : 'border-[var(--border-default)]'
              }`}
              style={{
                color: active ? style.color : 'var(--text-muted)',
                background: active ? style.bg : 'transparent',
              }}
            >
              {typeLabel(t)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Item Form ───────────────────────────────────────────────────────────────

function ItemForm({
  rooms,
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  rooms: ScopeRoom[];
  initial: ItemFormState;
  onSave: (form: ItemFormState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<ItemFormState>(initial);

  const update = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-3 rounded-md border border-[var(--accent-primary)] p-4">
      <TypeSelector value={form.itemType} onChange={(t) => update('itemType', t)} />

      {/* Room selector */}
      {rooms.length > 0 && (
        <label className="block">
          <span className="type-meta mb-1 block">Room</span>
          <select
            value={form.roomId}
            onChange={(e) => update('roomId', e.target.value)}
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          >
            <option value="">Unassigned</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Name row */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: form.itemType === 'tbd' ? '1fr 1fr' : '1fr' }}
      >
        <label className="block">
          <span className="type-meta mb-1 block">
            {form.itemType === 'tbd' ? 'Category' : 'Item Name'}
          </span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder={
              form.itemType === 'tbd'
                ? 'e.g. Accent Lighting'
                : 'e.g. Restoration Hardware Cloud Sofa'
            }
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          />
        </label>
        {form.itemType === 'tbd' && (
          <label className="block">
            <span className="type-meta mb-1 block">Category</span>
            <input
              type="text"
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              placeholder="e.g. Lighting"
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </label>
        )}
      </div>

      {/* Qty + Vendor (for fixed/allowance) */}
      {form.itemType !== 'tbd' && (
        <div className="grid gap-3" style={{ gridTemplateColumns: '80px 1fr' }}>
          <label className="block">
            <span className="type-meta mb-1 block">Qty</span>
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => update('quantity', e.target.value)}
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </label>
          <label className="block">
            <span className="type-meta mb-1 block">Vendor</span>
            <input
              type="text"
              value={form.vendorName}
              onChange={(e) => update('vendorName', e.target.value)}
              placeholder={form.itemType === 'allowance' ? 'TBD' : 'e.g. Holly Hunt'}
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </label>
        </div>
      )}

      {/* Price fields */}
      {form.itemType === 'fixed' && (
        <label className="block">
          <span className="type-meta mb-1 block">Unit Price</span>
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
              step="1"
              value={form.unitPrice}
              onChange={(e) => update('unitPrice', e.target.value)}
              placeholder="0"
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </div>
        </label>
      )}

      {(form.itemType === 'allowance' || form.itemType === 'tbd') && (
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="block">
            <span className="type-meta mb-1 block">Est. Min</span>
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
                value={form.minPrice}
                onChange={(e) => update('minPrice', e.target.value)}
                placeholder="0"
                className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
              />
            </div>
          </label>
          <label className="block">
            <span className="type-meta mb-1 block">Est. Max</span>
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
                value={form.maxPrice}
                onChange={(e) => update('maxPrice', e.target.value)}
                placeholder="0"
                className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
              />
            </div>
          </label>
        </div>
      )}

      {/* Notes */}
      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          placeholder="Specification notes, lead time, COM details..."
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
          {isSaving ? 'Saving...' : 'Save Item'}
        </PortalButton>
        <PortalButton variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </PortalButton>
      </div>
    </div>
  );
}

// ─── Item Row ────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  proposalId,
  rooms,
  editingId,
  onEdit,
  onCancelEdit,
}: {
  item: FFEItem;
  proposalId: string;
  rooms: ScopeRoom[];
  editingId: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
}) {
  const updateItem = useUpdateProposalItem();
  const removeItem = useRemoveProposalItem();
  const itemType = parseItemType(item);
  const style = typeTagStyle(itemType);
  const isEditing = editingId === item.id;

  const handleSave = (form: ItemFormState) => {
    const priceCents =
      form.itemType === 'fixed'
        ? Math.round(parseFloat(form.unitPrice || '0') * 100)
        : Math.round(parseFloat(form.maxPrice || form.minPrice || '0') * 100);

    const notesTag =
      form.itemType === 'tbd'
        ? '[tbd]'
        : form.itemType === 'allowance'
          ? `[allowance] range: $${form.minPrice || 0}-$${form.maxPrice || 0}`
          : '';

    const notes = [notesTag, form.notes].filter(Boolean).join(' ');

    updateItem.mutate(
      {
        itemId: item.id,
        proposalId,
        updates: {
          name: form.name,
          quantity: parseInt(form.quantity, 10) || 1,
          unit_price: priceCents,
          notes: notes || null,
        },
      },
      { onSuccess: () => onCancelEdit() },
    );
  };

  const handleRemove = () => {
    removeItem.mutate({ itemId: item.id, proposalId });
  };

  if (isEditing) {
    // Parse existing notes for form state
    const isAllowance = itemType === 'allowance';
    const isTbd = itemType === 'tbd';
    const rangeMatch = item.notes?.match(/range: \$(\d+)-\$(\d+)/);
    const cleanNotes = (item.notes ?? '')
      .replace(/\[(tbd|allowance)\]\s*/, '')
      .replace(/range: \$\d+-\$\d+\s*/, '')
      .trim();

    return (
      <div className="col-span-full">
        <ItemForm
          rooms={rooms}
          initial={{
            itemType,
            name: item.name,
            quantity: String(item.quantity),
            vendorName: item.vendor_name ?? '',
            unitPrice: !isAllowance && !isTbd ? String((item.unit_price || 0) / 100) : '',
            minPrice: rangeMatch ? rangeMatch[1] : '',
            maxPrice: rangeMatch ? rangeMatch[2] : '',
            category: item.category ?? '',
            roomId: item.scope_room_id ?? '',
            notes: cleanNotes,
          }}
          onSave={handleSave}
          onCancel={onCancelEdit}
          isSaving={updateItem.isPending}
        />
      </div>
    );
  }

  const lineCost = item.unit_price
    ? item.unit_price * item.quantity
    : 0;

  return (
    <div
      className="group grid items-center gap-2 border-b py-2"
      style={{
        gridTemplateColumns: '1fr 60px 80px 100px 40px',
        borderColor: 'rgba(229, 226, 221, 0.4)',
      }}
    >
      {/* Name + vendor */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-primary)',
          }}
        >
          {item.name}
        </div>
        {item.vendor_name && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.68rem',
              fontStyle: 'italic',
              color: 'var(--color-aged-oak)',
            }}
          >
            {item.vendor_name}
          </div>
        )}
      </div>

      {/* Qty */}
      <div
        className="text-right"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.58rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
        }}
      >
        {item.quantity}
      </div>

      {/* Type tag */}
      <div className="text-right">
        <span
          className="inline-flex whitespace-nowrap rounded-sm px-1.5 py-0.5"
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.48rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: style.color,
            background: style.bg,
          }}
        >
          {typeLabel(itemType)}
        </span>
      </div>

      {/* Est. Cost */}
      <div
        className="text-right"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: '0.82rem',
          color: lineCost > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
      >
        {lineCost > 0 ? formatDollars(lineCost) : '---'}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onEdit(item.id)}
          className="cursor-pointer p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          title="Edit"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          onClick={handleRemove}
          disabled={removeItem.isPending}
          className="cursor-pointer p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--color-terracotta)]"
          title="Remove"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface FFEScheduleBuilderProps {
  proposalId: string;
}

export function FFEScheduleBuilder({ proposalId }: FFEScheduleBuilderProps) {
  const { data: rooms = [] } = useProposalScopeRooms(proposalId);
  const addItem = useAddProposalItem();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // We need proposal items -- use the same query pattern
  // Items come from proposal_items table, grouped by scope_room_id
  const { data: items = [], isLoading } = useProposalItems(proposalId);

  const typedRooms = rooms as ScopeRoom[];

  // Group items by room
  const grouped = useMemo(() => {
    const typedItems = items as FFEItem[];
    const groups: Record<string, { roomName: string; items: FFEItem[] }> = {};

    // Unassigned group
    const unassigned = typedItems.filter((i) => !i.scope_room_id);
    if (unassigned.length > 0) {
      groups['__unassigned'] = { roomName: 'Unassigned', items: unassigned };
    }

    // Room groups
    for (const room of typedRooms) {
      const roomItems = typedItems.filter((i) => i.scope_room_id === room.id);
      if (roomItems.length > 0) {
        groups[room.id] = { roomName: room.name, items: roomItems };
      }
    }

    return groups;
  }, [items, typedRooms]);

  // Totals
  const totalEstimate = useMemo(() => {
    return (items as FFEItem[]).reduce(
      (sum, i) => sum + (i.unit_price || 0) * (i.quantity || 1),
      0,
    );
  }, [items]);

  const handleAdd = (form: ItemFormState) => {
    const priceCents =
      form.itemType === 'fixed'
        ? Math.round(parseFloat(form.unitPrice || '0') * 100)
        : Math.round(parseFloat(form.maxPrice || form.minPrice || '0') * 100);

    const notesTag =
      form.itemType === 'tbd'
        ? '[tbd]'
        : form.itemType === 'allowance'
          ? `[allowance] range: $${form.minPrice || 0}-$${form.maxPrice || 0}`
          : '';

    const notes = [notesTag, form.notes].filter(Boolean).join(' ');

    addItem.mutate(
      {
        proposalId,
        name: form.name,
        quantity: parseInt(form.quantity, 10) || 1,
        unitPrice: priceCents,
        vendorName: form.vendorName || (form.itemType === 'allowance' ? 'TBD' : undefined),
        category: form.category || undefined,
        notes: notes || undefined,
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
        Preliminary FF&E Schedule
      </h3>
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

      {/* Column headers */}
      <div
        className="mb-1 grid items-center gap-2 border-b py-1"
        style={{
          gridTemplateColumns: '1fr 60px 80px 100px 40px',
          borderColor: 'var(--border-default)',
        }}
      >
        {['Item / Vendor', 'Qty', 'Type', 'Est. Cost', ''].map((h) => (
          <span
            key={h || 'actions'}
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              textAlign: h === 'Item / Vendor' ? 'left' : 'right',
            }}
          >
            {h}
          </span>
        ))}
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
          Loading schedule...
        </div>
      )}

      {/* Grouped items */}
      {Object.entries(grouped).map(([groupId, group]) => (
        <div key={groupId}>
          {/* Room label */}
          <div
            className="mt-3 mb-1"
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

          {/* Items */}
          {group.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              proposalId={proposalId}
              rooms={typedRooms}
              editingId={editingId}
              onEdit={setEditingId}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}
        </div>
      ))}

      {/* Empty state */}
      {!isLoading && (items as FFEItem[]).length === 0 && (
        <div
          className="py-8 text-center"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          No items yet. Add your first FF&E item to begin building the schedule.
        </div>
      )}

      {/* Total row */}
      {(items as FFEItem[]).length > 0 && (
        <div
          className="mt-1 grid items-baseline gap-2 border-t-2 border-[var(--border-default)] pt-3"
          style={{ gridTemplateColumns: '1fr 60px 80px 100px 40px' }}
        >
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
          <span />
          <span />
          <span
            className="text-right"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '1rem',
              color: 'var(--text-primary)',
            }}
          >
            {formatDollars(totalEstimate)}
          </span>
          <span />
        </div>
      )}

      {/* Add item */}
      {isAdding ? (
        <div className="mt-3">
          <ItemForm
            rooms={typedRooms}
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setIsAdding(false)}
            isSaving={addItem.isPending}
          />
        </div>
      ) : (
        <div className="mt-3">
          <PortalButton variant="secondary" onClick={() => setIsAdding(true)}>
            + Add Item
          </PortalButton>
        </div>
      )}
    </div>
  );
}

// ─── Local hook for proposal items with scope_room_id ────────────────────────
// This wraps the proposal items query to include scope_room_id field

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
