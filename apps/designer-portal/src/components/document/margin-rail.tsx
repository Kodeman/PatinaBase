'use client';

/**
 * The margin rail (spec §5, D12): anchored items down the document's right
 * edge — and the notification model itself (D2): nothing here breaks
 * through; it accumulates quietly and the Desk re-sorts. Empty margins show
 * the R8 placeholder so the full-bleed geometry holds.
 */

import { useEffect, useMemo, useState } from 'react';
import { useProjectFFEItems } from '@patina/supabase';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useCreateMarginNote } from '@/hooks/use-margin-notes';
import { partitionMargin, type MarginItemRow } from '@/lib/document/margin-derivation';
import { todayYmd } from '@/lib/document/format';
import { MarginItem } from './margin-item';
import { DecisionBody, InvoiceBody, MessageBody, NoteBody, PoPaymentBody, PulseBody } from './margin-bodies';

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
  const [settledOpen, setSettledOpen] = useState(false);

  // R12 ordering: needs-action floats → anchor order → "Settled · N" fold.
  // Line anchors rank by the document's rendered FF&E order (shared cache
  // with FFESection — same query key).
  const { data: ffeItems } = useProjectFFEItems(projectId ?? '') as {
    data: Array<{ id: string }> | undefined;
  };
  const { raised, settled } = useMemo(() => {
    const lineRank = new Map<string, number>();
    (ffeItems ?? []).forEach((it, i) => lineRank.set(it.id, i));
    return partitionMargin(items ?? [], new Date(), { lineRank });
  }, [items, ffeItems]);

  // ── Note capture (R14: ≤5 seconds — one tap, type, save) ──
  const createNote = useCreateMarginNote();
  const [composing, setComposing] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  // Dates default to today (Kody, 2026-06-12). A kept default makes the
  // note dued-today — it joins needs-action at 5pm (R12/R14 interplay).
  const [noteDue, setNoteDue] = useState(todayYmd());
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
          setNoteDue(todayYmd());
          setNoteAnchorLine(null);
        },
      },
    );
  };

  const decisionRows = (items ?? []).filter((i) => i.kind === 'decision');

  const bodyFor = (row: MarginItemRow) => {
    switch (row.kind) {
      case 'decision':
        return <DecisionBody row={row} projectId={projectId} clientName={clientName} />;
      case 'message':
        return <MessageBody row={row} projectId={projectId} />;
      case 'invoice':
        // R18: vendor payment-due items are read-only narration — the
        // invoice body's issue/send acts belong to client invoices only.
        if (row.payload.po_payment) return <PoPaymentBody row={row} />;
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

  const renderItem = (row: MarginItemRow) => {
    const expandable = row.kind !== 'time';
    return (
      <MarginItem
        key={`${row.kind}-${row.item_id}`}
        row={row}
        open={openId === row.item_id}
        onToggle={
          expandable ? () => setOpenId((v) => (v === row.item_id ? null : row.item_id)) : undefined
        }
        onHoverAnchor={onHoverLine}
      >
        {bodyFor(row)}
      </MarginItem>
    );
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

      {raised.map(renderItem)}

      {/* R12: resolved items fold away — the fold label is the only number
          anywhere in the margin. */}
      {settled.length > 0 && (
        <div className="mt-3 border-t border-dashed border-[var(--color-pearl)] pt-2">
          <button
            type="button"
            aria-expanded={settledOpen}
            onClick={() => setSettledOpen((v) => !v)}
            className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
          >
            Settled · {settled.length} {settledOpen ? '↑' : '↓'}
          </button>
          {settledOpen && settled.map(renderItem)}
        </div>
      )}
    </>
  );
}
