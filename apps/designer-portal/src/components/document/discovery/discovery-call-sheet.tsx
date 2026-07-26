'use client';

/**
 * The discovery-call checklist (R66) — what to draw out on the call. Each row
 * opens the matching structured block (facts fill the blocks); a "Note from
 * the call" field writes the tone/hesitations to the margin (unstructured).
 * The form captures facts; the call captures the person.
 */

import { useState } from 'react';
import { DocPaperSheet } from '../overlays/doc-paper-sheet';
import { useCreateMarginNote } from '@/hooks/use-margin-notes';
import type { BlockKey } from '@/lib/document/discovery-readiness';
import { DocumentAction, DocumentActionGroup } from '../document-action';

const CHECKLIST: { block: BlockKey; q: string; sub: string }[] = [
  {
    block: 'scope',
    q: 'The project & the rooms',
    sub: 'what they want transformed',
  },
  {
    block: 'lifestyle',
    q: 'How they live each space',
    sub: 'host, work, rest, kids, pets — the daily flow',
  },
  {
    block: 'budget',
    q: 'Budget comfort',
    sub: 'set the financial expectation early',
  },
  {
    block: 'timeline',
    q: 'Timeline & hard dates',
    sub: 'events, move-in, deadlines',
  },
  {
    block: 'style',
    q: 'Style & what they love',
    sub: 'and ask for an inspiration board',
  },
  {
    block: 'keep_avoid',
    q: 'Keep & avoid',
    sub: "sentimental pieces; hard no's",
  },
  {
    block: 'deciders',
    q: 'Who decides + how to reach them',
    sub: 'approval roles, cadence',
  },
];

export function DiscoveryCallSheet({
  open,
  onClose,
  done,
  onOpenBlock,
  designerClientId,
}: {
  open: boolean;
  onClose: () => void;
  done: Record<BlockKey, boolean>;
  onOpenBlock: (block: BlockKey) => void;
  designerClientId: string;
}) {
  const createNote = useCreateMarginNote();
  const [note, setNote] = useState('');

  const saveNote = () => {
    const text = note.trim();
    if (!text) return;
    createNote.mutate(
      {
        projectId: null,
        proposalId: null,
        designerClientId,
        body: text,
        anchorKind: 'letterhead',
      },
      { onSuccess: () => setNote('') },
    );
  };

  return (
    <DocPaperSheet
      open={open}
      onClose={onClose}
      title="The discovery call · checklist"
    >
      <span className="mb-3 inline-block rounded-[2px] border border-[var(--color-rule-strong,#D8CCB8)] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--color-mocha)]">
        The discovery call · checklist
      </span>
      <h2 className="font-heading text-[22px] font-medium text-[var(--color-charcoal)]">
        What to draw out
      </h2>
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">
        Tap a line to open its block. The form captures facts; the call captures
        the person.
      </p>

      <div>
        {CHECKLIST.map((c) => (
          <button
            key={c.block}
            type="button"
            onClick={() => onOpenBlock(c.block)}
            className="flex min-h-11 w-full items-start gap-3 rounded-[3px] border-b border-[var(--color-pearl)] py-2.5 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] text-[0.6rem] font-bold ${
                done[c.block]
                  ? 'border-[var(--color-sage)] bg-[rgba(168,181,160,0.18)] text-[var(--color-sage)]'
                  : 'border-[#cfc8bb] text-transparent'
              }`}
            >
              ✓
            </span>
            <span>
              <span className="block text-[14px] text-[var(--color-charcoal)]">
                {c.q}
              </span>
              <span className="block text-[12px] text-[var(--text-muted)]">
                {c.sub}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 border-t border-[var(--color-pearl)] pt-4">
        <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
          Note from the call → the margin (tone, not facts)
        </p>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder='She hesitated on budget — wants to "see options first."'
          className="w-full resize-none rounded-[4px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[12.5px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
        />
        <DocumentActionGroup
          surfaceKey="discovery"
          regionKey="call-note"
          className="mt-2"
        >
          <DocumentAction
            actionKey="save-discovery-call-note"
            variant="primary"
            onClick={saveNote}
            disabled={!note.trim() || createNote.isPending}
            loading={createNote.isPending}
            loadingLabel="Saving…"
          >
            Save the note
          </DocumentAction>
          <DocumentAction
            actionKey="close-discovery-call"
            variant="tertiary"
            onClick={onClose}
          >
            Done — back to the document
          </DocumentAction>
        </DocumentActionGroup>
      </div>
    </DocPaperSheet>
  );
}
