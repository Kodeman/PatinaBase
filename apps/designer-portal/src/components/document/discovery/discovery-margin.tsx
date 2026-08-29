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
import { DocumentAction, DocumentActionRow } from '../document-action';

export function DiscoveryMargin({
  designerClientId,
}: {
  designerClientId: string;
}) {
  const { data: notes } = useDiscoveryMarginNotes(designerClientId);
  const createNote = useCreateMarginNote();
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');

  const save = () => {
    const text = body.trim();
    if (!text) return;
    createNote.mutate(
      {
        projectId: null,
        proposalId: null,
        designerClientId,
        body: text,
        anchorKind: 'letterhead',
      },
      {
        onSuccess: () => {
          setBody('');
          setComposing(false);
        },
      },
    );
  };

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          In the margin
        </span>
        {!composing && (
          <DocumentAction
            actionKey="open-discovery-note"
            surfaceKey="open-document"
            regionKey="discovery-margin"
            variant="secondary"
            onClick={() => setComposing(true)}
          >
            ＋ Note
          </DocumentAction>
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
          <DocumentActionRow
            surfaceKey="open-document"
            regionKey="discovery-margin-note"
            className="mt-2"
            aria-label="Discovery note actions"
          >
            <DocumentAction
              actionKey="save-discovery-note"
              variant="primary"
              onClick={save}
              disabled={!body.trim() || createNote.isPending}
              loading={createNote.isPending}
              loadingLabel="Saving…"
            >
              Save
            </DocumentAction>
            <DocumentAction
              actionKey="discard-discovery-note"
              variant="tertiary"
              onClick={() => {
                setComposing(false);
                setBody('');
              }}
            >
              Discard
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      {(notes ?? []).map((row) => (
        <MarginItem key={row.item_id} row={row} open={false} />
      ))}

      <p className="mt-4 font-mono text-[11px] leading-relaxed text-[var(--color-aged-oak)]">
        Notes only — the call&apos;s read. The structured facts live in the
        blocks and seed the proposal.
      </p>
    </div>
  );
}
