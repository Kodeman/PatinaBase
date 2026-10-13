// Supabase Edge Function: review-requests
//
// Runs daily at 09:30 UTC (scheduled by pg_cron in migration 00096).
// Finds projects that moved to status='completed' 3+ days ago, have no
// existing sent/queued/collected client_reviews row for that project, and whose
// client's profile is not email-suppressed.
// For each candidate the client_reviews row is written FIRST as 'queued' with
// the id the letter names, then promoted to 'sent' when the send lands, or
// deleted when the send does not — so the row never outlives a letter that was
// never delivered, and tomorrow's run retries a failure.
//
// PRD #13: review request auto-trigger. SMS (#33) intentionally deferred.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  resolveStudioIdentity,
  studioCobrand,
  studioDisplayName,
  studioSignatureCity,
} from '../_shared/studio-identity.ts';
import { clientProjectLink } from '../_shared/client-portal-links.ts';
import {
  BLOCKING_REQUEST_STATUSES,
  isSuppressedRecipient,
  projectsWithRequestOut,
  type ReviewRequestRow,
} from './logic.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_ADDRESS = Deno.env.get('RESEND_FROM') ?? 'hello@patina.cloud';
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';

interface Project {
  id: string;
  name: string;
  completed_at: string;
  client_id: string | null;
  designer_id: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
  /** Read for the client only: a suppressed address is not asked again. */
  email_suppressed: boolean | null;
}

interface DesignerClient {
  id: string;
  designer_id: string;
  client_id: string | null;
  client_email: string | null;
  client_name: string | null;
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Find projects completed 3+ days ago
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('id, name, completed_at, client_id, designer_id')
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .lte('completed_at', cutoff);

  if (projError) {
    console.error('review-requests: project query failed', projError);
    return new Response(JSON.stringify({ error: projError.message }), { status: 500 });
  }

  const candidates = (projects ?? []) as Project[];
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ scanned: 0, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const projectIds = candidates.map((p) => p.id);

  // 2. Find projects that already have a review out or answered
  const { data: existingReviews, error: revError } = await supabase
    .from('client_reviews')
    .select('project_id, request_status')
    .in('project_id', projectIds)
    .in('request_status', [...BLOCKING_REQUEST_STATUSES]);

  if (revError) {
    console.error('review-requests: existing reviews query failed', revError);
    return new Response(JSON.stringify({ error: revError.message }), { status: 500 });
  }

  const reviewedIds = projectsWithRequestOut(
    (existingReviews ?? []) as ReviewRequestRow[],
  );
  const unreviewed = candidates.filter((p) => !reviewedIds.has(p.id));

  if (unreviewed.length === 0) {
    return new Response(JSON.stringify({ scanned: candidates.length, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Collect all client and designer profile IDs we need
  const clientIds = [...new Set(unreviewed.map((p) => p.client_id).filter(Boolean))] as string[];
  const designerIds = [...new Set(unreviewed.map((p) => p.designer_id).filter(Boolean))] as string[];
  const allProfileIds = [...new Set([...clientIds, ...designerIds])];

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email, city, email_suppressed')
    .in('id', allProfileIds.length > 0 ? allProfileIds : ['00000000-0000-0000-0000-000000000000']);

  if (profilesError) {
    console.error('review-requests: profiles query failed', profilesError);
    return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 });
  }

  const profileMap = new Map<string, Profile>(
    ((profilesData ?? []) as Profile[]).map((p) => [p.id, p])
  );

  // 4. For each candidate, find the designer_client row (for insert)
  //    designer_clients matches on (designer_id, client_id)
  const designerClientPairs = unreviewed
    .filter((p) => p.designer_id && p.client_id)
    .map((p) => ({ designer_id: p.designer_id!, client_id: p.client_id! }));

  // Fetch relevant designer_client rows
  const { data: dcData, error: dcError } = await supabase
    .from('designer_clients')
    .select('id, designer_id, client_id, client_email, client_name')
    .in('designer_id', designerClientPairs.map((x) => x.designer_id));

  if (dcError) {
    console.error('review-requests: designer_clients query failed', dcError);
    return new Response(JSON.stringify({ error: dcError.message }), { status: 500 });
  }

  // Build a lookup: `${designer_id}:${client_id}` -> designer_client
  const dcLookup = new Map<string, DesignerClient>();
  for (const dc of (dcData ?? []) as DesignerClient[]) {
    if (dc.client_id) {
      dcLookup.set(`${dc.designer_id}:${dc.client_id}`, dc);
    }
  }

  // 5. Process each candidate
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const project of unreviewed) {
    const clientProfile = project.client_id ? profileMap.get(project.client_id) : undefined;
    const designerProfile = project.designer_id ? profileMap.get(project.designer_id) : undefined;

    const dc = project.designer_id && project.client_id
      ? dcLookup.get(`${project.designer_id}:${project.client_id}`)
      : undefined;

    if (!dc) {
      console.warn('review-requests: no designer_client row for project', project.id,
        'designer:', project.designer_id, 'client:', project.client_id);
      continue;
    }

    const clientEmail = clientProfile?.email ?? dc.client_email;
    if (!clientEmail) {
      console.warn('review-requests: no client email for project', project.id);
      continue;
    }

    // The send would be refused anyway; skipping here keeps the cron from
    // minting and deleting a queued row for this project every single day.
    if (isSuppressedRecipient(clientProfile)) {
      skipped++;
      continue;
    }

    const clientName = clientProfile?.full_name ?? dc.client_name;
    const designerName = designerProfile?.full_name ?? null;

    // Studio co-brand (Designer Studios): the completed project resolves the
    // studio brand for the review-request shell + sender display.
    const identity = await resolveStudioIdentity(supabase, {
      projectId: project.id,
      designerId: project.designer_id,
    });
    const senderName = studioDisplayName(identity, designerName ?? 'Patina');
    const cobrand = studioCobrand(identity);

    const reviewId = crypto.randomUUID();
    const subject = `Share your experience with ${senderName}`;
    const body = `Hi ${clientName ?? 'there'},\n\nYour ${project.name} project is complete and we'd love to hear what you thought. Sharing a few words helps ${senderName} understand what worked and helps future clients make informed decisions.\n\nShare your experience: ${clientProjectLink(CLIENT_PORTAL_URL, project.id, 'doorstep')}`;
    const { data: draftId, error: draftError } = await supabase.rpc('compose_outbound_draft', {
      p_kind: 'review_request', p_org: identity!.studioId!, p_project: project.id,
      p_channel: 'email', p_recipient_kind: 'client',
      p_to: { client_id: project.client_id, address: clientEmail },
      p_subject: subject, p_body: body,
      p_payload: { review_id: reviewId, designer_client_id: dc.id },
      p_ref_type: 'project', p_ref_id: project.id,
      p_dedupe_key: `review:${project.id}:${project.client_id}`,
      p_due_at: null, p_expires_at: null, p_composed_by: 'system',
    });
    if (draftError || !draftId) {
      console.error('review-requests: failed to compose draft for project', project.id, draftError);
      failed++;
      continue;
    }
    const { data: mode } = await supabase.rpc('studio_outbound_mode', {
      p_studio: identity!.studioId!, p_kind: 'review_request',
    });
    const { data: rolloutActive } = await supabase.rpc('outbound_review_active', {
      p_studio: identity!.studioId!,
    });
    const scheduled = mode === 'scheduled' || rolloutActive !== true;
    const result = scheduled
      ? await (await import('../_shared/outbound-send.ts')).sendOutboundDraft(supabase, draftId, {
        kind: 'studio_schedule', studioId: identity!.studioId!, outboundKind: 'review_request',
      })
      : { ok: true };

    if (result.ok) {
      if (scheduled) sent++;
    } else {
      console.error('review-requests: scheduled send failed for project', project.id, 'error' in result ? result.error : undefined);
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ scanned: unreviewed.length, sent, skipped, failed }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
