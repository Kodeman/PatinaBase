"use client";

/**
 * The Boards Strip — the Speccing table's board tool (W3 lane 3b).
 *
 * Q1's ratified reversal of I136, for the speccing stage ONLY: while the
 * document is at direction, board content is touchable from the paper. The
 * shelf remains boards' home everywhere else — this strip is the table
 * borrowing the tool, not a second home.
 *
 * The strip is proposal-keyed (R3): direction-stage boards are the PROPOSAL's
 * boards, read through the same `useBoards` the Drafting Room's Boards facet
 * (BoardsBuilder) reads, and created through the same `useUpsertBoard` +
 * autosave barrier the facet's blank-board leg uses. The mood-board shelf leaf
 * is project-keyed and is deliberately NOT this strip's source.
 *
 * Opening a board reuses the facet's exact affordance: a link into the one
 * canonical full-viewport board room (`boardRoomHref`), same `drafting_strip`
 * attribution, `from` set so the room returns to this paper.
 *
 * ≥1440: a horizontal row of quiet tiles + a scored "Start a board" line.
 * <1440 (Q7/A4 — the capability is never display:none'd, it changes form):
 * a one-line "Boards · N" seam that expands in place to the same tiles,
 * vertically, with the same start line.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useBoards,
  useUpsertBoard,
  type ProposalBoardSummary,
} from "@patina/supabase";
import type { BoardOwnerRef } from "@patina/types";
import { DocumentAction } from "@/components/document/document-action";
import { boardRoomHref } from "@/lib/mood-board/navigation";
import { runBoardOwnerAutosaveAction } from "@/lib/proposal-autosave-registry";

export interface BoardsStripProps {
  proposalId: string;
  /**
   * The rooms rail's lens (W3 3d). Boards carrying a matching
   * `scope_room_id` are lifted to the front of the strip; nothing is ever
   * hidden by the lens (a lens focuses, it does not censor).
   */
  roomFilter?: string | null;
}

function BoardTile({
  board,
  href,
  form,
}: {
  board: ProposalBoardSummary;
  href: string;
  form: "wide" | "compact";
}) {
  return (
    <Link
      href={href}
      aria-label={`Open board ${board.name}`}
      className={[
        "group flex min-h-11 items-baseline gap-3 rounded-[5px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-3 py-2.5 no-underline transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none",
        form === "wide"
          ? "w-44 shrink-0 flex-col gap-1"
          : "w-full justify-between",
      ].join(" ")}
    >
      <span className="max-w-full truncate font-heading text-[13px] font-medium italic text-[var(--color-charcoal)]">
        {board.name}
      </span>
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {board.item_count} {board.item_count === 1 ? "piece" : "pieces"}
      </span>
    </Link>
  );
}

export function BoardsStrip({ proposalId, roomFilter }: BoardsStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const boardsQuery = useBoards(proposalId);
  const createBoard = useUpsertBoard();
  const [expanded, setExpanded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionPending = useRef(false);

  const boards = useMemo(() => {
    const live = (boardsQuery.data ?? []).filter(
      (board) => board.status !== "archived",
    );
    if (!roomFilter) return live;
    // Lift, never hide: the lensed room's boards come to the front; the rest
    // keep their order behind them.
    return [
      ...live.filter((board) => board.scope_room_id === roomFilter),
      ...live.filter((board) => board.scope_room_id !== roomFilter),
    ];
  }, [boardsQuery.data, roomFilter]);

  const hrefFor = (boardId: string) =>
    boardRoomHref({ boardId, from: pathname, source: "drafting_strip" });

  // The facet's blank-board leg, verbatim: same barrier, same naming, same
  // sort seed, same landing in the board room. Templates stay with the facet.
  const startBoard = async () => {
    if (actionPending.current) return;
    actionPending.current = true;
    setStarting(true);
    setError(null);
    const owner: BoardOwnerRef = { kind: "proposal", id: proposalId };
    try {
      let boardId = "";
      await runBoardOwnerAutosaveAction(owner, async () => {
        const board = await createBoard.mutateAsync({
          proposalId,
          name: `Board ${boards.length + 1}`,
          sortOrder: (boardsQuery.data ?? []).length,
        });
        boardId = board.id;
      });
      if (!boardId) throw new Error("The new board did not return an id.");
      router.push(hrefFor(boardId));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The board could not be started.",
      );
    } finally {
      actionPending.current = false;
      setStarting(false);
    }
  };

  // A strip that cannot yet say how many boards there are prints nothing —
  // the table stays calm while the read settles or fails; the shelf and the
  // facet still hold the domain.
  if (boardsQuery.isLoading || boardsQuery.isError) return null;

  const startLine = (
    <DocumentAction
      actionKey="start-speccing-board"
      surfaceKey="open-document"
      regionKey="boards-strip"
      variant="secondary"
      loading={starting}
      loadingLabel="Starting…"
      onClick={() => void startBoard()}
    >
      Start a board
    </DocumentAction>
  );

  const countLabel = `${boards.length} board${boards.length === 1 ? "" : "s"}`;

  return (
    <div data-boards-strip className="min-w-0">
      {/* ≥1440 — the strip proper. */}
      <div data-boards-strip-wide className="hidden min-[1440px]:block">
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          Boards
        </p>
        <div className="flex items-center gap-3">
          {boards.length > 0 && (
            <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {boards.map((board) => (
                <BoardTile
                  key={board.id}
                  board={board}
                  href={hrefFor(board.id)}
                  form="wide"
                />
              ))}
            </div>
          )}
          <div className="shrink-0">{startLine}</div>
        </div>
      </div>

      {/* <1440 — the same capability, folded to one seam (Q7/A4). */}
      <div data-boards-strip-compact className="min-[1440px]:hidden">
        <button
          type="button"
          aria-expanded={expanded}
          data-boards-strip-row
          onClick={() => setExpanded((open) => !open)}
          className="grid min-h-11 w-full grid-cols-[auto_1fr_auto] items-baseline gap-3 px-1 py-2 text-left"
        >
          <span className="font-heading text-[12.5px] font-medium italic text-[var(--color-charcoal)]">
            Boards
          </span>
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            {countLabel}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)]">
            {expanded ? "fold ↑" : "unfold ↓"}
          </span>
        </button>
        {expanded && (
          <div data-boards-strip-list className="flex flex-col gap-2 px-1 pb-2">
            {boards.map((board) => (
              <BoardTile
                key={board.id}
                board={board}
                href={hrefFor(board.id)}
                form="compact"
              />
            ))}
            {startLine}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1 text-[12px] text-[var(--color-clay-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}
