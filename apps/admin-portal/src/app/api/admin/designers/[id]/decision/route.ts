import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  notFound,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// POST /api/admin/designers/[id]/decision - Approve/reject designer by user ID
// This route is used by the verification page which references users by userId, not application ID
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id: userId } = await context.params;

  let body: { status?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!body.status || !['approved', 'rejected'].includes(body.status)) {
    return badRequest('status must be "approved" or "rejected"');
  }

  try {
    // Find the pending application for this user
    const { data: app, error: appError } = await adminClient
      .from('designer_applications')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'under_review'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (appError || !app) return notFound('No pending application found for this user');

    // Update application
    const { error: updateError } = await adminClient
      .from('designer_applications')
      .update({
        status: body.status as any,
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
        review_notes: body.notes ?? null,
      })
      .eq('id', app.id);

    if (updateError) return serverError(updateError.message);

    // On approval, grant designer role
    if (body.status === 'approved') {
      const { error: roleError } = await adminClient.rpc('grant_role_to_user', {
        p_user_id: userId,
        p_role_name: 'independent_designer',
        p_granted_by: adminUser.id,
      });

      if (roleError) {
        console.error('Failed to grant designer role:', roleError);
      }
    }

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: `designer_application.${body.status}`,
      resourceType: 'designer_application',
      resourceId: app.id,
      newValues: { applicantId: userId, notes: body.notes },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      data: { success: true, status: body.status },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to process decision');
  }
}
