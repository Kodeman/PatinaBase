'use client';

/**
 * The title picker (U4) — a controlled paper dropdown listing the studio's
 * nine curated titles (StaffRole vocab, packages/types/src/studio-config.ts)
 * plus a "Custom title…" row that swaps in an underline text input. Paper,
 * pearl border, 5px radius, no shadow — the Document has no light source.
 * Closes on an outside click or Esc via `onClose`; the caller owns whether
 * the panel is mounted at all (member-title-line toggles it on a click,
 * studio-invite-modal keeps it open while the invite sheet is up).
 */

import { useEffect, useRef, useState } from 'react';
import {
  ALL_STAFF_ROLES,
  STAFF_ROLE_LABELS,
  STAFF_ROLE_DEFAULT_TIER,
  type StaffRole,
} from '@patina/types';

export type PermissionTier = 'owner' | 'admin' | 'member' | 'guest';

/** Reverse-lookup: the StaffRole key for a curated label, or undefined for
 *  free text. Shared by member-title-line (staff_role write) and the invite
 *  modal (same payload rule: "the curated key, omitted for custom"). */
export function findStaffRoleByLabel(label: string): StaffRole | undefined {
  return ALL_STAFF_ROLES.find((role) => STAFF_ROLE_LABELS[role] === label);
}

export interface TitlePickerProps {
  /** The currently-set title (label or custom text), or null when unset. */
  value: string | null;
  /** Fires with the picked label (or trimmed custom text) and, for a curated
   *  pick, that role's default permission tier — undefined for custom text. */
  onPick: (title: string, suggestedTier?: PermissionTier) => void;
  /** Outside click or Esc — the caller unmounts/hides the panel. */
  onClose: () => void;
  /** Right-aligned mono tier hint beside each curated title. */
  showTierHints?: boolean;
  className?: string;
}

export function TitlePicker({
  value,
  onPick,
  onClose,
  showTierHints = true,
  className,
}: TitlePickerProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const pickCurated = (role: StaffRole) => {
    onPick(STAFF_ROLE_LABELS[role], STAFF_ROLE_DEFAULT_TIER[role]);
  };

  const submitCustom = () => {
    const trimmed = customValue.trim();
    if (!trimmed) return;
    onPick(trimmed);
  };

  return (
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Title"
      className={`absolute z-20 min-w-[230px] rounded-[5px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] py-1 ${className ?? ''}`}
    >
      {ALL_STAFF_ROLES.map((role) => {
        const label = STAFF_ROLE_LABELS[role];
        const selected = value === label;
        return (
          <button
            key={role}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => pickCurated(role)}
            className={`flex w-full min-h-11 items-baseline justify-between gap-3.5 px-3 py-1.5 text-left text-[13.5px] text-[var(--color-charcoal)] hover:bg-[rgba(196,165,123,0.08)] ${
              selected ? 'bg-[rgba(196,165,123,0.16)]' : ''
            }`}
          >
            <span>{label}</span>
            {showTierHints && (
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]">
                {STAFF_ROLE_DEFAULT_TIER[role]}
              </span>
            )}
          </button>
        );
      })}

      <div role="separator" className="my-1 h-px bg-[var(--color-pearl)]" />

      {customOpen ? (
        <div className="px-3 py-1.5">
          <input
            autoFocus
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCustom();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setCustomOpen(false);
              }
            }}
            placeholder="Custom title"
            aria-label="Custom title"
            className="w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-1 text-[13.5px] italic text-[var(--color-mocha)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="flex w-full min-h-11 items-baseline justify-between gap-3.5 px-3 py-1.5 text-left font-heading text-[13.5px] italic text-[var(--color-mocha)] hover:bg-[rgba(196,165,123,0.08)]"
        >
          <span>Custom title…</span>
          <span className="shrink-0 font-mono text-[11px] uppercase not-italic tracking-[0.14em] text-[var(--color-aged-oak)]">
            free text
          </span>
        </button>
      )}

      <p className="mt-1 max-w-[280px] px-3 pb-1 text-[11px] italic leading-snug text-[var(--color-aged-oak)]">
        Changing a title never changes permissions.
      </p>
    </div>
  );
}
