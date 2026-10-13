'use client';

/**
 * The boards, on a page of their own (J-01). The list used to exist only
 * inside the ≥1440 shelf leaf, so the ticket's `Design boards` row had nowhere to go
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
import { BoardCoverArt } from '@/components/mood-board/board-cover-art';
import type { BoardReactionStatus } from '@patina/supabase';
import { STAGE_WORD } from '@/lib/document/act-names';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { EmptyState } from '../empty-state';

const SURFACE_KEY = 'project-boards';
const REGION_KEY = 'project-boards';

const LABEL =
  'font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]';

/** A Section of Cards holds at most six (US-28 (b)2); the rest are ledger
 * rows beneath. */
const MAX_CARDS = 6;

/** The six stages that carry a stage edge (US-28 S1 `.st-*`). Care prints its
 * word without a tick colour. */
const TICKED_STAGES = new Set<SectionKey>([
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
]);

/** The board's state as its ink word (V20 U-Q13), the studio index's words. */
const STATE_WORD: Record<BoardReactionStatus, string> = {
  awaiting_reaction: 'Awaiting board feedback',
  reactions_in: 'Feedback received',
  approved_pipeline: 'Approved items',
};

function pieces(count: number): string {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`;
}

function SectionEyebrow({ id, children }: { id: string; children: string }) {
  return (
    <div className="sec-head">
      <h2 className="eb" id={id}>
        <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
          <path d="M0 2h34M0 6h28M0 10h20" />
        </svg>
        <span>{children}</span>
      </h2>
    </div>
  );
}

/** A job's open board: bounded and ranked, so a Card with a plate slot
 * (U-Q20). The name opens the room; the whole upper block is its target. */
function BoardCard({
  board,
  href,
  status,
}: {
  board: ProposalBoardSummary;
  href: string;
  status: BoardReactionStatus | null | undefined;
}) {
  return (
    <article className="card" data-board-card={board.id}>
      <div className="card-up">
        <p className="eb">Design board</p>
        <h3 className="name-h t-d3">
          <Link href={href} className="name">
            {board.name}
          </Link>
        </h3>
      </div>
      <span className="plate">
        <BoardCoverArt
          name={board.name}
          coverUrl={board.cover_image_url}
          fallbackUrls={board.cover_fallback_urls}
        />
      </span>
      <div className="lines">
        <div className="ln-item">
          <p className="line t-body-sm">{pieces(board.item_count)}</p>
          {status && (
            <p className="s11-card-state">
              <span className="word">{STATE_WORD[status]}</span>
            </p>
          )}
        </div>
      </div>
    </article>
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

  // F30 — the Add-to-project sheet's "Create design board" fires this at whichever
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

  // ⌘K offers one `Design boards` door on every document (F62), and a proposal-stage
  // document has boards — they live in the Drafting Room, which is where this
  // page sends the reader rather than dead-ending on a sentence.
  if (!projectId) {
    const draftingProposalId = row?.proposal_id ?? null;
    return (
      <main className="min-h-screen bg-[var(--doc-paper)] px-8 py-16">
        <p className="max-w-lg font-heading text-[1.25rem] italic text-[var(--color-charcoal)]">
          {draftingProposalId
            ? 'This proposal’s design boards are in the proposal workspace.'
            : 'Design boards are available once a project is created.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          {draftingProposalId && (
            <Link
              href={`/drafting/${draftingProposalId}`}
              className="inline-flex min-h-[44px] items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)]"
            >
              Open the proposal workspace
            </Link>
          )}
          <Link
            href={`/doc/${routeId}`}
            className="inline-flex min-h-[44px] items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
          >
            ← Back to project file
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
  const stage = (row?.active_section ?? null) as SectionKey | null;
  const stageWord = stage ? STAGE_WORD[stage] : null;
  const clientName = row?.client_name?.trim() || null;
  const boardHref = (boardId: string) =>
    boardRoomHref({ boardId, from: boardsRoutePath(routeId), source: 'project_surface' });
  const cardBoards = liveBoards.slice(0, MAX_CARDS);
  const rowBoards = liveBoards.slice(MAX_CARDS);

  // US-28 S11 (specimens/boards-1440 frame p2): the Header line with the
  // return and a scored ＋ New board; the job's open boards as Cards with a
  // plate slot (a bounded, ranked set, U-Q20); signed snapshots as ledger
  // rows. No filled act. Present on the Card arrives with the room (S12).
  return (
    <main className="min-h-screen bg-[var(--doc-paper)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-[1100px] px-4 pb-16 md:px-8">
        <header className="hline">
          <div className="hline-l">
            <Link
              href={`/doc/${routeId}`}
              className="inline-flex min-h-11 items-center t-meta uppercase text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
            >
              ← {projectName}
            </Link>
            <h1 className="t-d2">Design boards</h1>
            <p className="t-meta uppercase text-[var(--text-subtle)]">
              {empty
                ? 'No design boards yet. Create one to begin.'
                : `${liveBoards.length} working · ${frozenBoards.length} signed`}
            </p>
          </div>
          <div className="hline-r">
            {/* The ticket mounts on project, install and care alike, so its
                `Design boards` row opens the same page with the same act on all three
                (B1-L4's acceptance) — and the ≥1440 leaf is handed the same
                answer, so one row never means two different things by width. */}
            <DocumentActionRow surfaceKey={SURFACE_KEY} regionKey={REGION_KEY}>
              <DocumentAction
                actionKey="start-a-board"
                variant="secondary"
                onClick={() => setStarting(true)}
              >
                <span aria-hidden="true">＋ </span>New board
              </DocumentAction>
            </DocumentActionRow>
          </div>
        </header>
        <div className="rule-strong" />

        {stageWord && (
          <p className="eb s11-tab-job">
            <span
              className={`tick s11-eb-job${stage && TICKED_STAGES.has(stage) ? ` st-${stage}` : ''}`}
            >
              {projectName}
            </span>
            <span>{clientName ? `${stageWord} · ${clientName}` : stageWord}</span>
          </p>
        )}

        {starting && (
          <div className="mb-8 mt-6">
            <BoardsBuilder projectId={projectId} />
          </div>
        )}

        {empty && !starting ? (
          <EmptyState eyebrow="Design boards" className="s11-first">
            No boards yet · start one
          </EmptyState>
        ) : (
          <>
            {liveBoards.length > 0 && (
              <section aria-labelledby="project-boards-working" className="section s11-first">
                <SectionEyebrow id="project-boards-working">Working design boards</SectionEyebrow>
                <div className="cards-wrap">
                  <div className="cards">
                    {cardBoards.map((board) => (
                      <BoardCard
                        key={board.id}
                        board={board}
                        href={boardHref(board.id)}
                        status={reactionStatuses.get(board.id)}
                      />
                    ))}
                  </div>
                </div>
                {rowBoards.length > 0 && (
                  <div className="ledger s11-after-cards">
                    <div className="rows">
                      {rowBoards.map((board) => {
                        const status = reactionStatuses.get(board.id);
                        return (
                          <div key={board.id} className="lrow plain">
                            <span className="lname">
                              <Link href={boardHref(board.id)} className="name t-d4">
                                {board.name}
                              </Link>
                            </span>
                            <span className="lsent t-body-sm">{pieces(board.item_count)}</span>
                            <span className="lwhen">
                              {status && <span className="word">{STATE_WORD[status]}</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {frozenBoards.length > 0 ? (
              <section aria-labelledby="project-boards-signed" className="section">
                <SectionEyebrow id="project-boards-signed">Signed design direction</SectionEyebrow>
                <div className="ledger">
                  <div className="rows">
                    {frozenBoards.map((snapshot) => (
                      // A signed snapshot is a `project_boards` row, not a board
                      // room — it is read here and continued on the paper.
                      <div key={snapshot.id} className="lrow plain">
                        <span className="lname t-d4 s11-lname-text">{snapshot.name}</span>
                        <span className="lsent t-body-sm">
                          Signed snapshot · {snapshot.items.length} {snapshot.items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              liveBoards.length > 0 && (
                <EmptyState eyebrow="Signed design direction">
                  Nothing is signed yet. When the client signs a board, it lands here.
                </EmptyState>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
