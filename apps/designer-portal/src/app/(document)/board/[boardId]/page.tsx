'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import type { BoardOwnerRef } from '@patina/types';
import { useBoard, type BoardWithItems } from '@patina/supabase';
import { Button } from '@/components/ui/controls';
import { MoodBoardRoom } from '@/components/mood-board/board-room-shell';

export function moodBoardOwner(board: Pick<BoardWithItems, 'proposal_id' | 'project_id'>): BoardOwnerRef | null {
  if (board.project_id) return { kind: 'project', id: board.project_id };
  if (board.proposal_id) return { kind: 'proposal', id: board.proposal_id };
  return null;
}

function UnavailableBoard() {
  const router = useRouter();
  return (
    <main className="fixed inset-0 flex h-[100dvh] items-center justify-center overflow-hidden overscroll-contain bg-[var(--bg-primary)] p-8">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-2xl text-[var(--text-primary)]">This board is unavailable</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          It may not exist, or you may not have access.
        </p>
        <Button variant="secondary" className="mt-5" onClick={() => router.push('/desk')}>
          Return to the Desk
        </Button>
      </div>
    </main>
  );
}

export default function MoodBoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = use(params);
  const boardQuery = useBoard(boardId);
  if (boardQuery.isLoading) {
    return (
      <main
        aria-label="Loading mood board"
        className="fixed inset-0 h-[100dvh] overflow-hidden overscroll-contain bg-[var(--bg-muted)]"
      >
        <div className="h-14 animate-pulse border-b border-[var(--border-default)] bg-[var(--bg-surface)]" />
        <div className="h-[calc(100dvh-3.5rem)] animate-pulse bg-[linear-gradient(90deg,var(--bg-muted),var(--bg-surface),var(--bg-muted))]" />
      </main>
    );
  }
  const owner = boardQuery.data ? moodBoardOwner(boardQuery.data) : null;
  if (boardQuery.isError || !boardQuery.data || !owner) return <UnavailableBoard />;
  return <MoodBoardRoom owner={owner} boardId={boardId} />;
}
