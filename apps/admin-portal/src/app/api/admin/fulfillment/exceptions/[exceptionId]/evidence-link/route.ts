import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// S7 evidence link (spec §5.5, §9.2) — mints an opaque, ~72h token via
// fulfillment_mint_evidence_token and returns the copyable client-portal URL the
// operator hands the client. The client uploads through the token-gated
// fulfillment-evidence flow, NOT the admin RPC surface.

function clientPortalOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL ??
    process.env.CLIENT_PORTAL_URL ??
    'http://localhost:3002'
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ exceptionId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { exceptionId } = await params;

  try {
    const { data, error } = await db.rpc('fulfillment_mint_evidence_token', {
      p_exception_id: exceptionId,
      p_ttl_hours: 72,
      p_actor: actor,
    });
    if (error) throw error;
    const out = (data ?? {}) as { token?: string; expires_at?: string };
    if (!out.token) throw new Error('token not minted');
    return NextResponse.json({
      data: {
        token: out.token,
        url: `${clientPortalOrigin()}/evidence/${out.token}`,
        expiresAt: out.expires_at ?? null,
      },
    });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to mint evidence link');
  }
}
