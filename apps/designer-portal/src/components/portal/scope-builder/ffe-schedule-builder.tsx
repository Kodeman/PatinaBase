'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { PortalButton } from '@/components/portal/button';
import { proposalEvents } from '@/lib/analytics';
import {
  useProposalScopeRooms,
  useFFECategories,
  useProduct,
  useConsumeCapture,
  createBrowserClient,
  type ProposalItemType,
} from '@patina/supabase';
import {
  useAddProposalItem,
  useUpdateProposalItem,
  useRemoveProposalItem,
} from '@/hooks/use-proposals';
import { ProductPickerModal } from '@/components/portal/proposals/product-picker-modal';
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

function typeTagStyle(type: ProposalItemType): { color: string; bg: string } {
  switch (type) {
    case 'fixed':
      return { color: 'var(--color-sage)', bg: 'rgba(122, 155, 118, 0.08)' };
    case 'allowance':
      return { color: 'var(--color-golden-hour)', bg: 'rgba(232, 197, 71, 0.08)' };
    case 'tbd':
      return { color: 'var(--text-muted)', bg: 'rgba(139, 115, 85, 0.06)' };
  }
}

function typeLabel(type: ProposalItemType): string {
  switch (type) {
    case 'fixed':
      return 'Fixed';
    case 'allowance':
      return 'Allowance';
    case 'tbd':
      return 'TBD';
  }
}

function categoryLabel(slug: string | null, lookup: Map<string, string>): string {
  if (!slug) return '';
  return lookup.get(slug) ?? slug;
}

// ─── Allowance form (range required, category required) ─────────────────────

interface AllowanceFormState {
  ffeCategory: string;
  scopeRoomId: string;
  minDollars: string;
  maxDollars: string;
  notes: string;
}

const EMPTY_ALLOWANCE_FORM: AllowanceFormState = {
  ffeCategory: '',
  scopeRoomId: '',
  minDollars: '',
  maxDollars: '',
  notes: '',
};

function AllowanceForm({
  rooms,
  categories,
  onSave,
  onCancel,
  isSaving,
}: {
  rooms: ScopeRoom[];
  categories: Array<{ slug: string; label: string }>;
  onSave: (form: AllowanceFormState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<AllowanceFormState>(EMPTY_ALLOWANCE_FORM);

  const update = <K extends keyof AllowanceFormState>(key: K, v: AllowanceFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const minN = parseFloat(form.minDollars);
  const maxN = parseFloat(form.maxDollars);
  const rangeOk =
    !Number.isNaN(minN) && !Number.isNaN(maxN) && minN >= 0 && maxN >= 0 && minN <= maxN;
  const canSave = !!form.ffeCategory && rangeOk;

  return (
    <div className="space-y-3 rounded-md border border-[var(--accent-primary)] p-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Category *</span>
          <select
            value={form.ffeCategory}
            onChange={(e) => update('ffeCategory', e.target.value)}
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="type-meta mb-1 block">Room</span>
          <select
            value={form.scopeRoomId}
            onChange={(e) => update('scopeRoomId', e.target.value)}
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
      </div>

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
            <input
              type="number"
              min="0"
              value={form.minDollars}
              onChange={(e) => update('minDollars', e.target.value)}
              placeholder="0"
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
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
            <input
              type="number"
              min="0"
              value={form.maxDollars}
              onChange={(e) => update('maxDollars', e.target.value)}
              placeholder="0"
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </div>
        </label>
      </div>

      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          placeholder="Specification notes, lead time, COM details…"
          className="w-full resize-none rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.82rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
        />
      </label>

      <div className="flex items-center gap-2">
        <PortalButton variant="primary" onClick={() => onSave(form)} disabled={!canSave || isSaving}>
          {isSaving ? 'Saving…' : 'Save Allowance'}
        </PortalButton>
        <PortalButton variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </PortalButton>
      </div>
    </div>
  );
}

// ─── TBD form (category required) ────────────────────────────────────────────

interface TbdFormState {
  ffeCategory: string;
  scopeRoomId: string;
  notes: string;
}

const EMPTY_TBD_FORM: TbdFormState = {
  ffeCategory: '',
  scopeRoomId: '',
  notes: '',
};

function TbdForm({
  rooms,
  categories,
  onSave,
  onCancel,
  isSaving,
}: {
  rooms: ScopeRoom[];
  categories: Array<{ slug: string; label: string }>;
  onSave: (form: TbdFormState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<TbdFormState>(EMPTY_TBD_FORM);
  const update = <K extends keyof TbdFormState>(key: K, v: TbdFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="space-y-3 rounded-md border border-[var(--accent-primary)] p-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Category *</span>
          <select
            value={form.ffeCategory}
            onChange={(e) => update('ffeCategory', e.target.value)}
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="type-meta mb-1 block">Room</span>
          <select
            value={form.scopeRoomId}
            onChange={(e) => update('scopeRoomId', e.target.value)}
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
      </div>

      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          placeholder="What still needs to be specified, vendor quotes pending, etc."
          className="w-full resize-none rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.82rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
        />
      </label>

      <div className="flex items-center gap-2">
        <PortalButton
          variant="primary"
          onClick={() => onSave(form)}
          disabled={!form.ffeCategory || isSaving}
        >
          {isSaving ? 'Saving…' : 'Save TBD'}
        </PortalButton>
        <PortalButton variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </PortalButton>
      </div>
    </div>
  );
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
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name"
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </label>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="block">
              <span className="type-meta mb-1 block">Qty</span>
              <input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
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
                <input
                  type="number"
                  min="0"
                  value={priceDollars}
                  onChange={(e) => setPriceDollars(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
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
          <select
            value={ffeCategory}
            onChange={(e) => setFfeCategory(e.target.value)}
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          >
            <option value="">{item.item_type === 'fixed' ? 'None' : 'Select…'}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="type-meta mb-1 block">Room</span>
          <select
            value={scopeRoomId}
            onChange={(e) => setScopeRoomId(e.target.value)}
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
              <input
                type="number"
                min="0"
                value={minDollars}
                onChange={(e) => setMinDollars(e.target.value)}
                placeholder="0"
                className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
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
              <input
                type="number"
                min="0"
                value={maxDollars}
                onChange={(e) => setMaxDollars(e.target.value)}
                placeholder="0"
                className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
              />
            </div>
          </label>
        </div>
      )}

      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.82rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
        />
      </label>

      <div className="flex items-center gap-2">
        <PortalButton
          variant="primary"
          onClick={handleSave}
          disabled={!canSave || isSaving}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </PortalButton>
        <PortalButton variant="ghost" onClick={onDone} disabled={isSaving}>
          Cancel
        </PortalButton>
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
  const style = typeTagStyle(item.item_type);
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

  return (
    <div
      className="group grid items-center gap-2 border-b py-2"
      style={{
        gridTemplateColumns: '1fr 60px 80px 120px 40px',
        borderColor: 'rgba(229, 226, 221, 0.4)',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-primary)',
          }}
        >
          {item.name || categoryLabel(item.ffe_category, categoryLookup) || 'Untitled'}
        </div>
        {subtitle && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.68rem',
              fontStyle: 'italic',
              color: 'var(--color-aged-oak)',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

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
        {item.item_type === 'tbd' ? '—' : item.quantity}
      </div>

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
          {typeLabel(item.item_type)}
        </span>
      </div>

      <div
        className="text-right"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: '0.82rem',
          color: lineCost > 0 || rangeText ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
      >
        {item.item_type === 'allowance' && rangeText
          ? rangeText
          : lineCost > 0
            ? formatDollars(lineCost)
            : '—'}
      </div>

      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onStartEdit}
          className="cursor-pointer p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--accent-primary)]"
          title="Edit"
          aria-label="Edit item"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
        <button
          onClick={handleRemove}
          disabled={removeItem.isPending}
          className="cursor-pointer p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--color-terracotta)]"
          title="Remove"
          aria-label="Remove item"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Picker → Add product wrapper ────────────────────────────────────────────

/**
 * When the picker returns a product id, we fetch the product and create a
 * proposal_item with item_type='fixed'. This component is gated by the
 * pickerOpen state in the parent.
 */
function ProductAdder({
  proposalId,
  productId,
  scopeRoomId,
  ffeCategorySlug,
  onDone,
}: {
  proposalId: string;
  productId: string | null;
  scopeRoomId: string | null;
  ffeCategorySlug: string | null;
  onDone: () => void;
}) {
  const productQ = useProduct(productId ?? '');
  const addItem = useAddProposalItem();

  if (!productId) return null;
  if (productQ.isLoading) {
    return (
      <div
        className="rounded-md border border-dashed px-3 py-3 text-center type-body"
        style={{
          borderColor: 'var(--border-default)',
          color: 'var(--text-muted)',
          fontSize: '0.78rem',
        }}
      >
        Loading product…
      </div>
    );
  }
  if (productQ.isError) {
    return (
      <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        Failed to load product. Try picking again.
        <PortalButton variant="ghost" onClick={onDone}>Dismiss</PortalButton>
      </div>
    );
  }
  if (!productQ.data) return null;

  const product = productQ.data as {
    id: string;
    name: string;
    price_retail: number | null;
    vendor_id: string | null;
    vendor?: { name?: string | null } | null;
  };

  // Add the item exactly once. A useEffect would over-react to rerenders;
  // a plain mutate inside render would dispatch repeatedly. We use a guard
  // ref pattern via mutation's idle->pending transition: only fire when
  // idle.
  if (addItem.isIdle) {
    addItem.mutate(
      {
        proposalId,
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: product.price_retail ?? 0,
        vendorName: product.vendor?.name ?? undefined,
        itemType: 'fixed',
        scopeRoomId,
        ffeCategory: ffeCategorySlug,
      },
      {
        onSuccess: () => {
          proposalEvents.itemAdded({
            proposalId,
            itemType: 'fixed',
            hasProduct: true,
            lineTotal: product.price_retail ?? 0,
          });
        },
        onSettled: onDone,
      }
    );
  }

  return (
    <div
      className="rounded-md border border-dashed px-3 py-3 text-center type-body"
      style={{
        borderColor: 'var(--border-default)',
        color: 'var(--text-muted)',
        fontSize: '0.78rem',
      }}
    >
      {addItem.isPending ? 'Adding to schedule…' : 'Adding…'}
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
        boxShadow: isOver ? '0 0 0 1px var(--accent-primary)' : 'none',
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
          <button
            type="button"
            onClick={onCancel}
            className="text-[1.1rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Cancel"
          >
            ×
          </button>
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
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="type-meta mb-1 block">Qty</span>
            <input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
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
          <PortalButton
            variant="primary"
            onClick={() => onConfirm(slug, parsedQty)}
            disabled={!slug || isSaving}
          >
            {isSaving ? 'Adding…' : 'Add to schedule'}
          </PortalButton>
          <PortalButton variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </PortalButton>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface FFEScheduleBuilderProps {
  proposalId: string;
}

type PickerContext = {
  scopeRoomId: string | null;
  ffeCategorySlug: string | null;
};

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCtx, setPickerCtx] = useState<PickerContext>({
    scopeRoomId: null,
    ffeCategorySlug: null,
  });
  const [pickedProductId, setPickedProductId] = useState<string | null>(null);
  const [allowanceMode, setAllowanceMode] = useState(false);
  const [tbdMode, setTbdMode] = useState(false);
  const [captureDrop, setCaptureDrop] = useState<CaptureDropContext | null>(null);
  const [captureDropError, setCaptureDropError] = useState<string | null>(null);
  // Only one row may be in inline-edit mode at a time.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Open the product picker pre-targeted at a room (null → Unassigned).
  const openPickerForRoom = (scopeRoomId: string | null) => {
    setPickerCtx({ scopeRoomId, ffeCategorySlug: null });
    setPickerOpen(true);
  };

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

  const handleAllowanceSave = (form: AllowanceFormState) => {
    const budgetMin = Math.round(parseFloat(form.minDollars || '0') * 100);
    const budgetMax = Math.round(parseFloat(form.maxDollars || '0') * 100);
    addItem.mutate(
      {
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
      },
      {
        onSuccess: () => {
          proposalEvents.itemAdded({
            proposalId,
            itemType: 'allowance',
            hasProduct: false,
            lineTotal: Math.round((budgetMin + budgetMax) / 2),
          });
          setAllowanceMode(false);
        },
      }
    );
  };

  const handleTbdSave = (form: TbdFormState) => {
    addItem.mutate(
      {
        proposalId,
        name: categoryLookup.get(form.ffeCategory) ?? form.ffeCategory,
        quantity: 1,
        unitPrice: 0,
        notes: form.notes || undefined,
        itemType: 'tbd',
        scopeRoomId: form.scopeRoomId || null,
        ffeCategory: form.ffeCategory,
      },
      {
        onSuccess: () => {
          proposalEvents.itemAdded({
            proposalId,
            itemType: 'tbd',
            hasProduct: false,
            lineTotal: 0,
          });
          setTbdMode(false);
        },
      }
    );
  };

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

      <div
        className="mb-1 grid items-center gap-2 border-b py-1"
        style={{
          gridTemplateColumns: '1fr 60px 80px 120px 40px',
          borderColor: 'var(--border-default)',
        }}
      >
        {['Item / Vendor', 'Qty', 'Type', 'Cost / Range', ''].map((h) => (
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
                <button
                  type="button"
                  onClick={() => openPickerForRoom(groupRoomId)}
                  className="cursor-pointer text-[var(--text-muted)] transition-colors hover:text-[var(--accent-primary)]"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.58rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  + Add Item
                </button>
              </div>

              {group.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  proposalId={proposalId}
                  rooms={typedRooms}
                  categories={categoryOptions}
                  categoryLookup={categoryLookup}
                  isEditing={editingItemId === item.id}
                  onStartEdit={() => setEditingItemId(item.id)}
                  onStopEdit={() => setEditingItemId(null)}
                />
              ))}
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
                <button
                  type="button"
                  onClick={() => openPickerForRoom(room.id)}
                  className="cursor-pointer text-[var(--text-muted)] transition-colors hover:text-[var(--accent-primary)]"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.58rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  + Add Item
                </button>
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
        <div
          className="mt-1 grid items-baseline gap-2 border-t-2 border-[var(--border-default)] pt-3"
          style={{ gridTemplateColumns: '1fr 60px 80px 120px 40px' }}
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

      {/* Inline allowance form */}
      {allowanceMode && (
        <div className="mt-3">
          <AllowanceForm
            rooms={typedRooms}
            categories={categoryOptions}
            onSave={handleAllowanceSave}
            onCancel={() => setAllowanceMode(false)}
            isSaving={addItem.isPending}
          />
        </div>
      )}

      {/* Inline TBD form */}
      {tbdMode && (
        <div className="mt-3">
          <TbdForm
            rooms={typedRooms}
            categories={categoryOptions}
            onSave={handleTbdSave}
            onCancel={() => setTbdMode(false)}
            isSaving={addItem.isPending}
          />
        </div>
      )}

      {/* In-flight product add */}
      {pickedProductId && (
        <div className="mt-3">
          <ProductAdder
            proposalId={proposalId}
            productId={pickedProductId}
            scopeRoomId={pickerCtx.scopeRoomId}
            ffeCategorySlug={pickerCtx.ffeCategorySlug}
            onDone={() => setPickedProductId(null)}
          />
        </div>
      )}

      {/* Action buttons */}
      {!allowanceMode && !tbdMode && (
        <div className="mt-3 flex flex-wrap gap-2">
          <PortalButton variant="primary" onClick={() => openPickerForRoom(null)}>
            + Add Item
          </PortalButton>
          <PortalButton variant="secondary" onClick={() => setAllowanceMode(true)}>
            + Add Allowance
          </PortalButton>
          <PortalButton variant="ghost" onClick={() => setTbdMode(true)}>
            + Add TBD
          </PortalButton>
        </div>
      )}

      {/* Product picker modal */}
      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        defaultCategorySlug={pickerCtx.ffeCategorySlug ?? undefined}
        rooms={typedRooms}
        defaultScopeRoomId={pickerCtx.scopeRoomId}
        onPick={(r) => {
          // The modal may override the room the picker was opened with; carry
          // the user's choice into the in-flight add.
          setPickerCtx((prev) => ({ ...prev, scopeRoomId: r.scopeRoomId }));
          setPickedProductId(r.productId);
        }}
      />

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
