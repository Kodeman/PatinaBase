/**
 * Client-side hooks for the reviews feature on the client portal.
 *
 * The existing `use-reviews.ts` hooks are designer-keyed (a designer requests
 * reviews from their clients). This file exposes the inverse — given the
 * signed-in user (a client), surface the review requests directed at them
 * and the reviews they've already submitted.
 */
import { useQuery } from '@tanstack/react-query';

import { createBrowserClient } from '../client';

export interface ClientPendingReview {
  id: string;
  rating: number | null;
  review_text: string | null;
  request_status: 'not_sent' | 'queued' | 'sent' | 'collected';
  custom_message: string | null;
  request_sent_at: string | null;
  created_at: string;
  project: { id: string; name: string | null } | null;
  designer: { id: string; full_name: string | null; business_name: string | null; avatar_url: string | null } | null;
}

const getSupabase = () => createBrowserClient();

async function fetchClientReviews(
  clientUserId: string,
  statuses: ClientPendingReview['request_status'][],
): Promise<ClientPendingReview[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabase() as any;

  // designer_clients rows where the current user is the client.
  const { data: dcRows, error: dcErr } = await supabase
    .from('designer_clients')
    .select('id, designer_id, designer:profiles!designer_id(id, full_name, business_name, avatar_url)')
    .eq('client_id', clientUserId);

  if (dcErr) throw dcErr;
  const designerClientIds = (dcRows ?? []).map(
    (r: { id: string }) => r.id,
  );
  if (designerClientIds.length === 0) return [];

  const dcMap = new Map<string, ClientPendingReview['designer']>();
  for (const r of dcRows ?? []) {
    const d = (r as { designer?: ClientPendingReview['designer'] }).designer ?? null;
    dcMap.set((r as { id: string }).id, d);
  }

  const { data, error } = await supabase
    .from('client_reviews')
    .select(
      `id, designer_client_id, rating, review_text, request_status,
       custom_message, request_sent_at, created_at,
       project:projects!project_id(id, name)`,
    )
    .in('designer_client_id', designerClientIds)
    .in('request_status', statuses)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: {
    id: string;
    designer_client_id: string;
    rating: number | null;
    review_text: string | null;
    request_status: ClientPendingReview['request_status'];
    custom_message: string | null;
    request_sent_at: string | null;
    created_at: string;
    project: { id: string; name: string | null } | null;
  }) => ({
    id: row.id,
    rating: row.rating,
    review_text: row.review_text,
    request_status: row.request_status,
    custom_message: row.custom_message,
    request_sent_at: row.request_sent_at,
    created_at: row.created_at,
    project: row.project,
    designer: dcMap.get(row.designer_client_id) ?? null,
  }));
}

/** Pending review requests directed at the current user. */
export function useMyPendingReviewRequests(clientUserId: string | undefined) {
  return useQuery({
    queryKey: ['my-pending-review-requests', clientUserId],
    queryFn: () => fetchClientReviews(clientUserId!, ['sent', 'queued']),
    enabled: !!clientUserId,
  });
}

/** Reviews the current user has already submitted. */
export function useMySubmittedReviews(clientUserId: string | undefined) {
  return useQuery({
    queryKey: ['my-submitted-reviews', clientUserId],
    queryFn: () => fetchClientReviews(clientUserId!, ['collected']),
    enabled: !!clientUserId,
  });
}
