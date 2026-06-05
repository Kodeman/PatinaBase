'use client';

import { useState } from 'react';
import type { MockRoom } from '@/types/project-ui';
import { ProgressBar } from '@/components/portal/progress-bar';
import { Button } from '@/components/ui/controls';

export interface NewRoomInput {
  name: string;
  dimensions?: string;
  budgetCents?: number;
  notes?: string;
}

interface RoomScopeGridProps {
  rooms: MockRoom[];
  /** When true, show the inline "add room" form. */
  editable?: boolean;
  onAddRoom?: (room: NewRoomInput) => void;
}

function AddRoomInline({ onAdd }: { onAdd: (room: NewRoomInput) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [budget, setBudget] = useState('');

  const reset = () => {
    setName('');
    setDimensions('');
    setBudget('');
    setOpen(false);
  };

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    const cleaned = budget.replace(/[$,\s]/g, '');
    const dollars = Number(cleaned);
    const budgetCents = cleaned && Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : undefined;
    onAdd({ name: n, dimensions: dimensions.trim() || undefined, budgetCents });
    reset();
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        + Add Room to Scope
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3" style={{ borderColor: 'var(--border-default)' }}>
      <input
        autoFocus
        value={name}
        placeholder="Room name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="rounded-[3px] border px-2 py-1"
        style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}
      />
      <input
        value={dimensions}
        placeholder="Dimensions (optional)"
        onChange={(e) => setDimensions(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="rounded-[3px] border px-2 py-1"
        style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}
      />
      <input
        value={budget}
        placeholder="Budget $ (optional)"
        inputMode="decimal"
        onChange={(e) => setBudget(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="w-32 rounded-[3px] border px-2 py-1"
        style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}
      />
      <Button type="button" variant="primary" size="sm" onClick={submit}>
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={reset}>
        Cancel
      </Button>
    </div>
  );
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function RoomCard({ room }: { room: MockRoom }) {
  return (
    <div
      className="mb-3 rounded-md border p-4 transition-colors hover:border-[var(--color-clay)]"
      style={{ borderColor: 'var(--border-default)' }}
    >
      {/* Header row */}
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {room.name}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {room.dimensions} · {room.notes}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1rem' }}>
            {formatDollars(room.budget)}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
            }}
          >
            {room.itemCount} items · {room.orderedCount} ordered
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2" style={{ height: '4px' }}>
        <ProgressBar progress={room.progress} />
      </div>

      {/* Item tags */}
      <div className="flex flex-wrap gap-1.5">
        {room.itemNames.map((name) => (
          <span
            key={name}
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
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RoomScopeGrid({ rooms, editable = false, onAddRoom }: RoomScopeGridProps) {
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
        Project Scope by Room
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Each room has its own FF&E schedule, budget allocation, and progress tracker
      </div>

      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}

      {rooms.length === 0 && (
        <div className="mb-2 type-body italic text-[var(--text-muted)]" style={{ fontSize: '0.82rem' }}>
          No rooms in scope yet.
        </div>
      )}

      {editable && onAddRoom && (
        <div className="mt-2">
          <AddRoomInline onAdd={onAddRoom} />
        </div>
      )}
    </div>
  );
}
