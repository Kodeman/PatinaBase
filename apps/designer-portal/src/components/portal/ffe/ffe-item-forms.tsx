'use client';

import { useState } from 'react';
import { Button, Input, Select, Textarea } from '@/components/ui/controls';

// Shared allowance / TBD add-forms used by BOTH the proposal FF&E schedule
// builder and the project FF&E board. They are surface-agnostic: the caller
// supplies rooms + categories and an onSave that performs the actual write
// (useAddProposalItem on proposals, useAddProjectFFEItem on projects). Inputs
// are in dollars — the caller converts to cents before persisting.

/** A room the item can be targeted at. Both proposal scope rooms and project rooms fit. */
export interface FormRoom {
  id: string;
  name: string;
}

// ─── Allowance form (range required, category required) ─────────────────────

export interface AllowanceFormState {
  ffeCategory: string;
  scopeRoomId: string;
  minDollars: string;
  maxDollars: string;
  notes: string;
}

export const EMPTY_ALLOWANCE_FORM: AllowanceFormState = {
  ffeCategory: '',
  scopeRoomId: '',
  minDollars: '',
  maxDollars: '',
  notes: '',
};

export function AllowanceForm({
  rooms,
  categories,
  onSave,
  onCancel,
  isSaving,
}: {
  rooms: FormRoom[];
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
          <Select
            value={form.ffeCategory}
            onChange={(e) => update('ffeCategory', e.target.value)}
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
          <span className="type-meta mb-1 block">Room</span>
          <Select
            value={form.scopeRoomId}
            onChange={(e) => update('scopeRoomId', e.target.value)}
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
              value={form.minDollars}
              onChange={(e) => update('minDollars', e.target.value)}
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
              value={form.maxDollars}
              onChange={(e) => update('maxDollars', e.target.value)}
              placeholder="0"
              className="pl-7"
            />
          </div>
        </label>
      </div>

      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <Textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          placeholder="Specification notes, lead time, COM details…"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={() => onSave(form)} disabled={!canSave || isSaving}>
          {isSaving ? 'Saving…' : 'Save Allowance'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── TBD form (category required) ────────────────────────────────────────────

export interface TbdFormState {
  ffeCategory: string;
  scopeRoomId: string;
  notes: string;
}

export const EMPTY_TBD_FORM: TbdFormState = {
  ffeCategory: '',
  scopeRoomId: '',
  notes: '',
};

export function TbdForm({
  rooms,
  categories,
  onSave,
  onCancel,
  isSaving,
}: {
  rooms: FormRoom[];
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
          <Select
            value={form.ffeCategory}
            onChange={(e) => update('ffeCategory', e.target.value)}
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
          <span className="type-meta mb-1 block">Room</span>
          <Select
            value={form.scopeRoomId}
            onChange={(e) => update('scopeRoomId', e.target.value)}
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

      <label className="block">
        <span className="type-meta mb-1 block">Notes (optional)</span>
        <Textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          placeholder="What still needs to be specified, vendor quotes pending, etc."
        />
      </label>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={() => onSave(form)}
          disabled={!form.ffeCategory || isSaving}
        >
          {isSaving ? 'Saving…' : 'Save TBD'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
