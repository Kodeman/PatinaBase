'use client';

/**
 * The Discovery margin (R66) — notes only. The load-bearing split: structured
 * facts live in the blocks; the call's tone, hesitations, the designer's hand
 * land here as an unstructured Note (R14). This rail can ONLY write a Note —
 * it has no access to the structured upsert — so the invariant holds by
 * construction. Reads relationship-keyed notes directly (use-discovery-margin).
 */

import { useState } from 'react';
import { useDiscoveryMarginNotes } from '@/hooks/use-discovery-margin';
import { useCreateMarginNote } from '@/hooks/use-margin-notes';
import { MarginItem } from '../margin-item';

export function DiscoveryMargin({ designerClientId }: { designerClientId: string }) {
  const { data: notes } = useDiscoveryMarginNotes(designerClientId);
  const createNote = useCreateMarginNote();
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');

  const save = () => {
    const text = body.trim();
    if (!text) return;
    createNote.mutate(
      { projectId: null, proposalId: null, designerClientId, body: text, anchorKind: 'letterhead' },
      {
        onSuccess: () => {
          setBody('');
          setComposing(false);
        },
      }
    );
  };

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          In the margin
        </span>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
          >
            ＋ Note
          </button>
        )}
      </div>

      {composing && (
        <div className="mb-3 rounded-[5px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] p-2.5">
          <textarea
            autoFocus
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="The call's tone, a hesitation, your read…"
            className="w-full resize-none rounded-[4px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[12.5px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!body.trim() || createNote.isPending}
              className="rounded-[3px] border border-[var(--color-mocha)] bg-[var(--color-mocha)] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[#f6efe2] disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setBody('');
              }}
              className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {(notes ?? []).map((row) => (
        <MarginItem key={row.item_id} row={row} open={false} />
      ))}

      <p className="mt-4 font-mono text-[10px] leading-relaxed text-[var(--color-aged-oak)]">
        Notes only — the call&apos;s read. The structured facts live in the blocks and seed the
        proposal.
      </p>
    </div>
  );
}
