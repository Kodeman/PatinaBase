import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { getAuthenticatedAdmin, createAuditLog, badRequest, serverError, getClientIp } from '@/lib/supabase-admin';

// POST /api/admin/studios/[id]/invites — invoke workspace-member-invite with
// this admin's own session client (edge fn resolves the caller from the
// forwarded JWT; a service-role bearer can't satisfy that), same wiring as
// api/admin/designers/invite/route.ts.

// supabase-js raises FunctionsHttpError with a CONSTANT message ("Edge Function
// returned a non-2xx status code") — the edge fn's own {error} code is only on
// error.context, the raw Response. Matching on error.message therefore never
// saw organization_not_active/forbidden.
const EDGE_ERROR_STATUS: Record<string, number> = {
  forbidden: 403,
  organization_not_found: 404,
  organization_not_active: 409,
  already_member: 409,
};

const EDGE_ERROR_MESSAGE: Record<string, string> = {
  forbidden: 'You are not allowed to invite members to this studio',
  organization_not_found: 'Studio not found',
  organization_not_active: 'This studio is not active, so invites are blocked',
  already_member: 'That person is already a member of this studio',
};

async function readEdgeErrorCode(error: unknown): Promise<string | undefined> {
  const ctx = (error as { context?: Response }).context;
  const body =
    ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
  const code = (body as { error?: unknown } | null)?.error;
  return typeof code === 'string' ? code : undefined;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: {
    email?: string;
    role?: string;
    name?: string;
    jobTitle?: string;
    staffRole?: string;
    resend?: boolean;
    teammateType?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) return badRequest('email is required');
  const role = body.role?.trim();
  if (!role) return badRequest('role is required');

  try {
    const sessionClient = await createServerClient();
    let data: unknown = null;
    let error: unknown = null;
    try {
      ({ data, error } = await sessionClient.functions.invoke('workspace-member-invite', {
        body: {
          organization_id: id,
          email,
          member_role: role,
          teammate_type: body.teammateType?.trim() || 'member',
          name: body.name?.trim() || undefined,
          job_title: body.jobTitle?.trim() || undefined,
          staff_role: body.staffRole?.trim() || undefined,
        },
      }));
    } catch (thrown) {
      // supabase-js normally reports FunctionsHttpError via the returned
      // `error`, but a transport-layer failure throws — both carry `context`.
      error = thrown;
    }

    if (error) {
      const code = await readEdgeErrorCode(error);
      if (code && EDGE_ERROR_STATUS[code]) {
        return NextResponse.json(
          { error: code, message: EDGE_ERROR_MESSAGE[code] },
          { status: EDGE_ERROR_STATUS[code] },
        );
      }
      console.error('[studios] workspace-member-invite failed:', code ?? error);
      return serverError('Failed to send the studio invite');
    }

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: body.resend ? 'studio.invite.resend' : 'studio.invite.send',
      resourceType: 'organization',
      resourceId: id,
      organizationId: id,
      newValues: { email, role },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to invite studio member');
  }
}
