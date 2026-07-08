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
 */

import { createServiceClient } from '@patina/supabase/server';
import { type BoardsBlockBoard } from '@patina/design-system';
import { normalizeShareVisibility, guestShareVisibility, isLikelyShareToken } from '@patina/utils';
import { ProposalDocument } from '@/components/proposal-document';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;

  const { data: resolved, error: resolveError } = await admin.rpc('resolve_document_share', {
    p_token: token,
  });
  const share = Array.isArray(resolved) ? resolved[0] : resolved;
  if (resolveError || !share?.proposal_id) return <DeadLink />;

  const proposalId = share.proposal_id as string;
  const visibility = guestShareVisibility(normalizeShareVisibility(share.visibility));

  // Fetch the single addressed proposal bundle. Scoped strictly to the resolved
  // id — the service client bypasses RLS, so we never widen beyond this proposal.
  const [
    { data: proposal },
    { data: sections },
    { data: paymentMilestones },
    { data: phases },
    { data: exclusions },
    { data: scopeRooms },
  ] = await Promise.all([
    admin
      .from('proposals')
      .select(
        // Guest payload carries the client's NAME (letterhead) but never their
        // email — this HTML reaches anyone holding the link.
        '*, client:profiles!client_id(id,full_name), items:proposal_items(*, product:products(id,name,images,brand))',
      )
      .eq('id', proposalId)
      .single(),
    admin.from('proposal_sections').select('*').eq('proposal_id', proposalId).order('sort_order', { ascending: true }),
    admin.from('proposal_payment_milestones').select('*').eq('proposal_id', proposalId).order('sort_order', { ascending: true }),
    admin.from('proposal_phases').select('*').eq('proposal_id', proposalId).order('sort_order', { ascending: true }),
    admin.from('proposal_exclusions').select('*').eq('proposal_id', proposalId).order('sort_order', { ascending: true }),
    admin.from('proposal_scope_rooms').select('*').eq('proposal_id', proposalId).order('sort_order', { ascending: true }),
  ]);

  if (!proposal) return <DeadLink />;

  // Boards ride the share in Wave 3 (B3), but only when itemDetails is on — the
  // same gate that governs the itemized piece list (a board IS the pieces, laid
  // out). We resolve them SERVER-SIDE with the service client (active only,
  // mirroring useBoardsWithItems) and pass fully-materialized boards straight to
  // the render: the client-side useBoardsWithItems wrapper RLS-fetches ZERO rows
  // for a guest, so we bypass it. feedbackEnabled stays false, so no verdict
  // affordances ride along — a guest board is view-only, like the rest of the
  // guest surface.
  let resolvedBoards: BoardsBlockBoard[] = [];
  if (visibility.itemDetails) {
    const { data: boardRows } = await admin
      .from('proposal_boards')
      .select('*, proposal_board_items(*)')
      .eq('proposal_id', proposalId)
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('z_index', { ascending: true, referencedTable: 'proposal_board_items' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvedBoards = ((boardRows ?? []) as any[]).map((row) => {
      const { proposal_board_items: items, ...board } = row;
      return {
        id: board.id as string,
        name: board.name as string,
        canvas_width: board.canvas_width as number,
        canvas_height: board.canvas_height as number,
        background_color: board.background_color as string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: ((items ?? []) as any[]).map((it) => ({
          id: it.id as string,
          type: it.type as string,
          x: it.x,
          y: it.y,
          width: it.width,
          height: it.height,
          z_index: it.z_index,
          rotation: it.rotation,
          image_url: it.image_url ?? null,
          content: it.content ?? null,
          data: it.data,
        })),
      };
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <ProposalDocument
        proposal={proposal}
        sections={sections ?? []}
        trackEngagement={false}
        paymentMilestones={paymentMilestones ?? []}
        phases={phases ?? []}
        exclusions={exclusions ?? []}
        scopeRooms={scopeRooms ?? []}
        boards={[]}
        resolvedBoards={resolvedBoards}
        visibility={visibility}
        feedbackEnabled={false}
        sharedByStudio={share.studio_name ?? undefined}
      />
    </div>
  );
}
