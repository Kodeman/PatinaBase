'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { DeckImportCandidate, EditableMoodBoardItem } from '@patina/types';
import { Button } from '@/components/ui/controls';
import type { BoardRoomControllerApi } from '@/components/portal/scope-builder/board-room-controller';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { candidateView, type DeckProductMap } from '@/hooks/use-board-deck-import-review';
import {
  canFindThisPiece,
  FIND_PIECE_COPY,
  type FindThisPieceRoom,
  PHOTO_MATCH_FLAG,
  useBoardFindThisPiece,
} from '@/hooks/use-board-find-this-piece';

/**
 * "Find this piece" — inspector action on a picture pin (flag
 * `board-photo-match`). Off or loading renders nothing.
 */
export function BoardFindThisPiece({ api, pin }: { api: BoardRoomControllerApi; pin: EditableMoodBoardItem }) {
  const { value: on } = useFeatureFlag(PHOTO_MATCH_FLAG);
  if (!on || !api.state || !canFindThisPiece(pin)) return null;
  return <FindThisPiece key={pin.id} api={api} pin={pin} />;
}

function FindThisPiece({ api, pin }: { api: BoardRoomControllerApi; pin: EditableMoodBoardItem }) {
  const { replaceItem, addItems, flushPending } = api;
  // A decision lands after its RPC: read the pins as they are then, not as
  // they were on click, so a move made meanwhile is not undone.
  const items = api.state?.items;
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const room = useMemo<FindThisPieceRoom>(() => ({
    pins: () => itemsRef.current ?? [],
    replaceItem,
    addItems: (next) => { addItems(next, { select: false }); },
    flush: flushPending,
  }), [addItems, flushPending, replaceItem]);
  const found = useBoardFindThisPiece({ boardId: api.state?.boardId, pin, room });
  const { groups } = found;
  const empty = found.started && !found.finding && found.item != null &&
    groups.library.length + groups.likely.length + groups.possible.length === 0;

  return (
    <div data-find-this-piece className="space-y-1.5 rounded-[4px] border border-[var(--border-default)] px-2.5 py-2">
      {!found.started || (!found.finding && found.item?.state !== 'kept') ? (
        <Button size="sm" variant="ghost" disabled={found.finding} onClick={() => { void found.find(); }}>
          {FIND_PIECE_COPY.action}
        </Button>
      ) : null}
      {found.finding && (
        <p role="status" className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          {FIND_PIECE_COPY.finding}
        </p>
      )}
      {found.unavailable && (
        <p data-photo-match-unavailable className="text-[10px] leading-4 text-[var(--text-muted)]">
          {FIND_PIECE_COPY.unavailable}
        </p>
      )}
      {!found.finding && (
        <>
          <CandidateGroup label={FIND_PIECE_COPY.library} candidates={groups.library} products={found.products} found={found} />
          <CandidateGroup label={FIND_PIECE_COPY.likelyLook} candidates={groups.likely} products={found.products} found={found} />
          <CandidateGroup label={FIND_PIECE_COPY.possibleLook} candidates={groups.possible} products={found.products} found={found} />
        </>
      )}
      {empty && <p className="text-[10px] leading-4 text-[var(--text-muted)]">{FIND_PIECE_COPY.nothing}</p>}
      {found.error && <p role="alert" className="text-[10px] leading-4 text-[var(--text-muted)]">{found.error}</p>}
    </div>
  );
}

function CandidateGroup({
  label,
  candidates,
  products,
  found,
}: {
  label: string;
  candidates: DeckImportCandidate[];
  products: DeckProductMap;
  found: ReturnType<typeof useBoardFindThisPiece>;
}) {
  if (candidates.length === 0) return null;
  const keptId = found.item?.state === 'kept' ? found.item.chosenProductId : null;
  return (
    <section aria-label={label} className="space-y-1">
      <p className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">{label}</p>
      <ul className="space-y-1">
        {candidates.map((candidate) => {
          const view = candidateView(candidate, products);
          const name = view?.name ?? 'A piece';
          const kept = keptId != null && candidate.productId === keptId;
          return (
            <li key={`${candidate.rank}-${candidate.productId ?? ''}`} className="flex items-center gap-2">
              {view?.imageUrl ? (
                <img src={view.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-[2px] object-cover" />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-[var(--text-default)]">
                {name}
                {view?.maker ? <span className="text-[var(--text-muted)]"> · {view.maker}</span> : null}
              </span>
              {kept ? (
                <span className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  {FIND_PIECE_COPY.kept}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={found.busy}
                  aria-label={`${FIND_PIECE_COPY.keep} ${name}`}
                  onClick={() => { void found.keep(candidate); }}
                >
                  {FIND_PIECE_COPY.keep}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
