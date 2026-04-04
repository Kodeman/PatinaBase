'use client';

import { useState } from 'react';
import { PortalButton } from './button';

interface ScopeChangeFormProps {
  projectName: string;
  currentBudgetCents: number;
  onSave: (data: ScopeChangeFormData) => void;
  onSend: (data: ScopeChangeFormData) => void;
  onCancel: () => void;
  saving?: boolean;
}

export interface ScopeChangeFormData {
  title: string;
  description: string;
  additionalFfeBudgetCents: number;
  additionalDesignFeeCents: number;
  timelineImpactWeeks: number;
  newRooms: Array<{ name: string; dimensions?: string; budgetCents: number; ffeCategories: string[] }>;
  newFfeItems: Array<{
    name: string;
    ffeCategory?: string;
    itemType: 'fixed' | 'allowance' | 'tbd';
    unitPriceCents: number;
    quantity: number;
    roomName?: string;
  }>;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

export function ScopeChangeForm({
  projectName,
  currentBudgetCents,
  onSave,
  onSend,
  onCancel,
  saving,
}: ScopeChangeFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [additionalFfe, setAdditionalFfe] = useState(0);
  const [additionalFee, setAdditionalFee] = useState(0);
  const [timelineWeeks, setTimelineWeeks] = useState(0);

  // Simplified: new rooms as a simple list
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomBudget, setNewRoomBudget] = useState(0);
  const [newRooms, setNewRooms] = useState<Array<{ name: string; budgetCents: number; ffeCategories: string[] }>>([]);

  const newTotalCents = currentBudgetCents + additionalFfe * 100 + additionalFee * 100;

  const formData: ScopeChangeFormData = {
    title,
    description,
    additionalFfeBudgetCents: additionalFfe * 100,
    additionalDesignFeeCents: additionalFee * 100,
    timelineImpactWeeks: timelineWeeks,
    newRooms: newRooms.map((r) => ({ ...r, dimensions: undefined })),
    newFfeItems: [],
  };

  const addRoom = () => {
    if (!newRoomName.trim()) return;
    setNewRooms([...newRooms, { name: newRoomName.trim(), budgetCents: newRoomBudget * 100, ffeCategories: [] }]);
    setNewRoomName('');
    setNewRoomBudget(0);
  };

  const inputClass =
    'w-full rounded-[3px] border border-[var(--border-default)] bg-white px-3 py-2 font-body text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';
  const labelClass =
    'mb-1 block font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]';

  return (
    <div className="max-w-[560px]">
      <div className="mb-6 grid grid-cols-1 gap-5">
        {/* Title */}
        <div>
          <label className={labelClass}>What&apos;s Changing</label>
          <input
            className={`${inputClass} !font-display !text-base !font-medium`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add entryway to project scope"
          />
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what's being added or changed and why..."
          />
        </div>

        {/* Cost fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Additional FF&E Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-[var(--text-muted)]">$</span>
              <input
                type="number"
                className={`${inputClass} pl-7`}
                value={additionalFfe || ''}
                onChange={(e) => setAdditionalFfe(Number(e.target.value))}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Additional Design Fee</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-[var(--text-muted)]">$</span>
              <input
                type="number"
                className={`${inputClass} pl-7`}
                value={additionalFee || ''}
                onChange={(e) => setAdditionalFee(Number(e.target.value))}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Timeline Impact</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">+</span>
              <input
                type="number"
                className={inputClass}
                value={timelineWeeks || ''}
                onChange={(e) => setTimelineWeeks(Number(e.target.value))}
                placeholder="0"
              />
              <span className="text-sm text-[var(--text-muted)]">weeks</span>
            </div>
          </div>
          <div>
            <label className={labelClass}>New Total Project Value</label>
            <input
              className={`${inputClass} !font-medium`}
              value={formatDollars(newTotalCents)}
              readOnly
            />
          </div>
        </div>
      </div>

      {/* New rooms */}
      <div className="mb-6">
        <label className={labelClass}>New Rooms (optional)</label>
        {newRooms.map((room, i) => (
          <div
            key={i}
            className="mb-2 flex items-center gap-2 rounded border border-[var(--border-default)] px-3 py-2"
          >
            <span className="flex-1 font-body text-sm">{room.name}</span>
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {formatDollars(room.budgetCents)}
            </span>
            <button
              onClick={() => setNewRooms(newRooms.filter((_, idx) => idx !== i))}
              className="text-xs text-[var(--text-muted)] hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            className={`${inputClass} flex-1`}
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Room name"
            onKeyDown={(e) => e.key === 'Enter' && addRoom()}
          />
          <div className="relative w-32">
            <span className="absolute left-3 top-2 text-sm text-[var(--text-muted)]">$</span>
            <input
              type="number"
              className={`${inputClass} pl-7`}
              value={newRoomBudget || ''}
              onChange={(e) => setNewRoomBudget(Number(e.target.value))}
              placeholder="Budget"
            />
          </div>
          <PortalButton variant="secondary" onClick={addRoom}>
            Add
          </PortalButton>
        </div>
      </div>

      {/* What happens when approved */}
      <div
        className="mb-6 rounded-md border p-4"
        style={{
          background: 'rgba(196,165,123,0.04)',
          borderColor: 'rgba(196,165,123,0.12)',
        }}
      >
        <p className="mb-1 font-mono text-[0.55rem] uppercase tracking-wider text-[var(--accent-primary)]">
          What happens when approved
        </p>
        <p className="font-body text-xs leading-relaxed text-[var(--text-body)]">
          {newRooms.length > 0
            ? `${newRooms.length} new room scope card(s) will be added to the project. `
            : ''}
          Budget and timeline update across the project. The original signed proposal is annotated
          with this change order.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 border-t border-[var(--border-default)] pt-5">
        <button
          onClick={() => onSend(formData)}
          disabled={!title.trim() || !description.trim() || saving}
          className="rounded-[3px] bg-[var(--accent-primary)] px-5 py-2.5 font-body text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Sending...' : 'Send to Client for Approval'}
        </button>
        <PortalButton
          variant="secondary"
          onClick={() => onSave(formData)}
          disabled={!title.trim() || saving}
        >
          Save Draft
        </PortalButton>
        <PortalButton variant="ghost" onClick={onCancel}>
          Cancel
        </PortalButton>
      </div>
    </div>
  );
}
