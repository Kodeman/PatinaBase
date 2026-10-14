'use client';

import { useEffect, useRef, useState } from 'react';
import { IconButton, Input, Select } from '@/components/ui/controls';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  useUpsertSwatch,
  useDeleteSwatch,
  useRestoreSwatch,
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
  /**
   * N15: asks the list to keep this row mounted after the swatch leaves the
   * palette (true) and lets it go (false), so the Undo row outlives the
   * delete's receipt.
   */
  retain?: (keep: boolean) => void;
}

/**
 * Single-row swatch editor: hex tile, name input, role select, optional
 * brand-code badge, delete button. Fields save through useUpsertSwatch on
 * commit (the host invalidates the parent palette and client-copy queries).
 *
 * US-34 N15 (`optimistic-ink` on): delete asks no confirm. The row reads
 * "Removing…" under an in-flow Undo row that takes focus, and "Removed" only
 * on the receipt. Undo restores this one swatch (useRestoreSwatch).
 */
export function PaletteSwatchEditor({
  proposalId,
  swatch,
  dragHandleProps,
  retain,
}: PaletteSwatchEditorProps) {
  const [name, setName] = useState(swatch.name ?? '');
  const [role, setRole] = useState<PaletteSwatchRole | ''>((swatch.role ?? '') as PaletteSwatchRole | '');

  const [saveFailed, setSaveFailed] = useState(false);

  const upsert = useUpsertSwatch();
  const remove = useDeleteSwatch();
  const isLinkedToBrand = !!(swatch.paint_color_id && swatch.brand && swatch.brand_code);
  const ink = useFeatureFlag('optimistic-ink').value === true;
  // N15: open from the delete click until Undo lands or the delete is refused.
  const [removal, setRemoval] = useState<{
    deleting: Promise<unknown>;
    swatch: PaletteSwatch;
  } | null>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const [refocusDelete, setRefocusDelete] = useState(false);
  // F15c: a delete is pending-only. The row stays, reading "Removing…", until
  // the server confirms; it leaves on the refetch (or, with N15, when the host
  // lets the retained row go).
  const removing = ink ? removal !== null : remove.isPending || remove.isSuccess;

  useEffect(() => {
    if (!refocusDelete) return;
    deleteRef.current?.focus();
    setRefocusDelete(false);
  }, [refocusDelete]);

  const closeRemoval = () => {
    setRemoval(null);
    retain?.(false);
    setRefocusDelete(true);
  };

  const handleNameBlur = () => {
    if ((swatch.name ?? '') === name) return;
    setSaveFailed(false);
    // A refused name keeps the typed words in the field (no lost words).
    upsert.mutate(
      {
        proposalId,
        paletteId: swatch.palette_id,
        swatchId: swatch.id,
        hex: swatch.hex,
        name: name || null,
      },
      { onError: () => setSaveFailed(true) },
    );
  };

  const handleRoleChange = (next: string) => {
    const value = next === '' ? null : (next as PaletteSwatchRole);
    const serverRole = (swatch.role ?? '') as PaletteSwatchRole | '';
    setRole((value ?? '') as PaletteSwatchRole | '');
    setSaveFailed(false);
    upsert.mutate(
      {
        proposalId,
        paletteId: swatch.palette_id,
        swatchId: swatch.id,
        hex: swatch.hex,
        role: value,
      },
      {
        // F15b: a refused role rolls the select back to the server value, so
        // it never shows a state the database lacks.
        onError: () => {
          setRole(serverRole);
          setSaveFailed(true);
        },
      },
    );
  };

  const handleDelete = () => {
    const variables = {
      proposalId,
      swatchId: swatch.id,
      paletteId: swatch.palette_id,
    };
    if (!ink) {
      if (!confirm('Delete this swatch?')) return;
      remove.mutate(variables);
      return;
    }
    retain?.(true);
    const deleting = remove.mutateAsync(variables);
    setRemoval({ deleting, swatch });
    // A refused delete never removed the row: back to the plain row + alert.
    deleting.catch(closeRemoval);
  };

  const handleRestored = () => {
    remove.reset();
    closeRemoval();
  };

  return (
    <div aria-busy={(ink ? remove.isPending : removing) || undefined}>
      <div
        className={`flex items-center gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 ${
          ink && removing ? 'opacity-60' : ''
        }`}
        // The swatch is leaving or gone: its fields take no more edits.
        inert={ink && removing ? true : undefined}
      >
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
        {removing ? (
          !ink && (
            <span role="status" className="shrink-0 text-xs text-[var(--text-muted)]">
              Removing…
            </span>
          )
        ) : (
          <IconButton
            ref={deleteRef}
            label="Delete swatch"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </IconButton>
        )}
      </div>
      {ink && removal && (
        <SwatchUndoRow
          proposalId={proposalId}
          swatch={removal.swatch}
          deleting={removal.deleting}
          removed={remove.isSuccess}
          onRestored={handleRestored}
        />
      )}
      {(saveFailed || remove.isError) && (
        <p role="alert" className="mt-1 text-xs text-[var(--color-terracotta-ink)]">
          {remove.isError ? 'Couldn’t remove the swatch' : 'Couldn’t save'}
        </p>
      )}
    </div>
  );
}

/**
 * N15's in-flow Undo row (no shadow). It takes focus when it opens. An Undo
 * pressed while the delete is still in flight waits for its receipt, then
 * restores; a refused delete closes the row from the editor instead.
 */
function SwatchUndoRow({
  proposalId,
  swatch,
  deleting,
  removed,
  onRestored,
}: {
  proposalId: string;
  swatch: PaletteSwatch;
  deleting: Promise<unknown>;
  removed: boolean;
  onRestored: () => void;
}) {
  const restore = useRestoreSwatch();
  const [waiting, setWaiting] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const restoring = waiting || restore.isPending;

  useEffect(() => {
    undoRef.current?.focus();
  }, []);

  const undo = async () => {
    if (restoring) return;
    setWaiting(true);
    try {
      await deleting;
    } catch {
      return;
    }
    setWaiting(false);
    restore.mutate({ swatch, proposalId }, { onSuccess: onRestored });
  };

  return (
    <div className="mt-1">
      <div className="flex min-h-[44px] items-center gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] pl-3">
        <span role="status" className="flex-1 text-xs text-[var(--text-muted)]">
          {swatch.name || swatch.hex.toUpperCase()}: {removed ? 'Removed' : 'Removing…'}
        </span>
        <button
          ref={undoRef}
          type="button"
          onClick={() => void undo()}
          aria-disabled={restoring || undefined}
          aria-busy={restoring || undefined}
          className="min-h-[44px] min-w-[44px] px-3 text-xs font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
        >
          {restoring ? 'Restoring…' : 'Undo'}
        </button>
      </div>
      {restore.isError && (
        <p role="alert" className="mt-1 text-xs text-[var(--color-terracotta-ink)]">
          Couldn’t restore the swatch
        </p>
      )}
    </div>
  );
}
