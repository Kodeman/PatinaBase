'use client';

/**
 * The studio's commission plates (WP-01.8, "Studio plate images" ruling): the
 * one picture each job stands behind on the round-8 studio. A plate is read
 * from two sources ONLY, both images the designer composed for the client:
 *
 *   1. a live board's cover (`proposal_boards.cover_image_url`, owned by the
 *      job's project or its proposal), the most recently touched first;
 *   2. the proposal's own cover (`proposals.cover_image`).
 *
 * Room scans and Field captures are never read here: they enter a plate only
 * by the designer's explicit choice, which is a later ticket's act. A job
 * with neither source has no plate, and the studio sets its name instead.
 *
 * Read-only and RLS-scoped, under each source owner’s native invalidation.
 */

import { useQuery } from '@tanstack/react-query';
import { commissionPlateQueryKeys, createBrowserClient, signBoardMediaValue, signProjectWorkingBoardRow } from '@patina/supabase';

export interface CommissionJob {
  /** The studio's job key: `project_id ?? engagement_id`. */
  jobId: string;
  projectId: string | null;
  proposalId: string | null;
}

export interface CommissionPlate {
  url: string;
  source: 'board' | 'proposal';
}

export interface PlateBoardRow {
  project_id: string | null;
  proposal_id: string | null;
  cover_image_url: string | null;
  updated_at: string | null;
}

export interface PlateProposalRow {
  id: string;
  cover_image: string | null;
}

function usable(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.trim().length > 0;
}

/**
 * One plate per job: its newest board cover, else its proposal's cover. A job
 * absent from the result has no plate.
 */
export function pickCommissionPlates(
  jobs: readonly CommissionJob[],
  boards: readonly PlateBoardRow[],
  proposals: readonly PlateProposalRow[],
): Map<string, CommissionPlate> {
  const newestFirst = [...boards]
    .filter((board) => usable(board.cover_image_url))
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  const proposalCover = new Map(
    proposals.filter((row) => usable(row.cover_image)).map((row) => [row.id, row.cover_image!]),
  );
  const plates = new Map<string, CommissionPlate>();
  for (const job of jobs) {
    const board = newestFirst.find(
      (row) =>
        (job.projectId !== null && row.project_id === job.projectId) ||
        (job.proposalId !== null && row.proposal_id === job.proposalId),
    );
    if (board) {
      plates.set(job.jobId, { url: board.cover_image_url!, source: 'board' });
      continue;
    }
    const cover = job.proposalId ? proposalCover.get(job.proposalId) : undefined;
    if (cover) plates.set(job.jobId, { url: cover, source: 'proposal' });
  }
  return plates;
}

const uniq = (ids: ReadonlyArray<string | null>): string[] =>
  [...new Set(ids.filter((id): id is string => !!id))].sort();

/** Optional batched covers share native mutation invalidation, never row shapes. */
export function useCommissionPlates(jobs: readonly CommissionJob[]) {
  const projectIds = uniq(jobs.map((job) => job.projectId));
  const proposalIds = uniq(jobs.map((job) => job.proposalId));
  const boardRead = useQuery({
    queryKey: commissionPlateQueryKeys.list(projectIds, proposalIds),
    enabled: projectIds.length + proposalIds.length > 0,
    meta: { errorSurface: 'silent' as const },
    queryFn: async (): Promise<PlateBoardRow[]> => {
      const supabase = createBrowserClient() as any;
      const owners = [
        projectIds.length ? 'project_id.in.(' + projectIds.join(',') + ')' : null,
        proposalIds.length ? 'proposal_id.in.(' + proposalIds.join(',') + ')' : null,
      ].filter(Boolean).join(',');
      const { data, error } = await supabase
        .from('proposal_boards')
        .select('project_id, proposal_id, cover_image_url, updated_at')
        .or(owners)
        .eq('status', 'active')
        .not('cover_image_url', 'is', null);
      if (error) throw error;
      const workingRows = await Promise.all((data ?? []).map((row: PlateBoardRow) =>
        signProjectWorkingBoardRow(supabase, row)));
      return await signBoardMediaValue(supabase, workingRows) as PlateBoardRow[];
    },
  });
  const proposalRead = useQuery({
    // useUpdateProposal already invalidates every ['proposals'] projection.
    queryKey: ['proposals', 'commission-plates', proposalIds],
    enabled: proposalIds.length > 0,
    meta: { errorSurface: 'silent' as const },
    queryFn: async (): Promise<PlateProposalRow[]> => {
      const { data, error } = await (createBrowserClient() as any)
        .from('proposals')
        .select('id, cover_image')
        .in('id', proposalIds)
        .not('cover_image', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const boards = boardRead.isError ? [] : boardRead.data ?? [];
  const proposals = proposalRead.isError ? [] : proposalRead.data ?? [];
  const isPending = [boardRead, proposalRead].some((read) =>
    read.isPending && read.fetchStatus !== 'idle');
  return { plates: pickCommissionPlates(jobs, boards, proposals), isPending };
}
