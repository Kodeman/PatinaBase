'use client';

/**
 * The Plan Room — the drawings get a room, and the paper keeps its calm.
 *
 * One surface holds four views (the current set and its log, the Light Table,
 * one sheet, the issue ceremony), switched in local state rather than by
 * navigation, so a staged Light Table survives a look at a sheet. The room
 * reads exactly two queries; every view derives from the same bundle.
 *
 * Dropping is hand-rolled rather than borrowed: the drop target has to accept a
 * file over the WHOLE room without swallowing every other drag in it, so the
 * dragover guard checks for real files before it claims the event.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlanRoom, type FilePlanPrintsResult } from '@patina/supabase';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { fmtDay } from '@/lib/document/format';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { planRoomEvents } from '@/lib/analytics/plan-room-events';
import { deriveHolders, type LightTableProposal } from '@/lib/plans/model';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { LightTable, type StagedTable } from './light-table';
import { PlanConfirmStrip } from './plan-confirm-strip';
import { PlanIssueCeremony } from './plan-issue-ceremony';
import { PlanRoomSet } from './plan-room-set';
import { PlanSheetDetail } from './plan-sheet-detail';

type PlanView = 'set' | 'light-table' | 'sheet' | 'issue';

const VIEW_TABS: Array<[PlanView, string]> = [
  ['set', 'The set'],
  ['light-table', 'The light table'],
  ['issue', 'Issue'],
];

export function PlanRoomWorkspace({ routeId }: { routeId: string }) {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.plans);
  const router = useRouter();
  const engagement = useDocumentEngagement(routeId);

  const [view, setView] = useState<PlanView>('set');
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [staged, setStaged] = useState<StagedTable | null>(null);
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const openedFor = useRef<string | null>(null);

  const resolution = engagement.data;
  const row = resolution?.kind === 'engagement' ? resolution.row : null;
  const projectId =
    row?.engagement_kind === 'project' ? (row.project_id ?? null) : null;

  useEffect(() => {
    if (resolution?.kind === 'redirect') {
      router.replace(`/doc/${resolution.projectId}/plans`);
    }
  }, [resolution, router]);

  // One query, one derivation. Holders come from the bundle everywhere in this
  // room (band, set, ceremony) so no two surfaces can disagree mid-load.
  const room = usePlanRoom(projectId ?? '');
  const bundle = room.data;

  useEffect(() => {
    if (!projectId || !bundle || openedFor.current === projectId) return;
    openedFor.current = projectId;
    planRoomEvents.opened({
      project_id: projectId,
      sheet_count: bundle.sheets.length,
      has_amber_holders: deriveHolders(bundle).some(
        (holder) => holder.behindCount > 0,
      ),
    });
  }, [projectId, bundle]);

  if (engagement.isLoading || (projectId && room.isLoading)) {
    return (
      <main className="min-h-screen bg-[var(--doc-paper)] px-8 py-12" aria-busy>
        <p
          role="status"
          aria-live="polite"
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
        >
          Reading the drawing log…
        </p>
      </main>
    );
  }

  if (resolution?.kind === 'redirect') return null;

  if (!projectId) {
    return (
      <main className="min-h-screen bg-[var(--doc-paper)] px-8 py-16">
        <p className="max-w-lg font-heading text-[1.25rem] italic text-[var(--color-charcoal)]">
          This paper has no project yet — the plan room opens when one does.
        </p>
        <Link
          href={`/doc/${routeId}`}
          className="mt-4 inline-flex min-h-[44px] items-center font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
        >
          ← Back to the document
        </Link>
      </main>
    );
  }

  // SP-14/F100 — the return link names the full project, matching the spec
  // book's leaf (not the folder tab's short surname), so the two leaves
  // agree with each other.
  const projectName = row?.title || 'Project';

  const stageFiles = (files: File[]) => {
    const pdfs = files.filter(
      (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name),
    );
    if (pdfs.length === 0) return;
    setReadError(null);
    // A new drop replaces the staged table wholesale, key included.
    setStaged(null);
    setPendingFiles(pdfs);
    setView('light-table');
  };

  // The newest print's created_at — "last filed", not "flipped". A flip is a
  // pointer moving; this date is simply when something last came in.
  const lastFiledAt = bundle?.prints.reduce<string | null>(
    (latest, print) =>
      latest == null || print.created_at > latest ? print.created_at : latest,
    null,
  );

  const onCommitted = (_result: FilePlanPrintsResult) => {
    setStaged(null);
    setPendingFiles(null);
    setView('set');
  };

  return (
    <main
      className="min-h-screen bg-[var(--doc-paper)] text-[var(--color-charcoal)]"
      onDragOver={(event) => {
        // Claim the event only for real files, so a drag inside the room (a
        // text selection, an image) still behaves normally.
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setDragging(false);
        stageFiles(Array.from(event.dataTransfer.files ?? []));
      }}
    >
      <header className="sticky top-0 z-20 border-b border-[var(--color-pearl)] bg-[var(--doc-paper)]/95 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4">
          <Link
            href={`/doc/${routeId}`}
            className="inline-flex min-h-11 items-center py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
          >
            ← {projectName}
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-xl">The plan room</h1>
            <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {bundle?.sheets.length ?? 0}{' '}
              {(bundle?.sheets.length ?? 0) === 1 ? 'sheet' : 'sheets'}
              {lastFiledAt ? ` · last filed ${fmtDay(lastFiledAt)}` : ''} ·{' '}
              {bundle?.issues.length ?? 0}{' '}
              {(bundle?.issues.length ?? 0) === 1 ? 'issue' : 'issues'} to date
            </p>
          </div>
          <nav aria-label="Plan room" className="flex items-center gap-1">
            {VIEW_TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-current={view === id ? 'page' : undefined}
                className={`min-h-[44px] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] ${
                  view === id
                    ? 'border-b border-[var(--color-clay)] text-[var(--color-charcoal)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <DocumentActionRow surfaceKey="plan-room" regionKey="plan-room-intake">
            <DocumentAction
              actionKey="choose-plan-pdf"
              variant="secondary"
              onClick={() => fileInput.current?.click()}
            >
              Choose a PDF
            </DocumentAction>
          </DocumentActionRow>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              stageFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>
      </header>

      {dragging && (
        <p
          role="status"
          className="border-b border-[var(--color-golden-hour)] bg-[var(--color-off-white)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] md:px-8"
        >
          Let it go — the table will split the set and propose where each page belongs
        </p>
      )}

      {room.error && (
        <div
          role="alert"
          className="mx-4 mt-4 border-l-2 border-[var(--color-terracotta)] bg-[var(--color-off-white)] px-3 py-2.5 md:mx-8"
        >
          <p className="text-[0.82rem] text-[var(--color-charcoal)]">
            The drawing log could not be read.{' '}
            {room.error instanceof Error ? room.error.message : ''}
          </p>
          <DocumentActionRow surfaceKey="plan-room" regionKey="plan-room-error">
            <DocumentAction
              actionKey="retry-plan-room"
              variant="tertiary"
              onClick={() => {
                void room.refetch();
              }}
            >
              Try again
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      {readError && (
        <div
          role="alert"
          className="mx-4 mt-4 border-l-2 border-[var(--color-terracotta)] bg-[var(--color-off-white)] px-3 py-2.5 md:mx-8"
        >
          <p className="text-[0.82rem] text-[var(--color-charcoal)]">{readError}</p>
        </div>
      )}

      {bundle && view === 'set' && (
        <PlanRoomSet
          projectId={projectId}
          bundle={bundle}
          onOpenSheet={(sheetId) => {
            planRoomEvents.sheetOpened({ project_id: projectId, sheet_id: sheetId });
            setSelectedSheetId(sheetId);
            setView('sheet');
          }}
          onIssue={() => setView('issue')}
          onChooseFile={() => fileInput.current?.click()}
        />
      )}

      {bundle && view === 'light-table' && (
        <>
          <LightTable
            projectId={projectId}
            bundle={bundle}
            pendingFiles={pendingFiles}
            staged={staged}
            onStaged={(table) => {
              setStaged(table);
              // The drop is consumed. Clearing it is what stops a later remount
              // (a look at a sheet and back) from re-parsing the file and
              // minting a SECOND idempotency key for a table the designer was
              // told had been saved.
              setPendingFiles(null);
            }}
            onProposalsChange={(proposals: LightTableProposal[]) =>
              setStaged((prev) => (prev ? { ...prev, proposals } : prev))
            }
            onThumbnail={(pageIndex, thumbnail) =>
              setStaged((prev) =>
                prev
                  ? { ...prev, thumbnails: { ...prev.thumbnails, [pageIndex]: thumbnail } }
                  : prev,
              )
            }
            onReadFailed={(message) => {
              setReadError(message);
              setPendingFiles(null);
              setView('set');
            }}
          />
          <PlanConfirmStrip
            session={staged?.session ?? null}
            proposals={staged?.proposals ?? []}
            onSaveForLater={() => setView('set')}
            onRevert={() => {
              setStaged(null);
              setPendingFiles(null);
              setView('set');
            }}
            onCommitted={onCommitted}
          />
        </>
      )}

      {bundle && view === 'sheet' && selectedSheetId && (
        <PlanSheetDetail
          projectId={projectId}
          bundle={bundle}
          sheetId={selectedSheetId}
          onBack={() => setView('set')}
          onIssue={() => setView('issue')}
        />
      )}

      {bundle && view === 'issue' && (
        <PlanIssueCeremony
          projectId={projectId}
          bundle={bundle}
          onBack={() => setView('set')}
        />
      )}
    </main>
  );
}
