'use client';

/**
 * The boards, on a page of their own (J-01). The list used to exist only
 * inside the ≥1440 shelf leaf, so the ticket's `Boards` row had nowhere to go
 * at 1280 and 390. This is that destination: the same two reads the leaf
 * makes, the same act that starts a board, and the return the plan room and
 * the spec book already print.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useProjectBoards,
  useProjectOwnedBoards,
  useBoardReactionStatuses,
  type ProjectBoard,
  type ProposalBoardSummary,
} from '@patina/supabase';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { boardsRoutePath } from '@/lib/document/registry';
import { NEW_BOARD_EVENT, startBoardPending } from '@/lib/document/shelves';
import { boardRoomHref } from '@/lib/mood-board/navigation';
import { BoardsBuilder } from '@/components/portal/scope-builder/boards-builder';
import { BoardReactionStatusChip } from '@/components/mood-board/board-reaction-status-chip';
import type { BoardReactionStatus } from '@patina/supabase';
import { DocumentAction, DocumentActionRow } from '../document-action';

const SURFACE_KEY = 'project-boards';
const REGION_KEY = 'project-boards';

const ROW =
  'flex min-h-[52px] w-full items-center gap-3 border-b border-[var(--color-pearl)] py-2 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

const LABEL =
  'font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]';

function pieces(count: number): string {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`;
}

function BoardRow({
  name,
  detail,
  href,
  status,
}: {
  name: string;
  detail: string;
  href: string;
  status?: BoardReactionStatus | null;
}) {
  return (
    <Link href={href} className={ROW}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-[15px] text-[var(--color-charcoal)]">
          {name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {detail}
          </span>
          <BoardReactionStatusChip status={status} />
        </span>
      </span>
      <span aria-hidden className="font-mono text-[13px] text-[var(--color-clay-ink)]">
        →
      </span>
    </Link>
  );
}

export function ProjectBoardsView({ routeId }: { routeId: string }) {
  const router = useRouter();
  const engagement = useDocumentEngagement(routeId);
  const [starting, setStarting] = useState(false);

  const resolution = engagement.data;
  const row = resolution?.kind === 'engagement' ? resolution.row : null;
  const projectId =
    row?.engagement_kind === 'project' ? (row.project_id ?? null) : null;

  useEffect(() => {
    if (resolution?.kind === 'redirect') {
      router.replace(boardsRoutePath(resolution.projectId));
    }
  }, [resolution, router]);

  // F30 — the Add-to-project sheet's "Start a board" fires this at whichever
  // boards surface is mounted; on this page that is the builder below.
  useEffect(() => {
    const open = () => setStarting(true);
    window.addEventListener(NEW_BOARD_EVENT, open);
    return () => window.removeEventListener(NEW_BOARD_EVENT, open);
  }, []);

  // D4' — ⌘K's "Start a board…" command lands here after a navigation, so the
  // intent has to be read off the pending flag rather than the live event
  // (this page did not exist yet when the command fired it). Gated on this
  // page's OWN project id, and cleared unconditionally once that id is known
  // — a mismatch is cleared just as eagerly as a match, so an abandoned
  // navigation (a superseded push, a fast back, an aborted RSC nav) cannot
  // leave the flag to silently auto-open the builder on a later, unrelated
  // project's Boards page. Depends on `projectId` rather than running once on
  // mount: the engagement read resolves after first paint, so the id is not
  // yet known on the render that installs this effect.
  useEffect(() => {
    if (!projectId) return;
    const pendingProjectId = startBoardPending.projectId;
    startBoardPending.projectId = null;
    if (pendingProjectId === projectId) setStarting(true);
  }, [projectId]);

  const live = useProjectOwnedBoards(projectId ?? '');
  const frozen = useProjectBoards(projectId ?? '');
  // Board-level reaction status chip (board-paths W2b #1) — computed above
  // every early return per the rules of hooks; reads (live.data ?? []) directly
  // since the filtered `liveBoards` below isn't derived until after them.
  const reactionStatuses = useBoardReactionStatuses(
    (live.data ?? []) as ProposalBoardSummary[],
  );

  if (engagement.isLoading || (projectId && (live.isLoading || frozen.isLoading))) {
    return (
      <main className="min-h-screen bg-[var(--doc-paper)] px-8 py-12" aria-busy>
        <p role="status" aria-live="polite" className={LABEL}>
          Reading the boards…
        </p>
      </main>
    );
  }

  if (resolution?.kind === 'redirect') return null;

  // ⌘K offers one `Boards` door on every document (F62), and a proposal-stage
  // document has boards — they live in the Drafting Room, which is where this
  // page sends the reader rather than dead-ending on a sentence.
  if (!projectId) {
    const draftingProposalId = row?.proposal_id ?? null;
    return (
      <main className="min-h-screen bg-[var(--doc-paper)] px-8 py-16">
        <p className="max-w-lg font-heading text-[1.25rem] italic text-[var(--color-charcoal)]">
          {draftingProposalId
            ? 'This paper is still a proposal — its boards are in the Drafting Room.'
            : 'This paper has no project yet — the boards open when one does.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          {draftingProposalId && (
            <Link
              href={`/drafting/${draftingProposalId}`}
              className="inline-flex min-h-[44px] items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)]"
            >
              Open the Drafting Room →
            </Link>
          )}
          <Link
            href={`/doc/${routeId}`}
            className="inline-flex min-h-[44px] items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
          >
            ← Back to the document
          </Link>
        </div>
      </main>
    );
  }

  // SP-14/F100 — the return names the full project, exactly as the plan room
  // and the spec book leaves do.
  const projectName = row?.title || 'Project';

  const liveBoards = ((live.data ?? []) as ProposalBoardSummary[]).filter(
    (board) => board.status !== 'archived',
  );
  const frozenBoards = (frozen.data ?? []) as ProjectBoard[];
  const empty = liveBoards.length === 0 && frozenBoards.length === 0;
  return (
    <main className="min-h-screen bg-[var(--doc-paper)] text-[var(--color-charcoal)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-pearl)] bg-[var(--doc-paper)]/95 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-4">
          <Link
            href={`/doc/${routeId}`}
            className="inline-flex min-h-11 items-center py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
          >
            ← {projectName}
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-xl">Boards</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {empty
                ? 'No boards yet · start one'
                : `${liveBoards.length} working · ${frozenBoards.length} signed`}
            </p>
          </div>
          {/* The ticket mounts on project, install and care alike, so its
              `Boards` row opens the same page with the same act on all three
              (B1-L4's acceptance) — and the ≥1440 leaf is handed the same
              answer, so one row never means two different things by width. */}
          <DocumentActionRow surfaceKey={SURFACE_KEY} regionKey={REGION_KEY}>
            <DocumentAction
              actionKey="start-a-board"
              variant="secondary"
              onClick={() => setStarting(true)}
            >
              Start a board
            </DocumentAction>
          </DocumentActionRow>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-8">
        {starting && (
          <div className="mb-8">
            <BoardsBuilder projectId={projectId} />
          </div>
        )}

        {empty && !starting ? (
          <p className="font-heading text-[1.05rem] italic text-[var(--text-muted)]">
            No boards yet · start one
          </p>
        ) : (
          <>
            {liveBoards.length > 0 && (
              <section aria-labelledby="project-boards-working" className="border-t border-[var(--color-pearl)] pt-4">
                <h2 id="project-boards-working" className={LABEL}>
                  Working boards
                </h2>
                <div className="mt-2 border-t border-[var(--color-pearl)]">
                  {liveBoards.map((board) => (
                    <BoardRow
                      key={board.id}
                      name={board.name}
                      detail={`${pieces(board.item_count)} · open room`}
                      status={reactionStatuses.get(board.id)}
                      href={boardRoomHref({
                        boardId: board.id,
                        from: boardsRoutePath(routeId),
                        source: 'project_surface',
                      })}
                    />
                  ))}
                </div>
              </section>
            )}

            {frozenBoards.length > 0 && (
              <section aria-labelledby="project-boards-signed" className="mt-8 border-t border-[var(--color-pearl)] pt-4">
                <h2 id="project-boards-signed" className={LABEL}>
                  Signed direction
                </h2>
                <div className="mt-2 border-t border-[var(--color-pearl)]">
                  {frozenBoards.map((snapshot) => (
                    // A signed snapshot is a `project_boards` row, not a board
                    // room — it is read here and continued on the paper.
                    <div key={snapshot.id} className={ROW}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-heading text-[15px] text-[var(--color-charcoal)]">
                          {snapshot.name}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                          Frozen at signing · {pieces(snapshot.items.length)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
