'use client';

import { useState } from 'react';
import { IconButton, Input, Select } from '@/components/ui/controls';
import {
  useUpsertSwatch,
  useDeleteSwatch,
  type PaletteSwatch,
  type PaletteSwatchRole,
} from '@patina/supabase';

const ROLE_OPTIONS: Array<{ value: PaletteSwatchRole; label: string }> = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'wall', label: 'Wall' },
  { value: 'accent', label: 'Accent' },
  { value: 'trim', label: 'Trim' },
  { value: 'ceiling', label: 'Ceiling' },
  { value: 'floor', label: 'Floor' },
  { value: 'metal', label: 'Metal' },
  { value: 'textile', label: 'Textile' },
  { value: 'other', label: 'Other' },
];

interface PaletteSwatchEditorProps {
  proposalId: string;
  swatch: PaletteSwatch;
  /** dnd-kit drag handle props/refs forwarded by the parent. */
  dragHandleProps?: Record<string, unknown>;
}

/**
 * Single-row swatch editor: hex tile, name input, role select, optional
 * brand-code badge, delete button. Fields save through useUpsertSwatch on
 * commit (the host invalidates the parent palette and client-copy queries).
 */
export function PaletteSwatchEditor({
  proposalId,
  swatch,
  dragHandleProps,
}: PaletteSwatchEditorProps) {
  const [name, setName] = useState(swatch.name ?? '');
  const [role, setRole] = useState<PaletteSwatchRole | ''>((swatch.role ?? '') as PaletteSwatchRole | '');

  const upsert = useUpsertSwatch();
  const remove = useDeleteSwatch();

  const isLinkedToBrand = !!(swatch.paint_color_id && swatch.brand && swatch.brand_code);

  const handleNameBlur = () => {
    if ((swatch.name ?? '') === name) return;
    upsert.mutate({
      proposalId,
      paletteId: swatch.palette_id,
      swatchId: swatch.id,
      hex: swatch.hex,
      name: name || null,
    });
  };

  const handleRoleChange = (next: string) => {
    const value = next === '' ? null : (next as PaletteSwatchRole);
    setRole((value ?? '') as PaletteSwatchRole | '');
    upsert.mutate({
      proposalId,
      paletteId: swatch.palette_id,
      swatchId: swatch.id,
      hex: swatch.hex,
      role: value,
    });
  };

  const handleDelete = () => {
    if (!confirm('Delete this swatch?')) return;
    remove.mutate({
      proposalId,
      swatchId: swatch.id,
      paletteId: swatch.palette_id,
    });
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Drag swatch"
        {...(dragHandleProps ?? {})}
        className="cursor-grab text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      {/* Swatch tile */}
      <div
        className="h-10 w-10 shrink-0 rounded border border-[var(--border-default)]"
        style={{ backgroundColor: swatch.hex }}
        title={swatch.hex}
      />

      {/* Hex code */}
      <div className="font-mono text-xs uppercase text-[var(--text-muted)]" style={{ minWidth: '5.5rem' }}>
        {swatch.hex.toUpperCase()}
      </div>

      {/* Name input */}
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleNameBlur}
        placeholder="Name (optional)"
        className="min-w-0 flex-1"
      />

      {/* Role select */}
      <Select
        value={role}
        onChange={(e) => handleRoleChange(e.target.value)}
        wrapperClassName="w-auto"
      >
        <option value="">Role…</option>
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>

      {/* Brand badge */}
      {isLinkedToBrand && (
        <span
          className="rounded-full border border-[var(--border-default)] px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]"
          title={`${swatch.brand} ${swatch.brand_code}`}
        >
          {swatch.brand_code}
        </span>
      )}

      {/* Delete */}
      <IconButton
        label="Delete swatch"
        variant="ghost"
        size="sm"
        onClick={handleDelete}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </IconButton>
    </div>
  );
}
