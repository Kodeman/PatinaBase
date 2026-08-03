'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import {
  useBoardTemplates,
  useBoards,
  useMaterializeBoardTemplate,
  useOrganizations,
  useProjectOwnedBoards,
  useUpsertBoard,
  type BoardTemplate,
  type ProposalBoardSummary,
} from '@patina/supabase';
import type { BoardOwnerRef } from '@patina/types';
import { Button } from '@/components/ui/controls';
import { boardRoomHref } from '@/lib/mood-board/navigation';
import { runProposalAutosaveAction } from '@/lib/proposal-autosave-registry';

interface BoardsBuilderProps {
  /** Pass exactly one owner. Both legs launch the same dedicated board room. */
  proposalId?: string;
  projectId?: string;
}

function BoardCover({ board }: { board: ProposalBoardSummary }) {
  const src = board.cover_image_url ?? board.cover_fallback_url;
  return (
    <div className="flex h-[112px] items-center justify-center overflow-hidden bg-[var(--bg-muted)]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden className="font-heading text-[32px] italic text-[var(--text-muted)]">
          {board.name.trim().charAt(0).toUpperCase() || 'B'}
        </span>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  busy,
  onChoose,
}: {
  template: BoardTemplate;
  busy: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={busy}
      className="overflow-hidden rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] text-left transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
      aria-label={`Start from ${template.name}`}
    >
      <div className="flex h-24 items-center justify-center overflow-hidden bg-[var(--bg-muted)]">
        {template.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={template.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="font-heading text-2xl italic text-[var(--text-muted)]">
            {template.name.trim().charAt(0).toUpperCase() || 'T'}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-heading text-[14px] text-[var(--text-primary)]">{template.name}</p>
        <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-[var(--text-muted)]">
          {template.description || `${template.items.length} ready-to-compose pieces`}
        </p>
      </div>
    </button>
  );
}

/**
 * The drafting facet is now a launcher, never an embedded editor. This keeps
 * the proposal page calm and makes every board open through the one canonical
 * full-viewport room.
 */
export function BoardsBuilder({ proposalId, projectId }: BoardsBuilderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isProject = Boolean(projectId);
  const owner: BoardOwnerRef | null = projectId
    ? { kind: 'project', id: projectId }
    : proposalId
      ? { kind: 'proposal', id: proposalId }
      : null;

  // Hook order stays stable across owner kinds; the inactive query is disabled.
  const proposalBoards = useBoards(isProject ? null : proposalId);
  const projectBoards = useProjectOwnedBoards(isProject ? projectId : null);
  const boardsQuery = isProject ? projectBoards : proposalBoards;
  const boards = (boardsQuery.data ?? []).filter((board) => board.status !== 'archived');
  const archivedCount = (boardsQuery.data ?? []).length - boards.length;

  const { data: organizations } = useOrganizations();
  const studioId = useMemo(() => {
    if (!organizations) return undefined;
    return (
      organizations.find((organization) => organization.type === 'design_studio')?.id ??
      organizations[0]?.id ??
      null
    );
  }, [organizations]);
  const templatesQuery = useBoardTemplates(studioId);
  const templates = templatesQuery.data ?? [];
  const seededTemplates = templates.filter((template) => template.kind === 'seeded');
  const studioTemplates = templates.filter((template) => template.kind === 'studio');

  const createBoard = useUpsertBoard();
  const materializeTemplate = useMaterializeBoardTemplate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionPending = useRef(false);

  const source = isProject ? 'project_surface' : 'drafting_strip';
  const hrefFor = (boardId: string) =>
    boardRoomHref({ boardId, from: pathname, source });

  const runCreate = async (key: string, action: () => Promise<string>) => {
    if (!owner || actionPending.current) return;
    actionPending.current = true;
    setPendingKey(key);
    setError(null);
    try {
      let boardId = '';
      await runProposalAutosaveAction(owner.id, async () => {
        boardId = await action();
      });
      if (!boardId) throw new Error('The new board did not return an id.');
      setPickerOpen(false);
      router.push(hrefFor(boardId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The board could not be created.');
    } finally {
      actionPending.current = false;
      setPendingKey(null);
    }
  };

  const handleBlank = () =>
    void runCreate('blank', async () => {
      if (!owner) throw new Error('The board owner is unavailable.');
      const board = await createBoard.mutateAsync({
        proposalId: owner.kind === 'proposal' ? owner.id : undefined,
        projectId: owner.kind === 'project' ? owner.id : undefined,
        name: `Board ${boards.length + 1}`,
        sortOrder: (boardsQuery.data ?? []).length,
      });
      return board.id;
    });

  const handleTemplate = (template: BoardTemplate) =>
    void runCreate(`template:${template.id}`, async () => {
      if (!owner) throw new Error('The board owner is unavailable.');
      return materializeTemplate.mutateAsync({ templateId: template.id, owner });
    });

  if (!owner) {
    return <p className="text-sm text-[var(--text-muted)]">The board owner is unavailable.</p>;
  }

  if (boardsQuery.isLoading) {
    return (
      <div aria-label="Loading mood boards" className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            aria-hidden
            className="h-[174px] w-[210px] shrink-0 animate-pulse rounded-[5px] bg-[var(--bg-muted)] motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[12px] text-[var(--text-muted)]">
            Open a board in its room to compose, present, share, and export.
          </p>
          {archivedCount > 0 && (
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              {archivedCount} archived
            </p>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setPickerOpen(true)}>
          New board
        </Button>
      </div>

      {boards.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={hrefFor(board.id)}
              className="group w-[210px] shrink-0 overflow-hidden rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
              aria-label={`Open mood board ${board.name}`}
            >
              <BoardCover board={board} />
              <div className="px-3 py-2.5">
                <p className="truncate font-heading text-[14px] text-[var(--text-primary)]">
                  {board.name}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  {board.item_count} {board.item_count === 1 ? 'piece' : 'pieces'} · Open room
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-[5px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-9 text-center transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
        >
          <span className="block font-heading text-[16px] text-[var(--text-primary)]">
            Start the first mood board
          </span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
            Begin blank or use a Patina or studio template.
          </span>
        </button>
      )}

      {error && (
        <p role="alert" className="text-[12px] text-[var(--color-clay)]">
          {error}
        </p>
      )}

      <Dialog open={pickerOpen} onOpenChange={(open) => !actionPending.current && setPickerOpen(open)}>
        <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start a mood board</DialogTitle>
            <DialogDescription>
              Begin with open space, a Patina starter, or a template saved by your studio.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-6">
            <section aria-labelledby="blank-board-option">
              <h3 id="blank-board-option" className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Blank
              </h3>
              <button
                type="button"
                onClick={handleBlank}
                disabled={pendingKey !== null}
                className="mt-2 flex min-h-20 w-full items-center justify-between rounded-[5px] border border-dashed border-[var(--border-default)] px-4 text-left hover:border-[var(--color-clay)] disabled:cursor-wait disabled:opacity-60"
              >
                <span>
                  <span className="block font-heading text-[14px] text-[var(--text-primary)]">Blank board</span>
                  <span className="mt-1 block text-[11px] text-[var(--text-muted)]">A clean, flexible canvas.</span>
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--color-clay)]">
                  {pendingKey === 'blank' ? 'Creating…' : 'Choose'}
                </span>
              </button>
            </section>

            {templatesQuery.isLoading && (
              <p className="text-[12px] text-[var(--text-muted)]">Loading templates…</p>
            )}
            {templatesQuery.isError && (
              <p role="alert" className="text-[12px] text-[var(--color-clay)]">
                Templates could not be loaded. You can still start blank.
              </p>
            )}

            {seededTemplates.length > 0 && (
              <section aria-labelledby="patina-board-templates">
                <h3 id="patina-board-templates" className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Patina starters
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {seededTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      busy={pendingKey !== null}
                      onChoose={() => handleTemplate(template)}
                    />
                  ))}
                </div>
              </section>
            )}

            {studioTemplates.length > 0 && (
              <section aria-labelledby="studio-board-templates">
                <h3 id="studio-board-templates" className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Your studio
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {studioTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      busy={pendingKey !== null}
                      onChoose={() => handleTemplate(template)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
