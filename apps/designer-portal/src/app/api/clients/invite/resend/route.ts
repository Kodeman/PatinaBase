import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedDesignerAdmin, badRequest, serverError } from '@/lib/supabase-admin';

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

/**
 * POST /api/clients/invite/resend — R10. New token, the SAME frozen letter, one
 * in flight, one per hour. The cooldown is enforced by the edge function; the
 * one-at-a-time guard is the UI's (mirroring the studio-member resend at
 * account-studio-page.tsx:490-520).
 *
 * Ownership is checked HERE: the edge function trusts the service role, so this
 * route must prove the caller owns the invitation before it forwards.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedDesignerAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: callerUser, adminClient } = auth;

  let body: { invitationId?: string };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return badRequest('Invalid JSON body');
  }
  const invitationId = body.invitationId?.trim();
  if (!invitationId) return badRequest('invitationId is required');

  const { data: owned, error: lookupError } = await (adminClient as any)
    .from('client_invitations')
    .select('id')
    .eq('id', invitationId)
    .eq('designer_id', callerUser.id)
    .maybeSingle();
  if (lookupError) return serverError(`Failed to load the letter: ${lookupError.message}`);
  if (!owned) return badRequest('Letter not found');

  const res = await fetch(`${FUNCTIONS_BASE.replace(/\/$/, '')}/client-invite/resend`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invitationId, writerId: callerUser.id }),
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
