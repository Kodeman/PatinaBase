'use client';

/**
 * "Add to the job" (US-16 C-16, D1-02 S3): ten roads under three heads. Every
 * road ends at the line card ("The line, as it will be bought") or, for a
 * vendor's quote and a schedule, at the document review that places each
 * accepted line. Bring in a deck is a doorway to a project board.
 */

import { useEffect, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import type { ProposalBoardSummary } from '@patina/supabase';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '@/components/portal/proposals/product-picker-modal';
import { PHOTO_MATCH_FLAG } from '@/hooks/use-board-find-this-piece';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { ffeEvents } from '@/lib/analytics/ffe-events';
import { NEW_BOARD_EVENT } from '@/lib/document/shelves';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction } from '../document-action';
import { LineCard, ROAD_PAGE_LABEL, type LineCardRoad, type LineCardSource } from './line-card';
import { DocumentImportReview, type DocumentImportRoad } from './document-import-review';
import { PurchaseRecordForm } from '../purchases/purchase-record-form';

type SheetMode =
  | { kind: 'roads' }
  | { kind: 'line'; source: LineCardSource }
  | { kind: 'import'; road: DocumentImportRoad }
  | { kind: 'purchase' };

export function openAddToProject(source: 'section' | 'command_palette' | 'empty_state' = 'section') {
  window.dispatchEvent(new CustomEvent('document:open-add-to-project', { detail: { source } }));
}

interface RoadRow {
  label: string;
  description: string;
  act: () => void;
  /** Held, never hidden: the reason stands in place of the description. */
  heldReason?: string;
}

export function AddToProjectSheet({
  projectId,
  projectName,
  rooms,
  boards,
  placeholders = [],
}: {
  projectId: string;
  projectName: string;
  rooms: Array<{ id: string; name: string }>;
  boards: ProposalBoardSummary[];
  placeholders?: Array<{ id: string; name: string }>;
}) {
  const { value: photoMatchOn } = useFeatureFlag(PHOTO_MATCH_FLAG);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SheetMode>({ kind: 'roads' });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRoad, setPickerRoad] = useState<'library' | 'link'>('library');
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const source = (event as CustomEvent<{ source?: 'section' | 'command_palette' | 'empty_state' }>).detail?.source ?? 'section';
      ffeEvents.entranceOpened({ project_id: projectId, source });
      setOpen(true);
    };
    window.addEventListener('document:open-add-to-project', listener);
    return () => window.removeEventListener('document:open-add-to-project', listener);
  }, [projectId]);

  const close = () => {
    setOpen(false);
    setMode({ kind: 'roads' });
    setResult(null);
  };

  const toLine = (road: LineCardRoad, pick?: ProductPickResult) => setMode({ kind: 'line', source: { road, pick } });
  const openPicker = (road: 'library' | 'link') => {
    setPickerRoad(road);
    setPickerOpen(true);
  };

  const heads: Array<[string, RoadRow[]]> = [
    ['From something you have', [
      { label: 'From the Library', description: 'One product you already know.', act: () => openPicker('library') },
      { label: 'Paste a link', description: 'Any page; Patina reads the product off it.', act: () => openPicker('link') },
      {
        label: 'From a photo',
        description: 'A picture of the piece; you fill in the line.',
        act: () => toLine('photo'),
        heldReason: photoMatchOn ? undefined : 'Not switched on for this studio yet.',
      },
      { label: "From a vendor's quote", description: 'A PDF quote or pro-forma; each line comes in for review.', act: () => setMode({ kind: 'import', road: 'quote' }) },
      { label: 'Import a schedule', description: 'A PDF schedule; same review.', act: () => setMode({ kind: 'import', road: 'schedule' }) },
      {
        label: 'Bring in a deck',
        description: 'A PowerPoint or PDF board, on a board first.',
        act: () => {
          close();
          window.dispatchEvent(new CustomEvent(NEW_BOARD_EVENT));
        },
      },
    ]],
    ['Not in any catalog', [
      { label: 'A custom piece', description: "Made by a workroom, with or without the client's fabric.", act: () => toLine('custom') },
      { label: 'A find', description: 'An antique, vintage piece or auction lot.', act: () => toLine('find') },
      { label: 'A store buy', description: 'Something bought retail, on the studio card.', act: () => toLine('store') },
      { label: 'Name a need', description: 'A placeholder to resolve later.', act: () => toLine('need') },
      {
        label: 'Bought it already',
        description: 'Paid for already: retail, a lot, an expense or a sample fee.',
        act: () => setMode({ kind: 'purchase' }),
      },
    ]],
  ];

  const sheetTitle =
    mode.kind === 'roads' || result
      ? 'Add to the job'
      : mode.kind === 'line'
        ? 'The line, as it will be bought'
        : mode.kind === 'purchase'
          ? 'Bought it already'
          : 'Review the lines';
  const pageLabel =
    mode.kind === 'line' && !result
      ? ROAD_PAGE_LABEL[mode.source.road]
      : mode.kind === 'import' && !result
        ? (mode.road === 'quote' ? "from a vendor's quote" : 'from a schedule')
        : mode.kind === 'purchase' && !result
          ? 'a purchase record'
          : projectName;

  return (
    <>
      <DocSheet open={open} onClose={close} icon={FolderPlus} title={sheetTitle} pageLabel={pageLabel} wide={mode.kind === 'import'}>
        {mode.kind === 'roads' && !result && (
          <div>
            {heads.map(([head, rows]) => (
              <section key={head} aria-label={head} className="mb-3">
                <h3 className="t-head mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">{head}</h3>
                <div className="divide-y divide-[var(--color-pearl)] border-y border-[var(--color-pearl)]">
                  {rows.map((row) => (
                    <button
                      key={row.label}
                      type="button"
                      aria-disabled={row.heldReason ? true : undefined}
                      onClick={row.heldReason ? undefined : row.act}
                      className={`flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left ${row.heldReason ? 'cursor-default opacity-60' : ''}`}
                    >
                      <span>
                        <span className="block font-heading text-[14px] text-[var(--color-charcoal)]">{row.label}</span>
                        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{row.heldReason ?? row.description}</span>
                      </span>
                      <span aria-hidden className="text-[var(--color-clay-ink)]">→</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {mode.kind === 'line' && !result && (
          <LineCard
            key={`${mode.source.road}:${mode.source.pick?.productId ?? ''}`}
            projectId={projectId}
            source={mode.source}
            rooms={rooms}
            boards={boards}
            placeholders={placeholders}
            onDone={setResult}
          />
        )}

        {mode.kind === 'import' && !result && (
          <DocumentImportReview key={mode.road} projectId={projectId} road={mode.road} rooms={rooms} onDone={setResult} />
        )}

        {mode.kind === 'purchase' && !result && <PurchaseRecordForm projectId={projectId} onDone={setResult} />}

        {result && (
          <div role="status" className="border-y border-[var(--color-pearl)] py-5">
            <p className="font-heading text-[15px] text-[var(--color-charcoal)]">{result}</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">The project selection is ready below. Review and authorization remain separate acts.</p>
            <DocumentAction actionKey="finish-add-to-project" surfaceKey="project" regionKey="add-to-project-result" variant="primary" className="mt-4" onClick={close}>Return to Project · FF&amp;E</DocumentAction>
          </div>
        )}
      </DocSheet>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(pick) => {
          setPickerOpen(false);
          toLine(pickerRoad, pick);
        }}
        rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
        scope="library"
        initialTab={pickerRoad === 'link' ? 'captures' : 'library'}
        configureStep
      />
    </>
  );
}
