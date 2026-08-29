'use client';

/**
 * PhaseDeleteConfirm — the inline typographic swap that replaces the phase's
 * compose actions when Delete is pressed (Slice 03 §3, D4 — no modal, no
 * dialog). One honest DM-Mono sentence stating what leaves with the phase and
 * what re-links, then two real buttons: Delete · Cancel.
 *
 * The wording is composed HONESTLY from the data (R100 delete-relink): its
 * milestones CASCADE with the phase; every phase that followed it re-links to
 * this phase's own predecessor (relinkOnDelete), or becomes a chain root when
 * the deleted phase was itself the root. Zero-count segments are omitted so
 * the sentence never reads "0 milestones go with it".
 */

import { DocumentAction, DocumentActionGroup } from '../document-action';

export interface PhaseDeleteConfirmProps {
  name: string;
  /** Milestones under this phase — they CASCADE-delete with it. */
  milestoneCount: number;
  /** Phases whose follows_phase_id points at this one — they re-link. */
  followerCount: number;
  /** This phase's predecessor name (what followers re-link to), or null (root). */
  predecessorName: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Inline terracotta line when the delete FAILED — the confirm stays open.
   *  The relink-then-delete sequence is not transactional, so the message
   *  must state the partial-state caveat honestly (the caller composes it). */
  errorText?: string | null;
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

export function PhaseDeleteConfirm({
  name,
  milestoneCount,
  followerCount,
  predecessorName,
  onConfirm,
  onCancel,
  busy = false,
  errorText = null,
}: PhaseDeleteConfirmProps) {
  const segments: string[] = [];
  if (milestoneCount > 0)
    segments.push(`${plural(milestoneCount, 'milestone')} go with it`);
  if (followerCount > 0) {
    segments.push(
      predecessorName
        ? `${plural(followerCount, 'phase')} will follow ${predecessorName}`
        : `${plural(followerCount, 'phase')} will start the chain`,
    );
  }
  const detail = segments.length > 0 ? ` ${segments.join('; ')}.` : '';

  return (
    <div className="mt-[0.5rem]">
      <div className="flex flex-wrap items-baseline gap-x-[0.8rem] gap-y-[0.3rem]">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
          Delete “{name}”?{detail}
        </span>
        <DocumentActionGroup
          surfaceKey="schedule"
          regionKey="phase-delete-confirmation"
        >
          <DocumentAction
            actionKey="confirm-delete-phase"
            variant="danger"
            onClick={onConfirm}
            disabled={busy}
            loading={busy}
            loadingLabel="Deleting…"
          >
            Delete
          </DocumentAction>
          <DocumentAction
            actionKey="cancel-delete-phase"
            variant="tertiary"
            onClick={onCancel}
          >
            Cancel
          </DocumentAction>
        </DocumentActionGroup>
      </div>
      {errorText && (
        <div className="mt-[0.35rem] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
          {errorText}
        </div>
      )}
    </div>
  );
}
