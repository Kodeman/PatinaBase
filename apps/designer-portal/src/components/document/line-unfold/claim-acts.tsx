'use client';

import { useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDamageClaim } from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DocumentAction } from '../document-action';
import { InspectionPhotoStrip } from './inspection-photo-strip';

/**
 * PRC-11 (R84): the claim lifecycle acts on the line's open item-grain
 * claims — DamageClaimDrawer's state machine (drafted → vendor_notified →
 * resolved, forward only, useUpdateDamageClaim) ported into the unfold's
 * quiet grammar. Creation stays with the inspection drawer's auto-draft;
 * this is the walk forward.
 */
export function ClaimActs({
  claims,
}: {
  claims: {
    id: string;
    state: string;
    inspection?: { photo_asset_ids?: unknown } | null;
  }[];
}) {
  const qc = useQueryClient();
  const updateClaim = useUpdateDamageClaim({ errorSurface: 'inline' });
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const oneVoice = useFeatureFlag('one-voice').value === true;

  // US-19 FR4 Fix 11 (`one-voice`) — Esc inside the resolve form is Cancel:
  // the form closes and focus goes back to the claim's `Mark resolved`. The
  // key is taken so the paper's put-down does not fire; mid-save it closes
  // nothing.
  const onResolveKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!oneVoice || event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (updateClaim.isPending) return;
    const opener = event.currentTarget.parentElement?.querySelector<HTMLElement>(
      '[data-action-key="open-resolve-ffe-claim"]',
    );
    setResolvingId(null);
    window.requestAnimationFrame(() => opener?.focus());
  };

  const run = async (id: string, state: 'vendor_notified' | 'resolved') => {
    if (updateClaim.isPending) return;
    setError(null);
    try {
      await updateClaim.mutateAsync({
        id,
        state,
        ...(state === 'resolved' && note.trim()
          ? { resolution_notes: note.trim() }
          : {}),
      });
      // One act, many surfaces (§5): line stamp, Receiving book, Desk need.
      void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      setConfirmed(
        state === 'vendor_notified'
          ? 'Vendor notified — the claim is with them now.'
          : 'Resolved — folded into the record.',
      );
      setResolvingId(null);
      setNote('');
    } catch (e) {
      setError((e as Error).message || 'The claim could not be updated.');
    }
  };

  return (
    <div className="mb-2.5 border-l-[2px] border-[var(--color-terracotta)] pl-2.5">
      {claims.map((c) => (
        <div key={c.id} className="py-0.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
              Claim ·{' '}
              {c.state === 'vendor_notified' ? 'vendor notified' : 'drafted'}
            </span>
            {c.state === 'drafted' && (
              <DocumentAction
                actionKey="notify-vendor-of-ffe-claim"
                surfaceKey="project"
                regionKey="ffe-claim"
                variant="primary"
                disabled={updateClaim.isPending}
                loading={updateClaim.isPending}
                loadingLabel="Notifying…"
                onClick={() => void run(c.id, 'vendor_notified')}
              >
                {/* US-19 F6-8 (D16) — the paper's word is maker. */}
                {oneVoice ? 'Notify the maker' : 'Notify vendor'}
              </DocumentAction>
            )}
            {c.state === 'vendor_notified' && (
              <DocumentAction
                actionKey="open-resolve-ffe-claim"
                surfaceKey="project"
                regionKey="ffe-claim"
                variant="secondary"
                onClick={() =>
                  setResolvingId((cur) => (cur === c.id ? null : c.id))
                }
                aria-expanded={resolvingId === c.id}
              >
                Mark resolved {resolvingId === c.id ? '↑' : '↓'}
              </DocumentAction>
            )}
          </div>
          <InspectionPhotoStrip photoAssetIds={c.inspection?.photo_asset_ids} />
          {resolvingId === c.id && (
            <div className="mt-1 flex items-end gap-2" onKeyDown={onResolveKeyDown}>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="How was it resolved? (replacement shipped, credit issued…)"
                aria-label="Resolution notes"
                className="min-w-0 flex-1 resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)]"
              />
              <DocumentAction
                actionKey="resolve-ffe-claim"
                surfaceKey="project"
                regionKey="ffe-claim-resolution"
                variant="primary"
                disabled={updateClaim.isPending}
                loading={updateClaim.isPending}
                loadingLabel="Resolving…"
                onClick={() => void run(c.id, 'resolved')}
              >
                Mark resolved
              </DocumentAction>
            </div>
          )}
        </div>
      ))}
      {confirmed && !error && (
        // R51: the quiet confirmation.
        <p className="text-[11px] text-[var(--text-muted)]">{confirmed}</p>
      )}
      {error && (
        // R83: inline at the act.
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}
