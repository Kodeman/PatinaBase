'use client';

/**
 * The margin rail (spec §5, D12): anchored items down the document's right
 * edge — and the notification model itself (D2): nothing here breaks
 * through; it accumulates quietly and the Desk re-sorts. Empty margins show
 * the R8 placeholder so the full-bleed geometry holds.
 */

import { useEffect, useState } from 'react';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useCreateMarginNote } from '@/hooks/use-margin-notes';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { MarginItem } from './margin-item';
import { DecisionBody, InvoiceBody, MessageBody, NoteBody, PulseBody } from './margin-bodies';

export function MarginRail({
  projectId,
  proposalId,
  clientName,
  onHoverLine,
  pendingNoteAnchor = null,
  onNoteAnchorConsumed = () => {},
}: {
  projectId: string | null;
  proposalId: string | null;
  clientName: string;
  onHoverLine: (lineId: string | null) => void;
  /** R14: a line unfold asked for a note — open the composer pre-anchored. */
  pendingNoteAnchor?: string | null;
  onNoteAnchorConsumed?: () => void;
}) {
  const { data: items, isLoading } = useMarginItems(projectId, proposalId);
  const [openId, setOpenId] = useState<string | null>(null);

  // ── Note capture (R14: ≤5 seconds — one tap, type, save) ──
  const createNote = useCreateMarginNote();
  const [composing, setComposing] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteDue, setNoteDue] = useState('');
  const [noteAnchorLine, setNoteAnchorLine] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingNoteAnchor) return;
    setComposing(true);
    setNoteAnchorLine(pendingNoteAnchor);
    onNoteAnchorConsumed();
  }, [pendingNoteAnchor, onNoteAnchorConsumed]);

  const saveNote = () => {
    if (!noteBody.trim()) return;
    createNote.mutate(
      {
        projectId,
        proposalId,
        body: noteBody.trim(),
        anchorKind: noteAnchorLine ? 'line' : 'letterhead',
        anchorId: noteAnchorLine,
        dueDate: noteDue ? new Date(`${noteDue}T17:00:00`).toISOString() : null,
      },
      {
        onSuccess: () => {
          setComposing(false);
          setNoteBody('');
          setNoteDue('');
          setNoteAnchorLine(null);
        },
      },
    );
  };

  const decisionRows = (items ?? []).filter((i) => i.kind === 'decision');

  const bodyFor = (row: MarginItemRow) => {
    switch (row.kind) {
      case 'decision':
        return <DecisionBody row={row} projectId={projectId} />;
      case 'message':
        return <MessageBody row={row} projectId={projectId} />;
      case 'invoice':
        return <InvoiceBody row={row} projectId={projectId} />;
      case 'pulse':
        return (
          <PulseBody
            row={row}
            projectId={projectId}
            clientName={clientName}
            decisionRows={decisionRows}
          />
        );
      case 'time':
        return null; // review/edit lives in the Hours ledger (Slice 5)
      case 'note':
        return <NoteBody row={row} projectId={projectId} />;
    }
  };

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          In the margin
        </p>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="rounded-[3px] border border-transparent px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:border-[rgba(196,165,123,0.35)] hover:text-[var(--color-clay)]"
        >
          + Note
        </button>
      </div>

      {composing && (
        <div
          className="mb-2 rounded-[5px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] p-3"
          style={{ borderLeft: '2.5px solid var(--color-aged-oak)' }}
        >
          <textarea
            rows={2}
            autoFocus
            placeholder={noteAnchorLine ? 'Note on this line…' : 'Note to the margin…'}
            aria-label="Note body"
            className="w-full resize-none rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote();
            }}
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="date"
              aria-label="Note due date (optional)"
              className="rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1 text-[10px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
              value={noteDue}
              onChange={(e) => setNoteDue(e.target.value)}
            />
            <button
              type="button"
              disabled={!noteBody.trim() || createNote.isPending}
              onClick={saveNote}
              className="rounded-[4px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-2.5 py-1 text-[10.5px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setNoteAnchorLine(null);
              }}
              className="rounded-[4px] border border-[var(--color-pearl)] px-2.5 py-1 text-[10.5px] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {!isLoading && (items ?? []).length === 0 && (
        <p className="text-[11px] italic leading-relaxed text-[var(--text-muted)]">
          The margin — decisions, messages, and money gather here
        </p>
      )}

      {(items ?? []).map((row) => {
        const expandable = row.kind !== 'time';
        return (
          <MarginItem
            key={`${row.kind}-${row.item_id}`}
            row={row}
            open={openId === row.item_id}
            onToggle={
              expandable
                ? () => setOpenId((v) => (v === row.item_id ? null : row.item_id))
                : undefined
            }
            onHoverAnchor={onHoverLine}
          >
            {bodyFor(row)}
          </MarginItem>
        );
      })}
    </>
  );
}
