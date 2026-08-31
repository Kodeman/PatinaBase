/**
 * Guest share route (Schedule & Boards Wave 2 · C2).
 *
 * A tokenized, VIEW-ONLY window onto a proposal's client copy. No session: the
 * token is resolved SERVER-SIDE through resolve_document_share() (the only guest
 * read path, 00266) using the service client, then the single addressed proposal
 * is fetched and rendered with the SAME <ProposalDocument> the authed client
 * sees — under the share's per-field visibility, feedback OFF, no sign/verdict
 * affordances. Any invalid / revoked / expired token lands on a calm dead-link
 * page that does not leak whether a link ever existed.
 *
 * One exception, and only one: a BOARD token minted with the reaction opt-in
 * (00546) renders per-pin approve/pass. resolve_board_share() decides that, not
 * this file — a link without the opt-in resolves without the capability at all.
 */

import type { ComponentProps } from 'react';
import { createServiceClient } from '@patina/supabase/server';
import { signBoardMediaValue } from '@patina/supabase';
import {
  BoardComposition,
  type BoardsBlockBoard,
} from '@patina/design-system';
import { normalizeShareVisibility, guestShareVisibility, isLikelyShareToken } from '@patina/utils';
import { ProposalDocument } from '@/components/proposal-document';
import {
  buildGuestProposalDocumentBundle,
  GUEST_BOARD_SELECT,
  GUEST_EXCLUSION_SELECT,
  GUEST_PAYMENT_MILESTONE_SELECT,
  GUEST_PHASE_SELECT,
  GUEST_PROPOSAL_SELECT,
  GUEST_SCOPE_ROOM_PRIVATE_SELECT,
  GUEST_SCOPE_ROOM_SELECT,
  GUEST_SECTION_SELECT,
  signServiceAuthorizedBoards,
} from '@/lib/guest-proposal-document';
import { captureMoodBoardShareViewed } from '@/lib/analytics/mood-board-server';
import { BoardReactions, parseGuestReactions } from './board-reactions';

// The token is resolved per request (and bumps view stats) — never static.
export const dynamic = 'force-dynamic';

function DeadLink() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.3rem',
          fontWeight: 400,
          color: 'var(--text-primary)',
        }}
      >
        This link isn’t available
      </p>
      <p className="type-body-small mt-2 text-[var(--text-muted)]">
        The share link may have been turned off or has expired. Ask the studio for a fresh link.
      </p>
    </div>
  );
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Cheap format gate before any DB round-trip (no existence signal either way).
  if (!isLikelyShareToken(token)) return <DeadLink />;

  const admin = createServiceClient() as any;

  // A board share is deliberately resolved through its own narrow RPC. The
  // returned DTO contains one composition and no parent proposal/project ids,
  // money, client data, or verdict capability. Trying this resolver first is
  // safe for historical proposal tokens: a non-board token returns null and
  // does not increment either share's view count.
  const { data: resolvedBoard, error: boardResolveError } = await admin.rpc(
    'resolve_board_share',
    { p_token: token },
  );
  if (!boardResolveError && resolvedBoard?.board) {
    const signedResolvedBoard = await signBoardMediaValue(admin, resolvedBoard);
    const board = signedResolvedBoard.board as BoardsBlockBoard;
    if (typeof board.id === 'string' && typeof resolvedBoard.shareId === 'string') {
      await captureMoodBoardShareViewed({
        boardId: board.id,
        shareId: resolvedBoard.shareId,
      });
    }
    return (
      <main className="flex min-h-dvh flex-col bg-[var(--bg-page)]">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3 sm:px-8">
          <div className="min-w-0">
            <h1 className="truncate type-title-small text-[var(--text-primary)]">
              {board.name}
            </h1>
            <p className="type-meta-small text-[var(--text-muted)]">
              Shared by {resolvedBoard.studioName ?? 'the studio'}
            </p>
          </div>
        </header>
        <div className="min-h-0 flex-1 p-3 sm:p-6">
          {resolvedBoard.reactionsEnabled === true ? (
            // The capability rides the resolve payload, and the payload only
            // carries it when the link was minted with the opt-in. A view-only
            // link therefore has nothing to hang a reaction affordance on.
            <BoardReactions
              token={token}
              board={board}
              reactions={parseGuestReactions(resolvedBoard.reactions)}
            />
          ) : (
            <BoardComposition
              board={board}
              fit="contain"
              fullBleed
              showNotes
              interactive={false}
              className="h-full"
            />
          )}
        </div>
      </main>
    );
  }

  const { data: resolved, error: resolveError } = await admin.rpc('resolve_document_share', {
    p_token: token,
  });
  const share = Array.isArray(resolved) ? resolved[0] : resolved;
  if (resolveError || !share?.proposal_id) return <DeadLink />;

  const proposalId = share.proposal_id as string;
  const visibility = guestShareVisibility(normalizeShareVisibility(share.visibility));

  // Fetch only the allowlisted source fields needed to build the guest DTO.
  // The service client bypasses RLS, so each query remains pinned to this one
  // resolved proposal and visibility-disabled money blocks are not fetched.
  const [
    { data: proposalRow },
    { data: sectionRows },
    { data: paymentMilestoneRows },
    { data: phaseRows },
    { data: exclusionRows },
    { data: scopeRoomRows },
  ] = await Promise.all([
    admin
      .from('proposals')
      .select(GUEST_PROPOSAL_SELECT)
      .eq('id', proposalId)
      .single(),
    admin
      .from('proposal_sections')
      .select(GUEST_SECTION_SELECT)
      .eq('proposal_id', proposalId)
      .order('sort_order', { ascending: true }),
    visibility.paymentSchedule
      ? admin
          .from('proposal_payment_milestones')
          .select(GUEST_PAYMENT_MILESTONE_SELECT)
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] }),
    admin
      .from('proposal_phases')
      .select(GUEST_PHASE_SELECT)
      .eq('proposal_id', proposalId)
      .order('sort_order', { ascending: true }),
    admin
      .from('proposal_exclusions')
      .select(GUEST_EXCLUSION_SELECT)
      .eq('proposal_id', proposalId)
      .order('sort_order', { ascending: true }),
    admin
      .from('proposal_scope_rooms')
      .select(
        visibility.roomBudgets ? GUEST_SCOPE_ROOM_SELECT : GUEST_SCOPE_ROOM_PRIVATE_SELECT,
      )
      .eq('proposal_id', proposalId)
      .order('sort_order', { ascending: true }),
  ]);

  if (!proposalRow) return <DeadLink />;

  // Boards ride the share in Wave 3 (B3), but only when itemDetails is on — the
  // same gate that governs the itemized piece list (a board IS the pieces, laid
  // out). We resolve them SERVER-SIDE with the service client (active only,
  // mirroring useBoardsWithItems) and pass fully-materialized boards straight to
  // the render: the client-side useBoardsWithItems wrapper RLS-fetches ZERO rows
  // for a guest, so we bypass it. feedbackEnabled stays false, so no verdict
  // affordances ride along — a guest board is view-only, like the rest of the
  // guest surface.
  let boardRows: unknown[] = [];
  if (visibility.itemDetails) {
    const { data } = await admin
      .from('proposal_boards')
      .select(GUEST_BOARD_SELECT)
      .eq('proposal_id', proposalId)
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('z_index', { ascending: true, referencedTable: 'proposal_board_items' });
    boardRows = await signServiceAuthorizedBoards(admin, data ?? []);
  }

  const bundle = buildGuestProposalDocumentBundle({
    proposal: proposalRow,
    sections: sectionRows,
    paymentMilestones: paymentMilestoneRows,
    phases: phaseRows,
    exclusions: exclusionRows,
    scopeRooms: scopeRoomRows,
    boards: boardRows,
    visibility,
  });

  // ProposalDocument also serves authenticated clients and therefore accepts
  // the wider database model. The guest builder above is intentionally narrower;
  // this one cast is the audited server-to-client boundary.
  const documentProps = {
    proposal: bundle.proposal,
    sections: bundle.sections,
    paymentMilestones: bundle.paymentMilestones,
    phases: bundle.phases,
    exclusions: bundle.exclusions,
    scopeRooms: bundle.scopeRooms,
  } as unknown as ComponentProps<typeof ProposalDocument>;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <ProposalDocument
        {...documentProps}
        trackEngagement={false}
        boards={[]}
        resolvedBoards={bundle.resolvedBoards}
        moodBoardSurface="guest_share"
        visibility={visibility}
        feedbackEnabled={false}
        sharedByStudio={share.studio_name ?? undefined}
      />
    </div>
  );
}
