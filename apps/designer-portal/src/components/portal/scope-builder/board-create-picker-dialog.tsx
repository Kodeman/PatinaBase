'use client';

/**
 * The one board-creation picker: blank / Patina starters / studio templates,
 * with a naming prompt (IA-6). Extracted out of BoardsBuilder (the Drafting
 * Room facet + project surface launcher) so `boards-strip.tsx`'s Speccing
 * table (IA-5) can offer the identical capability set instead of its own
 * blank-only `startBoard()` reimplementation — the two surfaces render their
 * own trigger/list chrome, but creation always goes through this one dialog.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import {
  useBoardTemplates,
  useCreateProjectBoard,
  useMaterializeBoardTemplate,
  useOrganizations,
  useUpsertBoard,
  type BoardTemplate,
} from '@patina/supabase';
import type { BoardOwnerRef } from '@patina/types';
import { runBoardOwnerAutosaveAction } from '@/lib/proposal-autosave-registry';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';

export interface BoardCreatePickerDialogProps {
  owner: BoardOwnerRef;
  /** Existing (non-archived) board count for this owner — seeds the blank
   * board's default name ("Board N+1"), matching the pre-picker behavior at
   * both call sites. */
  boardsCount: number;
  /**
   * Sort-order seed for a new blank board — defaults to `boardsCount`. Pass
   * the RAW (including-archived) board count when the caller has one, to
   * match the pre-extraction behavior exactly (both boards-builder.tsx and
   * boards-strip.tsx seeded sortOrder from the unfiltered list length, not
   * the archived-excluded display count `boardsCount` uses for naming).
   */
  sortOrderSeed?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fires once creation succeeds, after the dialog has already closed.
   * `materialized` is true for a template pick (DV3) — the caller decides
   * what that implies for its own redirect (BoardsBuilder appends
   * `materialized=template` for a project owner; other callers may ignore
   * it).
   */
  onCreated: (boardId: string, meta: { materialized: boolean }) => void;
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

export function BoardCreatePickerDialog({
  owner,
  boardsCount,
  sortOrderSeed = boardsCount,
  open,
  onOpenChange,
  onCreated,
}: BoardCreatePickerDialogProps) {
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
  const createProjectBoard = useCreateProjectBoard();
  const materializeTemplate = useMaterializeBoardTemplate();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionPending = useRef(false);

  // IA-6 — every creation surface used to default to `Board ${n+1}` with no
  // naming prompt. `boardName` seeds that sensible default and stays
  // editable; `boardNameTouched` tracks whether the designer overrode it, so
  // a template pick left untouched still falls back to the TEMPLATE's own
  // name (materialize_board_template already does this when no name is
  // passed) rather than clobbering it with "Board N".
  const defaultBoardName = `Board ${boardsCount + 1}`;
  const [boardName, setBoardName] = useState(defaultBoardName);
  const [boardNameTouched, setBoardNameTouched] = useState(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setBoardName(`Board ${boardsCount + 1}`);
      setBoardNameTouched(false);
      setError(null);
    }
    wasOpen.current = open;
  }, [open, boardsCount]);

  const runCreate = async (
    key: string,
    action: () => Promise<string>,
    options?: { materialized?: boolean },
  ) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setPendingKey(key);
    setError(null);
    try {
      let boardId = '';
      await runBoardOwnerAutosaveAction(owner, async () => {
        boardId = await action();
      });
      if (!boardId) throw new Error('The new board did not return an id.');
      onOpenChange(false);
      onCreated(boardId, { materialized: Boolean(options?.materialized) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The board could not be created.');
    } finally {
      actionPending.current = false;
      setPendingKey(null);
    }
  };

  const handleBlank = () =>
    void runCreate('blank', async () => {
      const name = boardName.trim() || defaultBoardName;
      // A project-owned board is never written through the table mutations —
      // useUpsertBoard refuses that leg outright. create_project_board is the
      // owner-aware server path, the same shape materialize_board_template
      // already uses from this dialog.
      if (owner.kind === 'project') {
        return createProjectBoard.mutateAsync({ projectId: owner.id, name });
      }
      const board = await createBoard.mutateAsync({
        proposalId: owner.id,
        name,
        sortOrder: sortOrderSeed,
      });
      return board.id;
    });

  const handleTemplate = (template: BoardTemplate) =>
    void runCreate(
      `template:${template.id}`,
      async () => {
        // Untouched name field → let materialize_board_template default to
        // the template's own name; an explicit edit always wins.
        const nameOverride = boardNameTouched ? boardName.trim() || undefined : undefined;
        const boardId = await materializeTemplate.mutateAsync({
          templateId: template.id,
          owner,
          name: nameOverride,
        });
        moodBoardEvents.templateUsed({
          source: template.kind,
          template_id: template.id,
          board_id: boardId,
        });
        return boardId;
      },
      { materialized: true },
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !actionPending.current && onOpenChange(next)}>
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start a mood board</DialogTitle>
          <DialogDescription>
            Begin with open space, a Patina starter, or a template saved by your studio.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-6">
          <label className="block">
            <span className="type-meta mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Board name
            </span>
            <input
              type="text"
              value={boardName}
              onChange={(event) => {
                setBoardName(event.target.value);
                setBoardNameTouched(true);
              }}
              onFocus={(event) => event.currentTarget.select()}
              placeholder={defaultBoardName}
              className="flex w-full rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
            />
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
              Used for a blank board. Pick a template below and it keeps its own name unless you change this first.
            </span>
          </label>

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
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)]">
                {pendingKey === 'blank' ? 'Creating…' : 'Choose'}
              </span>
            </button>
          </section>

          {templatesQuery.isLoading && (
            <p className="text-[12px] text-[var(--text-muted)]">Loading templates…</p>
          )}
          {templatesQuery.isError && (
            <p role="alert" className="text-[12px] text-[var(--color-clay-ink)]">
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

          {error && (
            <p role="alert" className="text-[12px] text-[var(--color-clay-ink)]">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
