import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  notFound,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// POST /api/admin/designer-applications/[id]/decision - Approve or reject
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

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
    // Get the application
    const { data: app, error: appError } = await adminClient
      .from('designer_applications')
      .select('user_id, status')
      .eq('id', id)
      .single();

    if (appError || !app) return notFound('Application not found');

    if (app.status !== 'pending' && app.status !== 'under_review') {
      return badRequest(`Cannot change status of ${app.status} application`);
    }

    // Update application status
    const { error: updateError } = await adminClient
      .from('designer_applications')
      .update({
        status: body.status as any,
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
        review_notes: body.notes ?? null,
      })
      .eq('id', id);

    if (updateError) return serverError(updateError.message);

    // On approval, grant designer role
    if (body.status === 'approved') {
      // Use the grant_role_to_user SQL function
      const { error: roleError } = await adminClient.rpc('grant_role_to_user', {
        p_user_id: app.user_id,
        p_role_name: 'independent_designer',
        p_granted_by: adminUser.id,
      });

      if (roleError) {
        console.error('Failed to grant designer role:', roleError);
        // Don't fail the whole operation — the application is approved,
        // role can be manually assigned
      }
    }

    // Audit log
    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: `designer_application.${body.status}`,
      resourceType: 'designer_application',
      resourceId: id,
      newValues: { applicantId: app.user_id, notes: body.notes },
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
