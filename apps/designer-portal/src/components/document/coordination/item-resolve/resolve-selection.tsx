'use client';

/**
 * ResolveSelection — the selection resolve panel (resolveKind 'select').
 *
 * Renders the item's options (the prototype's `.opt` rows); the designer picks
 * one and records it. `resolve_coordination_item({ itemId, selectedOptionId })`
 * (00218) delegates to apply_decision: the winning option becomes the FF&E line,
 * the blocks clear, the ball returns to the designer — one transaction (§5).
 *
 * Works whether the ball sits in the designer's or the client's court: a
 * designer can record the client's pick from the mirror (R49). Quiet
 * confirmation only (R51).
 */

import { useState } from 'react';
import { useResolveCoordinationItem } from '@patina/supabase';
import { fmtUsd } from '@/lib/document/format';
import {
  ButtonRow,
  QuietConfirm,
  ResolveButton,
  ResolveQuestion,
  ResolveShell,
  type ResolvePanelProps,
} from '../open-item-sheet';

export function ResolveSelection({
  item,
  projectId,
  onResolved,
  clientName,
}: ResolvePanelProps & { clientName?: string }) {
  const resolve = useResolveCoordinationItem(projectId);
  const options = item.options ?? [];
  const recommended = options.find((o) => o.is_recommended)?.id ?? null;
  const [picked, setPicked] = useState<string | null>(recommended);
  const [done, setDone] = useState(false);

  const inYourCourt = item.court === 'designer';
  const intro = inYourCourt
    ? 'Record the selection — the winning option becomes the order.'
    : `Record ${clientName ?? 'the client'}’s pick from their mirror — it becomes the order.`;

  const record = () => {
    if (!picked) return;
    resolve.mutate(
      { itemId: item.id, selectedOptionId: picked },
      {
        onSuccess: () => {
          setDone(true);
          window.setTimeout(onResolved, 900);
        },
      },
    );
  };

  return (
    <ResolveShell>
      <ResolveQuestion>{intro}</ResolveQuestion>

      {options.length === 0 ? (
        <p className="mb-3 text-[0.74rem] italic text-[var(--text-muted)]">
          No options on this selection yet — add them in the composer.
        </p>
      ) : (
        <div className="mb-3">
          {options.map((o) => {
            const isPicked = o.id === picked;
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => setPicked(o.id)}
                disabled={resolve.isPending || done}
                className="mb-1.5 flex w-full items-center gap-2.5 rounded-[7px] border px-2.5 py-2 text-left transition-all"
                style={{
                  borderColor: isPicked
                    ? 'var(--color-sage)'
                    : 'var(--color-pearl)',
                  background: isPicked
                    ? 'rgba(168,181,160,0.08)'
                    : 'var(--doc-paper)',
                }}
              >
                <span
                  aria-hidden
                  className="h-[34px] w-[34px] flex-shrink-0 overflow-hidden rounded-[6px] border border-[var(--doc-ink-border)]"
                  style={{ background: 'var(--color-pearl)' }}
                >
                  {o.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={o.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.78rem] font-medium text-[var(--color-charcoal)]">
                    {o.name}
                  </span>
                  <span className="block text-[0.62rem] text-[var(--color-aged-oak)]">
                    {o.price != null ? fmtUsd(o.price) : ''}
                    {o.is_recommended
                      ? o.price != null
                        ? ' · my pick'
                        : 'my pick'
                      : ''}
                  </span>
                </span>
                {isPicked && (
                  <span className="ml-auto font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--color-sage)]">
                    Picked
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ButtonRow>
        <ResolveButton
          actionKey="record-selection"
          tone="gold"
          onClick={record}
          disabled={!picked || resolve.isPending || done}
        >
          {resolve.isPending ? 'Recording…' : 'Record the selection →'}
        </ResolveButton>
        <ResolveButton
          actionKey="close-selection-for-later"
          tone="plain"
          variant="tertiary"
          onClick={onResolved}
          disabled={resolve.isPending}
        >
          Later
        </ResolveButton>
      </ButtonRow>

      {done && (
        <QuietConfirm>
          Recorded — the pick becomes the order. The FF&E line re-sorts.
        </QuietConfirm>
      )}
    </ResolveShell>
  );
}
