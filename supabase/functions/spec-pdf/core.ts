export type SpecPdfKind = 'item' | 'document' | 'board' | 'board-composition';

export interface ParsedSpecPdfPayload {
  kind: SpecPdfKind;
  proposalId: string | null;
  projectId: string | null;
  itemId: string | null;
  boardId: string | null;
  visibility: {
    pricing?: boolean;
    supplierIdentity?: boolean;
    sourceUrls?: boolean;
    leadTimes?: boolean;
    itemDetails?: boolean;
  };
}

export function parseSpecPdfBody(
  raw: unknown,
): { ok: true; payload: ParsedSpecPdfPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'invalid_body' };
  }
  const body = raw as Record<string, unknown>;
  const kind = body.kind;
  if (
    kind !== 'item' &&
    kind !== 'document' &&
    kind !== 'board' &&
    kind !== 'board-composition'
  ) {
    return { ok: false, error: 'invalid_kind' };
  }

  const proposalId = typeof body.proposalId === 'string' && body.proposalId
    ? body.proposalId
    : null;
  const projectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : null;
  if ((proposalId && projectId) || (!proposalId && !projectId)) {
    return { ok: false, error: 'exactly_one_owner_required' };
  }

  const itemId = typeof body.itemId === 'string' && body.itemId ? body.itemId : null;
  if (kind === 'item' && !itemId) {
    return { ok: false, error: 'item_id_required' };
  }

  const boardId = typeof body.boardId === 'string' && body.boardId ? body.boardId : null;
  if ((kind === 'board' || kind === 'board-composition') && !boardId) {
    return { ok: false, error: 'board_id_required' };
  }

  const visibility = body.visibility && typeof body.visibility === 'object'
    ? body.visibility as ParsedSpecPdfPayload['visibility']
    : {};

  return {
    ok: true,
    payload: { kind, proposalId, projectId, itemId, boardId, visibility },
  };
}

/** Legacy kinds remain exact-owner-only; only composition accepts a peer. */
export function canCallerUseOwner(
  kind: SpecPdfKind,
  callerId: string,
  designerId: string,
  sharesActiveDesignStudio: boolean,
): boolean {
  if (callerId === designerId) return true;
  return kind === 'board-composition' && sharesActiveDesignStudio;
}

export interface BoardOwnerLegs {
  proposal_id?: string | null;
  project_id?: string | null;
}

/** Missing and foreign board rows both collapse to the same null result. */
export function ownedBoardOrNull<T extends BoardOwnerLegs>(
  board: T | null,
  ownerId: string,
  isProposal: boolean,
): T | null {
  if (!board) return null;
  const boardOwnerId = isProposal ? board.proposal_id : board.project_id;
  return boardOwnerId === ownerId ? board : null;
}
