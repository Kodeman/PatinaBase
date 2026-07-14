// Supabase Edge Function: review-requests
//
// Runs daily at 09:30 UTC (scheduled by pg_cron in migration 00096).
// Finds projects that moved to status='completed' 3+ days ago and have no
// existing sent/queued/collected client_reviews row for that project.
// For each candidate, sends a review-request email via Resend and inserts
// a client_reviews row with request_status='sent'.
//
// PRD #13: review request auto-trigger. SMS (#33) intentionally deferred.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  renderBrandedShell,
  paragraph,
  muted,
  ctaButton,
  spacer,
  escapeHtml,
} from '../_shared/branded-email.ts';
import {
  resolveStudioIdentity,
  studioCobrand,
  studioDisplayName,
} from '../_shared/studio-identity.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
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
}

interface DesignerClient {
  id: string;
  designer_id: string;
  client_id: string | null;
  client_email: string | null;
  client_name: string | null;
}

async function sendReviewEmail(opts: {
  projectId: string;
  projectName: string;
  designerClientId: string;
  clientEmail: string;
  clientName: string | null;
  /** Display name for the subject/prose — studio, designer, or 'Patina'. */
  senderName: string;
  /** Studio co-brand byline (Designer Studios). */
  studioName?: string;
  studioLogoUrl?: string;
}): Promise<boolean> {
  const senderDisplay = opts.senderName;
  const greeting = opts.clientName ? `Hi ${escapeHtml(opts.clientName)},` : 'Hi there,';
  const reviewUrl = `${CLIENT_PORTAL_URL}/review/${opts.projectId}`;
  const subject = `Share your experience with ${senderDisplay}`;

  const html = renderBrandedShell({
    title: subject,
    preview: `Your ${opts.projectName} project is complete — we'd love to hear what you thought.`,
    eyebrow: 'Review request',
    studioName: opts.studioName,
    studioLogoUrl: opts.studioLogoUrl,
    body: [
      paragraph(greeting),
      paragraph(`Your <strong style="color:#1F1B16; font-weight:600;">${escapeHtml(opts.projectName)}</strong> project is complete and we&apos;d love to hear what you thought.`),
      paragraph(`Sharing a few words helps ${escapeHtml(senderDisplay)} understand what worked and helps future clients make informed decisions.`),
      paragraph('It only takes a minute &mdash; click below to leave your feedback.'),
      spacer(6),
      ctaButton(reviewUrl, 'Share Your Experience', 'ink'),
      spacer(10),
      muted(`Can&apos;t click the button? Copy this link into your browser:<br><a href="${reviewUrl}" style="color:#4E7A66; text-decoration:underline; word-break:break-all;">${reviewUrl}</a>`),
      paragraph('&mdash; Patina'),
    ].join(''),
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: opts.clientEmail,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('review-requests: Resend failed for project', opts.projectId, res.status, text);
    return false;
  }
  return true;
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

  // 2. Find projects that already have a sent/queued/collected review
  const { data: existingReviews, error: revError } = await supabase
    .from('client_reviews')
    .select('project_id')
    .in('project_id', projectIds)
    .in('request_status', ['sent', 'queued', 'collected']);

  if (revError) {
    console.error('review-requests: existing reviews query failed', revError);
    return new Response(JSON.stringify({ error: revError.message }), { status: 500 });
  }

  const reviewedIds = new Set(
    ((existingReviews ?? []) as { project_id: string }[]).map((r) => r.project_id)
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
    .select('id, full_name, email')
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

    const ok = await sendReviewEmail({
      projectId: project.id,
      projectName: project.name,
      designerClientId: dc.id,
      clientEmail,
      clientName,
      senderName,
      studioName: cobrand.studioName,
      studioLogoUrl: cobrand.studioLogoUrl,
    });

    if (ok) {
      const { error: insertErr } = await supabase
        .from('client_reviews')
        .insert({
          designer_client_id: dc.id,
          project_id: project.id,
          request_status: 'sent',
          request_sent_at: new Date().toISOString(),
        });

      if (insertErr) {
        console.error('review-requests: failed to insert review row for project', project.id, insertErr);
      } else {
        sent++;
      }
    }
  }

  return new Response(
    JSON.stringify({ scanned: unreviewed.length, sent }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
