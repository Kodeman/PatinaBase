import { NextRequest, NextResponse } from 'next/server';
import {
  badRequest,
  createAuditLog,
  getAuthenticatedAdmin,
  getClientIp,
  notFound,
  serverError,
} from '@/lib/supabase-admin';

export interface UserMfaFactor {
  id: string;
  type: string;
  status: string;
  friendlyName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserMfaResponse {
  enforced: boolean;
  factors: UserMfaFactor[];
  hasVerifiedFactor: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const { id } = await params;

  try {
    const [profileRes, factorsRes] = await Promise.all([
      adminClient
        .from('profiles')
        .select('id, mfa_enforced')
        .eq('id', id)
        .maybeSingle(),
      // The admin auth API ships listFactors per user.
      (
        adminClient.auth.admin as unknown as {
          mfa: {
            listFactors: (args: {
              userId: string;
            }) => Promise<{
              data: { factors: Array<Record<string, unknown>> } | null;
              error: { message: string } | null;
            }>;
          };
        }
      ).mfa.listFactors({ userId: id }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if (!profileRes.data) return notFound(`User ${id} not found`);

    if (factorsRes.error) {
      // Treat factors-read error as empty list rather than 500 — common in
      // local dev where the admin API returns "user not found" for fresh seeds.
      const payload: UserMfaResponse = {
        enforced: Boolean(
          (profileRes.data as { mfa_enforced?: boolean }).mfa_enforced,
        ),
        factors: [],
        hasVerifiedFactor: false,
      };
      return NextResponse.json({ data: payload });
    }

    const rawFactors = factorsRes.data?.factors ?? [];
    const factors: UserMfaFactor[] = rawFactors.map((f) => ({
      id: String(f.id ?? ''),
      type: String(f.factor_type ?? f.type ?? 'unknown'),
      status: String(f.status ?? 'unknown'),
      friendlyName: (f.friendly_name as string | null) ?? null,
      createdAt: String(f.created_at ?? ''),
      updatedAt: String(f.updated_at ?? ''),
    }));

    const payload: UserMfaResponse = {
      enforced: Boolean((profileRes.data as { mfa_enforced?: boolean }).mfa_enforced),
      factors,
      hasVerifiedFactor: factors.some((f) => f.status === 'verified'),
    };

    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load MFA state');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient, user: callingUser } = auth;

  const { id } = await params;

  let body: { enforced?: boolean };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (typeof body.enforced !== 'boolean') {
    return badRequest('Field "enforced" (boolean) is required');
  }

  try {
    const { data: before, error: beforeErr } = await adminClient
      .from('profiles')
      .select('id, mfa_enforced')
      .eq('id', id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) return notFound(`User ${id} not found`);

    // Cast: profiles.mfa_enforced is added by mig 00112 but not yet in
    // generated database.types.ts. Run `pnpm db:generate` after applying.
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({ mfa_enforced: body.enforced } as unknown as never)
      .eq('id', id);
    if (updateErr) throw updateErr;

    await createAuditLog(adminClient, {
      userId: callingUser.id,
      action: body.enforced ? 'user.mfa.enforce' : 'user.mfa.unenforce',
      resourceType: 'user',
      resourceId: id,
      oldValues: { mfa_enforced: (before as { mfa_enforced?: boolean }).mfa_enforced ?? false },
      newValues: { mfa_enforced: body.enforced },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { enforced: body.enforced } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update MFA enforcement');
  }
}
