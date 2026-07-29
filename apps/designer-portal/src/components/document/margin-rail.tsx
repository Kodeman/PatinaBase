'use client';

/**
 * The margin rail (spec §5, D12): anchored items down the document's right
 * edge — and the notification model itself (D2): nothing here breaks
 * through; it accumulates quietly and the Desk re-sorts. Empty margins show
 * the R8 placeholder so the full-bleed geometry holds.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useProjectFFEItems,
  useProjectParties,
  useProjectPhases,
  useCoordinationItems,
  useDesignerClientForClientUser,
  type CoordinationItem,
} from '@patina/supabase';
import { useSectionTasks } from '@/hooks/use-section-work';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useCreateMarginNote } from '@/hooks/use-margin-notes';
import {
  partitionMargin,
  type MarginItemRow,
} from '@/lib/document/margin-derivation';
import { todayYmd } from '@/lib/document/format';
import { MarginItem } from './margin-item';
import { MarginItemBody } from './margin-bodies';
import { MarginNote } from './margin-note';
import { DocSheet } from './overlays/doc-sheet';
import {
  ItemComposer,
  toComposerFfeItems,
  toComposerPhases,
} from './coordination/item-composer';
import { itemTypeToken } from './coordination/item-type';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';

export function MarginRail({
  projectId,
  proposalId,
  clientName,
  clientUserId = null,
  onHoverLine,
  pendingNoteAnchor = null,
  onNoteAnchorConsumed = () => {},
}: {
  projectId: string | null;
  proposalId: string | null;
  clientName: string;
  /** The client's AUTH uid (row.client_profile_id) — resolves designer_clients.id
   *  for the R55 decision composer's INSERT (the same FK the band resolves). */
  clientUserId?: string | null;
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
  // with FFESection — same query key). The full rows also feed the R55
  // composer's FF&E-line gate picker.
  const { data: ffeItems } = useProjectFFEItems(projectId ?? '');
  const { raised, settled } = useMemo(() => {
    const lineRank = new Map<string, number>();
    ((ffeItems ?? []) as Array<{ id: string }>).forEach((it, i) =>
      lineRank.set(it.id, i),
    );
    return partitionMargin(items ?? [], new Date(), { lineRank });
  }, [items, ffeItems]);

  // ── R55: the decision composer, opened from the margin "+ New" ──
  // designer_clients.id resolution (the band's pattern) — the composer INSERT
  // needs the FK, not the raw client auth uid. null until the resolver lands.
  const { data: designerClient } = useDesignerClientForClientUser(
    clientUserId ?? '',
  );
  const designerClientId = designerClient?.id ?? null;
  const canCompose = Boolean(projectId && designerClientId);

  const { data: parties } = useProjectParties(projectId ?? '');
  const { data: phaseRows } = useProjectPhases(projectId ?? '');
  const { data: tasks } = useSectionTasks(projectId ?? '');
  const { data: coordItems } = useCoordinationItems(projectId);

  const composerFfe = useMemo(() => toComposerFfeItems(ffeItems), [ffeItems]);
  const composerPhases = useMemo(
    () => toComposerPhases(phaseRows),
    [phaseRows],
  );
  const draftItems = useMemo(
    () => (coordItems ?? []).filter((i) => i.status === 'draft'),
    [coordItems],
  );

  // The composer sheet: a new decision, or re-opening an unsent draft (R55).
  const [composer, setComposer] = useState<
    { mode: 'new' } | { mode: 'edit'; item: CoordinationItem } | null
  >(null);
  const [draftsOpen, setDraftsOpen] = useState(false);

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

  const bodyFor = (row: MarginItemRow) => (
    <MarginItemBody
      row={row}
      projectId={projectId}
      clientName={clientName}
      decisionRows={decisionRows}
    />
  );

  const renderItem = (row: MarginItemRow) => {
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
  };

  return (
    <>
      {/* R94 — the document's one first-touch note (help-desk Wave 1, copy
          §E.2): what the margin is, and the Esc/timer contract. Projects only
          (the timer claim is only true with a project in hand); the primitive
          owns once-only + recede. */}
      {projectId && (
        <MarginNote noteKey="doc-first-touch" className="mb-5">
          The margin on the right is where decisions and money gather. Esc puts
          the document down — and the hours log themselves while it&apos;s in
          your hand.
        </MarginNote>
      )}
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          In the margin
        </p>
        <DocumentActionGroup
          surfaceKey="open-document"
          regionKey="margin-capture"
          aria-label="Margin capture actions"
        >
          {canCompose && (
            <DocumentAction
              actionKey="new-margin-decision"
              variant="secondary"
              onClick={() => setComposer({ mode: 'new' })}
            >
              + Decision
            </DocumentAction>
          )}
          <DocumentAction
            actionKey="new-margin-note"
            variant="secondary"
            onClick={() => setComposing((v) => !v)}
          >
            + Note
          </DocumentAction>
        </DocumentActionGroup>
      </div>

      {/* R55: unsent drafts live here — editable in the margin until published. */}
      {draftItems.length > 0 && (
        <div className="mb-2">
          <button
            type="button"
            aria-expanded={draftsOpen}
            onClick={() => setDraftsOpen((v) => !v)}
            className="group mb-1 inline-flex min-h-11 min-w-11 items-center font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:text-[var(--color-charcoal)] focus-visible:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
          >
            <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
              Drafts · {draftItems.length} {draftsOpen ? '↑' : '↓'}
            </span>
          </button>
          {draftsOpen && (
            <div className="flex flex-col gap-1">
              {draftItems.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setComposer({ mode: 'edit', item: d })}
                  className="group flex min-h-11 min-w-11 items-center gap-2 px-2 py-1.5 text-left text-[11px] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                >
                  <span
                    className="inline-block rounded-[2px] border px-1 py-px font-mono text-[7.5px] font-semibold uppercase tracking-[0.04em] text-[var(--color-aged-oak)]"
                    style={{ borderColor: 'var(--color-pearl)' }}
                  >
                    {itemTypeToken(d.coordination_kind).label}
                  </span>
                  <span className="flex-1 truncate">
                    {d.title || 'Untitled draft'}
                  </span>
                  <span className="da-score-hover font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)] transition-colors group-hover:text-[var(--color-charcoal)] group-hover:after:scale-x-100 group-focus-visible:text-[var(--color-charcoal)] group-focus-visible:after:scale-x-100 motion-reduce:transition-none">
                    edit
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {composing && (
        <div
          className="mb-2 rounded-[5px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] p-3"
          style={{ borderLeft: '2.5px solid var(--color-aged-oak)' }}
        >
          <textarea
            rows={2}
            autoFocus
            placeholder={
              noteAnchorLine ? 'Note on this line…' : 'Note to the margin…'
            }
            aria-label="Note body"
            className="w-full resize-none rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote();
            }}
          />
          <DocumentActionRow
            surfaceKey="open-document"
            regionKey="margin-note"
            className="mt-1.5"
            aria-label="Margin note actions"
          >
            <input
              type="date"
              aria-label="Note due date (optional)"
              className="rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1 text-[10px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
              value={noteDue}
              onChange={(e) => setNoteDue(e.target.value)}
            />
            <DocumentAction
              actionKey="save-margin-note"
              variant="primary"
              disabled={!noteBody.trim() || createNote.isPending}
              loading={createNote.isPending}
              loadingLabel="Saving…"
              onClick={saveNote}
            >
              Save
            </DocumentAction>
            <DocumentAction
              actionKey="discard-margin-note"
              variant="tertiary"
              onClick={() => {
                setComposing(false);
                setNoteAnchorLine(null);
              }}
            >
              Discard
            </DocumentAction>
          </DocumentActionRow>
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
            className="group mb-1.5 inline-flex min-h-11 min-w-11 items-center font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:text-[var(--color-charcoal)] focus-visible:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
          >
            <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
              Settled · {settled.length} {settledOpen ? '↑' : '↓'}
            </span>
          </button>
          {settledOpen && settled.map(renderItem)}
        </div>
      )}

      {/* R55: the decision composer — a DocSheet overlay; the document stays
          mounted beneath (D1). Keyed so switching new↔draft remounts fresh. */}
      <DocSheet
        open={Boolean(composer) && canCompose}
        onClose={() => setComposer(null)}
        title={composer?.mode === 'edit' ? 'Edit draft' : 'New decision'}
      >
        {composer && projectId && designerClientId && (
          <ItemComposer
            key={composer.mode === 'edit' ? composer.item.id : 'new'}
            projectId={projectId}
            designerClientId={designerClientId}
            tasks={tasks ?? []}
            ffeItems={composerFfe}
            phases={composerPhases}
            parties={parties ?? []}
            editItem={composer.mode === 'edit' ? composer.item : null}
            onClose={() => setComposer(null)}
            onCreated={() => setComposer(null)}
          />
        )}
      </DocSheet>
    </>
  );
}
